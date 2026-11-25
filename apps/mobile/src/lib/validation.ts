import { emailSchema, nicknameSchema, passwordSchema, postInputSchema } from "@starter/contracts";

// 폼은 계약의 스키마를 그대로 실행하므로, 여기서 보이는 제한값이 곧 서버가 강제하는 값이다.
type Issue = NonNullable<ReturnType<typeof emailSchema.safeParse>["error"]>["issues"][number];
type Check = { success: true } | { success: false; error: { issues: Issue[] } };

export type FieldErrors<K extends string> = Partial<Record<K, string>>;

function describeIssue(issue: Issue): string {
  switch (issue.code) {
    case "too_small":
      return Number(issue.minimum) <= 1
        ? "입력해 주세요."
        : `${issue.minimum.toLocaleString("ko-KR")}자 이상 입력해 주세요.`;
    case "too_big":
      return `${issue.maximum.toLocaleString("ko-KR")}자 이하로 입력해 주세요.`;
    case "invalid_format":
      return issue.format === "email"
        ? "올바른 이메일 주소를 입력해 주세요."
        : "형식이 올바르지 않아요.";
    default:
      return "올바르지 않은 값이에요.";
  }
}

function problem(check: Check): string | undefined {
  const issue = check.success ? undefined : check.error.issues[0];
  return issue && describeIssue(issue);
}

/** 문제가 있는 필드만 남기고, 모든 필드가 올바르면 null을 돌려준다. */
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

/** 로그인은 두 필드가 채워졌는지만 본다. 비밀번호 규칙은 가입 때 적용한다. */
export function validateSignIn(values: { email: string; password: string }) {
  return collect({
    email: problem(emailSchema.safeParse(values.email)),
    password: values.password ? undefined : "입력해 주세요.",
  });
}

export function validatePost(values: { title: string; body: string }) {
  return collect({
    title: problem(postInputSchema.shape.title.safeParse(values.title)),
    body: problem(postInputSchema.shape.body.safeParse(values.body)),
  });
}
