/* Ink map worker: turns elevation and land cover into hand-drawn glyph positions.
 * For each requested tile (z, x, y) it returns a Mapbox Vector Tile with these point layers:
 *   relief  mountains and hills, placed on local high points of Terrarium elevation tiles
 *   trees   tree glyphs scattered inside OpenStreetMap woods and forests (OpenFreeMap landcover)
 *   tufts   marsh and moorland tufts inside wetland and heath
 *   biome   desert, grassland, rainforest, taiga, ice, marsh and tundra glyphs (RESOLVE Ecoregions 2017)
 *   heritage  castles, churches, stone circles and other sites (Wikidata, zoom 6 and closer)
 *   town    townhouses along real streets, market squares, churches and town walls (zoom 12 and closer)
 *   beasts  deer, boar, sheep, cattle, eagles, herons and fish in suitable country (zoom 6 to 14)
 * Every point carries the rank (r) at which it first appears, so the map can fade new glyphs in
 * smoothly as you zoom: the set at one zoom is always contained in the set at the next.
 * Dr Tristan Hotham, Independent researcher, 2026. MIT licence. */
'use strict';
let CFG = {
  dem: 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png', demMax: 15,
  ofm: null, ofmMax: 14,
  C: 14, RS: 99, RMAX: 12, HILL: 0.4, SAT_NB: 6, SAT_HI: 3, SAT_Q: 2.2, SNOWF: 700, HMAX: 650, TMAX: 1100, CHURCH_Z: 7.5, CAP_M: 0.75, CAP_T: 1.05, CAP_SAT: 0.45, SAT_INK: 1.6, PLAT: 2.5, G0: 1, GT: [4, 4.5, 5.5, 7.5, 10, 12, 13, 22, 30, 38, 48, 60, 70], GH: 0.45, MONT: 0.3, OPEN: 1.5, CB: 20, biomes: null, demScale: 1, // no new peaks beyond rank RMAX: close in, cells would measure slopes, not summits
  // (RS: optional rank from which a rank reuses the previous rank's cells, to thin close-up glyphs)
      // mountain cell size in screen px at the rank's home zoom (512 px tiles)
  CT: 10,     // tree cell size
  CU: 20,     // tuft cell size
  A: 185,     // mountain relief threshold, metres, scaled by (cell ground size in km)^0.3
};

// ---------------- small utilities ----------------
function hash3(a, b, c) {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(c | 0, 0x9e3779b1);
  h ^= h >>> 15; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const DEG = Math.PI / 180;
function latOfY(ny) { return Math.atan(Math.sinh(Math.PI * (1 - 2 * ny))) / DEG; }

// ---------------- elevation tiles ----------------
const demCache = new Map();
function demUrl(z, x, y) { return CFG.dem.replace('{z}', z).replace('{x}', x).replace('{y}', y); }
async function decodePng(blob) {
  const bmp = await createImageBitmap(blob);
  const c = new OffscreenCanvas(bmp.width, bmp.height);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0);
  const d = ctx.getImageData(0, 0, bmp.width, bmp.height).data;
  const n = bmp.width * bmp.height, e = new Float32Array(n);
  for (let i = 0, j = 0; i < n; i++, j += 4) e[i] = d[j] * 256 + d[j + 1] + d[j + 2] / 256 - 32768;
  return e;
}
function getDemRaw(z, x, y) {
  const k = z + '/' + x + '/' + y;
  let p = demCache.get(k);
  if (!p) {
    p = fetch(demUrl(z, x, y)).then(r => r.ok ? r.blob() : null).then(b => b ? decodePng(b) : null).catch(() => null);
    demCache.set(k, p);
    if (demCache.size > 600) demCache.delete(demCache.keys().next().value);
  } else { demCache.delete(k); demCache.set(k, p); }
  return p;
}
// A sampler over one tile at zoom z, falling back to a parent tile (upsampled) when the tile is missing.
async function demSampler(z, x, y) {
  for (let k = 0; k <= Math.min(z, 6); k++) {
    const pz = z - k, px = x >> k, py = y >> k;
    const arr = await getDemRaw(pz, px, py);
    if (!arr) continue;
    if (k === 0) return (i, j) => arr[j * 256 + i];
    const s = 1 << k, ox = (x - (px << k)) * 256, oy = (y - (py << k)) * 256;
    return (i, j) => {
      const fx = (ox + i + 0.5) / s - 0.5, fy = (oy + j + 0.5) / s - 0.5;
      const x0 = Math.max(0, Math.min(255, Math.floor(fx))), y0 = Math.max(0, Math.min(255, Math.floor(fy)));
      const x1 = Math.min(255, x0 + 1), y1 = Math.min(255, y0 + 1), tx = Math.max(0, Math.min(1, fx - x0)), ty = Math.max(0, Math.min(1, fy - y0));
      const a = arr[y0 * 256 + x0], b = arr[y0 * 256 + x1], c = arr[y1 * 256 + x0], d = arr[y1 * 256 + x1];
      return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
    };
  }
  return null;
}
// Mosaic of elevations (metres) at zoom d over normalised bounds.
async function mosaic(d, nx0, ny0, nx1, ny1) {
  const S = 256 * Math.pow(2, d), n = 1 << d;
  const px0 = Math.floor(nx0 * S), py0 = Math.floor(ny0 * S), px1 = Math.ceil(nx1 * S), py1 = Math.ceil(ny1 * S);
  const W = px1 - px0, H = py1 - py0, E = new Float32Array(W * H).fill(-500);
  const tx0 = Math.floor(px0 / 256), tx1 = Math.floor((px1 - 1) / 256), ty0 = Math.floor(py0 / 256), ty1 = Math.floor((py1 - 1) / 256);
  const jobs = [];
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
    if (ty < 0 || ty >= n) continue;
    const wx = ((tx % n) + n) % n;
    jobs.push(demSampler(d, wx, ty).then(sm => {
      if (!sm) return;
      const ix0 = Math.max(px0, tx * 256), ix1 = Math.min(px1, tx * 256 + 256), iy0 = Math.max(py0, ty * 256), iy1 = Math.min(py1, ty * 256 + 256);
      for (let py = iy0; py < iy1; py++) {
        const row = (py - py0) * W, j = py - ty * 256;
        for (let px = ix0; px < ix1; px++) E[row + px - px0] = sm(px - tx * 256, j);
      }
    }));
  }
  await Promise.all(jobs);
  return { E, W, H, px0, py0, S };
}

// ---------------- relief glyphs ----------------
// a simple snow line by latitude (metres): about 3,500 m in the tropics, 2,900 m at 45 degrees, 1,300 m at 60, 300 m at 75
function snowLine(lat) {
  const a = Math.abs(lat);
  return a <= 25 ? 3500 : a <= 45 ? 3500 - 30 * (a - 25) : a <= 60 ? 2900 - 106.7 * (a - 45) : a <= 75 ? 1300 - 66.7 * (a - 60) : 0;
}
const J0cell = (L, jj) => L.j0 + jj;
const biomeAt = (BR, nx, ny) => { if (!BR) return 0; const i = Math.min(BR.n - 1, Math.floor(nx * BR.n)), j = Math.min(BR.n - 1, Math.max(0, Math.floor(ny * BR.n))); return BR.a[j * BR.n + i] >> 2; };
const montaneAt = (BR, nx, ny) => { if (!BR) return false; const i = Math.min(BR.n - 1, Math.floor(nx * BR.n)), j = Math.min(BR.n - 1, Math.max(0, Math.floor(ny * BR.n))); return (BR.a[j * BR.n + i] & 2) === 2; };
const plateauAt = (BR, nx, ny) => { if (!BR) return false; const i = Math.min(BR.n - 1, Math.floor(nx * BR.n)), j = Math.min(BR.n - 1, Math.max(0, Math.floor(ny * BR.n))); return (BR.a[j * BR.n + i] & 1) === 1; };
async function reliefPoints(z, x, y) {
  const BR = await biomeRaster();
  const n = Math.pow(2, z);
  const tnx0 = x / n, tny0 = y / n, tnx1 = (x + 1) / n, tny1 = (y + 1) / n;
  const rf = Math.min(z + 1, CFG.RMAX), rc = Math.max(0, Math.min(z - 1, rf - 2));
  const cw = r => CFG.C / (512 * Math.pow(2, r - (r >= CFG.RS ? 1 : 0)));
  const m = 2.6 * cw(rc);
  const d = Math.max(0, Math.min(CFG.demMax, z <= 9 ? z + 1 : z));
  const M = await mosaic(d, tnx0 - m, Math.max(0, tny0 - m), tnx1 + m, Math.min(1, tny1 + m));
  // coarse elevation tiles smooth the summits away, so relief is measured low far out: lower the bar to match
  const demFactor = d <= 4 ? 0.5 : d <= 6 ? 0.68 : d <= 8 ? 0.85 : 1;
  const { E, W, H, px0, py0, S } = M;
  const cwf = cw(rf);
  const I0 = Math.floor((px0 + 0.5) / S / cwf), J0 = Math.floor((py0 + 0.5) / S / cwf);
  const I1 = Math.floor((px0 + W - 0.5) / S / cwf), J1 = Math.floor((py0 + H - 0.5) / S / cwf);
  // per-rank arrays
  const R = [];
  for (let r = rc; r <= rf; r++) {
    const k = Math.round(Math.log2(cw(r) / cwf));
    const i0 = I0 >> k, j0 = J0 >> k, i1 = I1 >> k, j1 = J1 >> k;
    const nI = i1 - i0 + 1, nJ = j1 - j0 + 1;
    R.push({ r, k, i0, j0, nI, nJ, mx: new Float32Array(nI * nJ).fill(-1e9), mn: new Float32Array(nI * nJ).fill(1e9), am: new Int32Array(nI * nJ).fill(-1), gs: new Float32Array(nI * nJ), gn: new Uint32Array(nI * nJ) });
  }
  // single pass over pixels
  const inv = 1 / (S * cwf);
  const colI = new Int32Array(W);
  for (let i = 0; i < W; i++) colI[i] = Math.floor((px0 + i + 0.5) * inv);
  for (let j = 0; j < H; j++) {
    const J = Math.floor((py0 + j + 0.5) * inv);
    for (const L of R) {
      const jj = (J >> L.k) - L.j0; L._row = jj * L.nI;
    }
    const row = j * W;
    for (let i = 0; i < W; i++) {
      const e = E[row + i], I = colI[i];
      // ruggedness: absolute elevation change to the next pixel across and down (skipped where there is no data)
      let g = -1;
      if (i < W - 1 && j < H - 1 && e > -400) {
        const ex = E[row + i + 1], ey = E[row + W + i];
        if (ex > -400 && ey > -400) g = Math.abs(ex - e) + Math.abs(ey - e);
      }
      for (let q = 0; q < R.length; q++) {
        const L = R[q], c = L._row + (I >> L.k) - L.i0;
        if (e > L.mx[c]) { L.mx[c] = e; L.am[c] = row + i; }
        if (e < L.mn[c]) L.mn[c] = e;
        if (g >= 0) { L.gs[c] += g; L.gn[c]++; }
      }
    }
  }
  const out = [], seen = new Set();
  for (const L of R) {
    const { nI, nJ, mx, mn, am, r } = L;
    const cell = cw(r), cellPx = cell * S;
    const kmBase = cell * 40075;
    // close in, a cell's highest point on a plain slope sits on its uphill edge, next to a higher neighbour;
    // spacing points further apart there keeps peaks on summits and ridges instead of rows down a hillside
    const kmMid = kmBase * Math.cos(latOfY((py0 + H / 2) / S) * DEG);
    const sep = kmMid >= 1 ? 0.55 : kmMid <= 0.1 ? 1.0 : 0.55 + 0.45 * (1 - (Math.log10(kmMid) + 1));
    const dmin2 = Math.pow(sep * cellPx, 2);
    // pass 1: relative relief and kind of every cell (0 mountain, 1 hill, -1 nothing)
    const N = nI * nJ, kind = new Int8Array(N).fill(-1), rel = new Float32Array(N), qq = new Float32Array(N), rug = new Float32Array(N);
    // ruggedness bars (mean slope, metres per km, measured on the elevation tiles at zoom d): a range must be rugged, not
    // just high, so high flat plateaus, deserts and plains get no peaks however far they rise above a distant lowland
    const Gm = CFG.G0 * CFG.GT[Math.max(0, Math.min(CFG.GT.length - 1, d))], Gh = CFG.GH * Gm;
    for (let jj = 1; jj < nJ - 1; jj++) {
      const latRow = latOfY((J0cell(L, jj) + 0.5) * cell);
      const km = Math.max(0.05, kmBase * Math.cos(latRow * DEG));
      const pxKm = 40075 * Math.cos(latRow * DEG) / S;
      const T = CFG.A * Math.pow(km, 0.3) * demFactor;
      for (let ii = 1; ii < nI - 1; ii++) {
        const c = jj * nI + ii;
        if (am[c] < 0 || mx[c] * CFG.demScale < 3) continue;   // never on ground at or below sea level
        let lo = 1e9;
        for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const v2 = mn[c + dj * nI + di]; if (v2 < lo) lo = v2; }
        const relief = (mx[c] - Math.max(lo, 0)) * CFG.demScale;
        // ruggedness is measured close round the cell's highest point (the finest cells, 3 x 3, about 40 screen
        // pixels), so a small rugged massif counts in full and a plateau is judged on its own floor
        const a0 = am[c], axp = a0 % W, ayp = (a0 - axp) / W, F = R[R.length - 1];
        const fi = colI[axp] - F.i0, fj = Math.floor((py0 + ayp + 0.5) * inv) - F.j0;
        let gsum = 0, gcnt = 0;
        for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
          const ii2 = fi + di, jj2 = fj + dj; if (ii2 < 0 || jj2 < 0 || ii2 >= F.nI || jj2 >= F.nJ) continue;
          const cc = jj2 * F.nI + ii2; gsum += F.gs[cc]; gcnt += F.gn[cc];
        }
        const rg = gcnt ? gsum / gcnt / 2 / pxKm * CFG.demScale : 0;
        rel[c] = relief; qq[c] = relief / T; rug[c] = rg;
        // in ecoregions named for mountains (RESOLVE), a narrow range smoothed by coarse elevation tiles still counts
        // and in the great open biomes (desert, steppe, rainforest, taiga, tundra) that are not named for mountains,
        // a dissected plateau has to be a good deal more rugged before it is drawn as a range
        const bAt = biomeAt(BR, (px0 + axp + 0.5) / S, (py0 + ayp + 0.5) / S);
        // the montane relief applies on coarse tiles (elevation zoom 5 or less) and fades out by zoom 8, where real
        // slopes show; on the high plateaus the bar is doubled so that only their ranges are peaked
        const nxp = (px0 + axp + 0.5) / S, nyp = (py0 + ayp + 0.5) / S;
        const montF = d <= 5 ? CFG.MONT : d >= 8 ? 1 : CFG.MONT + (1 - CFG.MONT) * (d - 5) / 3;
        const mf = plateauAt(BR, nxp, nyp) ? CFG.PLAT : montaneAt(BR, nxp, nyp) ? montF : (bAt >= 1 && bAt <= 4) || bAt === 7 ? CFG.OPEN : 1;
        kind[c] = relief >= T && rg >= Gm * mf ? 0 : relief >= CFG.HILL * T && rg >= Gh * Math.sqrt(mf) ? 1 : -1;
        if (kind[c] === 1 && bAt === 5) kind[c] = -1;   // the edge of an ice sheet is not a hill
      }
    }
    // pass 2: place, thinning saturated ground so a great range reads as ridges and summits, not a solid mass
    for (let jj = 1; jj < nJ - 1; jj++) for (let ii = 1; ii < nI - 1; ii++) {
      const c = jj * nI + ii, a = am[c];
      if (kind[c] < 0) continue;
      const v = mx[c];
      const ax = a % W, ay = (a - ax) / W;
      const nx = (px0 + ax + 0.5) / S, ny = (py0 + ay + 0.5) / S;
      if (nx < tnx0 || nx >= tnx1 || ny < tny0 || ny >= tny1) continue;
      if (seen.has(a)) continue;
      let drop = false, mtnNb = 0, higherMtn = 0, qSum = 0;
      for (let dj = -1; dj <= 1 && !drop; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const cc = c + dj * nI + di;
        qSum += qq[cc];
        if (kind[cc] === 0) { mtnNb++; if (mx[cc] > v || (mx[cc] === v && cc < c)) higherMtn++; }
        if (am[cc] >= 0) {
          const bx = am[cc] % W, by = (am[cc] - bx) / W;
          const dd = (bx - ax) * (bx - ax) + (by - ay) * (by - ay);
          if (dd < dmin2 && (mx[cc] > v || (mx[cc] === v && cc < c))) { drop = true; break; }
        }
      }
      if (drop) continue;
      // only where the ground is saturated with strong relief (a great range at this scale): there, a mountain
      // with several higher mountains around it is a flank, and leaving it out lets the ridges and summits read
      // far out a cell is tens of kilometres across and each one is its own mountain mass, so this only applies
      // once cells are under about 30 km, and more firmly under 10 km
      const satHi = kmMid < 10 ? CFG.SAT_HI : kmMid < 30 ? CFG.SAT_HI + 1 : 99;
      if (kind[c] === 0 && mtnNb >= CFG.SAT_NB && higherMtn >= satHi && (qSum + qq[c]) / 9 >= CFG.SAT_Q) continue;
      const k = kind[c], q = qq[c];
      const s = k === 0 ? Math.min(1.3, 0.8 + 0.22 * (q - 1)) : Math.min(1.0, 0.72 + 0.45 * (q - 0.42));
      seen.add(a);
      const I = L.i0 + ii, J = L.j0 + jj;
      const eM = v * CFG.demScale, sl = snowLine(latOfY(ny)) + (plateauAt(BR, nx, ny) ? 1500 : 0);
      out.push({ id: I + ':' + J + ':' + r, nx, ny, r: Math.max(r, 0), k, s: Math.round(s * 100) / 100, v: Math.floor(hash3(I, J, r + 99) * 8), e: Math.round(eM), rl: Math.round(rel[c]), rg: Math.round(rug[c] * 10) / 10,
                 sn: k === 0 && eM >= sl ? 1 : 0 });
    }
    // snowfields and glaciers: pale blue hatching on high, rugged ground well above the snow line (finest cells only)
    if (L === R[R.length - 1]) for (let jj = 1; jj < nJ - 1; jj++) for (let ii = 1; ii < nI - 1; ii++) {
      const c = jj * nI + ii, a = am[c];
      if (a < 0 || kind[c] < 0 || seen.has(a)) continue;
      const ax = a % W, ay = (a - ax) / W, ny = (py0 + ay + 0.5) / S, nx = (px0 + ax + 0.5) / S;
      if (nx < tnx0 || nx >= tnx1 || ny < tny0 || ny >= tny1) continue;
      if (mn[c] * CFG.demScale < snowLine(latOfY(ny)) + CFG.SNOWF + (plateauAt(BR, nx, ny) ? 1500 : 0)) continue;
      const I = L.i0 + ii, J = L.j0 + jj;
      out.push({ nx: nx + (hash3(I, J, 5) - 0.5) * cell * 0.5, ny: ny + cell * 0.3, r: Math.max(r, 0), k: 2, s: 1, v: Math.floor(hash3(I, J, 6) * 3), e: Math.round(mn[c] * CFG.demScale), rl: 0, rg: 0, sn: 1 });
    }
  }
  return out;
}

