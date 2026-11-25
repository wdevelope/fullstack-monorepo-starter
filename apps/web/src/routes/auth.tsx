import { emailSchema, nicknameSchema, passwordSchema } from "@starter/contracts";
import { getRouteApi, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";

import { Button, Card, ErrorBanner, Field, TextInput } from "../components/ui.tsx";
import { client, queryClient } from "../lib/api.ts";
import { describeError } from "../lib/errors.ts";

type Fields = { email: string; password: string; nickname: string };

/** 클라이언트 검사는 서버와 같은 Zod 스키마를 쓴다. 그래서 규칙이 어긋날 수 없다. */
function validate(fields: Fields, withNickname: boolean) {
  return {
    email: emailSchema.safeParse(fields.email).success
      ? undefined
      : "올바른 이메일을 입력해 주세요.",
    password: passwordSchema.safeParse(fields.password).success
      ? undefined
      : "8~128자로 입력해 주세요.",
    nickname:
      !withNickname || nicknameSchema.safeParse(fields.nickname).success
        ? undefined
        : "2~20자로 입력해 주세요.",
  };
}

function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const { redirect } = getRouteApi(mode === "login" ? "/login" : "/signup").useSearch();
  const navigate = useNavigate();
  const [fields, setFields] = useState<Fields>({ email: "", password: "", nickname: "" });
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const isSignup = mode === "signup";
  const errors = validate(fields, isSignup);
  const invalid = Object.values(errors).some(Boolean);
  const set = (key: keyof Fields) => (event: { target: { value: string } }) =>
    setFields({ ...fields, [key]: event.target.value });

  async function submit(event: FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (invalid) return;
    setPending(true);
    setError(null);
    try {
      if (isSignup) await client.signUp(fields);
      else await client.signIn({ email: fields.email, password: fields.password });
      // "likedByMe"와 작성자 전용 버튼은 누가 로그인했는지에 따라 달라진다.
      await queryClient.invalidateQueries();
      await navigate({ to: redirect });
    } catch (caught) {
      setError(describeError(caught));
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <h1 className="text-xl font-semibold">{isSignup ? "회원가입" : "로그인"}</h1>
        <ErrorBanner message={error} />
        <Field label="이메일" error={touched ? errors.email : undefined}>
          <TextInput
            type="email"
            autoComplete="email"
            value={fields.email}
            onChange={set("email")}
          />
        </Field>
        {isSignup && (
          <Field label="닉네임" error={touched ? errors.nickname : undefined}>
            <TextInput autoComplete="nickname" value={fields.nickname} onChange={set("nickname")} />
          </Field>
        )}
        <Field label="비밀번호" error={touched ? errors.password : undefined}>
          <TextInput
            type="password"
            autoComplete={isSignup ? "new-password" : "current-password"}
            value={fields.password}
            onChange={set("password")}
          />
        </Field>
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? "잠시만 기다려 주세요…" : isSignup ? "회원가입" : "로그인"}
        </Button>
        <p className="text-center text-sm text-zinc-500">
          {isSignup ? "이미 계정이 있나요? " : "처음 오셨나요? "}
          <Link
            to={isSignup ? "/login" : "/signup"}
            search={{ redirect }}
            className="font-medium text-indigo-600 dark:text-indigo-400"
          >
            {isSignup ? "로그인" : "회원가입"}
          </Link>
        </p>
      </form>
    </Card>
  );
}

export function LoginPage() {
  return <AuthForm mode="login" />;
}

export function SignupPage() {
  return <AuthForm mode="signup" />;
}
