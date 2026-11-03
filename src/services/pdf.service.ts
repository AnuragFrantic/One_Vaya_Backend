import path from "node:path";
import PDFDocument from "pdfkit";

/** Client-approved logo, used exactly as supplied (works from src/ and dist/). */
const LOGO_WHITE = path.join(__dirname, "../../assets/brand/onevayawhite.png");
/** The website's typefaces (assets/fonts/README.md). */
const FONT_DIR = path.join(__dirname, "../../assets/fonts");
const FONTS = {
  serif: "CormorantGaramond-SemiBold.woff",
  serifMedium: "CormorantGaramond-Medium.woff",
  sans: "Manrope-Regular.woff",
  sansMedium: "Manrope-Medium.woff",
  sansSemi: "Manrope-SemiBold.woff",
  sansBold: "Manrope-Bold.woff",
} as const;

const NAVY = "#101C2C";
const NAVY_SOFT = "#1C2B40";
const CHAMP = "#A48F60";
const CHAMP_LIGHT = "#D9CBA8";
const IVORY = "#F7F3EA";
const IVORY_LINE = "#E6DCC8";
const INK = "#1E2733";
const MUTED = "#6B7482";

const COMPANY = {
  name: "OneVaya Travel & Tourism",
  address: "Business Centre, 3 Floor, Building A3, Business Park, Dubai South",
  phone: "+971 54 136 0422",
  email: "info@onevaya.ae",
  web: "onevaya.ae",
};

const PAGE = { margin: 48, footer: 46 };

type QuotePdf = {
  ref: string;
  title: string;
  customerName?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  travellers?: string | null;
  itinerary: { date?: string | null; title?: string | null; items: { time?: string | null; text?: string | null }[] }[];
  items: { description: string; qty?: number | null; unitPrice?: number | null }[];
  notes?: string | null;
  validUntil?: Date | null;
  currency?: string | null;
};

