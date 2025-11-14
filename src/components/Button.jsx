import React from "react";
import { TouchableOpacity, Text, View } from "react-native";

export default function Button({
  title,
  onPress,
  className = "",
  disabled,
  icon, // React element, ví dụ: <Ionicons .../>
  rightIcon, // React element (tùy chọn)
  compact = false, // true => nhỏ gọn hơn
  variant = "solid", // "solid" | "outline"
}) {
  const pad = compact ? "px-4 py-2" : "px-5 py-3";
  const base = "rounded-2xl items-center justify-center flex-row gap-2 " + pad;
  const color = disabled
    ? "bg-zinc-700"
    : variant === "outline"
    ? "border border-indigo-500"
    : "bg-indigo-600";
  const textColor = variant === "outline" ? "text-indigo-300" : "text-white";

  return (
    <TouchableOpacity
      className={`${base} ${color} ${className}`}
      onPress={onPress}
      disabled={disabled}
    >
      {icon ? <View>{icon}</View> : null}
      {title ? (
        <Text className={`${textColor} font-semibold`}>{title}</Text>
      ) : null}
      {rightIcon ? <View>{rightIcon}</View> : null}
    </TouchableOpacity>
  );
}
