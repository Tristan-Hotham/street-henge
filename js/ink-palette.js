/* The Inked World: one palette and one line-weight system for every drawing on the map.
 * Load before js/ink-icons.js and js/ink-map.js (and any other sprite file: js/ink-life-art.js, js/ink-folk-art.js).
 *
 * Colours
 *   ink      the pen: a warm brown-black iron-gall ink. inkSoft for hatching and secondary strokes.
 *   paper    the parchment ground; paperDeep for sand and shaded paper; paperFill is the near-opaque paper used to
 *            "knock out" what lies behind a glyph (a mountain hides the peaks behind it).
 *   red      vermilion lettering and accents (names, flags); redDeep for capitals and hamlets.
 *   blue     water lines and water names; blueSoft and wash for the sea; seaWash, a paler greyer blue, is the watercolour
 *            laid over the whole ocean (the paper grain shows through it); ice for frozen water.
 *   pigments the watercolour tints laid on sprites (roofs, banners, beasts): madder, ochre, woad, sage, verdigris, umber,
 *            as on a hand-coloured sixteenth-century plan. Keep them muted: they must never fight the ink.
 *   snow     snow white and its cool shadow, for the deep-winter look.
 * Line weights (in sprite pixels, sprites are drawn at SCALE x their map size and registered with pixelRatio SCALE)
 *   outline  the silhouette of a glyph; detail for inner lines; hatch for shading; hair for the finest lines.
 * Every sprite file should take its colours and weights from here, so a change of palette reaches every drawing.
 * Dr Tristan Hotham, Independent researcher, 2026. MIT licence. */
(function (global) {
  'use strict';
  const P = {
    ink: '#2B2119', inkSoft: 'rgba(43,33,25,0.55)', inkHatch: 'rgba(43,33,25,0.72)', inkFaint: 'rgba(43,33,25,0.32)',
    paper: '#F3E5BF', paperDeep: '#E7D2A0', paperFill: 'rgba(243,229,191,0.97)', paperLight: '#FBF3DC', halo: 'rgba(243,229,191,0.92)',
    red: '#A3261B', redDeep: '#8A1F16', blue: '#3D6E9E', blueSoft: '#6F9DC6', wash: '#7FA9CF', seaWash: '#6C9FD6', ice: '#DCE8F0', iceLine: '#8FB0CC',
    pigments: {
      madder: '#B4472E', madderDeep: '#8C2E1E', ochre: '#C9A24A', ochreDeep: '#9C7A2E', woad: '#66809C', woadDeep: '#475E78',
      sage: '#9DAF7A', sageDeep: '#6E8250', verdigris: '#7FA593', umber: '#8A6A4E', umberDeep: '#664C36', wool: '#E9DDBF',
      gold: '#C9A24A', leaf: '#B9C98F', leafDeep: '#7E9658', pine: '#6F8A68', pineDeep: '#4E6A4C',
    },
    snow: '#FBFAF4', snowShade: '#D6E0E6', snowLine: '#9DB4C8',
    // watercolour wash colours by land type (kept in step with code/02i_tints.py, which bakes the world tint)
    tints: {
      rainforest: '#68925C', dryForest: '#96A062', temperate: '#98B276', conifer: '#809E74', taiga: '#7E9680',
      savanna: '#D6BE70', steppe: '#B4B880', marsh: '#96B6A0', montane: '#ACAC84', tundra: '#AAB8C0', mediterranean: '#B0AA68',
      desert: '#DCBA78', sand: '#E2B468', mangrove: '#709C80', ice: '#F6F6F0', farm: '#D6B36A', meadow: '#A9B672',
    },
  };
  const LINE = { outline: 2.6, detail: 1.3, hatch: 0.95, hair: 0.6 };
  // sprites are drawn at three times their size on the map and registered with pixelRatio 3, so they stay crisp on
  // 2x and 3x screens (a sprite never needs to be larger than its map size times the screen's pixel ratio)
  const SCALE = 3;
  // the deep-winter look is the default; js/ink-map.js reads and sets this through InkMap.setWinter
  let winter = true;
  try { const v = global.localStorage && global.localStorage.getItem('ink-winter'); if (v === '0') winter = false; } catch (e) {}
  global.InkPalette = Object.assign(P, {
    LINE, SCALE,
    get winter() { return winter; },
    setWinter(on) { winter = !!on; try { global.localStorage && global.localStorage.setItem('ink-winter', winter ? '1' : '0'); } catch (e) {} },
    // rgba() of a hex colour
    rgba(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; },
  });
  // ---- the one wind every drawing shares (the chimney smoke leans with it, the traveller's sails feel it, the wind-heads
  // blow it). Its direction is the prevailing wind of the 5 degree square from the CLIWOC ship logbooks of 1750 to 1854
  // (data/sea/wind.json, given by js/ink-sea.js once it loads; December to February or June to August by today's date),
  // or the planet's wind belts until then and where the logbooks are silent, veering slowly with the clock.
  const WB = { grid: null };
  function belt(lat) {   // trade winds, westerlies and polar easterlies (direction the wind blows from, degrees)
    const a = Math.abs(lat);
    if (a < 30) return lat >= 0 ? 50 : 130;
    if (a < 62) return lat >= 0 ? 250 : 290;
    return lat >= 0 ? 80 : 100;
  }
  global.InkWind = {
    setGrid(j) {
      const m = new Date().getMonth(), key = (m === 11 || m < 2) ? 'djf' : (m >= 5 && m <= 7) ? 'jja' : 'all';
      const g = new Map(), put = rows => { for (const r of rows || []) g.set(r[0] + ',' + r[1], [r[2], r[3]]); };
      put(j.all); if (key !== 'all') put(j[key]);
      WB.grid = g;
    },
    // { from: degrees the wind blows from, to: [east, north] unit vector it blows towards, k: strength 0.5 to 1 }
    at(lng, lat, now) {
      let from = null, steady = 0.5;
      if (WB.grid) {
        const cx = Math.floor(lng / 5) * 5 + 2.5, cy = Math.floor(lat / 5) * 5 + 2.5;
        for (let r = 0; r <= 2 && from === null; r++) for (let dx = -r; dx <= r && from === null; dx++) for (let dy = -r; dy <= r; dy++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const v = WB.grid.get((cx + dx * 5) + ',' + (cy + dy * 5)); if (v) { from = v[0]; steady = v[1]; break; }
        }
      }
      if (from === null) from = belt(lat);
      const t = (now || Date.now()) / 1000;
      // it veers and backs a little over minutes, more where the logbooks found it unsteady
      from = (from + (12 + 22 * (1 - steady)) * Math.sin(t / 410 + lat * 0.05) + 8 * Math.sin(t / 1130 + lng * 0.03) + 360) % 360;
      const r = (from + 180) * Math.PI / 180;
      return { from, to: [Math.sin(r), Math.cos(r)], k: 0.75 + 0.25 * Math.sin(t / 95 + lng * 0.1) };
    },
    name(from) { return ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'][Math.round(((from % 360) + 360) % 360 / 45) % 8]; },
  };
})(window);
