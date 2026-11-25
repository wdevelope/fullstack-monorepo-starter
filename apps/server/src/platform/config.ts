import * as z from "zod";

const envSchema = z.object({
  DATABASE_URL: z.url(),
  JWT_SECRET: z.string().min(32, "JWT_SECRET은 32자 이상이어야 한다"),
  PORT: z.coerce.number().int().default(3000),
  HOST: z.string().default("0.0.0.0"),
  CORS_ORIGINS: z
    .string()
    .default("http://localhost:5173")
    .transform((value) => value.split(",").map((origin) => origin.trim())),
  COOKIE_SECURE: z.stringbool().default(process.env.NODE_ENV === "production"),
  // 리버스 프록시 뒤에서만 켠다. 켜면 X-Forwarded-For의 첫 주소를 클라이언트 IP로 믿는다(RATE 규칙 5).
  TRUST_PROXY: z.stringbool().default(false),
});

export type Config = ReturnType<typeof readConfig>;

/** 시작할 때 환경 변수를 한 번 읽고 검증한다. 값이 잘못되면 알아보기 쉬운 메시지와 함께 프로세스를 멈춘다. */
export function readConfig(env: NodeJS.ProcessEnv = process.env) {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error(`환경 변수가 올바르지 않다:\n${z.prettifyError(parsed.error)}`);
  }
  const e = parsed.data;
  return {
    databaseUrl: e.DATABASE_URL,
    jwtSecret: e.JWT_SECRET,
    port: e.PORT,
    host: e.HOST,
    corsOrigins: e.CORS_ORIGINS,
    cookieSecure: e.COOKIE_SECURE,
    trustProxy: e.TRUST_PROXY,
  };
}
