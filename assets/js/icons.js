/* =========================================================
   icons.js — Bộ icon SVG nét tròn (stroke 2, bo góc mềm)
   Dùng: <i data-icon="home"></i>  hoặc  Icons.svg('home')
   Icon kế thừa màu chữ (currentColor) nên tự đổi theo theme.
   ========================================================= */
const Icons = (() => {
  const paths = {
    piggy: '<path d="M4.5 12.5c0-3.6 3-6.5 7-6.5h1.5c2.6 0 4.8 1.3 5.8 3.3H20v4.2h-1.4a6.3 6.3 0 0 1-2.4 2.7V19h-2.6v-1.4h-3.4V19H7.6v-2.6a5.8 5.8 0 0 1-3.1-3.9z"/><path d="M4.5 12.3c-1 0-1.8-.7-2-1.6"/><path d="M10 6.2a2.5 2.5 0 0 1 4-1.6"/><circle cx="16" cy="10.6" r=".6" fill="currentColor"/>',
    home: '<path d="M4 11.5 12 5l8 6.5"/><path d="M6 10v8.5A1.5 1.5 0 0 0 7.5 20h9a1.5 1.5 0 0 0 1.5-1.5V10"/><path d="M10 20v-4.5a2 2 0 0 1 4 0V20"/>',
    list: '<rect x="4" y="4" width="16" height="16" rx="5"/><path d="M8.5 9.5h7M8.5 12.5h7M8.5 15.5h4"/>',
    heart: '<path d="M12 19.5s-7-4.3-7-9.6A3.9 3.9 0 0 1 12 7.6a3.9 3.9 0 0 1 7 2.3c0 5.3-7 9.6-7 9.6z"/>',
    sliders: '<path d="M5 7.5h8.5M18.5 7.5H19M5 16.5h.5M10.5 16.5H19"/><circle cx="16" cy="7.5" r="2.3"/><circle cx="8" cy="16.5" r="2.3"/>',
    plus: '<path d="M12 6.5v11M6.5 12h11"/>',
    x: '<path d="M7 7l10 10M17 7 7 17"/>',
    chevronLeft: '<path d="M14.5 6.5 9 12l5.5 5.5"/>',
    chevronRight: '<path d="M9.5 6.5 15 12l-5.5 5.5"/>',
    trash: '<path d="M5 7.5h14"/><path d="M9.5 7.5V6a1.5 1.5 0 0 1 1.5-1.5h2A1.5 1.5 0 0 1 14.5 6v1.5"/><path d="M7 7.5l.8 10.7A2 2 0 0 0 9.8 20h4.4a2 2 0 0 0 2-1.8L17 7.5"/>',
    edit: '<path d="M15 5.5a2 2 0 0 1 3 3L9 17.5l-4 1 1-4z"/>',
    download: '<path d="M12 4.5v10M8 11l4 4 4-4"/><path d="M5 19.5h14"/>',
    upload: '<path d="M12 15V5M8 8.5l4-4 4 4"/><path d="M5 19.5h14"/>',
    file: '<path d="M7.5 3.5h6L18 8v11a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 19V5a1.5 1.5 0 0 1 1.5-1.5z"/><path d="M13.5 3.5V8H18"/><path d="M9 13h6M9 16h4"/>',
    sun: '<circle cx="12" cy="12" r="3.8"/><path d="M12 3.5V5M12 19v1.5M3.5 12H5M19 12h1.5M6 6l1 1M17 17l1 1M6 18l1-1M17 7l1-1"/>',
    moon: '<path d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5z"/>',
    monitor: '<rect x="3.5" y="5" width="17" height="11" rx="3"/><path d="M9 20h6M12 16v4"/>',
    search: '<circle cx="11" cy="11" r="6"/><path d="m19.5 19.5-4-4"/>',
    coin: '<circle cx="12" cy="12" r="8"/><path d="M14.5 9.6c-.4-.9-1.4-1.5-2.5-1.5-1.4 0-2.5.8-2.5 1.9 0 2.5 5 1.4 5 4 0 1.1-1.1 1.9-2.5 1.9-1.1 0-2.1-.6-2.5-1.5M12 6.6v1.5M12 15.9v1.5"/>',
    checkCircle: '<circle cx="12" cy="12" r="8"/><path d="m8.5 12.2 2.3 2.3 4.7-4.8"/>',
    clock: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l2.5 2"/>',
    trend: '<path d="M4 16.5l5-5 3.5 3.5L20 7.5"/><path d="M15 7.5h5v5"/>',
    star: '<path d="M12 4.5l2.2 4.6 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5L4.8 9.8l5-.7z"/>',
    repeat: '<path d="M16.5 4.5l3 3-3 3"/><path d="M4.5 12v-.5a4 4 0 0 1 4-4h11"/><path d="M7.5 19.5l-3-3 3-3"/><path d="M19.5 12v.5a4 4 0 0 1-4 4h-11"/>',
    sparkles: '<path d="M10 4l1.6 4.4L16 10l-4.4 1.6L10 16l-1.6-4.4L4 10l4.4-1.6z"/><path d="M18 14l.7 1.8 1.8.7-1.8.7L18 19l-.7-1.8-1.8-.7 1.8-.7z"/>',
    cart: '<path d="M3.5 4.5h2.2l2.1 10.2a1.5 1.5 0 0 0 1.5 1.2h7.9a1.5 1.5 0 0 0 1.5-1.1l1.6-6.3H6.4"/><circle cx="9.5" cy="19.2" r="1.3"/><circle cx="16.5" cy="19.2" r="1.3"/>',
    wallet: '<path d="M17.5 8V6.5A1.5 1.5 0 0 0 16 5H6.5a2.5 2.5 0 0 0 0 5"/><path d="M4 7.5v9A2.5 2.5 0 0 0 6.5 19H18a1.5 1.5 0 0 0 1.5-1.5v-6A1.5 1.5 0 0 0 18 10H6.5"/><circle cx="15.8" cy="14.5" r=".9" fill="currentColor"/>',
    tag: '<path d="M4 12.3V5.5A1.5 1.5 0 0 1 5.5 4h6.8a1.5 1.5 0 0 1 1 .4l6.4 6.4a1.5 1.5 0 0 1 0 2.2l-6.6 6.6a1.5 1.5 0 0 1-2.2 0l-6.4-6.4a1.5 1.5 0 0 1-.5-.9z"/><circle cx="8.5" cy="8.5" r="1.3"/>',
    target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1" fill="currentColor"/>',
    user:'<circle cx="12" cy="8.5" r="3.5"/><path d="M5.5 19.5a6.5 6.5 0 0 1 13 0"/>',
    cloud: '<path d="M7.5 18.5a4 4 0 0 1-.6-8 5.5 5.5 0 0 1 10.6 1.2 3.4 3.4 0 0 1-.5 6.8z"/>',
    cloudCheck: '<path d="M7.5 18.5a4 4 0 0 1-.6-8 5.5 5.5 0 0 1 10.6 1.2 3.4 3.4 0 0 1-.5 6.8z"/><path d="m9.5 14 1.8 1.8 3.4-3.4"/>',
    device: '<rect x="6.5" y="3.5" width="11" height="17" rx="3"/><path d="M11 17.5h2"/>',
    logout: '<path d="M14 4.5h3.5a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H14"/><path d="M10 8l-4 4 4 4M6 12h9"/>',
    empty:'<path d="M4.5 13.5 7 6.5a2 2 0 0 1 1.9-1.4h6.2A2 2 0 0 1 17 6.5l2.5 7"/><path d="M4.5 13.5v4a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-4h-4.5a3 3 0 0 1-6 0z"/>',
  };

  function svg(name, cls = '') {
    const body = paths[name];
    if (!body) return '';
    return `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
  }

  /** Gắn icon cho mọi phần tử có data-icon trong root (chỉ gắn một lần). */
  function hydrate(root = document) {
    root.querySelectorAll('[data-icon]:not([data-icon-done])').forEach(el => {
      el.insertAdjacentHTML('afterbegin', svg(el.dataset.icon));
      el.setAttribute('data-icon-done', '');
    });
  }

  return { svg, hydrate, names: Object.keys(paths) };
})();
