// screens/admin/SessionsScreen.jsx
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
  TextInput,
  Alert,
  ActivityIndicator,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ScrollView,
  Modal,
} from "react-native";
import DateTimePickerModal from "react-native-modal-datetime-picker";
import { Ionicons } from "@expo/vector-icons";
import Section from "../../../components/Section";
import Card from "../../../components/Card";
import Button from "../../../components/Button";
import { ClassPicker } from "../../../components/ClassPicker";
import { TeacherPicker } from "../../../components/TeacherPicker";
import { supabase } from "../../../lib/supabase";

/* === Chung 1 gutter cho TRANG & LIST === */
const PAGE_PAD = 20;

/* ===== SubjectPicker (đơn giản, không gây remount) ===== */
function SubjectPicker({ value, onChange }) {
  const [list, setList] = useState([]);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    (async () => {
      const { data, error } = await supabase
        .from("monhoc")
        .select("id, ma_mon, ten_mon")
        .order("ten_mon");
      if (!error && mounted.current) setList(data || []);
    })();
    return () => (mounted.current = false);
  }, []);

  const current = useMemo(
    () => list.find((i) => i.id === value) || null,
    [list, value]
  );

  return (
    <View>
      <View style={styles.selectorRead}>
        <Text style={{ color: "white" }}>
          {current ? `${current.ten_mon} (${current.ma_mon})` : "Chưa chọn"}
        </Text>
      </View>
      <View style={{ maxHeight: 180 }}>
        <ScrollView nestedScrollEnabled>
          {list.map((item) => (
            <TouchableOpacity key={item.id} onPress={() => onChange?.(item.id)}>
              <View style={styles.subjectItem}>
                <Text style={{ color: "white" }}>{item.ten_mon}</Text>
                <Text style={{ color: "#9aa0a6" }}>{item.ma_mon}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

/* ===== Helpers ===== */
function fmtDateTime(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}
// ở SessionsScreen.jsx
function normalizeStatus(dbStatus) {
  if (dbStatus === "dung_gio") return "ontime";
  if (dbStatus === "tre_gio") return "late"; // <-- KHỚP ENUM
  if (dbStatus === "vang") return "absent";
  return "absent";
}

/* ==== Input có icon trong ô (calendar + action) ==== */
function InputWithIcons({
  label,
  value,
  onChangeText,
  placeholder,
  onPressPrimary, // mở DateTimePicker
  onPressSecondary, // “Bây giờ” hoặc “+90’”
  primaryIcon = "calendar-outline",
  secondaryIcon = "flash-outline",
}) {
  return (
    <View style={{ marginTop: 12 }}>
      <Text style={{ color: "#9ca3af", marginBottom: 8 }}>{label}</Text>
      <View style={styles.inputWrap}>
        <TextInput
          style={[styles.input, { paddingRight: 84 }]}
          placeholder={placeholder}
          placeholderTextColor="#9ca3af"
          value={value}
          onChangeText={onChangeText}
          autoCapitalize="none"
        />
        <View style={styles.inputIconTray}>
          <TouchableOpacity
            onPress={onPressPrimary}
            style={styles.iconBtn}
            hitSlop={8}
          >
            <Ionicons name={primaryIcon} size={18} color="white" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onPressSecondary}
            style={styles.iconBtn}
            hitSlop={8}
          >
            <Ionicons name={secondaryIcon} size={18} color="white" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

export default function SessionsScreen() {
  /* ----- mounted guard ----- */
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => (mounted.current = false);
  }, []);
  const setIfMounted = (set) => (v) => mounted.current && set(v);
  // ==== Helpers: ISO với offset (không bị lệch múi giờ) ====
  const pad2 = (n) => String(Math.floor(Math.abs(n))).padStart(2, "0");
  const toISOWithOffset = (d) => {
    if (!(d instanceof Date)) d = new Date(d);
    if (Number.isNaN(d.getTime())) return "";
    const tzMin = -d.getTimezoneOffset(); // phút lệch UTC
    const sign = tzMin >= 0 ? "+" : "-";
    const hh = pad2(Math.trunc(Math.abs(tzMin) / 60));
    const mm = pad2(Math.abs(tzMin) % 60);
    const yyyy = d.getFullYear();
    const MM = pad2(d.getMonth() + 1);
    const DD = pad2(d.getDate());
    const HH = pad2(d.getHours());
    const MIN = pad2(d.getMinutes());
    const SS = pad2(d.getSeconds());
    return `${yyyy}-${MM}-${DD}T${HH}:${MIN}:${SS}${sign}${hh}:${mm}`;
  };
  const parseISO = (s, def = new Date()) => {
    const d = s ? new Date(s) : def;
    return Number.isNaN(d.getTime()) ? def : d;
  };

  /* ===== Form tạo buổi ===== */
  const [lop, _setLop] = useState(null);
  const setLop = setIfMounted(_setLop);

  const [monhocId, _setMonhocId] = useState(null);
  const setMonhocId = setIfMounted(_setMonhocId);

  const [startAt, _setStartAt] = useState("");
  const setStartAt = setIfMounted(_setStartAt);

  const [endAt, _setEndAt] = useState("");
  const setEndAt = setIfMounted(_setEndAt);

  // DateTime pickers
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const onPickStart = (date) => {
    setShowStartPicker(false);
    if (date) setStartAt(toISOWithOffset(date));
  };
  const onPickEnd = (date) => {
    setShowEndPicker(false);
    if (date) setEndAt(toISOWithOffset(date));
  };

  const [onTimeMinutes, _setOnTimeMinutes] = useState("15");
  const setOnTimeMinutes = setIfMounted(_setOnTimeMinutes);

  const [lateMinutes, _setLateMinutes] = useState("10");
  const setLateMinutes = setIfMounted(_setLateMinutes);

  // ===== Giảng viên cho môn =====
  const [selectedTeacher, setSelectedTeacher] = useState(null); // { nguoi_dung_id, ho_ten }
  const [showTeacherPicker, setShowTeacherPicker] = useState(false);
  const [teachersForMon, setTeachersForMon] = useState([]);
  const [loadingTeachers, setLoadingTeachers] = useState(false);

  useEffect(() => {
    (async () => {
      setSelectedTeacher(null);
      setTeachersForMon([]);
      if (!monhocId) return;
      try {
        setLoadingTeachers(true);
        const { data: pairs, error } = await supabase
          .from("giangday")
          .select("giang_vien_id")
          .eq("monhoc_id", monhocId);
        if (error) throw error;

        const ids = (pairs ?? []).map((p) => p.giang_vien_id);
        if (!ids.length) return;

        const { data: hs, error: e2 } = await supabase
          .from("hoso")
          .select("nguoi_dung_id, ho_ten")
          .in("nguoi_dung_id", ids);
        if (e2) throw e2;

        const list =
          ids
            .map((id) => hs?.find((x) => x.nguoi_dung_id === id))
            .filter(Boolean) || [];
        setTeachersForMon(list);
        if (list.length === 1) setSelectedTeacher(list[0]); // auto-chọn nếu chỉ có 1 GV
      } catch (err) {
        Alert.alert(
          "Lỗi",
          err.message || "Không tải được danh sách giảng viên."
        );
      } finally {
        setLoadingTeachers(false);
      }
    })();
  }, [monhocId]);

  const [creating, _setCreating] = useState(false);
  const setCreating = setIfMounted(_setCreating);

  const DEFAULT_QR_SECONDS = 20; // khoảng đổi QR

  const createSession = async () => {
    if (!lop?.id) return Alert.alert("Thiếu", "Chọn lớp.");
    if (!startAt || !endAt)
      return Alert.alert("Thiếu", "Nhập thời gian bắt đầu/kết thúc.");

    const t1 = new Date(startAt);
    const t2 = new Date(endAt);
    if (Number.isNaN(t1.getTime()) || Number.isNaN(t2.getTime()))
      return Alert.alert("Sai", "Thời gian không hợp lệ.");
    if (t2 <= t1)
      return Alert.alert("Sai", "Kết thúc phải sau thời gian bắt đầu.");

    const onm = parseInt(onTimeMinutes || "0", 10);
    const tre = parseInt(lateMinutes || "0", 10);
    if (Number.isNaN(onm) || onm < 0)
      return Alert.alert("Sai", "Đúng giờ (phút) phải là số ≥ 0.");
    if (Number.isNaN(tre) || tre < 0)
      return Alert.alert("Sai", "Trễ (phút) phải là số ≥ 0.");

    try {
      setCreating(true);

      // ÉP chọn overload 11 tham số bằng cách gửi thêm các tham số mở rộng
      const payload = {
        p_lop_id: lop.id,
        p_thoi_gian_bat_dau: t1.toISOString(),
        p_thoi_gian_ket_thuc: t2.toISOString(),

        // bắt buộc
        p_dung_gio_trong_phut: onm,
        p_tre_sau_phut: tre,

        // “định tuyến” sang hàm 11 tham số
        p_monhoc_id: monhocId ?? null,
        p_giang_vien_id: selectedTeacher?.nguoi_dung_id ?? null,
        p_mo_tu: null, // để trigger tự set = start
        p_dong_den: null, // để trigger tự set = min(start+đúng+trễ, end)
        p_qr_khoang_giay: DEFAULT_QR_SECONDS,
        p_phonghoc_id: null,
      };

      const { data, error } = await supabase.rpc("create_buoihoc", payload);
      if (error) throw error;

      Alert.alert("OK", "Đã tạo buổi học.");
      setMonhocId(null);
      setSelectedTeacher(null);
      setStartAt("");
      setEndAt("");
      setOnTimeMinutes("15");
      setLateMinutes("10");
      if (lop?.id) await loadSessions(lop.id); // reload danh sách buổi
    } catch (e) {
      Alert.alert("Lỗi tạo buổi học", e?.message || String(e));
    } finally {
      setCreating(false);
    }
  };

  /* ===== Lớp ===== */
  const [loadingClasses, setLoadingClasses] = useState(false);
  const loadClasses = useCallback(async () => {
    try {
      setLoadingClasses(true);
      const { data, error } = await supabase
        .from("lop")
        .select("id, ten_lop")
        .order("ten_lop");
      if (error) throw error;
      if (!lop && (data || []).length) setLop(data[0]);
    } catch (e) {
      Alert.alert("Lỗi", e.message || "Không tải được lớp.");
    } finally {
      setLoadingClasses(false);
    }
  }, [lop]);
  useEffect(() => {
    loadClasses();
  }, [loadClasses]);

  /* ===== Buổi học ===== */
  const [sessions, _setSessions] = useState([]);
  const setSessions = setIfMounted(_setSessions);

  const [loadingSessions, _setLoadingSessions] = useState(false);
  const setLoadingSessions = setIfMounted(_setLoadingSessions);

  const [sessionQuery, _setSessionQuery] = useState("");
  const setSessionQuery = setIfMounted(_setSessionQuery);

  const [selectedSession, _setSelectedSession] = useState(null);
  const setSelectedSession = setIfMounted(_setSelectedSession);

  const loadSessions = useCallback(async (lopId) => {
    if (!lopId) {
      setSessions([]);
      setSelectedSession(null);
      return;
    }
    try {
      setLoadingSessions(true);
      const { data, error } = await supabase
        .from("buoihoc")
        .select(
          `
          id, lop_id, thoi_gian_bat_dau, thoi_gian_ket_thuc,
          dung_gio_trong_phut, tre_sau_phut,
          monhoc:monhoc_id ( id, ten_mon )
        `
        )
        .eq("lop_id", lopId)
        .order("thoi_gian_bat_dau", { ascending: false })
        .limit(100);
      if (error) throw error;

      const list = (data ?? []).map((b) => ({
        id: b.id,
        lop_id: b.lop_id,
        start: b.thoi_gian_bat_dau,
        end: b.thoi_gian_ket_thuc,
        ontime_min: b.dung_gio_trong_phut || 0,
        tre_sau_phut: b.tre_sau_phut || 0,
        monhoc: b.monhoc || null,
      }));
      setSessions(list);
      setSelectedSession((prev) => (prev?.id ? prev : list[0] || null));
    } catch (e) {
      Alert.alert("Lỗi", e.message || "Không tải được buổi học.");
    } finally {
      setLoadingSessions(false);
    }
  }, []);
  useEffect(() => {
    if (lop?.id) loadSessions(lop.id);
    else {
      setSessions([]);
      setSelectedSession(null);
    }
  }, [lop?.id, loadSessions]);

  /* ===== Modal chọn buổi ===== */
  const [showSessionModal, _setShowSessionModal] = useState(false);
  const setShowSessionModal = setIfMounted(_setShowSessionModal);

  const filteredSessions = useMemo(() => {
    if (!sessionQuery.trim()) return sessions;
    const q = sessionQuery.toLowerCase();
    return sessions.filter(
      (s) =>
        (s.monhoc?.ten_mon || "").toLowerCase().includes(q) ||
        fmtDateTime(s.start).toLowerCase().includes(q) ||
        fmtDateTime(s.end).toLowerCase().includes(q)
    );
  }, [sessions, sessionQuery]);

  /* ===== Điểm danh ===== */
  const [rows, _setRows] = useState([]);
  const setRows = setIfMounted(_setRows);

  const [loadingRows, _setLoadingRows] = useState(false);
  const setLoadingRows = setIfMounted(_setLoadingRows);

  const [refreshing, _setRefreshing] = useState(false);
  const setRefreshing = setIfMounted(_setRefreshing);

  const [statusFilter, _setStatusFilter] = useState("all");
  const setStatusFilter = setIfMounted(_setStatusFilter);

  const listRef = useRef(null);

  const loadAttendance = useCallback(async () => {
    const lopId = lop?.id;
    const buoihoc_id = selectedSession?.id;
    if (!lopId || !buoihoc_id) {
      setRows([]);
      return;
    }
    try {
      setLoadingRows(true);

      // PATCH #2: dùng RPC nhanh để lấy hồ sơ theo lớp (tránh IN rất dài)
      const { data: profiles, error: e2 } = await supabase.rpc(
        "profiles_by_lop",
        { p_lop_id: lopId }
      );
      if (e2) throw e2;

      const ids = (profiles ?? []).map((p) => p.nguoi_dung_id);
      if (!ids.length) {
        setRows([]);
        setLoadingRows(false);
        return;
      }

      const { data: marks, error: e3 } = await supabase
        .from("diemdanh")
        .select("sinh_vien_id, checkin_luc, trang_thai")
        .eq("buoihoc_id", buoihoc_id);
      if (e3) throw e3;

      const pmap = new Map(
        (profiles ?? []).map((p) => [
          p.nguoi_dung_id,
          {
            name:
              p.ho_ten || (p.email ? p.email.split("@")[0] : "(Chưa có tên)"),
            code: p.ma_sinh_vien ?? "",
          },
        ])
      );

      const mmap = new Map(
        (marks ?? []).map((m) => [
          m.sinh_vien_id,
          { checkin: m.checkin_luc, status: normalizeStatus(m.trang_thai) },
        ])
      );

      const merged = ids
        .map((uid) => {
          const pf = pmap.get(uid) || {};
          const mk = mmap.get(uid) || null;
          const status = mk?.status ?? "absent";
          return {
            id: String(uid),
            ho_ten: pf.name,
            ma_sv: pf.code,
            checkin_luc: mk?.checkin,
            status,
          };
        })
        .sort((a, b) => a.ho_ten.localeCompare(b.ho_ten, "vi"));

      setRows(merged);
    } catch (e) {
      Alert.alert("Lỗi", e.message || "Không tải được danh sách điểm danh.");
    } finally {
      setLoadingRows(false);
      setRefreshing(false);
    }
  }, [lop?.id, selectedSession?.id]);
  useEffect(() => {
    if (lop?.id && selectedSession?.id) loadAttendance();
    else setRows([]);
  }, [lop?.id, selectedSession?.id, loadAttendance]);

  const total = rows.length;
  const ontimeCount = rows.filter((r) => r.status === "ontime").length;
  const lateCount = rows.filter((r) => r.status === "late").length;
  const absentCount = total - ontimeCount - lateCount;

  const filteredRows = useMemo(
    () =>
      statusFilter === "all"
        ? rows
        : rows.filter((r) => r.status === statusFilter),
    [rows, statusFilter]
  );

  /* =================== RENDER: 1 FlatList cuộn cả trang =================== */
  return (
    <SafeAreaView className="bg-black flex-1">
      <FlatList
        ref={listRef}
        data={selectedSession ? filteredRows : []}
        keyExtractor={(x) => String(x.id)}
        ListHeaderComponent={
          <View style={{ paddingHorizontal: PAGE_PAD, paddingBottom: 12 }}>
            <Section
              title="Tạo buổi học"
              subtitle="Admin cấu hình môn, thời gian & Đúng giờ/Trễ"
            />
            <Card>
              <Text style={styles.muted}>Chọn lớp</Text>
              <ClassPicker value={lop} onChange={setLop} />

              <Text style={[styles.muted, styles.mt]}>Môn học</Text>
              <SubjectPicker
                value={monhocId}
                onChange={setMonhocId}
                lopId={lop?.id}
              />

              {/* Chọn GV phụ trách */}
              <Text style={[styles.muted, styles.mt]}>
                Giảng viên phụ trách
              </Text>
              <TouchableOpacity
                disabled={!monhocId}
                onPress={() => setShowTeacherPicker(true)}
                style={styles.selector}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ color: "white", fontWeight: "700" }}>
                    {selectedTeacher?.ho_ten
                      ? selectedTeacher.ho_ten
                      : loadingTeachers
                      ? "Đang tải danh sách giảng viên…"
                      : monhocId
                      ? teachersForMon.length
                        ? "Chưa chọn"
                        : "Môn này chưa gán giảng viên"
                      : "Chọn môn trước"}
                  </Text>
                </View>
                <View style={styles.pillPrimary}>
                  <Text style={{ color: "white", fontWeight: "700" }}>
                    Chọn
                  </Text>
                </View>
              </TouchableOpacity>

              <InputWithIcons
                label="Bắt đầu (ISO)"
                value={startAt}
                onChangeText={setStartAt}
                placeholder="2025-01-01T08:00:00+07:00"
                onPressPrimary={() => setShowStartPicker(true)}
                onPressSecondary={() => setStartAt(toISOWithOffset(new Date()))}
                primaryIcon="calendar-outline"
                secondaryIcon="flash-outline"
              />

              <InputWithIcons
                label="Kết thúc (ISO)"
                value={endAt}
                onChangeText={setEndAt}
                placeholder="2025-01-01T10:00:00+07:00"
                onPressPrimary={() => setShowEndPicker(true)}
                onPressSecondary={() => {
                  const base = parseISO(startAt, new Date());
                  const d = new Date(base.getTime() + 90 * 60000);
                  setEndAt(toISOWithOffset(d));
                }}
                primaryIcon="calendar-outline"
                secondaryIcon="add-outline"
              />

              <Text style={[styles.muted, styles.mt]}>Đúng giờ (phút)</Text>
              <TextInput
                style={styles.input}
                placeholder="15"
                keyboardType="numeric"
                placeholderTextColor="#9ca3af"
                value={onTimeMinutes}
                onChangeText={setOnTimeMinutes}
              />

              <Text style={[styles.muted, styles.mt]}>Trễ (phút)</Text>
              <TextInput
                style={styles.input}
                placeholder="10"
                keyboardType="numeric"
                placeholderTextColor="#9ca3af"
                value={lateMinutes}
                onChangeText={setLateMinutes}
              />

              <Button
                className="mt-3"
                title={creating ? "Đang tạo..." : "Tạo buổi học"}
                onPress={createSession}
                disabled={creating}
              />
            </Card>

            <Section
              title="Buổi học"
              subtitle="Chọn buổi để rà soát điểm danh"
            />
            <Card>
              <Text style={[styles.muted, { marginBottom: 8 }]}>
                Lớp: {lop?.ten_lop || "—"}
              </Text>
              <TouchableOpacity
                onPress={() => setShowSessionModal(true)}
                style={styles.selector}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ color: "white", fontWeight: "700" }}>
                    {selectedSession
                      ? `${fmtDateTime(selectedSession.start)}`
                      : "Chưa chọn buổi"}
                  </Text>
                  {!!selectedSession?.monhoc?.ten_mon && (
                    <Text style={{ color: "#9aa0a6" }}>
                      Môn: {selectedSession.monhoc.ten_mon}
                    </Text>
                  )}
                  {!!selectedSession && (
                    <Text style={{ color: "#9aa0a6", marginTop: 2 }}>
                      Đúng giờ: {selectedSession.ontime_min}’ · Trễ:{" "}
                      {selectedSession.tre_sau_phut}’
                    </Text>
                  )}
                </View>
                <View style={styles.pillPrimary}>
                  <Text style={{ color: "white", fontWeight: "700" }}>
                    Chọn buổi
                  </Text>
                </View>
              </TouchableOpacity>
            </Card>

            {selectedSession && (
              <>
                <Section
                  title="Rà soát điểm danh"
                  subtitle={`Buổi: ${fmtDateTime(
                    selectedSession.start
                  )} — ${fmtDateTime(selectedSession.end)}`}
                />
                <Card>
                  <View style={styles.statsRow}>
                    <View style={{ flexDirection: "row", gap: 12 }}>
                      <Text style={{ color: "#c9cdd1" }}>Tổng: {total}</Text>
                      <Text style={{ color: "#22c55e" }}>
                        Đúng giờ: {ontimeCount}
                      </Text>
                      <Text style={{ color: "#f59e0b" }}>Trễ: {lateCount}</Text>
                      <Text style={{ color: "#ef4444" }}>
                        Vắng: {absentCount}
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => loadAttendance()}
                      style={styles.refreshBtn}
                    >
                      <Text style={{ color: "white", fontWeight: "700" }}>
                        Làm mới
                      </Text>
                    </TouchableOpacity>
                  </View>

                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ paddingVertical: 4 }}
                  >
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      {[
                        { key: "all", label: "Tất cả" },
                        { key: "ontime", label: "Đúng giờ" },
                        { key: "late", label: "Trễ" },
                        { key: "absent", label: "Vắng" },
                      ].map((opt) => (
                        <TouchableOpacity
                          key={opt.key}
                          onPress={() => setStatusFilter(opt.key)}
                          style={[
                            styles.chip,
                            statusFilter === opt.key && styles.chipActive,
                          ]}
                        >
                          <Text
                            style={[
                              styles.chipText,
                              statusFilter === opt.key && styles.chipTextActive,
                            ]}
                          >
                            {opt.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>
                </Card>

                {/* Header bảng: nới full-width, căn cột khớp hàng */}
                <View
                  style={[
                    styles.tableHeader,
                    {
                      marginHorizontal: -PAGE_PAD,
                      paddingHorizontal: PAGE_PAD,
                      marginTop: 8,
                    },
                  ]}
                >
                  <Text style={[styles.cName, styles.headerText]}>Họ tên</Text>
                  <Text style={[styles.cCode, styles.headerText]}>Mã SV</Text>
                  <Text style={[styles.cWhen, styles.headerText]}>
                    Thời gian
                  </Text>
                  <Text style={[styles.cStatus, styles.headerText]}>
                    Trạng thái
                  </Text>
                </View>
              </>
            )}
          </View>
        }
        renderItem={({ item, index }) => {
          const color =
            item.status === "ontime"
              ? "#22c55e"
              : item.status === "late"
              ? "#f59e0b"
              : "#ef4444";
          const label =
            item.status === "ontime"
              ? "Đúng giờ"
              : item.status === "late"
              ? "Trễ"
              : "Vắng";
          const isLast =
            index === (selectedSession ? filteredRows.length : 0) - 1;

          return (
            <View
              style={[
                styles.row,
                {
                  backgroundColor: index % 2 === 0 ? "#0f1114" : "#151518",
                  borderLeftWidth: 1,
                  borderRightWidth: 1,
                  borderBottomWidth: 1,
                  borderColor: "#22262b",
                  borderBottomLeftRadius: isLast ? 12 : 0,
                  borderBottomRightRadius: isLast ? 12 : 0,
                },
              ]}
            >
              <Text
                style={[styles.cName, { color: "white", fontWeight: "700" }]}
                numberOfLines={1}
              >
                {item.ho_ten}
              </Text>
              <Text
                style={[styles.cCode, { color: "#a3aab3" }]}
                numberOfLines={1}
              >
                {item.ma_sv || "—"}
              </Text>
              <Text
                style={[styles.cWhen, { color: "#a3aab3" }]}
                numberOfLines={1}
              >
                {item.checkin_luc ? fmtDateTime(item.checkin_luc) : "—"}
              </Text>
              <Text
                style={[
                  styles.cStatus,
                  { color, fontWeight: "700", textAlign: "center" },
                ]}
                numberOfLines={1}
              >
                {label}
              </Text>
            </View>
          );
        }}
        ListEmptyComponent={
          <Text style={{ color: "#9aa0a6", padding: 16, textAlign: "center" }}>
            {selectedSession
              ? loadingRows
                ? "Đang tải..."
                : "Chưa có dữ liệu."
              : "Chưa chọn buổi."}
          </Text>
        }
        refreshControl={
          selectedSession ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                loadAttendance();
              }}
            />
          ) : undefined
        }
        contentContainerStyle={{
          paddingBottom: 40,
        }}
        showsVerticalScrollIndicator
        initialNumToRender={20}
        maxToRenderPerBatch={20}
        windowSize={7}
        removeClippedSubviews
        onScrollToIndexFailed={({ index, averageItemLength }) => {
          const est = (averageItemLength || 60) * index;
          listRef.current?.scrollToOffset?.({ offset: est, animated: true });
          setTimeout(() => {
            listRef.current?.scrollToIndex?.({
              index,
              animated: true,
              viewPosition: 1,
            });
          }, 120);
        }}
      />

      {/* Modal chọn buổi */}
      <Modal visible={showSessionModal} transparent animationType="slide">
        <View style={styles.modalWrap}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              Chọn buổi — {lop?.ten_lop || "—"}
            </Text>
            <TextInput
              style={styles.search}
              placeholder="Tìm theo môn hoặc thời gian…"
              placeholderTextColor="#9aa0a6"
              value={sessionQuery}
              onChangeText={setSessionQuery}
            />
            {loadingSessions ? (
              <ActivityIndicator />
            ) : (
              <FlatList
                data={filteredSessions}
                keyExtractor={(s) => String(s.id)}
                nestedScrollEnabled
                renderItem={({ item }) => {
                  const active = selectedSession?.id === item.id;
                  return (
                    <TouchableOpacity
                      onPress={() => {
                        setSelectedSession(item);
                        setShowSessionModal(false);
                      }}
                      style={[
                        styles.sessionRow,
                        active && { borderColor: "#2563eb" },
                      ]}
                    >
                      <View style={{ flex: 1 }}>
                        {!!item.monhoc?.ten_mon && (
                          <Text style={{ color: "#9aa0a6", marginBottom: 2 }}>
                            {item.monhoc.ten_mon}
                          </Text>
                        )}
                        <Text style={{ color: "white", fontWeight: "700" }}>
                          {fmtDateTime(item.start)}
                        </Text>
                        <Text style={{ color: "#9aa0a6" }}>
                          Kết thúc: {fmtDateTime(item.end)}
                        </Text>
                        <Text style={{ color: "#9aa0a6", marginTop: 2 }}>
                          Đúng giờ: {item.ontime_min}’ · Trễ:{" "}
                          {item.tre_sau_phut}’
                        </Text>
                      </View>
                      <View style={styles.pillPrimary}>
                        <Text style={{ color: "white", fontWeight: "700" }}>
                          Chọn
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                }}
                style={{ maxHeight: 420 }}
                ListEmptyComponent={
                  <Text style={{ color: "#9aa0a6" }}>
                    Không có buổi phù hợp.
                  </Text>
                }
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

      {/* Modal chọn giảng viên */}
      <Modal visible={showTeacherPicker} transparent animationType="fade">
        <View style={styles.modalWrap}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Chọn giảng viên</Text>

            {teachersForMon.length > 0 ? (
              <FlatList
                data={teachersForMon}
                keyExtractor={(i) => i.nguoi_dung_id}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    onPress={() => {
                      setSelectedTeacher(item);
                      setShowTeacherPicker(false);
                    }}
                    style={[
                      styles.sessionRow,
                      selectedTeacher?.nguoi_dung_id === item.nguoi_dung_id && {
                        borderColor: "#2563eb",
                      },
                    ]}
                  >
                    <Text style={{ color: "white", fontWeight: "700" }}>
                      {item.ho_ten || item.nguoi_dung_id}
                    </Text>
                  </TouchableOpacity>
                )}
                style={{ maxHeight: 420 }}
                ListEmptyComponent={
                  <Text style={{ color: "#9aa0a6" }}>Không có giảng viên.</Text>
                }
              />
            ) : (
              // Fallback: dùng TeacherPicker tổng nếu môn chưa có danh sách
              <TeacherPicker
                value={selectedTeacher?.nguoi_dung_id || null}
                onChange={(row) => {
                  if (row) setSelectedTeacher(row);
                  setShowTeacherPicker(false);
                }}
              />
            )}

            <TouchableOpacity
              style={styles.closeBtn}
              onPress={() => setShowTeacherPicker(false)}
            >
              <Text style={{ color: "white", fontWeight: "700" }}>Đóng</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Pickers */}
      <DateTimePickerModal
        isVisible={showStartPicker}
        mode="datetime"
        date={parseISO(startAt, new Date())}
        onConfirm={onPickStart}
        onCancel={() => setShowStartPicker(false)}
      />
      <DateTimePickerModal
        isVisible={showEndPicker}
        mode="datetime"
        date={parseISO(endAt, parseISO(startAt, new Date()))}
        onConfirm={onPickEnd}
        onCancel={() => setShowEndPicker(false)}
      />
    </SafeAreaView>
  );
}

