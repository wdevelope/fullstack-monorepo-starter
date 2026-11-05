import { emailSchema, nicknameSchema, passwordSchema, postInputSchema } from "@starter/contracts";

// Forms run the contract's own schemas, so the limits shown here are the ones the server enforces.
type Issue = NonNullable<ReturnType<typeof emailSchema.safeParse>["error"]>["issues"][number];
type Check = { success: true } | { success: false; error: { issues: Issue[] } };

export type FieldErrors<K extends string> = Partial<Record<K, string>>;

function describeIssue(issue: Issue): string {
  switch (issue.code) {
    case "too_small":
      return Number(issue.minimum) <= 1
        ? "Required."
        : `Use at least ${issue.minimum.toLocaleString("en-US")} characters.`;
    case "too_big":
      return `Use at most ${issue.maximum.toLocaleString("en-US")} characters.`;
    case "invalid_format":
      return issue.format === "email" ? "Enter a valid email address." : "Invalid format.";
    default:
      return "Invalid value.";
  }
}

function problem(check: Check): string | undefined {
  const issue = check.success ? undefined : check.error.issues[0];
  return issue && describeIssue(issue);
}

/** Keeps the fields that have a problem, or returns null when every field is valid. */
function collect<K extends string>(fields: Record<K, string | undefined>): FieldErrors<K> | null {
  const invalid = Object.entries(fields).filter(([, message]) => message !== undefined);
  return invalid.length > 0 ? (Object.fromEntries(invalid) as FieldErrors<K>) : null;
}

export function validateSignUp(values: { email: string; password: string; nickname: string }) {
  return collect({
    email: problem(emailSchema.safeParse(values.email)),
    password: problem(passwordSchema.safeParse(values.password)),
    nickname: problem(nicknameSchema.safeParse(values.nickname)),
  });
}

/** Sign-in checks only that both fields are filled; the password rules apply at sign-up. */
export function validateSignIn(values: { email: string; password: string }) {
  return collect({
    email: problem(emailSchema.safeParse(values.email)),
    password: values.password ? undefined : "Required.",
  });
}

export function validatePost(values: { title: string; body: string }) {
  return collect({
    title: problem(postInputSchema.shape.title.safeParse(values.title)),
    body: problem(postInputSchema.shape.body.safeParse(values.body)),
  });
}
