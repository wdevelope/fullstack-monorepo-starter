import { Text, TextInput, View, type TextInputProps } from "react-native";

interface TextFieldProps extends Omit<TextInputProps, "className"> {
  label: string;
  error?: string;
  hint?: string;
}

export function TextField({ label, error, hint, multiline, ...input }: TextFieldProps) {
  return (
    <View className="gap-1.5">
      <Text className="text-sm font-medium text-neutral-700">{label}</Text>
      <TextInput
        accessibilityLabel={label}
        accessibilityHint={error ?? hint}
        placeholderTextColor="#a3a3a3"
        multiline={multiline}
        textAlignVertical={multiline ? "top" : "center"}
        className={`rounded-xl border bg-white px-4 py-3 text-base text-neutral-900 focus:border-neutral-900 ${
          error ? "border-red-500" : "border-neutral-300"
        } ${multiline ? "min-h-48" : ""}`}
        {...input}
      />
      {error ? (
        <Text className="text-sm text-red-600">{error}</Text>
      ) : hint ? (
        <Text className="text-sm text-neutral-500">{hint}</Text>
      ) : null}
    </View>
  );
}
