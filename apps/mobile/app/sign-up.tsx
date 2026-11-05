import { passwordSchema } from "@starter/contracts";
import { useMutation } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";

import { Button, TextButton } from "../src/components/button";
import { ErrorBanner } from "../src/components/feedback";
import { FormScreen } from "../src/components/form-screen";
import { TextField } from "../src/components/text-field";
import { client } from "../src/lib/api";
import { leave } from "../src/lib/navigation";
import { validateSignUp, type FieldErrors } from "../src/lib/validation";

type Field = "email" | "nickname" | "password";

export default function SignUpScreen() {
  const [email, setEmail] = useState("");
  const [nickname, setNickname] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<Field>>({});
  const signUp = useMutation({
    mutationFn: (input: Record<Field, string>) => client.signUp(input),
    onSuccess: () => leave(),
  });

  function submit() {
    const values = { email, nickname, password };
    const errors = validateSignUp(values);
    setFieldErrors(errors ?? {});
    if (!errors) signUp.mutate(values);
  }

  return (
    <FormScreen>
      {signUp.error ? <ErrorBanner error={signUp.error} /> : null}
      <TextField
        label="Email"
        value={email}
        onChangeText={setEmail}
        error={fieldErrors.email}
        autoCapitalize="none"
        autoComplete="email"
        autoCorrect={false}
        keyboardType="email-address"
        textContentType="emailAddress"
        autoFocus
      />
      <TextField
        label="Nickname"
        value={nickname}
        onChangeText={setNickname}
        error={fieldErrors.nickname}
        hint="Shown next to your posts and comments."
        autoCapitalize="none"
        autoComplete="username"
        autoCorrect={false}
        textContentType="nickname"
      />
      <TextField
        label="Password"
        value={password}
        onChangeText={setPassword}
        error={fieldErrors.password}
        hint={`At least ${passwordSchema.minLength} characters.`}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="go"
        onSubmitEditing={submit}
      />
      <Button title="Create account" onPress={submit} loading={signUp.isPending} />
      <View className="flex-row items-center justify-center gap-1.5 pt-2">
        <Text className="text-base text-neutral-500">Already have an account?</Text>
        <TextButton title="Sign in" onPress={() => router.replace("/sign-in")} />
      </View>
    </FormScreen>
  );
}
