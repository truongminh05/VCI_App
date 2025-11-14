import React, { useState, useEffect, useRef } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { View, Text, StyleSheet, Alert } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import Button from "../../components/Button";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";

const STATUS_ON_TIME = "dung_gio";
const STATUS_LATE = "tre_gio";

export default function ScanQRScreen() {
  const { user } = useAuth();
  const [permission, requestPermission] = useCameraPermissions();

  const [isScanning, setIsScanning] = useState(false); // bật/tắt camera
  const [busy, setBusy] = useState(false); // đang xử lý RPC
  const lastScanRef = useRef(0); // chống double-scan trong vài ms

  useEffect(() => {
    if (!permission || !permission.granted) requestPermission();
  }, [permission]);

  const onBarcodeScanned = async ({ data }) => {
    // chống bắn callback liên tục
    const now = Date.now();
    if (busy || now - lastScanRef.current < 1200) return;
    lastScanRef.current = now;

    // TẮT CAMERA NGAY để ngăn vòng lặp
    setIsScanning(false);
    setBusy(true);

    try {
      let payload;
      try {
        payload = JSON.parse(data);
      } catch {
        throw new Error("Mã QR không hợp lệ.");
      }

      const { sid /* buoihoc_id */, slot, sig, phase } = payload || {};
      if (!sid) throw new Error("Thiếu buoihoc_id trong QR.");
      // Quy tắc duy nhất: phase bắt buộc phải có và phải là "ontime" | "late"
      if (phase !== "ontime" && phase !== "late") {
        throw new Error("Mã QR không hợp lệ hoặc đã hết hạn (thiếu phase).");
      }
      const statusVal = phase === "ontime" ? STATUS_ON_TIME : STATUS_LATE;

      // Ghi nhận điểm danh (giả định RPC đã xác thực chữ ký/số slot trong DB)
      // 🚨 ĐÃ CHỈNH SỬA: Thêm 3 tham số p_lat, p_lon, p_thietbi_id
      const { error } = await supabase.rpc("insert_diemdanh_qr", {
        p_buoihoc: sid,
        p_trang_thai: statusVal, // "dung_gio" | "tre_gio"
        p_lat: null, // Tham số thêm mới, giá trị null
        p_lon: null, // Tham số thêm mới, giá trị null
        p_thietbi_id: "mobile-app", // Tham số thêm mới, giá trị cố định
      });

      if (error) throw error;

      Alert.alert(
        "Thành công",
        `Đã ghi nhận điểm danh: ${
          statusVal === STATUS_ON_TIME ? "Đúng giờ" : "Trễ giờ"
        }`,
        [
          {
            text: "Quét lại",
            onPress: () => {
              setBusy(false);
              // tùy ý bật lại camera để quét tiếp
              setIsScanning(true);
            },
          },
          {
            text: "Đóng",
            onPress: () => {
              setBusy(false);
              // giữ camera tắt
            },
            style: "cancel",
          },
        ]
      );
      return; // kết thúc sớm để không vào finally setIsScanning(true)
    } catch (e) {
      Alert.alert("Lỗi", e?.message || "Không thể xử lý mã QR.", [
        {
          text: "Quét lại",
          onPress: () => {
            setBusy(false);
            setIsScanning(true);
          },
        },
      ]);
    } finally {
      // nếu người dùng không chọn gì (trên Android có thể back Alert),
      // đảm bảo không bị kẹt trạng thái busy
      setBusy(false);
    }
  };

  if (!permission) return <View />;
  if (!permission.granted) {
    return (
      <SafeAreaView className="bg-black flex-1 items-center justify-center">
        <Text className="text-white mb-4">Ứng dụng cần quyền Camera.</Text>
        <Button title="Cấp quyền" onPress={requestPermission} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="bg-black flex-1">
      {isScanning ? (
        <View style={{ flex: 1 }}>
          <CameraView
            style={{ flex: 1 }}
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            onBarcodeScanned={onBarcodeScanned}
          />
          <View style={styles.overlay}>
            <Text className="text-white">Đưa mã vào khung để quét</Text>
          </View>
        </View>
      ) : (
        <View className="px-6 py-8">
          <Text className="text-white text-xl font-semibold mb-2">
            Quét mã điểm danh
          </Text>
          <Text className="text-zinc-400 mb-6">
            Mã QR động do Giảng viên hiển thị sẽ thay đổi theo thời gian.
          </Text>
          <Button
            title={busy ? "Đang xử lý..." : "Bắt đầu quét"}
            onPress={() => {
              lastScanRef.current = 0; // reset chống double trước khi bật lại
              setIsScanning(true);
            }}
            disabled={busy}
          />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: 16,
    backgroundColor: "rgba(0,0,0,0.4)",
    alignItems: "center",
  },
});
