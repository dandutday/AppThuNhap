/* =========================================================
   app.js — Điều hướng, render các màn hình, xử lý sự kiện
   ========================================================= */
const App = {
  period: toYM(todayISO()), // tháng đang xem ở Tổng quan
  view: 'dashboard',
  editingId: null,
  txType: 'expense',        // loại đang chọn trong hộp thoại thêm/sửa
  lastType: 'expense',      // loại vừa nhập gần nhất → mặc định cho lần sau
  pickedSource: null,
  lastPicked: {},           // danh mục vừa chọn gần nhất theo từng loại
  donutType: 'expense',     // biểu đồ tròn đang xem thu hay chi
  listType: '',             // lọc loại ở tab Giao dịch ('' = tất cả)
  catType: 'expense',       // tab Danh mục đang xem thu hay chi
  user: null,               // người dùng Supabase đang đăng nhập
  authMode: 'signin',       // 'signin' | 'signup'
  uploadAsked: false,
};

/** Chữ & màu theo loại giao dịch */
const TYPE = {
  income: {
    sign: '+', cls: 'amount-income', name: 'khoản thu', cat: 'Nguồn thu',
    done: 'Đã nhận', pending: 'Chờ nhận', emptyMonth: 'Chưa có khoản thu trong tháng',
    notePh: 'VD: Lương tháng 9, dự án website…',
    repeat: 'Lặp lại hàng tháng (vd lương): tự tạo khoản “chờ nhận” các tháng sau',
  },
  expense: {
    sign: '−', cls: 'amount-expense', name: 'khoản chi', cat: 'Danh mục',
    done: 'Đã chi', pending: 'Sắp chi', emptyMonth: 'Chưa có khoản chi trong tháng',
    notePh: 'VD: Ăn trưa, tiền điện, mua áo…',
    repeat: 'Lặp lại hàng tháng (vd tiền nhà): tự tạo khoản “sắp chi” các tháng sau',
  },
};

/* ================= Khởi động ================= */
document.addEventListener('DOMContentLoaded', () => {
  Store.load();
  applyTheme(Store.getSettings().theme);
  Icons.hydrate();
  $$('[data-money]').forEach(bindMoneyInput);
  fillEmojiSelect();
  bindEvents();
  bindAuthEvents();
  Store.onChange(() => { renderAll(); maybeOfferUpload(); });
  renderAll();
  showView(viewFromHash(), false);

  // Đăng nhập / đăng xuất → đổi nguồn dữ liệu (máy ↔ Supabase)
  Cloud.onAuth((user, event) => {
    const changed = (user?.id || null) !== (App.user?.id || null);
    App.user = user;
    if (changed) {
      App.uploadAsked = false;
      // setTimeout: không gọi Supabase ngay trong callback onAuthStateChange (tránh treo)
      if (user) setTimeout(() => Store.connect(user.id));
      else if (Store.mode() === 'cloud') Store.disconnect();
    }
    renderAll();
    if (event === 'PASSWORD_RECOVERY') setTimeout(askNewPassword, 300);
  });
});

/** Mở từ link "đặt lại mật khẩu" trong email → nhập mật khẩu mới */
async function askNewPassword() {
  const pw = prompt('Nhập mật khẩu mới (ít nhất 6 ký tự):');
  if (!pw) return;
  try {
    await Cloud.updatePassword(pw);
    toast('Đã đổi mật khẩu 🔐');
  } catch (err) {
    alert(Cloud.errorMessage(err));
  }
}

function renderAll() {
  renderAccount();
  renderSourceSelects();
  renderDashboard();
  renderTransactions();
  renderSources();
  renderSettings();
}

/* ================= Điều hướng ================= */
const VIEWS = ['dashboard', 'transactions', 'sources', 'settings'];
const VIEW_TITLES = { dashboard: 'Tổng quan', transactions: 'Giao dịch', sources: 'Danh mục', settings: 'Cài đặt' };

/** Đổi tab. Ghi vào URL (#settings…) để nút Back trên điện thoại quay lại tab trước. */
function showView(name, push = true) {
  if (!VIEWS.includes(name)) return;
  App.view = name;
  $$('.tab').forEach(t => {
    t.classList.toggle('active', t.dataset.view === name);
    t.setAttribute('aria-selected', t.dataset.view === name);
  });
  $$('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + name));
  $('#pageTitle').textContent = VIEW_TITLES[name];
  if (push && location.hash !== '#' + name) history.pushState(null, '', '#' + name);
  // Biểu đồ vẽ theo chiều rộng khung; khi tab đang ẩn khung rộng 0 → vẽ lại lúc hiện ra
  if (name === 'dashboard') renderDashboard();
  window.scrollTo({ top: 0 });
}

// Xoay màn hình / đổi cỡ cửa sổ → vẽ lại biểu đồ (bỏ qua resize chỉ đổi chiều cao,
// vd thanh địa chỉ trên điện thoại ẩn/hiện khi cuộn)
let lastWidth = window.innerWidth, resizeTimer;
window.addEventListener('resize', () => {
  if (window.innerWidth === lastWidth) return;
  lastWidth = window.innerWidth;
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { if (App.view === 'dashboard') renderDashboard(); }, 150);
});

