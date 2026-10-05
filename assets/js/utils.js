/* =========================================================
   utils.js — Hàm tiện ích: định dạng tiền, ngày tháng, DOM
   ========================================================= */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const numberFmt = new Intl.NumberFormat('vi-VN');

/** 1500000 -> "1.500.000 ₫" */
function money(n) {
  return numberFmt.format(Math.round(n || 0)) + ' ₫';
}

/** Rút gọn cho trục biểu đồ: 1500000 -> "1,5tr" */
function shortMoney(n) {
  const f = (v) => (Math.round(v * 10) / 10).toString().replace('.', ',');
  if (n >= 1e9) return f(n / 1e9) + ' tỷ';
  if (n >= 1e6) return f(n / 1e6) + 'tr';
  if (n >= 1e3) return f(n / 1e3) + 'k';
  return String(Math.round(n));
}

/** "1.500.000 ₫" -> 1500000 */
function parseMoney(str) {
  return Number(String(str).replace(/[^\d]/g, '')) || 0;
}

/** Định dạng ô nhập tiền ngay khi gõ */
function bindMoneyInput(input) {
  input.addEventListener('input', () => {
    const n = parseMoney(input.value);
    input.value = n ? numberFmt.format(n) : '';
  });
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ---------- Ngày tháng (dùng chuỗi 'YYYY-MM-DD' / 'YYYY-MM' để tránh lệch múi giờ) ---------- */
const pad = (n) => String(n).padStart(2, '0');

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** '2026-10-05' -> '2026-10' */
const toYM = (iso) => iso.slice(0, 7);

/** Cộng k tháng: ('2026-12', 1) -> '2027-01' */
function addMonths(ym, k) {
  let [y, m] = ym.split('-').map(Number);
  m += k;
  y += Math.floor((m - 1) / 12);
  m = ((m - 1) % 12 + 12) % 12 + 1;
  return `${y}-${pad(m)}`;
}

/** Ngày tương ứng ở tháng khác, kẹp theo số ngày của tháng (31/1 -> 28/2) */
function sameDayIn(ym, day) {
  const [y, m] = ym.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return `${ym}-${pad(Math.min(day, last))}`;
}

function monthLabel(ym) {
  const [y, m] = ym.split('-');
  return `Tháng ${Number(m)}, ${y}`;
}

function shortMonthLabel(ym) {
  const [y, m] = ym.split('-');
  return `T${Number(m)}` + (m === '01' ? `/${y.slice(2)}` : '');
}

function dateLabel(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}
