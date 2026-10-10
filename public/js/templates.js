/* Vorlagen: ordnen vorhandene Fotos über alle Slides an */
import { state, dims, clone, newId, toast } from './core.js';
import { coverAll, fitRect, newTextLayer, newShapeLayer } from './layers.js';

export const TEMPLATES = [
  ['pano', 'Panorama', 'Erstes Foto läuft über alle Slides, weitere als Karten darauf.'],
  ['panoRand', 'Panorama mit Rand', 'Ein durchgehendes Foto mit weißem Rahmen um alles.'],
  ['single', 'Ein Foto pro Slide', 'Jede Slide randlos gefüllt.'],
  ['frame', 'Galerie-Rand', 'Fotos mit Luft auf hellem Grund.'],
  ['seam', 'Über die Naht', 'Fotos sitzen auf den Übergängen.'],
  ['offset', 'Versetzt', 'Jede Slide zeigt zwei halbe Fotos – erst beim Wischen ganz.'],
  ['grid2', 'Raster 2×2', 'Vier Fotos pro Slide mit schmaler Fuge.'],
  ['duo', 'Zwei pro Slide', 'Zwei Fotos übereinander.'],
  ['strips', 'Streifen', 'Drei hohe Streifen pro Slide.'],
  ['mosaic', 'Mosaik', 'Unregelmäßiges Raster über das ganze Karussell.'],
  ['bigsmall', 'Groß & klein', 'Ein großes Foto über zwei Slides, dann Einzelbilder.'],
  ['stairs', 'Treppe', 'Fotos laufen schräg durchs Karussell.'],
  ['zigzag', 'Zickzack', 'Abwechselnd oben und unten, über die Nähte.'],
  ['circles', 'Kreise', 'Runde Ausschnitte mit Rand, über die Nähte verteilt.'],
  ['polaroid', 'Sofortbilder', 'Verstreute Abzüge mit weißem Rand.'],
  ['scrapbook', 'Album', 'Sofortbilder mit Klebeband und Handschrift auf Papier.'],
  ['film', 'Filmstreifen', 'Ein durchgehender Kleinbildstreifen.'],
  ['cover', 'Titel + Galerie', 'Titelseite mit Bogenfoto, dann die Galerie.'],
  ['magazine', 'Magazin', 'Großes Foto mit Schlagzeile, dann Seiten mit Rand.']
];