// ---------------- vector tile decoding (OpenFreeMap landcover) ----------------
function Reader(buf) { this.b = buf; this.p = 0; }
Reader.prototype.varint = function () {
  let r = 0, s = 0, b;
  do { b = this.b[this.p++]; if (s < 28) r |= (b & 0x7f) << s; else r += (b & 0x7f) * Math.pow(2, s); s += 7; } while (b >= 0x80);
  return r >>> 0 === r ? r : r;
};
Reader.prototype.skip = function (w) {
  if (w === 0) this.varint(); else if (w === 1) this.p += 8; else if (w === 2) { const l = this.varint(); this.p += l; } else if (w === 5) this.p += 4;
};
const td = new TextDecoder();
function decodeLayers(buf, wanted) {
  const R = new Reader(buf), layers = {};
  while (R.p < buf.length) {
    const t = R.varint(), f = t >> 3, w = t & 7;
    if (f === 3 && w === 2) {
      const len = R.varint(), end = R.p + len;
      const L = { name: '', keys: [], values: [], feats: [], extent: 4096 };
      while (R.p < end) {
        const t2 = R.varint(), f2 = t2 >> 3, w2 = t2 & 7;
        if (f2 === 1) { const l = R.varint(); L.name = td.decode(buf.subarray(R.p, R.p + l)); R.p += l; if (!wanted.has(L.name)) { R.p = end; break; } }
        else if (f2 === 2) { const l = R.varint(); L.feats.push([R.p, R.p + l]); R.p += l; }
        else if (f2 === 3) { const l = R.varint(); L.keys.push(td.decode(buf.subarray(R.p, R.p + l))); R.p += l; }
        else if (f2 === 4) {
          const l = R.varint(), e2 = R.p + l; let val = null;
          while (R.p < e2) {
            const t3 = R.varint(), f3 = t3 >> 3;
            if (f3 === 1) { const l3 = R.varint(); val = td.decode(buf.subarray(R.p, R.p + l3)); R.p += l3; }
            else if (f3 === 2) { val = new DataView(buf.buffer, buf.byteOffset + R.p, 4).getFloat32(0, true); R.p += 4; }
            else if (f3 === 3) { val = new DataView(buf.buffer, buf.byteOffset + R.p, 8).getFloat64(0, true); R.p += 8; }
            else { val = R.varint(); }
          }
          L.values.push(val);
        }
        else if (f2 === 5) L.extent = R.varint();
        else R.skip(w2);
      }
      if (L.name && wanted.has(L.name)) layers[L.name] = L;
      R.p = end;
    } else R.skip(w);
  }
  return layers;
}
function featureOf(buf, L, span) {
  const R = new Reader(buf); R.p = span[0];
  const props = {}; let type = 0, geom = null;
  while (R.p < span[1]) {
    const t = R.varint(), f = t >> 3, w = t & 7;
    if (f === 2) { const l = R.varint(), e = R.p + l; while (R.p < e) { const k = R.varint(), v = R.varint(); props[L.keys[k]] = L.values[v]; } }
    else if (f === 3) type = R.varint();
    else if (f === 4) { const l = R.varint(); geom = [R.p, R.p + l]; R.p += l; }
    else R.skip(w);
  }
  return { props, type, geom };
}
function tracePolygon(buf, g, ctx, sc) {
  const R = new Reader(buf); R.p = g[0];
  let x = 0, y = 0;
  while (R.p < g[1]) {
    const ci = R.varint(), cmd = ci & 7, cnt = ci >> 3;
    if (cmd === 7) { ctx.closePath(); continue; }
    for (let i = 0; i < cnt; i++) {
      const dx = R.varint(), dy = R.varint();
      x += (dx >>> 1) ^ -(dx & 1); y += (dy >>> 1) ^ -(dy & 1);
      if (cmd === 1) ctx.moveTo(x * sc, y * sc); else ctx.lineTo(x * sc, y * sc);
    }
  }
}
// each OpenFreeMap tile is read by several passes (water, land cover, towns, life): keep the last few decoded buffers
const ofmCache = new Map();
function fetchOfm(z, x, y) {
  if (!CFG.ofm) return Promise.resolve(null);
  const k = z + '/' + x + '/' + y;
  let p = ofmCache.get(k);
  if (p) { ofmCache.delete(k); ofmCache.set(k, p); return p; }
  p = (async () => {
    try {
      const r = await fetch(CFG.ofm.replace('{z}', z).replace('{x}', x).replace('{y}', y));
      if (!r.ok) return null;
      let b = new Uint8Array(await r.arrayBuffer());
      if (b[0] === 0x1f && b[1] === 0x8b) {
        const ds = new Response(new Blob([b]).stream().pipeThrough(new DecompressionStream('gzip')));
        b = new Uint8Array(await ds.arrayBuffer());
      }
      return b;
    } catch (e) { return null; }
  })();
  ofmCache.set(k, p); if (ofmCache.size > 48) ofmCache.delete(ofmCache.keys().next().value);
  return p;
}
const MS = 256;
// Rasterise one layer's polygons (all, or those passing `keep`) into a MS x MS 0/1 mask.
function polyMask(buf, L, keep) {
  const c = new OffscreenCanvas(MS, MS), ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff'; ctx.beginPath();
  let n = 0;
  for (const span of L.feats) {
    const F = featureOf(buf, L, span);
    if (F.type !== 3 || (keep && !keep(F.props))) continue;
    tracePolygon(buf, F.geom, ctx, MS / L.extent); n++;
  }
  if (!n) return null;
  ctx.fill('nonzero');
  const d = ctx.getImageData(0, 0, MS, MS).data, a = new Uint8Array(MS * MS);
  for (let i = 0; i < MS * MS; i++) a[i] = d[i * 4 + 3] > 127 ? 1 : 0;
  return a;
}
// Water mask from the OpenStreetMap water layer of the same tile: no glyph is drawn on sea, lake or river.
async function waterMask(z, x, y) {
  const buf = await fetchOfm(z, x, y);
  if (!buf) return null;
  const Ls = decodeLayers(buf, new Set(['water', 'landcover']));
  const out = Ls.water ? (polyMask(buf, Ls.water, null) || { none: true }) : { none: true };
  // glaciers and ice caps, and sand, from OpenStreetMap land cover: blended with the biome mask
  if (Ls.landcover) {
    out.ice = polyMask(buf, Ls.landcover, p => p.class === 'ice');
    out.sand = z >= 8 ? polyMask(buf, Ls.landcover, p => p.class === 'sand') : null;
  }
  return out;
}

// ---------------- ink cap ----------------
// Hand-drawn maps leave paper between the peaks. Glyphs are taken coarse ranks first and, within a rank, the most
// prominent first, at the size the style gives them in the middle of the tile's zoom; a mountain is kept only while
// the summed footprints of the mountains in its patch (a sixth of the tile each way) stay under CAP_M of the patch, and
// a hill while all glyphs stay under CAP_T. In a great range the lesser peaks are dropped so the ridgelines show; in
// hill country such as the Lake District the cap trims fewer than one peak in ten.
function glyphScale(zv, k, s, r) {
  const f = zv < 3 ? 0.8 : zv < 5 ? 0.9 : zv <= 7 ? 1 : zv <= 11 ? 1 + (zv - 7) * 0.075 : Math.min(1.6, 1.3 + (zv - 11) * 0.1);
  const cap = zv <= 11 ? 1.45 : Math.min(1.75, 1.45 + (zv - 11) * 0.1);
  return (k === 0 ? 0.54 : 0.52) * s * f * Math.min(cap, Math.pow(2, 0.42 * (zv - r)));
}
// a stable id for a relief point: the same point has the same id in a tile and in its parent
const pid = p => p.id || (Math.round(p.nx * 1e7) + ':' + Math.round(p.ny * 1e7) + ':' + p.r);   // the grid cell and rank
// parentKept: ids the parent tile drew. Points the parent tile also had (rank <= z) are kept exactly as the parent kept them, so
// zooming in never drops a mountain that was on screen a moment ago or brings back one it left out; the cap then only
// decides among the new, finer points.
function inkCap(pts, z, x, y, parentKept) {
  // ink density per patch: the summed footprints of the glyphs (overlaps counted, as the pen would draw them)
  const zv = z + 0.5, n = Math.pow(2, z), T = 512 * Math.pow(2, 0.5), NP = 6, P = T / NP;
  const inkM = new Float32Array(NP * NP), inkT = new Float32Array(NP * NP);
  const order = pts.map((p, i) => i).sort((a, b) => (pts[a].r - pts[b].r) || (pts[a].k - pts[b].k) || (pts[b].rl - pts[a].rl));   // coarse ranks (the parent's) come first
  // where a patch is saturated (candidate mountains would ink it more than SAT_INK times over, as in the Himalaya or
  // on a high plateau), the cap is cut to CAP_SAT, so the great ranges come out as ridges with paper between
  const cand = new Float32Array(NP * NP);
  const foot = p => { const sc = glyphScale(zv, p.k, p.s, p.r); return p.k === 0 ? 0.5 * 36 * 31 * sc * sc : 0.7 * 27 * 13 * sc * sc; };
  const cellOf = p => Math.max(0, Math.min(NP - 1, Math.floor((p.ny * n - y) * T / P))) * NP + Math.max(0, Math.min(NP - 1, Math.floor((p.nx * n - x) * T / P)));
  for (const p of pts) if (p.k === 0) cand[cellOf(p)] += foot(p) / (P * P);
  const keep = [];
  for (const i of order) {
    const p = pts[i], sc = glyphScale(zv, p.k, p.s, p.r);
    const a = p.k === 0 ? 0.5 * 36 * 31 * sc * sc : 0.7 * 27 * 13 * sc * sc;
    const cx = (p.nx * n - x) * T, by = (p.ny * n - y) * T;
    const c = Math.max(0, Math.min(NP - 1, Math.floor(by / P))) * NP + Math.max(0, Math.min(NP - 1, Math.floor(cx / P)));
    if (parentKept && p.r <= z) {
      if (!parentKept.has(pid(p))) continue;
      if (p.k === 0) inkM[c] += a / (P * P); else inkT[c] += a / (P * P);
      keep.push(p); continue;
    }
    const capM = cand[c] > CFG.SAT_INK ? CFG.CAP_SAT : CFG.CAP_M;
    if (p.k === 0) { if (inkM[c] + a / (P * P) > capM) continue; inkM[c] += a / (P * P); }
    else { if (inkM[c] + inkT[c] + a / (P * P) > CFG.CAP_T) continue; inkT[c] += a / (P * P); }
    keep.push(p);
  }
  return keep;
}

