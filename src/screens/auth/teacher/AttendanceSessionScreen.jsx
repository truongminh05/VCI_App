import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { View, Text, Alert } from "react-native";
import QRCode from "react-native-qrcode-svg";
import Card from "../../../components/Card";
import { supabase } from "../../../lib/supabase";
import { computeWindowStatus } from "../../../utils/attendanceWindow";

function fmt(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return String(iso);
  }
}

export default function AttendanceSessionScreen({ route }) {
  const buoihoc_id = route?.params?.buoihoc_id;
  const [info, setInfo] = useState(null);
  const [payload, setPayload] = useState(null); // { sid, slot, sig, phase }
  const [status, setStatus] = useState("idle"); // idle|running|closed|ended|invalid
  const [tick, setTick] = useState(0);
  const tickRef = useRef(null);
  const pollRef = useRef(null);

  // Load buổi học
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

  // Tick mỗi giây
  useEffect(() => {
    tickRef.current = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(tickRef.current);
  }, []);

  const ended = useMemo(() => {
    if (!info?.thoi_gian_ket_thuc) return false;
    return Date.now() > new Date(info.thoi_gian_ket_thuc).getTime();
  }, [info, tick]);

  // Rút onTimeMin & lateMin từ dữ liệu Admin đã lưu
  const onTimeMin = useMemo(() => {
    if (!info?.thoi_gian_bat_dau || !info?.mo_tu) return null;
    const start = new Date(info.thoi_gian_bat_dau).getTime();
    const moTu = new Date(info.mo_tu).getTime();
    const diff = Math.round((moTu - start) / 60000);
    return diff >= 0 ? diff : null;
  }, [info]);

  const lateMin = useMemo(() => {
    if (Number.isFinite(info?.tre_sau_phut)) return info.tre_sau_phut;
    if (info?.dong_den && info?.mo_tu) {
      const dd = new Date(info.dong_den).getTime();
      const mt = new Date(info.mo_tu).getTime();
      const diff = Math.round((dd - mt) / 60000);
      return diff >= 0 ? diff : null;
    }
    return null;
  }, [info]);

  const phaseObj = useMemo(() => {
    if (!info) return { phase: "before" };
    return computeWindowStatus(
      {
        startISO: info.thoi_gian_bat_dau,
        onTimeMin,
        lateMin,
      },
      Date.now()
    );
  }, [info, onTimeMin, lateMin, tick]);
  const phase = phaseObj.phase;

  const runSignQr = useCallback(async () => {
    if (!info) return;

    if (ended) {
      setStatus("ended");
      setPayload(null);
      return;
    }

    // nếu thiếu cấu hình hoặc chưa đến giờ / đã hết giờ
    if (
      !Number.isFinite(onTimeMin) ||
      !Number.isFinite(lateMin) ||
      phase === "before" ||
      phase === "closed"
    ) {
      setStatus(
        phase === "before" ? "idle" : phase === "closed" ? "closed" : "invalid"
      );
      setPayload(null);
      return;
    }

    setStatus("running");
    const period = info.qr_khoang_giay || 20;
    const slot = Math.floor(Date.now() / 1000 / period);

    const { data, error } = await supabase.rpc("sign_qr", {
      p_buoihoc_id: info.id,
      p_slot: slot,
    });
    if (error) {
      console.log("sign_qr error", error);
      setPayload(null);
      return;
    }

    if (data?.ok) {
      setPayload({ sid: data.sid, slot: data.slot, sig: data.sig, phase }); // "ontime" | "late"
    } else {
      console.log("sign_qr not ok", data);
      setPayload(null);
      setStatus(data?.error === "WINDOW_CLOSED" ? "closed" : "idle");
    }
  }, [info, ended, onTimeMin, lateMin, phase]);

  useEffect(() => {
    if (!info) return;
    runSignQr();
    if (pollRef.current) clearInterval(pollRef.current);
    const period = info.qr_khoang_giay || 20;
    pollRef.current = setInterval(runSignQr, period * 1000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [info, runSignQr]);

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
                Đúng giờ: {fmt(info.thoi_gian_bat_dau)} → {fmt(info.mo_tu)} (
                {onTimeMin ?? "—"}’)
              </Text>
              <Text className="text-zinc-400">
                Trễ: {fmt(info.mo_tu)} → {fmt(info.dong_den)} ({lateMin ?? "—"}
                ’)
              </Text>
              <Text className="text-zinc-400 mt-2">
                {phase === "before" && "⏳ Chưa đến giờ mở QR"}
                {phase === "ontime" &&
                  `✅ Đúng giờ (đến ${fmt(phaseObj.onEnd)})`}
                {phase === "late" &&
                  `⚠️ Trễ giờ (đến ${fmt(phaseObj.lateEnd)})`}
                {phase === "closed" && "❌ Đã đóng điểm danh"}
                {phase === "invalid" && "⚠️ Thiếu cấu hình thời gian"}
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
              Cửa điểm danh đã đóng.
            </Text>
          ) : status === "invalid" ? (
            <Text className="text-yellow-400">
              Thiếu cấu hình (mo_tu/dong_den/tre_sau_phut).
            </Text>
          ) : payload ? (
            <View style={{ alignItems: "center" }}>
              <QRCode
                size={240}
                value={JSON.stringify(payload)}
                quietZone={12}
              />
              <Text className="text-zinc-400 mt-3">
                {phase === "ontime" ? "Đang ở pha ĐÚNG GIỜ" : "Đang ở pha TRỄ"}{" "}
                · đổi mỗi {info?.qr_khoang_giay || 20}s — slot: {payload.slot}
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
