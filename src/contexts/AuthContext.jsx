// src/contexts/AuthContext.jsx
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  View,
  ActivityIndicator,
  Text,
  Alert,
  Image,
  Animated,
} from "react-native";

import { supabase } from "../lib/supabase";

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

function Splash() {
  const scale = React.useRef(new Animated.Value(0.7)).current;
  const opacity = React.useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale, {
        toValue: 1,
        friction: 5,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 450,
        useNativeDriver: true,
      }),
    ]).start();
  }, [scale, opacity]);

  return (
    <View className="flex-1 items-center justify-center bg-black">
      <Animated.Image
        source={require("../../assets/logo-vci.png")}
        resizeMode="contain"
        style={{
          width: 160,
          height: 160,
          marginBottom: 18,
          opacity,
          transform: [{ scale }],
        }}
      />

      <Text
        style={{
          color: "white",
          fontSize: 20,
          fontWeight: "600",
        }}
      >
        VCI - CĐ Công Thương VN
      </Text>
    </View>
  );
}

// timeout mềm cho mọi promise
async function withTimeout(promise, ms, tag = "task") {
  let timer;
  try {
    const timeout = new Promise((_, rej) => {
      timer = setTimeout(
        () => rej(new Error(`${tag} timeout after ${ms}ms`)),
        ms
      );
    });
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export function AuthProvider({ children }) {
  const [booting, setBooting] = useState(true);
  const [session, setSession] = useState(null);
  const [hoso, setHoso] = useState(null);
  const [loadingHoso, setLoadingHoso] = useState(false);

  // ===== Boot & subscribe auth =====
  // ===== Boot & subscribe auth =====
  useEffect(() => {
    let mounted = true;
    const MIN_SPLASH_MS = 1200; // thời gian tối thiểu hiển thị Splash (0.8s)
    const startedAt = Date.now();

    (async () => {
      console.log("[Auth] getSession()");
      const { data, error } = await supabase.auth.getSession();
      if (error) console.log("[Auth] getSession error:", error.message);
      if (mounted) setSession(data?.session ?? null);

      // đảm bảo Splash hiển thị đủ MIN_SPLASH_MS
      const elapsed = Date.now() - startedAt;
      const wait = Math.max(0, MIN_SPLASH_MS - elapsed);

      setTimeout(() => {
        if (mounted) {
          setBooting(false);
        }
      }, wait);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((evt, s) => {
      console.log("[Auth] onAuthStateChange:", evt, !!s);
      setSession(s ?? null);
    });

    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, []);

  // ===== Hồ sơ (KHÔNG chặn điều hướng) =====
  const refreshHoso = async () => {
    if (!session?.user) {
      setHoso(null);
      return null;
    }
    try {
      setLoadingHoso(true);
      console.log("[Auth] refreshHoso -> rpc(get_hoso_self)");
      // timeout mềm 6s để không treo UI
      const { data, error } = await withTimeout(
        supabase.rpc("get_hoso_self"),
        6000,
        "get_hoso_self"
      );
      if (error) throw error;

      if (data?.da_vo_hieu_hoa_luc) {
        Alert.alert("Tài khoản bị vô hiệu hóa", "Vui lòng liên hệ quản trị.");
        await supabase.auth.signOut();
        setHoso(null);
        return null;
      }

      setHoso(data || null);
      console.log("[Auth] refreshHoso ok, role:", data?.vai_tro || "(null)");
      return data || null;
    } catch (e) {
      console.log("[Auth] refreshHoso error:", e?.message || String(e));
      setHoso(null);
      return null;
    } finally {
      setLoadingHoso(false);
    }
  };

  // Tự nạp hồ sơ khi user thay đổi (fire-and-forget)
  useEffect(() => {
    if (session?.user) refreshHoso();
    else setHoso(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id]);

  const signIn = async (email, password) => {
    try {
      console.log("[Auth] signInWithPassword start:", email);
      const res = await withTimeout(
        supabase.auth.signInWithPassword({ email, password }),
        10000,
        "signIn"
      );
      console.log("[Auth] signInWithPassword result:", {
        ok: !!res?.data?.user,
        error: res?.error?.message,
      });
      if (res?.error) throw res.error;
      return { ok: true, user: res?.data?.user ?? null };
    } catch (e) {
      return { ok: false, error: e };
    }
  };

  const signOut = async () => {
    console.log("[Auth] signOut()");
    await supabase.auth.signOut();
    setHoso(null);
  };

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      hoso,
      role: hoso?.vai_tro ?? null,
      loadingHoso,
      signIn,
      refreshHoso, // có thể gọi lại thủ công
      signOut,
    }),
    [session, hoso, loadingHoso]
  );

  if (booting) return <Splash />;
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}