// ---------------- biome mask (RESOLVE Ecoregions 2017, data/biomes.png, 32 x class) ----------------
let biomeP = null;
function biomeRaster() {
  if (!biomeP) biomeP = (async () => {
    if (!CFG.biomes) return null;
    try {
      const r = await fetch(CFG.biomes); if (!r.ok) return null;
      const bmp = await createImageBitmap(await r.blob(), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
      const c = new OffscreenCanvas(bmp.width, bmp.height), ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(bmp, 0, 0);
      const d = ctx.getImageData(0, 0, bmp.width, bmp.height).data, n = bmp.width, a = new Uint8Array(n * n);
      for (let i = 0; i < n * n; i++) a[i] = Math.round(d[i * 4] / 8);   // 4 x class + 2 x montane + plateau
      return { n, a };
    } catch (e) { return null; }
  })();
  return biomeP;
}
// biome glyph per class: desert dunes, grassland tufts, rainforest crowns, taiga conifers, ice hatching, marsh, tundra tufts;
// keep = share of nested points that carry a glyph
const BIOME = { 1: { keep: 0.55 }, 2: { keep: 0.3 }, 3: { keep: 0.97 }, 4: { keep: 0.72 }, 5: { keep: 0.6 }, 6: { keep: 0.5 }, 7: { keep: 0.16 } };
async function coverMask(z, x, y) {
  const buf = await fetchOfm(z, x, y);
  if (!buf) return null;
  const layers = decodeLayers(buf, new Set(['landcover']));
  const L = layers.landcover;
  if (!L) return null;
  const c = new OffscreenCanvas(MS, MS), ctx = c.getContext('2d', { willReadFrequently: true });
  const sc = MS / L.extent;
  const groups = { forest: [], wood: [], wet: [], heath: [], farm: [], meadow: [] };
  for (const span of L.feats) {
    const F = featureOf(buf, L, span);
    if (F.type !== 3) continue;
    const cl = F.props.class, sub = F.props.subclass;
    if (cl === 'wood') (sub === 'forest' ? groups.forest : groups.wood).push(F.geom);
    else if (cl === 'wetland') groups.wet.push(F.geom);
    else if (cl === 'grass' && (sub === 'heath' || sub === 'moor' || sub === 'fell')) groups.heath.push(F.geom);
    else if (cl === 'farmland') groups.farm.push(F.geom);
    else if (cl === 'grass' && (sub === 'meadow' || sub === 'grassland' || sub === 'park')) groups.meadow.push(F.geom);
  }
  if (!Object.values(groups).some(g => g.length)) return null;
  // channels: R forest, G wood, B wetland, A heath (drawn as separate passes into separate arrays)
  const out = {};
  for (const k of ['forest', 'wood', 'wet', 'heath', 'farm', 'meadow']) {
    if (!groups[k].length) { out[k] = null; continue; }
    ctx.clearRect(0, 0, MS, MS); ctx.fillStyle = '#fff'; ctx.beginPath();
    for (const g of groups[k]) tracePolygon(buf, g, ctx, sc);
    ctx.fill('nonzero');
    const d = ctx.getImageData(0, 0, MS, MS).data, a = new Uint8Array(MS * MS);
    for (let i = 0; i < MS * MS; i++) a[i] = d[i * 4 + 3] > 127 ? 1 : 0;
    out[k] = a;
  }
  return out;
}
// Nested jittered points: the point of a cell at rank r is inherited by whichever child cell contains it.
function nestedPoints(z, x, y, CS, rBase, rTop, salt) {
  const n = Math.pow(2, z), tnx0 = x / n, tny0 = y / n, tnx1 = (x + 1) / n, tny1 = (y + 1) / n;
  let prev = null;
  for (let r = rBase; r <= rTop; r++) {
    const cw = CS / (512 * Math.pow(2, r));
    const i0 = Math.floor(tnx0 / cw), i1 = Math.floor((tnx1 - 1e-12) / cw), j0 = Math.floor(tny0 / cw), j1 = Math.floor((tny1 - 1e-12) / cw);
    const cur = new Map();
    for (let J = j0; J <= j1; J++) for (let I = i0; I <= i1; I++) {
      let p = null;
      if (prev) {
        const pp = prev.get((I >> 1) + ',' + (J >> 1));
        if (pp && Math.floor(pp.nx / cw) === I && Math.floor(pp.ny / cw) === J) p = pp;
      }
      if (!p) {
        const hx = hash3(I, J, r * 7 + salt), hy = hash3(J, I, r * 13 + salt + 1);
        p = { nx: (I + 0.12 + 0.76 * hx) * cw, ny: (J + 0.12 + 0.76 * hy) * cw, r, h: hash3(I, J, salt + 777) };
      }
      cur.set(I + ',' + J, p);
    }
    prev = cur;
  }
  const out = [];
  for (const p of prev.values()) if (p.nx >= tnx0 && p.nx < tnx1 && p.ny >= tny0 && p.ny < tny1) out.push(p);
  return out;
}

// ---------------- vector tile encoding ----------------
function Writer() { this.a = []; }
Writer.prototype.varint = function (v) { v = Math.floor(v); while (v > 127) { this.a.push((v & 127) | 128); v = Math.floor(v / 128); } this.a.push(v); };
Writer.prototype.tag = function (f, w) { this.varint((f << 3) | w); };
Writer.prototype.bytes = function (f, arr) { this.tag(f, 2); this.varint(arr.length); for (const b of arr) this.a.push(b); };
Writer.prototype.str = function (f, s) { this.bytes(f, new TextEncoder().encode(s)); };
Writer.prototype.double = function (f, v) { this.tag(f, 1); const b = new Uint8Array(8); new DataView(b.buffer).setFloat64(0, v, true); for (const x of b) this.a.push(x); };
function zz(v) { return (v << 1) ^ (v >> 31); }
function encodeLayer(name, pts, keys, z, x, y) {
  const n = Math.pow(2, z), ext = 4096;
  const L = new Writer();
  L.varint((15 << 3) | 0); L.varint(2);
  L.str(1, name);
  const vals = [], vmap = new Map();
  const vi = v => { let i = vmap.get(v); if (i === undefined) { i = vals.length; vals.push(v); vmap.set(v, i); } return i; };
  for (const p of pts) {
    const F = new Writer();
    const tags = [];
    keys.forEach((k, ki) => { tags.push(ki, vi(p[k])); });
    const T = new Writer(); for (const t of tags) T.varint(t);
    F.bytes(2, T.a);
    F.tag(3, 0); F.varint(1);
    const px = Math.max(0, Math.min(ext - 1, Math.round((p.nx * n - x) * ext))), py = Math.max(0, Math.min(ext - 1, Math.round((p.ny * n - y) * ext)));
    const G = new Writer(); G.varint(9); G.varint(zz(px)); G.varint(zz(py));
    F.bytes(4, G.a);
    L.bytes(2, F.a);
  }
  for (const k of keys) L.str(3, k);
  for (const v of vals) { const V = new Writer(); if (typeof v === 'string') V.str(1, v); else V.double(3, v); L.bytes(4, V.a); }
  L.tag(5, 0); L.varint(ext);
  return L.a;
}


// ---------------- heritage (Wikidata and the data studies, data/heritage/{x}_{y}.json on a zoom-6 grid) ----------------
let herIdx = null; const herTiles = new Map();
function heritageIndex() {
  if (!herIdx) herIdx = (async () => {
    if (!CFG.heritage) return null;
    try { const r = await fetch(CFG.heritage + 'index.json' + (CFG.dv || '')); if (!r.ok) return null; const j = await r.json(); j.set = new Set(j.tiles); return j; } catch (e) { return null; }
  })();
  return herIdx;
}
function heritageBin(bx, by) {
  const k = bx + '_' + by;
  if (!herTiles.has(k)) herTiles.set(k, (async () => {
    try { const r = await fetch(CFG.heritage + k + '.json' + (CFG.dv || '')); return r.ok ? await r.json() : []; } catch (e) { return []; }
  })());
  return herTiles.get(k);
}
const mercX = lon => (lon + 180) / 360;
const mercY = lat => { const s = Math.sin(Math.max(-85.05, Math.min(85.05, lat)) * DEG); return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI); };
async function heritagePoints(z, x, y) {
  if (z < 6) return [];
  const I = await heritageIndex(); if (!I) return [];
  const sh = z - 6, bx = x >> sh, by = y >> sh;
  if (!I.set.has(bx + '_' + by)) return [];
  const rows = await heritageBin(bx, by), n = Math.pow(2, z), out = [];
  for (const r of rows) {
    let mz = r[3] / 10;
    if (I.icons[r[2]] === 'lighthouse') mz = Math.min(mz, 8);   // every lighthouse on the coast from zoom 8, the famous ones earlier
    if (mz > z + 1) continue;
    const nx = mercX(r[0] / 1e5), ny = mercY(r[1] / 1e5);
    if (Math.floor(nx * n) !== x || Math.floor(ny * n) !== y) continue;
    out.push({ nx, ny, i: I.icons[r[2]], z: mz, n: r[4] || '', q: r[5] ? 'Q' + r[5] : '' });
  }
  out.sort((a, b) => a.z - b.z);
  const kept = out.slice(0, CFG.HMAX);
  // tall buildings are drawn as the region's own tall house (js/ink-houses.js), the famous ones keep their own drawings
  if (kept.some(p => p.i === 'skyscraper')) { const R = await houseRegions(); for (const p of kept) p.w = p.i === 'skyscraper' ? styleAt(R, p.nx, p.ny).tw : ''; }
  else for (const p of kept) p.w = '';
  // names: at most one per cell of about 140 x 90 screen pixels, the best known first (lowest first zoom = most Wikipedia
  // articles); ordinary churches and chapels (fewer than about ten articles) stay unnamed until zoom 15 (see the style)
  const used = new Set();
  for (const p of kept) {
    p.l = '';
    if (!p.n || p.z > z - 0.5) continue;
    if (p.i === 'church' && p.z > CFG.CHURCH_Z && z < 14) continue;
    const k = Math.floor((p.nx * n - x) * 512 / 140) + ',' + Math.floor((p.ny * n - y) * 512 / 90);
    if (used.has(k)) continue;
    used.add(k); p.l = p.n;
  }
  return kept;
}

// ---------------- named hills (Wikidata, data/hills/{x}_{y}.json), zoom 10 and closer, where OpenStreetMap has no peak ----------------
let hillIdx = null; const hillTiles = new Map();
async function hillPoints(z, x, y) {
  if (z < 10 || !CFG.hills) return [];
  if (!hillIdx) hillIdx = (async () => { try { const r = await fetch(CFG.hills + 'index.json'); if (!r.ok) return null; const j = await r.json(); j.set = new Set(j.tiles); return j; } catch (e) { return null; } })();
  const I = await hillIdx; if (!I) return [];
  const sh = z - 6, k = (x >> sh) + '_' + (y >> sh);
  if (!I.set.has(k)) return [];
  if (!hillTiles.has(k)) hillTiles.set(k, (async () => { try { const r = await fetch(CFG.hills + k + '.json'); return r.ok ? await r.json() : []; } catch (e) { return []; } })());
  const rows = await hillTiles.get(k), n = Math.pow(2, z), out = [];
  for (const r of rows) {
    if (r[3] / 10 > z + 1) continue;
    const nx = mercX(r[0] / 1e5), ny = mercY(r[1] / 1e5);
    if (Math.floor(nx * n) !== x || Math.floor(ny * n) !== y) continue;
    out.push({ nx, ny, z: r[3] / 10, e: r[2], n: r[4] });
  }
  if (!out.length) return out;
  // OpenStreetMap peaks in the same tile already carry a name: skip a hill with the same name nearby, or any peak right on it
  const buf = CFG.ofm && z <= CFG.ofmMax ? await fetchOfm(z, x, y) : null;
  const pk = [];
  if (buf) { const L = decodeLayers(buf, new Set(['mountain_peak'])).mountain_peak; if (L) for (const span of L.feats) { const F = featureOf(buf, L, span); if (F.type !== 1) continue; const [px, py] = pointOf(buf, F.geom); pk.push({ x: px / L.extent * 512, y: py / L.extent * 512, n: String(F.props.name || '').toLowerCase() }); } }
  const res = [];
  for (const h of out) {
    const hx = (h.nx * n - x) * 512, hy = (h.ny * n - y) * 512, nm = h.n.toLowerCase();
    let dup = false;
    for (const q of pk) { const d = Math.hypot(q.x - hx, q.y - hy); if (d < 6 || (d < 60 && q.n && (q.n === nm || q.n.startsWith(nm) || nm.startsWith(q.n)))) { dup = true; break; } }
    if (!dup) res.push(h);
  }
  return res.slice(0, 300);
}

// ---------------- villages and hamlets (Wikidata, data/places/{x}_{y}.json), Britain and Ireland, where OpenStreetMap's tiles leave a place out ----------------
let placeIdx = null; const placeTiles = new Map();
async function placePoints(z, x, y) {
  if (z < 10 || !CFG.places) return [];
  if (!placeIdx) placeIdx = (async () => { try { const r = await fetch(CFG.places + 'index.json'); if (!r.ok) return null; const j = await r.json(); j.set = new Set(j.tiles); return j; } catch (e) { return null; } })();
  const I = await placeIdx; if (!I) return [];
  const sh = z - 6, k = (x >> sh) + '_' + (y >> sh);
  if (!I.set.has(k)) return [];
  if (!placeTiles.has(k)) placeTiles.set(k, (async () => { try { const r = await fetch(CFG.places + k + '.json'); return r.ok ? await r.json() : []; } catch (e) { return []; } })());
  const rows = await placeTiles.get(k), n = Math.pow(2, z), out = [];
  for (const r of rows) {
    if (r[3] / 10 > z + 1) continue;
    const nx = mercX(r[0] / 1e5), ny = mercY(r[1] / 1e5);
    if (Math.floor(nx * n) !== x || Math.floor(ny * n) !== y) continue;
    out.push({ nx, ny, z: r[3] / 10, k: r[2], n: r[4], w: r[5] || '' });
  }
  if (!out.length) return out;
  // a place the OpenStreetMap tile (or, beyond its last zoom, the tile it is cut from) already names is left to it
  const oz = Math.min(z, CFG.ofmMax || 14), d = z - oz;
  const buf = CFG.ofm ? await fetchOfm(oz, x >> d, y >> d) : null;
  const names = new Set();
  if (buf) { const L = decodeLayers(buf, new Set(['place'])).place; if (L) for (const span of L.feats) { const F = featureOf(buf, L, span); for (const key of ['name', 'name_en', 'name:en', 'name:latin']) if (F.props[key]) names.add(String(F.props[key]).toLowerCase()); } }
  return out.filter(p => p.k === 3 || !names.has(p.n.toLowerCase())).slice(0, 200);
}

