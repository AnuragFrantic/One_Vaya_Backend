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
  PORT: z.coerce.number().default(5000),
  CORS_ORIGINS: z.string().default("http://localhost:3000"),
  CLIENT_URL: z.string().default("http://localhost:3000"),
  ADMIN_URL: z.string().default("http://localhost:3001"),
  API_URL: z.string().default("http://localhost:5000"),

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

  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  UPLOAD_DIR: z.string().default("uploads"),
  S3_BUCKET: z.string().optional().default(""),
  S3_REGION: z.string().optional().default(""),
  S3_ACCESS_KEY_ID: z.string().optional().default(""),
  S3_SECRET_ACCESS_KEY: z.string().optional().default(""),
  S3_ENDPOINT: z.string().optional().default(""),
  FILE_URL_SECRET: z.string().min(8).default("change-me-too"),
  DOWNLOAD_LINK_TTL_MINUTES: z.coerce.number().default(10),
  MAX_UPLOAD_MB: z.coerce.number().default(15),

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
  s3:
    env.STORAGE_DRIVER === "s3" &&
    !!env.S3_BUCKET &&
    !!env.S3_REGION &&
    !!env.S3_ACCESS_KEY_ID &&
    !!env.S3_SECRET_ACCESS_KEY,
};

export const corsOrigins = env.CORS_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean);