// Chỉ phản ứng với hash là tên tab; hash khác (vd #access_token=… của Supabase) để nguyên
const viewFromHash = () => location.hash.slice(1);
window.addEventListener('popstate', () => showView(VIEWS.includes(viewFromHash()) ? viewFromHash() : 'dashboard', false));

/* ================= Tính toán ================= */
const sum = (txs) => txs.reduce((a, t) => a + t.amount, 0);
const ofType = (txs, type) => txs.filter(t => t.type === type);
const txsInMonth = (ym) => Store.getTransactions().filter(t => toYM(t.date) === ym);
const sortByDateDesc = (a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id);

/** Số tiền có dấu: +1.000.000 ₫ / −500.000 ₫ */
const signed = (n) => (n < 0 ? '−' : '+') + money(Math.abs(n));

/** Ghi "▲ 12% so với T9" — upIsGood: tăng là tốt (thu) hay xấu (chi) */
function setDelta(el, cur, prev, prevYM, upIsGood) {
  if (!prev) {
    el.className = 'kpi-sub';
    el.textContent = `T${Number(prevYM.slice(5))}: chưa có`;
    return;
  }
  const pct = ((cur - prev) / prev) * 100;
  const up = pct >= 0;
  el.className = 'kpi-sub ' + (up === upIsGood ? 'up' : 'down');
  el.textContent = `${up ? '▲' : '▼'} ${Math.abs(pct).toFixed(0)}% so với T${Number(prevYM.slice(5))}`;
}

/** Thanh tiến độ + chữ cho mục tiêu / ngân sách */
function setProgress(bar, value, limit) {
  const pct = limit > 0 ? (value / limit) * 100 : 0;
  bar.style.width = Math.min(100, pct) + '%';
  return pct;
}

/* ================= Tổng quan ================= */
function renderDashboard() {
  const ym = App.period;
  const prevYM = addMonths(ym, -1);
  $('#periodLabel').textContent = monthLabel(ym);

  const month = txsInMonth(ym);
  const prev = txsInMonth(prevYM);
  const income = sum(ofType(month, 'income'));
  const expense = sum(ofType(month, 'expense'));
  const balance = income - expense;

  // --- Thẻ số dư ---
  const bal = $('#kpiBalance');
  bal.textContent = (balance < 0 ? '−' : '') + money(Math.abs(balance));
  bal.classList.toggle('neg', balance < 0);
  $('#kpiSaving').textContent = income > 0
    ? (balance >= 0 ? `Tiết kiệm được ${Math.round((balance / income) * 100)}% thu nhập 🐷` : `Chi vượt thu ${money(-balance)} 😥`)
    : (expense > 0 ? 'Chưa có thu nhập tháng này' : 'Chưa có giao dịch tháng này');
  $('#kpiIncome').textContent = money(income);
  $('#kpiExpense').textContent = money(expense);
  setDelta($('#kpiIncomeDelta'), income, sum(ofType(prev, 'income')), prevYM, true);
  setDelta($('#kpiExpenseDelta'), expense, sum(ofType(prev, 'expense')), prevYM, false);

  // --- Ngân sách chi ---
  const { goal, budget } = Store.getSettings();
  const bp = $('#budgetProgress');
  if (budget > 0) {
    const pct = setProgress($('#budgetBar'), expense, budget);
    $('#kpiBudget').textContent = `${Math.round(pct)}%`;
    bp.classList.toggle('warn', pct >= 80 && pct <= 100);
    bp.classList.toggle('over', pct > 100);
    $('#kpiBudgetSub').textContent = expense <= budget
      ? `Còn ${money(budget - expense)} / ${money(budget)}`
      : `Vượt ${money(expense - budget)} 😱`;
  } else {
    $('#kpiBudget').textContent = 'Chưa đặt';
    $('#budgetBar').style.width = '0';
    bp.classList.remove('warn', 'over');
    $('#kpiBudgetSub').innerHTML = '<a href="#" data-goto="settings">Đặt ngân sách</a>';
  }

  // --- Mục tiêu thu ---
  if (goal > 0) {
    const pct = setProgress($('#goalBar'), income, goal);
    $('#kpiGoal').textContent = `${Math.round(pct)}%`;
    $('#kpiGoalSub').textContent = income >= goal
      ? `Đạt mục tiêu ${money(goal)} 🎉`
      : `Còn ${money(goal - income)} / ${money(goal)}`;
  } else {
    $('#kpiGoal').textContent = 'Chưa đặt';
    $('#goalBar').style.width = '0';
    $('#kpiGoalSub').innerHTML = '<a href="#" data-goto="settings">Đặt mục tiêu</a>';
  }

  // --- Biểu đồ cột: điện thoại xem 6 tháng, máy tính 12 tháng ---
  const chartEl = $('#barChart');
  const n = chartEl.clientWidth && chartEl.clientWidth < 480 ? 6 : 12;
  $('#barTitle').textContent = `Thu – chi ${n} tháng`;
  const months = Array.from({ length: n }, (_, i) => addMonths(ym, i - (n - 1)));
  Charts.bar(chartEl,
    months.map(m => {
      const txs = txsInMonth(m);
      return { key: m, label: shortMonthLabel(m), values: [sum(ofType(txs, 'income')), sum(ofType(txs, 'expense'))], active: m === ym };
    }),
    [{ name: 'Thu', cls: 's-income' }, { name: 'Chi', cls: 's-expense' }],
    { goal, onSelect: (m) => { App.period = m; renderDashboard(); } });

  // --- Biểu đồ tròn theo danh mục ---
  const type = App.donutType;
  $$('#donutSeg button').forEach(b => b.classList.toggle('on', b.dataset.type === type));
  const typed = ofType(month, type);
  const total = sum(typed);
  const byCat = {};
  typed.forEach(t => { byCat[t.sourceId] = (byCat[t.sourceId] || 0) + t.amount; });
  const items = Object.entries(byCat)
    .map(([id, value]) => ({ src: Store.getSource(id), value }))
    .sort((a, b) => b.value - a.value);
  Charts.donut($('#donutChart'), items.map(i => ({ value: i.value, color: i.src.color })),
    type === 'income' ? 'Tổng thu' : 'Tổng chi', shortMoney(total));
  $('#donutLegend').innerHTML = items.length
    ? items.map(i => `<li><span class="dot" style="background:${i.src.color}"></span>
        <span class="name">${i.src.emoji} ${escapeHtml(i.src.name)}</span>
        <span class="legend-amt">${shortMoney(i.value)}</span>
        <span class="pct">${Math.round((i.value / total) * 100)}%</span></li>`).join('')
    : `<li class="muted">${TYPE[type].emptyMonth}</li>`;

  // --- Gần đây ---
  const recent = [...Store.getTransactions()].sort(sortByDateDesc).slice(0, 6);
  $('#recentList').innerHTML = recent.length ? recent.map(txItem).join('') : emptyState(true);
  Icons.hydrate($('#view-dashboard'));
}

