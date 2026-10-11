/* Automatische Tests für Streifzug: startet einen kleinen Server für ./public, klickt alle Bedienelemente durch
   und prüft Kernabläufe. Aufruf: cd tests && npm install && npx playwright install chromium && npm test
   Optional: CHROME_PATH=/pfad/zu/chrome für einen vorhandenen Browser. */
import { chromium } from 'playwright';
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)), root = join(here, '..', 'public'), fixtures = ['foto1.jpg', 'foto2.jpg', 'foto3.jpg'].map(f => join(here, 'fixtures', f));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.wasm': 'application/wasm', '.tflite': 'application/octet-stream' };
const server = http.createServer(async (req, res) => {
  try { let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html'; const f = join(root, p); if (!f.startsWith(root)) throw 0; await stat(f);
    res.writeHead(200, { 'content-type': TYPES[extname(f)] || 'application/octet-stream' }); res.end(await readFile(f)); }
  catch { res.writeHead(404); res.end(); }
});
await new Promise(r => server.listen(0, r)); const BASE = `http://localhost:${server.address().port}/`;
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const failures = []; let total = 0;
const check = (ok, msg) => { if (!ok) failures.push(msg); console.log((ok ? '  ✓ ' : '  ✗ ') + msg); };

async function newPage(q = '', opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, ...opts }), p = await ctx.newPage(), errs = [];
  p.on('pageerror', e => errs.push(e.message + ' ' + (e.stack || '').split('\n')[1]));
  p.on('console', m => { if (m.type() === 'error' && !/favicon|XNNPACK|INFO|Failed to load resource/.test(m.text())) errs.push('console ' + m.text()); });
  await p.addInitScript(() => localStorage.setItem('streifzug.welcomed', 'true'));
  await p.goto(BASE + q); await p.waitForFunction(() => window.__streifzug && window.__streifzug.state.layers.length > 0, null, { timeout: 15000 });
  return { p, errs, ctx, Z: (f, a) => p.evaluate(f, a) };
}

