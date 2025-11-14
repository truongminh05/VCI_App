// screens/attendance/AttendanceSessionScreen.jsx
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  View,
  Text,
  Alert,
  Modal,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import QRCode from "react-native-qrcode-svg";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import Card from "../../../components/Card";
import Button from "../../../components/Button";
import { supabase } from "../../../lib/supabase";

/* ---------- utils ---------- */
function fmt(iso) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso ?? "";
  }
}

/** gate: "before" | "open" | "closed"; sub: "ontime" | "late" */
function computePhase(info, nowMs) {
  if (!info) return { gate: "before" };
  const start = new Date(info.thoi_gian_bat_dau).getTime();
  const onEnd = start + Number(info.dung_gio_trong_phut || 0) * 60000;
  const windowStart = new Date(info.mo_tu || info.thoi_gian_bat_dau).getTime();
  const windowEnd = info.dong_den
    ? new Date(info.dong_den).getTime()
    : onEnd + Number(info.tre_sau_phut || 0) * 60000;

  if (nowMs < windowStart) return { gate: "before" };
  if (nowMs > windowEnd || nowMs > new Date(info.thoi_gian_ket_thuc).getTime())
    return { gate: "closed" };

  const sub = nowMs < onEnd ? "ontime" : "late";
  return { gate: "open", sub };
}

