// src/screens/common/ProfileScreen.jsx
import React, { useEffect, useState, useCallback } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Alert,
  ActivityIndicator,
  TouchableOpacity,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import Section from "../../components/Section";
import Card from "../../components/Card";
import Button from "../../components/Button";

/* ===== Helpers ===== */

function roleLabel(role) {
  if (role === "sinhvien") return "Sinh viên";
  if (role === "giangvien") return "Giảng viên";
  if (role === "quantri") return "Quản trị viên";
  return role || "";
}

// Hiển thị dd-MM-yyyy từ giá trị trong DB (yyyy-MM-dd hoặc timestamp)
function formatDateDisplay(value) {
  if (!value) return "";
  const raw = String(value);
  const datePart = raw.split("T")[0]; // yyyy-MM-dd
  const parts = datePart.split("-");
  if (parts.length !== 3) return raw;
  const [y, m, d] = parts;
  return `${d.padStart(2, "0")}-${m.padStart(2, "0")}-${y}`;
}

// Khi admin nhập ngày sinh: chỉ cho số và tự chèn dấu '-'
function normalizeDateInput(text) {
  const digits = text.replace(/\D/g, "").slice(0, 8); // ddMMyyyy
  if (!digits) return "";
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) {
    return `${digits.slice(0, 2)}-${digits.slice(2)}`;
  }
  return `${digits.slice(0, 2)}-${digits.slice(2, 4)}-${digits.slice(4)}`;
}

// Chuyển "dd-MM-yyyy" -> "yyyy-MM-dd" (để lưu DB)
function toISODate(text) {
  if (!text) return null;
  const parts = text.split("-");
  if (parts.length !== 3) return null;
  const [d, m, y] = parts;
  if (d.length !== 2 || m.length !== 2 || y.length < 4) return null;
  return `${y}-${m}-${d}`;
}

