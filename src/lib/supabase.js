import { createClient } from "@supabase/supabase-js";

// Đặt ENV của bạn ở .env hoặc hardcode tạm để chạy nhanh
const SUPABASE_URL = "https://wnrotdjqkdzrqkufotme.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inducm90ZGpxa2R6cnFrdWZvdG1lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA5OTQ1MDgsImV4cCI6MjA3NjU3MDUwOH0.muXEgYQM_hvKI7EG82_7MubR7754gaKue-Xs8ac37So";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
  realtime: {
    params: { eventsPerSecond: 10 },
  },
});
