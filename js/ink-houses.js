/* The Inked World: regional architecture for the drawn towns (round 5).
 * Every house is drawn from the same bird's-eye viewpoint as the round 4 townhouses (js/ink-icons.js): the street front
 * square on, the depth running up and to the right, the right-hand side in shade. Each world region gets its own set of
 * houses, its own church, mosque or temple, and its own tall "medieval skyscrapers" for the high-rise districts, chosen in
 * js/ink-worker.js from data/house_regions.json (code/02p_house_regions.py). Snowy twins (id + '-s') are drawn the same
 * way with snow on the roofs. All drawings are original, made from simple shapes in the map's own pen; they aim to be
 * respectful and true to each tradition, not caricatures. Sprites are registered lazily: nothing is drawn until a tile
 * asks for it, so only the regions on screen cost anything.
 * Dr Tristan Hotham, Independent researcher, 2026. MIT licence. */
(function (global) {
  'use strict';
  const PAL = global.InkPalette || {};
  const INK = PAL.ink || '#2B2119', RED = PAL.red || '#A3261B', SNOW = PAL.snow || '#FBF8EE', SNOWSH = PAL.snowShade || '#D6E0E6', ICE = PAL.iceLine || '#8FB0CC';
  const GOLD = '#C9982E', DK = '#3A2C20', BEAM = '#4A3526', BLUED = '#2F5F9E', GREEN = '#4E7A52', TURQ = '#3E9AA0';
  const DV = [0.38, -0.7];
  let SNOWY = false;
  const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; }; }

  // ---------------- materials
  // walls: [lit, shade, pattern]
  const WL = {
    fach: ['#EFE3C4', '#CDB98F', 'fach'], fachO: ['#E6C982', '#BFA05A', 'fach'], fachW: ['#F4F0E4', '#CEC8B6', 'fach'], fachR: ['#E9D2B8', '#C4A88C', 'fach'],
    brick: ['#B4634A', '#8C4A36', 'brick'], brickD: ['#8E4A3A', '#6C3628', 'brick'],
    log: ['#8E6440', '#6A4A2E', 'log'], logG: ['#8F8068', '#6A5E4C', 'log'], logY: ['#C9A456', '#A0803A', 'log'],
    falu: ['#A23C2A', '#76291D', 'plank'], ochreP: ['#D3A24A', '#A67C36', 'plank'], whiteP: ['#EFECE2', '#CCC6B6', 'plank'], blueP: ['#7E9AB2', '#5E7890', 'plank'], greenP: ['#86A086', '#647E64', 'plank'], yellowP: ['#E4C460', '#B89C40', 'plank'],
    lime: ['#F7F4EB', '#D6D0C0', 'plain'], white: ['#F1EEE4', '#CFC9B8', 'plain'], stone: ['#CFC3A6', '#A8997A', 'stone'], stoneM: ['#D9C59D', '#B09C76', 'rubble'], stoneG: ['#BDB6A6', '#928C7E', 'rubble'],
    ochre: ['#DDAE68', '#B88A48', 'plain'], pink: ['#E3A898', '#BC8474', 'plain'], yellow: ['#E9CD78', '#C2A656', 'plain'], terra: ['#C8764E', '#A05A38', 'plain'], render: ['#E8D8B0', '#C4AE80', 'plain'],
    mud: ['#C59A6A', '#9C7449', 'mud'], mudR: ['#B97C4E', '#94603A', 'mud'], mudL: ['#D9B98A', '#B09062', 'mud'], mudW: ['#EEE5D0', '#C8BBA0', 'mud'], adobe: ['#C9A57A', '#A28058', 'mud'],
    pB: ['#A6C3D8', '#82A0B4', 'plain'], pY: ['#E8D07E', '#C2AA5A', 'plain'], pG: ['#AECBA4', '#8AA982', 'plain'], pP: ['#E8B0AE', '#C28C8A', 'plain'], pO: ['#EAB87A', '#C49254', 'plain'],
    magenta: ['#C85A86', '#A04066', 'plain'], cobalt: ['#4C76B4', '#365A8E', 'plain'], saffron: ['#E2A33A', '#B88024', 'plain'], teal: ['#5E9C94', '#467A74', 'plain'], lime2: ['#B8C86A', '#94A44C', 'plain'],
    plaster: ['#F3EFE5', '#D0CABC', 'plain'], dkwood: ['#4E3A2A', '#3A2A1E', 'plank'], greyB: ['#A9A69C', '#827F76', 'brick'], redB: ['#AE5A40', '#84422E', 'brick'],
    bamboo: ['#C9A872', '#A0814E', 'bamboo'], wood: ['#9A7350', '#765536', 'plank'], teak: ['#7A5232', '#5C3C22', 'plank'],
    coral: ['#EDE6D4', '#C8BFA8', 'plain'], sand: ['#DDB874', '#B49252', 'stone'], pinkJ: ['#DC8E78', '#B46C58', 'plain'], blueJ: ['#86AEDA', '#6488B4', 'plain'], laterite: ['#B4643E', '#8E4A2C', 'plain'],
  };
  // roofs: [lit, shade, texture]
  const RF = {
    tile: ['#B4472E', '#86301F', 'tile'], tileD: ['#8E4A34', '#653224', 'tile'], terra: ['#C46A40', '#97492A', 'pan'], terraL: ['#CF7E50', '#A05A36', 'pan'],
    slate: ['#6E6470', '#4C4452', 'slate'], slateB: ['#5C6470', '#424852', 'slate'], stoneS: ['#8E8A80', '#6C685E', 'slate'],
    thatch: ['#B79A5E', '#8C7442', 'thatch'], thatchD: ['#9C8250', '#76603A', 'thatch'], straw: ['#CDB070', '#A48A50', 'thatch'], palm: ['#A8955C', '#80703E', 'thatch'],
    turf: ['#7F9156', '#5E6E3C', 'turf'], shingle: ['#7D5A3F', '#5A3E2A', 'shingle'], plank: ['#8A7C68', '#665A4A', 'shingle'],
    green: ['#5F8466', '#436049', 'iron'], iron: ['#9AA0A2', '#727678', 'iron'], blueI: ['#5E80A4', '#43607E', 'iron'], redI: ['#A65440', '#7C3C2C', 'iron'],
    ink: ['#5C616A', '#3E424A', 'glaze'], greyT: ['#7C7E80', '#5A5C5E', 'glaze'], jade: ['#4F8A72', '#3A6856', 'glaze'], gold: ['#D4A43E', '#A87E28', 'glaze'], orange: ['#C8642E', '#9C4A20', 'glaze'], blueT: ['#3F78A8', '#2C5A82', 'glaze'],
  };

  // ---------------- pieces
  function polyline(p, pts, lw, col) { p.col(col || INK); p.line(pts, lw); p.col(INK); }
  function clipDo(p, pts, f) { const x = p.x; x.save(); x.beginPath(); pts.forEach((q, i) => i ? x.lineTo(q[0], q[1]) : x.moveTo(q[0], q[1])); x.closePath(); x.clip(); f(); x.restore(); x.strokeStyle = INK; }
  // a roof slope: eave polyline (lifted at the ends for curved eaves) and the two top corners t1 (above the eave's end) and t0
  function slope(p, eave, t1, t0, R, shaded, texo) {
    const poly = eave.concat([t1, t0]), tex = texo || R[2], n = eave.length - 1;
    p.poly(poly, shaded ? R[1] : R[0], 0.85);
    const at = u => { const f = Math.max(0, Math.min(n - 1e-6, u * n)), i = Math.floor(f); return lerp(eave[i], eave[i + 1], f - i); }, tp = u => lerp(t0, t1, u);
    const L = Math.hypot(eave[n][0] - eave[0][0], eave[n][1] - eave[0][1]);
    clipDo(p, poly, () => {
      if (tex === 'tile' || tex === 'slate' || tex === 'shingle') {
        const k = tex === 'slate' ? 6 : 5;
        for (let i = 1; i < k; i++) { const t = i / k, pts = []; for (let j = 0; j <= 8; j++) { const u = j / 8; pts.push(lerp(at(u), tp(u), t)); } p.col('rgba(30,20,14,0.42)').line(pts, 0.42); }
        if (tex === 'shingle') for (let i = 0; i < L * 1.2; i++) { const u = p.R(), t = p.R(); const a = lerp(at(u), tp(u), t); p.col('rgba(30,20,14,0.35)').line([a, [a[0] + 0.1, a[1] + 0.7]], 0.3); }
      } else if (tex === 'pan' || tex === 'iron' || tex === 'glaze') {
        const m = Math.max(3, Math.round(L / (tex === 'iron' ? 0.9 : tex === 'glaze' ? 1.05 : 1.25)));
        for (let j = 1; j < m; j++) { const u = j / m; p.col(tex === 'glaze' ? 'rgba(15,15,25,0.5)' : tex === 'iron' ? 'rgba(40,40,40,0.35)' : 'rgba(30,20,14,0.4)').line([at(u), tp(u)], tex === 'iron' ? 0.3 : 0.5); }
        if (tex === 'pan') for (let i = 1; i < 3; i++) { const t = i / 3, pts = []; for (let j = 0; j <= 8; j++) { const u = j / 8; pts.push(lerp(at(u), tp(u), t)); } p.col('rgba(30,20,14,0.22)').line(pts, 0.35); }
      } else if (tex === 'thatch') {
        const m = Math.round(L * 2.2);
        for (let j = 0; j < m; j++) { const u = p.R(), t0_ = p.R() * 0.8, du = (p.R() - 0.5) * 0.04; p.col(p.R() < 0.5 ? 'rgba(80,58,24,0.55)' : 'rgba(240,220,160,0.45)').line([lerp(at(u), tp(u), t0_), lerp(at(u + du), tp(u + du), t0_ + 0.25)], 0.4); }
        for (let i = 1; i < 3; i++) { const t = i / 3, pts = []; for (let j = 0; j <= 8; j++) { const u = j / 8; pts.push(lerp(at(u), tp(u), t)); } p.col('rgba(70,50,20,0.35)').line(pts, 0.5); }
      } else if (tex === 'turf') {
        for (let j = 0; j < L * 3; j++) { const u = p.R(), t = p.R(); const a = lerp(at(u), tp(u), t); p.col(p.R() < 0.6 ? 'rgba(60,80,30,0.7)' : 'rgba(170,190,110,0.8)').line([a, [a[0] + 0.3, a[1] - 0.8]], 0.4); }
        if (!SNOWY) for (let j = 0; j < 3; j++) { const u = 0.15 + p.R() * 0.7, a = lerp(at(u), tp(u), 0.3 + p.R() * 0.4); p.dot(a[0], a[1], 0.35, ['#E8D46A', '#F2F0E6', '#C85A5A'][j]); }
      }
    });
    if (SNOWY) {
      const k = 8, edge = [];
      for (let i = 0; i <= k; i++) { const u = i / k, dip = 0.22 + 0.07 * Math.sin(i * 2.3 + eave[0][0]); edge.push(lerp(at(u), tp(u), dip)); }
      p.poly([t0, t1].concat(edge.slice().reverse()), shaded ? SNOWSH : SNOW, 0);
      p.col(shaded ? 'rgba(110,135,160,0.55)' : 'rgba(150,170,190,0.6)').line(edge, 0.45).col(INK);
    }
    polyline(p, eave, tex === 'thatch' ? 1.4 : 1.15, tex === 'thatch' ? '#5E4A28' : '#3E2A20');
  }
  function eaveLine(a, b, lift) {
    if (!lift) return [a, b];
    const out = []; for (let i = 0; i <= 10; i++) { const u = i / 10, q = lerp(a, b, u); q[1] -= lift * Math.pow(Math.abs(2 * u - 1), 2.6); q[0] += (u < 0.5 ? -1 : 1) * lift * 0.25 * Math.pow(Math.abs(2 * u - 1), 3); out.push(q); }
    return out;
  }
  // wall texture, clipped to the wall polygon; box = {x0, x1, top, gy, rows}
  function face(p, pts, W, shaded, box) {
    p.poly(pts, shaded ? W[1] : W[0], 0.85);
    if (shaded) { p.hatch(pts, 70, 1.5, 0.42, 'rgba(43,33,25,0.42)'); if (W[2] === 'log') clipDo(p, pts, () => { for (let y = 0; y < 60; y += 1.15) p.col('rgba(40,25,15,0.4)').line([[0, y], [60, y - 20]], 0.3); }); return; }
    if (!box) return;
    const { x0, x1, top, gy } = box, rows = box.rows || 1, pat = W[2];
    clipDo(p, pts, () => {
      if (pat === 'fach') {
        p.col(BEAM);
        const sh = (gy - top) / rows;
        for (let r = 0; r <= rows; r++) p.line([[x0 - 1, gy - r * sh], [x1 + 1, gy - r * sh]], 0.75);
        const bays = Math.max(2, Math.round((x1 - x0) / 3.2));
        for (let i = 0; i <= bays; i++) { const xx = x0 + 0.45 + (x1 - x0 - 0.9) * i / bays; p.line([[xx, gy], [xx, top - 12]], i === 0 || i === bays ? 0.85 : 0.6); }
        for (let r = 0; r < rows + 2; r++) for (let i = 0; i < bays; i++) if ((i + r) % 2 === 0) {
          const xa = x0 + 0.45 + (x1 - x0 - 0.9) * i / bays, xb = x0 + 0.45 + (x1 - x0 - 0.9) * (i + 1) / bays, y0 = gy - r * sh, y1 = y0 - sh;
          if (i % 3 === 1) { p.line([[xa, y0], [(xa + xb) / 2, y1]], 0.5); p.line([[xb, y0], [(xa + xb) / 2, y1]], 0.5); } else p.line([[i < bays / 2 ? xa : xb, y0], [i < bays / 2 ? xb : xa, y1]], 0.5);
        }
      } else if (pat === 'brick') { for (let y = gy - 0.9; y > top - 14; y -= 0.95) p.col('rgba(70,25,15,0.3)').line([[x0 - 1, y], [x1 + 1, y]], 0.28); }
      else if (pat === 'log') { for (let y = gy - 1.1; y > top - 14; y -= 1.15) p.col('rgba(40,25,15,0.55)').line([[x0 - 1, y], [x1 + 1, y]], 0.42); }
      else if (pat === 'plank') { for (let xx = x0 + 1; xx < x1; xx += 1.1) p.col('rgba(30,20,14,0.22)').line([[xx, gy], [xx, top - 14]], 0.3); }
      else if (pat === 'stone') { for (let y = gy - 1.5; y > top - 14; y -= 1.55) p.col('rgba(95,80,58,0.5)').line([[x0, y], [x1, y]], 0.32); }
      else if (pat === 'rubble') { p.col('rgba(95,80,58,0.4)'); for (let y = gy - 1.2, r = 0; y > top - 8; y -= 1.25, r++) { p.line([[x0, y], [x1, y]], 0.25); for (let xx = x0 + (r % 2) * 0.9 + 0.4; xx < x1; xx += 1.8 + (r % 3) * 0.3) p.line([[xx, y], [xx, y + 1.25]], 0.22); } p.col(INK); }
      else if (pat === 'mud') { for (let i = 0; i < (x1 - x0) / 2; i++) { const cx = x0 + p.R() * (x1 - x0), cy = top + p.R() * (gy - top); p.ell(cx, cy, 1.2, 0.5, 'rgba(255,240,210,0.25)', 0); } }
      else if (pat === 'bamboo') { p.hatch(pts, 45, 1.1, 0.3, 'rgba(90,60,20,0.35)'); p.hatch(pts, -45, 1.1, 0.3, 'rgba(90,60,20,0.35)'); }
    });
    if (pat === 'stone' && box.quoin !== false) { p.rect(x0, top, 1.1, gy - top, '#E6DBC2', 0.35); p.rect(x1 - 1.1, top, 1.1, gy - top, '#E6DBC2', 0.35); }
    if (pat === 'log') for (let y = gy - 0.6; y > top; y -= 1.15) { p.col('#5A3C22').line([[x0 - 0.7, y], [x0 + 0.1, y]], 0.55); }
  }
  // windows: a row centred in [x0, x1] at y (top of the window)
  function win(p, cx, y, k, c, s) {
    s = s || 1; const w = 1.3 * s, h = 1.6 * s;
    if (k === 'none') return;
    if (k === 'arch') { p.poly([[cx - w / 2, y + h], [cx - w / 2, y + 0.5], [cx, y - 0.2], [cx + w / 2, y + 0.5], [cx + w / 2, y + h]], DK, 0); return; }
    if (k === 'slit') { p.rect(cx - 0.3, y, 0.6, h, DK, 0); return; }
    if (k === 'small') { p.rect(cx - 0.45, y + 0.4, 0.9, 0.9, DK, 0); return; }
    if (k === 'round') { p.dot(cx, y + 0.8, 0.6, DK); return; }
    if (k === 'tri') { p.poly([[cx - 0.7, y + 1.4], [cx, y + 0.2], [cx + 0.7, y + 1.4]], DK, 0); return; }
    p.rect(cx - w / 2, y, w, h, DK, 0);
    if (k === 'shut') { p.rect(cx - w / 2 - 0.7, y, 0.6, h, c || GREEN, 0); p.rect(cx + w / 2 + 0.1, y, 0.6, h, c || GREEN, 0); }
    else if (k === 'frame') { p.col(c || '#F4F0E4').line([[cx - w / 2 - 0.25, y + h + 0.2], [cx - w / 2 - 0.25, y - 0.2], [cx + w / 2 + 0.25, y - 0.2], [cx + w / 2 + 0.25, y + h + 0.2], [cx - w / 2 - 0.25, y + h + 0.2]], 0.4).col(INK); }
    else if (k === 'nal') {   // carved frames of a Russian or Ukrainian house: a white surround with a peaked crown and painted shutters
      p.poly([[cx - w / 2 - 0.4, y - 0.3], [cx, y - 1.4], [cx + w / 2 + 0.4, y - 0.3]], c || '#F4F0E4', 0.3);
      p.col(c || '#F4F0E4').line([[cx - w / 2 - 0.3, y + h + 0.5], [cx - w / 2 - 0.3, y - 0.2]], 0.45).line([[cx + w / 2 + 0.3, y + h + 0.5], [cx + w / 2 + 0.3, y - 0.2]], 0.45).line([[cx - w / 2 - 0.5, y + h + 0.5], [cx + w / 2 + 0.5, y + h + 0.5]], 0.5).col(INK);
      p.rect(cx - w / 2 - 1.1, y, 0.6, h, '#4C78A8', 0); p.rect(cx + w / 2 + 0.5, y, 0.6, h, '#4C78A8', 0);
    } else if (k === 'grille') { p.col('#8A8A88'); for (let i = 1; i < 3; i++) p.line([[cx - w / 2 + i * w / 3, y], [cx - w / 2 + i * w / 3, y + h]], 0.25); p.col(INK); p.rect(cx - w / 2 - 0.3, y + h, w + 0.6, 0.35, c || '#F4F0E4', 0); }
    else if (k === 'lat') { p.rect(cx - w / 2 - 0.3, y - 0.3, w + 0.6, h + 0.6, c || '#7A5232', 0.3); p.col('rgba(240,220,180,0.6)'); for (let i = 1; i < 3; i++) p.line([[cx - w / 2 + i * w / 3, y], [cx - w / 2 + i * w / 3, y + h]], 0.2); p.line([[cx - w / 2, y + h / 2], [cx + w / 2, y + h / 2]], 0.2); p.col(INK); }
    else if (k === 'paint') { p.col(c || '#C9982E').line([[cx - w / 2 - 0.4, y + h + 0.3], [cx - w / 2 - 0.4, y - 0.4], [cx, y - 1], [cx + w / 2 + 0.4, y - 0.4], [cx + w / 2 + 0.4, y + h + 0.3]], 0.42).col(INK); p.rect(cx - w / 2 - 0.7, y, 0.5, h, GREEN, 0); p.rect(cx + w / 2 + 0.2, y, 0.5, h, GREEN, 0); }
    else if (k === 'blue') { p.col('#3F6FB0').line([[cx - w / 2 - 0.3, y + h + 0.3], [cx - w / 2 - 0.3, y - 0.3], [cx + w / 2 + 0.3, y - 0.3], [cx + w / 2 + 0.3, y + h + 0.3], [cx - w / 2 - 0.3, y + h + 0.3]], 0.45).col(INK); }
  }
  function windows(p, x0, x1, top, gy, rows, k, c, opt) {
    opt = opt || {};
    const w = x1 - x0, n = opt.n || Math.max(1, Math.round(w / (opt.gap || 3.6))), sh = (gy - top) / rows;
    for (let r = opt.skip0 ? 1 : 0; r < rows; r++) {
      const y = gy - (r + 1) * sh + sh * 0.25;
      if (sh < 2.6) continue;
      for (let i = 0; i < n; i++) { const cx = x0 + (i + 0.5) * w / n; if (r === 0 && opt.doorAt !== undefined && Math.abs(cx - (x0 + w * opt.doorAt)) < 1.6) continue; win(p, cx, y, k, c, opt.s); }
    }
  }
  function door(p, cx, gy, k, c) {
    if (k === 'none') return;
    if (k === 'arch') { p.poly([[cx - 0.95, gy], [cx - 0.95, gy - 2], [cx, gy - 3], [cx + 0.95, gy - 2], [cx + 0.95, gy]], c || DK, 0); return; }
    if (k === 'carved') {   // a Swahili door: a carved frame, studs and a stepped lintel
      p.rect(cx - 1.5, gy - 3.6, 3, 3.6, '#6A4428', 0.35); p.rect(cx - 0.9, gy - 3, 1.8, 3, c || '#3A2416', 0); p.rect(cx - 1.8, gy - 4.2, 3.6, 0.7, '#6A4428', 0.35);
      for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) p.dot(cx - 0.45 + j * 0.9, gy - 2.4 + i * 0.8, 0.16, GOLD);
      return;
    }
    if (k === 'big') { p.poly([[cx - 1.3, gy], [cx - 1.3, gy - 2.6], [cx, gy - 3.6], [cx + 1.3, gy - 2.6], [cx + 1.3, gy]], c || DK, 0.3); return; }
    p.rect(cx - 0.85, gy - 2.6, 1.7, 2.6, c || DK, 0);
  }
  function chimney(p, q, h) { p.rect(q[0] - 0.9, q[1] - h, 1.8, h, '#8A5A44', 0.7); p.rect(q[0] - 1.2, q[1] - h - 0.7, 2.4, 0.8, DK, 0); if (SNOWY) p.ell(q[0], q[1] - h - 0.8, 1.3, 0.6, SNOW, 0.3); }
  function dome(p, c, r, col, opt) {
    opt = opt || {};
    const pts = []; for (let i = 0; i <= 16; i++) { const a = Math.PI + Math.PI * i / 16; pts.push([c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r * (opt.tall || 1)]); }
    if (opt.onion) { pts.length = 0; const R = r; pts.push([c[0] - R * 0.8, c[1]], [c[0] - R * 1.05, c[1] - R * 0.7], [c[0] - R * 0.55, c[1] - R * 1.45], [c[0], c[1] - R * 2.1], [c[0] + R * 0.55, c[1] - R * 1.45], [c[0] + R * 1.05, c[1] - R * 0.7], [c[0] + R * 0.8, c[1]]); }
    p.poly(pts, SNOWY && !opt.nosnow ? SNOW : col, 0.7);
    clipDo(p, pts, () => { p.ell(c[0] + r * 0.45, c[1] - r * 0.3, r * 0.8, r * 1.6, 'rgba(30,20,20,0.22)', 0); });
    if (opt.stars) for (let i = 0; i < 4; i++) p.dot(c[0] - r * 0.5 + p.R() * r, c[1] - r * (0.3 + p.R() * (opt.onion ? 1.4 : 0.6)), 0.2, GOLD);
    if (opt.fin) { const top = opt.onion ? c[1] - r * 2.1 : c[1] - r * (opt.tall || 1); p.col(opt.finCol || GOLD).line([[c[0], top], [c[0], top - 1.8]], 0.5); if (opt.fin === 'cross') p.line([[c[0] - 0.6, top - 1.3], [c[0] + 0.6, top - 1.3]], 0.45); else if (opt.fin === 'crescent') p.ell(c[0], top - 2.2, 0.45, 0.45, null, 0.35); else p.dot(c[0], top - 1.9, 0.35, opt.finCol || GOLD); p.col(INK); }
  }

  // ---------------- one house
  // o: x (left of the street front), gy (ground), w (front), d (depth), hw (wall height), rh (roof rise), form, wall, roof,
  // ov (eaves overhang), lift (upturned eaves), rows (storeys), win, wc (window/shutter colour), door, dc, doorAt, and extras
  function H(p, o) {
    o = Object.assign({ gy: 33, d: 12, hw: 5, rh: 6, ov: 0, form: 'eaves', wall: 'render', roof: 'tile', rows: 1, win: 'sq', door: 'plain', doorAt: 0.5 }, o);
    if (o.form === 'flat' || o.form === 'dome') o.d = o.d * 0.72;
    const W = WL[o.wall], R = RF[o.roof], X0 = o.x, GY = o.gy - (o.stilt || 0), w = o.w, d = o.d, Hh = o.hw, rh = o.rh, ov = o.ov, ovf = ov * 0.8;
    const Q = (x, dd, h) => [X0 + x + DV[0] * dd, GY - h + DV[1] * dd];
    const top = GY - Hh, x1 = X0 + w;
    if (o.stilt) {
      const s = o.stilt;
      for (const [xx, dd] of [[0.4, 0], [w * 0.5, 0], [w - 0.4, 0], [w - 0.4, d * 0.9]]) { const a = Q(xx, dd, 0); p.col(BEAM).line([a, [a[0], a[1] + s]], 0.75).col(INK); }
      p.col('rgba(43,33,25,0.25)').line([[X0, o.gy], [X0 + w + DV[0] * d, o.gy + DV[1] * d]], 0.4).col(INK);
      if (o.ladder !== false) { const a = Q(w * 0.25, 0, 0); p.col(BEAM).line([[a[0] - 0.6, a[1]], [a[0] - 1.6, a[1] + s]], 0.45).line([[a[0] + 0.6, a[1]], [a[0] - 0.4, a[1] + s]], 0.45); for (let k = 1; k < 4; k++) p.line([[a[0] - 0.6 - k * s / 4 * 0.25, a[1] + k * s / 4], [a[0] + 0.6 - k * s / 4 * 0.25, a[1] + k * s / 4]], 0.35); p.col(INK); }
    }
    const box = { x0: X0, x1, top, gy: GY, rows: o.rows, quoin: o.quoin };
    // side wall
    face(p, [Q(w, 0, 0), Q(w, d, 0), Q(w, d, Hh), Q(w, 0, Hh)], W, true);
    const frontWall = (pts) => {
      if (o.base) { face(p, pts, W, false, box); const bh = o.base[1]; p.poly([Q(0, 0, 0), Q(w, 0, 0), Q(w, 0, bh), Q(0, 0, bh)], o.base[0], 0.6); p.poly([Q(w, 0, 0), Q(w, d, 0), Q(w, d, bh), Q(w, 0, bh)], o.base[0], 0.5); p.hatch([Q(w, 0, 0), Q(w, d, 0), Q(w, d, bh), Q(w, 0, bh)], 70, 1.3, 0.4, 'rgba(43,33,25,0.45)'); }
      else face(p, pts, W, false, box);
      if (o.jet) { const jt = GY - Hh * 0.5; p.poly([[X0 - 0.7, jt], [x1 + 0.7, jt], [x1 + 0.7, top], [X0 - 0.7, top]], WL[o.jetWall || o.wall][0], 0.8); face(p, [[X0 - 0.7, jt], [x1 + 0.7, jt], [x1 + 0.7, top - (o.form === 'gable' ? 0 : 0)], [X0 - 0.7, top]], WL[o.jetWall || o.wall], false, { x0: X0 - 0.7, x1: x1 + 0.7, top, gy: jt, rows: 1 }); p.col(BEAM).line([[X0 - 0.9, jt], [x1 + 0.9, jt]], 1).col(INK); }
      if (o.azul) clipDo(p, [Q(0, 0, 0), Q(w, 0, 0), Q(w, 0, Hh), Q(0, 0, Hh)], () => { for (let y = GY - 0.6; y > top; y -= 1) for (let xx = X0 + 0.5; xx < x1; xx += 1) p.dot(xx + ((y * 7) % 1 > 0.5 ? 0.5 : 0), y, 0.22, o.azul); });
      if (o.band) p.rect(X0, GY - o.band[1], w, o.band[1], o.band[0], 0.4);
      if (o.ndebele !== undefined) ndebele(p, X0, x1, top, GY, o.ndebele);
      if (o.relief) relief(p, X0, x1, top, GY, o.relief);
      if (o.arc) arcade(p, X0, x1, GY, o.arc, o.arcH || Hh / o.rows);
      windows(p, X0, x1, top, GY, o.rows, o.win, o.wc, { n: o.wn, gap: o.wgap, doorAt: o.door !== 'none' ? o.doorAt : undefined, skip0: !!o.arc, s: o.ws });
      if (o.door !== 'none' && !o.arc) door(p, X0 + w * o.doorAt, GY, o.door, o.dc);
      if (o.bal) balcony(p, X0, x1, GY - Hh / o.rows * (o.balAt || 1), o.bal, o.balCol);
      if (o.pots) for (let i = 0; i < o.pots; i++) { const xx = X0 + (i + 0.6) * w / (o.pots + 0.2); p.ell(xx, GY - Hh * 0.62, 0.5, 0.45, '#2F5F9E', 0.25); p.dot(xx, GY - Hh * 0.62 - 0.7, 0.45, i % 2 ? '#C83A3A' : '#5E8A3A'); }
      if (o.flowers) for (let i = 0; i < 3; i++) { const xx = X0 + (i + 0.5) * w / 3; p.rect(xx - 0.9, GY - Hh * 0.55, 1.8, 0.45, '#6A4A2E', 0); p.dot(xx - 0.4, GY - Hh * 0.55 - 0.2, 0.35, '#C83A3A'); p.dot(xx + 0.4, GY - Hh * 0.55 - 0.2, 0.35, '#D85A4A'); }
      if (o.lac) { p.col('#A8281C'); for (let i = 0; i <= o.lac; i++) { const xx = X0 + 0.4 + (w - 0.8) * i / o.lac; p.line([[xx, GY], [xx, top + 0.2]], 0.75); } p.col(INK); }
      if (o.lant) for (let i = 0; i < o.lant; i++) { const xx = X0 + (i + 0.5) * w / o.lant; p.ell(xx, top + 1.3, 0.55, 0.7, '#C8321E', 0.25); }
      if (o.vera) veranda(p, X0, x1, GY, Hh * (o.veraH || 0.75), o.vera);
      if (o.trim) { p.col(o.trim).line([[X0 + 0.2, GY], [X0 + 0.2, top]], 0.7).line([[x1 - 0.2, GY], [x1 - 0.2, top]], 0.7).col(INK); }
      if (o.stair) { const s0 = [x1 - 0.2, GY], s1 = [X0 + w * 0.55, GY - Hh * 0.5]; p.poly([s0, s1, [s1[0], s1[1] + 0.9], [s0[0], s0[1]]], WL[o.wall][1], 0.5); for (let k = 1; k < 5; k++) { const q = lerp(s0, s1, k / 5); p.line([[q[0], q[1]], [q[0], q[1] + 0.8]], 0.3); } }
      if (o.mash) for (let i = 0; i < o.mash; i++) { const cx = X0 + (i + 0.5) * w / o.mash, yb = GY - Hh * 0.45; p.poly([[cx - 1.5, yb], [cx - 1.5, yb - 2.6], [cx + 1.5, yb - 2.6], [cx + 1.5, yb]], '#7A5232', 0.45); clipDo(p, [[cx - 1.4, yb - 0.2], [cx - 1.4, yb - 2.4], [cx + 1.4, yb - 2.4], [cx + 1.4, yb - 0.2]], () => { p.hatch([[cx - 2, yb], [cx - 2, yb - 3], [cx + 2, yb - 3], [cx + 2, yb]], 45, 0.6, 0.2, 'rgba(240,220,170,0.7)'); p.hatch([[cx - 2, yb], [cx - 2, yb - 3], [cx + 2, yb - 3], [cx + 2, yb]], -45, 0.6, 0.2, 'rgba(240,220,170,0.7)'); }); p.poly([[cx - 1.8, yb - 2.6], [cx + 1.8, yb - 2.6], [cx + 1.3, yb - 3.2], [cx - 1.3, yb - 3.2]], '#6A4428', 0.3); }
      if (o.jhar) for (let i = 0; i < o.jhar; i++) { const cx = X0 + (i + 0.5) * w / o.jhar, yb = GY - Hh * (o.rows > 2 ? 0.55 : 0.5); p.poly([[cx - 1.4, yb], [cx - 1.2, yb - 2.2], [cx + 1.2, yb - 2.2], [cx + 1.4, yb]], W[0], 0.45); win(p, cx, yb - 1.9, 'arch', null, 0.9); p.poly([[cx - 1.7, yb - 2.2], [cx + 1.7, yb - 2.2], [cx + 1, yb - 3], [cx - 1, yb - 3]], W[1], 0.35); p.ell(cx, yb - 3, 0.7, 0.6, W[0], 0.3, Math.PI, Math.PI * 2); p.line([[cx - 1.4, yb], [cx, yb + 0.8], [cx + 1.4, yb]], 0.35); }
      if (o.bay) { const cx = X0 + w * 0.5, yb = GY - Hh * 0.45; p.poly([[cx - 2.4, yb], [cx - 2.4, top + 0.4], [cx + 2.4, top + 0.4], [cx + 2.4, yb]], WL[o.bay][0], 0.6); p.line([[cx - 2.4, yb], [cx - 1.4, yb + 1.1], [cx + 1.4, yb + 1.1], [cx + 2.4, yb]], 0.45); windows(p, cx - 2.4, cx + 2.4, top + 0.4, yb, 1, 'sq', null, { n: 3, s: 0.8 }); }
      if (o.toron) toron(p, X0, x1, top, GY, o.toron);
      if (o.butt) for (let i = 0; i <= o.butt; i++) { const xx = X0 + (w) * i / o.butt; p.poly([[xx - 0.7, GY], [xx - 0.45, top - 1.6], [xx + 0.45, top - 1.6], [xx + 0.7, GY]], W[0], 0.5); p.poly([[xx - 0.45, top - 1.6], [xx, top - 3], [xx + 0.45, top - 1.6]], W[0], 0.4); }
      if (o.paintG) p.ell(X0 + w / 2, top + 1.6, 1.2, 1, o.paintG, 0.3);
      if (o.sgraf) { p.col('rgba(60,50,40,0.6)'); p.line([[X0 + 0.6, top + 0.8], [x1 - 0.6, top + 0.8]], 0.3); for (let xx = X0 + 1; xx < x1 - 0.5; xx += 1.2) p.line([[xx, top + 0.8], [xx + 0.6, top + 1.4], [xx + 1.2, top + 0.8]], 0.25); p.col(INK); }
    };
    const f = o.form;
    if (f === 'gable' || f === 'step' || f === 'bell' || f === 'half' || f === 'cape') {
      // ridge runs back from the street; slopes first, then the gable front over them
      const ridgeH = Hh + rh, xm = w / 2;
      const rs = [Q(w + ov, -ovf, Hh), Q(w + ov, d + ovf, Hh)];
      slope(p, eaveLine(rs[0], rs[1], 0), Q(xm, d + ovf, ridgeH), Q(xm, -ovf, ridgeH), R, true);
      if (o.chim) chimney(p, Q(xm + 1.2, d * 0.65, ridgeH - 1.2), 2.6);
      let gpts;
      if (f === 'step') {
        const n = o.steps || 4, pts = [Q(0, 0, 0), Q(w, 0, 0), Q(w, 0, Hh)];
        for (let k = 0; k < n; k++) { const xa = w - k * xm / n, xb = w - (k + 1) * xm / n + 0.0, ya = Hh + (k + 1) * rh / n; pts.push(Q(xa, 0, ya), Q(xb + (k === n - 1 ? 0.8 : 0), 0, ya)); }
        const left = pts.slice(3).map(q => [2 * (X0 + xm) - q[0], q[1]]).reverse(); gpts = pts.concat(left).concat([Q(0, 0, Hh)]);
      } else if (f === 'bell' || f === 'cape') {
        const pts = [Q(0, 0, 0), Q(w, 0, 0), Q(w, 0, Hh)], k = f === 'cape' ? 1 : 0.85;
        const curve = [[w, Hh], [w - 0.4, Hh + rh * 0.25], [w - w * 0.1, Hh + rh * 0.45], [w - w * 0.25, Hh + rh * 0.55], [w - w * 0.3, Hh + rh * 0.8 * k], [w - w * 0.38, Hh + rh * 0.95], [xm + 0.6, Hh + rh * 1.05], [xm, Hh + rh * 1.15]];
        for (const [a, b] of curve) pts.push(Q(a, 0, b));
        for (const [a, b] of curve.slice().reverse().slice(1)) pts.push(Q(w - a, 0, b));
        gpts = pts;
      } else if (f === 'half') gpts = [Q(0, 0, 0), Q(w, 0, 0), Q(w, 0, Hh), Q(xm + w * 0.18, 0, Hh + rh * 0.66), Q(xm - w * 0.18, 0, Hh + rh * 0.66), Q(0, 0, Hh)];
      else gpts = [Q(0, 0, 0), Q(w, 0, 0), Q(w, 0, Hh), Q(xm, 0, ridgeH), Q(0, 0, Hh)];
      if (f === 'half') slope(p, [Q(xm - w * 0.18 - 0.3, -ovf, Hh + rh * 0.66 - 0.2), Q(xm + w * 0.18 + 0.3, -ovf, Hh + rh * 0.66 - 0.2)], Q(xm, d * 0.12, ridgeH), Q(xm, d * 0.12, ridgeH), R, false);
      const gbox = Object.assign({}, box, { top: GY - ridgeH });
      face(p, gpts, W, false, Object.assign(gbox, { rows: o.rows + 1 }));
      // the gable front's openings: loft window and the storeys below
      const saveRows = o.rows; frontWall.call(null, [Q(0, 0, 0), Q(w, 0, 0), Q(w, 0, Hh), Q(0, 0, Hh)]); o.rows = saveRows;
      if (f === 'gable' || f === 'half') { polyline(p, f === 'half' ? [Q(0, 0, Hh), Q(xm - w * 0.18, 0, Hh + rh * 0.66), Q(xm + w * 0.18, 0, Hh + rh * 0.66), Q(w, 0, Hh)] : [Q(0, 0, Hh), Q(xm, 0, ridgeH), Q(w, 0, Hh)], 0.8, BEAM); }
      if (ov > 0 && f === 'gable') { p.poly([Q(-ov, -ovf, Hh - 0.4), Q(xm, -ovf, ridgeH + 0.5), Q(w + ov, -ovf, Hh - 0.4), Q(w, 0, Hh), Q(xm, 0, ridgeH), Q(0, 0, Hh)], R[1], 0.6); }
      if (o.carve) { // carved bargeboards and a sun in the gable (Russian izba)
        const a = Q(-0.2, -0.1, Hh), b = Q(xm, -0.1, ridgeH + 0.3), c = Q(w + 0.2, -0.1, Hh);
        for (const [s, e] of [[a, b], [c, b]]) { p.col('#F2EEE2').line([s, e], 0.9); for (let k = 1; k < 6; k++) { const q = lerp(s, e, k / 6); p.dot(q[0], q[1] + 0.7, 0.3, '#F2EEE2'); } }
        p.col(INK); p.ell(X0 + xm, GY - Hh - rh * 0.42, 1.1, 1.1, '#F2EEE2', 0.35); p.dot(X0 + xm, GY - Hh - rh * 0.42, 0.5, '#4C78A8'); p.col('#F2EEE2').line([b, [b[0], b[1] - 1.6]], 0.6).col(INK);
      } else if (f === 'gable' && rh > 3) win(p, X0 + xm, GY - Hh - rh * 0.55, o.loft || (o.win === 'nal' ? 'sq' : o.win === 'lat' ? 'lat' : 'sq'), o.wc, 0.8);
      if (f === 'step') polyline(p, gpts.slice(2), 0.6, 'rgba(40,20,15,0.6)');
      if (f === 'bell' || f === 'cape') { const q = Q(xm, 0, Hh + rh * 1.15); p.ell(q[0], q[1] - 0.3, 0.6, 0.6, W[0], 0.4); win(p, X0 + xm, GY - Hh - rh * 0.55, 'round'); }
      if (o.gfin) { const q = Q(xm, 0, ridgeH); p.col(o.gfin).line([q, [q[0] + 0.5, q[1] - 2], [q[0] + 1.3, q[1] - 2.3]], 0.6).col(INK); for (const s of [Q(-ov, -ovf, Hh), Q(w + ov, -ovf, Hh)]) p.col(o.gfin).line([s, [s[0] + (s[0] < q[0] ? -0.8 : 0.8), s[1] - 1]], 0.55).col(INK); }
      if (o.cross) { const q = Q(xm, 0, ridgeH); p.line([q, [q[0], q[1] - 2.4]], 0.5).line([[q[0] - 0.7, q[1] - 1.7], [q[0] + 0.7, q[1] - 1.7]], 0.45); }
      if (SNOWY && f !== 'gable') { const q = Q(xm, 0, ridgeH); p.ell(q[0], q[1] + 0.2, 0.9, 0.35, SNOW, 0); }
    } else if (f === 'flat' || f === 'dome') {
      const rt = Q(0, 0, Hh), roofTop = [Q(0, 0, Hh), Q(w, 0, Hh), Q(w, d, Hh), Q(0, d, Hh)];
      frontWall([Q(0, 0, 0), Q(w, 0, 0), Q(w, 0, Hh), Q(0, 0, Hh)]);
      p.poly(roofTop, SNOWY ? SNOW : (o.roofCol || W[0]), 0.8);
      const ins = 0.75, inner = [Q(ins, ins, Hh), Q(w - ins, ins, Hh), Q(w - ins, d - ins, Hh), Q(ins, d - ins, Hh)];
      p.poly(inner, SNOWY ? SNOWSH : (o.roofIn || W[0]), 0.45); p.poly(inner, 'rgba(60,40,20,0.12)', 0);
      if (o.court) { const c = o.court, ci = [Q(w * c[0], d * 0.3, Hh), Q(w * c[1], d * 0.3, Hh), Q(w * c[1], d * 0.75, Hh), Q(w * c[0], d * 0.75, Hh)]; p.poly(ci, '#5A4632', 0.5); p.poly([Q(w * c[0], d * 0.75, Hh), Q(w * c[1], d * 0.75, Hh), Q(w * c[1], d * 0.75, Hh - 2.2), Q(w * c[0], d * 0.75, Hh - 2.2)], W[0], 0.4); if (o.courtTree) { const q = Q(w * (c[0] + c[1]) / 2, d * 0.55, Hh); p.ell(q[0], q[1] - 0.6, 1.5, 1.1, '#6E8A4A', 0.4); } }
      if (o.pinn) for (let i = 0; i <= o.pinn; i++) { const q = Q(w * i / o.pinn, 0, Hh); p.poly([[q[0] - 0.5, q[1]], [q[0] - 0.35, q[1] - 1.5], [q[0], q[1] - 2.3], [q[0] + 0.35, q[1] - 1.5], [q[0] + 0.5, q[1]]], W[0], 0.45); }
      if (o.zanko) for (const xx of [0, w]) for (const dd of [0]) { const q = Q(xx, dd, Hh); p.poly([[q[0] - 0.6, q[1]], [q[0] - (xx ? -0.2 : 1.4), q[1] - 2.4], [q[0] + 0.1, q[1] - 0.6], [q[0] + 0.6, q[1]]], W[0], 0.45); }
      if (o.crenel) { const n = Math.round(w / 1.6); for (let i = 0; i < n; i += 2) { const a = Q(w * i / n, 0, Hh), b = Q(w * (i + 1) / n, 0, Hh); p.rect(a[0], a[1] - 1, b[0] - a[0], 1, W[0], 0.4); } }
      if (o.badgir) { const b = Q(w * 0.7, d * 0.55, Hh); p.rect(b[0] - 1.2, b[1] - 6, 2.4, 6, W[0], 0.55); p.rect(b[0] + 1.2, b[1] - 6 + 0, 0.9, 6, W[1], 0.45); for (let k = 0; k < 3; k++) p.rect(b[0] - 0.9 + k * 0.7, b[1] - 5.5, 0.35, 2, DK, 0); p.line([[b[0] - 1.4, b[1] - 6], [b[0] + 2.1, b[1] - 6]], 0.6); }
      if (o.domes) for (const [u, v, r, col] of o.domes) { const q = Q(w * u, d * v, Hh); p.rect(q[0] - r, q[1] - 0.8, 2 * r, 0.8, W[0], 0.4); dome(p, [q[0], q[1] - 0.8], r, col || W[0], { fin: col ? 'dot' : null, finCol: GOLD }); }
      if (o.chhatri) for (const u of o.chhatri) { const q = Q(w * u, d * 0.3, Hh); p.col(DK); for (const dx of [-0.9, 0.9]) p.line([[q[0] + dx, q[1]], [q[0] + dx, q[1] - 1.8]], 0.4); p.col(INK); p.rect(q[0] - 1.3, q[1] - 2.2, 2.6, 0.45, W[0], 0.35); dome(p, [q[0], q[1] - 2.2], 1.1, W[0], { fin: 'dot' }); }
      if (o.pergola) { const a = Q(w * 0.15, d * 0.4, Hh), b = Q(w * 0.6, d * 0.4, Hh); p.col(BEAM); for (const q of [a, b]) p.line([q, [q[0], q[1] - 2]], 0.45); p.line([[a[0], a[1] - 2], [b[0] + 2, b[1] - 3.2]], 0.45); p.line([[a[0] + 0.8, a[1] - 2.4], [b[0] + 0.8, b[1] - 2.4]], 0.4); p.col(INK); p.dot(b[0] + 0.5, b[1] - 2.6, 0.7, '#7E9A4A'); }
      if (o.flags) { const q = Q(w * 0.85, d * 0.5, Hh); p.line([q, [q[0], q[1] - 4]], 0.4); for (let k = 0; k < 4; k++) p.rect(q[0] + 0.2, q[1] - 4 + k * 0.4, 0.8, 0.35, ['#3F6FB0', '#F1EEE4', '#B4472E', '#4E8A52'][k], 0); }
      if (o.toronTop) { p.col('#5A3C22'); for (let i = 0; i < 4; i++) { const q = Q(w * (i + 0.5) / 4, 0, Hh * 0.9); p.line([[q[0], q[1]], [q[0], q[1] + 0.9]], 0.5); } p.col(INK); }
      if (o.rail) { p.col(o.rail); const a = Q(0, 0, Hh), b = Q(w, 0, Hh); for (let i = 0; i <= 8; i++) { const q = lerp(a, b, i / 8); p.line([q, [q[0], q[1] - 1]], 0.3); } p.line([[a[0], a[1] - 1], [b[0], b[1] - 1]], 0.35); p.col(INK); }
      if (f === 'dome') { const q = Q(w / 2, d / 2, Hh); dome(p, q, Math.min(w, d) * 0.32, o.domeCol || W[0], { fin: o.domeFin }); }
    } else if (f === 'round') { hut(p, o); return; }
    else {
      // eaves, hip, pyramid and horn forms: the ridge runs along the street
      const hip = f === 'hip' ? Math.min(w * 0.3, d * 0.42) : f === 'pyr' ? w / 2 + ov : 0, ridgeH = Hh + rh;
      if (!hip) { face(p, [Q(w, 0, Hh), Q(w, d, Hh), Q(w, d / 2, ridgeH)], W, true); polyline(p, [Q(w, 0, Hh), Q(w, d / 2, ridgeH), Q(w, d, Hh)], 0.7, BEAM); }
      frontWall([Q(0, 0, 0), Q(w, 0, 0), Q(w, 0, Hh), Q(0, 0, Hh)]);
      if (o.hh) horseHead(p, Q, w, d, Hh, rh, W);
      const rc = o.rc || 0;
      let r0 = Q(hip - ov * (hip ? 0 : 1), d / 2, ridgeH), r1 = Q(w - hip + ov * (hip ? 0 : 1), d / 2, ridgeH);
      if (f === 'pyr') { r0 = Q(w / 2, d / 2, ridgeH); r1 = r0; }
      slope(p, eaveLine(Q(-ov, d + ovf, Hh), Q(w + ov, d + ovf, Hh), 0), r1, r0, R, true);
      if (hip) slope(p, eaveLine(Q(w + ov, -ovf, Hh), Q(w + ov, d + ovf, Hh), o.lift ? o.lift * 0.6 : 0), r1, r1, R, true);
      const fe = eaveLine(Q(-ov, -ovf, Hh), Q(w + ov, -ovf, Hh), o.lift);
      slope(p, fe, r1, r0, R, false);
      if (f !== 'pyr') {
        let ridge = [r0, r1];
        if (rc) { ridge = []; for (let i = 0; i <= 10; i++) { const u = i / 10, q = lerp(r0, r1, u); q[1] -= rc * Math.pow(Math.abs(2 * u - 1), 3); ridge.push(q); } }
        polyline(p, ridge, rc ? 1.1 : 1, o.ridgeCol || '#3E2A20');
        if (o.swal) for (const [q, s] of [[ridge[0], -1], [ridge[ridge.length - 1], 1]]) { p.col(o.ridgeCol || '#3E2A20').line([q, [q[0] + s * 1.2, q[1] - 1.4], [q[0] + s * 1.9, q[1] - 1.2]], 0.6).col(INK); }
        if (o.ridgeOrn) { const q = lerp(r0, r1, 0.5); p.ell(q[0], q[1] - 0.6, 0.7, 0.6, o.ridgeOrn, 0.3); }
        if (SNOWY) polyline(p, ridge, 0.8, SNOW);
      } else if (o.fin) { p.col(o.fin).line([r0, [r0[0], r0[1] - 2]], 0.6).col(INK); p.dot(r0[0], r0[1] - 2.2, 0.4, o.fin); }
      if (o.eaveGold) polyline(p, fe, 0.45, GOLD);
      if (o.dormer) { const c = lerp(lerp(fe[0], fe[fe.length - 1], 0.5), lerp(r0, r1, 0.5), 0.42); p.poly([[c[0] - 1.6, c[1] + 1.4], [c[0] - 1.6, c[1] - 0.6], [c[0], c[1] - 2.2], [c[0] + 1.6, c[1] - 0.6], [c[0] + 1.6, c[1] + 1.4]], W[0], 0.6); p.rect(c[0] - 0.5, c[1] - 0.4, 1, 1.2, DK, 0); }
      if (o.chim) chimney(p, lerp(r0, r1, o.chimAt || 0.72), 2.4);
      if (o.chim2) chimney(p, lerp(r0, r1, 0.18), 2.2);
    }
    p.col(INK).line([Q(0, 0, 0), Q(w, 0, 0)], 1);
  }
  // Hui-style horse-head walls: stepped white gable walls standing above the roof at both ends
  function horseHead(p, Q, w, d, Hh, rh) {
    for (const xx of [0, w]) {
      const pts = [Q(xx, -0.4, Hh), Q(xx, -0.4, Hh + rh * 0.45), Q(xx, d * 0.2, Hh + rh * 0.45), Q(xx, d * 0.2, Hh + rh * 0.85), Q(xx, d * 0.45, Hh + rh * 0.85), Q(xx, d * 0.45, Hh + rh * 1.15), Q(xx, d * 0.7, Hh + rh * 1.15), Q(xx, d * 0.7, Hh + rh * 0.7), Q(xx, d + 0.4, Hh + rh * 0.7), Q(xx, d + 0.4, Hh)];
      p.poly(pts, xx ? WL.plaster[1] : WL.plaster[0], 0.6);
      for (let i = 1; i < pts.length - 2; i += 2) p.col('#3E424A').line([pts[i], pts[i + 1]], 0.9).col(INK);
    }
  }
  function balcony(p, x0, x1, y, kind, col) {
    if (kind === 'box') {   // an enclosed wooden balcony (Lima, Cartagena)
      const a = x0 + (x1 - x0) * 0.15, b = x1 - (x1 - x0) * 0.15;
      p.poly([[a - 0.6, y + 0.4], [a - 0.6, y - 3.4], [b + 0.6, y - 3.4], [b + 0.6, y + 0.4]], col || '#5E4430', 0.6);
      clipDo(p, [[a, y], [a, y - 3], [b, y - 3], [b, y]], () => { p.hatch([[a - 2, y + 1], [a - 2, y - 4], [b + 2, y - 4], [b + 2, y + 1]], 90, 0.6, 0.22, 'rgba(240,220,170,0.7)'); });
      p.line([[a - 1, y - 3.5], [b + 1, y - 3.5]], 0.6); p.line([[a, y + 0.4], [(a + b) / 2, y + 1.5], [b, y + 0.4]], 0.4);
      return;
    }
    p.poly([[x0 - 0.4, y], [x1 + 0.4, y], [x1 + 0.4, y + 0.5], [x0 - 0.4, y + 0.5]], col || '#5E4430', 0.4);
    p.col(col || (kind === 'i' ? '#2B2B2B' : '#5E4430')); for (let xx = x0; xx <= x1 + 0.1; xx += 0.7) p.line([[xx, y], [xx, y - 1.6]], 0.3); p.line([[x0 - 0.4, y - 1.6], [x1 + 0.4, y - 1.6]], 0.5); p.col(INK);
  }
  function arcade(p, x0, x1, gy, n, h) {
    const w = (x1 - x0) / n;
    for (let i = 0; i < n; i++) { const a = x0 + i * w + 0.5, b = x0 + (i + 1) * w - 0.5, m = (a + b) / 2; const pts = [[a, gy], [a, gy - h * 0.55]]; for (let k = 0; k <= 6; k++) { const t = Math.PI + Math.PI * k / 6; pts.push([m + Math.cos(t) * (b - a) / 2, gy - h * 0.55 + Math.sin(t) * (b - a) / 2]); } pts.push([b, gy]); p.poly(pts, '#4A3A2C', 0.4); }
  }
  function veranda(p, x0, x1, gy, h, roofKey) {
    const R = RF[roofKey] || RF.iron, n = Math.max(2, Math.round((x1 - x0) / 3));
    p.poly([[x0 - 0.6, gy - h], [x1 + 0.6, gy - h], [x1 + 1.6, gy - h - 1.4], [x0 + 0.4, gy - h - 1.4]], SNOWY ? SNOW : R[0], 0.5);
    p.col(BEAM); for (let i = 0; i <= n; i++) { const xx = x0 + (x1 - x0) * i / n; p.line([[xx, gy], [xx, gy - h]], 0.45); } p.col(INK);
  }
  // Sahel: rows of protruding toron beams
  function toron(p, x0, x1, top, gy, rows) { p.col('#4E3420'); for (let r = 0; r < rows; r++) { const y = top + (gy - top) * (r + 0.6) / (rows + 0.6); for (let xx = x0 + 0.8; xx < x1 - 0.4; xx += 1.6) p.line([[xx, y], [xx - 0.3, y + 0.7]], 0.5); } p.col(INK); }
  // Ndebele: bold geometric panels outlined in black, in red, yellow, blue and green on white
  function ndebele(p, x0, x1, top, gy, seed) {
    const cols = ['#B4362A', '#E3B23C', '#3F6FB0', '#4E8A52'], w = x1 - x0, n = Math.max(2, Math.round(w / 3));
    for (let i = 0; i < n; i++) {
      const a = x0 + i * w / n + 0.3, b = x0 + (i + 1) * w / n - 0.3, y0 = top + 0.6, y1 = gy - 0.6, m = (a + b) / 2;
      p.rect(a, y0, b - a, y1 - y0, cols[(i + seed) % 4], 0.55);
      p.poly([[m, y0 + 0.6], [b - 0.5, (y0 + y1) / 2], [m, y1 - 0.6], [a + 0.5, (y0 + y1) / 2]], '#F4F0E4', 0.45);
      p.rect(m - 0.35, (y0 + y1) / 2 - 0.9, 0.7, 1.8, cols[(i + seed + 2) % 4], 0.3);
    }
    p.line([[x0, top + 0.3], [x1, top + 0.3]], 0.6);
  }
  // Hausa and Asante: raised relief patterns on the walls (interlaced lines and roundels)
  function relief(p, x0, x1, top, gy, col) {
    const w = x1 - x0; p.col(col || 'rgba(70,40,20,0.75)');
    for (let i = 0; i < Math.max(1, Math.round(w / 4)); i++) {
      const cx = x0 + (i + 0.5) * w / Math.max(1, Math.round(w / 4)), cy = top + (gy - top) * 0.35;
      p.ell(cx, cy, 1.2, 1.2, null, 0.35); p.line([[cx - 1.6, cy - 1.6], [cx + 1.6, cy + 1.6]], 0.3); p.line([[cx + 1.6, cy - 1.6], [cx - 1.6, cy + 1.6]], 0.3);
    }
    p.line([[x0 + 0.3, top + 0.6], [x1 - 0.3, top + 0.6]], 0.4); p.col(INK);
  }
  // a round house: a drum wall and a conical thatch (or a beehive of thatch from the ground)
  function hut(p, o) {
    const cx = o.x + o.w / 2, gy = o.gy, r = o.w / 2, ry = r * 0.42, Hh = o.hw, rh = o.rh, W = WL[o.wall || 'mud'], R = RF[o.roof || 'thatch'];
    if (o.bee) {
      const pts = []; for (let i = 0; i <= 20; i++) { const a = Math.PI + Math.PI * i / 20; pts.push([cx + Math.cos(a) * r, gy + Math.sin(a) * (Hh + rh)]); }
      pts.push([cx + r, gy], [cx, gy + ry * 0.6], [cx - r, gy]);
      p.poly(pts, R[0], 0.8);
      clipDo(p, pts, () => { for (let k = 1; k < 7; k++) { const pts2 = []; for (let i = 0; i <= 20; i++) { const a = Math.PI + Math.PI * i / 20; pts2.push([cx + Math.cos(a) * r, gy - (Hh + rh) * k / 7 + Math.sin(a) * 0.01 + (Math.abs(Math.cos(a)) * 0)]); } } for (let k = 0; k < 30; k++) { const a = Math.PI + Math.PI * p.R(); const rr = 0.3 + p.R() * 0.7; const q = [cx + Math.cos(a) * r * rr, gy + Math.sin(a) * (Hh + rh) * rr]; p.col('rgba(80,58,24,0.55)').line([q, [q[0] + Math.cos(a) * 1.2, q[1] + Math.sin(a) * 1.2]], 0.4); } for (let k = 1; k < 4; k++) p.col('rgba(70,50,20,0.5)').ell(cx, gy, r * k / 4 + 0.2, (Hh + rh) * k / 4, null, 0.4, Math.PI, Math.PI * 2); p.hatch([[cx + r * 0.2, gy], [cx + r, gy], [cx + r, gy - Hh - rh], [cx + r * 0.2, gy - Hh - rh]], 70, 1.4, 0.4, 'rgba(43,33,25,0.4)'); });
      if (SNOWY) p.poly(pts.slice(5, 16).map(q => [q[0], q[1]]).concat([[cx + r * 0.5, gy - (Hh + rh) * 0.7], [cx - r * 0.5, gy - (Hh + rh) * 0.7]]), SNOW, 0);
      p.ell(cx - r * 0.2, gy - 0.9, 0.8, 1, DK, 0);
      return;
    }
    // drum
    const drum = [[cx - r, gy - Hh]]; for (let i = 0; i <= 14; i++) { const a = Math.PI * i / 14; drum.push([cx - Math.cos(a) * r, gy + Math.sin(a) * ry]); } drum.push([cx + r, gy - Hh]);
    p.poly(drum, W[0], 0.8);
    clipDo(p, drum, () => { p.hatch([[cx + r * 0.3, gy + ry], [cx + r, gy + ry], [cx + r, gy - Hh], [cx + r * 0.3, gy - Hh]], 70, 1.4, 0.4, 'rgba(43,33,25,0.45)'); if (o.paint) { p.rect(cx - r, gy - 1.2, 2 * r, 1.2 + ry, o.paint, 0); for (let k = 0; k < 5; k++) p.poly([[cx - r + k * r * 0.45, gy - 1.2], [cx - r + k * r * 0.45 + r * 0.22, gy - 2.4], [cx - r + k * r * 0.45 + r * 0.45, gy - 1.2]], o.paint2 || '#F2EEE2', 0.25); } if (o.stoneBase) for (let k = 0; k < 12; k++) p.ell(cx - r + p.R() * 2 * r, gy - p.R() * 2.2, 0.8, 0.5, null, 0.28); });
    if (o.door !== 'none') p.poly([[cx - 1.4, gy + ry * 0.85], [cx - 1.4, gy - Hh * 0.75], [cx - 0.3, gy - Hh * 0.82], [cx - 0.3, gy + ry * 0.98]], DK, 0);
    // cone
    const apex = [cx + 0.4, gy - Hh - rh], eave = []; const er = r + (o.ov === undefined ? 1.2 : o.ov), ery = ry * 0.75;
    for (let i = 0; i <= 16; i++) { const a = Math.PI * i / 16; eave.push([cx - Math.cos(a) * er, gy - Hh - 0.4 + Math.sin(a) * ery]); }
    const cone = [apex].concat(eave);
    p.poly(cone, R[0], 0.85);
    clipDo(p, cone, () => {
      if (R[2] === 'thatch') for (let k = 0; k < 70; k++) { const t = p.R(), q = eave[Math.floor(p.R() * 16)], a = lerp(apex, q, 0.2 + t * 0.7); p.col(p.R() < 0.55 ? 'rgba(80,58,24,0.5)' : 'rgba(240,220,160,0.45)').line([a, lerp(apex, q, 0.32 + t * 0.7)], 0.4); }
      else for (let k = 1; k < 16; k++) p.col('rgba(40,40,40,0.35)').line([apex, eave[k]], 0.3);
      p.poly([apex, ...eave.slice(9)], 'rgba(43,33,25,0.22)', 0);
      for (let k = 1; k < 3; k++) { const pts = eave.map(q => lerp(apex, q, k / 3)); p.col('rgba(70,50,20,0.35)').line(pts, 0.45); }
    });
    if (SNOWY) p.poly([apex].concat(eave.map(q => lerp(apex, q, 0.62 + 0.06 * Math.sin(q[0] * 3)))), SNOW, 0.3);
    p.col(R[2] === 'thatch' ? '#5E4A28' : '#3E2A20').line(eave, 1.2).col(INK);
    if (o.fin) { p.col(o.fin === 'cross' ? GOLD : '#5E4A28').line([apex, [apex[0], apex[1] - 2]], 0.55); if (o.fin === 'cross') p.line([[apex[0] - 0.7, apex[1] - 1.4], [apex[0] + 0.7, apex[1] - 1.4]], 0.45); else p.ell(apex[0], apex[1] - 2.2, 0.45, 0.55, o.fin === 'pot' ? '#9C6A40' : '#F2EEE2', 0.3); p.col(INK); }
  }
  // a granary: a small round mud store on stones with a thatch hat
  function granary(p, cx, gy, s) { hut(p, { x: cx - 2 * s, w: 4 * s, gy: gy - 1, hw: 3.6 * s, rh: 2.6 * s, wall: 'mudR', roof: 'straw', door: 'none', ov: 0.6 }); p.col(DK).line([[cx - 1.2 * s, gy], [cx - 1.2 * s, gy - 1]], 0.5).line([[cx + 1.2 * s, gy], [cx + 1.2 * s, gy - 1]], 0.5).col(INK); }
  // a compound wall in front of a group of houses
  function compound(p, x0, x1, gy, h, W) { p.poly([[x0, gy], [x1, gy], [x1, gy - h], [x0, gy - h]], WL[W][0], 0.7); p.poly([[x1, gy], [x1 + 2.6, gy - 4.5], [x1 + 2.6, gy - 4.5 - h], [x1, gy - h]], WL[W][1], 0.6); door(p, (x0 + x1) / 2, gy, 'plain'); if (SNOWY) p.line([[x0, gy - h], [x1, gy - h]], 0.6); }

  // =====================================================================================================================
  // the regional sets: each entry draws one sprite (34 x 36 logical px, ground at y 33, like the round 4 townhouses)
  const S = {};
  const def = (set, list) => { S[set] = list; };
  // ---- Low Countries (light additions to the round 4 set): brick houses with stepped, neck and bell gables
  def('nl', [
    p => { H(p, { x: 4, w: 8, hw: 7, d: 12, rh: 8, form: 'step', wall: 'brick', roof: 'tileD', rows: 2, win: 'frame', steps: 4 }); H(p, { x: 12, w: 7, hw: 7.5, d: 12, rh: 8.5, form: 'bell', wall: 'brickD', roof: 'slate', rows: 2, win: 'frame' }); H(p, { x: 19, w: 7, hw: 6.5, d: 12, rh: 8, form: 'step', wall: 'brick', roof: 'tile', rows: 2, win: 'frame', steps: 3 }); },
    p => { H(p, { x: 8, w: 10, hw: 8, d: 13, rh: 9, form: 'step', wall: 'brickD', roof: 'slate', rows: 2, win: 'frame', steps: 5, chim: true }); },
    p => { H(p, { x: 6, w: 8, hw: 8, d: 13, rh: 8, form: 'bell', wall: 'brick', roof: 'tileD', rows: 2, win: 'frame' }); H(p, { x: 14, w: 8, hw: 7, d: 13, rh: 8, form: 'bell', wall: 'white', roof: 'slate', rows: 2, win: 'frame', wc: '#2B2B2B' }); },
    p => { H(p, { x: 5, w: 15, hw: 5, d: 11, rh: 6, form: 'eaves', wall: 'brick', roof: 'tile', rows: 1, win: 'shut', wc: '#4E7A52', chim: true }); },
  ]);
  // ---- Central Europe: Fachwerk, brick Gothic, painted Bavarian facades, arcaded burgher houses, wattle and daub
  def('de', [
    p => H(p, { x: 9, w: 10, hw: 9, d: 13, rh: 9.5, form: 'gable', wall: 'fach', roof: 'tile', rows: 3, win: 'sq', jet: true, chim: true }),
    p => H(p, { x: 4, w: 16, hw: 6.5, d: 12, rh: 7, form: 'eaves', wall: 'fachO', roof: 'tileD', rows: 2, win: 'sq', dormer: true, chim: true }),
    p => H(p, { x: 8, w: 11, hw: 8, d: 13, rh: 9, form: 'half', wall: 'fachW', roof: 'slate', rows: 2, win: 'sq', flowers: true }),
    p => H(p, { x: 8, w: 11, hw: 8.5, d: 13, rh: 10, form: 'step', wall: 'brickD', roof: 'tileD', rows: 3, win: 'arch', steps: 5 }),
    p => H(p, { x: 6, w: 13, hw: 7, d: 13, rh: 5, form: 'gable', ov: 1.6, wall: 'white', roof: 'shingle', rows: 2, win: 'paint', wc: '#B4472E', bal: 'w', balAt: 1, paintG: '#7FA6CF' }),
    p => H(p, { x: 6, w: 14, hw: 4, d: 11, rh: 7.5, form: 'hip', wall: 'fachR', roof: 'thatch', rows: 1, win: 'small', ov: 0.6 }),
    p => { H(p, { x: 2, w: 7, hw: 7, d: 12, rh: 8, form: 'gable', wall: 'fach', roof: 'tile', rows: 2 }); H(p, { x: 9, w: 7, hw: 7.5, d: 12, rh: 8.5, form: 'gable', wall: 'fachO', roof: 'tileD', rows: 2, jet: true }); H(p, { x: 16, w: 7, hw: 6.5, d: 12, rh: 8, form: 'gable', wall: 'fachW', roof: 'slate', rows: 2 }); },
    p => H(p, { x: 5, w: 15, hw: 8, d: 12, rh: 5.5, form: 'eaves', wall: 'pY', roof: 'tile', rows: 2, arc: 3, win: 'frame', crenelTop: true }),
    p => H(p, { x: 6, w: 14, hw: 6.5, d: 12, rh: 6.5, form: 'hip', wall: 'pP', roof: 'tile', rows: 2, win: 'frame', chim: true, chimAt: 0.4 }),
    p => H(p, { x: 7, w: 12, hw: 7, d: 13, rh: 9, form: 'gable', wall: 'pG', roof: 'tileD', rows: 2, win: 'frame', loft: 'round', door: 'big' }),
  ]);
  // ---- Alps: chalets with deep eaves and balconies, painted Engadin houses
  def('al', [
    p => H(p, { x: 6, w: 14, hw: 7.5, d: 13, rh: 4.5, form: 'gable', ov: 2, wall: 'teak', roof: 'shingle', rows: 2, base: ['#E2D9C4', 3], win: 'shut', wc: '#3E6E3E', bal: 'w', balAt: 1, flowers: true }),
    p => H(p, { x: 4, w: 16, hw: 7, d: 14, rh: 5, form: 'gable', ov: 1.8, wall: 'wood', roof: 'stoneS', rows: 2, base: ['#EFEAE0', 3.4], win: 'shut', wc: '#B4472E', bal: 'w', balAt: 1 }),
    p => H(p, { x: 7, w: 12, hw: 7.5, d: 13, rh: 4.2, form: 'gable', ov: 1.2, wall: 'plaster', roof: 'shingle', rows: 2, win: 'paint', wc: '#7A5232', sgraf: true, door: 'big' }),
    p => H(p, { x: 9, w: 9, hw: 5, d: 11, rh: 4.5, form: 'gable', ov: 1.4, wall: 'dkwood', roof: 'plank', rows: 1, win: 'small', stilt: 1.5, ladder: false }),
  ]);
  // ---- Scandinavia and Finland: painted wooden houses (falu red, ochre, white) and turf roofs
  def('sc', [
    p => H(p, { x: 5, w: 15, hw: 5.5, d: 12, rh: 6.5, form: 'eaves', wall: 'falu', roof: 'tileD', rows: 1, win: 'frame', trim: '#F2EEE4', chim: true }),
    p => H(p, { x: 9, w: 10, hw: 6, d: 13, rh: 7.5, form: 'gable', wall: 'ochreP', roof: 'tile', rows: 2, win: 'frame', trim: '#F2EEE4' }),
    p => H(p, { x: 4, w: 17, hw: 6.5, d: 13, rh: 6, form: 'hip', wall: 'whiteP', roof: 'slateB', rows: 2, win: 'frame', wc: '#5A4A3A', chim: true, chimAt: 0.5 }),
    p => H(p, { x: 6, w: 13, hw: 4.5, d: 11, rh: 4.5, form: 'eaves', wall: 'log', roof: 'turf', rows: 1, win: 'frame', ov: 0.6 }),
    p => H(p, { x: 7, w: 12, hw: 4.5, d: 11, rh: 4.5, form: 'gable', wall: 'falu', roof: 'turf', rows: 1, win: 'frame', trim: '#F2EEE4', ov: 0.5 }),
    p => { H(p, { x: 2, w: 7, hw: 7, d: 13, rh: 7.5, form: 'gable', wall: 'falu', roof: 'tileD', rows: 2, win: 'frame', trim: '#F2EEE4' }); H(p, { x: 9, w: 7, hw: 7.5, d: 13, rh: 8, form: 'gable', wall: 'ochreP', roof: 'tileD', rows: 2, win: 'frame', trim: '#F2EEE4' }); H(p, { x: 16, w: 7, hw: 7, d: 13, rh: 7.5, form: 'gable', wall: 'whiteP', roof: 'tileD', rows: 2, win: 'frame', wc: '#5A4A3A' }); },
    p => H(p, { x: 5, w: 15, hw: 5, d: 12, rh: 6, form: 'eaves', wall: 'logY', roof: 'tile', rows: 1, win: 'frame', trim: '#F2EEE4', chim: true }),
    p => H(p, { x: 8, w: 11, hw: 6, d: 13, rh: 7.5, form: 'gable', wall: 'blueP', roof: 'slateB', rows: 2, win: 'frame', trim: '#F2EEE4' }),
    p => H(p, { x: 10, w: 8, hw: 4.5, d: 9, rh: 4, form: 'gable', wall: 'log', roof: 'turf', rows: 1, win: 'none', stilt: 2, ladder: false, jet: true }),
  ]);
  // ---- Russia, Belarus, Ukraine: log izbas with carved gables and window frames, merchant houses, whitewashed khatas
  def('ru', [
    p => H(p, { x: 9, w: 10, hw: 5.5, d: 13, rh: 7.5, form: 'gable', wall: 'log', roof: 'plank', rows: 1, win: 'nal', carve: true }),
    p => H(p, { x: 8, w: 11, hw: 6, d: 13, rh: 8, form: 'gable', wall: 'logG', roof: 'green', rows: 1, win: 'nal', carve: true, chim: true }),
    p => H(p, { x: 5, w: 15, hw: 8, d: 12, rh: 4.5, form: 'hip', wall: 'log', roof: 'iron', rows: 2, base: ['#D9B86A', 3.6], win: 'nal', chim: true }),
    p => H(p, { x: 4, w: 17, hw: 7, d: 12, rh: 4, form: 'hip', wall: 'yellow', roof: 'green', rows: 2, win: 'frame', trim: '#F4F0E4', chim: true, chimAt: 0.3 }),
    p => { H(p, { x: 3, w: 9, hw: 5, d: 12, rh: 7, form: 'gable', wall: 'log', roof: 'plank', rows: 1, win: 'nal', carve: true }); H(p, { x: 14, w: 9, hw: 5, d: 12, rh: 7, form: 'gable', wall: 'logG', roof: 'blueI', rows: 1, win: 'nal', carve: true }); },
    p => H(p, { x: 6, w: 14, hw: 4.5, d: 11, rh: 6, form: 'eaves', wall: 'logG', roof: 'thatchD', rows: 1, win: 'nal' }),
    p => H(p, { x: 5, w: 15, hw: 4.5, d: 11, rh: 7, form: 'hip', ov: 0.8, wall: 'lime', roof: 'thatch', rows: 1, win: 'blue', band: ['#4C78A8', 1], door: 'plain', dc: '#4C78A8' }),
    p => H(p, { x: 6, w: 14, hw: 4.5, d: 11, rh: 7, form: 'hip', ov: 0.8, wall: 'lime', roof: 'straw', rows: 1, win: 'nal', wc: '#F4F0E4', band: ['#B4472E', 0.8], pots: 0, flowers: true }),
  ]);
  // ---- Iberia and Italy: stone and whitewash under low terracotta roofs
  def('med', [
    p => H(p, { x: 5, w: 15, hw: 6, d: 12, rh: 3.4, form: 'eaves', wall: 'stoneM', roof: 'terra', rows: 2, win: 'shut', wc: '#5E7A4A', quoin: false }),
    p => H(p, { x: 8, w: 11, hw: 10, d: 12, rh: 3, form: 'eaves', wall: 'ochre', roof: 'terra', rows: 3, win: 'shut', wc: '#3E6E3E' }),
    p => H(p, { x: 6, w: 13, hw: 8, d: 12, rh: 3, form: 'hip', wall: 'pink', roof: 'terraL', rows: 2, win: 'shut', wc: '#3E6E3E', bal: 'i', balAt: 1 }),
    p => H(p, { x: 5, w: 15, hw: 6, d: 12, rh: 3, form: 'eaves', wall: 'lime', roof: 'terraL', rows: 2, win: 'grille', band: ['#D9A23A', 0.9], pots: 4, door: 'arch' }),
    p => H(p, { x: 7, w: 12, hw: 8, d: 12, rh: 3.2, form: 'hip', wall: 'white', roof: 'terra', rows: 2, win: 'frame', azul: '#3F6FB0', bal: 'i', balAt: 1 }),
    p => H(p, { x: 10, w: 7, hw: 14, d: 8, rh: 2, form: 'pyr', wall: 'stoneM', roof: 'terra', rows: 4, win: 'arch', quoin: false }),
    p => { H(p, { x: 2, w: 7, hw: 9, d: 12, rh: 2.5, form: 'eaves', wall: 'saffron', roof: 'terra', rows: 3, win: 'shut', wc: '#3E6E3E' }); H(p, { x: 9, w: 7, hw: 10, d: 12, rh: 2.5, form: 'eaves', wall: 'terra', roof: 'terra', rows: 3, win: 'shut', wc: '#3E6E3E' }); H(p, { x: 16, w: 7, hw: 9, d: 12, rh: 2.5, form: 'eaves', wall: 'pY', roof: 'terra', rows: 3, win: 'shut', wc: '#3E6E3E' }); },
    p => H(p, { x: 4, w: 17, hw: 6, d: 14, rh: 3.4, form: 'hip', wall: 'ochre', roof: 'terraL', rows: 1, win: 'grille', door: 'arch', dc: '#5E3A22' }),
    p => H(p, { x: 6, w: 14, hw: 6, d: 12, rh: 3.6, form: 'eaves', wall: 'stoneM', roof: 'terra', rows: 2, win: 'small', stair: true, quoin: false, door: 'none' }),
    p => H(p, { x: 6, w: 14, hw: 6, d: 12, rh: 3, form: 'eaves', wall: 'white', roof: 'terraL', rows: 2, win: 'frame', wc: '#D9A23A', trim: '#D9A23A', band: ['#D9A23A', 0.8], chim: true }),
  ]);
  // ---- Greece and the Cyclades: whitewash, blue shutters and doors, flat roofs on the islands
  def('gr', [
    p => H(p, { x: 6, w: 13, hw: 6, d: 12, rh: 3, form: 'eaves', wall: 'lime', roof: 'terra', rows: 2, win: 'shut', wc: '#2F5F9E', door: 'plain', dc: '#2F5F9E' }),
    p => H(p, { x: 7, w: 12, hw: 8, d: 12, rh: 3.5, form: 'hip', wall: 'ochre', roof: 'terraL', rows: 2, win: 'shut', wc: '#3E6E3E', bal: 'i', balAt: 1 }),
    p => H(p, { x: 6, w: 14, hw: 7, d: 12, rh: 3.6, form: 'hip', wall: 'stoneG', roof: 'stoneS', rows: 2, win: 'small', quoin: false, door: 'arch' }),
    p => H(p, { x: 7, w: 12, hw: 5.5, d: 11, form: 'flat', wall: 'lime', rows: 1, win: 'blue', door: 'plain', dc: '#2F5F9E', pergola: true }),
  ]);
  def('cyc', [
    p => { H(p, { x: 4, w: 10, hw: 5, d: 10, form: 'flat', wall: 'lime', win: 'blue', door: 'plain', dc: '#2F5F9E' }); H(p, { x: 13, w: 9, hw: 7, d: 10, form: 'flat', wall: 'lime', rows: 2, win: 'blue', door: 'plain', dc: '#2F5F9E', stair: true }); },
    p => H(p, { x: 6, w: 13, hw: 6, d: 11, form: 'flat', wall: 'lime', win: 'blue', door: 'plain', dc: '#2F5F9E', pergola: true, pots: 2 }),
    p => { H(p, { x: 5, w: 10, hw: 5, d: 10, form: 'dome', wall: 'lime', win: 'blue', door: 'arch', dc: '#2F5F9E', domeCol: '#3F78C0', domeFin: 'cross' }); H(p, { x: 15, w: 8, hw: 4.5, d: 10, form: 'flat', wall: 'lime', win: 'blue', door: 'none' }); },
    p => H(p, { x: 7, w: 12, hw: 7, d: 11, form: 'flat', wall: 'lime', rows: 2, win: 'shut', wc: '#2F8A6E', door: 'plain', dc: '#2F8A6E', rail: '#2F5F9E' }),
  ]);
  // ---- the Balkans and Turkey: stone towers (kulla), Ottoman houses with jettied upper floors and wooden bay windows
  def('bk', [
    p => H(p, { x: 10, w: 8, hw: 13, d: 9, rh: 3.5, form: 'pyr', wall: 'stoneG', roof: 'stoneS', rows: 3, win: 'slit', quoin: false, door: 'arch' }),
    p => H(p, { x: 5, w: 14, hw: 8, d: 12, rh: 4, form: 'hip', ov: 1.2, wall: 'white', jetWall: 'white', roof: 'terra', rows: 2, base: ['#C9BEA6', 3.6], win: 'frame', wc: '#5E4430', jet: true }),
    p => H(p, { x: 5, w: 15, hw: 8, d: 12, rh: 4, form: 'hip', ov: 1, wall: 'pO', roof: 'terra', rows: 2, win: 'frame', wc: '#5E4430', bay: 'wood' }),
    p => H(p, { x: 7, w: 12, hw: 6, d: 12, rh: 4, form: 'hip', wall: 'stoneG', roof: 'stoneS', rows: 2, win: 'small', quoin: false, chim: true }),
    p => H(p, { x: 6, w: 14, hw: 5, d: 12, rh: 4, form: 'hip', wall: 'ochre', roof: 'terra', rows: 1, win: 'frame', vera: 'terra', veraH: 0.8 }),
    p => H(p, { x: 5, w: 15, hw: 8, d: 12, rh: 4.5, form: 'hip', ov: 1.4, wall: 'lime', roof: 'terraL', rows: 2, base: ['#9A6A44', 3.8], win: 'frame', wc: '#7A5232', bal: 'w', balAt: 1 }),
    p => H(p, { x: 6, w: 13, hw: 7, d: 12, rh: 3.4, form: 'hip', ov: 1.2, wall: 'pY', roof: 'terra', rows: 2, win: 'frame', wc: '#7A5232', bal: 'w', balAt: 1, balCol: '#7A5232' }),   // Tbilisi: carved wooden balconies
  ]);
  // ---- North Africa and the Middle East: flat roofs, courtyards, mashrabiya, domes and windcatchers
  def('mn', [
    p => { H(p, { x: 4, w: 9, hw: 5, d: 11, form: 'flat', wall: 'mud', win: 'small', door: 'plain' }); H(p, { x: 13, w: 9, hw: 7, d: 11, form: 'flat', wall: 'mudL', rows: 2, win: 'small', door: 'none', toronTop: true }); },
    p => H(p, { x: 5, w: 15, hw: 9, d: 12, form: 'flat', wall: 'sand', rows: 2, win: 'lat', mash: 2, door: 'arch', quoin: false }),
    p => H(p, { x: 4, w: 17, hw: 5.5, d: 14, form: 'flat', wall: 'mudL', win: 'small', court: [0.3, 0.75], courtTree: true, door: 'arch' }),
    p => H(p, { x: 5, w: 15, hw: 5.5, d: 12, form: 'flat', wall: 'stoneM', win: 'arch', quoin: false, domes: [[0.3, 0.5, 2.4], [0.72, 0.5, 2.4]], door: 'arch' }),
    p => H(p, { x: 5, w: 15, hw: 6, d: 12, form: 'flat', wall: 'mudL', win: 'arch', badgir: true, door: 'arch' }),
    p => H(p, { x: 9, w: 10, hw: 16, d: 10, form: 'flat', wall: 'mudR', rows: 5, win: 'frame', wc: '#F4F0E4', band: ['#F4F0E4', 0.6], pinn: 4 }),
    p => H(p, { x: 4, w: 17, hw: 7, d: 12, form: 'flat', wall: 'mudR', rows: 2, win: 'slit', crenel: true, door: 'arch', toron: 0 }),
    p => H(p, { x: 6, w: 13, hw: 6, d: 12, form: 'flat', wall: 'lime', win: 'grille', wc: '#3F6FB0', door: 'arch', dc: '#2F5F9E', band: ['#3F6FB0', 0.7] }),
    p => H(p, { x: 5, w: 15, hw: 7, d: 12, form: 'flat', wall: 'sand', rows: 2, win: 'arch', arc: 3, door: 'none', quoin: false, band: ['#3E8AA0', 0.8] }),
    p => H(p, { x: 6, w: 14, hw: 5.5, d: 12, form: 'flat', wall: 'mudW', win: 'small', door: 'big', dc: '#3F6FB0', relief: '#3F8A9A', domes: [[0.5, 0.5, 2.8]] }),
  ]);
  // ---- Central Asia: flat mud houses with carved wooden porches, turquoise tiled domes, yurts
  def('ca', [
    p => H(p, { x: 5, w: 15, hw: 5.5, d: 12, form: 'flat', wall: 'mudL', win: 'lat', wc: '#7A5232', vera: 'iron', veraH: 0.85, door: 'plain' }),
    p => H(p, { x: 5, w: 15, hw: 6, d: 12, form: 'flat', wall: 'sand', win: 'arch', band: ['#3E9AA0', 1], domes: [[0.5, 0.5, 3, '#3E9AA0']], door: 'arch' }),
    p => H(p, { x: 4, w: 17, hw: 6, d: 14, form: 'flat', wall: 'mud', win: 'small', court: [0.25, 0.75], courtTree: true, door: 'big', dc: '#7A5232' }),
    p => H(p, { x: 9, w: 12, gy: 33, hw: 4, rh: 4.5, form: 'round', wall: 'mudW', roof: 'plank', ov: 0.4, paint: '#B4362A', paint2: '#F2EEE2', fin: 'pot' }),
  ]);
  // ---- the Sahel: Sudano-Sahelian mud brick with toron beams, buttresses and pinnacles; compounds and granaries
  def('sh', [
    p => H(p, { x: 6, w: 14, hw: 8, d: 12, form: 'flat', wall: 'mud', rows: 2, win: 'small', toron: 2, butt: 4, door: 'big' }),
    p => H(p, { x: 6, w: 13, hw: 10, d: 12, form: 'flat', wall: 'mudR', rows: 2, win: 'lat', wc: '#5E3A22', pinn: 5, butt: 3, toron: 1, door: 'big', dc: '#5E3A22' }),
    p => { H(p, { x: 4, w: 9, hw: 4.5, d: 11, form: 'flat', wall: 'mudL', win: 'small' }); H(p, { x: 13, w: 9, hw: 5.5, d: 11, form: 'flat', wall: 'mud', win: 'small', toronTop: true, door: 'none' }); },
    p => { compound(p, 3, 18, 33, 3, 'mud'); granary(p, 8, 28, 0.9); hut(p, { x: 14, w: 8, gy: 27.5, hw: 3.4, rh: 5, wall: 'mudR', roof: 'straw', fin: 'pot' }); },
    p => hut(p, { x: 8, w: 13, gy: 33, hw: 4.2, rh: 7, wall: 'mud', roof: 'straw', fin: 'pot' }),
    p => H(p, { x: 6, w: 14, hw: 7, d: 12, form: 'flat', wall: 'mudR', rows: 2, win: 'lat', wc: '#F2EEE2', relief: '#F2EEE2', door: 'big', pinn: 3 }),
    p => H(p, { x: 7, w: 12, hw: 6, d: 12, form: 'flat', wall: 'laterite', win: 'small', relief: '#F4F0E4', door: 'carved', dc: '#3A2416', toronTop: true }),
  ]);
  // ---- Hausa lands: decorated walls (relief) and horned corner pinnacles (zanko)
  def('ha', [
    p => H(p, { x: 6, w: 14, hw: 7, d: 12, form: 'flat', wall: 'mudL', rows: 2, win: 'small', relief: '#7A4A2A', zanko: true, door: 'big' }),
    p => H(p, { x: 5, w: 15, hw: 6, d: 12, form: 'dome', wall: 'mud', win: 'small', relief: '#5A3A22', zanko: true, door: 'big', domeCol: '#B88A5A' }),
    p => H(p, { x: 7, w: 12, hw: 9, d: 12, form: 'flat', wall: 'mudW', rows: 2, win: 'small', relief: '#3F6FB0', zanko: true, door: 'big', dc: '#3F6FB0' }),
  ]);
  // ---- West and Central Africa: Asante courtyard buildings, Yoruba verandahs, Bamileke houses, painted Kassena walls
  def('wa', [
    p => { H(p, { x: 4, w: 16, hw: 6, d: 12, rh: 8, form: 'eaves', wall: 'mudW', roof: 'thatch', rows: 1, base: ['#9E4A2E', 2.6], relief: '#9E4A2E', win: 'none', door: 'big', dc: '#6A3A22' }); },
    p => H(p, { x: 5, w: 15, hw: 4.5, d: 12, rh: 6, form: 'hip', ov: 0.8, wall: 'mudR', roof: 'thatch', rows: 1, win: 'small' }),
    p => H(p, { x: 6, w: 14, hw: 4.5, d: 11, form: 'flat', wall: 'mudR', win: 'none', ndebele: 0, door: 'plain' }),
    p => H(p, { x: 4, w: 17, hw: 5.5, d: 13, rh: 6.5, form: 'hip', wall: 'laterite', roof: 'thatchD', rows: 1, win: 'sq', vera: 'thatch', veraH: 0.75, door: 'plain' }),
    p => hut(p, { x: 8, w: 13, gy: 33, hw: 4.5, rh: 6.5, wall: 'mudR', roof: 'thatch', fin: 'pot' }),
    p => H(p, { x: 10, w: 9, hw: 6, d: 9, rh: 9, form: 'pyr', wall: 'bamboo', roof: 'thatch', rows: 1, win: 'none', door: 'big', fin: '#5E4A28' }),
    p => H(p, { x: 5, w: 15, hw: 5, d: 12, rh: 6, form: 'eaves', wall: 'bamboo', roof: 'palm', rows: 1, win: 'small', ov: 0.6 }),
  ]);
  // ---- the Swahili coast: coral-stone townhouses with carved doors, Zanzibar balconies, palm-thatched (makuti) houses
  def('sw', [
    p => H(p, { x: 6, w: 13, hw: 9, d: 12, form: 'flat', wall: 'coral', rows: 2, win: 'sq', door: 'carved', crenel: true }),
    p => H(p, { x: 5, w: 15, hw: 9, d: 12, form: 'flat', wall: 'coral', rows: 2, win: 'shut', wc: '#4E7A52', bal: 'w', balAt: 1, balCol: '#5E3A22', door: 'carved' }),
    p => H(p, { x: 5, w: 15, hw: 4.5, d: 12, rh: 7, form: 'hip', wall: 'coral', roof: 'palm', rows: 1, win: 'small', door: 'carved' }),
    p => { H(p, { x: 3, w: 9, hw: 8, d: 12, form: 'flat', wall: 'coral', rows: 2, win: 'sq', door: 'carved' }); H(p, { x: 12, w: 10, hw: 10, d: 12, form: 'flat', wall: 'pO', rows: 3, win: 'shut', wc: '#3F6FB0', bal: 'w', balAt: 1, door: 'carved', rail: '#5E3A22' }); },
  ]);
  // ---- Ethiopia and Eritrea: tukuls with finials, Gondar stone castles, flat-roofed stone hidmo
  def('et', [
    p => hut(p, { x: 8, w: 13, gy: 33, hw: 4.5, rh: 7.5, wall: 'mud', roof: 'thatchD', fin: 'cross' }),
    p => { H(p, { x: 4, w: 14, hw: 9, d: 12, form: 'flat', wall: 'stoneG', rows: 2, win: 'arch', crenel: true, quoin: false, door: 'arch' }); H(p, { x: 17, w: 5, hw: 11, d: 5, form: 'dome', wall: 'stoneG', rows: 2, win: 'slit', door: 'none', domeCol: '#A89C86' }); },
    p => H(p, { x: 5, w: 15, hw: 5.5, d: 13, form: 'flat', wall: 'stoneM', win: 'small', toronTop: true, quoin: false, door: 'plain', roofCol: '#B09060' }),
  ]);
  // ---- East and southern Africa: rondavels, thatched rectangular houses, Malagasy highland houses
  def('eaf', [
    p => hut(p, { x: 8, w: 13, gy: 33, hw: 4.5, rh: 6.5, wall: 'mud', roof: 'thatch', fin: 'knob' }),
    p => { hut(p, { x: 3, w: 11, gy: 32, hw: 4, rh: 6, wall: 'mudR', roof: 'thatch' }); granary(p, 18, 29, 0.8); hut(p, { x: 14, w: 10, gy: 34, hw: 4, rh: 5.5, wall: 'mud', roof: 'thatchD' }); },
    p => H(p, { x: 5, w: 15, hw: 4.5, d: 11, rh: 6.5, form: 'hip', ov: 0.8, wall: 'mudR', roof: 'thatch', rows: 1, win: 'small' }),
    p => H(p, { x: 4, w: 17, hw: 5, d: 12, rh: 6, form: 'hip', wall: 'mudW', roof: 'thatchD', rows: 1, win: 'sq', vera: 'thatch', veraH: 0.8, band: ['#8E4A2C', 1] }),
    p => H(p, { x: 9, w: 9, hw: 9, d: 10, rh: 9, form: 'gable', wall: 'laterite', roof: 'thatchD', rows: 2, win: 'sq', bal: 'w', balAt: 1, door: 'plain' }),
  ]);
  // ---- South Africa, Lesotho, Eswatini: Zulu beehive houses, Ndebele painted homesteads, Sotho litema, Cape Dutch gables
  def('za', [
    p => hut(p, { x: 7, w: 14, gy: 33, hw: 1, rh: 9, roof: 'straw', bee: true }),
    p => { H(p, { x: 4, w: 15, hw: 5.5, d: 11, rh: 5, form: 'eaves', wall: 'lime', roof: 'thatch', rows: 1, win: 'none', ndebele: 0, door: 'none' }); },
    p => { compound(p, 2, 20, 34, 2.6, 'lime'); hut(p, { x: 6, w: 12, gy: 30, hw: 4, rh: 6, wall: 'lime', roof: 'thatch', paint: '#B4362A', paint2: '#E3B23C' }); },
    p => H(p, { x: 6, w: 14, hw: 5, d: 12, rh: 8, form: 'cape', wall: 'lime', roof: 'thatch', rows: 1, win: 'shut', wc: '#3E6E3E', door: 'plain', dc: '#3E6E3E' }),
    p => hut(p, { x: 8, w: 13, gy: 33, hw: 4.5, rh: 6, wall: 'mudW', roof: 'thatch', paint: '#7A4A2A', paint2: '#F2EEE2' }),
  ]);
  def('zw', [
    p => { // dry-stone walling as at Great Zimbabwe: a curved enclosure with a chevron frieze and a conical tower, huts inside
      const gy = 33; p.poly([[3, gy], [24, gy], [27, gy - 4], [27, gy - 8], [24, gy - 4.5], [3, gy - 4.5]], WL.stoneG[0], 0.8);
      for (let y = gy - 0.8; y > gy - 4.5; y -= 0.8) p.col('rgba(70,60,50,0.5)').line([[3.2, y], [23.8, y]], 0.3); p.col(INK);
      for (let xx = 4; xx < 23; xx += 1.6) p.line([[xx, gy - 3.6], [xx + 0.8, gy - 2.8], [xx + 1.6, gy - 3.6]], 0.35);
      hut(p, { x: 6, w: 8, gy: gy - 5.5, hw: 2.6, rh: 4, wall: 'mudR', roof: 'thatch' });
      p.poly([[19, gy - 4.5], [19.6, gy - 12], [21.4, gy - 12.6], [23, gy - 12], [23.6, gy - 4.5]], WL.stoneG[0], 0.7); for (let y = gy - 5.3; y > gy - 12; y -= 0.8) p.col('rgba(70,60,50,0.5)').line([[19.4, y], [23.3, y]], 0.3); p.col(INK);
    },
    p => hut(p, { x: 8, w: 13, gy: 33, hw: 4.5, rh: 6.5, wall: 'stoneG', roof: 'thatch', stoneBase: true }),
  ]);
  // ---- South Asia: Rajasthani havelis with jharokhas and chhatris (pink, yellow sandstone, Jodhpur blue), Kerala and Bengal roofs
  def('in', [
    p => H(p, { x: 5, w: 15, hw: 8, d: 12, form: 'flat', wall: 'pinkJ', rows: 2, win: 'arch', chhatri: [0.25, 0.75], door: 'arch', band: ['#F4F0E4', 0.5] }),
    p => H(p, { x: 5, w: 15, hw: 10, d: 12, form: 'flat', wall: 'sand', rows: 3, win: 'lat', wc: '#9C7442', jhar: 2, chhatri: [0.5], door: 'arch', quoin: false }),
    p => { H(p, { x: 4, w: 9, hw: 6, d: 11, form: 'flat', wall: 'blueJ', rows: 2, win: 'sq', door: 'plain' }); H(p, { x: 13, w: 9, hw: 8, d: 11, form: 'flat', wall: 'blueJ', rows: 2, win: 'arch', door: 'arch', rail: '#F4F0E4' }); },
    p => H(p, { x: 4, w: 17, hw: 4.5, d: 13, rh: 8, form: 'hip', ov: 1.4, wall: 'lime', roof: 'terraL', rows: 1, win: 'lat', wc: '#6A4428', vera: 'terraL', veraH: 0.8, lift: 0.4 }),
    p => H(p, { x: 5, w: 15, hw: 4, d: 11, rh: 6, form: 'hip', ov: 1, wall: 'mudL', roof: 'thatch', rows: 1, win: 'small', lift: 2.2 }),
    p => H(p, { x: 4, w: 17, hw: 5.5, d: 13, rh: 5, form: 'hip', ov: 1.2, wall: 'ochre', roof: 'terra', rows: 1, win: 'sq', vera: 'terra', veraH: 0.8, band: ['#B4362A', 0.8] }),
    p => H(p, { x: 5, w: 15, hw: 9, d: 12, form: 'flat', wall: 'pO', rows: 2, win: 'arch', relief: '#3F6FB0', jhar: 1, chhatri: [0.2, 0.8], door: 'big', dc: '#6A4428' }),
    p => H(p, { x: 6, w: 13, hw: 9, d: 12, form: 'flat', wall: 'pY', rows: 2, win: 'lat', wc: '#7A5232', bal: 'w', balAt: 1, balCol: '#7A5232', door: 'big', dc: '#7A5232', rail: '#7A5232' }),
    p => H(p, { x: 6, w: 14, hw: 4, d: 11, rh: 5, form: 'eaves', wall: 'mud', roof: 'thatch', rows: 1, win: 'small', ov: 0.6 }),
  ]);
  // ---- Nepal and Bhutan: Newar brick houses with carved wooden windows; Himalayan houses with prayer flags
  def('np', [
    p => H(p, { x: 6, w: 14, hw: 9, d: 12, rh: 4.5, form: 'eaves', ov: 1.4, wall: 'redB', roof: 'terra', rows: 3, win: 'lat', wc: '#4E3420', door: 'plain' }),
    p => { H(p, { x: 3, w: 9, hw: 10, d: 12, rh: 4, form: 'eaves', ov: 1.2, wall: 'redB', roof: 'terra', rows: 3, win: 'lat', wc: '#4E3420' }); H(p, { x: 12, w: 10, hw: 9, d: 12, rh: 4, form: 'eaves', ov: 1.2, wall: 'brickD', roof: 'terraL', rows: 3, win: 'lat', wc: '#4E3420', bal: 'w', balAt: 2 }); },
    p => H(p, { x: 5, w: 15, hw: 8, d: 12, form: 'flat', wall: 'lime', rows: 2, win: 'lat', wc: '#7A3A2A', band: ['#9E3A2A', 1.2], flags: true, door: 'plain' }),
  ]);
  // ---- Pakistan and Bangladesh: Lahore havelis with wooden jharokhas, timber-laced northern houses, Bengal huts
  def('pk', [
    p => H(p, { x: 5, w: 15, hw: 10, d: 12, form: 'flat', wall: 'brick', rows: 3, win: 'lat', wc: '#5E3A22', jhar: 2, door: 'big', dc: '#5E3A22', rail: '#5E3A22' }),
    p => H(p, { x: 5, w: 15, hw: 7, d: 12, form: 'flat', wall: 'stoneG', rows: 2, win: 'lat', wc: '#6A4428', toron: 0, band: ['#6A4428', 0.6], door: 'plain', quoin: false }),
  ]);
  // ---- Sri Lanka: tiled roofs over pillared verandahs
  def('lk', [
    p => H(p, { x: 4, w: 17, hw: 5, d: 13, rh: 6, form: 'hip', ov: 1.2, wall: 'lime', roof: 'terra', rows: 1, win: 'shut', wc: '#3E6E3E', vera: 'terra', veraH: 0.8 }),
  ]);
  // ---- China and Taiwan: Hui horse-head walls, grey-brick courtyards, red lacquer and gold eaves, swallowtail ridges
  def('cn', [
    p => H(p, { x: 5, w: 15, hw: 7, d: 12, rh: 4.5, form: 'eaves', wall: 'plaster', roof: 'ink', rows: 2, win: 'lat', wc: '#3E2A20', hh: true, door: 'plain' }),
    p => H(p, { x: 4, w: 17, hw: 5, d: 13, rh: 5, form: 'eaves', ov: 1, wall: 'greyB', roof: 'greyT', rows: 1, win: 'lat', wc: '#A8281C', lift: 0.8, rc: 0.8, door: 'big', dc: '#A8281C' }),
    p => H(p, { x: 5, w: 15, hw: 8, d: 12, rh: 4.5, form: 'hip', ov: 1.6, wall: 'plaster', roof: 'ink', rows: 2, win: 'lat', wc: '#A8281C', lac: 4, lant: 2, lift: 2, eaveGold: true, bal: 'w', balAt: 1, balCol: '#A8281C' }),
    p => H(p, { x: 5, w: 15, hw: 6, d: 12, rh: 5, form: 'eaves', ov: 0.8, wall: 'greyB', roof: 'greyT', rows: 1, win: 'lat', wc: '#3E2A20', rc: 2.2, lift: 0.6, door: 'big' }),
    p => H(p, { x: 4, w: 17, hw: 5.5, d: 12, rh: 5, form: 'eaves', ov: 0.8, wall: 'redB', roof: 'orange', rows: 1, win: 'lat', wc: '#3E5E3A', rc: 2.8, swal: true, door: 'big', dc: '#A8281C' }),
    p => H(p, { x: 6, w: 13, hw: 8.5, d: 12, rh: 4.5, form: 'eaves', ov: 1.4, wall: 'wood', roof: 'greyT', rows: 2, win: 'lat', wc: '#3E2A20', lant: 2, lift: 1.4, bal: 'w', balAt: 1, door: 'plain' }),
    p => { const gy = 33; p.poly([[2, gy], [26, gy], [28, gy - 9], [4, gy - 9]], WL.mudL[0], 0.8); for (const cx of [8, 15, 22]) { p.poly([[cx - 2.4, gy], [cx - 2.4, gy - 3.5], [cx, gy - 6], [cx + 2.4, gy - 3.5], [cx + 2.4, gy]], WL.plaster[0], 0.6); clipDo(p, [[cx - 2, gy], [cx - 2, gy - 3.3], [cx, gy - 5.5], [cx + 2, gy - 3.3], [cx + 2, gy]], () => p.hatch([[cx - 3, gy], [cx - 3, gy - 6], [cx + 3, gy - 6], [cx + 3, gy]], 90, 0.7, 0.25, '#7A5232')); } p.line([[3, gy - 9.5], [27, gy - 9.5]], 0.4); for (let i = 0; i < 25; i++) p.col('rgba(110,80,40,0.45)').line([[4 + i, gy - 10.5 - (i % 3) * 0.3], [5 + i, gy - 11 - (i % 2)]], 0.35); p.col(INK); },   // loess cave dwellings (yaodong)
    p => H(p, { x: 5, w: 15, hw: 4.5, d: 12, form: 'flat', wall: 'adobe', win: 'lat', wc: '#7A3A2A', door: 'plain', court: [0.3, 0.7] }),
  ]);
  // ---- Korea: hanok with gently curved tile roofs, white walls and timber; thatched choga houses
  def('kr', [
    p => H(p, { x: 4, w: 17, hw: 5, d: 12, rh: 5, form: 'hip', ov: 1.8, wall: 'plaster', roof: 'ink', rows: 1, win: 'lat', wc: '#7A5232', lift: 2.4, lac: 4, base: ['#BDB6A6', 1.2] }),
    p => H(p, { x: 5, w: 15, hw: 5, d: 12, rh: 5.5, form: 'eaves', ov: 1.6, wall: 'plaster', roof: 'greyT', rows: 1, win: 'lat', wc: '#7A5232', lift: 2, rc: 1.2, base: ['#BDB6A6', 1.2] }),
    p => H(p, { x: 6, w: 14, hw: 4, d: 11, rh: 4.5, form: 'hip', ov: 0.9, wall: 'mudL', roof: 'straw', rows: 1, win: 'lat', wc: '#7A5232' }),
  ]);
  // ---- Japan: machiya (dark timber lattice, white plaster, grey tiles), kura storehouses, thatched minka and gassho houses
  def('jp', [
    p => H(p, { x: 5, w: 15, hw: 7, d: 12, rh: 4, form: 'eaves', ov: 1, wall: 'dkwood', roof: 'ink', rows: 2, win: 'lat', wc: '#2E2218', base: ['#3E2E22', 3], door: 'plain' }),
    p => H(p, { x: 7, w: 12, hw: 8, d: 12, rh: 4.5, form: 'gable', ov: 0.6, wall: 'plaster', roof: 'ink', rows: 2, win: 'small', base: ['#3A3A3E', 2.6], door: 'big', dc: '#3A3A3E' }),
    p => H(p, { x: 7, w: 12, hw: 5, d: 13, rh: 13, form: 'gable', wall: 'dkwood', roof: 'thatch', rows: 2, win: 'lat', wc: '#2E2218' }),
    p => H(p, { x: 4, w: 17, hw: 5, d: 13, rh: 5.5, form: 'hip', ov: 1.6, wall: 'plaster', roof: 'ink', rows: 1, win: 'lat', wc: '#4E3A2A', lift: 1, base: ['#4E3A2A', 1.4], lac: 4 }),
    p => { H(p, { x: 2, w: 10, hw: 7, d: 12, rh: 4, form: 'eaves', ov: 0.8, wall: 'dkwood', roof: 'ink', rows: 2, win: 'lat', wc: '#2E2218' }); H(p, { x: 12, w: 10, hw: 7, d: 12, rh: 4, form: 'eaves', ov: 0.8, wall: 'plaster', roof: 'greyT', rows: 2, win: 'lat', wc: '#2E2218', base: ['#4E3A2A', 3] }); },
    p => H(p, { x: 4, w: 17, hw: 4, d: 13, rh: 9, form: 'hip', ov: 0.8, wall: 'dkwood', roof: 'thatchD', rows: 1, win: 'lat', wc: '#2E2218', rc: 0 }),
    p => H(p, { x: 6, w: 14, hw: 7.5, d: 12, rh: 4.5, form: 'eaves', ov: 1, wall: 'plaster', roof: 'ink', rows: 2, win: 'lat', wc: '#2E2218', hh: false, base: ['#2E2218', 3], chim: false }),
  ]);
  // ---- Southeast Asia: houses on stilts, Thai gables with gold finials, shophouses, Malay and Minangkabau roofs, bahay na bato
  def('se', [
    p => H(p, { x: 6, w: 14, hw: 4, d: 11, rh: 7, form: 'gable', ov: 1, wall: 'bamboo', roof: 'palm', rows: 1, win: 'small', stilt: 4 }),
    p => H(p, { x: 7, w: 12, hw: 4.5, d: 12, rh: 9, form: 'gable', ov: 0.8, wall: 'teak', roof: 'terra', rows: 1, win: 'sq', stilt: 3.6, gfin: GOLD }),
    p => { H(p, { x: 2, w: 7, hw: 8, d: 12, rh: 3, form: 'eaves', wall: 'pB', roof: 'terra', rows: 2, win: 'shut', wc: '#3E6E3E', arc: 1 }); H(p, { x: 9, w: 7, hw: 8, d: 12, rh: 3, form: 'eaves', wall: 'pY', roof: 'terra', rows: 2, win: 'shut', wc: '#3E6E3E', arc: 1 }); H(p, { x: 16, w: 7, hw: 8, d: 12, rh: 3, form: 'eaves', wall: 'pG', roof: 'terra', rows: 2, win: 'shut', wc: '#5E4430', arc: 1 }); },
    p => H(p, { x: 10, w: 7, hw: 12, d: 13, rh: 3, form: 'eaves', wall: 'pY', roof: 'terra', rows: 3, win: 'shut', wc: '#3E6E3E', bal: 'i', balAt: 1, rail: '#2B2B2B' }),
    p => H(p, { x: 5, w: 15, hw: 4.5, d: 12, rh: 7, form: 'eaves', ov: 1, wall: 'teak', roof: 'iron', rows: 1, win: 'shut', wc: '#5E4430', stilt: 3.6, rc: 0.6 }),
    p => H(p, { x: 4, w: 17, hw: 4.5, d: 11, rh: 5, form: 'eaves', ov: 1, wall: 'teak', roof: 'ink', rows: 1, win: 'lat', wc: '#C9982E', stilt: 2.4, rc: 6, ladder: false, relief: '#C9982E' }),   // Minangkabau rumah gadang
    p => H(p, { x: 8, w: 11, hw: 3.6, d: 10, rh: 6, form: 'gable', wall: 'bamboo', roof: 'palm', rows: 1, win: 'small', stilt: 3 }),
    p => H(p, { x: 4, w: 17, hw: 8.5, d: 12, rh: 5, form: 'hip', ov: 1, wall: 'stoneG', jetWall: 'teak', roof: 'terra', rows: 2, win: 'lat', wc: '#F2EEE2', jet: true, quoin: false, door: 'arch' }),   // bahay na bato
    p => H(p, { x: 6, w: 13, hw: 4.5, d: 12, rh: 8, form: 'gable', ov: 1, wall: 'teak', roof: 'orange', rows: 1, win: 'shut', wc: '#5E4430', stilt: 3.4, gfin: GOLD, cross: false }),
  ]);
  // ---- Mexico, Central America and South America: whitewash and red tiles, arcades, painted walls, enclosed balconies,
  // pastel rows, Ouro Preto whites, Andean adobe and stone
  def('la', [
    p => H(p, { x: 4, w: 17, hw: 5, d: 12, rh: 3.4, form: 'eaves', wall: 'lime', roof: 'terra', rows: 1, win: 'grille', wc: '#7A5232', door: 'big', dc: '#6A4428', band: ['#B4472E', 0.7] }),
    p => H(p, { x: 4, w: 17, hw: 9, d: 12, rh: 3.4, form: 'eaves', wall: 'pO', roof: 'terra', rows: 2, arc: 4, win: 'frame', bal: 'i', balAt: 1 }),
    p => { H(p, { x: 3, w: 9, hw: 5.5, d: 11, form: 'flat', wall: 'magenta', win: 'grille', door: 'plain', dc: '#3F6FB0', band: ['#3F6FB0', 0.8] }); H(p, { x: 12, w: 10, hw: 5, d: 11, form: 'flat', wall: 'cobalt', win: 'grille', door: 'plain', dc: '#E2A33A', band: ['#E2A33A', 0.8] }); },
    p => H(p, { x: 5, w: 15, hw: 9, d: 12, rh: 3.2, form: 'eaves', wall: 'pY', roof: 'terra', rows: 2, win: 'frame', bal: 'w', balAt: 1, balCol: '#5E3A22', door: 'big', dc: '#5E3A22', pots: 3 }),
    p => H(p, { x: 5, w: 15, hw: 9, d: 12, form: 'flat', wall: 'pB', rows: 2, win: 'frame', bal: 'box', balAt: 1, balCol: '#3E5A3A', door: 'big' }),
    p => { H(p, { x: 2, w: 7, hw: 6, d: 12, rh: 3, form: 'eaves', wall: 'pP', roof: 'terra', rows: 1, win: 'grille', door: 'plain' }); H(p, { x: 9, w: 7, hw: 6.5, d: 12, rh: 3, form: 'eaves', wall: 'teal', roof: 'terra', rows: 1, win: 'grille', door: 'plain' }); H(p, { x: 16, w: 7, hw: 6, d: 12, rh: 3, form: 'eaves', wall: 'saffron', roof: 'terra', rows: 1, win: 'grille', door: 'plain' }); },
    p => H(p, { x: 5, w: 15, hw: 5, d: 12, rh: 4.5, form: 'eaves', wall: 'lime', roof: 'terraL', rows: 1, win: 'frame', wc: '#3F6FB0', base: ['#9E6A44', 1.4], door: 'plain', dc: '#3F6FB0', ridgeOrn: '#B4472E' }),   // Andean: white walls, red tiles, a pair of clay bulls on the ridge
    p => H(p, { x: 6, w: 13, hw: 4.5, d: 11, rh: 7, form: 'gable', wall: 'stoneG', roof: 'straw', rows: 1, win: 'small', quoin: false, door: 'plain' }),
    p => H(p, { x: 5, w: 15, hw: 8.5, d: 12, rh: 4, form: 'eaves', wall: 'lime', roof: 'terra', rows: 2, win: 'blue', door: 'big', dc: '#3F6FB0', trim: '#3F6FB0', bal: 'i', balAt: 1 }),
    p => H(p, { x: 3, w: 18, hw: 5.5, d: 14, rh: 3, form: 'hip', wall: 'ochre', roof: 'terra', rows: 1, arc: 5, win: 'none' }),
    p => H(p, { x: 6, w: 14, hw: 5, d: 12, rh: 3, form: 'eaves', wall: 'lime2', roof: 'terraL', rows: 1, win: 'grille', wc: '#F4F0E4', door: 'big', dc: '#B4472E', band: ['#B4472E', 0.8] }),
  ]);

  // =====================================================================================================================
  // churches, mosques and temples (30 x 40 logical px, ground at y 36, like the round 4 'townchurch')
  const T = {};
  function towerBox(p, cx, gy, tw, th, Wk, opt) { opt = opt || {}; const W = WL[Wk]; const l = cx - tw / 2; p.poly([[l + tw, gy], [l + tw + tw * 0.3, gy - tw * 0.55], [l + tw + tw * 0.3, gy - th - tw * 0.55], [l + tw, gy - th]], W[1], 0.7); p.hatch([[l + tw, gy], [l + tw + tw * 0.3, gy - tw * 0.55], [l + tw + tw * 0.3, gy - th - tw * 0.55], [l + tw, gy - th]], 70, 1.3, 0.4, 'rgba(43,33,25,0.45)'); p.rect(l, gy - th, tw, th, W[0], 0.8); if (opt.win !== false) for (let k = 0; k < (opt.n || 2); k++) win(p, cx, gy - th + 1.2 + k * th / (opt.n || 2) * 0.9, opt.win || 'arch', null, 0.9); return [cx + tw * 0.15, gy - th - tw * 0.27]; }
  T['tc-baroque'] = p => { H(p, { x: 3, w: 15, hw: 8, d: 12, rh: 7, form: 'eaves', wall: 'pY', roof: 'tileD', rows: 1, win: 'arch', door: 'arch' }); const t = towerBox(p, 22, 36, 6, 17, 'pY'); dome(p, [t[0], t[1]], 3.4, '#4E7A62', { onion: true, fin: 'cross' }); p.rect(t[0] - 0.8, t[1] - 7.4, 1.6, 2, '#4E7A62', 0.4); dome(p, [t[0], t[1] - 7.2], 1.4, '#4E7A62', { onion: true, fin: 'cross' }); };
  T['tc-nordic'] = p => { H(p, { x: 3, w: 15, hw: 7, d: 12, rh: 8, form: 'eaves', wall: 'lime', roof: 'tileD', rows: 1, win: 'arch', door: 'arch' }); const t = towerBox(p, 22, 36, 6, 15, 'lime'); p.poly([[t[0] - 3.6, t[1] + 1.6], [t[0], t[1] - 13], [t[0] + 3.6, t[1] + 1.6]], SNOWY ? SNOW : '#4C4452', 0.7); p.line([[t[0], t[1] - 13], [t[0], t[1] - 15]], 0.5); };
  T['tc-stave'] = p => {   // a Norwegian stave church: stacked steep roofs, dragon heads at the gables, a shingled spire
    const cx = 15, gy = 36, W = WL.teak, R = RF.shingle;
    const tier = (y, w, h, rh) => { p.rect(cx - w / 2, y - h, w, h, W[0], 0.7); clipDo(p, [[cx - w / 2, y], [cx - w / 2, y - h], [cx + w / 2, y - h], [cx + w / 2, y]], () => { for (let xx = cx - w / 2; xx < cx + w / 2; xx += 1) p.col('rgba(20,10,5,0.3)').line([[xx, y], [xx, y - h]], 0.3); }); p.col(INK); slope(p, [[cx - w / 2 - 1.5, y - h], [cx + w / 2 + 1.5, y - h]], [cx + w / 4, y - h - rh], [cx - w / 4, y - h - rh], R, false); for (const s of [-1, 1]) { const q = [cx + s * (w / 2 + 1.5), y - h]; p.col('#2B2119').line([q, [q[0] + s * 1, q[1] - 2.2], [q[0] + s * 2, q[1] - 2]], 0.6).col(INK); } };
    tier(gy, 20, 6, 4); tier(gy - 10, 13, 4, 3.5); tier(gy - 17.5, 8, 3.5, 3);
    p.poly([[cx - 2.6, gy - 24], [cx, gy - 34], [cx + 2.6, gy - 24]], SNOWY ? SNOW : R[0], 0.7); door(p, cx, gy, 'arch');
  };
  T['tc-onion'] = p => { H(p, { x: 2, w: 16, hw: 8, d: 12, rh: 4, form: 'hip', wall: 'lime', roof: 'green', rows: 1, win: 'arch', door: 'arch' }); for (const [cx, by, r, c] of [[10, 22, 3.2, '#3F6FB0'], [5, 25, 1.8, '#3F6FB0'], [15, 25, 1.8, '#3F6FB0']]) { p.rect(cx - r * 0.7, by, r * 1.4, 3.5, WL.lime[0], 0.5); dome(p, [cx, by], r, c, { onion: true, fin: 'cross', stars: true }); } const t = towerBox(p, 24, 36, 5, 16, 'lime'); p.poly([[t[0] - 2.6, t[1]], [t[0], t[1] - 7], [t[0] + 2.6, t[1]]], '#4E7A62', 0.6); dome(p, [t[0], t[1] - 6.6], 1.2, GOLD, { onion: true, fin: 'cross' }); };
  T['tc-campanile'] = p => { H(p, { x: 3, w: 15, hw: 9, d: 14, rh: 4, form: 'gable', wall: 'stoneM', roof: 'terra', rows: 1, win: 'round', door: 'arch', quoin: false }); const t = towerBox(p, 23, 36, 6, 24, 'stoneM', { n: 3 }); p.rect(t[0] - 3.4, t[1] - 0.3, 6, 3, WL.stoneM[0], 0.6); win(p, t[0] - 1.2, t[1] + 0.2, 'arch'); win(p, t[0] + 1, t[1] + 0.2, 'arch'); p.poly([[t[0] - 3.8, t[1] - 0.3], [t[0] - 0.4, t[1] - 3], [t[0] + 3, t[1] - 0.3]], SNOWY ? SNOW : RF.terra[0], 0.6); };
  T['tc-byz'] = p => { H(p, { x: 4, w: 18, hw: 7, d: 14, rh: 3, form: 'hip', wall: 'stoneM', roof: 'terra', rows: 1, win: 'arch', door: 'arch', quoin: false, band: ['#B4472E', 0.6] }); const q = [16, 20]; p.rect(q[0] - 3, q[1] - 4.5, 6, 4.5, WL.stoneM[0], 0.6); win(p, q[0] - 1.2, q[1] - 3.8, 'arch', null, 0.8); win(p, q[0] + 1.2, q[1] - 3.8, 'arch', null, 0.8); dome(p, [q[0], q[1] - 4.5], 3.2, RF.terra[0], { fin: 'cross' }); };
  T['tc-cyc'] = p => { H(p, { x: 4, w: 14, hw: 7, d: 12, form: 'flat', wall: 'lime', win: 'arch', door: 'arch', dc: '#2F5F9E' }); dome(p, [13, 23], 3.6, '#3F78C0', { fin: 'cross' }); p.rect(19, 18, 5, 18, WL.lime[0], 0.7); p.rect(19.8, 20, 3.4, 4, '#4A6A9A', 0); p.dot(21.5, 22.5, 0.8, GOLD); p.poly([[19, 18], [21.5, 15.5], [24, 18]], WL.lime[0], 0.6); p.line([[21.5, 15.5], [21.5, 13.5]], 0.5).line([[20.8, 14.3], [22.2, 14.3]], 0.4); };
  T['tc-arm'] = p => { H(p, { x: 4, w: 18, hw: 9, d: 13, rh: 3.5, form: 'gable', wall: 'stoneG', roof: 'stoneS', rows: 1, win: 'slit', door: 'arch', quoin: false }); const q = [15, 22]; p.rect(q[0] - 2.8, q[1] - 6, 5.6, 6, WL.stoneG[0], 0.6); win(p, q[0], q[1] - 5, 'slit'); p.poly([[q[0] - 3.2, q[1] - 6], [q[0], q[1] - 11], [q[0] + 3.2, q[1] - 6]], SNOWY ? SNOW : RF.stoneS[0], 0.6); p.line([[q[0], q[1] - 11], [q[0], q[1] - 13]], 0.5).line([[q[0] - 0.7, q[1] - 12.2], [q[0] + 0.7, q[1] - 12.2]], 0.4); };
  const minaret = (p, cx, gy, h, Wk, kind, cap) => {
    const W = WL[Wk];
    if (kind === 'sq') { towerBox(p, cx, gy, 4, h, Wk, { win: 'arch', n: 2 }); p.rect(cx - 2.4, gy - h - 3, 4.8, 3, W[0], 0.6); win(p, cx, gy - h - 2.4, 'arch', null, 0.8); p.poly([[cx - 2.6, gy - h - 3], [cx, gy - h - 5.5], [cx + 2.6, gy - h - 3]], cap || '#4F8A72', 0.5); p.line([[cx, gy - h - 5.5], [cx, gy - h - 7]], 0.45); return; }
    p.rect(cx - 1.1, gy - h, 2.2, h, W[0], 0.7); p.hatch([[cx + 0.2, gy], [cx + 1.1, gy], [cx + 1.1, gy - h], [cx + 0.2, gy - h]], 75, 1.1, 0.35, 'rgba(43,33,25,0.45)');
    for (const k of [0.45, 0.78]) { const y = gy - h * k; p.poly([[cx - 2, y], [cx + 2, y], [cx + 1.2, y + 0.9], [cx - 1.2, y + 0.9]], W[0], 0.5); p.line([[cx - 2, y - 0.8], [cx + 2, y - 0.8]], 0.3); }
    if (kind === 'pencil') { p.poly([[cx - 1.2, gy - h], [cx, gy - h - 6], [cx + 1.2, gy - h]], SNOWY ? SNOW : (cap || '#6A7480'), 0.55); p.col(GOLD).line([[cx, gy - h - 6], [cx, gy - h - 7.5]], 0.45).col(INK); }
    else { p.rect(cx - 0.9, gy - h - 2, 1.8, 2, W[0], 0.5); dome(p, [cx, gy - h - 2], 1.1, cap || W[0], { fin: 'crescent' }); }
  };
  T['tc-mosque'] = p => { H(p, { x: 3, w: 18, hw: 6, d: 14, form: 'flat', wall: 'stoneM', win: 'arch', door: 'arch', quoin: false }); const q = [13, 24]; p.rect(q[0] - 5, q[1] - 2.4, 10, 2.4, WL.stoneM[0], 0.6); dome(p, [q[0], q[1] - 2.4], 5, '#7A8490', { fin: 'crescent' }); dome(p, [6, 26], 2, '#7A8490'); minaret(p, 25, 36, 20, 'stoneM', 'pencil'); };
  T['tc-mosque-a'] = p => { H(p, { x: 3, w: 17, hw: 7, d: 14, form: 'flat', wall: 'sand', win: 'arch', door: 'arch', quoin: false, crenel: true }); const q = [11, 23]; p.rect(q[0] - 3.6, q[1] - 3, 7.2, 3, WL.sand[0], 0.6); dome(p, [q[0], q[1] - 3], 3.8, WL.sand[0], { tall: 1.25, fin: 'crescent' }); clipDo(p, [[q[0] - 4, q[1] - 3], [q[0] + 4, q[1] - 3], [q[0] + 4, q[1] - 9], [q[0] - 4, q[1] - 9]], () => { for (let k = -3; k <= 3; k++) p.col('rgba(80,60,30,0.5)').line([[q[0] + k * 1.1, q[1] - 3], [q[0] + k * 0.4, q[1] - 8]], 0.3); }); minaret(p, 24, 36, 20, 'sand', 'round'); };
  T['tc-mosque-m'] = p => { H(p, { x: 3, w: 17, hw: 6, d: 14, rh: 3, form: 'hip', wall: 'lime', roof: 'jade', rows: 1, win: 'arch', door: 'arch', dc: '#3F6FB0' }); minaret(p, 23, 36, 18, 'sand', 'sq', '#4F8A72'); };
  T['tc-mosque-ca'] = p => { H(p, { x: 3, w: 16, hw: 8, d: 13, form: 'flat', wall: 'sand', win: 'arch', door: 'big', dc: '#3E9AA0', band: ['#3E9AA0', 1.2], quoin: false }); const q = [10, 22]; p.rect(q[0] - 3.4, q[1] - 3.4, 6.8, 3.4, '#3E9AA0', 0.6); dome(p, [q[0], q[1] - 3.4], 3.8, '#3EA6B0', { tall: 1.3, fin: 'crescent' }); minaret(p, 23, 36, 22, 'sand', 'round', '#3EA6B0'); };
  T['tc-dome'] = p => { H(p, { x: 4, w: 18, hw: 7, d: 14, form: 'flat', wall: 'sand', win: 'arch', door: 'arch', quoin: false }); const q = [14, 22]; p.rect(q[0] - 4, q[1] - 2.6, 8, 2.6, WL.sand[0], 0.6); dome(p, [q[0], q[1] - 2.6], 4.2, '#9AA0A8', {}); };
  T['tc-sahel'] = p => {   // a Sudano-Sahelian mosque: tapering towers with toron beams and ostrich-egg finials
    H(p, { x: 2, w: 20, hw: 7, d: 13, form: 'flat', wall: 'mud', rows: 1, win: 'none', toron: 2, butt: 6, door: 'big', pinn: 6 });
    for (const [cx, h, w] of [[6, 19, 5], [13, 23, 6], [20, 19, 5]]) { const gy = 36; p.poly([[cx - w / 2, gy - 6], [cx - w * 0.35, gy - h], [cx + w * 0.35, gy - h], [cx + w / 2, gy - 6]], WL.mud[0], 0.7); p.col('#4E3420'); for (let y = gy - 8; y > gy - h + 1; y -= 2.6) for (let xx = cx - w * 0.35; xx <= cx + w * 0.35; xx += 1.3) p.line([[xx, y], [xx - 0.3, y + 0.7]], 0.5); p.col(INK); p.poly([[cx - w * 0.35, gy - h], [cx, gy - h - 2.4], [cx + w * 0.35, gy - h]], WL.mud[0], 0.5); p.ell(cx, gy - h - 2.8, 0.55, 0.65, '#F2EEE2', 0.3); }
  };
  T['tc-swmosque'] = p => { H(p, { x: 3, w: 18, hw: 6, d: 14, form: 'flat', wall: 'coral', win: 'arch', door: 'carved', crenel: true }); minaret(p, 23, 36, 14, 'coral', 'round', '#4F8A72'); };
  T['tc-afchurch'] = p => { H(p, { x: 4, w: 13, hw: 7, d: 14, rh: 6, form: 'gable', wall: 'lime', roof: 'iron', rows: 1, win: 'arch', door: 'arch', cross: true }); const t = towerBox(p, 22, 36, 5, 15, 'lime'); p.poly([[t[0] - 2.8, t[1]], [t[0], t[1] - 5], [t[0] + 2.8, t[1]]], SNOWY ? SNOW : RF.iron[0], 0.6); p.line([[t[0], t[1] - 5], [t[0], t[1] - 7]], 0.5).line([[t[0] - 0.7, t[1] - 6.3], [t[0] + 0.7, t[1] - 6.3]], 0.4); };
  T['tc-ethround'] = p => { hut(p, { x: 4, w: 22, gy: 36, hw: 7, rh: 11, wall: 'stoneM', roof: 'thatchD', fin: 'cross', door: 'plain' }); };
  T['tc-shikhara'] = p => {   // a Nagara temple: a mandapa and a curvilinear tower with an amalaka and a flag
    const gy = 36, cx = 18, W = WL.sand; H(p, { x: 2, w: 11, hw: 5, d: 11, form: 'flat', wall: 'sand', win: 'none', door: 'arch', quoin: false, domes: [[0.5, 0.5, 2.6]], arc: 2 });
    p.rect(cx - 5, gy - 7, 10, 7, W[0], 0.7); door(p, cx, gy, 'arch');
    const tw = [[cx - 5, gy - 7], [cx - 4.6, gy - 14], [cx - 3.4, gy - 21], [cx - 1.6, gy - 26], [cx + 1.6, gy - 26], [cx + 3.4, gy - 21], [cx + 4.6, gy - 14], [cx + 5, gy - 7]];
    p.poly(tw, W[0], 0.8); clipDo(p, tw, () => { for (let y = gy - 8; y > gy - 26; y -= 1.4) p.col('rgba(90,60,30,0.5)').line([[cx - 6, y], [cx + 6, y]], 0.3); for (const xx of [-2.4, 0, 2.4]) p.col('rgba(90,60,30,0.6)').line([[cx + xx, gy - 7], [cx + xx * 0.5, gy - 26]], 0.4); p.hatch([[cx + 1, gy], [cx + 6, gy], [cx + 6, gy - 27], [cx + 1, gy - 27]], 75, 1.3, 0.35, 'rgba(43,33,25,0.35)'); });
    p.ell(cx, gy - 26.6, 2.4, 0.9, W[0], 0.6); p.ell(cx, gy - 27.8, 0.8, 0.8, GOLD, 0.4); p.line([[cx, gy - 28.6], [cx, gy - 32]], 0.45); p.poly([[cx, gy - 32], [cx + 2.6, gy - 31.2], [cx, gy - 30.4]], '#D9701E', 0.3);
  };
  T['tc-mughal'] = p => { H(p, { x: 3, w: 19, hw: 7, d: 13, form: 'flat', wall: 'redB', win: 'arch', door: 'arch', arc: 0, band: ['#F4F0E4', 0.6], chhatri: [0.1, 0.9] }); const q = [12.5, 23]; p.rect(q[0] - 3.4, q[1] - 2.5, 6.8, 2.5, WL.lime[0], 0.6); dome(p, [q[0], q[1] - 2.5], 3.8, '#F4F0E4', { onion: true, fin: 'crescent' }); };
  T['tc-stupa'] = p => { const gy = 36, cx = 15; for (const [w, h] of [[22, 2], [18, 2]]) { } p.rect(cx - 11, gy - 2, 22, 2, WL.lime[0], 0.7); p.rect(cx - 9, gy - 4, 18, 2, WL.lime[0], 0.7); const b = [cx, gy - 4]; const pts = []; for (let i = 0; i <= 16; i++) { const a = Math.PI + Math.PI * i / 16; pts.push([b[0] + Math.cos(a) * 8, b[1] + Math.sin(a) * 8]); } p.poly(pts, SNOWY ? SNOW : '#F4F0E4', 0.8); p.hatch(pts.concat([b]), 75, 1.3, 0.35, 'rgba(43,33,25,0.25)'); p.rect(cx - 2, gy - 14, 4, 2.2, '#F4F0E4', 0.6); p.poly([[cx - 1.6, gy - 14], [cx, gy - 27], [cx + 1.6, gy - 14]], GOLD, 0.6); for (let k = 1; k < 7; k++) p.line([[cx - 1.6 * (1 - k / 7), gy - 14 - 13 * k / 7], [cx + 1.6 * (1 - k / 7), gy - 14 - 13 * k / 7]], 0.3); p.dot(cx, gy - 27.5, 0.5, GOLD); };
  T['tc-pagoda'] = p => {   // a five-storey pagoda: curved eaves, red posts and a spire of rings
    const gy = 36, cx = 15, R = RF.ink;
    for (let k = 0; k < 5; k++) { const w = 12 - k * 1.6, y = gy - k * 5.2, h = 2.8; p.rect(cx - w / 2, y - h, w, h, k ? WL.plaster[0] : '#A8281C', 0.6); if (!k) { door(p, cx, y, 'plain'); } else p.col('#A8281C').line([[cx - w / 2 + 0.4, y], [cx - w / 2 + 0.4, y - h]], 0.6).line([[cx + w / 2 - 0.4, y], [cx + w / 2 - 0.4, y - h]], 0.6).col(INK); const ew = w + 5; slope(p, eaveLine([cx - ew / 2, y - h + 0.3], [cx + ew / 2, y - h + 0.3], 1.6), [cx + w * 0.35, y - h - 2.2], [cx - w * 0.35, y - h - 2.2], R, false); }
    const t = gy - 5 * 5.2 - 0.2; p.line([[cx, t + 2], [cx, t - 6]], 0.7); for (let k = 0; k < 5; k++) p.ell(cx, t - k * 1.1, 0.9, 0.3, GOLD, 0.3); p.dot(cx, t - 6.3, 0.6, GOLD);
  };
  T['tc-wat'] = p => {   // a Thai temple hall: layered steep roofs in orange and green with gold chofa finials, white walls
    H(p, { x: 4, w: 16, hw: 6, d: 15, rh: 12, form: 'gable', wall: 'lime', roof: 'orange', rows: 1, win: 'arch', door: 'big', dc: GOLD, gfin: GOLD, base: ['#D8D0C0', 1.2] });
    p.poly([[2.6, 27.5], [12, 15.5], [12.6, 16.6], [4.2, 27.5]], RF.jade[0], 0.5); p.poly([[21.4, 27.5], [12, 15.5], [11.4, 16.6], [19.8, 27.5]], RF.jade[1], 0.5);
    const cx = 24, gy = 36; p.rect(cx - 2, gy - 6, 4, 6, '#F4F0E4', 0.6); p.poly([[cx - 2.2, gy - 6], [cx, gy - 18], [cx + 2.2, gy - 6]], GOLD, 0.6); for (let k = 1; k < 6; k++) p.line([[cx - 2.2 * (1 - k / 6), gy - 6 - 12 * k / 6], [cx + 2.2 * (1 - k / 6), gy - 6 - 12 * k / 6]], 0.3);
  };
  T['tc-jmosque'] = p => {   // a Javanese mosque: a square hall under a three-tiered pyramid roof (meru), with a small minaret
    const gy = 36, cx = 13, R = RF.ink; p.rect(cx - 9, gy - 5, 18, 5, WL.lime[0], 0.7); door(p, cx, gy, 'big', '#3E6E3E');
    for (let k = 0; k < 3; k++) { const w = 22 - k * 6.5, y = gy - 5 - k * 5; slope(p, [[cx - w / 2, y], [cx + w / 2, y]], [cx + w * 0.22, y - 4.6], [cx - w * 0.22, y - 4.6], R, false); if (k < 2) p.rect(cx - w * 0.22, y - 5.6, w * 0.44, 1.2, WL.lime[0], 0.5); }
    p.line([[cx, gy - 19.5], [cx, gy - 22]], 0.5); p.dot(cx, gy - 22.2, 0.5, GOLD); minaret(p, 26, 36, 16, 'lime', 'round', '#4F8A72');
  };
  T['tc-colonial'] = p => {   // a Spanish colonial church: a white baroque facade with a curved gable and twin bell towers
    const gy = 36; p.poly([[8, gy], [22, gy], [22, gy - 14], [20, gy - 15], [18.5, gy - 18.5], [15, gy - 20], [11.5, gy - 18.5], [10, gy - 15], [8, gy - 14]], WL.lime[0], 0.8);
    p.poly([[22, gy], [26, gy - 6], [26, gy - 18], [22, gy - 14]], WL.lime[1], 0.6); door(p, 15, gy, 'big', '#6A4428'); p.ell(15, gy - 13, 1.4, 1.4, '#6A4428', 0.4); p.col('rgba(60,40,20,0.6)').line([[9, gy - 9], [21, gy - 9]], 0.4).col(INK);
    for (const cx of [6, 24]) { const t = towerBox(p, cx, gy, 4.6, 20, 'lime', { win: 'arch', n: 2 }); dome(p, [t[0] - 0.6, t[1] + 0.6], 2.2, '#D86A3A', { fin: 'cross' }); }
    p.line([[15, gy - 20], [15, gy - 23]], 0.5).line([[14.2, gy - 22.2], [15.8, gy - 22.2]], 0.45);
  };

  // =====================================================================================================================
  // medieval skyscrapers: the high-rise districts drawn as very tall houses in each region's own style, in four height
  // bands (about 20 to 40 m, 40 to 100 m, 100 to 200 m, over 200 m in OpenStreetMap)
  const TWB = [[30, 48, 4], [32, 64, 7], [36, 82, 11], [40, 104, 16]];   // [w, h, storeys] by band 1 to 4
  let WB = 1;   // the taller bands are a little stouter too
  function stack(p, o) {
    // a stack of storeys on a narrow plan, each storey a box (optionally jettied or with its own eaves), a cap on top
    const { cx, gy, n, sh } = o; let y = gy, w = o.w * WB;
    for (let k = 0; k < n; k++) {
      const wk = o.taper ? w * (1 - k / n * o.taper) : w, x0 = cx - wk / 2 - (o.jet && k ? 0.25 * k % 1 : 0);
      const W = WL[typeof o.wall === 'function' ? o.wall(k) : o.wall];
      face(p, [[x0 + wk, y], [x0 + wk + o.d * DV[0], y + o.d * DV[1]], [x0 + wk + o.d * DV[0], y - sh + o.d * DV[1]], [x0 + wk, y - sh]], W, true);
      face(p, [[x0, y], [x0 + wk, y], [x0 + wk, y - sh], [x0, y - sh]], W, false, { x0, x1: x0 + wk, top: y - sh, gy: y, rows: 1, quoin: false });
      if (o.storey) o.storey(p, x0, x0 + wk, y - sh, y, k, W);
      else windows(p, x0, x0 + wk, y - sh, y, 1, o.win || 'sq', o.wc, { n: Math.max(1, Math.round(wk / 2.6)), s: 0.8 });
      if (o.skirt) { const R = RF[o.skirt], ew = wk + 5.2; slope(p, eaveLine([cx - ew / 2, y - sh + 0.9], [cx + ew / 2, y - sh + 0.9], o.lift || 0), [cx + wk * 0.42, y - sh - 1.6], [cx - wk * 0.42, y - sh - 1.6], R, false); }
      else if (o.jet) p.col(BEAM).line([[x0 - 0.5, y - sh], [x0 + wk + 0.5, y - sh]], 0.8).col(INK);
      y -= sh + (o.skirt ? 0.6 : 0);
      if (o.jet) w += 0.35;
    }
    return { y, w };
  }
  const TW = {
    // Britain, Ireland, France, the Low Countries: stone and timber tower houses under slate spires
    wt: (p, b, gy, cx) => { const [W, Hh, n] = TWB[b - 1], sh = (Hh - 14) / n; const r = stack(p, { cx, gy, n, sh, w: 9, d: 5, wall: k => k < 2 ? 'stone' : k % 2 ? 'fach' : 'stone', win: 'sq' }); p.poly([[cx - r.w / 2 - 0.6, r.y], [cx + 0.6, r.y - 10], [cx + r.w / 2 + 0.6, r.y]], SNOWY ? SNOW : RF.slate[0], 0.7); p.poly([[cx + r.w / 2 + 0.6, r.y], [cx + 2.3, r.y - 1.5], [cx + 0.6, r.y - 10]], RF.slate[1], 0.6); p.line([[cx + 0.6, r.y - 10], [cx + 0.6, r.y - 12]], 0.5); },
    // USA, Canada, Australia, New Zealand: brownstone below, timber above, a water tower or a cornice on top
    us: (p, b, gy, cx) => { const [W, Hh, n] = TWB[b - 1], sh = (Hh - 10) / n; const r = stack(p, { cx, gy, n, sh, w: 10, d: 6, wall: k => k < Math.ceil(n * 0.5) ? 'brickD' : 'wood', win: 'frame', wc: '#E8E0CC' }); p.rect(cx - r.w / 2 - 0.8, r.y - 1, r.w + 1.6, 1, '#6A4A3A', 0.5); const q = [cx + 2, r.y - 1]; p.col(BEAM).line([q, [q[0], q[1] - 3]], 0.5).line([[q[0] + 2.2, q[1]], [q[0] + 2.2, q[1] - 3]], 0.5).col(INK); p.rect(q[0] - 0.3, q[1] - 6.4, 2.8, 3.4, '#8A6440', 0.5); p.poly([[q[0] - 0.5, q[1] - 6.4], [q[0] + 1.1, q[1] - 8], [q[0] + 2.7, q[1] - 6.4]], SNOWY ? SNOW : '#5A4A3A', 0.4); },
    // Germany and Central Europe: stacked jettied Fachwerk under a steep red roof
    de: (p, b, gy, cx) => { const [W, Hh, n] = TWB[b - 1], sh = (Hh - 14) / n; const r = stack(p, { cx, gy, n, sh, w: 8, d: 6, jet: true, wall: k => k === 0 ? 'stone' : ['fach', 'fachO', 'fachW'][k % 3], win: 'sq' }); const w = r.w; p.poly([[cx - w / 2 - 0.6, r.y], [cx, r.y - 12], [cx + w / 2 + 0.6, r.y]], WL.fach[0], 0.7); face(p, [[cx - w / 2 - 0.6, r.y], [cx, r.y - 12], [cx + w / 2 + 0.6, r.y]], WL.fach, false, { x0: cx - w / 2, x1: cx + w / 2, top: r.y - 12, gy: r.y, rows: 2 }); slope(p, [[cx + w / 2 + 0.6, r.y], [cx + w / 2 + 2.9, r.y - 4.2]], [cx + 2.3, r.y - 16.2], [cx, r.y - 12], RF.tile, true); polyline(p, [[cx - w / 2 - 0.6, r.y], [cx, r.y - 12], [cx + w / 2 + 0.6, r.y]], 0.9, BEAM); },
    // Scandinavia: stacked painted wooden storeys with a steep spire
    sc: (p, b, gy, cx) => { const [W, Hh, n] = TWB[b - 1], sh = (Hh - 14) / n; const r = stack(p, { cx, gy, n, sh, w: 9, d: 5, wall: k => ['falu', 'ochreP', 'whiteP'][k % 3], win: 'frame' }); p.poly([[cx - r.w / 2 - 0.6, r.y], [cx, r.y - 13], [cx + r.w / 2 + 0.6, r.y]], SNOWY ? SNOW : RF.tileD[0], 0.7); p.line([[cx, r.y - 13], [cx, r.y - 15]], 0.5); },
    // Russia: stacked log storeys with carved frames, a tented roof and an onion dome
    ru: (p, b, gy, cx) => { const [W, Hh, n] = TWB[b - 1], sh = (Hh - 16) / n; const r = stack(p, { cx, gy, n, sh, w: 9, d: 5, wall: k => k % 2 ? 'logG' : 'log', win: 'nal', jet: true }); p.poly([[cx - r.w / 2 - 0.8, r.y], [cx, r.y - 10], [cx + r.w / 2 + 0.8, r.y]], SNOWY ? SNOW : RF.green[0], 0.7); dome(p, [cx, r.y - 9.6], 1.8, '#3F6FB0', { onion: true, fin: 'cross', stars: true }); },
    // southern Europe and the Balkans: San Gimignano: plain stone towers with tiny windows, a pair in the top bands
    med: (p, b, gy, cx) => { const [W, Hh, n] = TWB[b - 1], sh = (Hh - 9) / n; const one = (x, k) => { const r = stack(p, { cx: x, gy, n: k, sh, w: 6.5, d: 6, wall: 'stoneM', win: 'slit' }); p.rect(x - 3.6, r.y - 1, 7.2, 1, WL.stoneM[0], 0.5); for (let i = 0; i < 3; i++) p.rect(x - 3.3 + i * 2.6, r.y - 2.2, 1.4, 1.2, WL.stoneM[0], 0.4); }; if (b >= 3) one(cx - 4, n - 2); one(cx + (b >= 3 ? 3 : 0), n); },
    // the Middle East: Shibam: tall mud-brick tower houses, whitewashed at the top
    mn: (p, b, gy, cx) => { const [W, Hh, n] = TWB[b - 1], sh = (Hh - 4) / n; const r = stack(p, { cx, gy, n, sh, w: 10, d: 7, taper: 0.12, wall: k => k >= n - 2 ? 'mudW' : 'mudR', win: 'small' }); const w = r.w * 0.88; p.poly([[cx - w / 2, r.y], [cx + w / 2, r.y], [cx + w / 2 + 2.6, r.y - 4.6], [cx - w / 2 + 2.6, r.y - 4.6]], SNOWY ? SNOW : WL.mudW[0], 0.5); for (let i = 0; i <= 3; i++) { const x = cx - w / 2 + w * i / 3; p.poly([[x - 0.4, r.y], [x, r.y - 1.6], [x + 0.4, r.y]], WL.mudW[0], 0.35); } },
    // the Sahel: tapering mud towers with toron beams and pinnacles
    sh: (p, b, gy, cx) => { const [W, Hh, n] = TWB[b - 1], sh = (Hh - 6) / n; const r = stack(p, { cx, gy, n, sh, w: 11, d: 6, taper: 0.3, wall: 'mud', storey: (p, x0, x1, top, y) => { toron(p, x0, x1, top, y, 1); win(p, (x0 + x1) / 2, top + 1, 'small'); } }); const w = r.w * 0.7; for (let i = 0; i <= 3; i++) { const x = cx - w / 2 + w * i / 3; p.poly([[x - 0.6, r.y], [x, r.y - 3], [x + 0.6, r.y]], WL.mud[0], 0.4); p.ell(x, r.y - 3.3, 0.4, 0.5, '#F2EEE2', 0.25); } },
    // East and southern Africa: stacked whitewashed storeys with carved doors and verandahs, a thatched crown
    af: (p, b, gy, cx) => { const [W, Hh, n] = TWB[b - 1], sh = (Hh - 10) / n; const r = stack(p, { cx, gy, n, sh, w: 10, d: 6, wall: k => k % 2 ? 'coral' : 'mudW', storey: (p, x0, x1, top, y, k) => { windows(p, x0, x1, top, y, 1, 'shut', '#4E7A52', { n: 3, s: 0.8 }); balcony(p, x0, x1, y - 0.2, 'w', '#5E3A22'); } }); hut(p, { x: cx - r.w / 2 - 0.5, w: r.w + 1, gy: r.y + 1.5, hw: 1.5, rh: 7, wall: 'mudW', roof: 'thatch', door: 'none', fin: 'knob' }); },
    // South Asia: a tall haveli of stacked jharokhas, crowned with chhatris
    in: (p, b, gy, cx) => { const [W, Hh, n] = TWB[b - 1], sh = (Hh - 10) / n; const r = stack(p, { cx, gy, n, sh, w: 11, d: 6, wall: k => k % 2 ? 'sand' : 'pinkJ', storey: (p, x0, x1, top, y, k, Wc) => { const c = (x0 + x1) / 2; p.poly([[c - 2, y - 0.4], [c - 1.8, top + 0.6], [c + 1.8, top + 0.6], [c + 2, y - 0.4]], Wc[0], 0.4); win(p, c, top + 1.2, 'arch', null, 0.8); p.line([[c - 2, y - 0.4], [c, y + 0.4], [c + 2, y - 0.4]], 0.3); win(p, x0 + 1.4, top + 1.2, 'small'); win(p, x1 - 1.4, top + 1.2, 'small'); } }); for (const u of [-0.32, 0, 0.32]) { const x = cx + r.w * u; p.col(DK).line([[x - 0.8, r.y], [x - 0.8, r.y - 1.8]], 0.4).line([[x + 0.8, r.y], [x + 0.8, r.y - 1.8]], 0.4).col(INK); dome(p, [x, r.y - 1.8], u ? 1.2 : 1.6, WL.sand[0], { fin: 'dot' }); } },
    // China and Korea: a many-tiered pagoda tower with curved eaves and red posts
    ea: (p, b, gy, cx) => { const [W, Hh, n] = TWB[b - 1], sh = (Hh - 8) / n - 0.9; const r = stack(p, { cx, gy, n, sh, w: 9, d: 5, taper: 0.3, wall: k => k === 0 ? 'greyB' : 'plaster', skirt: 'ink', lift: 1.4, storey: (p, x0, x1, top, y) => { p.col('#A8281C').line([[x0 + 0.4, y], [x0 + 0.4, top]], 0.6).line([[x1 - 0.4, y], [x1 - 0.4, top]], 0.6).col(INK); win(p, (x0 + x1) / 2, top + 0.7, 'lat', '#A8281C', 0.8); } }); p.line([[cx, r.y], [cx, r.y - 6]], 0.7); for (let k = 0; k < 4; k++) p.ell(cx, r.y - 1 - k * 1.1, 0.8, 0.28, GOLD, 0.3); p.dot(cx, r.y - 6.3, 0.6, GOLD); },
    // Japan: a castle-keep tower of white plaster storeys under grey tiled skirts, with gables (chidori-hafu) and gold
    jp: (p, b, gy, cx) => { const [W, Hh, n] = TWB[b - 1], sh = (Hh - 6) / n - 0.9; const r = stack(p, { cx, gy, n, sh, w: 11, d: 6, taper: 0.35, wall: k => k === 0 ? 'stoneG' : 'plaster', skirt: 'ink', lift: 1, storey: (p, x0, x1, top, y, k) => { if (k) windows(p, x0, x1, top, y, 1, 'lat', '#2E2218', { n: 2, s: 0.8 }); } }); p.poly([[cx - 2.6, r.y], [cx, r.y - 3], [cx + 2.6, r.y]], SNOWY ? SNOW : RF.ink[0], 0.5); p.col(GOLD).line([[cx - 2.4, r.y - 0.6], [cx - 3, r.y - 1.8]], 0.5).line([[cx + 2.4, r.y - 0.6], [cx + 3, r.y - 1.8]], 0.5).col(INK); },
    // Southeast Asia: stacked teak storeys under steep tiered roofs with gold finials
    se: (p, b, gy, cx) => { const [W, Hh, n] = TWB[b - 1], sh = (Hh - 8) / n - 0.9; const r = stack(p, { cx, gy, n, sh, w: 9, d: 5, taper: 0.25, wall: k => k % 2 ? 'teak' : 'lime', skirt: 'orange', lift: 0.8 }); p.poly([[cx - 1.4, r.y], [cx, r.y - 6], [cx + 1.4, r.y]], GOLD, 0.5); },
    // Latin America: stacked colonial arcades, pastel and white, with a tiled cupola
    la: (p, b, gy, cx) => { const [W, Hh, n] = TWB[b - 1], sh = (Hh - 8) / n; const r = stack(p, { cx, gy, n, sh, w: 10, d: 6, wall: k => ['lime', 'pO', 'pB', 'pY'][k % 4], storey: (p, x0, x1, top, y) => arcade(p, x0, x1, y, 3, y - top) }); p.rect(cx - r.w / 2 - 0.6, r.y - 0.8, r.w + 1.2, 0.8, WL.lime[0], 0.4); dome(p, [cx, r.y - 0.8], 2.8, '#D86A3A', { fin: 'cross' }); },
  };
  const TWF = Object.keys(TW);

  // ---------------- registration
  const SNOWLESS = new Set(['sh', 'ha', 'wa', 'sw', 'et', 'eaf', 'za', 'zw', 'lk', 'se', 'cyc']);
  function register(add, Pen) {
    const snowy = f => p => { SNOWY = true; try { f(p); } finally { SNOWY = false; } };
    for (const set of Object.keys(S)) S[set].forEach((f, i) => {
      const id = 'r' + set + '-' + i, seed = 4000 + set.charCodeAt(0) * 31 + set.length * 7 + i;
      add(id, 34, 36, f, seed);
      if (!SNOWLESS.has(set)) add(id + '-s', 34, 36, snowy(f), seed);
    });
    for (const id of Object.keys(T)) { const seed = 5000 + id.length * 13 + id.charCodeAt(3); add(id, 30, 40, T[id], seed); add(id + '-s', 30, 40, snowy(T[id]), seed); }
    for (const fam of TWF) for (let b = 1; b <= 4; b++) {
      const [w, h] = TWB[b - 1], f = p => { WB = [1, 1.12, 1.25, 1.38][b - 1]; try { TW[fam](p, b, h - 2, w / 2 - 1.5); } finally { WB = 1; } }, id = 'tw-' + fam + '-' + b, seed = 6000 + b + fam.charCodeAt(0);
      add(id, w, h, f, seed);
      if (!['sh', 'af', 'in', 'se'].includes(fam)) add(id + '-s', w, h, snowy(f), seed);
    }
    // the same tall houses at the size of the heritage pictograms, for tall buildings from Wikidata
    for (const fam of TWF) add('h-tw-' + fam, 24, 50, p => { p.x.save(); p.x.scale(0.74, 0.74); WB = 1.25; try { TW[fam](p, 2, 64, 15); } finally { WB = 1; p.x.restore(); } }, 6100 + fam.charCodeAt(0));
    // a market square for the regions with no market cross: a well under a little roof, and a cobbled square
    add('market2', 30, 26, p => { p.poly([[3, 22], [27, 22], [24, 14], [6, 14]], 'rgba(243,229,191,0.97)', 1.2); for (let i = 0; i < 4; i++) p.dot(8 + i * 5, 19.5, 0.6); p.ell(15, 17.5, 3, 1.2, '#9DBBD6', 0.8); p.rect(12, 14, 6, 3.5, WL.stoneG[0], 0.8); p.line([[12.5, 14], [12.5, 8.5]], 0.8).line([[17.5, 14], [17.5, 8.5]], 0.8); p.poly([[11, 9], [15, 5.5], [19, 9]], RF.terra[0], 0.8); });
  }
  global.InkHouses = { register, sets: S, temples: Object.keys(T), towers: TWF, SNOWLESS };
})(window);
