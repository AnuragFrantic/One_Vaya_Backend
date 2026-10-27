import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { Experience } from "../../models";
import { aiEnabled, getClaude, models } from "./client";
import { PLANNER_SYSTEM } from "./prompts";
import { autoPlan, validatePlan, type PlanItem, type RuleExperience } from "../itinerary/validation";
import { loadRuleCatalog } from "../itinerary/catalog";
import { logger } from "../../utils/logger";


export type PlanRequest = {
  brief: string;
  startDate: string; // YYYY-MM-DD
  days: number;
  group?: string;
  budget?: string;
  interests?: string[];
};

export type PlanResult = {
  startDate: string;
  days: number;
  items: PlanItem[];
  unplaced: string[];
  dayTitles: string[];
  summary: string;
  errorCount: number;
  mode: "ai" | "demo";
};

const KEYWORDS: [RegExp, string][] = [
  [/burj khalifa|at the top|tallest|sunset|view/, "burj-khalifa-at-the-top"],
  [/desert|safari|dune/, "evening-desert-safari"],
  [/cruise|dhow|marina/, "marina-dinner-cruise"],
  [/museum/, "museum-of-the-future"],
  [/burj al arab|sail/, "burj-al-arab-inside-tour"],
  [/abu dhabi|mosque/, "abu-dhabi-city-tour"],
  [/frame/, "dubai-frame"],
  [/scuba|dive|diving|snorkel/, "discover-scuba-dive"],
  [/camel|beach/, "jumeirah-camel-ride"],
];

const dayTitle = (items: PlanItem[], day: number, days: number, catalog: Map<string, RuleExperience>) => {
  if (days > 2 && day === 0) return "Arrival & settle in";
  if (days > 1 && day === days - 1) return "Leisure & departure";
  const areas = [...new Set(items.filter((i) => i.day === day).map((i) => catalog.get(i.experience)?.area).filter(Boolean))];
  return areas.length ? areas.join(" & ") : "Free day at leisure";
};

/** Rule-based plan (demo mode, and safety net if the AI can't produce a valid plan). */
async function demoPlan(req: PlanRequest, catalog: Map<string, RuleExperience>): Promise<PlanResult> {
  const t = req.brief.toLowerCase();
  let wanted = KEYWORDS.filter(([re]) => re.test(t)).map(([, id]) => id);
  if (req.interests?.length) {
    // Interests are experience category names (admin-managed list).
    const byCat = await Experience.find({ isPublished: true, category: { $in: req.interests } }).select("slug").lean();
    wanted.push(...byCat.map((e) => e.slug));
  }
  if (!wanted.length) wanted = ["burj-khalifa-at-the-top", "evening-desert-safari", "marina-dinner-cruise", "museum-of-the-future"];
  wanted = [...new Set(wanted)];
  const { items, unplaced } = autoPlan(wanted, req.days, req.startDate, catalog, req.group === "Family" ? 2 : 3);
  const { errorCount } = validatePlan(items, req.startDate, catalog);
  return {
    startDate: req.startDate,
    days: req.days,
    items,
    unplaced,
    dayTitles: Array.from({ length: req.days }, (_, d) => dayTitle(items, d, req.days, catalog)),
    summary: `${req.days} days in Dubai${req.group ? ` · ${req.group}` : ""}`,
    errorCount,
    mode: "demo",
  };
}

const SubmitInput = z.object({
  summary: z.string(),
  dayTitles: z.array(z.string()),
  items: z.array(z.object({ experience: z.string(), day: z.number().int().min(0), time: z.string().regex(/^\d{2}:\d{2}$/) })),
});

const SUBMIT_TOOL: Anthropic.Beta.BetaTool = {
  name: "submit_itinerary",
  description: "Submit the complete itinerary. Days are 0-based (0 = arrival day). The server validates it and returns any problems to fix.",
  strict: true,
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["summary", "dayTitles", "items"],
    properties: {
      summary: { type: "string", description: "One short line, e.g. '5 days in Dubai · Family'" },
      dayTitles: { type: "array", items: { type: "string" }, description: "One short title per day" },
      items: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["experience", "day", "time"],
          properties: {
            experience: { type: "string", description: "Experience slug from the catalogue" },
            day: { type: "integer" },
            time: { type: "string", description: "Start time HH:MM, one of the experience's slots" },
          },
        },
      },
    },
  },
};

