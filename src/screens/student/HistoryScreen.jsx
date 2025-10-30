import React, { useEffect, useState } from "react";
import { FlatList, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Section from "../../components/Section";
import Card from "../../components/Card";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";

export default function HistoryScreen() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      // RLS: SV chỉ xem được bản ghi của mình
      const { data, error } = await supabase
        .from("diemdanh")
        .select("id, buoihoc_id, trang_thai, checkin_luc")
        .eq("sinh_vien_id", user.id)
        .order("checkin_luc", { ascending: false });
      if (!mounted) return;
      if (error) setItems([]);
      else setItems(data || []);
    };
    load();
    return () => {
      mounted = false;
    };
  }, [user?.id]);

  return (
    <SafeAreaView className="bg-black flex-1">
      <Section
        title="Lịch sử điểm danh"
        subtitle={`Tổng: ${items.length} bản ghi`}
      />
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        renderItem={({ item }) => (
          <Card className="mx-5 mb-3">
            <Text className="text-white font-medium">
              Buổi học: {item.buoihoc_id.slice(0, 8)}...
            </Text>
            <Text className="text-zinc-400">Trạng thái: {item.trang_thai}</Text>
            <Text className="text-zinc-500">
              {new Date(item.checkin_luc).toLocaleString()}
            </Text>
          </Card>
        )}
      />
    </SafeAreaView>
  );
}
