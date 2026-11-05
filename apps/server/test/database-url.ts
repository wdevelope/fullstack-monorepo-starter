const DEFAULT_TEST_DATABASE_URL = "postgres://starter:starter@localhost:5432/starter_test";

/** Tests wipe the database, so they refuse to run against one whose name does not contain "test". */
export function testDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL ?? DEFAULT_TEST_DATABASE_URL;
  if (!new URL(url).pathname.includes("test")) {
    throw new Error(
      `TEST_DATABASE_URL must point to a database whose name contains "test": ${url}`,
    );
  }
  return url;
}
