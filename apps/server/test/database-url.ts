const DEFAULT_TEST_DATABASE_URL = "postgres://starter:starter@localhost:5432/starter_test";

/** 테스트는 데이터베이스를 비우므로, 이름에 "test"가 없는 데이터베이스에서는 실행을 거부한다. */
export function testDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL ?? DEFAULT_TEST_DATABASE_URL;
  if (!new URL(url).pathname.includes("test")) {
    throw new Error(
      `TEST_DATABASE_URL은 이름에 "test"가 들어간 데이터베이스를 가리켜야 한다: ${url}`,
    );
  }
  return url;
}