/**
 * AI itinerary suggestion.
 * Live mode: Claude (AI_PLANNER_MODEL) proposes a plan via submit_itinerary; the server validates it
 * with the same rules as the Trip Builder and sends problems back until the plan is valid.
 * Demo mode / any failure: the rule-based planner, so the guest always gets a valid plan.
 */
export async function suggestItinerary(req: PlanRequest): Promise<PlanResult> {
  const catalog = await loadRuleCatalog();
  if (!aiEnabled()) return demoPlan(req, catalog);

  try {
    const client = getClaude();
    const publicCatalog = [...catalog.values()].map(({ slug, name, area, durationMin, slots, openDays, priceAED }) => ({ slug, name, area, durationMin, slots, openDays, priceAED }));
    const system: Anthropic.Beta.BetaTextBlockParam[] = [
      { type: "text", text: `${PLANNER_SYSTEM}\n\n<approved_catalogue>\n${JSON.stringify(publicCatalog)}\n</approved_catalogue>`, cache_control: { type: "ephemeral" } },
    ];
    const weekday = new Date(req.startDate + "T00:00:00").toLocaleDateString("en-GB", { weekday: "long" });
    const messages: Anthropic.Beta.BetaMessageParam[] = [
      {
        role: "user",
        content: `Guest brief: ${req.brief}\nArrival: ${req.startDate} (${weekday}, this is day 0)\nNumber of days: ${req.days}\nTravelling as: ${req.group ?? "not given"}\nBudget: ${req.budget ?? "not given"}\nInterests: ${req.interests?.join(", ") || "not given"}`,
      },
    ];

    for (let round = 0; round < 4; round++) {
      const response = await client.beta.messages.create({
        model: models.planner,
        max_tokens: 16000,
        system,
        tools: [SUBMIT_TOOL],
        messages,
        output_config: { effort: "medium" },
        // If a safety classifier declines, retry on Anthropic's recommended fallback model server-side.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
      });

      if (response.stop_reason === "refusal") break;
      const call = response.content.find((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use" && b.name === "submit_itinerary");
      if (!call) break; // model answered in text instead of submitting

      messages.push({ role: "assistant", content: response.content });
      const parsed = SubmitInput.safeParse(call.input);
      if (!parsed.success) {
        messages.push({ role: "user", content: [{ type: "tool_result", tool_use_id: call.id, is_error: true, content: "Input did not match the schema. Submit again." }] });
        continue;
      }

      const items: PlanItem[] = parsed.data.items
        .filter((i) => i.day < req.days)
        .map((i, n) => ({ uid: `a${n + 1}`, experience: i.experience, day: i.day, time: i.time }));
      const { issues, errorCount } = validatePlan(items, req.startDate, catalog);
      if (errorCount === 0) {
        return {
          startDate: req.startDate,
          days: req.days,
          items,
          unplaced: [],
          dayTitles: Array.from({ length: req.days }, (_, d) => parsed.data.dayTitles[d] ?? dayTitle(items, d, req.days, catalog)),
          summary: parsed.data.summary,
          errorCount: 0,
          mode: "ai",
        };
      }
      const problems = items
        .flatMap((i) => (issues[i.uid] ?? []).filter((x) => x.level === "error").map((x) => `Day ${i.day} ${i.time} ${i.experience}: ${x.message}${x.suggestions ? ` Valid times: ${x.suggestions.join(", ")}` : ""}`))
        .join("\n");
      messages.push({ role: "user", content: [{ type: "tool_result", tool_use_id: call.id, is_error: true, content: `Fix these problems and submit again:\n${problems}` }] });
    }
  } catch (err) {
    logger.error("AI planner failed, using rule-based plan:", err instanceof Error ? err.message : err);
  }
  return demoPlan(req, catalog);
}
