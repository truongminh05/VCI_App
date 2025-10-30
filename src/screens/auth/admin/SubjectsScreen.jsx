import React, { useEffect, useState, useCallback } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  View,
  Text,
  TextInput,
  FlatList,
  Alert,
  TouchableOpacity,
  RefreshControl,
  Platform,
  KeyboardAvoidingView,
  ActivityIndicator,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import Section from "../../../components/Section";
import Card from "../../../components/Card";
import Button from "../../../components/Button";
import { supabase } from "../../../lib/supabase";
import { TeacherPicker } from "../../../components/TeacherPicker";

export default function SubjectsScreen() {
  const [subjects, setSubjects] = useState([]);
  const [ten_mon, setTenMon] = useState("");
  const [ma_mon, setMaMon] = useState("");
  const [selectedTeacher, setSelectedTeacher] = useState(null);
  const [selectedSubjectId, setSelectedSubjectId] = useState(null);

  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Tải danh sách môn + tên GV dạy (map thủ công, tránh lỗi join)
  const load = useCallback(async () => {
    try {
      setLoading(true);

      // 1) Lấy danh sách môn
      const { data: mon, error: e1 } = await supabase
        .from("monhoc")
        .select("id, ma_mon, ten_mon")
        .order("ten_mon", { ascending: true });
      if (e1) throw e1;

      const subjectIds = (mon ?? []).map((m) => m.id);
      if (subjectIds.length === 0) {
        setSubjects([]);
        return;
      }

      // 2) Lấy giangday của các môn
      const { data: gd, error: e2 } = await supabase
        .from("giangday")
        .select("monhoc_id, giang_vien_id")
        .in("monhoc_id", subjectIds);
      if (e2) throw e2;

      const teacherIds = Array.from(
        new Set((gd ?? []).map((g) => g.giang_vien_id).filter(Boolean))
      );

      // 3) Lấy tên giảng viên trong hoso
      let teachersById = {};
      if (teacherIds.length > 0) {
        const { data: hs, error: e3 } = await supabase
          .from("hoso")
          .select("nguoi_dung_id, ho_ten")
          .in("nguoi_dung_id", teacherIds);
        if (e3) throw e3;
        teachersById = Object.fromEntries(
          (hs ?? []).map((h) => [h.nguoi_dung_id, h.ho_ten])
        );
      }

      // 4) Gán tên GV vào từng môn
      const gdBySubject = {};
      (gd ?? []).forEach((g) => {
        if (!gdBySubject[g.monhoc_id]) gdBySubject[g.monhoc_id] = [];
        gdBySubject[g.monhoc_id].push({
          giang_vien_id: g.giang_vien_id,
          ho_ten: teachersById[g.giang_vien_id],
        });
      });

      const merged = (mon ?? []).map((m) => ({
        ...m,
        giangday: gdBySubject[m.id] ?? [],
      }));

      setSubjects(merged);
    } catch (err) {
      console.error("Lỗi tải môn học:", err);
      Alert.alert("Lỗi tải môn học", err?.message || String(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  const createSubject = async () => {
    if (!ten_mon || !ma_mon)
      return Alert.alert("Thiếu", "Nhập đủ mã và tên môn học.");
    const { error } = await supabase.from("monhoc").insert({ ma_mon, ten_mon });
    if (error) Alert.alert("Lỗi", error.message);
    else {
      Alert.alert("OK", "Đã tạo môn học.");
      setTenMon("");
      setMaMon("");
      load();
    }
  };

  const assignTeacher = async () => {
    if (!selectedSubjectId || !selectedTeacher?.nguoi_dung_id) {
      return Alert.alert("Thiếu", "Hãy chọn môn học và giảng viên.");
    }
    const { error } = await supabase.from("giangday").insert({
      monhoc_id: selectedSubjectId,
      giang_vien_id: selectedTeacher.nguoi_dung_id,
    });
    if (error) {
      if (error.code === "23505")
        Alert.alert("Lỗi", "Giảng viên này đã được phân công cho môn học này.");
      else Alert.alert("Lỗi", error.message);
    } else {
      Alert.alert("Thành công", `Đã phân công GV ${selectedTeacher.ho_ten}.`);
      setSelectedTeacher(null);
      setSelectedSubjectId(null);
      load();
    }
  };

  // ===== Header để cả màn trượt lên/xuống =====
  const renderHeader = () => (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 64 : 0}
    >
      <Section title="Quản lý Môn học" />

      <View className="px-5">
        {/* Tạo môn */}
        <Card>
          <Text className="text-zinc-400 mb-2">Mã môn</Text>
          <TextInput
            className="bg-zinc-800 rounded-xl px-4 py-3 text-white"
            value={ma_mon}
            onChangeText={setMaMon}
            placeholder="CS101"
            placeholderTextColor="#9ca3af"
          />
          <Text className="text-zinc-400 mt-3 mb-2">Tên môn học</Text>
          <TextInput
            className="bg-zinc-800 rounded-xl px-4 py-3 text-white"
            value={ten_mon}
            onChangeText={setTenMon}
            placeholder="Nhập môn Lập trình"
            placeholderTextColor="#9ca3af"
          />
          <Button
            className="mt-4"
            title="Tạo môn học"
            onPress={createSubject}
          />
        </Card>

        {/* Phân công giảng dạy */}
        <Card className="mt-4">
          <Text className="text-white font-semibold mb-3">
            Phân công giảng dạy
          </Text>
          <Text className="text-zinc-400 mb-2">
            Môn học (chọn từ danh sách bên dưới)
          </Text>
          <View className="bg-zinc-800 rounded-xl px-4 py-3">
            <Text className="text-white">
              {selectedSubjectId
                ? subjects.find((s) => s.id === selectedSubjectId)?.ten_mon
                : "Chưa chọn"}
            </Text>
          </View>

          <Text className="text-zinc-400 mt-3 mb-2">Giảng viên</Text>
          <TeacherPicker
            value={selectedTeacher}
            onChange={setSelectedTeacher}
          />

          <Button
            className="mt-4"
            title="Lưu phân công"
            onPress={assignTeacher}
          />
        </Card>

        {loading && (
          <View style={{ paddingVertical: 12 }}>
            <ActivityIndicator />
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  );

  return (
    <SafeAreaView className="bg-black flex-1">
      <FlatList
        className="mt-4"
        data={subjects}
        keyExtractor={(i) => i.id}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={renderHeader}
        contentContainerStyle={{ paddingBottom: 24 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        renderItem={({ item }) => {
          const teacherNames = (item.giangday || [])
            .map((g) => g?.ho_ten)
            .filter(Boolean)
            .join(", ");

          return (
            <TouchableOpacity onPress={() => setSelectedSubjectId(item.id)}>
              <Card
                className={`mx-5 mb-3 ${
                  selectedSubjectId === item.id
                    ? "border-2 border-indigo-500"
                    : "border-2 border-transparent"
                }`}
              >
                <Text className="text-white font-semibold">{item.ten_mon}</Text>
                <Text className="text-zinc-400">{item.ma_mon}</Text>
                <Text className="text-zinc-500 mt-2">
                  GV phụ trách: {teacherNames || "Chưa có"}
                </Text>
              </Card>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          !loading && (
            <View style={{ padding: 24, alignItems: "center" }}>
              <Text className="text-zinc-400">Chưa có môn học.</Text>
            </View>
          )
        }
        ListFooterComponent={<View style={{ height: 12 }} />}
      />
    </SafeAreaView>
  );
}
