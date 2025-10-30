import React, { useEffect, useState, useCallback } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { View, Text, FlatList, TouchableOpacity, Alert } from "react-native";
import Section from "../../../components/Section";
import Card from "../../../components/Card";
import { supabase } from "../../../lib/supabase"; // Chỉ cần client mặc định
import { useNavigation, useFocusEffect } from "@react-navigation/native";

export default function UsersScreen() {
  const navigation = useNavigation();
  const [items, setItems] = useState([]);
  const [roleFilter, setRoleFilter] = useState("all");

  const load = async () => {
    let q = supabase
      .from("hoso")
      .select("nguoi_dung_id, ho_ten, vai_tro, ma_sinh_vien, tao_luc")
      .is("da_vo_hieu_hoa_luc", null) // <-- DÒNG QUAN TRỌNG
      .order("tao_luc", { ascending: false });

    if (roleFilter !== "all") {
      q = q.eq("vai_tro", roleFilter);
    }
    const { data, error } = await q;
    if (error) {
      Alert.alert("Lỗi tải người dùng", error.message);
      setItems([]);
    } else {
      setItems(data || []);
    }
  };

  useFocusEffect(
    useCallback(() => {
      load();
    }, [roleFilter])
  );

  const toggleRole = async (uid, current) => {
    const next =
      current === "sinhvien"
        ? "giangvien"
        : current === "giangvien"
        ? "quantri"
        : "sinhvien";
    const { error } = await supabase
      .from("hoso")
      .update({ vai_tro: next })
      .eq("nguoi_dung_id", uid);
    if (error) Alert.alert("Lỗi", error.message);
    else load();
  };

  // HÀM XÓA ĐÃ ĐƯỢC CẬP NHẬT ĐỂ GỌI RPC
  const handleDelete = (user) => {
    Alert.alert(
      "Xác nhận vô hiệu hóa",
      `Bạn có chắc chắn muốn vô hiệu hóa tài khoản "${user.ho_ten}"? Người dùng này sẽ không thể đăng nhập được nữa.`,
      [
        { text: "Hủy", style: "cancel" },
        {
          text: "Vô hiệu hóa",
          style: "destructive",
          onPress: async () => {
            try {
              // Thực hiện "xóa mềm" bằng cách cập nhật cột mới
              const { error } = await supabase
                .from("hoso")
                .update({ da_vo_hieu_hoa_luc: new Date().toISOString() })
                .eq("nguoi_dung_id", user.nguoi_dung_id);

              if (error) throw error;

              Alert.alert("Thành công", "Đã vô hiệu hóa tài khoản.");
              load(); // Tải lại danh sách để user biến mất
            } catch (e) {
              Alert.alert("Thất bại", e.message || "Đã có lỗi xảy ra.");
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView className="bg-black flex-1">
      <Section title="Người dùng" subtitle="Lọc theo vai trò" />
      <View className="px-5 flex-row gap-2 mb-3">
        {["all", "sinhvien", "giangvien", "quantri"].map((r) => (
          <TouchableOpacity
            key={r}
            className={`px-4 py-2 rounded-xl ${
              roleFilter === r ? "bg-indigo-600" : "bg-zinc-800"
            }`}
            onPress={() => setRoleFilter(r)}
          >
            <Text className="text-white capitalize">
              {r === "all" ? "Tất cả" : r}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <FlatList
        data={items}
        keyExtractor={(i) => i.nguoi_dung_id}
        renderItem={({ item }) => (
          <Card className="mx-5 mb-3">
            <Text className="text-white font-semibold">
              {item.ho_ten || item.nguoi_dung_id.slice(0, 8)}
            </Text>
            <Text className="text-zinc-400">Vai trò: {item.vai_tro}</Text>
            {item.ma_sinh_vien && (
              <Text className="text-zinc-500">MSV: {item.ma_sinh_vien}</Text>
            )}

            <View className="flex-row gap-2 mt-3">
              <TouchableOpacity
                className="flex-1 rounded-xl px-4 py-2 bg-zinc-800 items-center"
                onPress={() => toggleRole(item.nguoi_dung_id, item.vai_tro)}
              >
                <Text className="text-white">Đổi vai trò</Text>
              </TouchableOpacity>
              <TouchableOpacity
                className="flex-1 rounded-xl px-4 py-2 bg-blue-600 items-center"
                onPress={() => navigation.navigate("EditUser", { user: item })}
              >
                <Text className="text-white">Sửa</Text>
              </TouchableOpacity>
              <TouchableOpacity
                className="flex-1 rounded-xl px-4 py-2 bg-red-600 items-center"
                onPress={() => handleDelete(item)}
              >
                <Text className="text-white">Xóa</Text>
              </TouchableOpacity>
            </View>
          </Card>
        )}
      />
    </SafeAreaView>
  );
}