// ---------------- drawn towns (zoom 12 and closer): townhouses along the real streets of built-up land ----------------
function lineParts(buf, g) {
  const R = new Reader(buf); R.p = g[0];
  let x = 0, y = 0; const parts = []; let cur = null;
  while (R.p < g[1]) {
    const ci = R.varint(), cmd = ci & 7, cnt = ci >> 3;
    if (cmd === 7) continue;
    for (let i = 0; i < cnt; i++) {
      const dx = R.varint(), dy = R.varint();
      x += (dx >>> 1) ^ -(dx & 1); y += (dy >>> 1) ^ -(dy & 1);
      if (cmd === 1) { cur = [[x, y]]; parts.push(cur); } else cur.push([x, y]);
    }
  }
  return parts;
}
function pointOf(buf, g) { const R = new Reader(buf); R.p = g[0]; R.varint(); const dx = R.varint(), dy = R.varint(); return [(dx >>> 1) ^ -(dx & 1), (dy >>> 1) ^ -(dy & 1)]; }
// radius of the drawn town (km) and of its walled old core, by kind of place
const TOWN_R = { capital: 4.2, city: 2.6, town: 1.25, village: 0.55, hamlet: 0.35 };
// share of house sites kept at distance dr (in place radii) from the centre: packed rows in the old core, falling fast
// through the inner streets, then scattered houses with gardens at the edge
const townKeep = dr => dr < 0.15 ? 1 : dr < 0.35 ? 1 - 1.5 * (dr - 0.15) : Math.max(0.04, 0.7 * Math.exp(-3.2 * (dr - 0.35)));
// real town walls (data/walls.geojson): where one runs round a core, it is drawn from the data, not as a ring
let wallBoxes = null;
function realWalls() {
  if (!wallBoxes) wallBoxes = (async () => {
    if (!CFG.walls) return [];
    try {
      const j = await (await fetch(CFG.walls)).json(), out = [];
      if (Array.isArray(j)) return j;   // data/walls_boxes.json: the boxes, precomputed (code/02k_lazy_split.py)
      for (const f of j.features) {
        if (f.properties.k !== 'wall') continue;
        const g = f.geometry, ls = g.type === 'LineString' ? [g.coordinates] : g.coordinates;
        let x0 = 1, y0 = 1, x1 = 0, y1 = 0;
        for (const l of ls) for (const c of l) { const X = mercX(c[0]), Y = mercY(c[1]); x0 = Math.min(x0, X); x1 = Math.max(x1, X); y0 = Math.min(y0, Y); y1 = Math.max(y1, Y); }
        out.push([x0, y0, x1, y1]);
      }
      return out;
    } catch (e) { return []; }
  })();
  return wallBoxes;
}
const TH_N = 16;   // townhouse drawings th0 to th15 (js/ink-icons.js)
// ---------------- regional architecture (round 5): js/ink-houses.js draws, data/house_regions.json (code/02p_house_regions.py) says where
let houseReg = null;
function houseRegions() {
  if (!houseReg) houseReg = (async () => {
    if (!CFG.houseRegions) return null;
    try {
      const j = await (await fetch(CFG.houseRegions)).json(), g = new Uint8Array(j.w * j.h); let i = 0;
      for (const r of j.rows) { const a = r.split(','); for (let k = 0; k < a.length; k += 2) { const n = +a[k + 1]; g.fill(+a[k], i, i + n); i += n; } }
      return { g, w: j.w, h: j.h, res: j.res, keys: j.keys };
    } catch (e) { return null; }
  })();
  return houseReg;
}
function regionAt(R, nx, ny) {
  if (CFG.houseStyle) return CFG.houseStyle;   // QA only: draw every town in one region's style
  if (!R) return 'w';
  const lon = nx * 360 - 180, lat = latOfY(ny);
  const i = Math.max(0, Math.min(R.w - 1, Math.floor((lon + 180) / R.res))), j = Math.max(0, Math.min(R.h - 1, Math.floor((90 - lat) / R.res)));
  return R.keys[R.g[j * R.w + i]] || 'w';
}
const RANGE = (s, n) => Array.from({ length: n }, (_, i) => 'r' + s + '-' + i);
const PICK = (s, ...k) => k.map(i => 'r' + s + '-' + i);
const TH16 = Array.from({ length: TH_N }, (_, i) => 'th' + i);
// per region: h town houses, r village and outskirt houses (else h), c church, mosque or temple, g village green,
// tw family of tall houses, f travellers on the roads (js/ink-life-art.js); the market is a market cross in Europe and
// the lands settled from it, a well under a little roof elsewhere
const HSTYLE = {
  w: { h: TH16, c: 'townchurch', g: 1, tw: 'wt', f: 'eu' },
  nl: { h: TH16.concat(RANGE('nl', 4), RANGE('nl', 4)), c: 'townchurch', g: 1, tw: 'wt', f: 'eu' },
  na: { h: TH16, c: 'townchurch', g: 1, tw: 'us', f: 'na' },
  de: { h: RANGE('de', 10), r: PICK('de', 1, 2, 5, 8, 9, 5, 0), c: 'townchurch', g: 1, tw: 'de', f: 'eu' },
  al: { h: PICK('al', 0, 1, 2).concat(PICK('de', 0, 4, 2)), r: PICK('al', 0, 1, 3, 0, 2), c: 'tc-baroque', g: 1, tw: 'de', f: 'eu' },
  sc: { h: PICK('sc', 0, 1, 2, 5, 6, 7), r: PICK('sc', 0, 3, 4, 8, 6, 1), c: 'tc-nordic', g: 1, tw: 'sc', f: 'eu' },
  no: { h: PICK('sc', 0, 1, 2, 5, 7, 3), r: PICK('sc', 3, 4, 8, 0, 3), c: ['tc-stave', 'tc-nordic', 'tc-stave'], g: 1, tw: 'sc', f: 'eu' },
  ru: { h: PICK('ru', 0, 1, 2, 3, 4, 0, 1), r: PICK('ru', 0, 1, 4, 5), c: 'tc-onion', tw: 'ru', f: 'eu' },
  ua: { h: PICK('ru', 6, 7, 3, 2, 0, 6), r: PICK('ru', 6, 7, 6, 5), c: 'tc-onion', tw: 'ru', f: 'eu' },
  med: { h: RANGE('med', 10), r: PICK('med', 0, 8, 3, 7), c: 'tc-campanile', tw: 'med', f: 'eu' },
  gr: { h: RANGE('gr', 4).concat(PICK('med', 0, 3)), r: PICK('gr', 0, 2, 3), c: 'tc-byz', tw: 'med', f: 'eu' },
  cyc: { h: RANGE('cyc', 4), c: 'tc-cyc', tw: 'med', f: 'eu' },
  bk: { h: PICK('bk', 1, 2, 3, 4, 5).concat(PICK('med', 0)), r: PICK('bk', 0, 3, 4, 5), c: 'tc-byz', tw: 'med', f: 'eu' },
  bkm: { h: PICK('bk', 0, 1, 2, 3, 4), r: PICK('bk', 0, 3, 4), c: 'tc-mosque', tw: 'med', f: 'eu' },
  tr: { h: PICK('bk', 1, 2, 5, 4, 1, 2), r: PICK('bk', 3, 4).concat(PICK('mn', 0)), c: 'tc-mosque', tw: 'med', f: 'mn' },
  cau: { h: PICK('bk', 6, 3, 4, 6).concat(PICK('mn', 3)), r: PICK('bk', 3, 4), c: 'tc-arm', tw: 'med', f: 'eu' },
  mn: { h: PICK('mn', 0, 1, 2, 3, 4, 8, 9, 1, 2), r: PICK('mn', 0, 2, 3, 9), c: 'tc-mosque-a', tw: 'mn', f: 'mn' },
  il: { h: PICK('mn', 1, 2, 3, 0, 8), c: 'tc-dome', tw: 'mn', f: 'mn' },
  mg: { h: PICK('mn', 6, 7, 2, 7, 1), r: PICK('mn', 6, 0, 7), c: 'tc-mosque-m', tw: 'mn', f: 'mn' },
  ca: { h: PICK('ca', 0, 1, 2).concat(PICK('mn', 0, 2)), r: PICK('ca', 0, 3, 3).concat(PICK('mn', 0)), c: 'tc-mosque-ca', tw: 'mn', f: 'ca' },
  sh: { h: PICK('sh', 0, 1, 2, 5, 6, 0), r: PICK('sh', 3, 4, 2, 3), c: 'tc-sahel', tw: 'sh', f: 'sh' },
  ha: { h: PICK('ha', 0, 1, 2, 0).concat(PICK('sh', 2)), r: PICK('sh', 3, 4, 2), c: 'tc-sahel', tw: 'sh', f: 'sh' },
  wa: { h: PICK('wa', 0, 3, 1, 5, 0, 3), r: PICK('wa', 1, 2, 4, 6, 4), c: 'tc-afchurch', tw: 'af', f: 'af' },
  sw: { h: PICK('sw', 0, 1, 3, 0, 1), r: PICK('sw', 2).concat(PICK('eaf', 0, 2)), c: 'tc-swmosque', tw: 'af', f: 'af' },
  et: { h: PICK('et', 1, 2, 0, 2), r: PICK('et', 0, 0, 2), c: 'tc-ethround', tw: 'af', f: 'af' },
  eaf: { h: PICK('eaf', 3, 2, 4, 0, 3), r: PICK('eaf', 0, 1, 2, 0), c: 'tc-afchurch', tw: 'af', f: 'af' },
  za: { h: PICK('za', 3, 1, 2, 3).concat(PICK('eaf', 3)), r: PICK('za', 0, 1, 2, 4), c: 'tc-afchurch', tw: 'af', f: 'af' },
  zw: { h: PICK('zw', 0, 1).concat(PICK('eaf', 3, 0)), r: PICK('zw', 1).concat(PICK('eaf', 0, 1)), c: 'tc-afchurch', tw: 'af', f: 'af' },
  in: { h: PICK('in', 0, 1, 2, 6, 7, 3, 5), r: PICK('in', 8, 4, 3, 8), c: 'tc-shikhara', tw: 'in', f: 'sa' },
  np: { h: PICK('np', 0, 1, 2, 0), r: PICK('np', 2).concat(PICK('in', 8)), c: 'tc-pagoda', tw: 'in', f: 'sa' },
  pk: { h: PICK('pk', 0, 1).concat(PICK('in', 1, 7)), r: PICK('in', 8, 4, 4), c: 'tc-mughal', tw: 'in', f: 'pk' },
  lk: { h: PICK('lk', 0).concat(PICK('in', 3, 5)), r: PICK('in', 3, 8), c: 'tc-stupa', tw: 'in', f: 'sa' },
  cn: { h: PICK('cn', 0, 1, 2, 3, 4, 5), r: PICK('cn', 0, 1, 6, 7), c: 'tc-pagoda', tw: 'ea', f: 'ea' },
  kr: { h: PICK('kr', 0, 1, 0, 1).concat(PICK('cn', 1)), r: PICK('kr', 2, 0), c: 'tc-pagoda', tw: 'ea', f: 'ea' },
  jp: { h: PICK('jp', 0, 1, 3, 4, 6, 0), r: PICK('jp', 2, 5, 3), c: 'tc-pagoda', tw: 'jp', f: 'ea' },
  vn: { h: PICK('se', 3, 2, 3).concat(PICK('cn', 2, 5)), r: PICK('se', 0, 6), c: 'tc-pagoda', tw: 'se', f: 'se' },
  th: { h: PICK('se', 1, 2, 8, 1, 3), r: PICK('se', 1, 6, 0), c: 'tc-wat', tw: 'se', f: 'se' },
  mm: { h: PICK('se', 1, 2, 8, 0), r: PICK('se', 0, 6), c: 'tc-stupa', tw: 'se', f: 'se' },
  ml: { h: PICK('se', 4, 2, 5, 4, 2), r: PICK('se', 4, 6, 0), c: 'tc-jmosque', tw: 'se', f: 'ml' },
  ph: { h: PICK('se', 7, 2, 7, 4), r: PICK('se', 0, 6), c: 'tc-colonial', tw: 'se', f: 'se' },
  pc: { h: PICK('se', 0, 6), c: 'tc-afchurch', tw: 'se', f: 'se' },
  mx: { h: PICK('la', 0, 1, 2, 9, 10, 2, 5), r: PICK('la', 0, 2, 6), c: 'tc-colonial', tw: 'la', f: 'am' },
  sa: { h: PICK('la', 3, 4, 5, 8, 1, 0), r: PICK('la', 0, 6, 5), c: 'tc-colonial', tw: 'la', f: 'am' },
  an: { h: PICK('la', 6, 0, 1, 6), r: PICK('la', 6, 7), c: 'tc-colonial', tw: 'la', f: 'an' },
};
for (const k of Object.keys(HSTYLE)) { const st = HSTYLE[k]; st.m = st.f === 'eu' || st.f === 'na' ? 'market' : 'market2'; st.r = st.r || st.h; }
const styleAt = (R, nx, ny) => HSTYLE[regionAt(R, nx, ny)] || HSTYLE.w;
// high-rise districts (centre lat, lon, radius km, height band 1 to 4), used where the tile carries no building heights
const CBD = [[40.758, -73.985, 3.2, 4], [40.708, -74.011, 1.1, 4], [41.881, -87.632, 1.6, 4], [43.648, -79.381, 1.3, 4], [25.198, 55.272, 2.2, 4], [25.08, 55.14, 1.8, 4],
  [31.236, 121.505, 2.4, 4], [31.230, 121.470, 4, 3], [22.282, 114.158, 1.5, 4], [22.305, 114.172, 2.5, 3], [22.54, 114.06, 3, 4], [1.283, 103.851, 1.5, 4], [3.155, 101.712, 1.5, 4],
  [35.690, 139.695, 1.2, 4], [35.680, 139.765, 1.6, 3], [35.68, 139.74, 8, 2], [34.70, 135.50, 2, 3], [37.55, 126.98, 6, 3], [37.51, 127.06, 2, 3], [25.033, 121.565, 1.5, 3], [39.91, 116.46, 1.5, 3],
  [23.12, 113.32, 2.5, 3], [29.56, 106.55, 2.5, 4], [13.74, 100.54, 3, 3], [-6.20, 106.82, 3, 3], [14.555, 121.025, 1.5, 3], [10.776, 106.70, 1.5, 3], [19.02, 72.83, 5, 3],
  [51.514, -0.083, 1.0, 3], [51.505, -0.019, 0.7, 4], [48.892, 2.236, 0.8, 3], [50.112, 8.672, 0.9, 3], [52.23, 21.00, 1, 3], [55.749, 37.538, 0.8, 4], [45.484, 9.19, 0.7, 3], [40.477, -3.688, 0.5, 3],
  [51.92, 4.48, 0.8, 2], [41.08, 29.01, 1.5, 3], [25.32, 51.53, 1.5, 3], [24.71, 46.67, 1.2, 3], [24.48, 54.36, 2, 3], [29.375, 47.98, 1, 3], [32.08, 34.79, 1.5, 3],
  [-23.56, -46.65, 6, 3], [-22.905, -43.18, 1.5, 2], [-34.60, -58.38, 2.5, 2], [-33.415, -70.60, 1.5, 3], [4.65, -74.06, 2, 2], [19.43, -99.17, 1.5, 3], [8.98, -79.52, 1.5, 3],
  [34.05, -118.255, 1.0, 3], [37.79, -122.40, 1.2, 3], [47.61, -122.335, 1.0, 3], [29.76, -95.37, 1.2, 3], [32.78, -96.80, 1.0, 3], [25.77, -80.19, 1.5, 3], [33.76, -84.39, 1.2, 3],
  [39.953, -75.165, 1.0, 3], [42.355, -71.06, 0.9, 3], [38.90, -77.03, 1.2, 2], [49.283, -123.12, 1.2, 3], [51.045, -114.065, 0.9, 3], [45.50, -73.57, 1.0, 3],
  [-33.867, 151.207, 1.0, 3], [-37.815, 144.963, 1.0, 3], [-27.47, 153.025, 0.9, 3], [-31.952, 115.858, 0.8, 3], [-36.848, 174.763, 0.8, 2],
  [-26.20, 28.045, 1.2, 3], [-1.285, 36.82, 0.9, 2], [6.45, 3.42, 1.2, 2], [30.045, 31.235, 2, 2], [-33.92, 18.42, 0.8, 2]];
