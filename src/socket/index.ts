import type { Server as HttpServer } from "http";
import { Server, type Socket } from "socket.io";
import { z } from "zod";
import { env, corsOrigins } from "../config/env";
import { userFromToken, type SessionUser } from "../middleware/auth";
import { ChatConversation } from "../models";
import { chatSchema } from "../validators";
import { logger } from "../utils/logger";
import { broadcastTurn, findOwnConversation, handleConciergeMessage } from "../services/chat/concierge.service";
import { emitTo, rooms, setIO } from "./realtime";

/*
 * Socket.io: live chat for the website/portal and the admin panel.
 * Connect to the API origin (e.g. http://localhost:9877) with `withCredentials: true` so the
 * session cookie is sent; or pass `auth: { token }`. Guests can connect without signing in.
 *
 * Guest / customer events                    Staff events (admin panel)
 *   chat:join     { conversationId?, visitorId } → history   chat:watch   { conversationId } → history
 *   chat:message  { conversationId?, visitorId, message, page? }  chat:staff-message { conversationId, text }
 *   chat:typing   { conversationId, typing }                 chat:release { conversationId }  (AI answers again)
 * Server → client
 *   chat:message  { conversationId, role, text, name?, at }   chat:typing { conversationId, who, typing }
 *   chat:staff-joined / chat:staff-left { conversationId, name? }
 *   staff room: chat:activity, chat:handoff, thread:new, thread:message, thread:status
 *   customer:   thread:message, thread:status  (their own conversations with the team)
 * Every client→server event takes an optional ack callback: ({ ok: true, data } | { ok: false, error }).
 */

type Ack = (res: { ok: true; data?: unknown } | { ok: false; error: string }) => void;
type Ctx = { socket: Socket; user?: SessionUser };

const staffMessageSchema = z.object({ conversationId: z.string().regex(/^[a-f\d]{24}$/i), text: z.string().trim().min(1).max(2000) });
const conversationRef = z.object({ conversationId: z.string().regex(/^[a-f\d]{24}$/i) });
const joinSchema = z.object({ conversationId: z.string().regex(/^[a-f\d]{24}$/i).optional(), visitorId: z.string().max(80).optional() });

function readCookie(header: string | undefined, name: string) {
  for (const part of header?.split(";") ?? []) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return undefined;
}

/** Simple per-connection rate limit (the AI costs money per message). */
function limiter(max: number, windowMs: number) {
  let hits: number[] = [];
  return () => {
    const now = Date.now();
    hits = hits.filter((t) => now - t < windowMs);
    if (hits.length >= max) return false;
    hits.push(now);
    return true;
  };
}

const isStaff = (u?: SessionUser) => u?.role === "staff" || u?.role === "admin";
const history = (c: { messages: { role?: string | null; text?: string | null; name?: string | null; at?: Date | null }[] }) =>
  c.messages.map((m) => ({ role: m.role, text: m.text, name: m.name ?? undefined, at: m.at }));