export function miniSVG(kind) {
  const r = (x, y, w, h, f, extra = '') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${f}" ${extra}/>`;
  const ph = 'var(--muted)', fr = 'var(--fg)', ac = 'var(--accent)';
  let s = r(0, 0, 120, 50, 'var(--line)');
  switch (kind) {
    case 'pano': s += r(0, 0, 120, 50, ph) + r(48, 14, 22, 26, fr) + r(50, 16, 18, 18, ac); break;
    case 'panoRand': s = r(0, 0, 120, 50, fr) + r(4, 4, 112, 42, ph); break;
    case 'single': s += r(1, 1, 38, 48, ph) + r(41, 1, 38, 48, ac) + r(81, 1, 38, 48, ph); break;
    case 'frame': s = r(0, 0, 120, 50, fr) + r(5, 6, 30, 38, ph) + r(45, 6, 30, 38, ac) + r(85, 6, 30, 38, ph); break;
    case 'seam': s += `<g transform="rotate(-4 40 25)">${r(26, 8, 28, 34, ph)}</g><g transform="rotate(4 80 25)">${r(66, 8, 28, 34, ac)}</g>`; break;
    case 'offset': s += r(0, 0, 20, 50, ph) + r(21, 0, 39, 50, ac) + r(61, 0, 39, 50, ph) + r(101, 0, 19, 50, ac); break;
    case 'grid2': for (let i = 0; i < 3; i++) for (let k = 0; k < 4; k++) s += r(i * 40 + 2 + (k % 2) * 18, 2 + (k >> 1) * 24, 16, 22, (i + k) % 3 ? ph : ac); break;
    case 'duo': for (let i = 0; i < 3; i++) s += r(i * 40 + 3, 3, 34, 21, ph) + r(i * 40 + 3, 26, 34, 21, i % 2 ? ac : ph); break;
    case 'strips': for (let i = 0; i < 9; i++) s += r(i * 13.3 + 2, 3, 11, 44, i % 4 ? ph : ac); break;
    case 'mosaic': s += r(2, 2, 26, 46, ph) + r(30, 2, 28, 22, ac) + r(30, 26, 28, 22, ph) + r(60, 2, 26, 46, ph) + r(88, 2, 30, 18, ph) + r(88, 22, 30, 26, ac); break;
    case 'bigsmall': s += r(0, 0, 80, 50, ph) + r(86, 6, 28, 38, ac); break;
    case 'stairs': s += r(6, 4, 26, 20, ph) + r(36, 13, 26, 20, ac) + r(66, 22, 26, 20, ph) + r(92, 28, 24, 18, ph); break;
    case 'zigzag': s += r(6, 4, 26, 22, ph) + r(28, 24, 26, 22, ac) + r(52, 4, 26, 22, ph) + r(74, 24, 26, 22, ph); break;
    case 'circles': s += `<circle cx="18" cy="21" r="13" fill="${ph}" stroke="${fr}" stroke-width="2"/><circle cx="46" cy="30" r="13" fill="${ac}" stroke="${fr}" stroke-width="2"/><circle cx="74" cy="20" r="13" fill="${ph}" stroke="${fr}" stroke-width="2"/><circle cx="102" cy="30" r="13" fill="${ph}" stroke="${fr}" stroke-width="2"/>`; break;
    case 'polaroid': s += `<g transform="rotate(-8 22 24)">${r(10, 8, 24, 30, fr)}${r(12, 10, 20, 20, ph)}</g><g transform="rotate(6 60 26)">${r(48, 10, 24, 30, fr)}${r(50, 12, 20, 20, ac)}</g><g transform="rotate(-3 98 24)">${r(86, 8, 24, 30, fr)}${r(88, 10, 20, 20, ph)}</g>`; break;
    case 'scrapbook': s = r(0, 0, 120, 50, '#d9cdb5') + `<g transform="rotate(-6 30 25)">${r(16, 8, 26, 32, fr)}${r(18, 10, 22, 22, ph)}${r(24, 6, 12, 5, '#f3e2b3', 'opacity=".9"')}</g><g transform="rotate(5 82 25)">${r(66, 8, 30, 34, fr)}${r(68, 10, 26, 24, ac)}${r(75, 6, 12, 5, '#f3e2b3', 'opacity=".9"')}</g>`; break;
    case 'film': s = r(0, 0, 120, 50, 'var(--line)') + r(0, 10, 120, 30, '#111'); for (let i = 0; i < 4; i++) s += r(i * 31 + 4, 15, 26, 20, i === 1 ? ac : ph); for (let i = 0; i < 20; i++) s += r(i * 6 + 1, 11, 3, 2, 'var(--line)') + r(i * 6 + 1, 37, 3, 2, 'var(--line)'); break;
    case 'cover': s = r(0, 0, 120, 50, fr) + `<path d="M8 46V22a12 12 0 0 1 24 0v24z" fill="${ac}"/>` + r(4, 4, 20, 4, 'var(--bg)') + r(44, 5, 32, 40, ph) + r(84, 5, 32, 40, ph); break;
    case 'magazine': s += r(0, 0, 80, 50, ph) + r(6, 6, 50, 7, fr) + r(6, 15, 30, 3, fr) + r(84, 0, 36, 50, fr) + r(88, 6, 28, 34, ac); break;
  }
  s += `<line x1="40" y1="0" x2="40" y2="50" stroke="var(--bg)" stroke-dasharray="2 2"/><line x1="80" y1="0" x2="80" y2="50" stroke="var(--bg)" stroke-dasharray="2 2"/>`;
  return `<svg viewBox="0 0 120 50" aria-hidden="true">${s}</svg>`;
}

const reset = l => { l.rot = 0; l.shape = 'rect'; l.border = 0; l.shadow = false; l.opacity = 1; l.blend = 'source-over'; l.radius = 7; l.crop.zoom = 1; l.crop.px = l.crop.py = .5; };

