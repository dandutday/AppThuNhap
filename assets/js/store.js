/* =========================================================
   store.js — Lớp dữ liệu, 2 chế độ:
     • 'local' : chưa đăng nhập → lưu localStorage
     • 'cloud' : đã đăng nhập  → lưu trên Supabase (qua cloud.js)
   Giao diện chỉ đọc dữ liệu từ bộ nhớ (state) nên không cần biết đang ở chế độ nào.

   state = {
     sources: [{ id, type:'income'|'expense', name, emoji, color, order }],   // danh mục thu / chi
     transactions: [{ id, type:'income'|'expense', amount, sourceId, date:'YYYY-MM-DD',
                      status:'received'|'pending', note, seriesId|null }],
     settings: { goal, budget }   // mục tiêu thu nhập & ngân sách chi tiêu mỗi tháng
   }
   status 'received' = đã nhận (thu) / đã chi (chi); 'pending' = chờ nhận / sắp chi
   ========================================================= */
const Store = (() => {
  const KEY = 'heodat.income.v1';
  const THEME_KEY = 'heodat.theme'; // giao diện sáng/tối lưu riêng từng máy

  const EMOJIS = ['💼', '💻', '🎨', '📈', '🎁', '💰', '🧧', '🐷', '🌱', '✨',
    '🍜', '☕', '🛵', '🚗', '✈️', '🏠', '💡', '📱', '🛒', '👕', '🎮', '🎬', '💊', '📚', '🐶', '👶', '📦'];

  const defaultIncome = () => [
    { id: 'salary', name: 'Lương', emoji: '💼', color: '#8aa8ff' },
    { id: 'freelance', name: 'Freelance', emoji: '💻', color: '#f59ac0' },
    { id: 'business', name: 'Kinh doanh', emoji: '🛍️', color: '#ffc27a' },
    { id: 'invest', name: 'Đầu tư', emoji: '📈', color: '#6fd6aa' },
    { id: 'bonus', name: 'Thưởng', emoji: '🎁', color: '#bfa2ff' },
    { id: 'other', name: 'Khác', emoji: '✨', color: '#a7b4c6' },
  ].map((s, i) => ({ ...s, type: 'income', order: i + 1 }));

  const defaultExpense = () => [
    { id: 'exp_food', name: 'Ăn uống', emoji: '🍜', color: '#ff9f7a' },
    { id: 'exp_transport', name: 'Di chuyển', emoji: '🛵', color: '#7cc4ff' },
    { id: 'exp_home', name: 'Nhà ở', emoji: '🏠', color: '#b9a3ff' },
    { id: 'exp_bills', name: 'Hoá đơn', emoji: '💡', color: '#ffd166' },
    { id: 'exp_shopping', name: 'Mua sắm', emoji: '🛒', color: '#f59ac0' },
    { id: 'exp_fun', name: 'Giải trí', emoji: '🎮', color: '#6fd6aa' },
    { id: 'exp_health', name: 'Sức khoẻ', emoji: '💊', color: '#ff8fa3' },
    { id: 'exp_edu', name: 'Học tập', emoji: '📚', color: '#8aa8ff' },
    { id: 'exp_other', name: 'Khác', emoji: '📦', color: '#a7b4c6' },
  ].map((s, i) => ({ ...s, type: 'expense', order: 100 + i }));

  const defaultSources = () => [...defaultIncome(), ...defaultExpense()];
  const defaultSettings = () => ({ goal: 0, budget: 0 });
  const defaults = () => ({ sources: defaultSources(), transactions: [], settings: defaultSettings() });

  let state = defaults();
  let mode = 'local';
  let currentUid = null;
  let ready = true;        // false khi đang tải dữ liệu từ Supabase
  let pendingWrites = 0;   // số lượt ghi đang chờ máy chủ
  let writeQueue = Promise.resolve();
  const listeners = [];

  const emit = () => listeners.forEach(fn => fn());
  const isReady = () => ready;

  /* ---------- Làm sạch dữ liệu ---------- */
  function normTx(t) {
    if (!t || !t.id || !/^\d{4}-\d{2}-\d{2}$/.test(t.date) || !(Number(t.amount) > 0)) return null;
    return {
      id: String(t.id), type: normType(t.type), amount: Number(t.amount), sourceId: String(t.sourceId), date: t.date,
      status: t.status === 'pending' ? 'pending' : 'received',
      note: String(t.note || ''), seriesId: t.seriesId || null,
    };
  }
  function normSrc(s, i) {
    if (!s || !s.id || !s.name) return null;
    return {
      id: String(s.id), type: normType(s.type), name: String(s.name), emoji: s.emoji || '✨',
      color: s.color || '#a7b4c6', order: Number(s.order ?? i + 1),
    };
  }
  // Dữ liệu cũ (trước khi có khoản chi) không có type → coi là khoản thu
  const normType = (t) => (t === 'expense' ? 'expense' : 'income');
  const normSettings = (s) => ({ goal: Number(s?.goal) || 0, budget: Number(s?.budget) || 0 });
  const bySourceOrder = (a, b) => a.order - b.order;

  function normalize(data) {
    if (!data || !Array.isArray(data.sources) || !Array.isArray(data.transactions)) {
      throw new Error('File dữ liệu không hợp lệ');
    }
    return {
      sources: data.sources.map(normSrc).filter(Boolean).sort(bySourceOrder),
      transactions: data.transactions.map(normTx).filter(Boolean),
      settings: normSettings(data.settings),
    };
  }

  /** Dữ liệu cũ chưa có danh mục chi → thêm bộ mặc định. Trả về ops để ghi. */
  function ensureExpenseCategories() {
    if (state.sources.some(s => s.type === 'expense')) return [];
    const ids = new Set(state.sources.map(s => s.id));
    const add = defaultExpense().filter(s => !ids.has(s.id));
    state.sources.push(...add);
    state.sources.sort(bySourceOrder);
    return add.map(setSrc);
  }

  function readLocal() {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? normalize(JSON.parse(raw)) : defaults();
    } catch (e) {
      console.warn('Không đọc được dữ liệu, dùng mặc định.', e);
      return defaults();
    }
  }

  /* ---------- Ghi dữ liệu ----------
     Mọi thay đổi: sửa state ngay (giao diện phản hồi tức thì) rồi commit(ops).
     • local : bỏ qua ops, ghi cả state vào localStorage
     • cloud : gửi ops lên Supabase, lần lượt theo hàng đợi để giữ đúng thứ tự */
  const setTx = (t) => ({ op: 'set', col: 'transactions', id: t.id, data: t });
  const delTx = (id) => ({ op: 'delete', col: 'transactions', id });
  const setSrc = (s) => ({ op: 'set', col: 'sources', id: s.id, data: s });
  const delSrc = (id) => ({ op: 'delete', col: 'sources', id });
  const setMeta = () => ({ op: 'set', col: 'meta', data: { ...state.settings } });

  function commit(ops) {
    if (mode === 'local') {
      try {
        localStorage.setItem(KEY, JSON.stringify(state));
      } catch (e) {
        alert('Không lưu được dữ liệu (localStorage đầy hoặc bị chặn).');
      }
      return;
    }
    if (!ops.length) return;
    const uid = currentUid;
    pendingWrites++;
    writeQueue = writeQueue
      .then(() => Cloud.write(uid, ops))
      .catch(err => {
        console.error(err);
        toast('Lỗi đồng bộ: ' + Cloud.errorMessage(err));
      })
      .finally(() => { pendingWrites--; });
  }

  /* ---------- Chuyển chế độ ---------- */
  function load() {
    state = readLocal();
    commit([...ensureExpenseCategories(), ...materializeRecurring()]);
  }

  /** Đăng nhập → chuyển sang dữ liệu trên Supabase */
  function connect(userId) {
    mode = 'cloud';
    currentUid = userId;
    state = { sources: [], transactions: [], settings: defaultSettings() };
    ready = false;
    emit();
    return refresh();
  }

  /** Tải lại toàn bộ dữ liệu từ Supabase */
  async function refresh() {
    if (mode !== 'cloud') return;
    const uid = currentUid;
    try {
      const data = await Cloud.fetchAll(uid);
      if (mode !== 'cloud' || uid !== currentUid) return; // đã đăng xuất / đổi tài khoản trong lúc chờ
      if (!data.profile) {
        // Lần đầu đăng nhập: tạo hồ sơ + danh mục mặc định (giữ danh mục đã có nếu có)
        state = {
          sources: data.sources.length ? data.sources.map(normSrc).filter(Boolean).sort(bySourceOrder) : defaultSources(),
          transactions: data.transactions.map(normTx).filter(Boolean),
          settings: defaultSettings(),
        };
        commit([setMeta(), ...(data.sources.length ? [] : state.sources.map(setSrc))]);
      } else {
        state = {
          sources: data.sources.map(normSrc).filter(Boolean).sort(bySourceOrder),
          transactions: data.transactions.map(normTx).filter(Boolean),
          settings: normSettings(data.profile),
        };
      }
      ready = true;
      commit([...ensureExpenseCategories(), ...materializeRecurring()]);
      emit();
    } catch (err) {
      console.error(err);
      toast('Lỗi tải dữ liệu: ' + Cloud.errorMessage(err));
    }
  }

  // Quay lại tab → tải lại để thấy thay đổi từ thiết bị khác
  // (bỏ qua nếu còn thay đổi chưa gửi xong, tránh ghi đè dữ liệu vừa nhập)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && mode === 'cloud' && ready && pendingWrites === 0) refresh();
  });

  /** Đăng xuất → quay lại dữ liệu trên máy */
  function disconnect() {
    mode = 'local';
    currentUid = null;
    ready = true;
    load();
    emit();
  }

  /* ---------- Khoản lặp lại (thu hoặc chi, vd lương, tiền nhà) ----------
     Với mỗi chuỗi (seriesId), tự tạo các tháng còn thiếu tới tháng hiện tại (trạng thái "chờ").
     ID sinh ra cố định theo chuỗi + tháng nên chạy nhiều lần / nhiều máy cũng không bị trùng. */
  function materializeRecurring() {
    const nowYM = toYM(todayISO());
    const latest = {};
    for (const t of state.transactions) {
      if (!t.seriesId) continue;
      if (!latest[t.seriesId] || t.date > latest[t.seriesId].date) latest[t.seriesId] = t;
    }
    const ops = [];
    const ids = new Set(state.transactions.map(t => t.id));
    for (const t of Object.values(latest)) {
      const day = Number(t.date.slice(8));
      let ym = toYM(t.date);
      while (ym < nowYM) {
        ym = addMonths(ym, 1);
        const id = `${t.seriesId}_${ym}`;
        if (ids.has(id)) continue;
        const nt = { ...t, id, date: sameDayIn(ym, day), status: 'pending' };
        state.transactions.push(nt);
        ids.add(id);
        ops.push(setTx(nt));
      }
    }
    return ops;
  }

  /* ---------- Giao dịch ---------- */
  const getTransactions = () => state.transactions;

  function upsertTransaction(tx) {
    const i = state.transactions.findIndex(t => t.id === tx.id);
    if (i >= 0) state.transactions[i] = tx;
    else state.transactions.push(tx);
    commit([setTx(tx), ...materializeRecurring()]);
  }

  function deleteTransaction(id) {
    const tx = state.transactions.find(t => t.id === id);
    if (!tx) return;
    state.transactions = state.transactions.filter(t => t.id !== id);
    const ops = [delTx(id)];
    // Xoá khoản mới nhất của chuỗi lặp → dừng lặp, nếu không nó sẽ tự tạo lại
    if (tx.seriesId && !state.transactions.some(t => t.seriesId === tx.seriesId && t.date > tx.date)) {
      ops.push(...stopSeriesOps(tx.seriesId));
    }
    commit(ops);
  }

  function stopSeriesOps(seriesId) {
    const ops = [];
    state.transactions.forEach(t => {
      if (t.seriesId === seriesId) { t.seriesId = null; ops.push(setTx(t)); }
    });
    return ops;
  }
  const stopSeries = (seriesId) => commit(stopSeriesOps(seriesId));

  /* ---------- Danh mục thu / chi ---------- */
  /** getSources() → tất cả; getSources('expense') → chỉ danh mục chi */
  const getSources = (type) => (type ? state.sources.filter(s => s.type === type) : state.sources);
  const getSource = (id) => state.sources.find(s => s.id === id)
    || { id, type: 'income', name: 'Không rõ', emoji: '❔', color: '#a7b4c6' };

  function addSource(src) {
    const order = Math.max(0, ...state.sources.map(s => s.order || 0)) + 1;
    const s = { id: uid(), order, ...src };
    state.sources.push(s);
    commit([setSrc(s)]);
  }

  function updateSource(id, patch) {
    const s = state.sources.find(x => x.id === id);
    if (!s) return;
    Object.assign(s, patch);
    commit([setSrc(s)]);
  }

  /** Xoá danh mục; giao dịch của danh mục đó được chuyển sang danh mục khác (cùng loại) */
  function deleteSource(id, moveTo) {
    const ops = [delSrc(id)];
    state.transactions.forEach(t => {
      if (t.sourceId === id) { t.sourceId = moveTo; ops.push(setTx(t)); }
    });
    state.sources = state.sources.filter(s => s.id !== id);
    commit(ops);
  }

  /* ---------- Cài đặt ---------- */
  function getTheme() {
    try {
      return localStorage.getItem(THEME_KEY)
        || JSON.parse(localStorage.getItem(KEY) || '{}').settings?.theme // dữ liệu bản cũ
        || 'auto';
    } catch { return 'auto'; }
  }
  const getSettings = () => ({ ...state.settings, theme: getTheme() });

  function setSetting(key, value) {
    if (key === 'theme') {
      try { localStorage.setItem(THEME_KEY, value); } catch { /* bỏ qua */ }
      return;
    }
    state.settings[key] = value;
    commit([setMeta()]);
  }

  /* ---------- Thay toàn bộ dữ liệu (khôi phục / xoá hết) ---------- */
  function replaceAll(next) {
    const ops = [];
    const newTx = new Set(next.transactions.map(t => t.id));
    const newSrc = new Set(next.sources.map(s => s.id));
    state.transactions.forEach(t => { if (!newTx.has(t.id)) ops.push(delTx(t.id)); });
    state.sources.forEach(s => { if (!newSrc.has(s.id)) ops.push(delSrc(s.id)); });
    state = next;
    ops.push(...state.sources.map(setSrc), ...state.transactions.map(setTx), setMeta());
    ops.push(...materializeRecurring());
    commit(ops);
  }

  const exportJSON = () => JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), ...state }, null, 2);
  const importJSON = (text) => replaceAll(normalize(JSON.parse(text)));
  const reset = () => replaceAll(defaults());

  /* ---------- Đưa dữ liệu trên máy lên tài khoản ---------- */
  const localCount = () => readLocal().transactions.length;

  function uploadLocal() {
    const local = readLocal();
    const ids = new Set(state.sources.map(s => s.id));
    const ops = [];
    local.sources.forEach(s => {
      if (!ids.has(s.id)) { state.sources.push(s); ops.push(setSrc(s)); }
    });
    local.transactions.forEach(t => {
      const i = state.transactions.findIndex(x => x.id === t.id);
      if (i >= 0) state.transactions[i] = t; else state.transactions.push(t);
      ops.push(setTx(t));
    });
    let metaChanged = false;
    for (const key of ['goal', 'budget']) {
      if (!state.settings[key] && local.settings[key]) { state.settings[key] = local.settings[key]; metaChanged = true; }
    }
    if (metaChanged) ops.push(setMeta());
    state.sources.sort(bySourceOrder);
    commit(ops);
    return local.transactions.length;
  }

  /* ---------- Dữ liệu mẫu ---------- */
  function seedSample() {
    const nowYM = toYM(todayISO());
    const has = (id) => state.sources.some(s => s.id === id);
    // Đảm bảo có các danh mục mặc định mà dữ liệu mẫu dùng
    const ops = defaultSources().filter(s => !has(s.id)).map(s => { state.sources.push(s); return setSrc(s); });

    const rnd = (a, b) => Math.round((a + Math.random() * (b - a)) / 10000) * 10000;
    const chance = (p) => Math.random() < p;
    const txs = [];
    const add = (type, sourceId, amount, day, note, ym) => txs.push({ type, sourceId, amount, date: sameDayIn(ym, day), note });

    for (let k = 11; k >= 0; k--) {
      const ym = addMonths(nowYM, -k);
      // Thu
      add('income', 'salary', 18000000 + (k < 6 ? 2000000 : 0), 5, `Lương ${monthLabel(ym).toLowerCase()}`, ym);
      if (chance(.7)) add('income', 'freelance', rnd(2e6, 9e6), 14, 'Dự án thiết kế website', ym);
      if (chance(.5)) add('income', 'business', rnd(5e5, 3e6), 20, 'Bán hàng online', ym);
      if (chance(.4)) add('income', 'invest', rnd(3e5, 2e6), 25, 'Lãi tiết kiệm', ym);
      if (ym.endsWith('-01') || ym.endsWith('-12')) add('income', 'bonus', rnd(5e6, 15e6), 28, 'Thưởng Tết', ym);
      // Chi
      add('expense', 'exp_home', 5500000, 1, 'Tiền nhà', ym);
      add('expense', 'exp_bills', rnd(7e5, 1.6e6), 8, 'Điện, nước, internet', ym);
      [3, 11, 19, 26].forEach(d => add('expense', 'exp_food', rnd(8e5, 1.8e6), d, chance(.5) ? 'Đi chợ' : 'Ăn ngoài', ym));
      add('expense', 'exp_transport', rnd(3e5, 8e5), 12, 'Xăng xe', ym);
      if (chance(.6)) add('expense', 'exp_shopping', rnd(3e5, 3e6), 17, 'Mua sắm online', ym);
      if (chance(.6)) add('expense', 'exp_fun', rnd(2e5, 1.5e6), 22, 'Xem phim, cà phê', ym);
      if (chance(.25)) add('expense', 'exp_health', rnd(2e5, 1.2e6), 15, 'Khám bệnh, thuốc', ym);
      if (chance(.3)) add('expense', 'exp_edu', rnd(5e5, 2e6), 10, 'Khoá học online', ym);
    }
    const today = todayISO();
    txs.forEach(t => {
      const tx = { id: uid(), status: t.date > today ? 'pending' : 'received', seriesId: null, ...t };
      state.transactions.push(tx);
      ops.push(setTx(tx));
    });
    let metaChanged = false;
    if (!state.settings.goal) { state.settings.goal = 25000000; metaChanged = true; }
    if (!state.settings.budget) { state.settings.budget = 15000000; metaChanged = true; }
    if (metaChanged) ops.push(setMeta());
    state.sources.sort(bySourceOrder);
    commit(ops);
  }


  return {
    EMOJIS, load, connect, disconnect, isReady, onChange: (fn) => listeners.push(fn),
    mode: () => mode, refresh, localCount, uploadLocal,
    getTransactions, upsertTransaction, deleteTransaction, stopSeries,
    getSources, getSource, addSource, updateSource, deleteSource,
    getSettings, setSetting, exportJSON, importJSON, reset, seedSample,
  };
})();
