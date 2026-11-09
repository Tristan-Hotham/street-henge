/* The Inked World: the page's ink scale bar, compass rose, decorative border and the "Ink your home" poster.
 * Dr Tristan Hotham, Independent researcher, 2026. MIT licence. */
(function (global) {
  'use strict';
  const INK = '#2B2119', PAPER = '#F3E5BF', RED = '#A3261B', GOLD = '#B8862B';
  const SERIF = '"Source Serif 4", Georgia, "Times New Roman", serif', HAND = 'MedievalSharp, "Fraunces", Georgia, serif';

  // ---------------- scale: a "nice" length that fits in maxPx at the centre of the view
  function metresPerPx(map) {
    const lat = map.getCenter().lat;
    return 40075016.686 * Math.cos(lat * Math.PI / 180) / (512 * Math.pow(2, map.getZoom()));
  }
  function niceScale(mpp, maxPx) {
    const maxM = mpp * maxPx, p = Math.pow(10, Math.floor(Math.log10(maxM)));
    let m = p; for (const k of [1, 2, 5]) if (k * p <= maxM) m = k * p;
    const km = m >= 1000;
    return { m, px: m / mpp, label: km ? (m / 1000).toLocaleString('en-GB') + ' km' : m.toLocaleString('en-GB') + ' m', half: km ? (m / 2000).toLocaleString('en-GB') : (m / 2).toLocaleString('en-GB') };
  }
  // drawn on a 2D canvas context: four segments, ink and paper by turns, between two hairlines, with figures above
  function drawScale(ctx, x, y, mpp, maxPx, s) {
    const sc = niceScale(mpp, maxPx), w = sc.px, h = 5 * s, seg = w / 4;
    ctx.save();
    ctx.fillStyle = 'rgba(243,229,191,0.82)'; ctx.fillRect(x - 6 * s, y - 15 * s, w + 34 * s, h + 20 * s);
    ctx.lineWidth = 1 * s; ctx.strokeStyle = INK;
    for (let i = 0; i < 4; i++) { ctx.fillStyle = i % 2 ? PAPER : INK; ctx.fillRect(x + i * seg, y, seg, h); }
    ctx.strokeRect(x, y, w, h);
    ctx.beginPath(); ctx.moveTo(x, y + h + 2 * s); ctx.lineTo(x + w, y + h + 2 * s); ctx.lineWidth = 0.6 * s; ctx.stroke();
    ctx.fillStyle = INK; ctx.font = `italic ${10 * s}px ${SERIF}`; ctx.textBaseline = 'bottom';
    ctx.textAlign = 'center'; ctx.fillText('0', x, y - 2 * s); ctx.fillText(sc.half, x + w / 2, y - 2 * s);
    ctx.textAlign = 'left'; ctx.fillText(sc.label, x + w - 4 * s, y - 2 * s);
    ctx.restore();
    return sc;
  }
  function scaleBar(map, el) {
    const c = document.createElement('canvas'); el.appendChild(c);
    const upd = () => {
      const dpr = window.devicePixelRatio || 1, W = 190, H = 34;
      c.width = W * dpr; c.height = H * dpr; c.style.width = W + 'px'; c.style.height = H + 'px';
      const ctx = c.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
      const sc = drawScale(ctx, 8, 20, metresPerPx(map), 130, 1);
      c.setAttribute('aria-label', 'Scale: ' + sc.label);
    };
    map.on('move', upd); upd();
    return c;
  }

  // ---------------- compass rose: eight points, half inked and half paper, a red north and a double ring
  function compassSVG(size) {
    const r = 46, pts = [];
    const tri = (a, len, wid, side) => { const ax = Math.cos(a), ay = Math.sin(a), bx = Math.cos(a + side * Math.PI / 2), by = Math.sin(a + side * Math.PI / 2); return `M50,50 L${50 + ax * len},${50 + ay * len} L${50 + bx * wid},${50 + by * wid} Z`; };
    for (let k = 0; k < 8; k++) {
      const a = -Math.PI / 2 + k * Math.PI / 4, big = k % 2 === 0, len = big ? 44 : 27, wid = big ? 7 : 5;
      const fillA = k === 0 ? RED : INK;
      pts.push(`<path d="${tri(a, len, wid, -1)}" fill="${fillA}" stroke="${INK}" stroke-width="0.9"/>`);
      pts.push(`<path d="${tri(a, len, wid, 1)}" fill="#FBF3DC" stroke="${INK}" stroke-width="0.9"/>`);
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -14 100 114" width="${size}" height="${size * 1.14}" aria-hidden="true">` +
      `<circle cx="50" cy="50" r="${r - 12}" fill="rgba(243,229,191,0.75)" stroke="${INK}" stroke-width="1.1"/><circle cx="50" cy="50" r="${r - 15}" fill="none" stroke="${INK}" stroke-width="0.5"/>` +
      Array.from({ length: 32 }, (_, i) => { const a = i * Math.PI / 16, r0 = r - 15, r1 = r - (i % 4 ? 13.5 : 12); return `<line x1="${50 + Math.cos(a) * r0}" y1="${50 + Math.sin(a) * r0}" x2="${50 + Math.cos(a) * r1}" y2="${50 + Math.sin(a) * r1}" stroke="${INK}" stroke-width="0.6"/>`; }).join('') +
      pts.join('') + `<circle cx="50" cy="50" r="3" fill="${GOLD}" stroke="${INK}" stroke-width="0.8"/>` +
      `<text x="50" y="2" text-anchor="middle" font-family="MedievalSharp, Georgia, serif" font-size="14" fill="${RED}">N</text></svg>`;
  }
  function svgImage(svg) {
    return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); });
  }

  // ---------------- decorative border: a manuscript margin. Two ink rules round a parchment band with a vine scroll (leaves,
  // berries and gilt dots), gilt corner roundels with a red quatrefoil, and drolleries in the bottom margin: small original
  // marginal creatures as in an illuminated manuscript (a snail, a hare with a pipe, a heron, a curled wyvern, an owl, a
  // fox), chosen by the part of the world in view
  const SAGE = '#7E9658', SAGEL = '#B9C98F', MADDER = '#A3261B', GILT = '#C9A24A', WOOL = '#E9DDBF';
  function rngF(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; }; }
  function vine(ctx, x0, y0, len, horiz, b, s, R) {
    // a stem winding along the band, with leaves on alternate sides and a berry at each crest
    const amp = b * 0.22, per = 34 * s, mid = b / 2;
    const P = t => horiz ? [x0 + t, y0 + mid + Math.sin(t / per * Math.PI * 2) * amp] : [x0 + mid + Math.sin(t / per * Math.PI * 2) * amp, y0 + t];
    ctx.strokeStyle = '#4E5E34'; ctx.lineWidth = 1.4 * s; ctx.beginPath();
    for (let t = 0; t <= len; t += 2 * s) { const p = P(t); t ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); }
    ctx.stroke();
    for (let t = per * 0.25, k = 0; t < len - 6 * s; t += per / 2, k++) {
      const p = P(t), side = k % 2 ? 1 : -1;
      const lx = horiz ? p[0] + 3 * s : p[0] + side * b * 0.18, ly = horiz ? p[1] + side * b * 0.18 : p[1] + 3 * s;
      // a trefoil leaf
      ctx.fillStyle = k % 3 === 2 ? GILT : SAGEL; ctx.strokeStyle = '#4E5E34'; ctx.lineWidth = 0.6 * s;
      for (const a of [-0.9, 0, 0.9]) { const ang = (horiz ? (side > 0 ? Math.PI / 2 : -Math.PI / 2) : (side > 0 ? 0 : Math.PI)) + a; ctx.beginPath(); ctx.ellipse(lx + Math.cos(ang) * 2.8 * s, ly + Math.sin(ang) * 2.8 * s, 2.9 * s, 1.6 * s, ang, 0, 7); ctx.fill(); ctx.stroke(); }
      if (k % 2 === 0) { const q = P(t + per / 4); ctx.fillStyle = MADDER; ctx.beginPath(); ctx.arc(q[0], q[1], 2 * s, 0, 7); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 0.5 * s; ctx.stroke(); }
      if (R() < 0.5) { const q = P(t - per / 6); ctx.fillStyle = GILT; ctx.beginPath(); ctx.arc(q[0] + (horiz ? 0 : side * 4 * s), q[1] + (horiz ? side * 4 * s : 0), 0.9 * s, 0, 7); ctx.fill(); }
    }
  }
  function roundel(ctx, cx, cy, r, s) {
    ctx.fillStyle = GILT; ctx.strokeStyle = INK; ctx.lineWidth = 1.2 * s;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = MADDER; ctx.lineWidth = 0.7 * s;
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2; ctx.beginPath(); ctx.arc(cx + Math.cos(a) * r * 0.32, cy + Math.sin(a) * r * 0.32, r * 0.34, 0, 7); ctx.fill(); ctx.stroke(); }
    ctx.fillStyle = GILT; ctx.beginPath(); ctx.arc(cx, cy, r * 0.2, 0, 7); ctx.fill(); ctx.stroke();
  }
  // the drolleries, each drawn in a 40 x 28 box (origin at its feet, centre bottom), in ink with flat muted fills
  const DROLL = {
    snail(c, s) {
      c.fillStyle = WOOL; c.beginPath(); c.moveTo(-15, 0); c.quadraticCurveTo(-4, -3, 12, 0); c.quadraticCurveTo(16, -2, 15, -7); c.lineTo(13, -6); c.quadraticCurveTo(12, -2, 4, -3); c.closePath(); c.fill(); c.stroke();
      c.beginPath(); c.moveTo(13, -6); c.lineTo(16, -13); c.moveTo(14.5, -6.5); c.lineTo(19, -12); c.stroke(); c.fillStyle = INK; c.beginPath(); c.arc(16, -13, 0.9, 0, 7); c.arc(19, -12, 0.9, 0, 7); c.fill();
      c.fillStyle = '#C9A24A'; c.beginPath(); c.arc(-2, -10, 9, 0, 7); c.fill(); c.stroke();
      c.beginPath(); for (let a = 0; a < 12; a += 0.2) { const r = 8.5 * (1 - a / 13); const px = -2 + Math.cos(a) * r, py = -10 + Math.sin(a) * r; a ? c.lineTo(px, py) : c.moveTo(px, py); } c.stroke();
    },
    hare(c, s) {
      c.fillStyle = '#B79870';
      c.beginPath(); c.moveTo(-10, 0); c.quadraticCurveTo(-14, -10, -7, -16); c.quadraticCurveTo(-1, -19, 2, -13); c.quadraticCurveTo(4, -6, 2, 0); c.closePath(); c.fill(); c.stroke();   // body sitting up
      c.beginPath(); c.ellipse(1, -19, 4, 3.4, -0.3, 0, 7); c.fill(); c.stroke();   // head
      c.beginPath(); c.ellipse(-1, -26, 1.4, 5, -0.25, 0, 7); c.fill(); c.stroke(); c.beginPath(); c.ellipse(2, -26.5, 1.4, 5.2, 0.15, 0, 7); c.fill(); c.stroke();   // ears
      c.fillStyle = INK; c.beginPath(); c.arc(2.4, -19.6, 0.7, 0, 7); c.fill();
      c.fillStyle = GILT; c.beginPath(); c.moveTo(4, -18); c.lineTo(15, -11); c.lineTo(16.5, -12.5); c.lineTo(5, -19.4); c.closePath(); c.fill(); c.stroke();   // a pipe
      c.beginPath(); c.moveTo(15.5, -11.7); c.lineTo(18, -9); c.lineTo(19, -14); c.closePath(); c.fill(); c.stroke();
      c.beginPath(); c.moveTo(-1, -12); c.quadraticCurveTo(4, -13, 7, -15); c.stroke();   // paw
      c.fillStyle = WOOL; c.beginPath(); c.arc(-11, -3, 2.2, 0, 7); c.fill(); c.stroke();   // tail
    },
    heron(c, s) {
      c.fillStyle = '#C7CFD3';
      c.beginPath(); c.moveTo(-8, -12); c.quadraticCurveTo(-2, -20, 6, -14); c.quadraticCurveTo(2, -8, -8, -12); c.closePath(); c.fill(); c.stroke();
      c.beginPath(); c.moveTo(4, -15); c.quadraticCurveTo(9, -20, 5, -24); c.quadraticCurveTo(3, -27, 7, -28); c.stroke();
      c.fillStyle = WOOL; c.beginPath(); c.ellipse(8, -28, 2.4, 1.8, 0, 0, 7); c.fill(); c.stroke();
      c.fillStyle = GILT; c.beginPath(); c.moveTo(10, -28.5); c.lineTo(17, -27.4); c.lineTo(10, -27); c.closePath(); c.fill(); c.stroke();
      c.beginPath(); c.moveTo(-1, -11); c.lineTo(0, 0); c.moveTo(1, -11); c.lineTo(3, -6); c.lineTo(0.5, -4); c.stroke();
      c.beginPath(); c.moveTo(-4, 0); c.lineTo(4, 0); c.stroke();
      c.strokeStyle = '#3D6E9E'; c.beginPath(); c.moveTo(-12, 1.5); c.quadraticCurveTo(-6, -0.5, 0, 1.5); c.quadraticCurveTo(6, 3, 12, 1.2); c.stroke(); c.strokeStyle = INK;
    },
    wyvern(c, s) {
      c.fillStyle = '#8FA58A';
      c.beginPath(); c.moveTo(-14, -2); c.quadraticCurveTo(-18, -10, -10, -9); c.quadraticCurveTo(-4, -8, -2, -12); c.quadraticCurveTo(2, -18, 8, -17); c.quadraticCurveTo(12, -16, 13, -20);
      c.lineTo(16, -18); c.quadraticCurveTo(14, -12, 8, -12); c.quadraticCurveTo(4, -6, 4, 0); c.lineTo(-2, 0); c.quadraticCurveTo(-4, -5, -9, -4); c.closePath(); c.fill(); c.stroke();
      c.fillStyle = MADDER; c.beginPath(); c.moveTo(0, -13); c.lineTo(-4, -24); c.lineTo(2, -20); c.lineTo(5, -26); c.lineTo(7, -18); c.closePath(); c.fill(); c.stroke();   // a wing
      c.fillStyle = INK; c.beginPath(); c.arc(13.4, -18.6, 0.7, 0, 7); c.fill();
      c.beginPath(); c.moveTo(16, -18.4); c.lineTo(19, -17); c.stroke(); c.beginPath(); c.moveTo(-14, -2); c.lineTo(-17, 0); c.lineTo(-14, 0.6); c.stroke();
    },
    owl(c, s) {
      c.fillStyle = '#B79870';
      c.beginPath(); c.ellipse(0, -10, 7, 10, 0, 0, 7); c.fill(); c.stroke();
      c.fillStyle = WOOL; c.beginPath(); c.arc(-2.8, -15, 2.6, 0, 7); c.arc(2.8, -15, 2.6, 0, 7); c.fill(); c.stroke();
      c.fillStyle = INK; c.beginPath(); c.arc(-2.8, -15, 0.9, 0, 7); c.arc(2.8, -15, 0.9, 0, 7); c.fill();
      c.fillStyle = GILT; c.beginPath(); c.moveTo(-1, -12.5); c.lineTo(1, -12.5); c.lineTo(0, -10.5); c.closePath(); c.fill(); c.stroke();
      c.beginPath(); c.moveTo(-6, -19); c.lineTo(-5, -22); c.lineTo(-3, -19.5); c.moveTo(6, -19); c.lineTo(5, -22); c.lineTo(3, -19.5); c.stroke();
      for (let k = 0; k < 3; k++) { c.beginPath(); c.arc(0, -7 + k * 2.6, 3, 0.4, Math.PI - 0.4); c.stroke(); }
      c.beginPath(); c.moveTo(-12, 0.5); c.lineTo(12, 0.5); c.stroke();
    },
    fox(c, s) {
      c.fillStyle = '#B4602E';
      c.beginPath(); c.moveTo(-12, -6); c.quadraticCurveTo(-4, -12, 6, -9); c.lineTo(9, -13); c.lineTo(10, -9); c.lineTo(15, -7); c.lineTo(10, -5); c.quadraticCurveTo(6, -3, 6, 0); c.lineTo(4, 0); c.lineTo(3, -3); c.lineTo(-6, -3); c.lineTo(-7, 0); c.lineTo(-9, 0); c.quadraticCurveTo(-10, -3, -12, -6); c.closePath(); c.fill(); c.stroke();
      c.beginPath(); c.moveTo(-12, -6); c.quadraticCurveTo(-20, -6, -19, -12); c.quadraticCurveTo(-15, -9, -11, -9); c.closePath(); c.fill(); c.stroke();
      c.fillStyle = WOOL; c.beginPath(); c.moveTo(-19, -12); c.lineTo(-17.4, -10.2); c.lineTo(-18.6, -9.6); c.closePath(); c.fill();
      c.fillStyle = INK; c.beginPath(); c.arc(10, -9.6, 0.6, 0, 7); c.fill();
    },
  };
  function drollSet(lon, lat) {
    if (lat > 55) return ['owl', 'hare', 'fox', 'heron'];
    if (Math.abs(lat) < 25) return ['heron', 'wyvern', 'snail', 'owl'];
    if (lon > 60) return ['heron', 'wyvern', 'fox', 'snail'];
    return ['snail', 'hare', 'heron', 'wyvern'];
  }
  function drawFrame(ctx, x, y, w, h, s, opt) {
    opt = opt || {};
    const small = Math.min(w, h) < 520 * s;
    const b = (small ? 16 : 24) * s, bb = (small ? 30 : 42) * s;   // side bands, and the deeper bottom margin
    const R = rngF(77);
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.fillStyle = 'rgba(243,229,191,0.95)';
    ctx.fillRect(x, y, w, b); ctx.fillRect(x, y + h - bb, w, bb); ctx.fillRect(x, y, b, h); ctx.fillRect(x + w - b, y, b, h);
    // a thin gilt wash just inside the outer rule
    ctx.strokeStyle = 'rgba(201,162,74,0.55)'; ctx.lineWidth = 2.2 * s; ctx.strokeRect(x + 3 * s, y + 3 * s, w - 6 * s, h - 6 * s);
    if (!small || true) {
      vine(ctx, x + b, y, w - 2 * b, true, b, s, R);
      vine(ctx, x, y + b, h - b - bb, false, b, s, R);
      vine(ctx, x + w - b, y + b, h - b - bb, false, b, s, R);
    }
    ctx.strokeStyle = INK; ctx.lineWidth = 1.7 * s; ctx.strokeRect(x + 0.9 * s, y + 0.9 * s, w - 1.8 * s, h - 1.8 * s);
    ctx.lineWidth = 1.0 * s; ctx.beginPath(); ctx.rect(x + b, y + b, w - 2 * b, h - b - bb); ctx.stroke();
    ctx.lineWidth = 0.5 * s; ctx.beginPath(); ctx.rect(x + b - 2.5 * s, y + b - 2.5 * s, w - 2 * b + 5 * s, h - b - bb + 5 * s); ctx.stroke();
    // the bottom margin: a ground line with tufts and the drolleries
    const gy = y + h - bb * 0.2;
    ctx.strokeStyle = '#5E6E3E'; ctx.lineWidth = 0.9 * s; ctx.beginPath(); ctx.moveTo(x + b * 1.6, gy); ctx.lineTo(x + w - b * 1.6, gy); ctx.stroke();
    for (let t = x + b * 2; t < x + w - b * 2; t += 26 * s) { ctx.beginPath(); for (const d of [-2, 0, 2]) { ctx.moveTo(t + d * s, gy); ctx.lineTo(t + d * 1.8 * s, gy - (3 + R() * 2) * s); } ctx.stroke(); }
    const set = opt.set || drollSet(opt.lon || 0, opt.lat || 50);
    const n = small ? 2 : Math.min(4, Math.max(2, Math.floor(w / (260 * s))));
    const k = small ? 0.85 : 1.25;
    for (let i = 0; i < n; i++) {
      const name = set[i % set.length], fx = x + w * (i + 0.5) / n + (i % 2 ? 14 : -10) * s;
      ctx.save(); ctx.translate(fx, gy); ctx.scale(k * s * (i % 2 ? -1 : 1), k * s);
      ctx.strokeStyle = INK; ctx.lineWidth = 1.05; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      try { DROLL[name](ctx, s); } catch (e) {}
      ctx.restore();
    }
    const rr = Math.min(b, bb) * 0.38;
    for (const [cx, cy] of [[x + b / 2, y + b / 2], [x + w - b / 2, y + b / 2], [x + b / 2, y + h - bb / 2], [x + w - b / 2, y + h - bb / 2]]) roundel(ctx, cx, cy, rr, s);
    ctx.restore();
  }
  function frameOverlay(host, map) {
    const c = document.createElement('canvas'); c.className = 'ink-frame'; c.setAttribute('aria-hidden', 'true'); host.appendChild(c);
    let last = '';
    const draw = (force) => {
      const dpr = window.devicePixelRatio || 1, W = host.clientWidth, H = host.clientHeight;
      const cen = map ? map.getCenter() : { lng: 0, lat: 50 }, set = drollSet(cen.lng, cen.lat).join();
      if (!force && set === last && c.width === Math.round(W * dpr)) return; last = set;
      c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); c.style.width = W + 'px'; c.style.height = H + 'px';
      const ctx = c.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H); drawFrame(ctx, 0, 0, W, H, 1, { lon: cen.lng, lat: cen.lat });
    };
    new ResizeObserver(() => draw(true)).observe(host); draw(true);
    if (map) map.on('moveend', () => draw(false));   // the drolleries change with the part of the world in view
    return c;
  }

  // ---------------- "inking in": when a tile of drawn glyphs arrives, its square is briefly veiled in parchment that a
  // quick diagonal pen sweep wipes away, leaving a trail of fading hatch strokes, so newly loaded country seems to be inked
  // in as you watch. One small canvas over the map, drawn only while a sweep is running (about 0.7 s each, at most 24 at
  // once); off when the viewer prefers reduced motion.
  function inkingIn(map) {
    if (!map || map.__inkReveal) return; map.__inkReveal = true;
    try { if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return; } catch (e) {}
    const host = map.getCanvasContainer(), c = document.createElement('canvas');
    c.className = 'ink-reveal'; c.setAttribute('aria-hidden', 'true');
    c.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;';
    host.appendChild(c);
    const sweeps = [], seen = new Set(); let raf = 0;
    const DUR = 600;
    const tileBounds = (z, x, y) => { const n = Math.pow(2, z), lon = v => v / n * 360 - 180, lat = v => Math.atan(Math.sinh(Math.PI * (1 - 2 * v / n))) * 180 / Math.PI; return [lon(x), lat(y + 1), lon(x + 1), lat(y)]; };
    map.on('sourcedata', e => {
      if (e.sourceId !== 'ink' || !e.tile || !e.coord || e.dataType !== 'source') return;
      const t = e.coord.canonical, w = e.coord.wrap || 0;
      if (sweeps.length > 24) return;
      const key = t.z + '/' + t.x + '/' + t.y + '/' + w;
      if (seen.has(key)) return;   // only the first time a tile arrives, never when it is re-laid
      seen.add(key); if (seen.size > 4000) seen.clear();
      const b = tileBounds(t.z, t.x, t.y);
      sweeps.push({ key, b: [b[0] + w * 360, b[1], b[2] + w * 360, b[3]], t0: performance.now(), seed: (t.x * 73856093) ^ (t.y * 19349663) });
      if (!raf) raf = requestAnimationFrame(frame);
    });
    function frame(now) {
      raf = 0; c.style.display = '';
      const dpr = window.devicePixelRatio || 1, W = map.getContainer().clientWidth, H = map.getContainer().clientHeight;
      if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); c.style.width = W + 'px'; c.style.height = H + 'px'; }
      const x = c.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, W, H);
      for (let i = sweeps.length - 1; i >= 0; i--) {
        const s = sweeps[i], k = (now - s.t0) / DUR;
        if (k >= 1) { sweeps.splice(i, 1); continue; }
        const p0 = map.project([s.b[0], s.b[3]]), p1 = map.project([s.b[2], s.b[1]]);
        const x0 = Math.max(-10, Math.min(p0.x, p1.x)), y0 = Math.max(-10, Math.min(p0.y, p1.y)), x1 = Math.min(W + 10, Math.max(p0.x, p1.x)), y1 = Math.min(H + 10, Math.max(p0.y, p1.y));
        if (x1 <= x0 || y1 <= y0) continue;
        const tw = x1 - x0, th = y1 - y0, diag = tw + th, ease = 1 - Math.pow(1 - k, 2), front = ease * diag * 1.15;
        // the parchment veil still to be inked: everything beyond the pen's diagonal front
        x.save(); x.beginPath(); x.rect(x0, y0, tw, th); x.clip();
        x.fillStyle = 'rgba(243,229,191,' + (0.82 * (1 - k * 0.5)).toFixed(3) + ')';
        x.beginPath(); x.moveTo(x0 + front, y0); x.lineTo(x1 + th, y0); x.lineTo(x1, y1 + tw); x.lineTo(x0, y0 + front); x.closePath(); x.fill();
        // the pen's trail: short hatch strokes along the front, fading behind it
        x.strokeStyle = 'rgba(43,33,25,' + (0.35 * (1 - k)).toFixed(3) + ')'; x.lineWidth = 1; x.lineCap = 'round';
        let r = s.seed >>> 0; const rnd = () => { r ^= r << 13; r ^= r >>> 17; r ^= r << 5; return ((r >>> 0) % 1000) / 1000; };
        for (let d = 0; d < diag; d += 9) { const px = x0 + front - d, py = y0 + d; if (px < x0 - 4 || py > y1 + 4) continue; const l = 4 + rnd() * 5; x.beginPath(); x.moveTo(px - l, py - l * 0.2); x.lineTo(px, py); x.stroke(); }
        x.restore();
      }
      // an empty canvas over the map still costs a full-screen blend every frame: it is hidden between sweeps
      if (sweeps.length) raf = requestAnimationFrame(frame); else { x.clearRect(0, 0, W, H); c.style.display = 'none'; }
    }
  }

  // ---------------- "Ink your home": the current view re-drawn at two or three times the screen's pixels, framed as a poster
  const CREDIT = 'Map data © OpenStreetMap contributors (ODbL) · Tiles: OpenFreeMap, © OpenMapTiles · Elevation: AWS Terrain Tiles (Mapzen; SRTM, GMTED2010, ETOPO1 and others) · ' +
    'Biomes: RESOLVE Ecoregions 2017 (CC BY 4.0) · Heritage, summits, battles, wrecks and abbeys: Wikidata (CC0) · Roman roads: Itiner-e (CC BY 4.0) · ' +
    'Lost villages: Beresford\'s Lost Villages, University of Hull (CC BY-NC-SA 4.0) · Lettering lines: Natural Earth, ONS (OGL v3) · Ship lanes and winds: CLIWOC · Wrecks also NOAA AWOIS · Piracy hotspots: Crime at Sea (CC BY 4.0) · ' +
    'The Inked World, Dr Tristan Hotham, maps.tristanhotham.com/ink-map';
  function wrapText(ctx, text, maxW) {
    const words = text.split(' '), lines = []; let cur = '';
    for (const w of words) { const t = cur ? cur + ' ' + w : w; if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; }
    if (cur) lines.push(cur); return lines;
  }
  async function poster(map, opt) {
    opt = opt || {};
    const host = map.getContainer(), W = host.clientWidth, H = host.clientHeight;
    let pr = opt.scale || 2;
    try { const gl = map.painter.context.gl; const mx = gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) || 4096; pr = Math.max(1, Math.min(pr, Math.floor(Math.min(mx, 8192) / Math.max(W, H)))); } catch (e) {}
    while (pr > 1 && W * H * pr * pr > 36e6) pr--;
    const div = document.createElement('div');
    div.style.cssText = `position:fixed;left:-${W + 200}px;top:0;width:${W}px;height:${H}px;pointer-events:none;opacity:0`;
    document.body.appendChild(div);
    const status = opt.onStatus || (() => {});
    status('Drawing the map at ' + pr + ' times the pixels…');
    let pm = null;
    try {
      pm = await InkMap.create(div, Object.assign({}, map.__inkOpts || {}, { mapOptions: { center: map.getCenter(), zoom: map.getZoom(), bearing: 0, pitch: 0, pixelRatio: pr,
        preserveDrawingBuffer: true, interactive: false, attributionControl: false, fadeDuration: 0 } }));
      // whatever the page's map has gained since it was made (the hidden folk, the traveller's trail, history layers loaded on
      // the way) is copied across with its data, and any sprite the poster lacks is borrowed from the page's map
      const ms = map.getStyle();
      for (const [id, src] of Object.entries(ms.sources)) if (!pm.getSource(id)) { try { pm.addSource(id, src); } catch (e) {} }
      ms.layers.forEach((l, i) => { if (pm.getLayer(l.id)) return; const nx = ms.layers.slice(i + 1).find(n => pm.getLayer(n.id)); try { pm.addLayer(l, nx && nx.id); } catch (e) {} });
      pm.on('styleimagemissing', e => {
        if (pm.hasImage(e.id)) return;
        try { const im = map.style.getImage(e.id); if (im) pm.addImage(e.id, { width: im.data.width, height: im.data.height, data: im.data.data }, { pixelRatio: im.pixelRatio, sdf: im.sdf }); } catch (err) {}
      });
      for (const l of ms.layers) { try { pm.setLayoutProperty(l.id, 'visibility', map.getLayoutProperty(l.id, 'visibility') || 'visible'); } catch (e) {} }
      // the drifting cloud shadows are for the live map only: on the poster the clouds keep to the edges (js/ink-clouds.js)
      try { if (pm.getLayer('cloud-shadows')) pm.setLayoutProperty('cloud-shadows', 'visibility', 'none'); } catch (e) {}
      // (and until the history cells round the view have arrived: js/ink-map.js gridSource)
      const busy = () => InkMap.gridBusy && InkMap.gridBusy(pm);
      await new Promise(res => { let done = false; const fin = () => { if (!done) { done = true; res(); } }; const chk = () => { if (pm.loaded() && pm.areTilesLoaded() && !busy()) setTimeout(() => { if (busy()) pm.once('idle', chk); else fin(); }, 600); else if (busy()) setTimeout(chk, 200); else pm.once('idle', chk); }; pm.once('idle', chk); setTimeout(fin, 90000); });
      status('Framing the poster…');
      const src = pm.getCanvas(), Wp = src.width, Hp = src.height, s = pr;
      const m = Math.round(44 * s), foot = Math.round(64 * s);
      const C = document.createElement('canvas'); C.width = Wp + 2 * m; C.height = Hp + 2 * m + foot;
      const x = C.getContext('2d');
      x.fillStyle = PAPER; x.fillRect(0, 0, C.width, C.height);
      x.drawImage(src, m, m);
      // the chimney smoke and the travellers on the move, as they are this moment (js/ink-life.js overlay)
      for (const sel of ['canvas.ink-life-overlay', 'canvas.ink-sea-overlay']) { const ov = host.querySelector(sel); if (ov && ov.width && ov.style.display !== 'none') { try { x.drawImage(ov, m, m, Wp, Hp); } catch (e) {} } }
      // clouds tucked into the corners and along the edges, under the frame (js/ink-clouds.js)
      if (opt.clouds && global.InkClouds) { try { InkClouds.drawPosterClouds(x, m, m, Wp, Hp, s); } catch (e) {} }
      // frame
      if (opt.border !== false) { const cc = map.getCenter(); drawFrame(x, m - 24 * s, m - 24 * s, Wp + 48 * s, Hp + 24 * s + 36 * s, s, { lon: cc.lng, lat: cc.lat }); }
      else { x.strokeStyle = INK; x.lineWidth = 1.6 * s; x.strokeRect(m, m, Wp, Hp); }
      try { await document.fonts.load(`${30 * s}px MedievalSharp`); await document.fonts.load(`italic ${12 * s}px "Source Serif 4"`); } catch (e) {}
      // cartouche with the title
      const title = (opt.title || 'My corner of the world').slice(0, 60);
      const c = map.getCenter(), sub = `${Math.abs(c.lat).toFixed(2)}° ${c.lat >= 0 ? 'N' : 'S'}, ${Math.abs(c.lng).toFixed(2)}° ${c.lng >= 0 ? 'E' : 'W'} · drawn by The Inked World`;
      x.font = `${30 * s}px ${HAND}`; const tw = x.measureText(title).width; x.font = `italic ${12 * s}px ${SERIF}`; const sw = x.measureText(sub).width;
      const bw = Math.max(tw, sw) + 44 * s, bh = 76 * s, bx = m + 22 * s, by = m + 22 * s;
      x.fillStyle = 'rgba(251,243,220,0.95)'; x.fillRect(bx, by, bw, bh);
      x.strokeStyle = INK; x.lineWidth = 2 * s; x.strokeRect(bx, by, bw, bh); x.lineWidth = 0.8 * s; x.strokeRect(bx + 5 * s, by + 5 * s, bw - 10 * s, bh - 10 * s);
      x.fillStyle = RED; for (const [cx, cy] of [[bx, by], [bx + bw, by], [bx, by + bh], [bx + bw, by + bh]]) { x.beginPath(); x.arc(cx, cy, 4 * s, 0, 7); x.fill(); x.stroke(); }
      x.fillStyle = RED; x.font = `${30 * s}px ${HAND}`; x.textBaseline = 'alphabetic'; x.textAlign = 'center'; x.fillText(title, bx + bw / 2, by + 42 * s);
      x.fillStyle = INK; x.font = `italic ${12 * s}px ${SERIF}`; x.fillText(sub, bx + bw / 2, by + 62 * s);
      // compass rose and scale bar
      const rose = await svgImage(compassSVG(80));
      const rs = 74 * s; x.drawImage(rose, m + 22 * s, m + Hp - rs * 1.14 - 18 * s, rs, rs * 1.14);
      drawScale(x, m + 22 * s + rs + 20 * s, m + Hp - 30 * s, metresPerPx(map) / s, 150 * s, s);
      // the credits in small print
      x.textAlign = 'left'; x.textBaseline = 'top'; x.fillStyle = INK; x.font = `${8.6 * s}px ${SERIF}`;
      const lines = wrapText(x, CREDIT, Wp);
      const fs = lines.length > 2 ? 7.4 : 8.6; x.font = `${fs * s}px ${SERIF}`;
      wrapText(x, CREDIT, Wp).slice(0, 3).forEach((ln, i) => x.fillText(ln, m, m + Hp + 52 * s + i * (fs + 2.2) * s));
      status('Saving…');
      const blob = await new Promise(res => C.toBlob(res, 'image/png'));
      return { blob, width: C.width, height: C.height, pixelRatio: pr };
    } finally {
      try { pm && pm.remove(); } catch (e) {}
      div.remove();
    }
  }
  function download(blob, name) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  }

  global.InkExtras = { scaleBar, compassSVG, frameOverlay, drawFrame, inkingIn, drawScale, poster, download, metresPerPx, niceScale, CREDIT };
})(window);
