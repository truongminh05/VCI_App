import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  Modal,
  TouchableOpacity,
  Alert,
} from "react-native";
import { supabase } from "../lib/supabase";

// Đảm bảo component được export với từ khóa 'export function'
export function TeacherPicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async (keyword = "") => {
    setLoading(true);
    try {
      let qy = supabase
        .from("hoso")
        .select("nguoi_dung_id, ho_ten")
        .eq("vai_tro", "giangvien")
        .is("da_vo_hieu_hoa_luc", null) // Chỉ lấy GV đang hoạt động
        .order("ho_ten", { ascending: true });

      if (keyword.trim()) {
        qy = qy.ilike("ho_ten", `%${keyword.trim()}%`);
      } else {
        qy = qy.limit(20);
      }

      const { data, error } = await qy;
      if (error) throw error;
      setRows(data ?? []);
    } catch (e) {
      Alert.alert("Lỗi tải danh sách giảng viên", e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      fetchData("");
    }
  }, [open, fetchData]);

  useEffect(() => {
    if (open) {
      const t = setTimeout(() => fetchData(q), 300);
      return () => clearTimeout(t);
    }
  }, [q, open, fetchData]);

  return (
    <>
      <TouchableOpacity
        onPress={() => setOpen(true)}
        className="bg-zinc-800 rounded-xl px-4 py-3"
      >
        <Text className="text-white">
          {value ? value.ho_ten : "Chọn giảng viên"}
        </Text>
      </TouchableOpacity>

      <Modal
        visible={open}
        animationType="slide"
        onRequestClose={() => setOpen(false)}
      >
        <View className="flex-1 bg-black px-5 pt-6">
          <Text className="text-white text-lg font-semibold mb-3">
            Chọn giảng viên
          </Text>
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Nhập tên giảng viên…"
            placeholderTextColor="#9ca3af"
            className="bg-zinc-800 rounded-xl px-4 py-3 text-white mb-3"
            autoFocus
          />
          <FlatList
            data={rows}
            keyExtractor={(i) => i.nguoi_dung_id}
            refreshing={loading}
            onRefresh={() => fetchData(q)}
            renderItem={({ item }) => (
              <TouchableOpacity
                className="bg-zinc-900 rounded-xl px-4 py-3 mb-2"
                onPress={() => {
                  onChange?.(item);
                  setOpen(false);
                }}
              >
                <Text className="text-white font-medium">{item.ho_ten}</Text>
              </TouchableOpacity>
            )}
          />
          <TouchableOpacity onPress={() => setOpen(false)} className="py-3">
            <Text className="text-indigo-400 text-center">Đóng</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </>
  );
}