/* wie viele Slides braucht eine Vorlage, damit alle Fotos Platz haben */
const SLIDES_FOR = { single: k => k, frame: k => k, cover: k => k, magazine: k => k, bigsmall: k => k, seam: k => k + 1, offset: k => k - 1, stairs: k => k - 1, circles: k => k - 1,
  zigzag: k => Math.ceil((k + 1) / 2), polaroid: k => Math.ceil(k / 2), duo: k => Math.ceil(k / 2), scrapbook: k => Math.ceil(k / 1.5), grid2: k => Math.ceil(k / 4), strips: k => Math.ceil(k / 3),
  mosaic: k => Math.ceil(k / 3), film: k => Math.ceil((k - 1) / 1.65) };

export function applyTemplate(kind) {
  // Wiederholungen aus einer früheren Vorlage zählen nicht als eigene Fotos
  const imgs = state.layers.filter(l => l.type === 'image' && !l.tpl);
  const others = state.layers.filter(l => l.type !== 'image' && !l.tpl);
  if (!imgs.length) { toast('Füge zuerst ein Foto hinzu.'); return false; }
  const before = state.slides;
  if (SLIDES_FOR[kind]) state.slides = Math.min(20, Math.max(state.slides, SLIDES_FOR[kind](imgs.length)));
  if (state.slides !== before) toast(`${state.slides} Slides, damit alle Fotos Platz haben`);
  const { W, H } = dims(), n = state.slides, T = W * n, g = Math.round(W * .03);
  const extra = [];
  let need;
  const mosaicCells = () => { const cols = n * 2, cw = (T - g * (cols + 1)) / cols, cells = [];
    for (let c = 0; c < cols; c++) { const x0 = g + c * (cw + g), split = [1, 2, 2, 1, 2, 1][c % 6], sp = c % 3 === 1 ? .4 : .58;
      if (split === 1) cells.push([x0, g, cw, H - 2 * g]); else { const h1 = (H - 3 * g) * sp; cells.push([x0, g, cw, h1], [x0, 2 * g + h1, cw, H - 3 * g - h1]); } }
    return cells; };
  const filmW = W * .6, filmOW = filmW * 1.05;
  switch (kind) {
    case 'pano': need = imgs.length; break;
    case 'panoRand': need = imgs.length; break;
    case 'seam': need = Math.max(1, n - 1); break;
    case 'offset': need = n + 1; break;
    case 'polaroid': need = n * 2; break;
    case 'scrapbook': need = Math.round(n * 1.5); break;
    case 'grid2': need = n * 4; break;
    case 'duo': need = n * 2; break;
    case 'strips': need = n * 3; break;
    case 'mosaic': need = mosaicCells().length; break;
    case 'bigsmall': need = 1 + Math.max(0, n - 2) + 1; break;
    case 'stairs': need = n + 1; break;
    case 'zigzag': need = 2 * n - 1; break;
    case 'circles': need = n + 1; break;
    case 'film': need = Math.ceil(T / filmOW) + 1; break;
    default: need = n;
  }
  const pool = imgs.slice(); while (pool.length < need) { const c = clone(imgs[pool.length % imgs.length]); c.id = newId(); c.tpl = true; pool.push(c); }
  const use = kind === 'pano' ? pool : pool.slice(0, need);
  use.forEach(reset);
  const bgWhite = () => { state.bg.c1 = '#ffffff'; state.bg.grad = false; state.bg.pattern = 'none'; };
  switch (kind) {
    case 'pano': {
      const [first, ...rest] = use; first.crop.ratio = 'orig'; coverAll(first);
      rest.forEach((l, i) => { l.crop.ratio = .8; l.shape = 'polaroid'; l.border = Math.round(W * .03); l.borderColor = '#ffffff'; l.shadow = true; l.w = W * .5; const s = 1 + i % Math.max(1, n - 1); l.x = Math.min(T - W * .5, s * W + W * .1); l.y = H * .52; l.rot = i % 2 ? 4 : -4; });
      break; }
    case 'panoRand': { const b = Math.round(W * .05), [first, ...rest] = use; fitRect(first, b, b, T - 2 * b, H - 2 * b); bgWhite();
      rest.forEach((l, i) => { l.crop.ratio = 1; l.shape = 'polaroid'; l.borderColor = '#ffffff'; l.shadow = true; l.w = W * .42; l.x = W * (.5 + (i + .5) * (n - 1) / rest.length); l.y = H * (i % 2 ? .6 : .45); l.rot = i % 2 ? 5 : -5; }); break; }
    case 'single': use.forEach((l, i) => fitRect(l, i * W, 0, W, H)); break;
    case 'frame': use.forEach((l, i) => { const w = W * .82, h = w / .8; fitRect(l, i * W + (W - w) / 2, (H - h) / 2, w, h); }); bgWhite(); break;
    case 'seam': use.forEach((l, i) => { l.crop.ratio = .8; l.w = W * .9; l.x = n === 1 ? W / 2 : (i + 1) * W; l.y = H / 2; l.shadow = true; l.rot = i % 2 ? 3 : -3; }); break;
    case 'offset': use.forEach((l, i) => fitRect(l, i * W - W / 2 + (i ? g / 2 : 0), 0, W - (i && i < n ? g : g / 2), H)); bgWhite(); break;
    case 'grid2': use.forEach((l, k) => { const i = k >> 2, q = k & 3, cw = (W - 3 * g) / 2, ch = (H - 3 * g) / 2; fitRect(l, i * W + g + (q % 2) * (cw + g), g + (q >> 1) * (ch + g), cw, ch); }); bgWhite(); break;
    case 'duo': use.forEach((l, k) => { const i = k >> 1, q = k & 1, ch = (H - 3 * g) / 2; fitRect(l, i * W + g, g + q * (ch + g), W - 2 * g, ch); }); bgWhite(); break;
    case 'strips': use.forEach((l, k) => { const i = Math.floor(k / 3), q = k % 3, cw = (W - 4 * g) / 3; fitRect(l, i * W + g + q * (cw + g), g, cw, H - 2 * g); }); bgWhite(); break;
    case 'mosaic': mosaicCells().forEach((c, k) => fitRect(use[k], ...c)); bgWhite(); break;
    case 'bigsmall': {
      const span = Math.min(2, n); fitRect(use[0], 0, 0, span * W, H);
      let k = 1; for (let i = span; i < n; i++) { const w = W * .8, h = w / .8, l = use[k++]; fitRect(l, i * W + (W - w) / 2, (H - h) / 2, w, h); l.shape = 'round'; l.radius = 4; }
      const inset = use[k]; if (inset) { inset.crop.ratio = 1; inset.w = W * .42; inset.x = span * W - (n > span ? 0 : W * .3); inset.y = H * .74; inset.shape = 'circle'; inset.border = Math.round(W * .02); inset.borderColor = '#ffffff'; inset.shadow = true; }
      break; }
    case 'stairs': use.forEach((l, i) => { const c = use.length; l.crop.ratio = .85; l.w = W * .56; l.shape = 'round'; l.radius = 5; l.shadow = true; l.x = W * .36 + i * (T - W * .72) / Math.max(1, c - 1); l.y = H * (.26 + .48 * i / Math.max(1, c - 1)); }); break;
    case 'zigzag': use.forEach((l, i) => { l.crop.ratio = .8; l.w = W * .58; l.border = Math.round(W * .018); l.borderColor = '#ffffff'; l.shadow = true; l.x = W * .5 + i * W / 2; l.y = H * (i % 2 ? .66 : .34); l.rot = i % 2 ? 2 : -2; }); break;
    case 'circles': use.forEach((l, i) => { const c = use.length; l.crop.ratio = 1; l.w = W * .62; l.shape = 'circle'; l.border = Math.round(W * .02); l.borderColor = '#ffffff'; l.shadow = true; l.x = W * .5 + i * (T - W) / Math.max(1, c - 1); l.y = H * (i % 2 ? .6 : .4); }); break;
    case 'polaroid': use.forEach((l, i) => { l.crop.ratio = 1; l.shape = 'polaroid'; l.border = Math.round(W * .028); l.borderColor = '#ffffff'; l.shadow = true; l.w = W * .5;
      l.x = (i + .5) * T / use.length; l.y = H * (i % 2 ? .62 : .38); l.rot = [-8, 5, -3, 7, -6, 4][i % 6]; }); break;
    case 'scrapbook': {
      state.bg.c1 = '#e8dcc8'; state.bg.grad = false; state.bg.pattern = 'paper';
      use.forEach((l, i) => { const ins = i % 2 === 1; l.crop.ratio = ins ? .78 : 1; l.shape = ins ? 'instax' : 'polaroid'; l.borderColor = '#fbfaf6'; l.shadow = true; l.w = W * (ins ? .46 : .52);
        l.x = (i + .5) * T / use.length; l.y = H * (i % 2 ? .6 : .42); l.rot = [-6, 4, -2, 7, -5, 3][i % 6];
        const t = newShapeLayer('tape', l.x, l.y - l.w * .62); t.rot = l.rot + (i % 2 ? -8 : 10); t.w = W * .2; t.h = W * .06; t.tpl = true; extra.push(t); });
      if (!others.some(l => l.type === 'text')) { const t = newTextLayer(W * .5, H * .1, 'Unser Sommer'); t.font = 'Caveat'; t.size = 120; t.color = '#3a3226'; t.shadow = false; t.rot = -3; t.tpl = true; extra.push(t); }
      break; }
    case 'film': {
      state.bg.c1 = '#efece6'; state.bg.grad = false;
      use.forEach((l, i) => { l.crop.ratio = 1.5; l.shape = 'film'; l.borderColor = '#161616'; l.w = filmW; l.x = filmOW * (i + .5) - (use.length * filmOW - T) / 2; l.y = H / 2; });
      break; }
    case 'cover': {
      bgWhite(); state.bg.c1 = '#f4efe6';
      const c0 = use[0], w = W * .62, h = H * .55; fitRect(c0, (W - w) / 2, H * .34, w, h); c0.shape = 'arch';
      for (let i = 1; i < n; i++) { const w2 = W * .84, h2 = w2 / .8; fitRect(use[i], i * W + (W - w2) / 2, (H - h2) / 2, w2, h2); }
      if (!others.some(l => l.type === 'text')) { const t = newTextLayer(W / 2, H * .17, 'Wochenende\nam Meer'); t.font = 'DM Serif Display'; t.size = 120; t.color = '#1d1d1d'; t.shadow = false; t.lineH = 1.02; t.tpl = true; extra.push(t);
        const s = newTextLayer(W / 2, H * .94, 'WISCHEN →'); s.font = 'Space Mono'; s.size = 34; s.color = '#1d1d1d'; s.shadow = false; s.spacing = 18; s.tpl = true; extra.push(s); }
      break; }
    case 'magazine': {
      fitRect(use[0], 0, 0, W, H);
      for (let i = 1; i < n; i++) { const w2 = W * .78, h2 = H * .72; fitRect(use[i], i * W + (W - w2) / 2, H * .08, w2, h2); }
      bgWhite();
      if (!others.some(l => l.type === 'text')) { const t = newTextLayer(W / 2, H * .13, 'DER NORDEN'); t.font = 'Anton'; t.size = 170; t.color = '#ffffff'; t.spacing = 4; t.tpl = true; extra.push(t);
        const s = newTextLayer(W / 2, H * .9, 'Eine Fotostrecke über Wind & Licht'); s.font = 'Playfair Display'; s.size = 46; s.color = '#ffffff'; s.tpl = true; extra.push(s);
        for (let i = 1; i < n; i++) { const p = newTextLayer(i * W + W / 2, H * .9, String(i + 1).padStart(2, '0')); p.font = 'Space Mono'; p.size = 40; p.color = '#1d1d1d'; p.shadow = false; p.tpl = true; extra.push(p); } }
      break; }
  }
  state.layers = [...use, ...others, ...extra];
  return true;
}
