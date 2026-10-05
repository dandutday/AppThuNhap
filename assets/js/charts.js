/* =========================================================
   charts.js — Biểu đồ SVG tự vẽ (không dùng thư viện)
   ========================================================= */
const Charts = (() => {
  /** "Làm tròn đẹp" giá trị lớn nhất của trục */
  function niceMax(v) {
    if (v <= 0) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    const n = v / p;
    const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
    return step * p;
  }

  /** Cột bo tròn phía trên, phẳng ở đáy */
  function barPath(x, w, top, bottom) {
    const h = bottom - top;
    if (h <= 0) return '';
    const r = Math.min(6, w / 2, h);
    return `M${x},${bottom} V${top + r} Q${x},${top} ${x + r},${top} H${x + w - r} Q${x + w},${top} ${x + w},${top + r} V${bottom} Z`;
  }

  /**
   * Biểu đồ cột nhóm (mỗi tháng có nhiều cột cạnh nhau, vd Thu – Chi).
   * data:   [{ key, label, values: [số, số…], active }]
   * series: [{ name, cls }]  – cls là class CSS tô màu cột (vd "s-income", "s-expense")
   * opts:   { goal, onSelect(key) }
   */
  function bar(el, data, series, opts = {}) {
    // Vẽ theo đúng chiều rộng khung → chữ trên trục luôn giữ cỡ thật, không bị thu nhỏ trên điện thoại
    const W = Math.max(280, Math.round(el.clientWidth || 640));
    const narrow = W < 480;
    const H = narrow ? 200 : 250, L = narrow ? 38 : 46, R = 6, T = 14, B = 26;
    const all = data.flatMap(d => d.values);
    const max = niceMax(Math.max(opts.goal || 0, ...all) * 1.05);
    const iw = W - L - R, ih = H - T - B;
    const slot = iw / data.length;
    const groupW = Math.min(series.length * 18, slot * 0.72);
    const gap = series.length > 1 ? Math.max(1.5, groupW * 0.06) : 0;
    const bw = (groupW - gap * (series.length - 1)) / series.length;
    const y = (v) => T + ih - (v / max) * ih;
    const bottom = T + ih;

    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Biểu đồ thu chi theo tháng">`;
    for (let i = 0; i <= 4; i++) {
      const v = (max / 4) * i, yy = y(v);
      s += `<line class="grid" x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}"/>`;
      s += `<text class="axis" x="${L - 6}" y="${yy + 4}" text-anchor="end">${shortMoney(v)}</text>`;
    }
    data.forEach((d, i) => {
      const x0 = L + slot * i + (slot - groupW) / 2;
      s += `<g class="bar-g ${d.active ? 'current' : ''}" data-key="${d.key}">`;
      s += `<rect x="${L + slot * i}" y="${T}" width="${slot}" height="${ih}" fill="transparent"/>`;
      d.values.forEach((v, k) => {
        const h = v > 0 ? Math.max(3, (v / max) * ih) : 0;
        const path = barPath(x0 + k * (bw + gap), bw, bottom - h, bottom);
        if (path) s += `<path class="bar ${series[k].cls}" d="${path}"/>`;
      });
      const tip = [d.label, ...series.map((se, k) => `${se.name}: ${money(d.values[k])}`)].join('\n');
      s += `<title>${tip}</title></g>`;
      // Màn hẹp: bỏ chữ "T" (T10 → 10) cho đỡ chồng chữ
      const label = narrow ? d.label.replace(/^T/, '') : d.label;
      s += `<text class="axis ${d.active ? 'axis-active' : ''}" x="${x0 + groupW / 2}" y="${H - 8}" text-anchor="middle">${label}</text>`;
    });
    if (opts.goal) {
      const gy = y(opts.goal);
      s += `<line class="goal-line" x1="${L}" x2="${W - R}" y1="${gy}" y2="${gy}"/>`;
      s += `<text class="goal-text" x="${W - R}" y="${gy - 6}" text-anchor="end">Mục tiêu thu ${shortMoney(opts.goal)}</text>`;
    }
    s += '</svg>';
    el.innerHTML = s;

    if (opts.onSelect) {
      el.querySelectorAll('.bar-g').forEach(g => {
        g.style.cursor = 'pointer';
        g.addEventListener('click', () => opts.onSelect(g.dataset.key));
      });
    }
  }

  /**
   * Biểu đồ vòng (donut).
   * items: [{ value, color }]
   */
  function donut(el, items, centerTop, centerBottom) {
    const size = 180, r = 66, sw = 24, c = 2 * Math.PI * r;
    const total = items.reduce((a, b) => a + b.value, 0);
    let s = `<svg viewBox="0 0 ${size} ${size}" role="img" aria-label="Cơ cấu thu nhập">`;
    s += `<circle cx="90" cy="90" r="${r}" fill="none" stroke="var(--surface-2)" stroke-width="${sw}"/>`;
    if (total > 0) {
      const gap = items.length > 1 ? 3 : 0;
      let offset = 0;
      items.forEach(it => {
        const len = (it.value / total) * c;
        const dash = Math.max(0, len - gap);
        s += `<circle cx="90" cy="90" r="${r}" fill="none" stroke="${it.color}" stroke-width="${sw}"
               stroke-dasharray="${dash} ${c - dash}" stroke-dashoffset="${-offset}"
               transform="rotate(-90 90 90)" stroke-linecap="butt"/>`;
        offset += len;
      });
    }
    s += `<text class="center-label" x="90" y="84" text-anchor="middle">${centerTop}</text>`;
    s += `<text class="center-value" x="90" y="104" text-anchor="middle">${centerBottom}</text>`;
    s += '</svg>';
    el.innerHTML = s;
  }

  return { bar, donut };
})();
