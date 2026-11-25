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
import { validateSignIn, type FieldErrors } from "../src/lib/validation";

export default function SignInScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<"email" | "password">>({});
  const signIn = useMutation({
    mutationFn: (input: { email: string; password: string }) => client.signIn(input),
    onSuccess: () => leave(),
  });

  function submit() {
    const values = { email, password };
    const errors = validateSignIn(values);
    setFieldErrors(errors ?? {});
    if (!errors) signIn.mutate(values);
  }

  return (
    <FormScreen>
      {signIn.error ? <ErrorBanner error={signIn.error} /> : null}
      <TextField
        label="이메일"
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
        label="비밀번호"
        value={password}
        onChangeText={setPassword}
        error={fieldErrors.password}
        secureTextEntry
        autoComplete="current-password"
        textContentType="password"
        returnKeyType="go"
        onSubmitEditing={submit}
      />
      <Button title="로그인" onPress={submit} loading={signIn.isPending} />
      <View className="flex-row items-center justify-center gap-1.5 pt-2">
        <Text className="text-base text-neutral-500">처음이신가요?</Text>
        <TextButton title="회원가입" onPress={() => router.replace("/sign-up")} />
      </View>
    </FormScreen>
  );
}
