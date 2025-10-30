import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { supabase } from "../lib/supabase";
import { View, ActivityIndicator, Text, Alert } from "react-native";

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

function Splash() {
  return (
    <View className="flex-1 items-center justify-center bg-black">
      <ActivityIndicator size="large" />
      <Text className="text-white mt-3">Đang khởi tạo...</Text>
    </View>
  );
}

export function AuthProvider({ children }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [hoso, setHoso] = useState(null); // {vai_tro, ho_ten, ...}

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, s) => {
      setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    let active = true;
    const fetchHoso = async () => {
      if (!session?.user) {
        setHoso(null);
        return;
      }
      const { data, error } = await supabase
        .from("hoso")
        .select("*")
        .eq("nguoi_dung_id", session.user.id)
        .maybeSingle();
      if (!active) return;
      if (error) {
        console.log("hoso error", error);
        setHoso(null);
      } else {
        if (data?.da_vo_hieu_hoa_luc) {
          Alert.alert(
            "Tài khoản bị vô hiệu hóa",
            "Tài khoản của bạn đã bị quản trị viên khóa. Vui lòng liên hệ để biết thêm chi tiết."
          );
          supabase.auth.signOut(); // Buộc đăng xuất
          setHoso(null);
          setSession(null);
        } else {
          setHoso(data); // Chỉ set hồ sơ nếu tài khoản hợp lệ
        }
      }
    }; // {vai_tro: 'sinhvien'|'giangvien'|'quantri'}

    fetchHoso();
    return () => {
      active = false;
    };
  }, [session?.user?.id]);

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      hoso,
      role: hoso?.vai_tro ?? null,
      refreshHoso: async () => {
        if (!session?.user) return;
        const { data } = await supabase
          .from("hoso")
          .select("*")
          .eq("nguoi_dung_id", session.user.id)
          .maybeSingle();
        setHoso(data);
      },
      signOut: () => supabase.auth.signOut(),
    }),
    [session, hoso]
  );

  if (loading) return <Splash />;
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}
