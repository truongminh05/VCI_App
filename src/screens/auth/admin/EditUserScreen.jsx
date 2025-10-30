import React, { useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { View, Text, TextInput, Alert } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import Section from "../../../components/Section";
import Card from "../../../components/Card";
import Button from "../../../components/Button";
import { supabase } from "../../../lib/supabase";

export default function EditUserScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const { user } = route.params || {}; // { nguoi_dung_id, ho_ten, ma_sinh_vien, vai_tro }

  const [name, setName] = useState(user?.ho_ten || "");
  const [studentId, setStudentId] = useState(user?.ma_sinh_vien || "");
  const [busy, setBusy] = useState(false);

  const handleUpdate = async () => {
    if (!name?.trim()) {
      return Alert.alert("Thiếu thông tin", "Họ tên không được để trống.");
    }

    setBusy(true);
    try {
      const normalized =
        (studentId ?? "").trim() === ""
          ? null
          : (studentId ?? "").trim().toUpperCase(); // hoặc .toLowerCase()

      // Kiểm tra trùng mã SV trước khi update (loại trừ chính user này)
      if (normalized) {
        const { data: clash, error: e1 } = await supabase
          .from("hoso")
          .select("nguoi_dung_id, ho_ten, ma_sinh_vien")
          .eq("ma_sinh_vien", normalized)
          .neq("nguoi_dung_id", user.nguoi_dung_id)
          .maybeSingle();

        if (e1) throw e1;
        if (clash?.nguoi_dung_id) {
          Alert.alert(
            "Mã sinh viên đã tồn tại",
            `Mã này đang thuộc: ${clash.ho_ten}`
          );
          setBusy(false);
          return;
        }
      }

      // Cập nhật hồ sơ (để null nếu rỗng)
      const { error } = await supabase
        .from("hoso")
        .update({
          ho_ten: name.trim(),
          ma_sinh_vien: normalized, // null nếu để trống
        })
        .eq("nguoi_dung_id", user.nguoi_dung_id);

      if (error) {
        // Bắt riêng duplicate key 23505 nếu có
        if (error.code === "23505") {
          Alert.alert("Mã sinh viên đã tồn tại", "Vui lòng dùng một mã khác.");
        } else {
          Alert.alert("Lỗi", error.message || "Không thể cập nhật.");
        }
        setBusy(false);
        return;
      }

      Alert.alert("Thành công", "Đã cập nhật thông tin người dùng.", [
        { text: "OK", onPress: () => navigation.goBack() },
      ]);
    } catch (e) {
      Alert.alert("Lỗi", e?.message || "Không thể cập nhật.");
    } finally {
      setBusy(false);
    }
  };

  if (!user) {
    return (
      <SafeAreaView className="bg-black flex-1 items-center justify-center">
        <Text className="text-red-500">Không có dữ liệu người dùng.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="bg-black flex-1">
      <Section
        title="Sửa thông tin"
        subtitle={user?.ho_ten || user?.nguoi_dung_id?.slice(0, 8)}
      />
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

          {user?.vai_tro === "sinhvien" && (
            <>
              <Text className="text-zinc-400 mt-3 mb-2">Mã sinh viên</Text>
              <TextInput
                className="bg-zinc-800 rounded-xl px-4 py-3 text-white"
                value={studentId}
                onChangeText={setStudentId}
                placeholder="2001210000"
                placeholderTextColor="#9ca3af"
                autoCapitalize="characters" // gợi ý nhập chữ hoa
              />
              <Text className="text-zinc-500 mt-1">
                (Để trống nếu muốn xoá mã sinh viên)
              </Text>
            </>
          )}

          <Button
            className="mt-4"
            title={busy ? "Đang lưu..." : "Lưu thay đổi"}
            onPress={handleUpdate}
            disabled={busy}
          />
        </Card>
      </View>
    </SafeAreaView>
  );
}
