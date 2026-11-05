import { emailSchema, nicknameSchema, passwordSchema } from "@starter/contracts";
import { getRouteApi, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";

import { Button, Card, ErrorBanner, Field, TextInput } from "../components/ui.tsx";
import { client, queryClient } from "../lib/api.ts";
import { describeError } from "../lib/errors.ts";

type Fields = { email: string; password: string; nickname: string };

/** Client-side checks use the same Zod schemas as the server, so the rules cannot drift. */
function validate(fields: Fields, withNickname: boolean) {
  return {
    email: emailSchema.safeParse(fields.email).success ? undefined : "Enter a valid email.",
    password: passwordSchema.safeParse(fields.password).success
      ? undefined
      : "Use 8 to 128 characters.",
    nickname:
      !withNickname || nicknameSchema.safeParse(fields.nickname).success
        ? undefined
        : "Use 2 to 20 characters.",
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
      // "likedByMe" and author-only buttons depend on who is signed in.
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
        <h1 className="text-xl font-semibold">{isSignup ? "Create an account" : "Sign in"}</h1>
        <ErrorBanner message={error} />
        <Field label="Email" error={touched ? errors.email : undefined}>
          <TextInput
            type="email"
            autoComplete="email"
            value={fields.email}
            onChange={set("email")}
          />
        </Field>
        {isSignup && (
          <Field label="Nickname" error={touched ? errors.nickname : undefined}>
            <TextInput autoComplete="nickname" value={fields.nickname} onChange={set("nickname")} />
          </Field>
        )}
        <Field label="Password" error={touched ? errors.password : undefined}>
          <TextInput
            type="password"
            autoComplete={isSignup ? "new-password" : "current-password"}
            value={fields.password}
            onChange={set("password")}
          />
        </Field>
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? "Please wait…" : isSignup ? "Sign up" : "Sign in"}
        </Button>
        <p className="text-center text-sm text-zinc-500">
          {isSignup ? "Already have an account? " : "New here? "}
          <Link
            to={isSignup ? "/login" : "/signup"}
            search={{ redirect }}
            className="font-medium text-indigo-600 dark:text-indigo-400"
          >
            {isSignup ? "Sign in" : "Create an account"}
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
