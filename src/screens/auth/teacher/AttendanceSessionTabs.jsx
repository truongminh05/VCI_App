// screens/attendance/AttendanceListScreen.compact.jsx
import React, { useCallback, useEffect, useMemo, useState, memo } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  Alert,
  RefreshControl,
  TouchableOpacity,
  StyleSheet,
  Modal,
  TextInput,
} from "react-native";
import { supabase } from "../../../lib/supabase";
import Card from "../../../components/Card";
import {
  deriveAttendanceStatus,
  labelForStatus,
} from "../../../utils/deriveAttendanceStatus";

function fmtDateTime(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

// (giữ lại để thống kê nếu cần)
function minutesLate(checkinISO, startISO, thresholdMin = 0) {
  if (!checkinISO || !startISO) return 0;
  try {
    const chk = new Date(checkinISO).getTime();
    const stt = new Date(startISO).getTime();
    const diff = Math.ceil((chk - stt) / 60000) - (thresholdMin || 0);
    return diff > 0 ? diff : 0;
  } catch {
    return 0;
  }
}

/* ---------- Status chip ---------- */
const StatusChip = ({ status }) => {
  const label =
    labelForStatus?.(status) ??
    (status === "ontime"
      ? "Đúng giờ"
      : status === "late"
      ? "Trễ"
      : status === "absent"
      ? "Vắng"
      : status === "before"
      ? "Chưa đến giờ"
      : "Chưa điểm danh");

  const bg =
    status === "ontime"
      ? "#16a34a"
      : status === "late"
      ? "#f59e0b"
      : status === "absent"
      ? "#ef4444"
      : status === "before"
      ? "#64748b"
      : "#334155";

  return (
    <View
      style={{
        backgroundColor: bg,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 999,
        alignSelf: "flex-end",
      }}
    >
      <Text style={{ color: "white", fontSize: 12, fontWeight: "600" }}>
        {label}
      </Text>
    </View>
  );
};

/* ---------- Row item (memo để mượt) ---------- */
const Row = memo(({ item }) => (
  <View style={styles.row}>
    <Text style={styles.cellName} numberOfLines={1}>
      {item.ho_ten}
    </Text>
    <Text style={styles.cellCode} numberOfLines={1}>
      {item.ma_sv || "—"}
    </Text>
    <Text style={styles.cellDate} numberOfLines={1}>
      {item.checkin_luc ? fmtDateTime(item.checkin_luc) : "—"}
    </Text>
    <View style={styles.cellStatus}>
      <StatusChip status={item.status} />
    </View>
  </View>
));

export default function AttendanceListScreen() {
  /* ---------------------- state chính ---------------------- */
  const [classes, setClasses] = useState([]); // [{id, ten_lop}]
  const [sessions, setSessions] = useState([]); // buổi theo lớp
  const [selectedClass, setSelectedClass] = useState(null);
  const [selectedSession, setSelectedSession] = useState(null);
  const [headerInfo, setHeaderInfo] = useState(null);
  const [rows, setRows] = useState([]);

  const [loadingClasses, setLoadingClasses] = useState(false);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [loadingRows, setLoadingRows] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  /* ---------------------- modal chọn ---------------------- */
  const [showClassModal, setShowClassModal] = useState(false);
  const [showSessionModal, setShowSessionModal] = useState(false);
  const [classQuery, setClassQuery] = useState("");
  const [sessionQuery, setSessionQuery] = useState("");

  const filteredClasses = useMemo(() => {
    if (!classQuery.trim()) return classes;
    const q = classQuery.toLowerCase();
    return classes.filter((c) => (c.ten_lop || "").toLowerCase().includes(q));
  }, [classes, classQuery]);

  const filteredSessions = useMemo(() => {
    if (!sessionQuery.trim()) return sessions;
    const q = sessionQuery.toLowerCase();
    return sessions.filter((s) => {
      const name = s?.monhoc?.ten_mon || "";
      return (
        name.toLowerCase().includes(q) ||
        fmtDateTime(s.start).toLowerCase().includes(q)
      );
    });
  }, [sessions, sessionQuery]);

  /* ---------------------- tải danh sách lớp ---------------------- */
  const loadMyClasses = useCallback(async () => {
    try {
      setLoadingClasses(true);
      const { data, error } = await supabase
        .from("lop")
        .select("id, ten_lop")
        .order("ten_lop");
      if (error) throw error;
      setClasses(data || []);
      if ((data || []).length && !selectedClass) setSelectedClass(data[0]);
    } catch (e) {
      Alert.alert("Lỗi", e.message || "Không tải được lớp.");
    } finally {
      setLoadingClasses(false);
    }
  }, [selectedClass]);

  useEffect(() => {
    loadMyClasses();
  }, [loadMyClasses]);

  /* ---------------------- tải buổi theo lớp ---------------------- */
  const loadSessions = useCallback(async (lopId) => {
    if (!lopId) {
      setSessions([]);
      setSelectedSession(null);
      setHeaderInfo(null);
      return;
    }
    try {
      setLoadingSessions(true);
      const { data, error } = await supabase
        .from("buoihoc")
        .select(
          `
          id, lop_id,
          thoi_gian_bat_dau, thoi_gian_ket_thuc,
          mo_tu, dong_den, tre_sau_phut,
          monhoc:monhoc_id ( id, ma_mon, ten_mon ),
          lop:lop_id ( id, ten_lop )
        `
        )
        .eq("lop_id", lopId)
        .order("thoi_gian_bat_dau", { ascending: false })
        .limit(50);
      if (error) throw error;

      const list = (data ?? []).map((b) => ({
        id: b.id,
        lop_id: b.lop_id,
        start: b.thoi_gian_bat_dau,
        end: b.thoi_gian_ket_thuc,
        mo_tu: b.mo_tu || null,
        dong_den: b.dong_den || null,
        tre_sau_phut: b.tre_sau_phut || 0,
        monhoc: b.monhoc || null,
        lop: b.lop || null,
      }));
      setSessions(list);
      if (list.length) {
        setSelectedSession(list[0]);
        setHeaderInfo(list[0]);
      } else {
        setSelectedSession(null);
        setHeaderInfo(null);
      }
    } catch (e) {
      Alert.alert("Lỗi", e.message || "Không tải được buổi học.");
    } finally {
      setLoadingSessions(false);
    }
  }, []);

  useEffect(() => {
    loadSessions(selectedClass?.id || null);
  }, [selectedClass?.id, loadSessions]);

  /* ---------------------- tải bảng SV ---------------------- */
  const loadRows = useCallback(async () => {
    const lopId = selectedClass?.id;
    const buoihoc_id = selectedSession?.id;
    if (!lopId || !buoihoc_id) {
      setRows([]);
      return;
    }
    try {
      setLoadingRows(true);

      // a) danh sách đăng ký lớp
      const { data: enrolls, error: e1 } = await supabase
        .from("dangky")
        .select("sinh_vien_id")
        .eq("lop_id", lopId);
      if (e1) throw e1;
      const ids = (enrolls ?? []).map((x) => x.sinh_vien_id);
      if (!ids.length) {
        setRows([]);
        setLoadingRows(false);
        return;
      }

      // b) hồ sơ
      const { data: profiles, error: e2 } = await supabase
        .from("hoso")
        .select("nguoi_dung_id, ho_ten, ma_sinh_vien")
        .in("nguoi_dung_id", ids);
      if (e2) throw e2;
      const pmap = new Map(
        (profiles ?? []).map((p) => [
          p.nguoi_dung_id,
          { name: p.ho_ten ?? "(Chưa có tên)", code: p.ma_sinh_vien ?? "" },
        ])
      );

      // c) điểm danh của buổi
      const { data: marks, error: e3 } = await supabase
        .from("diemdanh")
        .select("sinh_vien_id, checkin_luc, trang_thai")
        .eq("buoihoc_id", buoihoc_id);
      if (e3) throw e3;
      const mmap = new Map(
        (marks ?? []).map((m) => [
          m.sinh_vien_id,
          { checkin: m.checkin_luc, status: m.trang_thai },
        ])
      );

      const startISO = selectedSession?.start;
      const threshold = selectedSession?.tre_sau_phut || 0;

      // d) hợp nhất
      const sessionCtx = {
        thoi_gian_bat_dau: selectedSession?.start,
        mo_tu: selectedSession?.mo_tu,
        dong_den: selectedSession?.dong_den,
        tre_sau_phut: selectedSession?.tre_sau_phut,
      };

      const merged = ids
        .map((uid) => {
          const pf = pmap.get(uid) || {};
          const mk = mmap.get(uid) || null;

          // tính status 3-trạng-thái
          const recordForDerive = mk ? { trang_thai: mk.status } : null;
          const status = deriveAttendanceStatus(recordForDerive, sessionCtx);

          // (giữ thông tin cũ để bạn thống kê nếu muốn)
          const present = !!mk;
          const checkinISO = mk?.checkin ?? null;
          const lateMin = present
            ? minutesLate(checkinISO, startISO, threshold)
            : 0;

          return {
            id: uid,
            ho_ten: pf.name || "(Chưa có tên)",
            ma_sv: pf.code || "",
            checkin_luc: checkinISO,
            present,
            lateMin,
            status, // <<— dùng cho UI
          };
        })
        .sort((a, b) => a.ho_ten.localeCompare(b.ho_ten, "vi"));

      setRows(merged);
    } catch (e) {
      Alert.alert("Lỗi", e.message || "Không tải được danh sách.");
    } finally {
      setLoadingRows(false);
      setRefreshing(false);
    }
  }, [
    selectedClass?.id,
    selectedSession?.id,
    selectedSession?.start,
    selectedSession?.tre_sau_phut,
    selectedSession?.mo_tu,
    selectedSession?.dong_den,
  ]);

  useEffect(() => {
    if (selectedSession?.id && selectedClass?.id) {
      setHeaderInfo(selectedSession);
      loadRows();
    } else {
      setRows([]);
    }
  }, [selectedSession?.id, selectedClass?.id, loadRows]);
  // ở gần cuối file, ngay dưới useEffect hiện tại là đẹp

  useEffect(() => {
    // nếu chưa chọn buổi thì không sub
    if (!selectedSession?.id) return;

    // tạo 1 channel riêng cho buổi này
    const channel = supabase
      .channel(`diemdanh_realtime_${selectedSession.id}`)
      .on(
        "postgres_changes",
        {
          event: "*", // INSERT / UPDATE / DELETE đều nghe
          schema: "public",
          table: "diemdanh",
          filter: `buoihoc_id=eq.${selectedSession.id}`,
        },
        (payload) => {
          // console.log("Realtime diemdanh:", payload);
          // mỗi khi có thay đổi điểm danh -> reload bảng
          loadRows();
        }
      )
      .subscribe();

    // cleanup khi đổi buổi hoặc rời màn
    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedSession?.id, loadRows]);

  /* ------------------- thống kê nhanh ------------------- */
  const total = rows.length;
  const presentCount = useMemo(
    () => rows.reduce((acc, r) => acc + (r.present ? 1 : 0), 0),
    [rows]
  );
  const absentCount = total - presentCount;

  const keyExtractor = useCallback((it) => it.id, []);
  const getItemLayout = useCallback(
    (_d, index) => ({ length: 52, offset: 52 * index, index }),
    []
  );

  /* ===================== UI ===================== */
  return (
    <SafeAreaView className="bg-black flex-1">
      {/* Thanh filter siêu gọn */}
      <View style={styles.topBar}>
        <TouchableOpacity
          style={styles.pill}
          onPress={() => setShowClassModal(true)}
        >
          <Text style={styles.pillLabel}>Lớp</Text>
          <Text style={styles.pillText} numberOfLines={1}>
            {selectedClass?.ten_lop || "Chọn lớp"}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.pill}
          onPress={() => setShowSessionModal(true)}
          disabled={!selectedClass}
        >
          <Text style={styles.pillLabel}>Buổi</Text>
          <Text style={styles.pillText} numberOfLines={1}>
            {selectedSession
              ? `${selectedSession?.monhoc?.ten_mon ?? ""} · ${fmtDateTime(
                  selectedSession?.start
                )}`
              : "Chọn buổi"}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Header info + tổng số */}
      {headerInfo && (
        <Card className="mx-5 mt-2">
          <Text className="text-white font-semibold">
            {(headerInfo?.lop?.ten_lop || selectedClass?.ten_lop || "") +
              (headerInfo?.monhoc?.ten_mon
                ? " · " + headerInfo?.monhoc?.ten_mon
                : "")}
          </Text>
          <Text className="text-zinc-400 mt-1">
            Bắt đầu: {fmtDateTime(headerInfo?.start)} — Kết thúc:{" "}
            {fmtDateTime(headerInfo?.end)}
          </Text>
          <View style={{ flexDirection: "row", marginTop: 6 }}>
            <Text style={{ color: "#c9cdd1", marginRight: 12 }}>
              Tổng: {total}
            </Text>
            <Text style={{ color: "#22c55e", marginRight: 12 }}>
              ✓ {presentCount}
            </Text>
            <Text style={{ color: "#ef4444" }}>✗ {absentCount}</Text>
          </View>
        </Card>
      )}

      {/* Header bảng */}
      <View style={[styles.row, styles.headerRow, { marginTop: 8 }]}>
        <Text style={[styles.cellName, styles.headerText]}>Họ tên</Text>
        <Text style={[styles.cellCode, styles.headerText]}>Mã SV</Text>
        <Text style={[styles.cellDate, styles.headerText]}>Ngày</Text>
        <Text style={[styles.cellStatus, styles.headerText]}>Trạng thái</Text>
      </View>

      {/* Danh sách */}
      {loadingRows && rows.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={keyExtractor}
          renderItem={({ item }) => <Row item={item} />}
          getItemLayout={getItemLayout}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                loadRows();
              }}
            />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text className="text-zinc-400">Chưa có dữ liệu.</Text>
            </View>
          }
          contentContainerStyle={{ paddingBottom: 24 }}
          initialNumToRender={20}
          maxToRenderPerBatch={20}
          windowSize={7}
          removeClippedSubviews
        />
      )}

      {/* Modal chọn lớp (cuộn + tìm) */}
      <Modal visible={showClassModal} transparent animationType="slide">
        <View style={styles.modalWrap}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Chọn lớp</Text>
            <TextInput
              style={styles.search}
              placeholder="Tìm lớp…"
              placeholderTextColor="#9aa0a6"
              value={classQuery}
              onChangeText={setClassQuery}
            />
            {loadingClasses ? (
              <ActivityIndicator />
            ) : (
              <FlatList
                data={filteredClasses}
                keyExtractor={(x) => x.id}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.option}
                    onPress={() => {
                      setSelectedClass(item);
                      setShowClassModal(false);
                      setSessionQuery("");
                    }}
                  >
                    <Text style={{ color: "white" }}>{item.ten_lop}</Text>
                  </TouchableOpacity>
                )}
              />
            )}
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={() => setShowClassModal(false)}
            >
              <Text style={{ color: "white", fontWeight: "700" }}>Đóng</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal chọn buổi (cuộn + tìm) */}
      <Modal visible={showSessionModal} transparent animationType="slide">
        <View style={styles.modalWrap}>
          <View style={styles.modalCard}>
            <Text className="text-white font-bold text-base">
              Chọn buổi học
            </Text>
            <TextInput
              style={styles.search}
              placeholder="Tìm theo tên môn hoặc thời gian…"
              placeholderTextColor="#9aa0a6"
              value={sessionQuery}
              onChangeText={setSessionQuery}
            />
            {loadingSessions ? (
              <ActivityIndicator />
            ) : (
              <FlatList
                data={filteredSessions}
                keyExtractor={(s) => s.id}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.option}
                    onPress={() => {
                      setSelectedSession(item);
                      setHeaderInfo(item);
                      setShowSessionModal(false);
                    }}
                  >
                    <Text style={{ color: "white", fontWeight: "600" }}>
                      {item?.monhoc?.ten_mon || "—"}
                    </Text>
                    <Text style={{ color: "#9aa0a6" }}>
                      {fmtDateTime(item.start)}
                    </Text>
                  </TouchableOpacity>
                )}
              />
            )}
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={() => setShowSessionModal(false)}
            >
              <Text style={{ color: "white", fontWeight: "700" }}>Đóng</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

