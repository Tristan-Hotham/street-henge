/* The Inked World: a zoomable, hand-inked style world map on MapLibre GL JS.
 * Glyphs (mountains, hills, trees, tufts) are computed in js/ink-worker.js and served through the
 * custom "ink://" protocol; everything else is styled from OpenFreeMap vector tiles.
 * Dr Tristan Hotham, Independent researcher, 2026. MIT licence. */
(function (global) {
  'use strict';
  // colours come from js/ink-palette.js (one palette for every drawing); the fallbacks keep this file working on its own
  const PAL = global.InkPalette || {};
  const INK = {
    paper: PAL.paper || '#F3E5BF', paperDeep: PAL.paperDeep || '#E7D2A0', ink: PAL.ink || '#2B2119', inkSoft: PAL.inkSoft || 'rgba(43,33,25,0.55)',
    red: PAL.red || '#A3261B', redDeep: PAL.redDeep || '#8A1F16', blue: PAL.blue || '#3D6E9E', blueSoft: PAL.blueSoft || '#6F9DC6', wash: PAL.wash || '#7FA9CF', seaWash: PAL.seaWash || '#6C9FD6',
    ice: PAL.ice || '#DCE8F0', iceLine: PAL.iceLine || '#8FB0CC', snow: PAL.snow || '#FBFAF4',
  };
  const DEFAULTS = {
    tilejson: 'https://tiles.openfreemap.org/planet',
    dem: 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png',
    demMax: 15,
    base: null, // base URL of this page's folder (for fonts, data, worker)
  };

  // ------------------------------------------------------------------ sprites
  function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; }; }
  // sprites are drawn at K times their logical size (K = InkPalette.SCALE / 2) and registered with pixelRatio 2K, so they
  // are sharp on 3x screens; c.__k carries the factor to the registration
  const K = (PAL.SCALE || 3) / 2;
  // contexts are made with willReadFrequently: sprites are read back once with getImageData, which on a GPU canvas forces a slow
  // readback (seconds in total on a phone or in software rendering)
  function canvas(w, h, k) { k = k === undefined ? K : k; const c = document.createElement('canvas'); c.width = Math.ceil(w * k); c.height = Math.ceil(h * k); c.__k = k; const x = c.getContext('2d', { willReadFrequently: true }); if (k !== 1) x.scale(k, k); return c; }
  function wob(ctx, pts, R, amt) { // stroke a polyline with a slight hand wobble
    ctx.beginPath();
    pts.forEach((p, i) => { const x = p[0] + (R() - 0.5) * amt, y = p[1] + (R() - 0.5) * amt; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    ctx.stroke();
  }
  // a pen stroke that swells and tapers (w0 at the start, w1 at the end), as a nib does
  function taper(ctx, pts, R, w0, w1, amt) {
    const q = pts.map(p => [p[0] + (R() - 0.5) * (amt || 0), p[1] + (R() - 0.5) * (amt || 0)]);
    for (let i = 1; i < q.length; i++) { const t = (i - 0.5) / (q.length - 1); ctx.lineWidth = w0 + (w1 - w0) * t; ctx.beginPath(); ctx.moveTo(q[i - 1][0], q[i - 1][1]); ctx.lineTo(q[i][0], q[i][1]); ctx.stroke(); }
  }
  function quad(p0, c, p1, n) { const o = []; for (let i = 0; i <= n; i++) { const t = i / n, a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, d = t * t; o.push([a * p0[0] + b * c[0] + d * p1[0], a * p0[1] + b * c[1] + d * p1[1]]); } return o; }
  function fillPath(x, pts, col) { x.beginPath(); pts.forEach((p, i) => i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1])); x.closePath(); x.fillStyle = col; x.fill(); }
  function clipPath(x, pts) { x.beginPath(); pts.forEach((p, i) => i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1])); x.closePath(); x.clip(); }
  function toImage(c) { return c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, c.width, c.height); }
  // crop a sprite to its inked pixels, so a glyph only gives way to a name where it really touches it
  function trim(c) {
    const W = c.width, H = c.height, d = c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, W, H).data;
    const on = (x, y) => d[(y * W + x) * 4 + 3] > 10;
    const rowHit = y => { for (let x = 0; x < W; x++) if (on(x, y)) return true; return false; };
    const colHit = (x, ya, yb) => { for (let y = ya; y <= yb; y++) if (on(x, y)) return true; return false; };
    // scan in from each edge (most of a sprite's box is inked, so this touches few pixels)
    let y0 = 0; while (y0 < H && !rowHit(y0)) y0++;
    if (y0 >= H) return c;
    let y1 = H - 1; while (y1 > y0 && !rowHit(y1)) y1--;
    let x0 = 0; while (x0 < W && !colHit(x0, y0, y1)) x0++;
    let x1 = W - 1; while (x1 > x0 && !colHit(x1, y0, y1)) x1--;
    const o = canvas(x1 - x0 + 3, y1 - y0 + 3, 1); o.getContext('2d').drawImage(c, -x0 + 1, -y0 + 1); o.__k = c.__k || 1;
    return o;
  }
  const PG = PAL.pigments || {};
  const SNOW = PAL.snow || '#FBFAF4', SNOWSH = PAL.snowShade || '#D6E0E6', SNOWLN = PAL.snowLine || '#9DB4C8';
  const PFILL = 'rgba(243,229,191,0.97)';
  const SHADE = 'rgba(120,96,64,0.20)';     // the sepia wash laid on the shaded side of every glyph

  // ---- mountains: varied silhouettes (single peak, shouldered, twin, notched crag), a sepia wash and tapered hatching on the
  // shaded (east) face, a few strokes on the lit face, scree at the foot; snow: a white cap with a ragged snow line and cool
  // blue shading on the shaded side
  function mountainShape(v, R, W, base) {
    const tall = v % 4 === 3 ? 0.66 : 0.78 + R() * 0.16;
    const ax = 30 + R() * 14, ay = base - (base - 6) * tall;
    const lf = 4 + R() * 5, rf = W - 4 - R() * 5;
    let left, right, peaks = [[ax, ay]];
    const type = v % 4;
    if (type === 1) {   // a shoulder on the right
      const sx = ax + (rf - ax) * 0.5, sy = ay + (base - ay) * (0.36 + R() * 0.1);
      left = quad([lf, base], [ax - 10 - R() * 6, base - (base - ay) * 0.45], [ax, ay], 10);
      right = quad([ax, ay], [ax + 4, ay + (sy - ay) * 0.6], [sx - 3, sy - 2], 6).concat(quad([sx - 3, sy - 2], [sx + 6, sy - 3], [rf, base], 8).slice(1));
    } else if (type === 2) {   // twin peaks, the left one lower
      const bx = lf + (ax - lf) * 0.45, by = ay + (base - ay) * (0.22 + R() * 0.08), cx = lf + (ax - lf) * 0.72, cy = by + (base - ay) * 0.18;
      left = quad([lf, base], [lf + 3, by + 10], [bx, by], 6).concat(quad([bx, by], [bx + 3, cy - 1], [cx, cy], 4).slice(1)).concat(quad([cx, cy], [ax - 3, ay + 6], [ax, ay], 5).slice(1));
      right = quad([ax, ay], [ax + 12 + R() * 6, base - (base - ay) * 0.5], [rf, base], 10);
      peaks.push([bx, by]);
    } else if (type === 3) {   // a broad crag with a notched summit
      const n1 = [ax - 7, ay + 4], n2 = [ax - 4, ay + 1.5], n3 = [ax + 5, ay + 3], n4 = [ax + 8, ay + 1];
      left = quad([lf, base], [lf + 5, ay + 12], n1, 8).concat([n2, [ax, ay]]);
      right = [[ax, ay], n3, n4].concat(quad(n4, [ax + 18, ay + 10], [rf, base], 9).slice(1));
    } else {
      left = quad([lf, base], [ax - 10 - R() * 6, base - (base - ay) * 0.42], [ax, ay], 10);
      right = quad([ax, ay], [ax + 12 + R() * 6, base - (base - ay) * 0.55], [rf, base], 10);
    }
    const spurX = ax + 6 + R() * 7;
    const spur = quad([ax, ay], [ax + 1 + R() * 3, ay + (base - ay) * 0.5], [spurX, base], 8);
    return { ax, ay, lf, rf, left, right, spur, peaks };
  }
  function mountainSprite(v, snowy) {
    const R = rng(1000 + v * 7919), W = 76, H = 64, base = 58;
    const c = canvas(W, H), x = c.getContext('2d');
    x.lineCap = 'round'; x.lineJoin = 'round';
    const { ax, ay, lf, rf, left, right, spur } = mountainShape(v, R, W, base);
    const sil = left.concat(right.slice(1));
    const face = spur.concat(right.slice().reverse());
    // ground shadow cast to the east, under everything
    x.strokeStyle = 'rgba(43,33,25,0.35)'; x.lineWidth = 0.9;
    for (let k = 0; k < 3; k++) wob(x, [[rf - 10 + k * 4, base + 1.5 + k * 0.4], [rf + 2 + k * 2.5, base + 1.2 + k * 0.4]], R, 0.3);
    // paper silhouette (hides peaks behind), then the shadow wash on the east face
    fillPath(x, sil, PFILL);
    if (snowy) fillPath(x, sil, 'rgba(250,250,244,0.9)');   // deep winter: the whole mountain under snow, the cap whitest
    x.save(); clipPath(x, face); fillPath(x, face, snowy ? 'rgba(120,140,160,0.22)' : SHADE);
    // tapered hatching on the east face: strokes from the ridge down and out, denser near the summit
    x.strokeStyle = INK.ink;
    const nH = 20 + (v % 3) * 2;
    for (let k = 0; k < nH; k++) {
      const t = (k + 0.5) / nH + (R() - 0.5) * 0.015, p = right[Math.max(0, Math.min(right.length - 1, Math.round(t * (right.length - 1))))];
      const len = 8 + (1 - t) * 26 + R() * 8, dx = -0.3 - R() * 0.14, bow = (R() - 0.5) * 2;
      const q0 = [p[0] - 0.6, p[1] + 0.8], q1 = [p[0] + dx * len * 0.5 + bow, p[1] + len * 0.5], q2 = [p[0] + dx * len, p[1] + len];
      taper(x, [q0, q1, q2], R, k % 3 === 0 ? 1.35 : 1.05, 0.3, 0.35);
    }
    // cross-hatching low on the face, where the shadow is deepest
    x.lineWidth = 0.6; x.strokeStyle = 'rgba(43,33,25,0.55)';
    for (let k = 0; k < 7; k++) { const yy = base - 3 - k * 3.2, xx = ax + 4 + k * 1.5; wob(x, [[xx, yy], [xx + 16 - k * 1.2, yy - 4]], R, 0.4); }
    x.restore();
    // a darker wash low on the face, so the mountain sits on the ground
    x.save(); clipPath(x, face); const g = x.createLinearGradient(0, ay, 0, base); g.addColorStop(0, 'rgba(90,70,45,0)'); g.addColorStop(1, 'rgba(90,70,45,0.16)'); x.fillStyle = g; x.fillRect(0, 0, W, H); x.restore();
    // snow cap
    if (snowy) {
      const sY = ay + (base - ay) * (0.5 + R() * 0.1);
      const line = []; for (let px = lf - 2; px <= rf + 2; px += 2.6) { const near = Math.abs(px - (ax + 5)) < 4 ? 5 : 0; line.push([px, sY + (line.length % 2 ? 3.2 : -0.8) + R() * 2.2 + near - Math.abs(px - ax) * 0.06]); }
      const cap = [[lf - 4, -4], [rf + 4, -4]].concat(line.slice().reverse());
      x.save(); clipPath(x, sil); fillPath(x, cap, SNOW);
      x.save(); clipPath(x, face); fillPath(x, cap, SNOWSH); x.restore();
      x.strokeStyle = SNOWLN; for (let k = 0; k < 6; k++) { const t = 0.08 + k * 0.1, p = right[Math.floor(t * (right.length - 1))]; if (p[1] > sY + 2) continue; taper(x, [[p[0] - 0.8, p[1] + 1], [p[0] - 3.5 - R(), p[1] + 6 + R() * 2]], R, 0.9, 0.4, 0.2); }
      x.strokeStyle = 'rgba(43,33,25,0.75)'; x.lineWidth = 0.75; wob(x, line, R, 0.4);
      x.restore();
    }
    // a few strokes on the lit (west) face
    x.strokeStyle = INK.ink;
    for (let k = 0; k < 2 + (v % 2); k++) {
      const t = 0.5 + R() * 0.38, p = left[Math.floor(t * (left.length - 1))];
      taper(x, [[p[0] + 2.5, p[1] + 2], [p[0] + 5 + R() * 3, p[1] + 6 + R() * 3], [p[0] + 6 + R() * 3, p[1] + 9 + R() * 3]], R, 1.0, 0.35, 0.3);
    }
    // outline: heavy, tapering towards the feet
    x.strokeStyle = INK.ink;
    taper(x, left, R, 1.6, 2.9, 0.5); taper(x, right, R, 2.9, 1.6, 0.5);
    taper(x, spur.slice(0, 6), R, 1.4, 0.5, 0.35);
    // scree and ground ticks
    x.lineWidth = 1.1; wob(x, [[lf - 3, base + 0.8], [lf + 7, base + 1.4]], R, 0.3);
    x.fillStyle = INK.ink; for (let k = 0; k < 4; k++) { x.beginPath(); x.arc(lf + 8 + R() * (rf - lf - 16), base + 1.5 + R() * 1.2, 0.45, 0, 7); x.fill(); }
    return c;
  }
  function hillSprite(v, snowy) {
    const R = rng(5000 + v * 104729), W = 56, H = 30, base = 25;
    const c = canvas(W, H), x = c.getContext('2d');
    x.lineCap = 'round'; x.lineJoin = 'round';
    const h = 12 + R() * 7, cx = 22 + R() * 10, l = 3 + R() * 3, r = W - 4 - R() * 3;
    const arc = v % 3 === 2 ? quad([l, base], [cx - 10, base - h * 1.4], [cx, base - h], 8).concat(quad([cx, base - h], [cx + 10, base - h * 0.9], [r, base], 8).slice(1)) : quad([l, base], [cx - 6, base - h * 2.0], [r, base], 14);
    fillPath(x, arc, PFILL); if (snowy) fillPath(x, arc, 'rgba(250,250,244,0.9)');
    // the shaded east side: a wash and short curved strokes following the slope
    const top = arc.reduce((a, p) => p[1] < a[1] ? p : a, arc[0]);
    const east = arc.filter(p => p[0] >= top[0] - 2);
    const face = east.concat([[top[0] + 3, base]]);
    fillPath(x, face, snowy ? 'rgba(120,140,160,0.22)' : SHADE);
    if (snowy) {
      const sY = top[1] + h * 0.75;
      const line = []; for (let px = l; px <= r; px += 2.4) line.push([px, sY + (line.length % 2 ? 2.2 : -0.4) + R() * 1.2]);
      x.save(); clipPath(x, arc); fillPath(x, [[l - 3, -3], [r + 3, -3]].concat(line.slice().reverse()), SNOW); x.save(); clipPath(x, face); fillPath(x, [[l - 3, -3], [r + 3, -3]].concat(line.slice().reverse()), SNOWSH); x.restore(); x.restore();
    }
    x.strokeStyle = snowy ? SNOWLN : INK.ink;
    const n = 4 + (v % 3);
    for (let k = 0; k < n; k++) {
      const t = 0.56 + k * (0.36 / n), p = arc[Math.round(t * (arc.length - 1))];
      if (snowy && k < 2) x.strokeStyle = SNOWLN; else x.strokeStyle = INK.ink;
      taper(x, [[p[0] - 0.8, p[1] + 1.8], [p[0] - 3 - R() * 1.5, p[1] + 4.5 + R() * 2], [p[0] - 4 - R() * 2, p[1] + 7 + R() * 2]], R, 1.2, 0.35, 0.25);
    }
    x.strokeStyle = INK.ink; taper(x, arc, R, 1.5, 2.5, 0.45);
    x.lineWidth = 0.9; x.strokeStyle = 'rgba(43,33,25,0.5)'; wob(x, [[r - 8, base + 1.2], [r + 2, base + 1]], R, 0.3);
    return c;
  }
  // ---- trees: four broadleaf kinds (oak, tall elm, spreading beech, small round) and four conifers (spruce, fir, pine,
  // young spruce), each with a watercolour crown, hatching on the shaded side, a trunk and a small ground shadow. In winter
  // the broadleaves are bare (trunk and twigs) and the conifers carry snow on every tier.
  const LEAF = 'rgba(160,182,112,0.88)', LEAFSH = 'rgba(96,120,64,0.45)', PINE = 'rgba(112,140,100,0.9)', PINESH = 'rgba(62,90,64,0.5)';
  function crownPts(cx, cy, rx, ry, lobes, ph, amp) { const pts = []; for (let i = 0; i <= 44; i++) { const a = i / 44 * Math.PI * 2; const rr = 1 + amp * Math.abs(Math.sin(a * lobes / 2 + ph)); pts.push([cx + Math.cos(a) * rx * rr, cy + Math.sin(a) * ry * rr]); } return pts; }
  function groundShadow(x, cx, gy, w) { x.fillStyle = 'rgba(43,33,25,0.16)'; x.beginPath(); x.ellipse(cx + w * 0.25, gy + 0.6, w, 1.5, 0, 0, 7); x.fill(); }
  function treeSprite(v, conifer) {
    const R = rng(9000 + v * 31 + (conifer ? 777 : 0)), W = 26, H = 34;
    const c = canvas(W, H), x = c.getContext('2d');
    x.lineCap = 'round'; x.lineJoin = 'round'; x.strokeStyle = INK.ink;
    if (!conifer) {
      const kinds = [[13, 12, 8.6, 7.6, 7, 0.09], [13, 11, 6.2, 9.6, 5, 0.07], [13, 13, 10.4, 6.8, 9, 0.08], [13, 14, 7, 6.4, 6, 0.1]];
      const [cx, cy, rx, ry, lobes, amp] = kinds[v % 4], gy = cy + ry + 7;
      groundShadow(x, cx, gy, 6);
      x.lineWidth = 1.7; wob(x, [[cx, cy + ry * 0.7], [cx + 0.3, gy]], R, 0.2);
      if (v === 3) { x.lineWidth = 1.1; wob(x, [[cx, gy - 3.5], [cx - 2.5, cy + ry * 0.6]], R, 0.2); }
      const pts = crownPts(cx, cy, rx, ry, lobes, v, amp);
      fillPath(x, pts, PFILL); fillPath(x, pts, LEAF);
      x.save(); clipPath(x, pts); x.fillStyle = LEAFSH; x.beginPath(); x.ellipse(cx + rx * 0.55, cy + ry * 0.35, rx * 0.85, ry * 0.95, 0, 0, 7); x.fill();
      x.strokeStyle = INK.ink; for (let k = 0; k < 5; k++) { const a = -0.2 + k * 0.32; taper(x, [[cx + Math.cos(a) * rx * 0.35, cy + Math.sin(a) * ry * 0.35], [cx + Math.cos(a + 0.25) * rx * 0.85, cy + Math.sin(a + 0.25) * ry * 0.85]], R, 0.9, 0.3, 0.2); }
      x.restore();
      // little leaf-clump arcs inside the crown
      x.lineWidth = 0.7; x.strokeStyle = 'rgba(43,33,25,0.55)';
      for (let k = 0; k < 3; k++) { const a = 2.6 + k * 0.7; x.beginPath(); x.arc(cx + Math.cos(a) * rx * 0.45, cy + Math.sin(a) * ry * 0.45, 2, 3.6, 5.6); x.stroke(); }
      x.strokeStyle = INK.ink; taper(x, pts.slice(0, 23), R, 1.9, 1.3, 0.3); taper(x, pts.slice(22), R, 1.3, 1.9, 0.3);
    } else {
      const kinds = [[13, 1.5, 7.2, 4, 6.4], [13, 0.5, 5.4, 5, 5.6], [13, 3, 8.4, 3, 7], [13, 7, 6, 3, 5.6]];
      const [cx, top, w, tiers, step] = kinds[v % 4];
      const bot = top + (tiers - 1) * step + 9.5, gy = bot + 4.5;
      groundShadow(x, cx, gy, 5);
      x.lineWidth = 1.6; wob(x, [[cx, bot - 1], [cx, gy]], R, 0.2);
      for (let k = 0; k < tiers; k++) {
        const y0 = top + k * step, y1 = y0 + 9.5, ww = w * (k + 1) / tiers + 1.2;
        const tri = v % 4 === 2 ? [[cx - ww, y1], [cx - ww * 0.55, y0 + 3], [cx, y0], [cx + ww * 0.55, y0 + 3], [cx + ww, y1]] : [[cx - ww, y1], [cx - ww * 0.4, y0 + 4.2], [cx, y0], [cx + ww * 0.4, y0 + 4.2], [cx + ww, y1]];
        fillPath(x, tri, PFILL); fillPath(x, tri, PINE);
        fillPath(x, [[cx, y0], [cx + ww * 0.4, y0 + 4.2], [cx + ww, y1], [cx + 0.5, y1]], PINESH);
        x.strokeStyle = INK.ink; for (let h = 0; h < 3; h++) taper(x, [[cx + 1 + h * ww * 0.25, y0 + 3 + h * 1.6], [cx + 1.5 + h * ww * 0.28, y1 - 0.8]], R, 0.8, 0.3, 0.15);
        taper(x, tri, R, 1.3, 1.6, 0.25);
        x.lineWidth = 1.2; wob(x, [[cx - ww, y1], [cx + ww, y1]], R, 0.25);
      }
    }
    return c;
  }
  // winter: a bare broadleaf (trunk and branching twigs) on a patch of snow
  function bareTreeSprite(v) {
    const R = rng(9500 + v * 41), W = 26, H = 34;
    const c = canvas(W, H), x = c.getContext('2d');
    x.lineCap = 'round'; x.lineJoin = 'round'; x.strokeStyle = INK.ink;
    const gy = [27, 26, 28, 27][v % 4], cx = 13;
    x.fillStyle = 'rgba(214,224,230,0.9)'; x.beginPath(); x.ellipse(cx + 1, gy + 0.8, 7, 1.7, 0, 0, 7); x.fill();
    const spread = [1, 0.7, 1.25, 0.9][v % 4];
    function branch(px, py, ang, len, w, d) {
      const ex = px + Math.cos(ang) * len, ey = py + Math.sin(ang) * len;
      taper(x, [[px, py], [px + Math.cos(ang) * len * 0.5 + (R() - 0.5), py + Math.sin(ang) * len * 0.5], [ex, ey]], R, w, w * 0.62, 0.15);
      if (d <= 0) return;
      const n = d > 2 ? 2 : 2 + (R() < 0.4 ? 1 : 0);
      for (let k = 0; k < n; k++) branch(ex, ey, ang + (k - (n - 1) / 2) * 0.62 * spread + (R() - 0.5) * 0.3, len * (0.68 + R() * 0.1), w * 0.62, d - 1);
    }
    branch(cx, gy, -Math.PI / 2 + (R() - 0.5) * 0.1, 8.5 - (v % 2), 2.2, 3);
    // a little snow caught on the main forks
    x.fillStyle = SNOW; x.strokeStyle = 'rgba(43,33,25,0.4)'; x.lineWidth = 0.4;
    return c;
  }
  // winter: a conifer laden with snow (white along each tier's upper edge, the dark green showing beneath)
  function snowConiferSprite(v) {
    const R = rng(9700 + v * 43), W = 26, H = 34;
    const c = canvas(W, H), x = c.getContext('2d');
    x.lineCap = 'round'; x.lineJoin = 'round'; x.strokeStyle = INK.ink;
    const kinds = [[13, 1.5, 7.2, 4, 6.4], [13, 0.5, 5.4, 5, 5.6], [13, 3, 8.4, 3, 7], [13, 7, 6, 3, 5.6]];
    const [cx, top, w, tiers, step] = kinds[v % 4];
    const bot = top + (tiers - 1) * step + 9.5, gy = bot + 4.5;
    x.fillStyle = 'rgba(214,224,230,0.9)'; x.beginPath(); x.ellipse(cx + 1, gy + 0.6, 7, 1.6, 0, 0, 7); x.fill();
    x.lineWidth = 1.6; wob(x, [[cx, bot - 1], [cx, gy]], R, 0.2);
    for (let k = 0; k < tiers; k++) {
      const y0 = top + k * step, y1 = y0 + 9.5, ww = w * (k + 1) / tiers + 1.2;
      const tri = [[cx - ww, y1], [cx - ww * 0.4, y0 + 4.2], [cx, y0], [cx + ww * 0.4, y0 + 4.2], [cx + ww, y1]];
      fillPath(x, tri, PFILL); fillPath(x, tri, 'rgba(86,112,84,0.92)');
      // snow on the tier: a white band following the upper edges, drooping in scallops at the tips
      const sn = [[cx - ww * 0.92, y1 - 1.6], [cx - ww * 0.4, y0 + 3.4], [cx, y0 - 0.4], [cx + ww * 0.4, y0 + 3.4], [cx + ww * 0.92, y1 - 1.6], [cx + ww * 0.55, y1 - 3.2], [cx + ww * 0.25, y0 + 6.2], [cx, y0 + 4.4], [cx - ww * 0.3, y0 + 6.4], [cx - ww * 0.6, y1 - 3]];
      fillPath(x, sn, SNOW);
      x.strokeStyle = SNOWLN; x.lineWidth = 0.6; wob(x, sn.slice(5).concat([sn[0]]), R, 0.2);
      x.strokeStyle = INK.ink; taper(x, tri, R, 1.3, 1.6, 0.25);
    }
    return c;
  }
  // taiga marks for the biome layer (narrow spires), plain and snowy
  function taigaSprite(v, snowy) {
    const R = rng(9300 + v * 29), c = canvas(14, 27), x = c.getContext('2d');
    x.lineCap = 'round'; x.lineJoin = 'round'; x.strokeStyle = INK.ink;
    const h = 17 + R() * 4, w = 4 + R();
    const L = [[7, 2], [7 - w * 0.5, 2 + h * 0.4], [7 - w * 0.3, 2 + h * 0.42], [7 - w, 2 + h]], Rr = [[7, 2], [7 + w * 0.5, 2 + h * 0.4], [7 + w * 0.3, 2 + h * 0.42], [7 + w, 2 + h]];
    const sil = L.concat(Rr.slice().reverse());
    fillPath(x, sil, PFILL); fillPath(x, sil, snowy ? 'rgba(86,112,84,0.9)' : PINE);
    fillPath(x, [[7, 2]].concat(Rr.slice(1)).concat([[7.4, 2 + h]]), PINESH);
    if (snowy) { fillPath(x, [[7, 1.5], [7 - w * 0.5, 2 + h * 0.4], [7 - w * 0.15, 2 + h * 0.3], [7, 2 + h * 0.36], [7 + w * 0.2, 2 + h * 0.3], [7 + w * 0.5, 2 + h * 0.4]], SNOW); fillPath(x, [[7 - w * 0.3, 2 + h * 0.43], [7 - w * 0.9, 2 + h * 0.93], [7 - w * 0.2, 2 + h * 0.78], [7 + w * 0.3, 2 + h * 0.84], [7 + w * 0.9, 2 + h * 0.93], [7 + w * 0.3, 2 + h * 0.43], [7, 2 + h * 0.52]], SNOW); }
    taper(x, L, R, 1.2, 1.8, 0.2); taper(x, Rr, R, 1.2, 1.8, 0.2); x.lineWidth = 1.5; wob(x, [[7 - w, 2 + h], [7 + w, 2 + h]], R, 0.2);
    x.lineWidth = 1.3; wob(x, [[7, 2 + h], [7, 2 + h + 3.5]], R, 0.1);
    return c;
  }
  // a short row of little peaks for the far-out ranges (three variants), plain and snow-capped
  function rangeSprite(v, snowy) {
    const R = rng(4100 + v * 13), W = 36, H = 24, c = canvas(W, H), x = c.getContext('2d');
    x.lineCap = 'round'; x.lineJoin = 'round';
    const pk = [[2, 21, 10 + v, 8 - v * 0.8, 21 - v * 0.5], [12, 21, 19 + v, 3 + v * 1.2, 30 - v]];
    for (const [x0, gy, ax, ay, x1] of pk) {
      const left = quad([x0, gy], [ax - 3, ay + (gy - ay) * 0.45], [ax, ay], 5), right = quad([ax, ay], [ax + 4, ay + (gy - ay) * 0.5], [x1 + 2, gy], 5);
      const sil = left.concat(right.slice(1)), face = [[ax, ay]].concat(right.slice(1)).concat([[ax + 2, gy]]);
      fillPath(x, sil, PFILL); fillPath(x, face, SHADE);
      if (snowy) { const sY = ay + (gy - ay) * 0.45; x.save(); clipPath(x, sil); fillPath(x, [[0, 0], [W, 0], [W, sY], [ax + 3, sY + 1.5], [ax + 1, sY - 1], [ax - 2, sY + 2], [0, sY]], SNOW); x.save(); clipPath(x, face); fillPath(x, [[0, 0], [W, 0], [W, sY + 1.5], [0, sY + 1.5]], SNOWSH); x.restore(); x.restore(); }
      x.strokeStyle = INK.ink; x.save(); clipPath(x, face);
      for (let k = 0; k < 5; k++) { const t = 0.15 + k * 0.17, p = right[Math.min(right.length - 1, Math.round(t * (right.length - 1)))]; if (snowy && k < 2) continue; taper(x, [[p[0] - 0.4, p[1] + 0.5], [p[0] - 2.4, p[1] + 5 + (1 - t) * 3]], R, 1.0, 0.35, 0.15); }
      x.restore();
      taper(x, left, R, 1.3, 2.0, 0.25); taper(x, right, R, 2.0, 1.3, 0.25);
    }
    return c;
  }
  function tuftSprite(v, wet) {
    const R = rng(300 + v * 17 + (wet ? 50 : 0)), c = canvas(28, 18), x = c.getContext('2d');
    x.lineCap = 'round'; x.strokeStyle = wet ? INK.blue : INK.ink; x.lineWidth = 1.2;
    if (wet) {
      for (let k = -1; k <= 1; k++) wob(x, [[14 + k * 4, 12], [14 + k * 5.5, 5 + Math.abs(k) * 2 + R()]], R, 0.3);
      x.lineWidth = 1.1; wob(x, [[5, 14], [23, 14]], R, 0.4); wob(x, [[9, 16.5], [19, 16.5]], R, 0.4);
    } else {
      for (let k = -1; k <= 1; k++) wob(x, [[14 + k * 2, 14], [14 + k * 6, 7 + Math.abs(k) * 2 + R() * 2]], R, 0.3);
    }
    return c;
  }
  // ---- biome glyphs
  function duneSprite(v) {
    // a small field of crescent dunes: each a long windward curve with a short steep slip face, and sand stipple
    const R = rng(7000 + v * 61), c = canvas(52, 26), x = c.getContext('2d');
    x.lineCap = 'round'; x.lineJoin = 'round'; x.strokeStyle = INK.ink;
    const rows = [[3, 9, 22], [22, 15, 24], [8, 21, 18]];
    rows.slice(0, 2 + (v % 2)).forEach(([ox, oy, w], k) => {
      ox += R() * 4; const tip = [ox + w, oy - 1];
      fillPath(x, quad([ox, oy + 2], [ox + w * 0.55, oy - 6], tip, 10).concat(quad(tip, [ox + w * 0.82, oy + 3], [ox + w * 0.6, oy + 4.5], 6).slice(1)), 'rgba(226,186,110,0.55)');
      fillPath(x, [tip, [ox + w * 0.82, oy + 3], [ox + w * 0.6, oy + 4.5], [ox + w * 0.7, oy + 1]], 'rgba(170,120,60,0.45)');
      x.lineWidth = 1.45; wob(x, quad([ox, oy + 2], [ox + w * 0.55, oy - 6], tip, 10), R, 0.3);
      x.lineWidth = 1.0; wob(x, quad(tip, [ox + w * 0.82, oy + 3], [ox + w * 0.6, oy + 4.5], 6), R, 0.2);
      x.lineWidth = 0.7; for (let t = 0; t < 3; t++) wob(x, [[ox + w * (0.72 + t * 0.07), oy + 0.5], [ox + w * (0.7 + t * 0.07), oy + 3.2]], R, 0.1);
    });
    x.fillStyle = INK.ink;
    for (let k = 0; k < 9; k++) { x.beginPath(); x.arc(2 + R() * 48, 4 + R() * 21, 0.65, 0, 7); x.fill(); }
    return c;
  }
  function grassSprite(v) {
    const R = rng(8100 + v * 37), c = canvas(22, 16), x = c.getContext('2d');
    x.lineCap = 'round'; x.strokeStyle = INK.ink; x.lineWidth = 1.35;
    const n = 4 + (v % 2);
    for (let k = 0; k < n; k++) { const t = k / (n - 1) - 0.5, bx = 11 + t * 5; wob(x, quad([bx, 14], [bx + t * 4, 9], [bx + t * 9 + (R() - 0.5) * 2, 4 + Math.abs(t) * 5 + R() * 2], 5), R, 0.2); }
    return c;
  }
  function rainSprite(v) {
    const R = rng(8800 + v * 53), c = canvas(34, 30), x = c.getContext('2d');
    x.lineCap = 'round'; x.lineJoin = 'round'; x.strokeStyle = INK.ink;
    if (v === 3) { // a palm among the crowns
      x.lineWidth = 1.5; wob(x, quad([17, 28], [15, 18], [18, 9], 8), R, 0.2);
      x.lineWidth = 1.3; for (const a of [-2.6, -2.0, -1.2, -0.5, 0.1]) wob(x, quad([18, 9], [18 + Math.cos(a) * 6, 9 + Math.sin(a) * 6 - 2], [18 + Math.cos(a) * 11, 9 + Math.sin(a) * 6 + 4], 6), R, 0.2);
      return c;
    }
    const crowns = [[10, 16, 7], [22, 15, 7.5], [16, 9, 7]];
    for (const [cx, cy, r] of crowns) {
      const pts = []; for (let i = 0; i <= 28; i++) { const a = i / 28 * Math.PI * 2; const rr = r * (1 + 0.14 * Math.sin(a * 5 + v + cx)); pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.85]); }
      fillPath(x, pts, PFILL); fillPath(x, pts, 'rgba(110,150,96,0.85)');
      x.save(); clipPath(x, pts); x.fillStyle = 'rgba(52,86,50,0.45)'; x.beginPath(); x.ellipse(cx + r * 0.5, cy + r * 0.3, r * 0.8, r * 0.8, 0, 0, 7); x.fill(); x.restore();
      x.lineWidth = 1.4; wob(x, pts, R, 0.3);
      x.lineWidth = 0.9; for (let k = 0; k < 2; k++) { const a = 0.3 + k * 0.7; wob(x, [[cx + Math.cos(a) * r * 0.45, cy + Math.sin(a) * r * 0.4], [cx + Math.cos(a + 0.5) * r * 0.65, cy + Math.sin(a + 0.5) * r * 0.55]], R, 0.15); }
    }
    x.lineWidth = 1.4; wob(x, [[16, 22], [16.3, 28]], R, 0.2);
    return c;
  }
  function iceSprite(v) {
    // ice: pale blue hatching, or a crevasse line with short ticks
    const R = rng(9900 + v * 71), c = canvas(40, 18), x = c.getContext('2d');
    x.lineCap = 'round'; x.strokeStyle = INK.blue;
    if (v % 2 === 0) { x.lineWidth = 1.3; for (let k = 0; k < 5; k++) wob(x, [[4 + k * 7, 15], [10 + k * 7, 3]], R, 0.3); }
    else { x.lineWidth = 1.4; const P = [[3, 9], [9, 7], [15, 10], [21, 7], [28, 10], [36, 8]]; wob(x, P, R, 0.5); x.lineWidth = 1.0; for (const [px, py] of P.slice(1, -1)) wob(x, [[px, py], [px + 1, py + (py < 9 ? -5 : 5)]], R, 0.2); }
    return c;
  }
  function settleSprite(kind) {
    const c = canvas(28, 28), x = c.getContext('2d');
    x.lineCap = 'round'; x.lineJoin = 'round'; x.strokeStyle = INK.ink; x.fillStyle = INK.ink;
    const P = 'rgba(243,229,191,1)';
    if (kind === 'capital' || kind === 'city') {
      x.fillStyle = P; x.beginPath(); x.arc(14, 14, 8.5, 0, 7); x.fill();
      x.lineWidth = 2; x.beginPath(); x.arc(14, 14, 8.5, 0, 7); x.stroke();
      x.fillStyle = INK.red; x.beginPath(); x.arc(14, 14, 4.2, 0, 7); x.fill();
      if (kind === 'capital') { x.lineWidth = 1.2; x.beginPath(); x.arc(14, 14, 11.8, 0, 7); x.stroke(); }
    } else if (kind === 'town') {
      x.fillStyle = P; x.fillRect(6, 13, 9, 8); x.fillRect(14, 10, 8, 11);
      x.lineWidth = 1.6; x.strokeRect(6, 13, 9, 8); x.strokeRect(14, 10, 8, 11);
      x.fillStyle = INK.ink; x.beginPath(); x.moveTo(5, 13.5); x.lineTo(10.5, 8); x.lineTo(16, 13.5); x.fill();
      x.beginPath(); x.moveTo(13, 10.5); x.lineTo(18, 4); x.lineTo(23, 10.5); x.fill();
    } else if (kind === 'village') {
      x.fillStyle = P; x.fillRect(9, 13, 10, 8); x.lineWidth = 1.5; x.strokeRect(9, 13, 10, 8);
      x.fillStyle = INK.ink; x.beginPath(); x.moveTo(8, 13.5); x.lineTo(14, 7); x.lineTo(20, 13.5); x.fill();
    } else if (kind === 'hamlet') {
      x.fillStyle = P; x.beginPath(); x.arc(14, 15, 3.4, 0, 7); x.fill(); x.lineWidth = 1.5; x.stroke();
    } else if (kind === 'peak') {
      x.fillStyle = INK.ink; x.beginPath(); x.moveTo(14, 7); x.lineTo(20.5, 19); x.lineTo(7.5, 19); x.closePath(); x.fill();
    }
    return c;
  }
  function paperTexture() {
    const N = 512, c = canvas(N, N, 1), x = c.getContext('2d');
    const img = x.createImageData(N, N), d = img.data, R = rng(424242);
    const grids = [[8, 10], [16, 6], [32, 4], [64, 2.4], [128, 1.6]];
    const layers = grids.map(([g, amp]) => { const a = new Float32Array(g * g); for (let i = 0; i < a.length; i++) a[i] = R() * 2 - 1; return { g, amp, a }; });
    const base = [243, 229, 191];
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      let v = 0;
      for (const L of layers) {
        const fx = i / N * L.g, fy = j / N * L.g, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
        const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty), g = L.g;
        const a = L.a[(y0 % g) * g + (x0 % g)], b = L.a[(y0 % g) * g + ((x0 + 1) % g)], cc = L.a[((y0 + 1) % g) * g + (x0 % g)], dd = L.a[((y0 + 1) % g) * g + ((x0 + 1) % g)];
        v += ((a * (1 - sx) + b * sx) * (1 - sy) + (cc * (1 - sx) + dd * sx) * sy) * L.amp;
      }
      v += (R() - 0.5) * 3.2;
      const k = (j * N + i) * 4;
      d[k] = base[0] + v * 0.55; d[k + 1] = base[1] + v * 0.65; d[k + 2] = base[2] + v * 0.9; d[k + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    // fibres
    x.lineCap = 'round';
    for (let i = 0; i < 260; i++) {
      const px = R() * N, py = R() * N, a = R() * Math.PI, l = 3 + R() * 9;
      x.strokeStyle = R() < 0.5 ? 'rgba(150,120,70,0.07)' : 'rgba(255,250,235,0.12)'; x.lineWidth = 0.8;
      for (const ox of [-N, 0, N]) for (const oy of [-N, 0, N]) { x.beginPath(); x.moveTo(px + ox, py + oy); x.lineTo(px + ox + Math.cos(a) * l, py + oy + Math.sin(a) * l); x.stroke(); }
    }
    return c;
  }
  // Sprites are drawn lazily: each one is registered with a builder, and drawn the first time a tile asks for it (MapLibre's
  // styleimagemissing event, answered synchronously). A view of Britain needs a few dozen of the ~500 sprites, so the page no
  // longer spends seconds drawing every beast, monument and snowy variant before the first frame.
  function lazySprites(map) {
    if (map.__inkReg) return map.__inkReg;
    const reg = map.__inkReg = new Map();
    map.on('styleimagemissing', e => {
      const f = reg.get(e.id); if (!f || map.hasImage(e.id)) return;
      try { const r = f(); map.addImage(e.id, r.img, r.opts); } catch (err) { console.warn('sprite ' + e.id, err); }
    });
    return reg;
  }
  function addSprites(map) {
    const reg = lazySprites(map);
    if (reg.size) return;
    const add = (name, mk, pr) => reg.set(name, () => { const c = mk(); return { img: toImage(c), opts: { pixelRatio: pr || 2 * (c.__k || 1) } }; });
    if (global.InkIcons) global.InkIcons.addAll(map, trim, mountainSprite);
    for (let v = 0; v < 8; v++) { add('m' + v, () => trim(mountainSprite(v))); add('ms' + v, () => trim(mountainSprite(v, true))); }
    for (let v = 0; v < 8; v++) { add('h' + v, () => trim(hillSprite(v))); add('hs' + v, () => trim(hillSprite(v, true))); }
    for (let v = 0; v < 4; v++) { add('t' + v, () => trim(treeSprite(v, false))); add('c' + v, () => trim(treeSprite(v, true))); add('tb' + v, () => trim(bareTreeSprite(v))); add('cs' + v, () => trim(snowConiferSprite(v))); add('b4s-' + v, () => trim(taigaSprite(v, true))); }
    for (let v = 0; v < 3; v++) { add('rng' + v, () => trim(rangeSprite(v))); add('rngs' + v, () => trim(rangeSprite(v, true))); }
    for (let v = 0; v < 3; v++) { add('w' + v, () => trim(tuftSprite(v, true))); add('g' + v, () => trim(tuftSprite(v, false))); }
    for (let v = 0; v < 4; v++) { add('b1-' + v, () => trim(duneSprite(v))); add('b2-' + v, () => trim(grassSprite(v))); add('b3-' + v, () => trim(rainSprite(v))); add('b4-' + v, () => trim(taigaSprite(v))); add('b5-' + v, () => trim(iceSprite(v))); add('b6-' + v, () => trim(tuftSprite(v % 3, true))); add('b7-' + v, () => trim(tuftSprite(v % 3, false))); }
    for (const k of ['capital', 'city', 'town', 'village', 'hamlet', 'peak']) add('s-' + k, () => settleSprite(k));
    add('paper', paperTexture, 2);
  }

  // ------------------------------------------------------------------ expressions
  const ZS = []; for (let z = 0; z <= 18; z++) ZS.push(z);
  const R_ = ['get', 'r'];
  // integer-zoom stops of an expression built from the zoom value
  function byZoom(fn) { const e = ['interpolate', ['linear'], ['zoom']]; for (const z of ZS) e.push(z, fn(z)); return e; }
  const clamp01 = e => ['max', 0, ['min', 1, e]];
  // glyph of rank r: fades in over the zoom before its home zoom
  const fadeRank = (extra) => byZoom(z => ['*', extra ? extra(z) : 1, clamp01(['-', z + 1, R_])]);
  // trees and tufts of rank 14 and finer come only with the tile of their own zoom (js/ink-worker.js caps them), so they
  // fade in over the zoom after it
  const fadeRankLate = (extra) => byZoom(z => ['*', extra ? extra(z) : 1, ['case', ['>=', R_, 14], clamp01(['-', z, R_]), clamp01(['-', z + 1, R_])]]);
  const growRank = (base, k, cap, prop) => byZoom(z => ['*', base, prop ? ['get', prop] : 1, ['min', cap, ['^', 2, ['*', k, ['-', z, R_]]]]]);
  // opacity ramp: 0 at a, 1 at b, 1 at c, 0 at d
  function ramp(a, b, c, d) {
    const s = ['interpolate', ['linear'], ['zoom']];
    if (a !== null) s.push(a, 0, b, 1); else s.push(0, 1);
    if (c !== null) s.push(c, 1, d, 0);
    return s;
  }
  const iz = (...pairs) => { const e = ['interpolate', ['linear'], ['zoom']]; for (let i = 0; i < pairs.length; i += 2) e.push(pairs[i], pairs[i + 1]); return e; };
  // a per-feature fade-in from a "z" property: 0 at z-0.7, 1 at z+0.3 (sampled at integer zooms)
  const fadeProp = (prop, hi) => byZoom(z => ['*', clamp01(['-', z + 0.7, ['get', prop]]), hi === undefined ? 1 : (typeof hi === 'function' ? hi(z) : hi)]);
  const NAME_LOCAL = ['coalesce', ['get', 'name:latin'], ['get', 'name_int'], ['get', 'name']];
  const NAME_EN = ['coalesce', ['get', 'name_en'], ['get', 'name:en'], ['get', 'name:latin'], ['get', 'name']];
  // a soft parchment halo: strong enough to lift names off the hatching, light enough not to show as a cream patch on snow
  const HALO = 'rgba(245,236,212,0.8)';

  // ------------------------------------------------------------------ style
  function buildStyle(o) {
    const base = o.base;
    const water = (extra) => Object.assign({ source: 'ofm', 'source-layer': 'water' }, extra);
    const OCEAN = ['==', ['get', 'class'], 'ocean'];
    const LAKE = ['in', ['get', 'class'], ['literal', ['lake', 'pond', 'river']]];
    const layers = [];
    const HZ = ['get', 'z'];
    const L = (l, group) => { l.metadata = Object.assign({ group: group || 'ink' }, l.metadata || {}); layers.push(l); };
    // ---- deep winter: the default look. Snowy versions of the glyphs (snow-laden conifers, bare trees, white-capped peaks,
    // snowy roofs) are drawn where a point lies inside the snow extent (data/biomes_snow.geojson, code/02i_tints.py);
    // one layer each: in winter its icon (or colour) is chosen by a test, snowy inside the snow extent and plain outside;
    // InkMap.setWinter swaps the expression for the plain one, so the toggle needs no reload and no twin layers. The glyphs
    // drawn by js/ink-worker.js carry the test as a property (sz), the world marks too (sn); OpenFreeMap features are tested
    // with "within". A layer with no snowy look shows nothing inside the snow in winter.
    const WINTER = o.winter !== undefined ? !!o.winter : PAL.winter !== false;
    const ICON_IDS = global.InkIcons && global.InkIcons.ids ? global.InkIcons.ids() : [];
    const TSNOW = ICON_IDS.filter(i => /-s$/.test(i)).map(i => i.slice(0, -2)).filter(i => ICON_IDS.includes(i));   // town glyphs with a snowy roof
    const SNOWZ = o.snowZone ? ['within', o.snowZone] : null;
    const SZP = ['==', ['get', 'sz'], 1];
    const wsplit = (base, group, snowy, test) => {
      const SZ = test || (base.source === 'ink' ? SZP : SNOWZ);
      if (!SZ) { L(base, group); return; }
      const wl = {}, wp = {};
      // zoom steps must stay on the outside of an expression: a step on zoom gets the test inside each of its outputs
      const isStep = e => Array.isArray(e) && e[0] === 'step' && Array.isArray(e[1]) && e[1][0] === 'zoom';
      const pick = (win, plain) => (isStep(win) && isStep(plain) && win.length === plain.length)
        ? plain.map((v, i) => (i === 2 || (i > 2 && i % 2 === 0)) ? ['case', SZ, win[i], v] : v)
        : ['case', SZ, win, plain];
      const sw = (sect, out, k, win) => { const plain = base[sect][k]; const e = pick(win, plain); out[k] = [e, plain]; base[sect][k] = WINTER ? e : plain; };
      if (base.type === 'symbol') sw('layout', wl, 'icon-image', snowy && snowy.layout && snowy.layout['icon-image'] !== undefined ? snowy.layout['icon-image'] : '');
      for (const [k, v] of Object.entries((snowy && snowy.paint) || {})) sw('paint', wp, k, v);
      if (snowy && snowy.layout) for (const [k, v] of Object.entries(snowy.layout)) if (k !== 'icon-image') sw('layout', wl, k, v);
      base.metadata = Object.assign(base.metadata || {}, Object.keys(wl).length ? { wlayout: wl } : {}, Object.keys(wp).length ? { wpaint: wp } : {});
      L(base, group);
    };

    L({ id: 'paper', type: 'background', paint: { 'background-pattern': 'paper' } }, 'paper');
    L({ id: 'm-bg', type: 'background', layout: { visibility: 'none' }, paint: { 'background-color': '#F2EFE9' } }, 'modern');
    // ---- watercolour: a soft wash over the land by biome and height, as on a hand-tinted antique map (data/biomes_tint.webp,
    // code/02i_tints.py); it fades as you zoom in so the paper and the drawn countryside take over
    // far out in winter the wash and the snow are one raster, the snow laid over the wash in the browser (tintw below): one
    // full-screen pass instead of two; from zoom 6.5, where the fields come between them, they are drawn apart again
    L({ id: 'tint-w', type: 'raster', source: 'tintw', maxzoom: 6.5, layout: { visibility: WINTER ? 'visible' : 'none' }, metadata: { winter: true },
      paint: { 'raster-opacity': 1, 'raster-resampling': 'linear', 'raster-fade-duration': 0 } }, 'tint');
    L({ id: 'tint', type: 'raster', source: 'tint', minzoom: WINTER ? 6.5 : 0, paint: { 'raster-opacity': iz(0, 0.9, 4, 0.85, 8, 0.7, 11, 0.5, 14, 0.38), 'raster-resampling': 'linear', 'raster-fade-duration': 0, 'raster-saturation': -0.05 } }, 'tint');
    // ---- land cover hints
    L({ id: 'ice', type: 'fill', source: 'ofm', 'source-layer': 'landcover', filter: ['==', ['get', 'class'], 'ice'], paint: { 'fill-color': '#FBF6E6', 'fill-opacity': 0.75 } }, 'ink');
    L({ id: 'ice-edge', type: 'line', source: 'ofm', 'source-layer': 'landcover', filter: ['==', ['get', 'class'], 'ice'], paint: { 'line-color': INK.blue, 'line-width': 0.6, 'line-dasharray': [2, 2], 'line-opacity': 0.6 } }, 'ink');
    L({ id: 'sand', type: 'fill', source: 'ofm', 'source-layer': 'landcover', minzoom: 9, filter: ['==', ['get', 'class'], 'sand'], paint: { 'fill-color': INK.paperDeep, 'fill-opacity': iz(9, 0, 10, 0.5) } }, 'ink');
    L({ id: 'hillshade', type: 'hillshade', source: 'dem', layout: { visibility: 'none' }, paint: { 'hillshade-shadow-color': '#4A3420', 'hillshade-highlight-color': '#FFF6DC', 'hillshade-accent-color': '#4A3420', 'hillshade-exaggeration': iz(3, 0.25, 10, 0.35, 14, 0.5), 'hillshade-illumination-direction': 315 } }, 'hillshade');
    // ---- modern plain map (hidden unless toggled)
    L(water({ id: 'm-water', type: 'fill', layout: { visibility: 'none' }, paint: { 'fill-color': '#AAD3DF' } }), 'modern');
    L({ id: 'm-wood', type: 'fill', source: 'ofm', 'source-layer': 'landcover', layout: { visibility: 'none' }, filter: ['==', ['get', 'class'], 'wood'], paint: { 'fill-color': '#ADD19E', 'fill-opacity': 0.7 } }, 'modern');
    L({ id: 'm-urban', type: 'fill', source: 'ofm', 'source-layer': 'landuse', layout: { visibility: 'none' }, filter: ['in', ['get', 'class'], ['literal', ['residential', 'suburb', 'neighbourhood', 'commercial', 'industrial']]], paint: { 'fill-color': '#E0DFDF', 'fill-opacity': 0.8 } }, 'modern');
    // ---- the countryside in the same hand (OpenStreetMap land cover and land use): a soft wash from zoom 7, then ploughed
    // strips (one of eight directions and tints per field, by its id), vine rows, orchard trees, allotment plots and meadow tufts
    const LC = ['get', 'class'], LS = ['get', 'subclass'];
    const FARM = ['all', ['==', LC, 'farmland']], MEAD = ['all', ['==', LC, 'grass'], ['in', LS, ['literal', ['meadow', 'grassland', 'village_green']]]];
    L({ id: 'farm-wash', type: 'fill', source: 'ofm', 'source-layer': 'landcover', minzoom: 6.5, filter: ['any', FARM, MEAD],
      paint: { 'fill-color': ['case', FARM, '#D6B36A', '#A9B672'], 'fill-antialias': false, 'fill-opacity': iz(6.5, 0, 7.5, 0.16, 10, 0.12, 12, 0.08) } }, 'farms');
    L({ id: 'farm-fields', type: 'fill', source: 'ofm', 'source-layer': 'landcover', minzoom: 9.6, filter: FARM,
      paint: { 'fill-pattern': ['match', LS, 'vineyard', 'vin', ['orchard', 'plant_nursery'], 'orc', 'allotments', 'alt', ['concat', 'fld', ['to-string', ['%', ['coalesce', ['id'], 0], 8]]]],
        'fill-opacity': iz(9.6, 0, 10.6, 0.5, 14, 0.45) } }, 'farms');
    L({ id: 'farm-allot', type: 'fill', source: 'ofm', 'source-layer': 'landuse', minzoom: 12, filter: ['==', ['get', 'class'], 'allotments'],
      paint: { 'fill-pattern': 'alt', 'fill-opacity': iz(12, 0, 12.6, 0.7) } }, 'farms');
    L({ id: 'meadows', type: 'fill', source: 'ofm', 'source-layer': 'landcover', minzoom: 10.5, filter: MEAD,
      paint: { 'fill-pattern': 'mdw', 'fill-opacity': iz(10.5, 0, 11.5, 0.8) } }, 'farms');
    // parks and gardens as areas: a soft green wash, little round trees, parterres in formal gardens, a railing line round
    const PARK = ['any', ['all', ['==', LC, 'grass'], ['in', LS, ['literal', ['park', 'garden', 'recreation_ground']]]]];
    L({ id: 'park-fill', type: 'fill', source: 'ofm', 'source-layer': 'landcover', minzoom: 10.5, filter: PARK,
      paint: { 'fill-pattern': ['match', LS, 'garden', 'par', 'prk'], 'fill-opacity': iz(10.5, 0, 11.5, 0.95) } }, 'heritage');
    L({ id: 'park-fill-lu', type: 'fill', source: 'ofm', 'source-layer': 'landuse', minzoom: 11, filter: ['in', ['get', 'class'], ['literal', ['park', 'garden', 'recreation_ground']]],
      paint: { 'fill-pattern': ['match', ['get', 'class'], 'garden', 'par', 'prk'], 'fill-opacity': iz(11, 0, 12, 0.9) } }, 'heritage');
    L({ id: 'park-rail', type: 'line', source: 'ofm', 'source-layer': 'landcover', minzoom: 11.5, filter: PARK,
      paint: { 'line-color': '#4F6B3A', 'line-width': iz(11.5, 0.6, 15, 1.2), 'line-dasharray': [3, 1.2], 'line-opacity': iz(11.5, 0, 12.2, 0.8) } }, 'heritage');
    // ---- deep winter (the default look): snow over the land where deep winter lays it (data/biomes_snow.webp: by latitude,
    // height and climate), over the fields so they show faintly through it; lakes are cleared of the wash first, so in the
    // snow they read as frozen white sheets inside their ink edge. The sea is cleared again afterwards with plain paper.
    L(water({ id: 'lake-mask', type: 'fill', filter: ['!', OCEAN], paint: { 'fill-pattern': 'paper', 'fill-antialias': false } }), 'paper');
    L({ id: 'snow', type: 'raster', source: 'snowimg', minzoom: 6.5, layout: { visibility: WINTER ? 'visible' : 'none' }, metadata: { winter: true },
      paint: { 'raster-opacity': iz(0, 0.97, 6, 0.95, 10, 0.9, 14, 0.86), 'raster-resampling': 'linear', 'raster-fade-duration': 0 } }, 'paper');
    // frozen lakes: a pale sheet of ice over every lake in winter, with the snow lying on it where it falls
    L(water({ id: 'lake-ice', type: 'fill', filter: ['==', ['get', 'class'], 'lake'], minzoom: 6, layout: { visibility: WINTER ? 'visible' : 'none' }, metadata: { winter: true },
      paint: { 'fill-color': INK.ice, 'fill-opacity': iz(6, 0, 7, 0.55), 'fill-antialias': false } }), 'rivers');
    L(water({ id: 'sea-mask', type: 'fill', filter: OCEAN, paint: { 'fill-pattern': 'paper', 'fill-antialias': false } }), 'paper');
    // ---- sea shading
    // the whole sea takes a pale watercolour blue (a soft blue laid thin, so on the yellow paper it reads as a pale grey-blue and the
    // paper grain shows through), a little deeper far out at the world zooms; lakes keep their own lighter wash. Near the coast a band of
    // paper lifts it again, so the ripple lines and the coastal wash sit on lighter water, as where an old map's colourist
    // left the shallows pale. (The band stays within 7 px of the coast: the tiles' clipped edges lie 8 px outside each tile.)
    const SEA_OP = ['interpolate', ['linear'], ['zoom'], 0, ['case', OCEAN, 0.40, 0.10], 4, ['case', OCEAN, 0.38, 0.10], 8, ['case', OCEAN, 0.35, 0.10], 12, ['case', OCEAN, 0.32, 0.10], 16, ['case', OCEAN, 0.30, 0.10]];
    L(water({ id: 'sea-tint', type: 'fill', metadata: { seaOp: SEA_OP }, paint: { 'fill-color': ['case', OCEAN, INK.seaWash, INK.wash], 'fill-opacity': SEA_OP, 'fill-antialias': false } }), 'sea');
    L(water({ id: 'sea-shallow', type: 'line', filter: OCEAN, paint: { 'line-color': INK.paper, 'line-width': 6, 'line-offset': 3.4, 'line-blur': 3.5, 'line-opacity': iz(0, 0.55, 8, 0.6, 14, 0.5) } }), 'sea');
    [[2.2, 4, 0.055], [4.4, 4, 0.035], [6.4, 3, 0.022]].forEach(([off, w, op], i) => {
      L(water({ id: 'sea-wash-' + i, type: 'line', filter: OCEAN, paint: { 'line-color': INK.wash, 'line-width': w, 'line-offset': off, 'line-blur': w * 0.8, 'line-opacity': iz(0, op * 1.2, 6, op, 12, op * 0.8) } }), 'sea');
    });
    // ripples: thin offset lines along the coast (the first in black ink, the rest blue); more appear as you zoom
    const rip = [[1.7, INK.ink, 0.55, null], [3.3, INK.blue, 0.5, null], [4.9, INK.blue, 0.42, [3, 4.5]], [6.4, INK.blueSoft, 0.48, [5, 6.5]], [7.7, INK.blueSoft, 0.4, [7, 8.5]]];
    rip.forEach(([off, col, op, zr], i) => {
      L(water({ id: 'ripple-' + i, type: 'line', filter: i < 2 ? ['any', OCEAN, ['>=', ['zoom'], 8]] : OCEAN, minzoom: zr ? zr[0] : 0,
        paint: { 'line-color': col, 'line-offset': iz(0, off * 0.6, 3, off * 0.7, 6, off, 12, off), 'line-width': iz(0, 0.45, 6, 0.7, 12, 0.9 - i * 0.08),
          'line-opacity': zr ? iz(zr[0], 0, zr[1], op) : op } }), 'sea');
    });
    L({ id: 'field-edges', type: 'line', source: 'ofm', 'source-layer': 'landcover', minzoom: 11.5, filter: FARM,
      paint: { 'line-color': '#6E5C36', 'line-width': iz(11.5, 0.4, 14, 0.8), 'line-opacity': iz(11.5, 0, 12.5, 0.45) } }, 'farms');
    // ---- lakes and rivers
    L(water({ id: 'lake-edge', type: 'line', filter: ['!', OCEAN], minzoom: 5, paint: { 'line-color': INK.ink, 'line-width': iz(5, 0.4, 9, 0.8, 13, 1.1), 'line-opacity': iz(5, 0, 6, 0.85) } }), 'ink');
    // ripples inside lakes and reservoirs (blue, as along the coast)
    [[2.2, 0.5], [4.2, 0.35]].forEach(([off, op], i) => L(water({ id: 'lake-ripple-' + i, type: 'line', filter: ['==', ['get', 'class'], 'lake'], minzoom: 8 + i,
      metadata: { wpaint: { 'line-color': [INK.iceLine, INK.blue] } },
      paint: { 'line-color': WINTER ? INK.iceLine : INK.blue, 'line-offset': off, 'line-width': 0.6, 'line-opacity': iz(8 + i, 0, 9 + i, op) } }), 'rivers'));
    // parks and protected land: a dotted green-brown boundary (OpenMapTiles park layer, and town parks from land use)
    L({ id: 'park-edge', type: 'line', source: 'ofm', 'source-layer': 'park', minzoom: 7, layout: { 'line-cap': 'round' },
      paint: { 'line-color': '#4F6B3A', 'line-width': iz(7, 0.7, 12, 1.3), 'line-dasharray': [0.1, 2.4], 'line-opacity': iz(7, 0, 8, 0.6) } }, 'heritage');
    L({ id: 'park-edge-town', type: 'line', source: 'ofm', 'source-layer': 'landuse', minzoom: 12, filter: ['in', ['get', 'class'], ['literal', ['park', 'garden', 'cemetery']]], layout: { 'line-cap': 'round' },
      paint: { 'line-color': '#4F6B3A', 'line-width': 1.1, 'line-dasharray': [0.1, 2.2], 'line-opacity': iz(12, 0, 12.6, 0.55) } }, 'heritage');
    // walls and dykes along their real lines (OpenStreetMap; approximate lines where none is mapped)
    L({ id: 'walls', type: 'line', source: 'walls', filter: ['<=', ['get', 'z'], ['+', ['zoom'], 0.5]], layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': INK.ink, 'line-width': iz(3, 1.2, 8, 1.8, 13, 2.6), 'line-dasharray': [3, 0.6], 'line-opacity': fadeProp('z', 0.85) } }, 'heritage');
    // a strip of clear parchment along every town wall, so the drawn houses never sit on it
    L({ id: 'walls-casing', type: 'line', source: 'walls', minzoom: 12, filter: ['==', ['get', 'k'], 'wall'], layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': '#F1E2BA', 'line-width': iz(12, 7, 14, 14, 16, 26), 'line-opacity': iz(12, 0, 12.5, 0.97), 'line-blur': 1 } }, 'heritage');
    L({ id: 'walls-crest', type: 'line', source: 'walls', minzoom: 9, filter: ['==', ['get', 'k'], 'wall'], layout: { 'line-join': 'round' },
      paint: { 'line-pattern': 'wallseg', 'line-width': iz(9, 5, 14, 10, 16, 16), 'line-opacity': iz(9, 0, 10, 0.95) } }, 'heritage');
    L({ id: 'wall-towers', type: 'symbol', source: 'walls', minzoom: 12, filter: ['==', ['get', 'k'], 'wall'],
      layout: { 'symbol-placement': 'line', 'symbol-spacing': iz(12, 90, 15, 140), 'icon-image': 'walltower', 'icon-size': iz(12, 0.9, 15, 1.3), 'icon-rotation-alignment': 'viewport', 'icon-overlap': 'cooperative', 'icon-anchor': 'bottom' },
      paint: { 'icon-opacity': iz(12, 0, 12.5, 1) } }, 'heritage');
    // star forts: the real bastioned outline (OpenStreetMap) with a moat outside and a hachured rampart inside; a drawn star fort symbol further out
    const FPOLY = ['==', ['geometry-type'], 'Polygon'], FPT = ['==', ['geometry-type'], 'Point'];
    L({ id: 'fort-moat', type: 'line', source: 'forts', minzoom: 11, filter: FPOLY, layout: { 'line-join': 'miter', 'line-miter-limit': 4 },
      paint: { 'line-color': '#9DBBD6', 'line-width': iz(11, 3, 14, 12, 17, 44), 'line-offset': iz(11, -1.5, 14, -6, 17, -22), 'line-opacity': iz(11, 0, 11.6, 0.85) } }, 'heritage');
    L({ id: 'fort-moat-edge', type: 'line', source: 'forts', minzoom: 12, filter: FPOLY, layout: { 'line-join': 'miter' },
      paint: { 'line-color': INK.blue, 'line-width': iz(12, 0.6, 16, 1.1), 'line-offset': iz(12, -6, 14, -12, 17, -44), 'line-opacity': iz(12, 0, 12.6, 0.8) } }, 'heritage');
    L({ id: 'fort-rampart', type: 'line', source: 'forts', minzoom: 11.5, filter: FPOLY, layout: { 'line-join': 'miter', 'line-miter-limit': 4 },
      paint: { 'line-pattern': 'rampart', 'line-width': iz(11.5, 3, 14, 7, 17, 18), 'line-offset': iz(11.5, 1.5, 14, 3.5, 17, 9), 'line-opacity': iz(11.5, 0, 12, 1) } }, 'heritage');
    L({ id: 'fort-line', type: 'line', source: 'forts', minzoom: 11, filter: FPOLY, layout: { 'line-join': 'miter', 'line-miter-limit': 4 },
      paint: { 'line-color': INK.ink, 'line-width': iz(11, 1.1, 15, 2.2, 17, 3), 'line-opacity': iz(11, 0, 11.6, 1) } }, 'heritage');
    L({ id: 'fort-icons', type: 'symbol', source: 'forts', filter: ['all', FPT, ['<=', ['get', 'z'], ['+', ['zoom'], 0.3]]], maxzoom: 12.5,
      layout: { 'icon-image': 'h-starfort', 'icon-size': ['interpolate', ['linear'], ['zoom'], 5, 0.55, 9, 0.8, 12, 1.0], 'icon-overlap': 'cooperative', 'symbol-sort-key': ['get', 'z'],
        'text-field': ['step', ['zoom'], '', 7, ['get', 'n']], 'text-font': ['Ink Italic'], 'text-size': iz(7, 10, 12, 12.5), 'text-optional': true, 'text-variable-anchor': ['top', 'bottom', 'right', 'left'], 'text-radial-offset': 1.25 },
      paint: { 'icon-opacity': ['interpolate', ['linear'], ['zoom'], 11.4, 1, 12.2, 0], 'text-opacity': ['interpolate', ['linear'], ['zoom'], 11.4, 1, 12.2, 0], 'text-color': INK.red, 'text-halo-color': HALO, 'text-halo-width': 1.3 } }, 'heritage');
    wsplit({ id: 'rivers', type: 'line', source: 'ofm', 'source-layer': 'waterway', filter: ['!=', ['get', 'intermittent'], 1],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': INK.blue,
        'line-width': ['interpolate', ['linear'], ['zoom'], 3, ['match', ['get', 'class'], 'river', 0.6, 0.2], 7, ['match', ['get', 'class'], 'river', 1.1, 'canal', 0.5, 0.3], 10, ['match', ['get', 'class'], 'river', 1.6, 'canal', 0.9, 'stream', 0.6, 0.4], 14, ['match', ['get', 'class'], 'river', 2.4, 'canal', 1.4, 'stream', 1.0, 0.6]],
        'line-opacity': ['interpolate', ['linear'], ['zoom'], 3, ['match', ['get', 'class'], 'river', 0.8, 0], 9, ['match', ['get', 'class'], 'river', 0.95, 'canal', 0.6, 0], 11, ['match', ['get', 'class'], 'river', 1, 'canal', 0.8, 'stream', 0.75, 0.3]] } }, 'rivers', { paint: { 'line-color': INK.iceLine } });
    // ---- coast
    L(water({ id: 'coast', type: 'line', filter: OCEAN, layout: { 'line-join': 'round' }, paint: { 'line-color': INK.ink, 'line-width': iz(0, 0.7, 4, 1.0, 8, 1.4, 12, 1.7), 'line-blur': 0.2 } }), 'coast');
    // ---- boundaries
    L({ id: 'border-2', type: 'line', source: 'ofm', 'source-layer': 'boundary', filter: ['all', ['==', ['get', 'admin_level'], 2], ['!=', ['get', 'maritime'], 1]],
      layout: { 'line-join': 'round' }, paint: { 'line-color': INK.ink, 'line-width': iz(1, 0.5, 5, 0.9, 10, 1.4), 'line-opacity': iz(1, 0.5, 5, 0.65), 'line-dasharray': [5, 2, 1, 2] } }, 'borders');
    L({ id: 'border-4', type: 'line', source: 'ofm', 'source-layer': 'boundary', minzoom: 4, filter: ['all', ['==', ['get', 'admin_level'], 4], ['!=', ['get', 'maritime'], 1]],
      paint: { 'line-color': INK.ink, 'line-width': iz(4, 0.4, 9, 0.8), 'line-opacity': iz(4, 0, 5, 0.45), 'line-dasharray': [1, 2.4] } }, 'borders');
    // ---- roads, faint dotted
    const RC = ['get', 'class'];
    // main roads are drawn from zoom 8 as pale tracks between two faint ink lines, as on old county maps; lanes and paths stay dotted
    const MAIN = ['motorway', 'trunk', 'primary', 'secondary'];
    L({ id: 'roads-track-case', type: 'line', source: 'ofm', 'source-layer': 'transportation', minzoom: 8, filter: ['all', ['in', RC, ['literal', MAIN]], ['!=', ['get', 'brunnel'], 'tunnel']],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#6B4E2E', 'line-width': ['interpolate', ['linear'], ['zoom'], 8, ['match', RC, ['motorway', 'trunk'], 2.6, 1.8], 12, ['match', RC, ['motorway', 'trunk', 'primary'], 5, 4], 15, 9],
        'line-opacity': ['interpolate', ['linear'], ['zoom'], 8, 0, 8.8, ['match', RC, ['motorway', 'trunk', 'primary'], 0.4, 0], 10.5, 0.42] } }, 'roads');
    L({ id: 'roads-track', type: 'line', source: 'ofm', 'source-layer': 'transportation', minzoom: 8, filter: ['all', ['in', RC, ['literal', MAIN]], ['!=', ['get', 'brunnel'], 'tunnel']],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#F4E8C8', 'line-width': ['interpolate', ['linear'], ['zoom'], 8, ['match', RC, ['motorway', 'trunk'], 1.4, 0.8], 12, ['match', RC, ['motorway', 'trunk', 'primary'], 3.4, 2.6], 15, 7],
        'line-opacity': ['interpolate', ['linear'], ['zoom'], 8, 0, 8.8, ['match', RC, ['motorway', 'trunk', 'primary'], 0.95, 0], 10.5, 0.95] } }, 'roads');
    // pale streets in the drawn towns, and piers in ink
    L({ id: 'streets', type: 'line', source: 'ofm', 'source-layer': 'transportation', minzoom: 12, filter: ['in', RC, ['literal', ['tertiary', 'minor', 'service']]],
      layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#F6ECD2', 'line-width': iz(12, 2.2, 15, 6), 'line-opacity': iz(12, 0, 12.6, 0.85) } }, 'roads');
    L({ id: 'piers', type: 'line', source: 'ofm', 'source-layer': 'transportation', minzoom: 12, filter: ['==', RC, 'pier'],
      paint: { 'line-color': INK.ink, 'line-width': iz(12, 1.4, 16, 4), 'line-opacity': 0.8 } }, 'heritage');
    L({ id: 'roads', type: 'line', source: 'ofm', 'source-layer': 'transportation', minzoom: 6,
      filter: ['any', ['in', RC, ['literal', ['tertiary', 'minor', 'track', 'path']]], ['all', ['in', RC, ['literal', MAIN]], ['<', ['zoom'], 9]]],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#6B4E2E', 'line-dasharray': [0.1, 2.6],
        'line-width': ['interpolate', ['linear'], ['zoom'], 6, ['match', RC, ['motorway', 'trunk'], 1.3, 0.9], 12, ['match', RC, ['motorway', 'trunk', 'primary'], 2.2, ['secondary', 'tertiary'], 1.8, 1.4]],
        'line-opacity': ['interpolate', ['linear'], ['zoom'], 6, 0, 7, ['match', RC, 'motorway', 0.32, 0], 9, ['match', RC, ['motorway', 'trunk'], 0.38, 'primary', 0.2, 0], 10.5, ['match', RC, ['motorway', 'trunk', 'primary'], 0.45, 'secondary', 0.32, 0], 12, ['match', RC, ['motorway', 'trunk', 'primary', 'secondary'], 0.5, 'tertiary', 0.42, 'minor', 0.3, 0], 13, ['match', RC, ['track', 'path'], 0.28, 0.5]] } }, 'roads');
    L({ id: 'm-roads', type: 'line', source: 'ofm', 'source-layer': 'transportation', minzoom: 5, layout: { visibility: 'none', 'line-cap': 'round', 'line-join': 'round' },
      filter: ['in', RC, ['literal', ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor']]],
      paint: { 'line-color': ['match', RC, 'motorway', '#E892A2', 'trunk', '#F9B29C', 'primary', '#FCD6A4', '#FFFFFF'], 'line-width': ['interpolate', ['linear'], ['zoom'], 5, 0.6, 12, ['match', RC, ['motorway', 'trunk'], 4, 'primary', 3, 1.6]] } }, 'modern');
    L({ id: 'm-border', type: 'line', source: 'ofm', 'source-layer': 'boundary', layout: { visibility: 'none' }, filter: ['all', ['<=', ['get', 'admin_level'], 4], ['!=', ['get', 'maritime'], 1]], paint: { 'line-color': '#9E8FA8', 'line-width': ['match', ['get', 'admin_level'], 2, 1.2, 0.6] } }, 'modern');

    // ---- glyphs (cooperative: they overlap each other but give way to every name)
    const glyphLayout = (img, size, extra) => Object.assign({ 'icon-image': img, 'icon-size': size, 'icon-overlap': 'cooperative', 'icon-ignore-placement': false, 'symbol-z-order': 'viewport-y', 'icon-anchor': 'bottom', 'icon-padding': 0 }, extra || {});
    // world-scale ink (data/world_ink.geojson, code/02h_world_ink.py): range "caterpillars" of little peaks along the axis of every
    // high, rugged range, dune fields in the great sand seas and bands of trees across the taiga and the rainforests. They fade out
    // between zoom 3 and 4, where the glyphs drawn tile by tile take over.
    const WZ = ['get', 'z'];
    // each mark fades in over half a zoom before its first zoom (symbol filters are evaluated at the tile's whole zoom, so the
    // filter lets in all that are due before the next one and the fade decides); the world layer hands over to the tile glyphs
    // between zoom 3 and 3.9
    const wfade = (hi) => byZoom(z => ['*', clamp01(['+', 1, ['*', 2, ['-', z, WZ]]]), z <= 3 ? hi : z >= 4 ? 0 : hi * Math.max(0, (3.9 - z) / 0.9)]);
    wsplit({ id: 'world-ranges', type: 'symbol', source: 'world', maxzoom: 4, filter: ['all', ['==', ['get', 'kind'], 'range'], ['<=', WZ, ['+', ['zoom'], 1.0]]],
      layout: { 'icon-image': ['concat', 'rng', ['to-string', ['get', 'v']]],
        'icon-size': iz(0, ['*', ['get', 's'], 0.72], 1, ['*', ['get', 's'], 0.84], 2, ['*', ['get', 's'], 0.92], 3, ['*', ['get', 's'], 1.0], 4, ['*', ['get', 's'], 1.05]), 'icon-anchor': 'bottom',
        'icon-overlap': 'cooperative', 'icon-padding': 0, 'symbol-z-order': 'viewport-y', 'symbol-avoid-edges': false },
      paint: { 'icon-opacity': wfade(0.97) } }, 'mountains', { layout: { 'icon-image': ['concat', 'rngs', ['to-string', ['get', 'v']]] } }, ['==', ['get', 'sn'], 1]);
    const WK = ['get', 'kind'];
    const wbSize = (k) => ['*', ['match', WK, 'dune', 1.2, 'rain', 0.8, 'hill', 0.72, 1.1], k];
    wsplit({ id: 'world-biome', type: 'symbol', source: 'world', maxzoom: 4, filter: ['all', ['!=', WK, 'range'], ['<=', WZ, ['+', ['zoom'], 1.0]]],
      layout: glyphLayout(['concat', ['match', WK, 'dune', 'b1-', 'rain', 'b3-', 'hill', 'h', 'b4-'], ['to-string', ['get', 'v']]],
        iz(0, wbSize(0.8), 1, wbSize(0.9), 2, wbSize(0.95), 3, wbSize(1.0))),
      paint: { 'icon-opacity': wfade(0.9) } }, 'biomes', { layout: { 'icon-image': ['concat', ['match', WK, 'dune', 'b1-', 'rain', 'b3-', 'hill', 'hs', 'b4s-'], ['to-string', ['get', 'v']]] } }, ['==', ['get', 'sn'], 1]);
    // beasts of the countryside, zoom 6 to 14: deer and boar in the woods, sheep on the moors, cattle on the farms, eagles over
    // the mountains, herons by the water (js/ink-worker.js: one in a few cells of the nested grid, a few a tile at most)
    L({ id: 'beasts', type: 'symbol', source: 'ink', 'source-layer': 'beasts', minzoom: 6,
      layout: { 'icon-image': ['concat', 'a_', ['get', 'a']], 'icon-size': iz(6, 0.5, 9, 0.62, 12, 0.75, 14, 0.85), 'icon-overlap': 'never', 'icon-padding': 3, 'symbol-sort-key': ['get', 'r'], 'icon-anchor': 'bottom' },
      paint: { 'icon-opacity': fadeRank(z => z < 6.5 ? 0.9 : 0.92) } }, 'animals');
    // biome glyphs (RESOLVE Ecoregions 2017 with OpenStreetMap ice and sand): grow and multiply with zoom like the peaks;
    // rainforest and taiga crowns fade out at zoom 7, where OpenStreetMap's own woods take over
    const BB = ['get', 'b'];
    wsplit({ id: 'biome', type: 'symbol', source: 'ink', 'source-layer': 'biome',
      layout: glyphLayout(['concat', 'b', ['to-string', BB], '-', ['to-string', ['get', 'v']]],
        byZoom(z => ['*', ['match', BB, 1, 0.82, 2, 1.0, 3, 0.74, 4, 1.0, 5, 0.85, 0.6], z < 3 ? 0.85 : 1, ['min', 1.35, ['^', 2, ['*', 0.35, ['-', z, R_]]]]])),
      paint: { 'icon-opacity': byZoom(z => ['*', clamp01(['-', z + 1, R_]), z <= 2 ? 0 : z === 3 ? 0.75 : 1,
        ['match', BB, 3, z < 6 ? 1 : z >= 7 ? 0 : 7 - z, 4, z < 6 ? 1 : z >= 7 ? 0 : 7 - z, 5, 0.9, 7, 0.75, 2, 0.85, 0.95]]) } }, 'biomes', { layout: { 'icon-image': ['match', BB, 4, ['concat', 'b4s-', ['to-string', ['get', 'v']]], 5, ['concat', 'b5-', ['to-string', ['get', 'v']]], 1, ['concat', 'b1-', ['to-string', ['get', 'v']]], ''] } });
    wsplit({ id: 'tufts', type: 'symbol', source: 'ink', 'source-layer': 'tufts', minzoom: 9,
      layout: glyphLayout(['concat', ['match', ['get', 'w'], 1, 'w', 'g'], ['to-string', ['get', 'v']]], growRank(0.75, 0.3, 1.1)),
      paint: { 'icon-opacity': fadeRankLate(z => (z <= 9 ? 0 : z >= 10 ? 0.75 : 0.75 * (z - 9))) } }, 'forests');
    wsplit({ id: 'trees', type: 'symbol', source: 'ink', 'source-layer': 'trees', minzoom: 7,
      layout: glyphLayout(['concat', ['match', ['get', 'c'], 1, 'c', 't'], ['to-string', ['get', 'v']]], growRank(0.82, 0.3, 1.2)),
      paint: { 'icon-opacity': fadeRankLate(z => (z <= 7 ? 0 : z >= 8 ? 1 : (z - 7))) } }, 'forests', { layout: { 'icon-image': ['concat', ['match', ['get', 'c'], 1, 'cs', 'tb'], ['to-string', ['get', 'v']]] } });
    wsplit({ id: 'relief', type: 'symbol', source: 'ink', 'source-layer': 'relief',
      layout: glyphLayout(['concat', ['match', ['get', 'k'], 0, ['case', ['==', ['get', 'sn'], 1], 'ms', 'm'], 2, 'snowf', 'h'], ['to-string', ['get', 'v']]],
        byZoom(z => ['*', ['match', ['get', 'k'], 0, 0.54, 2, 0.5, 0.52], ['get', 's'], z < 3 ? 0.8 : z < 5 ? 0.9 : z <= 7 ? 1 : z <= 11 ? 1 + (z - 7) * 0.075 : Math.min(1.6, 1.3 + (z - 11) * 0.1), ['min', z <= 11 ? 1.45 : Math.min(1.75, 1.45 + (z - 11) * 0.1), ['^', 2, ['*', 0.42, ['-', z, R_]]]]])),
      paint: { 'icon-opacity': fadeRank(z => z <= 2 ? 0 : z >= 4 ? 1 : z === 3 ? 0.75 : 1) } }, 'mountains', { layout: { 'icon-image': ['concat', ['match', ['get', 'k'], 0, 'ms', 2, 'snowf', 'hs'], ['to-string', ['get', 'v']]] } });
    // drawn towns (zoom 12 and closer): townhouses facing the streets, market squares, churches, town walls
    wsplit({ id: 'town', type: 'symbol', source: 'ink', 'source-layer': 'town', minzoom: 11.6,
      layout: { 'icon-image': ['get', 't'], 'icon-rotate': ['match', ['get', 't'], 'wallseg', ['get', 'a'], 0], 'icon-rotation-alignment': 'viewport', 'icon-pitch-alignment': 'viewport',   // every house seen from the same side, as on a bird's-eye town plan
        'icon-size': iz(12, 1.15, 13, 1.3, 14, 1.5, 16, 2.0), 'icon-overlap': 'always', 'icon-ignore-placement': true, 'icon-padding': 0, 'symbol-z-order': 'viewport-y',
        'icon-anchor': ['case', ['==', ['index-of', 'tw-', ['get', 't']], 0], 'bottom', 'center'],   // tall houses stand on their site
        'symbol-sort-key': ['case', ['==', ['index-of', 'tc-', ['get', 't']], 0], 1, ['match', ['get', 't'], ['market', 'market2'], 0, 'townchurch', 1, 'walltower', 2, 'wallseg', 3, 5]] },
      paint: { 'icon-opacity': iz(11.6, 0, 12.4, 1) } }, 'towns', { layout: { 'icon-image': TSNOW.length ? ['match', ['get', 't'], TSNOW, ['concat', ['get', 't'], '-s'], ['get', 't']] : ['get', 't'] } });
    // animals in their native ranges, whales where they gather, and a few decorative serpents far out
    const DK = ['get', 'k'];
    // (from zoom 1.5: below it they are faded out, and an invisible animal would still push the world's ranges aside)
    L({ id: 'animals', type: 'symbol', source: 'decor', minzoom: 1.5, maxzoom: 7.2, filter: ['in', DK, ['literal', ['animal', 'whale']]],
      layout: { 'icon-image': ['get', 'i'], 'icon-size': iz(1, 1.0, 2, 1.15, 4, 1.25, 6, 1.35), 'icon-padding': 4, 'icon-overlap': 'never', 'symbol-sort-key': 50 },
      paint: { 'icon-opacity': iz(1.6, 0, 2.2, 0.95, 6.4, 0.95, 7.2, 0) } }, 'animals');
    L({ id: 'serpents', type: 'symbol', source: 'decor', maxzoom: 3.4, filter: ['==', DK, 'serpent'],
      layout: { 'icon-image': ['get', 'i'], 'icon-size': iz(1, 1.1, 3, 1.3), 'icon-overlap': 'never' },
      paint: { 'icon-opacity': iz(0.5, 0.9, 2.9, 0.9, 3.4, 0) } }, 'animals');
    L({ id: 'ships', type: 'symbol', source: 'decor', minzoom: 2, maxzoom: 9.5, filter: ['all', ['==', DK, 'ship'], ['<=', ['get', 'z0'], ['+', ['zoom'], 0.5]]],
      layout: { 'icon-image': 'ship', 'icon-rotate': ['get', 'h'], 'icon-rotation-alignment': 'map', 'icon-size': iz(2, 0.8, 5, 0.95, 8, 1.1), 'icon-padding': 2, 'icon-overlap': 'never' },
      paint: { 'icon-opacity': byZoom(z => ['*', z <= 2 ? 0 : z >= 9.5 ? 0 : z >= 9 ? 0.5 : 0.95, clamp01(['-', z + 0.7, ['get', 'z0']])]) } }, 'animals');
    // flight: busy airports as flying machines taking off, other airfields as small sketches, decorative balloons
    L({ id: 'balloons', type: 'symbol', source: 'decor', minzoom: 4.5, maxzoom: 10, filter: ['==', DK, 'balloon'],
      layout: { 'icon-image': 'balloon', 'icon-size': iz(5, 0.75, 9, 1.0), 'icon-overlap': 'never' },
      paint: { 'icon-opacity': iz(4.5, 0, 5.2, 0.95, 9.4, 0.95, 10, 0) } }, 'flight');
    L({ id: 'flyers', type: 'symbol', source: 'decor', minzoom: 4, maxzoom: 12, filter: ['==', DK, 'flyer'],
      layout: { 'icon-image': 'ornithopter', 'icon-rotate': ['get', 'h'], 'icon-rotation-alignment': 'map', 'icon-size': iz(4, 0.6, 8, 0.8, 11, 0.95), 'icon-overlap': 'never' },
      paint: { 'icon-opacity': iz(4, 0, 4.8, 0.95, 11.4, 0.95, 12, 0) } }, 'flight');

    // ---- names (placed before glyphs, never overlapping one another)
    const TXT = (extra) => Object.assign({ 'text-overlap': 'never', 'text-optional': false, 'text-padding': 2, 'text-letter-spacing': 0.05 }, extra);
    const placeLayer = (id, filter, opts) => L({ id, type: 'symbol', source: 'ofm', 'source-layer': 'place', filter, minzoom: opts.minzoom || 0, maxzoom: opts.maxzoom || 24,
      layout: TXT(Object.assign({ 'text-field': opts.field || NAME_LOCAL, 'text-font': [opts.font || 'Ink Roman'], 'text-size': opts.size, 'icon-image': opts.icon || '', 'icon-size': opts.iconSize || 0.5,
        'text-variable-anchor': opts.icon ? ['left', 'right', 'top', 'bottom'] : ['center'], 'text-radial-offset': opts.icon ? 0.75 : 0, 'text-justify': 'auto', 'text-max-width': 9,
        'symbol-sort-key': ['coalesce', ['get', 'rank'], 30], 'icon-overlap': 'never', 'icon-optional': false, 'text-letter-spacing': opts.ls || 0.04, 'text-transform': opts.transform || 'none' }, opts.padding ? { 'text-padding': opts.padding } : {})),
      paint: { 'text-color': opts.color || INK.red, 'text-halo-color': HALO, 'text-halo-width': 1.4, 'text-halo-blur': 0.5, 'text-opacity': opts.opacity, 'icon-opacity': opts.opacity } }, opts.group || 'names');
    const CL = ['get', 'class'];

    // countries and nations, lettered along curves. MapLibre checks whether a curved name fits using its size at
    // zoom 18, so each size ramp drops to a small value just past the zooms where the layer is shown; the label
    // lines themselves are cut to fit the real size (code/02_labels.py).
    // "United Kingdom" in its zoom 4 band is a layer of its own (country-uk, below), so it can give way to the four nations at 4.5
    const UK4 = ['all', ['==', ['get', 'iso'], 'GBR'], ['==', ['get', 'zb'], 4]];
    L({ id: 'countries', type: 'symbol', source: 'labels', maxzoom: 10.5,
      filter: ['all', ['==', ['get', 'kind'], 'country'], ['==', ['get', 'zb'], ['zoom']], ['!', UK4]],
      layout: TXT({ 'text-field': ['format', ['slice', ['get', 'name'], 0, 1], { 'font-scale': 1.3, 'text-color': INK.redDeep }, ['slice', ['get', 'name'], 1], {}], 'text-font': ['Ink Caps'], 'symbol-placement': 'line-center', 'text-max-angle': 28, 'text-keep-upright': true,
        'text-size': iz(1, 8.5, 2, 10, 3, 12.5, 4, 16, 5, 18, 7, 25, 9, 32, 10.6, 32, 11, 6),
        'text-letter-spacing': iz(1, 0.1, 3, 0.22, 5, 0.36, 8, 0.48), 'symbol-sort-key': ['get', 'lr'], 'text-padding': 2 }),
      paint: { 'text-color': INK.red, 'text-halo-color': HALO, 'text-halo-width': 1.6, 'text-halo-blur': 0.6,
        'text-opacity': byZoom(z => ['*', clamp01(['+', 0.62, ['*', 0.6, ['-', z, ['get', 'zf']]]]),
          1, z >= 10 ? 0 : z >= 9 ? 0.6 : 1]) } }, 'names');
    L({ id: 'country-uk', type: 'symbol', source: 'labels', minzoom: 4, maxzoom: 4.5, filter: ['all', ['==', ['get', 'kind'], 'country'], UK4],
      layout: TXT({ 'text-field': ['format', ['slice', ['get', 'name'], 0, 1], { 'font-scale': 1.3, 'text-color': INK.redDeep }, ['slice', ['get', 'name'], 1], {}], 'text-font': ['Ink Caps'], 'symbol-placement': 'line-center', 'text-max-angle': 28, 'text-keep-upright': true,
        'text-size': iz(4, 16, 5, 18, 5.1, 6), 'text-letter-spacing': iz(4, 0.29, 5, 0.36) }),
      paint: { 'text-color': INK.red, 'text-halo-color': HALO, 'text-halo-width': 1.6, 'text-halo-blur': 0.6, 'text-opacity': iz(4, 1, 4.15, 1, 4.45, 0) } }, 'names');
    // England, Scotland and Wales on curves from zoom 4.5, as "United Kingdom" fades (the two layers never show together, so
    // neither pushes the other aside); Northern Ireland on two lines at its middle
    L({ id: 'nations', type: 'symbol', source: 'labels', minzoom: 4.5, maxzoom: 10.5, filter: ['all', ['==', ['get', 'kind'], 'nation'], ['==', ['geometry-type'], 'LineString'], ['==', ['get', 'zb'], ['zoom']]],
      layout: TXT({ 'text-field': ['format', ['slice', ['get', 'name'], 0, 1], { 'font-scale': 1.3, 'text-color': INK.redDeep }, ['slice', ['get', 'name'], 1], {}], 'text-font': ['Ink Caps'], 'symbol-placement': 'line-center', 'text-max-angle': 28, 'text-keep-upright': true,
        'text-size': iz(4, 10, 5, 12, 6, 14, 7, 17, 9, 24, 10.6, 24, 11, 6), 'text-letter-spacing': iz(4, 0.25, 5, 0.3, 7, 0.4, 9, 0.5) }),
      paint: { 'text-color': INK.red, 'text-halo-color': HALO, 'text-halo-width': 1.6, 'text-halo-blur': 0.6, 'text-opacity': iz(4.5, 0, 4.65, 1, 9, 1, 10, 0.6) } }, 'names');
    L({ id: 'nations-pt', type: 'symbol', source: 'labels', minzoom: 4.5, maxzoom: 10.5, filter: ['all', ['==', ['get', 'kind'], 'nation'], ['==', ['geometry-type'], 'Point']],
      layout: TXT({ 'text-field': ['get', 'name'], 'text-font': ['Ink Caps'], 'text-max-width': 7, 'text-line-height': 1.1,
        'text-size': iz(4.5, 9, 5, 10.5, 7, 15, 9, 20), 'text-letter-spacing': iz(5, 0.2, 9, 0.35) }),
      paint: { 'text-color': INK.red, 'text-halo-color': HALO, 'text-halo-width': 1.6, 'text-opacity': iz(4.5, 0, 4.65, 1, 9, 1, 10, 0.6) } }, 'names');
    // hand-placed upland, lowland and sea names around Britain and Ireland
    const OCN = ['==', ['get', 'kind'], 'ocean'];
    // the narrow seas round Great Britain at zoom 4 to 5, lettered straight (code/02_labels.py)
    L({ id: 'regions-sea-pt', type: 'symbol', source: 'regions', minzoom: 4.3, maxzoom: 5, filter: ['all', ['==', ['geometry-type'], 'Point'], ['==', ['get', 'zb'], ['zoom']]],
      layout: TXT({ 'text-field': ['get', 'name'], 'text-font': ['Ink Italic'], 'text-size': 10.5, 'text-letter-spacing': 0.22, 'text-max-width': 5, 'text-line-height': 1.1 }),
      paint: { 'text-color': INK.red, 'text-halo-color': HALO, 'text-halo-width': 1.4, 'text-opacity': iz(4.3, 0, 4.6, 1) } }, 'names');
    L({ id: 'regions-sea', type: 'symbol', source: 'regions', maxzoom: 12, filter: ['all', ['==', ['geometry-type'], 'LineString'], ['in', ['get', 'kind'], ['literal', ['sea', 'ocean']]], ['==', ['get', 'zb'], ['zoom']], ['>=', ['zoom'], ['floor', ['get', 'zf']]]],
      layout: TXT({ 'text-field': ['get', 'name'], 'text-font': ['Ink Italic'], 'symbol-placement': 'line-center', 'text-max-angle': 30,
        // seas and oceans (oceans larger); code/02_labels.py SIZES mirrors these stops
        'text-size': ['interpolate', ['linear'], ['zoom'], 1, ['case', OCN, 12.5, 11], 3, ['case', OCN, 16, 11], 5, ['case', OCN, 20, 14], 7, ['case', OCN, 23, 17],
          9, ['case', OCN, 23, 20], 11, ['case', OCN, 23, 22], 12.1, ['case', OCN, 23, 22], 12.5, 6],
        'text-letter-spacing': ['interpolate', ['linear'], ['zoom'], 1, ['case', OCN, 0.32, 0.3], 3, ['case', OCN, 0.427, 0.3], 4, ['case', OCN, 0.48, 0.35],
          6, ['case', OCN, 0.54, 0.45], 7, ['case', OCN, 0.6, 0.5], 9, 0.6] }),
      paint: { 'text-color': INK.red, 'text-halo-color': HALO, 'text-halo-width': 1.4, 'text-opacity': byZoom(z => ['*', clamp01(['+', 0.62, ['*', 0.6, ['-', z, ['get', 'zf']]]]), z >= 11 ? 0.5 : 1]) } }, 'names');
    L({ id: 'regions-land', type: 'symbol', source: 'regions', maxzoom: 12.5, filter: ['all', ['==', ['get', 'uk'], 1], ['in', ['get', 'kind'], ['literal', ['up', 'low']]], ['==', ['get', 'zb'], ['zoom']], ['>=', ['zoom'], ['floor', ['get', 'zf']]]],
      layout: TXT({ 'text-field': ['format', ['slice', ['get', 'name'], 0, 1], { 'text-color': '#2F5D8A', 'font-scale': 1.32 }, ['slice', ['get', 'name'], 1], {}], 'text-font': ['Ink Caps'], 'symbol-placement': 'line-center', 'text-max-angle': 30,
        'text-size': iz(5, 10.5, 7, 14, 9, 18, 11, 21, 12.6, 21, 13, 6), 'text-letter-spacing': iz(5, 0.25, 8, 0.4, 11, 0.5) }),
      paint: { 'text-color': INK.red, 'text-halo-color': HALO, 'text-halo-width': 1.5, 'text-opacity': byZoom(z => ['*', clamp01(['+', 0.62, ['*', 0.6, ['-', z, ['get', 'zf']]]]), z >= 12 ? 0 : z >= 11 ? 0.7 : 1]) } }, 'names');
    // ranges, deserts and regions beyond Britain and Ireland: lettered before cities, as on a hand-drawn map
    L({ id: 'regions-world', type: 'symbol', source: 'regions', maxzoom: 12.5, filter: ['all', ['!=', ['get', 'uk'], 1], ['in', ['get', 'kind'], ['literal', ['up', 'low']]], ['==', ['get', 'zb'], ['zoom']], ['>=', ['zoom'], ['floor', ['get', 'zf']]]],
      layout: TXT({ 'text-field': ['format', ['slice', ['get', 'name'], 0, 1], { 'text-color': '#2F5D8A', 'font-scale': 1.32 }, ['slice', ['get', 'name'], 1], {}], 'text-font': ['Ink Caps'], 'symbol-placement': 'line-center', 'text-max-angle': 30,
        'text-size': iz(1, 8.5, 2, 9.5, 3, 11, 4, 13, 6, 16, 9, 19, 11, 21, 12.6, 21, 13, 6), 'text-letter-spacing': iz(1, 0.16, 2, 0.2, 5, 0.3, 8, 0.4, 11, 0.5) }),
      paint: { 'text-color': INK.red, 'text-halo-color': HALO, 'text-halo-width': 1.5, 'text-opacity': byZoom(z => ['*', clamp01(['+', 0.62, ['*', 0.6, ['-', z, ['get', 'zf']]]]), z >= 12 ? 0 : z >= 11 ? 0.7 : 1]) } }, 'names');
    // seas and bays from OpenStreetMap
    // OpenStreetMap's own sea labels give way to the hand lettering from the zoom where it fits (js/curated.js)
    const CUR = global.INK_CURATED || {};
    const curGroups = {};
    for (const [n, zf] of Object.entries(CUR)) (curGroups[Math.floor(zf)] = curGroups[Math.floor(zf)] || []).push(n);   // whole zooms: filters are read at the tile's zoom
    const notCurated = ['match', ['coalesce', ['get', 'name_en'], ['get', 'name']]];
    for (const [zf, names] of Object.entries(curGroups)) notCurated.push(names, ['<', ['zoom'], +zf]);
    notCurated.push(true);
    L({ id: 'seas', type: 'symbol', source: 'ofm', 'source-layer': 'water_name',
      filter: ['all', ['==', ['geometry-type'], 'Point'], ['in', ['get', 'class'], ['literal', ['ocean', 'sea', 'bay', 'strait']]], notCurated,
        ['any', ['==', ['get', 'class'], 'ocean'], ['==', ['get', 'class'], 'sea'], ['all', ['==', ['get', 'class'], 'bay'], ['>=', ['zoom'], 7]], ['>=', ['zoom'], 11]]],
      layout: TXT({ 'text-field': ['let', 'n', NAME_EN, ['case', ['in', ' / ', ['var', 'n']], ['slice', ['var', 'n'], 0, ['index-of', ' / ', ['var', 'n']]], ['var', 'n']]],
        'text-font': ['Ink Italic'], 'text-transform': 'uppercase', 'text-max-width': 7,
        'text-size': ['interpolate', ['linear'], ['zoom'], 1, ['match', ['get', 'class'], 'ocean', 12, 9], 4, ['match', ['get', 'class'], 'ocean', 16, 'sea', 13, 11], 8, ['match', ['get', 'class'], 'ocean', 20, 'sea', 17, 13], 12, 15],
        'text-letter-spacing': iz(1, 0.25, 5, 0.4, 9, 0.5) }),
      paint: { 'text-color': INK.red, 'text-halo-color': HALO, 'text-halo-width': 1.3,
        'text-opacity': ['interpolate', ['linear'], ['zoom'], 0, 1, 4.5, ['case', ['==', ['get', 'class'], 'ocean'], 1, 1], 6, ['case', ['==', ['get', 'class'], 'ocean'], 0.0, 1]] } }, 'names');
    // names lettered by hand hide their duplicates (Wikidata heritage, OpenStreetMap parks) while the lettering shows (js/curated.js)
    const LET = global.INK_LETTERED || {}, letGroups = {};
    for (const [n, zf] of Object.entries(LET)) (letGroups[Math.floor(zf)] = letGroups[Math.floor(zf)] || []).push(n);
    const notLettered = (nameExpr) => { const e = ['match', nameExpr]; for (const [zf, names] of Object.entries(letGroups)) e.push(names, ['any', ['<', ['zoom'], +zf], ['>=', ['zoom'], 12.5]]); e.push(true); return Object.keys(letGroups).length ? e : true; };
    // states and provinces (not the UK nations, which are lettered above)
    placeLayer('states', ['all', ['in', CL, ['literal', ['state', 'province']]], ['!', ['in', NAME_EN, ['literal', ['England', 'Scotland', 'Wales', 'Northern Ireland']]]], ['<=', ['coalesce', ['get', 'rank'], 9], 5]],
      { minzoom: 4.6, maxzoom: 8.5, font: 'Ink Caps', field: NAME_EN, transform: 'uppercase', ls: 0.25, size: iz(4.6, 9.5, 6, 11, 8, 13), opacity: ramp(4.6, 5.6, 7.6, 8.4) });
    // capitals first, on a ribbon with a small shield (from zoom 3; a capital is always lettered before any other city);
    // the great cities on a plain banner; a drawn walled city marks both from zoom 6.5 until the drawn towns take over
    const CAP = ['==', ['get', 'capital'], 2], RK = ['coalesce', ['get', 'rank'], 9];
    wsplit({ id: 'city-marks', type: 'symbol', source: 'ofm', 'source-layer': 'place', minzoom: 3, maxzoom: 12.4,
      filter: ['all', ['==', CL, 'city'], ['any', CAP, ['<=', RK, 3]], ['<=', RK, ['step', ['zoom'], 2, 4, 4, 5, 6, 6, 99]]],
      layout: { 'icon-image': ['step', ['zoom'], ['case', CAP, 's-capital', 's-city'], 6.5, 'citybig'], 'icon-size': iz(3, ['case', CAP, 0.6, 0.48], 6.4, ['case', CAP, 0.85, 0.7], 6.5, 0.42, 9, 0.62, 11, 0.8, 12, 0.9),
        'icon-overlap': 'always', 'icon-ignore-placement': true, 'icon-padding': 1, 'symbol-sort-key': ['case', CAP, 0, RK] },
      paint: { 'icon-opacity': iz(3, 0, 3.5, 1, 11.6, 1, 12.3, 0) } }, 'names', { layout: { 'icon-image': ['step', ['zoom'], ['case', CAP, 's-capital', 's-city'], 6.5, 'citybig-s'] } });
    L({ id: 'capitals', type: 'symbol', source: 'ofm', 'source-layer': 'place', minzoom: 3,
      filter: ['all', ['==', CL, 'city'], CAP, ['<=', RK, ['step', ['zoom'], 2, 4, 4, 5, 6, 6, 99]]],
      layout: TXT({ 'text-field': NAME_EN, 'text-font': ['Ink SC'], 'text-size': iz(3, 11.5, 7, 16, 11, 19), 'text-letter-spacing': 0.06, 'text-max-width': 12,
        'text-anchor': 'bottom', 'text-offset': iz(3, ['literal', [0, -0.9]], 6.4, ['literal', [0, -1.1]], 6.5, ['literal', [0, -1.6]], 11, ['literal', [0, -2.4]]),
        'icon-image': ['step', ['zoom'], 'banner', 5, 'ribbon'], 'icon-text-fit': 'both', 'icon-text-fit-padding': [2, 8, 2, 8], 'icon-overlap': 'never', 'symbol-sort-key': RK }),
      paint: { 'text-color': INK.redDeep, 'text-halo-color': 'rgba(251,243,220,0.6)', 'text-halo-width': 0.6, 'text-opacity': iz(3, 0, 3.5, 1), 'icon-opacity': iz(3, 0, 3.5, 1) } }, 'names');
    L({ id: 'bigcities', type: 'symbol', source: 'ofm', 'source-layer': 'place', minzoom: 5,
      filter: ['all', ['==', CL, 'city'], ['!', CAP], ['<=', RK, ['step', ['zoom'], 2, 6, 3, 7, 4]]],
      layout: TXT({ 'text-field': NAME_EN, 'text-font': ['Ink SC'], 'text-size': iz(5, 12, 9, 16, 11, 18), 'text-letter-spacing': 0.05, 'text-max-width': 12,
        'text-anchor': 'bottom', 'text-offset': iz(5, ['literal', [0, -0.9]], 6.4, ['literal', [0, -1.0]], 6.5, ['literal', [0, -1.6]], 11, ['literal', [0, -2.4]]),
        'icon-image': 'banner', 'icon-text-fit': 'both', 'icon-text-fit-padding': [1, 7, 1, 7], 'icon-overlap': 'never', 'symbol-sort-key': RK }),
      paint: { 'text-color': INK.red, 'text-halo-color': 'rgba(251,243,220,0.6)', 'text-halo-width': 0.6, 'text-opacity': iz(5, 0, 5.6, 1), 'icon-opacity': iz(5, 0, 5.6, 0.95) } }, 'names');
    // which cities are lettered is set by filter, not by opacity, so unlettered cities never push glyphs aside
    placeLayer('cities', ['all', ['==', CL, 'city'], ['!', CAP], ['!', ['all', ['>=', ['zoom'], 5], ['<=', RK, ['step', ['zoom'], 2, 6, 3, 7, 4]]]], ['<=', ['coalesce', ['get', 'rank'], 9], ['step', ['zoom'], 0, 3, 3, 4, 5, 5, 7, 6, 99]]], {
      minzoom: 3,
      font: 'Ink SC', field: NAME_EN, size: ['interpolate', ['linear'], ['zoom'], 3, ['case', ['==', ['get', 'capital'], 2], 12, ['<=', ['coalesce', ['get', 'rank'], 9], 2], 11, 9.5], 7, ['case', ['==', ['get', 'capital'], 2], 18, ['<=', ['coalesce', ['get', 'rank'], 9], 4], 16, 13.5], 11, ['case', ['==', ['get', 'capital'], 2], 21, 18]],
      icon: ['case', ['==', ['get', 'capital'], 2], 's-capital', 's-city'], iconSize: iz(3, ['case', ['==', ['get', 'capital'], 2], 0.62, 0.48], 7, ['case', ['==', ['get', 'capital'], 2], 0.8, 0.62], 11, ['case', ['==', ['get', 'capital'], 2], 0.95, 0.75]),
      opacity: ramp(3, 3.6, null, null) });
    placeLayer('towns', ['==', CL, 'town'], { minzoom: 6.5, size: iz(7, 11.5, 10, 14, 13, 16), icon: 's-town', iconSize: iz(7, 0.5, 11, 0.65), opacity: ramp(6.5, 7.6, null, null) });
    placeLayer('villages', ['==', CL, 'village'], { minzoom: 9, size: iz(9, 10.5, 13, 14), icon: 's-village', iconSize: iz(9, 0.55, 13, 0.72), opacity: ramp(9, 9.8, null, null) });
    placeLayer('hamlets', ['in', CL, ['literal', ['hamlet', 'isolated_dwelling']]], { minzoom: 10.3, size: iz(10.5, 10, 15, 13), icon: 's-hamlet', iconSize: iz(11, 0.8, 15, 1), opacity: ramp(10.3, 10.9, null, null), color: INK.redDeep });
    // round 7: in a dense city the minor quarters (OpenStreetMap place=quarter and neighbourhood, and Japan's numbered chome
    // and small cho, often tagged as suburbs) crowded out everything else at zoom 13 to 15. Suburbs (the major districts) keep
    // their names, with wide room round them from zoom 13 so they only show where there is space; the minor quarters are
    // left out from zoom 13 to 15.5, then come back, still asking for room, and are placed after every other name.
    const NLC = ['downcase', ['coalesce', ['get', 'name:latin'], ['get', 'name_int'], ['get', 'name'], '']], NRAW = ['coalesce', ['get', 'name'], ''];
    const tail = (e, k) => ['slice', e, ['max', 0, ['-', ['length', e], k]]];
    const JPQ = ['any', ['in', '丁目', NRAW], ['in', 'chome', NLC], ['in', 'chōme', NLC], ['==', tail(NLC, 3), 'cho'], ['==', tail(NLC, 3), 'chō'], ['==', tail(NRAW, 1), '町']];
    const MINORQ = ['any', ['in', CL, ['literal', ['quarter', 'neighbourhood']]], ['all', ['==', CL, 'suburb'], JPQ]];
    placeLayer('suburbs', ['all', ['==', CL, 'suburb'], ['!', JPQ]], { minzoom: 10.3, padding: iz(12.5, 2, 13.5, 26), size: iz(10.5, 10.5, 15, 13.5), icon: 's-hamlet', iconSize: iz(11, 0.8, 15, 1), opacity: ramp(10.3, 10.9, null, null), color: INK.redDeep });
    placeLayer('quarters', MINORQ, { minzoom: 10.3, maxzoom: 13, padding: 8, size: iz(10.5, 10, 13, 11.5), icon: 's-hamlet', iconSize: iz(11, 0.75, 13, 0.85), opacity: ramp(10.3, 10.9, 12.6, 13), color: INK.redDeep });
    placeLayer('quarters-near', MINORQ, { minzoom: 15.5, padding: 14, size: iz(15.5, 12, 18, 14), icon: 's-hamlet', iconSize: iz(15.5, 0.9, 18, 1), opacity: ramp(15.5, 15.9, null, null), color: INK.redDeep });
    placeLayer('islands', ['all', ['==', CL, 'island'], ['!', ['in', NAME_EN, ['literal', ['Great Britain', 'Ireland', 'Iceland']]]]], { minzoom: 7, font: 'Ink Italic', size: iz(7, 11, 12, 14), opacity: ramp(7, 8, null, null) });
    // peaks with names, and their heights
    L({ id: 'peaks', type: 'symbol', source: 'ofm', 'source-layer': 'mountain_peak', minzoom: 8.8,
      filter: ['all', ['in', ['get', 'class'], ['literal', ['peak', 'volcano', 'hill']]], ['has', 'name'], ['<=', ['coalesce', ['get', 'rank'], 9], ['step', ['zoom'], 1, 10, 99]]],
      layout: TXT({ 'text-field': ['format', NAME_LOCAL, {}, ['case', ['has', 'ele'], ['concat', '\n', ['to-string', ['get', 'ele']], ' m'], ''], { 'font-scale': 0.78, 'text-font': ['literal', ['Ink Italic']] }],
        'text-font': ['Ink Roman'], 'text-size': iz(8, 10.5, 12, 13), 'icon-image': 's-peak', 'icon-size': iz(8, 0.38, 12, 0.5), 'text-variable-anchor': ['top', 'bottom', 'left', 'right'], 'text-radial-offset': 0.55, 'text-justify': 'auto',
        'symbol-sort-key': ['coalesce', ['get', 'rank'], 9], 'icon-overlap': 'never' }),
      paint: { 'text-color': INK.ink, 'text-halo-color': HALO, 'text-halo-width': 1.4, 'text-opacity': ramp(8.8, 9.4, null, null), 'icon-opacity': ramp(8.8, 9.4, null, null) } }, 'names');
    // national parks
    L({ id: 'parks', type: 'symbol', source: 'ofm', 'source-layer': 'park', minzoom: 8.5, filter: ['all', ['==', ['get', 'class'], 'national_park'], ['==', ['geometry-type'], 'Point'], notLettered(['coalesce', ['get', 'name'], ''])],
      layout: TXT({ 'text-field': NAME_LOCAL, 'text-font': ['Ink SC'], 'text-size': iz(9, 12, 12, 15), 'text-letter-spacing': 0.12, 'text-max-width': 12 }),
      paint: { 'text-color': INK.redDeep, 'text-halo-color': HALO, 'text-halo-width': 1.4, 'text-opacity': ramp(8.5, 9.5, null, null) } }, 'names');
    // national parks: the name lettered along the inside of the dotted boundary
    L({ id: 'park-edge-names', type: 'symbol', source: 'ofm', 'source-layer': 'park', minzoom: 9,
      filter: ['all', ['==', ['geometry-type'], 'Polygon'], ['any', ['==', ['get', 'class'], 'national_park'], ['in', 'National Park', ['coalesce', ['get', 'name'], '']]]],
      layout: TXT({ 'text-field': ['coalesce', ['get', 'name_en'], ['get', 'name']], 'text-font': ['Ink SC'], 'symbol-placement': 'line', 'symbol-spacing': 700, 'text-max-angle': 25,
        'text-size': iz(9, 11, 13, 14), 'text-letter-spacing': 0.14, 'text-offset': [0, 0.9], 'text-keep-upright': true, 'text-padding': 6 }),
      paint: { 'text-color': '#4F6B3A', 'text-halo-color': HALO, 'text-halo-width': 1.3, 'text-opacity': iz(9, 0, 9.6, 0.9) } }, 'heritage');
    // the lakes of the Lake District lettered along their length (data/lakes_lettered.geojson): one line per zoom band to 11,
    // straight at the middle where a lake is still too short for its name, and from zoom 12 the whole axis, lettered along it
    // wherever the lake is on screen (so close in a lake keeps its name even when its middle is out of view). Placed before the
    // village names, so a village named after its lake (Grasmere, Windermere) never pushes the lake's own name off the map.
    const LAKE_PAINT = { 'text-color': '#24557F', 'text-halo-color': 'rgba(248,242,226,0.92)', 'text-halo-width': 1.8, 'text-halo-blur': 0.4, 'text-opacity': iz(8, 0, 8.6, 1) };   // a deeper blue than the rivers, so a name reads on a frozen lake
    L({ id: 'lake-names-ink', type: 'symbol', source: 'lakesink', maxzoom: 12, filter: ['all', ['==', ['geometry-type'], 'LineString'], ['==', ['get', 'zb'], ['zoom']]],
      layout: TXT({ 'text-field': ['get', 'name'], 'text-font': ['Ink Italic'], 'symbol-placement': 'line-center', 'text-max-angle': 35, 'text-keep-upright': true,
        'text-size': iz(9, 12, 12, 14.5, 12.1, 6), 'text-letter-spacing': iz(9, 0.12, 12, 0.1) }),
      paint: LAKE_PAINT }, 'rivers');
    L({ id: 'lake-names-ink-pt', type: 'symbol', source: 'lakesink', minzoom: 9, maxzoom: 12, filter: ['all', ['==', ['geometry-type'], 'Point'], ['==', ['get', 'zb'], ['zoom']]],
      layout: TXT({ 'text-field': ['get', 'name'], 'text-font': ['Ink Italic'], 'text-size': iz(9, 10, 12, 12.5), 'text-letter-spacing': 0.06, 'text-max-width': 6, 'text-line-height': 1.05 }),
      paint: LAKE_PAINT }, 'rivers');
    L({ id: 'lake-names-ink-l', type: 'symbol', source: 'lakesink', minzoom: 12, filter: ['==', ['get', 'whole'], 1],
      layout: TXT({ 'text-field': ['get', 'name'], 'text-font': ['Ink Italic'], 'symbol-placement': 'line', 'symbol-spacing': iz(12, 420, 16, 640), 'text-max-angle': 35, 'text-keep-upright': true,
        'text-size': iz(12, 14, 15, 15.5, 16.2, 16), 'text-letter-spacing': iz(12, 0.12, 16, 0.16), 'text-padding': 4 }),
      paint: LAKE_PAINT }, 'rivers');
    const LAKESET = global.INK_LAKES || [];
    const notInkLake = LAKESET.length ? ['!', ['in', ['coalesce', ['get', 'name:latin'], ['get', 'name_int'], ['get', 'name'], ''], ['literal', LAKESET]]] : true;
    // rivers and lakes, in blue
    // river names along the line, spaced like sea names: the great rivers from zoom 5, streams close in
    // the great rivers from Natural Earth (zoom 3 to 9.5), OpenStreetMap's own waterway names from zoom 9
    L({ id: 'river-names-ne', type: 'symbol', source: 'rivers', maxzoom: 9.5, filter: ['<=', HZ, ['zoom']],
      layout: TXT({ 'text-field': ['get', 'n'], 'text-font': ['Ink Italic'], 'symbol-placement': 'line', 'symbol-spacing': iz(3, 500, 6, 600, 9, 700), 'text-max-angle': 40,
        'text-size': iz(3, 10, 6, 11.5, 9, 13), 'text-letter-spacing': iz(3, 0.2, 9, 0.14), 'text-padding': 4, 'text-keep-upright': true }),
      paint: { 'text-color': INK.blue, 'text-halo-color': HALO, 'text-halo-width': 1.4, 'text-opacity': byZoom(z => ['*', clamp01(['-', z + 0.7, HZ]), z >= 9.5 ? 0 : 1]) } }, 'rivers');
    L({ id: 'river-names', type: 'symbol', source: 'ofm', 'source-layer': 'waterway', minzoom: 9,
      filter: ['all', ['has', 'name'], ['any', ['==', ['get', 'class'], 'river'], ['all', ['==', ['get', 'class'], 'canal'], ['>=', ['zoom'], 10]], ['>=', ['zoom'], 12]]],
      layout: TXT({ 'text-field': NAME_LOCAL, 'text-font': ['Ink Italic'], 'symbol-placement': 'line', 'symbol-spacing': iz(9, 450, 13, 350), 'text-max-angle': 40, 'text-size': iz(9, 12, 12, 14),
        'text-letter-spacing': iz(9, 0.14, 13, 0.1), 'text-padding': 4, 'text-keep-upright': true }),
      paint: { 'text-color': INK.blue, 'text-halo-color': HALO, 'text-halo-width': 1.4, 'text-opacity': ramp(9, 9.6, null, null) } }, 'rivers');
    L({ id: 'lake-names-ne', type: 'symbol', source: 'lakes', maxzoom: 9.2, filter: ['all', ['<=', HZ, ['zoom']], ['any', ['<', ['zoom'], 8], ['!', ['in', ['get', 'n'], ['literal', LAKESET]]]]],
      layout: TXT({ 'text-field': ['get', 'n'], 'text-font': ['Ink Italic'], 'text-size': iz(4, 10, 9, 12.5), 'text-max-width': 6, 'text-letter-spacing': 0.06 }),
      paint: { 'text-color': INK.blue, 'text-halo-color': HALO, 'text-halo-width': 1.4, 'text-opacity': byZoom(z => clamp01(['-', z + 0.7, HZ])) } }, 'rivers');
    // named hills from Wikidata where OpenStreetMap has no peak (zoom 10 and closer)
    L({ id: 'hills', type: 'symbol', source: 'ink', 'source-layer': 'hills', minzoom: 10, filter: ['<=', HZ, ['+', ['zoom'], 0.7]],   // names not yet visible do not push glyphs aside
      layout: TXT({ 'text-field': ['format', ['get', 'n'], {}, ['case', ['>', ['get', 'e'], 0], ['concat', '\n', ['to-string', ['get', 'e']], ' m'], ''], { 'font-scale': 0.78, 'text-font': ['literal', ['Ink Italic']] }],
        'text-font': ['Ink Roman'], 'text-size': iz(10, 10.5, 13, 12.5), 'icon-image': 's-peak', 'icon-size': iz(10, 0.4, 13, 0.5), 'text-variable-anchor': ['top', 'bottom', 'left', 'right'], 'text-radial-offset': 0.55,
        'text-justify': 'auto', 'symbol-sort-key': HZ, 'icon-overlap': 'never' }),
      paint: { 'text-color': INK.ink, 'text-halo-color': HALO, 'text-halo-width': 1.4, 'text-opacity': fadeProp('z'), 'icon-opacity': fadeProp('z') } }, 'names');
    // villages and hamlets of Britain and Ireland that OpenStreetMap's tiles leave out (Wikidata; js/ink-worker.js drops any the tile already names)
    // named beaches (Wikidata), lettered along the shore in small blue italic
    L({ id: 'xbeaches', type: 'symbol', source: 'ink', 'source-layer': 'xplaces', minzoom: 10, filter: ['all', ['==', ['get', 'k'], 3], ['<=', HZ, ['+', ['zoom'], 0.7]]],
      layout: TXT({ 'text-field': ['get', 'n'], 'text-font': ['Ink Italic'], 'text-size': iz(10, 10.5, 14, 13), 'text-max-width': 8, 'text-letter-spacing': 0.04,
        'text-variable-anchor': ['center', 'top', 'bottom'], 'symbol-sort-key': HZ }),
      paint: { 'text-color': INK.blue, 'text-halo-color': HALO, 'text-halo-width': 1.4, 'text-opacity': fadeProp('z') } }, 'names');
    L({ id: 'xplaces', type: 'symbol', source: 'ink', 'source-layer': 'xplaces', minzoom: 10, filter: ['all', ['!=', ['get', 'k'], 3], ['<=', HZ, ['+', ['zoom'], 0.7]]],
      layout: TXT({ 'text-field': ['get', 'n'], 'text-font': ['Ink Roman'], 'text-size': iz(10, ['case', ['==', ['get', 'k'], 1], 10.5, 10], 13, ['case', ['==', ['get', 'k'], 1], 14, 12.2], 15, ['case', ['==', ['get', 'k'], 1], 14.5, 13]),
        'icon-image': ['case', ['==', ['get', 'k'], 1], 's-village', 's-hamlet'], 'icon-size': iz(10, ['case', ['==', ['get', 'k'], 1], 0.6, 0.8], 13, ['case', ['==', ['get', 'k'], 1], 0.72, 0.9], 15, ['case', ['==', ['get', 'k'], 1], 0.75, 1]),
        'text-variable-anchor': ['left', 'right', 'top', 'bottom'], 'text-radial-offset': 0.75, 'text-justify': 'auto', 'text-max-width': 9, 'text-letter-spacing': 0.04,
        'symbol-sort-key': ['+', HZ, ['get', 'k']], 'icon-overlap': 'never', 'icon-optional': false }),
      paint: { 'text-color': ['case', ['==', ['get', 'k'], 1], INK.red, INK.redDeep], 'text-halo-color': HALO, 'text-halo-width': 1.4, 'text-halo-blur': 0.5,
        'text-opacity': fadeProp('z'), 'icon-opacity': fadeProp('z') } }, 'names');
    for (const [id, geom] of [['lake-names', 'Point'], ['lake-names-l', 'LineString']]) {
      L({ id, type: 'symbol', source: 'ofm', 'source-layer': 'water_name', minzoom: 8.8,
        filter: ['all', ['in', ['get', 'class'], ['literal', ['lake', 'reservoir']]], ['==', ['geometry-type'], geom], notInkLake],
        // lake centrelines are often wiggly: lettered along the line wherever the name fits, a straight label otherwise
        layout: TXT({ 'text-field': NAME_LOCAL, 'text-font': ['Ink Italic'], 'text-size': iz(7, 10.5, 12, 14), 'text-max-width': 6, 'text-letter-spacing': 0.06,
          'symbol-placement': geom === 'Point' ? 'point' : 'line', 'symbol-spacing': 600, 'text-max-angle': 50, 'text-keep-upright': true, 'text-padding': 3 }),
        paint: { 'text-color': INK.blue, 'text-halo-color': HALO, 'text-halo-width': 1.4, 'text-opacity': ramp(8.8, 9.4, null, null) } }, 'rivers');
    }

    // heritage drawings (Wikidata, with the architecture, lighthouse, battle and monastery data studies): thousands appear as you
    // zoom, the best known first; names in small red italic about a zoom and a half after the drawing
    const nameAfter = (dz) => ['step', ['zoom'], ''].concat(...[...Array(18).keys()].map(z => [z + 1, ['case', ['<=', HZ, z + 1 - dz], ['get', 'n'], '']]));
    // names come from 'l', which the worker thins to one per cell of about 140 x 90 px (best known first); ordinary churches
    // and chapels (fewer than about ten Wikipedia articles) are drawn unnamed until zoom 15
    const PLAINCH = ['all', ['==', ['get', 'i'], 'church'], ['>', HZ, 7.5]];
    const HNAME = ['step', ['zoom'], ''].concat(...[...Array(18).keys()].map(z => [z + 1, ['case', ['all', ['<=', HZ, z + 1 - 1.5], ['any', ['!', PLAINCH], z + 1 >= 15]], ['coalesce', ['get', 'l'], ''], '']]));
    L({ id: 'heritage', type: 'symbol', source: 'ink', 'source-layer': 'heritage', minzoom: 5.4, filter: ['all', ['<=', HZ, ['+', ['zoom'], 0.7]], notLettered(['get', 'n'])],
      layout: TXT({ 'icon-image': ['case', ['!=', ['coalesce', ['get', 'w'], ''], ''], ['concat', 'h-tw-', ['get', 'w']], ['concat', 'h-', ['get', 'i']]], 'icon-size': iz(6, 0.7, 9, 0.85, 12, 1, 15, 1.2), 'icon-overlap': 'never', 'icon-padding': 1,
        'symbol-sort-key': ['case', ['==', ['get', 'i'], 'lighthouse'], ['-', HZ, 2], HZ], 'text-field': HNAME, 'text-font': ['Ink Italic'], 'text-size': iz(8, 9.5, 13, 11.5), 'text-optional': true,
        'text-variable-anchor': ['top', 'bottom', 'right', 'left'], 'text-radial-offset': 0.9, 'text-max-width': 8, 'text-letter-spacing': 0.02 }),
      paint: { 'icon-opacity': fadeProp('z'), 'text-opacity': fadeProp('z'), 'text-color': INK.red, 'text-halo-color': HALO, 'text-halo-width': 1.2 } }, 'heritage');
    // world-famous monuments, each drawn in its own way, from the world view
    // (shown a zoom earlier than their ranking in code/02c_curated.py, so the best known are on the world view)
    const LFADE = byZoom(z => clamp01(['-', z + 1.7, HZ]));
    // the drawing is placed before the city names (so the best known show from the world view); its name comes after the
    // towns, so it never pushes a city's name off the map
    // a monument's own drawing where there is one, else the heritage pictogram (decided from the known icon ids, not by testing
    // for the image, since sprites are drawn lazily and a missing one would not be found yet)
    const LIDS = ICON_IDS.filter(i => i.startsWith('l-')).map(i => i.slice(2));
    const LIMG = LIDS.length ? ['match', ['get', 'i'], LIDS, ['concat', 'l-', ['get', 'i']], ['concat', 'h-', ['get', 'i']]] : ['concat', 'h-', ['get', 'i']];
    L({ id: 'landmarks', type: 'symbol', source: 'landmarks', maxzoom: 6, filter: ['<=', HZ, ['+', ['zoom'], 1.7]],
      layout: { 'icon-image': LIMG, 'icon-size': iz(2, 0.6, 4, 0.75, 6, 0.9), 'icon-overlap': 'never', 'icon-padding': 2, 'symbol-sort-key': HZ },
      paint: { 'icon-opacity': LFADE } }, 'heritage');
    // close in, place names come first and the drawing is larger (about 40 to 60 px tall from zoom 9)
    // round 4: the drawing and its name are one symbol (the name under the drawing's foot), so a monument's own name can no
    // longer push its drawing off the map, as it did when the name was placed first as a layer of its own
    L({ id: 'landmarks-near', type: 'symbol', source: 'landmarks', minzoom: 6,
      layout: TXT({ 'icon-image': LIMG, 'icon-size': iz(6, 0.9, 9, 1.45, 12, 1.75, 15, 2.1), 'icon-overlap': 'never', 'icon-padding': 2, 'symbol-sort-key': HZ, 'icon-anchor': 'bottom', 'icon-optional': false,
        'text-field': nameAfter(0.3), 'text-font': ['Ink Italic'], 'text-size': iz(6, 10.5, 8, 11.5, 13, 13), 'text-anchor': 'top', 'text-offset': [0, 0.25], 'text-max-width': 8, 'text-optional': true }),
      paint: { 'icon-opacity': iz(6, 0.95, 7, 1), 'text-opacity': iz(6, 0.9, 7, 1), 'text-color': INK.red, 'text-halo-color': HALO, 'text-halo-width': 1.3 } }, 'heritage');
    L({ id: 'landmark-names', type: 'symbol', source: 'landmarks', maxzoom: 6, filter: ['<=', HZ, ['+', ['zoom'], 0.7]],
      layout: TXT({ 'symbol-sort-key': HZ, 'text-field': ['get', 'n'], 'text-font': ['Ink Italic'], 'text-size': iz(3, 9.5, 8, 11.5, 13, 13),
        'text-variable-anchor': ['top', 'bottom', 'right', 'left'], 'text-radial-offset': iz(3, 1.3, 8, 1.6, 13, 1.9), 'text-max-width': 8 }),
      paint: { 'text-opacity': byZoom(z => clamp01(['-', z + 0.7, HZ])), 'text-color': INK.red, 'text-halo-color': HALO, 'text-halo-width': 1.3 } }, 'heritage');
    // the great summits: each country's highest point and the famous peaks, a finer drawing with snow and a larger red name
    const EL = ['concat', ['number-format', ['get', 'e'], { locale: 'en-GB' }], ' m'];
    L({ id: 'famous-peaks', type: 'symbol', source: 'peaks', filter: ['<=', HZ, ['+', ['zoom'], 0.5]],
      layout: { 'icon-image': 'bigpeak', 'icon-anchor': 'bottom', 'icon-size': iz(3, 0.95, 6, 1.1, 10, 1.25, 14, 1.4), 'icon-overlap': 'never', 'icon-padding': 0, 'symbol-sort-key': HZ },
      paint: { 'icon-opacity': fadeProp('z') } }, 'mountains');
    // the name and height under it, with a red flourish between them (the flourish is stretched to the name's width)
    L({ id: 'famous-peak-names', type: 'symbol', source: 'peaks', filter: ['<=', HZ, ['+', ['zoom'], 0.5]],
      layout: TXT({ 'text-field': ['format', ['get', 'n'], {}, ['concat', '\n', EL], { 'font-scale': 0.78, 'text-font': ['literal', ['Ink Italic']] }],
        'text-font': ['Ink SC'], 'text-size': iz(3, 10.5, 6, 12.5, 10, 14.5), 'text-anchor': 'top', 'text-offset': [0, 0.3], 'text-letter-spacing': 0.08, 'text-max-width': 12, 'text-line-height': 1.35,
        'icon-image': 'flourish', 'icon-text-fit': 'width', 'icon-text-fit-padding': [0, 4, 0, 4], 'icon-size': 1, 'icon-overlap': 'never', 'symbol-sort-key': HZ }),
      paint: { 'text-opacity': fadeProp('z'), 'icon-opacity': fadeProp('z', 0.9), 'text-color': INK.red, 'text-halo-color': HALO, 'text-halo-width': 1.5 } }, 'mountains');
    L({ id: 'wall-names', type: 'symbol', source: 'walls', filter: ['all', ['!=', ['get', 'n'], ''], ['<=', HZ, ['-', ['zoom'], 1]]],
      layout: TXT({ 'text-field': ['get', 'n'], 'text-font': ['Ink Italic'], 'symbol-placement': 'line', 'symbol-spacing': 600, 'text-max-angle': 25, 'text-size': iz(5, 10, 10, 12.5), 'text-letter-spacing': 0.1, 'text-offset': [0, -0.9] }),
      paint: { 'text-color': INK.red, 'text-halo-color': HALO, 'text-halo-width': 1.3 } }, 'heritage');
    // quarries and mines (pick and shovel, OpenStreetMap land use) and harbours (an anchor, OpenStreetMap points of interest)
    L({ id: 'quarries', type: 'symbol', source: 'ofm', 'source-layer': 'landuse', minzoom: 11, filter: ['==', ['get', 'class'], 'quarry'],
      layout: { 'icon-image': 'quarry', 'icon-size': iz(11, 0.7, 14, 1), 'icon-overlap': 'never', 'icon-padding': 2 }, paint: { 'icon-opacity': iz(11, 0, 11.6, 0.9) } }, 'heritage');
    L({ id: 'harbours', type: 'symbol', source: 'ofm', 'source-layer': 'poi', minzoom: 12, filter: ['in', ['get', 'class'], ['literal', ['harbor', 'ferry_terminal']]],
      layout: { 'icon-image': 'anchor', 'icon-size': iz(12, 0.8, 15, 1), 'icon-overlap': 'never', 'icon-padding': 2 }, paint: { 'icon-opacity': iz(12, 0, 12.6, 0.9) } }, 'heritage');
    // airports (OpenMapTiles aerodrome labels): international from zoom 7.5, the rest from 10, names close in
    const AC = ['get', 'class'];
    L({ id: 'airports', type: 'symbol', source: 'ofm', 'source-layer': 'aerodrome_label', minzoom: 7.5, filter: ['any', ['==', AC, 'international'], ['>=', ['zoom'], 10]],
      layout: TXT({ 'icon-image': ['case', ['==', AC, 'international'], 'ornithopter', 'airfield'], 'icon-size': iz(7.5, ['case', ['==', AC, 'international'], 0.55, 0.8], 12, ['case', ['==', AC, 'international'], 0.75, 0.95], 14, ['case', ['==', AC, 'international'], 0.85, 1.05]), 'icon-overlap': 'never',
        'text-field': ['step', ['zoom'], '', 10.5, ['case', ['==', AC, 'international'], NAME_LOCAL, ''], 12, NAME_LOCAL], 'text-font': ['Ink Italic'], 'text-size': iz(10, 9.5, 14, 11.5), 'text-optional': true,
        'text-variable-anchor': ['top', 'bottom', 'right', 'left'], 'text-radial-offset': 1.0, 'symbol-sort-key': ['match', AC, 'international', 0, 5] }),
      paint: { 'icon-opacity': iz(7.5, 0, 8.3, 0.95), 'text-color': INK.red, 'text-halo-color': HALO, 'text-halo-width': 1.2 } }, 'flight');

    // placement priority is top-down: reorder so names come in a sensible order (most important on top)
    // capitals before every other name but the countries, so a capital is lettered whenever another city is, and before its sights
    const order = ['countries', 'country-uk', 'nations', 'nations-pt', 'capitals', 'regions-sea', 'regions-sea-pt', 'regions-world', 'seas', 'bigcities', 'cities', 'landmarks', 'famous-peaks', 'regions-land', 'lake-names-ink', 'lake-names-ink-l', 'lake-names-ink-pt', 'states', 'towns', 'landmark-names', 'landmarks-near',
      'famous-peak-names', 'villages', 'islands', 'lake-names-ne', 'lake-names', 'lake-names-l', 'river-names-ne', 'river-names', 'hamlets', 'suburbs', 'xplaces', 'xbeaches', 'peaks', 'parks', 'park-edge-names', 'hills', 'wall-names', 'airports', 'heritage', 'harbours', 'quarries', 'quarters', 'quarters-near', 'beasts', 'city-marks'];
    const named = order.map(id => layers.find(l => l.id === id));
    const rest = layers.filter(l => !order.includes(l.id));
    // walls, towers and star forts go on top of the drawn towns, so the houses never hide a town wall
    const TOP = ['fort-moat', 'fort-moat-edge', 'fort-rampart', 'fort-line', 'walls-casing', 'walls', 'walls-crest', 'wall-towers', 'fort-icons'];
    const ti = rest.findIndex(l => l.id === 'town');
    if (ti >= 0) { const mv = TOP.map(id => rest.find(l => l.id === id)).filter(Boolean); for (const l of mv) rest.splice(rest.indexOf(l), 1); const tl = Math.max(rest.findIndex(l => l.id === 'town'), rest.findIndex(l => l.id === 'town-snow')); rest.splice(tl + 1, 0, ...mv); }
    // the world's ranges are placed before the decorative animals, ships and flying machines (a symbol layer higher up is
    // placed first), so a range is never thinned to make room for a bison or a balloon
    const wr = rest.findIndex(l => l.id === 'world-ranges'), fl = rest.findIndex(l => l.id === 'flyers');
    if (wr >= 0 && fl > wr) rest.splice(fl, 0, rest.splice(wr, 1)[0]);
    const final = rest.concat(named.reverse());
    // close in, where the drawn towns pack the streets, names get a wider parchment halo so they read over the houses
    for (const l of final) {
      const hw = l.type === 'symbol' && l.paint && l.paint['text-halo-width'];
      if (typeof hw === 'number') l.paint['text-halo-width'] = ['interpolate', ['linear'], ['zoom'], 12, hw, 13, Math.max(hw, 2.6), 15, Math.max(hw, 3.2)];
    }
    // optional text scale (used by the poster): point names by textScale, curved names by curvedScale
    const scaleOut = (e, k) => typeof e === 'number' ? Math.round(e * k * 10) / 10
      : (Array.isArray(e) && e[0] === 'interpolate') ? e.map((v, i) => (i >= 4 && i % 2 === 0) ? scaleOut(v, k) : v)
      : (Array.isArray(e) && e[0] === 'case') ? e.map((v, i) => (i > 1 && (i % 2 === 0 || i === e.length - 1)) ? scaleOut(v, k) : v)
      : (Array.isArray(e) && e[0] === 'match') ? e.map((v, i) => (i >= 3 && (i % 2 === 1 || i === e.length - 1)) ? scaleOut(v, k) : v) : e;
    if (o.textScale || o.curvedScale) for (const l of final) {
      if (l.type !== 'symbol' || !l.layout['text-size']) continue;
      const curved = ['countries', 'country-uk', 'nations', 'regions-sea', 'regions-land', 'regions-world', 'lake-names-ink', 'lake-names-ink-l'].includes(l.id);
      const k = curved ? (o.curvedScale || 1) : (o.textScale || 1);
      if (k !== 1) l.layout['text-size'] = scaleOut(l.layout['text-size'], k);
    }

    // ---- lazily loaded data: a source starts empty (or with a light first file) and gets its data once the map has drawn
    // its first view, and only while the zoom is in the range where its layers show; the heavy detail files come in only when
    // you zoom in to them. [source, [[file, from zoom, to zoom, before first idle?], ...]], later stages replace earlier ones.
    const LAZY = o.lazy === false ? [] : [
      ['world', [['data/world_ink_far.geojson?v=20261104r7', 0, 1.9, true], ['data/world_ink.geojson?v=20261104r7', 1.9, 4.6, true]]],   // the far marks alone for the world view
      // (round 4: the river, lake and wall names start at zoom 3 to 3.5, so their files wait until the map is near it)
      ['walls', [['data/walls_major.geojson?v=20261103', 2.8, 99], ['grid:walls', 9.6, 99]]],
      ['forts', [['data/forts_points.geojson?v=20261103', 4.5, 99], ['grid:forts', 10.4, 99]]],
      ['rivers', [['data/rivers.geojson', 2.3, 9.6]]],
      ['lakes', [['data/lakes.geojson', 2.8, 9.3]]],
      ['decor', [['data/decor.geojson', 0, 12]]],
    ];
    const EMPTY = { type: 'FeatureCollection', features: [] };
    const SRC = {
        labels: { type: 'geojson', buffer: 512, tolerance: 0.2, data: base + 'data/labels_countries.geojson', attribution: 'Lettering lines: Natural Earth, ONS' },
        regions: { type: 'geojson', buffer: 512, tolerance: 0.2, data: base + 'data/labels_regions.geojson' },
        landmarks: { type: 'geojson', data: base + 'data/landmarks.geojson?v=20261104r7', attribution: 'Heritage: <a href="https://www.wikidata.org/" target="_blank">Wikidata</a> (CC0)' },
        peaks: { type: 'geojson', data: base + 'data/peaks_famous.geojson' },
        walls: { type: 'geojson', tolerance: 0.3, data: base + 'data/walls.geojson?v=20261101c' },
        forts: { type: 'geojson', tolerance: 0.15, data: base + 'data/forts.geojson?v=20261101c' },
        rivers: { type: 'geojson', tolerance: 0.5, data: base + 'data/rivers.geojson', attribution: 'River and lake names: Natural Earth' },
        lakes: { type: 'geojson', data: base + 'data/lakes.geojson' },
        decor: { type: 'geojson', data: base + 'data/decor.geojson', attribution: 'Ship lanes: CLIWOC' },
        world: { type: 'geojson', tolerance: 0.6, maxzoom: 5, data: base + 'data/world_ink.geojson?v=20261104r7', attribution: 'World ink: AWS Terrain Tiles, RESOLVE Ecoregions 2017' },
        lakesink: { type: 'geojson', buffer: 512, tolerance: 0.2, data: base + 'data/lakes_lettered.geojson?v=20261102' },
    };
    for (const [id] of LAZY) SRC[id].data = EMPTY;

    return {
      version: 8, name: 'The Inked World', metadata: { inkLazy: LAZY },
      glyphs: base + 'fonts/{fontstack}/{range}.pbf',
      sources: {
        ofm: { type: 'vector', url: o.tilejson, attribution: '<a href="https://openfreemap.org" target="_blank">OpenFreeMap</a> <a href="https://www.openmaptiles.org/" target="_blank">© OpenMapTiles</a> Data © <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors' },
        ink: { type: 'vector', tiles: ['ink://{z}/{x}/{y}'], minzoom: 2, maxzoom: 14, tileSize: 512, attribution: 'Elevation: <a href="https://registry.opendata.aws/terrain-tiles/" target="_blank">Terrain Tiles</a>; biomes: <a href="https://ecoregions.appspot.com/" target="_blank">RESOLVE Ecoregions 2017</a> (CC BY 4.0)' },
        dem: { type: 'raster-dem', tiles: [o.dem], encoding: 'terrarium', tileSize: 256, maxzoom: 15 },
        ...SRC,
        // the watercolour wash and the deep-winter snow, each one 2048 px image of the whole web Mercator square
        // (served as 512 px raster tiles cut from the image in the browser, js "inkimg://" protocol, so world copies and
        // culling behave as for any tiled layer)
        tint: { type: 'raster', tiles: ['inkimg://tint/{z}/{x}/{y}'], tileSize: 512, maxzoom: 2, attribution: 'Tints: <a href="https://ecoregions.appspot.com/" target="_blank">RESOLVE Ecoregions 2017</a> (CC BY 4.0), Natural Earth' },
        snowimg: { type: 'raster', tiles: ['inkimg://snow/{z}/{x}/{y}'], tileSize: 512, maxzoom: 2 },
        tintw: { type: 'raster', tiles: ['inkimg://tintw/{z}/{x}/{y}'], tileSize: 512, maxzoom: 2 },
      },
      layers: final,
    };
  }

  // ------------------------------------------------------------------ protocol
  let seq = 0; const pending = new Map();
  // the relief points each tile kept, so a child tile keeps exactly its parent's mountains (no glyph pops as you zoom in)
  const KEPT = new Map();
  const STATS = { n: 0, ms: 0, max: 0 }; global.__inkStats = STATS;
  // a small pool of workers; each tile always goes to the same worker (by x) so elevation caches are reused
  let pool = null;
  function setupProtocol(o, ofmTemplate) {
    const cfg = { config: Object.assign({ ofm: ofmTemplate, dem: o.dem, demMax: o.demMax, biomes: o.base + 'data/biomes.png', heritage: o.base + 'data/heritage/', dv: '?v=20261104r7', hills: o.base + 'data/hills/', places: o.base + 'data/places/', walls: o.base + 'data/walls_boxes.json?v=20261103', houseRegions: o.base + 'data/house_regions.json?v=20261103', snowZone: o.snowZone || null }, o.workerConfig || {}) };
    if (pool) { pool.forEach(w => w.postMessage(cfg)); return; }
    const n = Math.max(1, Math.min(3, (navigator.hardwareConcurrency || 2) - 1));
    pool = [];
    for (let i = 0; i < n; i++) {
      const w = new Worker(o.base + 'js/ink-worker.js?v=20261104r7');
      w.onmessage = (ev) => {
        const m = ev.data, p = pending.get(m.id); if (!p) return; pending.delete(m.id);
        if (m.err) { console.warn('ink tile', m.err); p.res({ data: new ArrayBuffer(0) }); }
        else {
          STATS.n++; STATS.ms += m.ms || 0; STATS.max = Math.max(STATS.max, m.ms || 0); if (m.prof) (STATS.prof = STATS.prof || {})[pool.indexOf(w)] = m.prof;
          if (m.kept && p.key) { KEPT.set(p.key, m.kept); if (KEPT.size > 400) KEPT.delete(KEPT.keys().next().value); }
          p.res({ data: m.buf });
        }
      };
      w.postMessage(cfg);
      pool.push(w);
    }
    maplibregl.addProtocol('ink', (params, ac) => new Promise((res, rej) => {
      const mm = params.url.match(/ink:\/\/(\d+)\/(\d+)\/(\d+)/);
      const z = +mm[1], x = +mm[2], y = +mm[3];
      // neighbouring tiles go to different workers, so the few tiles of a view are built side by side, not one after another
      const w = pool[(x + 2 * y) % pool.length];
      const id = ++seq, key = z + '/' + x + '/' + y; pending.set(id, { res, rej, key });
      w.postMessage({ id, z, x, y, parentKept: z > 0 ? KEPT.get((z - 1) + '/' + (x >> 1) + '/' + (y >> 1)) || null : null });
      ac.signal.addEventListener('abort', () => { w.postMessage({ cancel: id }); if (pending.has(id)) { pending.delete(id); rej(new Error('aborted')); } });
    }));
  }

  // ------------------------------------------------------------------ OpenFreeMap tiles at the edges of the world
  // The vector tiles cut polygons (the ocean far out, Antarctic ice) along the antimeridian, so at the left and right edges of
  // the world the cut runs exactly along the tile's edge, and the coast and ripple lines drawn round the ocean showed it as a
  // thin grey line down the Pacific. Tiles at those edges are rewritten on the way in: polygon points lying on the world's
  // edge are moved out into the tile's buffer, where nothing is drawn. Every other tile passes through untouched.
  function rdV(b, i) { let r = 0, m = 1, c; do { c = b[i++]; r += (c & 127) * m; m *= 128; } while (c & 128); return [r, i]; }
  function wrV(o, v) { v = Math.floor(v); while (v > 127) { o.push((v & 127) | 128); v = Math.floor(v / 128); } o.push(v); }
  function fields(b) {   // [field, wire, start, end of value, start of tag]
    const out = []; let i = 0;
    while (i < b.length) {
      const t0 = i; let t; [t, i] = rdV(b, i); const f = Math.floor(t / 8), w = t & 7, s0 = i;
      if (w === 0) { [, i] = rdV(b, i); out.push([f, w, s0, i, t0]); }
      else if (w === 1) { i += 8; out.push([f, w, s0, i, t0]); }
      else if (w === 5) { i += 4; out.push([f, w, s0, i, t0]); }
      else if (w === 2) { let l; [l, i] = rdV(b, i); out.push([f, w, i, i + l, t0]); i += l; }
      else throw new Error('wire ' + w);
    }
    return out;
  }
  const lenField = (o, f, bytes) => { wrV(o, f * 8 + 2); wrV(o, bytes.length); for (const x of bytes) o.push(x); };
  function patchGeom(g, ext, left) {
    const ints = []; for (let i = 0; i < g.length;) { let v; [v, i] = rdV(g, i); ints.push(v); }
    const out = []; let x = 0, y = 0, px = 0, py = 0, changed = false;
    for (let i = 0; i < ints.length;) {
      const ci = ints[i++], cmd = ci & 7, cnt = ci >>> 3; out.push(ci);
      if (cmd === 7) continue;
      for (let k = 0; k < cnt; k++) {
        const dx = ints[i++], dy = ints[i++];
        x += (dx >>> 1) ^ -(dx & 1); y += (dy >>> 1) ^ -(dy & 1);
        let X = x;
        if (left && x <= 0) { X = -256; changed = changed || x !== -256; }
        if (!left && x >= ext) { X = ext + 256; changed = changed || x !== ext + 256; }
        const ex = X - px, ey = y - py; px = X; py = y;
        out.push(((ex << 1) ^ (ex >> 31)) >>> 0, ((ey << 1) ^ (ey >> 31)) >>> 0);
      }
    }
    if (!changed) return null;
    const o = []; for (const v of out) wrV(o, v); return o;
  }
  function patchEdgeTile(b, left) {
    const o = []; let any = false;
    for (const [f, w, s0, s1, t0] of fields(b)) {
      if (f !== 3 || w !== 2) { for (let i = t0; i < s1; i++) o.push(b[i]); continue; }
      const lb = b.subarray(s0, s1), lf = fields(lb);
      const ef = lf.find(q => q[0] === 5); const ext = ef ? rdV(lb, ef[2])[0] : 4096;
      const lo = [];
      for (const [f2, w2, a0, a1, b0] of lf) {
        if (f2 === 2 && w2 === 2) {
          const fb = lb.subarray(a0, a1), ff = fields(fb), ty = ff.find(q => q[0] === 3), gf = ff.find(q => q[0] === 4);
          const ng = ty && gf && rdV(fb, ty[2])[0] === 3 ? patchGeom(fb.subarray(gf[2], gf[3]), ext, left) : null;
          if (ng) {
            any = true; const fo = [];
            for (const q of ff) { if (q[0] === 4) lenField(fo, 4, ng); else for (let i = q[4]; i < q[3]; i++) fo.push(fb[i]); }
            lenField(lo, 2, fo); continue;
          }
        }
        for (let i = b0; i < a1; i++) lo.push(lb[i]);
      }
      lenField(o, 3, lo);
    }
    return any ? new Uint8Array(o) : b;
  }
  // ---- the watercolour and snow images (2048 px, whole web Mercator square) cut into 512 px raster tiles on request
  const IMGS = { tint: 'data/biomes_tint.webp?v=20261103', snow: 'data/biomes_snow.webp?v=20261103' };
  let imgProtocol = false; const imgCache = {};
  function setupImgProtocol(base) {
    if (imgProtocol) return; imgProtocol = true;
    maplibregl.addProtocol('inkimg', async (params) => {
      const m = params.url.match(/inkimg:\/\/(\w+)\/(\d+)\/(\d+)\/(\d+)/);
      const name = m[1], z = +m[2], x = +m[3], y = +m[4];
      const load = nm => (imgCache[nm] = imgCache[nm] || fetch(base + IMGS[nm]).then(r => r.blob()).then(b => createImageBitmap(b)));
      const T = 512;
      if (name === 'tintw') {
        // the wash, then the snow over it, at the opacities the two layers have far out (0.85 and 0.95)
        const [tb, sb] = await Promise.all([load('tint'), load('snow')]), S = tb.width / Math.pow(2, z), S2 = sb.width / Math.pow(2, z);
        const cv = new OffscreenCanvas(T, T), cx = cv.getContext('2d'); cx.imageSmoothingQuality = 'high';
        cx.globalAlpha = 0.85; cx.drawImage(tb, x * S, y * S, S, S, 0, 0, T, T);
        cx.globalAlpha = 0.95; cx.drawImage(sb, x * S2, y * S2, S2, S2, 0, 0, T, T);
        return { data: cv.transferToImageBitmap() };
      }
      const bmp = await load(name), S = bmp.width / Math.pow(2, z);
      // the tile is cut and scaled straight to an ImageBitmap, which MapLibre takes as it is (no canvas, no PNG encode and decode)
      return { data: await createImageBitmap(bmp, x * S, y * S, S, S, { resizeWidth: T, resizeHeight: T, resizeQuality: 'high' }) };
    });
  }
  let edgeProtocol = false;
  function setupEdgeProtocol() {
    if (edgeProtocol) return; edgeProtocol = true;
    maplibregl.addProtocol('inkofm', async (params, ac) => {
      const url = params.url.replace(/^inkofm:\/\//, '');
      const r = await fetch(url, { signal: ac.signal });
      if (r.status === 404 || r.status === 204) return { data: new ArrayBuffer(0) };   // no tile here: nothing to draw
      if (!r.ok) throw new Error('tile ' + r.status + ' ' + url);
      let b = new Uint8Array(await r.arrayBuffer());
      if (b[0] === 0x1f && b[1] === 0x8b) b = new Uint8Array(await new Response(new Blob([b]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
      const m = url.match(/\/(\d+)\/(\d+)\/(\d+)(\.[a-z]+)?(\?.*)?$/);
      if (m && b.length) {
        const z = +m[1], x = +m[2], n = Math.pow(2, z);
        if (x === 0 || x === n - 1) {
          try { if (x === 0) b = patchEdgeTile(b, true); if (x === n - 1) b = patchEdgeTile(b, false); } catch (e) { console.warn('edge tile', e); }
        }
      }
      return { data: b.buffer.byteLength === b.length ? b.buffer : b.slice().buffer };
    });
  }

  async function create(container, opts) {
    const o = Object.assign({}, DEFAULTS, opts || {});
    if (!o.base) o.base = new URL('./', location.href).href;
    if (o.mapOptions && o.mapOptions.interactive === false && o.lazy === undefined) o.lazy = false;   // the poster loads everything at once
    let tj = null;
    const snowZoneP = fetch(o.base + 'data/biomes_snow.geojson?v=20261104').then(r => r.json());
    try { tj = await (await fetch(o.tilejson)).json(); } catch (e) { console.warn('tilejson', e); }
    const ofmTemplate = tj && tj.tiles ? tj.tiles[0] : null;
    // the snow extent (18 KB): the worker tags each glyph inside it (sz), the style tests OpenFreeMap features with "within"
    try { o.snowZone = (await snowZoneP).features[0].geometry; } catch (e) { console.warn('snow zone', e); o.snowZone = null; }
    setupProtocol(o, ofmTemplate); setupImgProtocol(o.base);
    const style = buildStyle(o);
    if (ofmTemplate) {
      setupEdgeProtocol();
      style.sources.ofm = { type: 'vector', tiles: ['inkofm://' + ofmTemplate], minzoom: tj.minzoom || 0, maxzoom: tj.maxzoom || 14,
        attribution: style.sources.ofm.attribution };
    }
    const map = new maplibregl.Map(Object.assign({
      container, style, center: [-3.2, 54.6], zoom: 5.2, minZoom: 0.6, maxZoom: 16, hash: false,
      attributionControl: { compact: true }, fadeDuration: 400, maxTileCacheZoomLevels: 6, renderWorldCopies: true, dragRotate: false, pitchWithRotate: false,
      localIdeographFontFamily: "'Noto Serif', 'Songti SC', serif",
    }, o.mapOptions || {}));
    map.touchZoomRotate.disableRotation();
    addSprites(map);
    map.INK = INK; map.__inkOpts = Object.assign({}, opts || {}, { mapOptions: undefined });
    if (!map.isStyleLoaded()) await new Promise(res => map.once('style.load', res));
    lazyData(map, o.base, style.metadata.inkLazy);
    // newly loaded country is inked in with a quick pen sweep (js/ink-extras.js); not on the poster's hidden map
    if (global.InkExtras && global.InkExtras.inkingIn && !(o.mapOptions && o.mapOptions.interactive === false)) global.InkExtras.inkingIn(map);
    return map;
  }

  // the lazily loaded sources (see LAZY in buildStyle): each gets the latest stage its zoom range allows, once
  function lazyData(map, base, lazy) {
    if (!lazy || !lazy.length) return;
    const got = {};   // source -> index of the stage loaded
    let idle = false;
    const check = () => {
      const z = map.getZoom();
      for (const [id, stages] of lazy) {
        let k = -1;
        stages.forEach((st, i) => { if (z >= st[1] - 0.01 && z < st[2] && (idle || st[3])) k = i; });
        if (k < 0 || (got[id] !== undefined && got[id] >= k)) continue;
        got[id] = k; const f = stages[k][0];
        if (f.startsWith('grid:')) gridSource(map, id, f.slice(5), stages[k][1], base, k > 0 ? base + stages[k - 1][0] : null);
        else { const src = map.getSource(id); if (src) src.setData(base + f); }
      }
    };
    map.__inkLazyCheck = check;
    check();
    map.once('idle', () => { idle = true; setTimeout(check, 50); });
    map.on('zoomend', check);
  }

  // ---- data cut into 5 degree cells (data/grid/index.json, code/02l_grid_split.py): the cells round the view are fetched once
  // the zoom reaches z0, and the source holds the first-stage file (if any) plus every cell fetched so far
  let gridIndex = null;
  function gridSource(map, srcId, layer, z0, base, first) {
    map.__inkGrids = map.__inkGrids || {};
    if (map.__inkGrids[srcId]) return map.__inkGrids[srcId];
    const st = map.__inkGrids[srcId] = { busy: 0, cells: new Map(), first: [] };
    const idx = gridIndex = gridIndex || fetch(base + 'data/grid/index.json?v=20261103').then(r => r.json());
    let timer = null;
    const flush = () => { clearTimeout(timer); timer = setTimeout(() => {
      const src = map.getSource(srcId); if (!src) return;
      let fs = st.first; for (const v of st.cells.values()) if (v) fs = fs.concat(v);
      src.setData({ type: 'FeatureCollection', features: fs });
    }, 60); };
    const job = p => { st.busy++; return p.finally(() => { st.busy--; }); };
    if (first) job(fetch(first).then(r => r.json()).then(j => { st.first = j.features || []; flush(); }).catch(e => console.warn('grid first', e)));
    const check = async () => {
      if (map.getZoom() < z0 - 0.01) return;
      const I = await idx, L = I[layer]; if (!L) return;
      const have = st.have || (st.have = new Set(L.cells));
      const b = map.getBounds(), mx = (b.getEast() - b.getWest()) * 0.25, my = (b.getNorth() - b.getSouth()) * 0.25;
      const i0 = Math.floor((Math.max(-180, b.getWest() - mx) + 180) / 5), i1 = Math.floor((Math.min(179.99, b.getEast() + mx) + 180) / 5);
      const j0 = Math.floor((Math.max(-89.9, b.getSouth() - my) + 90) / 5), j1 = Math.floor((Math.min(89.9, b.getNorth() + my) + 90) / 5);
      if ((i1 - i0 + 1) * (j1 - j0 + 1) > 400) return;
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
        const k = i + '_' + j; if (!have.has(k) || st.cells.has(k)) continue;
        st.cells.set(k, null);
        job(fetch(base + L.dir + k + '.json').then(r => r.json()).then(j2 => { st.cells.set(k, j2.features || []); flush(); }).catch(e => console.warn('grid cell', k, e)));
      }
    };
    st.check = check;
    map.on('moveend', check); check();
    return st;
  }
  const gridBusy = map => Object.values(map.__inkGrids || {}).some(g => g.busy > 0);

  // layer groups for the panel; a layer that belongs to the winter look shows only while its group is on and it is winter
  function setGroup(map, group, on) {
    const st = map.__inkGroups = map.__inkGroups || {};
    st[group] = !!on;
    const w = isWinter(map);
    for (const l of map.getStyle().layers) {
      const g = l.metadata && l.metadata.group;
      if (g === group) map.setLayoutProperty(l.id, 'visibility', on && (!l.metadata.winter || w) ? 'visible' : 'none');
    }
    syncRasters(map);
  }
  // the winter rasters: one combined layer far out while both the wash and the snow show, else the two apart at every zoom
  function syncRasters(map) {
    if (!map.getLayer('tint-w')) return;
    const st = map.__inkGroups || {}, w = isWinter(map), tintOn = st.tint !== false && st.paper !== false;
    const both = w && tintOn;
    map.setLayoutProperty('tint-w', 'visibility', both ? 'visible' : 'none');
    map.setLayerZoomRange('tint', both ? 6.5 : 0, 24);
    map.setLayerZoomRange('snow', both ? 6.5 : 0, 24);
  }
  function isWinter(map) { return map.__inkWinter !== undefined ? map.__inkWinter : !(global.InkPalette && global.InkPalette.winter === false); }
  // the Winter toggle: snow, frozen water, snowy trees, peaks and roofs on or off, without a reload
  function setWinter(map, on) {
    on = !!on; map.__inkWinter = on;
    if (global.InkPalette && global.InkPalette.setWinter) global.InkPalette.setWinter(on);
    const st = map.__inkGroups || {};
    for (const l of map.getStyle().layers) {
      const m = l.metadata || {};
      if (m.wlayout) for (const [k, v] of Object.entries(m.wlayout)) map.setLayoutProperty(l.id, k, on ? v[0] : v[1]);
      if (m.wpaint) for (const [k, v] of Object.entries(m.wpaint)) map.setPaintProperty(l.id, k, on ? v[0] : v[1]);
      if (m.winter) map.setLayoutProperty(l.id, 'visibility', on && st[m.group] !== false ? 'visible' : 'none');
    }
    syncRasters(map);
    map.fire('inkwinter', { on });
  }
  // dark mode: the page round the map goes dark but the map stays parchment; the sea is laid a little deeper so it holds its
  // own against the dark surround (index.html calls this when the theme changes)
  function setSeaTone(map, dark) {
    if (!map || !map.getLayer('sea-tint')) return;
    const l = map.getStyle().layers.find(x => x.id === 'sea-tint'), base = l && l.metadata && l.metadata.seaOp;
    if (!base) return;
    const e = JSON.parse(JSON.stringify(base));
    if (dark) for (let i = 4; i < e.length; i += 2) if (Array.isArray(e[i]) && e[i][0] === 'case') e[i][2] = +(e[i][2] + 0.05).toFixed(3);
    map.setPaintProperty('sea-tint', 'fill-opacity', e);
  }
  global.InkMap = { create, setSeaTone, gridSource, gridBusy, setGroup, setWinter, isWinter, INK, buildStyle, sprites: { mountainSprite, hillSprite, treeSprite, bareTreeSprite, snowConiferSprite, rangeSprite, tuftSprite, settleSprite, paperTexture, duneSprite, grassSprite, rainSprite, taigaSprite, iceSprite } };
})(window);
