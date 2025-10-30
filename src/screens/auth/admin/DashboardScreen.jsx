import React, { useEffect, useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import Section from "../../../components/Section";
import { View, Text } from "react-native";
import Card from "../../../components/Card";
import { supabase } from "../../../lib/supabase";

export default function DashboardScreen() {
  const [stats, setStats] = useState({
    sv: 0,
    gv: 0,
    lop: 0,
    buoihoc: 0,
    diemdanh: 0,
  });

  useEffect(() => {
    (async () => {
      const sv = await supabase
        .from("hoso")
        .select("nguoi_dung_id", { count: "exact", head: true })
        .eq("vai_tro", "sinhvien");
      const gv = await supabase
        .from("hoso")
        .select("nguoi_dung_id", { count: "exact", head: true })
        .eq("vai_tro", "giangvien");
      const lop = await supabase
        .from("lop")
        .select("id", { count: "exact", head: true });
      const bh = await supabase
        .from("buoihoc")
        .select("id", { count: "exact", head: true });
      const dd = await supabase
        .from("diemdanh")
        .select("id", { count: "exact", head: true });
      setStats({
        sv: sv.count || 0,
        gv: gv.count || 0,
        lop: lop.count || 0,
        buoihoc: bh.count || 0,
        diemdanh: dd.count || 0,
      });
    })();
  }, []);

  return (
    <SafeAreaView className="bg-black flex-1">
      <Section title="Bảng điều khiển" subtitle="Số liệu nhanh" />
      <View className="px-5 gap-3">
        <Card>
          <Text className="text-white">Sinh viên: {stats.sv}</Text>
        </Card>
        <Card>
          <Text className="text-white">Giảng viên: {stats.gv}</Text>
        </Card>
        <Card>
          <Text className="text-white">Lớp: {stats.lop}</Text>
        </Card>
        <Card>
          <Text className="text-white">Buổi học: {stats.buoihoc}</Text>
        </Card>
        <Card>
          <Text className="text-white">
            Bản ghi điểm danh: {stats.diemdanh}
          </Text>
        </Card>
      </View>
    </SafeAreaView>
  );
}
