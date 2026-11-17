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

  /* ---- extra primitives for the newer frames ---- */
  function denim(ctx, x, y, w, h, base = '#2f4a6b', seed = 1) {
    const r = rng(seed);
    ctx.save(); ctx.fillStyle = base; ctx.fillRect(x, y, w, h); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    const n = (w * h) / 12;
    for (let i = 0; i < n; i++) { ctx.fillStyle = r() < 0.5 ? 'rgba(255,255,255,.08)' : 'rgba(0,0,25,.14)'; ctx.fillRect(x + r() * w, y + r() * h, 1 + r() * 3, 1); }
    ctx.restore();
  }
  function stitchRect(ctx, x, y, w, h, col = '#c9a46a') { ctx.save(); ctx.setLineDash([5, 4]); ctx.strokeStyle = col; ctx.lineWidth = 1.4; ctx.strokeRect(x, y, w, h); ctx.restore(); }
  function fray(ctx, x, y, w, h, seed = 1) {
    const r = rng(seed);
    ctx.save(); ctx.beginPath(); ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, TAU); ctx.fillStyle = '#b9d0df'; ctx.fill(); ctx.clip();
    for (let i = 0; i < 110; i++) {
      const px = x + r() * w, py = y + r() * h, a = r() * TAU, l = 5 + r() * 16;
      ctx.strokeStyle = r() < 0.6 ? 'rgba(255,255,255,.85)' : 'rgba(70,100,130,.55)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l); ctx.stroke();
    }
    ctx.restore();
  }
  function xPatch(ctx, cx, cy, w, h) {
    ctx.save(); ctx.translate(cx, cy); sh(ctx, 4, 2, 0.35);
    for (const a of [-0.5, 0.5]) {
      ctx.save(); ctx.rotate(a); ctx.fillStyle = '#35527a'; ctx.fillRect(-w / 2, -h / 2, w, h); ctx.shadowColor = 'transparent';
      stitchRect(ctx, -w / 2 + 3, -h / 2 + 3, w - 6, h - 6, '#a9c0da'); ctx.restore();
    }
    ctx.shadowColor = 'transparent';
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sy]) => { ctx.fillStyle = '#d9802b'; ctx.beginPath(); ctx.arc(sx * w * 0.36, sy * h * 1.2, 5, 0, TAU); ctx.fill(); });
    ctx.restore();
  }
  function ransom(ctx, text, cx, cy, size, seed = 4, maxW = 0) {
    const r = rng(seed); if (maxW) size = Math.min(size, maxW / (Math.max(1, [...text].length) * 0.86));
    const pal = [['#1f3a5f', '#fff'], ['#f4f1e8', '#1f3a5f'], ['#3b6a9a', '#fff'], ['#e9e4d6', '#222'], ['#2c4d7c', '#e9f0f8'], ['#9bb8d9', '#1f3a5f']];
    const chars = [...text.toUpperCase()], step = size * 0.86;
    let x = cx - (chars.length * step) / 2 + step / 2;
    chars.forEach((c) => {
      if (c !== ' ') {
        const [bg, fg] = pal[Math.floor(r() * pal.length)];
        ctx.save(); ctx.translate(x, cy + (r() - 0.5) * size * 0.14); ctx.rotate((r() - 0.5) * 0.25); sh(ctx, 3, 2, 0.3);
        ctx.fillStyle = bg; ctx.fillRect(-size * 0.4, -size * 0.5, size * 0.8, size); ctx.shadowColor = 'transparent';
        txt(ctx, c, 0, 2, `${r() < 0.5 ? 800 : 700} ${size * 0.78}px ${r() < 0.5 ? SERIF : SANS}`, fg); ctx.restore();
      }
      x += step;
    });
  }
  function note8(ctx, x, y, s, rot = 0, col = '#111') {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineWidth = s * 0.09; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.ellipse(0, 0, s * 0.3, s * 0.22, -0.4, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.moveTo(s * 0.27, -s * 0.05); ctx.lineTo(s * 0.27, -s); ctx.quadraticCurveTo(s * 0.72, -s * 0.8, s * 0.55, -s * 0.4); ctx.stroke(); ctx.restore();
  }
  function clef(ctx, x, y, s, bass) {
    ctx.save(); ctx.translate(x, y); ctx.strokeStyle = '#111'; ctx.fillStyle = '#111'; ctx.lineCap = 'round'; ctx.lineWidth = s * 0.13;
    if (bass) {
      ctx.beginPath(); ctx.arc(0, 0, s * 0.13, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(s * 0.55, -s * 0.2, s * 0.6, s * 0.45, -s * 0.1, s * 0.95); ctx.stroke();
      ctx.beginPath(); ctx.arc(s * 0.72, -s * 0.05, s * 0.07, 0, TAU); ctx.arc(s * 0.72, s * 0.22, s * 0.07, 0, TAU); ctx.fill();
    } else {
      ctx.beginPath(); ctx.moveTo(s * 0.05, -s); ctx.bezierCurveTo(s * 0.6, -s * 0.6, s * 0.35, -s * 0.1, 0, 0);
      ctx.bezierCurveTo(-s * 0.45, s * 0.15, -s * 0.3, s * 0.65, s * 0.15, s * 0.55); ctx.bezierCurveTo(s * 0.5, s * 0.4, s * 0.25, -s * 0.05, -s * 0.05, s * 0.05);
      ctx.moveTo(s * 0.05, -s * 0.2); ctx.lineTo(0, s * 0.85); ctx.stroke(); ctx.beginPath(); ctx.arc(-s * 0.05, s * 0.88, s * 0.1, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }
  function plush(ctx, cx, cy, s, bowCol) {
    ctx.save(); ctx.translate(cx, cy); sh(ctx, 6, 3, 0.3);
    const fur = '#a67b57', light = '#d9b98f';
    const el = (x, y, rx, ry, f) => { ctx.beginPath(); ctx.ellipse(x * s, y * s, rx * s, ry * s, 0, 0, TAU); ctx.fillStyle = f; ctx.fill(); };
    el(-0.36, 0.66, 0.2, 0.15, fur); el(0.36, 0.66, 0.2, 0.15, fur);
    el(-0.5, 0.18, 0.14, 0.3, fur); el(0.5, 0.18, 0.14, 0.3, fur);
    el(0, 0.22, 0.46, 0.5, fur); ctx.shadowColor = 'transparent'; el(0, 0.3, 0.26, 0.32, light);
    el(-0.34, -0.66, 0.15, 0.15, fur); el(0.34, -0.66, 0.15, 0.15, fur); el(-0.34, -0.66, 0.08, 0.08, light); el(0.34, -0.66, 0.08, 0.08, light);
    el(0, -0.36, 0.42, 0.37, fur); el(0, -0.26, 0.19, 0.15, light); el(0, -0.31, 0.065, 0.045, '#3a2418');
    el(-0.16, -0.42, 0.035, 0.045, '#2a1810'); el(0.16, -0.42, 0.035, 0.045, '#2a1810');
    if (bowCol) bow(ctx, 0.3 * s, -0.7 * s, 0.12 * s, { fill: bowCol });
    ctx.restore();
  }
  function cookie(ctx, cx, cy, r, seed = 1, rot = 0) {
    const rr = rng(seed); ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot); sh(ctx, 5, 3, 0.3);
    ctx.beginPath(); for (let i = 0; i <= 40; i++) { const a = (i / 40) * TAU, q = r * (1 + 0.04 * Math.sin(a * 5 + seed)); i ? ctx.lineTo(Math.cos(a) * q, Math.sin(a) * q) : ctx.moveTo(Math.cos(a) * q, Math.sin(a) * q); }
    ctx.closePath(); ctx.fillStyle = lin(ctx, -r, -r, r, r, [[0, '#d9a05a'], [1, '#b47a3c']]); ctx.fill(); ctx.shadowColor = 'transparent';
    for (let i = 0; i < 9; i++) { ctx.fillStyle = '#4a2a1a'; ctx.beginPath(); ctx.ellipse((rr() - 0.5) * r * 1.3, (rr() - 0.5) * r * 1.3, r * 0.12, r * 0.09, rr() * 3, 0, TAU); ctx.fill(); }
    ctx.restore();
  }
  function macaron(ctx, cx, cy, w, col) {
    ctx.save(); ctx.translate(cx, cy); sh(ctx, 4, 2, 0.3);
    const h = w * 0.3;
    ctx.fillStyle = '#f4e8d6'; ctx.fillRect(-w * 0.45, -h * 0.25, w * 0.9, h * 0.5); ctx.shadowColor = 'transparent';
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.ellipse(0, -h * 0.5, w / 2, h * 0.62, 0, Math.PI, TAU); ctx.fill(); ctx.fillRect(-w / 2, -h * 0.5, w, h * 0.22);
    ctx.beginPath(); ctx.ellipse(0, h * 0.5, w / 2, h * 0.62, 0, 0, Math.PI); ctx.fill(); ctx.fillRect(-w / 2, h * 0.28, w, h * 0.22);
    ctx.restore();
  }
  function catSit(ctx, x, y, s) {
    ctx.save(); ctx.translate(x, y); sh(ctx, 5, 3, 0.4); ctx.fillStyle = '#0d1b2e';
    ctx.beginPath(); ctx.ellipse(0, 0.55 * s, 0.34 * s, 0.45 * s, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(0, 0.2 * s, 0.26 * s, 0.24 * s, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-0.22 * s, 0.05 * s); ctx.lineTo(-0.18 * s, -0.28 * s); ctx.lineTo(-0.02 * s, -0.12 * s); ctx.fill();
    ctx.beginPath(); ctx.moveTo(0.22 * s, 0.05 * s); ctx.lineTo(0.18 * s, -0.28 * s); ctx.lineTo(0.02 * s, -0.12 * s); ctx.fill();
    ctx.lineWidth = s * 0.12; ctx.lineCap = 'round'; ctx.strokeStyle = '#0d1b2e'; ctx.beginPath(); ctx.moveTo(0.3 * s, 0.9 * s); ctx.quadraticCurveTo(0.8 * s, 0.95 * s, 0.7 * s, 0.5 * s); ctx.stroke();
    ctx.shadowColor = 'transparent'; ctx.fillStyle = '#d9b44a';
    [[-0.1, 0.12], [0.1, 0.12]].forEach(([ex, ey]) => { ctx.beginPath(); ctx.ellipse(ex * s, ey * s, 0.035 * s, 0.05 * s, 0, 0, TAU); ctx.fill(); });
    ctx.restore();
  }
  function cassette(ctx, x, y, w, h, rot) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot); sh(ctx, 6, 3, 0.4);
    ctx.beginPath(); ctx.roundRect(-w / 2, -h / 2, w, h, 7); ctx.fillStyle = lin(ctx, -w / 2, -h / 2, w / 2, h / 2, [[0, '#e0323f'], [1, '#8d0f1d']]); ctx.fill(); ctx.shadowColor = 'transparent';
    ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(-w * 0.4, -h * 0.4, w * 0.8, h * 0.22);
    ctx.fillStyle = '#d9d9de'; [-w * 0.2, w * 0.2].forEach((px) => { ctx.beginPath(); ctx.arc(px, h * 0.02, h * 0.17, 0, TAU); ctx.fill(); ctx.fillStyle = '#6a1019'; ctx.beginPath(); ctx.arc(px, h * 0.02, h * 0.07, 0, TAU); ctx.fill(); ctx.fillStyle = '#d9d9de'; });
    ctx.restore();
  }
  function button(ctx, cx, cy, r, col = '#a57d5a') {
    ctx.save(); sh(ctx, 3, 2, 0.3); ctx.fillStyle = lin(ctx, cx - r, cy - r, cx + r, cy + r, [[0, '#c9a07a'], [1, col]]); ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fill(); ctx.shadowColor = 'transparent';
    ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, r * 0.8, 0, TAU); ctx.stroke();
    ctx.strokeStyle = '#f4ead9'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(cx - r * 0.35, cy - r * 0.35); ctx.lineTo(cx + r * 0.35, cy + r * 0.35); ctx.moveTo(cx + r * 0.35, cy - r * 0.35); ctx.lineTo(cx - r * 0.35, cy + r * 0.35); ctx.stroke(); ctx.restore();
  }
  function miniCamera(ctx, x, y, w) {
    const h = w * 0.62; ctx.save(); ctx.translate(x, y); sh(ctx, 4, 2, 0.35);
    ctx.fillStyle = '#1c1c1c'; ctx.beginPath(); ctx.roundRect(0, 0, w, h, 4); ctx.fill(); ctx.shadowColor = 'transparent';
    ctx.fillStyle = '#cfcfcf'; ctx.fillRect(0, 0, w, h * 0.25); ctx.fillStyle = '#8a5a3a'; ctx.fillRect(w * 0.08, h * 0.05, w * 0.2, h * 0.15);
    ctx.fillStyle = '#e8e8e8'; ctx.beginPath(); ctx.arc(w / 2, h * 0.58, h * 0.36, 0, TAU); ctx.fill(); ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(w / 2, h * 0.58, h * 0.26, 0, TAU); ctx.fill();
    ctx.fillStyle = '#6a7a8a'; ctx.beginPath(); ctx.arc(w / 2, h * 0.58, h * 0.14, 0, TAU); ctx.fill(); ctx.restore();
  }
  function kraft(ctx, x, y, w, h, text, size = 15, rot = 0) {
    ctx.save(); ctx.translate(x + w / 2, y + h / 2); ctx.rotate(rot); sh(ctx, 3, 2, 0.3);
    const pts = []; for (let i = 0; i <= 10; i++) pts.push([-w / 2 + (i * w) / 10, -h / 2 + (i % 2 ? 1.5 : -1)]); for (let i = 10; i >= 0; i--) pts.push([-w / 2 + (i * w) / 10, h / 2 + (i % 2 ? -1 : 1.5)]);
    poly(ctx, pts); ctx.fillStyle = '#c6a273'; ctx.fill(); ctx.shadowColor = 'transparent';
    ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fillRect(-w / 2, -h / 2, w, h * 0.35);
    txt(ctx, text, 0, 1, `700 ${size}px "Courier New", monospace`, '#2a1d12'); ctx.restore();
  }
  function lace(ctx, x, y, w, h) {
    ctx.save(); ctx.fillStyle = '#fffdf8'; ctx.fillRect(x, y, w, h); ctx.fillStyle = '#e9dccd';
    for (let i = 0; i < w; i += 9) { ctx.beginPath(); ctx.arc(x + i + 4.5, y + h, 4.5, 0, Math.PI); ctx.fill(); ctx.beginPath(); ctx.arc(x + i + 4.5, y + h * 0.5, 2, 0, TAU); ctx.fill(); }
    ctx.restore();
  }
  function floralBg(ctx, x, y, w, h, seed = 1) {
    const r = rng(seed); ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    for (let i = 0; i < (w * h) / 1500; i++) {
      const px = x + r() * w, py = y + r() * h, s = 3 + r() * 3.5;
      ctx.strokeStyle = '#a9b58b'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + (r() - 0.5) * 14, py + 8 + r() * 8); ctx.stroke();
      ctx.fillStyle = '#b9c6a0'; ctx.beginPath(); ctx.ellipse(px + 5, py + 6, 4, 1.6, 0.6, 0, TAU); ctx.fill();
      ctx.fillStyle = r() < 0.5 ? '#e9a3a3' : '#f0b9b5'; ctx.beginPath(); ctx.arc(px, py, s, 0, TAU); ctx.fill();
      ctx.fillStyle = '#d37c80'; ctx.beginPath(); ctx.arc(px, py, s * 0.4, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }
  function peony(ctx, cx, cy, R, col = '#f1a9b6', dark = '#c9707f') {
    ctx.save(); ctx.translate(cx, cy); sh(ctx, 6, 3, 0.25);
    for (let ring = 3; ring >= 0; ring--) {
      const n = 6 + ring, rr = R * (0.35 + ring * 0.2);
      for (let k = 0; k < n; k++) {
        const a = (k / n) * TAU + ring * 0.5; ctx.fillStyle = ring % 2 ? col : '#f6c3cb';
        ctx.beginPath(); ctx.ellipse(Math.cos(a) * rr * 0.55, Math.sin(a) * rr * 0.55, rr * 0.55, rr * 0.38, a, 0, TAU); ctx.fill();
      }
      ctx.shadowColor = 'transparent';
    }
    ctx.fillStyle = dark; ctx.beginPath(); ctx.arc(0, 0, R * 0.14, 0, TAU); ctx.fill(); ctx.restore();
  }
  function lily(ctx, cx, cy, R, col, rot = 0) {
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot); sh(ctx, 6, 3, 0.25);
    for (let k = 0; k < 6; k++) {
      ctx.save(); ctx.rotate((k * TAU) / 6); ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(R * 0.3, -R * 0.3, R * 0.8, -R * 0.35, R, 0); ctx.bezierCurveTo(R * 0.8, R * 0.35, R * 0.3, R * 0.3, 0, 0);
      ctx.fillStyle = lin(ctx, 0, 0, R, 0, [[0, '#f4e2c4'], [0.35, col], [1, col]]); ctx.fill(); ctx.shadowColor = 'transparent'; ctx.strokeStyle = 'rgba(160,80,110,.4)'; ctx.lineWidth = 1; ctx.stroke(); ctx.restore();
    }
    ctx.strokeStyle = '#d9e2a8'; ctx.lineWidth = 2; for (let k = 0; k < 4; k++) { const a = k * 1.2 + 0.3; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * R * 0.5, Math.sin(a) * R * 0.5); ctx.stroke(); ctx.fillStyle = '#d9a33a'; ctx.beginPath(); ctx.arc(Math.cos(a) * R * 0.5, Math.sin(a) * R * 0.5, 3, 0, TAU); ctx.fill(); }
    ctx.restore();
  }
  function butterfly(ctx, cx, cy, s, rot = 0, col = '#f4e6d2') {
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot); sh(ctx, 4, 2, 0.2); ctx.fillStyle = col; ctx.strokeStyle = 'rgba(120,90,70,.5)'; ctx.lineWidth = 1;
    for (const m of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(m * s * 0.2, -s * 0.9, m * s * 1.1, -s * 0.8, m * s * 0.95, -s * 0.1); ctx.bezierCurveTo(m * s * 0.8, s * 0.1, m * s * 0.3, s * 0.05, 0, 0); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, s * 0.05); ctx.bezierCurveTo(m * s * 0.6, s * 0.1, m * s * 0.7, s * 0.7, m * s * 0.15, s * 0.6); ctx.fill(); ctx.stroke();
    }
    ctx.shadowColor = 'transparent'; ctx.strokeStyle = '#6b4a38'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, -s * 0.2); ctx.lineTo(0, s * 0.5); ctx.stroke(); ctx.restore();
  }
  function jellyfish(ctx, cx, cy, s) {
    ctx.save(); ctx.translate(cx, cy);
    ctx.fillStyle = 'rgba(150,190,230,.85)'; ctx.beginPath(); ctx.ellipse(0, 0, s * 0.5, s * 0.4, 0, Math.PI, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(120,165,215,.8)'; ctx.lineWidth = 2;
    for (let i = -4; i <= 4; i++) { ctx.beginPath(); ctx.moveTo(i * s * 0.1, 0); ctx.bezierCurveTo(i * s * 0.14, s * 0.3, i * s * 0.02, s * 0.5, i * s * 0.1, s * 0.9); ctx.stroke(); }
    ctx.restore();
  }
  function seaShell(ctx, cx, cy, r, col = '#7d8fb8') {
    ctx.save(); ctx.translate(cx, cy); ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(-r * 0.2, r * 0.7); ctx.bezierCurveTo(-r * 1.3, r * 0.1, -r * 0.7, -r * 0.9, 0, -r * 0.9); ctx.bezierCurveTo(r * 0.7, -r * 0.9, r * 1.3, r * 0.1, r * 0.2, r * 0.7); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 1.4; for (let i = -3; i <= 3; i++) { ctx.beginPath(); ctx.moveTo(i * r * 0.03, r * 0.7); ctx.lineTo(i * r * 0.26, -r * 0.8); ctx.stroke(); } ctx.restore();
  }
  function turtle(ctx, cx, cy, s) {
    ctx.save(); ctx.translate(cx, cy); ctx.strokeStyle = '#1f5fa8'; ctx.lineWidth = 2.4; ctx.fillStyle = '#fff';
    [[-0.5, -0.45], [0.5, -0.45], [-0.5, 0.45], [0.5, 0.45]].forEach(([x, y]) => { ctx.beginPath(); ctx.ellipse(x * s, y * s, s * 0.2, s * 0.13, x * y * 2, 0, TAU); ctx.fill(); ctx.stroke(); });
    ctx.beginPath(); ctx.ellipse(0.7 * s, -0.1 * s, s * 0.22, s * 0.17, 0, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#2f68b0'; ctx.beginPath(); ctx.ellipse(0, 0, s * 0.55, s * 0.45, 0, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#9fc0ea'; ctx.lineWidth = 1.5; for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.arc(i * s * 0.25, 0, s * 0.14, 0, TAU); ctx.stroke(); } ctx.restore();
  }
  function wave(ctx, x, y, w, h) {
    ctx.save(); ctx.translate(x, y);
    const g = lin(ctx, 0, 0, w, h, [[0, '#7fc4e8'], [0.5, '#2f7fc2'], [1, '#1b4f9a']]);
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, h); ctx.bezierCurveTo(w * 0.1, h * 0.7, w * 0.35, h * 0.55, w * 0.6, h * 0.45);
    ctx.bezierCurveTo(w * 0.85, h * 0.3, w * 0.95, h * 0.05, w * 0.75, 0); ctx.bezierCurveTo(w * 1.05, h * 0.2, w * 1.0, h * 0.7, w, h); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 2; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(w * (0.35 + i * 0.15), h * (0.7 - i * 0.12), w * 0.08, Math.PI, TAU); ctx.stroke(); } ctx.restore();
  }
  function cloud(ctx, cx, cy, s, fill = '#fff') {
    ctx.save(); ctx.fillStyle = fill; ctx.beginPath();
    [[-0.5, 0.1, 0.32], [-0.15, -0.12, 0.42], [0.25, -0.02, 0.36], [0.55, 0.12, 0.26], [0, 0.18, 0.4]].forEach(([x, y, r]) => { ctx.moveTo(cx + x * s + r * s, cy + y * s); ctx.arc(cx + x * s, cy + y * s, r * s, 0, TAU); });
    ctx.fill(); ctx.restore();
  }
  function moon(ctx, cx, cy, r, col = '#fdeeb3') {
    ctx.save(); ctx.fillStyle = col; ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI * 0.5, Math.PI * 1.5, false); ctx.bezierCurveTo(cx + r * 0.9, cy - r * 0.6, cx + r * 0.9, cy + r * 0.6, cx, cy + r); ctx.fill(); ctx.restore();
  }
  function sparkle(ctx, x, y, r, col = '#fff') { ctx.save(); ctx.fillStyle = col; starPath(ctx, x, y, r, r * 0.22, 4, -Math.PI / 2); ctx.fill(); ctx.restore(); }
  function mushroom(ctx, cx, cy, s, cap = '#d63b3b') {
    ctx.save(); ctx.translate(cx, cy); sh(ctx, 4, 2, 0.35);
    ctx.fillStyle = '#f3e6cf'; ctx.beginPath(); ctx.roundRect(-s * 0.16, -s * 0.1, s * 0.32, s * 0.6, 6); ctx.fill(); ctx.shadowColor = 'transparent';
    ctx.fillStyle = cap; ctx.beginPath(); ctx.ellipse(0, -s * 0.12, s * 0.5, s * 0.4, 0, Math.PI, TAU); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fff'; [[-0.25, -0.3, 0.07], [0.05, -0.42, 0.08], [0.28, -0.25, 0.06], [-0.05, -0.2, 0.05]].forEach(([x, y, r]) => { ctx.beginPath(); ctx.arc(x * s, y * s, r * s, 0, TAU); ctx.fill(); });
    ctx.restore();
  }
  function leaf(ctx, x, y, l, rot, col = '#4f8a3a') {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(l * 0.5, -l * 0.35, l, 0); ctx.quadraticCurveTo(l * 0.5, l * 0.35, 0, 0); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.3)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(l * 0.9, 0); ctx.stroke(); ctx.restore();
  }
  function daisy(ctx, cx, cy, R, petal = '#fff', core = '#f4c430') {
    ctx.save(); sh(ctx, 3, 2, 0.2); ctx.fillStyle = petal;
    for (let k = 0; k < 10; k++) { const a = (k / 10) * TAU; ctx.beginPath(); ctx.ellipse(cx + Math.cos(a) * R * 0.6, cy + Math.sin(a) * R * 0.6, R * 0.42, R * 0.17, a, 0, TAU); ctx.fill(); }
    ctx.shadowColor = 'transparent'; ctx.fillStyle = core; ctx.beginPath(); ctx.arc(cx, cy, R * 0.28, 0, TAU); ctx.fill(); ctx.restore();
  }
  function tulip(ctx, x, y, s, col) {
    ctx.save(); ctx.translate(x, y); ctx.strokeStyle = '#4f8a3a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, s * 1.4); ctx.stroke();
    leaf(ctx, 0, s * 1.3, s * 0.8, -0.9); sh(ctx, 3, 2, 0.2); ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(-s * 0.4, 0); ctx.bezierCurveTo(-s * 0.45, -s * 0.7, -s * 0.1, -s * 0.8, 0, -s * 0.5); ctx.bezierCurveTo(s * 0.1, -s * 0.8, s * 0.45, -s * 0.7, s * 0.4, 0); ctx.bezierCurveTo(s * 0.3, s * 0.3, -s * 0.3, s * 0.3, -s * 0.4, 0); ctx.fill(); ctx.restore();
  }
  function bee(ctx, x, y, s, rot = 0) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.fillStyle = 'rgba(210,230,250,.85)'; ctx.beginPath(); ctx.ellipse(-s * 0.1, -s * 0.35, s * 0.28, s * 0.18, -0.5, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.ellipse(s * 0.15, -s * 0.35, s * 0.25, s * 0.16, 0.5, 0, TAU); ctx.fill();
    ctx.fillStyle = '#f4c430'; ctx.beginPath(); ctx.ellipse(0, 0, s * 0.5, s * 0.3, 0, 0, TAU); ctx.fill(); ctx.fillStyle = '#2a2118'; ctx.fillRect(-s * 0.15, -s * 0.28, s * 0.1, s * 0.56); ctx.fillRect(s * 0.1, -s * 0.26, s * 0.1, s * 0.52); ctx.beginPath(); ctx.arc(s * 0.5, 0, s * 0.18, 0, TAU); ctx.fill(); ctx.restore();
  }
  function blossom(ctx, cx, cy, R, col = '#f9c6d4', core = '#d9577a', rot = 0) {
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot); ctx.fillStyle = col; ctx.strokeStyle = 'rgba(200,90,120,.35)'; ctx.lineWidth = 1;
    for (let k = 0; k < 5; k++) { ctx.save(); ctx.rotate((k * TAU) / 5); ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(-R * 0.55, -R * 0.4, -R * 0.45, -R * 1.0, -R * 0.12, -R * 0.95); ctx.lineTo(0, -R * 0.82); ctx.lineTo(R * 0.12, -R * 0.95); ctx.bezierCurveTo(R * 0.45, -R * 1.0, R * 0.55, -R * 0.4, 0, 0); ctx.fill(); ctx.stroke(); ctx.restore(); }
    ctx.strokeStyle = core; ctx.lineWidth = 1.2; ctx.fillStyle = core; for (let k = 0; k < 7; k++) { const a = (k / 7) * TAU; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * R * 0.35, Math.sin(a) * R * 0.35); ctx.stroke(); ctx.beginPath(); ctx.arc(Math.cos(a) * R * 0.35, Math.sin(a) * R * 0.35, R * 0.04, 0, TAU); ctx.fill(); }
    ctx.restore();
  }
  function planet(ctx, cx, cy, r, c1, c2, ring) {
    ctx.save(); const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.35, r * 0.1, cx, cy, r); g.addColorStop(0, c1); g.addColorStop(1, c2);
    if (ring) { ctx.strokeStyle = ring; ctx.lineWidth = r * 0.16; ctx.beginPath(); ctx.ellipse(cx, cy, r * 1.7, r * 0.45, -0.35, Math.PI, TAU); ctx.stroke(); }
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fill();
    if (ring) { ctx.strokeStyle = ring; ctx.lineWidth = r * 0.16; ctx.beginPath(); ctx.ellipse(cx, cy, r * 1.7, r * 0.45, -0.35, 0, Math.PI); ctx.stroke(); }
    ctx.restore();
  }
  function palm(ctx, x, y, len, rot, col = '#2b1a45') {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(len * 0.5, -len * 0.25, len, len * 0.1); ctx.stroke();
    for (let i = 1; i < 9; i++) { const t = i / 9, px = len * t, py = -Math.sin(t * Math.PI) * len * 0.2 + t * len * 0.1; ctx.beginPath(); ctx.moveTo(px, py); ctx.quadraticCurveTo(px + 6, py + len * 0.12, px - 6, py + len * 0.28 * (1 - t * 0.4)); ctx.lineTo(px - 2, py + 2); ctx.fill(); ctx.beginPath(); ctx.moveTo(px, py); ctx.quadraticCurveTo(px + 6, py - len * 0.1, px + 10, py - len * 0.2 * (1 - t * 0.4)); ctx.lineTo(px + 3, py - 1); ctx.fill(); }
    ctx.restore();
  }
  function guitar(ctx, cx, cy, w, neckLen, rot = 0) {
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot); sh(ctx, 6, 3, 0.35);
    ctx.fillStyle = '#c4202c'; ctx.beginPath(); ctx.ellipse(0, w * 0.35, w * 0.52, w * 0.5, 0, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.ellipse(-w * 0.02, -w * 0.15, w * 0.42, w * 0.36, 0, 0, TAU); ctx.fill(); ctx.shadowColor = 'transparent';
    ctx.fillStyle = '#3a2418'; ctx.fillRect(-w * 0.07, -neckLen, w * 0.14, neckLen + w * 0.1);
    ctx.fillStyle = '#e2c79a'; ctx.beginPath(); ctx.roundRect(-w * 0.12, -neckLen - w * 0.3, w * 0.24, w * 0.34, 6); ctx.fill();
    ctx.fillStyle = '#ccc'; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(-w * 0.15, -neckLen - w * 0.22 + i * w * 0.1, 3, 0, TAU); ctx.fill(); }
    ctx.fillStyle = '#f6f2ea'; ctx.beginPath(); ctx.ellipse(0, w * 0.22, w * 0.32, w * 0.4, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#999'; [0.05, 0.22, 0.4].forEach((p) => ctx.fillRect(-w * 0.2, w * p, w * 0.4, 6));
    ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1; for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(i * w * 0.02, -neckLen); ctx.lineTo(i * w * 0.02, w * 0.5); ctx.stroke(); }
    ctx.restore();
  }
  function arcText(ctx, s, cx, cy, r, a0, a1, font, col, inward) {
    const ch = [...s]; ctx.save(); ctx.fillStyle = col; ctx.font = font; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ch.forEach((c, i) => { const a = a0 + ((a1 - a0) * i) / Math.max(1, ch.length - 1); ctx.save(); ctx.translate(cx + Math.cos(a) * r, cy + Math.sin(a) * r); ctx.rotate(a + (inward ? -Math.PI / 2 : Math.PI / 2)); ctx.fillText(c, 0, 0); ctx.restore(); });
    ctx.restore();
  }
  function glitterStar(ctx, cx, cy, R, fill, edge, rot = -Math.PI / 2) {
    ctx.save(); ctx.lineJoin = 'round'; sh(ctx, 4, 2, 0.3); starPath(ctx, cx, cy, R, R * 0.5, 5, rot); ctx.fillStyle = fill; ctx.strokeStyle = edge; ctx.lineWidth = Math.max(2, R * 0.14); ctx.fill(); ctx.stroke(); ctx.shadowColor = 'transparent';
    ctx.clip(); const r = rng(Math.floor(cx + cy)); for (let i = 0; i < R * 6; i++) { ctx.fillStyle = r() < 0.5 ? 'rgba(255,200,200,.7)' : 'rgba(40,0,5,.45)'; ctx.fillRect(cx - R + r() * R * 2, cy - R + r() * R * 2, 1.6, 1.6); }
    ctx.restore();
  }
  function ribbonBand(ctx, x, y, w, h, col) { ctx.save(); ctx.fillStyle = col; ctx.fillRect(x, y, w, h); ctx.restore(); }
  function airmailBorder(ctx, x, y, w, h, t) {
    ctx.save(); ctx.fillStyle = '#efdcb6'; ctx.fillRect(x, y, w, h);
    const cols = ['#c8283b', '#efdcb6', '#1f3a7a', '#efdcb6'];
    for (let i = 0, p = x; p < x + w + 30; i++, p += 28) { ctx.fillStyle = cols[i % 4]; poly(ctx, [[p, y], [p + 28, y], [p + 20, y + t], [p - 8, y + t]]); ctx.fill(); poly(ctx, [[p, y + h - t], [p + 28, y + h - t], [p + 20, y + h], [p - 8, y + h]]); ctx.fill(); }
    for (let i = 0, p = y; p < y + h + 30; i++, p += 28) { ctx.fillStyle = cols[i % 4]; poly(ctx, [[x, p], [x + t, p - 8], [x + t, p + 20], [x, p + 28]]); ctx.fill(); poly(ctx, [[x + w - t, p - 8], [x + w, p], [x + w, p + 28], [x + w - t, p + 20]]); ctx.fill(); }
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

  const capOf = (st, fb = '') => (st.caption || '').trim() || fb;
  const handCap = (ctx, s, x, y, maxW, size, col) => { if (!s) return; const f = (n) => `700 ${n}px ${HAND}`; txt(ctx, s, x, y, f(fitSize(ctx, s, f, maxW, size)), col); };
  const whiteBg = (w = 740, h = 1300) => (ctx) => { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); };

  /* --- Red strip with cassette keychain (3 cuts) --- */
  themed.push({
    id: 'red_cassette', label: 'Red Cassette', cuts: 3, crop: [28, 10, 646, 1190],
    ph: '#f3dede', ink: '#7a0f1d', holeColor: '#fdf8f5',
    slots: [{ x: 158, y: 48, w: 379, h: 293 }, { x: 158, y: 367, w: 379, h: 293 }, { x: 158, y: 688, w: 379, h: 294 }],
    bg(ctx) { ctx.fillStyle = '#fdf3e6'; ctx.fillRect(0, 0, 675, 1200); },
    body(ctx, st, d) { paperTex(ctx, 124, 22, 447, 1156, '#7a0f1d', 71, 0.4); fillHoles(ctx, d, null); },
    front(ctx, st) {
      handCap(ctx, capOf(st), 250, 1060, 190, 46, '#f4d4d8');
      safetyPin(ctx, 128, 52, 98, -0.12);
      glitterStar(ctx, 510, 358, 24, '#8a1020', '#c9b8b8', -1.2); glitterStar(ctx, 552, 372, 28, '#8a1020', '#c9b8b8', -1.5); glitterStar(ctx, 540, 415, 20, '#8a1020', '#c9b8b8', -1.0);
      glitterStar(ctx, 165, 707, 40, '#a4152a', '#d4d4d8', -1.3);
      ctx.save(); ctx.strokeStyle = '#d4d4d8'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(522, 1062, 22, 0, TAU); ctx.stroke(); ctx.beginPath(); ctx.moveTo(515, 1082); ctx.lineTo(505, 1135); ctx.moveTo(530, 1082); ctx.lineTo(538, 1112); ctx.stroke(); ctx.restore();
      cassette(ctx, 455, 1108, 140, 95, -0.2);
      fabricStar(ctx, 540, 1126, 20, '#b8bcc4', '#fff', -1.3, '#e8e8ea');
      ctx.save(); sh(ctx, 3, 2, 0.35); heartPath(ctx, 505, 1160, 26); ctx.fillStyle = '#d4202f'; ctx.fill(); ctx.restore();
      txt(ctx, 'AURA', 505, 1164, `700 9px ${SANS}`, '#fff');
    },
  });

  /* --- Cocoa stars (4 cuts) --- */
  themed.push({
    id: 'cocoa_stars', label: 'Cocoa Stars', cuts: 4, crop: [90, 30, 630, 1095],
    ph: '#f3e8d8', ink: '#4a2c14', holeColor: '#fffdf9',
    slots: [{ x: 222, y: 68, w: 318, h: 217 }, { x: 222, y: 316, w: 318, h: 215 }, { x: 222, y: 566, w: 318, h: 215 }, { x: 222, y: 816, w: 318, h: 214 }],
    bg: whiteBg(),
    body(ctx, st, d) {
      ctx.save(); sh(ctx, 8, 3, 0.25); ctx.fillStyle = '#4a2c14'; ctx.fillRect(190, 40, 378, 1018); ctx.restore();
      const r = rng(77); ctx.fillStyle = '#f1e2bf';
      for (let i = 0; i < 150; i++) { starPath(ctx, 190 + r() * 378, 40 + r() * 1018, 5 + r() * 4, 2.2, 5, r() * 2); ctx.fill(); }
      d.slots.forEach((s) => { ctx.fillStyle = '#e8d9b4'; ctx.fillRect(s.x - 4, s.y - 4, s.w + 8, s.h + 8); ctx.fillStyle = d.holeColor; ctx.fillRect(s.x, s.y, s.w, s.h); });
    },
    front(ctx, st) {
      handCap(ctx, capOf(st), 380, 1078, 250, 28, '#4a2c14');
      [[205, 300, '#c79a68'], [258, 300, '#b98a62'], [312, 302, '#4a3226']].forEach(([x, y, c]) => macaron(ctx, x, y, 58, c));
      // hooded bear kid
      ctx.save(); ctx.translate(545, 455); sh(ctx, 5, 3, 0.3);
      const el = (x, y, rx, ry, f) => { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU); ctx.fillStyle = f; ctx.fill(); };
      el(-45, 75, 30, 40, '#8a7058'); el(45, 75, 30, 40, '#8a7058'); el(-20, 85, 26, 20, '#7a6048'); el(20, 85, 26, 20, '#7a6048'); el(0, 45, 45, 50, '#8a7058');
      el(-60, -50, 26, 26, '#8a7058'); el(60, -50, 26, 26, '#8a7058'); el(0, -25, 62, 58, '#9a8068'); ctx.shadowColor = 'transparent';
      el(0, -10, 38, 36, '#f1d9c8'); el(-14, -14, 5, 6, '#2a1810'); el(14, -14, 5, 6, '#2a1810'); el(0, 6, 8, 4, '#b86a62'); el(0, -52, 22, 10, '#c9b49a');
      ctx.restore();
      cookie(ctx, 505, 800, 42, 3, 0.2); cookie(ctx, 548, 745, 38, 5, -0.3); cookie(ctx, 560, 775, 34, 8, 0.4);
      plush(ctx, 184, 995, 130, null);
    },
  });

  /* --- Denim, cat & star (4 cuts) --- */
  themed.push({
    id: 'denim_cat', label: 'Denim Cat', cuts: 4, crop: [150, 170, 500, 985],
    ph: '#e6eef6', ink: '#27415f', holeColor: '#ffffff',
    slots: [{ x: 258, y: 208, w: 142, h: 142 }, { x: 262, y: 412, w: 140, h: 135 }, { x: 262, y: 603, w: 140, h: 135 }, { x: 262, y: 800, w: 140, h: 132 }],
    bg: whiteBg(),
    body(ctx, st, d) {
      denim(ctx, 236, 185, 189, 780, '#2f4a6b', 5);
      ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(236, 575, 189, 4);
      fray(ctx, 238, 185, 90, 80, 2); fray(ctx, 238, 575, 90, 80, 3); fray(ctx, 240, 470, 24, 90, 4); fray(ctx, 240, 840, 24, 90, 5); fray(ctx, 335, 905, 70, 55, 6);
      ctx.fillStyle = '#d9e6ef'; for (let i = 0; i < 9; i++) { ctx.fillRect(405, 215 + i * 14, 14, 3); ctx.fillRect(405, 610 + i * 14, 14, 3); }
      d.slots.forEach((s) => { stitchRect(ctx, s.x - 4, s.y - 4, s.w + 8, s.h + 8, '#cfa266'); ctx.fillStyle = d.holeColor; ctx.fillRect(s.x, s.y, s.w, s.h); });
      xPatch(ctx, 335, 380, 70, 20); xPatch(ctx, 335, 765, 70, 20);
    },
    front(ctx, st) {
      handCap(ctx, capOf(st), 330, 976, 150, 22, '#27415f');
      catSit(ctx, 250, 312, 106);
      ctx.save(); ctx.translate(412, 570); ctx.lineJoin = 'round'; sh(ctx, 6, 3, 0.4);
      starPath(ctx, 0, 0, 72, 36, 5, -1.3); ctx.fillStyle = '#1f3552'; ctx.strokeStyle = '#1f3552'; ctx.lineWidth = 10; ctx.fill(); ctx.stroke(); ctx.shadowColor = 'transparent';
      starPath(ctx, 0, 0, 52, 26, 5, -1.3); ctx.fillStyle = '#8fa9d6'; ctx.fill(); ctx.setLineDash([4, 3]); ctx.strokeStyle = '#d9e6f8'; ctx.lineWidth = 1.2; ctx.stroke(); ctx.restore();
      flower(ctx, 238, 775, 66, '#3f5f93', '#27415f', '#d5e2f4', 0.4);
    },
  });

  /* --- Beige check scrapbook (4 cuts) --- */
  themed.push({
    id: 'beige_check', label: 'Beige Check', cuts: 4, crop: [140, 0, 620, 1308],
    ph: '#f6efe4', ink: '#7b5e3f', holeColor: '#ffffff',
    slots: [{ x: 190, y: 22, w: 390, h: 276 }, { x: 190, y: 325, w: 388, h: 275 }, { x: 190, y: 630, w: 388, h: 285 }, { x: 200, y: 937, w: 380, h: 278 }],
    bg: whiteBg(),
    body(ctx, st, d) {
      ctx.fillStyle = gingham(ctx, '#b89f7e', '#fbf6ee', 10); ctx.fillRect(170, 0, 432, 1308);
      fillHoles(ctx, d, null);
    },
    front(ctx, st) {
      ctx.strokeStyle = '#c9a87a'; ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(190, 8); ctx.lineTo(192, 190); ctx.stroke(); ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(150, 30); ctx.lineTo(312, 12); ctx.stroke();
      button(ctx, 208, 30, 18, '#7a4a32');
      ctx.save(); sh(ctx, 4, 2, 0.3); ctx.fillStyle = '#d49a5a'; ctx.beginPath(); ctx.arc(532, 58, 48, 0, TAU); ctx.arc(498, 22, 20, 0, TAU); ctx.arc(568, 24, 20, 0, TAU); ctx.fill(); ctx.restore();
      ctx.fillStyle = '#f2a7a5'; [[510, 62], [556, 62]].forEach(([x, y]) => { ctx.beginPath(); ctx.arc(x, y, 9, 0, TAU); ctx.fill(); });
      ctx.fillStyle = '#6a3d22'; ctx.beginPath(); ctx.arc(515, 48, 3, 0, TAU); ctx.fill(); ctx.fillRect(545, 47, 12, 3);
      plush(ctx, 212, 322, 90, '#f2a7c0'); button(ctx, 300, 300, 26);
      ctx.save(); sh(ctx, 4, 2, 0.3); ctx.fillStyle = '#d9b88a'; ctx.beginPath(); ctx.roundRect(508, 302, 94, 84, 14); ctx.fill(); ctx.restore(); txt(ctx, 'B', 555, 346, `800 62px ${SERIF}`, '#4a2c14', { stroke: '#f6ecd6', sw: 6 });
      ctx.save(); ctx.translate(240, 650); ctx.rotate(-0.7); ctx.fillStyle = 'rgba(200,170,120,.75)'; ctx.fillRect(-30, -22, 60, 44); ctx.restore(); miniCamera(ctx, 170, 612, 110);
      button(ctx, 586, 696, 26);
      kraft(ctx, 349, 922, 248, 43, 'love yourself', 17, 0);
      ctx.save(); ctx.lineJoin = 'round'; sh(ctx, 3, 2, 0.3); starPath(ctx, 185, 1070, 42, 18, 5, -1.2); ctx.fillStyle = '#f4efe6'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.fill(); ctx.stroke(); starPath(ctx, 215, 1100, 28, 12, 5, -0.5); ctx.fillStyle = '#d8876a'; ctx.fill(); ctx.stroke(); ctx.restore();
      kraft(ctx, 200, 1172, 150, 34, "i'd be a fool", 16, 0.12); kraft(ctx, 190, 1215, 175, 34, 'not to love you', 16, 0.14);
      txt(ctx, 'CutiE', 488, 1286, `800 38px ${SERIF}`, '#f6ecd6', { stroke: '#222', sw: 7 });
      seaShell(ctx, 570, 1222, 38, '#f1e0cf'); bow(ctx, 566, 1250, 15, { fill: '#f2a7c0', rot: 0.2 });
      const cap = capOf(st); if (cap) { ctx.save(); ctx.fillStyle = 'rgba(251,246,238,.92)'; ctx.fillRect(380, 1225, 130, 40); ctx.restore(); handCap(ctx, cap, 445, 1246, 115, 28, '#7b5e3f'); }
    },
  });

  /* --- Ripped denim (3 cuts) --- */
  themed.push({
    id: 'denim_rip', label: 'Ripped Denim', cuts: 3, crop: [140, 25, 600, 1190],
    ph: '#e6eef6', ink: '#27415f', holeColor: '#ffffff',
    slots: [{ x: 262, y: 85, w: 270, h: 272 }, { x: 262, y: 475, w: 268, h: 270 }, { x: 258, y: 862, w: 272, h: 270 }],
    bg: whiteBg(),
    body(ctx, st, d) {
      denim(ctx, 208, 35, 372, 1145, '#34507a', 9);
      ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.fillRect(208, 745, 372, 6); ctx.fillRect(208, 810, 372, 6);
      fray(ctx, 222, 42, 150, 125, 1); fray(ctx, 262, 478, 120, 60, 2); fray(ctx, 400, 668, 130, 78, 3); fray(ctx, 372, 1045, 200, 130, 4);
      ctx.fillStyle = '#d9e6ef'; for (let i = 0; i < 18; i++) { ctx.fillRect(548, 55 + i * 15, 24, 3); ctx.fillRect(220, 870 + i * 15, 24, 3); ctx.fillRect(220, 200 + i * 12, 22, 3); }
      d.slots.forEach((s) => { ctx.fillStyle = d.holeColor; ctx.fillRect(s.x, s.y, s.w, s.h); });
      xPatch(ctx, 385, 790, 100, 26);
    },
    front(ctx, st) {
      ransom(ctx, capOf(st, 'AURA').slice(0, 12), 392, 402, 62, 4, 340);
      glitterStar(ctx, 268, 742, 46, '#2f5a86', '#9fb8d6', -1.3); glitterStar(ctx, 218, 822, 38, '#6c93c4', '#1f3552', -1.0); glitterStar(ctx, 208, 942, 56, '#3b5f9a', '#a9c0e0', -1.4);
    },
  });

  /* --- Blue gingham ocean (3 cuts) --- */
  themed.push({
    id: 'ocean_blue', label: 'Ocean Blue', cuts: 3, crop: [215, 135, 520, 1240],
    ph: '#eaf2fb', ink: '#2f68b0', holeColor: '#ffffff',
    slots: [{ x: 245, y: 170, w: 248, h: 292 }, { x: 245, y: 524, w: 248, h: 292 }, { x: 245, y: 877, w: 248, h: 292 }],
    bg: whiteBg(),
    body(ctx, st, d) {
      ctx.fillStyle = gingham(ctx, '#9fc0e6', '#fff', 7); ctx.fillRect(225, 142, 287, 1088);
      fillHoles(ctx, d, null);
      const cap = capOf(st, 'Blue color system');
      [472, 826, 1180].forEach((y) => { ctx.save(); ctx.fillStyle = '#fff'; ctx.fillRect(322, y, 95, 38); ctx.setLineDash([2, 2]); ctx.strokeStyle = '#9fc0e6'; ctx.strokeRect(325, y + 3, 89, 32); ctx.restore(); const f = (n) => `italic 600 ${n}px ${HAND}`; txt(ctx, cap, 369, y + 19, f(fitSize(ctx, cap, f, 84, 15)), '#7fb0e0'); });
    },
    front(ctx) {
      bow(ctx, 462, 188, 38, { fill: '#a9c8ec', hi: '#e2eefb', shade: 'rgba(60,100,160,.3)', rot: 0.2 });
      jellyfish(ctx, 272, 415, 110); seaShell(ctx, 345, 452, 24, '#7d8fb8');
      turtle(ctx, 455, 805, 64);
      ctx.save(); ctx.translate(275, 845); ctx.fillStyle = '#2f8f8f'; for (let k = 0; k < 5; k++) { ctx.save(); ctx.rotate((k * TAU) / 5 - 1.3); ctx.beginPath(); ctx.ellipse(28, 0, 30, 9, 0, 0, TAU); ctx.fill(); ctx.restore(); } ctx.fillStyle = '#255f8a'; ctx.beginPath(); ctx.arc(0, 0, 11, 0, TAU); ctx.fill(); ctx.restore();
      starfish(ctx, 255, 1118, 28, '#efe1c8'); starfish(ctx, 278, 1150, 22, '#d9805a');
      ctx.save(); ctx.translate(262, 1196); ctx.fillStyle = '#3f5f97'; ctx.beginPath(); ctx.arc(0, 0, 32, 0, TAU); ctx.fill(); ctx.strokeStyle = '#a9c8ec'; ctx.lineWidth = 2; for (let i = 1; i < 5; i++) { ctx.beginPath(); ctx.arc(0, 0, i * 6, i, i + 4.4); ctx.stroke(); } ctx.restore();
      starfish(ctx, 328, 1178, 30, '#6f93c8');
      ctx.fillStyle = '#2f5fa0'; ctx.beginPath(); ctx.moveTo(366, 1160); ctx.quadraticCurveTo(390, 1140, 412, 1160); ctx.quadraticCurveTo(390, 1176, 366, 1160); ctx.fill();
      wave(ctx, 358, 1135, 154, 90);
    },
  });

  /* --- Jazz night (3 cuts) --- */
  themed.push({
    id: 'jazz_red', label: 'Jazz Night', cuts: 3, crop: [70, 125, 600, 1240],
    ph: '#e9c9c9', ink: '#5d0c10', holeColor: '#f4efef',
    slots: [{ x: 208, y: 193, w: 330, h: 243 }, { x: 208, y: 470, w: 330, h: 240 }, { x: 208, y: 738, w: 330, h: 238 }],
    bg: whiteBg(),
    body(ctx, st, d) {
      ctx.fillStyle = '#fff'; ctx.fillRect(176, 170, 8, 1000); ctx.fillStyle = '#6a1119'; ctx.fillRect(188, 1175, 352, 36);
      ctx.save(); sh(ctx, 8, 3, 0.3); ctx.fillStyle = '#6a1119'; ctx.fillRect(190, 132, 365, 1043); ctx.restore();
      ctx.fillStyle = lin(ctx, 190, 132, 555, 1000, [[0, '#8b2a20'], [0.4, '#6a1119'], [1, '#8a2a32']]); ctx.fillRect(190, 132, 365, 1043);
      ctx.save(); ctx.beginPath(); ctx.rect(190, 132, 365, 880); ctx.clip(); ctx.globalAlpha = 0.16;
      for (let i = 0; i < 9; i++) txt(ctx, i % 2 ? 'MUSIC' : 'JAZZ', 300 + (i % 3) * 90, 160 + i * 100, `800 54px ${SANS}`, '#f4c0a0', { rot: -0.15 });
      ctx.restore();
      ctx.fillStyle = '#4a0a0f'; ctx.fillRect(188, 1022, 368, 153);
      ctx.strokeStyle = '#111'; ctx.lineWidth = 2; ctx.fillStyle = '#2a0508'; ctx.fillRect(188, 995, 368, 27);
      for (let x = 188; x < 556; x += 14) { ctx.beginPath(); ctx.moveTo(x, 995); ctx.lineTo(x + 14, 1022); ctx.moveTo(x + 14, 995); ctx.lineTo(x, 1022); ctx.stroke(); }
      d.slots.forEach((s) => { ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillRect(s.x - 5, s.y - 5, s.w + 10, s.h + 10); ctx.fillStyle = d.holeColor; ctx.fillRect(s.x, s.y, s.w, s.h); });
    },
    front(ctx, st) {
      const cap = capOf(st, 'JAZZ NIGHT'); const f = (n) => `800 ${n}px ${SERIF}`; txt(ctx, cap, 400, 1100, f(fitSize(ctx, cap, f, 260, 44)), '#f6e6e0');
      ctx.save(); ctx.translate(512, 215); ctx.rotate(-0.08); ctx.fillStyle = '#111'; ctx.beginPath(); ctx.roundRect(-42, -16, 84, 32, 6); ctx.fill(); ctx.beginPath(); ctx.arc(8, -26, 20, 0, TAU); ctx.fill(); ctx.restore(); txt(ctx, 'JAZZ', 512, 216, `800 22px ${SANS}`, '#fff', { rot: -0.08 });
      safetyPin(ctx, 505, 135, 100, 0.95);
      clef(ctx, 232, 425, 52, false); clef(ctx, 230, 705, 56, true);
      note8(ctx, 485, 915, 40, 0.1); note8(ctx, 522, 945, 40, 0.1); note8(ctx, 540, 960, 36, 0.1);
      guitar(ctx, 152, 1130, 120, 385, 0.05);
    },
  });

  /* --- Floral lace (3 cuts) --- */
  themed.push({
    id: 'floral_lace', label: 'Floral Lace', cuts: 3, crop: [150, 150, 460, 920],
    ph: '#fbeff0', ink: '#c9707f', holeColor: '#ffffff',
    slots: [{ x: 191, y: 211, w: 234, h: 148 }, { x: 191, y: 380, w: 234, h: 170 }, { x: 191, y: 571, w: 234, h: 174 }],
    bg: whiteBg(),
    body(ctx, st, d) {
      ctx.fillStyle = '#fbf5e2'; ctx.fillRect(153, 155, 302, 760); floralBg(ctx, 153, 155, 302, 760, 4);
      d.slots.forEach((s) => { ctx.strokeStyle = '#f4b6b6'; ctx.lineWidth = 6; ctx.strokeRect(s.x - 4, s.y - 4, s.w + 8, s.h + 8); ctx.fillStyle = d.holeColor; ctx.fillRect(s.x, s.y, s.w, s.h); });
    },
    front(ctx, st) {
      lace(ctx, 185, 172, 190, 60); bow(ctx, 297, 192, 40, { fill: '#fbf8f2', hi: '#fff', shade: 'rgba(120,110,100,.3)' });
      butterfly(ctx, 420, 365, 34, 0.5); butterfly(ctx, 192, 548, 32, -0.6);
      peony(ctx, 395, 735, 52);
      handCap(ctx, capOf(st), 305, 850, 200, 36, '#c9707f');
    },
  });

  /* --- Airmail (3 cuts) --- */
  themed.push({
    id: 'airmail', label: 'Airmail', cuts: 3, crop: [45, 213, 330, 972],
    ph: '#f3ecdc', ink: '#1f3a7a', holeColor: '#fbf8ee',
    slots: [{ x: 68, y: 243, w: 240, h: 165 }, { x: 68, y: 437, w: 240, h: 158 }, { x: 68, y: 620, w: 240, h: 155 }],
    bg: whiteBg(),
    body(ctx, st, d) {
      airmailBorder(ctx, 45, 213, 285, 759, 20);
      ctx.fillStyle = '#efdcb6'; ctx.fillRect(62, 232, 251, 553); paperTex(ctx, 45, 785, 285, 187, '#efdcb6', 83, 0.7);
      ctx.fillStyle = '#fbf8ec'; ctx.fillRect(62, 232, 251, 553);
      ctx.fillStyle = '#a98450'; for (let x = 62; x < 314; x += 6) { ctx.beginPath(); ctx.arc(x, 236, 1.5, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.arc(x, 782, 1.5, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.arc(x, 423, 1.5, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.arc(x, 607, 1.5, 0, TAU); ctx.fill(); }
      fillHoles(ctx, d, null);
      airmailBorder(ctx, 45, 950, 285, 22, 22);
    },
    front(ctx, st) {
      txt(ctx, 'Memories', 190, 808, `800 34px ${SERIF}`, '#1f3a7a');
      const cap = capOf(st, 'to cherish'); const f = (n) => `italic 600 ${n}px ${HAND}`; txt(ctx, cap, 200, 842, f(fitSize(ctx, cap, f, 150, 34)), '#c8283b');
      ctx.save(); ctx.strokeStyle = '#4a4a5a'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(108, 905, 55, 0, TAU); ctx.stroke(); ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(108, 905, 47, 0, TAU); ctx.stroke(); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(108, 905, 28, 0, TAU); ctx.stroke(); ctx.restore();
      arcText(ctx, 'A DAY TO', 108, 905, 38, Math.PI * 1.05, Math.PI * 1.95, `700 10px ${SERIF}`, '#4a4a5a', false);
      arcText(ctx, 'REMEMBER', 108, 905, 40, Math.PI * 0.85, Math.PI * 0.15, `700 10px ${SERIF}`, '#4a4a5a', true);
      ctx.save(); ctx.strokeStyle = '#4a4a5a'; ctx.lineWidth = 1; for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.moveTo(165, 880 + k * 7); ctx.bezierCurveTo(200, 868 + k * 7, 230, 900 + k * 7, 320, 872 + k * 7); ctx.stroke(); } ctx.restore();
    },
  });

  /* --- Pink gingham & flowers (3 cuts) --- */
  themed.push({
    id: 'pink_check', label: 'Pink Picnic', cuts: 3, crop: [150, 20, 570, 1130],
    ph: '#fdeef2', ink: '#c9707f', holeColor: '#ffffff',
    slots: [{ x: 212, y: 75, w: 254, h: 245 }, { x: 212, y: 430, w: 254, h: 262 }, { x: 212, y: 787, w: 254, h: 262 }],
    bg: whiteBg(),
    body(ctx, st, d) {
      ctx.save(); sh(ctx, 6, 2, 0.2); ctx.fillStyle = '#fff'; ctx.fillRect(192, 55, 293, 1065); ctx.restore();
      ctx.fillStyle = gingham(ctx, '#f4a9bd', '#fff', 9); ctx.fillRect(192, 55, 293, 1065);
      d.slots.forEach((s) => { ctx.fillStyle = '#c9c4c4'; ctx.fillRect(s.x - 3, s.y - 3, s.w + 6, s.h + 6); ctx.fillStyle = d.holeColor; ctx.fillRect(s.x, s.y, s.w, s.h); });
    },
    front(ctx, st) {
      handCap(ctx, capOf(st), 345, 1086, 130, 28, '#c9707f');
      strawberry(ctx, 218, 100, 26); bow(ctx, 238, 70, 12, { fill: '#e8506a' });
      flower(ctx, 218, 352, 42, '#fdf6f6', '#e9c4cc', '#e6a0b0', 0.6);
      lily(ctx, 455, 392, 92, '#e9a3c0', -0.2);
      ctx.save(); ctx.strokeStyle = '#6f9a55'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(212, 800); ctx.quadraticCurveTo(205, 760, 215, 700); ctx.stroke(); ctx.restore();
      [[205, 685, 22], [235, 705, 20], [215, 735, 19], [232, 765, 17]].forEach(([x, y, r]) => { ctx.save(); sh(ctx, 3, 2, 0.2); ctx.fillStyle = '#f4a9bd'; ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.75, 0.5, 0, TAU); ctx.fill(); ctx.restore(); });
      leaf(ctx, 470, 725, 36, -0.8, '#c9e0a8'); leaf(ctx, 480, 800, 36, 0.8, '#c9e0a8'); peony(ctx, 468, 768, 30, '#f6b3c4', '#d9708a');
      ctx.save(); ctx.translate(245, 1090); sh(ctx, 3, 2, 0.25); ctx.fillStyle = '#f2e6d4'; ctx.beginPath(); ctx.ellipse(0, 0, 38, 20, 0, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.arc(-26, -6, 14, 0, TAU); ctx.fill(); ctx.fillStyle = '#e8c9a8'; ctx.beginPath(); ctx.arc(-34, -17, 6, 0, TAU); ctx.fill(); ctx.fillStyle = '#4a3a30'; ctx.beginPath(); ctx.arc(-30, -7, 1.8, 0, TAU); ctx.fill(); ctx.restore();
      ctx.save(); ctx.translate(448, 1082); sh(ctx, 3, 2, 0.25); ctx.fillStyle = '#f08fb0'; ctx.beginPath(); ctx.ellipse(0, 20, 22, 9, 0, 0, TAU); ctx.fill(); ctx.fillStyle = '#fdf6f6'; ctx.beginPath(); ctx.ellipse(0, -2, 13, 17, 0, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.arc(0, -22, 11, 0, TAU); ctx.fill(); ctx.fillStyle = '#e8c9cf'; ctx.fillRect(-9, -42, 6, 15); ctx.fillRect(3, -42, 6, 15); ctx.fillStyle = '#e6d3a8'; ctx.beginPath(); ctx.ellipse(0, -30, 14, 4, 0, 0, TAU); ctx.fill(); ctx.restore();
    },
  });

  /* ---- Original themes: nature + dreamy ---- */
  const scatter = (ctx, n, W, H, seed, fn) => { const r = rng(seed); for (let i = 0; i < n; i++) fn(r() * W, r() * H, r, i); };
  const panelFrames = (ctx, d, pad, fill, shadow = true) => d.slots.forEach((s) => { ctx.save(); if (shadow) sh(ctx, 10, 4, 0.2); ctx.fillStyle = fill; ctx.beginPath(); ctx.roundRect(s.x - pad, s.y - pad, s.w + pad * 2, s.h + pad * 2, 14); ctx.fill(); ctx.restore(); ctx.fillStyle = d.holeColor; ctx.fillRect(s.x, s.y, s.w, s.h); });

  /* --- Wildflower meadow --- */
  themed.push({
    id: 'meadow', label: 'Wildflower Meadow', cuts: 3, crop: [0, 0, 520, 1100],
    ph: '#eef5dc', ink: '#4f7a3a', holeColor: '#f8fbef',
    slots: [{ x: 60, y: 60, w: 400, h: 265 }, { x: 60, y: 360, w: 400, h: 265 }, { x: 60, y: 660, w: 400, h: 265 }],
    bg(ctx) { ctx.fillStyle = lin(ctx, 0, 0, 0, 1100, [[0, '#f7f6e2'], [0.7, '#e4efc9'], [1, '#c5de9e']]); ctx.fillRect(0, 0, 520, 1100); },
    body(ctx, st, d) { panelFrames(ctx, d, 14, '#fffdf4'); },
    front(ctx, st) {
      const r = rng(21);
      for (let x = -10; x < 540; x += 9) { const h = 40 + r() * 70; ctx.strokeStyle = ['#6aa84f', '#7fbf5a', '#4f8a3a'][Math.floor(r() * 3)]; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x, 1110); ctx.quadraticCurveTo(x + (r() - 0.5) * 22, 1110 - h * 0.6, x + (r() - 0.5) * 30, 1110 - h); ctx.stroke(); }
      [[70, 1012, '#e8506a'], [185, 1032, '#f4a23a'], [330, 1020, '#b86fd0'], [450, 1034, '#e8506a']].forEach(([x, y, c]) => tulip(ctx, x, y, 26, c));
      daisy(ctx, 130, 1040, 24); daisy(ctx, 255, 1018, 28); daisy(ctx, 390, 1048, 22, '#fde6f0', '#f08aa0'); daisy(ctx, 500, 1000, 20);
      handCap(ctx, capOf(st), 260, 962, 330, 48, '#4f7a3a');
      [[40, 345, 24], [485, 640, 22], [30, 950, 20]].forEach(([x, y, s]) => daisy(ctx, x, y, s, '#fff', '#f4c430'));
      bee(ctx, 440, 48, 22, 0.3); bee(ctx, 78, 640, 20, -0.4); butterfly(ctx, 478, 345, 30, 0.4, '#f8b8d0'); butterfly(ctx, 42, 40, 26, -0.5, '#b8d8f8');
      leaf(ctx, 10, 12, 60, 0.7); leaf(ctx, 8, 30, 50, 1.0, '#7fbf5a'); leaf(ctx, 510, 940, 56, 2.5);
    },
  });

  /* --- Dreamy clouds --- */
  themed.push({
    id: 'dream_sky', label: 'Dreamy Clouds', cuts: 3, crop: [0, 0, 520, 1100],
    ph: '#f6eefc', ink: '#8a6fc0', holeColor: '#fffaff',
    slots: [{ x: 60, y: 70, w: 400, h: 260 }, { x: 60, y: 365, w: 400, h: 260 }, { x: 60, y: 660, w: 400, h: 260 }],
    bg(ctx) {
      ctx.fillStyle = lin(ctx, 0, 0, 0, 1100, [[0, '#b9a6ef'], [0.45, '#f4b8d8'], [0.8, '#ffd9bd'], [1, '#fff0d4']]); ctx.fillRect(0, 0, 520, 1100);
      scatter(ctx, 40, 520, 900, 5, (x, y, r) => sparkle(ctx, x, y, 3 + r() * 6, 'rgba(255,255,255,.85)'));
    },
    body(ctx, st, d) {
      d.slots.forEach((s) => {
        ctx.save(); sh(ctx, 10, 4, 0.15); ctx.fillStyle = 'rgba(255,255,255,.94)'; ctx.beginPath(); ctx.roundRect(s.x - 14, s.y - 14, s.w + 28, s.h + 28, 18); ctx.fill();
        for (let x = s.x; x <= s.x + s.w; x += 44) { ctx.beginPath(); ctx.arc(x, s.y - 14, 22, 0, TAU); ctx.arc(x + 22, s.y + s.h + 14, 20, 0, TAU); ctx.fill(); }
        ctx.restore(); ctx.fillStyle = d.holeColor; ctx.fillRect(s.x, s.y, s.w, s.h);
      });
    },
    front(ctx, st) {
      moon(ctx, 448, 40, 30); sparkle(ctx, 380, 36, 10, '#fff8c8'); sparkle(ctx, 60, 36, 12, '#fff'); sparkle(ctx, 492, 346, 11, '#fff');
      cloud(ctx, 90, 345, 90); cloud(ctx, 440, 640, 100); cloud(ctx, 80, 945, 110); cloud(ctx, 400, 985, 130, '#fff'); cloud(ctx, 250, 1060, 160, '#fff');
      ctx.save(); ctx.lineWidth = 9; ['#f48aa8', '#f8c26a', '#8fd0b8', '#8fb8f0'].forEach((c, i) => { ctx.strokeStyle = c; ctx.beginPath(); ctx.arc(110, 1010, 62 - i * 9, Math.PI, TAU); ctx.stroke(); }); ctx.restore();
      cloud(ctx, 110, 1020, 70);
      handCap(ctx, capOf(st), 300, 965, 300, 46, '#8a6fc0');
    },
  });

  /* --- Enchanted forest --- */
  themed.push({
    id: 'enchanted', label: 'Enchanted Forest', cuts: 3, crop: [0, 0, 520, 1130],
    ph: '#1f3a2c', ink: '#c9f0b8', holeColor: '#0f2218',
    slots: [{ x: 60, y: 60, w: 400, h: 270 }, { x: 60, y: 365, w: 400, h: 270 }, { x: 60, y: 670, w: 400, h: 270 }],
    bg(ctx) { ctx.fillStyle = lin(ctx, 0, 0, 0, 1130, [[0, '#0d2018'], [0.6, '#1b4630'], [1, '#2d5a3d']]); ctx.fillRect(0, 0, 520, 1130); scatter(ctx, 60, 520, 1130, 8, (x, y, r) => { ctx.fillStyle = `rgba(200,255,200,${0.1 + r() * 0.3})`; ctx.fillRect(x, y, 2, 2); }); },
    body(ctx, st, d) {
      d.slots.forEach((s) => { ctx.save(); sh(ctx, 10, 4, 0.5); ctx.fillStyle = '#2f5c3c'; ctx.beginPath(); ctx.roundRect(s.x - 16, s.y - 16, s.w + 32, s.h + 32, 16); ctx.fill(); ctx.restore(); ctx.strokeStyle = '#7fbf6a'; ctx.lineWidth = 2; ctx.strokeRect(s.x - 8, s.y - 8, s.w + 16, s.h + 16); ctx.fillStyle = d.holeColor; ctx.fillRect(s.x, s.y, s.w, s.h); });
    },
    front(ctx, st) {
      const r = rng(31);
      for (let i = 0; i < 18; i++) { const side = i % 2 ? 1 : -1; leaf(ctx, side > 0 ? 505 : 15, 30 + i * 55, 40 + r() * 20, side > 0 ? 2.6 + r() * 0.4 : 0.5 - r() * 0.4, ['#3f8a4a', '#5fae5a', '#2f6a3a'][i % 3]); }
      mushroom(ctx, 90, 1050, 80); mushroom(ctx, 180, 1075, 50, '#e08a3a'); mushroom(ctx, 430, 1055, 90, '#c9407a'); mushroom(ctx, 340, 1085, 46);
      scatter(ctx, 26, 520, 1130, 11, (x, y, rr) => { const g = ctx.createRadialGradient(x, y, 0, x, y, 12); g.addColorStop(0, 'rgba(240,255,150,.95)'); g.addColorStop(1, 'rgba(240,255,150,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 12, 0, TAU); ctx.fill(); });
      handCap(ctx, capOf(st), 260, 985, 300, 46, '#d9f5c8');
      moon(ctx, 470, 34, 22, '#f6f0b0');
    },
  });

  /* --- Starry galaxy (4 cuts) --- */
  themed.push({
    id: 'galaxy', label: 'Starry Galaxy', cuts: 4, crop: [0, 0, 500, 1260],
    ph: '#2a2060', ink: '#e8e0ff', holeColor: '#0a0a24',
    slots: [{ x: 50, y: 60, w: 400, h: 240 }, { x: 50, y: 340, w: 400, h: 240 }, { x: 50, y: 620, w: 400, h: 240 }, { x: 50, y: 900, w: 400, h: 240 }],
    bg(ctx) {
      ctx.fillStyle = lin(ctx, 0, 0, 500, 1260, [[0, '#0b1030'], [0.5, '#2a1054'], [1, '#5a1a6a']]); ctx.fillRect(0, 0, 500, 1260);
      const n = rng(4); for (let i = 0; i < 160; i++) { ctx.fillStyle = `rgba(255,255,255,${0.3 + n() * 0.7})`; ctx.beginPath(); ctx.arc(n() * 500, n() * 1260, n() * 1.6 + 0.3, 0, TAU); ctx.fill(); }
    },
    body(ctx, st, d) { d.slots.forEach((s) => { ctx.strokeStyle = '#c9c4f0'; ctx.lineWidth = 3; ctx.strokeRect(s.x - 8, s.y - 8, s.w + 16, s.h + 16); ctx.strokeStyle = 'rgba(201,196,240,.4)'; ctx.lineWidth = 1; ctx.strokeRect(s.x - 14, s.y - 14, s.w + 28, s.h + 28); ctx.fillStyle = d.holeColor; ctx.fillRect(s.x, s.y, s.w, s.h); }); },
    front(ctx, st) {
      planet(ctx, 448, 318, 30, '#ffd29a', '#d9702a', '#f4e0b0'); planet(ctx, 48, 596, 22, '#9ad0ff', '#3a6ad0', null); planet(ctx, 450, 880, 18, '#ff9ad0', '#a02a80', null);
      ctx.save(); const g = lin(ctx, 80, 1170, 300, 1210, [[0, 'rgba(255,255,255,0)'], [1, 'rgba(255,255,255,.9)']]); ctx.strokeStyle = g; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(80, 1170); ctx.lineTo(300, 1215); ctx.stroke(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(302, 1215, 6, 0, TAU); ctx.fill(); ctx.restore();
      [[30, 40], [470, 36], [34, 330], [470, 600], [26, 860], [472, 1160]].forEach(([x, y], i) => sparkle(ctx, x, y, 10 + (i % 3) * 3, '#fff6c0'));
      moon(ctx, 410, 1195, 24, '#f6f0c8'); handCap(ctx, capOf(st), 220, 1190, 220, 46, '#e8e0ff');
    },
  });

  /* --- Sunset palms --- */
  themed.push({
    id: 'sunset_palm', label: 'Sunset Palms', cuts: 3, crop: [0, 0, 520, 1100],
    ph: '#fff0dd', ink: '#c0415a', holeColor: '#fff8ee',
    slots: [{ x: 60, y: 70, w: 400, h: 260 }, { x: 60, y: 365, w: 400, h: 260 }, { x: 60, y: 660, w: 400, h: 260 }],
    bg(ctx) {
      ctx.fillStyle = lin(ctx, 0, 0, 0, 1100, [[0, '#4a2f86'], [0.35, '#d9569a'], [0.7, '#ff8a5b'], [1, '#ffc95b']]); ctx.fillRect(0, 0, 520, 1100);
      ctx.save(); ctx.beginPath(); ctx.arc(260, 1050, 150, Math.PI, TAU); ctx.clip(); ctx.fillStyle = lin(ctx, 0, 900, 0, 1050, [[0, '#fff0a0'], [1, '#ff9a4a']]); ctx.fillRect(100, 880, 320, 200); ctx.fillStyle = 'rgba(255,120,100,.55)'; for (let i = 0; i < 6; i++) ctx.fillRect(100, 970 + i * 14, 320, 4 + i); ctx.restore();
    },
    body(ctx, st, d) { panelFrames(ctx, d, 12, '#fff2dc'); },
    front(ctx, st) {
      palm(ctx, 0, 20, 200, 0.5); palm(ctx, 0, 20, 170, 0.9); palm(ctx, 520, 20, 200, Math.PI - 0.5); palm(ctx, 520, 20, 170, Math.PI - 0.9);
      palm(ctx, 0, 940, 150, -0.5); palm(ctx, 520, 940, 150, Math.PI + 0.5);
      ctx.save(); ctx.strokeStyle = '#2b1a45'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; [[400, 40], [430, 60], [380, 62]].forEach(([x, y]) => { ctx.beginPath(); ctx.moveTo(x - 9, y); ctx.quadraticCurveTo(x - 4, y - 7, x, y); ctx.quadraticCurveTo(x + 4, y - 7, x + 9, y); ctx.stroke(); }); ctx.restore();
      handCap(ctx, capOf(st), 260, 972, 280, 44, '#fff6e0');
    },
  });

  /* --- Cherry blossom (2 cuts) --- */
  themed.push({
    id: 'blossom', label: 'Cherry Blossom', cuts: 2, crop: [0, 0, 480, 900],
    ph: '#fdeef3', ink: '#c9577a', holeColor: '#fffafb',
    slots: [{ x: 50, y: 80, w: 380, h: 290 }, { x: 50, y: 405, w: 380, h: 290 }],
    bg(ctx) { ctx.fillStyle = lin(ctx, 0, 0, 0, 900, [[0, '#fde3ec'], [1, '#fff4ee']]); ctx.fillRect(0, 0, 480, 900); },
    body(ctx, st, d) { panelFrames(ctx, d, 13, '#fff'); },
    front(ctx, st) {
      ctx.save(); ctx.strokeStyle = '#6b4a3a'; ctx.lineWidth = 7; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(490, 20); ctx.bezierCurveTo(400, 30, 330, 60, 230, 40); ctx.stroke(); ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(380, 40); ctx.quadraticCurveTo(420, 90, 440, 120); ctx.moveTo(300, 52); ctx.quadraticCurveTo(290, 80, 262, 100); ctx.stroke(); ctx.restore();
      [[230, 40, 20], [300, 56, 16], [262, 100, 17], [380, 42, 18], [440, 122, 16], [330, 30, 14], [420, 30, 15], [205, 52, 12]].forEach(([x, y, R], i) => blossom(ctx, x, y, R, '#f9c6d4', '#d9577a', i));
      scatter(ctx, 22, 480, 900, 6, (x, y, r) => { ctx.save(); ctx.translate(x, y); ctx.rotate(r() * 6); ctx.fillStyle = 'rgba(249,198,212,.9)'; ctx.beginPath(); ctx.ellipse(0, 0, 7, 4, 0, 0, TAU); ctx.fill(); ctx.restore(); });
      blossom(ctx, 46, 740, 24, '#f9c6d4', '#d9577a', 0.4); blossom(ctx, 90, 780, 18, '#fbd8e2', '#d9577a', 1); leaf(ctx, 30, 770, 40, -0.6, '#8fbf7a');
      handCap(ctx, capOf(st), 250, 800, 280, 52, '#c9577a');
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

  const ORDER = ['star_spiral', 'wine_seal', 'story_love', 'snoopy_love', 'news_pin', 'camera', 'disco_pink', 'letter_check', 'red_cassette', 'cocoa_stars', 'denim_cat', 'beige_check', 'denim_rip', 'ocean_blue', 'jazz_red', 'floral_lace', 'airmail', 'pink_check', 'meadow', 'dream_sky', 'enchanted', 'galaxy', 'sunset_palm', 'blossom'];
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

  const state = { count: 3, lastClassicCount: 4, shape: 'rounded', frame: 'story_love', face: 'none', filter: 'none', photos: [] };
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

  /* ----- face geometry (eyes, nose, mouth) + filters ----- */
  const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
  const MP_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21';
  const LM_NEEDED = [1, 2, 10, 13, 14, 33, 61, 133, 152, 168, 234, 263, 291, 362, 454, 468, 473];

  /* P(i) -> {x,y} in video pixels. Output is expressed in a face-local frame:
     origin between the eyes, x along the eye line, unit u = eye distance. */
  function faceGeometry(P) {
    const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    let eA = P(468) || mid(P(33), P(133)), eB = P(473) || mid(P(362), P(263));
    if (eA.x > eB.x) [eA, eB] = [eB, eA];
    const o = mid(eA, eB), roll = Math.atan2(eB.y - eA.y, eB.x - eA.x), u = Math.hypot(eB.x - eA.x, eB.y - eA.y) || 1;
    const c = Math.cos(roll), s = Math.sin(roll);
    const L = (p) => { const dx = p.x - o.x, dy = p.y - o.y; return { x: dx * c + dy * s, y: -dx * s + dy * c }; };
    const g = { o, roll, u, eyeA: L(eA), eyeB: L(eB), nose: L(P(1)), noseBase: L(P(2)), bridge: L(P(168)), top: L(P(10)), chin: L(P(152)),
      mouthTop: L(P(13)), mouthBot: L(P(14)), mouthA: L(P(61)), mouthB: L(P(291)), cheekA: L(P(234)), cheekB: L(P(454)) };
    if (g.mouthA.x > g.mouthB.x) [g.mouthA, g.mouthB] = [g.mouthB, g.mouthA];
    if (g.cheekA.x > g.cheekB.x) [g.cheekA, g.cheekB] = [g.cheekB, g.cheekA];
    g.mouthC = { x: (g.mouthA.x + g.mouthB.x) / 2, y: (g.mouthTop.y + g.mouthBot.y) / 2 };
    g.mouthW = g.mouthB.x - g.mouthA.x;
    g.mouthOpen = Math.max(0, g.mouthBot.y - g.mouthTop.y) / u;
    return g;
  }

  /* Used only if the tracking model cannot load: a face-shaped guess in the middle of the frame. */
  function defaultGeometry(W, H) {
    const u = Math.min(W, H) * 0.2;
    return { o: { x: W / 2, y: H * 0.42 }, roll: 0, u, eyeA: { x: -u / 2, y: 0 }, eyeB: { x: u / 2, y: 0 }, nose: { x: 0, y: 0.62 * u }, noseBase: { x: 0, y: 0.85 * u },
      bridge: { x: 0, y: 0.2 * u }, top: { x: 0, y: -1.05 * u }, chin: { x: 0, y: 2.1 * u }, mouthTop: { x: 0, y: 1.22 * u }, mouthBot: { x: 0, y: 1.26 * u },
      mouthA: { x: -0.45 * u, y: 1.24 * u }, mouthB: { x: 0.45 * u, y: 1.24 * u }, cheekA: { x: -1.15 * u, y: 0.8 * u }, cheekB: { x: 1.15 * u, y: 0.8 * u },
      mouthC: { x: 0, y: 1.24 * u }, mouthW: 0.9 * u, mouthOpen: 0.04 };
  }

  const ell = (ctx, x, y, rx, ry, fill, rot = 0) => { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot, 0, TAU); ctx.fillStyle = fill; ctx.fill(); };

  function floppyEar(ctx, x, y, u, side) {
    const p = () => { ctx.beginPath(); ctx.moveTo(-0.12 * u, 0); ctx.bezierCurveTo(0.15 * u, -0.4 * u, 0.75 * u, -0.25 * u, 0.8 * u, 0.3 * u); ctx.bezierCurveTo(0.85 * u, 0.75 * u, 0.45 * u, 0.9 * u, 0.3 * u, 0.55 * u); ctx.bezierCurveTo(0.2 * u, 0.35 * u, -0.05 * u, 0.25 * u, -0.12 * u, 0); ctx.closePath(); };
    ctx.save(); ctx.translate(x, y); ctx.scale(side, 1);
    p(); ctx.fillStyle = lin(ctx, 0, -0.3 * u, 0.8 * u, 0.8 * u, [[0, '#b9803f'], [1, '#7d5224']]); ctx.fill();
    ctx.save(); ctx.translate(0.05 * u, 0.04 * u); ctx.scale(0.66, 0.66); p(); ctx.fillStyle = '#e9a9a2'; ctx.fill(); ctx.restore(); ctx.restore();
  }
  function pointedEar(ctx, x, y, u, side, tilt, outer, inner, len = 1) {
    const p = (k) => { ctx.beginPath(); ctx.moveTo(-0.22 * u * k, 0); ctx.bezierCurveTo(-0.28 * u * k, -0.55 * u * len, 0.02 * u * k, -0.95 * u * len, 0.2 * u * k, -0.9 * u * len); ctx.bezierCurveTo(0.5 * u * k, -0.7 * u * len, 0.5 * u * k, -0.2 * u * len, 0.34 * u * k, 0.08 * u); ctx.closePath(); };
    ctx.save(); ctx.translate(x, y); ctx.rotate(side * tilt); ctx.scale(side, 1);
    p(1); ctx.fillStyle = outer; ctx.fill(); ctx.save(); ctx.translate(0.04 * u, -0.04 * u); ctx.scale(0.62, 0.7); p(1); ctx.fillStyle = inner; ctx.fill(); ctx.restore(); ctx.restore();
  }
  function dogSnout(ctx, g, u) {
    const x = g.nose.x, y = g.nose.y;
    ell(ctx, x, y + 0.02 * u, 0.3 * u, 0.2 * u, '#c88e52'); ell(ctx, x, y - 0.03 * u, 0.17 * u, 0.1 * u, '#4a2e22'); ell(ctx, x - 0.06 * u, y - 0.06 * u, 0.05 * u, 0.022 * u, 'rgba(255,255,255,.55)');
    ctx.fillStyle = 'rgba(80,45,25,.6)'; [[-0.2, 0.05], [-0.14, 0.12], [0.2, 0.05], [0.14, 0.12], [-0.22, 0.0], [0.22, 0.0]].forEach(([dx, dy]) => { ctx.beginPath(); ctx.arc(x + dx * u, y + dy * u, 0.012 * u, 0, TAU); ctx.fill(); });
  }
  function tongue(ctx, g, u) {
    if (g.mouthOpen < 0.12) return;
    const x = g.mouthC.x, y = g.mouthBot.y - 0.02 * u, len = Math.min(0.8, 0.32 + g.mouthOpen * 0.9) * u;
    ctx.beginPath(); ctx.moveTo(x - 0.17 * u, y); ctx.bezierCurveTo(x - 0.2 * u, y + len * 0.7, x - 0.09 * u, y + len, x, y + len); ctx.bezierCurveTo(x + 0.09 * u, y + len, x + 0.2 * u, y + len * 0.7, x + 0.17 * u, y); ctx.closePath();
    ctx.fillStyle = lin(ctx, 0, y, 0, y + len, [[0, '#f08a95'], [1, '#c43d55']]); ctx.fill();
    ctx.strokeStyle = '#a22d45'; ctx.lineWidth = 0.02 * u; ctx.beginPath(); ctx.moveTo(x, y + 0.04 * u); ctx.lineTo(x, y + len * 0.7); ctx.stroke();
  }
  function lensFrames(ctx, g, u, o = {}) {
    const lw = (o.w || 0.92) * u, lh = (o.h || 0.7) * u, r = (o.r || 0.18) * u;
    ctx.save(); ctx.lineJoin = 'round'; ctx.strokeStyle = '#111'; ctx.fillStyle = '#111';
    [g.eyeA, g.eyeB].forEach((e) => {
      ctx.fillStyle = 'rgba(255,255,255,.06)'; ctx.beginPath(); ctx.roundRect(e.x - lw / 2, e.y - lh / 2 + 0.02 * u, lw, lh, r); ctx.fill();
      ctx.lineWidth = 0.085 * u; ctx.beginPath(); ctx.roundRect(e.x - lw / 2, e.y - lh / 2 + 0.02 * u, lw, lh, r); ctx.stroke();
      ctx.fillStyle = '#111'; ctx.beginPath(); ctx.roundRect(e.x - lw / 2 - 0.03 * u, e.y - lh / 2 - 0.05 * u, lw + 0.06 * u, 0.15 * u, 0.07 * u); ctx.fill();
    });
    ctx.lineWidth = 0.06 * u; ctx.beginPath(); ctx.moveTo(g.eyeA.x + lw / 2, g.eyeA.y - 0.1 * u); ctx.quadraticCurveTo((g.eyeA.x + g.eyeB.x) / 2, g.eyeA.y - 0.2 * u, g.eyeB.x - lw / 2, g.eyeB.y - 0.1 * u); ctx.stroke();
    ctx.lineWidth = 0.05 * u; ctx.beginPath(); ctx.moveTo(g.eyeA.x - lw / 2, g.eyeA.y - 0.08 * u); ctx.lineTo(g.eyeA.x - lw / 2 - 0.4 * u, g.eyeA.y - 0.02 * u); ctx.moveTo(g.eyeB.x + lw / 2, g.eyeB.y - 0.08 * u); ctx.lineTo(g.eyeB.x + lw / 2 + 0.4 * u, g.eyeB.y - 0.02 * u); ctx.stroke();
    ctx.restore(); return lw;
  }
  function catEar(ctx, x, y, u, side, col, inner) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(side * 0.3);
    ctx.beginPath(); ctx.moveTo(-0.3 * u, 0); ctx.quadraticCurveTo(-0.32 * u, -0.5 * u, -0.02 * u, -0.88 * u); ctx.quadraticCurveTo(0.32 * u, -0.5 * u, 0.3 * u, 0); ctx.closePath(); ctx.fillStyle = col; ctx.fill();
    ctx.beginPath(); ctx.moveTo(-0.16 * u, -0.02 * u); ctx.quadraticCurveTo(-0.17 * u, -0.4 * u, -0.01 * u, -0.62 * u); ctx.quadraticCurveTo(0.17 * u, -0.4 * u, 0.16 * u, -0.02 * u); ctx.closePath(); ctx.fillStyle = inner; ctx.fill(); ctx.restore();
  }
  function whiskers(ctx, g, u, col = 'rgba(40,40,40,.85)') {
    ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = 0.022 * u; ctx.lineCap = 'round';
    [-1, 1].forEach((s) => [-0.08, 0.04, 0.16].forEach((dy, i) => { ctx.beginPath(); ctx.moveTo(g.nose.x + s * 0.22 * u, g.nose.y + 0.08 * u + dy * u * 0.4); ctx.quadraticCurveTo(g.nose.x + s * 0.55 * u, g.nose.y + 0.04 * u + dy * u, g.nose.x + s * 0.95 * u, g.nose.y + (dy - 0.06 + i * 0.05) * u); ctx.stroke(); }));
    ctx.restore();
  }

  const FACE_FILTERS = {
    puppy(ctx, u, g) { floppyEar(ctx, g.cheekA.x * 0.75, g.top.y + 0.12 * u, u, -1); floppyEar(ctx, g.cheekB.x * 0.75, g.top.y + 0.12 * u, u, 1); dogSnout(ctx, g, u); tongue(ctx, g, u); },
    nerd_pup(ctx, u, g) {
      pointedEar(ctx, g.cheekA.x * 0.6, g.top.y + 0.16 * u, u, -1, 0.35, '#b98a52', '#e8aaa5'); pointedEar(ctx, g.cheekB.x * 0.6, g.top.y + 0.16 * u, u, 1, 0.35, '#b98a52', '#e8aaa5');
      dogSnout(ctx, g, u); tongue(ctx, g, u); lensFrames(ctx, g, u);
    },
    kitty_glasses(ctx, u, g) {
      const lw = lensFrames(ctx, g, u, { w: 0.94, h: 0.74, r: 0.3 });
      ctx.fillStyle = '#111';
      [-1, 1].forEach((s) => { const e = s < 0 ? g.eyeA : g.eyeB; [-0.12, 0.06, 0.24].forEach((dy, i) => { const bx = e.x + s * (lw / 2 + 0.03 * u), by = e.y + 0.1 * u + dy * u; ctx.beginPath(); ctx.moveTo(bx, by - 0.05 * u); ctx.quadraticCurveTo(bx + s * 0.18 * u, by - 0.02 * u + i * 0.03 * u, bx + s * 0.34 * u, by + i * 0.05 * u); ctx.quadraticCurveTo(bx + s * 0.16 * u, by + 0.07 * u, bx, by + 0.05 * u); ctx.closePath(); ctx.fill(); }); });
      bow(ctx, g.eyeB.x + lw / 2 + 0.02 * u, g.eyeB.y - 0.38 * u, 0.15 * u, { fill: '#d0192d', hi: '#f0485a', shade: 'rgba(80,0,10,.4)', rot: 0.5 });
    },
    cat(ctx, u, g) { catEar(ctx, g.cheekA.x * 0.62, g.top.y + 0.14 * u, u, -1, '#4a4a58', '#f2a9b8'); catEar(ctx, g.cheekB.x * 0.62, g.top.y + 0.14 * u, u, 1, '#4a4a58', '#f2a9b8'); ctx.fillStyle = '#f48aa8'; ctx.beginPath(); ctx.moveTo(g.nose.x - 0.09 * u, g.nose.y - 0.03 * u); ctx.lineTo(g.nose.x + 0.09 * u, g.nose.y - 0.03 * u); ctx.lineTo(g.nose.x, g.nose.y + 0.08 * u); ctx.closePath(); ctx.fill(); whiskers(ctx, g, u); },
    bunny(ctx, u, g) {
      [-1, 1].forEach((s) => { ctx.save(); ctx.translate(s * g.cheekB.x * 0.38, g.top.y - 0.35 * u); ctx.rotate(s * 0.14); ell(ctx, 0, 0, 0.21 * u, 0.74 * u, '#fffafc'); ell(ctx, 0, 0.05 * u, 0.1 * u, 0.55 * u, '#f6b4c4'); ctx.restore(); });
      ell(ctx, g.nose.x, g.nose.y, 0.07 * u, 0.05 * u, '#f48aa8'); whiskers(ctx, g, u, 'rgba(120,100,110,.8)');
    },
    bear(ctx, u, g) { [g.cheekA.x, g.cheekB.x].forEach((cx, i) => { const x = cx * 0.66; ell(ctx, x, g.top.y + 0.08 * u, 0.28 * u, 0.28 * u, '#a67b57'); ell(ctx, x, g.top.y + 0.1 * u, 0.15 * u, 0.15 * u, '#d9b98f'); }); ell(ctx, g.nose.x, g.nose.y + 0.04 * u, 0.24 * u, 0.17 * u, '#e8cfae'); ell(ctx, g.nose.x, g.nose.y - 0.02 * u, 0.1 * u, 0.065 * u, '#3a2418'); },
    flower_crown(ctx, u, g) {
      const cols = ['#f48aa8', '#fffafc', '#f8d26a', '#b890e8', '#f4a0a0', '#fffafc', '#f48aa8'];
      const pts = [-1, -0.66, -0.33, 0, 0.33, 0.66, 1].map((t) => ({ x: t * g.cheekB.x * 0.82, y: g.top.y + 0.14 * u + 0.28 * u * t * t }));
      for (let i = 0; i < pts.length - 1; i++) leaf(ctx, pts[i].x, pts[i].y, 0.22 * u, 0.9 + (i % 2) * 1.2, '#5fae5a');
      pts.forEach((p, i) => flower(ctx, p.x, p.y, 0.22 * u, cols[i], 'rgba(0,0,0,.15)', '#f8d26a', i));
    },
    tiara(ctx, u, g) {
      const y = g.top.y + 0.18 * u, k = u;
      ctx.beginPath(); [[-0.62, 0], [-0.62, -0.28], [-0.42, -0.12], [-0.3, -0.5], [-0.14, -0.16], [0, -0.68], [0.14, -0.16], [0.3, -0.5], [0.42, -0.12], [0.62, -0.28], [0.62, 0]].forEach(([x, h], i) => (i ? ctx.lineTo(x * k, y + h * k) : ctx.moveTo(x * k, y + h * k))); ctx.closePath();
      ctx.fillStyle = lin(ctx, -0.6 * k, y - 0.6 * k, 0.6 * k, y, [[0, '#fff1a8'], [0.5, '#e9b73a'], [1, '#b8821a']]); ctx.fill(); ctx.strokeStyle = '#9a6a10'; ctx.lineWidth = 0.02 * k; ctx.stroke();
      [[0, -0.7, '#f06aa0'], [-0.3, -0.52, '#6ab8f0'], [0.3, -0.52, '#6ab8f0'], [-0.62, -0.3, '#fff'], [0.62, -0.3, '#fff']].forEach(([x, h, c]) => { ell(ctx, x * k, y + h * k, 0.05 * k, 0.05 * k, c); });
    },
    heart_eyes(ctx, u, g, t) {
      const pulse = 1 + 0.12 * Math.sin(t * 6);
      [g.eyeA, g.eyeB].forEach((e) => { heartPath(ctx, e.x, e.y - 0.02 * u, 0.4 * u * pulse); ctx.fillStyle = '#ff3b6b'; ctx.fill(); ell(ctx, e.x - 0.12 * u, e.y - 0.12 * u, 0.06 * u, 0.04 * u, 'rgba(255,255,255,.75)', -0.6); });
      for (let k = 0; k < 3; k++) { const ph = (t * 0.5 + k / 3) % 1; heartPath(ctx, (k - 1) * 0.5 * u, g.top.y - ph * 0.6 * u, 0.12 * u * (1 - ph * 0.4)); ctx.fillStyle = `rgba(255,90,130,${1 - ph})`; ctx.fill(); }
    },
    sunnies(ctx, u, g) {
      [g.eyeA, g.eyeB].forEach((e) => { ctx.beginPath(); ctx.arc(e.x, e.y + 0.02 * u, 0.48 * u, 0, TAU); ctx.fillStyle = lin(ctx, e.x, e.y - 0.4 * u, e.x, e.y + 0.5 * u, [[0, '#2a2438'], [1, '#08060e']]); ctx.fill(); ctx.strokeStyle = '#d9a73a'; ctx.lineWidth = 0.05 * u; ctx.stroke(); ell(ctx, e.x - 0.18 * u, e.y - 0.16 * u, 0.12 * u, 0.05 * u, 'rgba(255,255,255,.4)', -0.6); });
      ctx.strokeStyle = '#d9a73a'; ctx.lineWidth = 0.05 * u; ctx.beginPath(); ctx.moveTo(g.eyeA.x + 0.48 * u, g.eyeA.y - 0.05 * u); ctx.quadraticCurveTo(0, g.eyeA.y - 0.18 * u, g.eyeB.x - 0.48 * u, g.eyeB.y - 0.05 * u); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(g.eyeA.x - 0.48 * u, g.eyeA.y); ctx.lineTo(g.eyeA.x - 0.85 * u, g.eyeA.y - 0.04 * u); ctx.moveTo(g.eyeB.x + 0.48 * u, g.eyeB.y); ctx.lineTo(g.eyeB.x + 0.85 * u, g.eyeB.y - 0.04 * u); ctx.stroke();
    },
    mustache(ctx, u, g) {
      const y = g.noseBase.y + (g.mouthTop.y - g.noseBase.y) * 0.45, w = Math.max(g.mouthW, 0.6 * u) / 0.9;
      ctx.fillStyle = '#2a1810'; ctx.save(); ctx.translate(g.mouthC.x, y); ctx.scale(w / (1.2 * u), 1);
      [-1, 1].forEach((m) => { ctx.beginPath(); ctx.moveTo(0, -0.02 * u); ctx.bezierCurveTo(m * 0.1 * u, -0.16 * u, m * 0.4 * u, -0.14 * u, m * 0.58 * u, -0.02 * u); ctx.bezierCurveTo(m * 0.72 * u, 0.04 * u, m * 0.8 * u, -0.08 * u, m * 0.72 * u, -0.18 * u); ctx.bezierCurveTo(m * 0.88 * u, -0.02 * u, m * 0.7 * u, 0.2 * u, m * 0.45 * u, 0.12 * u); ctx.bezierCurveTo(m * 0.25 * u, 0.06 * u, m * 0.1 * u, 0.1 * u, 0, 0.08 * u); ctx.closePath(); ctx.fill(); });
      ctx.restore();
    },
    blush(ctx, u, g) {
      [g.eyeA, g.eyeB].forEach((e) => { const x = e.x + (e === g.eyeA ? -0.05 : 0.05) * u, y = g.noseBase.y + 0.04 * u, gr = ctx.createRadialGradient(x, y, 0, x, y, 0.36 * u); gr.addColorStop(0, 'rgba(255,100,140,.55)'); gr.addColorStop(1, 'rgba(255,100,140,0)'); ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, 0.36 * u, 0, TAU); ctx.fill(); });
      ctx.fillStyle = 'rgba(150,80,50,.55)'; const r = rng(3); for (let i = 0; i < 14; i++) { ctx.beginPath(); ctx.arc(g.nose.x + (r() - 0.5) * 0.9 * u, g.nose.y - 0.18 * u + r() * 0.22 * u, 0.014 * u, 0, TAU); ctx.fill(); }
    },
    halo(ctx, u, g, t) { const y = g.top.y - 0.3 * u + Math.sin(t * 2) * 0.03 * u; ctx.save(); ctx.shadowColor = 'rgba(255,230,120,.95)'; ctx.shadowBlur = 0.2 * u; ctx.strokeStyle = '#ffd84a'; ctx.lineWidth = 0.08 * u; ctx.beginPath(); ctx.ellipse(0, y, 0.55 * u, 0.14 * u, 0, 0, TAU); ctx.stroke(); ctx.restore(); },
    devil(ctx, u, g) {
      [-1, 1].forEach((s) => { ctx.save(); ctx.translate(s * g.cheekB.x * 0.5, g.top.y + 0.1 * u); ctx.scale(s, 1); ctx.beginPath(); ctx.moveTo(-0.12 * u, 0); ctx.bezierCurveTo(-0.05 * u, -0.4 * u, 0.1 * u, -0.6 * u, 0.38 * u, -0.72 * u); ctx.bezierCurveTo(0.28 * u, -0.45 * u, 0.24 * u, -0.2 * u, 0.16 * u, 0.03 * u); ctx.closePath(); ctx.fillStyle = lin(ctx, 0, -0.7 * u, 0, 0, [[0, '#ff4a56'], [1, '#8a0f1c']]); ctx.fill(); ctx.restore(); });
    },
  };

  const FACE_LIST = [['none', 'None'], ['puppy', 'Puppy'], ['nerd_pup', 'Nerd Pup'], ['kitty_glasses', 'Kitty Glasses'], ['cat', 'Cat Ears'], ['bunny', 'Bunny'], ['bear', 'Teddy'], ['flower_crown', 'Flower Crown'], ['tiara', 'Tiara'], ['heart_eyes', 'Heart Eyes'], ['sunnies', 'Sunnies'], ['mustache', 'Mustache'], ['blush', 'Blush'], ['halo', 'Halo'], ['devil', 'Devil Horns']];

  function drawFaceFilter(ctx, id, g, t = 0) {
    const f = FACE_FILTERS[id]; if (!f) return;
    ctx.save(); ctx.translate(g.o.x, g.o.y); ctx.rotate(g.roll); f(ctx, g.u, g, t); ctx.restore();
  }

  /* ----- colour filters ----- */
  const TINTS = {
    peach: 'rgba(255,160,122,.18)', strawberry: 'rgba(255,105,180,.18)', dreamy: 'rgba(186,150,255,.22)', mint: 'rgba(135,235,190,.16)',
    sunset: 'rgba(255,180,50,.18)', vintage: 'rgba(120,80,40,.2)', cool: 'rgba(90,150,255,.2)', golden: 'rgba(255,205,90,.22)', rose: 'rgba(255,140,170,.22)',
  };
  const LIVE_CSS = { bw: 'grayscale(1) contrast(1.1)', noir: 'grayscale(1) contrast(1.5) brightness(.85)', sepia: 'sepia(.9)', vivid: 'saturate(1.6) contrast(1.05)' };
  const clamp255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);
  const PIXEL_FX = {
    bw(p) { for (let i = 0; i < p.length; i += 4) { const v = clamp255((0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2] - 128) * 1.1 + 128); p[i] = p[i + 1] = p[i + 2] = v; } },
    noir(p) { for (let i = 0; i < p.length; i += 4) { const v = clamp255((0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2] - 128) * 1.5 + 108); p[i] = p[i + 1] = p[i + 2] = v; } },
    sepia(p) { for (let i = 0; i < p.length; i += 4) { const r = p[i], g = p[i + 1], b = p[i + 2]; p[i] = clamp255(0.393 * r + 0.769 * g + 0.189 * b); p[i + 1] = clamp255(0.349 * r + 0.686 * g + 0.168 * b); p[i + 2] = clamp255(0.272 * r + 0.534 * g + 0.131 * b); } },
    vivid(p) { for (let i = 0; i < p.length; i += 4) { const a = (p[i] + p[i + 1] + p[i + 2]) / 3; p[i] = clamp255(a + (p[i] - a) * 1.55); p[i + 1] = clamp255(a + (p[i + 1] - a) * 1.55); p[i + 2] = clamp255(a + (p[i + 2] - a) * 1.55); } },
  };

  /* Halftone dots on a 45-degree grid. Reads pixels from `src`, paints onto `out` (W x H). */
  function halftone(out, src, W, H, colour) {
    const sw = src.width, sh2 = src.height, d = src.getContext('2d').getImageData(0, 0, sw, sh2).data;
    const step = Math.max(6, Math.round(W / 100)), diag = Math.hypot(W, H), k = Math.SQRT1_2;
    out.save(); out.fillStyle = '#fff'; out.fillRect(0, 0, W, H);
    for (let gy = -diag / 2; gy < diag / 2; gy += step) for (let gx = -diag / 2; gx < diag / 2; gx += step) {
      const x = W / 2 + (gx - gy) * k, y = H / 2 + (gx + gy) * k;
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const i = (((y * sh2) / H | 0) * sw + ((x * sw) / W | 0)) * 4, lum = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) / 255;
      const r = Math.pow(1 - lum, 0.85) * step * 0.78; if (r < 0.5) continue;
      out.fillStyle = colour ? `rgb(${d[i]},${d[i + 1]},${d[i + 2]})` : '#111'; out.beginPath(); out.arc(x, y, r, 0, TAU); out.fill();
    }
    out.restore();
  }

  function applyColorFilter(g, c) {
    const f = state.filter, W = c.width, H = c.height;
    if (TINTS[f]) { g.fillStyle = TINTS[f]; g.fillRect(0, 0, W, H); }
    else if (f === 'halftone' || f === 'pop') halftone(g, c, W, H, f === 'pop');
    else if (PIXEL_FX[f]) { const im = g.getImageData(0, 0, W, H); PIXEL_FX[f](im.data); g.putImageData(im, 0, 0); }
  }

  const tintEl = $('tint');
  function applyLiveFilter() {
    if (video) video.style.filter = LIVE_CSS[state.filter] || '';
    if (tintEl) tintEl.style.background = TINTS[state.filter] || 'transparent';
  }

  /* ----- tracker (MediaPipe Face Landmarker, loaded on first use) ----- */
  const faceStatus = $('faceStatus');
  let landmarker = null, tracker = 'idle', lastFaces = [], lastVT = -1, lastTs = 0, smooth = [], statusText = '';
  function setStatus(msg) { if (msg !== statusText && faceStatus) { statusText = msg; faceStatus.textContent = msg; } }

  async function loadTracker() {
    if (tracker !== 'idle') return;
    tracker = 'loading'; setStatus('Loading face tracking…');
    try {
      const vision = await import(`${MP_BASE}/vision_bundle.mjs`);
      const fileset = await vision.FilesetResolver.forVisionTasks(`${MP_BASE}/wasm`);
      const make = (delegate) => vision.FaceLandmarker.createFromOptions(fileset, { baseOptions: { modelAssetPath: MODEL_URL, delegate }, runningMode: 'VIDEO', numFaces: 3 });
      try { landmarker = await make('GPU'); } catch (e) { landmarker = await make('CPU'); }
      tracker = 'ready'; statusText = '';
    } catch (e) {
      console.warn('Face tracking unavailable:', e); tracker = 'failed';
      setStatus('Face tracking could not load, so filters sit in the middle of the frame. Check your connection and reload.');
    }
  }

  function detect() {
    if (tracker !== 'ready' || !video || !video.videoWidth) return lastFaces;
    if (video.currentTime === lastVT) return lastFaces;
    const W = video.videoWidth, H = video.videoHeight, ts = Math.max(performance.now(), lastTs + 1);
    try {
      const res = landmarker.detectForVideo(video, ts); lastTs = ts; lastVT = video.currentTime;
      const out = [];
      (res.faceLandmarks || []).forEach((lm, n) => {
        const prev = smooth[n] || {}, cur = {};
        LM_NEEDED.forEach((i) => { const q = lm[i]; if (!q) return; const p = prev[i]; cur[i] = p ? { x: p.x * 0.35 + q.x * 0.65, y: p.y * 0.35 + q.y * 0.65 } : { x: q.x, y: q.y }; });
        smooth[n] = cur;
        out.push(faceGeometry((i) => (cur[i] ? { x: cur[i].x * W, y: cur[i].y * H } : null)));
      });
      smooth.length = out.length; lastFaces = out;
    } catch (e) { console.warn('Face detection error:', e); }
    return lastFaces;
  }

  function getFaces(W, H) { return tracker === 'failed' ? [defaultGeometry(W, H)] : detect(); }

  function drawFaces(ctx, W, H, faces, mirror) {
    if (state.face === 'none' || !faces.length) return;
    ctx.save(); if (mirror) { ctx.translate(W, 0); ctx.scale(-1, 1); }
    const t = performance.now() / 1000; faces.forEach((g) => drawFaceFilter(ctx, state.face, g, t)); ctx.restore();
  }

  function updateStatus(faces) {
    if (tracker === 'loading') setStatus('Loading face tracking…');
    else if (tracker === 'ready') setStatus(faces.length ? `Tracking ${faces.length} ${faces.length === 1 ? 'face' : 'faces'}.` : 'No face in view. Look at the camera.');
  }

  /* ----- camera ----- */
  const liveSample = document.createElement('canvas'); liveSample.width = 200; liveSample.height = 150;
  async function initCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      if (video) {
        video.srcObject = stream; video.muted = true;
        video.onloadedmetadata = () => {
          const vw = video.videoWidth || 640, vh = video.videoHeight || 480;
          if (overlayCanvas) { overlayCanvas.width = vw; overlayCanvas.height = vh; }
          liveSample.height = Math.round((200 * vh) / vw);
          const wrap = $('cameraWrapper'); if (wrap) wrap.style.aspectRatio = `${vw} / ${vh}`;
          startOverlay();
        };
        const p = video.play(); if (p && p.catch) p.catch(() => {});
      }
    } catch (err) {
      console.error('Camera access error:', err);
      const msg = $('cameraMsg');
      if (msg) { msg.textContent = 'Camera is blocked. Allow camera access in your browser settings, then reload.'; msg.classList.remove('hidden'); }
      cameraStarted = false;
    }
  }

  function startOverlay() {
    if (!ctxOverlay || animating) return;
    animating = true;
    const loop = () => {
      requestAnimationFrame(loop);
      if (!video || !video.videoWidth || video.readyState < 2) return;
      const W = overlayCanvas.width, H = overlayCanvas.height;
      ctxOverlay.clearRect(0, 0, W, H);
      if (state.filter === 'halftone' || state.filter === 'pop') { liveSample.getContext('2d').drawImage(video, 0, 0, liveSample.width, liveSample.height); halftone(ctxOverlay, liveSample, W, H, state.filter === 'pop'); }
      if (state.face !== 'none') { const faces = getFaces(W, H); drawFaces(ctxOverlay, W, H, faces, false); updateStatus(faces); }
    };
    loop();
  }

  function takeSnap() {
    if (!video || !video.videoWidth) return false;
    const W = video.videoWidth, H = video.videoHeight, c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.save(); g.scale(-1, 1); g.drawImage(video, -W, 0, W, H); g.restore();
    applyColorFilter(g, c);
    if (state.face !== 'none') drawFaces(g, W, H, getFaces(W, H), true);
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

  function bindPills(id, key, after) {
    const el = $(id); if (!el) return;
    el.querySelectorAll('.pill').forEach((b) => b.addEventListener('click', () => {
      el.querySelectorAll('.pill').forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
      state[key] = b.dataset[key];
      if (after) after();
      refreshPreview();
    }));
  }
  bindPills('shapeGroup', 'shape');
  bindPills('faceGroup', 'face', () => { if (state.face !== 'none') loadTracker(); else setStatus(''); });
  bindPills('filterGroup', 'filter', applyLiveFilter);
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

  window.AuraStudio.faces = { FACE_FILTERS, FACE_LIST, drawFaceFilter, defaultGeometry, faceGeometry, halftone };

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