export function initSocket(httpServer: HttpServer) {
  const io = new Server(httpServer, {
    cors: { origin: corsOrigins, credentials: true },
    maxHttpBufferSize: 64 * 1024, // chat messages only
  });

  io.use(async (socket, next) => {
    const token = (socket.handshake.auth?.token as string | undefined) || readCookie(socket.handshake.headers.cookie, env.COOKIE_NAME);
    socket.data.user = await userFromToken(token);
    next();
  });

  io.on("connection", (socket) => {
    const ctx: Ctx = { socket, user: socket.data.user as SessionUser | undefined };
    if (ctx.user?.role === "customer") void socket.join(rooms.user(ctx.user.id));
    if (isStaff(ctx.user)) void socket.join(rooms.staff);
    const allowMessage = limiter(env.NODE_ENV === "test" ? 1000 : 12, 60_000);

    /** Wraps a handler: validates nothing itself, but turns thrown errors into an ack. */
    const on = <T>(event: string, fn: (payload: T, ack: Ack) => Promise<void>) =>
      socket.on(event, async (payload: T, maybeAck?: Ack) => {
        const ack: Ack = typeof maybeAck === "function" ? maybeAck : () => {};
        try {
          await fn(payload ?? ({} as T), ack);
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode;
          if (!status || status >= 500) logger.error(`socket ${event} failed:`, err);
          ack({ ok: false, error: status && status < 500 ? (err as Error).message : "Something went wrong. Please try again." });
        }
      });

    // ── Guest / customer ──────────────────────────────────────────────
    on<unknown>("chat:join", async (payload, ack) => {
      const p = joinSchema.safeParse(payload);
      if (!p.success) return ack({ ok: false, error: "Invalid request" });
      const convo = await findOwnConversation(p.data.conversationId, p.data.visitorId, ctx.user);
      if (!convo) return ack({ ok: true, data: { conversationId: null, messages: [], staffActive: false } });
      await socket.join(rooms.chat(String(convo._id)));
      ack({ ok: true, data: { conversationId: String(convo._id), messages: history(convo), staffActive: convo.staffActive } });
    });

    on<unknown>("chat:message", async (payload, ack) => {
      const p = chatSchema.safeParse(payload);
      if (!p.success) return ack({ ok: false, error: "Please type a message (up to 1,500 characters)." });
      if (!allowMessage()) return ack({ ok: false, error: "You're sending messages too quickly. Please wait a moment." });

      const existing = await findOwnConversation(p.data.conversationId, p.data.visitorId, ctx.user);
      const thinking = !existing?.staffActive;
      if (thinking) socket.emit("chat:typing", { conversationId: existing ? String(existing._id) : null, who: "concierge", typing: true });
      try {
        const result = await handleConciergeMessage({ ...p.data, user: ctx.user });
        await socket.join(rooms.chat(result.conversationId));
        broadcastTurn(result);
        ack({ ok: true, data: { conversationId: result.conversationId, reply: result.reply, mode: result.mode, handoffRequested: result.handoffRequested, staffActive: result.staffActive } });
      } finally {
        if (thinking) socket.emit("chat:typing", { conversationId: existing ? String(existing._id) : null, who: "concierge", typing: false });
      }
    });

    on<unknown>("chat:typing", async (payload) => {
      const p = z.object({ conversationId: z.string(), typing: z.boolean() }).safeParse(payload);
      if (!p.success || !socket.rooms.has(rooms.chat(p.data.conversationId))) return;
      socket.to(rooms.chat(p.data.conversationId)).emit("chat:typing", { conversationId: p.data.conversationId, who: isStaff(ctx.user) ? "staff" : "guest", typing: p.data.typing });
    });

    // ── Staff (admin panel) ───────────────────────────────────────────
    on<unknown>("chat:watch", async (payload, ack) => {
      if (!isStaff(ctx.user)) return ack({ ok: false, error: "Staff only" });
      const p = conversationRef.safeParse(payload);
      if (!p.success) return ack({ ok: false, error: "Invalid conversation" });
      const convo = await ChatConversation.findById(p.data.conversationId);
      if (!convo) return ack({ ok: false, error: "Chat not found" });
      await socket.join(rooms.chat(String(convo._id)));
      ack({ ok: true, data: { conversationId: String(convo._id), messages: history(convo), staffActive: convo.staffActive, handoffRequested: convo.handoffRequested } });
    });

    on<unknown>("chat:staff-message", async (payload, ack) => {
      if (!isStaff(ctx.user)) return ack({ ok: false, error: "Staff only" });
      const p = staffMessageSchema.safeParse(payload);
      if (!p.success) return ack({ ok: false, error: "Type a reply (up to 2,000 characters)." });
      const convo = await ChatConversation.findById(p.data.conversationId);
      if (!convo) return ack({ ok: false, error: "Chat not found" });

      const id = String(convo._id);
      const name = ctx.user!.name.split(" ")[0];
      const takingOver = !convo.staffActive;
      const at = new Date();
      convo.messages.push({ role: "staff", text: p.data.text, name, at });
      convo.set({ staffActive: true, staffMember: ctx.user!.id, handoffRequested: false });
      await convo.save();

      await socket.join(rooms.chat(id));
      if (takingOver) emitTo(rooms.chat(id), "chat:staff-joined", { conversationId: id, name });
      emitTo(rooms.chat(id), "chat:message", { conversationId: id, role: "staff", text: p.data.text, name, at });
      emitTo(rooms.staff, "chat:activity", { conversationId: id, isNew: false, last: p.data.text, handoffRequested: false, staffActive: true, at });
      ack({ ok: true, data: { conversationId: id } });
    });

    on<unknown>("chat:release", async (payload, ack) => {
      if (!isStaff(ctx.user)) return ack({ ok: false, error: "Staff only" });
      const p = conversationRef.safeParse(payload);
      if (!p.success) return ack({ ok: false, error: "Invalid conversation" });
      const convo = await ChatConversation.findByIdAndUpdate(p.data.conversationId, { staffActive: false }, { new: true });
      if (!convo) return ack({ ok: false, error: "Chat not found" });
      emitTo(rooms.chat(String(convo._id)), "chat:staff-left", { conversationId: String(convo._id) });
      emitTo(rooms.staff, "chat:activity", { conversationId: String(convo._id), isNew: false, last: null, handoffRequested: convo.handoffRequested, staffActive: false, at: new Date() });
      ack({ ok: true });
    });
  });

  setIO(io);
  return io;
}
