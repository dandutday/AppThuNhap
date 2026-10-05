/* =========================================================
   cloud.js — Kết nối Supabase (Auth + Postgres)
   Bảng (xem supabase/schema.sql):
     profiles     (user_id, goal, budget)
     sources      (user_id, id, type, name, emoji, color, sort_order)        ← danh mục thu/chi
     transactions (user_id, id, type, amount, source_id, date, status, note, series_id)
   ========================================================= */
const Cloud = (() => {
  const configured = typeof SUPABASE_CONFIG !== 'undefined' && !!SUPABASE_CONFIG.url && !!SUPABASE_CONFIG.anonKey;
  const sdkLoaded = typeof supabase !== 'undefined' && typeof supabase.createClient === 'function';
  const enabled = configured && sdkLoaded;
  const sb = enabled ? supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey) : null;

  /** Lý do không bật được cloud (để hiện cho người dùng) */
  function status() {
    if (!configured) return 'not-configured';
    if (!sdkLoaded) return 'sdk-missing';
    return 'ready';
  }

  /** supabase-js trả về { data, error } thay vì ném lỗi → gom lại cho gọn */
  function check({ data, error }) {
    if (error) throw error;
    return data;
  }

  // Trang để Supabase chuyển về sau khi xác nhận email / đăng nhập Google / đặt lại mật khẩu
  const redirectTo = () => location.origin + location.pathname;

  /* ---------- Đăng nhập ---------- */
  /** cb(user | null, event) — event 'PASSWORD_RECOVERY' khi mở link đặt lại mật khẩu */
  function onAuth(cb) {
    if (!enabled) { cb(null, 'INITIAL_SESSION'); return; }
    sb.auth.onAuthStateChange((event, session) => cb(session?.user ?? null, event));
  }
  const signIn = async (email, password) => check(await sb.auth.signInWithPassword({ email, password }));
  /** Trả về { needsConfirm: true } nếu project bật xác nhận email */
  const signUp = async (email, password) => {
    const data = check(await sb.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo() } }));
    return { needsConfirm: !data.session };
  };
  const signInGoogle = async () => check(await sb.auth.signInWithOAuth({
    provider: 'google', options: { redirectTo: redirectTo() },
  }));
  const resetPassword = async (email) => check(await sb.auth.resetPasswordForEmail(email, { redirectTo: redirectTo() }));
  const updatePassword = async (password) => check(await sb.auth.updateUser({ password }));
  const signOut = async () => check(await sb.auth.signOut());

  /** Các phương thức đăng nhập đang bật trên project, vd { email: true, google: false } */
  async function providers() {
    const res = await fetch(`${SUPABASE_CONFIG.url}/auth/v1/settings`, { headers: { apikey: SUPABASE_CONFIG.anonKey } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return (await res.json()).external || {};
  }

  /** Đổi lỗi Supabase thành câu tiếng Việt dễ hiểu */
  function errorMessage(err) {
    const byCode = {
      invalid_credentials: 'Sai email hoặc mật khẩu.',
      email_not_confirmed: 'Email chưa được xác nhận, hãy mở hộp thư và bấm link xác nhận.',
      user_already_exists: 'Email này đã được đăng ký, hãy đăng nhập.',
      email_exists: 'Email này đã được đăng ký, hãy đăng nhập.',
      weak_password: 'Mật khẩu quá yếu (cần ít nhất 6 ký tự).',
      email_address_invalid: 'Email không hợp lệ.',
      validation_failed: 'Thông tin chưa hợp lệ.',
      over_email_send_rate_limit: 'Gửi email quá nhiều lần, đợi một lát rồi thử lại nhé.',
      over_request_rate_limit: 'Thử quá nhiều lần, đợi một lát rồi thử lại nhé.',
      signup_disabled: 'Project đang tắt đăng ký tài khoản mới.',
      provider_disabled: 'Phương thức đăng nhập này chưa được bật trong Supabase Dashboard.',
      same_password: 'Mật khẩu mới phải khác mật khẩu cũ.',
      '42501': 'Không có quyền truy cập dữ liệu (kiểm tra RLS trong schema.sql).',
      '42P01': 'Chưa có bảng dữ liệu: hãy chạy file supabase/schema.sql trong SQL Editor.',
      PGRST205: 'Chưa có bảng dữ liệu: hãy chạy file supabase/schema.sql trong SQL Editor.',
      // Thiếu cột mới (type, budget) → database là bản cũ
      '42703': 'Database chưa cập nhật: hãy chạy lại file supabase/schema.sql trong SQL Editor.',
      PGRST204: 'Database chưa cập nhật: hãy chạy lại file supabase/schema.sql trong SQL Editor.',
    };
    if (byCode[err?.code]) return byCode[err.code];
    if (err instanceof TypeError || /fetch/i.test(err?.message || '')) return 'Không kết nối được tới Supabase (kiểm tra mạng).';
    return err?.message || 'Có lỗi xảy ra.';
  }

  /* ---------- Chuyển đổi dòng DB ↔ object trong app ---------- */
  const toTxRow = (t, uid) => ({
    user_id: uid, id: t.id, type: t.type, amount: t.amount, source_id: t.sourceId, date: t.date,
    status: t.status, note: t.note || '', series_id: t.seriesId || null,
  });
  const fromTxRow = (r) => ({
    id: r.id, type: r.type, amount: Number(r.amount), sourceId: r.source_id, date: r.date,
    status: r.status, note: r.note, seriesId: r.series_id,
  });
  const toSrcRow = (s, uid) => ({
    user_id: uid, id: s.id, type: s.type, name: s.name, emoji: s.emoji, color: s.color, sort_order: s.order || 0,
  });
  const fromSrcRow = (r) => ({ id: r.id, type: r.type, name: r.name, emoji: r.emoji, color: r.color, order: r.sort_order });

  /* ---------- Đọc dữ liệu ---------- */
  /** Supabase trả tối đa 1000 dòng / lần → đọc theo trang */
  async function selectAll(table, uid) {
    const all = [];
    for (let from = 0; ; from += 1000) {
      const rows = check(await sb.from(table).select('*').eq('user_id', uid).order('id').range(from, from + 999));
      all.push(...rows);
      if (rows.length < 1000) return all;
    }
  }

  /** Trả về { profile | null, sources, transactions } */
  async function fetchAll(uid) {
    const [profile, sources, transactions] = await Promise.all([
      sb.from('profiles').select('*').eq('user_id', uid).maybeSingle().then(check),
      selectAll('sources', uid),
      selectAll('transactions', uid),
    ]);
    return {
      profile: profile ? { goal: Number(profile.goal) || 0, budget: Number(profile.budget) || 0 } : null,
      sources: sources.map(fromSrcRow),
      transactions: transactions.map(fromTxRow),
    };
  }

  /* ---------- Ghi dữ liệu ----------
     ops: [{ op: 'set'|'delete', col: 'meta'|'sources'|'transactions', id, data }]
     Thao tác sau cùng trên cùng một id sẽ thắng. Xoá trước, ghi (upsert) sau. */
  async function write(uid, ops) {
    const tables = { sources: new Map(), transactions: new Map() };
    let profile = null;
    for (const o of ops) {
      if (o.col === 'meta') profile = { user_id: uid, goal: Number(o.data.goal) || 0, budget: Number(o.data.budget) || 0 };
      else tables[o.col].set(o.id, o);
    }

    const chunks = (arr, n = 500) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));
    const toRow = { sources: toSrcRow, transactions: toTxRow };

    if (profile) check(await sb.from('profiles').upsert(profile, { onConflict: 'user_id' }));
    for (const [table, map] of Object.entries(tables)) {
      const list = [...map.values()];
      const dels = list.filter(o => o.op === 'delete').map(o => o.id);
      const ups = list.filter(o => o.op === 'set').map(o => toRow[table](o.data, uid));
      for (const ids of chunks(dels)) check(await sb.from(table).delete().eq('user_id', uid).in('id', ids));
      for (const rows of chunks(ups)) check(await sb.from(table).upsert(rows, { onConflict: 'user_id,id' }));
    }
  }

  return {
    enabled, status, onAuth, signIn, signUp, signInGoogle, resetPassword, updatePassword, signOut, providers,
    errorMessage, fetchAll, write,
  };
})();
