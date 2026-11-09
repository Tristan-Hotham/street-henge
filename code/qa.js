// QA: serve the folder, open index.html at desktop and phone widths, log console errors and save screenshots to qa/.
// Usage: node code/qa.js [maplibre dist dir]. External: OpenFreeMap tiles live; the elevation tiles are replaced by a flat
// tile (QA only), Google Fonts are skipped.
const fs = require('fs'), path = require('path'), http = require('http');
const { chromium } = require(process.env.PW || 'playwright');
const ROOT = path.resolve(__dirname, '..'), ML = process.argv[2] || '/tmp/ml/node_modules/maplibre-gl/dist';
const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.pbf': 'application/x-protobuf', '.geojson': 'application/json', '.css': 'text/css', '.jpg': 'image/jpeg' };
const srv = http.createServer((q, s) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, b) => { if (e) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); s.end(b); }); }).listen(8799);
// a flat terrarium tile (sea level is 32768 -> r=128,g=0,b=0)
const { PNG } = (() => { try { return require('pngjs'); } catch (e) { return {}; } })();
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const flat = fs.readFileSync(path.join(__dirname, 'qa_flat.png'));
  const shots = [
    { out: 'qa/desktop.png', w: 1280, h: 800 },
    { out: 'qa/desktop_glasgow.png', w: 1280, h: 800, eval: "window.__town(2)", wait: 6000 },
    { out: 'qa/desktop_mk_midsummer.png', w: 1280, h: 800, eval: "(()=>{window.__town(21);setTimeout(()=>{document.querySelector('[data-d=\"144\"]')||0;const r=document.getElementById('day');r.value=144;r.dispatchEvent(new Event('input'));},2500);})()", wait: 7000 },
    { out: 'qa/desktop_street.png', w: 1280, h: 800, at: '50.9049,-1.3389,15', eval: "(()=>{const m=window.__map;const f=m.queryRenderedFeatures({layers:['hsol']});if(f.length)m.fire('click',{point:m.project(f[0].geometry.coordinates[0]),lngLat:{lng:f[0].geometry.coordinates[0][0],lat:f[0].geometry.coordinates[0][1]},features:f});})()" },
    { out: 'qa/desktop_layers.png', w: 1280, h: 800, eval: "document.getElementById('lyrBtn').click()" },
    { out: 'qa/phone.png', w: 390, h: 800, dpr: 2 },
    { out: 'qa/phone_town.png', w: 390, h: 800, dpr: 2, eval: "window.__town(343)", wait: 6000 },
    { out: 'qa/phone_layers.png', w: 390, h: 800, dpr: 2, eval: "document.getElementById('lyrBtn').click()" },
    { out: 'qa/phone_full.png', w: 390, h: 800, dpr: 1, full: true },
    { out: 'qa/dark.png', w: 1280, h: 800, scheme: 'dark', full: true },
  ];
  const errors = [];
  for (const s of shots) {
    const ctx = await browser.newContext({ viewport: { width: s.w, height: s.h }, deviceScaleFactor: s.dpr || 1, colorScheme: s.scheme || 'light' });
    const page = await ctx.newPage();
    await page.route(/cdn\.jsdelivr\.net\/npm\/maplibre-gl@4\.7\.1\/dist\/(.*)/, r => { const f = path.join(ML, r.request().url().split('/dist/')[1]); r.fulfill({ body: fs.readFileSync(f), contentType: f.endsWith('.css') ? 'text/css' : 'application/javascript' }); });
    await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
    await page.route(/maps\.tristanhotham\.com\/assets/, r => r.fulfill({ body: '', contentType: 'application/javascript' }));
    await page.route(/elevation-tiles-prod/, r => r.fulfill({ body: flat, contentType: 'image/png' }));
    page.on('console', m => { if (m.type() === 'error') errors.push(`[${s.out}] ${m.text().slice(0, 300)}`); });
    page.on('pageerror', e => errors.push(`[${s.out}] pageerror ${e.message}`));
    page.on('requestfailed', q => errors.push(`[${s.out}] failed ${q.url().slice(0, 120)}`));
    await page.goto('http://localhost:8799/index.html' + (s.at ? '?at=' + s.at : ''), { waitUntil: 'load' });
    await page.waitForFunction(() => window.__map && window.__map.getLayer('hst'), null, { timeout: 120000 });
    await page.evaluate(() => new Promise(res => { const m = window.__map; m.once('idle', () => setTimeout(res, 1200)); setTimeout(res, 40000); }));
    if (s.eval) { await page.evaluate(s.eval); await page.waitForTimeout(s.wait || 2500); }
    await page.screenshot({ path: path.join(ROOT, s.out), fullPage: !!s.full, timeout: 120000 });
    console.log('ok', s.out);
    await ctx.close();
  }
  await browser.close(); srv.close();
  console.log('ERRORS:', errors.length); errors.forEach(e => console.log(e));
  process.exit(0);
})();
