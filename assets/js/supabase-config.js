/* =========================================================
   supabase-config.js — Cấu hình kết nối Supabase
   Lấy tại: Supabase Dashboard → Project Settings → API (hoặc nút "Connect")
     • url     : Project URL, dạng https://xxxx.supabase.co
     • anonKey : anon public key (hoặc publishable key, dạng sb_publishable_...)
   Để trống thì app chạy ở chế độ chỉ lưu trên máy (localStorage).

   ⚠️ TUYỆT ĐỐI không dán "service_role" / "secret" key vào đây.
   anon key để lộ trong mã nguồn web là bình thường. Dữ liệu được bảo vệ
   bằng Row Level Security trong supabase/schema.sql.
   ========================================================= */
const SUPABASE_CONFIG = {
  url: 'https://lrvnyeradusjchofvyiq.supabase.co',
  anonKey: 'sb_publishable_FXAjZAGh828w0NaUghNHMw_c_BnmFH2',
};
