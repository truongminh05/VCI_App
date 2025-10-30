import React from "react";
import { TouchableOpacity, Text } from "react-native";

export default function Button({ title, onPress, className = "", disabled }) {
  return (
    <TouchableOpacity
      className={`rounded-2xl px-5 py-3 items-center ${
        disabled ? "bg-zinc-700" : "bg-indigo-600"
      } ${className}`}
      onPress={onPress}
      disabled={disabled}
    >
      <Text className="text-white font-semibold">{title}</Text>
    </TouchableOpacity>
  );
}