const TALLP = [0, 0.3, 0.5, 0.65, 0.75];   // share of house sites drawn as tall houses, by height band
const hBand = h => h >= 150 ? 4 : h >= 70 ? 3 : h >= 35 ? 2 : h >= 24 ? 1 : 0;
async function townPoints(z, x, y, avoid) {
  if (z < 12 || !CFG.ofm || z > CFG.ofmMax) return [];
  const [buf, pbuf, REG] = await Promise.all([fetchOfm(z, x, y), fetchOfm(z - 2, x >> 2, y >> 2), houseRegions()]);
  if (!buf || !pbuf) return [];
  const n = Math.pow(2, z), Ls = decodeLayers(buf, new Set(['transportation', 'landuse', 'building', 'water']));
  // places from the parent tile two zooms up, so a town just over the tile's edge still sets the density here
  const PL = decodeLayers(pbuf, new Set(['place'])).place, n2 = n / 4, places = [];
  if (PL) for (const span of PL.feats) {
    const F = featureOf(pbuf, PL, span); if (F.type !== 1) continue;
    const cl = F.props.class; if (!TOWN_R[cl] && cl !== 'city') continue;
    const [px, py] = pointOf(pbuf, F.geom);
    const nx = ((x >> 2) + px / PL.extent) / n2, ny = ((y >> 2) + py / PL.extent) / n2;
    const kind = cl === 'city' && (F.props.capital === 2 || F.props.capital === '2') ? 'capital' : cl;
    places.push({ nx, ny, kind, R: TOWN_R[kind] || 1, rank: F.props.rank || 9 });
  }
  // villages and hamlets come from this tile itself: the parent tile leaves most of them out, which left villages bare
  const PL0 = decodeLayers(buf, new Set(['place'])).place;
  if (PL0) for (const span of PL0.feats) {
    const F = featureOf(buf, PL0, span); if (F.type !== 1) continue;
    const cl = F.props.class; if (cl !== 'village' && cl !== 'hamlet') continue;
    const [px, py] = pointOf(buf, F.geom);
    const nx = (x + px / PL0.extent) / n, ny = (y + py / PL0.extent) / n;
    if (places.some(P => Math.abs(P.nx - nx) * n * 512 < 8 && Math.abs(P.ny - ny) * n * 512 < 8)) continue;
    places.push({ nx, ny, kind: cl, R: TOWN_R[cl], rank: F.props.rank || 12 });
  }
  if (!places.length) return [];
  for (const P of places) { P.st = styleAt(REG, P.nx, P.ny); const c = P.st.c; P.church = Array.isArray(c) ? c[Math.floor(hash3(Math.round(P.nx * 1e7), Math.round(P.ny * 1e7), 61) * c.length)] : c; }
  // building heights (OpenStreetMap render_height, in tiles from zoom 13) on the mask grid, for the tall houses
  let hgt = null;
  if (z >= 13 && Ls.building) {
    const B = Ls.building;
    for (const span of B.feats) {
      const F = featureOf(buf, B, span), hh = +(F.props.render_height || F.props.height || 0);
      if (hh < 24) continue;
      const part = lineParts(buf, F.geom)[0]; if (!part || !part.length) continue;
      let sx = 0, sy = 0; for (const q of part) { sx += q[0]; sy += q[1]; }
      const i = Math.floor(sx / part.length / B.extent * MS), j = Math.floor(sy / part.length / B.extent * MS);
      if (i < 0 || j < 0 || i >= MS || j >= MS) continue;
      if (!hgt) hgt = new Float32Array(MS * MS);
      for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) { const ii = i + di, jj = j + dj; if (ii >= 0 && jj >= 0 && ii < MS && jj < MS && hgt[jj * MS + ii] < hh) hgt[jj * MS + ii] = hh; }
    }
  }
  const tileLat = latOfY((y + 0.5) / n), tileLon = (x + 0.5) / n * 360 - 180;
  const cbds = CBD.filter(c => Math.abs(c[0] - tileLat) < 0.6 && Math.abs(c[1] - tileLon) < 0.8);
  // the height band at a house site: OpenStreetMap heights where the tile has them, else the known high-rise districts,
  // else a little height towards the old core of a capital or a big city (city centres read as built up)
  const band = (P, dr, tx, ty, gnx, gny) => {
    if (hgt) return hBand(hgt[Math.min(MS - 1, Math.floor(ty * MS)) * MS + Math.min(MS - 1, Math.floor(tx * MS))]);
    let b = 0;
    if (cbds.length) { const lat = latOfY(gny), lon = gnx * 360 - 180; for (const c of cbds) { const dk = Math.hypot((lat - c[0]) * 111, (lon - c[1]) * 111 * Math.cos(c[0] * DEG)) / c[2]; b = Math.max(b, dk < 0.5 ? c[3] : dk < 1 ? c[3] - 1 : dk < 1.6 ? c[3] - 2 : 0); } }
    if (CFG.houseBand && dr < 0.5) b = Math.max(b, dr < 0.2 ? CFG.houseBand : CFG.houseBand - 1);   // QA only: a high-rise core in any town
    if (P.kind === 'capital') b = Math.max(b, dr < 0.1 ? 2 : dr < 0.22 ? 1 : 0); else if (P.kind === 'city' && P.rank <= 3) b = Math.max(b, dr < 0.12 ? 1 : 0);
    return b;
  };
  const pickHouse = (P, dr, hh, tx, ty, gnx, gny, urban) => {
    const b = band(P, dr, tx, ty, gnx, gny);
    if (b > 0 && hash3(Math.round(gnx * 4e7), 13, Math.round(gny * 4e7)) < TALLP[b] * (hgt || cbds.length || CFG.houseBand ? 1 : 0.6)) return { t: 'tw-' + P.st.tw + '-' + b, big: 1 };
    // (dense city fabric far from the centre keeps the town houses of its region, not the rural ones)
    const L = (P.kind === 'village' || P.kind === 'hamlet' || dr > 0.75) && !(urban > 0.5) ? P.st.r : P.st.h;
    return { t: L[Math.floor(hh * L.length)] };
  };
  const kmPerN = 40075 * Math.cos(latOfY((y + 0.5) / n) * DEG);   // km per unit of normalised x at this latitude
  // built-up land: residential, commercial and retail land use and the buildings themselves
  const built = Ls.landuse ? polyMask(buf, Ls.landuse, p => ['residential', 'commercial', 'retail', 'suburb', 'neighbourhood', 'quarter'].includes(p.class)) : null;
  const bld = Ls.building ? polyMask(buf, Ls.building, null) : null;
  const wet = Ls.water ? polyMask(buf, Ls.water, null) : null;
  const at = (m, tx, ty) => m && m[Math.max(0, Math.min(MS - 1, Math.floor(ty * MS))) * MS + Math.max(0, Math.min(MS - 1, Math.floor(tx * MS)))] === 1;
  // building density round a point (share of a 5 x 5 mask window covered)
  const dens = (tx, ty) => { if (!bld) return 0; let c = 0; const i0 = Math.floor(tx * MS), j0 = Math.floor(ty * MS); for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) { const i = i0 + di, j = j0 + dj; if (i >= 0 && j >= 0 && i < MS && j < MS && bld[j * MS + i]) c++; } return c / 25; };
  // round 7: dense city fabric (built-up land packed with buildings) is filled with houses wherever it lies, not only near
  // a place's centre: a great city's districts far from its centre point (Kyoto, Tokyo, Seoul, Paris, Cairo) read as town,
  // not as scattered outskirts. 0 in open or leafy ground, 1 where the buildings cover two thirds of the ground or more.
  const urb = (ins, dn) => (ins || dn >= 0.3) ? Math.max(0, Math.min(1, (dn - 0.25) / 0.4)) : 0;
  // (a higher cap for densely built tiles was tried: 15% more drawings cost Paris at zoom 14 about a third of its panning frame
  // rate in the software renderer, so the cap stays at CFG.TMAX; dense fabric away from the centre is ranked with the inner streets instead, above)
  const tmax = CFG.TMAX;
  const near = (nx, ny) => { let best = null, bd = 1e9; for (const P of places) { const d = Math.hypot((nx - P.nx) * kmPerN, (ny - P.ny) * kmPerN) / P.R; if (d < bd) { bd = d; best = P; } } return [best, bd]; };
  // occupancy grid in tile pixels (512 a tile), so houses never overprint each other or a heritage drawing
  const OC = 7, occ = new Set();
  const key = (px, py) => Math.floor(px / OC) + ',' + Math.floor(py / OC);
  const free = (px, py, r) => { for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) if (occ.has((Math.floor(px / OC) + di) + ',' + (Math.floor(py / OC) + dj))) return false; return true; };
  const take = (px, py, r) => { for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) occ.add((Math.floor(px / OC) + di) + ',' + (Math.floor(py / OC) + dj)); };
  // heritage drawings keep a little clear room round them; the houses pack the rest of the old core
  for (const p of avoid) take((p.nx * n - x) * 512, (p.ny * n - y) * 512, 1);
  const out = [];
  // the centre of each place in this tile: a market square and its church, and for capitals and cities a wall with towers round the old core
  for (const P of places) {
    const px = (P.nx * n - x) * 512, py = (P.ny * n - y) * 512;
    if (px >= 0 && px < 512 && py >= 0 && py < 512 && P.kind !== 'village' && P.kind !== 'hamlet') {
      // set just below the name, which sits on the place point
      out.push({ nx: P.nx - 8 / 512 / n, ny: P.ny + 20 / 512 / n, t: P.st.m, a: 0, o: 0 }); take(px - 8, py + 20, 2);
      out.push({ nx: P.nx + 14 / 512 / n, ny: P.ny + 16 / 512 / n, t: P.church, a: 0, o: 0 }); take(px + 14, py + 16, 2);
      // market stalls round the square
      for (const [dx, dy, k] of [[-22, 24, 0], [-14, 32, 1], [2, 30, 2]]) { if (free(px + dx, py + dy, 0)) { out.push({ nx: P.nx + dx / 512 / n, ny: P.ny + dy / 512 / n, t: 'stall' + k, a: 0, o: 0 }); take(px + dx, py + dy, 0); } }
    } else if (px >= 0 && px < 512 && py >= 0 && py < 512 && P.kind === 'village') { out.push({ nx: P.nx + 10 / 512 / n, ny: P.ny + 16 / 512 / n, t: P.church, a: 0, o: 0 }); take(px + 10, py + 16, 2);
      if (P.st.g && free(px - 16, py + 22, 1)) { out.push({ nx: P.nx - 16 / 512 / n, ny: P.ny + 22 / 512 / n, t: 'green', a: 0, o: 0 }); take(px - 16, py + 22, 1); } }
    const W0 = await realWalls(), rk0 = P.R * 0.4 / kmPerN;
    const hasWall = W0.some(b => b[0] < P.nx + rk0 && b[2] > P.nx - rk0 && b[1] < P.ny + rk0 && b[3] > P.ny - rk0 && (b[2] - b[0]) < rk0 * 6);
    if (!hasWall && (P.kind === 'capital' || (P.kind === 'city' && P.rank <= 3))) {
      const rk = P.R * 0.32 / kmPerN, segs = Math.max(24, Math.round(2 * Math.PI * rk * n * 512 / 13));
      for (let s = 0; s < segs; s++) {
        const th = s / segs * 2 * Math.PI, wob = 1 + 0.06 * Math.sin(th * 3 + P.nx * 1e4);
        const wx = P.nx + Math.cos(th) * rk * wob, wy = P.ny + Math.sin(th) * rk * wob;
        const tx = (wx * n - x), ty = (wy * n - y);
        if (tx < 0 || tx >= 1 || ty < 0 || ty >= 1 || at(wet, tx, ty)) continue;
        const tower = s % 5 === 0;
        out.push({ nx: wx, ny: wy, t: tower ? 'walltower' : 'wallseg', a: tower ? 0 : (th * 180 / Math.PI + 90) % 360, o: 1 });
        take(tx * 512, ty * 512, 1);
      }
    }
  }
  // townhouses: both sides of every street, facing it, densest at the centre and thinning outwards with the buildings
  const T = Ls.transportation, cand = [];
  if (T) {
    const STREET = { primary: 1, secondary: 1, tertiary: 1, minor: 1, service: 0.5, residential: 1, living_street: 1, pedestrian: 1 };
    const sc = 512 / T.extent, step = 10.5, off = 8;
    for (const span of T.feats) {
      if (cand.length >= 8000) break;
      const F = featureOf(buf, T, span); if (F.type !== 2) continue;
      const w = STREET[F.props.class]; if (!w || F.props.brunnel === 'tunnel' || F.props.brunnel === 'bridge') continue;
      for (const part of lineParts(buf, F.geom)) {
        let carry = step * 0.5;
        for (let k = 1; k < part.length; k++) {
          const ax = part[k - 1][0] * sc, ay = part[k - 1][1] * sc, bx = part[k][0] * sc, by = part[k][1] * sc;
          const L = Math.hypot(bx - ax, by - ay); if (L < 0.5) continue;
          const ux = (bx - ax) / L, uy = (by - ay) / L;
          // less regular spacing (round 4): each step along the street and each setback from it varies a little, so the
          // houses read as a town grown plot by plot, not a row of copies
          for (let d = carry; d < L; d += step * (0.78 + 0.5 * hash3(Math.round((ax + ux * d) * 97), Math.round((ay + uy * d) * 89), 53))) {
            const cx = ax + ux * d, cy = ay + uy * d;
            for (const side of [1, -1]) {
              const ofs = off * (0.82 + 0.4 * hash3(Math.round(cx * 71), Math.round(cy * 67), side + 59));
              const nxv = -uy * side, nyv = ux * side, hx = cx + nxv * ofs, hy = cy + nyv * ofs;
              if (hx < 0 || hx >= 512 || hy < 0 || hy >= 512) continue;
              const tx = hx / 512, ty = hy / 512;
              if (at(wet, tx, ty)) continue;
              const gnx = (x + tx) / n, gny = (y + ty) / n, [P, dr] = near(gnx, gny);
              if (!P) continue;
              const ins = at(built, tx, ty), dn = dens(tx, ty), u = urb(ins, dn);
              if (dr > 1.6 && !u) continue;
              if (!ins && dn < 0.12 && dr > 0.5) continue;
              // keep share: the old core is packed; beyond it, houses only where OpenStreetMap maps buildings
              const keep = Math.max(Math.min(1, townKeep(dr) * w * (0.7 + 0.5 * dn)), u * 0.8 * w);
              const h = hash3(Math.round(gnx * 4e7), Math.round(gny * 4e7), 31);
              if (h >= keep) continue;
              const ph = pickHouse(P, dr, hash3(Math.round(gnx * 4e7), 7, Math.round(gny * 4e7)), tx, ty, gnx, gny, u);
              cand.push({ hx, hy, dr: u ? Math.min(dr, 0.45 + 0.6 * (1 - u)) : dr, big: ph.big, it: { nx: gnx, ny: gny, t: ph.t, a: Math.round((Math.atan2(nxv, -nyv) * 180 / Math.PI + 360) % 360), o: 0 } });
            }
          }
          carry = (carry - L % step + step) % step; if (carry < 0.01) carry = step;
        }
      }
    }
  }
  // blocks between the streets (and towns whose small streets the tile leaves out): fill the built-up land on a
  // jittered grid, houses turned to the nearest street direction found above, or square to the map
  const G = 10.5;
  for (let gy = G / 2; gy < 512; gy += G) for (let gx = G / 2; gx < 512; gx += G) {
    const gnx0 = (x + gx / 512) / n, gny0 = (y + gy / 512) / n;
    const hx = gx + (hash3(Math.round(gnx0 * 4e7), Math.round(gny0 * 4e7), 41) - 0.5) * G * 0.6, hy = gy + (hash3(Math.round(gny0 * 4e7), Math.round(gnx0 * 4e7), 43) - 0.5) * G * 0.6;
    const tx = hx / 512, ty = hy / 512;
    if (tx < 0 || ty < 0 || tx >= 1 || ty >= 1 || at(wet, tx, ty)) continue;
    const gnx = (x + tx) / n, gny = (y + ty) / n, [P, dr] = near(gnx, gny);
    if (!P) continue;
    const ins = at(built, tx, ty), dn = dens(tx, ty), u = urb(ins, dn);
    if (dr > 1.3 && !u) continue;
    if (!ins && dn < 0.2 && dr > ((P.kind === 'village' || P.kind === 'hamlet') ? 0.65 : 0.4)) continue;   // the old core counts as built even where the tile maps nothing
    const small = P.kind === 'village' || P.kind === 'hamlet';
    const keep = Math.max(dr < 0.18 ? 0.95 : small && dr < 0.6 ? 0.8 - 0.6 * dr : Math.min(1, townKeep(dr) * (0.25 + 0.6 * dn)), u * 0.55);
    if (hash3(Math.round(gnx * 4e7), Math.round(gny * 4e7), 47) >= keep) continue;
    const ph = pickHouse(P, dr, hash3(Math.round(gnx * 4e7), 9, Math.round(gny * 4e7)), tx, ty, gnx, gny, u);
    cand.push({ hx, hy, dr: (u ? Math.min(dr, 0.45 + 0.6 * (1 - u)) : dr) + 0.001, big: ph.big, it: { nx: gnx, ny: gny, t: ph.t, a: [0, 90, 180, 270][Math.floor(hash3(Math.round(gnx * 4e7), 11, 3) * 4)], o: 0 } });
  }
  // the old cores of cities and capitals packed tighter still (a finer grid, offset from the one above), so a city centre reads as built up
  for (const P of places) {
    if (P.kind !== 'capital' && P.kind !== 'city') continue;
    const cx = (P.nx * n - x) * 512, cy = (P.ny * n - y) * 512, rp = 0.3 * P.R / kmPerN * n * 512, G2 = 7;
    for (let gy = Math.max(G2 / 2, cy - rp); gy < Math.min(512, cy + rp); gy += G2) for (let gx = Math.max(G2 / 2, cx - rp); gx < Math.min(512, cx + rp); gx += G2) {
      const tx = (gx + 2.6) / 512, ty = (gy + 3.1) / 512; if (tx >= 1 || ty >= 1 || at(wet, tx, ty)) continue;
      const gnx = (x + tx) / n, gny = (y + ty) / n, dr = Math.hypot((gnx - P.nx) * kmPerN, (gny - P.ny) * kmPerN) / P.R;
      if (dr > 0.3 || hash3(Math.round(gnx * 4e7), Math.round(gny * 4e7), 49) > 0.85 - dr) continue;
      const ph = pickHouse(P, dr, hash3(Math.round(gnx * 4e7), 5, Math.round(gny * 4e7)), tx, ty, gnx, gny);
      cand.push({ hx: tx * 512, hy: ty * 512, dr: dr + 0.002, big: ph.big, it: { nx: gnx, ny: gny, t: ph.t, a: 0, o: 0 } });
    }
  }
  // place from the centre outwards, so the cap on drawings per tile thins the edges, never the old core
  cand.sort((a, b) => a.dr - b.dr);
  for (const c of cand) {
    if (out.length >= tmax) break;
    if (!free(c.hx, c.hy, c.big ? 1 : 0)) continue;
    take(c.hx, c.hy, c.big ? 1 : 0); out.push(c.it);
  }
  return out;
}

