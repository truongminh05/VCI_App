import React, { useEffect, useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  View,
  Text,
  TextInput,
  Alert,
  ScrollView,
  TouchableOpacity,
} from "react-native";
import Section from "../../../components/Section";
import Card from "../../../components/Card";
import Button from "../../../components/Button";
import { ClassPicker } from "../../../components/ClassPicker";
import { supabase } from "../../../lib/supabase";

/** SubjectPicker không dùng FlatList để tránh nested VirtualizedList */
function SubjectPicker({ value, onChange }) {
  const [list, setList] = useState([]);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("monhoc")
        .select("id, ma_mon, ten_mon")
        .order("ten_mon");
      if (!error) setList(data || []);
    })();
  }, []);

  const current = list.find((m) => m.id === value);

  return (
    <View>
      <View className="bg-zinc-800 rounded-xl px-4 py-3 mb-2">
        <Text className="text-white">
          {current ? current.ten_mon : "Chưa chọn"}
        </Text>
      </View>

      {/* Danh sách môn: dùng ScrollView thường, giới hạn chiều cao */}
      <View style={{ maxHeight: 180 }}>
        <ScrollView nestedScrollEnabled>
          {list.map((item) => (
            <TouchableOpacity key={item.id} onPress={() => onChange?.(item.id)}>
              <View className="bg-zinc-900 rounded-xl px-4 py-3 mb-2">
                <Text className="text-white">{item.ten_mon}</Text>
                <Text className="text-zinc-400">{item.ma_mon}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

export default function SessionsScreen() {
  const [lop, setLop] = useState(null);
  const [monhocId, setMonhocId] = useState(null);
  const [startAt, setStartAt] = useState(""); // ISO string
  const [endAt, setEndAt] = useState(""); // ISO string
  const [onTimeMinutes, setOnTimeMinutes] = useState("10"); // ⭐ Admin đặt phút đúng giờ
  const [lateMinutes, setLateMinutes] = useState("10"); // ⭐ Admin đặt phút trễ
  const [creating, setCreating] = useState(false);

  const createSession = async () => {
    if (!lop?.id) return Alert.alert("Thiếu", "Chọn lớp.");
    if (!startAt || !endAt)
      return Alert.alert("Thiếu", "Nhập thời gian bắt đầu/kết thúc.");

    // Kiểm tra thời gian hợp lệ
    const t1 = new Date(startAt);
    const t2 = new Date(endAt);
    if (Number.isNaN(t1.getTime()) || Number.isNaN(t2.getTime()))
      return Alert.alert("Sai", "Thời gian bắt đầu/kết thúc không hợp lệ.");
    if (t2 <= t1)
      return Alert.alert(
        "Sai",
        "Thời gian kết thúc phải sau thời gian bắt đầu."
      );

    // Kiểm tra số phút
    const ontime = parseInt(onTimeMinutes || "0", 10);
    const tre = parseInt(lateMinutes || "0", 10);
    if (!Number.isFinite(ontime) || ontime < 0)
      return Alert.alert("Sai", "Phút đúng giờ phải là số ≥ 0.");
    if (!Number.isFinite(tre) || tre < 0)
      return Alert.alert("Sai", "Phút trễ phải là số ≥ 0.");

    try {
      setCreating(true);

      // 1) Tạo buổi (ghi phút trễ vào p_tre_sau_phut)
      const startISO = new Date(startAt).toISOString();
      const endISO = new Date(endAt).toISOString();

      const { data: createdData, error: errCreate } = await supabase.rpc(
        "create_buoihoc",
        {
          p_lop_id: lop.id,
          p_thoi_gian_bat_dau: new Date(startAt).toISOString(),
          p_thoi_gian_ket_thuc: new Date(endAt).toISOString(),
          p_monhoc_id: monhocId ?? null,
          p_tre_sau_phut: Number(lateMinutes),
        }
      );
      if (errCreate) throw errCreate;

      // 2) Lấy id buổi học vừa tạo
      //    TH1: RPC trả về uuid trực tiếp
      let buoihocId =
        typeof createdData === "string" ? createdData : createdData?.id || null;

      //    TH2: nếu RPC không trả về id -> dò theo key tự nhiên (tránh giả sử; vẫn an toàn vì filter chặt)
      if (!buoihocId) {
        const { data: found, error: errFind } = await supabase
          .from("buoihoc")
          .select("id")
          .eq("lop_id", lop.id)
          .eq("thoi_gian_bat_dau", startISO)
          .eq("thoi_gian_ket_thuc", endISO)
          .maybeSingle();
        if (errFind || !found)
          throw new Error("Không tìm thấy buổi học vừa tạo.");
        buoihocId = found.id;
      }

      // 3) Tính mốc mo_tu & dong_den theo quyết định của Admin
      const t0 = new Date(startISO).getTime();
      const mo_tuISO = new Date(t0 + ontime * 60000).toISOString();
      const dong_denISO = new Date(t0 + (ontime + tre) * 60000).toISOString();

      // 4) Cập nhật buoihoc: mo_tu, dong_den
      const { error: errUpdate } = await supabase
        .from("buoihoc")
        .update({ mo_tu: mo_tuISO, dong_den: dong_denISO })
        .eq("id", buoihocId);
      if (errUpdate) throw errUpdate;

      Alert.alert("OK", "Đã tạo buổi học.");

      // Reset form
      setMonhocId(null);
      setStartAt("");
      setEndAt("");
      setOnTimeMinutes("10");
      setLateMinutes("10");
    } catch (e) {
      Alert.alert("Lỗi tạo buổi học", e?.message || String(e));
    } finally {
      setCreating(false);
    }
  };

  return (
    <SafeAreaView className="bg-black flex-1">
      {/* Dùng một ScrollView ngoài cho toàn màn hình */}
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 50 }}
        keyboardShouldPersistTaps="handled"
      >
        <Section
          title="Tạo buổi học"
          subtitle="Nhập thời gian & quy định đúng/trễ"
        />
        <View className="px-5">
          <Card>
            <Text className="text-zinc-400 mb-2">Lớp</Text>
            <ClassPicker value={lop} onChange={setLop} />

            <Text className="text-zinc-400 mt-3 mb-2">Môn học</Text>
            <SubjectPicker value={monhocId} onChange={setMonhocId} />

            <Text className="text-zinc-400 mt-3 mb-2">Bắt đầu (ISO)</Text>
            <TextInput
              className="bg-zinc-800 rounded-xl px-4 py-3 text-white"
              placeholder="2025-01-01T08:00:00+07:00"
              placeholderTextColor="#9ca3af"
              value={startAt}
              onChangeText={setStartAt}
              autoCapitalize="none"
            />

            <Text className="text-zinc-400 mt-3 mb-2">Kết thúc (ISO)</Text>
            <TextInput
              className="bg-zinc-800 rounded-xl px-4 py-3 text-white"
              placeholder="2025-01-01T10:00:00+07:00"
              placeholderTextColor="#9ca3af"
              value={endAt}
              onChangeText={setEndAt}
              autoCapitalize="none"
            />

            <Text className="text-zinc-400 mt-3 mb-2">Phút đúng giờ</Text>
            <TextInput
              className="bg-zinc-800 rounded-xl px-4 py-3 text-white"
              placeholder="10"
              placeholderTextColor="#9ca3af"
              keyboardType="numeric"
              value={onTimeMinutes}
              onChangeText={setOnTimeMinutes}
            />

            <Text className="text-zinc-400 mt-3 mb-2">Phút trễ</Text>
            <TextInput
              className="bg-zinc-800 rounded-xl px-4 py-3 text-white"
              placeholder="10"
              placeholderTextColor="#9ca3af"
              keyboardType="numeric"
              value={lateMinutes}
              onChangeText={setLateMinutes}
            />

            <Button
              className="mt-4"
              title={creating ? "Đang tạo..." : "Tạo buổi học"}
              onPress={createSession}
              disabled={creating}
            />
          </Card>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