function emptyState(withCta) {
  if (!Store.isReady()) {
    return `<li class="empty"><span class="empty-ic spin">${Icons.svg('cloud')}</span><div>Đang tải dữ liệu…</div></li>`;
  }
  return `<li class="empty"><span class="empty-ic">${Icons.svg('empty')}</span>
    <div>Chưa có giao dịch nào.</div>
    ${withCta ? '<div class="empty-actions"><button class="btn primary" data-action="add">Thêm giao dịch đầu tiên</button><button class="btn" data-action="sample">Dùng dữ liệu mẫu</button></div>' : ''}</li>`;
}

function txItem(t) {
  const s = Store.getSource(t.sourceId);
  const T = TYPE[t.type];
  return `<li data-id="${t.id}" tabindex="0">
    <span class="tx-avatar" style="--c:${s.color}">${s.emoji}</span>
    <div class="tx-main">
      <div class="tx-title">${escapeHtml(t.note || s.name)}</div>
      <div class="tx-meta">${escapeHtml(s.name)} · ${dateLabel(t.date)}
        ${t.seriesId ? `<span class="meta-ic" title="Lặp lại hàng tháng">${Icons.svg('repeat')}</span>` : ''}
        ${t.status === 'pending' ? `<span class="badge">${Icons.svg('clock')}${T.pending}</span>` : ''}
      </div>
    </div>
    <span class="tx-amount ${T.cls}">${T.sign}${money(t.amount)}</span>
  </li>`;
}

