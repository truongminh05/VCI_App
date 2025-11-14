// screens/student/StudentScheduleScreen.jsx
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
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StyleSheet,
  Modal,
  TextInput,
  RefreshControl,
} from "react-native";
import Card from "../../components/Card";
import Section from "../../components/Section";
import Button from "../../components/Button";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";

const PAD = 20;

function fmt(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

/** Bộ chọn LỚP chỉ lấy lớp mà SV đã đăng ký */
function MyClassPicker({ value, onChange }) {
  const [modal, setModal] = useState(false);
  const [query, setQuery] = useState("");
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      // lấy các lớp mà SV đã đăng ký
      const { data, error } = await supabase
        .from("dangky")
        .select("lop:lop_id ( id, ten_lop )")
        .order("lop(ten_lop)", { ascending: true });
      if (error) throw error;

      const items =
        (data || [])
          .map((x) => x.lop)
          .filter(Boolean)
          .reduce((acc, it) => {
            // unique theo id
            if (!acc.find((a) => a.id === it.id)) acc.push(it);
            return acc;
          }, []) || [];

      setList(items);
      if (!value && items.length) onChange?.(items[0]);
    } catch (e) {
      Alert.alert("Lỗi", e.message || "Không tải được lớp.");
    } finally {
      setLoading(false);
    }
  }, [value, onChange]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((c) => (c.ten_lop || "").toLowerCase().includes(q));
  }, [list, query]);

  return (
    <>
      <TouchableOpacity style={styles.selector} onPress={() => setModal(true)}>
        <Text style={{ color: "white", fontWeight: "700" }}>
          {value?.ten_lop || "Chọn lớp"}
        </Text>
        <View style={styles.pillPrimary}>
          <Text style={{ color: "white", fontWeight: "700" }}>Đổi lớp</Text>
        </View>
      </TouchableOpacity>

      <Modal visible={modal} transparent animationType="slide">
        <View style={styles.modalWrap}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Chọn lớp của bạn</Text>
            <TextInput
              style={styles.search}
              placeholder="Tìm lớp…"
              placeholderTextColor="#9aa0a6"
              value={query}
              onChangeText={setQuery}
            />
            {loading ? (
              <ActivityIndicator />
            ) : (
              <FlatList
                data={filtered}
                keyExtractor={(x) => x.id}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.option}
                    onPress={() => {
                      onChange?.(item);
                      setModal(false);
                      setQuery("");
                    }}
                  >
                    <Text style={{ color: "white" }}>{item.ten_lop}</Text>
                  </TouchableOpacity>
                )}
                ListEmptyComponent={
                  <Text style={{ color: "#9aa0a6" }}>Bạn chưa có lớp.</Text>
                }
                style={{ maxHeight: 420 }}
              />
            )}
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={() => setModal(false)}
            >
              <Text style={{ color: "white", fontWeight: "700" }}>Đóng</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

