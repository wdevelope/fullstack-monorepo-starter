import * as z from "zod";

const envSchema = z.object({
  DATABASE_URL: z.url(),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  PORT: z.coerce.number().int().default(3000),
  HOST: z.string().default("0.0.0.0"),
  CORS_ORIGINS: z
    .string()
    .default("http://localhost:5173")
    .transform((value) => value.split(",").map((origin) => origin.trim())),
  COOKIE_SECURE: z.stringbool().default(process.env.NODE_ENV === "production"),
});

export type Config = ReturnType<typeof readConfig>;

/** Reads and validates the environment once at startup. A bad value stops the process with a clear message. */
export function readConfig(env: NodeJS.ProcessEnv = process.env) {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error(`Invalid environment:\n${z.prettifyError(parsed.error)}`);
  }
  const e = parsed.data;
  return {
    databaseUrl: e.DATABASE_URL,
    jwtSecret: e.JWT_SECRET,
    port: e.PORT,
    host: e.HOST,
    corsOrigins: e.CORS_ORIGINS,
    cookieSecure: e.COOKIE_SECURE,
  };
}
