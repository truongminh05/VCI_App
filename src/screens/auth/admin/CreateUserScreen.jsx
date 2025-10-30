import React, { useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  View,
  Text,
  TextInput,
  Alert,
  TouchableOpacity, // <-- BỔ SUNG
} from "react-native";
import Section from "../../../components/Section";
import Card from "../../../components/Card";
import Button from "../../../components/Button";
import { supabase } from "../../../lib/supabase";
// (khuyến nghị) bắt lỗi chuẩn từ Edge Function
import {
  FunctionsHttpError,
  FunctionsRelayError,
  FunctionsFetchError,
} from "@supabase/supabase-js";

export default function CreateUserScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const ROLES = [
    { key: "sinhvien", label: "Sinh viên" },
    { key: "giangvien", label: "Giáo viên" },
    { key: "quantri", label: "Quản trị" },
  ];

  const [role, setRole] = useState("sinhvien"); // nếu dùng TSX: useState<"sinhvien"|"giangvien"|"quantri">("sinhvien")

  const [busy, setBusy] = useState(false);

  const createUser = async () => {
    try {
      if (!email || !password || !name) {
        return Alert.alert(
          "Thiếu thông tin",
          "Nhập đủ họ tên, email, mật khẩu."
        );
      }
      setBusy(true);

      // NOTE: đổi "swift-task" thành đúng tên function bạn đã deploy
      const { data, error } = await supabase.functions.invoke("swift-task", {
        body: { email, password, ho_ten: name, vai_tro: role },
      });

      if (error) throw error;
      Alert.alert(
        "Thành công",
        `Đã tạo tài khoản cho: ${data?.user?.email || email}`
      );
      setEmail("");
      setPassword("");
      setName("");
    } catch (e) {
      // Bắt lỗi non-2xx chuẩn theo docs
      if (e instanceof FunctionsHttpError) {
        let body;
        try {
          body = await e.context.json();
        } catch {}
        Alert.alert(
          `Edge error ${e.status}`,
          body ? JSON.stringify(body) : e.message
        );
      } else if (
        e instanceof FunctionsRelayError ||
        e instanceof FunctionsFetchError
      ) {
        Alert.alert("Edge invoke error", e.message);
      } else {
        Alert.alert("Tạo tài khoản thất bại", String(e?.message ?? e));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView className="bg-black flex-1">
      <Section title="Tạo tài khoản" subtitle="(qua Edge Function)" />
      <View className="px-5">
        <Card>
          <Text className="text-zinc-400 mb-2">Họ tên</Text>
          <TextInput
            className="bg-zinc-800 rounded-xl px-4 py-3 text-white"
            value={name}
            onChangeText={setName}
            placeholder="Nguyễn Văn A"
            placeholderTextColor="#9ca3af"
          />
          <Text className="text-zinc-400 mt-3 mb-2">Email</Text>
          <TextInput
            className="bg-zinc-800 rounded-xl px-4 py-3 text-white"
            value={email}
            onChangeText={setEmail}
            placeholder="user@school.edu"
            placeholderTextColor="#9ca3af"
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <Text className="text-zinc-400 mt-3 mb-2">Mật khẩu tạm</Text>
          <TextInput
            className="bg-zinc-800 rounded-xl px-4 py-3 text-white"
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            placeholderTextColor="#9ca3af"
            secureTextEntry
          />
          <Text className="text-zinc-400 mt-3 mb-2">Vai trò</Text>
          <View className="flex-row gap-2 mt-3">
            {ROLES.map((r) => (
              <TouchableOpacity
                key={r.key}
                className={`px-3 py-2 rounded-xl ${
                  role === r.key ? "bg-indigo-600" : "bg-zinc-800"
                }`}
                onPress={() => setRole(r.key)} // <-- set đúng giá trị
              >
                <Text className="text-white">{r.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Button
            className="mt-4"
            title={busy ? "Đang tạo..." : "Tạo tài khoản"}
            onPress={createUser}
            disabled={busy}
          />
        </Card>
      </View>
    </SafeAreaView>
  );
}
