import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

import { Alert, Button, TextField } from "../../components/ui.tsx";
import { errorMessage, fieldErrors } from "../../lib/errors.ts";
import type { Navigate } from "../../lib/navigation.ts";
import { signIn, signUp } from "../../lib/session.ts";

/** 로그인과 회원가입. 입력은 메인에서 계약 스키마로 검사하므로 오류를 필드에 대응시킨다. */
export function AuthScreen({
  mode,
  navigate,
}: {
  mode: "sign-in" | "sign-up";
  navigate: Navigate;
}) {
  const isSignUp = mode === "sign-up";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nickname, setNickname] = useState("");
  const submit = useMutation({
    mutationFn: () =>
      isSignUp ? signUp({ email, password, nickname }) : signIn({ email, password }),
    onSuccess: () => navigate({ name: "posts" }),
  });
  const fields = fieldErrors(submit.error);

  return (
    <div className="mx-auto max-w-sm pt-6">
      <h1 className="text-2xl font-semibold tracking-tight">{isSignUp ? "회원가입" : "로그인"}</h1>
      <form
        noValidate
        className="mt-6 flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          submit.mutate();
        }}
      >
        <TextField
          label="이메일"
          type="email"
          autoComplete="email"
          autoFocus
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          error={fields.email}
        />
        {isSignUp && (
          <TextField
            label="닉네임"
            autoComplete="nickname"
            value={nickname}
            onChange={(event) => setNickname(event.target.value)}
            hint="2~20자로 입력해 주세요. 내 글에 함께 표시돼요."
            error={fields.nickname}
          />
        )}
        <TextField
          label="비밀번호"
          type="password"
          autoComplete={isSignUp ? "new-password" : "current-password"}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          hint={isSignUp ? "8자 이상 입력해 주세요." : undefined}
          error={fields.password}
        />
        {submit.error && <Alert>{errorMessage(submit.error)}</Alert>}
        <Button type="submit" disabled={submit.isPending}>
          {isSignUp ? "회원가입" : "로그인"}
        </Button>
      </form>
      <p className="mt-6 text-sm text-zinc-500 dark:text-zinc-400">
        {isSignUp ? "이미 계정이 있나요? " : "아직 계정이 없나요? "}
        <button
          type="button"
          className="font-medium text-zinc-900 underline underline-offset-2 dark:text-zinc-100"
          onClick={() => navigate({ name: isSignUp ? "sign-in" : "sign-up" })}
        >
          {isSignUp ? "로그인" : "회원가입"}
        </button>
      </p>
    </div>
  );
}