export default function StudentScheduleScreen() {
  const { user } = useAuth(); // chỉ để chắc chắn đã đăng nhập
  const listRef = useRef(null);

  // lớp được chọn
  const [lop, setLop] = useState(null);

  // filter
  const [scope, setScope] = useState("upcoming"); // 'upcoming' | 'all'

  // sessions
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [sessions, setSessions] = useState([]);

  const load = useCallback(async (lopId) => {
    if (!lopId) {
      setSessions([]);
      return;
    }
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("buoihoc")
        .select(
          "id, lop_id, thoi_gian_bat_dau, thoi_gian_ket_thuc, monhoc:monhoc_id ( ten_mon )"
        )
        .eq("lop_id", lopId)
        .order("thoi_gian_bat_dau", { ascending: true })
        .limit(200);
      if (error) throw error;
      setSessions(
        (data || []).map((b) => ({
          id: b.id,
          start: b.thoi_gian_bat_dau,
          end: b.thoi_gian_ket_thuc,
          mon: b.monhoc?.ten_mon || "",
        }))
      );
    } catch (e) {
      Alert.alert("Lỗi", e.message || "Không tải được lịch học.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (lop?.id) load(lop.id);
    else setSessions([]);
  }, [lop?.id, load]);

  const now = Date.now();
  const data = useMemo(() => {
    if (scope === "upcoming") {
      return sessions.filter((s) => {
        const t = new Date(s.end).getTime();
        return !Number.isNaN(t) && t >= now;
      });
    }
    return sessions;
  }, [sessions, scope, now]);

  const Header = () => (
    <View>
      <Section
        title="Lịch học của tôi"
        subtitle="Xem lịch theo lớp đã đăng ký"
      />
      <Card>
        <Text style={styles.muted}>Lớp đang xem</Text>
        <MyClassPicker value={lop} onChange={setLop} />

        <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
          {[
            { k: "upcoming", label: "Sắp tới" },
            { k: "all", label: "Tất cả" },
          ].map((opt) => (
            <TouchableOpacity
              key={opt.k}
              onPress={() => setScope(opt.k)}
              style={[styles.chip, scope === opt.k && styles.chipActive]}
            >
              <Text
                style={[
                  styles.chipText,
                  scope === opt.k && styles.chipTextActive,
                ]}
              >
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </Card>

      {/* Header bảng */}
      <View style={styles.tableHeader}>
        <Text style={[styles.cMon, styles.headerText]}>Môn</Text>
        <Text style={[styles.cTime, styles.headerText]}>Bắt đầu</Text>
        <Text style={[styles.cTime, styles.headerText]}>Kết thúc</Text>
      </View>
    </View>
  );

  return (
    <SafeAreaView className="bg-black flex-1">
      <FlatList
        ref={listRef}
        data={data}
        keyExtractor={(x) => String(x.id)}
        renderItem={({ item, index }) => {
          const isLast = index === data.length - 1;
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
                style={[styles.cMon, { color: "white", fontWeight: "700" }]}
                numberOfLines={1}
              >
                {item.mon || "—"}
              </Text>
              <Text
                style={[styles.cTime, { color: "#c9cdd1" }]}
                numberOfLines={1}
              >
                {fmt(item.start)}
              </Text>
              <Text
                style={[styles.cTime, { color: "#c9cdd1" }]}
                numberOfLines={1}
              >
                {fmt(item.end)}
              </Text>
            </View>
          );
        }}
        ListHeaderComponent={<Header />}
        ListEmptyComponent={
          loading ? (
            <View style={{ padding: 16, alignItems: "center" }}>
              <ActivityIndicator />
            </View>
          ) : (
            <Text
              style={{ color: "#9aa0a6", padding: 16, textAlign: "center" }}
            >
              {lop?.id ? "Không có buổi phù hợp." : "Bạn chưa chọn lớp."}
            </Text>
          )
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              if (lop?.id) load(lop.id);
              else setRefreshing(false);
            }}
          />
        }
        contentContainerStyle={{ paddingHorizontal: PAD, paddingBottom: 40 }}
        initialNumToRender={20}
        maxToRenderPerBatch={20}
        windowSize={8}
        removeClippedSubviews
        showsVerticalScrollIndicator
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  muted: { color: "#9ca3af", marginBottom: 8 },

  selector: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#1e2126",
    borderRadius: 12,
    padding: 12,
    backgroundColor: "#0f1114",
    gap: 10,
    justifyContent: "space-between",
  },
  pillPrimary: {
    backgroundColor: "#2563eb",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },

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

  /* Chips */
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
    marginTop: 12,
    backgroundColor: "#101215",
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: "#22262b",
    paddingHorizontal: PAD,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  row: {
    paddingHorizontal: PAD,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  headerText: { color: "#a3aab3", fontWeight: "700" },
  cMon: { flex: 1.4 },
  cTime: { flex: 1.6 },
});
