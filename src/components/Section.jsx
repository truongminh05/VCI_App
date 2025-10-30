import React from "react";
import { View, Text } from "react-native";
export default function Section({ title, subtitle, className = "" }) {
  return (
    <View className={`px-5 py-4 ${className}`}>
      <Text className="text-white text-xl font-semibold">{title}</Text>
      {subtitle ? <Text className="text-zinc-400">{subtitle}</Text> : null}
    </View>
  );
}
