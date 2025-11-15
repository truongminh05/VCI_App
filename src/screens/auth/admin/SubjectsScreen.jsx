// screens/admin/SubjectsScreen.jsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
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
  Modal,
} from "react-native";
import Section from "../../../components/Section";
import Card from "../../../components/Card";
import Button from "../../../components/Button";
import { supabase } from "../../../lib/supabase";
import { TeacherPicker } from "../../../components/TeacherPicker"; // dùng named import

/** Item UI nhỏ gọn cho 1 môn */
function SubjectItem({ item, selected, onPress }) {
  return (
    <TouchableOpacity
      onPress={() => onPress?.(item)}
      style={[styles.row, selected?.id === item.id && styles.rowActive]}
    >
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>{item.ten_mon}</Text>
        <Text style={styles.sub}>Mã môn: {item.ma_mon}</Text>
      </View>
      {selected?.id === item.id && (
        <Text style={styles.badgeSel}>Đang chọn</Text>
      )}
    </TouchableOpacity>
  );
}

export default function SubjectsScreen() {
  // CRUD môn học
  const [loading, setLoading] = useState(false);
  const [subjects, setSubjects] = useState([]);
  const [search, setSearch] = useState("");

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);

  // Chọn môn để gán GV
  const [selected, setSelected] = useState(null);

  // Gán GV
  const [assigning, setAssigning] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [assignedTeachers, setAssignedTeachers] = useState([]);
  const [loadingAssigned, setLoadingAssigned] = useState(false);

  // ====== LOAD MÔN ======
  const loadSubjects = useCallback(async () => {
    try {
      setLoading(true);
      const base = supabase.from("monhoc").select("id, ma_mon, ten_mon");

      if (search.trim()) {
        const s = search.trim();
        const [{ data: byCode, error: e1 }, { data: byName, error: e2 }] =
          await Promise.all([
            base.ilike("ma_mon", `%${s}%`),
            supabase
              .from("monhoc")
              .select("id, ma_mon, ten_mon")
              .ilike("ten_mon", `%${s}%`),
          ]);
        if (e1) throw e1;
        if (e2) throw e2;
        const map = new Map();
        (byCode || []).forEach((r) => map.set(r.id, r));
        (byName || []).forEach((r) => map.set(r.id, r));
        const merged = Array.from(map.values()).sort((a, b) =>
          a.ten_mon.localeCompare(b.ten_mon)
        );
        setSubjects(merged);
      } else {
        const { data, error } = await base.order("ten_mon", {
          ascending: true,
        });
        if (error) throw error;
        setSubjects(data || []);
      }
    } catch (e) {
      Alert.alert("Lỗi", e.message || "Không tải được danh sách môn.");
    } finally {
      setLoading(false);
    }
  }, [search]);
  useEffect(() => {
    // nghe mọi thay đổi trên bảng monhoc
    const channel = supabase
      .channel("realtime_monhoc_admin")
      .on(
        "postgres_changes",
        {
          event: "*", // INSERT / UPDATE / DELETE
          schema: "public",
          table: "monhoc",
        },
        () => {
          // có môn mới / sửa / xóa -> tải lại danh sách
          loadSubjects();
        }
      )
      .subscribe();

    // cleanup khi rời màn
    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadSubjects]);

  useEffect(() => {
    loadSubjects();
  }, [loadSubjects]);

  // ====== TẠO MÔN ======
  const createSubject = async () => {
    const ma = (code || "").trim().toUpperCase();
    const ten = (name || "").trim();
    if (!ma || !ten) {
      Alert.alert("Thiếu thông tin", "Vui lòng nhập đủ Mã môn và Tên môn.");
      return;
    }
    try {
      setCreating(true);
      const { error } = await supabase
        .from("monhoc")
        .insert({ ma_mon: ma, ten_mon: ten });
      if (error) {
        if (
          String(error.message || "")
            .toLowerCase()
            .includes("duplicate")
        )
          throw new Error("Mã môn đã tồn tại.");
        throw error;
      }
      setCode("");
      setName("");
      await loadSubjects();
      Alert.alert("Thành công", "Đã tạo môn học.");
    } catch (e) {
      Alert.alert("Lỗi", e.message || "Không tạo được môn học.");
    } finally {
      setCreating(false);
    }
  };

  // ====== LOAD GV ĐÃ GÁN CHO MÔN (khi chọn) ======
  const loadAssigned = useCallback(async (subjectId) => {
    if (!subjectId) return;
    try {
      setLoadingAssigned(true);
      const { data: pairs, error } = await supabase
        .from("giangday")
        .select("giang_vien_id")
        .eq("monhoc_id", subjectId);
      if (error) throw error;

      const ids = (pairs || []).map((r) => r.giang_vien_id);
      if (!ids.length) {
        setAssignedTeachers([]);
        return;
      }
      const { data: hosos, error: e2 } = await supabase
        .from("hoso")
        .select("nguoi_dung_id, ho_ten, da_vo_hieu_hoa_luc")
        .in("nguoi_dung_id", ids);
      if (e2) throw e2;

      const ordered = ids
        .map((id) => hosos?.find((h) => h.nguoi_dung_id === id))
        .filter(Boolean);

      setAssignedTeachers(ordered || []);
    } catch (e) {
      Alert.alert("Lỗi", e.message || "Không tải được giảng viên đã gán.");
      setAssignedTeachers([]);
    } finally {
      setLoadingAssigned(false);
    }
  }, []);

  useEffect(() => {
    if (selected?.id) loadAssigned(selected.id);
  }, [selected?.id, loadAssigned]);

  // ====== GÁN GV → MÔN ======
  const handleAddTeacher = async (teacherRow) => {
    if (!selected?.id || !teacherRow?.nguoi_dung_id) return;
    try {
      setAssigning(true);
      const { error } = await supabase.from("giangday").insert({
        giang_vien_id: teacherRow.nguoi_dung_id,
        monhoc_id: selected.id,
      });
      if (error) {
        if (
          String(error.message || "")
            .toLowerCase()
            .includes("duplicate")
        ) {
          setShowPicker(false);
          await loadAssigned(selected.id);
          return;
        }
        throw error;
      }
      setShowPicker(false);
      await loadAssigned(selected.id);
    } catch (e) {
      Alert.alert("Lỗi", e.message || "Không gán được giảng viên.");
    } finally {
      setAssigning(false);
    }
  };

  // ====== BỎ GÁN GV ← MÔN ======
  const handleRemoveTeacher = async (teacherId) => {
    if (!selected?.id || !teacherId) return;
    try {
      setRemoving(true);
      const { error } = await supabase
        .from("giangday")
        .delete()
        .eq("giang_vien_id", teacherId)
        .eq("monhoc_id", selected.id);
      if (error) throw error;
      await loadAssigned(selected.id);
    } catch (e) {
      Alert.alert("Lỗi", e.message || "Không bỏ gán được giảng viên.");
    } finally {
      setRemoving(false);
    }
  };

  const filteredSubjects = useMemo(() => subjects, [subjects]);

  // ====== HEADER & FOOTER (để FlatList cuộn cả trang) ======
  const ListHeader = (
    <View style={{ gap: 16 }}>
      <Section title="Môn học" subtitle="Tạo/sửa môn và phân công giảng viên" />
      <Card>
        <Text className="text-zinc-400 mb-2">Mã môn</Text>
        <TextInput
          style={styles.input}
          placeholder="VD: CTDL"
          placeholderTextColor="#6b7280"
          autoCapitalize="characters"
          value={code}
          onChangeText={(t) => setCode((t || "").toUpperCase())}
        />

        <Text className="text-zinc-400 mt-3 mb-2">Tên môn</Text>
        <TextInput
          style={styles.input}
          placeholder="Cấu trúc dữ liệu"
          placeholderTextColor="#6b7280"
          value={name}
          onChangeText={setName}
        />

        <Button
          className="mt-4"
          title={creating ? "Đang tạo..." : "Tạo môn học"}
          onPress={createSubject}
          disabled={creating}
        />
      </Card>

      <Card>
        <TextInput
          style={[styles.input, { marginBottom: 10 }]}
          placeholder="Tìm theo mã hoặc tên môn…"
          placeholderTextColor="#6b7280"
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
        />
        {/* Ghi chú: KHÔNG render FlatList lồng bên trong để tránh cảnh báo nested VirtualizedList */}
        {/* Danh sách môn sẽ dùng chính FlatList cha (renderItem phía dưới) */}
      </Card>
    </View>
  );

  const ListFooter = selected ? (
    <Card>
      <Text className="text-zinc-300 text-base font-semibold">
        Phân công giảng viên — {selected.ten_mon} ({selected.ma_mon})
      </Text>
      <View style={{ height: 10 }} />
      <Button
        title={assigning ? "Đang thêm..." : "Thêm giảng viên"}
        onPress={() => setShowPicker(true)}
        disabled={assigning}
      />
      <View style={{ height: 10 }} />
      {loadingAssigned ? (
        <ActivityIndicator />
      ) : assignedTeachers.length === 0 ? (
        <Text style={styles.empty}>Chưa có giảng viên nào.</Text>
      ) : (
        assignedTeachers.map((t) => (
          <View key={t.nguoi_dung_id} style={styles.teacherRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{t.ho_ten || t.nguoi_dung_id}</Text>
              {t.da_vo_hieu_hoa_luc && (
                <Text style={styles.warn}>Đã vô hiệu hoá</Text>
              )}
            </View>
            <TouchableOpacity
              onPress={() => handleRemoveTeacher(t.nguoi_dung_id)}
              disabled={removing}
              style={styles.removeBtn}
            >
              <Text style={{ color: "white", fontWeight: "700" }}>
                {removing ? "..." : "Bỏ gán"}
              </Text>
            </TouchableOpacity>
          </View>
        ))
      )}
    </Card>
  ) : null;

  return (
    <SafeAreaView className="bg-black flex-1">
      <FlatList
        data={filteredSubjects}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <SubjectItem item={item} selected={selected} onPress={setSelected} />
        )}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        ListHeaderComponent={ListHeader}
        ListFooterComponent={ListFooter}
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingBottom: 24,
          gap: 16,
        }}
        // Cho phép kéo để refresh
        refreshing={loading}
        onRefresh={loadSubjects}
        // Nếu rỗng: spinner khi loading, còn không thì thông báo
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator />
          ) : (
            <Text style={styles.empty}>Không có môn phù hợp.</Text>
          )
        }
      />

      {/* TeacherPicker modal */}
      <Modal
        visible={showPicker}
        animationType="slide"
        onRequestClose={() => setShowPicker(false)}
        transparent
      >
        <View style={styles.modalWrap}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Chọn giảng viên</Text>
            <TeacherPicker
              value={null}
              onChange={(row) => {
                if (row) handleAddTeacher(row);
              }}
            />
            <Button title="Đóng" onPress={() => setShowPicker(false)} />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  input: {
    backgroundColor: "#1a1d21",
    borderWidth: 1,
    borderColor: "#2a2e34",
    color: "white",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  row: {
    backgroundColor: "#121418",
    borderWidth: 1,
    borderColor: "#2a2e34",
    borderRadius: 12,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  rowActive: {
    borderColor: "#2563eb",
  },
  title: {
    color: "white",
    fontWeight: "700",
  },
  sub: {
    color: "#94a3b8",
    marginTop: 2,
  },
  empty: {
    color: "#94a3b8",
    textAlign: "center",
    paddingVertical: 10,
  },
  badgeSel: {
    backgroundColor: "#2563eb",
    color: "white",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    fontWeight: "700",
    overflow: "hidden",
  },
  teacherRow: {
    backgroundColor: "#121418",
    borderWidth: 1,
    borderColor: "#2a2e34",
    borderRadius: 12,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
  },
  warn: {
    color: "#f59e0b",
    marginTop: 2,
    fontSize: 12,
  },
  removeBtn: {
    backgroundColor: "#ef4444",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  modalWrap: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    padding: 20,
  },
  modalCard: {
    backgroundColor: "#0b0d10",
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  modalTitle: {
    color: "white",
    fontWeight: "800",
    fontSize: 16,
    marginBottom: 6,
  },
});
