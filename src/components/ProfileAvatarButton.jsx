// src/components/ProfileAvatarButton.jsx
import React from "react";
import { TouchableOpacity, View, Text } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useAuth } from "../contexts/AuthContext";

export default function ProfileAvatarButton() {
  const navigation = useNavigation();
  const { user, hoso } = useAuth();

  if (!user) return null;

  const name = hoso?.ho_ten || user.email || "Bạn";
  const initial =
    name.split(" ").filter(Boolean).slice(-1)[0]?.charAt(0).toUpperCase() ||
    "?";

  const handlePress = () => {
    // Điều hướng lên Stack cha (AdminRoot / StudentHome / TeacherHome)
    const parent = navigation.getParent && navigation.getParent();
    if (parent) {
      parent.navigate("Profile");
    } else {
      navigation.navigate("Profile");
    }
  };

  return (
    <TouchableOpacity
      onPress={handlePress}
      style={{ marginRight: 12 }}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <View className="w-9 h-9 rounded-full bg-zinc-800 border border-zinc-600 items-center justify-center">
        <Text className="text-white font-semibold">{initial}</Text>
      </View>
    </TouchableOpacity>
  );
}