/* ================= Giao dịch ================= */
function renderTransactions() {
  const q = $('#fSearch').value.trim().toLowerCase();
  const m = $('#fMonth').value;
  const src = $('#fSource').value;
  const st = $('#fStatus').value;
  const type = App.listType;
  $$('#txTypeSeg button').forEach(b => b.classList.toggle('on', b.dataset.type === type));

  const list = Store.getTransactions().filter(t =>
    (!type || t.type === type) &&
    (!m || toYM(t.date) === m) &&
    (!src || t.sourceId === src) &&
    (!st || t.status === st) &&
    (!q || (t.note + ' ' + Store.getSource(t.sourceId).name).toLowerCase().includes(q))
  ).sort(sortByDateDesc);

  const inc = sum(ofType(list, 'income')), exp = sum(ofType(list, 'expense'));
  $('#txCount').textContent = `${list.length} giao dịch`;
  $('#txSumIncome').textContent = '+' + money(inc);
  $('#txSumExpense').textContent = '−' + money(exp);
  $('#txSumIncome').hidden = type === 'expense';
  $('#txSumExpense').hidden = type === 'income';

  if (!list.length) {
    $('#txList').innerHTML = Store.getTransactions().length
      ? '<li class="empty">Không có giao dịch phù hợp bộ lọc.</li>'
      : emptyState(true);
    return;
  }

  // Nhóm theo tháng, kèm chênh lệch thu – chi của tháng (theo bộ lọc)
  let html = '', current = '';
  list.forEach(t => {
    const ym = toYM(t.date);
    if (ym !== current) {
      current = ym;
      const g = list.filter(x => toYM(x.date) === ym);
      const net = sum(ofType(g, 'income')) - sum(ofType(g, 'expense'));
      html += `<li class="tx-group"><span>${monthLabel(ym)}</span><span class="${net >= 0 ? 'amount-income' : 'amount-expense'}">${signed(net)}</span></li>`;
    }
    html += txItem(t);
  });
  $('#txList').innerHTML = html;
}

/* ================= Danh mục ================= */
function fillEmojiSelect() {
  $('#sourceEmoji').innerHTML = Store.EMOJIS.map(e => `<option>${e}</option>`).join('');
}

/** Ô lọc danh mục ở tab Giao dịch (nhóm theo thu / chi) */
function renderSourceSelects() {
  const opt = (s) => `<option value="${s.id}">${s.emoji} ${escapeHtml(s.name)}</option>`;
  const groups = [['expense', 'Khoản chi'], ['income', 'Khoản thu']]
    .filter(([type]) => !App.listType || App.listType === type)
    .map(([type, label]) => `<optgroup label="${label}">${Store.getSources(type).map(opt).join('')}</optgroup>`)
    .join('');
  const f = $('#fSource');
  const keep = f.value;
  f.innerHTML = '<option value="">Tất cả danh mục</option>' + groups;
  f.value = [...f.options].some(o => o.value === keep) ? keep : '';
}

function renderSources() {
  const type = App.catType;
  const isInc = type === 'income';
  $$('#catTypeSeg button').forEach(b => b.classList.toggle('on', b.dataset.type === type));
  $('#catFormTitle').textContent = isInc ? 'Thêm nguồn thu' : 'Thêm danh mục chi';
  $('#catListTitle').textContent = isInc ? 'Danh sách nguồn thu' : 'Danh mục chi';
  $('#catMonthNote').textContent = `${monthLabel(App.period)}`;
  $('#sourceName').placeholder = isInc ? 'VD: Cho thuê nhà, Bán đồ cũ…' : 'VD: Cà phê, Thú cưng, Du lịch…';

  const monthTx = txsInMonth(App.period);
  const cats = Store.getSources(type);
  $('#sourceList').innerHTML = cats.length ? cats.map(s => {
    const mine = monthTx.filter(t => t.sourceId === s.id);
    return `<li data-id="${s.id}">
      <span class="tx-avatar" style="--c:${s.color}">${s.emoji}</span>
      <div class="cat-main">
        <span class="name">${escapeHtml(s.name)}</span>
        <span class="stat">${mine.length ? `${mine.length} khoản · ${money(sum(mine))}` : 'Chưa có khoản nào tháng này'}</span>
      </div>
      <input type="color" value="${s.color}" data-action="color" title="Đổi màu">
      <button class="btn ghost icon sm" data-action="rename" title="Đổi tên">${Icons.svg('edit')}</button>
      <button class="btn ghost icon sm danger" data-action="delete" title="Xoá">${Icons.svg('trash')}</button>
    </li>`;
  }).join('') : '<li class="empty">Chưa có danh mục nào.</li>';
}

/* ================= Cài đặt ================= */
function renderSettings() {
  const { goal, budget, theme } = Store.getSettings();
  $('#goalInput').value = goal ? numberFmt.format(goal) : '';
  $('#budgetInput').value = budget ? numberFmt.format(budget) : '';
  $$('#themeSeg .btn').forEach(b => b.classList.toggle('selected', b.dataset.themeSet === theme));
}

