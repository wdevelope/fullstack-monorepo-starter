import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

import { Alert, Button, TextField } from "../../components/ui.tsx";
import { errorMessage, fieldErrors } from "../../lib/errors.ts";
import type { Navigate } from "../../lib/navigation.ts";
import { signIn, signUp } from "../../lib/session.ts";

/** Sign-in and sign-up. Input is checked by the contract schema in main, so errors map to fields. */
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
      <h1 className="text-2xl font-semibold tracking-tight">
        {isSignUp ? "Create an account" : "Sign in"}
      </h1>
      <form
        noValidate
        className="mt-6 flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          submit.mutate();
        }}
      >
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          autoFocus
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          error={fields.email}
        />
        {isSignUp && (
          <TextField
            label="Nickname"
            autoComplete="nickname"
            value={nickname}
            onChange={(event) => setNickname(event.target.value)}
            hint="2 to 20 characters. Shown on your posts."
            error={fields.nickname}
          />
        )}
        <TextField
          label="Password"
          type="password"
          autoComplete={isSignUp ? "new-password" : "current-password"}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          hint={isSignUp ? "At least 8 characters." : undefined}
          error={fields.password}
        />
        {submit.error && <Alert>{errorMessage(submit.error)}</Alert>}
        <Button type="submit" disabled={submit.isPending}>
          {isSignUp ? "Create account" : "Sign in"}
        </Button>
      </form>
      <p className="mt-6 text-sm text-zinc-500 dark:text-zinc-400">
        {isSignUp ? "Already have an account? " : "New here? "}
        <button
          type="button"
          className="font-medium text-zinc-900 underline underline-offset-2 dark:text-zinc-100"
          onClick={() => navigate({ name: isSignUp ? "sign-in" : "sign-up" })}
        >
          {isSignUp ? "Sign in" : "Create an account"}
        </button>
      </p>
    </div>
  );
}
