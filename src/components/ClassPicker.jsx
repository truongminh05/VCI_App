// components/ClassPicker.jsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  Modal,
  TouchableOpacity,
  Alert,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";

/**
 * ClassPicker
 *
 * - GIẢNG VIÊN:
 *    Chỉ thấy các lớp có buổi học mà:
 *      + buổi đó do mình dạy (giang_vien_id = auth.uid() hoặc tao_boi = auth.uid())
 *      + buổi đó có môn nằm trong danh sách môn được phân công (giangday).
 *
 * - Các role khác (admin, sinh viên...):
 *    Thấy toàn bộ lớp (bảng lop).
 */
export function ClassPicker({ value, onChange }) {
  const { user, role } = useAuth();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);

  const loadClassesForTeacher = useCallback(async () => {
    if (!user?.id) return;

    // 1) Lấy danh sách môn mà giảng viên được phân công
    const { data: monData, error: monError } = await supabase
      .from("giangday")
      .select("monhoc_id")
      .eq("giang_vien_id", user.id);

    if (monError) throw monError;

    const monIds = (monData || []).map((r) => r.monhoc_id).filter(Boolean);

    if (!monIds.length) {
      // Chưa được phân công môn nào -> không có lớp nào hiển thị
      setRows([]);
      return;
    }

    // 2) Lấy buổi học thỏa:
    //    - giang_vien_id = user.id HOẶC tao_boi = user.id
    //    - monhoc_id thuộc danh sách monIds
    const { data: buoiData, error: buoiError } = await supabase
      .from("buoihoc")
      .select(
        `
        lop:lop_id (
          id,
          ten_lop,
          ma_lop
        ),
        monhoc_id,
        giang_vien_id,
        tao_boi
      `
      )
      .or(`giang_vien_id.eq.${user.id},tao_boi.eq.${user.id}`)
      .in("monhoc_id", monIds)
      .limit(300);

    if (buoiError) throw buoiError;

    const map = new Map();
    (buoiData || []).forEach((b) => {
      const lop = b.lop;
      if (lop?.id && !map.has(lop.id)) {
        map.set(lop.id, lop);
      }
    });

    setRows(Array.from(map.values()));
  }, [user?.id]);

  const loadClasses = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      if (role === "giangvien") {
        await loadClassesForTeacher();
      } else {
        // Admin / role khác -> toàn bộ lớp
        const { data, error } = await supabase
          .from("lop")
          .select("id, ten_lop, ma_lop")
          .order("ten_lop", { ascending: true })
          .limit(300);
        if (error) throw error;
        setRows(data || []);
      }
    } catch (e) {
      console.warn("ClassPicker load error", e);
      Alert.alert("Lỗi", "Không tải được danh sách lớp.");
    } finally {
      setLoading(false);
    }
  }, [user, role, loadClassesForTeacher]);

  // Chỉ load khi mở modal để tránh query thừa
  useEffect(() => {
    if (open) {
      loadClasses();
    }
  }, [open, loadClasses]);

  const filtered = useMemo(() => {
    if (!q.trim()) return rows;
    const kw = q.toLowerCase();
    return rows.filter(
      (lop) =>
        (lop.ten_lop || "").toLowerCase().includes(kw) ||
        (lop.ma_lop || "").toLowerCase().includes(kw)
    );
  }, [rows, q]);

  const current =
    rows.find((x) => x.id === value?.id || x.id === value) || value || null;

  return (
    <>
      {/* Ô hiển thị lớp hiện tại */}
      <TouchableOpacity
        onPress={() => setOpen(true)}
        className="bg-zinc-900 rounded-xl px-3 py-2 border border-zinc-700 flex-row items-center justify-between"
      >
        <Text className="text-white">
          {current?.ten_lop
            ? current.ma_lop
              ? `${current.ten_lop} (${current.ma_lop})`
              : current.ten_lop
            : role === "giangvien"
            ? "Chọn lớp có buổi bạn dạy"
            : "Chọn lớp"}
        </Text>
        <Ionicons name="chevron-down-outline" size={16} color="#a1a1aa" />
      </TouchableOpacity>

      {/* Modal chọn lớp */}
      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <View className="flex-1 bg-black/60 justify-center items-center">
          <View className="bg-zinc-900 w-80 max-h-[460px] rounded-2xl p-4">
            <Text className="text-white font-semibold mb-2">Chọn lớp</Text>

            <TextInput
              className="bg-zinc-800 rounded-xl px-3 py-2 text-white mb-3"
              placeholder="Tìm theo tên / mã lớp"
              placeholderTextColor="#71717a"
              value={q}
              onChangeText={setQ}
            />

            {loading ? (
              <View className="py-6 items-center">
                <Text className="text-zinc-400 text-sm">
                  Đang tải danh sách lớp...
                </Text>
              </View>
            ) : (
              <FlatList
                data={filtered}
                keyExtractor={(item) => item.id}
                style={{ maxHeight: 320 }}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    className="py-2 border-b border-zinc-800"
                    onPress={() => {
                      onChange?.(item);
                      setOpen(false);
                    }}
                  >
                    <Text className="text-white text-sm">{item.ten_lop}</Text>
                    {item.ma_lop ? (
                      <Text className="text-zinc-500 text-xs">
                        {item.ma_lop}
                      </Text>
                    ) : null}
                  </TouchableOpacity>
                )}
                ListEmptyComponent={
                  <Text className="text-zinc-500 text-sm py-4">
                    {role === "giangvien"
                      ? "Chưa có lớp nào có buổi học với môn bạn được phân công."
                      : "Không có lớp nào."}
                  </Text>
                }
              />
            )}

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