// ---------------- countryside and town life (zoom 9 and closer) ----------------
// Everything here is decoration generated from the OpenStreetMap tile itself (OpenFreeMap / OpenMapTiles schema):
//   life      points: t = sprite (js/ink-life-art.js), r = rank (first zoom, for the fade), g = group, a = map angle (trains)
//   lifeline  field boundaries as lines: k = h (hedgerow), w (drystone wall), d (ditch)
//   lifetrack a few road lines per tile along which js/ink-life.js moves a traveller
// Points come from the same nested grid as the trees, so they stay put as you zoom, and a small occupancy grid keeps
// them from drawing over one another.
const ROADCLS = { motorway: 0, trunk: 0, primary: 0, secondary: 1, tertiary: 1, minor: 2, service: 3, track: 3, path: 4 };
const ROADFOLK = [
  ['lr-wagon', 'lr-coach', 'lr-rider', 'lr-messenger', 'lr-knight', 'lr-packtrain', 'lr-cart', 'lr-cattledrove', 'lr-pilgrims', 'lr-rider2', 'lr-timber', 'lr-wagon'],
  ['lr-cart', 'lr-rider', 'lr-oxcart', 'lr-walker', 'lr-pedlar', 'lr-packtrain', 'lr-sheepdrove', 'lr-timber', 'lr-friars', 'lr-pilgrims', 'lr-rider2', 'lr-wagon'],
  ['lr-walker', 'lr-handcart', 'lr-geese', 'lr-sheepdrove', 'lr-oxcart', 'lr-rider2', 'lr-friars', 'lr-pedlar', 'lr-cart'],
  ['lr-sheepdrove', 'lr-cattledrove', 'lr-oxcart', 'lr-walker', 'lr-timber', 'lr-handcart', 'lr-geese'],
  ['lr-walker', 'lr-pilgrims', 'lr-friars', 'lr-rider2', 'lr-walker'],
];
// travellers outside Europe (round 5, js/ink-life-art.js): [main roads, lanes] for each family of the region grid (HSTYLE.f)
const F_ = (f, ...k) => k.map(i => i.includes('-') ? 'lr-' + i : 'lr-' + f + '-' + i);
const FOLK = {
  mn: [F_('mn', 'camels', 'rider', 'donkey', 'camelrider', 'walker', 'camels', 'women'), F_('mn', 'donkey', 'women', 'walker', 'goats', 'camelrider', 'women')],
  ca: [F_('ca', 'rider', 'camel', 'donkey', 'rider', 'women'), F_('ca', 'sheep', 'women', 'donkey', 'rider')],
  af: [F_('af', 'oxcart', 'walkers', 'headload', 'zebu', 'donkey'), F_('af', 'headload', 'goats', 'zebu', 'walkers', 'donkey', 'headload')],
  sh: [F_('sh', 'camels', 'rider', 'donkey', 'zebu', 'women'), F_('sh', 'women', 'zebu', 'donkey', 'camels', 'women')],
  sa: [F_('sa', 'bullock', 'walkers', 'zebu', 'bullock', 'sari'), F_('sa', 'sari', 'zebu', 'pots', 'walkers', 'bullock')],
  pk: [F_('pk', 'bullock', 'walkers', 'donkey', 'sa-zebu', 'women'), F_('pk', 'women', 'donkey', 'walkers', 'sa-zebu')],
  ea: [F_('ea', 'oxcart', 'rider', 'pole', 'walkers'), F_('ea', 'pole', 'walkers', 'barrow', 'oxcart')],
  se: [F_('se', 'buffcart', 'pole', 'walkers', 'buffalo'), F_('se', 'buffalo', 'pole', 'walkers')],
  ml: [F_('ml', 'se-buffcart', 'walkers', 'se-pole', 'buffalo'), F_('ml', 'buffalo', 'walkers', 'se-pole')],
  am: [F_('am', 'oxcart', 'rider', 'mules', 'cattle', 'walkers'), F_('am', 'walkers', 'mules', 'rider', 'cattle')],
  an: [F_('an', 'llamas', 'am-mules', 'women', 'am-rider'), F_('an', 'llamas', 'women', 'llamas')],
  na: [['lr-wagon', 'lr-na-rider', 'lr-cart', 'lr-cattledrove', 'lr-na-walkers', 'lr-coach', 'lr-wagon'], ['lr-na-walkers', 'lr-oxcart', 'lr-na-rider', 'lr-sheepdrove', 'lr-handcart', 'lr-walker']],
};
const ROADKEEP = [0.95, 0.75, 0.42, 0.22, 0.13], ROADZ = [9, 10, 12, 12.5, 13];
// the modern world turned medieval: OpenMapTiles poi class/subclass to a drawing (and its priority: lower is placed first)
const POIMED = {
  'stadium/*': ['lm-tourney', 0], 'railway/station': ['lm-coachinginn', 1], 'railway/halt': ['lm-coachinginn', 1], 'hospital/hospital': ['lm-infirmary', 2],
  'college/university': ['lm-college', 2], 'college/college': ['lm-college', 3], 'grocery/supermarket': ['lm-market', 3], 'grocery/marketplace': ['lm-market', 3],
  'grocery/department_store': ['lm-market', 4], 'shop/mall': ['lm-market', 4], 'bus/bus_station': ['lm-carriers', 3], 'school/school': ['lm-school', 4],
  'car/car': ['lm-cartwright', 4], 'fuel/fuel': ['lm-stable', 4], 'cinema/cinema': ['lm-stage', 4], 'theatre/theatre': ['lm-stage', 4], 'bank/bank': ['lm-counting', 5],
  'post/post_office': ['lm-messenger', 5], 'police/police': ['lm-watchhouse', 5], 'fire_station/fire_station': ['lm-firewatch', 5], 'library/library': ['lm-scriptorium', 6],
  'museum/museum': ['lm-cabinet', 6], 'lodging/hotel': ['lm-hostelry', 6], 'sports_centre/sports_centre': ['lm-butts', 6], 'car/car_repair': ['lm-cartwright', 7],
  'beer/pub': ['lm-innsign', 7], 'parking/parking': ['lm-wagonyard', 8], 'harbor/marina': ['harbour', 2], 'harbor/harbor': ['harbour', 2], 'harbor/dock': ['harbour', 3],
};
const LANDMED = { stadium: 'lm-tourney', hospital: 'lm-infirmary', university: 'lm-college', college: 'lm-college', school: 'lm-school' };
// footprint radius of a drawing in occupancy cells (12 px)
const FOOT = t => /tourney|college|coachinginn|infirmary|quay|works|brickworks|wagon|packtrain|drove|oxcart|coach$|timber/.test(t) ? 2 : /innsign|stocks|butt|hag|cairn|reed|pots|htree|rick|stooks|scarecrow|beehive|walker|heron/.test(t) ? 0 : 1;
async function elevSampler(z, x, y) {
  const dz = Math.min(z, CFG.demMax || 12, 12), d = z - dz;
  const sm = await demSampler(dz, x >> d, y >> d);
  if (!sm) return () => 0;
  const s = 1 << d, ox = (x - ((x >> d) << d)) * 256 / s, oy = (y - ((y >> d) << d)) * 256 / s;
  return (px, py) => { const i = Math.max(0, Math.min(255, Math.floor(ox + px / 512 * 256 / s))), j = Math.max(0, Math.min(255, Math.floor(oy + py / 512 * 256 / s))); return sm(i, j) * CFG.demScale; };
}
function ringArea(r) { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]); return Math.abs(a / 2); }
async function lifeTile(z, x, y, cover, her) {
  const out = { pts: [], lines: [], tracks: [] };
  const buf = await fetchOfm(z, x, y);
  if (!buf) return out;
  const Ls = decodeLayers(buf, new Set(['transportation', 'landcover', 'landuse', 'water', 'waterway', 'poi']));
  const n = Math.pow(2, z), elev = await elevSampler(z, x, y);
  const lonOf = nx => nx * 360 - 180, latOfN = ny => latOfY(ny);
  const cLon = lonOf((x + 0.5) / n), cLat = latOfN((y + 0.5) / n);
  const famOf = styleAt(await houseRegions(), (x + 0.5) / n, (y + 0.5) / n).f, FAM = FOLK[famOf] ? famOf : 'eu';   // the region's travellers
  const mPerPx = 40075016 * Math.cos(cLat * DEG) / (512 * n);
  const inBox = (lo0, la0, lo1, la1) => cLon >= lo0 && cLon <= lo1 && cLat >= la0 && cLat <= la1;
  const britain = inBox(-10.7, 49.8, 2, 61), lowCountries = inBox(3.2, 51.2, 7.3, 53.7), fens = inBox(-0.6, 52.0, 1.9, 53.2);
  const scotIre = inBox(-8, 55.3, -1.6, 59) || inBox(-10.6, 51.3, -5.4, 55.4);
  const water = Ls.water ? polyMask(buf, Ls.water, null) : null;
  const at = (m, px, py) => m && m[Math.max(0, Math.min(MS - 1, Math.floor(py / 512 * MS))) * MS + Math.max(0, Math.min(MS - 1, Math.floor(px / 512 * MS)))] === 1;
  const nearLand = (px, py) => { if (!water) return true; for (const [dx, dy] of [[-10, 0], [10, 0], [0, -10], [0, 10]]) if (!at(water, px + dx, py + dy)) return true; return false; };
  const nearW = (px, py, r) => { if (!water) return false; for (let dj = -r; dj <= r; dj += r) for (let di = -r; di <= r; di += r) if (at(water, px + di, py + dj)) return true; return false; };
  // occupancy (12 px cells): heritage drawings first, then the drawings here in order of importance
  const OC = 12, occ = new Set();
  const free = (px, py, r) => { const i0 = Math.floor(px / OC), j0 = Math.floor(py / OC); for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) if (occ.has((i0 + di) + ',' + (j0 + dj))) return false; return true; };
  const take = (px, py, r) => { const i0 = Math.floor(px / OC), j0 = Math.floor(py / OC); for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) occ.add((i0 + di) + ',' + (j0 + dj)); };
  for (const p of her || []) take((p.nx * n - x) * 512, (p.ny * n - y) * 512, 0);
  const put = (px, py, t, r, g, a) => {
    if (px < 0 || py < 0 || px >= 512 || py >= 512) return false;
    const f = FOOT(t); if (!free(px, py, f)) return false; take(px, py, f);
    out.pts.push({ nx: (x + px / 512) / n, ny: (y + py / 512) / n, t, r: Math.round(r * 10) / 10, g, a: a || 0 }); return true;
  };
  const toPx = p => [(p.nx * n - x) * 512, (p.ny * n - y) * 512];
  const hpt = (px, py, s) => hash3(Math.round(((x + px / 512) / n) * 4e7), Math.round(((y + py / 512) / n) * 4e7), s);

  // ---- 1. the modern world turned medieval (points of interest; land use further out)
  if (Ls.poi && z >= 12) {
    const P = Ls.poi, sc = 512 / P.extent, cand = [];
    for (const span of P.feats) {
      const F = featureOf(buf, P, span); if (F.type !== 1) continue;
      const cl = F.props.class, sub = F.props.subclass;
      const m = POIMED[cl + '/' + sub] || POIMED[cl + '/*']; if (!m) continue;
      const [qx, qy] = pointOf(buf, F.geom); const px = qx * sc, py = qy * sc;
      if (px < 0 || py < 0 || px >= 512 || py >= 512) continue;
      cand.push({ px, py, t: m[0], pri: m[1] + (F.props.rank ? F.props.rank / 100 : 0.5) });
    }
    cand.sort((a, b) => a.pri - b.pri);
    let nPub = 0, nPark = 0;
    for (const c of cand) {
      let t = c.t;
      if (t === 'lm-innsign') { if (++nPub > 14) continue; const h = hpt(c.px, c.py, 3); t = h < 0.4 ? 'lm-innsign' : h < 0.7 ? 'lm-innsign2' : 'lm-innsign3'; }
      if (t === 'lm-wagonyard' && (z < 14 || ++nPark > 4 || hpt(c.px, c.py, 5) > 0.35)) continue;
      if (t === 'lm-watchhouse' && hpt(c.px, c.py, 7) < 0.5) t = 'lm-stocks';
      if (t === 'harbour') {
        // fishing boats drawn up, nets and lobster pots round a harbour
        put(c.px + 8, c.py + 6, 'lr-coble', z, 'life'); put(c.px - 10, c.py + 10, 'lr-pots', z, 'life'); put(c.px + 4, c.py - 12, 'lr-boat', z, 'life');
        continue;
      }
      put(c.px, c.py, t, Math.max(12, z - 0.5), 'life');
    }
  }
  if (Ls.landuse && z >= 12 && z <= 13) {
    // further out than the points of interest reach: the big institutions from their land use polygons
    const U = Ls.landuse, sc = 512 / U.extent; let nLand = 0;
    for (const span of U.feats) {
      const F = featureOf(buf, U, span); if (F.type !== 3) continue;
      const t = LANDMED[F.props.class]; if (!t) continue;
      const parts = lineParts(buf, F.geom); if (!parts.length) continue;
      const ring = parts[0].map(q => [q[0] * sc, q[1] * sc]), A = ringArea(ring);
      if (A < 500 || ++nLand > 5) continue;   // only the big ones carry a drawing this far out
      let cx = 0, cy = 0; for (const q of ring) { cx += q[0]; cy += q[1]; } cx /= ring.length; cy /= ring.length;
      put(cx, cy, t, z, 'life');
    }
  }
  // ---- 2. early industry on industrial land: brickworks, kilns, forges, mills, breweries, distilleries, tanneries, glassworks
  const indM = Ls.landuse ? polyMask(buf, Ls.landuse, p => p.class === 'industrial') : null;
  if (indM && z >= 10) {
    const pot = inBox(-2.3, 52.95, -2.05, 53.1), burton = inBox(-1.72, 52.76, -1.56, 52.85);
    for (const q of nestedPoints(z, x, y, 95, 9, z + 1, 71)) {
      const [px, py] = toPx(q); if (!at(indM, px, py) || q.h > 0.8) continue;
      const h = hpt(px, py, 73), e = elev(px, py);
      let t;
      if (pot && h < 0.7) t = 'li-bottlekiln';
      else if (burton && h < 0.7) t = 'li-brewery';
      else if (scotIre && h < 0.28) t = 'li-distillery';
      else if (nearW(px, py, 10) && h < 0.4) t = h < 0.22 ? 'li-watermill' : 'li-quay';
      else if (e > 180 && h < 0.5) t = 'li-mine';
      else t = ['li-brickworks', 'li-works', 'li-forge', 'li-bottlekiln', 'li-tannery', 'li-glassworks', 'li-brewery', 'li-works', 'li-brickworks', 'li-forge'][Math.floor(hpt(px, py, 75) * 10)];
      put(px, py, t, q.r, 'ind');
    }
  }
  // ---- 3. the countryside: masks by land cover (with the wetland kinds), and the elevation for uplands
  const LC = Ls.landcover;
  const lcM = LC ? {
    farm: polyMask(buf, LC, p => p.class === 'farmland'),
    meadow: polyMask(buf, LC, p => p.class === 'grass' && (p.subclass === 'meadow' || p.subclass === 'grassland')),
    heath: polyMask(buf, LC, p => p.class === 'grass' && (p.subclass === 'heath' || p.subclass === 'moor' || p.subclass === 'fell')),
    reed: polyMask(buf, LC, p => p.class === 'wetland' && p.subclass !== 'bog' && p.subclass !== 'tidalflat' && p.subclass !== 'mangrove'),
  } : {};
  if (z >= 10 && LC) {
    for (const q of nestedPoints(z, x, y, 64, 9, z + 1, 81)) {
      const [px, py] = toPx(q);
      if (q.h > 0.5 || at(water, px, py)) continue;
      const e = elev(px, py), h = hpt(px, py, 83);
      if (lcM.heath && at(lcM.heath, px, py)) {
        if (q.h < 0.07 && e > 380) put(px, py, 'lf-hag', q.r, 'land');
        else if (q.h >= 0.07 && q.h < 0.12 && e > 230 && e < 600 && britain && q.r >= 12) {
          // a short line of grouse butts across the moor
          for (let k = 0; k < 4; k++) put(px + k * 13, py + k * 2.5, 'lf-butt', q.r, 'land');
        } else if (q.h >= 0.12 && q.h < 0.18 && e > 300) put(px, py, h < 0.5 ? 'lf-cairn' : 'lf-fold', q.r, 'land');
        else if (q.h >= 0.18 && q.h < 0.23) put(px, py, 'lf-shepherd', q.r, 'land');
      } else if (lcM.meadow && at(lcM.meadow, px, py)) {
        if (q.h < 0.2) put(px, py, e > 200 ? (h < 0.5 ? 'lf-fold' : 'lf-shepherd') : (h < 0.6 ? 'lf-rick' : 'lf-shepherd'), q.r, 'land');
      } else if (lcM.farm && at(lcM.farm, px, py)) {
        if (q.h < 0.15) put(px, py, h < 0.42 ? 'lf-rick' : h < 0.76 ? 'lf-stooks' : h < 0.88 ? 'lf-scarecrow' : 'lf-beehives', q.r, 'land');
      }
    }
    // reed beds, marsh and salt marsh: reeds; herons and wildfowl at the water's edge
    if (lcM.reed) for (const q of nestedPoints(z, x, y, 24, 10, z + 1, 87)) {
      const [px, py] = toPx(q); if (q.h > 0.62 || !at(lcM.reed, px, py)) continue;
      // salt marsh often lies seaward of the mapped coast: reeds there too, a little thinner, and wildfowl on the pools
      // and further out, where the wetland lies in the sea, the tidal mudflats: short strokes of mud with pools between
      if (at(water, px, py)) {
        if (q.h < 0.04) put(px, py, 'lf-wildfowl', q.r, 'land');
        else if (q.h < 0.6) out.pts.push({ nx: q.nx, ny: q.ny, t: !nearLand(px, py) ? 'lf-mud' + Math.floor(q.h * 4.9) : 'lf-reed' + Math.floor(q.h * 4.9), r: q.r, g: 'land', a: 0 });
        continue;
      }
      if (q.h < 0.03 && nearW(px, py, 8)) { put(px, py, 'lf-heron', q.r, 'land'); continue; }
      out.pts.push({ nx: q.nx, ny: q.ny, t: 'lf-reed' + Math.floor(q.h * 4.8), r: q.r, g: 'land', a: 0 });
    }
    // windmills on flat farmland, and drainage windpumps in the fens and polders
    for (const q of nestedPoints(z, x, y, 230, 9, z + 1, 89)) {
      const [px, py] = toPx(q); if (q.h > 0.32 || at(water, px, py)) continue;
      const e = elev(px, py), wet = lcM.reed && at(lcM.reed, px, py), farm = (lcM.farm && at(lcM.farm, px, py)) || (lcM.meadow && at(lcM.meadow, px, py));
      if ((fens || lowCountries) && e < 6 && (wet || farm)) put(px, py, lowCountries && q.h < 0.2 ? 'li-windmill' : 'lf-windpump', q.r, 'land');
      else if (farm && e < 120 && q.h < 0.14) put(px, py, 'li-windmill', q.r, 'land');
    }
  }
  // ---- 4. field boundaries: hedgerows in the lowlands, drystone walls in the uplands, ditches in the polders
  if (z >= 11 && LC) {
    const sc = 512 / LC.extent, seen = new Set(), haPerPx2 = mPerPx * mPerPx / 1e4;
    const kinds = { h: [], w: [], d: [] };
    for (const span of LC.feats) {
      const F = featureOf(buf, LC, span); if (F.type !== 3) continue;
      const cl = F.props.class, sub = F.props.subclass;
      if (!(cl === 'farmland' || (cl === 'grass' && (sub === 'meadow' || sub === 'grassland')))) continue;
      for (const part of lineParts(buf, F.geom)) {
        if (part.length < 3) continue;
        const ring = part.map(q => [q[0] * sc, q[1] * sc]); ring.push(ring[0]);
        const ha = ringArea(ring) * haPerPx2; if (ha < 0.15 || ha > 45) continue;   // fields, not whole open plains
        const e = elev(Math.max(0, Math.min(511, ring[0][0])), Math.max(0, Math.min(511, ring[0][1])));
        let k = null;
        if (lowCountries && e < 8) k = 'd';
        else if (cLat < 44) k = e > 250 ? 'w' : null;
        else if (cLat > 56.5 && cLon > 4) k = null;
        else if (e >= 230 && (britain || e > 900)) k = 'w';
        else if (e < 600) k = 'h';
        if (!k) continue;
        let cur = null;
        for (let i = 1; i < ring.length; i++) {
          const a = ring[i - 1], b = ring[i];
          const edge = (a[0] < 1 && b[0] < 1) || (a[0] > 511 && b[0] > 511) || (a[1] < 1 && b[1] < 1) || (a[1] > 511 && b[1] > 511);
          const ka = Math.round(a[0] * 2) + ':' + Math.round(a[1] * 2), kb = Math.round(b[0] * 2) + ':' + Math.round(b[1] * 2), key = ka < kb ? ka + '|' + kb : kb + '|' + ka;
          if (edge || seen.has(key)) { cur = null; continue; }
          seen.add(key);
          if (!cur) { cur = [a]; kinds[k].push(cur); }
          cur.push(b);
        }
      }
    }
    for (const k of ['h', 'w', 'd']) if (kinds[k].length) out.lines.push({ k, parts: kinds[k] });
  }
  // ---- 5. travellers on the roads, snapped from the nested grid to the nearest road (so they stay put as you zoom)
  const TR = Ls.transportation;
  if (TR && z >= 9) {
    const sc = 512 / TR.extent, G = 32, grid = new Map(), longs = [];
    for (const span of TR.feats) {
      const F = featureOf(buf, TR, span); if (F.type !== 2) continue;
      const cg = ROADCLS[F.props.class]; if (cg === undefined || F.props.brunnel === 'tunnel') continue;
      if (cg === 4 && !['bridleway', 'path', 'footway'].includes(F.props.subclass)) continue;
      for (const part of lineParts(buf, F.geom)) {
        let len = 0; const pp = part.map(q => [q[0] * sc, q[1] * sc]);
        for (let i = 1; i < pp.length; i++) {
          const a = pp[i - 1], b = pp[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 0.5) continue; len += L;
          const seg = [a[0], a[1], b[0], b[1], cg];
          const i0 = Math.floor(Math.min(a[0], b[0]) / G), i1 = Math.floor(Math.max(a[0], b[0]) / G), j0 = Math.floor(Math.min(a[1], b[1]) / G), j1 = Math.floor(Math.max(a[1], b[1]) / G);
          for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const kk = i + ',' + j; (grid.get(kk) || grid.set(kk, []).get(kk)).push(seg); }
        }
        if (cg <= 1 && len > 140 && z >= 11) longs.push({ pp, len, cg });
      }
    }
    let nTrav = 0;
    for (const q of nestedPoints(z, x, y, 96, 9, z + 1, 91)) {
      if (nTrav >= 36) break;
      const [px, py] = toPx(q), R = Math.min(300, 96 * 0.45 * Math.pow(2, z - q.r));
      let best = null, bd = R * R;
      const gi0 = Math.floor((px - R) / G), gi1 = Math.floor((px + R) / G), gj0 = Math.floor((py - R) / G), gj1 = Math.floor((py + R) / G);
      for (let j = gj0; j <= gj1; j++) for (let i = gi0; i <= gi1; i++) for (const s of grid.get(i + ',' + j) || []) {
        const dx = s[2] - s[0], dy = s[3] - s[1], L2 = dx * dx + dy * dy, t = Math.max(0, Math.min(1, ((px - s[0]) * dx + (py - s[1]) * dy) / L2));
        const cx = s[0] + t * dx, cy = s[1] + t * dy, d2 = (cx - px) * (cx - px) + (cy - py) * (cy - py);
        // prefer the bigger road a little: lanes count as further away
        const w = d2 * (1 + s[4] * 0.35);
        if (w < bd) { bd = w; best = { cx, cy, s }; }
      }
      if (!best) continue;
      const cg = best.s[4];
      if (q.h > ROADKEEP[cg] || q.r < ROADZ[cg] || at(water, best.cx, best.cy)) continue;
      const list = FAM === 'eu' ? ROADFOLK[cg] : FOLK[FAM][cg <= 1 ? 0 : 1];
      let t = list[Math.floor(hash3(Math.round(q.nx * 1e7), Math.round(q.ny * 1e7), 93) * list.length)];
      if (cLat > 50 && cg >= 2 && q.h < 0.04 && (FAM === 'eu' || FAM === 'na')) t = 'lr-sledge';
      const dir = q.h * 1000 % 1 < 0.5 ? 1 : -1, goingLeft = (best.s[2] - best.s[0]) * dir < 0;
      if (put(best.cx, best.cy, goingLeft ? t + '-l' : t, q.r, 'road')) nTrav++;
    }
    // a few moving travellers per tile: the longest main roads, drawn by js/ink-life.js along the line
    longs.sort((a, b) => b.len - a.len);
    for (let i = 0; i < Math.min(2, longs.length); i++) {
      const L = longs[i], hh = hash3(Math.round(L.pp[0][0] * 10), Math.round(L.pp[0][1] * 10), z * 17 + x + y);
      const list = FAM === 'eu' ? ROADFOLK[L.cg] : FOLK[FAM][L.cg <= 1 ? 0 : 1];
      out.tracks.push({ t: list[Math.floor(hh * list.length)], v: Math.round((0.6 + hh * 0.8) * 100) / 100, parts: [L.pp] });
    }
    // little steam trains on the railways, turned along the line (zoom 11 and closer)
    if (z >= 11) {
      let nTrain = 0;
      for (const span of TR.feats) {
        if (nTrain >= 2) break;
        const F = featureOf(buf, TR, span); if (F.type !== 2 || F.props.class !== 'rail' || F.props.brunnel === 'tunnel') continue;
        if (F.props.service || !['rail', 'narrow_gauge', 'preserved'].includes(F.props.subclass)) continue;
        for (const part of lineParts(buf, F.geom)) {
          const pp = part.map(q => [q[0] * sc, q[1] * sc]);
          let len = 0; for (let i = 1; i < pp.length; i++) len += Math.hypot(pp[i][0] - pp[i - 1][0], pp[i][1] - pp[i - 1][1]);
          if (len < 160) continue;
          let goal = len * (0.3 + 0.4 * hash3(Math.round(pp[0][0]), Math.round(pp[0][1]), 97)), acc = 0;
          for (let i = 1; i < pp.length; i++) {
            const a = pp[i - 1], b = pp[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
            if (acc + L >= goal) { const t = (goal - acc) / L, cx = a[0] + (b[0] - a[0]) * t, cy = a[1] + (b[1] - a[1]) * t; const ang = (Math.atan2(b[0] - a[0], -(b[1] - a[1])) * 180 / Math.PI + 360) % 360; if (put(cx, cy, 'lr-train', 11, 'rail', Math.round(ang))) nTrain++; break; }
            acc += L;
          }
          break;
        }
      }
    }
  }
  out.pts.sort((a, b) => a.ny - b.ny);
  return out;
}

