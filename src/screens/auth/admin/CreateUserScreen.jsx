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

  // Mã SV/GV + trạng thái kiểm tra
  const [code, setCode] = useState("");
  // idle | checking | available | taken | error
  const [codeStatus, setCodeStatus] = useState("idle");
  const [codeMsg, setCodeMsg] = useState("");

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

  // ==== KIỂM TRA MÃ (cố gắng qua RPC; fallback đếm nhanh; nếu thiếu quyền => coi như khả dụng) ====
  const isCodeTaken = async (ma) => {
    if (!ma) return false;
    try {
      // 1) Thử RPC security definer nếu bạn đã tạo (khuyến nghị)
      const { data, error } = await supabase.rpc(
        "admin_check_code_available_v2",
        { p_code: ma }
      );
      if (error) throw error;
      if (data && typeof data.available === "boolean") {
        return !data.available; // available=true => chưa bị dùng
      }
      // 2) Fallback: đếm nhanh (có thể bị RLS chặn)
      const { count, error: e2 } = await supabase
        .from("hoso")
        .select("nguoi_dung_id", { count: "exact", head: true })
        .eq("ma_sinh_vien", ma);
      if (e2) throw e2; // nếu RLS chặn, nhảy vào catch
      return (count || 0) > 0;
    } catch {
      // Không đủ quyền / chưa có RPC -> KHÔNG chặn tạo tài khoản
      return false;
    }
  };

  const handleCodeBlur = async () => {
    const normalized = (code || "").trim().toUpperCase();
    if (!normalized) {
      setCodeStatus("idle");
      setCodeMsg("");
      return;
    }
    try {
      setCodeStatus("checking");
      setCodeMsg("Đang kiểm tra…");
      const taken = await isCodeTaken(normalized);
      if (taken) {
        setCodeStatus("taken");
        setCodeMsg(`Mã đã tồn tại: ${normalized}`);
      } else {
        setCodeStatus("available");
        setCodeMsg(`Mã khả dụng: ${normalized}`);
      }
    } catch (e) {
      setCodeStatus("error");
      setCodeMsg(e?.message || "Không kiểm tra được trùng mã.");
    }
  };

  // ==== TẠO USER BẰNG EDGE FUNCTION `create-user` ====
  const createUser = async () => {
    const v = validate();
    if (!v) return;
    const { em, pw, fn } = v;

    const maSV = (code || "").trim().toUpperCase() || null;

    // Nếu người dùng đã blur nhưng vẫn đang "checking"
    if (codeStatus === "checking") {
      Alert.alert("Đang kiểm tra", "Vui lòng đợi kiểm tra mã xong.");
      return;
    }
    // Nếu user chưa blur (idle) mà nhập mã, kiểm tra nhanh 1 lần
    if (maSV && codeStatus === "idle") {
      try {
        setCodeStatus("checking");
        const taken = await isCodeTaken(maSV);
        if (taken) {
          setCodeStatus("taken");
          setCodeMsg(`Mã đã tồn tại: ${maSV}`);
          Alert.alert("Trùng mã", `Mã đã tồn tại: ${maSV}.`);
          return;
        }
        setCodeStatus("available");
        setCodeMsg(`Mã khả dụng: ${maSV}`);
      } catch (e) {
        // Không khóa luồng tạo tài khoản chỉ vì thiếu quyền kiểm tra mã
        setCodeStatus("error");
        setCodeMsg(e?.message || "Không kiểm tra được trùng mã.");
      }
    }

    try {
      setCreating(true);

      // GỌI EDGE FUNCTION (chuẩn Supabase Admin API)
      const { data, error } = await supabase.functions.invoke("admin_users", {
        body: {
          action: "create",
          email: em,
          password: pw,
          full_name: fn,
          vai_tro: role, // "sinhvien" | "giangvien" | "quantri"
          ma_sinh_vien: maSV, // mã SV/GV (nếu có)
        },
      });

      if (error) {
        const msg = (error.message || "").toLowerCase();
        if (msg.includes("unauthorized"))
          throw new Error("Bạn cần đăng nhập với tài khoản admin.");
        if (msg.includes("forbidden"))
          throw new Error("Chỉ tài khoản 'quản trị' mới được tạo người dùng.");
        if (msg.includes("email_taken") || msg.includes("409"))
          throw new Error("Email đã tồn tại.");
        throw new Error(error.message);
      }

      const newUserId = data?.user_id;
      if (!newUserId) {
        throw new Error("Hàm tạo tài khoản không trả về user_id.");
      }

      Alert.alert("Thành công", "Đã tạo tài khoản người dùng.");
      setEmail("");
      setPassword("");
      setFullName("");
      setRole("sinhvien");
      setCode("");
      setCodeStatus("idle");
      setCodeMsg("");
    } catch (e) {
      const msg = e?.message || "Không tạo được tài khoản.";
      Alert.alert("Lỗi", msg);
    } finally {
      setCreating(false);
    }
  };

  const codeHelperColor =
    codeStatus === "available"
      ? "#22c55e"
      : codeStatus === "taken"
      ? "#ef4444"
      : codeStatus === "error"
      ? "#f59e0b"
      : "#9aa0a6"; // checking/idle

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

          <Text className="text-zinc-400 mt-3 mb-2">Mã (SV/GV)</Text>
          <TextInput
            style={styles.input}
            placeholder="VD: 22111234 hoặc GV001"
            placeholderTextColor="#6b7280"
            autoCapitalize="characters"
            value={code}
            onChangeText={(t) => {
              setCode((t || "").toUpperCase());
              setCodeStatus("idle");
              setCodeMsg("");
            }}
            onBlur={handleCodeBlur}
          />
          {!!codeMsg && (
            <Text style={{ color: codeHelperColor, marginTop: 6 }}>
              {codeStatus === "checking" ? "Đang kiểm tra…" : codeMsg}
            </Text>
          )}

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
            disabled={creating || codeStatus === "checking"}
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
