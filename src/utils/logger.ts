/* Minimal console logger with timestamps. Swap for pino/winston later if needed. */
const ts = () => new Date().toISOString();

export const logger = {
  info: (...a: unknown[]) => console.log(`[${ts()}] INFO `, ...a),
  warn: (...a: unknown[]) => console.warn(`[${ts()}] WARN `, ...a),
  error: (...a: unknown[]) => console.error(`[${ts()}] ERROR`, ...a),
};