/* ================= Tài khoản & đồng bộ ================= */
function renderAccount() {
  const btn = $('#btnAccount');
  btn.hidden = !Cloud.enabled;
  if (App.user) {
    const name = App.user.user_metadata?.full_name || App.user.email || 'Tài khoản';
    btn.innerHTML = `<span class="avatar">${escapeHtml(name.trim()[0].toUpperCase())}</span><span class="account-name">${escapeHtml(name)}</span>`;
    btn.title = 'Tài khoản: ' + name;
  } else {
    btn.innerHTML = `${Icons.svg('user')}<span class="account-name">Đăng nhập</span>`;
    btn.title = 'Đăng nhập để đồng bộ';
  }

  const panel = $('#accountPanel');
  const status = Cloud.status();
  if (status === 'not-configured') {
    panel.innerHTML = `<div class="sync-row">${Icons.svg('device')}<div>
      <b>Đang lưu trên máy này</b>
      <p class="muted">Để bật đồng bộ Supabase, điền cấu hình vào <code>assets/js/supabase-config.js</code> (xem hướng dẫn trong <code>README.md</code>).</p></div></div>`;
  } else if (status === 'sdk-missing') {
    panel.innerHTML = `<div class="sync-row">${Icons.svg('device')}<div>
      <b>Đang lưu trên máy này</b>
      <p class="muted">Không tải được thư viện Supabase (có thể do mất mạng). Dữ liệu vẫn được lưu trên trình duyệt.</p></div></div>`;
  } else if (!App.user) {
    panel.innerHTML = `<div class="sync-row">${Icons.svg('device')}<div>
      <b>Đang lưu trên máy này</b>
      <p class="muted">Đăng nhập để sao lưu lên Supabase và dùng trên nhiều thiết bị.</p></div></div>
      <div class="btn-row"><button class="btn primary" data-action="login">${Icons.svg('user')}Đăng nhập / Đăng ký</button></div>`;
  } else {
    const n = Store.localCount();
    panel.innerHTML = `<div class="sync-row ok">${Icons.svg('cloudCheck')}<div>
      <b>Đang lưu trên Supabase</b>
      <p class="muted">Tài khoản: ${escapeHtml(App.user.email || '')}</p></div></div>
      <div class="btn-row">
        <button class="btn" data-action="refresh">${Icons.svg('repeat')}Tải lại dữ liệu</button>
        ${n ? `<button class="btn" data-action="upload">${Icons.svg('upload')}Tải ${n} khoản trên máy này lên</button>` : ''}
        <button class="btn" data-action="logout">${Icons.svg('logout')}Đăng xuất</button>
      </div>`;
  }
}

/** Lần đầu đăng nhập mà tài khoản trống, máy lại có dữ liệu → hỏi có muốn đưa lên không */
function maybeOfferUpload() {
  if (Store.mode() !== 'cloud' || !Store.isReady() || App.uploadAsked) return;
  App.uploadAsked = true;
  const n = Store.localCount();
  if (!n || Store.getTransactions().length) return;
  setTimeout(() => {
    if (confirm(`Máy này đang có ${n} giao dịch chưa đồng bộ. Tải chúng lên tài khoản của bạn?`)) uploadLocalData();
  }, 300);
}

function uploadLocalData() {
  const n = Store.uploadLocal();
  renderAll();
  toast(`Đã tải ${n} giao dịch lên tài khoản ☁️`);
}

function openAuthDialog(mode = 'signin') {
  setAuthMode(mode);
  $('#authError').textContent = '';
  $('#authDialog').showModal();
  $('#authEmail').focus();
  // Chỉ hiện nút Google khi project Supabase đã bật Google
  Cloud.providers()
    .then(p => { $('#authGoogle').hidden = $('#authDivider').hidden = !p.google; })
    .catch(() => { /* không lấy được → giữ ẩn, vẫn đăng nhập email bình thường */ });
}

function setAuthMode(mode) {
  App.authMode = mode;
  const signup = mode === 'signup';
  $('#authTitle').textContent = signup ? 'Tạo tài khoản mới' : 'Đăng nhập để đồng bộ';
  $('#authSubmit').textContent = signup ? 'Đăng ký' : 'Đăng nhập';
  $('#authToggle').textContent = signup ? 'Đã có tài khoản? Đăng nhập' : 'Chưa có tài khoản? Đăng ký';
  $('#authPassword').autocomplete = signup ? 'new-password' : 'current-password';
  $('#authForgot').hidden = signup;
}