/* 1. Rundgang: jeder Knopf in jedem Panel */
async function crawl() {
  console.log('Rundgang durch alle Panels');
  const { p, errs, Z } = await newPage(); let label = '';
  await p.setInputFiles('#fileIn', fixtures); await p.waitForFunction(() => window.__streifzug.state.layers.filter(l => l.srcId).length === 3, null, { timeout: 20000 }); await p.waitForTimeout(800);
  const SKIP = /^(autoCut|skinDetect|goCut|clear|sample|projects|help|replace|exportPresets|clearPresets|del|cutCopy|bgBlur|tplRelease|pasteAny|brandLogoUse|brandLogoDel)$/;
  const clickAll = async (lab, setup) => {
    await setup(); const n = await Z(() => document.querySelectorAll('#panel button').length); let c = 0;
    for (let i = 0; i < Math.min(n, 90); i++) {
      await setup();
      const info = await Z(i => { const b = document.querySelectorAll('#panel button')[i]; return b ? { act: b.dataset.act2 || '', d: JSON.stringify(b.dataset).slice(0, 60), dis: b.disabled } : null; }, i);
      if (!info || info.dis || SKIP.test(info.act) || /addshape|emoji|addtext|tpl"|pick|goslide|lvis|llock|lup|ldown|aimask/.test(info.d)) continue;
      label = lab + ' ' + info.d; await Z(i => document.querySelectorAll('#panel button')[i].click(), i); await p.waitForTimeout(15); c++;
    }
    total += c; const errN = errs.length; if (errN) { console.log('    Fehler bei', label, errs.at(-1)); }
  };
  for (const t of ['canvas', 'vorlagen', 'ebenen', 'element']) await clickAll('none/' + t, () => Z(t => { const Z = window.__streifzug; Z.ui.tab.none = t; Z.selectLayer(null); }, t));
  await Z(() => { const Z = window.__streifzug; Z.applyTemplate('pinned', 0); Z.commit(); });
  await clickAll('vorlage', () => Z(() => { const Z = window.__streifzug; Z.ui.tab.none = 'vorlagen'; Z.ui.tplStyleOpen = true; Z.selectLayer(null); }));
  const id = await Z(() => window.__streifzug.state.layers.find(l => l.type === 'image' && l.srcId).id);
  for (const s of ['rahmen', 'looks', 'anpassen', 'licht', 'kurve', 'farbe', 'grading', 'effekte', 'kreativ', 'details', 'stempel', 'entfernen', 'freistellen', 'hintergrund', 'gesicht', 'selektiv', 'pinsel', 'reparieren', 'klonen', 'fokus', 'zuschnitt', 'ebene'])
    await clickAll('foto/' + s, () => Z(([s, id]) => { const Z = window.__streifzug; Z.ui.tab.image = s; Z.selectLayer(id); }, [s, id]));
  await Z(() => window.__streifzug.selectLayer(null)); await p.click('[data-tab="addText"]'); await p.waitForTimeout(200);
  const tid = await Z(() => window.__streifzug.ui.sel);
  for (const s of ['text', 'stil', 'ebene']) await clickAll('text/' + s, () => Z(([s, id]) => { const Z = window.__streifzug; Z.ui.tab.text = s; Z.selectLayer(id); }, [s, tid]));
  for (const k of ['rect', 'tape', 'clip', 'dHeart', 'qr', 'chart']) {
    await Z(() => { window.__streifzug.ui.tab.none = 'element'; window.__streifzug.selectLayer(null); }); await Z(k => document.querySelector(`[data-addshape="${k}"]`).click(), k); await p.waitForTimeout(100);
    const sid = await Z(() => window.__streifzug.ui.sel);
    for (const s of ['form', 'ebene']) await clickAll('form/' + k + '/' + s, () => Z(([s, id]) => { const Z = window.__streifzug; Z.ui.tab.shape = s; Z.selectLayer(id); }, [s, sid]));
  }
  label = 'vorschau'; await Z(() => window.__streifzug.selectLayer(null)); await p.click('#previewBtn'); await p.waitForTimeout(400); await p.click('#closePreview');
  label = 'export'; await p.click('#exportBtn'); await p.waitForFunction(() => document.querySelectorAll('#expGrid img').length > 0, null, { timeout: 30000 }).catch(() => {});
  const n = await Z(() => document.querySelectorAll('#expGrid img').length); check(n > 0, `Export erzeugt Bilder (${n})`);
  await p.click('#closeExport').catch(() => {});
  check(errs.length === 0, `Rundgang ohne Fehler (${total} Klicks)${errs.length ? ': ' + errs.slice(0, 5).join(' | ') : ''}`);
  await p.close();
}

/* 2. Hintergrund-Rechner liefert dasselbe Bild wie die Berechnung im Hauptfenster */
async function workerSame() {
  console.log('Hintergrund-Rechner');
  const shot = async q => { const { p, Z } = await newPage(q);
    await Z(() => { const Z = window.__streifzug, l = Z.state.layers.find(x => x.srcId); Object.assign(l.params, { look: 'velvia', grain: 30, vignette: 40, stamp: true }); Z.commit(); });
    await p.waitForTimeout(2500); const d = await Z(() => { const c = document.createElement('canvas'), Z = window.__streifzug; c.width = 240; c.height = 100; const x = c.getContext('2d'), s = Z.snapshot(100), im = new Image(); return new Promise(r => { im.onload = () => { x.drawImage(im, 0, 0, 240, 100); r(Array.from(x.getImageData(0, 0, 240, 100).data)); }; im.src = s; }); });
    await p.close(); return d; };
  const a = await shot(''), b = await shot('?noworker'); let diff = 0; for (let i = 0; i < a.length; i++) diff += Math.abs(a[i] - b[i]); diff /= a.length;
  check(diff < 2, `gleiches Ergebnis mit und ohne Worker (Abweichung ${diff.toFixed(2)})`);
}

/* 3. Einfügen über das Menü (Text aus der Zwischenablage) */
async function paste() {
  console.log('Einfügen');
  const { p, Z, errs } = await newPage('', { permissions: ['clipboard-read', 'clipboard-write'] });
  const n0 = await Z(() => window.__streifzug.state.layers.length);
  await Z(() => navigator.clipboard.writeText('Hallo Test'));
  await p.mouse.click(20, 140, { button: 'right' }); await p.waitForTimeout(300); await p.click('.ctx-item:has-text("Einfügen")'); await p.waitForTimeout(500);
  check(await Z(() => window.__streifzug.state.layers.length) === n0 + 1, 'Text über das Menü eingefügt');
  check(!errs.length, 'ohne Fehler'); await p.close();
}

/* 4. Werkzeugsuche */
async function search() {
  console.log('Werkzeugsuche');
  const { p, Z } = await newPage();
  await p.click('#panelHead [data-act="search"]'); await p.keyboard.type('himmel'); await p.keyboard.press('Enter'); await p.waitForTimeout(300);
  check(await Z(() => window.__streifzug.ui.tab.image) === 'selektiv', '„himmel“ führt zur Auswahl'); await p.close();
}

try { await crawl(); await workerSame(); await paste(); await search(); }
catch (e) { failures.push('Abbruch: ' + e.message); console.error(e); }
await browser.close(); server.close();
console.log(failures.length ? `\n${failures.length} Problem(e):\n- ` + failures.join('\n- ') : '\nAlle Tests bestanden.');
process.exit(failures.length ? 1 : 0);
