import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  RefreshControl,
} from "react-native";
import { supabase } from "../../../lib/supabase";

const STATUS_ON_TIME = "dung_gio"; // enum chuẩn

export default function ManualAttendanceScreen({ route, navigation }) {
  const sessionId = route?.params?.buoihoc_id ?? null;
  const lopIdFromNav = route?.params?.lop_id ?? null;
  const tenLopFromNav = route?.params?.ten_lop ?? "";

  const [lopId, setLopId] = useState(lopIdFromNav);
  const [lopName, setLopName] = useState(tenLopFromNav);

  const [loadingMeta, setLoadingMeta] = useState(false);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [students, setStudents] = useState([]); // [{id, ho_ten, ma_sinh_vien, marked}]
  const [checked, setChecked] = useState({}); // id => boolean
  const [q, setQ] = useState("");

  // Lấy lop_id từ buổi nếu chưa có
  useEffect(() => {
    (async () => {
      if (lopId || !sessionId) return;
      setLoadingMeta(true);
      const { data: bh, error } = await supabase
        .from("buoihoc")
        .select("lop_id")
        .eq("id", sessionId)
        .maybeSingle();
      if (error) {
        setLoadingMeta(false);
        Alert.alert("Lỗi", error.message);
        return;
      }
      if (bh?.lop_id) {
        setLopId(bh.lop_id);
        const { data: lop } = await supabase
          .from("lop")
          .select("ten_lop")
          .eq("id", bh.lop_id)
          .maybeSingle();
        setLopName(lop?.ten_lop ?? "");
      }
      setLoadingMeta(false);
    })();
  }, [sessionId, lopId]);

  // Nếu có lopId mà chưa có tên → nạp
  useEffect(() => {
    (async () => {
      if (!lopId || lopName) return;
      const { data } = await supabase
        .from("lop")
        .select("ten_lop")
        .eq("id", lopId)
        .maybeSingle();
      setLopName(data?.ten_lop ?? "");
    })();
  }, [lopId, lopName]);

  // Tải danh sách theo buổi: đã join sẵn tên & tình trạng
  const loadStudents = useCallback(async () => {
    if (!sessionId) return;
    try {
      setLoading(true);
      const { data, error } = await supabase.rpc("get_attendance_list", {
        p_buoihoc_id: sessionId,
      });
      if (error) throw error;

      const rows = (data ?? []).map((r) => ({
        id: String(r.sinh_vien_id),
        ho_ten: r.ho_ten || "(Chưa có tên)",
        ma_sinh_vien: r.ma_sinh_vien || "",
        marked: r.trang_thai && r.trang_thai !== "vang",
      }));
      setStudents(rows);

      // pre-check những bạn đã có mặt
      const initial = {};
      rows.forEach((r) => {
        if (r.marked) initial[r.id] = true;
      });
      setChecked(initial);
    } catch (e) {
      Alert.alert("Lỗi", e?.message || "Không tải được danh sách.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [sessionId]);

  useEffect(() => {
    loadStudents();
  }, [loadStudents]);

  const filtered = useMemo(() => {
    const s = (q || "").trim().toLowerCase();
    if (!s) return students;
    return students.filter(
      (x) =>
        (x.ho_ten || "").toLowerCase().includes(s) ||
        (x.ma_sinh_vien || "").toLowerCase().includes(s)
    );
  }, [students, q]);

  const toggle = (id) => setChecked((prev) => ({ ...prev, [id]: !prev[id] }));
  const selectAll = () =>
    setChecked(Object.fromEntries(filtered.map((s) => [s.id, true])));
  const clearAll = () =>
    setChecked(Object.fromEntries(filtered.map((s) => [s.id, false])));

  const onRefresh = () => {
    setRefreshing(true);
    loadStudents();
  };

  const save = async () => {
    if (!sessionId) {
      return Alert.alert("Thiếu thông tin", "Cần buoihoc_id để lưu điểm danh.");
    }
    const chosen = Object.entries(checked)
      .filter(([, v]) => v)
      .map(([id]) => id);
    if (!chosen.length)
      return Alert.alert("Thông báo", "Bạn chưa chọn sinh viên nào.");

    try {
      // Lưu từng người bằng RPC thu công (server sẽ cast enum)
      await Promise.all(
        chosen.map((uid) =>
          supabase.rpc("insert_diemdanh_thucong", {
            p_buoihoc: sessionId,
            p_sinhvien: uid,
            p_trang_thai: STATUS_ON_TIME,
          })
        )
      );
      Alert.alert("Thành công", "Đã lưu điểm danh.");
      loadStudents();
    } catch (e) {
      Alert.alert("Lỗi lưu điểm danh", e?.message || String(e));
    }
  };

  const renderItem = ({ item }) => {
    const selected = !!checked[item.id];
    return (
      <TouchableOpacity
        style={[styles.student, selected && styles.studentOn]}
        onPress={() => toggle(item.id)}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{item.ho_ten}</Text>
          <Text style={styles.code}>{item.ma_sinh_vien}</Text>
        </View>
        <Text
          style={[styles.badge, selected ? styles.badgeOn : styles.badgeOff]}
        >
          {selected ? "Có mặt" : "—"}
        </Text>
      </TouchableOpacity>
    );
  };

  const selectedCount = useMemo(
    () => Object.values(checked).filter(Boolean).length,
    [checked]
  );

  return (
    <View style={styles.container}>
      <Text style={styles.header}>
        Điểm danh thủ công {lopName ? `· ${lopName}` : ""}
      </Text>

      <View style={styles.tools}>
        <TextInput
          placeholder="Tìm theo tên / mã SV..."
          placeholderTextColor="#9aa0a6"
          value={q}
          onChangeText={setQ}
          style={styles.search}
        />
        <TouchableOpacity onPress={selectAll} style={styles.toolBtn}>
          <Text style={styles.toolText}>Chọn hết</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={clearAll} style={styles.toolBtn}>
          <Text style={styles.toolText}>Bỏ chọn</Text>
        </TouchableOpacity>
      </View>

      {loadingMeta || loading ? (
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(it) => it.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listPad}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={{ color: "#c9cdd1" }}>
                {lopId
                  ? "Chưa có sinh viên trong lớp."
                  : "Không xác định được lớp."}
              </Text>
            </View>
          }
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        />
      )}

      <View style={styles.footerBar}>
        <Text style={{ color: "#c9cdd1" }}>Đã chọn: {selectedCount}</Text>
        <TouchableOpacity style={styles.fab} onPress={save}>
          <Text style={styles.fabText}>Lưu</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0b0b0c" },
  header: { fontSize: 18, fontWeight: "600", color: "white", padding: 16 },
  tools: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    marginBottom: 4,
    gap: 8,
  },
  search: {
    flex: 1,
    backgroundColor: "#151518",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "white",
    borderWidth: 1,
    borderColor: "#232329",
  },
  toolBtn: {
    backgroundColor: "#1e1f24",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "#2a2b30",
  },
  toolText: { color: "#c9cdd1", fontSize: 12, fontWeight: "600" },
  listPad: { padding: 12, paddingBottom: 100 },
  student: {
    backgroundColor: "#151518",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#232329",
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
  },
  studentOn: { borderColor: "#2c7be5" },
  name: { color: "white", fontSize: 16, fontWeight: "600" },
  code: { color: "#9aa0a6", marginTop: 2 },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    fontWeight: "700",
    overflow: "hidden",
  },
  badgeOn: { color: "white", backgroundColor: "#2c7be5" },
  badgeOff: { color: "#9aa0a6", backgroundColor: "#1e1f24" },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  empty: { padding: 24, alignItems: "center" },
  footerBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "#0e0f12",
    borderTopWidth: 1,
    borderTopColor: "#1e1f24",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  fab: {
    backgroundColor: "#2c7be5",
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 20,
    elevation: 4,
  },
  fabText: { color: "white", fontSize: 16, fontWeight: "700" },
});
