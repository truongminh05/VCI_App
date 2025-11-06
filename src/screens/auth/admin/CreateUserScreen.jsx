// screens/admin/CreateUserScreen.jsx
import React, { useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Alert,
  TouchableOpacity,
} from "react-native";
import Section from "../../../components/Section";
import Card from "../../../components/Card";
import Button from "../../../components/Button";
import { supabase } from "../../../lib/supabase";

const ROLES = [
  { key: "sinhvien", label: "Sinh viên" },
  { key: "giangvien", label: "Giảng viên" },
  { key: "quantri", label: "Quản trị" },
];

export default function CreateUserScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState("sinhvien");
  const [code, setCode] = useState(""); // Mã SV/GV (dùng chung 1 cột)
  const [creating, setCreating] = useState(false);

  const validate = () => {
    const em = email.trim().toLowerCase();
    const pw = password.trim();
    const fn = fullName.trim();

    if (!em || !/^\S+@\S+\.\S+$/.test(em)) {
      Alert.alert("Thiếu/không hợp lệ", "Vui lòng nhập email hợp lệ.");
      return null;
    }
    if (!pw || pw.length < 6) {
      Alert.alert("Thiếu/không hợp lệ", "Mật khẩu tối thiểu 6 ký tự.");
      return null;
    }
    if (!fn) {
      Alert.alert("Thiếu", "Vui lòng nhập Họ tên.");
      return null;
    }
    if (!ROLES.find((r) => r.key === role)) {
      Alert.alert("Lỗi", "Vai trò không hợp lệ.");
      return null;
    }
    return { em, pw, fn };
  };

  // --- NEW: kiểm tra trùng mã ---
  const isCodeTaken = async (ma) => {
    // thử RPC ưu tiên
    try {
      const rpc = await supabase.rpc("admin_check_code_available", {
        p_ma_sv: ma,
      });
      if (!rpc.error && rpc.data && typeof rpc.data.available === "boolean") {
        return !rpc.data.available; // taken nếu available=false
      }
    } catch {
      // bỏ qua để fallback
    }

    // fallback: query trực tiếp hoso (cần quyền đọc)
    const { error, count } = await supabase
      .from("hoso")
      .select("nguoi_dung_id", { count: "exact", head: true })
      .eq("ma_sinh_vien", ma);

    if (error) {
      throw new Error(
        "Không kiểm tra được trùng mã (quyền hoặc RLS). Liên hệ Admin backend để bật RPC admin_check_code_available."
      );
    }
    return (count || 0) > 0;
  };

  const createUser = async () => {
    const v = validate();
    if (!v) return;
    const { em, pw, fn } = v;

    // Chuẩn hoá mã: viết HOA để thống nhất
    const maSV = (code || "").trim().toUpperCase() || null;

    try {
      setCreating(true);

      // 1) Nếu có mã → kiểm tra trùng trước khi tạo
      if (maSV) {
        const taken = await isCodeTaken(maSV);
        if (taken) {
          Alert.alert(
            "Trùng mã",
            `Mã đã tồn tại: ${maSV}. Vui lòng nhập mã khác.`
          );
          setCreating(false);
          return;
        }
      }

      // 2) Thử RPC mới có p_ma_sv
      let newUserId = null;
      const tryNew = await supabase.rpc("admin_create_user", {
        p_email: em,
        p_password: pw,
        p_full_name: fn,
        p_role: role, // 'sinhvien' | 'giangvien' | 'quantri'
        p_ma_sv: maSV, // truyền trực tiếp nếu server hỗ trợ
      });

      if (tryNew.error) {
        // 3) Fallback: RPC cũ không có p_ma_sv
        const sigMismatch =
          /does not exist|function .*admin_create_user|named argument|too many arguments/i.test(
            tryNew.error.message || ""
          );

        if (!sigMismatch) {
          throw tryNew.error;
        }

        const { data: oldData, error: oldErr } = await supabase.rpc(
          "admin_create_user",
          {
            p_email: em,
            p_password: pw,
            p_full_name: fn,
            p_role: role,
          }
        );
        if (oldErr) throw oldErr;

        newUserId = oldData?.user_id || oldData?.id || null;

        // Ghi mã vào hồ sơ nếu có nhập
        if (maSV && newUserId) {
          // Kiểm tra trùng lần nữa ngay trước khi cập nhật (race-condition phòng trường hợp user khác vừa đăng ký)
          const takenAgain = await isCodeTaken(maSV);
          if (takenAgain) {
            Alert.alert(
              "Trùng mã",
              `Mã đã bị dùng trong lúc tạo: ${maSV}. Tài khoản vẫn được tạo nhưng chưa gán mã.`
            );
          } else {
            const { error: upErr } = await supabase.rpc(
              "admin_update_student_profile",
              {
                p_user_id: newUserId,
                p_ho_ten: fn,
                p_ma_sv: maSV,
              }
            );
            if (upErr) throw upErr;
          }
        }
      } else {
        // RPC mới
        newUserId = tryNew.data?.user_id || tryNew.data?.id || null;

        // Bảo hiểm cập nhật mã (không sao nếu giống nhau)
        if (maSV && newUserId) {
          // Kiểm tra trùng lần nữa trước khi set (nếu RPC chưa set)
          const takenAgain = await isCodeTaken(maSV);
          if (!takenAgain) {
            await supabase.rpc("admin_update_student_profile", {
              p_user_id: newUserId,
              p_ho_ten: fn,
              p_ma_sv: maSV,
            });
          }
        }
      }

      Alert.alert("Thành công", "Đã tạo tài khoản người dùng.");
      setEmail("");
      setPassword("");
      setFullName("");
      setRole("sinhvien");
      setCode("");
    } catch (e) {
      const msg = /FORBIDDEN/i.test(String(e?.message))
        ? "Bạn không có quyền (chỉ Admin)."
        : e?.message || "Không tạo được tài khoản.";
      Alert.alert("Lỗi", msg);
    } finally {
      setCreating(false);
    }
  };

  return (
    <SafeAreaView className="bg-black flex-1">
      <Section
        title="Tạo tài khoản"
        subtitle="Admin tạo tài khoản người dùng"
      />
      <View className="px-5">
        <Card>
          <Text className="text-zinc-400 mb-2">Email</Text>
          <TextInput
            style={styles.input}
            placeholder="name@example.com"
            placeholderTextColor="#6b7280"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />

          <Text className="text-zinc-400 mt-3 mb-2">Mật khẩu</Text>
          <TextInput
            style={styles.input}
            placeholder="Tối thiểu 6 ký tự"
            placeholderTextColor="#6b7280"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />

          <Text className="text-zinc-400 mt-3 mb-2">Họ tên</Text>
          <TextInput
            style={styles.input}
            placeholder="Nguyễn Văn A"
            placeholderTextColor="#6b7280"
            value={fullName}
            onChangeText={setFullName}
          />

          {/* Mã SV/GV chung 1 cột */}
          <Text className="text-zinc-400 mt-3 mb-2">Mã (SV/GV)</Text>
          <TextInput
            style={styles.input}
            placeholder="VD: 22111234 hoặc GV001"
            placeholderTextColor="#6b7280"
            autoCapitalize="characters"
            value={code}
            onChangeText={setCode}
          />

          <Text className="text-zinc-400 mt-3 mb-2">Vai trò</Text>
          <View style={styles.roleRow}>
            {ROLES.map((r) => (
              <TouchableOpacity
                key={r.key}
                onPress={() => setRole(r.key)}
                style={[styles.roleBtn, role === r.key && styles.roleBtnActive]}
              >
                <Text
                  style={[
                    styles.roleText,
                    role === r.key && styles.roleTextActive,
                  ]}
                >
                  {r.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Button
            className="mt-4"
            title={creating ? "Đang tạo..." : "Tạo tài khoản"}
            onPress={createUser}
            disabled={creating}
          />
        </Card>
      </View>
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
  roleRow: {
    flexDirection: "row",
    gap: 8,
  },
  roleBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#2a2e34",
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
    backgroundColor: "#151518",
  },
  roleBtnActive: {
    backgroundColor: "#2563eb",
    borderColor: "#2563eb",
  },
  roleText: {
    color: "#c9cdd1",
    fontWeight: "700",
  },
  roleTextActive: {
    color: "white",
  },
});
