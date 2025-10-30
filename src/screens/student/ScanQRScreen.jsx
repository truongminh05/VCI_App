import React, { useState, useEffect } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import Button from "../../components/Button";
import { View, Text, StyleSheet, Alert } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";

const STATUS_ON_TIME = "dung_gio"; // đổi theo enum của bạn nếu khác

export default function ScanQRScreen() {
  const { user } = useAuth();
  const [permission, requestPermission] = useCameraPermissions();
  const [isScanning, setIsScanning] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!permission || !permission.granted) requestPermission();
  }, [permission]);

  const onBarcodeScanned = async ({ data }) => {
    if (busy) return;
    setBusy(true);
    try {
      let payload = null;
      try {
        payload = JSON.parse(data);
      } catch {
        throw new Error("Mã QR không hợp lệ.");
      }
      const { sid /* buoihoc_id */, slot, sig } = payload || {};
      if (!sid) throw new Error("Thiếu buoihoc_id trong QR.");

      // ✅ Ghi nhận điểm danh qua RPC ép kiểu ENUM ở DB
      // (nếu bạn cần xác thực chữ ký/số slot, hãy làm bên trong hàm SQL của bạn)
      const { error } = await supabase.rpc("insert_diemdanh_qr", {
        p_buoihoc: sid,
        p_trang_thai: STATUS_ON_TIME, // "dung_gio"
        // p_sinhvien: không truyền -> mặc định auth.uid()
      });
      if (error) throw error;

      Alert.alert("Thành công", "Đã ghi nhận điểm danh!");
    } catch (e) {
      Alert.alert("Lỗi", e.message || "Không thể xử lý mã QR.");
    } finally {
      setBusy(false);
      setIsScanning(false);
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
            title="Bắt đầu quét"
            onPress={() => setIsScanning(true)}
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