/** "2026-12-12" → Date at noon UTC (no time-zone day shifts). */
const parseDay = (s?: string | null) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T12:00:00Z`) : null);
const fmt = (d: Date, o: Intl.DateTimeFormatOptions) => d.toLocaleDateString("en-GB", { timeZone: "UTC", ...o });

/** "12 – 16 Dec 2026", "28 Dec 2026 – 3 Jan 2027" or the raw text if the dates aren't ISO days. */
function dateRange(start?: string | null, end?: string | null) {
  const a = parseDay(start), b = parseDay(end);
  if (!a) return start ?? "";
  if (!b) return fmt(a, { day: "numeric", month: "short", year: "numeric" });
  if (a.getUTCFullYear() !== b.getUTCFullYear()) return `${fmt(a, { day: "numeric", month: "short", year: "numeric" })} – ${fmt(b, { day: "numeric", month: "short", year: "numeric" })}`;
  if (a.getUTCMonth() !== b.getUTCMonth()) return `${fmt(a, { day: "numeric", month: "short" })} – ${fmt(b, { day: "numeric", month: "short", year: "numeric" })}`;
  return `${a.getUTCDate()} – ${fmt(b, { day: "numeric", month: "short", year: "numeric" })}`;
}

/** "5 days · 4 nights" from the trip dates. */
function duration(start?: string | null, end?: string | null) {
  const a = parseDay(start), b = parseDay(end);
  if (!a || !b || b < a) return "";
  const nights = Math.round((b.getTime() - a.getTime()) / 86_400_000);
  return `${nights + 1} ${nights ? "days" : "day"} · ${nights} ${nights === 1 ? "night" : "nights"}`;
}

/** Branded quotation PDF (navy / ivory / champagne, the website's fonts). Returns the file as a Buffer. */
export function renderQuotePdf(q: QuotePdf): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: PAGE.margin, bottom: PAGE.footer + 24, left: PAGE.margin, right: PAGE.margin },
      bufferPages: true, // footers with "Page x of y" are added at the end
      info: { Title: `${q.title} · Quotation ${q.ref}`, Author: COMPANY.name },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    for (const [name, file] of Object.entries(FONTS)) doc.registerFont(name, path.join(FONT_DIR, file));

    const W = doc.page.width;
    const L = PAGE.margin;
    const R = W - PAGE.margin;
    const CW = R - L;
    const bottom = () => doc.page.height - PAGE.footer - 24;
    const currency = q.currency || "AED";
    const money = (n: number) => {
      const cents = Number.isInteger(n) ? 0 : 2; // "AED 1,250" or "AED 155.50"
      return `${currency} ${n.toLocaleString("en-US", { minimumFractionDigits: cents, maximumFractionDigits: cents })}`;
    };
    const shortTitle = q.title.length > 60 ? `${q.title.slice(0, 57).trimEnd()}…` : q.title;
    let y = 0;

    /** Small caps label in champagne with a hairline after it. */
    const eyebrow = (label: string, at: number) => {
      doc.font("sansBold").fontSize(7.5).fillColor(CHAMP).text(label.toUpperCase(), L, at, { characterSpacing: 2.2, lineBreak: false });
      const w = doc.widthOfString(label.toUpperCase(), { characterSpacing: 2.2 });
      doc.moveTo(L + w + 10, at + 4).lineTo(R, at + 4).lineWidth(0.6).strokeColor(IVORY_LINE).stroke();
    };

    /** Slim header on pages after the first. */
    const continuationHeader = () => {
      doc.rect(0, 0, W, 34).fill(NAVY);
      doc.rect(0, 34, W, 1.5).fill(CHAMP);
      doc.font("serif").fontSize(12).fillColor("#F5F0E7").text("OneVaya", L, 10, { lineBreak: false });
      doc.font("sans").fontSize(8).fillColor(CHAMP_LIGHT).text(`${shortTitle}  ·  Quotation ${q.ref}`, L, 13, { width: CW, align: "right", lineBreak: false });
      y = 60;
    };

    /** Start a new page when the next block (height h) wouldn't fit. */
    const ensure = (h: number) => {
      if (y + h <= bottom()) return;
      doc.addPage();
      continuationHeader();
    };

    // ── Header band ─────────────────────────────────────────────
    const BAND = 128;
    doc.rect(0, 0, W, BAND).fill(NAVY);
    doc.rect(0, BAND, W, 2).fill(CHAMP);
    doc.image(LOGO_WHITE, L - 4, 22, { height: 84 });
    doc.font("sansBold").fontSize(8).fillColor(CHAMP).text("QUOTATION", L, 38, { width: CW, align: "right", characterSpacing: 3 });
    doc.font("serif").fontSize(22).fillColor("#F5F0E7").text(q.ref, L, 52, { width: CW, align: "right", features: ["lnum"] });
    doc.font("sans").fontSize(8.5).fillColor(CHAMP_LIGHT)
      .text(`Issued ${fmt(new Date(), { day: "numeric", month: "long", year: "numeric" })}`, L, 82, { width: CW, align: "right" });

    // ── Title ───────────────────────────────────────────────────
    y = BAND + 34;
    doc.font("sansBold").fontSize(7.5).fillColor(CHAMP).text("YOUR JOURNEY", L, y, { characterSpacing: 2.2 });
    y += 14;
    doc.font("serif").fontSize(30).fillColor(NAVY);
    const titleH = doc.heightOfString(q.title, { width: CW });
    doc.text(q.title, L, y, { width: CW });
    y += titleH + 14;

    // ── Trip facts ──────────────────────────────────────────────
    const facts = [
      ["Prepared for", q.customerName || "—"],
      ["Travel dates", dateRange(q.startDate, q.endDate) || "To be confirmed"],
      ["Duration", duration(q.startDate, q.endDate) || "—"],
      ["Travellers", q.travellers || "—"],
    ];
    const FACTS_H = 58;
    doc.roundedRect(L, y, CW, FACTS_H, 8).fill(IVORY);
    const colW = CW / facts.length;
    facts.forEach(([label, value], i) => {
      const x = L + i * colW + 16;
      if (i) doc.moveTo(L + i * colW, y + 12).lineTo(L + i * colW, y + FACTS_H - 12).lineWidth(0.6).strokeColor(IVORY_LINE).stroke();
      doc.font("sansSemi").fontSize(7).fillColor(MUTED).text(label.toUpperCase(), x, y + 14, { width: colW - 24, characterSpacing: 1.2 });
      doc.font("sansSemi").fontSize(10).fillColor(NAVY).text(value, x, y + 28, { width: colW - 24, height: 26, ellipsis: true });
    });
    y += FACTS_H + 30;

    // ── Itinerary (timeline) ────────────────────────────────────
    if (q.itinerary?.length) {
      ensure(80);
      eyebrow("Day-by-day itinerary", y);
      y += 24;
      const BADGE = 44;
      const TEXT_X = L + BADGE + 22;
      const TEXT_W = R - TEXT_X;
      const TIME_W = 38;
      let prevBadge: { page: number; bottom: number } | null = null;

      q.itinerary.forEach((d, i) => {
        const day = parseDay(d.date);
        const rows = d.items.filter((it) => it.text || it.time);
        doc.font("sans").fontSize(9.5);
        const rowHeights = rows.map((it) => Math.max(14, doc.heightOfString(it.text ?? "", { width: TEXT_W - TIME_W }) + 4));
        doc.font("serif").fontSize(15);
        const headH = doc.heightOfString(d.title || `Day ${i + 1}`, { width: TEXT_W }) + 4;
        const dateLine = day ? fmt(day, { weekday: "long", day: "numeric", month: "long" }) : d.date ?? "";
        const blockH = Math.max(BADGE + 6, (dateLine ? 14 : 0) + headH + 6 + rowHeights.reduce((a, b) => a + b, 0)) + 16;
        ensure(Math.min(blockH, 220));

        const top = y;
        const page = doc.bufferedPageRange().count;
        // Timeline from the previous day's badge (only when both are on this page)
        if (prevBadge && prevBadge.page === page) {
          doc.moveTo(L + BADGE / 2, prevBadge.bottom + 4).lineTo(L + BADGE / 2, top - 4).lineWidth(1).dash(2, { space: 3 }).strokeColor(CHAMP_LIGHT).stroke().undash();
        }
        // Day badge
        doc.roundedRect(L, top, BADGE, BADGE, 8).fill(NAVY);
        doc.font("sansBold").fontSize(6.5).fillColor(CHAMP_LIGHT).text("DAY", L, top + 9, { width: BADGE, align: "center", characterSpacing: 1.5 });
        doc.font("serif").fontSize(19).fillColor("#F5F0E7").text(String(i + 1), L, top + 16, { width: BADGE, align: "center", features: ["lnum"] });
        prevBadge = { page, bottom: top + BADGE };

        let ty = top + 1;
        if (dateLine) {
          doc.font("sansSemi").fontSize(7.5).fillColor(CHAMP).text(dateLine.toUpperCase(), TEXT_X, ty, { characterSpacing: 1.2 });
          ty += 13;
        }
        doc.font("serif").fontSize(15).fillColor(NAVY).text(d.title || `Day ${i + 1}`, TEXT_X, ty, { width: TEXT_W });
        ty += headH + 2;
        rows.forEach((it, k) => {
          if (ty + rowHeights[k] > bottom()) {
            doc.addPage();
            continuationHeader();
            ty = y;
          }
          doc.font("sansBold").fontSize(8.5).fillColor(CHAMP).text(it.time ?? "", TEXT_X, ty + 1, { width: TIME_W, lineBreak: false });
          doc.font("sans").fontSize(9.5).fillColor(INK).text(it.text ?? "", TEXT_X + TIME_W, ty, { width: TEXT_W - TIME_W });
          ty += rowHeights[k];
        });
        y = Math.max(ty, top + BADGE + 6) + 16;
      });
      y += 8;
    }

    // ── Price table ─────────────────────────────────────────────
    const rows = q.items.map((it) => {
      const qty = it.qty ?? 1;
      const unit = it.unitPrice ?? 0;
      return { description: it.description, qty, unit, amount: qty * unit };
    });
    const total = rows.reduce((s, r) => s + r.amount, 0);
    const COLS = { desc: L + 14, qty: L + CW * 0.6, unit: L + CW * 0.68, amount: L + CW * 0.84 };
    const tableHeader = () => {
      doc.roundedRect(L, y, CW, 26, 6).fill(NAVY);
      doc.font("sansBold").fontSize(7.5).fillColor(CHAMP_LIGHT);
      doc.text("DESCRIPTION", COLS.desc, y + 9.5, { characterSpacing: 1.2, lineBreak: false });
      doc.text("QTY", COLS.qty, y + 9.5, { width: CW * 0.07, align: "center", characterSpacing: 1.2, lineBreak: false });
      doc.text("UNIT PRICE", COLS.unit, y + 9.5, { width: CW * 0.15, align: "right", characterSpacing: 1.2, lineBreak: false });
      doc.text("AMOUNT", COLS.amount, y + 9.5, { width: R - 14 - COLS.amount, align: "right", characterSpacing: 1.2, lineBreak: false });
      y += 26;
    };

    ensure(26 + 30 + 40);
    eyebrow("Your quote", y);
    y += 24;
    tableHeader();
    rows.forEach((r, i) => {
      doc.font("sans").fontSize(9.5);
      const h = Math.max(30, doc.heightOfString(r.description, { width: COLS.qty - COLS.desc - 12 }) + 16);
      if (y + h > bottom()) {
        doc.addPage();
        continuationHeader();
        tableHeader();
      }
      if (i % 2 === 1) doc.rect(L, y, CW, h).fill(IVORY);
      doc.font("sans").fontSize(9.5).fillColor(INK).text(r.description, COLS.desc, y + 8, { width: COLS.qty - COLS.desc - 12 });
      doc.font("sans").fontSize(9.5).fillColor(MUTED).text(String(r.qty), COLS.qty, y + 8, { width: CW * 0.07, align: "center" });
      doc.text(money(r.unit), COLS.unit, y + 8, { width: CW * 0.15, align: "right" });
      doc.font("sansSemi").fillColor(NAVY).text(money(r.amount), COLS.amount, y + 8, { width: R - 14 - COLS.amount, align: "right" });
      y += h;
    });
    doc.moveTo(L, y).lineTo(R, y).lineWidth(0.8).strokeColor(IVORY_LINE).stroke();

    // Total
    ensure(70);
    y += 14;
    const TOTAL_W = 230;
    doc.roundedRect(R - TOTAL_W, y, TOTAL_W, 52, 8).fill(NAVY);
    doc.font("sansBold").fontSize(7.5).fillColor(CHAMP_LIGHT).text("TOTAL", R - TOTAL_W + 18, y + 13, { characterSpacing: 2 });
    doc.font("sans").fontSize(7.5).fillColor(CHAMP_LIGHT).text(`${rows.length} ${rows.length === 1 ? "item" : "items"} · prices in ${currency}`, R - TOTAL_W + 18, y + 30, { width: 110 });
    doc.font("serif").fontSize(22).fillColor(CHAMP).text(money(total), R - TOTAL_W, y + 14, { width: TOTAL_W - 18, align: "right", features: ["lnum"] });
    y += 52 + 26;

    // ── Notes ───────────────────────────────────────────────────
    if (q.notes?.trim()) {
      doc.font("sans").fontSize(9.5);
      const nh = doc.heightOfString(q.notes.trim(), { width: CW - 40 }) + 40;
      ensure(nh);
      doc.roundedRect(L, y, CW, nh, 8).fill(IVORY);
      doc.rect(L, y, 3, nh).fill(CHAMP);
      doc.font("sansBold").fontSize(7.5).fillColor(CHAMP).text("GOOD TO KNOW", L + 20, y + 14, { characterSpacing: 2 });
      doc.font("sans").fontSize(9.5).fillColor(INK).text(q.notes.trim(), L + 20, y + 28, { width: CW - 40 });
      y += nh + 20;
    }

    // ── Terms ───────────────────────────────────────────────────
    const terms = [
      q.validUntil ? `This quotation is valid until ${fmt(q.validUntil, { day: "numeric", month: "long", year: "numeric" })}.` : "",
      "Prices are subject to availability at the time of booking. Payments are recorded by OneVaya; online payment is not available.",
    ].filter(Boolean).join(" ");
    doc.font("sans").fontSize(8);
    const termsH = doc.heightOfString(terms, { width: CW }) + 50;
    ensure(termsH);
    doc.font("sans").fontSize(8).fillColor(MUTED).text(terms, L, y, { width: CW });
    y += doc.heightOfString(terms, { width: CW }) + 18;
    doc.font("serifMedium").fontSize(13).fillColor(NAVY).text("We look forward to planning your journey.", L, y, { width: CW });
    doc.font("sans").fontSize(8.5).fillColor(MUTED).text(`Questions? Call or WhatsApp ${COMPANY.phone}, or email ${COMPANY.email}.`, L, y + 18, { width: CW });

    // ── Footer on every page ────────────────────────────────────
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      const fy = doc.page.height - PAGE.footer;
      const prevBottom = doc.page.margins.bottom;
      doc.page.margins.bottom = 0; // footer text sits below the normal page area
      doc.moveTo(L, fy).lineTo(R, fy).lineWidth(0.6).strokeColor(IVORY_LINE).stroke();
      doc.font("sansSemi").fontSize(7.5).fillColor(NAVY).text(COMPANY.name, L, fy + 10, { lineBreak: false });
      doc.font("sans").fontSize(7).fillColor(MUTED)
        .text(`${COMPANY.address}  ·  ${COMPANY.phone}  ·  ${COMPANY.email}  ·  ${COMPANY.web}`, L, fy + 22, { width: CW - 70, lineBreak: false, ellipsis: true });
      doc.font("sans").fontSize(7).fillColor(MUTED).text(`Page ${i - range.start + 1} of ${range.count}`, L, fy + 10, { width: CW, align: "right", lineBreak: false });
      doc.page.margins.bottom = prevBottom;
    }

    doc.end();
  });
}
