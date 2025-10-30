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

export function ClassPicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async (keyword = "") => {
    setLoading(true);
    try {
      // SỬA LỖI: Bỏ phần join với môn học vì lớp không còn liên kết trực tiếp
      let qy = supabase
        .from("lop")
        .select("id, ten_lop") // <-- Chỉ lấy id và tên lớp
        .order("ten_lop", { ascending: true });

      if (keyword.trim()) qy = qy.ilike("ten_lop", `%${keyword.trim()}%`);
      else qy = qy.limit(20);

      const { data, error } = await qy;
      if (error) throw error;
      setRows(data ?? []);
    } catch (e) {
      Alert.alert("Lỗi tải lớp", e.message);
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
        <Text className="text-white">{value ? value.ten_lop : "Chọn lớp"}</Text>
      </TouchableOpacity>

      <Modal
        visible={open}
        animationType="slide"
        onRequestClose={() => setOpen(false)}
      >
        <View className="flex-1 bg-black px-5 pt-6">
          <Text className="text-white text-lg font-semibold mb-3">
            Chọn lớp
          </Text>
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Nhập tên lớp…"
            placeholderTextColor="#9ca3af"
            className="bg-zinc-800 rounded-xl px-4 py-3 text-white mb-3"
            autoFocus
          />
          <FlatList
            data={rows}
            keyExtractor={(i) => i.id}
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
                <Text className="text-white font-medium">{item.ten_lop}</Text>
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
