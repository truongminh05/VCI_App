import React, { useEffect, useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import Section from "../../components/Section";
import Card from "../../components/Card";
import { View, Text, FlatList } from "react-native";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import { toIsoDate } from "../../utils/time";

export default function ScheduleScreen() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      // Lấy các buổi học hôm nay mà SV được đăng ký (RLS đã che chắn)
      const today = toIsoDate(new Date());
      const { data, error } = await supabase
        .from("buoihoc")
        .select(
          `
          id, thoi_gian_bat_dau, thoi_gian_ket_thuc,
          lop:lop_id ( id, ten_lop, monhoc:monhoc_id ( ten_mon ) ),
          phonghoc_id
        `
        )
        .gte("thoi_gian_bat_dau", `${today}T00:00:00+00:00`)
        .lte("thoi_gian_ket_thuc", `${today}T23:59:59+00:00`)
        .order("thoi_gian_bat_dau", { ascending: true });

      if (!active) return;
      if (error) {
        console.log(error);
        setItems([]);
      } else {
        setItems(data || []);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [user?.id]);

  return (
    <SafeAreaView className="bg-black flex-1">
      <Section title="Lịch học hôm nay" subtitle={`Ngày: ${toIsoDate()}`} />
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        renderItem={({ item }) => {
          const start = new Date(item.thoi_gian_bat_dau);
          const end = new Date(item.thoi_gian_ket_thuc);
          return (
            <Card className="mx-5 mb-3">
              <Text className="text-white text-lg font-medium">
                {item?.lop?.monhoc?.ten_mon || "Môn học"}
              </Text>
              <Text className="text-zinc-400">{item?.lop?.ten_lop}</Text>
              <View className="flex-row justify-between mt-2">
                <Text className="text-indigo-400">
                  {start.toLocaleTimeString().slice(0, 5)} -{" "}
                  {end.toLocaleTimeString().slice(0, 5)}
                </Text>
                <Text className="text-zinc-400">
                  Phòng: {item.phonghoc_id || "?"}
                </Text>
              </View>
            </Card>
          );
        }}
      />
    </SafeAreaView>
  );
}
