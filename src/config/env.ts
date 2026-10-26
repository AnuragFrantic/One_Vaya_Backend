import fs from "fs";
import "dotenv/config";
import { z } from "zod";

/**
 * All configuration comes from environment variables (see `.env.example`).
 * Validated once at start-up so a missing/invalid value fails fast with a clear message.
 */
const bool = z
  .string()
  .optional()
  .transform((v) => v === "true");

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(9877),
  // HTTPS: set both to serve HTTPS directly (e.g. Let's Encrypt). Leave empty for HTTP (localhost / behind Nginx).
  SSL_KEY_PATH: z.string().optional().default(""),
  SSL_CERT_PATH: z.string().optional().default(""),
  SSL_CA_PATH: z.string().optional().default(""),
  CORS_ORIGINS: z.string().default("http://localhost:3000"),
  CLIENT_URL: z.string().default("http://localhost:3000"),
  ADMIN_URL: z.string().default("http://localhost:3001"),
  API_URL: z.string().default("http://localhost:9877"),

  MONGODB_URI: z.string().default("mongodb://127.0.0.1:27017/onevaya"),
  USE_MEMORY_DB: bool,
  // Optional: DNS servers for resolving mongodb+srv:// (comma separated). Only needed on networks
  // where Node can't resolve SRV records, e.g. DNS_SERVERS=10.5.50.1
  DNS_SERVERS: z.string().optional().default(""),

  JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 characters"),
  JWT_EXPIRES_IN: z.string().default("7d"),
  COOKIE_NAME: z.string().default("ov_session"),
  COOKIE_SECURE: bool,

  ANTHROPIC_API_KEY: z.string().optional().default(""),
  AI_CHAT_MODEL: z.string().default("claude-haiku-5-5"),
  AI_PLANNER_MODEL: z.string().default("claude-sonnet-5-5"),
  AI_CHAT_MAX_TURNS: z.coerce.number().default(20),

  SMTP_HOST: z.string().optional().default(""),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_SECURE: bool,
  SMTP_USER: z.string().optional().default(""),
  SMTP_PASS: z.string().optional().default(""),
  EMAIL_FROM: z.string().default("OneVaya Travel & Tourism <hello@onevaya.com>"),
  TEAM_EMAIL: z.string().default("team@onevaya.com"),

  UPLOAD_DIR: z.string().default("uploads"),
  FILE_URL_SECRET: z.string().min(8).default("change-me-too"),
  DOWNLOAD_LINK_TTL_MINUTES: z.coerce.number().default(10),
  MAX_UPLOAD_MB: z.coerce.number().default(15),
  MAX_IMAGE_MB: z.coerce.number().default(5),

  ADMIN_NAME: z.string().default("OneVaya Admin"),
  ADMIN_EMAIL: z.string().default("admin@onevaya.com"),
  ADMIN_PASSWORD: z.string().default("ChangeMe!2026"),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error("❌ Invalid environment configuration:");
  for (const issue of parsed.error.issues) console.error(`   ${issue.path.join(".")}: ${issue.message}`);
  process.exit(1);
}

export const env = parsed.data;

// HTTPS certificate files must exist when configured (clear message instead of a crash later).
if (!!env.SSL_KEY_PATH !== !!env.SSL_CERT_PATH) {
  console.error("❌ Set both SSL_KEY_PATH and SSL_CERT_PATH for HTTPS, or leave both empty for HTTP.");
  process.exit(1);
}
for (const [name, file] of [["SSL_KEY_PATH", env.SSL_KEY_PATH], ["SSL_CERT_PATH", env.SSL_CERT_PATH], ["SSL_CA_PATH", env.SSL_CA_PATH]] as const) {
  if (file && !fs.existsSync(file)) {
    console.error(`❌ ${name} points to a file that does not exist: ${file}`);
    process.exit(1);
  }
}

if (env.NODE_ENV === "production") {
  const weak = ["change-me-to-a-long-random-string", "change-me-too"];
  if (weak.includes(env.JWT_SECRET) || weak.includes(env.FILE_URL_SECRET)) {
    console.error("❌ Set real JWT_SECRET and FILE_URL_SECRET values before running in production.");
    process.exit(1);
  }
}

/** Feature switches: each service turns on automatically when its keys are present. */
export const features = {
  ai: env.ANTHROPIC_API_KEY.trim().length > 0,
  email: env.SMTP_HOST.trim().length > 0,
};

export const corsOrigins = env.CORS_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean);
