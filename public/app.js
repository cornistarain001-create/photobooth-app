document.addEventListener('DOMContentLoaded', () => {
  'use strict';

  /* =====================================================================
     Aura Studio photobooth
     1. helpers            4. frame designs (reference-matched + classic)
     2. drawing library    5. renderer
     3. camera + stickers  6. UI wiring (views, contact, controls)
     ===================================================================== */

  const $ = (id) => document.getElementById(id);
  const TAU = Math.PI * 2;
  const SCALE = 1.5;                      // output resolution multiplier
  const PHONE = '09105631184';
  const SERIF = '"Fraunces", Georgia, serif';
  const HAND = '"Caveat", "Segoe Print", cursive';
  const SANS = 'Arial, Helvetica, sans-serif';

  /* ---------------------------------------------------------------------
     2. DRAWING LIBRARY  (all coordinates are in the reference-image space)
     --------------------------------------------------------------------- */
  const rng = (seed) => { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); };
  const sh = (ctx, blur = 6, dy = 3, a = 0.3) => { ctx.shadowColor = `rgba(0,0,0,${a})`; ctx.shadowBlur = blur; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = dy; };
  const lin = (ctx, x0, y0, x1, y1, stops) => { const g = ctx.createLinearGradient(x0, y0, x1, y1); stops.forEach(([o, c]) => g.addColorStop(o, c)); return g; };
  const poly = (ctx, pts) => { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); };

  function txt(ctx, s, x, y, font, color, o = {}) {
    ctx.save();
    ctx.font = font; ctx.fillStyle = color;
    ctx.textAlign = o.align || 'center'; ctx.textBaseline = o.base || 'middle';
    if (o.rot) { ctx.translate(x, y); ctx.rotate(o.rot); x = 0; y = 0; }
    if (o.stroke) { ctx.lineJoin = 'round'; ctx.lineWidth = o.sw || 3; ctx.strokeStyle = o.stroke; ctx.strokeText(s, x, y); }
    ctx.fillText(s, x, y);
    ctx.restore();
  }

  function fitSize(ctx, s, fontFn, maxW, size) {
    let n = size; ctx.font = fontFn(n);
    while (ctx.measureText(s).width > maxW && n > 9) { n -= 1; ctx.font = fontFn(n); }
    return n;
  }

  function starPath(ctx, cx, cy, R, r, n = 5, rot = -Math.PI / 2) {
    ctx.beginPath();
    for (let i = 0; i < n * 2; i++) {
      const a = rot + (i * Math.PI) / n, rad = i % 2 ? r : R;
      const x = cx + Math.cos(a) * rad, y = cy + Math.sin(a) * rad;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.closePath();
  }

  function heartPath(ctx, cx, cy, s) {
    ctx.beginPath();
    for (let i = 0; i <= 48; i++) {
      const t = (i / 48) * TAU;
      const x = 16 * Math.pow(Math.sin(t), 3);
      const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
      const px = cx + (x / 16) * s, py = cy + (y / 16) * s + s * 0.05;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath();
  }

  const patCache = {};
  function gingham(ctx, c1, c2 = '#fff', size = 12) {
    const k = c1 + c2 + size;
    if (!patCache[k]) {
      const c = document.createElement('canvas'); c.width = c.height = size * 2;
      const g = c.getContext('2d');
      g.fillStyle = c2; g.fillRect(0, 0, size * 2, size * 2);
      g.fillStyle = c1; g.globalAlpha = 0.55;
      g.fillRect(0, 0, size, size * 2); g.fillRect(0, 0, size * 2, size);
      patCache[k] = c;
    }
    return ctx.createPattern(patCache[k], 'repeat');
  }

  function paperTex(ctx, x, y, w, h, base, seed = 3, amt = 1) {
    const r = rng(seed);
    ctx.save();
    ctx.fillStyle = base; ctx.fillRect(x, y, w, h);
    const n = Math.floor((w * h) / 90 * amt);
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = r() < 0.5 ? 'rgba(255,255,255,.13)' : 'rgba(80,50,20,.08)';
      ctx.fillRect(x + r() * w, y + r() * h, 1 + r() * 3, 1 + r() * 2);
    }
    ctx.restore();
  }

  function newsprint(ctx, x, y, w, h, o = {}) {
    const { paper = '#e8e4da', ink = '#3a3631', seed = 1, cols = 3 } = o;
    const r = rng(seed);
    ctx.save();
    ctx.fillStyle = paper; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = ink;
    const cw = (w - 8) / cols;
    for (let c = 0; c < cols; c++) {
      let yy = y + 6 + r() * 10; const cx = x + 4 + c * cw;
      while (yy < y + h - 6) {
        if (r() < 0.13) { ctx.globalAlpha = 0.85; ctx.fillRect(cx + 2, yy, cw * (0.5 + r() * 0.4), 5); yy += 10; }
        else {
          ctx.globalAlpha = 0.5;
          const lines = 3 + Math.floor(r() * 5);
          for (let k = 0; k < lines && yy < y + h - 6; k++) { ctx.fillRect(cx + 2, yy, cw - 6 - (r() < 0.2 ? r() * 20 : 0), 1.6); yy += 3.6; }
          yy += 6;
        }
      }
    }
    ctx.restore();
  }

  function sticker(ctx, pts, fill, inner, edge = 'rgba(255,255,255,.92)') {
    ctx.save(); ctx.lineJoin = 'round'; sh(ctx, 6, 3, 0.3); poly(ctx, pts); ctx.fillStyle = fill; ctx.fill(); ctx.restore();
    if (inner) { ctx.save(); poly(ctx, pts); ctx.clip(); inner(); ctx.restore(); }
    ctx.save(); ctx.lineJoin = 'round'; poly(ctx, pts); ctx.strokeStyle = edge; ctx.lineWidth = 2; ctx.stroke(); ctx.restore();
  }

  function fabricStar(ctx, cx, cy, R, color, stitch, rot = -Math.PI / 2, edge = 'rgba(255,255,255,.92)') {
    ctx.save(); ctx.lineJoin = 'round'; sh(ctx, 6, 3, 0.3);
    starPath(ctx, cx, cy, R, R * 0.5, 5, rot);
    ctx.fillStyle = edge; ctx.strokeStyle = edge; ctx.lineWidth = 7; ctx.fill(); ctx.stroke();
    ctx.restore();
    ctx.save(); ctx.lineJoin = 'round';
    starPath(ctx, cx, cy, R * 0.94, R * 0.47, 5, rot);
    ctx.fillStyle = color; ctx.fill(); ctx.clip();
    ctx.strokeStyle = 'rgba(255,255,255,.14)'; ctx.lineWidth = 1;
    for (let i = -R * 2; i < R * 2; i += 3) { ctx.beginPath(); ctx.moveTo(cx + i, cy - R); ctx.lineTo(cx + i + R, cy + R); ctx.stroke(); }
    ctx.restore();
    ctx.save(); ctx.lineJoin = 'round'; ctx.setLineDash([6, 4]); ctx.strokeStyle = stitch; ctx.lineWidth = 1.6;
    starPath(ctx, cx, cy, R * 0.8, R * 0.4, 5, rot); ctx.stroke(); ctx.restore();
  }

  function spiralStar(ctx, cx, cy, R, body, stripe, rot = -Math.PI / 2) {
    ctx.save(); ctx.lineJoin = 'round'; sh(ctx, 5, 2, 0.3);
    starPath(ctx, cx, cy, R, R * 0.48, 5, rot);
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 8; ctx.fill(); ctx.stroke();
    ctx.restore();
    ctx.save(); starPath(ctx, cx, cy, R, R * 0.48, 5, rot); ctx.fillStyle = body; ctx.fill();
    if (stripe) {
      ctx.clip(); ctx.strokeStyle = stripe; ctx.lineWidth = R * 0.11; ctx.lineCap = 'round'; ctx.beginPath();
      const turns = TAU * 3.3;
      for (let a = 0; a < turns; a += 0.1) {
        const rr = (a / turns) * R * 1.05;
        const x = cx + Math.cos(a + rot) * rr, y = cy + Math.sin(a + rot) * rr;
        a ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  function bow(ctx, x, y, s, o = {}) {
    const { fill = '#b01226', hi = null, shade = 'rgba(0,0,0,.25)', rot = 0 } = o;
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
    const f = hi ? lin(ctx, -s * 1.3, -s, s * 1.3, s * 0.6, [[0, hi], [0.5, fill], [1, fill]]) : fill;
    sh(ctx, 6, 3, 0.3); ctx.fillStyle = f;
    for (const m of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(m * s * 0.05, 0); ctx.lineTo(m * s * 0.78, s * 0.98); ctx.lineTo(m * s * 0.55, s * 0.84);
      ctx.lineTo(m * s * 0.5, s * 1.1); ctx.lineTo(m * s * 0.12, s * 0.2); ctx.closePath(); ctx.fill();
    }
    for (const m of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(0, 0);
      ctx.bezierCurveTo(m * s * 0.4, -s * 1.0, m * s * 1.45, -s * 0.85, m * s * 1.3, s * 0.02);
      ctx.bezierCurveTo(m * s * 1.2, s * 0.85, m * s * 0.4, s * 0.7, 0, 0); ctx.closePath(); ctx.fill();
    }
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = shade; ctx.lineWidth = Math.max(1, s * 0.05); ctx.lineCap = 'round';
    for (const m of [-1, 1]) { ctx.beginPath(); ctx.moveTo(m * s * 0.15, 0); ctx.quadraticCurveTo(m * s * 0.7, -s * 0.12, m * s * 1.1, 0); ctx.stroke(); }
    ctx.fillStyle = f; ctx.beginPath(); ctx.ellipse(0, 0, s * 0.2, s * 0.26, 0, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  function safetyPin(ctx, x, y, len = 100, rot = 0) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot); sh(ctx, 3, 2, 0.3);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const wire = (c, w) => {
      ctx.strokeStyle = c; ctx.lineWidth = w;
      ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(len, -7); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, 7); ctx.lineTo(len * 0.88, 7); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, 7, Math.PI / 2, Math.PI * 1.5); ctx.stroke();
      ctx.beginPath(); ctx.roundRect(len * 0.82, -12, len * 0.18 + 6, 15, 7); ctx.stroke();
    };
    wire('#6f757c', 3.4); ctx.shadowColor = 'transparent'; wire('#dfe3e8', 1.2);
    ctx.restore();
  }

  function waxSeal(ctx, cx, cy, r, base = '#8f1d22', light = '#b3363a', dark = '#5e0f14') {
    ctx.save(); ctx.translate(cx, cy); sh(ctx, 8, 4, 0.4);
    ctx.beginPath();
    for (let i = 0; i <= 120; i++) {
      const a = (i / 120) * TAU, rr = r * (1 + 0.045 * Math.sin(a * 9 + 1) + 0.03 * Math.sin(a * 5));
      const x = Math.cos(a) * rr, y = Math.sin(a) * rr; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.closePath();
    const g = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r * 1.1);
    g.addColorStop(0, light); g.addColorStop(1, base); ctx.fillStyle = g; ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = dark;
    ctx.globalAlpha = 0.55; ctx.lineWidth = r * 0.07; ctx.beginPath(); ctx.arc(0, 0, r * 0.78, 0, TAU); ctx.stroke();
    ctx.globalAlpha = 0.85; ctx.lineWidth = r * 0.05;
    ctx.beginPath();
    const turns = TAU * 2.3;
    for (let a = 0; a < turns; a += 0.15) { const rr = (a / turns) * r * 0.3; const x = Math.cos(a) * rr, y = -r * 0.2 + Math.sin(a) * rr * 0.85; a ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0, -r * 0.2, r * 0.34, r * 0.3, 0, Math.PI * 0.15, Math.PI * 1.85); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, r * 0.1); ctx.quadraticCurveTo(-r * 0.05, r * 0.35, r * 0.08, r * 0.58); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(-r * 0.2, r * 0.38, r * 0.17, r * 0.08, -0.5, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(r * 0.2, r * 0.28, r * 0.17, r * 0.08, 0.5, 0, TAU); ctx.stroke();
    ctx.restore();
  }

  function lips(ctx, cx, cy, w, color, rot = 0, outline = null) {
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot);
    const p = () => {
      ctx.beginPath(); ctx.moveTo(-w / 2, 0);
      ctx.bezierCurveTo(-w * 0.32, -w * 0.3, -w * 0.12, -w * 0.3, 0, -w * 0.12);
      ctx.bezierCurveTo(w * 0.12, -w * 0.3, w * 0.32, -w * 0.3, w / 2, 0);
      ctx.bezierCurveTo(w * 0.3, w * 0.32, -w * 0.3, w * 0.32, -w / 2, 0); ctx.closePath();
    };
    if (outline) { p(); ctx.lineJoin = 'round'; ctx.lineWidth = 6; ctx.strokeStyle = outline; ctx.stroke(); }
    p(); ctx.fillStyle = color; ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.28)'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(-w / 2, 0); ctx.quadraticCurveTo(0, w * 0.07, w / 2, 0); ctx.stroke();
    ctx.restore();
  }

  function flower(ctx, cx, cy, R, petal, edge, core, rot = 0) {
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot); sh(ctx, 6, 3, 0.3);
    for (let k = 0; k < 5; k++) {
      ctx.save(); ctx.rotate((k * TAU) / 5);
      ctx.beginPath(); ctx.moveTo(0, 0);
      ctx.bezierCurveTo(R * 0.25, -R * 0.55, R * 0.95, -R * 0.6, R, 0);
      ctx.bezierCurveTo(R * 0.95, R * 0.6, R * 0.25, R * 0.55, 0, 0);
      ctx.fillStyle = lin(ctx, 0, 0, R, 0, [[0, core], [0.4, petal], [1, petal]]);
      ctx.fill(); ctx.shadowColor = 'transparent'; ctx.strokeStyle = edge; ctx.lineWidth = 1.2; ctx.stroke();
      ctx.restore();
    }
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = core; ctx.lineWidth = 2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(R * 0.15, -R * 0.35, R * 0.4, -R * 0.45); ctx.stroke();
    ctx.fillStyle = '#e9c46a';
    for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(R * (0.28 + i * 0.03), -R * (0.3 + i * 0.03) + i * 2, R * 0.045, 0, TAU); ctx.fill(); }
    ctx.fillStyle = core; ctx.beginPath(); ctx.arc(0, 0, R * 0.12, 0, TAU); ctx.fill();
    ctx.restore();
  }

  const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
  function clock(ctx, cx, cy, r) {
    ctx.save(); ctx.translate(cx, cy); sh(ctx, 8, 4, 0.4);
    ctx.fillStyle = '#6b1a1f'; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill(); ctx.shadowColor = 'transparent';
    ctx.strokeStyle = '#a8524f'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, 0, r * 0.95, 0, TAU); ctx.stroke();
    const g = ctx.createRadialGradient(-r * 0.2, -r * 0.2, r * 0.1, 0, 0, r * 0.85);
    g.addColorStop(0, '#f3e8cd'); g.addColorStop(1, '#d9c7a0');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r * 0.84, 0, TAU); ctx.fill();
    ctx.fillStyle = '#4a2a22';
    for (let i = 1; i <= 12; i++) {
      const a = (i / 12) * TAU - Math.PI / 2;
      txt(ctx, ROMAN[i - 1], Math.cos(a) * r * 0.64, Math.sin(a) * r * 0.64, `700 ${r * 0.17}px "Times New Roman", serif`, '#4a2a22', { rot: a + Math.PI / 2 });
    }
    ctx.strokeStyle = '#3a1e1a'; ctx.lineCap = 'round';
    const hand = (a, len, w) => { ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * len, Math.sin(a) * len); ctx.stroke(); };
    hand(-Math.PI / 2 - 1.05, r * 0.4, r * 0.06);
    hand(-Math.PI / 2 + 1.1, r * 0.6, r * 0.04);
    ctx.fillStyle = '#3a1e1a'; ctx.beginPath(); ctx.arc(0, 0, r * 0.05, 0, TAU); ctx.fill();
    ctx.restore();
  }

  function stamp(ctx, x, y, w, h, rot = 0) {
    ctx.save(); ctx.translate(x + w / 2, y + h / 2); ctx.rotate(rot); sh(ctx, 5, 2, 0.3);
    ctx.fillStyle = '#efd8ac';
    for (let i = 0; i <= w; i += 10) { ctx.beginPath(); ctx.arc(-w / 2 + i, -h / 2, 4.6, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.arc(-w / 2 + i, h / 2, 4.6, 0, TAU); ctx.fill(); }
    for (let j = 0; j <= h; j += 10) { ctx.beginPath(); ctx.arc(-w / 2, -h / 2 + j, 4.6, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.arc(w / 2, -h / 2 + j, 4.6, 0, TAU); ctx.fill(); }
    ctx.fillRect(-w / 2, -h / 2, w, h); ctx.shadowColor = 'transparent';
    ctx.fillStyle = '#f6e8cb'; ctx.fillRect(-w / 2 + 7, -h / 2 + 7, w - 14, h - 14);
    heartPath(ctx, 0, -2, w * 0.3); ctx.fillStyle = '#e9808c'; ctx.fill();
    ctx.strokeStyle = '#b24a4a'; ctx.lineWidth = 1; ctx.strokeRect(-w / 2 + 7, -h / 2 + 7, w - 14, h - 14);
    txt(ctx, '20', -w / 2 + 18, h / 2 - 15, `700 11px Georgia, serif`, '#b24a4a');
    txt(ctx, '21', w / 2 - 18, h / 2 - 15, `700 11px Georgia, serif`, '#b24a4a');
    ctx.restore();
  }

  function rose(ctx, x, y, r, col = '#b3202c') {
    ctx.save(); ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(60,0,0,.55)'; ctx.lineWidth = Math.max(0.8, r * 0.14); ctx.beginPath();
    for (let a = 0; a < TAU * 2; a += 0.2) { const rr = (a / (TAU * 2)) * r * 0.8; const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr; a ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
    ctx.stroke(); ctx.restore();
  }

  function disco(ctx, cx, cy, r) {
    ctx.save(); sh(ctx, 6, 3, 0.3);
    ctx.fillStyle = '#9a9ea3'; ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fill(); ctx.shadowColor = 'transparent';
    ctx.clip();
    const rnd = rng(11), t = r / 6;
    for (let gx = -r; gx < r; gx += t) for (let gy = -r; gy < r; gy += t) {
      const v = 90 + Math.floor(rnd() * 150);
      ctx.fillStyle = `rgb(${v},${v},${v + 4})`; ctx.fillRect(cx + gx + 0.5, cy + gy + 0.5, t - 1, t - 1);
    }
    const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.35, 2, cx, cy, r);
    g.addColorStop(0, 'rgba(255,255,255,.55)'); g.addColorStop(0.5, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(0,0,0,.35)');
    ctx.fillStyle = g; ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.restore();
  }

  function strawberry(ctx, cx, cy, s) {
    ctx.save(); ctx.translate(cx, cy); sh(ctx, 5, 3, 0.3);
    ctx.beginPath(); ctx.moveTo(0, s * 1.05);
    ctx.bezierCurveTo(s * 1.2, s * 0.35, s * 1.15, -s * 0.8, 0, -s * 0.6);
    ctx.bezierCurveTo(-s * 1.15, -s * 0.8, -s * 1.2, s * 0.35, 0, s * 1.05); ctx.closePath();
    ctx.fillStyle = lin(ctx, -s, -s, s, s, [[0, '#ee3b44'], [1, '#b8111f']]); ctx.fill(); ctx.shadowColor = 'transparent';
    ctx.fillStyle = '#f6d36b';
    const r = rng(5);
    for (let i = 0; i < 22; i++) { const px = (r() - 0.5) * s * 1.6, py = -s * 0.3 + r() * s * 1.2; if (Math.abs(px) < s * (1.0 - py / (s * 2.2))) { ctx.beginPath(); ctx.ellipse(px, py, 1.6, 2.4, 0, 0, TAU); ctx.fill(); } }
    ctx.fillStyle = '#4f8a3a';
    for (let k = -2; k <= 2; k++) { ctx.beginPath(); ctx.ellipse(k * s * 0.22, -s * 0.62, s * 0.2, s * 0.1, k * 0.5, 0, TAU); ctx.fill(); }
    ctx.restore();
  }

  function starfish(ctx, cx, cy, R, col) {
    ctx.save(); ctx.lineJoin = 'round'; sh(ctx, 5, 3, 0.3);
    starPath(ctx, cx, cy, R, R * 0.42, 5, -Math.PI / 2 + 0.3);
    ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineWidth = R * 0.22; ctx.fill(); ctx.stroke();
    ctx.shadowColor = 'transparent'; ctx.fillStyle = 'rgba(255,255,255,.55)';
    for (let k = 0; k < 5; k++) for (let i = 1; i < 5; i++) {
      const a = -Math.PI / 2 + 0.3 + (k * TAU) / 5; ctx.beginPath(); ctx.arc(cx + Math.cos(a) * i * R * 0.17, cy + Math.sin(a) * i * R * 0.17, 1.5, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  function cupidPup(ctx, x, y) {
    ctx.save(); ctx.translate(x, y); sh(ctx, 6, 3, 0.25);
    const cream = '#f4eadb', line = '#cbbda6';
    const el = (ex, ey, rx, ry, rot, fill, stroke) => { ctx.beginPath(); ctx.ellipse(ex, ey, rx, ry, rot, 0, TAU); ctx.fillStyle = fill; ctx.fill(); if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.5; ctx.stroke(); } };
    el(-30, 22, 13, 26, -0.6, '#f2b8c2', '#d98d9b');          // wing
    el(-8, 82, 14, 9, 0, cream, line); el(18, 84, 14, 9, 0, cream, line); // feet
    el(0, 42, 30, 38, 0, cream, line);                         // body
    ctx.shadowColor = 'transparent';
    el(8, -30, 36, 33, 0, cream, line);                        // head
    el(40, -22, 22, 14, 0.1, cream, line);                     // snout
    el(60, -27, 8, 6, 0, '#2c2420');                           // nose
    el(-18, -22, 13, 27, 0.25, '#7a5646', '#5a3d30');          // ear
    el(24, -39, 3.6, 4.4, 0, '#2c2420');                       // eye
    ctx.strokeStyle = '#2c2420'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(48, -14, 7, 0.2, 1.4); ctx.stroke();
    el(14, -10, 7, 4.5, 0, 'rgba(240,140,150,.6)');            // blush
    ctx.strokeStyle = '#8a4a2f'; ctx.lineWidth = 3.5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(46, 20, 40, -1.15, 1.15); ctx.stroke();   // bow
    ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(46 + Math.cos(-1.15) * 40, 20 + Math.sin(-1.15) * 40); ctx.lineTo(46 + Math.cos(1.15) * 40, 20 + Math.sin(1.15) * 40); ctx.stroke();
    ctx.strokeStyle = '#8a4a2f'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(10, 20); ctx.lineTo(96, 20); ctx.stroke(); // arrow
    ctx.fillStyle = '#d0192d'; heartPath(ctx, 100, 20, 9); ctx.fill();
    ctx.fillStyle = '#f2b8c2'; ctx.beginPath(); ctx.moveTo(10, 20); ctx.lineTo(0, 12); ctx.lineTo(6, 20); ctx.lineTo(0, 28); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  function plate(ctx, cx, cy, w, h, rot) {
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot); sh(ctx, 6, 3, 0.3);
    ctx.beginPath(); ctx.roundRect(-w / 2, -h / 2, w, h, 9); ctx.fillStyle = '#f2e7e4'; ctx.fill(); ctx.shadowColor = 'transparent';
    ctx.strokeStyle = '#a79a98'; ctx.lineWidth = 2; ctx.beginPath(); ctx.roundRect(-w / 2 + 4, -h / 2 + 4, w - 8, h - 8, 6); ctx.stroke();
    txt(ctx, '20', -w / 2 + 16, -h / 2 + 13, `700 11px ${SANS}`, '#6e6361');
    txt(ctx, '12', w / 2 - 16, -h / 2 + 13, `700 11px ${SANS}`, '#6e6361');
    txt(ctx, 'THESE', 0, -h / 2 + 14, `700 10px ${SANS}`, '#6e6361');
    ctx.font = `900 30px ${SANS}`; const fs = fitSize(ctx, 'MEMORIES', (n) => `900 ${n}px ${SANS}`, w - 26, 30);
    txt(ctx, 'MEMORIES', 0, 3, `900 ${fs}px ${SANS}`, '#b01a2a', { stroke: '#7b1020', sw: 1.5 });
    txt(ctx, 'MAKE ME SMILE', 0, h / 2 - 12, `700 9px ${SANS}`, '#6e6361');
    ctx.fillStyle = '#8c8280'; [[-w / 2 + 9, 0], [w / 2 - 9, 0]].forEach(([px, py]) => { ctx.beginPath(); ctx.arc(px, py, 2.4, 0, TAU); ctx.fill(); });
    ctx.restore();
  }

  function ticket(ctx, x, y, w, h, rot = 0) {
    ctx.save(); ctx.translate(x + w / 2, y + h / 2); ctx.rotate(rot); sh(ctx, 5, 3, 0.3);
    ctx.beginPath(); ctx.roundRect(-w / 2, -h / 2, w, h, 6); ctx.fillStyle = '#f5e8e5'; ctx.fill(); ctx.shadowColor = 'transparent';
    ctx.strokeStyle = '#b01a2a'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.roundRect(-w / 2 + 4, -h / 2 + 4, w - 8, h - 8, 4); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-w / 2 + 28, -h / 2 + 4); ctx.lineTo(-w / 2 + 28, h / 2 - 4); ctx.moveTo(w / 2 - 28, -h / 2 + 4); ctx.lineTo(w / 2 - 28, h / 2 - 4); ctx.setLineDash([3, 3]); ctx.stroke(); ctx.setLineDash([]);
    ['good', 'things', 'are', 'coming'].forEach((t, i) => txt(ctx, t, -w / 2 + 38, -h / 2 + 18 + i * 19, `700 18px ${SANS}`, '#1c1c1c', { align: 'left' }));
    txt(ctx, '48645235', -w / 2 + 16, 0, `700 11px ${SANS}`, '#b01a2a', { rot: -Math.PI / 2 });
    txt(ctx, '48645235', w / 2 - 14, 0, `700 11px ${SANS}`, '#b01a2a', { rot: Math.PI / 2 });
    ctx.restore();
  }

  function cake(ctx, cx, cy) {
    ctx.save(); ctx.translate(cx, cy); sh(ctx, 6, 3, 0.3);
    ctx.fillStyle = '#6b3a22'; [[-26, 45], [24, 45]].forEach(([px, py]) => { ctx.beginPath(); ctx.ellipse(px, py, 10, 7, 0, 0, TAU); ctx.fill(); });
    ctx.fillStyle = '#f7efe2'; ctx.beginPath(); ctx.roundRect(-46, -12, 92, 56, [10, 10, 24, 24]); ctx.fill(); ctx.shadowColor = 'transparent';
    ctx.fillStyle = '#fffaf2';
    for (let i = -4; i <= 4; i++) { ctx.beginPath(); ctx.arc(i * 10.5, -14, 7.5, 0, TAU); ctx.fill(); }
    ctx.beginPath(); ctx.ellipse(0, -16, 44, 14, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#c4182c';
    [[-26, -22], [-10, -26], [8, -24], [24, -22], [-2, -17], [16, -16], [-18, -14]].forEach(([px, py]) => { ctx.beginPath(); ctx.arc(px, py, 5, 0, TAU); ctx.fill(); });
    ctx.fillStyle = '#d4202f'; ctx.beginPath(); ctx.moveTo(0, -42); ctx.bezierCurveTo(14, -40, 12, -24, 0, -22); ctx.bezierCurveTo(-12, -24, -14, -40, 0, -42); ctx.fill();
    ctx.fillStyle = '#4f8a3a'; ctx.beginPath(); ctx.ellipse(0, -43, 7, 3, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#2c2420'; [[-14, 14], [14, 14]].forEach(([px, py]) => { ctx.beginPath(); ctx.arc(px, py, 3, 0, TAU); ctx.fill(); });
    ctx.fillStyle = 'rgba(240,140,150,.7)'; [[-26, 20], [26, 20]].forEach(([px, py]) => { ctx.beginPath(); ctx.ellipse(px, py, 6, 3.5, 0, 0, TAU); ctx.fill(); });
    ctx.restore();
  }

  function bouquet(ctx, x, y) {
    ctx.save(); ctx.translate(x, y);
    sh(ctx, 5, 3, 0.25);
    poly(ctx, [[5, 62], [66, 2], [140, 8], [146, 80], [108, 122], [48, 100]]);
    ctx.fillStyle = 'rgba(246,243,240,.92)'; ctx.fill(); ctx.shadowColor = 'transparent';
    ctx.strokeStyle = '#b9b4b0'; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.strokeStyle = 'rgba(190,185,180,.7)'; ctx.beginPath(); ctx.moveTo(66, 2); ctx.lineTo(100, 60); ctx.moveTo(140, 8); ctx.lineTo(90, 70); ctx.stroke();
    ctx.strokeStyle = '#4f8a3a'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    [[62, 55], [82, 48], [102, 52]].forEach(([px, py], i) => { ctx.beginPath(); ctx.moveTo(px, py + 16); ctx.quadraticCurveTo(px + 6, py + 40, 84 + i * 3, 92); ctx.stroke(); });
    ctx.fillStyle = '#5b9a45'; ctx.beginPath(); ctx.ellipse(52, 70, 5, 16, -0.9, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.ellipse(118, 70, 5, 16, 0.9, 0, TAU); ctx.fill();
    [[62, 48, -0.2], [82, 40, 0], [102, 46, 0.2]].forEach(([px, py, r]) => {
      ctx.save(); ctx.translate(px, py); ctx.rotate(r);
      ctx.fillStyle = '#c4182c'; ctx.beginPath(); ctx.moveTo(-10, 0); ctx.bezierCurveTo(-12, -18, 12, -18, 10, 0); ctx.bezierCurveTo(8, 14, -8, 14, -10, 0); ctx.fill();
      ctx.fillStyle = '#e0364a'; ctx.beginPath(); ctx.moveTo(-3, -14); ctx.lineTo(0, -4); ctx.lineTo(3, -14); ctx.fill();
      ctx.restore();
    });
    bow(ctx, 112, 100, 14, { fill: '#fdfdfb', shade: 'rgba(0,0,0,.18)', rot: 0.1 });
    ctx.restore();
  }

  function chromeStar(ctx, cx, cy, R, rot = -Math.PI / 2) {
    ctx.save(); ctx.lineJoin = 'round'; sh(ctx, 5, 3, 0.35);
    starPath(ctx, cx, cy, R, R * 0.5, 5, rot);
    ctx.fillStyle = lin(ctx, cx - R, cy - R, cx + R, cy + R, [[0, '#f4f6f8'], [0.45, '#9ea4ab'], [0.6, '#d8dce0'], [1, '#6b7178']]);
    ctx.strokeStyle = '#6b7178'; ctx.lineWidth = R * 0.12; ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  function fillHoles(ctx, d, rim) {
    d.slots.forEach((s) => {
      if (rim) { ctx.fillStyle = rim; ctx.fillRect(s.x - 3, s.y - 3, s.w + 6, s.h + 6); }
      ctx.fillStyle = d.holeColor; ctx.fillRect(s.x, s.y, s.w, s.h);
    });
  }

  /* ---------------------------------------------------------------------
     4. FRAME DESIGNS
     "themed" designs are drawn to match the reference images exactly:
     each has a fixed number of cuts, a crop window and its own stickers.
     --------------------------------------------------------------------- */
  const themed = [];

  /* --- Spiral stars on green canvas (2 cuts) --- */
  themed.push({
    id: 'star_spiral', label: 'Spiral Stars', cuts: 2, crop: [0, 100, 675, 1190],
    ph: '#d9cca8', ink: '#4a3b1a', holeColor: '#3a2f1a',
    slots: [{ x: 165, y: 305, w: 345, h: 245 }, { x: 165, y: 650, w: 345, h: 243 }],
    bg(ctx) {
      ctx.fillStyle = '#59681f'; ctx.fillRect(0, 0, 675, 1200);
      ctx.lineWidth = 1;
      for (let y = 0; y < 1200; y += 3) { ctx.strokeStyle = 'rgba(0,0,0,.09)'; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(675, y); ctx.stroke(); }
      for (let x = 0; x < 675; x += 3) { ctx.strokeStyle = 'rgba(255,255,255,.05)'; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 1200); ctx.stroke(); }
    },
    body(ctx, st, d) {
      [[127, 270, 421, 320], [127, 612, 421, 318]].forEach(([x, y, w, h], k) => {
        ctx.save(); sh(ctx, 10, 4, 0.35); ctx.fillStyle = '#f0e4c4'; ctx.fillRect(x, y, w, h); ctx.restore();
        const r = rng(7 + k), m = 19; ctx.fillStyle = '#2b1d12';
        const put = (px, py) => { const R = 9 + r() * 8; starPath(ctx, px, py, R, R * 0.27, 4, -Math.PI / 2); ctx.fill(); };
        for (let px = x + m; px <= x + w - m + 1; px += 52) { put(px, y + m); put(px, y + h - m); }
        for (let py = y + m + 52; py < y + h - m - 20; py += 52) { put(x + m, py); put(x + w - m, py); }
      });
      fillHoles(ctx, d, '#cdbf9c');
    },
    front(ctx) {
      spiralStar(ctx, 178, 195, 72, '#8b2a8d', '#f1892a', -0.2);
      spiralStar(ctx, 78, 383, 80, '#d63b24', null, 0.25);
      spiralStar(ctx, 108, 718, 48, '#c8dc2d', null, 0.1);
      spiralStar(ctx, 535, 575, 68, '#6e2c7e', '#d9d62f', 0.5);
      spiralStar(ctx, 545, 1000, 95, '#8b2a8d', '#f1892a', -0.4);
      spiralStar(ctx, 260, 1090, 75, '#f6a823', '#4a1c19', 0.3);
    },
  });

  /* --- Wine polaroid with wax seal (1 cut) --- */
  themed.push({
    id: 'wine_seal', label: 'Wine Polaroid', cuts: 1, crop: [10, 180, 710, 1010],
    ph: '#e9cfd2', ink: '#7b1a22', holeColor: '#22090c',
    slots: [{ x: 135, y: 315, w: 492, h: 500 }],
    bg(ctx) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 740, 1300); },
    body(ctx, st, d) {
      const scrap = (x, y, w, h, rot, seed, words) => {
        ctx.save(); ctx.translate(x + w / 2, y + h / 2); ctx.rotate(rot); sh(ctx, 4, 2, 0.25);
        ctx.fillStyle = '#e4dfd2'; ctx.fillRect(-w / 2, -h / 2, w, h); ctx.shadowColor = 'transparent';
        newsprint(ctx, -w / 2, -h / 2, w, h, { seed, cols: 2 });
        if (words) txt(ctx, words, -w / 2 + 6, 0, `700 ${Math.min(h - 6, 20)}px "Times New Roman", serif`, '#2a2622', { align: 'left' });
        ctx.restore();
      };
      scrap(176, 266, 112, 34, -0.04, 3, 'Love lo');
      scrap(84, 668, 44, 150, 0.03, 5, null);
      for (let i = 0; i < 4; i++) txt(ctx, 'lov', 90, 698 + i * 30, `700 18px "Times New Roman", serif`, '#2a2622', { align: 'left' });
      scrap(478, 926, 92, 34, -0.04, 9, 'love');
      ctx.save(); sh(ctx, 14, 6, 0.4);
      ctx.fillStyle = '#74181f'; ctx.fillRect(100, 282, 565, 663); ctx.restore();
      paperTex(ctx, 100, 282, 565, 663, '#74181f', 21, 1.4);
      ctx.fillStyle = lin(ctx, 0, 282, 0, 945, [[0, 'rgba(255,255,255,.07)'], [1, 'rgba(0,0,0,.18)']]); ctx.fillRect(100, 282, 565, 663);
      fillHoles(ctx, d, '#4d0f14');
    },
    front(ctx, st) {
      fabricStar(ctx, 545, 258, 40, '#7d1d1d', '#e6b9b9', -1.4, '#e6d6d2');
      fabricStar(ctx, 637, 250, 54, '#7d1d1d', '#e6b9b9', -1.7, '#e6d6d2');
      fabricStar(ctx, 655, 347, 36, '#7d1d1d', '#e6b9b9', -1.2, '#e6d6d2');
      waxSeal(ctx, 115, 908, 88, '#7a1218', '#a52a2e', '#4a0a0e');
      const cap = (st.caption || '').trim();
      if (cap) { const f = (n) => `700 ${n}px ${HAND}`; const n = fitSize(ctx, cap, f, 330, 54); txt(ctx, cap, 425, 884, f(n), '#f0c9c9'); }
    },
  });

  /* --- Story of Love (3 cuts, black background) --- */
  themed.push({
    id: 'story_love', label: 'Story of Love', cuts: 3, crop: [175, 5, 590, 1000],
    ph: '#e8c9cf', ink: '#8c1427', holeColor: '#150508',
    slots: [{ x: 228, y: 82, w: 300, h: 231 }, { x: 228, y: 338, w: 300, h: 230 }, { x: 228, y: 594, w: 300, h: 231 }],
    bg(ctx) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 736, 1040); },
    body(ctx, st, d) {
      ctx.fillStyle = lin(ctx, 203, 0, 553, 0, [[0, '#7d1022'], [0.5, '#951629'], [1, '#7d1022']]);
      ctx.fillRect(203, 22, 350, 963);
      fillHoles(ctx, d, null);
      ctx.strokeStyle = 'rgba(255,200,205,.35)'; ctx.lineWidth = 1;
      d.slots.forEach((s) => ctx.strokeRect(s.x - 3.5, s.y - 3.5, s.w + 7, s.h + 7));
      // title banner
      ctx.save(); sh(ctx, 4, 2, 0.4);
      ctx.beginPath(); ctx.roundRect(242, 22, 265, 50, 8); ctx.fillStyle = '#6f0e1e'; ctx.fill(); ctx.restore();
      ctx.strokeStyle = '#d98a95'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.roundRect(246, 26, 257, 42, 6); ctx.stroke();
      ctx.fillStyle = '#c4182c'; [[248, 47], [501, 47]].forEach(([x, y]) => { ctx.beginPath(); ctx.arc(x, y, 6, 0, TAU); ctx.fill(); ctx.strokeStyle = '#e9a0aa'; ctx.stroke(); });
      const cap = (st.caption || '').trim() || 'Story Of Love';
      const f = (n) => `italic 700 ${n}px ${SERIF}`; const n = fitSize(ctx, cap, f, 205, 30);
      txt(ctx, cap, 375, 48, f(n), '#fff');
    },
    front(ctx) {
      // lips pattern strip (bottom right)
      sticker(ctx, [[295, 905], [330, 886], [380, 893], [440, 880], [500, 886], [540, 870], [560, 882], [562, 985], [295, 985]], '#e9d5ca', () => {
        const r = rng(19);
        for (let i = 0; i < 46; i++) lips(ctx, 295 + r() * 270, 880 + r() * 110, 34, 'rgba(160,30,44,.78)', (r() - 0.5) * 2.4);
      });
      // newspaper (bottom left)
      sticker(ctx, [[203, 777], [238, 785], [262, 800], [290, 820], [318, 848], [335, 880], [345, 930], [345, 985], [203, 985]], '#e8e4da', () => newsprint(ctx, 203, 777, 145, 208, { seed: 4, cols: 3 }));
      ctx.save(); ctx.translate(228, 858); ctx.rotate(0.4); ctx.fillStyle = '#1b1b1b'; ctx.fillRect(-26, -6, 52, 12); ctx.fillStyle = '#d8d8d8'; ctx.fillRect(-26, -1, 52, 2); ctx.restore();
      stamp(ctx, 202, 903, 91, 85, -0.03);
      clock(ctx, 497, 833, 60);
      // i love you
      sticker(ctx, [[200, 118], [235, 128], [262, 170], [255, 215], [270, 255], [290, 320], [285, 342], [255, 336], [215, 300], [198, 262], [205, 215], [195, 170]], '#efe3c9');
      txt(ctx, 'i love you', 241, 232, `800 46px ${SERIF}`, '#b21a2e', { rot: 1.2 });
      lips(ctx, 523, 98, 44, '#c43448', -0.1, '#fff');
      waxSeal(ctx, 513, 301, 33, '#8f1426', '#b83040', '#580a14');
      flower(ctx, 381, 326, 38, '#a8324a', '#6b1423', '#f2c6c8', 0.2);
      // label
      ctx.save(); ctx.translate(476, 361); ctx.rotate(0.02); sh(ctx, 4, 2, 0.3);
      ctx.beginPath(); ctx.roundRect(-91, -16, 182, 32, 16); ctx.fillStyle = '#d3d0cc'; ctx.fill(); ctx.shadowColor = 'transparent';
      ctx.strokeStyle = '#a3243a'; ctx.lineWidth = 2.5; ctx.stroke();
      txt(ctx, "It's me and you. Always.", 0, 0, `italic 15px Georgia, serif`, '#2a2a2a');
      ctx.restore();
      // heart + pin
      ctx.save(); sh(ctx, 5, 3, 0.35); heartPath(ctx, 505, 585, 48); ctx.fillStyle = '#c01f2e'; ctx.fill(); ctx.restore();
      ctx.save(); heartPath(ctx, 505, 585, 48); ctx.clip();
      const r = rng(8); for (let i = 0; i < 260; i++) { ctx.fillStyle = r() < 0.5 ? 'rgba(255,170,170,.55)' : 'rgba(90,0,10,.4)'; ctx.fillRect(455 + r() * 100, 535 + r() * 100, 2, 2); } ctx.restore();
      ctx.save(); heartPath(ctx, 505, 585, 48); ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 2.5; ctx.stroke(); ctx.restore();
      safetyPin(ctx, 450, 578, 120, -0.03);
      // favorite person
      sticker(ctx, [[205, 572], [236, 566], [300, 570], [350, 575], [346, 612], [350, 640], [300, 646], [240, 640], [208, 645]], '#efe3c9');
      txt(ctx, 'Favorite', 257, 590, `700 31px ${HAND}`, '#b21a2e', { rot: -0.05 });
      txt(ctx, 'person', 280, 622, `700 31px ${HAND}`, '#b21a2e', { rot: -0.03 });
      ctx.strokeStyle = '#b21a2e'; ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(320, 612); ctx.lineTo(336, 612); ctx.lineTo(336, 628); ctx.moveTo(330, 622); ctx.lineTo(336, 630); ctx.lineTo(342, 622); ctx.stroke();
    },
  });

  /* --- Cupid & bows (3 cuts) --- */
  themed.push({
    id: 'snoopy_love', label: 'Cupid & Bows', cuts: 3, crop: [95, 250, 635, 1230],
    ph: '#f1dcdc', ink: '#7a0f20', holeColor: '#fdf7f3',
    slots: [{ x: 228, y: 348, w: 282, h: 222 }, { x: 226, y: 590, w: 284, h: 218 }, { x: 224, y: 830, w: 283, h: 220 }],
    bg(ctx) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 740, 1300); },
    body(ctx, st, d) {
      ctx.save(); sh(ctx, 10, 4, 0.25); ctx.fillStyle = '#7a0f20'; ctx.fillRect(200, 330, 330, 860); ctx.restore();
      paperTex(ctx, 200, 330, 330, 860, '#7a0f20', 31, 0.6);
      fillHoles(ctx, d, null);
    },
    front(ctx, st) {
      const cap = (st.caption || '').trim();
      if (cap) { const f = (n) => `700 ${n}px ${HAND}`; const n = fitSize(ctx, cap, f, 120, 34); txt(ctx, cap, 277, 1152, f(n), '#f4d4d8'); }
      bow(ctx, 218, 345, 72, { fill: '#b01226', hi: '#e0344a', shade: 'rgba(60,0,10,.4)', rot: -0.22 });
      flower(ctx, 528, 327, 68, '#fbf7f2', '#cfc9c4', '#e23a52', 0.3);
      cupidPup(ctx, 205, 625);
      fabricStar(ctx, 535, 590, 58, '#a1182a', '#f2d3d3', 0.1, '#ead3d3');
      plate(ctx, 529, 823, 172, 90, 0.2);
      bouquet(ctx, 105, 962);
      ticket(ctx, 348, 1085, 152, 95, 0.02);
      cake(ctx, 532, 1160);
    },
  });

  /* --- Newspaper & pin (3 cuts) --- */
  themed.push({
    id: 'news_pin', label: 'Newspaper & Pin', cuts: 3, crop: [95, 20, 615, 1180],
    ph: '#f1dcdc', ink: '#7a0f20', holeColor: '#fdf7f3',
    slots: [{ x: 180, y: 127, w: 312, h: 241 }, { x: 181, y: 389, w: 312, h: 241 }, { x: 183, y: 653, w: 312, h: 242 }],
    bg(ctx) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 740, 1300); },
    body(ctx, st, d) {
      ctx.save(); sh(ctx, 10, 4, 0.25); ctx.fillStyle = '#7b0f20'; ctx.fillRect(153, 108, 367, 947); ctx.restore();
      paperTex(ctx, 153, 108, 367, 947, '#7b0f20', 41, 0.5);
      fillHoles(ctx, d, null);
    },
    front(ctx, st) {
      const cap = (st.caption || '').trim();
      if (cap) { const f = (n) => `700 ${n}px ${HAND}`; const n = fitSize(ctx, cap, f, 140, 40); txt(ctx, cap, 442, 926, f(n), '#f4d4d8'); }
      safetyPin(ctx, 108, 243, 120, -0.5);
      fabricStar(ctx, 507, 104, 75, '#b94a50', '#f7e3e3', -1.3, '#efdede');
      const pts = [[158, 683], [192, 690], [205, 730], [200, 770], [238, 800], [262, 850], [290, 880], [325, 925], [320, 960], [342, 985], [365, 1000], [365, 1055], [158, 1055]];
      sticker(ctx, pts, '#efe6cf', () => {
        newsprint(ctx, 158, 683, 210, 372, { paper: '#efe6cf', ink: '#4a4033', seed: 12, cols: 3 });
        const r = rng(2);
        for (let i = 0; i < 20; i++) {
          const x = 165 + r() * 195, y = 700 + r() * 350, s = 7 + r() * 5;
          ctx.fillStyle = '#4f7a3a'; ctx.beginPath(); ctx.ellipse(x + s, y + 2, s * 0.9, s * 0.4, 0.6, 0, TAU); ctx.fill();
          rose(ctx, x, y, s);
        }
        for (let i = 0; i < 6; i++) bow(ctx, 170 + r() * 190, 720 + r() * 320, 5, { fill: '#b01226', shade: 'rgba(0,0,0,.3)' });
      });
      bow(ctx, 503, 1050, 82, { fill: gingham(ctx, '#d1162f', '#fff', 11), shade: 'rgba(60,0,10,.35)', rot: 0.35 });
    },
  });

  /* --- Film camera (4 cuts) --- */
  themed.push({
    id: 'camera', label: 'Film Camera', cuts: 4, crop: [150, 205, 520, 1185],
    ph: '#eeeeee', ink: '#333', holeColor: '#ffffff',
    slots: [{ x: 237, y: 460, w: 195, h: 162 }, { x: 237, y: 640, w: 195, h: 157 }, { x: 237, y: 817, w: 195, h: 158 }, { x: 237, y: 995, w: 195, h: 165 }],
    bg(ctx) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 680, 1200); },
    body(ctx, st, d) {
      ctx.fillStyle = '#111'; ctx.fillRect(200, 450, 268, 725);
      ctx.fillStyle = '#fff';
      for (let y = 462; y < 1160; y += 30.5) {
        ctx.beginPath(); ctx.roundRect(207, y, 22, 18, 3); ctx.fill();
        ctx.beginPath(); ctx.roundRect(440, y, 22, 18, 3); ctx.fill();
      }
      fillHoles(ctx, d, null);
    },
    front(ctx) {
      const rr = rng(6);
      ctx.save(); sh(ctx, 8, 4, 0.3);
      ctx.fillStyle = '#1a1a1a'; ctx.beginPath(); ctx.roundRect(172, 300, 328, 130, 6); ctx.fill(); ctx.restore();
      ctx.fillStyle = '#f0f0f0'; ctx.fillRect(172, 304, 328, 4);
      for (let i = 0; i < 380; i++) { ctx.fillStyle = rr() < 0.5 ? 'rgba(255,255,255,.35)' : 'rgba(120,120,120,.4)'; ctx.fillRect(176 + rr() * 320, 312 + rr() * 106, 1.5, 1.5); }
      // prism + dials
      ctx.fillStyle = lin(ctx, 0, 230, 0, 265, [[0, '#e9e9e9'], [1, '#8a8a8a']]); poly(ctx, [[290, 264], [298, 230], [385, 230], [404, 264]]); ctx.fill();
      ctx.fillStyle = '#7d7d7d'; ctx.fillRect(306, 238, 70, 18); ctx.fillStyle = '#d8d8d8'; ctx.fillRect(309, 241, 64, 12);
      ctx.fillStyle = lin(ctx, 0, 238, 0, 266, [[0, '#f2f2f2'], [1, '#7a7a7a']]); ctx.beginPath(); ctx.roundRect(203, 240, 56, 26, 4); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,.35)'; for (let x = 208; x < 258; x += 4) { ctx.beginPath(); ctx.moveTo(x, 242); ctx.lineTo(x, 264); ctx.stroke(); }
      ctx.fillStyle = lin(ctx, 0, 226, 0, 266, [[0, '#4a4a4a'], [1, '#161616']]); ctx.beginPath(); ctx.roundRect(430, 226, 62, 40, 5); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.35)'; for (let x = 434; x < 490; x += 4) { ctx.beginPath(); ctx.moveTo(x, 242); ctx.lineTo(x, 264); ctx.stroke(); }
      txt(ctx, 'AUTO', 461, 234, `700 8px ${SANS}`, '#ddd');
      // plates
      ctx.fillStyle = lin(ctx, 0, 262, 0, 308, [[0, '#f0f0f0'], [0.5, '#c9c9c9'], [1, '#8d8d8d']]); ctx.beginPath(); ctx.roundRect(172, 262, 328, 44, 5); ctx.fill();
      ctx.fillStyle = lin(ctx, 0, 418, 0, 452, [[0, '#d9d9d9'], [1, '#6f6f6f']]); ctx.beginPath(); ctx.roundRect(172, 418, 328, 32, 5); ctx.fill();
      ctx.fillStyle = '#6f6f6f'; [[240, 291], [415, 293], [200, 436], [472, 436]].forEach(([x, y]) => { ctx.beginPath(); ctx.arc(x, y, 6, 0, TAU); ctx.fill(); ctx.fillStyle = '#d6d6d6'; ctx.beginPath(); ctx.arc(x - 1, y - 1, 3, 0, TAU); ctx.fill(); ctx.fillStyle = '#6f6f6f'; });
      // lens mount + lens
      ctx.fillStyle = lin(ctx, 0, 268, 0, 420, [[0, '#e8e8e8'], [1, '#8a8a8a']]); ctx.beginPath(); ctx.roundRect(274, 268, 142, 152, 8); ctx.fill();
      [[75, '#1d1d1d'], [68, '#b5b5b5'], [62, '#161616'], [52, '#3c3c3c'], [42, '#0f0f0f']].forEach(([r, c]) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(345, 345, r, 0, TAU); ctx.fill(); });
      ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 1; for (let a = 0; a < TAU; a += 0.12) { ctx.beginPath(); ctx.moveTo(345 + Math.cos(a) * 63, 345 + Math.sin(a) * 63); ctx.lineTo(345 + Math.cos(a) * 67, 345 + Math.sin(a) * 67); ctx.stroke(); }
      const g = ctx.createRadialGradient(335, 335, 2, 345, 345, 36);
      g.addColorStop(0, '#f4f4f4'); g.addColorStop(0.4, '#9fb0bd'); g.addColorStop(1, '#1b2630'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(345, 345, 34, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.beginPath(); ctx.ellipse(334, 333, 9, 5, -0.7, 0, TAU); ctx.fill();
      // lever
      ctx.fillStyle = lin(ctx, 438, 0, 458, 0, [[0, '#f3f3f3'], [1, '#8a8a8a']]); ctx.beginPath(); ctx.roundRect(440, 312, 16, 66, 8); ctx.fill();
      ctx.fillStyle = '#1b1b1b'; ctx.beginPath(); ctx.ellipse(448, 366, 5, 9, 0, 0, TAU); ctx.fill();
    },
  });

  /* --- Disco pink (3 cuts, tilted strip) --- */
  themed.push({
    id: 'disco_pink', label: 'Disco Pink', cuts: 3, crop: [80, 0, 690, 1290],
    rot: { cx: 380, cy: 640, a: 0.15 },
    ph: '#f6e6ea', ink: '#c0415a', holeColor: '#ffffff',
    slots: [{ x: 215, y: 120, w: 300, h: 300 }, { x: 215, y: 465, w: 300, h: 300 }, { x: 215, y: 810, w: 300, h: 300 }],
    bg(ctx) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 740, 1300); },
    body(ctx, st, d) {
      ctx.save(); sh(ctx, 10, 4, 0.2); ctx.fillStyle = '#f3c9cf'; ctx.fillRect(188, 88, 354, 1104); ctx.restore();
      ctx.fillStyle = lin(ctx, 190, 0, 540, 0, [[0, '#f4f4f5'], [1, '#e6e6e8']]); ctx.fillRect(191, 91, 348, 1098);
      d.slots.forEach((s) => {
        ctx.fillStyle = lin(ctx, s.x, s.y, s.x + 10, s.y + s.h, [[0, '#b9b9bd'], [0.15, '#e4e4e6'], [1, '#f0f0f1']]);
        ctx.fillRect(s.x - 7, s.y - 7, s.w + 14, s.h + 14);
        ctx.fillStyle = d.holeColor; ctx.fillRect(s.x, s.y, s.w, s.h);
      });
    },
    front(ctx) {
      // silver stars
      ctx.save(); ctx.strokeStyle = '#9aa0a6'; ctx.lineWidth = 3; ctx.lineJoin = 'round';
      starPath(ctx, 532, 72, 40, 18, 5, -1.3); ctx.stroke(); starPath(ctx, 532, 72, 30, 13, 5, -1.3); ctx.strokeStyle = '#d4d8dc'; ctx.lineWidth = 2; ctx.stroke(); ctx.restore();
      ctx.save(); ctx.lineJoin = 'round'; sh(ctx, 5, 3, 0.3); starPath(ctx, 622, 120, 54, 25, 5, -1.25);
      ctx.fillStyle = '#c3c6c9'; ctx.strokeStyle = '#e9ebec'; ctx.lineWidth = 6; ctx.fill(); ctx.stroke(); ctx.restore();
      ctx.save(); starPath(ctx, 622, 120, 54, 25, 5, -1.25); ctx.clip(); const r = rng(14);
      for (let i = 0; i < 260; i++) { ctx.fillStyle = r() < 0.5 ? 'rgba(255,255,255,.85)' : 'rgba(110,115,120,.5)'; ctx.fillRect(565 + r() * 115, 65 + r() * 110, 2, 2); } ctx.restore();
      bow(ctx, 303, 92, 83, { fill: '#f1a9b8', hi: '#fbdde3', shade: 'rgba(160,60,80,.35)', rot: -0.12 });
      bow(ctx, 452, 1190, 80, { fill: '#f1a9b8', hi: '#fbdde3', shade: 'rgba(160,60,80,.35)', rot: 0.28 });
      bow(ctx, 198, 380, 50, { fill: gingham(ctx, '#4a5d2a', '#f0f0e0', 9), shade: 'rgba(30,45,15,.4)', rot: -0.35 });
      lips(ctx, 230, 457, 40, '#c4182c', -0.5, '#fff');
      lips(ctx, 195, 497, 40, '#c4182c', 0.4, '#fff');
      disco(ctx, 607, 440, 55);
      fabricStar(ctx, 578, 410, 30, '#46699f', '#b9cdea', -1.3, '#d7e2f2');
      [[640, 390, 11], [551, 445, 6], [633, 485, 13], [657, 492, 6]].forEach(([x, y, R]) => { ctx.save(); ctx.lineJoin = 'round'; starPath(ctx, x, y, R, R * 0.5); ctx.fillStyle = '#c4182c'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.fill(); ctx.stroke(); ctx.restore(); });
      starfish(ctx, 580, 537, 44, '#4fb3c0');
      fabricStar(ctx, 190, 722, 24, '#3f5f97', '#b9cdea', -1.3, '#d7e2f2');
      fabricStar(ctx, 205, 765, 17, '#6f93c8', '#e0eaf7', -1.3, '#e6eef8');
      strawberry(ctx, 541, 772, 37);
      fabricStar(ctx, 162, 1130, 80, '#31528c', '#9fb4d6', -1.2, '#c4d2e8');
      ctx.save(); sh(ctx, 3, 2, 0.25); heartPath(ctx, 320, 1145, 24); ctx.fillStyle = gingham(ctx, '#d1162f', '#fff', 6); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5; ctx.stroke(); ctx.restore();
    },
  });

  /* --- Love letter & gingham (2 cuts) --- */
  themed.push({
    id: 'letter_check', label: 'Love Letter', cuts: 2, crop: [130, 330, 620, 1070],
    ph: '#f4ecd2', ink: '#80202a', holeColor: '#ffffff',
    slots: [{ x: 203, y: 422, w: 309, h: 228 }, { x: 205, y: 680, w: 307, h: 228 }],
    bg(ctx) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 740, 1300); },
    body(ctx, st, d) {
      ctx.save(); sh(ctx, 6, 3, 0.25); ctx.fillStyle = gingham(ctx, '#b5182a', '#f3e8d8', 13); ctx.fillRect(153, 348, 330, 519); ctx.restore();
      ctx.save(); sh(ctx, 6, 3, 0.25); ctx.fillStyle = '#e6bf78'; ctx.fillRect(300, 523, 298, 530); ctx.restore();
      paperTex(ctx, 300, 523, 298, 530, '#e6bf78', 51, 0.8);
      ctx.save(); ctx.beginPath(); ctx.rect(300, 523, 298, 530); ctx.clip();
      for (let i = 0; i < 17; i++) txt(ctx, 'I love you. I love you. I love you. I love you.', 292 + (i % 2) * -38, 540 + i * 31, `500 27px ${HAND}`, '#2a2118', { align: 'left' });
      ctx.restore();
      ctx.save(); sh(ctx, 8, 4, 0.3); ctx.fillStyle = '#efe0b2'; ctx.fillRect(180, 372, 360, 643); ctx.restore();
      paperTex(ctx, 180, 372, 360, 643, '#efe0b2', 61, 1.6);
      d.slots.forEach((s) => { ctx.fillStyle = '#cdbb86'; ctx.fillRect(s.x - 2, s.y - 2, s.w + 4, s.h + 4); ctx.fillStyle = d.holeColor; ctx.fillRect(s.x, s.y, s.w, s.h); });
    },
    front(ctx) {
      safetyPin(ctx, 153, 447, 170, -0.4);
      chromeStar(ctx, 185, 668, 40, -1.2);
      bow(ctx, 503, 438, 50, { fill: '#b01226', hi: '#e0344a', shade: 'rgba(60,0,10,.4)', rot: 0.2 });
      ctx.save(); sh(ctx, 3, 2, 0.3); heartPath(ctx, 497, 890, 40); ctx.fillStyle = '#7e1220'; ctx.fill(); ctx.restore();
      ctx.save(); heartPath(ctx, 497, 890, 40); ctx.clip(); ctx.strokeStyle = 'rgba(255,190,190,.28)'; ctx.lineWidth = 1.4;
      for (let i = 4; i < 42; i += 4) { ctx.beginPath(); ctx.ellipse(497, 890, i * 0.9, i * 0.75, 0.2, 0, TAU); ctx.stroke(); } ctx.restore();
    },
  });

  /* --- Classic strips (choose 1–8 cuts) --- */
  const CLASSICS = [
    { id: 'classic', label: 'Clean Pastel', bg: '#FFFDF9', ink: '#ff5c8a', line: '#ffb3c6', ph: '#ffeef2' },
    { id: 'film_noir', label: 'Classic Film Roll', bg: '#1a1a1a', ink: '#e0e0e0', line: '#404040', ph: '#2a2a2a', sprockets: true },
    { id: 'cherry_blush', label: 'Cherry Milk', bg: '#FFF0F3', ink: '#C9184A', line: '#FFB3C6', ph: '#ffe0e7' },
    { id: 'lavender_dream', label: 'Lilac Stardust', bg: '#F3EEFF', ink: '#7B2CBF', line: '#D8BBFF', ph: '#e6dcff' },
    { id: 'matcha_pantry', label: 'Matcha Journal', bg: '#F2F7F4', ink: '#2D6A4F', line: '#B7E4C7', ph: '#dcefe3' },
    { id: 'golden_hour', label: 'Golden Hour', bg: '#FFF9EC', ink: '#BC6C25', line: '#f3c98b', ph: '#fbe9c8' },
    { id: 'teddy_hug', label: 'Bear Hug', bg: '#FAF0E6', ink: '#8C6239', line: '#D4A373', ph: '#f0dcc4' },
    { id: 'midnight_star', label: 'Midnight Starlight', bg: '#101820', ink: '#FEE715', line: '#303840', ph: '#222c36', stars: true },
  ];

  function classicLayout(count) {
    const W = 600, pad = 36, photoW = W - pad * 2, photoH = count > 4 ? 300 : 396;
    const headerH = 110, footerH = 70, gap = 20;
    const H = headerH + count * photoH + (count - 1) * gap + footerH + pad * 2;
    const slots = [];
    for (let i = 0; i < count; i++) slots.push({ x: pad, y: pad + headerH + i * (photoH + gap), w: photoW, h: photoH });
    return { W, H, slots };
  }

  const classics = CLASSICS.map((c) => ({
    ...c, themed: false,
    draw(ctx, st) {
      const L = classicLayout(st.count);
      ctx.fillStyle = c.bg; ctx.fillRect(0, 0, L.W, L.H);
      if (c.stars) { const r = rng(3); ctx.fillStyle = 'rgba(254,231,21,.7)'; for (let i = 0; i < 40; i++) { starPath(ctx, r() * L.W, r() * L.H, 2 + r() * 4, 1, 4); ctx.fill(); } }
      if (c.sprockets) { ctx.fillStyle = '#e8e8e8'; for (let y = 14; y < L.H - 14; y += 30) { ctx.beginPath(); ctx.roundRect(10, y, 14, 18, 3); ctx.fill(); ctx.beginPath(); ctx.roundRect(L.W - 24, y, 14, 18, 3); ctx.fill(); } }
      txt(ctx, 'Aura Studio', L.W / 2, 72, `italic 700 32px ${SERIF}`, c.ink);
      const sub = (st.caption || '').trim() || new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
      txt(ctx, sub, L.W / 2, 106, `600 28px ${HAND}`, c.ink);
      L.slots.forEach((s, i) => paintSlot(ctx, s, i, st, c.ph, c.ink, c.line, 18));
      txt(ctx, 'photobooth strip', L.W / 2, L.H - 36, `600 15px ${SERIF}`, c.ink);
    },
    size(st) { const L = classicLayout(st.count); return { W: L.W, H: L.H }; },
  }));

  const ORDER = ['star_spiral', 'wine_seal', 'story_love', 'snoopy_love', 'news_pin', 'camera', 'disco_pink', 'letter_check'];
  themed.forEach((t) => { t.themed = true; t.size = () => ({ W: t.crop[2] - t.crop[0], H: t.crop[3] - t.crop[1] }); });
  themed.sort((a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id));
  const designs = [...themed, ...classics];
  const designById = (id) => designs.find((d) => d.id === id) || designs[0];

  /* ---------------------------------------------------------------------
     5. RENDERER
     --------------------------------------------------------------------- */
  function applyShapePath(ctx, shape, x, y, w, h, radius) {
    if (shape === 'heart') {
      const cx = x + w / 2, cy = y + h / 2, size = Math.min(w, h) * 0.52;
      ctx.moveTo(cx, cy + size * 0.7);
      ctx.bezierCurveTo(cx - size * 1.6, cy + size * 0.1, cx - size * 1.2, cy - size * 1.1, cx, cy - size * 0.3);
      ctx.bezierCurveTo(cx + size * 1.2, cy - size * 1.1, cx + size * 1.6, cy + size * 0.1, cx, cy + size * 0.7);
    } else if (shape === 'circle') {
      ctx.arc(x + w / 2, y + h / 2, Math.min(w, h) / 2, 0, TAU);
    } else if (shape === 'pill') {
      ctx.roundRect(x, y, w, h, Math.min(w, h) / 2);
    } else if (shape === 'scallop') {
      ctx.roundRect(x, y, w, h, 35);
    } else if (shape === 'star') {
      const cx = x + w / 2, cy = y + h / 2, R = Math.min(w, h) / 2;
      let rot = (Math.PI / 2) * 3; const step = Math.PI / 5;
      ctx.moveTo(cx, cy - R);
      for (let i = 0; i < 5; i++) {
        ctx.lineTo(cx + Math.cos(rot) * R, cy + Math.sin(rot) * R); rot += step;
        ctx.lineTo(cx + Math.cos(rot) * R * 0.5, cy + Math.sin(rot) * R * 0.5); rot += step;
      }
      ctx.closePath();
    } else {
      ctx.roundRect(x, y, w, h, radius);
    }
  }

  function drawCover(ctx, img, x, y, w, h) {
    const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    const scale = Math.max(w / iw, h / ih), rw = iw * scale, rh = ih * scale;
    ctx.drawImage(img, x + (w - rw) / 2, y + (h - rh) / 2, rw, rh);
  }

  function paintSlot(ctx, s, i, st, ph, ink, line, radius) {
    const img = st.photos && st.photos[i];
    ctx.save(); ctx.beginPath(); applyShapePath(ctx, st.shape, s.x, s.y, s.w, s.h, radius); ctx.clip();
    if (img) drawCover(ctx, img, s.x, s.y, s.w, s.h);
    else {
      ctx.fillStyle = ph; ctx.fillRect(s.x, s.y, s.w, s.h);
      if (!st.thumb) txt(ctx, `Pose ${i + 1}`, s.x + s.w / 2, s.y + s.h / 2, `600 ${Math.min(30, s.h * 0.12)}px ${SERIF}`, ink);
    }
    ctx.restore();
    if (line) { ctx.save(); ctx.strokeStyle = line; ctx.lineWidth = 3; ctx.beginPath(); applyShapePath(ctx, st.shape, s.x, s.y, s.w, s.h, radius); ctx.stroke(); ctx.restore(); }
  }

  /* Draw design `d` at 1:1 design units onto ctx (caller sets scale + clears). */
  function renderDesign(ctx, d, st) {
    ctx.save();
    ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'start';
    if (!d.themed) { d.draw(ctx, st); ctx.restore(); return; }
    const [x0, y0, x1, y1] = d.crop;
    ctx.translate(-x0, -y0);
    ctx.beginPath(); ctx.rect(x0, y0, x1 - x0, y1 - y0); ctx.clip();
    d.bg(ctx, st, d);
    ctx.save();
    if (d.rot) { ctx.translate(d.rot.cx, d.rot.cy); ctx.rotate(d.rot.a); ctx.translate(-d.rot.cx, -d.rot.cy); }
    d.body(ctx, st, d);
    d.slots.forEach((s, i) => paintSlot(ctx, s, i, st, d.ph, d.ink, null, 10));
    ctx.restore();
    d.front(ctx, st, d);
    ctx.restore();
  }

  window.AuraStudio = { designs, renderDesign, SCALE };

  /* ---------------------------------------------------------------------
     3 + 6. CAMERA, STATE AND UI
     --------------------------------------------------------------------- */
  const video = $('video');
  const overlayCanvas = $('overlayCanvas');
  const ctxOverlay = overlayCanvas ? overlayCanvas.getContext('2d') : null;
  const stripCanvas = $('stripCanvas');
  const ctxStrip = stripCanvas ? stripCanvas.getContext('2d') : null;
  const startBtn = $('startBtn');
  const retakeBtn = $('retakeBtn');
  const downloadBtn = $('downloadBtn');
  const printBtn = $('printBtn');
  const countdownEl = $('countdown');
  const flashEl = $('flash');
  const captionInput = $('captionInput');
  const stripNote = $('stripNote');
  const cutNote = $('cutNote');

  const state = { count: 3, lastClassicCount: 4, shape: 'rounded', frame: 'story_love', sticker: 'none', filter: 'none', photos: [] };
  let cameraStarted = false, animating = false, busy = false;

  /* ----- views + contact ----- */
  const views = { home: $('homeView'), booth: $('boothView') };
  function showView(name) {
    Object.entries(views).forEach(([k, el]) => el && el.classList.toggle('hidden', k !== name));
    document.querySelectorAll('[data-nav]').forEach((b) => b.classList.toggle('active', b.dataset.nav === name));
    window.scrollTo({ top: 0 });
    if (name === 'booth') { if (!cameraStarted) { cameraStarted = true; initCamera(); } refreshPreview(); }
  }
  document.querySelectorAll('[data-nav]').forEach((b) => b.addEventListener('click', () => showView(b.dataset.nav)));
  document.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => showView(b.dataset.go)));

  const dialog = $('contactDialog');
  const copyBtn = $('copyNumber');
  function openContact() {
    if (!dialog) return;
    if (typeof dialog.showModal === 'function') { if (!dialog.open) dialog.showModal(); } else dialog.setAttribute('open', '');
  }
  function closeContact() { if (!dialog) return; if (typeof dialog.close === 'function') dialog.close(); else dialog.removeAttribute('open'); }
  document.querySelectorAll('[data-contact]').forEach((b) => b.addEventListener('click', openContact));
  document.querySelectorAll('[data-close-contact]').forEach((b) => b.addEventListener('click', closeContact));
  if (dialog) dialog.addEventListener('click', (e) => { if (e.target === dialog) closeContact(); });
  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(PHONE); }
      catch (e) { const t = document.createElement('textarea'); t.value = PHONE; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); }
      copyBtn.textContent = 'Copied';
      setTimeout(() => { copyBtn.textContent = 'Copy number'; }, 1600);
    });
  }

  /* ----- camera ----- */
  async function initCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
      if (video) {
        video.srcObject = stream;
        video.play();
        video.onloadedmetadata = () => {
          if (overlayCanvas) { overlayCanvas.width = video.videoWidth || 640; overlayCanvas.height = video.videoHeight || 480; }
          startStickerAnimation();
        };
      }
    } catch (err) {
      console.error('Camera access error:', err);
      const msg = $('cameraMsg');
      if (msg) { msg.textContent = 'Camera is blocked. Allow camera access in your browser settings, then reload.'; msg.classList.remove('hidden'); }
      cameraStarted = false;
    }
  }

  function startStickerAnimation() {
    if (!ctxOverlay || animating) return;
    animating = true;
    const loop = () => {
      ctxOverlay.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
      if (state.sticker !== 'none') {
        ctxOverlay.save(); ctxOverlay.font = '72px sans-serif'; ctxOverlay.textAlign = 'center';
        const cx = overlayCanvas.width / 2, cy = overlayCanvas.height / 2 - 80, s = state.sticker;
        if (s === 'cat') { ctxOverlay.fillText('🐱', cx - 110, cy - 60); ctxOverlay.fillText('🐱', cx + 110, cy - 60); }
        else if (s === 'bunny') { ctxOverlay.fillText('🐰', cx - 100, cy - 90); ctxOverlay.fillText('🐰', cx + 100, cy - 90); }
        else if (s === 'bear') { ctxOverlay.fillText('🧸', cx - 110, cy - 80); ctxOverlay.fillText('🧸', cx + 110, cy - 80); }
        else if (s === 'blush') { ctxOverlay.font = '50px sans-serif'; ctxOverlay.fillText('🌸', cx - 90, cy + 30); ctxOverlay.fillText('🌸', cx + 90, cy + 30); }
        else if (s === 'crown') ctxOverlay.fillText('👑', cx, cy - 110);
        else if (s === 'bow') ctxOverlay.fillText('🎀', cx + 80, cy - 90);
        else if (s === 'sparkles') {
          const t = Date.now() / 300; ctxOverlay.font = '45px sans-serif';
          ctxOverlay.fillText('✨', cx - 120 + Math.sin(t) * 15, cy - 50);
          ctxOverlay.fillText('⭐', cx + 120 + Math.cos(t) * 15, cy - 20);
          ctxOverlay.fillText('💖', cx, cy - 120);
        }
        ctxOverlay.restore();
      }
      requestAnimationFrame(loop);
    };
    loop();
  }

  const TINTS = {
    peach: 'rgba(255,160,122,.18)', strawberry: 'rgba(255,105,180,.18)', dreamy: 'rgba(186,150,255,.22)',
    mint: 'rgba(135,235,190,.16)', sunset: 'rgba(255,180,50,.18)', vintage: 'rgba(120,80,40,.2)',
  };

  function takeSnap() {
    if (!video || !video.videoWidth) return false;
    const c = document.createElement('canvas');
    c.width = video.videoWidth; c.height = video.videoHeight;
    const g = c.getContext('2d');
    g.save(); g.scale(-1, 1); g.drawImage(video, -c.width, 0, c.width, c.height); g.restore();
    if (TINTS[state.filter]) { g.fillStyle = TINTS[state.filter]; g.fillRect(0, 0, c.width, c.height); }
    else if (state.filter === 'bw') {
      const im = g.getImageData(0, 0, c.width, c.height), p = im.data;
      for (let i = 0; i < p.length; i += 4) { let v = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2]; v = Math.max(0, Math.min(255, (v - 128) * 1.1 + 128)); p[i] = p[i + 1] = p[i + 2] = v; }
      g.putImageData(im, 0, 0);
    }
    state.photos.push(c);
    return true;
  }

  function runCountdown() {
    return new Promise((resolve) => {
      let n = 3;
      if (countdownEl) { countdownEl.textContent = n; countdownEl.classList.remove('hidden'); }
      const timer = setInterval(() => {
        n--;
        if (n > 0) { if (countdownEl) countdownEl.textContent = n; }
        else {
          clearInterval(timer);
          if (countdownEl) countdownEl.classList.add('hidden');
          if (flashEl) { flashEl.classList.add('active'); setTimeout(() => flashEl.classList.remove('active'), 200); }
          resolve();
        }
      }, 1000);
    });
  }

  if (startBtn) {
    startBtn.addEventListener('click', async () => {
      if (busy) return;
      if (!video || !video.videoWidth) { const m = $('cameraMsg'); if (m) { m.textContent = 'Waiting for the camera. Allow access if your browser asks.'; m.classList.remove('hidden'); } return; }
      busy = true;
      const m = $('cameraMsg'); if (m) m.classList.add('hidden');
      startBtn.classList.add('hidden'); state.photos = [];
      const n = state.count;
      for (let i = 0; i < n; i++) { await runCountdown(); takeSnap(); refreshPreview(); }
      busy = false;
      if (retakeBtn) retakeBtn.classList.remove('hidden');
      if (downloadBtn) downloadBtn.disabled = false;
      if (printBtn) printBtn.disabled = false;
      refreshPreview();
    });
  }
  if (retakeBtn) {
    retakeBtn.addEventListener('click', () => {
      state.photos = [];
      retakeBtn.classList.add('hidden'); if (startBtn) startBtn.classList.remove('hidden');
      if (downloadBtn) downloadBtn.disabled = true;
      if (printBtn) printBtn.disabled = true;
      refreshPreview();
    });
  }

  /* ----- preview ----- */
  function refreshPreview() {
    if (!stripCanvas || !ctxStrip) return;
    const d = designById(state.frame);
    const { W, H } = d.size(state);
    stripCanvas.width = Math.round(W * SCALE); stripCanvas.height = Math.round(H * SCALE);
    ctxStrip.setTransform(SCALE, 0, 0, SCALE, 0, 0);
    ctxStrip.clearRect(0, 0, W, H);
    renderDesign(ctxStrip, d, { photos: state.photos, count: state.count, shape: state.shape, caption: captionInput ? captionInput.value : '' });
    if (stripNote) {
      const taken = state.photos.length;
      if (taken && taken < state.count) stripNote.textContent = `This frame has ${state.count} cuts but you took ${taken}. Tap Retake to fill every cut.`;
      else if (taken > state.count) stripNote.textContent = `Showing the first ${state.count} of your ${taken} photos.`;
      else stripNote.textContent = '';
    }
  }

  function drawThumb(canvas, d) {
    const probe = { count: 3, shape: 'rounded', photos: [], thumb: true, caption: '' };
    const { W, H } = d.size(probe);
    const th = 220, k = th / H;
    canvas.height = th; canvas.width = Math.max(1, Math.round(W * k));
    const g = canvas.getContext('2d');
    g.setTransform(k, 0, 0, k, 0, 0);
    renderDesign(g, d, probe);
  }

  /* ----- controls ----- */
  const countGroup = $('frameCountGroup');
  function syncCountPills() {
    const d = designById(state.frame);
    if (!countGroup) return;
    countGroup.querySelectorAll('.pill').forEach((b) => {
      b.classList.toggle('active', parseInt(b.dataset.count, 10) === state.count);
      b.disabled = d.themed;
    });
    if (cutNote) cutNote.textContent = d.themed ? `This frame is built for ${d.cuts} ${d.cuts === 1 ? 'cut' : 'cuts'}, so the count is set for you.` : '';
  }

  function setFrame(id) {
    const prev = designById(state.frame);
    if (!prev.themed) state.lastClassicCount = state.count;
    state.frame = id;
    const d = designById(id);
    state.count = d.themed ? d.cuts : state.lastClassicCount;
    document.querySelectorAll('.frame-tile').forEach((t) => t.classList.toggle('active', t.dataset.frame === id));
    syncCountPills(); refreshPreview();
  }

  if (countGroup) {
    countGroup.querySelectorAll('.pill').forEach((b) => b.addEventListener('click', () => {
      if (designById(state.frame).themed) return;
      state.count = parseInt(b.dataset.count, 10); state.lastClassicCount = state.count;
      syncCountPills(); refreshPreview();
    }));
  }

  function bindPills(id, key) {
    const el = $(id); if (!el) return;
    el.querySelectorAll('.pill').forEach((b) => b.addEventListener('click', () => {
      el.querySelectorAll('.pill').forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
      state[key] = b.dataset[key === 'shape' ? 'shape' : key];
      refreshPreview();
    }));
  }
  bindPills('shapeGroup', 'shape');
  bindPills('stickerGroup', 'sticker');
  bindPills('filterGroup', 'filter');
  if (captionInput) captionInput.addEventListener('input', refreshPreview);

  const frameGroup = $('frameDesignGroup');
  function buildTiles() {
    if (!frameGroup) return;
    frameGroup.innerHTML = '';
    designs.forEach((d) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'frame-tile'; b.dataset.frame = d.id;
      const c = document.createElement('canvas'); c.setAttribute('aria-hidden', 'true');
      const s1 = document.createElement('span'); s1.className = 'tile-name'; s1.textContent = d.label;
      const s2 = document.createElement('span'); s2.className = 'tile-meta'; s2.textContent = d.themed ? `${d.cuts} ${d.cuts === 1 ? 'cut' : 'cuts'}` : '1–8 cuts';
      b.append(c, s1, s2);
      b.addEventListener('click', () => setFrame(d.id));
      frameGroup.appendChild(b);
      drawThumb(c, d);
    });
    frameGroup.querySelectorAll('.frame-tile').forEach((t) => t.classList.toggle('active', t.dataset.frame === state.frame));
  }

  function drawHeroSamples() {
    [['heroStripA', 'story_love'], ['heroStripB', 'letter_check']].forEach(([id, frame]) => {
      const c = $(id); if (!c) return;
      const d = designById(frame), probe = { count: d.cuts || 3, shape: 'rounded', photos: [], thumb: true, caption: '' };
      const { W, H } = d.size(probe);
      c.width = W; c.height = H;
      const g = c.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0);
      renderDesign(g, d, probe);
    });
  }

  /* ----- save + print ----- */
  if (downloadBtn) {
    downloadBtn.addEventListener('click', () => {
      const a = document.createElement('a');
      a.download = `aura-studio-${Date.now()}.png`; a.href = stripCanvas.toDataURL('image/png'); a.click();
    });
  }
  if (printBtn) {
    printBtn.addEventListener('click', () => {
      const url = stripCanvas.toDataURL('image/png');
      const w = window.open('', '_blank');
      if (w) {
        w.document.write(`<html><head><title>Print photo strip</title></head><body style="text-align:center;background:#fff;margin:0;padding:20px"><img src="${url}" style="max-height:95vh" onload="window.print();window.close();"/></body></html>`);
        w.document.close();
      }
    });
  }

  /* ----- boot ----- */
  buildTiles();
  syncCountPills();
  drawHeroSamples();
  refreshPreview();
  if (document.fonts && document.fonts.load) {
    Promise.all([
      document.fonts.load('italic 700 30px Fraunces'), document.fonts.load('600 20px Fraunces'),
      document.fonts.load('800 40px Fraunces'), document.fonts.load('700 30px Caveat'), document.fonts.load('500 27px Caveat'),
    ]).then(() => { buildTiles(); drawHeroSamples(); refreshPreview(); }).catch(() => {});
  }
});