function bindAuthEvents() {
  $('#btnAccount').addEventListener('click', () => {
    if (App.user) showView('settings');
    else openAuthDialog();
  });
  $('#accountPanel').addEventListener('click', async (e) => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (action === 'login') openAuthDialog();
    if (action === 'upload' && confirm('Tải toàn bộ dữ liệu trên máy này lên tài khoản? (khoản trùng sẽ được cập nhật)')) uploadLocalData();
    if (action === 'refresh') { await Store.refresh(); toast('Đã tải lại dữ liệu'); }
    if (action === 'logout') {
      await Cloud.signOut();
      toast('Đã đăng xuất');
    }
  });

  $('#authClose').addEventListener('click', () => $('#authDialog').close());
  $('#authToggle').addEventListener('click', () => setAuthMode(App.authMode === 'signin' ? 'signup' : 'signin'));

  const setError = (msg) => { $('#authError').textContent = msg; };
  const busy = (on) => $$('#authForm button').forEach(b => { b.disabled = on; });

  $('#authForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    setError('');
    busy(true);
    try {
      const email = $('#authEmail').value.trim();
      const pw = $('#authPassword').value;
      if (App.authMode === 'signup') {
        const { needsConfirm } = await Cloud.signUp(email, pw);
        if (needsConfirm) {
          setError('');
          setAuthMode('signin');
          $('#authError').textContent = '📧 Đã gửi email xác nhận. Mở hộp thư, bấm link xác nhận rồi quay lại đăng nhập nhé.';
          return;
        }
      } else {
        await Cloud.signIn(email, pw);
      }
      $('#authDialog').close();
      $('#authPassword').value = '';
      toast(App.authMode === 'signup' ? 'Tạo tài khoản thành công 🎉' : 'Đăng nhập thành công 🐷');
    } catch (err) {
      setError(Cloud.errorMessage(err));
    } finally {
      busy(false);
    }
  });

  $('#authGoogle').addEventListener('click', async () => {
    setError('');
    if (location.protocol === 'file:') {
      setError('Đăng nhập Google cần mở trang qua http://localhost hoặc tên miền (xem README.md). Bạn có thể dùng email trước.');
      return;
    }
    busy(true);
    try {
      await Cloud.signInGoogle(); // chuyển hướng sang Google rồi quay lại trang này
    } catch (err) {
      setError(Cloud.errorMessage(err));
      busy(false);
    }
  });

  $('#authForgot').addEventListener('click', async () => {
    const email = $('#authEmail').value.trim();
    if (!email) { setError('Nhập email trước rồi bấm “Quên mật khẩu?”'); $('#authEmail').focus(); return; }
    try {
      await Cloud.resetPassword(email);
      setError('');
      toast('Đã gửi email đặt lại mật khẩu 📧');
    } catch (err) {
      setError(Cloud.errorMessage(err));
    }
  });
}