export default function ProfileScreen() {
  const { user, hoso, role, refreshHoso, signOut } = useAuth();

  // ----- Thông tin cá nhân tự xem (readonly cho SV/GV) -----
  const [form, setForm] = useState({
    ho_ten: "",
    ngay_sinh: "",
    que_quan: "",
    so_dien_thoai: "",
  });

  // Lớp của sinh viên
  const [studentClass, setStudentClass] = useState(null);

  // Thông tin giảng dạy (giảng viên)
  const [teacherClasses, setTeacherClasses] = useState([]);
  const [teacherSubjects, setTeacherSubjects] = useState([]);
  const [teacherSessions, setTeacherSessions] = useState([]);
  const [loadingTeacherExtra, setLoadingTeacherExtra] = useState(false);

  // Đổi mật khẩu
  const [pwCurrent, setPwCurrent] = useState("");
  const [pwNew, setPwNew] = useState("");
  const [pwConfirm, setPwConfirm] = useState("");
  const [changingPw, setChangingPw] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Tra cứu admin
  const [searchCode, setSearchCode] = useState("");
  const [foundUser, setFoundUser] = useState(null);
  const [searchingUser, setSearchingUser] = useState(false);
  const [adminEdit, setAdminEdit] = useState(null);
  const [savingAdminEdit, setSavingAdminEdit] = useState(false);

  /* ===== Load dữ liệu cơ bản ===== */

  // Cập nhật form khi hoso thay đổi (chỉ để hiển thị, SV/GV không chỉnh)
  useEffect(() => {
    if (hoso) {
      setForm({
        ho_ten: hoso.ho_ten ?? "",
        ngay_sinh: hoso.ngay_sinh ?? "",
        que_quan: hoso.que_quan ?? "",
        so_dien_thoai: hoso.so_dien_thoai ?? "",
      });
    }
  }, [hoso]);

  // Lớp của sinh viên
  const loadStudentExtra = useCallback(async () => {
    if (!user?.id || role !== "sinhvien") return;
    try {
      const { data, error } = await supabase
        .from("dangky")
        .select("lop:lop_id(id, ten_lop, ma_lop)")
        .eq("sinh_vien_id", user.id)
        .maybeSingle();

      if (error && error.code !== "PGRST116") throw error;
      setStudentClass(data?.lop ?? null);
    } catch (err) {
      console.warn("[Profile] loadStudentExtra error", err);
    }
  }, [user?.id, role]);

  useEffect(() => {
    if (role === "sinhvien") {
      loadStudentExtra();
    }
  }, [role, loadStudentExtra]);

  // Thông tin giảng dạy cho chính giảng viên đang đăng nhập
  const loadTeacherExtra = useCallback(async () => {
    if (!user?.id || role !== "giangvien") return;
    setLoadingTeacherExtra(true);
    try {
      // 1. Môn giảng dạy
      const { data: monData, error: monError } = await supabase
        .from("giangday")
        .select(
          `
          monhoc_id,
          mon:monhoc_id (
            id,
            ma_mon,
            ten_mon
          )
        `
        )
        .eq("giang_vien_id", user.id);

      if (monError) throw monError;

      const monList = (monData || []).map((r) => r.mon).filter(Boolean);
      const monIds = (monData || []).map((r) => r.monhoc_id).filter(Boolean);
      setTeacherSubjects(monList);

      if (!monIds.length) {
        setTeacherClasses([]);
        setTeacherSessions([]);
        return;
      }

      // 2. Các buổi học phụ trách
      const { data: buoiData, error: buoiError } = await supabase
        .from("buoihoc")
        .select(
          `
          id,
          thoi_gian_bat_dau,
          lop:lop_id (
            id,
            ten_lop,
            ma_lop
          ),
          mon:monhoc_id (
            id,
            ma_mon,
            ten_mon
          ),
          giang_vien_id,
          tao_boi
        `
        )
        .or(`giang_vien_id.eq.${user.id},tao_boi.eq.${user.id}`)
        .in("monhoc_id", monIds)
        .order("thoi_gian_bat_dau", { ascending: false })
        .limit(50);

      if (buoiError) throw buoiError;

      const sessions = buoiData || [];
      setTeacherSessions(sessions);

      const classMap = new Map();
      sessions.forEach((b) => {
        const lop = b.lop;
        if (lop?.id && !classMap.has(lop.id)) {
          classMap.set(lop.id, lop);
        }
      });
      setTeacherClasses(Array.from(classMap.values()));
    } catch (err) {
      console.warn("[Profile] loadTeacherExtra error", err);
    } finally {
      setLoadingTeacherExtra(false);
    }
  }, [user?.id, role]);

  useEffect(() => {
    if (role === "giangvien") {
      loadTeacherExtra();
    }
  }, [role, loadTeacherExtra]);

  /* ===== Đổi mật khẩu ===== */

  const handleChangePassword = async () => {
    if (!user?.email) {
      Alert.alert("Lỗi", "Không tìm thấy email tài khoản.");
      return;
    }
    if (!pwCurrent || !pwNew || !pwConfirm) {
      Alert.alert("Lưu ý", "Vui lòng nhập đủ 3 trường mật khẩu.");
      return;
    }
    if (pwNew !== pwConfirm) {
      Alert.alert("Lưu ý", "Mật khẩu mới và xác nhận không khớp.");
      return;
    }
    try {
      setChangingPw(true);
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: pwCurrent,
      });
      if (signInError) {
        Alert.alert("Lỗi", "Mật khẩu hiện tại không chính xác.");
        return;
      }
      const { error: updateError } = await supabase.auth.updateUser({
        password: pwNew,
      });
      if (updateError) throw updateError;
      Alert.alert("Thành công", "Đã đổi mật khẩu.");
      setPwCurrent("");
      setPwNew("");
      setPwConfirm("");
    } catch (err) {
      console.warn("[Profile] handleChangePassword error", err);
      Alert.alert("Lỗi", err.message || "Không thể đổi mật khẩu.");
    } finally {
      setChangingPw(false);
    }
  };

  /* ===== Tra cứu & chỉnh sửa thông tin (Admin) ===== */

  const handleSearchUser = async () => {
    const kw = (searchCode || "").trim();
    if (!kw) {
      Alert.alert("Lưu ý", "Vui lòng nhập mã sinh viên / giảng viên.");
      return;
    }
    try {
      setSearchingUser(true);
      setFoundUser(null);
      setAdminEdit(null);

      // 1. Tìm người dùng theo mã (không phân biệt hoa/thường)
      const { data, error } = await supabase
        .from("hoso")
        .select(
          "nguoi_dung_id, ho_ten, ma_sinh_vien, ngay_sinh, que_quan, so_dien_thoai, vai_tro"
        )
        .ilike("ma_sinh_vien", kw)
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        Alert.alert("Thông báo", "Không tìm thấy người dùng với mã này.");
        return;
      }

      const baseResult = {
        ...data,
        lop: null,
        lop_giangday: [],
        mon_giangday: [],
        buoi_giangday: [],
      };

      // Nếu là sinh viên: lấy lớp
      if (data.vai_tro === "sinhvien") {
        const { data: dk, error: dkError } = await supabase
          .from("dangky")
          .select("lop:lop_id(id, ten_lop, ma_lop)")
          .eq("sinh_vien_id", data.nguoi_dung_id)
          .maybeSingle();
        if (dkError && dkError.code !== "PGRST116") throw dkError;
        baseResult.lop = dk?.lop ?? null;
      }

      // Nếu là giảng viên: lấy môn + lớp + buổi giống logic trên
      if (data.vai_tro === "giangvien") {
        const { data: monData, error: monError } = await supabase
          .from("giangday")
          .select(
            `
            monhoc_id,
            mon:monhoc_id (
              id,
              ma_mon,
              ten_mon
            )
          `
          )
          .eq("giang_vien_id", data.nguoi_dung_id);

        if (monError) throw monError;

        const monList = (monData || []).map((r) => r.mon).filter(Boolean);
        const monIds = (monData || []).map((r) => r.monhoc_id).filter(Boolean);
        baseResult.mon_giangday = monList;

        if (monIds.length) {
          const { data: buoiData, error: buoiError } = await supabase
            .from("buoihoc")
            .select(
              `
              id,
              thoi_gian_bat_dau,
              lop:lop_id (
                id,
                ten_lop,
                ma_lop
              ),
              mon:monhoc_id (
                id,
                ma_mon,
                ten_mon
              ),
              giang_vien_id,
              tao_boi
            `
            )
            .or(
              `giang_vien_id.eq.${data.nguoi_dung_id},tao_boi.eq.${data.nguoi_dung_id}`
            )
            .in("monhoc_id", monIds)
            .order("thoi_gian_bat_dau", { ascending: false })
            .limit(50);

          if (buoiError) throw buoiError;

          const sessions = buoiData || [];
          baseResult.buoi_giangday = sessions;

          const classMap = new Map();
          sessions.forEach((b) => {
            const lop = b.lop;
            if (lop?.id && !classMap.has(lop.id)) {
              classMap.set(lop.id, lop);
            }
          });
          baseResult.lop_giangday = Array.from(classMap.values());
        }
      }

      setFoundUser(baseResult);
      setAdminEdit({
        ho_ten: baseResult.ho_ten || "",
        ngay_sinh: formatDateDisplay(baseResult.ngay_sinh),
        que_quan: baseResult.que_quan || "",
        so_dien_thoai: baseResult.so_dien_thoai || "",
      });
    } catch (err) {
      console.warn("[Profile] handleSearchUser error", err);
      Alert.alert("Lỗi", err.message || "Không thể tra cứu thông tin.");
    } finally {
      setSearchingUser(false);
    }
  };

  const handleAdminSaveUser = async () => {
    if (!foundUser || !adminEdit) return;
    const isoDate = toISODate(adminEdit.ngay_sinh);
    try {
      setSavingAdminEdit(true);
      const payload = {
        ho_ten: adminEdit.ho_ten || null,
        que_quan: adminEdit.que_quan || null,
        so_dien_thoai: adminEdit.so_dien_thoai || null,
        ngay_sinh: isoDate || null,
      };
      const { error } = await supabase
        .from("hoso")
        .update(payload)
        .eq("nguoi_dung_id", foundUser.nguoi_dung_id);

      if (error) throw error;

      setFoundUser((prev) =>
        prev
          ? {
              ...prev,
              ...payload,
              ngay_sinh: isoDate || prev.ngay_sinh,
            }
          : prev
      );

      // Nếu admin chỉnh chính bản thân mình -> refreshHoso
      if (foundUser.nguoi_dung_id === user?.id) {
        await refreshHoso?.();
      }

      Alert.alert("Thành công", "Đã cập nhật thông tin người dùng.");
    } catch (err) {
      console.warn("[Profile] handleAdminSaveUser error", err);
      Alert.alert("Lỗi", err.message || "Không thể cập nhật thông tin.");
    } finally {
      setSavingAdminEdit(false);
    }
  };

  /* ===== UI helpers ===== */

  const formatSessionTime = (timestamp) => {
    if (!timestamp) return "Chưa có thời gian";
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return String(timestamp);
    return date.toLocaleString();
  };

  const initials =
    (form.ho_ten || hoso?.ho_ten || user?.email || "?")
      .split(" ")
      .filter(Boolean)
      .slice(-1)[0]
      ?.charAt(0)
      .toUpperCase() || "?";

  const canLogout = role === "giangvien" || role === "quantri";

  /* ===== Render ===== */

  return (
    <SafeAreaView className="flex-1 bg-black">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 24 }}
      >
        <Section
          title="Trang cá nhân"
          subtitle="Xem và quản lý thông tin tài khoản"
        />

        {/* Avatar + tên + vai trò */}
        <View className="items-center mb-4">
          <View className="w-24 h-24 rounded-full bg-zinc-800 border border-zinc-600 items-center justify-center">
            <Text className="text-white text-3xl font-bold">{initials}</Text>
          </View>
          <Text className="text-white text-lg font-semibold mt-3">
            {form.ho_ten || hoso?.ho_ten || user?.email}
          </Text>
          <Text className="text-zinc-400 mt-1">{roleLabel(role)}</Text>
          {user?.email ? (
            <Text className="text-zinc-500 text-xs mt-1">{user.email}</Text>
          ) : null}
        </View>

        {/* THÔNG TIN CÁ NHÂN (SV/GV chỉ xem, không chỉnh sửa) */}
        {role !== "quantri" && (
          <View className="px-5 mb-4">
            <Card>
              <Text className="text-zinc-400 mb-2 text-sm font-semibold">
                Thông tin cá nhân
              </Text>

              {/* Họ tên */}
              <Text className="text-zinc-400 text-xs mb-1">Họ tên</Text>
              <View className="bg-zinc-900 rounded-xl px-3 py-2 mb-3 border border-zinc-700">
                <Text className="text-white text-sm">
                  {form.ho_ten || hoso?.ho_ten || "(Chưa có họ tên)"}
                </Text>
              </View>

              {/* Ngày sinh */}
              <Text className="text-zinc-400 text-xs mb-1">Ngày sinh</Text>
              <View className="bg-zinc-900 rounded-xl px-3 py-2 mb-3 border border-zinc-700">
                <Text className="text-white text-sm">
                  {formatDateDisplay(form.ngay_sinh || hoso?.ngay_sinh) ||
                    "(Chưa có)"}
                </Text>
              </View>

              {/* Quê quán */}
              <Text className="text-zinc-400 text-xs mb-1">Quê quán</Text>
              <View className="bg-zinc-900 rounded-xl px-3 py-2 mb-3 border border-zinc-700">
                <Text className="text-white text-sm">
                  {form.que_quan || "(Chưa có)"}
                </Text>
              </View>

              {/* Số điện thoại */}
              <Text className="text-zinc-400 text-xs mb-1">Số điện thoại</Text>
              <View className="bg-zinc-900 rounded-xl px-3 py-2 mb-2 border border-zinc-700">
                <Text className="text-white text-sm">
                  {form.so_dien_thoai || "(Chưa có)"}
                </Text>
              </View>

              {/* Thông tin lớp cho sinh viên */}
              {role === "sinhvien" && (
                <>
                  <Text className="text-zinc-400 text-xs mb-1">
                    Mã sinh viên
                  </Text>
                  <View className="bg-zinc-900 rounded-xl px-3 py-2 mb-3 border border-zinc-700">
                    <Text className="text-white text-sm">
                      {hoso?.ma_sinh_vien || "(Chưa có)"}
                    </Text>
                  </View>

                  <Text className="text-zinc-400 text-xs mb-1">Lớp học</Text>
                  <View className="bg-zinc-900 rounded-xl px-3 py-2 border border-zinc-700">
                    {studentClass ? (
                      <Text className="text-white text-sm">
                        {studentClass.ten_lop}{" "}
                        {studentClass.ma_lop ? `(${studentClass.ma_lop})` : ""}
                      </Text>
                    ) : (
                      <Text className="text-zinc-500 text-sm">
                        Chưa được xếp lớp.
                      </Text>
                    )}
                  </View>
                </>
              )}

              <Text className="text-zinc-500 text-xs mt-3">
                * Thông tin cá nhân được quản trị viên cập nhật. Bạn chỉ có thể
                xem tại đây.
              </Text>
            </Card>
          </View>
        )}

        {/* THÔNG TIN GIẢNG DẠY (dành cho giảng viên) */}
        {role === "giangvien" && (
          <View className="px-5 mb-4">
            <Card>
              <Text className="text-zinc-200 mb-3 text-base font-semibold">
                Thông tin giảng dạy
              </Text>

              {/* Lớp có buổi đã tạo */}
              <Text className="text-zinc-300 text-sm font-semibold mb-1">
                Lớp học có buổi đã tạo
              </Text>
              {loadingTeacherExtra ? (
                <ActivityIndicator className="mt-2 mb-3" />
              ) : teacherClasses.length ? (
                <View className="bg-zinc-900 rounded-xl border border-zinc-700 overflow-hidden mb-3">
                  <View className="flex-row bg-zinc-800 px-3 py-2">
                    <Text className="text-zinc-400 text-sm flex-1">
                      Tên lớp
                    </Text>
                    <Text className="text-zinc-400 text-sm w-28 text-right">
                      Mã lớp
                    </Text>
                  </View>
                  {teacherClasses.map((lop) => (
                    <View
                      key={lop.id}
                      className="flex-row px-3 py-2 border-t border-zinc-800"
                    >
                      <Text className="text-white text-sm flex-1">
                        {lop.ten_lop}
                      </Text>
                      <Text className="text-zinc-300 text-sm w-28 text-right">
                        {lop.ma_lop || "—"}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text className="text-zinc-500 text-sm mb-3">
                  Chưa có lớp nào có buổi học bạn dạy.
                </Text>
              )}

              {/* Môn phân công */}
              <Text className="text-zinc-300 text-sm font-semibold mb-1">
                Môn học được phân công
              </Text>
              {loadingTeacherExtra ? (
                <ActivityIndicator className="mt-2 mb-3" />
              ) : teacherSubjects.length ? (
                <View className="bg-zinc-900 rounded-xl border border-zinc-700 overflow-hidden mb-3">
                  <View className="flex-row bg-zinc-800 px-3 py-2">
                    <Text className="text-zinc-400 text-sm flex-1">
                      Tên môn
                    </Text>
                    <Text className="text-zinc-400 text-sm w-32 text-right">
                      Mã môn
                    </Text>
                  </View>
                  {teacherSubjects.map((m) => (
                    <View
                      key={m.id}
                      className="flex-row px-3 py-2 border-t border-zinc-800"
                    >
                      <Text className="text-white text-sm flex-1">
                        {m.ten_mon}
                      </Text>
                      <Text className="text-zinc-300 text-sm w-32 text-right">
                        {m.ma_mon}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text className="text-zinc-500 text-sm mb-3">
                  Chưa được phân công môn học nào.
                </Text>
              )}

              {/* Buổi học phụ trách */}
              <Text className="text-zinc-300 text-sm font-semibold mb-1">
                Buổi học bạn phụ trách
              </Text>
              {loadingTeacherExtra ? (
                <ActivityIndicator className="mt-2" />
              ) : teacherSessions.length ? (
                <View className="bg-zinc-900 rounded-xl border border-zinc-700 overflow-hidden mt-1 max-h-64">
                  <View className="flex-row bg-zinc-800 px-3 py-2">
                    <Text className="text-zinc-400 text-sm flex-1">Lớp</Text>
                    <Text className="text-zinc-400 text-sm flex-1">Môn</Text>
                    <Text className="text-zinc-400 text-sm w-40">
                      Thời gian
                    </Text>
                  </View>
                  <ScrollView nestedScrollEnabled showsVerticalScrollIndicator>
                    {teacherSessions.map((b) => (
                      <View
                        key={b.id}
                        className="flex-row px-3 py-2 border-t border-zinc-800"
                      >
                        <Text className="text-white text-sm flex-1 mr-1">
                          {b.lop?.ten_lop || "Lớp ?"}
                        </Text>
                        <Text className="text-indigo-300 text-sm flex-1 mr-1">
                          {b.mon?.ten_mon || "Môn ?"}
                        </Text>
                        <Text className="text-zinc-300 text-sm w-40">
                          {formatSessionTime(b.thoi_gian_bat_dau)}
                        </Text>
                      </View>
                    ))}
                  </ScrollView>
                </View>
              ) : (
                <Text className="text-zinc-500 text-sm">
                  Chưa có buổi học nào được tạo với môn bạn được phân công.
                </Text>
              )}
            </Card>
          </View>
        )}

        {/* Đổi mật khẩu (tất cả vai trò) */}
        <View className="px-5 mb-4">
          <Card>
            <TouchableOpacity
              className="flex-row items-center justify-between mb-2"
              onPress={() => setShowPassword((v) => !v)}
            >
              <Text className="text-zinc-400 text-sm font-semibold">
                Đổi mật khẩu
              </Text>
              <Ionicons
                name={
                  showPassword ? "chevron-up-outline" : "chevron-down-outline"
                }
                size={18}
                color="#a1a1aa"
              />
            </TouchableOpacity>

            {showPassword && (
              <>
                <Text className="text-zinc-400 text-xs mb-1">
                  Mật khẩu hiện tại
                </Text>
                <TextInput
                  className="bg-zinc-900 rounded-xl px-3 py-2 text-white mb-3 border border-zinc-700"
                  placeholder="Nhập mật khẩu hiện tại"
                  placeholderTextColor="#71717a"
                  secureTextEntry
                  value={pwCurrent}
                  onChangeText={setPwCurrent}
                />

                <Text className="text-zinc-400 text-xs mb-1">Mật khẩu mới</Text>
                <TextInput
                  className="bg-zinc-900 rounded-xl px-3 py-2 text-white mb-3 border border-zinc-700"
                  placeholder="Nhập mật khẩu mới"
                  placeholderTextColor="#71717a"
                  secureTextEntry
                  value={pwNew}
                  onChangeText={setPwNew}
                />

                <Text className="text-zinc-400 text-xs mb-1">
                  Xác nhận mật khẩu mới
                </Text>
                <TextInput
                  className="bg-zinc-900 rounded-xl px-3 py-2 text-white mb-3 border border-zinc-700"
                  placeholder="Nhập lại mật khẩu mới"
                  placeholderTextColor="#71717a"
                  secureTextEntry
                  value={pwConfirm}
                  onChangeText={setPwConfirm}
                />

                <Button
                  title={changingPw ? "Đang đổi..." : "Đổi mật khẩu"}
                  onPress={handleChangePassword}
                  disabled={changingPw}
                />
              </>
            )}
          </Card>
        </View>

        {/* Tra cứu & chỉnh sửa người dùng – chỉ Admin */}
        {role === "quantri" && (
          <View className="px-5 mb-4">
            <Card>
              <Text className="text-zinc-200 mb-2 text-base font-semibold">
                Tra cứu thông tin người dùng (SV / GV)
              </Text>

              <Text className="text-zinc-400 text-xs mb-1">
                Mã sinh viên / giảng viên
              </Text>
              <TextInput
                className="bg-zinc-900 rounded-xl px-3 py-2 text-white mb-3 border border-zinc-700 text-base"
                placeholder="Nhập mã SV/GV, ví dụ: sv001, gv001..."
                placeholderTextColor="#71717a"
                autoCapitalize="none"
                value={searchCode}
                onChangeText={setSearchCode}
              />

              <Button
                title={searchingUser ? "Đang tìm..." : "Tra cứu"}
                onPress={handleSearchUser}
                disabled={searchingUser}
              />

              {foundUser && adminEdit && (
                <View className="mt-4">
                  <Text className="text-zinc-300 text-sm font-semibold mb-2">
                    Kết quả
                  </Text>

                  <View className="bg-zinc-900 rounded-2xl border border-zinc-700 p-3">
                    {/* Header tên + vai trò + mã */}
                    <View className="flex-row items-center justify-between mb-3">
                      <View className="flex-1 mr-3">
                        <Text className="text-white text-base font-semibold">
                          {foundUser.ho_ten || "(Chưa có tên)"}
                        </Text>
                        <Text className="text-zinc-400 text-xs mt-1">
                          {roleLabel(foundUser.vai_tro)} ·{" "}
                          {foundUser.ma_sinh_vien || "Không có mã"}
                        </Text>
                      </View>
                    </View>

                    {/* THÔNG TIN CÁ NHÂN – Admin chỉnh sửa */}
                    <Text className="text-zinc-300 text-xs font-semibold mb-1">
                      Thông tin cá nhân
                    </Text>
                    <View className="bg-zinc-950 rounded-xl border border-zinc-800 px-3 py-2 mb-3">
                      <Text className="text-zinc-400 text-xs mb-1">Họ tên</Text>
                      <TextInput
                        className="bg-zinc-900 rounded-xl px-3 py-2 text-white mb-2 border border-zinc-700 text-sm"
                        value={adminEdit.ho_ten}
                        onChangeText={(v) =>
                          setAdminEdit((prev) => ({ ...prev, ho_ten: v }))
                        }
                        placeholder="Nhập họ tên"
                        placeholderTextColor="#71717a"
                      />

                      <Text className="text-zinc-400 text-xs mb-1">
                        Ngày sinh (dd-MM-yyyy)
                      </Text>
                      <TextInput
                        className="bg-zinc-900 rounded-xl px-3 py-2 text-white mb-2 border border-zinc-700 text-sm"
                        value={adminEdit.ngay_sinh}
                        onChangeText={(v) =>
                          setAdminEdit((prev) => ({
                            ...prev,
                            ngay_sinh: normalizeDateInput(v),
                          }))
                        }
                        keyboardType="number-pad"
                        placeholder="dd-MM-yyyy"
                        placeholderTextColor="#71717a"
                        maxLength={10}
                      />

                      <Text className="text-zinc-400 text-xs mb-1">
                        Quê quán
                      </Text>
                      <TextInput
                        className="bg-zinc-900 rounded-xl px-3 py-2 text-white mb-2 border border-zinc-700 text-sm"
                        value={adminEdit.que_quan}
                        onChangeText={(v) =>
                          setAdminEdit((prev) => ({ ...prev, que_quan: v }))
                        }
                        placeholder="Nhập quê quán"
                        placeholderTextColor="#71717a"
                      />

                      <Text className="text-zinc-400 text-xs mb-1">
                        Số điện thoại
                      </Text>
                      <TextInput
                        className="bg-zinc-900 rounded-xl px-3 py-2 text-white border border-zinc-700 text-sm"
                        value={adminEdit.so_dien_thoai}
                        onChangeText={(v) =>
                          setAdminEdit((prev) => ({
                            ...prev,
                            so_dien_thoai: v,
                          }))
                        }
                        keyboardType="phone-pad"
                        placeholder="Nhập số điện thoại"
                        placeholderTextColor="#71717a"
                      />
                    </View>

                    <Button
                      title={
                        savingAdminEdit
                          ? "Đang lưu..."
                          : "Lưu thông tin cá nhân"
                      }
                      onPress={handleAdminSaveUser}
                      disabled={savingAdminEdit}
                    />

                    {/* Nếu là SV – hiển thị lớp đang học */}
                    {foundUser.vai_tro === "sinhvien" && (
                      <View className="mt-3">
                        <Text className="text-zinc-300 text-xs font-semibold mb-1">
                          Lớp đang học
                        </Text>
                        <View className="bg-zinc-950 rounded-xl border border-zinc-800 px-3 py-2">
                          <Text className="text-white text-sm">
                            {foundUser.lop
                              ? `${foundUser.lop.ten_lop} (${
                                  foundUser.lop.ma_lop || "không mã"
                                })`
                              : "Chưa được xếp lớp"}
                          </Text>
                        </View>
                      </View>
                    )}

                    {/* Nếu là GV – hiển thị môn & lớp giảng dạy */}
                    {foundUser.vai_tro === "giangvien" && (
                      <>
                        <View className="mt-3">
                          <Text className="text-zinc-300 text-xs font-semibold mb-1">
                            Môn được phân công
                          </Text>
                          {foundUser.mon_giangday?.length ? (
                            <View className="bg-zinc-950 rounded-xl border border-zinc-800 overflow-hidden">
                              <View className="flex-row bg-zinc-800 px-3 py-2">
                                <Text className="text-zinc-400 text-xs flex-1">
                                  Tên môn
                                </Text>
                                <Text className="text-zinc-400 text-xs w-24 text-right">
                                  Mã môn
                                </Text>
                              </View>
                              {foundUser.mon_giangday.map((m) => (
                                <View
                                  key={m.id}
                                  className="flex-row px-3 py-2 border-t border-zinc-800"
                                >
                                  <Text className="text-white text-sm flex-1">
                                    {m.ten_mon}
                                  </Text>
                                  <Text className="text-zinc-300 text-sm w-24 text-right">
                                    {m.ma_mon}
                                  </Text>
                                </View>
                              ))}
                            </View>
                          ) : (
                            <Text className="text-zinc-500 text-sm">
                              Chưa được phân công môn học nào.
                            </Text>
                          )}
                        </View>

                        <View className="mt-3">
                          <Text className="text-zinc-300 text-xs font-semibold mb-1">
                            Lớp có buổi đã tạo với các môn được phân công
                          </Text>
                          {foundUser.lop_giangday?.length ? (
                            <View className="bg-zinc-950 rounded-xl border border-zinc-800 overflow-hidden">
                              <View className="flex-row bg-zinc-800 px-3 py-2">
                                <Text className="text-zinc-400 text-xs flex-1">
                                  Tên lớp
                                </Text>
                                <Text className="text-zinc-400 text-xs w-24 text-right">
                                  Mã lớp
                                </Text>
                              </View>
                              {foundUser.lop_giangday.map((lop) => (
                                <View
                                  key={lop.id}
                                  className="flex-row px-3 py-2 border-t border-zinc-800"
                                >
                                  <Text className="text-white text-sm flex-1">
                                    {lop.ten_lop}
                                  </Text>
                                  <Text className="text-zinc-300 text-sm w-24 text-right">
                                    {lop.ma_lop || "—"}
                                  </Text>
                                </View>
                              ))}
                            </View>
                          ) : (
                            <Text className="text-zinc-500 text-sm">
                              Chưa có lớp nào có buổi được tạo với môn được phân
                              công.
                            </Text>
                          )}
                        </View>
                      </>
                    )}
                  </View>
                </View>
              )}
            </Card>
          </View>
        )}

        {/* Nút đăng xuất cho GV & Admin */}
        {canLogout && (
          <View className="px-5 mt-2">
            <Button title="Đăng xuất" variant="outline" onPress={signOut} />
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
