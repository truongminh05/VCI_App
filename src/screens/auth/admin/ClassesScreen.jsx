import React, { useEffect, useState, useCallback } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  View,
  Text,
  TextInput,
  Alert,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  RefreshControl,
  Platform,
  KeyboardAvoidingView,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import Section from "../../../components/Section";
import Card from "../../../components/Card";
import Button from "../../../components/Button";
import { supabase } from "../../../lib/supabase";

import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import * as XLSX from "xlsx";

// 🔧 Đổi theo tên Edge Function thật để tạo user (service role)
const EDGE_FN_CREATE_USER = "swift-task";

export default function ClassesScreen() {
  const [items, setItems] = useState([]);
  const [ten_lop, setTenLop] = useState("");
  const [selectedLop, setSelectedLop] = useState(null);

  const [loadingImport, setLoadingImport] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // toggle và state cho nhập thủ công
  const [showManual, setShowManual] = useState(false);
  const [manTab, setManTab] = useState("create"); // "create" | "enroll"
  const [manBusy, setManBusy] = useState(false);
  const [name, setName] = useState("");
  const [studentCode, setStudentCode] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const resetManual = () => {
    setName("");
    setStudentCode("");
    setEmail("");
    setPassword("");
  };

  const load = async () => {
    const { data, error } = await supabase
      .from("lop")
      .select("id, ten_lop, dangky(count)")
      .order("ten_lop", { ascending: true });
    if (error) Alert.alert("Lỗi", error.message);
    setItems(data || []);
  };

  useFocusEffect(
    useCallback(() => {
      load();
    }, [])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, []);

  const create = async () => {
    if (!ten_lop.trim()) return Alert.alert("Thiếu", "Nhập tên lớp.");
    const { error } = await supabase
      .from("lop")
      .insert({ ten_lop: ten_lop.trim() });
    if (error) Alert.alert("Lỗi", error.message);
    else {
      Alert.alert("OK", "Đã tạo lớp");
      setTenLop("");
      load();
    }
  };

  // ===== Import Excel =====
  const handleImport = async () => {
    if (!selectedLop)
      return Alert.alert(
        "Chưa chọn lớp",
        "Nhấn chọn một lớp trong danh sách trước khi import."
      );
    try {
      setLoadingImport(true);
      const res = await DocumentPicker.getDocumentAsync({
        type: [
          "application/vnd.ms-excel", // .xls
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
        ],
        copyToCacheDirectory: true,
      });
      if (res.canceled) return;

      const asset = res.assets?.[0];
      if (!asset?.uri) throw new Error("Không đọc được file đã chọn.");

      const b64 = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const wb = XLSX.read(b64, { type: "base64" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });

      const payload = rows.map((row) => ({
        ho_ten: row["Họ tên"] || row.ho_ten || row.hoten || row.fullname || "",
        ngay_sinh: row["Ngày sinh"] || row.ngay_sinh || "",
        gioi_tinh: row["Giới tính"] || row.gioi_tinh || "",
        email: row["Email"] || row.email || "",
        ma_sinh_vien:
          row["Mã sinh viên"] || row.ma_sinh_vien || row.mssv || row.masv || "",
      }));

      const { data, error } = await supabase.rpc("import_students_from_excel", {
        p_lop_id: selectedLop.id,
        p_students: payload,
      });
      if (error) throw error;

      Alert.alert(
        "Import hoàn tất",
        `Thành công: ${data.success_count}\nThất bại: ${data.fail_count}${
          data.errors?.length ? `\n\nLỗi:\n${data.errors.join("\n")}` : ""
        }`
      );
      load();
    } catch (e) {
      Alert.alert("Lỗi Import", e?.message || String(e));
    } finally {
      setLoadingImport(false);
    }
  };

  // ===== Thủ công: Tạo mới & ghi danh =====
  const handleCreateAndEnroll = async () => {
    try {
      if (!selectedLop?.id)
        return Alert.alert("Chưa chọn lớp", "Hãy chọn lớp trước.");
      if (!name.trim() || !email.trim() || !password)
        return Alert.alert(
          "Thiếu thông tin",
          "Nhập đủ Họ tên, Email, Mật khẩu."
        );
      setManBusy(true);

      let { data, error } = await supabase.functions.invoke(
        EDGE_FN_CREATE_USER,
        {
          body: {
            email: email.trim(),
            password,
            ho_ten: name.trim(),
            vai_tro: "sinhvien",
          },
        }
      );
      if (error) throw error;
      const uid =
        data?.user?.id || data?.user_id || data?.id || data?.data?.user?.id;
      if (!uid) throw new Error("Function không trả về user.id");

      const { error: eHoso } = await supabase.from("hoso").upsert(
        {
          nguoi_dung_id: uid,
          ho_ten: name.trim(),
          ma_sinh_vien: studentCode?.trim()
            ? studentCode.trim().toUpperCase()
            : null,
          vai_tro: "sinhvien",
        },
        { onConflict: "nguoi_dung_id" }
      );
      if (eHoso) throw eHoso;

      const { error: eEnroll } = await supabase
        .from("dangky")
        .upsert(
          { lop_id: selectedLop.id, sinh_vien_id: uid },
          { onConflict: "lop_id,sinh_vien_id" }
        );
      if (eEnroll) throw eEnroll;

      Alert.alert("OK", "Đã tạo và ghi danh sinh viên.");
      resetManual();
      load();
    } catch (e) {
      // Lỗi RLS sẽ hiện rõ tại đây nếu policy chưa đúng
      Alert.alert("Lỗi", e?.message || String(e));
    } finally {
      setManBusy(false);
    }
  };

  // ===== Thủ công: Ghi danh theo mã SV =====
  const handleEnrollByCode = async () => {
    try {
      if (!selectedLop?.id)
        return Alert.alert("Chưa chọn lớp", "Hãy chọn lớp trước.");
      if (!studentCode.trim())
        return Alert.alert("Thiếu", "Nhập mã sinh viên.");
      setManBusy(true);

      const code = studentCode.trim().toUpperCase();
      const { data: h, error } = await supabase
        .from("hoso")
        .select("nguoi_dung_id, ho_ten, ma_sinh_vien")
        .eq("ma_sinh_vien", code)
        .maybeSingle();
      if (error) throw error;
      if (!h?.nguoi_dung_id)
        return Alert.alert(
          "Không tìm thấy",
          "Chưa có hồ sơ cho mã sinh viên này."
        );

      const { error: eEnroll } = await supabase
        .from("dangky")
        .upsert(
          { lop_id: selectedLop.id, sinh_vien_id: h.nguoi_dung_id },
          { onConflict: "lop_id,sinh_vien_id" }
        );
      if (eEnroll) throw eEnroll;

      Alert.alert("OK", "Đã ghi danh sinh viên vào lớp.");
      setStudentCode("");
      load();
    } catch (e) {
      Alert.alert("Lỗi", e?.message || String(e));
    } finally {
      setManBusy(false);
    }
  };

  // ===== Header (cuộn cùng FlatList) =====
  const renderHeader = () => (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 64 : 0}
    >
      <View className="px-5">
        <Card>
          {/* Tạo lớp */}
          <Text className="text-zinc-400 mb-2">Tên lớp mới</Text>
          <TextInput
            className="bg-zinc-800 rounded-xl px-4 py-3 text-white"
            value={ten_lop}
            onChangeText={setTenLop}
          />
          <Button className="mt-4" title="Tạo lớp" onPress={create} />

          <View className="border-t border-zinc-700 my-4" />

          {/* Lớp đang chọn */}
          <Text className="text-zinc-400 mb-2">Lớp được chọn</Text>
          <View className="bg-zinc-800 rounded-xl px-4 py-3 mb-3">
            <Text className="text-white font-semibold">
              {selectedLop?.ten_lop || "Chưa chọn"}
            </Text>
          </View>

          {/* Import Excel */}
          {loadingImport ? (
            <ActivityIndicator size="large" color="#a78bfa" />
          ) : (
            <Button
              className="bg-emerald-600"
              title="Import sinh viên từ Excel"
              onPress={handleImport}
            />
          )}

          {/* Toggle thủ công */}
          <View className="mt-3">
            <Button
              title={
                showManual ? "Ẩn nhập thủ công" : "Thêm sinh viên thủ công"
              }
              onPress={() => setShowManual((s) => !s)}
            />
          </View>

          {/* Form thủ công */}
          {showManual && (
            <View className="mt-4">
              {/* mini tabs */}
              <View className="flex-row mb-3">
                {[
                  { key: "create", label: "Tạo mới & ghi danh" },
                  { key: "enroll", label: "Ghi danh theo mã SV" },
                ].map((t) => (
                  <TouchableOpacity
                    key={t.key}
                    onPress={() => setManTab(t.key)}
                    className={`px-3 py-2 mr-2 rounded-xl ${
                      manTab === t.key ? "bg-indigo-600" : "bg-zinc-800"
                    }`}
                  >
                    <Text className="text-white">{t.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {manTab === "create" ? (
                <View>
                  <Text className="text-zinc-400 mb-1">Họ tên</Text>
                  <TextInput
                    value={name}
                    onChangeText={setName}
                    placeholder="Nguyễn Văn A"
                    placeholderTextColor="#9ca3af"
                    className="bg-zinc-900 text-white px-3 py-2 rounded-xl mb-3"
                  />
                  <Text className="text-zinc-400 mb-1">
                    Mã sinh viên (tuỳ chọn)
                  </Text>
                  <TextInput
                    value={studentCode}
                    onChangeText={setStudentCode}
                    placeholder="SV123456"
                    placeholderTextColor="#9ca3af"
                    className="bg-zinc-900 text-white px-3 py-2 rounded-xl mb-3"
                  />
                  <Text className="text-zinc-400 mb-1">Email</Text>
                  <TextInput
                    value={email}
                    onChangeText={setEmail}
                    placeholder="sv@example.com"
                    placeholderTextColor="#9ca3af"
                    autoCapitalize="none"
                    keyboardType="email-address"
                    className="bg-zinc-900 text-white px-3 py-2 rounded-xl mb-3"
                  />
                  <Text className="text-zinc-400 mb-1">Mật khẩu</Text>
                  <TextInput
                    value={password}
                    onChangeText={setPassword}
                    placeholder="••••••••"
                    placeholderTextColor="#9ca3af"
                    secureTextEntry
                    className="bg-zinc-900 text-white px-3 py-2 rounded-xl mb-3"
                  />
                  <Button
                    title={manBusy ? "Đang tạo..." : "Tạo & ghi danh"}
                    onPress={handleCreateAndEnroll}
                    disabled={manBusy || !selectedLop?.id}
                  />
                </View>
              ) : (
                <View>
                  <Text className="text-zinc-400 mb-1">Mã sinh viên</Text>
                  <TextInput
                    value={studentCode}
                    onChangeText={setStudentCode}
                    placeholder="SV123456"
                    placeholderTextColor="#9ca3af"
                    className="bg-zinc-900 text-white px-3 py-2 rounded-xl mb-3"
                  />
                  <Button
                    title={manBusy ? "Đang ghi danh..." : "Ghi danh"}
                    onPress={handleEnrollByCode}
                    disabled={manBusy || !selectedLop?.id}
                  />
                </View>
              )}
            </View>
          )}
        </Card>
      </View>
    </KeyboardAvoidingView>
  );

  return (
    <SafeAreaView className="bg-black flex-1">
      <Section title="Lớp học" subtitle="Chọn lớp để import/nhập sinh viên" />

      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListHeaderComponent={renderHeader}
        contentContainerStyle={{ paddingBottom: 24 }}
        renderItem={({ item }) => (
          <TouchableOpacity onPress={() => setSelectedLop(item)}>
            <Card
              className={`mx-5 mb-3 ${
                selectedLop?.id === item.id
                  ? "border-2 border-indigo-500"
                  : "border-2 border-transparent"
              }`}
            >
              <Text className="text-white font-semibold">{item.ten_lop}</Text>
              <Text className="text-zinc-400">
                Sĩ số: {item.dangky[0]?.count || 0}
              </Text>
            </Card>
          </TouchableOpacity>
        )}
        ListFooterComponent={<View style={{ height: 12 }} />}
      />
    </SafeAreaView>
  );
}