// line features (parts in tile pixels, 512 a tile) as a vector tile layer
function encodeLines(name, feats, keys, z, x, y) {
  const ext = 4096, k = ext / 512;
  const L = new Writer();
  L.varint((15 << 3) | 0); L.varint(2);
  L.str(1, name);
  const vals = [], vmap = new Map();
  const vi = v => { let i = vmap.get(v); if (i === undefined) { i = vals.length; vals.push(v); vmap.set(v, i); } return i; };
  for (const f of feats) {
    const F = new Writer(), T2 = new Writer();
    keys.forEach((kk, ki) => { T2.varint(ki); T2.varint(vi(f[kk])); });
    F.bytes(2, T2.a); F.tag(3, 0); F.varint(2);
    const G = new Writer(); let cx = 0, cy = 0;
    for (const part of f.parts) {
      if (part.length < 2) continue;
      const pts = part.map(q => [Math.round(q[0] * k), Math.round(q[1] * k)]);
      G.varint((1 & 7) | (1 << 3)); G.varint(zz(pts[0][0] - cx)); G.varint(zz(pts[0][1] - cy)); cx = pts[0][0]; cy = pts[0][1];
      G.varint((2 & 7) | ((pts.length - 1) << 3));
      for (let i = 1; i < pts.length; i++) { G.varint(zz(pts[i][0] - cx)); G.varint(zz(pts[i][1] - cy)); cx = pts[i][0]; cy = pts[i][1]; }
    }
    F.bytes(4, G.a);
    L.bytes(2, F.a);
  }
  for (const kk of keys) L.str(3, kk);
  for (const v of vals) { const V = new Writer(); if (typeof v === 'string') V.str(1, v); else V.double(3, v); L.bytes(4, V.a); }
  L.tag(5, 0); L.varint(ext);
  return L.a;
}

// ---------------- the deep-winter snow extent (data/biomes_snow.geojson, sent in the config), tested per glyph here once, so the
// style can pick the snowy drawing from a property (sz) instead of a polygon test per feature per layer
let SZE = null;
const SZB = 1024;
function snowBands() {
  if (SZE || !CFG.snowZone) return SZE;
  const g = CFG.snowZone, polys = g.type === 'MultiPolygon' ? g.coordinates : g.type === 'Polygon' ? [g.coordinates] : [];
  SZE = Array.from({ length: SZB }, () => []);
  for (const poly of polys) for (const ring of poly) for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const ax = mercX(ring[j][0]), ay = mercY(ring[j][1]), bx = mercX(ring[i][0]), by = mercY(ring[i][1]);
    if (ay === by) continue;
    const e = [ax, ay, bx, by], b0 = Math.max(0, Math.floor(Math.min(ay, by) * SZB)), b1 = Math.min(SZB - 1, Math.floor(Math.max(ay, by) * SZB));
    for (let b = b0; b <= b1; b++) SZE[b].push(e);
  }
  return SZE;
}
function inSnow(nx, ny) {
  const B = snowBands(); if (!B) return 0;
  const E = B[Math.max(0, Math.min(SZB - 1, Math.floor(ny * SZB)))]; let c = 0;
  for (const [ax, ay, bx, by] of E) if ((ay > ny) !== (by > ny) && nx < ax + (ny - ay) / (by - ay) * (bx - ax)) c ^= 1;
  return c;
}
const tagSnow = pts => { for (const p of pts) p.sz = inSnow(p.nx, p.ny); return pts; };

