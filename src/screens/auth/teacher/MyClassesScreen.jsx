import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  Alert,
  RefreshControl,
  StyleSheet,
  Platform,
  KeyboardAvoidingView,
} from "react-native";
import { supabase } from "../../../lib/supabase";
import Section from "../../../components/Section";
import Card from "../../../components/Card";
import Button from "../../../components/Button";
import { ClassPicker } from "../../../components/ClassPicker";
import { useFocusEffect } from "@react-navigation/native";

const PAGE_SIZE = 20;
const DAYS_BACK = 120; // lá»c 120 ngÃ y gáº§n Ä‘Ã¢y

export default function MyClassesScreen({ route, navigation }) {
  // lá»›p nháº­n tá»« mÃ n trÆ°á»›c (náº¿u cÃ³)
  const lopFromRoute = route?.params?.lop ?? null;

  const [lop, setLop] = useState(lopFromRoute);
  const [lopName, setLopName] = useState(lopFromRoute?.ten_lop ?? "");
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const abortRef = useRef(null);

  // náº¿u chá»‰ cÃ³ id mÃ  thiáº¿u tÃªn lá»›p -> láº¥y tÃªn
  useEffect(() => {
    let active = true;
    (async () => {
      if (lop?.id && !lopName) {
        const { data, error } = await supabase
          .from("lop")
          .select("ten_lop")
          .eq("id", lop.id)
          .single();
        if (!error && active) setLopName(data?.ten_lop ?? "");
      }
    })();
    return () => {
      active = false;
    };
  }, [lop?.id]);

  const now = Date.now();
  const pastISO = useMemo(
    () => new Date(now - DAYS_BACK * 24 * 3600 * 1000).toISOString(),
    [lop?.id]
  );
  const futureISO = useMemo(
    () => new Date(now + DAYS_BACK * 24 * 3600 * 1000).toISOString(),
    [lop?.id]
  );

  const cancelInFlight = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  }, []);

  const loadPage = useCallback(
    async (p = 0) => {
      if (!lop?.id) {
        setItems([]);
        return;
      }
      // huá»· request cÅ© náº¿u Ä‘ang cháº¡y
      cancelInFlight();
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      const from = p * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      if (p === 0) setLoading(true);

      let q = supabase
        .from("buoihoc")
        .select(
          `
    id, lop_id, monhoc_id,
    thoi_gian_bat_dau, thoi_gian_ket_thuc,
    monhoc:monhoc_id ( ma_mon, ten_mon )
  `
        )
        .eq("lop_id", lop.id)
        .order("thoi_gian_bat_dau", { ascending: true })
        .range(from, to)
        .abortSignal(ctrl.signal);

      // lá»c theo thá»i gian (cÃ³ thá»ƒ bá» náº¿u muá»‘n)
      // q = q.gte("thoi_gian_bat_dau", nowFrom);

      const { data, error } = await q;

      // náº¿u Ä‘Ã£ bá»‹ huá»·, bá» qua yÃªn láº·ng
      if (ctrl.signal.aborted) return;

      if (error) {
        // Bá»Ž QUA lá»—i Abort
        const msg = String(error.message || "");
        if (error.name === "AbortError" || /abort/i.test(msg)) {
          return;
        }
        Alert.alert("Lỗi tải buổi học", msg);
        setLoading(false);
        setRefreshing(false);
        return;
      }

      const rows = (data ?? []).map((bh) => ({
        id: bh.id,
        start: bh.thoi_gian_bat_dau,
        end: bh.thoi_gian_ket_thuc,
        subject: bh?.monhoc?.ten_mon ?? "",
        subjectCode: bh?.monhoc?.ma_mon ?? "",
      }));
      setPage(p);
      setItems((prev) => (p === 0 ? rows : [...prev, ...rows]));
      setLoading(false);
      setRefreshing(false);
    },
    [lop?.id, cancelInFlight]
  );

  useFocusEffect(
    useCallback(() => {
      if (lop?.id) {
        loadPage(0);
      }
      return cancelInFlight;
    }, [lop?.id, loadPage, cancelInFlight])
  );

  // khi Ä‘á»•i lá»›p -> táº£i láº¡i
  useEffect(() => {
    setItems([]);
    setPage(0);
    if (lop?.id) loadPage(0);
    return cancelInFlight;
  }, [lop?.id, loadPage, cancelInFlight]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadPage(0);
  }, [loadPage]);

  const onEndReached = useCallback(() => {
    if (loading || !lop?.id) return;
    loadPage(page + 1);
  }, [page, loading, lop?.id, loadPage]);

  // Ä‘iá»u hÆ°á»›ng
  const goQR = useCallback(
    (session) => {
      navigation.navigate("AttendanceSession", {
        buoihoc_id: session.id,
        lop_id: lop?.id ?? null,
        ten_lop: lopName ?? "",
      });
    },
    [navigation, lop?.id, lopName]
  );

  const goList = useCallback(
    (session) => {
      navigation.navigate("AttendanceList", {
        buoihoc_id: session.id,
        lop_id: lop?.id ?? null,
        ten_lop: lopName ?? "",
      });
    },
    [navigation, lop?.id, lopName]
  );

  const goManual = useCallback(
    (session) => {
      navigation.navigate("ManualAttendance", {
        buoihoc_id: session.id,
        lop_id: lop?.id ?? null,
        ten_lop: lopName ?? "",
      });
    },
    [navigation, lop?.id, lopName]
  );

  const renderItem = ({ item }) => (
    <Card className="mb-3">
      <Text style={styles.title}>{item.subject || "(Chưa có môn)"}</Text>
      <Text style={styles.sub}>{item.subjectCode}</Text>
      <Text style={styles.row}>Bắt đầu sau: {formatLocal(item.start)}</Text>
      <Text style={styles.row}>Kết thúc sau: {formatLocal(item.end)}</Text>

      <View style={styles.rowBtns}>
        <Button title="QR" onPress={() => goQR(item)} />
        {/* <View style={{ width: 10 }} /> */}
        {/* <Button title="Danh sach" onPress={() => goList(item)} /> */}
        <View style={{ width: 5 }} />
        <Button title="Thủ công" onPress={() => goManual(item)} />
      </View>
    </Card>
  );

  // Header Ä‘á»ƒ toÃ n mÃ n hÃ¬nh cuá»™n (Section + ClassPicker)
  const renderHeader = () => (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 64 : 0}
    >
      <Section
        title="Lớp học"
        subtitle={lopName || "Chọn lớp để xem buổi học"}
      />
      {!lop?.id ? (
        <View style={{ paddingHorizontal: 16 }}>
          <ClassPicker
            value={lop}
            onChange={(v) => {
              setLop(v);
              setLopName(v?.ten_lop ?? "");
            }}
          />
        </View>
      ) : null}

      {loading && items.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={items}
        keyExtractor={(it) => it.id}
        renderItem={renderItem}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={renderHeader}
        contentContainerStyle={styles.listPad}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        onEndReachedThreshold={0.3}
        onEndReached={onEndReached}
        ListEmptyComponent={
          !loading && (
            <View style={styles.empty}>
              <Text style={{ color: "#c9cdd1" }}>Không có buổi học.</Text>
              <Text
                style={{ color: "#9aa0a6", marginTop: 6, textAlign: "center" }}
              >
                Bỏ lọc thời gian hoặc kiểm tra RLS/dữ liệu bảng{" "}
                <Text style={{ color: "#61dafb" }}>buoihoc</Text>.
              </Text>
            </View>
          )
        }
        ListFooterComponent={<View style={{ height: 12 }} />}
      />
    </View>
  );
}

function formatLocal(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return iso ?? "";
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0b0b0c" },
  listPad: { padding: 12, paddingTop: 8 },
  title: { color: "white", fontSize: 16, fontWeight: "600" },
  sub: { color: "#9aa0a6", marginTop: 2 },
  row: { color: "#c9cdd1", marginTop: 6 },
  rowBtns: { flexDirection: "row", marginTop: 12 },
  center: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
  },
  empty: { padding: 24, alignItems: "center" },
});
