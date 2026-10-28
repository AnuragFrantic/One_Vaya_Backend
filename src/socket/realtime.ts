import type { Server } from "socket.io";

/**
 * Live-update helpers. Controllers and services call these after saving data; they do nothing
 * until the Socket.io server is started (e.g. in tests or scripts), so the REST API never depends on it.
 *
 * Rooms:
 *   staff                → every signed-in staff/admin (admin panel)
 *   user:<userId>        → one signed-in customer (all their tabs/devices)
 *   chat:<conversationId>→ everyone viewing one concierge conversation (guest + staff watching it)
 * emitAll reaches every connection (e.g. every open website page).
 */
let io: Server | null = null;

export function setIO(server: Server | null) {
  io = server;
}

export const rooms = {
  staff: "staff",
  user: (id: string) => `user:${id}`,
  chat: (id: string) => `chat:${id}`,
};

export function emitTo(room: string | string[], event: string, payload: unknown) {
  io?.to(room).emit(event, payload);
}

export function emitAll(event: string, payload: unknown) {
  io?.emit(event, payload);
}
