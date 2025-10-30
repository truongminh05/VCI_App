import React, { useEffect, useMemo, useRef, useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { View, Text, Alert } from "react-native";
import QRCode from "react-native-qrcode-svg";
import Card from "../../../components/Card";
import { supabase } from "../../../lib/supabase";

function fmt(iso) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso ?? "";
  }
}

export default function AttendanceSessionScreen({ route }) {
  const buoihoc_id = route?.params?.buoihoc_id;
  const [info, setInfo] = useState(null); // buổi học
  const [payload, setPayload] = useState(null); // {sid, slot, sig}
  const [status, setStatus] = useState("idle"); // idle|running|closed|ended
  const tickRef = useRef(null);
  const [tick, setTick] = useState(0);

  // 1) Load thông tin buổi học
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("buoihoc")
        .select(
          "id, thoi_gian_bat_dau, thoi_gian_ket_thuc, mo_tu, dong_den, tre_sau_phut, qr_khoang_giay"
        )
        .eq("id", buoihoc_id)
        .maybeSingle();
      if (error) return Alert.alert("Lỗi", error.message);
      setInfo(data);
    })();
  }, [buoihoc_id]);

  // 2) Tick mỗi giây để kiểm tra thời gian
  useEffect(() => {
    tickRef.current = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(tickRef.current);
  }, []);

  const now = new Date();

  const inLateWindow = useMemo(() => {
    if (!info) return false;
    return now >= new Date(info.mo_tu) && now <= new Date(info.dong_den);
  }, [info, tick]);

  const ended = useMemo(() => {
    if (!info) return false;
    return now > new Date(info.thoi_gian_ket_thuc);
  }, [info, tick]);

  // 3) Lấy QR khi cần
  useEffect(() => {
    if (!info) return;

    const run = async () => {
      if (ended) {
        setStatus("ended");
        setPayload(null);
        return;
      }
      if (!inLateWindow) {
        setStatus("closed");
        setPayload(null);
        return;
      }

      setStatus("running");

      // Tính slot theo khoảng thời gian QR
      const period = info.qr_khoang_giay || 20;
      const slot = Math.floor(Date.now() / 1000 / period);

      // ✅ GỌI RPC (bạn đã bỏ mất đoạn này)
      const { data, error } = await supabase.rpc("sign_qr", {
        p_buoihoc_id: info.id,
        p_slot: slot,
      });

      if (error) {
        console.log("sign_qr error", error);
        // Giữ status nhưng không set payload để màn vẫn “Đang chờ…”
        return;
      }

      if (data?.ok) {
        setPayload({ sid: data.sid, slot: data.slot, sig: data.sig });
      } else {
        // SERVER trả về WINDOW_CLOSED / SESSION_NOT_FOUND / v.v.
        console.log("sign_qr not ok", data);
        setPayload(null);
        setStatus(data?.error === "WINDOW_CLOSED" ? "closed" : "idle");
      }
    };

    // gọi ngay lần đầu
    run();

    // gọi lặp theo chu kỳ QR
    const iv = setInterval(run, (info.qr_khoang_giay || 20) * 1000);
    return () => clearInterval(iv);
  }, [info, inLateWindow, ended]);

  return (
    <SafeAreaView className="bg-black flex-1">
      <View className="px-5 py-4">
        <Card>
          <Text className="text-white text-lg font-semibold mb-2">
            Phiên điểm danh
          </Text>

          {info && (
            <>
              <Text className="text-zinc-400">
                Bắt đầu: {fmt(info.thoi_gian_bat_dau)}
              </Text>
              <Text className="text-zinc-400">
                Kết thúc: {fmt(info.thoi_gian_ket_thuc)}
              </Text>
              <Text className="text-zinc-400">
                Cửa QR: {fmt(info.mo_tu)} → {fmt(info.dong_den)} (trễ{" "}
                {info.tre_sau_phut}’)
              </Text>
            </>
          )}

          <View style={{ height: 16 }} />

          {ended ? (
            <Text className="text-red-400 font-semibold">
              Buổi học đã kết thúc.
            </Text>
          ) : status === "closed" ? (
            <Text className="text-yellow-400 font-semibold">
              Cửa điểm danh đã đóng (hết thời gian trễ).
            </Text>
          ) : payload ? (
            <View style={{ alignItems: "center" }}>
              <QRCode
                size={240}
                value={JSON.stringify(payload)}
                quietZone={12}
              />
              <Text className="text-zinc-400 mt-3">
                QR đổi mỗi {info?.qr_khoang_giay || 20}s — slot: {payload.slot}
              </Text>
            </View>
          ) : (
            <Text className="text-zinc-400">Đang chờ…</Text>
          )}
        </Card>
      </View>
    </SafeAreaView>
  );
}
