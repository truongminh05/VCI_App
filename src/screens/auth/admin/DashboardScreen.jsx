// screens/admin/DashboardScreen.jsx
import React, { useCallback, useEffect, useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { View, Text, ActivityIndicator } from "react-native";
import Section from "../../../components/Section";
import Card from "../../../components/Card";
import { supabase } from "../../../lib/supabase";

export default function DashboardScreen() {
  const [stats, setStats] = useState({
    sv: 0,
    gv: 0,
    lop: 0,
    buoihoc: 0,
    monhoc: 0,
    diemdanh: 0,
  });
  const [loading, setLoading] = useState(false);

  // ===== Hàm load tổng quan =====
  const loadStats = useCallback(async () => {
    try {
      setLoading(true);

      const [svRes, gvRes, lopRes, buoiRes, monRes, ddRes] = await Promise.all([
        // Sinh viên
        supabase
          .from("hoso")
          .select("nguoi_dung_id", { count: "exact", head: true })
          .eq("vai_tro", "sinhvien"),

        // Giảng viên
        supabase
          .from("hoso")
          .select("nguoi_dung_id", { count: "exact", head: true })
          .eq("vai_tro", "giangvien"),

        // Lớp
        supabase.from("lop").select("id", { count: "exact", head: true }),

        // Buổi học
        supabase.from("buoihoc").select("id", { count: "exact", head: true }),
        // Môn học
        supabase.from("monhoc").select("id", { count: "exact", head: true }),

        // Bản ghi điểm danh
        supabase.from("diemdanh").select("id", { count: "exact", head: true }),
      ]);

      setStats({
        sv: svRes.count || 0,
        gv: gvRes.count || 0,
        lop: lopRes.count || 0,
        buoihoc: buoiRes.count || 0,
        monhoc: monRes.count || 0,
        diemdanh: ddRes.count || 0,
      });
    } catch (e) {
      console.error("Lỗi loadStats:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  // Lần đầu vào màn hình -> load
  useEffect(() => {
    loadStats();
  }, [loadStats]);

  // ===== Realtime: khi có dữ liệu mới thì tự động reload =====
  useEffect(() => {
    const channel = supabase
      .channel("dashboard_stats")
      // Thay đổi hồ sơ (SV / GV)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "hoso" },
        () => {
          loadStats();
        }
      )
      // Thay đổi lớp
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "lop" },
        () => {
          loadStats();
        }
      )
      // Thay đổi môn học
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "monhoc" },
        () => {
          loadStats();
        }
      )
      // Thay đổi buổi học
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "buoihoc" },
        () => {
          loadStats();
        }
      )
      // Thay đổi bản ghi điểm danh
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "diemdanh" },
        () => {
          loadStats();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadStats]);

  return (
    <SafeAreaView className="flex-1 bg-black">
      <Section
        title="Tổng quan"
        subtitle="Thống kê nhanh toàn hệ thống điểm danh"
      />

      {loading && (
        <View className="px-4 mb-2">
          <ActivityIndicator />
        </View>
      )}

      <View className="px-4 gap-3">
        <Card>
          <Text className="text-zinc-400 text-xs mb-1">Sinh viên</Text>
          <Text className="text-white text-2xl font-bold">{stats.sv}</Text>
        </Card>

        <Card>
          <Text className="text-zinc-400 text-xs mb-1">Giảng viên</Text>
          <Text className="text-white text-2xl font-bold">{stats.gv}</Text>
        </Card>

        <Card>
          <Text className="text-zinc-400 text-xs mb-1">Lớp</Text>
          <Text className="text-white text-2xl font-bold">{stats.lop}</Text>
        </Card>

        <Card>
          <Text className="text-zinc-400 text-xs mb-1">Buổi học</Text>
          <Text className="text-white text-2xl font-bold">{stats.buoihoc}</Text>
        </Card>
        <Card>
          <Text className="text-zinc-400 text-xs mb-1">Môn học</Text>
          <Text className="text-white text-2xl font-bold">{stats.monhoc}</Text>
        </Card>

        <Card>
          <Text className="text-zinc-400 text-xs mb-1">
            Tổng bản ghi điểm danh
          </Text>
          <Text className="text-white text-2xl font-bold">
            {stats.diemdanh}
          </Text>
        </Card>
      </View>
    </SafeAreaView>
  );
}