function applyTheme(theme) {
  if (theme === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', theme);
}

/* ================= Hộp thoại thêm / sửa ================= */
function renderSourcePicker() {
  const cats = Store.getSources(App.txType);
  $('#txSourcePicker').innerHTML = cats.length ? cats.map(s => `
    <button type="button" role="radio" class="chip ${s.id === App.pickedSource ? 'on' : ''}"
      aria-checked="${s.id === App.pickedSource}" data-id="${s.id}" style="--c:${s.color}">
      <span>${s.emoji}</span>${escapeHtml(s.name)}
    </button>`).join('')
    : '<p class="muted">Chưa có danh mục nào, hãy thêm trong tab <a href="#" data-goto="sources">Danh mục</a>.</p>';
}

/** Đổi loại Thu / Chi trong hộp thoại → đổi danh mục, chữ trạng thái, màu số tiền */
function setDialogType(type, keepSource = null) {
  App.txType = type;
  const T = TYPE[type];
  $$('#txTypePick button').forEach(b => {
    b.classList.toggle('on', b.dataset.type === type);
    b.setAttribute('aria-checked', b.dataset.type === type);
  });
  $('#txDialog').dataset.type = type;
  $('#txDialogTitle').textContent = (App.editingId ? 'Sửa ' : 'Thêm ') + T.name;
  $('#txSourceLabel').textContent = T.cat;
  $('#txStatus').options[0].textContent = T.done;
  $('#txStatus').options[1].textContent = T.pending;
  $('#txNote').placeholder = T.notePh;
  $('#txRecurringText').textContent = T.repeat;

  const cats = Store.getSources(type);
  const exists = (id) => id && cats.some(s => s.id === id);
  App.pickedSource = exists(keepSource) ? keepSource
    : exists(App.lastPicked[type]) ? App.lastPicked[type]
    : cats[0]?.id || null;
  renderSourcePicker();
}

/** Loại mặc định khi bấm "+": theo màn hình đang xem, nếu không thì theo lần nhập trước */
function contextType() {
  if (App.view === 'transactions' && App.listType) return App.listType;
  if (App.view === 'sources') return App.catType;
  if (App.view === 'dashboard') return App.donutType === 'income' ? 'income' : App.lastType;
  return App.lastType;
}

function openTxDialog(id = null, type = null) {
  const t = id ? Store.getTransactions().find(x => x.id === id) : null;
  App.editingId = t ? t.id : null;
  setDialogType(t ? t.type : (type || contextType()), t?.sourceId);
  $('#txAmount').value = t ? numberFmt.format(t.amount) : '';
  // Mặc định: ngày hôm nay, hoặc ngày 1 nếu đang xem tháng khác
  const today = todayISO();
  $('#txDate').value = t ? t.date : (toYM(today) === App.period ? today : App.period + '-01');
  $('#txStatus').value = t ? t.status : 'received';
  $('#txNote').value = t ? t.note : '';
  $('#txRecurring').checked = !!(t && t.seriesId);
  $('#txDelete').hidden = !t;
  $('#txDialog').showModal();
  $('#txAmount').focus();
}

function saveTx(e) {
  e.preventDefault();
  const amount = parseMoney($('#txAmount').value);
  if (!amount) { toast('Số tiền phải lớn hơn 0'); $('#txAmount').focus(); return; }
  if (!App.pickedSource) { toast('Hãy chọn danh mục'); return; }

  const type = App.txType;
  const old = App.editingId ? Store.getTransactions().find(x => x.id === App.editingId) : null;
  const recurring = $('#txRecurring').checked;
  let seriesId = old?.seriesId || null;
  if (recurring && !seriesId) seriesId = uid();
  if (!recurring && seriesId) { Store.stopSeries(seriesId); seriesId = null; }

  Store.upsertTransaction({
    id: old ? old.id : uid(),
    type,
    amount,
    sourceId: App.pickedSource,
    date: $('#txDate').value || todayISO(),
    status: $('#txStatus').value,
    note: $('#txNote').value.trim(),
    seriesId,
  });
  App.lastType = type;
  App.lastPicked[type] = App.pickedSource;
  $('#txDialog').close();
  toast(old ? 'Đã cập nhật' : (type === 'income' ? 'Đã thêm khoản thu 🐷' : 'Đã thêm khoản chi 💸'));
  renderAll();
}

/* ================= CSV ================= */
function exportCsv() {
  const rows = [['Ngày', 'Loại', 'Danh mục', 'Số tiền', 'Trạng thái', 'Ghi chú', 'Lặp lại']];
  [...Store.getTransactions()].sort((a, b) => a.date.localeCompare(b.date)).forEach(t => {
    const T = TYPE[t.type];
    rows.push([t.date, t.type === 'income' ? 'Thu' : 'Chi', Store.getSource(t.sourceId).name,
      t.type === 'income' ? t.amount : -t.amount,
      t.status === 'received' ? T.done : T.pending, t.note, t.seriesId ? 'Có' : '']);
  });
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
  // BOM để Excel đọc đúng tiếng Việt
  downloadFile(`thu-chi-${todayISO()}.csv`, '﻿' + csv, 'text/csv;charset=utf-8');
}

/* ================= Sự kiện ================= */
function bindEvents() {
  // Tabs & liên kết điều hướng
  $$('.tab').forEach(t => t.addEventListener('click', () => showView(t.dataset.view)));
  document.addEventListener('click', (e) => {
    const go = e.target.closest('[data-goto]');
    if (go) {
      e.preventDefault();
      if ($('#txDialog').open) $('#txDialog').close();
      showView(go.dataset.goto);
      return;
    }
    if (e.target.closest('[data-action="add"]')) { openTxDialog(); return; }
    if (e.target.closest('[data-action="sample"]')) { Store.seedSample(); renderAll(); toast('Đã tạo dữ liệu mẫu ✨'); }
  });

  $('#btnAdd').addEventListener('click', () => openTxDialog());
  $('#prevMonth').addEventListener('click', () => { App.period = addMonths(App.period, -1); renderDashboard(); renderSources(); });
  $('#nextMonth').addEventListener('click', () => { App.period = addMonths(App.period, 1); renderDashboard(); renderSources(); });

  // Nút gạt Thu / Chi
  $('#donutSeg').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-type]');
    if (b) { App.donutType = b.dataset.type; renderDashboard(); }
  });
  $('#txTypeSeg').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-type]');
    if (!b) return;
    App.listType = b.dataset.type;
    renderSourceSelects();
    renderTransactions();
  });
  $('#catTypeSeg').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-type]');
    if (b) { App.catType = b.dataset.type; renderSources(); }
  });
  $('#txTypePick').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-type]');
    if (b) setDialogType(b.dataset.type);
  });

  // Bấm vào giao dịch để sửa
  ['#recentList', '#txList'].forEach(sel => {
    const el = $(sel);
    el.addEventListener('click', (e) => {
      const li = e.target.closest('li[data-id]');
      if (li) openTxDialog(li.dataset.id);
    });
    el.addEventListener('keydown', (e) => {
      const li = e.target.closest('li[data-id]');
      if (li && e.key === 'Enter') openTxDialog(li.dataset.id);
    });
  });

  // Bộ lọc
  ['#fSearch', '#fMonth', '#fSource', '#fStatus'].forEach(sel => $(sel).addEventListener('input', renderTransactions));
  $('#fClear').addEventListener('click', () => {
    ['#fSearch', '#fMonth', '#fSource', '#fStatus'].forEach(sel => { $(sel).value = ''; });
    App.listType = '';
    renderSourceSelects();
    renderTransactions();
  });

  // Hộp thoại
  $('#txForm').addEventListener('submit', saveTx);
  $('#txCancel').addEventListener('click', () => $('#txDialog').close());
  $('#txClose').addEventListener('click', () => $('#txDialog').close());
  $('#txDialog').addEventListener('click', (e) => { if (e.target.id === 'txDialog') $('#txDialog').close(); });
  $('#txSourcePicker').addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    App.pickedSource = chip.dataset.id;
    renderSourcePicker();
  });
  $$('.quick-amounts button').forEach(b => b.addEventListener('click', () => {
    const n = parseMoney($('#txAmount').value) + Number(b.dataset.add);
    $('#txAmount').value = numberFmt.format(n);
  }));
  $('#txDelete').addEventListener('click', () => {
    if (!confirm('Xoá giao dịch này?')) return;
    Store.deleteTransaction(App.editingId);
    $('#txDialog').close();
    toast('Đã xoá');
    renderAll();
  });

  // Danh mục
  $('#sourceForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = $('#sourceName').value.trim();
    if (!name) return;
    const type = App.catType;
    if (Store.getSources(type).some(s => s.name.toLowerCase() === name.toLowerCase())) {
      toast('Danh mục này đã có rồi'); return;
    }
    Store.addSource({ type, name, emoji: $('#sourceEmoji').value, color: $('#sourceColor').value });
    $('#sourceName').value = '';
    toast('Đã thêm danh mục');
    renderAll();
  });
  $('#sourceList').addEventListener('change', (e) => {
    if (e.target.dataset.action !== 'color') return;
    Store.updateSource(e.target.closest('li').dataset.id, { color: e.target.value });
    renderAll();
  });
  $('#sourceList').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const id = btn.closest('li').dataset.id;
    const s = Store.getSource(id);
    if (btn.dataset.action === 'rename') {
      const name = prompt('Tên mới cho danh mục:', s.name);
      if (name && name.trim()) { Store.updateSource(id, { name: name.trim().slice(0, 40) }); renderAll(); }
    }
    if (btn.dataset.action === 'delete') {
      // Giao dịch của danh mục bị xoá được chuyển sang danh mục khác CÙNG LOẠI (ưu tiên "Khác")
      const others = Store.getSources(s.type).filter(x => x.id !== id);
      const used = Store.getTransactions().filter(t => t.sourceId === id).length;
      if (used && !others.length) { toast('Không thể xoá danh mục duy nhất đang có giao dịch'); return; }
      const fallback = others.find(x => x.name === 'Khác') || others[0];
      const msg = used
        ? `"${s.name}" có ${used} giao dịch. Chuyển chúng sang "${fallback.name}" và xoá?`
        : `Xoá danh mục "${s.name}"?`;
      if (confirm(msg)) { Store.deleteSource(id, fallback?.id); renderAll(); toast('Đã xoá danh mục'); }
    }
  });

  // Cài đặt
  $('#goalForm').addEventListener('submit', (e) => {
    e.preventDefault();
    Store.setSetting('goal', parseMoney($('#goalInput').value));
    Store.setSetting('budget', parseMoney($('#budgetInput').value));
    toast('Đã lưu mục tiêu & ngân sách');
    renderAll();
  });
  $$('[data-theme-set]').forEach(b => b.addEventListener('click', () => {
    Store.setSetting('theme', b.dataset.themeSet);
    applyTheme(b.dataset.themeSet);
    renderSettings();
  }));
  $('#btnExportCsv').addEventListener('click', exportCsv);
  $('#btnBackup').addEventListener('click', () => {
    downloadFile(`heodat-backup-${todayISO()}.json`, Store.exportJSON(), 'application/json');
  });
  $('#fileRestore').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file || !confirm('Khôi phục sẽ thay thế toàn bộ dữ liệu hiện tại. Tiếp tục?')) return;
    try {
      Store.importJSON(await file.text());
      applyTheme(Store.getSettings().theme);
      renderAll();
      toast('Khôi phục thành công');
    } catch (err) {
      alert('Không khôi phục được: ' + err.message);
    }
  });
  $('#btnSample').addEventListener('click', () => {
    Store.seedSample();
    renderAll();
    toast('Đã tạo dữ liệu mẫu ✨');
  });
  $('#btnReset').addEventListener('click', () => {
    const where = Store.mode() === 'cloud' ? ' trên tài khoản Supabase (mọi thiết bị)' : ' trên máy này';
    if (!confirm(`Xoá TOÀN BỘ dữ liệu${where}? Hành động này không thể hoàn tác.`)) return;
    Store.reset();
    renderAll();
    toast('Đã xoá dữ liệu');
  });

  // Phím tắt: N để thêm nhanh
  document.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 'n' && !e.ctrlKey && !e.metaKey && !e.altKey
      && !$('#txDialog').open && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) {
      e.preventDefault();
      openTxDialog();
    }
  });
}
