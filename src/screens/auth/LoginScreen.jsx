import React, { useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  View,
  Text,
  TextInput,
  Switch,
  Alert,
  Image,
  ScrollView,
  TouchableOpacity,
  useWindowDimensions,
  StyleSheet,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import Button from "../../components/Button";
import Card from "../../components/Card";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [asTeacher, setAsTeacher] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const { refreshHoso } = useAuth();
  const { width } = useWindowDimensions();

  // logo tự co theo bề ngang màn (tối đa 220)
  const logoSize = Math.min(width * 0.45, 220);

  const onLogin = async () => {
    try {
      if (!email || !password) {
        Alert.alert("Thiếu thông tin", "Nhập email & mật khẩu");
        return;
      }
      setBusy(true);

      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;

      await refreshHoso();
    } catch (e) {
      const msg = e?.message ?? String(e);
      Alert.alert("Đăng nhập thất bại", msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView className="bg-black flex-1">
      <ScrollView
        className="flex-1"
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        {/* LOGO + BRAND */}
        <View style={styles.logoWrap}>
          <Image
            source={require("../../../assets/logo-vci.png")}
            style={{ width: logoSize, height: logoSize, resizeMode: "contain" }}
          />
          <Text
            numberOfLines={2}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
            style={styles.brand}
          >
            VCI - CĐ Công Thương VN
          </Text>
        </View>

        {/* FORM */}
        <View style={{ width: "100%", paddingHorizontal: 24 }}>
          <Card>
            <Text className="text-zinc-400 mb-2">Email</Text>
            <TextInput
              className="bg-zinc-800 rounded-xl px-4 py-3 text-white"
              placeholder="Nhập email được cấp"
              placeholderTextColor="#9ca3af"
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />

            <Text className="text-zinc-400 mt-4 mb-2">Mật khẩu</Text>
            <View style={styles.passwordField}>
              <TextInput
                className="flex-1 text-white py-3"
                placeholder="********"
                placeholderTextColor="#9ca3af"
                secureTextEntry={!showPassword}
                value={password}
                onChangeText={setPassword}
              />
              <TouchableOpacity
                onPress={() => setShowPassword((prev) => !prev)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons
                  name={showPassword ? "eye-off-outline" : "eye-outline"}
                  size={22}
                  color="#9ca3af"
                />
              </TouchableOpacity>
            </View>

            <View className="flex-row items-center justify-between mt-4">
              <Text className="text-zinc-400">Gợi ý vai trò Giáo viên?</Text>
              <Switch value={asTeacher} onValueChange={setAsTeacher} />
            </View>

            <Button
              className="mt-5"
              title={busy ? "Đang đăng nhập..." : "Đăng nhập"}
              onPress={onLogin}
              disabled={busy}
            />
          </Card>

          <Text className="text-zinc-400 mt-6 text-center">
            * Ứng dụng được phát triển bởi{" "}
            <Text className="text-indigo-400">Nhóm 4</Text>.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 32,
    alignItems: "center",
    justifyContent: "center",
    rowGap: 16,
  },
  logoWrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    marginBottom: 8,
  },
  brand: {
    marginTop: 12,
    color: "white",
    fontSize: 22,
    fontWeight: "800",
    textAlign: "center",
  },
  passwordField: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#27272a",
    borderRadius: 12,
    paddingHorizontal: 16,
  },
});