const ABORT = { aborted: true };
// stage timings (wall time, so stages of tiles built side by side overlap), sent back with each tile when CFG.prof is set (QA)
const PROF = {};
async function buildTile(z, x, y, parentKept, alive) {
  let tm = performance.now();
  const mark = k => { const t = performance.now(); PROF[k] = (PROF[k] || 0) + t - tm; tm = t; };
  // a tile nobody wants any more (the map zoomed or panned on) is given up between stages, so a fast fly-through does
  // not queue up seconds of work for tiles that will never be shown
  const check = () => { if (alive && !alive()) throw ABORT; };
  const T = new Writer();
  // round 4: everything this tile will read over the network is asked for at once, at the start, so the fetches overlap
  // instead of waiting on one another stage by stage (heritage, hills and places grids, the parent tile and wall boxes the
  // town needs); each stage below then finds its data waiting
  const quiet = p => p && p.catch(() => null);
  const herP = quiet(heritagePoints(z, x, y));
  const hillP = z >= 10 ? quiet(hillPoints(z, x, y)) : null, placeP = z >= 10 ? quiet(placePoints(z, x, y)) : null;
  if (z >= 12 && CFG.ofm && z <= CFG.ofmMax) { quiet(fetchOfm(z - 2, x >> 2, y >> 2)); quiet(realWalls()); quiet(houseRegions()); }
  const [relief0, water] = await Promise.all([reliefPoints(z, x, y), z <= CFG.ofmMax && CFG.ofm ? waterMask(z, x, y) : null]);
  mark('relief+water'); check();
  const n = Math.pow(2, z);
  const wetAt = (i, j) => water[Math.max(0, Math.min(MS - 1, j)) * MS + Math.max(0, Math.min(MS - 1, i))] === 1;
  const wet = p => { if (!water || water.none) return false; return wetAt(Math.floor((p.nx * n - x) * MS), Math.floor((p.ny * n - y) * MS)); };
  // relief glyphs also keep clear of the water's edge (2 to 4 screen px), so a speck of an island far out
  // does not carry a lone mountain into an empty ocean
  const ER = z <= 4 ? 2 : 1;
  const nearWet = p => {
    if (!water || water.none) return false;
    const i = Math.floor((p.nx * n - x) * MS), j = Math.floor((p.ny * n - y) * MS);
    for (let dj = -ER; dj <= ER; dj++) for (let di = -ER; di <= ER; di++) if (wetAt(i + di, j + dj)) return true;
    return false;
  };
  const snowf = relief0.filter(p => p.k === 2 && !nearWet(p));
  // the parent tile's mountains: a coarse cell measured again on finer elevation can come out a little differently, so any
  // the parent drew that this tile did not find are carried over as they were (and never dropped), so nothing pops out
  let pk = null;
  if (parentKept && parentKept.length) {
    pk = new Set(); const have = new Set(relief0.map(pid));
    for (const a of parentKept) {
      const [id, nx, ny, r, k, sz, v, e, rl, rg, sn] = a; pk.add(id);
      if (have.has(id) || r > z || nx < x / n || nx >= (x + 1) / n || ny < y / n || ny >= (y + 1) / n) continue;
      relief0.push({ id, nx, ny, r, k, s: sz, v, e, rl, rg, sn, carried: true });
    }
  }
  const relief = inkCap(relief0.filter(p => p.k !== 2 && (p.carried || !nearWet(p))), z, x, y, pk).concat(snowf);
  relief.sort((a, b) => a.ny - b.ny);
  const keptIds = relief.filter(p => p.k !== 2).map(p => [pid(p), p.nx, p.ny, p.r, p.k, p.s, p.v, p.e, p.rl, p.rg, p.sn]);
  let cover = null;
  // ---- biome glyphs: dunes, grass, rainforest, taiga, ice, marsh, tundra
  const BR = await biomeRaster();
  if (BR || (water && water.ice)) {
    const pts = [];
    // a biome glyph keeps clear of every mountain: spatial hash of mountain positions, in tile pixels (512 per tile)
    const hash = new Map(), HC = 24;
    for (const p of relief) { if (p.k !== 0) continue; const key = Math.floor((p.nx * n - x) * 512 / HC) + ',' + Math.floor((p.ny * n - y) * 512 / HC); (hash.get(key) || hash.set(key, []).get(key)).push(p); }
    const nearMtn = p => {
      const tx = (p.nx * n - x) * 512, ty = (p.ny * n - y) * 512, ci = Math.floor(tx / HC), cj = Math.floor(ty / HC);
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) for (const q of hash.get((ci + di) + ',' + (cj + dj)) || []) {
        const dx = (q.nx * n - x) * 512 - tx, dy = (q.ny * n - y) * 512 - ty;
        if (dx * dx + dy * dy < 15 * 15 && dy > -24) return true;
      }
      return false;
    };
    const at = (m, p) => { const i = Math.floor((p.nx * n - x) * MS), j = Math.floor((p.ny * n - y) * MS); return m[Math.max(0, Math.min(MS - 1, j)) * MS + Math.max(0, Math.min(MS - 1, i))] === 1; };
    for (const p of nestedPoints(z, x, y, CFG.CB, 0, z + 1, 41)) {
      let b = 0;
      if (BR) { const bi = Math.min(BR.n - 1, Math.floor(p.nx * BR.n)), bj = Math.min(BR.n - 1, Math.floor(p.ny * BR.n)); b = BR.a[bj * BR.n + bi] >> 2; }
      if (water && water.ice && at(water.ice, p)) b = 5;           // OpenStreetMap glaciers, at any zoom
      else if (water && water.sand && at(water.sand, p)) b = 1;    // and sand, close in
      if (!b || !BIOME[b] || p.h >= BIOME[b].keep) continue;
      if (b !== 5 && z >= 7 && (b === 3 || b === 4)) continue;     // close in, OpenStreetMap's own woods take over
      if (wet(p) || nearWet(p) || nearMtn(p)) continue;
      pts.push({ nx: p.nx, ny: p.ny, r: p.r, b, v: Math.floor(hash3(Math.round(p.nx * 1e7), Math.round(p.ny * 1e7), 9) * 4) });
    }
    pts.sort((a, b) => a.ny - b.ny);
    if (pts.length) T.bytes(3, encodeLayer('biome', tagSnow(pts), ['r', 'b', 'v', 'sz'], z, x, y));
  }
  if (relief.length) T.bytes(3, encodeLayer('relief', tagSnow(relief), ['r', 'k', 's', 'v', 'e', 'rl', 'rg', 'sn', 'sz'], z, x, y));
  mark('cap+biome'); 
  if (z >= 7 && CFG.ofm) {
    const oz = Math.min(z, CFG.ofmMax);
    if (oz === z) {
      const mask = await coverMask(z, x, y);
      cover = mask;
      if (mask) {
        const at = p => { const n = Math.pow(2, z); const i = Math.floor((p.nx * n - x) * MS), j = Math.floor((p.ny * n - y) * MS); return j * MS + i; };
        if (mask.forest || mask.wood) {
          const trees = [];
          // woodland by type: OpenMapTiles carries no leaf type, so the mix of conifers and broadleaves is set by the
          // kind of wood (managed forest or wood), the height of the ground, the latitude and the biome: plantations of
          // conifers on the uplands and in the north, oak, ash and beech woods in the lowlands
          const elev = await elevSampler(z, x, y), BRw = await biomeRaster();
          const tLat = latOfY((y + 0.5) / n);
          // round 4: from zoom 13 a tile takes its trees only down to its own rank (not one finer), so a wooded tile close in
          // carries about 2,600 trees at most rather than 10,000; the style fades the finer ranks in a zoom later
          for (const p of nestedPoints(z, x, y, CFG.CT, 6, z >= 13 ? z : z + 1, 11)) {
            const i = at(p);
            const f = mask.forest && mask.forest[i], w = mask.wood && mask.wood[i];
            if ((!f && !w) || wet(p)) continue;
            const e = elev((p.nx * n - x) * 512, (p.ny * n - y) * 512), bw = biomeAt(BRw, p.nx, p.ny);
            const north = tLat > 56 || bw === 4 || bw === 7, med = tLat < 44;
            const share = f ? (north || e > 250 ? 0.92 : e > 120 ? 0.75 : med ? 0.55 : 0.45)
              : (north ? 0.8 : e > 350 ? 0.5 : e > 180 ? 0.25 : med ? 0.3 : 0.08);
            const con = p.h < share ? 1 : 0;
            trees.push({ nx: p.nx, ny: p.ny, r: p.r, c: con, v: Math.floor(hash3(Math.round(p.nx * 1e7), Math.round(p.ny * 1e7), 5) * 4) });
          }
          trees.sort((a, b) => a.ny - b.ny);
          if (trees.length) T.bytes(3, encodeLayer('trees', tagSnow(trees), ['r', 'c', 'v', 'sz'], z, x, y));
        }
        if (z >= 9 && (mask.wet || mask.heath)) {
          const tufts = [];
          for (const p of nestedPoints(z, x, y, CFG.CU, 8, z >= 13 ? z : z + 1, 23)) {   // capped as the trees are
            const i = at(p);
            const wt = mask.wet && mask.wet[i], ht = mask.heath && mask.heath[i];
            if ((!wt && !ht) || wet(p)) continue;
            tufts.push({ nx: p.nx, ny: p.ny, r: p.r, w: wt ? 1 : 0, v: Math.floor(p.h * 3) });
          }
          if (tufts.length) T.bytes(3, encodeLayer('tufts', tagSnow(tufts), ['r', 'w', 'v', 'sz'], z, x, y));
        }
      }
    }
  }
  mark('cover+trees'); check();
  // beasts of the countryside: a few a tile, in country that suits them, on the same nested grid so they stay put as you zoom
  if (z >= 6 && z <= 14) {
    const BR2 = await biomeRaster(), beasts = [];
    const mtn = relief.filter(p => p.k === 0);
    // eagles only over real mountains: three or more peaks above 600 m close by
    const nearHigh = p => mtn.filter(q => q.e > 600 && Math.abs(q.nx - p.nx) * n * 512 < 50 && Math.abs(q.ny - p.ny) * n * 512 < 50).length >= 3;
    const atc = (m, p) => m && m[Math.max(0, Math.min(MS - 1, Math.floor((p.ny * n - y) * MS))) * MS + Math.max(0, Math.min(MS - 1, Math.floor((p.nx * n - x) * MS)))] === 1;
    const pick = (h, arr) => arr[Math.min(arr.length - 1, Math.floor(h * arr.length))];
    for (const p of nestedPoints(z, x, y, 150, 6, z + 1, 61)) {
      if (p.h >= 0.3) continue;
      const h2 = hash3(Math.round(p.nx * 1e7), Math.round(p.ny * 1e7), 63);
      const b = biomeAt(BR2, p.nx, p.ny);
      let a = null;
      const hab = cover ? (atc(cover.forest, p) || atc(cover.wood, p) ? 'wood' : atc(cover.heath, p) ? 'heath' : atc(cover.farm, p) ? 'farm' : atc(cover.meadow, p) ? 'meadow' : null) : null;
      if (wet(p)) { if (z >= 8 && p.h < 0.05) a = 'fish'; }
      else if (z >= 8 && nearWet(p) && p.h < 0.12) a = 'heron';
      else if (hab === 'wood') a = b === 4 ? pick(h2, ['bear', 'wolf', 'reindeer', 'deer']) : pick(h2, ['deer', 'deer', 'boar']);
      else if (hab === 'heath') a = 'sheep';
      else if (hab === 'farm') a = pick(h2, ['cow', 'cow', 'sheep']);
      else if (hab === 'meadow') a = pick(h2, ['sheep', 'cow']);
      else if (p.h < 0.1 && nearHigh(p)) a = 'eagle';
      else if (!cover && z < 7 && b === 4) a = pick(h2, ['bear', 'wolf', 'reindeer', 'moose']);
      if (a) beasts.push({ nx: p.nx, ny: p.ny, r: p.r, a });
    }
    beasts.sort((p, q) => p.r - q.r);
    const kept = beasts.slice(0, 6);
    if (kept.length) T.bytes(3, encodeLayer('beasts', kept, ['r', 'a'], z, x, y));
  }
  mark('beasts'); check();
  // heritage drawings and, close in, the drawn towns
  const her = (await herP) || [];
  if (her.length) T.bytes(3, encodeLayer('heritage', her, ['i', 'z', 'n', 'q', 'l', 'w'], z, x, y));
  mark('heritage');
  if (z >= 10) {
    const hills = (await hillP) || [];
    if (hills.length) T.bytes(3, encodeLayer('hills', hills, ['z', 'e', 'n'], z, x, y));
    const xp = (await placeP) || [];
    if (xp.length) T.bytes(3, encodeLayer('xplaces', xp, ['z', 'k', 'n', 'w'], z, x, y));
  }
  mark('hills+places'); check();
  if (z >= 12) {
    const town = await townPoints(z, x, y, her);
    town.sort((a, b) => a.ny - b.ny);
    if (town.length) T.bytes(3, encodeLayer('town', tagSnow(town), ['t', 'a', 'o', 'sz'], z, x, y));
  }
  mark('town'); check();
  // countryside and town life (js/ink-life.js draws it): fields, hedges and walls, moors, fens, industry, the modern
  // world turned medieval, and travellers on the roads
  if (z >= 9 && z <= CFG.ofmMax && CFG.ofm && CFG.life !== false) {
    try {
      const L = await lifeTile(z, x, y, cover, her);
      if (L.pts.length) T.bytes(3, encodeLayer('life', tagSnow(L.pts), ['t', 'r', 'g', 'a', 'sz'], z, x, y));
      const tsz = inSnow((x + 0.5) / Math.pow(2, z), (y + 0.5) / Math.pow(2, z));   // hedgerows: snowy or not by the tile's centre
      for (const f of L.lines) f.sz = tsz;
      if (L.lines.length) T.bytes(3, encodeLines('lifeline', L.lines, ['k', 'sz'], z, x, y));
      if (L.tracks.length) T.bytes(3, encodeLines('lifetrack', L.tracks, ['t', 'v'], z, x, y));
    } catch (e) { /* life is decoration: never fail a tile over it */ }
  }
  mark('life');
  return { buf: new Uint8Array(T.a).buffer, kept: keptIds };
}
// finished tiles, kept a while: zooming back out and in again, or panning back, costs nothing
const tileCache = new Map();

const live = new Map();       // request id -> tile key
const inflight = new Map();   // tile key -> the build under way (two requests for one tile share it)
const wanted = key => { for (const k of live.values()) if (k === key) return true; return false; };
self.onmessage = async (ev) => {
  const m = ev.data;
  if (m.config) { Object.assign(CFG, m.config); return; }
  if (m.cancel) { live.delete(m.cancel); return; }
  const key = m.z + '/' + m.x + '/' + m.y;
  live.set(m.id, key);
  try {
    const t0 = performance.now();
    let res = tileCache.get(key);
    if (res) { tileCache.delete(key); tileCache.set(key, res); }   // most recently used last
    else {
      let job = inflight.get(key);
      if (!job) {
        job = buildTile(m.z, m.x, m.y, m.parentKept, () => wanted(key));
        inflight.set(key, job);
        job.then(r => { tileCache.set(key, r); if (tileCache.size > 160) tileCache.delete(tileCache.keys().next().value); }, () => {}).finally(() => inflight.delete(key));
      }
      res = await job;
    }
    if (!live.has(m.id)) return;
    live.delete(m.id);
    const buf = res.buf.slice(0);
    self.postMessage({ id: m.id, buf, kept: res.kept, ms: performance.now() - t0, prof: CFG.prof ? PROF : undefined }, [buf]);
  } catch (e) {
    const was = live.delete(m.id);
    if (e === ABORT) { if (was) self.postMessage({ id: m.id, err: 'aborted' }); return; }
    self.postMessage({ id: m.id, err: String(e && e.stack || e) });
  }
};
