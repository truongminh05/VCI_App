// screens/admin/ClassesScreen.jsx
import React, { useCallback, useEffect, useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Modal,
  ScrollView,
  useWindowDimensions,
} from "react-native";
import Section from "../../../components/Section";
import Card from "../../../components/Card";
import Button from "../../../components/Button";
import { ClassPicker } from "../../../components/ClassPicker";
import { supabase } from "../../../lib/supabase";

// ====== Excel ======
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import * as XLSX from "xlsx";

export default function ClassesScreen() {
  const { width } = useWindowDimensions();
  const isCompact = width < 380; // Màn nhỏ: ưu tiên xuống hàng nhanh hơn

  // --- chọn lớp ---
  const [selectedClass, setSelectedClass] = useState(null);
  const [classes, setClasses] = useState([]);
  const [loadingClasses, setLoadingClasses] = useState(false);

  // --- tạo lớp ---
  const [newClassName, setNewClassName] = useState("");
  const [newClassCode, setNewClassCode] = useState("");
  const [creatingClass, setCreatingClass] = useState(false);

  // --- roster modal ---
  const [showRoster, setShowRoster] = useState(false);
  const [loadingRoster, setLoadingRoster] = useState(false);
  const [roster, setRoster] = useState([]); // [{id, ho_ten, ma_sinh_vien, noAccount?:true}]

  // --- edit 1 dòng (chỉ áp dụng với SV đã có tài khoản) ---
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editCode, setEditCode] = useState("");

  // --- thêm SV đơn lẻ ---
  const [candidates, setCandidates] = useState([]);
  const [candidateQuery, setCandidateQuery] = useState("");
  const [searching, setSearching] = useState(false);

  // --- Excel ---
  const [importing, setImporting] = useState(false);
  // Khi đang mở roster và có thay đổi dangky của lớp -> tự reload
  useEffect(() => {
    const lopId = selectedClass?.id;
    if (!showRoster || !lopId) return;

    const channel = supabase
      .channel(`realtime_roster_${lopId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "dangky",
          filter: `lop_id=eq.${lopId}`,
        },
        () => {
          // reload danh sách sinh viên trong modal
          openRoster({ id: lopId });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [showRoster, selectedClass?.id]);

  // ================= LỚP =================
  const loadClasses = useCallback(async () => {
    try {
      setLoadingClasses(true);
      const { data, error } = await supabase
        .from("lop")
        .select("id, ten_lop")
        .order("ten_lop");
      if (error) throw error;
      setClasses(data || []);
      if (!selectedClass && (data || []).length) setSelectedClass(data[0]);
    } catch (e) {
      Alert.alert("Lỗi", e.message || "Không tải được lớp.");
    } finally {
      setLoadingClasses(false);
    }
  }, [selectedClass]);

  useEffect(() => {
    loadClasses();
  }, [loadClasses]);

  // ====== TẠO LỚP (Tên + Mã) ======
  const createClass = async () => {
    const name = (newClassName || "").trim();
    const code = (newClassCode || "").trim();
    if (!name) return Alert.alert("Thiếu", "Vui lòng nhập Tên lớp.");
    if (!code) return Alert.alert("Thiếu", "Vui lòng nhập Mã lớp.");

    try {
      setCreatingClass(true);

      // Thử RPC nếu bạn có (bypass RLS). Ký hiệu: admin_create_lop(name, code)
      let createdId = null;
      const tryRpc = await supabase.rpc("admin_create_lop", {
        p_ten_lop: name,
        p_ma_lop: code,
      });

      if (tryRpc.error) {
        const notExist =
          /function .*admin_create_lop/i.test(tryRpc.error.message) ||
          /does not exist/i.test(tryRpc.error.message);
        if (!notExist) throw tryRpc.error;

        const { data: ins, error: e2 } = await supabase
          .from("lop")
          .insert({ ten_lop: name, ma_lop: code })
          .select("id, ten_lop")
          .maybeSingle();
        if (e2) throw e2;
        createdId = ins?.id || null;
      } else {
        createdId = tryRpc.data || null;
      }

      await loadClasses();
      if (createdId) {
        setSelectedClass({ id: createdId, ten_lop: name });
      }
      setNewClassName("");
      setNewClassCode("");
      Alert.alert("OK", "Đã tạo lớp thành công.");
    } catch (e) {
      const msg = /column "ma_lop" does not exist/i.test(String(e?.message))
        ? "Bảng 'lop' chưa có cột 'ma_lop'. Vui lòng thêm cột rồi thử lại."
        : e?.message || "Không tạo được lớp.";
      Alert.alert("Lỗi tạo lớp", msg);
    } finally {
      setCreatingClass(false);
    }
  };

  // =============== ROSTER (gộp có-tài-khoản & nhập Excel) ===============
  const openRoster = async (lop) => {
    if (!lop?.id) return;
    setShowRoster(true);
    setRoster([]);
    setEditingId(null);

    try {
      setLoadingRoster(true);

      // a) SV đã có tài khoản -> từ dangky join hoso
      const { data: enrolls, error: e1 } = await supabase
        .from("dangky")
        .select("sinh_vien_id")
        .eq("lop_id", lop.id);
      if (e1) throw e1;
      const ids = (enrolls ?? []).map((x) => x.sinh_vien_id);

      let rosterAccounts = [];
      if (ids.length) {
        const { data: profiles, error: e2 } = await supabase
          .from("hoso")
          .select("nguoi_dung_id, ho_ten, ma_sinh_vien")
          .in("nguoi_dung_id", ids);
        if (e2) throw e2;

        rosterAccounts = (profiles || []).map((p) => ({
          id: p.nguoi_dung_id,
          ho_ten: p.ho_ten ?? "(Chưa có tên)",
          ma_sinh_vien: p.ma_sinh_vien ?? "",
        }));
      }

      // b) SV nhập Excel (chưa có tài khoản) -> từ dangky_import
      const { data: improts, error: e3 } = await supabase
        .from("dangky_import")
        .select("id, ho_ten, ma_sinh_vien")
        .eq("lop_id", lop.id)
        .order("created_at", { ascending: true });
      if (e3) throw e3;

      const rosterImported = (improts || []).map((r) => ({
        id: `imp:${r.id}`,
        ho_ten: r.ho_ten,
        ma_sinh_vien: r.ma_sinh_vien ?? "",
        noAccount: true,
      }));

      const merged = [...rosterAccounts, ...rosterImported].sort((a, b) =>
        a.ho_ten.localeCompare(b.ho_ten, "vi")
      );

      setRoster(merged);
    } catch (e) {
      Alert.alert("Lỗi", e.message || "Không tải được sinh viên.");
    } finally {
      setLoadingRoster(false);
    }
  };

  // =============== ACTIONS qua RPC (bypass RLS) ===============
  const addToClass = async (userId) => {
    try {
      const { error } = await supabase.rpc("admin_add_student_to_class", {
        p_lop_id: selectedClass.id,
        p_sinh_vien_id: userId,
      });
      if (error) throw error;

      openRoster(selectedClass);
      setCandidates((prev) => prev.filter((c) => c.id !== userId));
    } catch (e) {
      const msg = /FORBIDDEN/.test(String(e?.message))
        ? "Bạn không phải Admin."
        : e?.message || "Không thêm được sinh viên.";
      Alert.alert("Lỗi", msg);
    }
  };

  const removeAccountFromClass = async (userId) => {
    try {
      const { error } = await supabase.rpc("admin_remove_student_from_class", {
        p_lop_id: selectedClass.id,
        p_sinh_vien_id: userId,
      });
      if (error) throw error;
      setRoster((prev) => prev.filter((x) => x.id !== userId));
    } catch (e) {
      const msg = /FORBIDDEN/.test(String(e?.message))
        ? "Bạn không phải Admin."
        : e?.message || "Không xóa được sinh viên.";
      Alert.alert("Lỗi", msg);
    }
  };

  const saveEdit = async () => {
    const uid = editingId;
    if (!uid) return;
    try {
      const { error } = await supabase.rpc("admin_update_student_profile", {
        p_user_id: uid,
        p_ho_ten: (editName || "").trim(),
        p_ma_sv: (editCode || "").trim(),
      });
      if (error) throw error;
      setRoster((prev) =>
        prev.map((r) =>
          r.id === uid ? { ...r, ho_ten: editName, ma_sinh_vien: editCode } : r
        )
      );
      setEditingId(null);
      setEditName("");
      setEditCode("");
    } catch (e) {
      const msg = /FORBIDDEN/.test(String(e?.message))
        ? "Bạn không phải Admin."
        : e?.message || "Không lưu được chỉnh sửa.";
      Alert.alert("Lỗi", msg);
    }
  };

  // =============== Ứng viên thêm mới (chỉ vai trò sinh viên, ẩn người đã trong lớp) ===============
  const searchCandidates = useCallback(async () => {
    if (!showRoster || !selectedClass?.id) return;
    try {
      setSearching(true);

      // Lấy toàn bộ sinh viên đã thuộc bất kỳ lớp nào (bảng dangky)
      const { data: allEnrolls, error: enrollError } = await supabase
        .from("dangky")
        .select("sinh_vien_id");
      if (enrollError) throw enrollError;

      const usedIds = new Set((allEnrolls || []).map((x) => x.sinh_vien_id));

      const kw = (candidateQuery || "").trim();
      let q = supabase
        .from("hoso")
        .select("nguoi_dung_id, ho_ten, ma_sinh_vien, vai_tro")
        .eq("vai_tro", "sinhvien")
        .limit(60);

      if (kw) {
        q = q.or(`ho_ten.ilike.%${kw}%,ma_sinh_vien.ilike.%${kw}%`);
      }

      const { data, error } = await q;
      if (error) throw error;

      const filtered = (data || [])
        // Chỉ lấy sinh viên CHƯA thuộc bất kỳ lớp nào
        .filter((p) => !usedIds.has(p.nguoi_dung_id))
        .map((p) => ({
          id: p.nguoi_dung_id,
          ho_ten: p.ho_ten ?? "(Chưa có tên)",
          ma_sinh_vien: p.ma_sinh_vien ?? "",
        }));

      setCandidates(filtered);
    } catch (e) {
      Alert.alert("Lỗi", e.message || "Không tìm được ứng viên.");
    } finally {
      setSearching(false);
    }
  }, [candidateQuery, showRoster, selectedClass?.id]);

  useEffect(() => {
    searchCandidates();
  }, [candidateQuery, showRoster, roster]);

  // =============== NHẬP EXCEL (không tạo tài khoản) ===============
  const normalizeKey = (s) =>
    String(s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, "_")
      .trim();

  const importExcel = async () => {
    if (!selectedClass?.id) return;
    try {
      setImporting(true);

      const pick = await DocumentPicker.getDocumentAsync({
        type: [
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "text/csv",
          "application/vnd.ms-excel",
        ],
        multiple: false,
        copyToCacheDirectory: true,
      });
      if (pick.canceled) {
        setImporting(false);
        return;
      }

      const uri = pick.assets[0].uri;
      const b64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const wb = XLSX.read(b64, { type: "base64" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { raw: false, defval: "" });

      const mapped = [];
      for (const r of rows) {
        const obj = {};
        for (const k of Object.keys(r))
          obj[normalizeKey(k)] = String(r[k]).trim();

        const fullName =
          obj.ho_ten || obj.ho_va_ten || obj.hoten || obj.ten || "";
        const maSV = obj.ma_sv || obj.ma_sinh_vien || "";

        if (!fullName) continue;

        mapped.push({
          ho_ten: fullName,
          ma_sinh_vien: maSV || null,
          ngay_sinh: obj.ngay_sinh || obj.ngaysinh || null,
          gioi_tinh: obj.gioi_tinh || null,
          dan_toc: obj.dan_toc || null,
          que_quan: obj.que_quan || obj.que || null,
        });
      }

      if (!mapped.length) {
        Alert.alert(
          "Thông báo",
          "Không tìm thấy dòng hợp lệ (cần ít nhất cột Họ tên)."
        );
        setImporting(false);
        return;
      }

      const { data, error } = await supabase.rpc(
        "admin_import_students_to_class",
        {
          p_lop_id: selectedClass.id,
          p_rows: mapped,
        }
      );
      if (error) throw error;

      Alert.alert("Hoàn tất", `Đã thêm ${data || 0} dòng từ Excel.`);
      openRoster(selectedClass);
    } catch (e) {
      const msg = /FORBIDDEN/.test(String(e?.message))
        ? "Bạn không phải Admin."
        : e?.message || "Không nhập được Excel.";
      Alert.alert("Lỗi", msg);
    } finally {
      setImporting(false);
    }
  };

  // =============== UI ===============
  return (
    <SafeAreaView className="bg-black flex-1">
      {/* Bọc toàn bộ nội dung trong ScrollView để có thanh lăn dọc */}
      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 24 }}
      >
        {/* ===== TẠO LỚP ===== */}
        <Section title="Tạo lớp học" subtitle="Nhập Tên lớp và Mã lớp" />
        <View className="px-5">
          <Card>
            <Text className="text-zinc-400 mb-2">Tên lớp</Text>
            <TextInput
              style={styles.input}
              placeholder="VD: Công nghệ A"
              placeholderTextColor="#6b7280"
              value={newClassName}
              onChangeText={setNewClassName}
            />

            <Text className="text-zinc-400 mt-3 mb-2">Mã lớp</Text>
            <TextInput
              style={styles.input}
              placeholder="VD: CCN04.8C"
              placeholderTextColor="#6b7280"
              autoCapitalize="characters"
              value={newClassCode}
              onChangeText={setNewClassCode}
            />

            <Button
              className="mt-4"
              title={creatingClass ? "Đang tạo..." : "Tạo lớp"}
              onPress={createClass}
              disabled={creatingClass}
            />
          </Card>
        </View>

        {/* ===== QUẢN LÝ LỚP & SV ===== */}
        <Section title="Lớp học" subtitle="Quản lý lớp & sinh viên (Admin)" />
        <View className="px-5">
          <Card>
            <Text className="text-zinc-400 mb-2">Chọn lớp</Text>
            <ClassPicker value={selectedClass} onChange={setSelectedClass} />
          </Card>
        </View>

        {selectedClass && (
          <View className="px-5 mt-3">
            <Card>
              {/* Hàng header tự co giãn & tự xuống hàng */}
              <View style={styles.dualButtonRow}>
                <View style={styles.dualButton}>
                  <Button
                    title={importing ? "Đang nhập…" : "Nhập Excel"}
                    onPress={importExcel}
                    disabled={importing}
                  />
                </View>
                <View style={styles.dualButton}>
                  <Button
                    title="Quản lý"
                    onPress={() => openRoster(selectedClass)}
                  />
                </View>
              </View>
            </Card>
          </View>
        )}
      </ScrollView>

      {/* Modal roster */}
      <Modal visible={showRoster} transparent animationType="slide">
        <View style={styles.modalWrap}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              Sinh viên của lớp {selectedClass?.ten_lop || ""}
            </Text>

            <View style={[styles.row, styles.headerRow]}>
              <Text style={[styles.cName, styles.headerText]}>Họ tên</Text>
              <Text style={[styles.cCode, styles.headerText]}>Mã SV</Text>
              <Text style={[styles.cAct, styles.headerText]}>Thao tác</Text>
            </View>

            {loadingRoster ? (
              <ActivityIndicator />
            ) : (
              <FlatList
                data={roster}
                keyExtractor={(x) => String(x.id)}
                renderItem={({ item }) => {
                  const isEdit = editingId === item.id;
                  const isImported = item.noAccount === true;

                  return (
                    <View style={styles.row}>
                      <View style={styles.cName}>
                        {isEdit ? (
                          <TextInput
                            style={styles.input}
                            value={editName}
                            onChangeText={setEditName}
                            placeholder="Họ tên"
                            placeholderTextColor="#6b7280"
                          />
                        ) : (
                          <Text style={{ color: "white" }} numberOfLines={1}>
                            {item.ho_ten}
                            {isImported && (
                              <Text style={{ color: "#f59e0b" }}>
                                {" "}
                                — Chưa có tài khoản
                              </Text>
                            )}
                          </Text>
                        )}
                      </View>

                      <View style={styles.cCode}>
                        {isEdit ? (
                          <TextInput
                            style={styles.input}
                            value={editCode}
                            onChangeText={setEditCode}
                            placeholder="Mã SV"
                            placeholderTextColor="#6b7280"
                          />
                        ) : (
                          <Text style={{ color: "#c9cdd1" }} numberOfLines={1}>
                            {item.ma_sinh_vien || "—"}
                          </Text>
                        )}
                      </View>

                      <View
                        style={[
                          styles.cAct,
                          {
                            flexDirection: "row",
                            justifyContent: "flex-end",
                            gap: 8,
                          },
                        ]}
                      >
                        {isImported ? (
                          <Text style={{ color: "#9aa0a6" }}>Excel</Text>
                        ) : editingId === item.id ? (
                          <>
                            <TouchableOpacity
                              onPress={saveEdit}
                              style={[
                                styles.btn,
                                { backgroundColor: "#16a34a" },
                              ]}
                            >
                              <Text style={styles.btnText}>Lưu</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() => {
                                setEditingId(null);
                                setEditName("");
                                setEditCode("");
                              }}
                              style={[
                                styles.btn,
                                { backgroundColor: "#6b7280" },
                              ]}
                            >
                              <Text style={styles.btnText}>Hủy</Text>
                            </TouchableOpacity>
                          </>
                        ) : (
                          <>
                            <TouchableOpacity
                              onPress={() => {
                                setEditingId(item.id);
                                setEditName(item.ho_ten);
                                setEditCode(item.ma_sinh_vien || "");
                              }}
                              style={[
                                styles.btn,
                                { backgroundColor: "#3b82f6" },
                              ]}
                            >
                              <Text style={styles.btnText}>Sửa</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() => removeAccountFromClass(item.id)}
                              style={[
                                styles.btn,
                                { backgroundColor: "#ef4444" },
                              ]}
                            >
                              <Text style={styles.btnText}>Xóa</Text>
                            </TouchableOpacity>
                          </>
                        )}
                      </View>
                    </View>
                  );
                }}
                ListEmptyComponent={
                  <Text style={{ color: "#9aa0a6", padding: 12 }}>
                    Lớp chưa có sinh viên.
                  </Text>
                }
              />
            )}

            {/* Thêm SV có tài khoản */}
            <View
              style={{
                marginTop: 12,
                borderTopWidth: 1,
                borderTopColor: "#22262b",
                paddingTop: 10,
              }}
            >
              <Text
                style={{ color: "white", fontWeight: "700", marginBottom: 6 }}
              >
                Thêm sinh viên (đã có tài khoản)
              </Text>
              <TextInput
                style={styles.search}
                placeholder="Tìm theo tên hoặc mã SV…"
                placeholderTextColor="#9aa0a6"
                value={candidateQuery}
                onChangeText={setCandidateQuery}
              />
              {searching ? (
                <ActivityIndicator />
              ) : (
                <FlatList
                  data={candidates}
                  keyExtractor={(x) => x.id}
                  renderItem={({ item }) => (
                    <View style={styles.optRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: "white", fontWeight: "600" }}>
                          {item.ho_ten}
                        </Text>
                        <Text style={{ color: "#9aa0a6" }}>
                          {item.ma_sinh_vien || "—"}
                        </Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => addToClass(item.id)}
                        style={[styles.btn, { backgroundColor: "#22c55e" }]}
                      >
                        <Text style={styles.btnText}>Thêm</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                  ListEmptyComponent={
                    <Text style={{ color: "#9aa0a6" }}>
                      Không có ứng viên phù hợp.
                    </Text>
                  }
                />
              )}
            </View>

            <TouchableOpacity
              style={styles.closeBtn}
              onPress={() => setShowRoster(false)}
            >
              <Text style={{ color: "white", fontWeight: "700" }}>Đóng</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // ======= khu vực header có nút, auto wrap =======
  headerWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  headerWrapCompact: {
    // trên màn rất hẹp vẫn cho wrap nhưng ưu tiên đẩy nút xuống dưới
    alignItems: "flex-start",
  },
  headerTitle: {
    color: "white",
    fontSize: 16,
    fontWeight: "700",
    flexShrink: 1,
    paddingRight: 8,
  },
  headerActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    maxWidth: "70%", // tránh lấn hết chỗ của tiêu đề
  },
  headerActionsCompact: {
    maxWidth: "100%",
    marginTop: 6,
  },
  headerBtnWrap: {
    marginLeft: 8,
    marginTop: 6, // khi wrap xuống hàng có khoảng cách
  },

  // ======= các style sẵn có =======
  row: {
    flexDirection: "row",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#22262b",
    alignItems: "center",
    gap: 10,
  },
  headerRow: {
    backgroundColor: "#101215",
    borderTopWidth: 1,
    borderTopColor: "#22262b",
  },
  headerText: { color: "#a3aab3", fontWeight: "700" },
  cName: { flex: 2.2 },
  cCode: { flex: 1.3 },
  cAct: { flex: 1.2 },
  input: {
    backgroundColor: "#1a1d21",
    borderWidth: 1,
    borderColor: "#2a2e34",
    color: "white",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  btn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  btnText: { color: "white", fontWeight: "700" },
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
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#1e2126",
  },
  optRow: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#1e2126",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  closeBtn: {
    backgroundColor: "#2c7be5",
    alignSelf: "center",
    marginTop: 12,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  dualButtonRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 10,
    gap: 12,
  },
  dualButton: {
    flex: 1,
    maxWidth: 160, // để hai nút bằng nhau và không quá dài
  },
});
