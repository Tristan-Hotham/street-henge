/* The Inked World: pictograms for settlements, heritage, landmarks, natural markers, animals, ships and flight.
 * Every icon is drawn on canvas at load time in the same pen: brown-black ink, paper fill, hatching for shade,
 * red for flags and accents, blue for water and ice. Nothing is copied from any existing artwork.
 * Dr Tristan Hotham, Independent researcher, 2026. MIT licence. */
(function (global) {
  'use strict';
  const PAL = global.InkPalette || {};
  const INK = PAL.ink || '#2B2119', PAPER = PAL.paperFill || 'rgba(243,229,191,0.97)', RED = PAL.red || '#A3261B', BLUE = PAL.blue || '#3D6E9E', BLUES = PAL.blueSoft || '#6F9DC6', SNOW = PAL.snow || '#FBF8EE';
  const SNOWSH = PAL.snowShade || '#D6E0E6', ICE = PAL.iceLine || '#8FB0CC';
  let SNOWY = false;   // while true, roofs are drawn under snow (the winter twins of the town drawings, id + '-s')
  function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; }; }
  function hashStr(t) { let h = 2166136261; for (const ch of t) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

  // ---------------- the pen
  // icons are drawn at K times their logical size and registered with pixelRatio 2K (js/ink-palette.js SCALE), so they stay
  // crisp on 3x screens; patterns pass k = 1, since they tile at their pixel size
  const K = ((global.InkPalette && global.InkPalette.SCALE) || 3) / 2;
  function Pen(w, h, seed, k) {
    k = k === undefined ? K : k;
    const c = document.createElement('canvas'); c.width = Math.ceil(w * k); c.height = Math.ceil(h * k); c.__k = k;
    const x = c.getContext('2d', { willReadFrequently: true }); if (k !== 1) x.scale(k, k); x.lineCap = 'round'; x.lineJoin = 'round'; x.strokeStyle = INK; x.fillStyle = PAPER;
    const R = rng(seed || 7);
    const j = a => (R() - 0.5) * a;
    const pen = {
      c, x, R, w, h,
      lw(v) { x.lineWidth = v; return pen; },
      col(v) { x.strokeStyle = v; return pen; },
      path(pts, close) { x.beginPath(); pts.forEach((p, i) => { const px = p[0] + j(0.5), py = p[1] + j(0.5); i ? x.lineTo(px, py) : x.moveTo(px, py); }); if (close) x.closePath(); return pen; },
      line(pts, lw) { if (lw) x.lineWidth = lw; pen.path(pts, false); x.stroke(); return pen; },
      poly(pts, fill, lw) { pen.path(pts, true); x.fillStyle = fill || PAPER; x.fill(); if (lw !== 0) { x.lineWidth = lw || 1.8; x.stroke(); } return pen; },
      rect(x0, y0, w0, h0, fill, lw) { return pen.poly([[x0, y0], [x0 + w0, y0], [x0 + w0, y0 + h0], [x0, y0 + h0]], fill, lw); },
      ell(cx, cy, rx, ry, fill, lw, a0, a1) {
        const pts = []; const s = a0 === undefined ? 0 : a0, e = a1 === undefined ? Math.PI * 2 : a1, n = 28;
        for (let i = 0; i <= n; i++) { const a = s + (e - s) * i / n; pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]); }
        if (fill === null) return pen.line(pts, lw || 1.6);
        return pen.poly(pts, fill, lw);
      },
      dot(px, py, r, col) { x.beginPath(); x.arc(px, py, r, 0, 7); x.fillStyle = col || INK; x.fill(); return pen; },
      // hatch the inside of a polygon with parallel strokes (angle in degrees)
      hatch(pts, ang, gap, lw, col) {
        x.save(); x.beginPath(); pts.forEach((p, i) => i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1])); x.closePath(); x.clip();
        x.strokeStyle = col || INK; x.lineWidth = lw || 0.9; const a = ang * Math.PI / 180, L = w + h;
        for (let d = -L; d < L; d += gap) {
          const cx = w / 2 + Math.cos(a + Math.PI / 2) * d, cy = h / 2 + Math.sin(a + Math.PI / 2) * d;
          x.beginPath(); x.moveTo(cx - Math.cos(a) * L + j(0.6), cy - Math.sin(a) * L + j(0.6)); x.lineTo(cx + Math.cos(a) * L + j(0.6), cy + Math.sin(a) * L + j(0.6)); x.stroke();
        }
        x.restore(); x.strokeStyle = INK; return pen;
      },
      // small arched windows in a row
      wins(x0, y0, wd, n, hh) { for (let i = 0; i < n; i++) { const cx = x0 + (i + 0.5) * wd / n; pen.line([[cx - 0.9, y0 + (hh || 3)], [cx - 0.9, y0 + 1], [cx, y0], [cx + 0.9, y0 + 1], [cx + 0.9, y0 + (hh || 3)]], 0.8); } return pen; },
      flag(px, py, s, col) { pen.line([[px, py], [px, py - 7 * (s || 1)]], 1.1); pen.poly([[px, py - 7 * (s || 1)], [px + 5 * (s || 1), py - 5.6 * (s || 1)], [px, py - 4.2 * (s || 1)]], col || RED, 0.6); return pen; },
      crenels(x0, y0, wd, n) { const cw = wd / (2 * n - 1); for (let i = 0; i < n; i++) pen.rect(x0 + i * 2 * cw, y0 - 2.6, cw, 2.6, PAPER, 1.1); return pen; },
      ground(x0, x1, y) { pen.line([[x0, y], [x1, y]], 1.2); for (let i = 0; i < 4; i++) { const t = x0 + (x1 - x0) * (0.1 + 0.27 * i); pen.line([[t, y + 2], [t + 4, y + 2]], 0.7); } return pen; },
      tower(cx, base, tw, th, top, opt) {
        opt = opt || {};
        const l = cx - tw / 2, t = base - th;
        pen.rect(l, t, tw, th, PAPER, 1.6);
        if (opt.shade !== false) pen.hatch([[cx + tw * 0.15, t], [cx + tw / 2, t], [cx + tw / 2, base], [cx + tw * 0.15, base]], 75, 2.2, 0.7);
        if (opt.win !== false) pen.wins(cx - tw * 0.22, t + th * 0.25, tw * 0.44, 1, Math.min(5, th * 0.18));
        if (top === 'cren') pen.crenels(l - 0.6, t, tw + 1.2, Math.max(2, Math.round(tw / 3.4)));
        else if (top === 'spire') { pen.poly([[l - 0.5, t], [cx, t - tw * (opt.k || 1.9)], [l + tw + 0.5, t]], PAPER, 1.5); pen.hatch([[cx, t - tw * (opt.k || 1.9)], [l + tw + 0.5, t], [cx, t]], 70, 1.8, 0.7); }
        else if (top === 'cone') { pen.poly([[l - 1, t], [cx, t - tw * 1.1], [l + tw + 1, t]], opt.red ? RED : PAPER, 1.5); if (SNOWY) pen.poly([[l - 0.2, t - tw * 0.35], [cx, t - tw * 1.1], [l + tw + 0.2, t - tw * 0.35], [cx + tw * 0.2, t - tw * 0.2], [cx - tw * 0.25, t - tw * 0.3]], SNOW, 0.5); }
        else if (top === 'dome') pen.ell(cx, t, tw * 0.55, tw * 0.55, PAPER, 1.5, Math.PI, Math.PI * 2);
        else if (top === 'onion') { const r = tw * 0.62; pen.poly([[cx - r, t], [cx - r * 0.95, t - r * 0.8], [cx - r * 0.3, t - r * 1.35], [cx, t - r * 2], [cx + r * 0.3, t - r * 1.35], [cx + r * 0.95, t - r * 0.8], [cx + r, t]], opt.fill || PAPER, 1.4); }
        else if (top === 'pyr') pen.poly([[l - 0.5, t], [cx, t - tw * 0.8], [l + tw + 0.5, t]], PAPER, 1.4);
        return pen;
      },
      done() { return c; },
    };
    return pen;
  }
  // a gabled house front: x, ground y, width, wall height, roof height
  function house(p, x0, gy, wd, wh, rh, opt) {
    opt = opt || {};
    p.rect(x0, gy - wh, wd, wh, PAPER, 1.4);
    p.poly([[x0 - 1, gy - wh], [x0 + wd / 2, gy - wh - rh], [x0 + wd + 1, gy - wh]], opt.roof || PAPER, 1.4);
    if (!opt.roof) p.hatch([[x0 + wd / 2, gy - wh - rh], [x0 + wd + 1, gy - wh], [x0 + wd / 2, gy - wh]], 60, 1.7, 0.7);
    if (opt.door !== false) p.line([[x0 + wd * 0.42, gy], [x0 + wd * 0.42, gy - wh * 0.45], [x0 + wd * 0.62, gy - wh * 0.45], [x0 + wd * 0.62, gy]], 0.9);
    if (opt.chimney) p.rect(x0 + wd * 0.7, gy - wh - rh * 0.75, 2, rh * 0.45, PAPER, 1);
  }
  function church(p, cx, gy, s, spire) {
    p.rect(cx - 9 * s, gy - 9 * s, 13 * s, 9 * s, PAPER, 1.5);
    p.poly([[cx - 10 * s, gy - 9 * s], [cx - 2.5 * s, gy - 14 * s], [cx + 5 * s, gy - 9 * s]], SNOWY ? SNOW : PAPER, 1.4);
    p.hatch([[cx - 2.5 * s, gy - 14 * s], [cx + 5 * s, gy - 9 * s], [cx - 2.5 * s, gy - 9 * s]], 60, 1.7, 0.7, SNOWY ? ICE : undefined);
    p.wins(cx - 7 * s, gy - 7 * s, 9 * s, 3, 3.5 * s);
    p.tower(cx + 7 * s, gy, 6 * s, 15 * s, spire ? 'spire' : 'cren', { k: 2.2 });
    p.line([[cx + 7 * s, gy - 15 * s - (spire ? 13.5 * s : 3) - 1], [cx + 7 * s, gy - 15 * s - (spire ? 13.5 * s : 3) - 5 * s]], 1);
  }


  // ---------------- bird's-eye houses (one oblique viewpoint for every house: depth runs up and to the right)
  const WALL = '#F3E7C9', WALLSH = '#D9C59A', TILE = '#B4472E', TILESH = '#8C2E1E', TILE2 = '#66809C', TILE2SH = '#475E78';   // red tiles and blue-grey slate, as on the old coloured town plans
  const DV = [0.38, -0.7];   // one unit of depth on paper
  // further roof colours seen on the coloured plans: ochre tiles, moss-grey stone slates, dark old tiles, brown shingles
  const ROOFS = [[TILE, TILESH], [TILE2, TILE2SH], ['#B8843E', '#8E6229'], ['#7A8466', '#59624A'], ['#93402E', '#6B2B1F'], ['#8A6A4E', '#664C36']];
  function bhBox(p, x0, gy, w, hw, d, rh, opt) {
    opt = opt || {};
    const RC = opt.roof !== undefined ? ROOFS[opt.roof] : opt.brown ? ROOFS[1] : ROOFS[0];
    const T = RC[0], TS = RC[1];
    const dx = DV[0] * d, dy = DV[1] * d, top = gy - hw;
    const A = [x0, gy], B = [x0 + w, gy], At = [x0, top], Bt = [x0 + w, top];
    const Bb = [B[0] + dx, B[1] + dy], Bbt = [Bt[0] + dx, Bt[1] + dy], Abt = [At[0] + dx, At[1] + dy];
    if (opt.gable) {
      // ridge runs back from a gable facing the street
      const F = [x0 + w / 2, top - rh], Fb = [F[0] + dx, F[1] + dy];
      p.poly([At, F, Fb, Abt], T, 1);                                    // left slope, seen from above
      p.poly([B, Bb, Bbt, Bt], WALLSH, 1);                               // side wall
      p.poly([Bt, Bbt, Fb, F], TS, 1);                                   // right slope, in shade
      p.hatch([Bt, Bbt, Fb, F], -38, 1.6, 0.5, 'rgba(43,33,25,0.55)');
      if (SNOWY) { p.poly([At, F, Fb, Abt].map((q, i) => i === 0 ? lerp(q, F, 0.12) : i === 3 ? lerp(q, Fb, 0.12) : q), SNOW, 0.5); p.poly([Bt, Bbt, Fb, F].map((q, i) => i < 2 ? lerp(q, i ? Fb : F, 0.15) : q), SNOWSH, 0.5); icicles(p, At, Bt, gy); }
      p.poly([A, B, Bt, F, At], WALL, 1);                                // gable front
      p.line([[x0 + w / 2 - 0.9, top - rh * 0.45], [x0 + w / 2 + 0.9, top - rh * 0.45]], 0.7);
    } else {
      // ridge runs along the street
      const R1 = [x0 + dx / 2, top + dy / 2 - rh], R2 = [x0 + w + dx / 2, top + dy / 2 - rh];
      p.poly([R1, R2, Bbt, Abt], TS, 1);                                 // back slope, just seen over the ridge
      p.poly([B, Bb, Bbt, Bt], WALLSH, 1);                               // side wall
      p.poly([Bt, Bbt, R2], WALLSH, 1);                                  // gable end
      p.poly([At, Bt, R2, R1], T, 1);                                    // front slope
      p.hatch([At, Bt, R2, R1], 0, 1.7, 0.5, 'rgba(43,33,25,0.5)');      // tile courses
      if (SNOWY) { p.poly([R1, R2, Bbt, Abt], SNOWSH, 0.5); p.poly([lerp(At, R1, 0.22), lerp(Bt, R2, 0.22), R2, R1], SNOW, 0.5); p.poly([Bt, Bbt, R2], SNOW, 0.4); icicles(p, At, Bt, gy); }
      p.poly([A, B, Bt, At], WALL, 1);                                   // front wall
    }
    // windows and a door
    const n = Math.max(1, Math.round(w / 5));
    for (let i = 0; i < n; i++) { const cx = x0 + (i + 0.5) * w / n; if (hw >= 7) p.rect(cx - 0.6, top + 1.2, 1.2, 1.5, '#3A2C20', 0); }
    if (opt.door !== false) { const dxo = x0 + w * (opt.doorAt || 0.5); p.rect(dxo - 0.8, gy - 2.6, 1.6, 2.6, '#3A2C20', 0); }
    if (opt.chimney) { const cx = x0 + w * 0.72 + dx * 0.35, cy = top + dy * 0.35 - rh * 0.7; p.rect(cx - 0.8, cy - 2.6, 1.6, 2.8, WALL, 0.8); }
    if (opt.party) for (let k = 1; k < opt.party; k++) { const xx = x0 + w * k / opt.party; p.line([[xx, top], [xx + dx / 2, top + dy / 2 - rh]], 0.8); p.line([[xx, gy], [xx, top]], 0.6); }
  }
  const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  // a fringe of icicles under the eaves (drawn before the front wall, so they hang over it)
  function icicles(p, a, b, gy) { const n = Math.max(2, Math.round((b[0] - a[0]) / 2.4)); p.col(ICE); for (let i = 0; i < n; i++) { const t = (i + 0.5) / n, xx = a[0] + (b[0] - a[0]) * t, yy = a[1] + (b[1] - a[1]) * t; p.line([[xx, yy], [xx, yy + 0.9 + (i % 3) * 0.5]], 0.45); } p.col(INK); }
  // ---------------- townhouses of the drawn towns (round 4): the bird's-eye town plan look. Steep roofs seen at an angle
  // dominate, in muted tiles, slate, stone slates and thatch; short walls, timber-framed (cream render and dark beams),
  // stone (coursed, with quoins) or rendered; chimneys; several roof forms (eaves to the street, gable to the street,
  // hipped, a cross wing, a jettied upper floor, a row of narrow gables). Under snow the snow lies on the slopes, but the
  // dark eaves, the ridge, the gable ends, the chimneys and the walls still show, so a winter town never reads as white boxes.
  const TH_ROOFS = [['#8E4A34', '#653224'], ['#6E6470', '#4C4452'], ['#9A6A44', '#6E4A2E'], ['#B4472E', '#86301F'], ['#76776A', '#53554A'], ['#B39257', '#86693A'], ['#7B4A3E', '#56322A']];
  const TH_WALLS = { timber: ['#EFE3C4', '#CDB98F'], stone: ['#CFC3A6', '#A8997A'], render: ['#E8D8B0', '#C4AE80'] };
  const BEAM = '#4A3526';
  function thSlope(p, eave0, eave1, top1, top0, col, shadeCol, shaded, snowSide) {
    // one roof slope: eave edge eave0-eave1, top edge top1-top0; tiles, then (winter) snow laid down from the top
    const quad = [eave0, eave1, top1, top0];
    p.poly(quad, shaded ? shadeCol : col, 0.9);
    // tile courses parallel to the eaves
    for (let k = 1; k < 5; k++) { const t = k / 5; p.col('rgba(30,20,14,0.42)').line([lerp(eave0, top0, t), lerp(eave1, top1, t)], 0.45); }
    p.col(INK);
    if (SNOWY) {
      // the snow covers the slope from the ridge down to a soft, uneven edge a little above the eaves
      const n = 6, edge = [];
      for (let i = 0; i <= n; i++) { const u = i / n, e = lerp(eave0, eave1, u), tp = lerp(top0, top1, u), dip = 0.2 + 0.07 * Math.sin(i * 2.3 + eave0[0]); edge.push(lerp(e, tp, dip)); }
      p.poly([top0, top1].concat(edge.slice().reverse()).reverse(), snowSide ? SNOWSH : SNOW, 0);
      p.col(snowSide ? 'rgba(110,135,160,0.55)' : 'rgba(150,170,190,0.6)').line(edge, 0.5).col(INK);
    }
    // dark eaves: the tile edge and its shadow under it
    p.col(TH_ROOFS[6][1]).line([eave0, eave1], 1.25).col(INK);
  }
  function thWall(p, pts, mat, shaded, x0, x1, top, gy) {
    const [W, WS] = TH_WALLS[mat];
    p.poly(pts, shaded ? WS : W, 0.9);
    if (shaded) { p.hatch(pts, 70, 1.5, 0.45, 'rgba(43,33,25,0.45)'); return; }
    if (mat === 'timber') {
      p.col(BEAM);
      p.line([[x0 + 0.5, gy], [x0 + 0.5, top]], 0.9); p.line([[x1 - 0.5, gy], [x1 - 0.5, top]], 0.9);
      const mid = top + (gy - top) * 0.45; p.line([[x0, mid], [x1, mid]], 0.7);
      const bays = Math.max(1, Math.round((x1 - x0) / 4.5));
      for (let i = 1; i < bays; i++) { const xx = x0 + (x1 - x0) * i / bays; p.line([[xx, gy], [xx, top]], 0.6); }
      p.line([[x0 + 0.5, mid], [x0 + (x1 - x0) / bays, top]], 0.5);
      p.col(INK);
    } else if (mat === 'stone') {
      p.col('rgba(95,80,58,0.55)');
      for (let yy = top + 1.6; yy < gy - 0.5; yy += 1.6) p.line([[x0 + 0.4, yy], [x1 - 0.4, yy]], 0.35);
      p.col(INK); p.rect(x0, top, 1.3, gy - top, '#E3D8BE', 0.4); p.rect(x1 - 1.3, top, 1.3, gy - top, '#E3D8BE', 0.4);
    }
  }
  function thOpenings(p, x0, x1, top, gy, doorAt, door) {
    const w = x1 - x0, n = Math.max(1, Math.round(w / 4.2));
    if (gy - top >= 4.5) for (let i = 0; i < n; i++) { const cx = x0 + (i + 0.5) * w / n; p.rect(cx - 0.65, top + 1.1, 1.3, 1.5, '#3A2C20', 0); }
    if (door !== false) { const dx = x0 + w * (doorAt || 0.5); p.poly([[dx - 0.85, gy], [dx - 0.85, gy - 2.2], [dx, gy - 2.9], [dx + 0.85, gy - 2.2], [dx + 0.85, gy]], '#3A2C20', 0); }
  }
  function thChimney(p, cx, base, h) {
    p.rect(cx - 0.9, base - h, 1.8, h, '#8A5A44', 0.8);
    p.rect(cx - 1.2, base - h - 0.7, 2.4, 0.8, '#3A2C20', 0);
    if (SNOWY) p.ell(cx, base - h - 0.8, 1.3, 0.6, SNOW, 0.3);
  }
  // one house: o = {x, gy, w, hw (wall), d (depth), rh (roof rise), form, mat, roof, chim, door, jetty}
  function thHouse(p, o) {
    const { x: x0, gy, w, hw, d, rh } = o, [T, TS] = TH_ROOFS[o.roof];
    const dx = DV[0] * d, dy = DV[1] * d, top = gy - hw, x1 = x0 + w;
    const A = [x0, gy], B = [x1, gy], At = [x0, top], Bt = [x1, top];
    const Bb = [B[0] + dx, B[1] + dy], Bbt = [Bt[0] + dx, Bt[1] + dy], Abt = [At[0] + dx, At[1] + dy];
    p.poly([B, Bb, Bbt, Bt], TH_WALLS[o.mat][1], 0.9); p.hatch([B, Bb, Bbt, Bt], 70, 1.5, 0.45, 'rgba(43,33,25,0.45)');   // side wall, in shade
    if (o.form === 'gable') {
      const F = [x0 + w / 2, top - rh], Fb = [F[0] + dx, F[1] + dy];
      thSlope(p, Bt, Bbt, Fb, F, T, TS, true, true);                       // right slope, in shade
      thSlope(p, At, Abt, Fb, F, T, TS, false, false);                      // left slope, lit
      p.col(TH_ROOFS[6][1]).line([F, Fb], 1.1).col(INK);                   // ridge
      thWall(p, [A, B, Bt, F, At], o.mat, false, x0, x1, top, gy);         // gable front
      p.col(BEAM).line([At, F, Bt], 0.9).col(INK);
      p.rect(F[0] - 0.6, top - rh * 0.5, 1.2, 1.3, '#3A2C20', 0);          // loft window
      thOpenings(p, x0, x1, top, gy, o.doorAt, o.door);
      if (o.chim) thChimney(p, F[0] + dx * 0.6 + 1.6, F[1] + dy * 0.6 + 2.2, 2.6);
    } else {
      // ridge along the street (hipped: the ridge is shortened and the ends slope too)
      // the ridge stands high over the street front; the gable end at the side shows the pitch
      const hip = o.form === 'hip' ? Math.min(w * 0.28, 3.2) : 0, rr = rh * 0.85;
      const R1 = [x0 + dx / 2 + hip, top + dy / 2 - rr], R2 = [x1 + dx / 2 - hip, top + dy / 2 - rr];
      thSlope(p, Abt, Bbt, R2, R1, T, TS, true, true);                      // back slope, in shade, seen beyond the ridge
      if (hip) thSlope(p, Bt, Bbt, R2, R2, T, TS, true, true);              // hipped end, in shade
      else { p.poly([Bt, Bbt, R2], TH_WALLS[o.mat][1], 0.9); p.col(BEAM).line([Bt, R2, Bbt], 0.8).col(INK); if (SNOWY) p.col(SNOW).line([R2, lerp(R2, Bt, 0.35)], 0.9).col(INK); }   // gable end
      thSlope(p, At, Bt, R2, R1, T, TS, false, false);                      // front slope, the big one
      if (hip) thSlope(p, At, At, R1, R1, T, TS, false, false);
      p.col(TH_ROOFS[6][1]).line([R1, R2], 1.1).col(INK);                  // ridge
      if (o.dormer) { const c = lerp(lerp(At, Bt, 0.5), lerp(R1, R2, 0.5), 0.38); p.poly([[c[0] - 1.6, c[1] + 1.4], [c[0] - 1.6, c[1] - 0.6], [c[0], c[1] - 2.2], [c[0] + 1.6, c[1] - 0.6], [c[0] + 1.6, c[1] + 1.4]], TH_WALLS[o.mat][0], 0.7); p.rect(c[0] - 0.5, c[1] - 0.4, 1, 1.2, '#3A2C20', 0); }
      if (o.jetty) {   // a jettied upper floor: the upper wall oversails the lower on a beam
        const jt = top + hw * 0.48;
        thWall(p, [A, B, [x1, jt], [x0, jt]], o.mat === 'timber' ? 'stone' : o.mat, false, x0, x1, jt, gy);
        thWall(p, [[x0 - 0.6, jt], [x1 + 0.6, jt], Bt, At], 'timber', false, x0, x1, top, jt);
        p.col(BEAM).line([[x0 - 0.8, jt], [x1 + 0.8, jt]], 1.1).col(INK);
      } else thWall(p, [A, B, Bt, At], o.mat, false, x0, x1, top, gy);
      thOpenings(p, x0, x1, top, gy, o.doorAt, o.door);
      if (o.chim) { const t = o.chimAt || 0.72; thChimney(p, lerp(R1, R2, t)[0] + 0.4, lerp(R1, R2, t)[1] + 1.4, 2.8); }
      if (o.chim2) thChimney(p, lerp(R1, R2, 0.18)[0], lerp(R1, R2, 0.18)[1] + 1.4, 2.4);
    }
    p.col(INK).line([A, B], 1.1);
  }
  // sixteen townhouse drawings: one or a few houses each, in different forms, sizes, walls and roofs
  const TH_N = 16;
  function thVariant(p, v) {
    const gy = 33, H = (o) => thHouse(p, Object.assign({ gy, hw: 4.5, d: 12, rh: 6, form: 'eaves', mat: 'timber', roof: 0, chim: false }, o));
    switch (v) {
      case 0: H({ x: 6, w: 13, rh: 6.5, chim: true }); break;
      case 1: H({ x: 10, w: 9, hw: 5.5, d: 14, rh: 8, form: 'gable', roof: 1, mat: 'stone' }); break;
      case 2: H({ x: 3, w: 9, hw: 5.5, d: 12, rh: 7.5, form: 'gable', roof: 2, chim: true }); H({ x: 12, w: 8, hw: 6.5, d: 12, rh: 8.5, form: 'gable', roof: 0 }); H({ x: 20, w: 8, hw: 5, d: 12, rh: 7, form: 'gable', roof: 6, mat: 'render' }); break;
      case 3: H({ x: 5, w: 15, hw: 5, rh: 7, form: 'hip', roof: 1, mat: 'stone', chim: true, chimAt: 0.5 }); break;
      case 4: H({ x: 9, w: 10, hw: 5, d: 13, rh: 8.5, form: 'gable', roof: 3, mat: 'render', chim: true }); break;
      case 5: H({ x: 3, w: 11, rh: 6, roof: 4, mat: 'stone' }); H({ x: 13, w: 8, hw: 5.5, d: 13, rh: 7.5, form: 'gable', roof: 4, mat: 'stone', chim: true }); break;
      case 6: H({ x: 8, w: 10, hw: 7, d: 13, rh: 8, form: 'gable', roof: 0, chim: true }); break;
      case 7: H({ x: 5, w: 15, hw: 4, d: 11, rh: 6, roof: 5, mat: 'render', doorAt: 0.3 }); break;
      case 8: H({ x: 9, w: 10, hw: 6, d: 15, rh: 9.5, form: 'gable', roof: 6, mat: 'timber', chim: true }); break;
      case 9: H({ x: 3, w: 9, hw: 5, d: 12, rh: 7.5, form: 'gable', roof: 2 }); H({ x: 12, w: 10, hw: 5.5, rh: 6.5, roof: 0, mat: 'stone', chim: true }); break;
      case 10: H({ x: 5, w: 16, hw: 5, rh: 7, form: 'hip', roof: 3, mat: 'render', chim: true, chimAt: 0.3, dormer: true }); break;
      case 11: H({ x: 1, w: 7, hw: 6, d: 12, rh: 8, form: 'gable', roof: 1, mat: 'stone' }); H({ x: 8, w: 7, hw: 7, d: 12, rh: 8.5, form: 'gable', roof: 3, chim: true }); H({ x: 15, w: 7, hw: 5.5, d: 12, rh: 7.5, form: 'gable', roof: 2, mat: 'render' }); break;
      case 12: H({ x: 9, w: 9, hw: 4.5, d: 11, rh: 7, form: 'gable', roof: 4, mat: 'stone', chim: true }); break;
      case 13: H({ x: 4, w: 12, hw: 6.5, rh: 6, jetty: true, roof: 1, chim: true }); H({ x: 16, w: 7, hw: 5, d: 12, rh: 7.5, form: 'gable', roof: 1, mat: 'render' }); break;
      case 14: H({ x: 6, w: 9, hw: 6, d: 12, rh: 8, form: 'gable', roof: 6, jetty: true }); H({ x: 15, w: 9, hw: 5, d: 12, rh: 7.5, form: 'gable', roof: 0, mat: 'stone', chim: true }); break;
      default: H({ x: 8, w: 11, hw: 5, d: 13, rh: 8.5, form: 'gable', roof: 3, mat: 'stone', chim: true }); break;
    }
  }

  // ---------------- settlements
  function settlements(add) {
    add('s-capital', 64, 60, p => {
      const gy = 52;
      p.ell(32, 40, 28, 14, PAPER, 1.6);                       // walled enceinte seen from above and the side
      p.lw(1.8).line([[5, 40], [5, 47], [59, 47], [59, 40]]);
      for (const tx of [6, 20, 44, 58]) p.tower(tx, gy - 4, 6, 12, 'cren', { win: false, shade: false });
      p.tower(32, gy - 6, 10, 24, 'cren');
      p.tower(24, gy - 6, 6, 16, 'spire', { k: 2.2 });
      house(p, 37, gy - 6, 9, 7, 5); house(p, 44, gy - 7, 8, 6, 4);
      p.flag(32, gy - 33, 1.2);
      // a red star over the keep
      const sx = 32, sy = 6, pts = []; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 2.4 : 5.5; pts.push([sx + Math.cos(a) * r, sy + Math.sin(a) * r]); }
      p.poly(pts, RED, 0.8);
    });
    add('s-city', 54, 48, p => {
      const gy = 44;
      house(p, 3, gy - 2, 10, 9, 7, { chimney: true }); house(p, 38, gy - 1, 12, 10, 7);
      p.tower(20, gy, 7, 22, 'spire', { k: 2.4 });
      house(p, 25, gy, 11, 12, 8, { roof: RED });
      house(p, 12, gy + 1, 9, 8, 6);
      p.tower(44, gy - 10, 5, 12, 'dome', { win: false });
      p.ground(1, 52, gy + 2);
    });
    add('s-town', 42, 36, p => {
      const gy = 31;
      house(p, 3, gy, 9, 8, 6); house(p, 25, gy, 11, 9, 6, { roof: RED, chimney: true });
      p.tower(17, gy, 6, 16, 'spire', { k: 2.1 });
      p.ground(1, 40, gy + 2);
    });
    add('s-village', 32, 30, p => {
      const gy = 25; church(p, 11, gy, 0.75, true); house(p, 20, gy, 8, 6, 5); p.ground(2, 30, gy + 2);
    });
    add('s-hamlet', 20, 18, p => { house(p, 4, 14, 10, 6, 5); });
    // townhouses for the drawn towns, all seen from one viewpoint (high in the south, a little to the east), as on the
    // bird's-eye town plans of the sixteenth century: cream walls, red tiled roofs, every house turned the same way
    for (let v = 0; v < TH_N; v++) add('th' + v, 34, 36, p => { thVariant(p, v); }, 3000 + v);
    for (let v = 0; v < TH_N; v++) add('th' + v + '-s', 34, 36, p => { SNOWY = true; try { thVariant(p, v); } finally { SNOWY = false; } }, 3000 + v);
    add('market', 30, 26, p => {
      p.poly([[3, 22], [27, 22], [24, 14], [6, 14]], PAPER, 1.4);   // a cobbled square with a market cross and stalls
      for (let i = 0; i < 4; i++) p.dot(8 + i * 5, 19, 0.7);
      p.line([[15, 18], [15, 6]], 1.6); p.line([[11.5, 9], [18.5, 9]], 1.4);
      p.poly([[4, 13], [9, 10], [9, 14]], RED, 0.8);
    });
    add('townchurch', 30, 40, p => { church(p, 12, 36, 1.05, true); });
    add('townchurch-s', 30, 40, p => { SNOWY = true; try { church(p, 12, 36, 1.05, true); } finally { SNOWY = false; } }, hashStr('townchurch'));
    // market stalls with striped awnings, and a village green with its tree and pond
    for (let v = 0; v < 3; v++) add('stall' + v, 18, 16, p => { const col = ['#A3261B', '#3D6E9E', '#B8862B'][v]; p.rect(3, 8, 12, 6, PAPER, 1.1); p.poly([[1, 9], [17, 9], [15, 4], [3, 4]], col, 1); for (let k = 0; k < 3; k++) p.line([[5 + k * 4, 4], [4.5 + k * 4, 9]], 0.8); p.dot(6, 11.5, 0.8); p.dot(10, 11.5, 0.8, '#B8862B'); }, 6100 + v);
    add('green', 40, 30, p => { p.ell(20, 18, 18, 9, '#C9D3A0', 1.1); p.ell(29, 20, 5, 2.6, '#9DBBD6', 0.9); p.line([[12, 22], [12, 15]], 1.4); p.ell(12, 11, 5.5, 5, '#B9C98F', 1.3); p.hatch([[12, 6], [17, 11], [12, 16]], 60, 1.6, 0.6); });
    // a walled city at the middle zooms: a ring wall with gate towers, the cathedral spire and the castle on its rise
    const citybig = p => {
      const cx = 48, gy = 66;
      p.ell(cx, 52, 42, 17, '#EFE1BC', 1.8);
      p.ell(cx, 52, 37, 13.5, null, 0.7);
      for (const [hx, hy, v] of [[22, 54, 0], [31, 58, 2], [58, 58, 0], [66, 53, 4], [40, 61, 3], [53, 62, 2], [27, 47, 4], [70, 46, 0]]) { const c = TILE; bhBox(p, hx - 5, hy, 8 + (v % 3), 3.5, 7, 2.4, { roof: v % 6, door: false }); }
      p.tower(57, 50, 7, 22, 'spire', { k: 2.5 });                       // cathedral
      p.rect(42, 41, 15, 9, PAPER, 1.3); p.poly([[41, 41], [49.5, 35], [58, 41]], TILE, 1.2);
      p.tower(30, 44, 9, 18, 'cren'); p.tower(23, 46, 6, 12, 'cren', { win: false }); p.flag(30, 26 - 1, 1.1);   // castle keep
      for (const [tx, ty] of [[8, 54], [24, 66], [48, 70], [72, 66], [88, 54], [48, 37]]) p.tower(tx, ty, 7, 11, 'cone', { red: true, win: false });
      p.rect(44, 62, 8, 8, PAPER, 1.4); p.line([[46, 70], [46, 65], [48, 63.5], [50, 65], [50, 70]], 1);   // the main gate
    };
    add('citybig', 96, 78, citybig);
    add('citybig-s', 96, 78, p => { SNOWY = true; try { citybig(p); } finally { SNOWY = false; } }, hashStr('citybig'));
    // pick and shovel for mines and quarries; an anchor for harbours
    add('quarry', 26, 24, p => { p.line([[5, 20], [19, 6]], 1.8); p.line([[12, 3], [16, 4], [21, 9], [22, 13]], 1.6); p.line([[21, 20], [9, 8]], 1.6); p.poly([[6, 5], [11, 6], [9, 11], [4, 9]], '#9C8656', 1.1); p.ground(1, 25, 22); });
    add('anchor', 22, 26, p => { p.col(BLUE); p.ell(11, 4, 2.4, 2.4, null, 1.3); p.line([[11, 6.5], [11, 22]], 1.8); p.line([[6, 10], [16, 10]], 1.5); p.line([[3, 15], [5, 21], [11, 23], [17, 21], [19, 15]], 1.6); p.line([[1.5, 16.5], [3, 15], [5, 16]], 1.2); p.line([[17, 16], [19, 15], [20.5, 16.5]], 1.2); p.col(INK); });
    add('wallseg', 24, 14, p => { p.rect(1, 5, 22, 7, PAPER, 1.5); p.crenels(1, 5, 22, 5); p.hatch([[1, 9], [23, 9], [23, 12], [1, 12]], 0, 1.6, 0.6); });
    add('walltower', 16, 22, p => { p.tower(8, 20, 9, 13, 'cone', { red: true, win: false }); });
    // star fort: bastioned trace with a moat, seen from above (map symbol), and the rampart hachure for real outlines
    // a trace italienne: a regular polygon whose every corner is an arrow-headed bastion, with flanks back to the curtain walls
    function starPts(cx, cy, R, n, rot, sc) {
      sc = sc || 1;
      const C = []; for (let k = 0; k < n; k++) { const a = rot + k * 2 * Math.PI / n; C.push([cx + Math.cos(a) * R, cy + Math.sin(a) * R]); }
      const out = [];
      for (let k = 0; k < n; k++) {
        const c = C[k], pv = C[(k + n - 1) % n], nx = C[(k + 1) % n];
        const ra = Math.atan2(c[1] - cy, c[0] - cx);
        const nrm = (a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy); return [dy / L, -dx / L]; };   // outward normal of a clockwise-in-screen edge
        const np = nrm(pv, c), nn = nrm(c, nx);
        const a1 = [c[0] + (pv[0] - c[0]) * 0.3, c[1] + (pv[1] - c[1]) * 0.3], a2 = [c[0] + (nx[0] - c[0]) * 0.3, c[1] + (nx[1] - c[1]) * 0.3];
        const f = R * 0.13 * sc;
        const f1 = [a1[0] + np[0] * f, a1[1] + np[1] * f], f2 = [a2[0] + nn[0] * f, a2[1] + nn[1] * f];
        const tp = [c[0] + Math.cos(ra) * R * 0.42 * sc, c[1] + Math.sin(ra) * R * 0.42 * sc];
        out.push(a1, f1, tp, f2, a2);
      }
      return out;
    }
    for (const [id, n, S] of [['h-starfort', 5, 1.25], ['starfort6', 6, 1.5]]) add(id, 48 * S, 48 * S, p => {
      const c = 24 * S, R = 13.5 * S, rot = -Math.PI / 2;
      const scale = (pts, k) => pts.map(([x0, y0]) => [c + (x0 - c) * k, c + (y0 - c) * k]);
      const trace = starPts(c, c, R, n, rot);
      p.poly(scale(trace, 1.3), 'rgba(111,157,198,0.5)', 0);                             // moat
      p.col(BLUE); p.path(scale(trace, 1.3), true); p.x.lineWidth = 0.9; p.x.stroke(); p.col(INK);
      p.poly(scale(trace, 1.12), 'rgba(214,196,140,0.95)', 0.9);                          // glacis
      p.poly(trace, 'rgba(214,196,140,0.95)', 1.7);                                       // rampart
      const inner = scale(trace, 0.84); p.poly(inner, PAPER, 1.0);                        // parade ground inside the parapet
      for (let k = 0; k < trace.length; k++) { const [x0, y0] = trace[k], [x1, y1] = inner[k]; if (k % 5 === 2) p.line([[x0, y0], [x1, y1]], 0.7); }
      p.rect(c - 3 * S, c - 1.5 * S, 6 * S, 4.5 * S, PAPER, 1); p.flag(c, c - 1.5 * S, 0.8 * S);
    });
    add('rampart', 10, 12, p => { p.x.fillStyle = 'rgba(214,196,140,0.9)'; p.x.fillRect(0, 2, 10, 8); p.line([[0, 2], [10, 2]], 1.6); for (const x0 of [2, 7]) p.line([[x0, 3], [x0 - 1, 9.5]], 0.9); p.line([[0, 10], [10, 10]], 0.6); });
  }

  // ---------------- heritage type icons
  function heritage(add) {
    add('h-castle', 40, 36, p => { const gy = 33; p.rect(6, gy - 14, 28, 14, PAPER, 1.6); p.crenels(6, gy - 14, 28, 6); p.tower(8, gy, 7, 20, 'cren'); p.tower(32, gy, 7, 20, 'cren'); p.tower(20, gy - 4, 9, 26, 'cren'); p.flag(20, gy - 33); p.line([[17, gy], [17, gy - 6], [20, gy - 9], [23, gy - 6], [23, gy]], 1.2); p.ground(1, 39, gy + 1); });
    add('h-mansion', 44, 30, p => { const gy = 27; p.rect(4, gy - 9, 10, 9, PAPER, 1.4); p.rect(30, gy - 9, 10, 9, PAPER, 1.4); p.rect(13, gy - 14, 18, 14, PAPER, 1.6); p.poly([[12, gy - 14], [22, gy - 20], [32, gy - 14]], PAPER, 1.4); p.hatch([[22, gy - 20], [32, gy - 14], [22, gy - 14]], 60, 1.7, 0.7); p.wins(5, gy - 7, 8, 2); p.wins(31, gy - 7, 8, 2); p.wins(14, gy - 11, 16, 4); p.line([[20, gy], [20, gy - 5], [24, gy - 5], [24, gy]], 1); p.ground(1, 43, gy + 1); });
    add('h-palace', 52, 32, p => { const gy = 29; p.rect(3, gy - 12, 46, 12, PAPER, 1.6); p.wins(4, gy - 9, 44, 9, 4); p.tower(26, gy - 12, 12, 6, 'dome', { win: false }); p.tower(5, gy, 5, 15, 'cone', { win: false }); p.tower(47, gy, 5, 15, 'cone', { win: false }); p.flag(26, gy - 25); p.ground(1, 51, gy + 1); });
    add('h-cathedral', 44, 46, p => { const gy = 43; p.rect(10, gy - 14, 24, 14, PAPER, 1.6); p.poly([[9, gy - 14], [22, gy - 21], [35, gy - 14]], PAPER, 1.4); p.hatch([[22, gy - 21], [35, gy - 14], [22, gy - 14]], 60, 1.7, 0.7); p.wins(11, gy - 11, 22, 5, 5); p.ell(22, gy - 17, 2.6, 2.6, PAPER, 1); p.tower(7, gy, 7, 26, 'spire', { k: 2 }); p.tower(37, gy, 7, 26, 'spire', { k: 2 }); p.ground(1, 43, gy + 1); });
    add('h-church', 30, 40, p => { church(p, 12, 36, 1, true); p.ground(1, 29, 37); });
    add('h-monastery', 42, 34, p => { const gy = 31; p.rect(4, gy - 9, 34, 9, PAPER, 1.4); p.wins(5, gy - 7, 32, 7, 3); church(p, 20, gy - 9, 0.75, false); p.ground(1, 41, gy + 1); });
    add('h-mosque', 44, 42, p => { const gy = 39; p.rect(9, gy - 10, 26, 10, PAPER, 1.6); p.ell(22, gy - 10, 10, 10, PAPER, 1.6, Math.PI, Math.PI * 2); p.hatch([[22, gy - 20], [32, gy - 10], [22, gy - 10]], 70, 1.8, 0.7); p.line([[22, gy - 20], [22, gy - 24]], 1); p.ell(22, gy - 25, 1.3, 1.3, null, 0.9); for (const mx of [4, 40]) { p.tower(mx, gy, 3.5, 28, 'cone', { win: false, shade: false }); p.rect(mx - 2.6, gy - 20, 5.2, 1.6, PAPER, 0.9); } p.wins(11, gy - 7, 22, 4, 4); p.ground(1, 43, gy + 1); });
    add('h-temple', 44, 30, p => { const gy = 27; p.rect(3, gy - 3, 38, 3, PAPER, 1.4); p.poly([[4, gy - 18], [22, gy - 25], [40, gy - 18]], PAPER, 1.5); p.rect(5, gy - 18, 34, 2.5, PAPER, 1.2); for (let i = 0; i < 6; i++) p.rect(7 + i * 5.7, gy - 15.5, 2.4, 12.5, PAPER, 1.1); p.ground(1, 43, gy + 1); });
    add('h-pagoda', 32, 46, p => { const gy = 43; for (let k = 0; k < 4; k++) { const w = 22 - k * 4, y = gy - k * 9; p.rect(16 - w / 2 + 3, y - 7, w - 6, 7, PAPER, 1.3); p.poly([[16 - w / 2 - 2, y - 7], [16 - w / 2 + 2, y - 10], [16 + w / 2 - 2, y - 10], [16 + w / 2 + 2, y - 7], [16 + w / 2 + 3, y - 9]], k === 3 ? RED : PAPER, 1.3); } p.line([[16, gy - 39], [16, gy - 44]], 1.2); p.ground(2, 30, gy + 1); });
    add('h-synagogue', 34, 32, p => { const gy = 29; p.rect(5, gy - 14, 24, 14, PAPER, 1.6); p.ell(17, gy - 14, 6, 5, PAPER, 1.4, Math.PI, Math.PI * 2); p.wins(7, gy - 10, 20, 3, 5); p.ground(2, 32, gy + 1); });
    add('h-tower', 22, 42, p => { p.tower(11, 39, 9, 30, 'cren'); p.ground(2, 20, 40); });
    add('h-skyscraper', 22, 50, p => { const gy = 47; p.rect(5, gy - 34, 12, 34, PAPER, 1.5); p.hatch([[11, gy - 34], [17, gy - 34], [17, gy], [11, gy]], 90, 1.8, 0.7); for (let y = gy - 31; y < gy - 2; y += 4) p.line([[6, y], [10, y]], 0.6); p.poly([[5, gy - 34], [11, gy - 42], [17, gy - 34]], PAPER, 1.3); p.line([[11, gy - 42], [11, gy - 48]], 1); p.ground(2, 20, gy + 1); });
    add('h-bridge', 48, 24, p => { const gy = 20; p.rect(2, gy - 10, 44, 3, PAPER, 1.4); for (let i = 0; i < 3; i++) { const x0 = 4 + i * 14; p.ell(x0 + 6, gy, 6, 6, null, 1.4, Math.PI, Math.PI * 2); p.line([[x0, gy], [x0, gy - 7]], 1.2); } p.line([[46, gy], [46, gy - 7]], 1.2); p.col(BLUE).line([[0, gy + 2], [48, gy + 2]], 1).line([[8, gy + 4], [40, gy + 4]], 0.8).col(INK); });
    add('h-lighthouse', 22, 42, p => { const gy = 39; p.poly([[6, gy], [8, gy - 26], [14, gy - 26], [16, gy]], PAPER, 1.5); p.hatch([[6, gy - 8], [16, gy - 8], [16, gy - 14], [6, gy - 14]], 0, 2, 0.8, RED); p.rect(7.5, gy - 32, 7, 6, PAPER, 1.3); p.poly([[6.5, gy - 32], [11, gy - 37], [15.5, gy - 32]], RED, 1.2); for (const a of [-0.5, 0, 0.5]) p.col(RED).line([[11, gy - 29], [11 + Math.cos(a + Math.PI) * 9, gy - 29 + Math.sin(a) * 4]], 0.7).col(INK); p.ground(1, 21, gy + 1); });
    add('h-windmill', 32, 40, p => { const gy = 37; p.poly([[11, gy], [13, gy - 18], [19, gy - 18], [21, gy]], PAPER, 1.5); p.poly([[12, gy - 18], [16, gy - 23], [20, gy - 18]], PAPER, 1.3); for (let k = 0; k < 4; k++) { const a = Math.PI / 4 + k * Math.PI / 2; p.line([[16, gy - 19], [16 + Math.cos(a) * 14, gy - 19 + Math.sin(a) * 14]], 1.3); p.line([[16 + Math.cos(a) * 5, gy - 19 + Math.sin(a) * 5], [16 + Math.cos(a) * 14 + Math.cos(a + 1.57) * 3, gy - 19 + Math.sin(a) * 14 + Math.sin(a + 1.57) * 3]], 0.7); } p.ground(4, 28, gy + 1); });
    add('h-ruins', 40, 30, p => { const gy = 27; p.poly([[5, gy], [5, gy - 16], [8, gy - 19], [10, gy - 14], [12, gy - 15], [12, gy]], PAPER, 1.5); p.poly([[17, gy], [17, gy - 9], [20, gy - 11], [23, gy - 8], [23, gy]], PAPER, 1.4); p.ell(20, gy - 4, 2.4, 3, null, 1); p.poly([[28, gy], [28, gy - 13], [31, gy - 14], [34, gy - 10], [34, gy]], PAPER, 1.5); p.hatch([[8, gy], [12, gy], [12, gy - 15], [8, gy - 15]], 70, 2, 0.7); for (let i = 0; i < 5; i++) p.rect(3 + i * 7, gy - 2, 3, 2, PAPER, 0.8); p.ground(1, 39, gy + 1); });
    add('h-monument', 20, 40, p => { const gy = 37; p.rect(4, gy - 5, 12, 5, PAPER, 1.4); p.poly([[7.5, gy - 5], [8.5, gy - 28], [10, gy - 31], [11.5, gy - 28], [12.5, gy - 5]], PAPER, 1.5); p.hatch([[10, gy - 31], [12.5, gy - 5], [10, gy - 5]], 80, 1.8, 0.7); p.ground(1, 19, gy + 1); });
    add('h-stone_circle', 36, 22, p => { for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2, cx = 18 + Math.cos(a) * 13, cy = 12 + Math.sin(a) * 6; p.rect(cx - 1.5, cy - 4, 3, 4.5, PAPER, 1.1); } });
    add('h-standing_stone', 18, 28, p => { p.poly([[6, 25], [5.5, 12], [8, 4], [11, 5], [12.5, 13], [12, 25]], PAPER, 1.6); p.hatch([[9.5, 5], [12.5, 13], [12, 25], [9.5, 25]], 75, 1.9, 0.7); p.ground(2, 16, 26); });
    add('h-cairn', 24, 20, p => { const st = [[4, 16, 6], [10, 16, 6], [16, 16, 5], [7, 12, 5.5], [13, 12, 5.5], [10, 8, 5], [10.5, 4.5, 3.5]]; for (const [sx, sy, sw] of st) p.ell(sx + 2, sy, sw / 2 + 0.6, 2.1, PAPER, 1.1); });
    add('h-barrow', 32, 16, p => { p.ell(16, 13, 13, 8, PAPER, 1.6, Math.PI, Math.PI * 2); p.line([[2, 13], [30, 13]], 1.2); p.hatch([[16, 5], [29, 13], [16, 13]], 65, 2, 0.7); });
    add('h-hillfort', 36, 22, p => { for (const [rx, ry] of [[16, 8.5], [12, 6.2], [8, 4]]) p.ell(18, 12, rx, ry, null, 1.3); p.hatch([[2, 12], [34, 12], [34, 20], [2, 20]], 90, 3, 0.6); });
    add('h-battle', 26, 26, p => { p.line([[4, 22], [22, 4]], 1.8); p.line([[22, 22], [4, 4]], 1.8); p.line([[3, 17], [9, 23]], 1.6); p.line([[23, 17], [17, 23]], 1.6); p.poly([[20, 2], [24, 2], [24, 6]], RED, 0.6); p.poly([[6, 2], [2, 2], [2, 6]], RED, 0.6); });
    add('h-stupa', 34, 38, p => { const gy = 35; p.rect(5, gy - 4, 24, 4, PAPER, 1.3); p.ell(17, gy - 4, 10, 10, PAPER, 1.6, Math.PI, Math.PI * 2); p.hatch([[17, gy - 14], [27, gy - 4], [17, gy - 4]], 70, 1.8, 0.7); p.rect(14.5, gy - 18, 5, 4, PAPER, 1.2); p.poly([[15, gy - 18], [17, gy - 31], [19, gy - 18]], '#C9A24A', 1.2); p.ground(2, 32, gy + 1); });
    // natural markers
    add('h-waterfall', 30, 30, p => { p.poly([[2, 4], [12, 4], [12, 26], [2, 26]], PAPER, 1.4); p.hatch([[2, 4], [12, 4], [12, 26], [2, 26]], 60, 2, 0.7); p.poly([[18, 4], [28, 4], [28, 26], [18, 26]], PAPER, 1.4); p.hatch([[18, 4], [28, 4], [28, 26], [18, 26]], 120, 2, 0.7); p.col(BLUE); for (let i = 0; i < 4; i++) p.line([[13 + i * 1.3, 5], [13 + i * 1.3, 24]], 0.9); p.ell(15, 26, 5, 1.6, null, 0.9); p.col(INK); });
    add('h-cave', 30, 22, p => { p.poly([[2, 20], [8, 8], [15, 4], [23, 8], [28, 20]], PAPER, 1.6); p.poly([[10, 20], [11, 13], [15, 10], [19, 13], [20, 20]], '#2B2119', 0.6); p.hatch([[15, 4], [23, 8], [28, 20], [20, 20], [19, 13]], 60, 2, 0.7); });
    add('h-spring', 22, 18, p => { p.col(BLUE); p.ell(11, 12, 8, 3, null, 1.2); p.ell(11, 12, 4.5, 1.6, null, 0.9); p.line([[11, 10], [11, 3]], 1); p.line([[11, 6], [8, 3]], 0.8); p.line([[11, 6], [14, 3]], 0.8); p.col(INK); });
    add('h-pass', 32, 20, p => { p.line([[2, 17], [10, 6], [16, 11], [22, 6], [30, 17]], 1.7); p.col(RED).line([[16, 11], [16, 18]], 1).line([[12, 15], [20, 15]], 1).col(INK); });
    add('h-gorge', 32, 22, p => { p.poly([[2, 4], [12, 4], [15, 20], [2, 20]], PAPER, 1.4); p.hatch([[2, 4], [12, 4], [15, 20], [2, 20]], 70, 1.8, 0.7); p.poly([[30, 4], [20, 4], [17, 20], [30, 20]], PAPER, 1.4); p.hatch([[30, 4], [20, 4], [17, 20], [30, 20]], 110, 1.8, 0.7); p.col(BLUE).line([[14, 20], [16, 12], [15, 6]], 1.1).col(INK); });
    add('h-glacier_mark', 34, 20, p => { p.col(BLUE); for (let i = 0; i < 4; i++) p.line([[3 + i * 2, 4 + i * 4], [31 - i * 2, 4 + i * 4]], 1); for (let i = 0; i < 6; i++) p.line([[6 + i * 4.5, 5], [8 + i * 4.5, 15]], 0.7); p.col(INK); });
    add('h-park', 40, 28, p => { p.col('#6B5440'); for (let i = 0; i < 18; i++) { const a = i / 18 * Math.PI * 2; p.dot(20 + Math.cos(a) * 17, 15 + Math.sin(a) * 10, 0.8, '#6B5440'); } p.col(INK); for (const [tx, ty, r] of [[11, 14, 4], [17, 10, 4.6], [27, 12, 4.2], [23, 19, 3.6]]) { p.line([[tx, ty + r], [tx, ty + r + 3]], 1.1); p.ell(tx, ty, r, r * 0.9, '#C9D3A0', 1.2); } p.poly([[31, 21], [33, 17], [35, 21]], RED, 0.8); p.line([[31, 21], [31, 24]], 0.8); p.line([[35, 21], [35, 24]], 0.8); });
    add('h-natpark', 36, 36, p => { const sh = [[4, 4], [32, 4], [32, 18], [18, 33], [4, 18]]; p.poly(sh, '#E3E8C8', 1.8); p.line([[6, 6], [30, 6], [30, 17.5], [18, 30.5], [6, 17.5], [6, 6]], 0.7); p.poly([[9, 22], [15, 11], [19, 17], [22, 13], [28, 22]], PAPER, 1.3); p.hatch([[15, 11], [19, 17], [16, 22], [15, 22]], 70, 1.6, 0.6); for (const tx of [11, 25]) { p.poly([[tx - 2.4, 26], [tx, 20], [tx + 2.4, 26]], '#6E8A4A', 1); } });
    add('h-parliament', 52, 44, p => { const gy = 41; p.rect(3, gy - 4, 46, 4, PAPER, 1.3); p.rect(6, gy - 16, 40, 12, PAPER, 1.5); for (let i = 0; i < 8; i++) p.rect(8 + i * 4.8, gy - 15, 1.6, 11, PAPER, 0.8); p.poly([[5, gy - 16], [26, gy - 22], [47, gy - 16]], PAPER, 1.4); p.rect(19, gy - 26, 14, 4, PAPER, 1.2); p.ell(26, gy - 26, 7, 8, SNOW, 1.5, Math.PI, Math.PI * 2); p.hatch([[26, gy - 34], [33, gy - 26], [26, gy - 26]], 70, 1.7, 0.7); p.flag(26, gy - 34, 1.1); });
    add('h-cityhall', 40, 46, p => { const gy = 43; p.rect(4, gy - 16, 32, 16, PAPER, 1.5); p.wins(5, gy - 12, 30, 6, 5); p.poly([[3, gy - 16], [20, gy - 22], [37, gy - 16]], PAPER, 1.3); p.tower(20, gy - 20, 7, 14, 'spire', { k: 1.4, win: false }); p.ell(20, gy - 29, 2.2, 2.2, PAPER, 1); p.line([[20, gy - 29], [20, gy - 30.5]], 0.6); p.ground(1, 39, gy + 1); });
    add('h-pyramid', 46, 32, p => { const gy = 29; for (let k = 0; k < 4; k++) { const w = 40 - k * 8; p.rect(23 - w / 2, gy - (k + 1) * 6, w, 6, PAPER, 1.3); } p.rect(18, gy - 29, 10, 5, PAPER, 1.3); p.line([[21, gy], [22, gy - 24]], 0.8); p.line([[25, gy], [24, gy - 24]], 0.8); p.ground(1, 45, gy + 1); });
    add('h-island', 30, 18, p => { p.ell(15, 11, 12, 5, PAPER, 1.5); p.col(BLUE).ell(15, 11, 14.5, 6.5, null, 0.7).col(INK); p.line([[13, 9], [15, 4], [17, 9]], 1.2); });
  }

  // ---------------- bespoke landmarks (original drawings, simplified as an engraver might)
  function landmarks(add) {
    const G = (p, gy, w) => p.ground(1, w - 1, gy + 1);
    add('l-eiffel', 36, 64, p => { const gy = 61; p.poly([[4, gy], [12, gy - 22], [24, gy - 22], [32, gy]], PAPER, 0); p.line([[4, gy], [14, gy - 30], [16.5, gy - 48], [18, gy - 60]], 1.6); p.line([[32, gy], [22, gy - 30], [19.5, gy - 48], [18, gy - 60]], 1.6); p.ell(18, gy, 9, 9, null, 1.3, Math.PI, Math.PI * 2); p.line([[9, gy - 18], [27, gy - 18]], 1.8); p.line([[13, gy - 33], [23, gy - 33]], 1.5); for (let k = 0; k < 7; k++) { const y = gy - 20 - k * 4, hw = 6 - k * 0.6; p.line([[18 - hw, y], [18 + hw, y - 4]], 0.6); p.line([[18 + hw, y], [18 - hw, y - 4]], 0.6); } p.flag(18, gy - 60, 0.8); G(p, gy, 36); });
    add('l-liberty', 30, 64, p => { const gy = 61; p.poly([[6, gy], [8, gy - 14], [22, gy - 14], [24, gy]], PAPER, 1.5); p.hatch([[15, gy - 14], [22, gy - 14], [24, gy], [15, gy]], 80, 2, 0.7); p.poly([[10, gy - 14], [11, gy - 38], [15, gy - 44], [19, gy - 38], [20, gy - 14]], PAPER, 1.5); p.hatch([[15, gy - 44], [19, gy - 38], [20, gy - 14], [15, gy - 14]], 80, 1.8, 0.7); p.ell(15, gy - 46, 3, 3.2, PAPER, 1.3); for (let k = -2; k <= 2; k++) p.line([[15 + k * 1.5, gy - 49], [15 + k * 3, gy - 53]], 0.9); p.line([[19, gy - 40], [22, gy - 54]], 1.6); p.poly([[20.5, gy - 54], [22, gy - 60], [24, gy - 54]], '#C9A24A', 1); p.line([[11, gy - 32], [8, gy - 26]], 1.4); G(p, gy, 30); });
    add('l-bigben', 50, 64, p => { const gy = 61; p.rect(14, gy - 16, 34, 16, PAPER, 1.5); p.wins(15, gy - 12, 32, 8, 6); for (let i = 0; i < 5; i++) p.line([[16 + i * 7, gy - 16], [16 + i * 7, gy - 19]], 0.9); p.tower(8, gy, 8, 40, 'none', { win: false }); p.rect(3.8, gy - 40, 8.4, 8, PAPER, 1.4); p.ell(8, gy - 36, 3, 3, PAPER, 1.1); p.line([[8, gy - 36], [8, gy - 38]], 0.8); p.line([[8, gy - 36], [9.6, gy - 36]], 0.8); p.poly([[3.5, gy - 40], [8, gy - 54], [12.5, gy - 40]], PAPER, 1.4); p.hatch([[8, gy - 54], [12.5, gy - 40], [8, gy - 40]], 70, 1.8, 0.7); p.line([[8, gy - 54], [8, gy - 59]], 1); p.flag(42, gy - 16, 0.9); G(p, gy, 50); });
    add('l-towerbridge', 60, 44, p => { const gy = 38; for (const tx of [16, 44]) { p.tower(tx, gy, 9, 26, 'none', { win: true }); for (const d of [-4, 0, 4]) p.tower(tx + d, gy - 26, 2.5, 3, 'spire', { k: 2.4, win: false, shade: false }); } p.rect(20.5, gy - 23, 19, 3, PAPER, 1.2); p.rect(20.5, gy - 11, 19, 2.5, PAPER, 1.2); p.line([[2, gy - 9], [11.5, gy - 9]], 1.3); p.line([[48.5, gy - 9], [58, gy - 9]], 1.3); p.line([[3, gy - 18], [11.5, gy - 11]], 1); p.line([[57, gy - 18], [48.5, gy - 11]], 1); p.col(BLUE).line([[0, gy + 2], [60, gy + 2]], 1).line([[10, gy + 4], [50, gy + 4]], 0.8).col(INK); });
    add('l-opera', 60, 34, p => { const gy = 28; p.rect(4, gy - 3, 52, 3, PAPER, 1.3); const sails = [[8, 18, 14], [18, 22, 18], [30, 18, 15], [40, 14, 11]]; for (const [sx, sw, sh] of sails) { p.poly([[sx, gy - 3], [sx + sw * 0.25, gy - 3 - sh], [sx + sw, gy - 3]], PAPER, 1.5); p.hatch([[sx + sw * 0.25, gy - 3 - sh], [sx + sw, gy - 3], [sx + sw * 0.4, gy - 3]], 50, 1.6, 0.6); } p.col(BLUE).line([[0, gy + 2], [60, gy + 2]], 1).line([[6, gy + 4], [54, gy + 4]], 0.8).col(INK); });
    add('l-tajmahal', 56, 50, p => { const gy = 47; p.rect(2, gy - 3, 52, 3, PAPER, 1.3); p.rect(14, gy - 18, 28, 15, PAPER, 1.6); p.line([[24, gy - 3], [24, gy - 12], [28, gy - 16], [32, gy - 12], [32, gy - 3]], 1.1); p.poly([[19, gy - 18], [20, gy - 26], [24, gy - 32], [28, gy - 38], [32, gy - 32], [36, gy - 26], [37, gy - 18]], SNOW, 1.6); p.line([[28, gy - 38], [28, gy - 43]], 1); for (const sx of [17, 39]) p.tower(sx, gy - 18, 4, 3, 'dome', { win: false }); for (const mx of [5, 51]) { p.tower(mx, gy - 3, 3.5, 26, 'dome', { win: false, shade: false }); p.line([[mx - 2.5, gy - 11], [mx + 2.5, gy - 11]], 0.9); p.line([[mx - 2.5, gy - 20], [mx + 2.5, gy - 20]], 0.9); } });
    add('l-pyramids', 64, 36, p => { const gy = 33; const pyr = (cx, w, h) => { p.poly([[cx - w / 2, gy], [cx, gy - h], [cx + w / 2, gy]], PAPER, 1.6); p.hatch([[cx, gy - h], [cx + w / 2, gy], [cx, gy]], 115, 1.8, 0.7); }; pyr(46, 26, 16); pyr(30, 34, 24); pyr(14, 22, 14); p.dot(8, 24, 0); G(p, gy, 64); });
    add('l-colosseum', 54, 34, p => { const gy = 30; p.poly([[3, gy], [3, gy - 16], [12, gy - 22], [40, gy - 22], [51, gy - 14], [51, gy]], PAPER, 1.6); p.line([[3, gy - 16], [51, gy - 14]], 0.9); for (let row = 0; row < 3; row++) for (let i = 0; i < 8; i++) { const x0 = 5 + i * 5.8, y0 = gy - 4 - row * 6; p.line([[x0, y0], [x0, y0 - 3], [x0 + 1.6, y0 - 4.6], [x0 + 3.2, y0 - 3], [x0 + 3.2, y0]], 0.7); } p.line([[40, gy - 22], [44, gy - 8], [51, gy - 6]], 1.2); G(p, gy, 54); });
    add('l-parthenon', 54, 36, p => { const gy = 33; p.poly([[2, gy], [8, gy - 8], [46, gy - 8], [52, gy]], PAPER, 1.4); p.hatch([[2, gy], [8, gy - 8], [46, gy - 8], [52, gy]], 20, 2.2, 0.6); p.rect(9, gy - 10, 36, 2, PAPER, 1.2); for (let i = 0; i < 8; i++) p.rect(10.5 + i * 4.4, gy - 23, 2.2, 13, PAPER, 1); p.rect(8, gy - 26, 38, 3, PAPER, 1.2); p.poly([[8, gy - 26], [27, gy - 32], [46, gy - 26]], PAPER, 1.3); });
    add('l-stbasil', 46, 54, p => { const gy = 51; p.rect(6, gy - 12, 34, 12, PAPER, 1.5); p.tower(23, gy - 12, 7, 18, 'pyr', { win: false }); p.line([[23, gy - 36], [23, gy - 41]], 1); const domes = [[10, 10, '#B23A2E'], [17, 14, PAPER], [29, 14, '#3D6E9E'], [36, 10, '#C9A24A']]; for (const [dx, dh, col] of domes) { p.tower(dx, gy - 12, 5, dh, 'onion', { win: false, fill: col }); } p.hatch([[6, gy - 12], [40, gy - 12], [40, gy], [6, gy]], 45, 3, 0.6); G(p, gy, 46); });
    add('l-burj', 26, 70, p => { const gy = 67; p.poly([[6, gy], [9, gy - 20], [11, gy - 36], [12.2, gy - 52], [13, gy - 64], [13.8, gy - 52], [15, gy - 36], [17, gy - 20], [20, gy]], PAPER, 1.5); p.hatch([[13, gy - 64], [20, gy], [13, gy]], 85, 1.8, 0.7); for (const y of [20, 36, 52]) p.line([[9.5, gy - y], [16.5, gy - y]], 0.8); G(p, gy, 26); });
    add('l-goldengate', 64, 36, p => { const gy = 30; const col = '#B23A2E'; for (const tx of [18, 46]) { p.rect(tx - 2.5, gy - 26, 5, 26, PAPER, 1.4); p.line([[tx - 2.5, gy - 18], [tx + 2.5, gy - 18]], 0.8); p.line([[tx - 2.5, gy - 10], [tx + 2.5, gy - 10]], 0.8); } p.col(col); p.line([[0, gy - 10], [18, gy - 26]], 1.2); p.line([[18, gy - 26], [24, gy - 16], [32, gy - 12], [40, gy - 16], [46, gy - 26]], 1.2); p.line([[46, gy - 26], [64, gy - 10]], 1.2); for (let k = 0; k < 12; k++) { const x0 = 20 + k * 2.2; p.line([[x0, gy - 8], [x0, gy - 14 + Math.abs(x0 - 32) * 0.4]], 0.5); } p.col(INK).line([[0, gy - 8], [64, gy - 8]], 1.5); p.col(BLUE).line([[0, gy + 2], [64, gy + 2]], 1).line([[8, gy + 4], [56, gy + 4]], 0.8).col(INK); });
    add('l-christ', 44, 56, p => { const gy = 53; p.poly([[6, gy], [16, gy - 18], [28, gy - 18], [38, gy]], PAPER, 1.5); p.hatch([[22, gy - 18], [28, gy - 18], [38, gy], [22, gy]], 70, 2, 0.7); p.rect(19, gy - 22, 6, 4, PAPER, 1.2); p.poly([[19.5, gy - 22], [20, gy - 40], [24, gy - 40], [24.5, gy - 22]], SNOW, 1.4); p.poly([[5, gy - 40], [39, gy - 40], [39, gy - 37], [5, gy - 37]], SNOW, 1.3); p.ell(22, gy - 43, 2.6, 3, SNOW, 1.2); });
    add('l-stonehenge', 50, 26, p => { const gy = 22; for (let i = 0; i < 6; i++) { const x0 = 4 + i * 7.4, h = 12 + (i % 2) * 2; p.rect(x0, gy - h, 3.6, h, PAPER, 1.3); p.hatch([[x0 + 2, gy - h], [x0 + 3.6, gy - h], [x0 + 3.6, gy], [x0 + 2, gy]], 90, 1.4, 0.6); } p.rect(3, gy - 15.5, 11.5, 2.4, PAPER, 1.2); p.rect(18, gy - 15.5, 11.5, 2.4, PAPER, 1.2); p.rect(33, gy - 15.5, 11, 2.4, PAPER, 1.2); p.poly([[44, gy], [46, gy - 6], [49, gy - 5], [49, gy]], PAPER, 1.1); G(p, gy, 50); });
    add('l-angkor', 60, 44, p => { const gy = 41; p.rect(2, gy - 5, 56, 5, PAPER, 1.3); for (const [tx, th] of [[10, 18], [20, 24], [30, 32], [40, 24], [50, 18]]) { p.poly([[tx - 4.5, gy - 5], [tx - 3.5, gy - 5 - th * 0.6], [tx - 1.6, gy - 5 - th * 0.9], [tx, gy - 5 - th], [tx + 1.6, gy - 5 - th * 0.9], [tx + 3.5, gy - 5 - th * 0.6], [tx + 4.5, gy - 5]], PAPER, 1.4); for (let k = 1; k < 4; k++) p.line([[tx - 4 + k * 0.6, gy - 5 - th * k * 0.22], [tx + 4 - k * 0.6, gy - 5 - th * k * 0.22]], 0.6); } p.col(BLUE).line([[0, gy + 2], [60, gy + 2]], 0.9).col(INK); });
    add('l-machupicchu', 56, 44, p => { const gy = 41; p.poly([[30, gy], [36, gy - 22], [40, gy - 36], [44, gy - 40], [48, gy - 32], [52, gy - 14], [56, gy]], PAPER, 1.6); p.hatch([[44, gy - 40], [48, gy - 32], [52, gy - 14], [56, gy], [44, gy]], 70, 1.8, 0.7); for (let k = 0; k < 4; k++) p.line([[2 + k * 3, gy - 4 - k * 4], [30 - k * 2, gy - 4 - k * 4]], 1); for (let i = 0; i < 5; i++) p.rect(6 + i * 4.6, gy - 21, 3, 3, PAPER, 0.9); });
    add('l-montstmichel', 46, 54, p => { const gy = 47; p.poly([[4, gy], [12, gy - 10], [18, gy - 18], [28, gy - 18], [36, gy - 10], [42, gy]], PAPER, 1.5); p.hatch([[23, gy - 18], [28, gy - 18], [36, gy - 10], [42, gy], [23, gy]], 70, 2, 0.7); for (let i = 0; i < 4; i++) house(p, 8 + i * 8, gy - 4 - Math.min(i, 3 - i) * 5, 6, 4, 3); p.rect(17, gy - 26, 12, 8, PAPER, 1.4); p.tower(23, gy - 26, 4, 6, 'spire', { k: 4, win: false }); p.col(BLUE).line([[0, gy + 3], [46, gy + 3]], 1).line([[6, gy + 5], [40, gy + 5]], 0.8).col(INK); });
    add('l-neuschwanstein', 48, 56, p => { const gy = 53; p.poly([[2, gy], [10, gy - 10], [38, gy - 12], [46, gy]], PAPER, 1.4); p.hatch([[2, gy], [10, gy - 10], [38, gy - 12], [46, gy]], 70, 2.2, 0.6); p.rect(14, gy - 30, 18, 20, SNOW, 1.5); p.wins(15, gy - 26, 16, 4, 4); p.poly([[13, gy - 30], [23, gy - 36], [33, gy - 30]], '#3D6E9E', 1.3); for (const [tx, th] of [[11, 26], [35, 30], [28, 36]]) p.tower(tx, gy - 10, 4.5, th, 'cone', { win: false, shade: false }); p.flag(28, gy - 51, 0.8); });
    add('l-sagrada', 42, 64, p => { const gy = 61; p.rect(5, gy - 14, 32, 14, PAPER, 1.5); p.wins(6, gy - 10, 30, 6, 5); for (const [tx, th] of [[9, 42], [16, 50], [26, 50], [33, 42]]) { p.poly([[tx - 2.6, gy - 14], [tx - 1.4, gy - th], [tx, gy - th - 4], [tx + 1.4, gy - th], [tx + 2.6, gy - 14]], PAPER, 1.3); for (let y = gy - 20; y > gy - th; y -= 4) p.line([[tx - 1.6, y], [tx + 1.6, y]], 0.6); p.dot(tx, gy - th - 4, 1.2, RED); } G(p, gy, 42); });
    add('l-pisa', 30, 54, p => { const gy = 51; p.x.save(); p.x.translate(15, gy); p.x.rotate(0.09); p.x.translate(-15, -gy); p.rect(10, gy - 40, 10, 40, SNOW, 1.6); for (let k = 1; k < 7; k++) { p.line([[10, gy - k * 6], [20, gy - k * 6]], 0.8); for (let i = 0; i < 3; i++) p.line([[11.5 + i * 3, gy - k * 6 + 1], [11.5 + i * 3, gy - k * 6 + 4.5]], 0.6); } p.rect(11.5, gy - 45, 7, 5, SNOW, 1.2); p.x.restore(); G(p, gy, 30); });
    add('l-petra', 46, 48, p => { const gy = 45; p.poly([[0, gy], [0, 4], [46, 2], [46, gy]], '#E8C9A0', 1.2); p.hatch([[0, gy], [0, 4], [46, 2], [46, gy]], 75, 2.6, 0.5); p.rect(9, gy - 32, 28, 32, PAPER, 1.4); for (let i = 0; i < 6; i++) p.rect(11 + i * 4.4, gy - 15, 1.8, 15, PAPER, 0.9); p.poly([[9, gy - 17], [23, gy - 21], [37, gy - 17]], PAPER, 1.1); p.ell(23, gy - 26, 3.4, 5, PAPER, 1.1); p.rect(12, gy - 30, 22, 2, PAPER, 0.9); });
    add('l-moai', 44, 40, p => { const gy = 37; for (const [mx, s] of [[9, 0.85], [22, 1], [35, 0.9]]) { const h = 28 * s; p.poly([[mx - 4.5 * s, gy], [mx - 5 * s, gy - h * 0.7], [mx - 4 * s, gy - h], [mx + 4 * s, gy - h], [mx + 5.5 * s, gy - h * 0.62], [mx + 3.8 * s, gy - h * 0.55], [mx + 4 * s, gy]], PAPER, 1.5); p.line([[mx - 3 * s, gy - h * 0.72], [mx + 2 * s, gy - h * 0.72]], 1.1); p.hatch([[mx + 1 * s, gy - h], [mx + 4 * s, gy - h], [mx + 4 * s, gy], [mx + 1 * s, gy]], 85, 1.7, 0.6); } G(p, gy, 44); });
    add('l-forbidden', 60, 36, p => { const gy = 33; p.rect(2, gy - 6, 56, 6, '#E8C9A0', 1.3); p.rect(10, gy - 15, 40, 9, '#B23A2E', 1.3); for (let i = 0; i < 8; i++) p.line([[12 + i * 5, gy - 15], [12 + i * 5, gy - 6]], 0.8, 0); p.poly([[5, gy - 15], [9, gy - 19], [51, gy - 19], [55, gy - 15], [57, gy - 17]], '#C9A24A', 1.3); p.poly([[14, gy - 19], [18, gy - 25], [42, gy - 25], [46, gy - 19]], '#C9A24A', 1.3); p.line([[1, gy - 13], [5, gy - 15]], 1); });
    add('l-cntower', 24, 70, p => { const gy = 67; p.poly([[8, gy], [11, gy - 44], [13, gy - 44], [16, gy]], PAPER, 1.4); p.ell(12, gy - 46, 5, 3, PAPER, 1.4); p.rect(10.8, gy - 58, 2.4, 10, PAPER, 1.1); p.line([[12, gy - 58], [12, gy - 68]], 1.1); G(p, gy, 24); });
    add('l-petronas', 36, 66, p => { const gy = 63; for (const tx of [9, 27]) { p.poly([[tx - 5, gy], [tx - 5, gy - 34], [tx - 4, gy - 42], [tx - 2.5, gy - 48], [tx - 1, gy - 52], [tx, gy - 62], [tx + 1, gy - 52], [tx + 2.5, gy - 48], [tx + 4, gy - 42], [tx + 5, gy - 34], [tx + 5, gy]], PAPER, 1.4); for (let y = gy - 6; y > gy - 46; y -= 6) p.line([[tx - 4, y], [tx + 4, y]], 0.6); } p.rect(14, gy - 30, 8, 2.2, PAPER, 1); G(p, gy, 36); });
    add('l-marinabay', 56, 38, p => { const gy = 35; for (const tx of [12, 28, 44]) { p.rect(tx - 4, gy - 26, 8, 26, PAPER, 1.4); p.hatch([[tx, gy - 26], [tx + 4, gy - 26], [tx + 4, gy], [tx, gy]], 90, 1.8, 0.6); } p.poly([[4, gy - 26], [6, gy - 30], [54, gy - 30], [52, gy - 26]], PAPER, 1.4); p.col(BLUE).line([[0, gy + 2], [56, gy + 2]], 1).col(INK); });
    add('l-notredame', 46, 50, p => { const gy = 47; p.rect(8, gy - 20, 30, 20, PAPER, 1.6); for (const tx of [12, 34]) { p.rect(tx - 4.5, gy - 32, 9, 32, PAPER, 1.5); p.wins(tx - 3.5, gy - 28, 7, 2, 7); } p.ell(23, gy - 13, 4.5, 4.5, PAPER, 1.3); p.line([[18.5, gy - 13], [27.5, gy - 13]], 0.6); p.line([[23, gy - 17.5], [23, gy - 8.5]], 0.6); p.line([[19, gy], [19, gy - 5], [23, gy - 8], [27, gy - 5], [27, gy]], 1); p.poly([[21, gy - 20], [23, gy - 40], [25, gy - 20]], PAPER, 1.1); G(p, gy, 46); });
    add('l-stpeters', 56, 46, p => { const gy = 43; p.rect(2, gy - 12, 52, 12, PAPER, 1.5); for (let i = 0; i < 9; i++) p.rect(4 + i * 5.6, gy - 11, 1.6, 11, PAPER, 0.8); p.rect(18, gy - 18, 20, 6, PAPER, 1.4); p.ell(28, gy - 18, 9, 10, SNOW, 1.6, Math.PI, Math.PI * 2); p.hatch([[28, gy - 28], [37, gy - 18], [28, gy - 18]], 70, 1.8, 0.7); p.rect(26.5, gy - 32, 3, 4, PAPER, 1); p.line([[28, gy - 32], [28, gy - 37]], 1); p.line([[26.4, gy - 35], [29.6, gy - 35]], 0.9); });
    add('l-borobudur', 56, 34, p => { const gy = 31; for (let k = 0; k < 5; k++) { const w = 52 - k * 9; p.rect(28 - w / 2, gy - (k + 1) * 4, w, 4, PAPER, 1.2); } for (let i = 0; i < 5; i++) p.ell(14 + i * 7, gy - 22, 2, 2.4, PAPER, 0.9, Math.PI, Math.PI * 2); p.ell(28, gy - 22, 5, 6, PAPER, 1.3, Math.PI, Math.PI * 2); p.line([[28, gy - 28], [28, gy - 33]], 1.1); G(p, gy, 56); });
    add('l-fuji', 64, 38, p => { const gy = 35; const L = [[2, gy], [16, gy - 14], [26, gy - 26], [29, gy - 30], [35, gy - 30], [38, gy - 26], [48, gy - 14], [62, gy]]; p.poly(L, PAPER, 1.7); p.poly([[24, gy - 24], [29, gy - 30], [35, gy - 30], [40, gy - 24], [37, gy - 21], [34, gy - 24], [31, gy - 20], [28, gy - 24]], SNOW, 1.2); p.hatch([[35, gy - 24], [48, gy - 14], [62, gy], [35, gy]], 120, 2.2, 0.6); for (let k = 0; k < 4; k++) p.col(BLUES).line([[26 + k * 3, gy - 23], [27 + k * 3, gy - 27]], 0.7).col(INK); });
    add('l-uluru', 60, 26, p => { const gy = 22; p.poly([[2, gy], [6, gy - 9], [14, gy - 13], [44, gy - 13], [54, gy - 9], [58, gy]], '#D9823F', 1.6); for (let i = 0; i < 8; i++) p.line([[10 + i * 6, gy - 12], [9 + i * 6.2, gy]], 0.7); G(p, gy, 60); });
    // simpler bespoke ones
    add('l-dome', 40, 40, p => { const gy = 37; p.rect(6, gy - 12, 28, 12, PAPER, 1.5); p.wins(7, gy - 9, 26, 5, 5); p.rect(13, gy - 17, 14, 5, PAPER, 1.3); p.ell(20, gy - 17, 8, 9, SNOW, 1.6, Math.PI, Math.PI * 2); p.hatch([[20, gy - 26], [28, gy - 17], [20, gy - 17]], 70, 1.8, 0.7); p.line([[20, gy - 26], [20, gy - 31]], 1); G(p, gy, 40); });
    add('l-gate', 40, 34, p => { const gy = 31; p.rect(4, gy - 22, 32, 22, PAPER, 1.6); p.line([[14, gy], [14, gy - 10], [20, gy - 16], [26, gy - 10], [26, gy]], 1.3); for (const cx of [8, 32]) p.rect(cx - 2, gy - 22, 4, 22, PAPER, 1); p.rect(3, gy - 26, 34, 4, PAPER, 1.3); p.flag(20, gy - 26, 0.8); G(p, gy, 40); });
    add('l-aqueduct', 56, 30, p => { const gy = 27; p.rect(2, gy - 24, 52, 3, PAPER, 1.3); for (let i = 0; i < 6; i++) { const x0 = 3 + i * 8.6; p.line([[x0, gy], [x0, gy - 12], [x0 + 4.3, gy - 17], [x0 + 8.6, gy - 12], [x0 + 8.6, gy]], 1.2); p.line([[x0, gy - 17], [x0, gy - 21], [x0 + 4.3, gy - 21.5], [x0 + 8.6, gy - 21]], 0.8); } G(p, gy, 56); });
    add('l-minaret', 20, 50, p => { const gy = 47; p.poly([[5, gy], [7.5, gy - 40], [12.5, gy - 40], [15, gy]], PAPER, 1.5); for (let k = 1; k < 5; k++) p.rect(6 + k * 0.4, gy - k * 9, 8 - k * 0.8, 1.6, PAPER, 0.9); p.ell(10, gy - 42, 3, 3, PAPER, 1.1); G(p, gy, 20); });
    add('l-gopuram', 30, 52, p => { const gy = 49; for (let k = 0; k < 7; k++) { const w = 26 - k * 3; p.rect(15 - w / 2, gy - (k + 1) * 6, w, 6, k % 2 ? '#E8C9A0' : PAPER, 1.1); } p.rect(10, gy - 45, 10, 3, PAPER, 1.1); G(p, gy, 30); });
    add('l-stupa', 34, 40, p => { const gy = 37; p.rect(5, gy - 5, 24, 5, PAPER, 1.3); p.ell(17, gy - 5, 10, 11, '#E3C46B', 1.6, Math.PI, Math.PI * 2); p.poly([[14, gy - 15], [17, gy - 36], [20, gy - 15]], '#E3C46B', 1.3); for (let k = 0; k < 4; k++) p.line([[15 + k * 0.4, gy - 19 - k * 4], [19 - k * 0.4, gy - 19 - k * 4]], 0.7); G(p, gy, 34); });
    add('l-potala', 60, 40, p => { const gy = 37; p.poly([[2, gy], [8, gy - 22], [52, gy - 22], [58, gy]], SNOW, 1.6); p.rect(22, gy - 30, 18, 12, '#B23A2E', 1.4); for (let r = 0; r < 4; r++) p.wins(9 + r * 1.5, gy - 5 - r * 5, 42 - r * 3, 10 - r, 2.5); p.rect(24, gy - 33, 14, 3, '#C9A24A', 1.1); });
    // ---- round 4: more of the world's best-known buildings, each drawn in its own way
    // the Empire State Building redrawn: an Art Deco tower stepping back in setbacks to a mast
    add('l-empire', 28, 72, p => { const gy = 69, cx = 14;
      const tiers = [[11, 0, 14], [9, 14, 30], [7.5, 30, 48], [5.5, 48, 54], [3.6, 54, 58]];
      for (const [hw, y0, y1] of tiers) { p.rect(cx - hw, gy - y1, hw * 2, y1 - y0, SNOW, 1.2); p.hatch([[cx + hw * 0.25, gy - y1], [cx + hw, gy - y1], [cx + hw, gy - y0], [cx + hw * 0.25, gy - y0]], 90, 1.6, 0.6); }
      for (let x0 = cx - 6; x0 <= cx + 6; x0 += 2.4) p.line([[x0, gy - 16], [x0, gy - 46]], 0.4);
      p.poly([[cx - 2.4, gy - 58], [cx - 1.6, gy - 62], [cx + 1.6, gy - 62], [cx + 2.4, gy - 58]], PAPER, 1);
      p.line([[cx, gy - 62], [cx, gy - 71]], 1.3); p.dot(cx, gy - 71, 0.8, RED); G(p, gy, 28); });
    add('l-chrysler', 24, 72, p => { const gy = 69, cx = 12;
      p.rect(cx - 8, gy - 22, 16, 22, SNOW, 1.3); p.rect(cx - 6, gy - 44, 12, 22, SNOW, 1.3); p.hatch([[cx + 1, gy - 44], [cx + 6, gy - 44], [cx + 6, gy], [cx + 1, gy]], 90, 1.6, 0.6);
      // the crown of stacked arches with triangular windows, and the spire
      for (let k = 0; k < 5; k++) { const w = 6 - k * 1.1, y = gy - 44 - k * 4; p.ell(cx, y, w, 4.2, '#D8D2C4', 1, Math.PI, Math.PI * 2); for (let i = -1; i <= 1; i++) p.poly([[cx + i * w * 0.5 - 0.6, y - 0.4], [cx + i * w * 0.5, y - 2.2], [cx + i * w * 0.5 + 0.6, y - 0.4]], '#3A2C20', 0); }
      p.poly([[cx - 1.1, gy - 62], [cx, gy - 71], [cx + 1.1, gy - 62]], '#D8D2C4', 1); G(p, gy, 24); });
    add('l-capitol', 60, 46, p => { const gy = 43;
      p.rect(3, gy - 10, 54, 10, SNOW, 1.4); p.wins(4, gy - 7, 52, 12, 4); p.rect(22, gy - 16, 16, 6, SNOW, 1.3);
      for (let i = 0; i < 6; i++) p.line([[23.5 + i * 2.6, gy - 10], [23.5 + i * 2.6, gy - 16]], 0.7);
      p.poly([[21, gy - 16], [30, gy - 20], [39, gy - 16]], SNOW, 1.2);
      p.rect(24, gy - 25, 12, 5, SNOW, 1.2); for (let i = 0; i < 6; i++) p.line([[25 + i * 2, gy - 20], [25 + i * 2, gy - 25]], 0.6);
      p.ell(30, gy - 25, 7, 8, SNOW, 1.5, Math.PI, Math.PI * 2); p.hatch([[30, gy - 33], [37, gy - 25], [30, gy - 25]], 70, 1.6, 0.6);
      p.rect(28.8, gy - 37, 2.4, 4, SNOW, 1); p.line([[30, gy - 37], [30, gy - 41]], 1); p.dot(30, gy - 42, 0.9); G(p, gy, 60); });
    add('l-taipei101', 26, 72, p => { const gy = 69, cx = 13;
      p.rect(cx - 5, gy - 12, 10, 12, '#B9C9C2', 1.3);
      for (let k = 0; k < 8; k++) { const y = gy - 12 - k * 6; p.poly([[cx - 4, y], [cx - 6, y - 6], [cx + 6, y - 6], [cx + 4, y]], '#B9C9C2', 1.1); }
      p.hatch([[cx + 1, gy - 60], [cx + 6, gy - 60], [cx + 5, gy], [cx + 1, gy]], 90, 1.8, 0.55);
      p.rect(cx - 2.4, gy - 64, 4.8, 4, '#B9C9C2', 1); p.line([[cx, gy - 64], [cx, gy - 71]], 1.2); G(p, gy, 26); });
    add('l-shard', 26, 70, p => { const gy = 67, cx = 13;
      p.poly([[cx - 9, gy], [cx - 1.2, gy - 64], [cx + 0.6, gy - 58], [cx + 9, gy]], '#C7D6DE', 1.4);
      p.poly([[cx + 0.6, gy - 58], [cx + 1.8, gy - 66], [cx + 2.2, gy - 54], [cx + 9, gy]], '#9FB3C0', 1.1);
      for (let y = gy - 6; y > gy - 56; y -= 5) { const t = (gy - y) / 64; p.line([[cx - 9 + t * 7.8, y], [cx + 9 - t * 8.4, y]], 0.4); }
      G(p, gy, 26); });
    add('l-gherkin', 26, 52, p => { const gy = 49, cx = 13; const pts = [];
      for (let i = 0; i <= 30; i++) { const t = i / 30, y = gy - t * 44, r = 8.5 * Math.sin(Math.PI * Math.min(1, 0.18 + t * 0.85)) + (t < 0.1 ? 0 : 0); pts.push([cx - Math.max(r, 0.5), y]); }
      const rhs = pts.map(([x, y]) => [2 * cx - x, y]).reverse(); const sil = pts.concat(rhs);
      p.poly(sil, '#B9CBC4', 1.4);
      p.x.save(); p.x.beginPath(); sil.forEach((q, i) => i ? p.x.lineTo(q[0], q[1]) : p.x.moveTo(q[0], q[1])); p.x.closePath(); p.x.clip();
      p.col('#46594F'); for (let k = -6; k < 10; k++) p.line([[cx - 12 + k * 3, gy], [cx + 4 + k * 3, gy - 46]], 0.9); p.col(INK); p.x.restore();
      p.hatch([[cx + 2, gy - 46], [cx + 10, gy - 30], [cx + 10, gy], [cx + 2, gy]], 90, 2, 0.5); G(p, gy, 26); });
    add('l-arctriomphe', 44, 42, p => { const gy = 39;
      p.rect(5, gy - 30, 34, 30, SNOW, 1.6); p.rect(4, gy - 34, 36, 4, SNOW, 1.3); p.rect(5, gy - 37, 34, 3, SNOW, 1.1);
      p.poly([[15, gy], [15, gy - 13], [16.5, gy - 18], [22, gy - 21], [27.5, gy - 18], [29, gy - 13], [29, gy]], '#3A2C20', 1.2);
      p.rect(7, gy - 26, 6, 8, '#E6DCC6', 0.7); p.rect(31, gy - 26, 6, 8, '#E6DCC6', 0.7);
      p.line([[5, gy - 28], [39, gy - 28]], 0.7); p.hatch([[32, gy - 30], [39, gy - 30], [39, gy], [32, gy]], 90, 1.8, 0.6); p.flag(22, gy - 37, 0.8); G(p, gy, 44); });
    add('l-versailles', 64, 34, p => { const gy = 30;
      p.rect(2, gy - 11, 60, 11, SNOW, 1.4); p.wins(3, gy - 8, 58, 16, 4);
      p.rect(24, gy - 16, 16, 5, SNOW, 1.3); p.poly([[23, gy - 16], [32, gy - 20], [41, gy - 16]], SNOW, 1.1);
      for (const x0 of [2, 52]) p.rect(x0, gy - 14, 10, 3, '#6E7E90', 1.1);
      p.line([[2, gy - 11], [62, gy - 11]], 1.2); for (let i = 0; i < 12; i++) p.dot(4 + i * 5, gy - 12.2, 0.5, '#C9A24A');
      p.poly([[16, gy + 1], [48, gy + 1], [52, gy + 4], [12, gy + 4]], '#E3D7B8', 0.9); G(p, gy + 3, 64); });
    add('l-whitetower', 40, 44, p => { const gy = 41;
      p.poly([[1, gy], [3, gy - 9], [37, gy - 9], [39, gy]], PAPER, 1.3); p.crenels(2, gy - 9, 36, 8);
      p.rect(9, gy - 28, 22, 19, SNOW, 1.6); p.wins(10, gy - 24, 20, 4, 4); p.hatch([[22, gy - 28], [31, gy - 28], [31, gy - 9], [22, gy - 9]], 90, 1.8, 0.6);
      for (const tx of [10, 30]) p.tower(tx, gy - 9, 4.4, 24, 'dome', { win: false, shade: false });
      p.tower(20, gy - 9, 4, 21, 'dome', { win: false, shade: false }); p.flag(20, gy - 32.5, 0.8); G(p, gy, 40); });
    add('l-stpauls', 48, 52, p => { const gy = 49;
      p.rect(3, gy - 13, 42, 13, SNOW, 1.4); p.wins(4, gy - 10, 40, 8, 4);
      for (const tx of [7, 41]) { p.rect(tx - 3, gy - 22, 6, 9, SNOW, 1.2); p.ell(tx, gy - 22, 3, 4, SNOW, 1.1, Math.PI, Math.PI * 2); p.line([[tx, gy - 26], [tx, gy - 28]], 0.9); }
      p.rect(15, gy - 20, 18, 7, SNOW, 1.3); for (let i = 0; i < 7; i++) p.line([[16.5 + i * 2.5, gy - 13], [16.5 + i * 2.5, gy - 20]], 0.6);
      p.ell(24, gy - 20, 9, 11, '#C9D3D8', 1.6, Math.PI, Math.PI * 2); p.hatch([[24, gy - 31], [33, gy - 20], [24, gy - 20]], 70, 1.6, 0.6);
      p.rect(22.4, gy - 36, 3.2, 5, SNOW, 1); p.line([[24, gy - 36], [24, gy - 41]], 1); p.line([[22.6, gy - 39.5], [25.4, gy - 39.5]], 0.8); G(p, gy, 48); });
    add('l-edinburgh', 56, 46, p => { const gy = 43;
      p.poly([[0, gy], [6, gy - 12], [14, gy - 18], [44, gy - 20], [52, gy - 10], [56, gy]], '#B7A98A', 1.5); p.hatch([[30, gy - 20], [44, gy - 20], [52, gy - 10], [56, gy], [30, gy]], 70, 2.2, 0.6);
      p.rect(12, gy - 27, 30, 9, PAPER, 1.4); p.crenels(12, gy - 27, 30, 8); p.wins(13, gy - 24, 28, 7, 3);
      p.tower(18, gy - 27, 6, 10, 'cren', { win: false }); p.tower(36, gy - 27, 5, 7, 'cren', { win: false });
      p.rect(25, gy - 32, 8, 5, PAPER, 1.1); p.poly([[24.5, gy - 32], [29, gy - 36], [33.5, gy - 32]], '#6E7E90', 1);
      p.flag(18, gy - 40, 0.9, '#3D6E9E'); G(p, gy, 56); });
    add('l-alhambra', 60, 40, p => { const gy = 37;
      p.poly([[0, gy], [4, gy - 8], [56, gy - 8], [60, gy]], '#D9B98A', 1.3); p.hatch([[0, gy], [4, gy - 8], [56, gy - 8], [60, gy]], 15, 2.4, 0.5);
      p.rect(4, gy - 16, 52, 8, '#E3B58A', 1.4); p.crenels(4, gy - 16, 52, 12);
      p.tower(12, gy - 8, 9, 18, 'cren', { win: false, fill: '#E3B58A' }); p.tower(46, gy - 8, 8, 14, 'cren', { win: false });
      for (let i = 0; i < 6; i++) { const x0 = 20 + i * 3.6; p.line([[x0, gy - 8], [x0, gy - 12], [x0 + 1.8, gy - 14], [x0 + 3.6, gy - 12], [x0 + 3.6, gy - 8]], 0.7); }
      p.col('#5E8A5A'); for (const tx of [27, 31, 35]) p.line([[tx, gy - 16], [tx, gy - 23]], 1.6); p.col(INK); G(p, gy, 60); });
    add('l-hagiasophia', 58, 46, p => { const gy = 43;
      p.rect(10, gy - 12, 38, 12, '#E4C9A6', 1.4); p.wins(11, gy - 9, 36, 8, 4);
      p.ell(19, gy - 12, 6, 5, '#E4C9A6', 1.2, Math.PI, Math.PI * 2); p.ell(39, gy - 12, 6, 5, '#E4C9A6', 1.2, Math.PI, Math.PI * 2);
      p.rect(21, gy - 17, 16, 5, '#E4C9A6', 1.2); p.ell(29, gy - 17, 10, 9, '#9FB3C0', 1.6, Math.PI, Math.PI * 2); p.hatch([[29, gy - 26], [39, gy - 17], [29, gy - 17]], 70, 1.6, 0.6);
      for (let i = 0; i < 7; i++) p.dot(21.5 + i * 2.5, gy - 18.5, 0.45);
      p.line([[29, gy - 26], [29, gy - 30]], 0.9);
      for (const mx of [4, 54]) { p.poly([[mx - 1.6, gy], [mx - 1.2, gy - 30], [mx + 1.2, gy - 30], [mx + 1.6, gy]], SNOW, 1.1); p.poly([[mx - 1.3, gy - 30], [mx, gy - 37], [mx + 1.3, gy - 30]], '#6E7E90', 0.9); p.line([[mx - 2, gy - 22], [mx + 2, gy - 22]], 0.8); }
      G(p, gy, 58); });
    add('l-bluemosque', 60, 48, p => { const gy = 45;
      p.rect(9, gy - 10, 42, 10, SNOW, 1.4); p.wins(10, gy - 7, 40, 9, 3.5);
      for (const [dx, r] of [[16, 4], [44, 4], [22, 5], [38, 5]]) p.ell(dx, gy - 10, r, r * 0.9, '#8FA6BA', 1.1, Math.PI, Math.PI * 2);
      p.rect(23, gy - 15, 14, 5, SNOW, 1.1); p.ell(30, gy - 15, 8, 8, '#8FA6BA', 1.5, Math.PI, Math.PI * 2); p.line([[30, gy - 23], [30, gy - 27]], 0.9);
      for (const mx of [3, 8, 52, 57]) { p.poly([[mx - 1.1, gy], [mx - 0.8, gy - 34], [mx + 0.8, gy - 34], [mx + 1.1, gy]], SNOW, 0.9); p.poly([[mx - 0.9, gy - 34], [mx, gy - 40], [mx + 0.9, gy - 34]], '#6E7E90', 0.8); for (const yy of [16, 26]) p.line([[mx - 1.6, gy - yy], [mx + 1.6, gy - yy]], 0.6); }
      G(p, gy, 60); });
    add('l-cologne', 40, 70, p => { const gy = 67;
      p.rect(7, gy - 18, 26, 18, '#B9AE9C', 1.5); p.ell(20, gy - 10, 3.6, 4.4, '#3A2C20', 0.8);
      for (const tx of [11, 29]) { p.rect(tx - 4, gy - 46, 8, 46, '#B9AE9C', 1.4); p.wins(tx - 3, gy - 40, 6, 2, 7); p.poly([[tx - 4, gy - 46], [tx, gy - 66], [tx + 4, gy - 46]], '#A39883', 1.3); for (let y = gy - 50; y > gy - 64; y -= 3) p.line([[tx - 1.2, y], [tx + 1.2, y]], 0.5); p.dot(tx, gy - 66, 0.8); }
      p.hatch([[24, gy - 46], [33, gy - 46], [33, gy], [24, gy]], 90, 1.6, 0.55); G(p, gy, 40); });
    add('l-budaparl', 64, 42, p => { const gy = 37;
      p.rect(2, gy - 11, 60, 11, SNOW, 1.4); p.wins(3, gy - 8, 58, 18, 4);
      for (let i = 0; i < 9; i++) { const tx = 5 + i * 6.8; p.line([[tx, gy - 11], [tx, gy - 15]], 0.8); p.poly([[tx - 0.8, gy - 15], [tx, gy - 18], [tx + 0.8, gy - 15]], SNOW, 0.6); }
      p.rect(25, gy - 18, 14, 7, SNOW, 1.2); p.ell(32, gy - 18, 7, 9, '#B23A2E', 1.5, Math.PI, Math.PI * 2); p.poly([[30.4, gy - 26], [32, gy - 33], [33.6, gy - 26]], SNOW, 1); p.line([[32, gy - 33], [32, gy - 36]], 0.8);
      p.col(BLUE).line([[0, gy + 2], [64, gy + 2]], 1).line([[6, gy + 4], [58, gy + 4]], 0.8).col(INK); });
    add('l-atomium', 40, 52, p => { const gy = 49, cx = 20, cy = gy - 26, R = 13;
      const S = [[0, 0], [R, -R * 0.8], [-R, -R * 0.8], [R, R * 0.8], [-R, R * 0.8], [0, -R * 1.5], [0, R * 1.2]];
      for (const [x, y] of S.slice(1)) p.line([[cx, cy], [cx + x, cy + y]], 1.6);
      p.line([[cx - R, cy - R * 0.8], [cx + R, cy - R * 0.8]], 1.1); p.line([[cx - R, cy + R * 0.8], [cx + R, cy + R * 0.8]], 1.1);
      p.line([[cx - R, cy + R * 0.8], [cx - R - 2, gy]], 1.2); p.line([[cx + R, cy + R * 0.8], [cx + R + 2, gy]], 1.2); p.line([[cx, cy + R * 1.2], [cx, gy]], 1.2);
      for (const [x, y] of S) { p.ell(cx + x, cy + y, 3.3, 3.3, '#C9D3DA', 1.2); p.ell(cx + x + 1, cy + y + 1, 1.6, 1.6, '#9FB3C0', 0); }
      G(p, gy, 40); });
    add('l-pearltower', 30, 72, p => { const gy = 69, cx = 15;
      for (const dx of [-7, 0, 7]) p.line([[cx + dx, gy], [cx + dx * 0.25, gy - 16]], 1.3);
      p.ell(cx, gy - 18, 6, 6, '#C25A6E', 1.4); p.ell(cx - 1.6, gy - 19.6, 2, 2, '#E79AAA', 0);
      p.rect(cx - 1.4, gy - 46, 2.8, 22, SNOW, 1.1); p.ell(cx, gy - 47, 4, 4, '#C25A6E', 1.3); p.ell(cx, gy - 54, 1.8, 1.8, '#C25A6E', 1);
      p.line([[cx, gy - 51], [cx, gy - 71]], 1.1); for (const yy of [33, 39]) p.ell(cx, gy - yy, 1.6, 1.6, '#C25A6E', 0.8);
      p.col(BLUE).line([[0, gy + 2], [30, gy + 2]], 1).col(INK); });
    add('l-skytree', 24, 74, p => { const gy = 71, cx = 12;
      p.poly([[cx - 7, gy], [cx - 2.2, gy - 40], [cx - 1.8, gy - 58], [cx + 1.8, gy - 58], [cx + 2.2, gy - 40], [cx + 7, gy]], '#DCE3E8', 1.3);
      for (let y = gy - 4; y > gy - 56; y -= 4) { const t = (gy - y) / 58, w = 7 - t * 5; p.line([[cx - w, y], [cx + w, y - 4]], 0.4); p.line([[cx + w, y], [cx - w, y - 4]], 0.4); }
      p.rect(cx - 3.6, gy - 37, 7.2, 3, '#DCE3E8', 1.1); p.rect(cx - 2.8, gy - 50, 5.6, 2.4, '#DCE3E8', 1);
      p.line([[cx, gy - 58], [cx, gy - 73]], 1.1); G(p, gy, 24); });
    add('l-templeheaven', 44, 50, p => { const gy = 47, cx = 22;
      for (let k = 0; k < 3; k++) p.rect(cx - 20 + k * 3, gy - 3 - k * 3, 40 - k * 6, 3, SNOW, 1.1);
      p.rect(cx - 10, gy - 17, 20, 8, '#B23A2E', 1.3); for (let i = 0; i < 5; i++) p.line([[cx - 8 + i * 4, gy - 9], [cx - 8 + i * 4, gy - 17]], 0.6);
      for (const [w, y, h] of [[15, 17, 5], [11, 24, 5], [7, 31, 5]]) { p.poly([[cx - w, gy - y], [cx - w * 0.6, gy - y - h], [cx + w * 0.6, gy - y - h], [cx + w, gy - y]], '#3D5E9E', 1.2); if (y > 17) p.rect(cx - w * 0.6, gy - y + 0.5, w * 1.2, 2.5, '#B23A2E', 0.8); }
      p.ell(cx, gy - 37, 2, 2, '#C9A24A', 1); G(p, gy, 44); });
    add('l-kinkakuji', 44, 40, p => { const gy = 34, cx = 22, GOLD = '#D7AE45';
      p.rect(cx - 13, gy - 8, 26, 8, '#E9DCC0', 1.3); p.wins(cx - 12, gy - 6, 24, 6, 4);
      p.poly([[cx - 16, gy - 8], [cx - 11, gy - 12], [cx + 11, gy - 12], [cx + 16, gy - 8]], '#5A4636', 1.2);
      p.rect(cx - 10, gy - 19, 20, 7, GOLD, 1.3); p.poly([[cx - 13, gy - 19], [cx - 8, gy - 23], [cx + 8, gy - 23], [cx + 13, gy - 19]], '#5A4636', 1.2);
      p.rect(cx - 6, gy - 28, 12, 5, GOLD, 1.2); p.poly([[cx - 9, gy - 28], [cx - 3, gy - 33], [cx + 3, gy - 33], [cx + 9, gy - 28]], '#5A4636', 1.1); p.poly([[cx - 1, gy - 33], [cx, gy - 36], [cx + 1, gy - 33]], GOLD, 0.8);
      p.col(BLUE).line([[2, gy + 2], [42, gy + 2]], 1).line([[8, gy + 4], [36, gy + 4]], 0.8).col(GOLD).line([[cx - 8, gy + 3], [cx + 8, gy + 3]], 0.8).col(INK); });
    add('l-abusimbel', 60, 36, p => { const gy = 33;
      p.poly([[0, gy], [4, gy - 28], [56, gy - 28], [60, gy]], '#E1BD86', 1.5); p.hatch([[46, gy - 28], [56, gy - 28], [60, gy], [46, gy]], 70, 2, 0.6);
      for (let i = 0; i < 4; i++) { const x0 = 8 + i * 12.5 - (i > 1 ? -3 : 0); p.rect(x0, gy - 13, 8, 13, '#D3AB72', 1.1); p.ell(x0 + 4, gy - 17, 3, 4, '#D3AB72', 1.1); p.poly([[x0 + 0.6, gy - 19], [x0 + 4, gy - 23], [x0 + 7.4, gy - 19]], '#D3AB72', 1); }
      p.rect(27, gy - 11, 6, 11, '#3A2C20', 0.9); G(p, gy, 60); });
    add('l-harbourbridge', 66, 38, p => { const gy = 32;
      const arch = []; for (let i = 0; i <= 30; i++) { const t = i / 30; arch.push([12 + t * 42, gy - 4 - Math.sin(t * Math.PI) * 22]); }
      const arch2 = arch.map(([x, y], i) => [x, y + 3 + Math.sin(i / 30 * Math.PI) * 1.5]);
      p.line(arch, 1.8); p.line(arch2, 1.2); for (let i = 1; i < 30; i += 2) p.line([arch[i], arch2[i]], 0.5);
      for (let i = 2; i < 29; i += 3) p.line([arch2[i], [arch2[i][0], gy - 9]], 0.5);
      for (const px of [8, 58]) { p.rect(px - 3, gy - 17, 6, 17, '#D6CBB4', 1.3); p.rect(px - 3.6, gy - 19, 7.2, 2, '#D6CBB4', 1); }
      p.line([[0, gy - 9], [66, gy - 9]], 1.6);
      p.col(BLUE).line([[0, gy + 2], [66, gy + 2]], 1).line([[8, gy + 4], [58, gy + 4]], 0.8).col(INK); });
    add('l-japancastle', 44, 50, p => { const gy = 47; p.poly([[4, gy], [8, gy - 12], [36, gy - 12], [40, gy]], PAPER, 1.5); p.hatch([[4, gy], [8, gy - 12], [36, gy - 12], [40, gy]], 0, 2.4, 0.6); for (let k = 0; k < 4; k++) { const w = 28 - k * 5, y = gy - 12 - k * 8; p.rect(22 - w / 2 + 2, y - 6, w - 4, 6, SNOW, 1.2); p.poly([[22 - w / 2 - 1, y - 6], [22 - w / 2 + 3, y - 9], [22 + w / 2 - 3, y - 9], [22 + w / 2 + 1, y - 6]], '#4A5560', 1.2); } });
    add('l-torii', 40, 36, p => { const gy = 31; const c = '#B23A2E'; p.rect(9, gy - 22, 3, 22, c, 1.2); p.rect(28, gy - 22, 3, 22, c, 1.2); p.poly([[3, gy - 25], [20, gy - 27], [37, gy - 25], [38, gy - 28], [20, gy - 30], [2, gy - 28]], c, 1.2); p.rect(6, gy - 20, 28, 2.5, c, 1); p.col(BLUE).line([[0, gy + 2], [40, gy + 2]], 1).line([[5, gy + 4], [35, gy + 4]], 0.8).col(INK); });
    add('l-buddha', 34, 42, p => { const gy = 39; p.poly([[0, gy], [0, 3], [34, 3], [34, gy]], '#E8C9A0', 1.2); p.hatch([[0, gy], [0, 3], [34, 3], [34, gy]], 75, 2.8, 0.5); p.ell(17, 13, 6, 7, PAPER, 1.4); p.poly([[6, gy], [8, 22], [17, 19], [26, 22], [28, gy]], PAPER, 1.4); p.line([[14, 13], [16, 13]], 0.7); p.line([[18, 13], [20, 13]], 0.7); });
    add('l-warriors', 50, 30, p => { const gy = 27; for (let r = 0; r < 2; r++) for (let i = 0; i < 6; i++) { const cx = 5 + i * 8 + r * 4, y = gy - r * 9; p.ell(cx, y - 13, 1.8, 2, PAPER, 0.9); p.poly([[cx - 2.4, y], [cx - 2.6, y - 11], [cx + 2.6, y - 11], [cx + 2.4, y]], PAPER, 1); } });
    add('l-mesoamerica', 46, 40, p => { const gy = 37; for (let k = 0; k < 4; k++) { const w = 40 - k * 8; p.rect(23 - w / 2, gy - (k + 1) * 6, w, 6, PAPER, 1.3); } p.rect(17, gy - 32, 12, 8, PAPER, 1.4); p.line([[21, gy], [22, gy - 24]], 0.8); p.line([[25, gy], [24, gy - 24]], 0.8); G(p, gy, 46); });
    // round 7: the great sites of Mesoamerica and the Andes, each drawn in its own way (original drawings, simplified as an
    // engraver might). Stepped pyramids are built tier by tier with sloping (talud) faces, the stairway on the front, the side
    // away from the light hatched; jungle crowns where the site rises from the forest
    const MGRN = '#8FA66C', ADOBE = '#D9B07A', STONE = '#E4D2AE';
    // n tiers from base width wb to top width wt, th high each, centred on cx; returns the y of the top
    const tiers = (p, cx, gy, wb, wt, n, th, inset, fill) => {
      inset = inset === undefined ? 1.2 : inset;
      for (let k = 0; k < n; k++) { const w = wb - (wb - wt) * k / Math.max(1, n - 1), y = gy - k * th; p.poly([[cx - w / 2, y], [cx - w / 2 + inset, y - th], [cx + w / 2 - inset, y - th], [cx + w / 2, y]], fill || PAPER, 1.1); }
      const top = gy - n * th;
      p.hatch([[cx + wt * 0.18, top], [cx + wt / 2, top], [cx + wb / 2, gy], [cx + wb * 0.3, gy]], 100, 1.9, 0.6);
      return top;
    };
    // a stairway up the front, from bottom width wb to top width wt
    const stair = (p, cx, gy, top, wb, wt) => {
      p.poly([[cx - wb / 2, gy], [cx - wt / 2, top], [cx + wt / 2, top], [cx + wb / 2, gy]], PAPER, 1.1);
      for (let y = gy - 2; y > top + 0.8; y -= 2) { const f = (gy - y) / (gy - top), hw = (wb + (wt - wb) * f) / 2; p.line([[cx - hw + 0.4, y], [cx + hw - 0.4, y]], 0.5); }
    };
    // a small temple house on a platform top, with doorways
    const shrine = (p, cx, top, w, h, doors, fill, roof) => {
      p.rect(cx - w / 2, top - h, w, h, fill || PAPER, 1.3);
      for (let i = 0; i < doors; i++) { const dx = cx - w / 2 + (i + 0.5) * w / doors; p.rect(dx - 0.9, top - h * 0.62, 1.8, h * 0.62, INK, 0); }
      if (roof) p.poly([[cx - w / 2 - 1, top - h], [cx - w / 2 + 1.5, top - h - roof], [cx + w / 2 - 1.5, top - h - roof], [cx + w / 2 + 1, top - h]], fill || PAPER, 1.2);
    };
    const crowns = (p, xs, gy, r) => { for (const [cx, s] of xs) { const rr = r * s; p.ell(cx, gy - rr * 0.8, rr, rr * 0.8, MGRN, 1); p.line([[cx - rr * 0.3, gy - rr * 0.9], [cx + rr * 0.2, gy - rr * 1.2]], 0.5); } };
    // Teotihuacan: the Pyramid of the Sun, and the Pyramid of the Moon beyond it up the Avenue of the Dead
    add('l-teotihuacan', 66, 40, p => { const gy = 37;
      const tm = tiers(p, 14, gy - 3, 22, 7, 4, 4.4, 1.2, STONE); stair(p, 14, gy - 3, tm, 4, 2.5);
      p.line([[20, gy - 1.5], [27, gy - 1.5]], 0.8); p.line([[18, gy - 0.5], [27, gy - 0.5]], 0.6);
      const ts = tiers(p, 44, gy, 40, 10, 5, 5.4, 1.5, STONE); stair(p, 44, gy, ts, 6, 3.5); p.rect(39, ts - 1.4, 10, 1.4, STONE, 0.9);
      G(p, gy, 66); });
    // Chichen Itza: El Castillo, nine terraces, the stairway with its feathered serpents' heads at the foot, the temple above
    add('l-chichen', 54, 44, p => { const gy = 41; const top = tiers(p, 27, gy, 46, 17, 9, 3, 0.9); stair(p, 27, gy, top, 10, 7);
      for (const sx of [21.5, 32.5]) { p.ell(sx, gy - 1.3, 2, 1.3, PAPER, 0.9); p.dot(sx + (sx < 27 ? -1 : 1), gy - 1.6, 0.4); }
      shrine(p, 27, top, 14, 7, 3, PAPER, 2); p.rect(18.5, top - 10.6, 17, 1.4, PAPER, 0.9); G(p, gy, 54); });
    // Tikal: Temple I, steep and narrow, its temple crowned by a tall roof comb, rising out of the forest
    add('l-tikal', 42, 64, p => { const gy = 61; const top = tiers(p, 21, gy, 28, 13, 9, 3.8, 0.7); stair(p, 21, gy, top, 6, 5);
      shrine(p, 21, top, 11, 8, 1); p.rect(16.5, top - 20, 9, 12, PAPER, 1.3); for (let y = top - 18; y < top - 9; y += 3) p.line([[17.5, y], [24.5, y]], 0.5); p.ell(21, top - 15, 1.8, 1.6, PAPER, 0.7);
      crowns(p, [[3, 1], [8, 0.8], [35, 0.9], [40, 1.05]], gy, 5); G(p, gy, 42); });
    // Palenque: the Temple of the Inscriptions (five doorways under a mansard roof) and the palace with its four-storey tower
    add('l-palenque', 62, 46, p => { const gy = 43;
      p.rect(2, gy - 7, 28, 7, STONE, 1.2); p.rect(4, gy - 13, 24, 6, PAPER, 1.2); for (let i = 0; i < 6; i++) p.rect(5.5 + i * 3.8, gy - 12, 1.6, 4.6, INK, 0);
      p.poly([[3.5, gy - 13], [6, gy - 16], [26, gy - 16], [28.5, gy - 13]], PAPER, 1.1);
      for (let k = 0; k < 4; k++) p.rect(13 - (5 - k * 0.6) / 2 + 2.5, gy - 16 - (k + 1) * 4.4, 5 - k * 0.6, 4.4, PAPER, 1.1); p.poly([[15, gy - 33.6], [15.5, gy - 35.5], [16.4, gy - 35.5], [16.9, gy - 33.6]], PAPER, 1);
      const top = tiers(p, 46, gy, 28, 15, 8, 2.9, 0.7); stair(p, 46, gy, top, 6, 5); shrine(p, 46, top, 16, 6, 5, PAPER, 3.4); p.rect(43.5, top - 12, 5, 2.6, PAPER, 0.9);
      crowns(p, [[59, 0.8]], gy, 5); G(p, gy, 62); });
    // Uxmal: the Pyramid of the Magician, oval in plan, so its ends round off; a steep stair and the temple at the top
    add('l-uxmal', 48, 50, p => { const gy = 47, h = 36, cx = 24; const L = [], Rr = [];
      for (let i = 0; i <= 12; i++) { const t = i / 12, y = gy - t * h, hw = 18 - 7 * t - 2.2 * Math.sin(Math.PI * t); L.push([cx - hw, y]); Rr.unshift([cx + hw, y]); }
      p.poly(L.concat(Rr), STONE, 1.5); p.hatch([[cx + 4, gy - h], [cx + 11, gy - h], [cx + 18, gy], [cx + 8, gy]], 100, 1.9, 0.6);
      for (let k = 1; k < 6; k++) { const t = k / 6, y = gy - t * h, hw = 18 - 7 * t - 2.2 * Math.sin(Math.PI * t); p.line([[cx - hw + 1, y], [cx - 4, y]], 0.5); p.line([[cx + 4, y], [cx + hw - 1, y]], 0.5); }
      stair(p, cx, gy, gy - h, 8, 5); shrine(p, cx, gy - h, 13, 6, 1, PAPER); p.rect(cx - 7, gy - h - 7.2, 14, 1.2, PAPER, 0.9); G(p, gy, 48); });
    // Monte Albán: the levelled mountain top above the valley of Oaxaca, platforms round its great plaza
    add('l-montealban', 66, 36, p => { const gy = 33;
      p.poly([[0, gy], [8, gy - 8], [14, gy - 13], [52, gy - 13], [58, gy - 8], [66, gy]], PAPER, 1.5); p.hatch([[40, gy - 13], [52, gy - 13], [58, gy - 8], [66, gy], [36, gy]], 110, 2.2, 0.6); for (let i = 0; i < 6; i++) p.line([[6 + i * 10, gy - 1], [9 + i * 10, gy - 5]], 0.5);
      const t1 = tiers(p, 20, gy - 13, 12, 6, 3, 3, 0.8, STONE); stair(p, 20, gy - 13, t1, 3, 2);
      const t2 = tiers(p, 46, gy - 13, 11, 5, 3, 3.3, 0.8, STONE); stair(p, 46, gy - 13, t2, 3, 2); shrine(p, 46, t2, 5, 3, 1);
      p.rect(29, gy - 17, 8, 4, STONE, 1.1); p.rect(31, gy - 20, 4, 3, STONE, 1); });
    // Templo Mayor, Tenochtitlan (Mexico City): one pyramid with twin stairways and twin shrines, Tlaloc's blue and white,
    // Huitzilopochtli's red
    add('l-templomayor', 56, 46, p => { const gy = 43; const top = tiers(p, 28, gy, 50, 32, 4, 5.6, 1.4); stair(p, 21, gy, top, 9, 7); stair(p, 35, gy, top, 9, 7);
      p.line([[28, gy], [28, top]], 1);
      p.rect(15, top - 9, 12, 9, '#9DB4C8', 1.3); for (let y = top - 7; y < top; y += 2.4) p.line([[15, y], [27, y]], 0.6); p.rect(19.6, top - 5, 2.8, 5, INK, 0); for (let i = 0; i < 4; i++) p.ell(16.5 + i * 3, top - 10.4, 1.3, 1.3, SNOW, 0.8);
      p.rect(29, top - 9, 12, 9, RED, 1.3); p.rect(33.6, top - 5, 2.8, 5, INK, 0); for (let i = 0; i < 4; i++) p.poly([[29.2 + i * 3, top - 9], [30.7 + i * 3, top - 12], [32.2 + i * 3, top - 9]], SNOW, 0.8);
      G(p, gy, 56); });
    // Copán: the Hieroglyphic Stairway, every riser carved with glyphs, and a carved stela before it
    add('l-copan', 54, 44, p => { const gy = 41; const top = tiers(p, 30, gy, 44, 22, 5, 5.6, 1.2, STONE);
      p.poly([[22, gy], [25, top], [35, top], [38, gy]], PAPER, 1.2);
      for (let y = gy - 2.4, r = 0; y > top + 1; y -= 2.4, r++) { const f = (gy - y) / (gy - top), x0 = 22 + 3 * f, x1 = 38 - 3 * f; p.line([[x0, y], [x1, y]], 0.5); for (let x = x0 + 1 + (r % 2); x < x1 - 1; x += 2.2) p.rect(x, y + 0.5, 1, 1.2, INK, 0); }
      shrine(p, 30, top, 10, 5, 1, STONE);
      p.rect(5, gy - 19, 6, 19, STONE, 1.3); p.ell(8, gy - 15, 1.8, 2, PAPER, 0.8); for (let y = gy - 11; y < gy - 1; y += 2.5) p.line([[6, y], [10, y]], 0.5); p.poly([[4.4, gy - 19], [8, gy - 21.5], [11.6, gy - 19]], STONE, 1);
      p.ell(15, gy - 1.5, 3, 1.6, STONE, 1); G(p, gy, 54); });
    // Calakmul: Structure II, one of the largest Maya pyramids, a vast stepped mass rising out of the forest
    add('l-calakmul', 64, 44, p => { const gy = 41; const top = tiers(p, 32, gy, 58, 22, 6, 4.6, 1.5, STONE); stair(p, 32, gy, top, 10, 6); shrine(p, 32, top, 9, 5, 1, STONE);
      crowns(p, [[3, 1.1], [9, 0.9], [15, 0.8], [49, 0.85], [55, 1], [61, 1.1]], gy, 5); G(p, gy, 64); });
    // Caral: the oldest city of the Americas, its great platform mound and the sunken round plaza before it
    add('l-caral', 64, 34, p => { const gy = 31; const top = tiers(p, 42, gy, 40, 22, 4, 4.4, 1.6, '#E8C9A0'); stair(p, 42, gy, top, 6, 4);
      p.ell(13, gy - 3, 11, 3.4, '#E8C9A0', 1.3); p.ell(13, gy - 3, 7, 2.1, '#D3AB72', 1); for (let a = 0; a < 6; a++) { const t = Math.PI * (0.15 + a * 0.14); p.line([[13 + Math.cos(t) * 7, gy - 3 - Math.sin(t) * 2.1], [13 + Math.cos(t) * 11, gy - 3 - Math.sin(t) * 3.4]], 0.5); }
      G(p, gy, 64); });
    // Chan Chan: the great adobe city of the Chimú, tall walls with friezes worked like fishing nets
    add('l-chanchan', 64, 34, p => { const gy = 31;
      p.rect(4, gy - 20, 56, 13, ADOBE, 1.4); p.x.save(); p.x.beginPath(); p.x.rect(5, gy - 18, 54, 6); p.x.clip(); for (let x = 3; x < 62; x += 3) { p.line([[x, gy - 18], [x + 6, gy - 12]], 0.5); p.line([[x + 6, gy - 18], [x, gy - 12]], 0.5); } p.x.restore(); p.line([[5, gy - 18], [59, gy - 18]], 0.7); p.line([[5, gy - 12], [59, gy - 12]], 0.7);
      p.rect(0, gy - 8, 64, 8, ADOBE, 1.4); for (let i = 0; i < 8; i++) p.rect(3 + i * 8, gy - 6, 4, 2, '#C98E5A', 0.6);
      p.rect(24, gy - 5, 5, 5, INK, 0); p.hatch([[44, gy - 20], [60, gy - 20], [60, gy - 8], [44, gy - 8]], 80, 2.2, 0.5); G(p, gy, 64); });
    // Tiwanaku: the Gateway of the Sun, a single carved block with its frieze and the figure at the centre, the Akapana behind
    add('l-tiwanaku', 56, 40, p => { const gy = 37;
      tiers(p, 40, gy - 4, 30, 18, 3, 3.4, 1, '#C9B89A');
      p.rect(8, gy - 22, 28, 22, '#BFB4A2', 1.5); p.rect(18.5, gy - 13, 7, 13, '#3A2C20', 1);
      p.rect(9.5, gy - 21, 25, 6, '#BFB4A2', 0.8); for (let r = 0; r < 2; r++) for (let i = 0; i < 8; i++) if (i < 3 || i > 4) p.rect(10.4 + i * 3, gy - 20.4 + r * 2.8, 2, 2, '#BFB4A2', 0.6);
      p.rect(19.8, gy - 21, 4.4, 5.6, '#BFB4A2', 0.9); for (let a = 0; a < 7; a++) { const t = Math.PI * (1 + a / 6); p.line([[22 + Math.cos(t) * 2.2, gy - 19 + Math.sin(t) * 1.8], [22 + Math.cos(t) * 3.4, gy - 19 + Math.sin(t) * 2.8]], 0.5); }
      p.hatch([[29, gy - 22], [36, gy - 22], [36, gy], [29, gy]], 80, 2, 0.6); G(p, gy, 56); });
    // Sacsayhuamán above Cusco: three terraces of zigzag walls built of great fitted polygonal stones
    add('l-sacsayhuaman', 64, 36, p => { const gy = 33;
      for (let k = 2; k >= 0; k--) { const yb = gy - k * 8, yt = yb - 9, x0 = 2 + k * 5, x1 = 62 - k * 5, n = 4 + (2 - k);
        const top = []; for (let i = 0; i <= n * 2; i++) { const x = x0 + (x1 - x0) * i / (n * 2); top.push([x, yt + (i % 2 ? 2.4 : 0)]); }
        p.poly(top.concat([[x1, yb], [x0, yb]]), '#D6CBB4', 1.3);
        const R = p.R; for (let s = 0; s < (x1 - x0) / 4.2; s++) { const sx = x0 + 2 + s * 4.2 + (R() - 0.5) * 1.6; p.line([[sx, yt + 2.6], [sx + (R() - 0.5) * 2, yt + 5], [sx + (R() - 0.5) * 1.5, yb - 0.3]], 0.6); if (R() < 0.6) p.line([[sx - 2, yt + 4.5 + R() * 2.5], [sx + 2, yt + 5 + R() * 2.5]], 0.5); }
        p.hatch(top.slice(n).concat([[x1, yb], [x0 + (x1 - x0) / 2, yb]]), 100, 2.2, 0.5); }
      G(p, gy, 64); });
    add('l-djenne', 52, 36, p => { const gy = 33; p.rect(4, gy - 16, 44, 16, '#D9B07A', 1.5); for (const tx of [10, 26, 42]) { p.poly([[tx - 4, gy - 16], [tx - 3, gy - 26], [tx, gy - 30], [tx + 3, gy - 26], [tx + 4, gy - 16]], '#D9B07A', 1.4); for (let y = gy - 18; y > gy - 28; y -= 3) p.line([[tx - 5, y], [tx + 5, y]], 0.8); } G(p, gy, 52); });
    add('l-tablemountain', 64, 30, p => { const gy = 27; p.poly([[2, gy], [10, gy - 10], [14, gy - 18], [50, gy - 18], [54, gy - 10], [62, gy]], PAPER, 1.6); p.hatch([[14, gy - 18], [50, gy - 18], [54, gy - 10], [62, gy], [2, gy], [10, gy - 10]], 90, 2.6, 0.6); p.poly([[12, gy - 18], [20, gy - 24], [44, gy - 24], [52, gy - 18]], SNOW, 1, 0); p.col(BLUE).line([[0, gy + 2], [64, gy + 2]], 1).col(INK); });
    add('l-causeway', 40, 24, p => { for (let r = 0; r < 2; r++) for (let i = 0; i < 6; i++) { const cx = 4 + i * 6 + r * 3, cy = 10 + r * 6, rr = 3; const pts = []; for (let k = 0; k < 6; k++) pts.push([cx + Math.cos(k * Math.PI / 3) * rr, cy + Math.sin(k * Math.PI / 3) * rr * 0.6]); p.poly(pts, PAPER, 1.1); } p.col(BLUE).line([[0, 21], [40, 21]], 1).col(INK); });
    add('l-rushmore', 50, 34, p => { const gy = 31; p.poly([[0, gy], [3, gy - 20], [12, gy - 28], [38, gy - 28], [47, gy - 18], [50, gy]], '#E0D2B4', 1.5); for (let i = 0; i < 4; i++) { p.ell(11 + i * 9.5, gy - 16, 3.4, 5, PAPER, 1.2); p.line([[10 + i * 9.5, gy - 16], [12 + i * 9.5, gy - 16]], 0.6); } });
    add('l-needle', 30, 64, p => { const gy = 61; p.line([[10, gy], [14, gy - 42]], 1.4); p.line([[20, gy], [16, gy - 42]], 1.4); p.line([[12, gy - 22], [18, gy - 22]], 1); p.ell(15, gy - 44, 10, 3, PAPER, 1.4); p.poly([[11, gy - 46], [15, gy - 49], [19, gy - 46]], PAPER, 1.1); p.line([[15, gy - 49], [15, gy - 60]], 1.1); G(p, gy, 30); });
    add('l-arch', 50, 50, p => { const gy = 47; const pts = []; for (let i = 0; i <= 24; i++) { const t = i / 24 * Math.PI; pts.push([25 - Math.cos(t) * 20, gy - Math.sin(t) * 42]); } p.line(pts, 2.6); const pts2 = []; for (let i = 0; i <= 24; i++) { const t = i / 24 * Math.PI; pts2.push([25 - Math.cos(t) * 17, gy - Math.sin(t) * 37]); } p.line(pts2, 0.9); G(p, gy, 50); });
    add('l-waterfall_big', 48, 40, p => { const gy = 36; p.poly([[0, 8], [18, 6], [20, gy], [0, gy]], PAPER, 1.4); p.hatch([[0, 8], [18, 6], [20, gy], [0, gy]], 70, 2.2, 0.7); p.poly([[48, 8], [30, 6], [28, gy], [48, gy]], PAPER, 1.4); p.hatch([[48, 8], [30, 6], [28, gy], [48, gy]], 110, 2.2, 0.7); p.col(BLUE); for (let i = 0; i < 6; i++) p.line([[19.5 + i * 1.7, 7], [20 + i * 1.6, gy - 3]], 1); for (let k = 0; k < 3; k++) p.ell(24, gy - 1, 5 + k * 3, 1.5 + k * 0.6, null, 0.8); p.col(INK); });
    add('l-chimneys', 44, 36, p => { const gy = 33; for (const [cx, h] of [[8, 22], [17, 28], [27, 20], [36, 25]]) { p.poly([[cx - 4, gy], [cx - 2.8, gy - h], [cx - 3.6, gy - h - 2], [cx, gy - h - 4.5], [cx + 3.6, gy - h - 2], [cx + 2.8, gy - h], [cx + 4, gy]], PAPER, 1.4); p.hatch([[cx, gy - h], [cx + 4, gy], [cx, gy]], 80, 1.8, 0.6); } G(p, gy, 44); });
    add('l-stavechurch', 34, 50, p => { const gy = 47; for (let k = 0; k < 4; k++) { const w = 28 - k * 6, y = gy - k * 9; p.rect(17 - w / 2 + 2, y - 7, w - 4, 7, '#7A5232', 1.1); p.poly([[17 - w / 2 - 1, y - 7], [17, y - 13], [17 + w / 2 + 1, y - 7]], '#4A3423', 1.1); } p.line([[17, gy - 40], [17, gy - 47]], 1.1); });
    add('l-karst', 50, 34, p => { const gy = 30; for (const [cx, w, h] of [[8, 8, 18], [19, 10, 26], [31, 9, 20], [42, 8, 14]]) { p.poly([[cx - w / 2, gy], [cx - w / 2 + 1, gy - h + 4], [cx, gy - h], [cx + w / 2 - 1, gy - h + 4], [cx + w / 2, gy]], PAPER, 1.5); p.hatch([[cx, gy - h], [cx + w / 2 - 1, gy - h + 4], [cx + w / 2, gy], [cx, gy]], 80, 1.8, 0.7); } p.col(BLUE).line([[0, gy + 2], [50, gy + 2]], 1).line([[6, gy + 4], [44, gy + 4]], 0.8).col(INK); });
    add('l-stacks', 44, 30, p => { const gy = 26; p.poly([[0, gy], [0, 6], [8, 4], [10, gy]], PAPER, 1.4); for (const [cx, h] of [[18, 16], [27, 20], [36, 13]]) { p.poly([[cx - 3.5, gy], [cx - 2.6, gy - h], [cx + 2.6, gy - h - 1], [cx + 3.5, gy]], PAPER, 1.4); p.hatch([[cx, gy - h], [cx + 3.5, gy], [cx, gy]], 80, 1.8, 0.7); } p.col(BLUE).line([[0, gy + 2], [44, gy + 2]], 1).col(INK); });
    add('l-rock', 40, 32, p => { const gy = 29; p.poly([[6, gy], [9, gy - 18], [14, gy - 24], [26, gy - 24], [31, gy - 16], [34, gy]], PAPER, 1.6); p.hatch([[20, gy - 24], [26, gy - 24], [31, gy - 16], [34, gy], [20, gy]], 75, 2, 0.7); G(p, gy, 40); });
    add('l-nazca', 40, 28, p => { p.col('#8A5A2B'); p.line([[4, 24], [12, 14], [10, 6], [16, 10], [22, 4], [24, 12], [34, 8], [28, 16], [36, 24]], 1.2); p.line([[2, 4], [38, 26]], 0.6); p.col(INK); });
    add('l-mine', 30, 26, p => { p.poly([[2, 24], [8, 10], [15, 6], [22, 10], [28, 24]], PAPER, 1.5); p.poly([[11, 24], [11, 16], [15, 13], [19, 16], [19, 24]], '#2B2119', 0.6); p.line([[6, 6], [12, 12]], 1.4); p.line([[24, 6], [18, 12]], 1.4); });
    add('l-fjord', 40, 30, p => { p.poly([[0, 28], [0, 4], [14, 8], [16, 28]], PAPER, 1.4); p.hatch([[0, 28], [0, 4], [14, 8], [16, 28]], 70, 2, 0.7); p.poly([[40, 28], [40, 2], [26, 6], [24, 28]], PAPER, 1.4); p.hatch([[40, 28], [40, 2], [26, 6], [24, 28]], 110, 2, 0.7); p.col(BLUE).line([[16, 26], [24, 26]], 1).line([[17, 22], [23, 22]], 0.8).col(INK); });
    // the bespoke drawings stand in for types too: mesoamerica stepped pyramid, gate, dome and so on
  }

  // ---------------- peaks with snow caps
  function peaks(add) {
    // highlighted summits: a larger, finely drawn peak with a generous snow cap and fine blue snow lines
    add('bigpeak', 64, 52, p => {
      const gy = 48, L = [[2, gy], [14, gy - 16], [22, gy - 28], [30, gy - 42], [33, gy - 46], [37, gy - 40], [44, gy - 30], [50, gy - 22], [62, gy]];
      p.poly(L, PAPER, 2.2);
      p.hatch([[33, gy - 46], [37, gy - 40], [44, gy - 30], [50, gy - 22], [62, gy], [36, gy], [34, gy - 30]], 115, 2.1, 0.8);
      const snow = [[22, gy - 28], [30, gy - 42], [33, gy - 46], [37, gy - 40], [44, gy - 30], [40, gy - 27], [37, gy - 31], [34, gy - 26], [31, gy - 31], [27, gy - 26]];
      p.poly(snow, SNOW, 1.4);
      p.col(BLUES); for (let k = 0; k < 5; k++) p.line([[29 + k * 2.5, gy - 32 - k * 0.6], [30.5 + k * 2.5, gy - 37 + k * 0.4]], 0.7); p.col(INK);
      p.line([[33, gy - 46], [34, gy - 20], [36, gy]], 1.2);
      p.ground(1, 63, gy + 1);
    });
    add('flourish', 70, 10, p => { p.col('#A3261B'); const pts = []; for (let i = 0; i <= 40; i++) { const t = i / 40; pts.push([4 + t * 62, 5 + Math.sin(t * Math.PI * 2) * 2.4 * Math.sin(t * Math.PI)]); } p.line(pts, 1.2); p.dot(4, 5, 1.3, RED); p.dot(66, 5, 1.3, RED); p.dot(35, 5, 1.6, RED); p.col(INK); });
  }

  // ---------------- animals (stylised ink figures)
  function quad(p, o) {
    // a four-legged animal facing left: body ellipse, legs, neck and head, tail, with options for features
    const by = o.by || 30, bx = o.bx || 34, bl = o.bl || 26, bh = o.bh || 11, leg = o.leg || 10, nk = o.neck || 0;
    const hx = bx - bl / 2 - 2 - nk * 0.35, hy = by - bh / 2 - nk;
    // legs
    for (const lx of [bx - bl * 0.38, bx - bl * 0.22, bx + bl * 0.24, bx + bl * 0.38]) p.line([[lx, by + bh * 0.3], [lx + (o.legSlant || 0), by + bh * 0.3 + leg]], o.legW || 1.7);
    // tail
    if (o.tail !== false) p.line([[bx + bl / 2, by - bh * 0.15], [bx + bl / 2 + (o.tailL || 7), by + (o.tailDy || 4)]], 1.2);
    if (o.tuft) p.dot(bx + bl / 2 + (o.tailL || 7), by + (o.tailDy || 4), 1.4);
    // body
    p.ell(bx, by, bl / 2, bh / 2, o.fill || PAPER, 1.7);
    if (o.hump) for (const hx2 of o.hump) p.ell(hx2, by - bh / 2 + 1, 4.5, 4.5, o.fill || PAPER, 1.5, Math.PI, Math.PI * 2);
    if (o.shade !== false) p.hatch((() => { const pts = []; for (let i = 0; i <= 16; i++) { const a = i / 16 * Math.PI; pts.push([bx + Math.cos(a) * bl / 2, by + Math.sin(a) * bh / 2]); } return pts; })(), 60, 2.2, 0.6);
    // neck
    if (nk > 0) p.poly([[bx - bl / 2 + 4, by - bh / 2 + 2], [hx + 2, hy + 2], [hx + 5, hy + 3], [bx - bl / 2 + 8, by - bh / 2 + 1]], o.fill || PAPER, 1.4);
    // head
    const hr = o.head || 4.2;
    p.ell(hx, hy, hr * (o.headW || 1.25), hr, o.fill || PAPER, 1.5);
    p.dot(hx - hr * 0.4, hy - hr * 0.25, 0.8);
    if (o.ear) p.poly([[hx + 1, hy - hr + 1], [hx + 2.4, hy - hr - 3], [hx + 3.5, hy - hr + 1]], PAPER, 1);
    if (o.feature) o.feature(p, hx, hy, hr, bx, by, bl, bh);
  }
  function bird(p, o) {
    const bx = o.bx || 26, by = o.by || 22, bl = o.bl || 14, bh = o.bh || 9, leg = o.leg || 6;
    if (leg > 0) for (const lx of [bx - 2, bx + 2]) { p.line([[lx, by + bh / 2 - 1], [lx, by + bh / 2 + leg]], 1.1); p.line([[lx, by + bh / 2 + leg], [lx - 3, by + bh / 2 + leg]], 0.9); }
    if (o.tail) p.poly([[bx + bl / 2 - 1, by - 1], [bx + bl / 2 + o.tail, by + 2 + (o.tailDy || 0)], [bx + bl / 2 - 1, by + 2]], PAPER, 1.2);
    p.ell(bx, by, bl / 2, bh / 2, o.fill || PAPER, 1.6);
    p.line([[bx - 2, by - 1], [bx + bl / 2 - 1, by + 1]], 0.9);
    const nk = o.neck || 0, hx = bx - bl / 2 - nk * 0.3, hy = by - bh / 2 - nk;
    if (nk) p.line([[bx - bl / 2 + 2, by - bh / 2 + 1], [hx, hy + 2]], 2.2);
    p.ell(hx, hy, o.head || 3, o.head || 3, o.headFill || PAPER, 1.3);
    p.dot(hx - 0.8, hy - 0.6, 0.7);
    const bk = o.beak || 4; p.poly([[hx - (o.head || 3) + 0.5, hy - 1], [hx - (o.head || 3) - bk, hy + (o.beakDy || 0.5)], [hx - (o.head || 3) + 0.5, hy + 1.2]], o.beakFill || PAPER, 0.9);
    if (o.feature) o.feature(p, bx, by, hx, hy);
  }
  function whale(p, o) {
    const W = p.w, gy = o.gy || 30, len = o.len || 46, ht = o.ht || 11, x0 = (W - len) / 2 + (o.dx || 0);
    const top = []; for (let i = 0; i <= 20; i++) { const t = i / 20; top.push([x0 + t * len, gy - Math.sin(Math.pow(t, 0.7) * Math.PI) * ht * (o.headBluff ? (t < 0.25 ? 1.1 : 1) : 1)]); }
    const pts = top.concat([[x0 + len + 6, gy - 6], [x0 + len + 9, gy - 2], [x0 + len + 4, gy - 1], [x0 + len + 9, gy + 3], [x0 + len + 6, gy + 1]]);
    for (let i = 20; i >= 0; i--) { const t = i / 20; pts.push([x0 + t * len, gy + Math.sin(Math.pow(t, 0.8) * Math.PI) * ht * 0.42]); }
    p.poly(pts, o.fill || PAPER, 1.7);
    p.hatch(top.concat([[x0 + len, gy], [x0, gy]]), 35, 2.2, 0.6);
    if (o.belly) for (let k = 0; k < 6; k++) p.line([[x0 + 4 + k * 3, gy + 1], [x0 + 6 + k * 3, gy + ht * 0.35]], 0.6);
    p.dot(x0 + len * 0.13, gy - 2, 0.9);
    if (o.fin) p.poly([[x0 + len * 0.62, gy - ht * 0.8], [x0 + len * 0.66, gy - ht * 0.8 - o.fin], [x0 + len * 0.72, gy - ht * 0.75]], o.finFill || PAPER, 1.2);
    if (o.spout) { p.col(BLUE); p.line([[x0 + len * 0.18, gy - ht], [x0 + len * 0.18 - 2, gy - ht - 9]], 1); p.line([[x0 + len * 0.18, gy - ht], [x0 + len * 0.18 + 3, gy - ht - 9]], 1); p.line([[x0 + len * 0.18, gy - ht], [x0 + len * 0.18 + 0.5, gy - ht - 11]], 0.9); p.col(INK); }
    p.col(BLUE).line([[x0 - 4, gy + ht * 0.6], [x0 + len + 10, gy + ht * 0.6]], 0.9).line([[x0 + 4, gy + ht * 0.6 + 3], [x0 + len, gy + ht * 0.6 + 3]], 0.7).col(INK);
  }
  // bestiary style: each beast is cut out on a pale gold ground with a fine gilt edge, as in the margins of an illuminated manuscript
  function gild(c) {
    const P = 4, o = document.createElement('canvas'); o.width = c.width + 2 * P; o.height = c.height + 2 * P;
    const x = o.getContext('2d', { willReadFrequently: true }), t = document.createElement('canvas'); t.width = c.width; t.height = c.height;
    const tx = t.getContext('2d', { willReadFrequently: true });
    const ring = (r, col) => { tx.globalCompositeOperation = 'source-over'; tx.clearRect(0, 0, t.width, t.height); tx.drawImage(c, 0, 0); tx.globalCompositeOperation = 'source-in'; tx.fillStyle = col; tx.fillRect(0, 0, t.width, t.height); for (let a = 0; a < 6.28; a += 0.4) x.drawImage(t, P + Math.cos(a) * r, P + Math.sin(a) * r); };
    ring(2.8, 'rgba(140,100,32,0.85)'); ring(2.0, 'rgba(250,240,210,1)');
    x.drawImage(c, P, P);
    return o;
  }
  function animals(add) {
    const A = (id, w, h, f) => add('a_' + id, w, h, null, 0, () => { const p = Pen(w, h, hashStr(id)); f(p); return gild(p.done()); });
    A('elephant', 60, 46, p => quad(p, { bx: 34, by: 24, bl: 30, bh: 18, leg: 12, legW: 3.2, head: 7, headW: 1.0, tailL: 5, tuft: true, feature: (p, hx, hy) => { p.line([[hx - 4, hy + 2], [hx - 7, hy + 10], [hx - 5, hy + 16]], 2.4); p.ell(hx + 4, hy + 1, 4.5, 6, PAPER, 1.3); p.line([[hx - 3, hy + 4], [hx - 7, hy + 6]], 1.1); } }));
    A('lion', 56, 40, p => quad(p, { bx: 32, by: 22, bl: 26, bh: 11, leg: 10, head: 4.5, tailL: 10, tailDy: -2, tuft: true, feature: (p, hx, hy) => { for (let a = 0; a < 6.28; a += 0.45) p.line([[hx + Math.cos(a) * 4.5, hy + Math.sin(a) * 4.5], [hx + Math.cos(a) * 8, hy + Math.sin(a) * 8]], 1.2); p.ell(hx, hy, 5, 4.4, '#E3C46B', 1.4); p.dot(hx - 2, hy - 1, 0.8); } }));
    A('giraffe', 50, 62, p => quad(p, { bx: 30, by: 36, bl: 20, bh: 10, leg: 18, neck: 20, head: 3.2, tailL: 6, tuft: true, fill: '#EBD49A', feature: (p, hx, hy, hr, bx, by) => { for (let i = 0; i < 9; i++) p.dot(bx - 8 + (i % 3) * 7, by - 3 + Math.floor(i / 3) * 3, 1.2, '#8A5A2B'); p.line([[hx + 1, hy - 3], [hx + 1, hy - 6]], 1); p.line([[hx + 3, hy - 3], [hx + 3, hy - 6]], 1); } }));
    A('hippo', 54, 34, p => quad(p, { bx: 30, by: 18, bl: 30, bh: 14, leg: 6, legW: 3, head: 6, headW: 1.4, tailL: 3, fill: '#C9B9A6' }));
    A('rhino', 56, 38, p => quad(p, { bx: 32, by: 20, bl: 30, bh: 14, leg: 8, legW: 3, head: 5.5, headW: 1.3, tailL: 4, fill: '#C9B9A6', feature: (p, hx, hy) => { p.poly([[hx - 6, hy - 1], [hx - 9, hy - 9], [hx - 4, hy - 3]], PAPER, 1.2); } }));
    A('camel', 56, 50, p => quad(p, { bx: 32, by: 26, bl: 24, bh: 12, leg: 15, neck: 10, head: 3.6, hump: [32], tailL: 5, fill: '#E3C88F' }));
    A('bactrian', 56, 50, p => quad(p, { bx: 32, by: 26, bl: 26, bh: 12, leg: 13, neck: 9, head: 3.6, hump: [27, 37], tailL: 5, fill: '#D6B47A' }));
    A('tiger', 58, 36, p => quad(p, { bx: 32, by: 18, bl: 30, bh: 11, leg: 9, head: 4.6, tailL: 12, tailDy: -4, fill: '#E3A14A', shade: false, ear: true, feature: (p, hx, hy, hr, bx, by, bl, bh) => { for (let i = 0; i < 7; i++) p.line([[bx - 11 + i * 4, by - bh / 2 + 1], [bx - 12 + i * 4, by + 2]], 1.1); } }));
    A('jaguar', 58, 36, p => quad(p, { bx: 32, by: 18, bl: 30, bh: 11, leg: 9, head: 4.6, tailL: 12, tailDy: -3, fill: '#E3B66A', shade: false, ear: true, feature: (p, hx, hy, hr, bx, by) => { for (let i = 0; i < 10; i++) p.ell(bx - 11 + (i % 5) * 5.5, by - 2 + Math.floor(i / 5) * 3.5, 1.3, 1.1, null, 0.8); } }));
    A('snowleopard', 58, 36, p => quad(p, { bx: 32, by: 18, bl: 28, bh: 10, leg: 8, head: 4.4, tailL: 16, tailDy: -6, fill: '#EDEBE2', shade: false, ear: true, feature: (p, hx, hy, hr, bx, by) => { for (let i = 0; i < 10; i++) p.ell(bx - 11 + (i % 5) * 5.5, by - 2 + Math.floor(i / 5) * 3.5, 1.2, 1, null, 0.8); } }));
    A('panda', 50, 40, p => quad(p, { bx: 28, by: 22, bl: 24, bh: 14, leg: 7, legW: 3.4, head: 6, headW: 1.1, tail: false, shade: false, feature: (p, hx, hy, hr, bx, by, bl, bh) => { p.dot(hx - 2.5, hy - 1, 1.8); p.dot(hx + 2, hy - 1, 1.8); p.dot(hx - 4, hy - 5, 2.2); p.dot(hx + 3.5, hy - 5.5, 2.2); p.x.save(); p.ell(bx - 4, by - 1, 5, 7, '#2B2119', 0); p.x.restore(); for (const lx of [bx - bl * 0.38, bx - bl * 0.22]) p.line([[lx, by + 3], [lx, by + 11]], 3.6); } }));
    A('bear', 56, 40, p => quad(p, { bx: 32, by: 22, bl: 30, bh: 15, leg: 8, legW: 3.4, head: 5.4, tailL: 2, fill: '#A78462', ear: true }));
    A('polarbear', 56, 40, p => quad(p, { bx: 32, by: 22, bl: 30, bh: 14, leg: 8, legW: 3.4, head: 5, headW: 1.4, tailL: 2, fill: SNOW, shade: false, ear: true, feature: (p) => { p.col(BLUE).line([[2, 36], [54, 36]], 0.9).col(INK); } }));
    A('yak', 54, 40, p => quad(p, { bx: 30, by: 22, bl: 28, bh: 15, leg: 8, legW: 2.6, head: 5, tailL: 5, fill: '#6B5440', feature: (p, hx, hy) => { p.line([[hx - 1, hy - 4], [hx - 5, hy - 8], [hx - 2, hy - 11]], 1.4); p.line([[hx + 2, hy - 4], [hx + 6, hy - 8], [hx + 4, hy - 11]], 1.4); for (let i = 0; i < 6; i++) p.line([[22 + i * 3, 28], [21 + i * 3, 33]], 0.8); } }));
    A('bison', 56, 40, p => quad(p, { bx: 30, by: 22, bl: 28, bh: 15, leg: 9, legW: 2.6, head: 5.2, hump: [24], tailL: 6, tuft: true, fill: '#7A5A3E', feature: (p, hx, hy) => { p.line([[hx - 2, hy - 4], [hx - 5, hy - 7]], 1.3); p.line([[hx + 2, hy - 4], [hx + 4, hy - 7]], 1.3); } }));
    A('reindeer', 52, 50, p => quad(p, { bx: 30, by: 30, bl: 24, bh: 11, leg: 13, neck: 6, head: 3.6, tailL: 3, fill: '#B49A7A', feature: (p, hx, hy) => { const ant = (s) => { p.line([[hx + s, hy - 3], [hx + s * 3, hy - 9], [hx + s * 2, hy - 15], [hx + s * 4, hy - 18]], 1.1); p.line([[hx + s * 3, hy - 9], [hx + s * 6, hy - 11]], 0.9); p.line([[hx + s * 2, hy - 15], [hx - s * 1, hy - 18]], 0.9); }; ant(1); ant(-0.6); } }));
    A('moose', 56, 52, p => quad(p, { bx: 32, by: 30, bl: 28, bh: 13, leg: 14, neck: 5, head: 4.4, headW: 1.6, tailL: 2, fill: '#6B5440', feature: (p, hx, hy) => { p.poly([[hx + 1, hy - 3], [hx + 9, hy - 10], [hx + 12, hy - 7], [hx + 6, hy - 3]], PAPER, 1.2); for (let k = 0; k < 3; k++) p.line([[hx + 7 + k * 2, hy - 8 - k], [hx + 8 + k * 2, hy - 12 - k]], 0.9); } }));
    A('deer', 50, 48, p => quad(p, { bx: 30, by: 28, bl: 22, bh: 10, leg: 13, neck: 6, head: 3.4, tailL: 3, fill: '#C08B5C', feature: (p, hx, hy) => { p.line([[hx + 1, hy - 3], [hx + 3, hy - 10], [hx + 1, hy - 15]], 1.1); p.line([[hx + 3, hy - 10], [hx + 7, hy - 13]], 0.9); p.line([[hx + 2, hy - 6], [hx - 2, hy - 9]], 0.9); } }));
    A('wolf', 54, 36, p => quad(p, { bx: 32, by: 18, bl: 26, bh: 10, leg: 10, head: 4, headW: 1.6, tailL: 11, tailDy: 6, fill: '#9C9A93', ear: true }));
    A('ibex', 50, 44, p => quad(p, { bx: 30, by: 26, bl: 22, bh: 11, leg: 11, neck: 3, head: 3.6, tailL: 2, fill: '#B4987A', feature: (p, hx, hy) => { p.line([[hx + 1, hy - 3], [hx + 5, hy - 9], [hx + 11, hy - 10], [hx + 14, hy - 6]], 1.8); for (let k = 0; k < 4; k++) p.line([[hx + 3 + k * 2.5, hy - 7.5 - k * 0.5], [hx + 4 + k * 2.5, hy - 10 - k * 0.5]], 0.6); } }));
    A('llama', 44, 50, p => quad(p, { bx: 26, by: 30, bl: 18, bh: 10, leg: 13, neck: 13, head: 3.2, tailL: 3, fill: '#EDE2C8', ear: true }));
    A('walrus', 54, 34, p => { p.ell(30, 20, 18, 9, '#9C7A62', 1.7); p.hatch([[12, 20], [48, 20], [48, 29], [12, 29]], 60, 2.2, 0.6); p.ell(12, 16, 6, 5, '#9C7A62', 1.5); p.line([[9, 19], [8, 28]], 1.6); p.line([[13, 19], [13, 28]], 1.6); p.dot(10, 14, 0.8); p.poly([[46, 24], [53, 20], [53, 28]], PAPER, 1.2); p.col(BLUE).line([[2, 31], [52, 31]], 0.9).col(INK); });
    A('alligator', 62, 26, p => { p.poly([[4, 14], [16, 11], [40, 10], [56, 14], [60, 16], [40, 18], [16, 18]], '#7C8C5A', 1.6); for (let i = 0; i < 9; i++) p.line([[16 + i * 3.5, 11], [17 + i * 3.5, 9]], 0.8); for (const lx of [18, 24, 36, 42]) p.line([[lx, 18], [lx - 2, 23]], 1.6); p.dot(15, 12, 0.9); p.col(BLUE).line([[2, 24], [60, 24]], 0.9).col(INK); });
    A('komodo', 62, 26, p => { p.poly([[4, 14], [14, 11], [40, 11], [58, 15], [40, 18], [14, 18]], '#8C8462', 1.6); p.hatch([[14, 11], [40, 11], [40, 18], [14, 18]], 45, 2, 0.6); for (const lx of [16, 22, 34, 40]) p.line([[lx, 18], [lx - 3, 23]], 1.8); p.dot(10, 13, 0.9); p.col(RED).line([[4, 15], [0, 16]], 0.8).col(INK); });
    A('turtle', 44, 30, p => { p.ell(22, 16, 12, 8, '#9AAE7A', 1.6); for (let i = 0; i < 3; i++) p.ell(15 + i * 7, 16, 3, 3, null, 0.8); p.ell(8, 15, 3.5, 3, PAPER, 1.3); for (const [fx, fy, dx] of [[14, 22, -6], [30, 22, 6], [14, 10, -6], [30, 10, 6]]) p.poly([[fx, fy], [fx + dx, fy + (fy > 16 ? 4 : -4)], [fx + dx * 0.4, fy]], PAPER, 1); p.col(BLUE).line([[2, 27], [42, 27]], 0.8).col(INK); });
    A('dolphin', 50, 30, p => { const pts = [[4, 18], [10, 14], [18, 9], [30, 8], [40, 12], [46, 18], [42, 17], [44, 22], [38, 17], [26, 18], [14, 19]]; p.poly(pts, '#9DB4C8', 1.5); p.poly([[24, 9], [28, 2], [31, 9]], '#9DB4C8', 1.2); p.dot(10, 15, 0.8); p.col(BLUE).line([[0, 26], [50, 26]], 1).line([[8, 28.5], [42, 28.5]], 0.7).col(INK); });
    A('flyingfish', 46, 24, p => { p.ell(22, 14, 12, 3.4, '#9DB4C8', 1.4); p.poly([[18, 12], [26, 2], [30, 11]], PAPER, 1.1); p.poly([[34, 14], [42, 9], [40, 14], [42, 19]], PAPER, 1.1); p.dot(12, 13, 0.7); p.col(BLUE).line([[0, 21], [46, 21]], 0.8).col(INK); });
    // primates
    A('gorilla', 44, 44, p => { p.ell(22, 24, 12, 13, '#5A4A3E', 1.7); p.ell(22, 9, 6, 6, '#5A4A3E', 1.5); p.ell(22, 11, 3.4, 2.6, PAPER, 1); p.line([[11, 22], [7, 40]], 3.4); p.line([[33, 22], [37, 40]], 3.4); p.line([[17, 36], [16, 42]], 3); p.line([[27, 36], [28, 42]], 3); });
    A('orangutan', 44, 46, p => { p.line([[22, 2], [22, 44]], 0); p.line([[10, 0], [14, 18]], 2.6); p.ell(22, 24, 9, 11, '#B5602E', 1.6); p.ell(22, 10, 5.4, 5, '#B5602E', 1.4); p.ell(22, 11, 3.4, 2.4, PAPER, 0.9); p.line([[30, 20], [38, 8]], 2.6); p.line([[17, 34], [14, 43]], 2.4); p.line([[27, 34], [30, 43]], 2.4); p.col('#3F6B3A').line([[6, 0], [10, 0], [38, 4], [42, 2]], 1.4).col(INK); });
    A('lemur', 42, 46, p => { p.ell(18, 26, 6, 9, '#BDB6AA', 1.5); p.ell(18, 14, 4, 4, '#EDEBE2', 1.3); p.dot(16.5, 13.5, 1); p.dot(19.5, 13.5, 1); const pts = []; for (let i = 0; i <= 20; i++) { const t = i / 20; pts.push([22 + t * 14, 32 - Math.sin(t * Math.PI * 1.4) * 22]); } p.line(pts, 3); for (let i = 0; i < 6; i++) { const q = pts[3 + i * 3]; p.dot(q[0], q[1], 1.6); } });
    A('sloth', 46, 40, p => { p.line([[2, 6], [44, 6]], 2.2); p.ell(23, 18, 10, 6, '#A08A6A', 1.5); p.ell(12, 20, 4, 3.6, '#E5D9C3', 1.3); p.dot(11, 19.5, 0.8); for (const lx of [16, 20, 27, 31]) p.line([[lx, 14], [lx + (lx < 23 ? -2 : 2), 6]], 1.4); });
    A('kangaroo', 46, 50, p => { p.ell(24, 30, 8, 12, '#C98E5A', 1.6); p.ell(16, 14, 4, 3.4, '#C98E5A', 1.4); p.poly([[17, 11], [18, 5], [20, 11]], PAPER, 1); p.line([[18, 17], [21, 20]], 1.8); p.line([[20, 28], [14, 30]], 1.4); p.line([[26, 41], [20, 47], [28, 47]], 2); p.line([[31, 36], [44, 46]], 2.4); p.dot(14, 13.5, 0.8); });
    A('koala', 40, 44, p => { p.line([[30, 0], [30, 44]], 3.4); p.ell(22, 26, 8, 10, '#9C9A93', 1.5); p.ell(19, 13, 6, 5, '#9C9A93', 1.4); p.ell(13, 9, 3.4, 3.4, PAPER, 1.2); p.ell(25, 9, 3.4, 3.4, PAPER, 1.2); p.ell(18.5, 14.5, 1.6, 2, '#2B2119', 0); for (const ly of [20, 33]) p.line([[24, ly], [29, ly - 2]], 1.6); });
    // birds
    A('ostrich', 44, 54, p => bird(p, { bx: 24, by: 28, bl: 18, bh: 13, leg: 18, neck: 14, head: 2.6, beak: 3, fill: '#5A4A3E', tail: 4 }));
    A('emu', 44, 54, p => bird(p, { bx: 24, by: 28, bl: 18, bh: 14, leg: 16, neck: 11, head: 2.6, beak: 3, fill: '#7A6450' }));
    A('rhea', 44, 50, p => bird(p, { bx: 24, by: 26, bl: 18, bh: 12, leg: 15, neck: 11, head: 2.4, beak: 3, fill: '#A79C8A' }));
    A('crane', 44, 56, p => bird(p, { bx: 24, by: 26, bl: 16, bh: 9, leg: 20, neck: 14, head: 2.6, beak: 6, fill: SNOW, tail: 5, headFill: RED }));
    A('kiwi', 40, 30, p => bird(p, { bx: 22, by: 16, bl: 18, bh: 13, leg: 5, head: 3.2, beak: 10, beakDy: 3, fill: '#8A6A4A' }));
    A('penguin', 30, 44, p => { p.ell(15, 24, 8, 15, '#2B2119', 1.4); p.ell(16, 26, 5.4, 12, SNOW, 0.8); p.ell(14, 9, 5, 5, '#2B2119', 1); p.poly([[9, 9], [5, 10.5], [9, 11]], '#C9A24A', 0.6); p.ell(15.5, 12, 2, 1.4, '#E3B04A', 0); p.line([[11, 39], [8, 41]], 1.4); p.line([[18, 39], [21, 41]], 1.4); p.col(BLUE).line([[0, 42], [30, 42]], 0.9).col(INK); });
    A('toucan', 40, 36, p => bird(p, { bx: 24, by: 18, bl: 14, bh: 11, leg: 5, head: 3.6, beak: 12, beakDy: 1.5, beakFill: '#E3A14A', fill: '#2B2119', tail: 6, feature: (p, bx, by) => { p.line([[4, 30], [38, 30]], 2); } }));
    A('macaw', 38, 48, p => bird(p, { bx: 20, by: 18, bl: 12, bh: 11, leg: 5, head: 3.4, beak: 4, beakDy: 2, fill: '#C9382B', tail: 16, tailDy: 12, feature: (p) => { p.line([[2, 30], [36, 30]], 2); p.hatch([[18, 13], [26, 15], [24, 24], [16, 22]], 30, 1.6, 0.8, BLUE); } }));
    A('eagle', 56, 34, p => { p.poly([[28, 14], [4, 6], [10, 12], [6, 14], [14, 18], [26, 20]], PAPER, 1.4); p.poly([[28, 14], [52, 6], [46, 12], [50, 14], [42, 18], [30, 20]], PAPER, 1.4); p.hatch([[28, 14], [4, 6], [10, 12], [6, 14], [14, 18], [26, 20]], 30, 2, 0.6); p.ell(28, 18, 4, 6, '#6B5440', 1.4); p.ell(28, 10, 2.8, 2.8, SNOW, 1.2); p.poly([[26, 10], [24, 12], [27, 12]], '#E3B04A', 0.6); p.poly([[25, 24], [28, 30], [31, 24]], PAPER, 1.1); });
    A('condor', 60, 30, p => { p.poly([[30, 12], [2, 10], [8, 14], [4, 16], [14, 18], [28, 18]], '#2B2119', 1.2); p.poly([[30, 12], [58, 10], [52, 14], [56, 16], [46, 18], [32, 18]], '#2B2119', 1.2); p.line([[6, 13], [20, 15]], 0.8); p.ell(30, 16, 4, 5, '#2B2119', 1.2); p.ell(30, 9, 2.4, 2.4, '#C98E5A', 1); p.ell(30, 11.5, 3, 1.2, SNOW, 0.6); });
    // whales (with and without spout)
    const W = (id, o) => { A(id, 64, 40, p => whale(p, o)); A(id + '_s', 64, 40, p => whale(p, Object.assign({}, o, { spout: true }))); };
    W('humpback', { len: 46, ht: 10, fin: 3, belly: true, fill: '#6F7C88' });
    W('grey', { len: 44, ht: 9, fin: 0, fill: '#A3A9AE' });
    W('blue', { len: 50, ht: 9, fin: 2, fill: '#7E95AE' });
    W('right', { len: 42, ht: 11, fin: 0, fill: '#4A5560', headBluff: true });
    W('minke', { len: 38, ht: 8, fin: 4, fill: '#7E8A96' });
    W('orca', { len: 38, ht: 9, fin: 8, fill: '#2B2119', finFill: '#2B2119' });
    W('sperm', { len: 48, ht: 11, fin: 0, fill: '#5A5F66', headBluff: true });
    // beasts of the countryside, for the closer zooms
    A('boar', 52, 34, p => quad(p, { bx: 30, by: 18, bl: 26, bh: 13, leg: 7, legW: 2.4, head: 5, headW: 1.5, tailL: 4, fill: '#6E5845', ear: true, feature: (p, hx, hy) => { p.line([[hx - 5, hy + 2], [hx - 8, hy - 1]], 1.2); p.line([[24, 12], [27, 9], [30, 12], [33, 9], [36, 12]], 1); } }));
    A('sheep', 44, 32, p => quad(p, { bx: 25, by: 16, bl: 22, bh: 13, leg: 7, legW: 1.6, head: 3.6, headW: 1.3, tailL: 2, fill: '#F4EEDC', shade: false, feature: (p, hx, hy, hr, bx, by) => { for (let i = 0; i < 8; i++) p.ell(bx - 8 + (i % 4) * 5.3, by - 3 + Math.floor(i / 4) * 5, 2.4, 2.2, null, 0.7); p.ell(hx, hy, 3.6 * 1.3, 3.6, '#4A3C30', 1.2); } }));
    A('cow', 50, 36, p => quad(p, { bx: 28, by: 18, bl: 26, bh: 12, leg: 9, legW: 2, head: 4, headW: 1.4, tailL: 7, tailDy: 7, tuft: true, fill: '#F1E8D6', shade: false, feature: (p, hx, hy, hr, bx, by) => { p.ell(bx - 4, by - 1, 5, 3.6, '#5A4636', 0); p.ell(bx + 7, by + 1, 3.6, 3, '#5A4636', 0); p.line([[hx - 1, hy - 3.5], [hx - 4, hy - 6]], 1.1); p.line([[hx + 2, hy - 3.5], [hx + 4, hy - 6]], 1.1); } }));
    A('heron', 36, 50, p => bird(p, { bx: 20, by: 22, bl: 14, bh: 8, leg: 16, neck: 10, head: 2.4, beak: 8, fill: '#B8C0C4', tail: 3, feature: (p) => { p.col(BLUE).line([[4, 46], [32, 46]], 0.9).col(INK); } }));
    A('fish', 40, 22, p => { p.poly([[4, 11], [12, 6], [24, 5], [32, 10], [38, 5], [37, 11], [38, 17], [32, 12], [24, 16], [12, 16]], '#A9BCC6', 1.4); p.dot(10, 10, 0.8); for (let i = 0; i < 4; i++) p.ell(16 + i * 3.6, 11, 1.6, 2.4, null, 0.6); p.col(BLUE).line([[0, 20], [40, 20]], 0.8).col(INK); });
    A('serpent', 72, 40, p => { const seg = [[8, 26], [20, 12], [32, 26], [44, 12], [56, 26]]; for (let i = 0; i < 4; i++) { const a = seg[i], b = seg[i + 1]; const pts = []; for (let k = 0; k <= 10; k++) { const t = k / 10; pts.push([a[0] + (b[0] - a[0]) * t, 26 - Math.sin(t * Math.PI) * 13 * (i % 2 ? 0 : 1) - (i % 2 ? Math.sin(t * Math.PI) * 13 : 0)]); } } for (const cx of [14, 38]) { p.ell(cx, 26, 8, 12, '#5E8A5A', 1.6, Math.PI, Math.PI * 2); p.hatch([[cx, 14], [cx + 8, 26], [cx, 26]], 60, 1.8, 0.7); for (let k = 0; k < 3; k++) p.poly([[cx - 2 + k * 3, 14.5 + k], [cx - 0.5 + k * 3, 11 + k], [cx + 1 + k * 3, 15 + k]], RED, 0.6); } p.ell(58, 22, 6, 4, '#5E8A5A', 1.5); p.poly([[63, 22], [70, 20], [64, 24]], PAPER, 1); p.dot(57, 20.5, 1); p.line([[61, 25], [64, 29]], 0.9); p.col(BLUE); p.line([[0, 27], [72, 27]], 1); p.line([[6, 30], [66, 30]], 0.7); p.col(INK); });
  }

  // ---------------- ships and flight (drawn facing up = north; rotated by the map to their heading)
  function vessels(add) {
    add('ship', 40, 48, p => {
      // a three-masted sailing ship seen from astern-quarter, bow up; wake trails below
      p.col(BLUE); p.line([[20, 40], [14, 47]], 0.9); p.line([[20, 40], [26, 47]], 0.9); p.line([[20, 41], [17, 47]], 0.6); p.line([[20, 41], [23, 47]], 0.6); p.col(INK);
      p.poly([[20, 4], [26, 14], [26, 36], [20, 41], [14, 36], [14, 14]], '#B88B5A', 1.6);
      p.hatch([[20, 4], [26, 14], [26, 36], [20, 41]], 80, 2, 0.6);
      for (const [y, w] of [[12, 10], [22, 14], [32, 11]]) { p.ell(20, y, w, 3.2, SNOW, 1.3); p.line([[20 - w, y], [20 + w, y]], 1.1); }
      p.dot(20, 12, 1); p.dot(20, 22, 1); p.dot(20, 32, 1);
      p.poly([[20, 1], [23, 3], [20, 5]], RED, 0.6);
    });
    add('balloon', 34, 50, p => {
      const cx = 17; p.ell(cx, 15, 13, 14, SNOW, 1.7);
      for (const k of [-0.7, -0.35, 0, 0.35, 0.7]) { const pts = []; for (let i = 0; i <= 14; i++) { const a = -Math.PI / 2 + i / 14 * Math.PI; pts.push([cx + Math.sin(a + Math.PI / 2) * 0 + k * 13 * Math.cos(a), 15 + Math.sin(a) * 14]); } p.line(pts, 0.8); }
      p.hatch([[cx, 1], [cx + 13, 15], [cx, 29]], 70, 1.6, 0.6, RED);
      p.poly([[cx - 6, 27], [cx - 3, 34], [cx + 3, 34], [cx + 6, 27]], SNOW, 1.2);
      for (const dx of [-3, 3]) p.line([[cx + dx, 34], [cx + dx * 0.7, 42]], 0.8);
      p.rect(cx - 4, 42, 8, 6, '#B88B5A', 1.3); p.flag(cx + 4, 42, 0.6);
    });
    add('ornithopter', 64, 52, p => {
      // a flying machine after the manner of Renaissance notebooks: a pilot's frame under two ribbed, bat-like wings; nose up
      const cx = 32, cy = 28;
      const wing = s => { const ribs = [[cx + s * 4, cy - 2], [cx + s * 16, cy - 16], [cx + s * 28, cy - 18], [cx + s * 30, cy - 6], [cx + s * 22, cy + 4]]; p.poly([[cx + s * 4, cy - 2], ...ribs.slice(1), [cx + s * 6, cy + 2]], 'rgba(243,229,191,0.9)', 1.5); for (let k = 1; k < 5; k++) p.line([[cx + s * 4, cy], ribs[k]], 0.8); for (let k = 0; k < 4; k++) p.line([[cx + s * (8 + k * 5), cy - 6 - k * 2.6], [cx + s * (10 + k * 4.6), cy + 1 - k * 1.2]], 0.5); };
      wing(-1); wing(1);
      p.poly([[cx - 3, cy - 14], [cx + 3, cy - 14], [cx + 4, cy + 14], [cx - 4, cy + 14]], '#B88B5A', 1.4);
      p.line([[cx, cy - 14], [cx, cy - 22]], 1.2); p.ell(cx, cy - 22, 3, 2, null, 0.8);
      p.poly([[cx - 6, cy + 14], [cx, cy + 22], [cx + 6, cy + 14]], 'rgba(243,229,191,0.9)', 1.2); p.line([[cx, cy + 14], [cx, cy + 22]], 0.6);
      p.ell(cx, cy, 2.4, 2.4, PAPER, 1); for (let a = 0; a < 6.28; a += 1.05) p.line([[cx, cy], [cx + Math.cos(a) * 5, cy + Math.sin(a) * 5]], 0.6);
      p.dot(cx, cy - 4, 1.6);
    });
    add('airfield', 32, 26, p => {
      // a smaller sketch for ordinary airfields: a pair of ribbed wings over a cross-shaped strip
      p.col('#8A6A4A').line([[4, 20], [28, 20]], 1.2).line([[16, 24], [16, 14]], 1).col(INK);
      p.poly([[16, 10], [4, 4], [3, 10], [9, 12]], 'rgba(243,229,191,0.9)', 1.2); p.poly([[16, 10], [28, 4], [29, 10], [23, 12]], 'rgba(243,229,191,0.9)', 1.2);
      for (const s of [-1, 1]) for (let k = 1; k < 3; k++) p.line([[16, 10], [16 + s * (4 + k * 4.5), 4 + k * 0.5]], 0.6);
      p.dot(16, 11, 1.5);
    });
  }

  // ---------------- snowy mountains (variants of the relief glyph with a white cap and fine snow lines)
  function snowPeaks(add, mountainSprite) {
    // the snowy mountains are drawn by js/ink-map.js (mountainSprite(v, true)): a white cap with a ragged snow line
    for (let v = 0; v < 8; v++) add('ms' + v, 76, 64, null, 0, () => mountainSprite(v, true));
    // snowfield and glacier hatching for high ground (pale blue, light)
    for (let v = 0; v < 3; v++) add('snowf' + v, 40, 18, p => { p.col(BLUES); for (let k = 0; k < 4; k++) p.line([[4 + k * 9, 14], [10 + k * 9, 4]], 1.1); p.line([[2, 16], [38, 15]], 0.7); if (v === 1) p.line([[8, 9], [30, 8]], 0.7); p.col(INK); }, 7000 + v);
  }

  // ---------------- fill patterns for the countryside and parks, and the ribbon and banner behind city names
  function patterns(map) {
    const mk = (id, w, h, draw) => { const p = Pen(w, h, hashStr(id), 1); draw(p); return p.done().getContext('2d').getImageData(0, 0, w, h); };
    const put = (id, w, h, draw, opts) => {
      const o = Object.assign({ pixelRatio: 2 }, opts || {});
      if (map.__inkReg) { map.__inkReg.set(id, () => ({ img: mk(id, w, h, draw), opts: o })); return; }   // drawn when first needed
      if (!map.hasImage(id)) map.addImage(id, mk(id, w, h, draw), o);
    };
    // ploughed strips: four directions, ochre and green, faint, tiling seamlessly on 64 px
    const FC = [['rgba(184,149,74,0.10)', 'rgba(150,112,48,0.55)'], ['rgba(125,143,78,0.10)', 'rgba(92,110,52,0.5)']];
    for (let k = 0; k < 8; k++) put('fld' + k, 64, 64, p => {
      const [bg, ln] = FC[k % 2], ang = Math.floor(k / 2);
      p.x.fillStyle = bg; p.x.fillRect(0, 0, 64, 64); p.x.strokeStyle = ln; p.x.lineWidth = 1;
      for (let d = -64; d < 128; d += 8) { p.x.beginPath();
        if (ang === 0) { p.x.moveTo(0, d + 4); p.x.lineTo(64, d + 4); } else if (ang === 1) { p.x.moveTo(d + 4, 0); p.x.lineTo(d + 4, 64); }
        else if (ang === 2) { p.x.moveTo(d, 0); p.x.lineTo(d + 64, 64); } else { p.x.moveTo(d, 64); p.x.lineTo(d + 64, 0); }
        p.x.stroke(); }
    });
    put('vin', 32, 32, p => { p.x.strokeStyle = 'rgba(92,70,50,0.75)'; p.x.lineWidth = 1; for (const y0 of [8, 24]) { p.x.beginPath(); p.x.moveTo(0, y0 + 3); p.x.lineTo(32, y0 + 3); p.x.stroke(); for (const x0 of [4, 12, 20, 28]) { p.x.beginPath(); p.x.moveTo(x0, y0 + 3); p.x.lineTo(x0, y0 - 3); p.x.stroke(); p.x.beginPath(); p.x.arc(x0 + 1.5, y0 - 1, 1.6, 0, 6.3); p.x.strokeStyle = 'rgba(96,120,60,0.8)'; p.x.stroke(); p.x.strokeStyle = 'rgba(92,70,50,0.75)'; } } });
    put('orc', 32, 32, p => { for (const [cx, cy] of [[8, 8], [24, 24]]) { p.x.beginPath(); p.x.arc(cx, cy, 4, 0, 6.3); p.x.fillStyle = 'rgba(185,201,143,0.9)'; p.x.fill(); p.x.lineWidth = 1; p.x.strokeStyle = 'rgba(43,33,25,0.8)'; p.x.stroke(); p.x.beginPath(); p.x.moveTo(cx, cy + 4); p.x.lineTo(cx, cy + 6.5); p.x.stroke(); p.x.fillStyle = '#A3261B'; p.x.beginPath(); p.x.arc(cx - 1.4, cy - 0.6, 0.8, 0, 6.3); p.x.fill(); } });
    put('alt', 32, 32, p => { p.x.strokeStyle = 'rgba(110,96,78,0.7)'; p.x.lineWidth = 0.8; p.x.strokeRect(0.5, 0.5, 15, 15); p.x.strokeRect(16.5, 0.5, 15, 15); p.x.strokeRect(0.5, 16.5, 15, 15); p.x.strokeRect(16.5, 16.5, 15, 15); p.x.strokeStyle = 'rgba(96,120,60,0.7)'; for (let k = 0; k < 4; k++) { p.x.beginPath(); p.x.moveTo(2, 3 + k * 3.5); p.x.lineTo(14, 3 + k * 3.5); p.x.stroke(); p.x.beginPath(); p.x.moveTo(19 + k * 3.5, 18); p.x.lineTo(19 + k * 3.5, 30); p.x.stroke(); } });
    put('mdw', 48, 48, p => { p.x.strokeStyle = 'rgba(92,110,52,0.6)'; p.x.lineWidth = 0.9; for (const [cx, cy] of [[10, 12], [34, 20], [18, 38], [42, 42]]) for (let k = -1; k <= 1; k++) { p.x.beginPath(); p.x.moveTo(cx + k * 1.5, cy); p.x.lineTo(cx + k * 3, cy - 4); p.x.stroke(); } });
    put('prk', 64, 64, p => { p.x.fillStyle = 'rgba(185,201,143,0.35)'; p.x.fillRect(0, 0, 64, 64); for (const [cx, cy] of [[12, 14], [44, 22], [26, 46], [56, 54]]) { p.x.beginPath(); p.x.arc(cx, cy, 4.2, 0, 6.3); p.x.fillStyle = 'rgba(243,229,191,0.95)'; p.x.fill(); p.x.lineWidth = 1.1; p.x.strokeStyle = '#4F6B3A'; p.x.stroke(); p.x.beginPath(); p.x.moveTo(cx, cy + 4.2); p.x.lineTo(cx, cy + 7); p.x.stroke(); } });
    put('par', 32, 32, p => { p.x.fillStyle = 'rgba(185,201,143,0.35)'; p.x.fillRect(0, 0, 32, 32); p.x.strokeStyle = 'rgba(79,107,58,0.85)'; p.x.lineWidth = 1; p.x.strokeRect(3.5, 3.5, 25, 25); p.x.beginPath(); p.x.arc(16, 16, 6, 0, 6.3); p.x.stroke(); p.x.beginPath(); p.x.moveTo(3.5, 3.5); p.x.lineTo(28.5, 28.5); p.x.moveTo(28.5, 3.5); p.x.lineTo(3.5, 28.5); p.x.stroke(); p.x.fillStyle = '#A3261B'; p.x.beginPath(); p.x.arc(16, 16, 1.4, 0, 6.3); p.x.fill(); });
    // a ribbon with a small heraldic shield at its left end, for capitals (stretches to fit the name)
    put('ribbon', 120, 34, p => {
      const R = [[16, 7], [114, 7], [108, 17], [114, 27], [16, 27]];
      p.poly([[6, 12], [16, 9], [16, 25], [6, 30], [10, 21]], '#C9A24A', 1.1);
      p.poly(R, '#FBF3DC', 1.4); p.line([[19, 10], [111, 10]], 0.6); p.line([[19, 24], [111, 24]], 0.6);
      p.poly([[3, 4], [17, 4], [17, 15], [10, 22], [3, 15]], '#A3261B', 1.3); p.poly([[7, 7], [13, 7], [13, 13], [10, 16], [7, 13]], '#C9A24A', 0.8);
    }, { stretchX: [[24, 56], [64, 100]], stretchY: [[12, 22]], content: [22, 8, 104, 26] });
    // a banner with swallowtail ends folded back behind it (the folds in a shaded parchment), a gilt rule and red inner line
    put('banner', 104, 30, p => {
      p.poly([[1, 10], [12, 10], [12, 27], [1, 27], [5, 18.5]], '#E2D0A4', 1.1); p.poly([[103, 10], [92, 10], [92, 27], [103, 27], [99, 18.5]], '#E2D0A4', 1.1);
      p.poly([[8, 24], [12, 27], [12, 24]], '#B9A57A', 0.8); p.poly([[96, 24], [92, 27], [92, 24]], '#B9A57A', 0.8);
      p.poly([[8, 4], [96, 4], [96, 24], [8, 24]], '#FBF3DC', 1.3);
      p.col('#C9A24A'); p.line([[11, 7], [93, 7]], 0.9); p.line([[11, 21], [93, 21]], 0.9); p.col('#A3261B'); p.line([[11, 8.6], [93, 8.6]], 0.35); p.line([[11, 19.4], [93, 19.4]], 0.35); p.col(INK);
    }, { stretchX: [[16, 48], [56, 88]], stretchY: [[11, 17]], content: [13, 5, 91, 23] });
  }

  // ---------------- registration
  function addAll(map, trim, mountainSprite) {
    const out = [];
    const build = (id, w, h, draw, seed, raw) => {
      let c;
      if (raw) c = raw();
      else { const p = Pen(w, h, seed || hashStr(id)); draw(p); c = p.done(); }
      const t = trim(c); return { img: t.getContext('2d').getImageData(0, 0, t.width, t.height), opts: { pixelRatio: 2 * (t.__k || c.__k || 1) } };
    };
    const add = (id, w, h, draw, seed, raw) => {
      // a lazy map (js/ink-map.js) gets a builder, drawn the first time a tile asks for the image
      if (map.__inkReg) map.__inkReg.set(id, () => build(id, w, h, draw, seed, raw));
      else if (!map.hasImage(id)) { const r = build(id, w, h, draw, seed, raw); map.addImage(id, r.img, r.opts); }
      out.push(id);
    };
    settlements(add); heritage(add); landmarks(add); peaks(add); animals(add); vessels(add);
    if (global.InkHouses) global.InkHouses.register(add, Pen);   // regional townhouses, temples and tall houses (js/ink-houses.js)
    if (map.addImage && !map.__fake) patterns(map);
    snowPeaks((id, w, h, draw, seed, raw) => add(id, w, h, draw, seed, raw), mountainSprite);
    return out;
  }
  // a stand-alone canvas for the key and the poster legends: builders are collected once, each icon drawn when first asked for
  let sheet = null;
  function draw(id, mountainSprite) {
    if (!sheet) {
      sheet = { __fake: true, __inkReg: new Map(), hasImage: () => false, addImage: () => {} };
      addAll(sheet, c => c, mountainSprite || (() => document.createElement('canvas')));
      patterns(sheet);
    }
    const f = sheet.__inkReg.get(id); if (!f) return null;
    const img = f().img;
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; c.getContext('2d').putImageData(img, 0, 0);
    return c;
  }
  // every icon id this file can draw (the style uses it to choose snowy variants without testing for images at run time)
  let idList = null;
  function ids() { if (!idList) { const f = { __fake: true, __inkReg: new Map(), hasImage: () => false, addImage: () => {} }; addAll(f, c => c, () => null); patterns(f); idList = [...f.__inkReg.keys()]; } return idList; }
  global.InkIcons = { addAll, draw, ids, INK, RED, BLUE };
})(window);