export default function AttendanceSessionScreen({ route }) {
  /* ===== session states ===== */
  const initialSid = route?.params?.buoihoc_id ?? null;
  const [sid, setSid] = useState(initialSid);
  const [info, setInfo] = useState(null);
  const [payload, setPayload] = useState(null);
  const [status, setStatus] = useState("idle");
  const [tick, setTick] = useState(0);
  const tickRef = useRef(null);

  /* ===== pick class/session ===== */
  const [classes, setClasses] = useState([]); // [{id, ten_lop}]
  const [sessions, setSessions] = useState([]);
  const [selectedClass, setSelectedClass] = useState(null);
  const [showSessionModal, setShowSessionModal] = useState(false);
  const [showClassModal, setShowClassModal] = useState(false);
  const [loadingClasses, setLoadingClasses] = useState(false);
  const [loadingSessions, setLoadingSessions] = useState(false);

  /* 0) nạp lớp của GV (hoặc admin) */
  useEffect(() => {
    (async () => {
      try {
        setLoadingClasses(true);
        let cls = [];
        const { data: mine, error: e1 } = await supabase.rpc(
          "get_my_classes",
          {}
        );
        if (!e1 && Array.isArray(mine) && mine.length) cls = mine;

        // fallback: nếu GV chưa được phân công, cho phép xem tất cả lớp (admin)
        if (!cls.length) {
          const { data: all, error: e2 } = await supabase
            .from("lop")
            .select("id, ten_lop")
            .order("ten_lop");
          if (!e2 && Array.isArray(all)) cls = all;
        }

        setClasses(cls);
        if (cls.length && !selectedClass) setSelectedClass(cls[0]);
      } catch (err) {
        Alert.alert("Lỗi", err.message || "Không tải được danh sách lớp.");
      } finally {
        setLoadingClasses(false);
      }
    })();
  }, []);

  /* 1) khi có selectedClass -> nạp buổi của lớp đó */
  const loadSessionsForClass = useCallback(async (lop_id) => {
    if (!lop_id) return;
    setLoadingSessions(true);
    try {
      const { data, error } = await supabase
        .from("buoihoc")
        .select(
          `
          id, lop_id,
          thoi_gian_bat_dau, thoi_gian_ket_thuc,
          mo_tu, dong_den, tre_sau_phut, dung_gio_trong_phut,
          monhoc:monhoc_id ( id, ten_mon )
        `
        )
        .eq("lop_id", lop_id)
        .order("thoi_gian_bat_dau", { ascending: false })
        .limit(50);
      if (error) throw error;

      const list = (data ?? []).map((b) => ({
        id: b.id,
        lop_id: b.lop_id,
        start: b.thoi_gian_bat_dau,
        end: b.thoi_gian_ket_thuc,
        mo_tu: b.mo_tu || b.thoi_gian_bat_dau,
        dong_den:
          b.dong_den ||
          new Date(
            new Date(b.thoi_gian_bat_dau).getTime() +
              ((b.dung_gio_trong_phut || 0) + (b.tre_sau_phut || 0)) * 60_000
          ).toISOString(),
        tre_sau_phut: b.tre_sau_phut || 0,
        dung_gio_trong_phut: b.dung_gio_trong_phut || 0,
        monhoc: b.monhoc || null,
      }));

      setSessions(list);

      // tự chọn buổi đang mở
      const now = Date.now();
      const open = list.find(
        (s) =>
          new Date(s.mo_tu).getTime() <= now &&
          now <= new Date(s.dong_den).getTime()
      );
      if (open) setSid(open.id);
    } catch (e) {
      Alert.alert("Lỗi", e.message || "Không tải được buổi học.");
    } finally {
      setLoadingSessions(false);
    }
  }, []);

  useEffect(() => {
    if (selectedClass?.id) loadSessionsForClass(selectedClass.id);
  }, [selectedClass?.id, loadSessionsForClass]);

  /* 2) nạp info buổi để ký QR */
  useEffect(() => {
    if (!sid) return;
    (async () => {
      const { data, error } = await supabase
        .from("buoihoc")
        .select(
          `
          id, thoi_gian_bat_dau, thoi_gian_ket_thuc,
          mo_tu, dong_den, tre_sau_phut, dung_gio_trong_phut, qr_khoang_giay
        `
        )
        .eq("id", sid)
        .maybeSingle();
      if (error) return Alert.alert("Lỗi", error.message);
      setInfo(data);
    })();
  }, [sid]);

  /* 3) tick + ký QR */
  useEffect(() => {
    tickRef.current = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(tickRef.current);
  }, []);

  const phaseState = useMemo(
    () => computePhase(info, Date.now()),
    [info, tick]
  );

  const ended = useMemo(() => {
    if (!info) return false;
    return Date.now() > new Date(info.thoi_gian_ket_thuc).getTime();
  }, [info, tick]);

  useEffect(() => {
    if (!info) return;
    const run = async () => {
      if (phaseState.gate === "closed" || ended) {
        setStatus("closed");
        setPayload(null);
        return;
      }
      if (phaseState.gate === "before") {
        setStatus("idle");
        setPayload(null);
        return;
      }

      setStatus("running");
      const period = Number(info.qr_khoang_giay || 20);
      const slot = Math.floor(Date.now() / 1000 / period);
      const { data } = await supabase.rpc("sign_qr", {
        p_buoihoc_id: info.id,
        p_slot: slot,
      });
      if (data?.ok) {
        setPayload({
          sid: data.sid,
          slot: data.slot,
          sig: data.sig,
          phase: phaseState.sub, // "ontime" | "late"
        });
      } else {
        setPayload(null);
        setStatus(data?.error === "WINDOW_CLOSED" ? "closed" : "idle");
      }
    };

    run();
    const iv = setInterval(run, (info?.qr_khoang_giay || 20) * 1000);
    return () => clearInterval(iv);
  }, [info, phaseState.gate, phaseState.sub, ended]);

  /* handlers */
  const openAuto = useCallback(async () => {
    const { data, error } = await supabase.rpc("get_open_session_for_gv", {
      p_lop_id: selectedClass?.id ?? null,
    });
    if (error) {
      Alert.alert("Lỗi", error.message);
      return;
    }
    if (data?.length) setSid(data[0].id);
    else Alert.alert("Thông báo", "Không có buổi đang mở.");
  }, [selectedClass?.id]);

  const onPickClass = useCallback(
    (c) => {
      setShowClassModal(false);
      if (!c) return;
      setSelectedClass(c);
      setSid(null);
      setInfo(null);
      setPayload(null);
      loadSessionsForClass(c.id);
    },
    [loadSessionsForClass]
  );

  /* UI */
  const renderSession = ({ item }) => (
    <TouchableOpacity
      style={styles.sessionItem}
      onPress={() => {
        setSid(item.id);
        setShowSessionModal(false);
      }}
    >
      <Text style={styles.sessionTitle}>
        {item?.monhoc?.ten_mon || "(Chưa có môn)"}
      </Text>
      <Text style={styles.sessionSub}>
        <Ionicons name="time-outline" size={14} color="#9aa0a6" />{" "}
        {fmt(item.start)}
      </Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView className="bg-black flex-1">
      <View className="px-5 py-4">
        <Card>
          <View style={styles.headerRow}>
            <MaterialCommunityIcons name="qrcode" size={20} color="#9aa0a6" />
            <Text className="text-white text-lg font-semibold">
              Phiên điểm danh
            </Text>
          </View>

          <Text className="text-zinc-400 mb-2">Chọn lớp &amp; buổi:</Text>
          <View style={styles.toolbarWrap}>
            <Button
              title={
                selectedClass ? `Lớp: ${selectedClass.ten_lop}` : "Chọn lớp"
              }
              compact
              icon={<Ionicons name="school-outline" size={16} color="#fff" />}
              onPress={() => setShowClassModal(true)}
            />
            <Button
              title="Chọn buổi"
              compact
              variant="outline"
              icon={
                <Ionicons name="calendar-outline" size={16} color="#93c5fd" />
              }
              onPress={() => setShowSessionModal(true)}
              disabled={!selectedClass || loadingSessions}
            />
            <Button
              title="Tự động"
              compact
              variant="outline"
              icon={<Ionicons name="flash-outline" size={16} color="#93c5fd" />}
              onPress={openAuto}
              disabled={!selectedClass && !classes.length}
            />
          </View>

          {/* Modal chọn lớp */}
          <Modal
            visible={showClassModal}
            transparent
            animationType="fade"
            onRequestClose={() => setShowClassModal(false)}
          >
            <View style={styles.modalWrap}>
              <View style={styles.modalCard}>
                <Text style={styles.modalTitle}>Chọn lớp</Text>
                {loadingClasses ? (
                  <ActivityIndicator />
                ) : (
                  <FlatList
                    data={classes}
                    keyExtractor={(it) => it.id}
                    renderItem={({ item }) => (
                      <TouchableOpacity
                        style={[
                          styles.classItem,
                          selectedClass?.id === item.id &&
                            styles.classItemActive,
                        ]}
                        onPress={() => onPickClass(item)}
                      >
                        <Ionicons
                          name="school-outline"
                          size={16}
                          color={
                            selectedClass?.id === item.id ? "#fff" : "#9aa0a6"
                          }
                          style={{ marginRight: 8 }}
                        />
                        <Text
                          style={[
                            styles.classText,
                            selectedClass?.id === item.id &&
                              styles.classTextActive,
                          ]}
                          numberOfLines={1}
                        >
                          {item.ten_lop}
                        </Text>
                      </TouchableOpacity>
                    )}
                    ItemSeparatorComponent={() => (
                      <View style={{ height: 8 }} />
                    )}
                    style={{ maxHeight: 420 }}
                  />
                )}
                <View style={{ height: 8 }} />
                <Button
                  title="Đóng"
                  compact
                  icon={
                    <Ionicons name="close-outline" size={18} color="#fff" />
                  }
                  onPress={() => setShowClassModal(false)}
                />
              </View>
            </View>
          </Modal>

          {/* Modal chọn buổi */}
          <Modal
            visible={showSessionModal}
            transparent
            animationType="fade"
            onRequestClose={() => setShowSessionModal(false)}
          >
            <View style={styles.modalWrap}>
              <View style={styles.modalCard}>
                <Text style={styles.modalTitle}>
                  Chọn buổi {selectedClass ? `(${selectedClass.ten_lop})` : ""}
                </Text>
                {loadingSessions ? (
                  <ActivityIndicator />
                ) : (
                  <FlatList
                    data={sessions}
                    keyExtractor={(it) => it.id}
                    renderItem={renderSession}
                    ItemSeparatorComponent={() => (
                      <View style={{ height: 8 }} />
                    )}
                    style={{ maxHeight: 420 }}
                  />
                )}
                <View style={{ height: 8 }} />
                <Button
                  title="Đóng"
                  compact
                  icon={
                    <Ionicons name="close-outline" size={18} color="#fff" />
                  }
                  onPress={() => setShowSessionModal(false)}
                />
              </View>
            </View>
          </Modal>

          {/* QR + summary */}
          <View style={{ height: 8 }} />
          {sid && info ? (
            <>
              <View style={styles.summary}>
                <Text style={styles.summaryLine}>
                  <Ionicons name="time-outline" size={14} color="#9aa0a6" /> Bắt
                  đầu: {fmt(info.thoi_gian_bat_dau)} — Kết thúc:{" "}
                  {fmt(info.thoi_gian_ket_thuc)}
                </Text>
                <Text style={styles.summaryLine}>
                  <Ionicons
                    name="lock-open-outline"
                    size={14}
                    color="#9aa0a6"
                  />{" "}
                  Cửa QR: {fmt(info.mo_tu)} → {fmt(info.dong_den)}
                </Text>
                <Text style={styles.summaryLine}>
                  <Ionicons
                    name="checkmark-circle-outline"
                    size={14}
                    color="#9aa0a6"
                  />{" "}
                  Đúng giờ: {info.dung_gio_trong_phut}’ · Trễ:{" "}
                  {info.tre_sau_phut}’
                </Text>
              </View>

              <View style={{ height: 10 }} />

              {computePhase(info, Date.now()).gate === "closed" ? (
                <Text className="text-yellow-400 font-semibold">
                  <Ionicons
                    name="alert-circle-outline"
                    size={16}
                    color="#facc15"
                  />{" "}
                  Cửa điểm danh đã đóng.
                </Text>
              ) : payload ? (
                <View style={{ alignItems: "center" }}>
                  <QRCode
                    size={240}
                    value={JSON.stringify(payload)}
                    quietZone={12}
                  />
                  <Text className="text-zinc-400 mt-3">
                    <MaterialCommunityIcons
                      name="qrcode"
                      size={14}
                      color="#9aa0a6"
                    />{" "}
                    Pha: {payload.phase === "ontime" ? "Đúng giờ" : "Trễ"} · đổi
                    mỗi {info?.qr_khoang_giay || 20}s — slot: {payload.slot}
                  </Text>
                </View>
              ) : (
                <Text className="text-zinc-400">Đang chờ…</Text>
              )}
            </>
          ) : (
            <Text className="text-zinc-400">
              {selectedClass
                ? "Hãy chọn một buổi học hoặc dùng nút Tự động."
                : "Hãy chọn lớp trước để xem buổi."}
            </Text>
          )}
        </Card>
      </View>
    </SafeAreaView>
  );
}

/* ---------- styles ---------- */
const styles = StyleSheet.create({
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  toolbarWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingVertical: 4,
  },

  modalWrap: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  modalCard: {
    width: "100%",
    maxWidth: 520,
    backgroundColor: "#131316",
    borderRadius: 14,
    padding: 16,
  },
  modalTitle: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 8,
  },
  classItem: {
    backgroundColor: "#1a1a1e",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
  },
  classItemActive: { backgroundColor: "#4f46e5" },
  classText: { color: "#c9cdd1", flexShrink: 1 },
  classTextActive: { color: "white", fontWeight: "600" },
  sessionItem: { backgroundColor: "#1a1a1e", borderRadius: 12, padding: 12 },
  sessionTitle: { color: "white", fontWeight: "600" },
  sessionSub: { color: "#c9cdd1", marginTop: 4 },
  summary: { gap: 4 },
  summaryLine: { color: "#c9cdd1" },
});
