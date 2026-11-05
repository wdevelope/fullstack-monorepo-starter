import { ActivityIndicator, Pressable, Text } from "react-native";

const VARIANTS = {
  primary: { box: "bg-neutral-900", label: "text-white", spinner: "#ffffff" },
  secondary: {
    box: "border border-neutral-300 bg-white",
    label: "text-neutral-900",
    spinner: "#171717",
  },
} as const;

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: keyof typeof VARIANTS;
  loading?: boolean;
  disabled?: boolean;
  compact?: boolean;
}

export function Button({
  title,
  onPress,
  variant = "primary",
  loading = false,
  disabled = false,
  compact = false,
}: ButtonProps) {
  const style = VARIANTS[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      disabled={disabled || loading}
      onPress={onPress}
      className={`items-center justify-center rounded-xl active:opacity-70 ${style.box} ${
        compact ? "h-11 px-4" : "h-12 px-5"
      } ${disabled ? "opacity-40" : ""}`}
    >
      {loading ? (
        <ActivityIndicator color={style.spinner} />
      ) : (
        <Text className={`text-base font-semibold ${style.label}`}>{title}</Text>
      )}
    </Pressable>
  );
}

const TONES = {
  default: "text-neutral-900",
  muted: "text-neutral-500",
  danger: "text-red-600",
} as const;

/** A borderless text action for headers and inline controls. */
export function TextButton({
  title,
  onPress,
  tone = "default",
  disabled = false,
}: {
  title: string;
  onPress: () => void;
  tone?: keyof typeof TONES;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={10}
      onPress={onPress}
      className={`active:opacity-50 ${disabled ? "opacity-40" : ""}`}
    >
      <Text className={`text-base font-semibold ${TONES[tone]}`}>{title}</Text>
    </Pressable>
  );
}
