import React from "react";
import { View } from "react-native";
export default function Card({ children, className = "" }) {
  return (
    <View className={`bg-zinc-900 rounded-2xl p-4 ${className}`}>
      {children}
    </View>
  );
}
