// src/lib/supabase.js
import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

// !!! ĐIỀN CHÍNH XÁC 2 GIÁ TRỊ NÀY !!!
export const SUPABASE_URL = "https://bulfvsyvpltnovfetfdh.supabase.co".replace(
  /\/+$/,
  ""
);
export const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1bGZ2c3l2cGx0bm92ZmV0ZmRoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI1OTE4MTIsImV4cCI6MjA3ODE2NzgxMn0.5YY7ZbF4i97k4gJhGi8OTAm2xfuZlL94IBQbx7-Ynp8"; // anon key thật

// Debug fetch: log khi response KHÔNG phải JSON hoặc status >= 400
async function debugFetch(url, init = {}) {
  const res = await fetch(url, init);
  const ct = res.headers?.get?.("content-type") || "";
  if (!ct.includes("application/json") || res.status >= 400) {
    let preview = "";
    try {
      preview = (await res.clone().text()).slice(0, 200);
      // tránh log token: cắt ngắn & không log nếu là /auth/v1/token
      const u = typeof url === "string" ? url : url.toString?.() || "";
      if (/\/auth\/v1\/token/i.test(u)) preview = "[redacted token response]";
      console.log("[Supabase HTTP]", res.status, u, ct, "->", preview);
    } catch {
      // ignore
    }
  }
  return res;
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    storage: AsyncStorage,
  },
  global: { fetch: debugFetch },
});
