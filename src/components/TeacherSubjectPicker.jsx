// components/TeacherSubjectPicker.jsx
import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  FlatList,
  TextInput,
  Alert,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";

export function TeacherSubjectPicker({ value, onChange, label = "Môn học" }) {
  const { user, role } = useAuth();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");

  // nạp danh sách môn được phân công từ bảng giangday
  useEffect(() => {
    if (!user?.id || role !== "giangvien") {
      setRows([]);
      return;
    }
    (async () => {
      try {
        const { data, error } = await supabase
          .from("giangday")
          .select(
            `
            mon:monhoc_id (
              id,
              ma_mon,
              ten_mon
            )
          `
          )
          .eq("giang_vien_id", user.id);

        if (error) throw error;
        const list = (data || []).map((row) => row.mon).filter(Boolean);

        // unique theo id
        const map = new Map();
        list.forEach((m) => {
          if (m?.id && !map.has(m.id)) map.set(m.id, m);
        });
        setRows(Array.from(map.values()));
      } catch (e) {
        console.warn("TeacherSubjectPicker error", e);
        Alert.alert("Lỗi", "Không tải được danh sách môn được phân công.");
      }
    })();
  }, [user?.id, role]);

  const filtered = useMemo(() => {
    if (!q.trim()) return rows;
    const kw = q.toLowerCase();
    return rows.filter(
      (m) =>
        (m.ten_mon || "").toLowerCase().includes(kw) ||
        (m.ma_mon || "").toLowerCase().includes(kw)
    );
  }, [rows, q]);

  const current =
    rows.find((m) => m.id === value || m.id === value?.id) || null;

  return (
    <>
      {label ? (
        <Text className="text-zinc-400 text-xs mb-1">{label}</Text>
      ) : null}
      <TouchableOpacity
        onPress={() => setOpen(true)}
        className="bg-zinc-900 rounded-xl px-3 py-2 border border-zinc-700 flex-row items-center justify-between"
      >
        <Text className="text-white">
          {current
            ? `${current.ten_mon} (${current.ma_mon})`
            : "Chọn môn được phân công"}
        </Text>
        <Ionicons name="chevron-down-outline" size={16} color="#a1a1aa" />
      </TouchableOpacity>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <View className="flex-1 bg-black/60 justify-center items-center">
          <View className="bg-zinc-900 w-80 max-h-[420px] rounded-2xl p-4">
            <Text className="text-white font-semibold mb-2">
              Chọn môn được phân công
            </Text>
            <TextInput
              className="bg-zinc-800 rounded-xl px-3 py-2 text-white mb-3"
              placeholder="Tìm theo tên / mã môn"
              placeholderTextColor="#71717a"
              value={q}
              onChangeText={setQ}
            />
            <FlatList
              data={filtered}
              keyExtractor={(item) => item.id}
              style={{ maxHeight: 260 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  onPress={() => {
                    onChange?.(item.id);
                    setOpen(false);
                  }}
                  className="py-2"
                >
                  <Text className="text-white text-sm">{item.ten_mon}</Text>
                  <Text className="text-zinc-500 text-xs">{item.ma_mon}</Text>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <Text className="text-zinc-500 text-sm py-4">
                  Chưa có môn được phân công.
                </Text>
              }
            />
            <TouchableOpacity
              onPress={() => setOpen(false)}
              className="py-3 mt-1"
            >
              <Text className="text-indigo-400 text-center">Đóng</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}
