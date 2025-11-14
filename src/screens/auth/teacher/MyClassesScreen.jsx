// screens/attendance/MyClassesScreen.jsx
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

const PAGE_SIZE = 20;
const DAYS_BACK = 365;

export default function MyClassesScreen({ route, navigation }) {
  const lopFromRoute = route?.params?.lop ?? null;

  const [lop, setLop] = useState(lopFromRoute);
  const [lopName, setLopName] = useState(lopFromRoute?.ten_lop ?? "");
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const abortRef = useRef(null);
  const onEndBusyRef = useRef(false); // throttle onEndReached

  // gắn tên lớp nếu chỉ có id
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
        setHasMore(true);
        return;
      }
      cancelInFlight();
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      const offset = p * PAGE_SIZE;
      setLoading(true); // ✅ luôn bật loading cho mọi trang

      try {
        console.log("[GV] rpc get_buoihoc_for_gv", {
          p_lop_id: lop.id,
          p_from: pastISO,
          p_to: futureISO,
          p_limit: PAGE_SIZE,
          p_offset: offset,
        });

        const { data, error } = await supabase
          .rpc("get_buoihoc_for_gv", {
            p_lop_id: lop.id,
            p_from: pastISO,
            p_to: futureISO,
            p_limit: PAGE_SIZE,
            p_offset: offset,
          })
          .abortSignal(ctrl.signal);

        if (ctrl.signal.aborted) return;

        if (error) throw error;

        const rows = (data ?? []).map((b) => ({
          id: b.id,
          start: b.thoi_gian_bat_dau,
          end: b.thoi_gian_ket_thuc,
          subject: b.monhoc_ten || "",
        }));

        console.log("[GV] rpc result len:", rows.length, "page:", p);

        setPage(p);
        setItems((prev) => (p === 0 ? rows : [...prev, ...rows]));

        // ✅ nếu ít hơn PAGE_SIZE thì hết dữ liệu
        setHasMore(rows.length === PAGE_SIZE);
      } catch (e) {
        if (!(e?.name === "AbortError")) {
          const raw = e?.message || String(e);
          console.log("[GV] rpc error:", raw);
          let friendly = raw;
          if (/FORBIDDEN/i.test(raw)) {
            friendly =
              "Bạn chưa được phân công lớp/môn này hoặc chưa là giảng viên của lớp. Hãy kiểm tra bảng phancong_lop/giangday hoặc quyền tạo buổi (tao_boi/giang_vien_id).";
          } else if (/NOT_AUTHENTICATED/i.test(raw)) {
            friendly = "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.";
          }
          Alert.alert("Lỗi tải buổi học", friendly);
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
        onEndBusyRef.current = false; // mở lại onEndReached
      }
    },
    [lop?.id, pastISO, futureISO, cancelInFlight]
  );

  // ✅ chỉ 1 chỗ gọi lần đầu & khi đổi lớp
  useEffect(() => {
    setItems([]);
    setPage(0);
    setHasMore(true);
    if (lop?.id) loadPage(0);
    return cancelInFlight;
  }, [lop?.id, loadPage, cancelInFlight]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setHasMore(true);
    loadPage(0);
  }, [loadPage]);

  const onEndReached = useCallback(() => {
    if (onEndBusyRef.current) return;
    if (loading || !lop?.id || !hasMore) return;
    onEndBusyRef.current = true; // throttle 1 lần
    loadPage(page + 1);
  }, [page, loading, lop?.id, hasMore, loadPage]);

  const goQR = useCallback(
    (session) => {
      if (!session?.id) return;
      navigation.navigate("AttendanceSession", {
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
      <Text style={styles.row}>Bắt đầu: {formatLocal(item.start)}</Text>
      <Text style={styles.row}>Kết thúc: {formatLocal(item.end)}</Text>
      <View style={styles.rowBtns}>
        <Button title="Mở QR" onPress={() => goQR(item)} />
        <View style={{ width: 8 }} />
        <Button title="Thủ công" onPress={() => goManual(item)} />
      </View>
    </Card>
  );

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
        onEndReachedThreshold={0.4}
        onEndReached={onEndReached}
        ListEmptyComponent={
          !loading && (
            <View style={styles.empty}>
              <Text style={{ color: "#c9cdd1" }}>Không có buổi học.</Text>
              <Text
                style={{ color: "#9aa0a6", marginTop: 6, textAlign: "center" }}
              >
                Đang lọc ±365 ngày. Kiểm tra phân công (phancong_lop/giangday) &
                dữ liệu buoihoc.
              </Text>
            </View>
          )
        }
        ListFooterComponent={
          loading && items.length > 0 ? (
            <View style={{ paddingVertical: 12 }}>
              <ActivityIndicator />
            </View>
          ) : (
            <View style={{ height: 12 }} />
          )
        }
      />
    </View>
  );
}

function formatLocal(iso) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso ?? "";
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0b0b0c" },
  listPad: { padding: 12, paddingTop: 8 },
  title: { color: "white", fontSize: 16, fontWeight: "600" },
  row: { color: "#c9cdd1", marginTop: 6 },
  rowBtns: { flexDirection: "row", marginTop: 12 },
  center: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
  },
  empty: { padding: 24, alignItems: "center" },
});