/* ===== Styles ===== */
const styles = StyleSheet.create({
  muted: { color: "#9ca3af", marginBottom: 8 },
  mt: { marginTop: 12 },

  input: {
    backgroundColor: "#1a1d21",
    borderWidth: 1,
    borderColor: "#2a2e34",
    color: "white",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  inputWrap: { position: "relative" },
  inputIconTray: {
    position: "absolute",
    right: 8,
    top: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  iconBtn: {
    backgroundColor: "#2563eb",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },

  selector: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#1e2126",
    borderRadius: 12,
    padding: 12,
    backgroundColor: "#0f1114",
    gap: 10,
  },
  selectorRead: {
    backgroundColor: "#2d2f36",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  subjectItem: {
    backgroundColor: "#0f1114",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#1e2126",
    marginBottom: 8,
  },
  pillPrimary: {
    backgroundColor: "#2563eb",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
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
  sessionRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#1e2126",
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    backgroundColor: "#0f1114",
    gap: 10,
  },

  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#2a2e34",
    backgroundColor: "#151518",
  },
  chipActive: { backgroundColor: "#2563eb", borderColor: "#2563eb" },
  chipText: { color: "#c9cdd1", fontWeight: "700" },
  chipTextActive: { color: "white" },

  /* Table */
  tableHeader: {
    backgroundColor: "#101215",
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: "#22262b",
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  row: {
    paddingHorizontal: PAGE_PAD,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  headerText: { color: "#a3aab3", fontWeight: "700" },
  cName: { flex: 2.2 },
  cCode: { flex: 1.2 },
  cWhen: { flex: 1.8 },
  cStatus: { flex: 1.2, textAlign: "center" },

  /* Modal */
  modalWrap: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  modalCard: {
    maxHeight: "85%",
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
  closeBtn: {
    backgroundColor: "#2c7be5",
    alignSelf: "center",
    marginTop: 12,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  refreshBtn: {
    backgroundColor: "#374151",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
});