/* ---------------------- styles ---------------------- */
const styles = StyleSheet.create({
  topBar: {
    paddingHorizontal: 16,
    paddingTop: 8,
    flexDirection: "row",
    gap: 8,
  },
  pill: {
    flex: 1,
    backgroundColor: "#151518",
    borderWidth: 1,
    borderColor: "#232329",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  pillLabel: { color: "#9aa0a6", fontSize: 12, marginBottom: 2 },
  pillText: { color: "white", fontWeight: "600" },

  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  row: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#22262b",
    alignItems: "center",
  },
  headerRow: {
    backgroundColor: "#101215",
    borderTopWidth: 1,
    borderTopColor: "#22262b",
  },
  headerText: { color: "#a3aab3", fontWeight: "700" },
  cellName: { flex: 2.2, color: "white" },
  cellCode: { flex: 1.3, color: "#c9cdd1" },
  cellDate: { flex: 2.2, color: "#c9cdd1" },
  cellStatus: { flex: 1.5, alignItems: "flex-end" }, // cột mới

  empty: { padding: 20, alignItems: "center" },

  modalWrap: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  modalCard: {
    maxHeight: "70%",
    backgroundColor: "#0f1114",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 14,
  },
  modalTitle: {
    color: "white",
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 8,
  },
  search: {
    backgroundColor: "#151518",
    borderWidth: 1,
    borderColor: "#232329",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "white",
    marginBottom: 10,
  },
  option: {
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#1e2126",
  },
  closeBtn: {
    backgroundColor: "#2c7be5",
    alignSelf: "center",
    marginTop: 12,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
});
