import React, { useEffect, useMemo, useState, useCallback } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from "react-native";
import Section from "../../components/Section";
import Card from "../../components/Card";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";

function startOfTodayISO() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}
function endOfNDaysISO(n = 30) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
}

export default function ScheduleScreen() {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fromISO = useMemo(() => startOfTodayISO(), []);
  const toISO = useMemo(() => endOfNDaysISO(30), []);

  const mapRpc = (data) =>
    (data ?? []).map((r) => ({
      id: r.buoihoc_id,
      start: r.thoi_gian_bat_dau,
      end: r.thoi_gian_ket_thuc,
      tenMon: r.ten_mon ?? "",
      maMon: r.ma_mon ?? "",
      tenLop: r.ten_lop ?? "",
    }));

  const mapDirect = (data) =>
    (data ?? []).map((b) => ({
      id: b.id,
      start: b.thoi_gian_bat_dau,
      end: b.thoi_gian_ket_thuc,
      tenMon: b?.monhoc?.ten_mon ?? "",
      maMon: b?.monhoc?.ma_mon ?? "",
      tenLop: b?.lop?.ten_lop ?? "",
    }));

  const loadViaRpc = async () => {
    // Ưu tiên RPC nếu có
    const { data, error } = await supabase.rpc("get_my_schedule", {
      p_from: fromISO,
      p_to: toISO,
    });
    if (error) {
      // Nếu function chưa tồn tại → trả về null để fallback
      if (["PGRST202", "42883"].includes(error.code)) return null;
      throw error;
    }
    return mapRpc(data);
  };

  const loadViaDirect = async () => {
    // 1) Lấy lớp đã đăng ký của SV
    const { data: enrolls, error: e1 } = await supabase
      .from("dangky")
      .select("lop_id")
      .eq("sinh_vien_id", user.id); // cần policy dangky_select_self
    if (e1) throw e1;

    const lopIds = (enrolls ?? []).map((x) => x.lop_id);
    if (lopIds.length === 0) return [];

    // 2) Lấy buổi học + join môn/lớp (cần RLS đúng cho buoihoc/monhoc/lop)
    const { data, error: e2 } = await supabase
      .from("buoihoc")
      .select(
        `
        id,
        lop_id,
        monhoc_id,
        thoi_gian_bat_dau,
        thoi_gian_ket_thuc,
        monhoc:monhoc_id ( ten_mon, ma_mon ),
        lop:lop_id ( ten_lop )
      `
      )
      .in("lop_id", lopIds)
      .gte("thoi_gian_bat_dau", fromISO)
      .lte("thoi_gian_bat_dau", toISO)
      .order("thoi_gian_bat_dau", { ascending: true });
    if (e2) throw e2;

    return mapDirect(data);
  };

  const load = useCallback(async () => {
    try {
      setLoading(true);

      // 1) thử RPC
      let items = await loadViaRpc();
      // 2) fallback nếu RPC chưa có
      if (items === null) {
        items = await loadViaDirect();
      }
      setRows(items || []);
    } catch (err) {
      console.log("Schedule load error:", err);
      Alert.alert("Lỗi lịch học", err.message || String(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id, fromISO, toISO]);

  useEffect(() => {
    if (user?.id) load();
  }, [user?.id, load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  return (
    <SafeAreaView className="bg-black flex-1">
      <Section title="Lịch học" subtitle="Từ hôm nay đến 30 ngày tới" />

      {loading ? (
        <View style={{ padding: 16 }}>
          <ActivityIndicator />
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(it) => it.id}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          contentContainerStyle={{ padding: 12 }}
          ListEmptyComponent={
            <View style={{ padding: 24, alignItems: "center" }}>
              <Text className="text-zinc-400">
                Chưa có buổi học trong khoảng thời gian này.
              </Text>
              <Text
                className="text-zinc-500"
                style={{ marginTop: 6, textAlign: "center" }}
              >
                Kiểm tra: đã có buổi cho lớp bạn ghi danh và RLS/ RPC đã cấu
                hình đúng.
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const start = new Date(item.start);
            const end = new Date(item.end);
            return (
              <Card className="mb-3">
                <Text className="text-white text-lg font-semibold">
                  {item.tenMon || "(Chưa có tên môn)"}
                  {item.maMon ? ` · ${item.maMon}` : ""}
                </Text>
                <Text className="text-zinc-400">{item.tenLop || ""}</Text>
                <Text className="text-zinc-400" style={{ marginTop: 6 }}>
                  {start.toLocaleString()} → {end.toLocaleTimeString()}
                </Text>
              </Card>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}
