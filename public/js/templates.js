/* Vorlagen im Stil von SCRL: Felder über alle Slides, mehrere Varianten pro Vorlage, Platzhalter zum Antippen.
   Maßeinheit in den Bauplänen: 1 = Slide-Breite, A = Slide-Höhe / Slide-Breite. */
import { state, dims, clone, newId, seeded, ui } from './core.js';
import { newImageLayer, newTextLayer, newShapeLayer, computeBox } from './layers.js';

const S = (x, y, w, h, o) => Object.assign({ x, y, w, h }, o);
const grid = (x, y, w, h, c, r, g, o) => { const cw = (w - g * (c - 1)) / c, ch = (h - g * (r - 1)) / r, out = []; for (let j = 0; j < r; j++) for (let i = 0; i < c; i++) out.push(S(x + i * (cw + g), y + j * (ch + g), cw, ch, o)); return out; };
const TX = (key, x, y, text, o) => Object.assign({ t: 'text', key, x, y, text }, o);
const SH = (kind, x, y, w, h, o) => Object.assign({ t: 'shape', kind, x, y, w, h }, o);
const C = (cx, cy, w, h, o) => S(cx - w / 2, cy - h / 2, w, h, o); // Feld über Mittelpunkt
const seams = n => n > 1 ? Array.from({ length: n - 1 }, (_, i) => i + 1) : [.5];
const rotPt = (cx, cy, x, y, deg) => { const a = deg * Math.PI / 180, dx = x - cx, dy = y - cy; return [cx + dx * Math.cos(a) - dy * Math.sin(a), cy + dx * Math.sin(a) + dy * Math.cos(a)]; };
function partition(R, count, g, rnd) {
  const rects = [R];
  while (rects.length < count) {
    rects.sort((a, b) => b[2] * b[3] - a[2] * a[3]); const [x, y, w, h] = rects.shift();
    const vert = w / h > 1.15 ? true : w / h < .85 ? false : rnd() < .5, f = .36 + rnd() * .28;
    if (vert) { const w1 = (w - g) * f; rects.push([x, y, w1, h], [x + w1 + g, y, w - w1 - g, h]); }
    else { const h1 = (h - g) * f; rects.push([x, y, w, h1], [x, y + h1 + g, w, h - h1 - g]); }
  }
  return rects.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}
/* Zufall mit gut gemischtem Startwert (benachbarte Startwerte liefern sonst fast gleiche Folgen) */
const rng = n => { let a = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b) >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const today = () => new Date().toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX'];

/* ---------- Abwechslung über die Slides ---------- */
/* Seitenfolge: Slide 1 zeigt die gewählte Variante, danach kommt jedes Muster einmal dran (gemischt),
   erst wenn alle durch sind, wiederholt sich etwas – nie zweimal gleich hintereinander. */
function pager(n, o, k, salt = 0) {
  if (!o.mix || k < 2) return () => 0;
  const r = rng(91 + (o.seed || 0) * 13 + k * 7 + salt * 29), seq = [0];
  const shuf = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  let pool = shuf([...Array(k).keys()].slice(1));
  while (seq.length < n) { if (!pool.length) { pool = shuf([...Array(k).keys()]); if (pool[0] === seq[seq.length - 1]) pool.push(pool.shift()); } seq.push(pool.shift()); }
  return i => seq[i] || 0;
}
/* Bibliothek von Seitenaufteilungen innerhalb eines Kastens (x, y, w, h, Abstand g) */
const cells = (x, y, w, h, c, r, g) => grid(x, y, w, h, c, r, g).map(q => [q.x, q.y, q.w, q.h]);
const LAY = {
  one: (x, y, w, h) => [[x, y, w, h]],
  two_h: (x, y, w, h, g) => cells(x, y, w, h, 1, 2, g),
  two_v: (x, y, w, h, g) => cells(x, y, w, h, 2, 1, g),
  big_top: (x, y, w, h, g) => { const a = (h - g) * .62; return [[x, y, w, a], [x, y + a + g, w * .6, h - a - g]]; },
  big_left: (x, y, w, h, g) => { const a = (w - g) * .62; return [[x, y, a, h], [x + a + g, y + h * .28, w - a - g, h * .44]]; },
  three_rows: (x, y, w, h, g) => cells(x, y, w, h, 1, 3, g),
  three_cols: (x, y, w, h, g) => cells(x, y, w, h, 3, 1, g),
  trio_l: (x, y, w, h, g) => { const a = (w - g) * .6, b = (h - g) / 2; return [[x, y, a, h], [x + a + g, y, w - a - g, b], [x + a + g, y + b + g, w - a - g, b]]; },
  trio_r: (x, y, w, h, g) => { const a = (w - g) * .6, b = (h - g) / 2; return [[x + w - a, y, a, h], [x, y, w - a - g, b], [x, y + b + g, w - a - g, b]]; },
  trio_t: (x, y, w, h, g) => { const a = (h - g) * .58; return [[x, y, w, a], ...cells(x, y + a + g, w, h - a - g, 2, 1, g)]; },
  trio_b: (x, y, w, h, g) => { const a = (h - g) * .42; return [...cells(x, y, w, a, 2, 1, g), [x, y + a + g, w, h - a - g]]; },
  four: (x, y, w, h, g) => cells(x, y, w, h, 2, 2, g),
  four_t: (x, y, w, h, g) => { const a = (h - g) * .62; return [[x, y, w, a], ...cells(x, y + a + g, w, h - a - g, 3, 1, g)]; },
  four_b: (x, y, w, h, g) => { const a = (h - g) * .36; return [...cells(x, y, w, a, 3, 1, g), [x, y + a + g, w, h - a - g]]; },
  four_l: (x, y, w, h, g) => { const a = (w - g) * .64; return [[x, y, a, h], ...cells(x + a + g, y, w - a - g, h, 1, 3, g)]; },
  four_r: (x, y, w, h, g) => { const a = (w - g) * .64; return [[x + w - a, y, a, h], ...cells(x, y, w - a - g, h, 1, 3, g)]; },
  five: (x, y, w, h, g) => { const a = (h - g) * .52; return [...cells(x, y, w, a, 2, 1, g), ...cells(x, y + a + g, w, h - a - g, 3, 1, g)]; },
  six: (x, y, w, h, g) => cells(x, y, w, h, 2, 3, g),
  six_w: (x, y, w, h, g) => cells(x, y, w, h, 3, 2, g),
  nine: (x, y, w, h, g) => cells(x, y, w, h, 3, 3, g),
  sand: (x, y, w, h, g) => { const t = h - 2 * g, a = t * .27, b = t - 2 * a; return [[x, y, w * .58, a], [x, y + a + g, w, b], [x + w * .42, y + a + b + 2 * g, w * .58, a]]; },
  center: (x, y, w, h) => [[x + w * .12, y + h * .14, w * .76, h * .64]],
  tall: (x, y, w, h) => [[x + w * .2, y, w * .6, h]],
  wide: (x, y, w, h) => [[x, y + h * .2, w, h * .52]],
  offset2: (x, y, w, h) => [[x, y, w * .64, h * .56], [x + w * .36, y + h * .46, w * .64, h * .54]],
  cascade3: (x, y, w, h) => [[x, y, w * .58, h * .4], [x + w * .21, y + h * .3, w * .58, h * .4], [x + w * .42, y + h * .6, w * .58, h * .4]],
  inset: (x, y, w, h) => [[x, y, w, h], [x + w * .52, y + h * .58, w * .4, h * .34]],
  pipc: (x, y, w, h) => [[x, y, w, h], [x + w * .2, y + h * .22, w * .6, h * .56]]
};
LAY.nbLow = LAY.nbHigh = LAY.one;
const K_GRID = ['four', 'two_h', 'trio_l', 'three_cols', 'big_top', 'four_t', 'two_v', 'trio_b', 'six', 'four_r', 'five', 'trio_t', 'three_rows', 'four_l', 'sand', 'big_left', 'six_w', 'four_b', 'trio_r', 'one'];
const K_AIRY = ['center', 'two_h', 'trio_t', 'tall', 'big_left', 'four', 'wide', 'two_v', 'offset2', 'trio_l', 'big_top', 'three_rows', 'trio_r', 'sand'];
const K_OBJ = ['one', 'two_v', 'trio_t', 'two_h', 'four', 'offset2', 'trio_b', 'three_rows', 'cascade3', 'big_left', 'three_cols', 'trio_l', 'big_top', 'four_t'];
const K_BLEED = ['one', 'two_h', 'inset', 'trio_l', 'two_v', 'pipc', 'four', 'trio_b', 'three_rows', 'big_top', 'four_l', 'trio_r', 'five', 'three_cols'];
const startAt = (kinds, first) => [first, ...kinds.filter(k => k !== first)];
/* Seiten aus der Bibliothek bauen. ins = Rand [l, o, r, u] (oder Funktion je Muster), fit = Seitenverhältnis h/w für Abzüge,
   rot = max. Neigung, pre = Felder vor jeder Seite (z. B. Hintergrundfoto), slot/deco = Stil je Feld bzw. Deko je Seite */
function flow(n, A, o, opt = {}) {
  const { from = 0, kinds = K_GRID, g = o.g ?? .025, ins = g, fit = 0, pad = 0, rot = 0, slot, deco, pre, salt = 0 } = opt;
  const P = pager(n - from, o, kinds.length, salt), sl = [], dc = [];
  for (let i = from; i < n; i++) {
    const r = rng(7 + i * 31 + (o.seed || 0) * 101 + salt * 3), kind = kinds[P(i - from)];
    const q = typeof ins === 'function' ? ins(kind) : ins, [l, t, rr, b] = typeof q === 'number' ? [q, q, q, q] : q;
    if (pre) sl.push(...pre(i, kind));
    const page = LAY[kind](i + l, t, 1 - l - rr, A - t - b, g).map(([x, y, w, h], j, all) => {
      if (fit) { const fw = Math.min(w * (1 - pad), h * (1 - pad) / fit), fh = fw * fit; x += (w - fw) / 2; y += (h - fh) / 2; w = fw; h = fh; }
      const ex = slot ? slot(i, j, all.length, r, kind) : {};
      return S(x, y, w, h, rot && ex.rot == null ? { rot: Math.round((r() - .5) * 20 * rot) / 10, ...ex } : ex);
    });
    sl.push(...page);
    if (deco) deco(i, page, r, dc, kind);
  }
  return { slots: sl, deco: dc };
}
/* Folgeseiten für Editorial-Vorlagen: 'airy' = mit Weißraum, 'bleed' = randlos mit feinen Fugen */
function pages(n, A, o, from, mode = 'airy', st = {}) {
  const bleed = mode === 'bleed';
  return flow(n, A, o, { from, kinds: bleed ? (from ? startAt(K_BLEED.filter(k => k !== 'one'), 'two_h') : K_BLEED) : K_AIRY, g: bleed ? .012 : .035, ins: bleed ? 0 : .08, salt: st.salt || 0,
    slot: (i, j, c, r, kind) => (kind === 'inset' || kind === 'pipc') && j ? { border: .012, borderColor: '#ffffff', shadow: true } : { ...(bleed ? st.full : st.card) } }).slots;
}
/* Abzug mit Büroklammer, Foldback-Klammer oder Klebeband befestigen */
const TAPES = ['#efe3c4', '#f2c6c2', '#c9dfe6', '#f4f4ee', '#d8e6c8', '#f4f4ee'];
function attach(s, r, dc, only) {
  const cx = s.x + s.w / 2, cy = s.y + s.h / 2, rot = s.rot || 0, P = (fx, fy) => rotPt(cx, cy, s.x + fx * s.w, s.y + fy * s.h, rot);
  const t = only ?? Math.floor(r() * 5), sc = Math.max(.75, Math.min(1.1, Math.min(s.w, s.h) * 1.9)), tp = TAPES[Math.floor(r() * TAPES.length)];
  if (t === 0) { const [x, y] = P(.15 + r() * .25, 0); dc.push(SH('clip', x, y + .045 * sc, .066 * sc, .17 * sc, { rot: rot - 5 + r() * 10 })); }
  else if (t === 1) { const [x, y] = P(.5, 0); dc.push(SH('binder', x, y + .055 * sc, .13 * sc, .16 * sc, { rot })); }
  else if (t === 2) { const [x1, y1] = P(0, 0), [x2, y2] = P(1, 0); dc.push(SH('tape', x1, y1, .2 * sc, .055 * sc, { rot: rot - 40 + r() * 8, fill: tp }), SH('tape', x2, y2, .2 * sc, .055 * sc, { rot: rot + 40 - r() * 8, fill: tp })); }
  else if (t === 3) { const [x, y] = P(.5, 0); dc.push(SH('tape', x, y, .24 * sc, .06 * sc, { rot: rot + (r() - .5) * 10, fill: tp })); }
  else { const [x1, y1] = P(0, 0), [x2, y2] = P(1, 1); dc.push(SH('tape', x1, y1, .18 * sc, .05 * sc, { rot: rot - 45, fill: tp }), SH('tape', x2, y2, .18 * sc, .05 * sc, { rot: rot - 45, fill: tp })); }
}
/* Kritzeleien in freie Flächen einer Seite streuen (überlappen weder Fotos noch einander) */
const DOOD = ['dHeart', 'dHearts', 'dStar', 'dSparkles', 'dSwirl', 'dArrowCurve', 'dArrowDown', 'dSun', 'dCloud', 'dFlower', 'dSmile', 'dCrown', 'dBolt', 'dMusic', 'dExclaim', 'dBurst', 'dPlane', 'dLoops', 'dDots', 'dFlourish', 'dTick'];
const DOOD_AR = { dLoops: .32, dFlourish: .42, dArrowCurve: .62, dArrowDown: 2, dExclaim: 1.6, dCloud: .68, dBolt: 1.6, dHearts: .9, dPlane: .72 };
function doodles(i, A, page, r, dc, cnt, ink = '#1d1d1d', avoid = true, kinds = DOOD) {
  const boxes = avoid ? page.map(s => [s.x - .015, s.y - .015, s.x + s.w + .015, s.y + s.h + .015]) : [];
  for (let k = 0, tries = 0; k < cnt && tries < 60; tries++) {
    const kind = kinds[Math.floor(r() * kinds.length)], ar = DOOD_AR[kind] || 1, w = .1 + r() * .09, h = w * ar, cx = i + w / 2 + .03 + r() * (.94 - w), cy = h / 2 + .03 + r() * (A - h - .06);
    const b = [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2];
    if (boxes.some(q => b[0] < q[2] && b[2] > q[0] && b[1] < q[3] && b[3] > q[1])) continue;
    boxes.push(b); dc.push(SH(kind, cx, cy, w, h, { fill: ink, rot: Math.round((r() - .5) * 300) / 10, sw: 5 + Math.round(r() * 3) })); k++;
  }
}
/* Allgemeine Abwechslung: einzelne Slides zufällig spiegeln (nur Felder, die ganz auf der Slide liegen) */
export function vary(L, n, o, T) {
  if (!o.mix || T.noMirror || T.flow) return L;
  const r = rng(57 + (o.seed || 0) * 17);
  for (let i = 1; i < n; i++) {
    if (r() < .5) continue;
    for (const s of L.slots) { if (s.pano || s.x < i - 1e-6 || s.x + s.w > i + 1 + 1e-6) continue; s.x = 2 * i + 1 - (s.x + s.w); if (s.rot) s.rot = -s.rot; if (s.edgeSides) s.edgeSides = s.edgeSides.replace(/[lr]/g, c => c === 'l' ? 'r' : 'l'); }
    for (const d of L.deco || []) { if (d.x < i || d.x > i + 1) continue; d.x = 2 * i + 1 - d.x; if (d.rot && Math.abs(d.rot) !== 90) d.rot = -d.rot; }
  }
  return L;
}

export const TPL_CATS = [['all', 'Alle'], ['pano', 'Panorama'], ['grid', 'Raster'], ['seam', 'Über die Naht'], ['collage', 'Collage'], ['paper', 'Papier & Notizbuch'], ['doodle', 'Kritzeleien'], ['analog', 'Analog'], ['edit', 'Editorial'], ['shape', 'Formen']];

export const TEMPLATES = [
  /* ---------- Panorama ---------- */
  { id: 'pano', noMirror: true, fixed: true, cat: 'pano', name: 'Panorama', desc: 'Ein Foto läuft über alle Slides.', vars: ['Randlos', 'Mit Rand', 'Band', 'Abzug'],
    build(n, A, o) {
      if (o.v === 1) { const b = Math.max(.045, o.g * 1.6); return { slots: [S(b, b, n - 2 * b, A - 2 * b)], bg: { c1: '#ffffff' } }; }
      if (o.v === 2) return { slots: [S(0, A * .2, n, A * .6)], bg: { c1: '#f4efe6' } };
      if (o.v === 3) return { slots: [S(.1, A * .15, n - .2, A * .7, { rot: -1.2, border: .025, shadow: true })], bg: { c1: '#e8dcc8', pattern: 'paper' } };
      return { slots: [S(0, 0, n, A)] };
    } },
  { id: 'panoWin', noMirror: true, cat: 'pano', name: 'Panorama-Fenster', desc: 'Ein Foto, sichtbar durch viele Rahmen – jede Slide anders.', gap: .03, vars: ['Raster', 'Streifen', 'Kreise', 'Bögen', 'Mosaik'],
    build(n, A, o) {
      const g = o.g, P = { k: 'w', R: [0, 0, n, A] }, sl = [], W = { pano: P };
      if (o.v === 0) return { slots: flow(n, A, o, { kinds: startAt(K_GRID, 'four'), g, ins: g, slot: () => W, salt: 35 }).slots, bg: { c1: '#ffffff' } };
      if (o.v === 1) { const r = rng(36 + (o.seed || 0)), N = n * 4, ws = Array.from({ length: N }, () => o.mix ? .6 + r() * .8 : 1), tot = ws.reduce((a, b) => a + b, 0), avail = n - g * (N + 1); let x = g;
        ws.forEach(f => { const w = avail * f / tot, dy = o.mix ? r() * A * .12 : 0; sl.push(S(x, g + dy, w, A - 2 * g - (o.mix ? r() * A * .12 : 0) - dy, W)); x += w + g; }); return { slots: sl, bg: { c1: '#111111' } }; }
      if (o.v === 2) return { slots: flow(n, A, o, { kinds: K_OBJ.filter(k => !/offset|cascade/.test(k)), g: .04, ins: .06, fit: 1, slot: () => ({ shape: 'circle', ...W }), salt: 37 }).slots, bg: { c1: '#ffffff' } };
      if (o.v === 3) return { slots: flow(n, A, o, { kinds: K_OBJ.filter(k => !/offset|cascade/.test(k)), g: .04, ins: .07, fit: 1.25, slot: () => ({ shape: 'arch', ...W }), salt: 38 }).slots, bg: { c1: '#ffffff' } };
      partition([g, g, n - 2 * g, A - 2 * g], n * 3, g, seeded(5 + o.seed * 13)).forEach(r => sl.push(S(...r, W)));
      return { slots: sl, bg: { c1: '#ffffff' } };
    } },
  { id: 'panoCards', noMirror: true, cat: 'pano', name: 'Panorama + Karten', desc: 'Hintergrund-Panorama, weitere Fotos als Karten auf den Nähten.', vars: ['Sofortbilder', 'Karten', 'Kreise'],
    build(n, A, o) {
      const sl = [S(0, 0, n, A)], r = rng(39 + (o.seed || 0) * 3), m = o.mix;
      seams(n).forEach((x, i) => {
        const sc = m ? .8 + r() * .4 : 1, y = A * (m ? .36 + r() * .28 : .5), rt = m ? (r() - .5) * 16 : (i % 2 ? 5 : -5);
        if (o.v === 0) sl.push(C(x, y - A * .03, .48 * sc, .48 * sc, { frame: 'polaroid', rot: rt, shadow: true }));
        else if (o.v === 1) sl.push(C(x, y, .56 * sc, .7 * sc, { shape: 'round', radius: 6, border: .018, shadow: true, rot: m ? rt / 3 : 0 }));
        else sl.push(C(x, y, .6 * sc, .6 * sc, { shape: 'circle', border: .02, shadow: true }));
      });
      return { slots: sl };
    } },
  { id: 'panoSplit', noMirror: true, cat: 'pano', name: 'Panorama + Reihe', desc: 'Breites Panorama, darunter Einzelbilder.', gap: .025, vars: ['Panorama oben', 'Panorama unten', 'Mit Kreisen'],
    build(n, A, o) {
      const g = o.g, sl = [];
      if (o.v === 2) { const r = rng(40 + (o.seed || 0)); sl.push(S(0, 0, n, A * .64)); for (let i = 0; i < n; i++) { const d = o.mix ? .34 + r() * .2 : .44; sl.push(C(i + (o.mix ? .3 + r() * .4 : .5), A * .64 + (o.mix ? (r() - .3) * .1 : 0), d, d, { shape: 'circle', border: .02, shadow: true })); } return { slots: sl, bg: { c1: '#f4efe6' } }; }
      const ph = A * .56, top = o.v === 0;
      sl.push(S(0, top ? 0 : A - ph, n, ph));
      sl.push(...flow(n, A, o, { kinds: ['one', 'two_v', 'three_cols', 'big_left', 'trio_r', 'two_h', 'trio_l', 'four', 'five', 'six_w', 'trio_b', 'center'], g, ins: top ? [g, ph + g, g, g] : [g, g, g, ph + g], salt: 41 }).slots);
      return { slots: sl, bg: { c1: '#ffffff' } };
    } },
  { id: 'spread', noMirror: true, fixed: true, cat: 'pano', name: 'Doppelseite', desc: 'Je ein Foto über zwei Slides.', gap: .03, vars: ['Randlos', 'Mit Rand', 'Mit Fuge'],
    build(n, A, o) {
      const g = o.g, sl = [];
      for (let i = 0; i < n; i += 2) {
        const span = i + 1 < n ? 2 : 1;
        if (o.v === 0) sl.push(S(i, 0, span, A));
        else if (o.v === 1) sl.push(S(i + g, g, span - 2 * g, A - 2 * g));
        else { const P = { k: 'd' + i, R: [i + g, g, span - 2 * g, A - 2 * g] }; if (span === 2) { sl.push(S(i + g, g, 1 - 1.5 * g, A - 2 * g, { pano: P }), S(i + 1 + g / 2, g, 1 - 1.5 * g, A - 2 * g, { pano: P })); } else sl.push(S(i + g, g, 1 - 2 * g, A - 2 * g)); }
      }
      return { slots: sl, bg: { c1: '#ffffff' } };
    } },

  /* ---------- Raster ---------- */
  { id: 'grid', flow: true, cat: 'grid', name: 'Raster', desc: 'Felder auf jeder Slide – jede Slide anders aufgeteilt.', gap: .025, vars: ['2×2', '3×3', '1×2', '2×1', '3×2', '2×3', '1×3'],
    build(n, A, o) {
      const V = ['four', 'nine', 'two_h', 'two_v', 'six_w', 'six', 'three_rows'];
      return { slots: flow(n, A, o, { kinds: startAt(K_GRID, V[o.v]), g: o.g, ins: o.g }).slots, bg: { c1: '#ffffff' } };
    } },
  { id: 'mosaic', noMirror: true, cat: 'grid', name: 'Mosaik', desc: 'Freie Aufteilung, Felder laufen über die Nähte.', gap: .022, vars: ['Mix 1', 'Mix 2', 'Mix 3', 'Mix 4'],
    build(n, A, o) {
      const cnt = Math.min(n * 5, Math.max(o.k, n * 2)), g = o.g;
      return { slots: partition([g, g, n - 2 * g, A - 2 * g], cnt, g, seeded(17 + o.v * 31 + o.seed * 7)).map(r => S(...r)), bg: { c1: '#ffffff' } };
    } },
  { id: 'feature', flow: true, cat: 'grid', name: 'Groß + zwei', desc: 'Ein Hauptbild und kleine daneben – Anordnung wechselt.', gap: .025, vars: ['Groß links', 'Groß rechts', 'Groß oben', 'Groß unten'],
    build(n, A, o) {
      const FAM = ['trio_l', 'trio_r', 'trio_t', 'trio_b', 'four_t', 'four_l', 'four_r', 'four_b', 'big_top', 'big_left', 'sand'];
      return { slots: flow(n, A, o, { kinds: startAt(FAM, FAM[o.v]), g: o.g, ins: o.g, salt: 1 }).slots, bg: { c1: '#ffffff' } };
    } },
  { id: 'bento', flow: true, cat: 'grid', name: 'Bento', desc: 'Jede Slide anders aufgeteilt.', gap: .025, vars: ['Start A', 'Start B', 'Start C'],
    build(n, A, o) {
      return { slots: flow(n, A, o, { kinds: startAt(K_GRID, ['trio_l', 'trio_t', 'five'][o.v]), g: o.g, ins: o.g, salt: 2 }).slots, bg: { c1: '#ffffff' } };
    } },
  { id: 'brick', noMirror: true, cat: 'grid', name: 'Mauerwerk', desc: 'Spalten mit versetzten Höhen über die Nähte.', gap: .022, vars: ['2 Spalten', '3 Spalten'],
    build(n, A, o) {
      const g = o.g, per = o.v ? 3 : 2, N = n * per + 1, cw = (n - (N - 1) * g) / (N - 1), r = rng(9 + o.seed * 5), sl = [];
      for (let j = 0; j < N; j++) {
        const x = -cw / 2 + j * (cw + g), cells = o.v ? 2 + Math.floor(r() * 2) : 1 + Math.floor(r() * 3), fs = [];
        for (let c = 0; c < cells; c++) fs.push(.6 + r() * .8);
        const tot = fs.reduce((a, b) => a + b, 0), hAvail = A - g * (cells + 1); let y = g;
        fs.forEach(f => { const h = hAvail * f / tot; sl.push(S(x, y, cw, h)); y += h + g; });
      }
      return { slots: sl, bg: { c1: '#ffffff' } };
    } },

  /* ---------- Über die Naht ---------- */
  { id: 'seam', noMirror: true, cat: 'seam', name: 'Über die Naht', desc: 'Fotos sitzen genau auf den Übergängen.', vars: ['Gerade', 'Gedreht', 'Groß mit Rand', 'Kreise'],
    build(n, A, o) {
      const r = rng(42 + (o.seed || 0) * 5), m = o.mix, sl = seams(n).map((x, i) => {
        const sc = m ? .78 + r() * .34 : 1, y = A / 2 + (m ? (r() - .5) * A * .22 * (2 - sc) : 0), rt = m ? (r() - .5) * 12 : 0;
        return o.v === 3 ? C(x, y, .78 * sc, .78 * sc, { shape: 'circle', border: .02, shadow: true })
          : o.v === 2 ? C(x, y, 1.04 * Math.min(1, sc), A * .78 * Math.min(1, sc), { border: .022, shadow: true, rot: rt / 4 })
          : C(x, y, A * .72 * .8 * sc, A * .72 * sc, { shadow: true, rot: o.v === 1 ? (m ? rt : i % 2 ? 4 : -4) : m ? rt / 4 : 0 }); });
      return { slots: sl };
    } },
  { id: 'offset', noMirror: true, cat: 'seam', name: 'Versetzt', desc: 'Jede Slide zeigt Teile von zwei Fotos.', gap: .025, vars: ['Volle Höhe', 'Mit Rand', 'Gestaffelt'],
    build(n, A, o) {
      const g = o.g, sl = [], r = rng(43 + (o.seed || 0) * 7), b = [];
      for (let j = 0; j <= n + 1; j++) b.push(j - .5 + (o.mix && j > 0 && j <= n ? (r() - .5) * .36 : 0));
      for (let i = 0; i <= n; i++) {
        const x = b[i] + g / 2, w = b[i + 1] - b[i] - g;
        if (o.v === 0) sl.push(S(x, 0, w, A));
        else if (o.v === 1) { const t = o.mix ? r() * A * .12 : 0; sl.push(S(x, g + t, w, A - 2 * g - t - (o.mix ? r() * A * .12 : 0))); }
        else sl.push(S(x, o.mix ? g + r() * A * .2 : i % 2 ? A * .2 : g, w, A * .78));
      }
      return { slots: sl, bg: { c1: '#ffffff' } };
    } },
  { id: 'stairs', noMirror: true, cat: 'seam', name: 'Treppe', desc: 'Fotos laufen schräg durchs Karussell.', vars: ['Abwärts', 'Aufwärts', 'Welle'],
    build(n, A, o) {
      const c = n + 1, w = .56, h = w / .85, sl = [];
      for (let i = 0; i < c; i++) { const t = i / Math.max(1, c - 1), f = o.v === 0 ? t : o.v === 1 ? 1 - t : .5 + .5 * Math.sin(t * Math.PI * 2);
        sl.push(C(.36 + i * (n - .72) / Math.max(1, c - 1), h / 2 + .06 + f * (A - h - .12), w, h, { shape: 'round', radius: 5, shadow: true })); }
      return { slots: sl };
    } },
  { id: 'zigzag', noMirror: true, cat: 'seam', name: 'Zickzack', desc: 'Abwechselnd oben und unten.', vars: ['Klar', 'Weißer Rand', 'Abgerundet'],
    build(n, A, o) {
      const sl = [], r = rng(44 + (o.seed || 0) * 3), m = o.mix;
      for (let i = 0; i < 2 * n - 1; i++) { const sc = m ? .82 + r() * .3 : 1, w = .58 * sc, h = .58 / .8 * (A > 1.3 ? 1 : .86) * sc, up = i % 2 === 0, cy = m ? (up ? h / 2 + .04 + r() * (A * .5 - h / 2) : A - h / 2 - .04 - r() * (A * .5 - h / 2)) : A * (up ? .34 : .66);
        sl.push(C(.5 + i * .5 + (m ? (r() - .5) * .08 : 0), Math.max(h / 2 + .02, Math.min(A - h / 2 - .02, cy)), w, h,
          o.v === 1 ? { border: .018, shadow: true, rot: m ? (r() - .5) * 8 : i % 2 ? 2 : -2 } : o.v === 2 ? { shape: 'round', radius: 10, shadow: true } : { shadow: true })); }
      return { slots: sl };
    } },
  { id: 'overlap', noMirror: true, cat: 'seam', name: 'Überlappend', desc: 'Große Abzüge überlagern sich über die Nähte.', vars: ['Locker', 'Dicht'],
    build(n, A, o) {
      const c = o.v ? 2 * n : n + 1, w = o.v ? .7 : .9, h = A * .6, sl = [];
      for (let i = 0; i < c; i++) sl.push(C(w / 2 + .05 + i * (n - w - .1) / Math.max(1, c - 1), A * (i % 2 ? .62 : .38), w, h, { border: .015, shadow: true, rot: i % 2 ? 2.5 : -2 }));
      return { slots: sl };
    } },
  { id: 'ribbon', noMirror: true, cat: 'seam', name: 'Bildband', desc: 'Eine Reihe gleicher Bilder läuft durch.', gap: .025, vars: ['Mittig', 'Zwei Reihen', 'Schräg'],
    build(n, A, o) {
      const g = o.g, sl = [];
      const row = (cy, h, off, rot = 0) => { const w = h * .8, step = w + g, cnt = Math.ceil((n + w) / step) + 1;
        for (let j = 0; j < cnt; j++) { const cx = off + j * step - w / 2, dy = rot ? -(cx - n / 2) * Math.tan(rot * Math.PI / 180) : 0; sl.push(C(cx, cy + dy, w, h, { rot })); } };
      if (o.v === 0) row(A / 2, A * .46, (n - Math.floor(n / (A * .46 * .8 + g)) * (A * .46 * .8 + g)) / 2);
      else if (o.v === 1) { const h = (A - 3 * g) / 2; row(g + h / 2, h, 0); row(A - g - h / 2, h, (h * .8 + g) / 2); }
      else row(A / 2, A * .5, 0, -6);
      return { slots: sl, bg: { c1: o.v === 2 ? '#111111' : '#f4efe6' } };
    } },

  /* ---------- Analog ---------- */
  { id: 'polaroid', flow: true, cat: 'analog', name: 'Sofortbilder', desc: 'Abzüge mit weißem Rand.', vars: ['Verstreut', 'Einzeln', 'Stapel'],
    build(n, A, o) {
      const sl = [], R = [-8, 5, -3, 7, -6, 4];
      if (o.v === 0) { const c = 2 * n, r = rng(50 + (o.seed || 0)); for (let i = 0; i < c; i++) { const d = o.mix ? .42 + r() * .16 : .5; sl.push(C((i + .5) * n / c + (o.mix ? (r() - .5) * .08 : 0), o.mix ? d / 2 + .08 + r() * (A - d - .25) : A * (i % 2 ? .6 : .38), d, d, { frame: 'polaroid', rot: o.mix ? Math.round((r() - .5) * 200) / 10 : R[i % 6], shadow: true })); } return { slots: sl, bg: { c1: '#ece6dc', pattern: 'paper' } }; }
      return { slots: flow(n, A, o, { kinds: startAt(K_OBJ, o.v === 1 ? 'one' : 'cascade3'), g: .05, ins: [.07, .06, .07, .12], fit: 1, rot: 5, slot: () => ({ frame: 'polaroid', shadow: true }), salt: 3 }).slots, bg: { c1: '#ece6dc', pattern: 'paper' } };
    } },
  { id: 'instax', flow: true, cat: 'analog', name: 'Instax', desc: 'Kleine Sofortbilder im Hochformat.', vars: ['Reihe', 'Verstreut', 'Auf Dunkel', 'Mit Notiz'],
    build(n, A, o) {
      if (o.v === 3) { const sl = [], N = ['ein Schnappschuss vom\nersten Tag', 'der beste Kaffee', 'Sonne im Gesicht', 'bis bald, Meer', 'wir zwei', 'Lieblingsmoment'];
        const r = rng(51 + (o.seed || 0)); for (let i = 0; i < 2 * n; i++) sl.push(C(.28 + i * .5, A * (o.mix ? .34 + r() * .2 : .44), .44, .44 / .78, { frame: 'instax', borderColor: '#fbfaf6', caption: N[i % 6].replace('\n', ' '), shadow: true, rot: o.mix ? Math.round((r() - .5) * 80) / 10 : 0 })); return { slots: sl, bg: { c1: '#ffffff' } }; }
      if (o.v === 2) return { slots: flow(n, A, o, { kinds: K_OBJ, g: .05, ins: .08, fit: 1.22, rot: 3, slot: () => ({ frame: 'instax', borderColor: '#f4f2ee', shadow: true }), salt: 4 }).slots, bg: { c1: '#1b1b1d' } };
      const sl = [], c = 2 * n, r = rng(3 + o.seed * 11);
      for (let i = 0; i < c; i++) { const j = o.v || o.mix ? 1 : 0, sc = o.mix ? .85 + r() * .25 : 1; sl.push(C((i + .5) * n / c + (o.v ? (r() - .5) * .15 : 0), A * (o.v ? .3 + r() * .4 : o.mix ? .38 + r() * .16 : .46), .36 * sc, .46 * sc, { frame: 'instax', rot: o.v ? (r() - .5) * 16 : j ? (r() - .5) * 8 : (i % 2 ? 2 : -2), shadow: true })); }
      return { slots: sl, bg: { c1: '#f6f1ea' } };
    } },
  { id: 'film', noMirror: true, cat: 'analog', name: 'Filmstreifen', desc: 'Kleinbild-Negativstreifen.', vars: ['Waagerecht', 'Zwei Streifen', 'Schräg'],
    build(n, A, o) {
      const sl = [], F = { frame: 'film', borderColor: '#161616' };
      const strip = (cy, w, off = 0, rot = 0) => { const ow = w * 1.05, cnt = Math.ceil(n / ow) + 2;
        for (let j = 0; j < cnt; j++) { const cx = ow * (j + .5) - (cnt * ow - n) / 2 + off, dy = rot ? -(cx - n / 2) * Math.tan(rot * Math.PI / 180) : 0; sl.push(C(cx, cy + dy, w, w / 1.5, { ...F, rot })); } };
      if (o.v === 0) strip(A / 2, .6);
      else if (o.v === 1) { strip(A * .29, .5); strip(A * .71, .5, .26); }
      else strip(A / 2, .72, 0, -7);
      return { slots: sl, bg: { c1: o.v === 2 ? '#e9e4da' : '#efece6', pattern: o.v === 2 ? 'paper' : 'none' } };
    } },
  { id: 'contact', noMirror: true, cat: 'analog', name: 'Kontaktabzug', desc: 'Viele kleine Negative wie auf dem Leuchttisch, mit Fettstift markiert.', vars: ['Schwarz', 'Weiß'],
    build(n, A, o) {
      const sl = [], deco = [], CF = [[2, 3], [2, 4], [3, 4], [2, 2], [3, 5], [1, 3], [3, 3], [2, 5], [1, 2], [3, 6], [1, 4]], P = pager(n, o, CF.length, 46);
      for (let i = 0; i < n; i++) {
        const [cols, rows] = CF[P(i)], r = rng(47 + i * 13 + (o.seed || 0)), fw = Math.min(.86 / cols - .04, (A - .22) / rows / .667 - .04), fh = fw * .667, page = [];
        for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) page.push(C(i + .5 + (x - (cols - 1) / 2) * (fw + .04), A / 2 + .03 + (y - (rows - 1) / 2) * (fh + .04), fw, fh, { frame: 'film', borderColor: '#161616' }));
        sl.push(...page);
        deco.push(TX('ct' + i, i + .5, .07, `STREIFZUG 400 · BLATT ${i + 1}`, { font: 'Space Mono', size: .026, color: '#e8a33a', spacing: 10 }));
        if (o.mix) { const f = page[Math.floor(r() * page.length)]; deco.push(SH('scribble', f.x + f.w / 2, f.y + f.h / 2, f.w * 1.25, f.h * 1.35, { fill: '#d23a2a', sw: 6 }));
          if (page.length > 3 && r() < .6) { const f2 = page[Math.floor(r() * page.length)]; if (f2 !== f) deco.push(TX('cx' + i, f2.x + f2.w / 2, f2.y + f2.h / 2, '✕', { font: 'Permanent Marker', size: f2.h * .5, color: '#d23a2a' })); } }
      }
      return { slots: sl, deco, bg: { c1: o.v ? '#f4f1ea' : '#141414' } };
    } },
  { id: 'booth', cat: 'analog', name: 'Fotoautomat', desc: 'Streifen mit vier Bildern.', vars: ['Ein Streifen', 'Zwei Streifen'],
    build(n, A, o) {
      const sl = [], deco = [], BC = [[[.5, -3, 1]], [[.29, 4, .8], [.71, -3, .8]], [[.32, -6, .9]], [[.2, 2, .62], [.5, -3, .62], [.8, 4, .62]], [[.68, 5, .9]], [[.35, -2, .85], [.7, 7, .7]], [[.5, 2, 1.1]],
        [[.3, 8, .8], [.72, -8, .8]], [[.58, -11, .95]], [[.26, -3, .7], [.72, 12, .75]], [[.45, 0, .8], [.78, 6, .55]]], P = pager(n, o, BC.length, 34);
      for (let i = 0; i < n; i++) {
        for (const [fx, rot, sc] of BC[o.v ? (P(i) === 0 ? 1 : P(i) === 1 ? 0 : P(i)) : P(i)]) {
          let pw = .32 * sc; const shOf = w => 4 * w * .75 + 3 * w * .09 + w * .28 + w * .75 * .35; if (shOf(pw) > A * .94) pw *= A * .94 / shOf(pw);
          const ph = pw * .75, gap = pw * .09, pad = pw * .14, cx = i + fx, cy = A / 2, sh = 4 * ph + 3 * gap + pad * 2 + ph * .35;
          deco.push(SH('rect', cx, cy, pw + pad * 2, sh, { fill: '#fbfaf6', rot, shadow: true, under: true }));
          for (let k = 0; k < 4; k++) { const py = cy - sh / 2 + pad + ph / 2 + k * (ph + gap), [x, y] = rotPt(cx, cy, cx, py, rot); sl.push(C(x, y, pw, ph, { rot })); }
        }
      }
      return { slots: sl, deco, bg: { c1: '#d9d1c4', pattern: 'paper' } };
    } },
  { id: 'dia', flow: true, cat: 'analog', name: 'Dias', desc: 'Kleinbild-Dias im Rahmen.', vars: ['Groß', 'Raster'],
    build(n, A, o) {
      return { slots: flow(n, A, o, { kinds: startAt(K_OBJ, o.v ? 'four' : 'one'), g: .05, ins: .1, fit: .667, pad: .38, rot: 4, slot: () => ({ frame: 'dia', borderColor: '#ece8de', shadow: true }), salt: 5 }).slots, bg: { c1: o.v ? '#f2efe9' : '#22262c' } };
    } },
  { id: 'scrapbook', noMirror: true, cat: 'analog', name: 'Album', desc: 'Abzüge mit Klebeband und Handschrift.', vars: ['Papier', 'Kraftpapier', 'Kariert'],
    build(n, A, o) {
      const c = Math.max(2, Math.round(n * 1.5)), sl = [], deco = [], r = rng(56 + (o.seed || 0) * 3);
      for (let i = 0; i < c; i++) {
        const ins = i % 2 === 1, sc = o.mix ? .88 + r() * .2 : 1, w = (ins ? .46 : .52) * sc, h = ins ? w / .78 : w, cx = (i + .5) * n / c + (o.mix ? (r() - .5) * .1 : 0), cy = A * (i % 2 ? .6 : .42) + (o.mix ? (r() - .5) * .14 : 0), rot = o.mix ? Math.round((r() - .5) * 160) / 10 : [-6, 4, -2, 7, -5, 3][i % 6];
        sl.push(C(cx, cy, w, h, { frame: ins ? 'instax' : 'polaroid', borderColor: '#fbfaf6', rot, shadow: true }));
        deco.push(SH('tape', cx, cy - h * .62, .2, .06, { fill: ['#f3e2b3', '#f2c6c2', '#c9dfe6'][i % 3], rot: rot + (i % 2 ? -8 : 10) }));
      }
      deco.push(TX('title', .5, A * .1, 'Unser Sommer', { font: 'Caveat', size: .11, color: o.v === 1 ? '#2a2117' : '#3a3226', rot: -3 }));
      return { slots: sl, deco, bg: o.v === 1 ? { c1: '#c8a97e', pattern: 'paper' } : o.v === 2 ? { c1: '#ffffff', pattern: 'grid' } : { c1: '#e8dcc8', pattern: 'paper' } };
    } },

  /* ---------- Editorial ---------- */
  { id: 'cover', flow: true, cat: 'edit', name: 'Titel + Galerie', desc: 'Titelseite, dann abwechslungsreiche Galerieseiten.', vars: ['Bogen', 'Kreis', 'Vollbild'],
    build(n, A, o) {
      const sl = [], deco = [];
      if (o.v === 0) sl.push(S(.19, A * .34, .62, A * .55, { shape: 'arch' }));
      else if (o.v === 1) sl.push(C(.5, A * .6, .66, .66, { shape: 'circle' }));
      else sl.push(S(0, 0, 1, A));
      sl.push(...pages(n, A, o, 1, 'airy'));
      const dark = o.v === 2;
      deco.push(TX('title', .5, dark ? A * .78 : A * .17, 'Wochenende\nam Meer', { font: 'DM Serif Display', size: .11, color: dark ? '#ffffff' : '#1d1d1d', lineH: 1.02, shadow: dark }));
      deco.push(TX('sub', .5, A * .94, 'WISCHEN →', { font: 'Space Mono', size: .032, color: dark ? '#ffffff' : '#1d1d1d', spacing: 18 }));
      return { slots: sl, deco, bg: { c1: '#f4efe6' } };
    } },
  { id: 'magazine', flow: true, cat: 'edit', name: 'Magazin', desc: 'Großes Titelbild mit Schlagzeile, dann Magazinseiten.', vars: ['Schlagzeile', 'Kapitel'],
    build(n, A, o) {
      const sl = [S(0, 0, 1, A)], deco = [TX('title', .5, A * .13, 'DER NORDEN', { font: 'Anton', size: .16, color: '#ffffff', spacing: 4 }), TX('sub', .5, A * .9, 'Eine Fotostrecke über Wind & Licht', { font: 'Playfair Display', size: .043, color: '#ffffff' })];
      const ch = o.v === 1, K = ['Notizen vom Weg', 'Wind & Wasser', 'Am Hafen', 'Nachtlicht', 'Der Rückweg', 'Salz in der Luft'];
      const F = flow(n, A, o, { from: 1, kinds: K_AIRY, g: .03, ins: ch ? [.08, .08, .08, A * .34] : [.07, .11, .07, .13], salt: 6, deco: (i, page, r, dc) => {
        dc.push(TX('p' + i, i + .5, A * .955, String(i + 1).padStart(2, '0'), { font: 'Space Mono', size: .03, color: '#1d1d1d' }));
        if (ch) dc.push(TX('k' + i, i + .5, A * .74, `Kapitel ${ROMAN[i]}`, { font: 'DM Serif Display', size: .075, color: '#1d1d1d' }), TX('kt' + i, i + .5, A * .74 + .1, K[i % K.length], { font: 'Space Mono', size: .026, color: '#6b665e', spacing: 6 }));
        else dc.push(TX('h' + i, i + .5, .055, 'DER NORDEN · WIND & LICHT', { font: 'Space Mono', size: .02, color: '#1d1d1d', spacing: 10 }));
      } });
      return { slots: [...sl, ...F.slots], deco: [...deco, ...F.deco], bg: { c1: '#ffffff' } };
    } },
  { id: 'minimal', flow: true, cat: 'edit', name: 'Galerie', desc: 'Viel Weißraum, kleine Bildunterschrift – Aufteilung wechselt.', vars: ['Klein', 'Mittel', 'Mit Datum'],
    build(n, A, o) {
      const m = o.v === 0 ? .18 : .11, T = { font: 'Space Mono', size: .026, color: '#4a463f', spacing: 8 }, cap = i => o.v === 2 ? `${today()} · ${String(i + 1).padStart(2, '0')}` : `No. ${String(i + 1).padStart(2, '0')}`;
      const F = flow(n, A, o, { kinds: K_AIRY, g: .04, ins: [m, m, m, m + .1], salt: 7, deco: (i, page, r, dc) => dc.push(TX('c' + i, i + .5, A - (m + .1) / 2, cap(i), T)) });
      return { slots: F.slots, deco: F.deco, bg: { c1: '#f4f1ea' } };
    } },
  { id: 'split', flow: true, cat: 'edit', name: 'Halb & halb', desc: 'Foto und Farbfläche mit Text.', vars: ['Links', 'Wechselnd', 'Oben'],
    build(n, A, o) {
      const sl = [], deco = [], SP = [[[0, 0, .5, 1]], [[.5, 0, .5, 1]], [[0, 0, 1, .62]], [[0, .38, 1, .62]], [[.08, .06, .84, .6]], [[0, 0, .62, 1]], [[.38, 0, .62, 1]], [[.1, .32, .8, .6]], [[0, 0, 1, .4], [0, .6, 1, .4]], [[0, 0, .5, .5], [.5, .5, .5, .5]], [[.12, .1, .76, .44], [.3, .58, .58, .34]]];
      const P = pager(n, o, SP.length, 8), st = o.v === 2 ? 2 : 0, free = rs => { // freie Fläche für den Text suchen
        const cand = [[.5, .5], [.75, .5], [.25, .5], [.5, .81], [.5, .19], [.5, .84], [.81, .5], [.19, .5], [.5, .15], [.25, .75], [.75, .25]];
        return cand.find(([cx, cy]) => !rs.some(([x, y, w, h]) => cx > x - .02 && cx < x + w + .02 && cy > y - .02 && cy < y + h + .02)) || [.5, .5]; };
      for (let i = 0; i < n; i++) {
        const k = (P(i) + st) % SP.length, rs = o.v === 0 && !o.mix ? SP[0] : SP[k];
        rs.forEach(([x, y, w, h]) => sl.push(S(i + x, y * A, w, h * A)));
        const [tx, ty] = free(rs), side = rs.length === 1 && rs[0][3] === 1;
        deco.push(TX('s' + i, i + tx, ty * A, side ? ROMAN[i] : `Kapitel ${ROMAN[i]}`, { font: 'DM Serif Display', size: side ? (rs[0][2] > .55 ? .11 : .16) : .07, color: '#f4efe6' }));
      }
      return { slots: sl, deco, bg: { c1: '#1f3a4d' } };
    } },
  { id: 'timeline', noMirror: true, cat: 'edit', name: 'Zeitstrahl', desc: 'Eine Linie verbindet alle Bilder.', vars: ['Rechteckig', 'Kreise'],
    build(n, A, o) {
      const sl = [], deco = [SH('line', n / 2, A / 2, n - .1, .008, { fill: '#1d1d1d', under: true })], c = 2 * n - 1, r = rng(45 + (o.seed || 0) * 11);
      let up = true;
      for (let i = 0; i < c; i++) {
        if (i) up = o.mix && r() < .3 ? up : !up;
        const x = .5 + i * .5, sc = o.mix ? .8 + r() * .35 : 1, w = (o.v ? .4 : .42) * sc, h = (o.v ? .4 : .52) * sc;
        sl.push(C(x, up ? A / 2 - .06 - h / 2 : A / 2 + .06 + h / 2, Math.min(w, .46), h, o.v ? { shape: 'circle', border: .012 } : { shape: 'round', radius: 5 }));
        deco.push(SH('circle', x, A / 2, .045, .045, { fill: '#1d1d1d' }), TX('d' + i, x + .1, up ? A / 2 + .045 : A / 2 - .045, `Tag ${i + 1}`, { font: 'Space Mono', size: .024, color: '#1d1d1d' }));
      }
      return { slots: sl, deco, bg: { c1: '#f4efe6' } };
    } },
  { id: 'quote', flow: true, cat: 'edit', name: 'Zitat', desc: 'Erste Slide ein Satz, dann abwechslungsreiche Bildseiten.', vars: ['Hell', 'Dunkel'],
    build(n, A, o) {
      const dark = o.v === 1, col = dark ? '#f4efe6' : '#1d1d1d', deco = [TX('q', .5, A * .46, '„Manche Tage\nmöchte man\neinrahmen.“', { font: 'Playfair Display', size: .095, color: col, lineH: 1.1 }), TX('qa', .5, A * .78, '— NOTIZ AN MICH', { font: 'Space Mono', size: .026, color: col, spacing: 12 })];
      const sl = pages(n, A, o, 1, dark ? 'bleed' : 'airy');
      if (n === 1) sl.push(C(.5, A * .9, .2, .2, { shape: 'circle' }));
      return { slots: sl, deco, bg: { c1: dark ? '#121212' : '#f4efe6' } };
    } },

  /* ---------- Papier & Notizbuch ---------- */
  { id: 'torn', flow: true, cat: 'paper', name: 'Risskanten', desc: 'Fotostücke mit zerrissenen Papierkanten.', vars: ['3 Streifen', '2 Streifen', 'Senkrecht'],
    build(n, A, o) {
      const sl = [], E = { edge: 'torn', shadow: true };
      if (o.v === 2) { const r = rng(52 + (o.seed || 0)), N = n * 2 + (o.mix ? Math.floor(n / 2) : 0), ws = Array.from({ length: N }, () => o.mix ? .5 + r() : 1), tot = ws.reduce((a, b) => a + b, 0); let x = 0; ws.forEach(f => { const w = n * f / tot; sl.push(S(x - .03, -.02, w + .06, A + .04, { ...E, edgeSides: 'lr', rot: o.mix ? (r() - .5) * 2 : 0 })); x += w; }); return { slots: sl, bg: { c1: '#ffffff' } }; }
      return { slots: flow(n, A, o, { kinds: startAt(K_GRID, o.v ? 'two_h' : 'three_rows'), g: -.035, ins: -.02, slot: () => ({ ...E }), salt: 9 }).slots, bg: { c1: '#ffffff' } };
    } },
  { id: 'tornCollage', flow: true, cat: 'paper', name: 'Zerrissene Collage', desc: 'Großes Foto, darauf gerissene Abzüge.', vars: ['Hell', 'Dunkel', "Today's dump"],
    build(n, A, o) {
      const E = { edge: 'torn', shadow: true }, deco = [];
      const F = o.v === 1 ? flow(n, A, o, { kinds: startAt(K_OBJ, 'three_rows'), g: -.02, ins: .06, rot: 3, slot: () => ({ ...E }), salt: 10 })
        : flow(n, A, o, { kinds: startAt(K_OBJ, 'offset2'), g: .02, ins: [.1, o.v === 2 ? .3 : .1, .1, .1], rot: 4, pre: i => [S(i, 0, 1, A)], slot: () => ({ ...E }), salt: 10 });
      if (o.v === 2) deco.push(TX('dump', .42, A * .12, "Today's\ndump", { font: 'Anton', size: .11, color: '#1d1d1d', bg: 'ransom', rot: -3 }));
      return { slots: F.slots, deco, bg: { c1: o.v === 1 ? '#161616' : '#f4efe6' } };
    } },
  { id: 'stamps', flow: true, cat: 'paper', name: 'Briefmarken', desc: 'Fotos mit gezacktem Briefmarkenrand.', vars: ['Raster auf Rot', 'Großmarke + Perlen', 'Blau 2×2'],
    build(n, A, o) {
      const St = { edge: 'stamp', borderColor: '#fbf8f1', shadow: true }, deco = [];
      const F = flow(n, A, o, { kinds: startAt([...K_OBJ, 'six', 'six_w'], ['six', 'one', 'four'][o.v]), g: .06, ins: o.v === 1 ? [.1, .1, .1, .3] : .1, fit: .82, rot: 3, slot: () => ({ ...St }), salt: 11 });
      if (o.v === 1) deco.push(TX('beads', .5, A * .86, 'SUMMER', { font: 'Archivo Black', size: .095, color: '#1d1d1d', bg: 'beads', bgColor: '#e4e1da', rot: -4 }));
      return { slots: F.slots, deco, bg: { c1: ['#9e2b25', '#cdd7e2', '#1f3a5f'][o.v] } };
    } },
  { id: 'deckle', flow: true, cat: 'paper', name: 'Büttenrand', desc: 'Abzüge mit fransigem Papierrand.', vars: ['Drei', 'Zwei', 'Dunkel'],
    build(n, A, o) {
      const D = { edge: 'deckle', borderColor: o.v === 2 ? '#f4f1ea' : '#ffffff' };
      return { slots: flow(n, A, o, { kinds: startAt(K_OBJ, ['three_rows', 'two_h', 'one'][o.v]), g: .05, ins: .07, rot: 1.2, slot: () => ({ ...D }), salt: 12 }).slots, bg: { c1: o.v === 2 ? '#141414' : '#ffffff' } };
    } },
  { id: 'notebook', flow: true, cat: 'paper', name: 'Notizbuch', desc: 'Spiralbindung, Fotos und kleine Notiz – jede Seite anders.', vars: ['Papier', 'Liniert', 'Kariert'],
    build(n, A, o) {
      const W = ['(Blumen)', '(Licht)', '(Meer)', '(Zuhause)', '(Morgens)', '(Wir)', '(Unterwegs)', '(Abends)', '(Sonntag)', '(Später)'], T = { font: 'Playfair Display', size: .03, color: '#3a3226' };
      const F = flow(n, A, o, { kinds: ['nbLow', ...K_AIRY.slice(0, 8), 'nbHigh', ...K_AIRY.slice(8)], g: .035, salt: 13,
        ins: k => k === 'nbLow' ? [0, A * .47, 0, 0] : k === 'nbHigh' ? [0, 0, 0, A * .47] : [.08, .17, .08, .15],
        deco: (i, page, r, dc, k) => {
          if (k === 'nbLow') dc.push(SH('spiral', i + .5, A * .47, .96, .09, {}), TX('n' + i, i + .5, A * .23, W[i % W.length], T));
          else if (k === 'nbHigh') dc.push(SH('spiral', i + .5, A * .53, .96, .09, {}), TX('n' + i, i + .5, A * .8, W[i % W.length], T));
          else dc.push(SH('spiral', i + .5, .06, .96, .09, {}), TX('n' + i, i + .5, A - .075, W[i % W.length], T));
          doodles(i, A, [...page, S(i, 0, 1, .12), S(i + .3, A - .12, .4, .12)], r, dc, 1 + Math.floor(r() * 2), '#3a3226');
        } });
      return { slots: F.slots, deco: F.deco, bg: [{ c1: '#e6dccd', pattern: 'paper' }, { c1: '#fbfaf6', pattern: 'lines' }, { c1: '#fbfaf6', pattern: 'grid' }][o.v] };
    } },
  { id: 'pinned', flow: true, cat: 'paper', name: 'Angeheftet', desc: 'Abzüge mit Büroklammer, Foldback-Klammer und Klebeband.', vars: ['Rot', 'Beige', 'Nacht'],
    build(n, A, o) {
      const ink = o.v === 1 ? '#3a3226' : '#f4efe6', B = { border: .022, borderColor: '#f7f5f0', shadow: true },
        NOTE = ['Gemacht, um erinnert zu werden', 'Kleine Dinge', 'Für später', 'Nicht vergessen', 'Lieblingstage', 'Damals im Mai', 'Nur für uns', 'Weißt du noch?', 'Ein guter Tag', 'Mehr davon'];
      const F = flow(n, A, o, { kinds: K_OBJ, g: .09, ins: [.12, .14, .12, .2], rot: 4, slot: () => ({ ...B }), salt: 14, deco: (i, page, r, dc) => {
        page.forEach(sl => attach(sl, r, dc));
        dc.push(TX('pc' + i, i + .5, A - .09, NOTE[i % NOTE.length], r() < .5 ? { font: 'Special Elite', size: .026, color: ink, spacing: 10 } : { font: 'Caveat', size: .05, color: ink }));
      } });
      return { slots: F.slots, deco: F.deco, bg: { c1: ['#7a1712', '#e8dccb', '#1b1f2a'][o.v], pattern: 'paper' } };
    } },
  { id: 'margin', flow: true, cat: 'paper', name: 'Notizrand', desc: 'Papierstreifen mit Schreibschrift am Rand.', vars: ['Links', 'Rechts', 'Spitzenrand'],
    build(n, A, o) {
      const L = o.v !== 1, TXT = ['Ein Tag im Leben', 'Kleine Fluchten', 'Nur wir zwei', 'Irgendwo am Meer', 'Langsam ankommen', 'Sommer, bleib'];
      const F = flow(n, A, o, { kinds: startAt(K_GRID, 'one'), g: .015, ins: L ? [.2, 0, 0, 0] : [0, 0, .2, 0], salt: 15, deco: (i, page, r, dc) => {
        const px = i + (L ? .1 : .9), t = TXT[i % TXT.length];
        if (o.v === 2) dc.push(SH('lace', i + .11, A / 2, .22, A + .1, { shadow: true }), TX('m' + i, i + .1, A / 2, t, { font: 'Great Vibes', size: .065, color: '#3a3226', rot: -90 }), SH('clip', i + .16, A * (.08 + r() * .1), .05, .13, { rot: 10 }));
        else dc.push(SH('paper', px, A / 2, .24, A + .1, { under: false, shadow: true }), TX('m' + i, px, A / 2, t, { font: 'Great Vibes', size: .07, color: '#3a3226', rot: -90 }),
          SH('clip', px + (L ? .05 : -.05), A * (.08 + r() * .1), .05, .13, { rot: L ? 10 : -10 }), SH('clip', px + (L ? .05 : -.05), A * (.75 + r() * .1), .05, .13, { rot: L ? -6 : 6 }));
      } });
      return { slots: F.slots, deco: F.deco, bg: { c1: '#f4f1ea' } };
    } },

  /* ---------- Kritzeleien ---------- */
  { id: 'scribble', flow: true, cat: 'doodle', name: 'Kritzel-Rahmen', desc: 'Handgezeichnete Linien um die Fotos – jede Slide anders.', vars: ['Rahmen', 'Mit Pfeil', 'Ecken'],
    build(n, A, o) {
      const K = { fill: '#1d1d1d' }, CAP = ['alles, was ich brauche', 'genau so', 'mein Lieblingsort', 'nochmal bitte', 'und dann …', 'wir', 'das hier!', 'später mehr'];
      const F = flow(n, A, o, { kinds: K_OBJ, g: .1, ins: [.12, .17, .12, .14], rot: 2, salt: 16, deco: (i, page, r, dc) => {
        page.forEach(sl => { const cx = sl.x + sl.w / 2, cy = sl.y + sl.h / 2, t = (o.v === 2 ? .5 : 0) + r();
          if (t < .55) dc.push(SH('scribble', cx, cy, sl.w + .04, sl.h + .04, { ...K, rot: sl.rot || 0 })); else if (t < 1.1) dc.push(SH('corners', cx, cy, sl.w + .08, sl.h + .08, { ...K, rot: sl.rot || 0 })); });
        if (o.v === 1 || r() < .55) dc.push(SH('scribbleArrow', i + .8, .1, .18, .09, { ...K, rot: 12 }), TX('a' + i, i + .45, .085, CAP[i % CAP.length], { font: 'Caveat', size: .045, color: '#1d1d1d', rot: -4 }));
        doodles(i, A, [...page, S(i + .2, 0, .8, .16)], r, dc, 2 + Math.floor(r() * 3));
      } });
      return { slots: F.slots, deco: F.deco, bg: { c1: '#fbfaf8' } };
    } },
  { id: 'moodboard', flow: true, cat: 'doodle', name: 'Moodboard', desc: 'Lockeres Raster mit kleinen Kritzeleien.', gap: .02, vars: ['Hell', 'Mit Zitat'],
    build(n, A, o) {
      const Q = ['so fühlt sich\nSommer an', 'weniger, aber\nbesser', 'mehr davon', 'leise Tage', 'genau richtig', 'kleine Freuden'];
      const F = flow(n, A, o, { kinds: startAt(K_GRID.filter(k => k !== 'one'), 'five'), g: o.g, ins: [.06, .06, .06, o.v ? .2 : .06], salt: 17, deco: (i, page, r, dc) => {
        for (let k = 0; k < 2; k++) { const sl = page[Math.floor(r() * page.length)]; dc.push(SH('sparkle', sl.x + (r() < .5 ? 0 : sl.w), sl.y + (r() < .5 ? 0 : sl.h), .05, .05, { outline: true, fill: '#1d1d1d', sw: 3 })); }
        if (r() < .6) { const sl = page[page.length - 1]; dc.push(SH('scribbleArrow', sl.x + sl.w * .3, sl.y - .03, .16, .08, { fill: '#1d1d1d', rot: r() * 40 - 20 })); }
        for (let k = 0; k < 2; k++) { const sl = page[Math.floor(r() * page.length)], kd = ['dHeart', 'dStar', 'dSparkles', 'dSmile', 'dSun', 'dBurst', 'dFlower'][Math.floor(r() * 7)]; dc.push(SH(kd, sl.x + sl.w * (.2 + r() * .6), sl.y + sl.h * (.2 + r() * .6), .12, .12, { fill: '#ffffff', rot: (r() - .5) * 30, sw: 6 })); }
        if (o.v) dc.push(TX('q' + i, i + .5, A - .1, Q[i % Q.length].replace('\n', ' '), { font: 'Caveat', size: .05, color: '#1d1d1d', rot: -3 }));
      } });
      return { slots: F.slots, deco: F.deco, bg: { c1: '#ffffff' } };
    } },

  { id: 'doodleDiary', flow: true, cat: 'doodle', name: 'Kritzel-Tagebuch', desc: 'Abzüge mit Washi-Tape, rundherum Herzchen, Sterne, Pfeile und Notizen.', vars: ['Papier', 'Kariert', 'Kraftpapier'],
    build(n, A, o) {
      const NOTES = ['bester Tag!', 'nochmal ♡', 'Sommer 26', 'wir zwei', 'so schön', 'hihi', 'Lieblingsort', 'mehr davon', 'never forget', 'zu Hause'], ink = o.v === 2 ? '#2a2117' : '#1d1d1d';
      const F = flow(n, A, o, { kinds: K_OBJ, g: .11, ins: [.13, .15, .13, .17], rot: 5, salt: 57, slot: () => ({ border: .018, borderColor: '#fbfaf6', shadow: true }), deco: (i, page, r, dc) => {
        page.forEach(sl => attach(sl, r, dc, 2 + Math.floor(r() * 3)));
        const t = page[Math.floor(r() * page.length)], below = t.y + t.h + .07 < A - .02;
        const nx = Math.min(i + .8, Math.max(i + .2, t.x + t.w * (.3 + r() * .4))), ny = below ? t.y + t.h + .07 : Math.max(.06, t.y - .07);
        dc.push(TX('dn' + i, nx, ny, NOTES[i % NOTES.length], { font: r() < .5 ? 'Caveat' : 'Permanent Marker', size: .045, color: ink, rot: (r() - .5) * 10 }));
        doodles(i, A, [...page, S(nx - .2, ny - .05, .4, .1)], r, dc, 4 + Math.floor(r() * 3), ink);
      } });
      return { slots: F.slots, deco: F.deco, bg: [{ c1: '#f6f1e7', pattern: 'paper' }, { c1: '#fbfbf8', pattern: 'grid' }, { c1: '#c8a97e', pattern: 'kraft' }][o.v] };
    } },
  { id: 'doodleOverlay', flow: true, cat: 'doodle', name: 'Gekritzelt aufs Foto', desc: 'Randlose Fotos, darauf weiße Filzstift-Kritzeleien und Handschrift.', vars: ['Weiß', 'Gelb', 'Schwarz'],
    build(n, A, o) {
      const ink = ['#ffffff', '#ffe066', '#1d1d1d'][o.v], W = ['so happy', 'omg', 'wir!', 'Lieblingsmensch', 'yes!', 'Urlaub', 'mood', 'lol', 'ciao', 'hallo Meer'];
      const F = flow(n, A, o, { kinds: K_BLEED, g: .01, ins: 0, salt: 58, slot: (i, j, c, r, k) => (k === 'inset' || k === 'pipc') && j ? { border: .012, borderColor: '#ffffff', shadow: true } : {}, deco: (i, page, r, dc) => {
        doodles(i, A, [], r, dc, 3 + Math.floor(r() * 3), ink, false);
        dc.push(TX('w' + i, i + .25 + r() * .5, A * (.12 + r() * .76), W[i % W.length], { font: r() < .5 ? 'Caveat' : 'Permanent Marker', size: .06, color: ink, rot: (r() - .5) * 16 }));
        if (r() < .5) { const sl = page[Math.floor(r() * page.length)]; dc.push(SH('dCircle', sl.x + sl.w * (.3 + r() * .4), sl.y + sl.h * (.3 + r() * .4), .26, .2, { fill: ink, sw: 6 })); }
      } });
      return { slots: F.slots, deco: F.deco, bg: { c1: '#111111' } };
    } },

  /* ---------- weitere Raster & Editorial ---------- */
  { id: 'textGrid', flow: true, cat: 'grid', name: 'Raster mit Worten', desc: 'Fotos und Wörter im Schachbrett.', vars: ['Satz', 'Nummeriert', 'Mittelspalte'],
    build(n, A, o) {
      const sl = [], deco = [], words = ['Hallo,', 'mein', 'liebster', 'Sommer', 'bisher.', 'Danke', 'für', 'alles', '♡'];
      const TG = [[1, 3, 5, 7], [1, 4, 7], [3, 4, 5], [0, 4, 8], [2, 4, 6], [0, 2, 6, 8], [4], [0, 1, 2], [6, 7, 8], [1, 5, 6], [0, 5, 7]], P = pager(n, o, TG.length, 18);
      let wi = 0, num = 1; const cw = 1 / 3, ch = A / 3;
      for (let i = 0; i < n; i++) { const m = TG[(P(i) + (o.v === 2 ? 1 : 0)) % TG.length];
        for (let k = 0; k < 9; k++) {
          const x = i + (k % 3) * cw, y = Math.floor(k / 3) * ch;
          if (m.includes(k)) deco.push(TX('w' + i + k, x + cw / 2, y + ch / 2, o.v === 1 ? `(${String(num++).padStart(2, '0')})` : words[wi++ % words.length], { font: o.v === 1 ? 'Space Mono' : 'Playfair Display', size: o.v === 1 ? .022 : .03, color: '#2b2b2b' }));
          else sl.push(S(x, y, cw, ch));
        } }
      return { slots: sl, deco, bg: { c1: '#f6f5f2' } };
    } },
  { id: 'diagonal', noMirror: true, cat: 'grid', name: 'Schräge Collage', desc: 'Gekipptes Raster mit Schreibschrift-Feld.', gap: .02, vars: ['Links geneigt', 'Rechts geneigt'],
    build(n, A, o) {
      const a = o.v ? 16 : -24, g = Math.max(.012, o.g), cw = .78, rh = .62, cx0 = n / 2, cy0 = A / 2, sl = [], deco = [];
      let best = null;
      for (let j = -6; j <= Math.ceil(n / cw) + 6; j++) for (let k = -4; k <= 6; k++) {
        const u = (j - Math.ceil(n / cw) / 2) * (cw + g) + (k % 2 ? cw / 2 : 0), v = (k - 1) * (rh + g), [x, y] = rotPt(cx0, cy0, cx0 + u, cy0 + v, a);
        if (x < -.45 || x > n + .45 || y < -.4 || y > A + .4) continue;
        const sl0 = C(x, y, cw, rh, { rot: a }); sl.push(sl0);
        const d = Math.hypot(x - .45, y - A * .45); if (!best || d < best.d) best = { d, s: sl0 };
      }
      if (best) { sl.splice(sl.indexOf(best.s), 1); const b = best.s;
        deco.push(SH('rect', b.x + b.w / 2, b.y + b.h / 2, cw, rh, { fill: '#f4f3ef', rot: a, under: true }), TX('dt', b.x + b.w / 2, b.y + b.h / 2, 'Meine liebsten\nMomente 2026', { font: 'Great Vibes', size: .07, color: '#2b2b2b', rot: a, lineH: 1.1 })); }
      return { slots: sl, deco, bg: { c1: '#ffffff' } };
    } },
  { id: 'pip', flow: true, cat: 'pano', name: 'Bild im Bild', desc: 'Foto als Hintergrund, darauf gerahmte Fotos.', vars: ['Mittig', 'Versetzt', 'Zwei nebeneinander'],
    build(n, A, o) {
      const F = { border: .012, borderColor: '#ffffff', shadow: true }, KP = ['center', 'offset2', 'two_v', 'big_left', 'tall', 'two_h', 'wide', 'trio_t', 'cascade3', 'big_top', 'trio_l'];
      return { slots: flow(n, A, o, { kinds: startAt(KP, ['center', 'big_left', 'two_v'][o.v]), g: .05, ins: .15, rot: 2, pre: i => [S(i, 0, 1, A)], slot: () => ({ ...F }), salt: 19 }).slots };
    } },
  { id: 'poster', flow: true, cat: 'edit', name: 'Filmplakat', desc: 'Titel, Lorbeerkränze und Abspann, dann Filmszenen.', vars: ['Klassisch', 'Schreibschrift'],
    build(n, A, o) {
      const sl = [S(0, 0, 1, A)], deco = [], col = o.v ? '#d9b8e8' : '#ffffff';
      [.3, .5, .7].forEach((x, k) => deco.push(SH('laurel', x, A * .33, .17, .13, { fill: '#ffffff' }), TX('lw' + k, x, A * .33, ['KAMERA\nROLLE', 'BESTER\nTAG', 'SCHÖNE\nMOMENTE'][k], { font: 'Bebas Neue', size: .018, color: '#ffffff', lineH: 1 })));
      deco.push(TX('pt', .5, A * .6, o.v ? 'Hamburg' : 'HAMBURG', { font: o.v ? 'Great Vibes' : 'DM Serif Display', size: o.v ? .14 : .16, color: col }),
        TX('pd', .62, A * .5, today().toUpperCase(), { font: 'Bebas Neue', size: .055, color: col }),
        TX('pc', .5, A * .91, 'EIN FILM VON DIR · KAMERA STREIFZUG · MUSIK VOM WIND\nIN DEN HAUPTROLLEN: SONNE, MEER UND EIN BISSCHEN REGEN\nDEMNÄCHST IN EINEM KARUSSELL IN DEINER NÄHE', { font: 'Bebas Neue', size: .016, color: '#ffffff', lineH: 1.2, spacing: 6 }));
      const F = flow(n, A, o, { from: 1, kinds: ['one', 'wide', 'two_h', 'inset', 'three_rows', 'trio_l', 'pipc', 'two_v', 'four', 'big_top', 'trio_b'], g: .012, salt: 20,
        ins: k => k === 'wide' ? [0, A * .12, 0, A * .12] : 0, slot: (i, j, c, r, k) => (k === 'inset' || k === 'pipc') && j ? { border: .01, borderColor: '#ffffff', shadow: true } : {},
        deco: (i, page, r, dc) => dc.push(TX('pk' + i, i + .5, A * .965, `SZENE ${i + 1} · ${today().toUpperCase()}`, { font: 'Bebas Neue', size: .02, color: '#ffffff', spacing: 20, shadow: true })) });
      return { slots: [...sl, ...F.slots], deco: [...deco, ...F.deco], bg: { c1: '#111111' } };
    } },
  { id: 'ovalNoir', flow: true, cat: 'edit', name: 'Kino-Oval', desc: 'Ovale und Bögen auf Schwarz, leise Typo.', vars: ['Oval', 'Bogen'],
    build(n, A, o) {
      const L = ['DIE SCHÖNHEIT', 'NUR EIN', 'LEISE', 'AM ENDE', 'IRGENDWO', 'NOCH EINMAL'], R = ['DER KLEINEN DINGE', 'MOMENT', 'TAGE', 'DES TAGES', 'DAZWISCHEN', 'BITTE'], T = { font: 'Space Mono', size: .018, color: '#e9e6df', spacing: 8 };
      const F = flow(n, A, o, { kinds: K_AIRY, g: .05, ins: [.08, .06, .08, .22], salt: 21, slot: (i, j, c, r) => ({ shape: (o.v + j + i) % 2 ? 'arch' : 'circle' }),
        deco: (i, page, r, dc) => dc.push(TX('l' + i, i + .19, A * .9, L[i % 6], T), TX('r' + i, i + .78, A * .9, R[i % 6], T)) });
      return { slots: F.slots, deco: F.deco, bg: { c1: '#0b0b0b' } };
    } },
  { id: 'notes', flow: true, cat: 'edit', name: 'Reisenotizen', desc: 'Randlose Fotos mit kleinen Schreibmaschinen-Notizen.', vars: ['Notizen', 'Mit Rahmenlinie'],
    build(n, A, o) {
      const deco = [], T = { font: 'Space Mono', color: '#ffffff', shadow: true };
      const sl = pages(n, A, o, 0, 'bleed', { salt: 22 });
      for (let i = 0; i < n; i++) {
        deco.push(TX('t1' + i, i + .82, .08, 'REISEARCHIV', { ...T, size: .016, spacing: 20 }),
          TX('t2' + i, i + .2, A * .32, `FILMROLLE 0${(i % 9) + 1}\nORTSZEIT ${13 + i}:4${i % 10}\nUNTERWEGS: ZU FUSS`, { ...T, size: .015, lineH: 1.35 }),
          TX('t3' + i, i + .78, A * .66, 'NOTIZEN AUS\nDER STADT', { ...T, size: .028, lineH: 1.1, spacing: 6 }),
          TX('t4' + i, i + .78, A * .94, `ORTSMARKE · ${['53°33′N', '48°08′N', '52°31′N', '50°56′N'][i % 4]}`, { ...T, size: .014, spacing: 10 }));
        if (o.v) deco.push(SH('frame', i + .5, A / 2, .92, A - .08, { fill: '#ffffff', sw: 3 }));
      }
      return { slots: sl, deco, bg: { c1: '#111111' } };
    } },
  { id: 'scriptTitle', flow: true, cat: 'edit', name: 'Schreibschrift-Titel', desc: 'Geschwungener Titel über geteiltem Bild.', vars: ['Geteilt', 'Vollbild'],
    build(n, A, o) {
      const sl = o.v ? [S(0, 0, 1, A)] : [S(0, 0, .5, A), S(.5, 0, .5, A)], deco = [];
      sl.push(...pages(n, A, o, 1, 'bleed', { salt: 23 }));
      deco.push(TX('st', .48, A * .36, 'Langsame Tage', { font: 'Great Vibes', size: .13, color: '#f4e7b4', rot: -7, shadow: true }), TX('ss', .36, A * .44, 'AUF EINER INSEL', { font: 'Playfair Display', size: .032, color: '#f4e7b4', spacing: 4, shadow: true }));
      return { slots: sl, deco, bg: { c1: '#111111' } };
    } },
  { id: 'filmV', flow: true, cat: 'analog', name: 'Filmstreifen hoch', desc: 'Kleinbildstreifen im Hochformat.', vars: ['Großes Bild', 'Drei Bilder', 'Randlos'],
    build(n, A, o) {
      const sl = [], F = { frame: 'filmv', borderColor: '#161616' };
      if (o.v === 2) { const r = rng(53 + (o.seed || 0)); for (let i = 0; i < n; i++) { const two = o.mix && i && r() < .4; if (two) sl.push(C(i + .27, A / 2, .44, A * .8, { ...F, rot: -1 - r() * 3 }), C(i + .73, A / 2, .44, A * .8, { ...F, rot: 1 + r() * 3 })); else sl.push(C(i + .5, A / 2, 1 / 1.3, A / 1.05, { ...F, rot: o.mix && i ? (r() - .5) * 4 : 0 })); } return { slots: sl }; }
      return { slots: flow(n, A, o, { kinds: startAt(K_OBJ, o.v ? 'three_rows' : 'one'), g: .06, ins: [.12, .07, .12, .07], rot: 2, slot: () => ({ ...F, shadow: true }), salt: 24 }).slots, bg: { c1: o.v ? '#e9e4da' : '#efece6', pattern: 'paper' } };
    } },

  /* ---------- Collage ---------- */
  { id: 'party', cat: 'collage', name: 'Party-Collage', desc: 'Fotostreifen, Sofortbild, Sticker und Glitzersterne.', vars: ['Nacht', 'Hell'],
    build(n, A, o) {
      const sl = [], deco = [], dark = !o.v;
      for (let i = 0; i < n; i++) {
        const r = rng(40 + i * 13 + (o.seed || 0) * 7), L = !o.mix || i === 0 || r() < .5, sx = L ? .02 : .48, ox = L ? 0 : -.44, k = o.mix ? 2 + Math.floor(r() * 3) : 3, swap = o.mix && r() < .5;
        deco.push(SH('paper', i + sx + .28, A * .5, .6, A * 1.02, { fill: dark ? '#1b1b1b' : '#efe9de', rot: (r() - .5) * 6, under: true }));
        for (let j = 0; j < k; j++) sl.push(S(i + sx, .04 + j * ((A - .08) / k), .5, (A - .08) / k - .02, { look: 'trix', border: .008, borderColor: '#151515' }));
        sl.push(C(i + .72 + ox, A * (swap ? .74 : .36), .44, .44, { frame: 'polaroid', rot: (r() - .5) * 16, shadow: true }));
        sl.push(C(i + .7 + ox, A * (swap ? .3 : .76), .56, A * .4, { sticker: true, border: .02, borderColor: '#ffffff', shadow: true, rot: (r() - .5) * 10 }));
        for (let s2 = 0; s2 < 3 + Math.floor(r() * 3); s2++) deco.push(SH('starSticker', i + .05 + r() * .9, A * (.05 + r() * .9), .05 + r() * .04, .05 + r() * .04, { rot: r() * 60 }));
        if (i === 0) deco.push(TX('pt', .72, A * .07, 'Alles Liebe\nzum Geburtstag!', { font: 'Great Vibes', size: .06, color: dark ? '#ffffff' : '#2b2b2b', rot: -8, lineH: 1 }));
      }
      return { slots: sl, deco, bg: { c1: dark ? '#0f0f10' : '#ffffff', pattern: dark ? 'none' : 'crumpled' } };
    } },
  { id: 'spots', cat: 'collage', name: 'Orte-Collage', desc: 'Überlappende Fotos mit 📍-Ortsmarken.', vars: ['Hell', 'Herbst'],
    build(n, A, o) {
      const sl = [], deco = [], P = ['Gemütliches Café', 'Kürbisfeld', 'Lieblingsplatz', 'Wochenmarkt', 'Am Hafen', 'Altstadt', 'Buchladen', 'Seeufer', 'Aussichtspunkt', 'Bäckerei'], B = { border: .012, borderColor: '#ffffff' };
      for (let i = 0; i < n; i++) {
        const r = rng(60 + i * 17 + (o.seed || 0) * 5), cnt = o.mix ? 4 + Math.floor(r() * 4) : 6;
        const rs = partition([i + .05, .05, .9, A - .1], cnt, .0, r).map(([x, y, w, h]) => { const e = .04 + r() * .04; return S(x - e / 2 + (r() - .5) * .03, y - e / 2 + (r() - .5) * .03, w + e, h + e, { ...B, shadow: r() < .4 }); });
        sl.push(...rs);
        const a = rs[Math.floor(r() * rs.length)], b = rs[Math.floor(r() * rs.length)];
        deco.push(TX('p' + i, a.x + a.w / 2, a.y + a.h * .3, P[(i * 2) % P.length], { font: 'Instrument Sans', size: .022, color: '#1d1d1d', bg: 'pin' }));
        if (b !== a) deco.push(TX('q' + i, b.x + b.w / 2, b.y + b.h * .7, P[(i * 2 + 1) % P.length], { font: 'Instrument Sans', size: .022, color: '#1d1d1d', bg: 'pin' }));
      }
      return { slots: sl, deco, bg: { c1: o.v ? '#f3ece2' : '#ffffff', pattern: o.v ? 'kraft' : 'none' } };
    } },
  { id: 'overlapCols', cat: 'collage', name: 'Überlappende Spalten', desc: 'Spalten, Fotos schieben sich übereinander.', vars: ['Locker', 'Dicht'],
    build(n, A, o) {
      const sl = [], B = { border: .01, borderColor: '#ffffff', shadow: !!o.v };
      for (let i = 0; i < n; i++) {
        const r = rng(80 + i * 19 + (o.seed || 0) * 3), cols = o.mix && i && r() < .35 ? 3 : 2, cw = .88 / cols;
        for (let c = 0; c < cols; c++) {
          const k = (o.v ? 4 : 3) + (o.mix && i ? Math.floor(r() * 2) - (c % 2) : 0), h = (A - .1) / k + .08, off = r() * .06;
          for (let j = 0; j < k; j++) sl.push(S(i + .06 + c * cw + ((j + c) % 2) * .03 - .015, .05 + off * (c % 2) + j * (A - .1 - h - off) / Math.max(1, k - 1), cw, h, B));
        }
      }
      return { slots: sl, bg: { c1: '#ffffff' } };
    } },
  { id: 'stack', flow: true, cat: 'collage', name: 'Stapel auf Foto', desc: 'Randloses Foto, darauf versetzte Abzüge.', vars: ['Drei', 'Zwei groß'],
    build(n, A, o) {
      const B = { border: .01, borderColor: '#ffffff', shadow: true };
      return { slots: flow(n, A, o, { kinds: startAt(K_OBJ, o.v ? 'two_h' : 'cascade3'), g: .05, ins: .11, rot: 4, pre: i => [S(i, 0, 1, A)], salt: 25,
        slot: (i, j, c, r, k) => k === 'one' ? { ...B, frame: 'polaroid' } : { ...B } }).slots };
    } },
  { id: 'tornReveal', cat: 'paper', name: 'Riss-Übergang', desc: 'Ein gerissener Rand gibt das nächste Foto frei.', vars: ['Rechts', 'Mit Rissspalte'],
    build(n, A, o) {
      const sl = [];
      for (let i = 0; i < n; i++) {
        const r = rng(90 + i * 7 + (o.seed || 0)), w = o.mix && i ? .62 + r() * .3 : .9, horiz = o.mix && i && r() < .3;
        if (horiz) { const h = A * (.5 + r() * .25); sl.push(S(i, h - .1, 1, A - h + .1), S(i, -.01, 1, h, { edge: 'torn', edgeSides: 'b', shadow: true })); }
        else { sl.push(S(i + w - .2, 0, 1.2 - w, A)); sl.push(S(i - .01, 0, w, A, { edge: 'torn', edgeSides: 'r', shadow: true })); }
        if (o.v) sl.push(C(i + .9, A * (.2 + r() * .2), .34, A * .3, { edge: 'torn', shadow: true, rot: 3 }), C(i + .92, A * (.65 + r() * .15), .32, A * .3, { edge: 'torn', shadow: true, rot: -2 }));
      }
      return { slots: sl };
    } },
  { id: 'postedDeleted', cat: 'grid', name: 'Gepostet vs. gelöscht', desc: 'Das eine Bild – und all die anderen.', fill: 'repeat', gap: .006, vars: ['Raster', 'Groß'],
    build(n, A, o) {
      const sl = [], deco = [], g = o.g, CF = o.v ? [[3, 6], [2, 4], [3, 5], [2, 5], [4, 6], [2, 3], [3, 4], [4, 7], [2, 6], [3, 7]] : [[3, 9], [4, 10], [3, 8], [4, 9], [3, 7], [5, 12], [3, 10], [4, 8], [2, 7], [4, 11]], P = pager(n, o, CF.length, 49);
      for (let i = 0; i < n; i++) {
        const [cols, rows] = CF[P(i)], left = !o.mix || i % 2 === 0, bx = i + (left ? .5 : 0), cw = (.5 - g * (cols + 1)) / cols, ch = (A - g * (rows + 1)) / rows;
        sl.push(S(i + (left ? 0 : .5), 0, .5, A));
        for (let r2 = 0; r2 < rows; r2++) for (let c = 0; c < cols; c++) { const x = bx + g + c * (cw + g), y = g + r2 * (ch + g); sl.push(S(x, y, cw, ch)); deco.push(SH('check', x + cw - .022, y + ch - .022, Math.min(.028, cw * .3), Math.min(.028, cw * .3), {})); }
        deco.push(TX('pp' + i, i + (left ? .25 : .75), A * .52, 'gepostet', { font: 'Instrument Sans', size: .028, color: '#ffffff', shadow: true }), TX('pd' + i, i + (left ? .75 : .25), A * .52, 'gelöscht', { font: 'Instrument Sans', size: .028, color: '#ffffff', shadow: true }));
      }
      return { slots: sl, deco, bg: { c1: '#ffffff' } };
    } },

  /* ---------- weitere Editorial ---------- */
  { id: 'titleCenter', flow: true, cat: 'edit', name: 'Titel mittig', desc: 'Kleiner, edler Titel in der Bildmitte.', vars: ['Erinnerungen', 'Mit Rahmenlinie', 'Mit Untertitel'],
    build(n, A, o) {
      const sl = [S(0, 0, 1, A)], deco = [];
      sl.push(...pages(n, A, o, 1, 'bleed', { salt: 26 }));
      if (o.v === 1) for (let i = 0; i < n; i++) deco.push(SH('frame', i + .5, A / 2, .9, A - .1, { fill: '#ffffff', sw: 3 }));
      if (o.v === 2) deco.push(TX('t1', .5, A * .44, 'Herbstbilder', { font: 'Playfair Display', size: .055, color: '#ffffff', shadow: true }), TX('t2', .5, A * .48, 'AUFGENOMMEN AUF FILM', { font: 'Instrument Sans', size: .014, color: '#ffffff', spacing: 12, shadow: true }));
      else deco.push(TX('t1', .5, A * .43, 'HERBST', { font: 'Instrument Sans', size: .016, color: '#ffffff', spacing: 30, shadow: true }), TX('t2', .5, A * .47, 'ERINNERUNGEN', { font: 'DM Serif Display', size: .06, color: '#ffffff', spacing: 2, shadow: true }));
      return { slots: sl, deco, bg: { c1: '#111111' } };
    } },
  { id: 'framePeek', cat: 'seam', name: 'Rand mit Vorschau', desc: 'Weißer Rand, das nächste Foto lugt über die Naht.', vars: ['Mit Titel', 'Ohne Titel'],
    build(n, A, o) {
      const sl = [], deco = [], r = rng(48 + (o.seed || 0) * 3);
      for (let i = 0; i < n; i++) { if (!i) { sl.push(S(.04, .04, .82, A - .08)); continue; }
        const t = o.mix ? .04 + r() * A * .12 : .1, b = o.mix ? .04 + r() * A * .12 : .1, w = o.mix ? .8 + r() * .14 : .9, x0 = o.mix ? -.08 - r() * .12 : -.14;
        sl.push(S(i + x0, t, w, A - t - b, { shadow: true })); }
      if (!o.v) deco.push(TX('t1', .45, A * .42, 'Herbstbilder', { font: 'Playfair Display', size: .05, color: '#ffffff', shadow: true }), TX('t2', .45, A * .46, 'AUFGENOMMEN AUF FILM', { font: 'Instrument Sans', size: .013, color: '#ffffff', spacing: 12, shadow: true }));
      return { slots: sl, deco, bg: { c1: '#ffffff' } };
    } },
  { id: 'keyline', flow: true, cat: 'edit', name: 'Feine Linie', desc: 'Viel Weiß, Fotos mit Haarlinie – Anordnung wechselt.', vars: ['Schwarz', 'Abgesetzt'],
    build(n, A, o) {
      const K = { keyline: '#111111', keylineGap: o.v ? .02 : 0 };
      return { slots: [C(.5, A / 2, .84, A - .2, K), ...pages(n, A, o, 1, 'airy', { card: K, salt: 27 })], bg: { c1: '#fbfbfa' } };
    } },
  { id: 'handCaption', flow: true, cat: 'edit', name: 'Handnotiz', desc: 'Fotos mit handschriftlicher Zeile.', vars: ['Unten', 'Oben'],
    build(n, A, o) {
      const sl = [S(0, 0, 1, A)], deco = [], N = ['Hamburg, auf 35mm', 'Sonntagmorgen', 'irgendwo im Norden', 'Licht um halb acht', 'der Weg nach Hause', 'kurz vor Regen', 'noch ein Kaffee', 'Ebbe', 'zurück in der Stadt', 'wir drei'];
      sl.push(...pages(n, A, o, 1, 'bleed', { salt: 28 }));
      for (let i = 0; i < n; i++) deco.push(TX('h' + i, i + .5, o.v ? A * .08 : A * .93, N[i % N.length], { font: 'Caveat', size: .05, color: '#ffffff', shadow: true }));
      return { slots: sl, deco, bg: { c1: '#2b2b2b' } };
    } },
  { id: 'bigWord', flow: true, cat: 'edit', name: 'Großes Wort', desc: 'Foto im Foto, darüber ein großes Wort.', vars: ['okt🌼ber', 'SOMMER', 'hallo'],
    build(n, A, o) {
      const sl = [], deco = [], IN = [[.5, .5, .7, .76, {}], [.5, .52, .66, .66, { shape: 'arch' }], [.5, .5, .62, .5, { shape: 'circle', square: 1 }], [.36, .4, .5, .5, { border: .012, borderColor: '#ffffff', shadow: true, rot: -3 }],
        [.5, .48, .56, .56, { frame: 'polaroid', rot: 4, shadow: true, square: 1 }], [.5, .5, .4, .84, {}], [.5, .5, .86, .4, {}], [.64, .62, .5, .54, { shape: 'round', radius: 18 }], [.5, .5, .74, .62, { edge: 'deckle', borderColor: '#ffffff' }], [.4, .55, .56, .7, { edge: 'torn', shadow: true }]], P = pager(n, o, IN.length, 29);
      for (let i = 0; i < n; i++) { const [cx, cy, w, h, st] = IN[P(i)], { square, ...rest } = st; sl.push(S(i, 0, 1, A)); sl.push(C(i + cx, A * cy, w, square ? w : A * h, rest)); }
      deco.push(TX('w', .5, A * .52, ['okt🌼ber', 'SOMMER', 'hallo'][o.v], { font: o.v === 1 ? 'Anton' : 'DM Serif Display', size: .2, color: '#f6efdc', shadow: true, spacing: o.v === 1 ? 4 : 0 }));
      return { slots: sl, deco };
    } },
  { id: 'travelFrame', flow: true, cat: 'edit', name: 'Reise-Rahmen', desc: 'Schmaler Rand, Ort und Bildnummer.', vars: ['Weiß', 'Creme'],
    build(n, A, o) {
      const ink = '#3a3226', O = ['Rom, 2026', 'Lissabon', 'Kopenhagen', 'Wien', 'Paris', 'Porto', 'Triest', 'Bergen', 'Sevilla', 'Krakau'];
      const F = flow(n, A, o, { kinds: startAt(K_GRID, 'one'), g: .025, ins: [.025, .025, .025, .09], salt: 30, deco: (i, page, r, dc) =>
        dc.push(TX('o' + i, i + .14, A - .032, O[i % O.length], { font: 'Caveat', size: .03, color: ink }), TX('n' + i, i + .93, A - .032, String(i + 1).padStart(2, '0'), { font: 'Special Elite', size: .022, color: ink })) });
      return { slots: F.slots, deco: F.deco, bg: { c1: o.v ? '#efe8da' : '#ffffff', pattern: o.v ? 'paper' : 'none' } };
    } },
  { id: 'boothOnPhoto', cat: 'analog', name: 'Fotostreifen auf Foto', desc: 'Schwarz-weißer Fotostreifen auf einem Stimmungsbild.', vars: ['Mit Blättern', 'Ohne'],
    build(n, A, o) {
      const sl = [], deco = [];
      for (let i = 0; i < n; i++) {
        const r = rng(100 + i * 11 + (o.seed || 0) * 9), m = o.mix && i > 0;
        sl.push(S(i, 0, 1, A));
        const cnt = m && r() < .4 ? 3 : 4, cx = i + (m ? .3 + r() * .4 : .5), rot = m ? (r() - .5) * 14 : (i % 2 ? 2 : -2), pw = (m ? .3 + r() * .08 : .36) * (cnt === 3 ? 1.12 : 1), ph = pw * .8, sh = cnt * ph + (cnt - 1) * .015 + .06;
        deco.push(SH('rect', cx, A / 2, pw + .05, sh, { fill: '#111111', rot, shadow: true, after: sl.length - 1 }));
        for (let k = 0; k < cnt; k++) { const [x, y] = rotPt(cx, A / 2, cx, A / 2 - sh / 2 + .03 + ph / 2 + k * (ph + .015), rot); sl.push(C(x, y, pw, ph, { rot, look: 'trix' })); }
        if (!o.v) deco.push(SH('leaves', i + .5, A / 2, .95, A * .9, {}));
        const tx = cx - i < .5 ? i + .8 : i + .22;
        deco.push(TX('b' + i, tx, A * (.6 + r() * .25), ['Herbst\nromantisieren,\nTag 1', 'kleine\nPause', 'mit dir', 'Tag 2', 'warm\nanziehen', 'Lieblings-\nmenschen'][i % 6], { font: 'Caveat', size: .032, color: '#ffffff', rot: -8, shadow: true, lineH: 1 }));
      }
      return { slots: sl, deco };
    } },

  /* ---------- Formen ---------- */
  { id: 'circles', noMirror: true, cat: 'shape', name: 'Kreise', desc: 'Runde Ausschnitte mit Rand.', vars: ['Welle', 'Groß & klein', 'Verschieden'],
    build(n, A, o) {
      const sl = [], B = { shape: 'circle', border: .02, shadow: true };
      if (o.v === 0) { const c = n + 1; for (let i = 0; i < c; i++) sl.push(C(.5 + i * (n - 1) / Math.max(1, c - 1), A * (i % 2 ? .6 : .4), .62, .62, B)); }
      else if (o.v === 1) { const r = rng(55 + (o.seed || 0)); for (let i = 0; i < n; i++) { const d = o.mix ? .6 + r() * .2 : .74; sl.push(C(i + .5 + (o.mix ? (r() - .5) * .14 : 0), o.mix ? d / 2 + .05 + r() * (A - d - .4) : A * .42, d, d, B)); } for (const x of seams(n)) if (n > 1) { const d = o.mix ? .22 + r() * .14 : .3; sl.push(C(x, o.mix ? A * (.72 + r() * .14) : A * .82, d, d, B)); } }
      else { const r = rng(21 + o.seed * 3), c = 2 * n; for (let i = 0; i < c; i++) { const d = .3 + r() * .4; sl.push(C((i + .5) * n / c, d / 2 + .05 + r() * (A - d - .1), d, d, B)); } }
      return { slots: sl, bg: { c1: '#ffffff' } };
    } },
  { id: 'arches', noMirror: true, cat: 'shape', name: 'Bögen', desc: 'Fotos in Bogenform.', vars: ['Einzeln', 'Gestaffelt'],
    build(n, A, o) {
      const sl = [];
      if (!o.v) return { slots: flow(n, A, o, { kinds: K_OBJ, g: .05, ins: .09, fit: 1.25, slot: () => ({ shape: 'arch' }), salt: 31 }).slots, bg: { c1: '#f1e7da' } };
      { const r = rng(54 + (o.seed || 0)); for (let i = 0; i < 2 * n - 1; i++) { const sc = o.mix ? .8 + r() * .25 : 1; sl.push(S(.26 + i * .5 + (1 - sc) * .24, o.mix ? .04 + r() * (A - .82 * sc - .08) : i % 2 ? A * .3 : A * .06, .48 * sc, .78 * sc, { shape: 'arch', shadow: true })); } }
      return { slots: sl, bg: { c1: '#f1e7da' } };
    } },
  { id: 'hearts', noMirror: true, cat: 'shape', name: 'Herzen', desc: 'Fotos in Herzform.', vars: ['Einzeln', 'Verstreut'],
    build(n, A, o) {
      if (!o.v) return { slots: flow(n, A, o, { kinds: K_OBJ, g: .03, ins: .07, fit: .9, rot: 6, slot: () => ({ shape: 'heart', shadow: true }), salt: 32 }).slots, bg: { c1: '#f7e1e6' } };
      const sl = [], r = rng(31 + o.seed), c = 2 * n; for (let i = 0; i < c; i++) sl.push(C((i + .5) * n / c, A * (.3 + r() * .4), .46, .41, { shape: 'heart', rot: (r() - .5) * 24, shadow: true }));
      return { slots: sl, bg: { c1: '#f7e1e6' } };
    } },
  { id: 'blobs', noMirror: true, cat: 'shape', name: 'Organisch', desc: 'Weiche, freie Formen.', vars: ['Welle', 'Einzeln'],
    build(n, A, o) {
      const sl = [];
      if (!o.v) { const c = n + 1; for (let i = 0; i < c; i++) sl.push(C(.5 + i * (n - 1) / Math.max(1, c - 1), A * (i % 2 ? .62 : .38), .64, .64, { shape: 'blob', rot: i * 40 })); }
      else return { slots: flow(n, A, o, { kinds: K_OBJ, g: .03, ins: .06, fit: 1, slot: (i, j) => ({ shape: 'blob', rot: (i * 3 + j) * 47 % 360 }), salt: 33 }).slots, bg: { c1: '#e9efe6' } };
      return { slots: sl, bg: { c1: '#e9efe6' } };
    } },
  { id: 'mix', noMirror: true, cat: 'shape', name: 'Formen-Mix', desc: 'Kreis, Bogen, Herz und Stern im Wechsel.', vars: ['Bunt', 'Ruhig'],
    build(n, A, o) {
      const K = o.v ? ['circle', 'arch', 'round'] : ['circle', 'arch', 'heart', 'star', 'blob', 'round'], c = n + 1, sl = [];
      for (let i = 0; i < c; i++) sl.push(C(.5 + i * (n - 1) / Math.max(1, c - 1), A * (i % 2 ? .6 : .4), .58, .58 * (K[i % K.length] === 'arch' ? 1.25 : 1), { shape: K[i % K.length], radius: 12, rot: o.v ? 0 : (i % 2 ? 6 : -6), shadow: true }));
      return { slots: sl, bg: { c1: o.v ? '#ffffff' : '#f2c14e' } };
    } }
];
const byId = Object.fromEntries(TEMPLATES.map(t => [t.id, t]));
export const tplDef = id => byId[id];

/* ---------- Vorschau-Grafik direkt aus dem Bauplan ---------- */
export function tplSVG(id, v = 0, n = 3) {
  const T = byId[id], A = 1.25, U = 40, L = vary(T.build(n, A, { v, g: T.gap ?? .025, seed: 0, k: 6, mix: true }), n, { seed: 0, mix: true }, T), W = n * U, H = A * U;
  const ph = 'var(--muted)', ac = 'var(--accent)';
  let s = `<defs><linearGradient id="pg${id}${v}" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${W}" y2="${H}"><stop offset="0" stop-color="#e08a5c"/><stop offset=".5" stop-color="#7a5b86"/><stop offset="1" stop-color="#2f4a6b"/></linearGradient></defs>`;
  s += `<rect width="${W}" height="${H}" fill="${L.bg?.c1 || 'var(--line)'}"/>`;
  const tf = (o, cx, cy) => o.rot ? ` transform="rotate(${o.rot} ${cx} ${cy})"` : '';
  const deco = (d) => {
    const cx = d.x * U, cy = d.y * U;
    if (d.t === 'text') { const lines = d.text.split('\n'), lh = d.size * U * 1.1, wmax = Math.max(...lines.map(t => t.length)) * d.size * U * .48;
      return lines.map((t, i) => `<rect x="${cx - wmax / 2}" y="${cy - lines.length * lh / 2 + i * lh + lh * .2}" width="${wmax * t.length / Math.max(...lines.map(q => q.length))}" height="${lh * .55}" rx="1" fill="${d.color}"${tf(d, cx, cy)}/>`).join(''); }
    const w = d.w * U, h = d.kind === 'line' ? Math.max(1, d.h * U) : d.h * U;
    if (/^(scribble|corners|scribbleArrow|frame)$/.test(d.kind)) return `<rect x="${cx - w / 2}" y="${cy - h / 2}" width="${w}" height="${h}" fill="none" stroke="${d.fill || '#1d1d1d'}" stroke-width="1"${d.kind === 'corners' ? ' stroke-dasharray="4 12"' : ''}${tf(d, cx, cy)}/>`;
    if (d.kind === 'spiral') return Array.from({ length: 12 }, (_, i) => `<circle cx="${cx - w / 2 + (i + .5) * w / 12}" cy="${cy}" r="${Math.max(.8, h * .35)}" fill="none" stroke="#9aa0a6" stroke-width=".8"/>`).join('');
    if (d.kind === 'clip' || d.kind === 'binder') return `<rect x="${cx - w / 2}" y="${cy - h / 2}" width="${w}" height="${h}" rx="1" fill="${d.kind === 'clip' ? '#c3c7cc' : '#222'}"${tf(d, cx, cy)}/>`;
    if (d.kind === 'laurel') return `<circle cx="${cx}" cy="${cy}" r="${w * .4}" fill="none" stroke="${d.fill || '#fff'}" stroke-width="1.2" stroke-dasharray="2 1"/>`;
    if (d.kind === 'paper') return `<rect x="${cx - w / 2}" y="${cy - h / 2}" width="${w}" height="${h}" fill="#fbfaf6"${tf(d, cx, cy)}/>`;
    return d.kind === 'circle' ? `<circle cx="${cx}" cy="${cy}" r="${w / 2}" fill="${d.fill}"/>` : `<rect x="${cx - w / 2}" y="${cy - h / 2}" width="${w}" height="${h}" fill="${d.fill}" opacity="${d.kind === 'tape' ? .9 : 1}"${tf(d, cx, cy)}/>`;
  };
  (L.deco || []).filter(d => d.under).forEach(d => s += deco(d));
  let pi = 0;
  L.slots.forEach(o => {
    const x = o.x * U, y = o.y * U, w = o.w * U, h = o.h * U, cx = x + w / 2, cy = y + h / 2, fill = o.pano ? `url(#pg${id}${v})` : (pi++ % 3 === 1 ? ac : ph);
    let g = '';
    if (o.frame) { const fc = o.borderColor || '#ffffff', b = w * .07;
      g += o.frame === 'film' ? `<rect x="${x - w * .03}" y="${y - h * .2}" width="${w * 1.06}" height="${h * 1.4}" fill="#161616"/>`
        : o.frame === 'filmv' ? `<rect x="${x - w * .15}" y="${y - h * .03}" width="${w * 1.3}" height="${h * 1.06}" fill="#161616"/>`
        : o.frame === 'dia' ? `<rect x="${cx - Math.max(w, h) * .71}" y="${cy - Math.max(w, h) * .71}" width="${Math.max(w, h) * 1.42}" height="${Math.max(w, h) * 1.42}" rx="2" fill="${fc}"/>`
        : `<rect x="${x - b}" y="${y - b}" width="${w + 2 * b}" height="${h + b * (o.frame === 'instax' ? 4.2 : 3.6)}" fill="${fc}"/>`; }
    else if (o.edge === 'stamp') { const b = Math.min(w, h) * .075; g += `<rect x="${x - b}" y="${y - b}" width="${w + 2 * b}" height="${h + 2 * b}" fill="${o.borderColor || '#fff'}" stroke="${o.borderColor || '#fff'}" stroke-width="1.5" stroke-dasharray="1.2 1.2"/>`; }
    else if (o.edge) { g += `<rect x="${x - .8}" y="${y - .8}" width="${w + 1.6}" height="${h + 1.6}" fill="#ffffff"/>`; }
    else if (o.border) { const b = o.border * U; g += o.shape === 'circle' ? `<ellipse cx="${cx}" cy="${cy}" rx="${w / 2 + b}" ry="${h / 2 + b}" fill="#ffffff"/>` : `<rect x="${x - b}" y="${y - b}" width="${w + 2 * b}" height="${h + 2 * b}" fill="#ffffff"/>`; }
    const sh = o.shape;
    g += sh === 'circle' || sh === 'blob' ? `<ellipse cx="${cx}" cy="${cy}" rx="${w / 2}" ry="${h / 2}" fill="${fill}"/>`
      : sh === 'arch' ? `<path d="M${x} ${y + h}V${y + w / 2}a${w / 2} ${w / 2} 0 0 1 ${w} 0V${y + h}z" fill="${fill}"/>`
      : sh === 'heart' ? `<path d="M${cx} ${y + h}C${x - w * .1} ${y + h * .45} ${x + w * .15} ${y - h * .1} ${cx} ${y + h * .28}C${x + w * .85} ${y - h * .1} ${x + w * 1.1} ${y + h * .45} ${cx} ${y + h}z" fill="${fill}"/>`
      : sh === 'star' ? `<polygon points="${Array.from({ length: 10 }, (_, i) => { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? .42 : 1; return `${cx + Math.cos(a) * w / 2 * r},${cy + Math.sin(a) * h / 2 * r}`; }).join(' ')}" fill="${fill}"/>`
      : `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${sh === 'round' ? Math.min(w, h) * .08 : 0}" fill="${fill}"/>`;
    s += `<g${tf(o, cx, cy)}>${g}</g>`;
  });
  (L.deco || []).filter(d => !d.under).forEach(d => s += deco(d));
  for (let i = 1; i < n; i++) s += `<line x1="${i * U}" y1="0" x2="${i * U}" y2="${H}" stroke="rgba(0,0,0,.35)" stroke-dasharray="2 2"/>`;
  return `<svg viewBox="0 0 ${W} ${H}" aria-hidden="true"><clipPath id="cp${id}${v}"><rect width="${W}" height="${H}" rx="3"/></clipPath><g clip-path="url(#cp${id}${v})">${s}</g></svg>`;
}

/* ---------- Anwenden ---------- */
export const defaultTpl = (kind, v = 0) => ({ kind, v, gap: byId[kind].gap ?? .025, rad: 0, shadow: null, seed: 0, fill: byId[kind].fill || 'ph' });
export function applyTemplate(kind, v = 0) {
  if (!byId[kind]) return false;
  const keep = state.tpl && state.tpl.kind === kind ? state.tpl : null;
  state.tpl = keep ? { ...keep, v } : defaultTpl(kind, v);
  layout(true);
  return true;
}
const photoLayers = () => state.layers.filter(l => l.type === 'image' && l.srcId && !l.dupOf);
/* Reihenfolge der echten Fotos: erst nach Feld, dann neue */
function orderedPhotos() {
  const seen = new Set(), out = [];
  photoLayers().map((l, i) => ({ l, i })).sort((a, b) => (a.l.slot ?? 1e6 + a.i) - (b.l.slot ?? 1e6 + b.i)).forEach(({ l }) => {
    const key = l.grp || ('id' + l.id); if (seen.has(key)) return; seen.add(key); out.push(l); });
  return out;
}
function countGroups(slots) { const s = new Set(); slots.forEach((o, j) => s.add(o.pano ? 'p' + o.pano.k : 'j' + j)); return s.size; }

export function layout(fitSlides) {
  const t = state.tpl; if (!t || !byId[t.kind]) return;
  const T = byId[t.kind], { W, H } = dims(), A = H / W, photos = orderedPhotos(), k = photos.length;
  const o = n => ({ v: t.v, g: t.gap, seed: t.seed, k, mix: t.uniform !== true });
  let n = state.slides;
  // nur Slides ergänzen, solange dadurch wirklich mehr Felder entstehen
  if (fitSlides) { const cnt = m => countGroups(T.build(m, A, o(m)).slots); let m = n; while (m < 20 && cnt(m) < k) m++; if (cnt(m) > cnt(n)) n = m; }
  state.slides = n;
  const L = vary(T.build(n, A, o(n)), n, o(n), T);
  const oldDeco = new Map(state.layers.filter(l => l.tplKey).map(l => [l.tplKey, l]));
  const others = state.layers.filter(l => !l.tplKey && !(l.type === 'image' && (!l.srcId || l.dupOf)) && !photos.includes(l) && !(l.type === 'image' && l.grp && photos.some(p => p.grp === l.grp)));
  const groupPhoto = new Map(); let next = 0;
  const slotLayers = L.slots.map((s, j) => {
    const gk = s.pano ? 'p' + s.pano.k : 'j' + j;
    if (!groupPhoto.has(gk)) groupPhoto.set(gk, { idx: next++, used: false });
    const gp = groupPhoto.get(gk); let l;
    if (gp.idx < k) { const p = photos[gp.idx]; if (!gp.used) { l = p; gp.used = true; gp.master = p; } else { l = clone(p); l.id = newId(); l.dupOf = p.id; l.params = p.params; } }
    else if (t.fill === 'repeat' && k) { const p = photos[gp.idx % k]; l = clone(p); l.id = newId(); l.dupOf = p.id; l.params = p.params; delete l.grp; }
    else { l = newImageLayer(null); l.srcId = null; l.ph = true; if (s.pano) l.paneKey = gk; }
    place(l, s, j, W, t, gk);
    return l;
  });
  const deco = (L.deco || []).map(d => makeDeco(d, oldDeco.get(t.kind + ':' + (d.key || d.kind + ':' + d.x.toFixed(3) + ':' + d.y.toFixed(3))), W, t.kind));
  // Fotos ohne Feld werden ausgeblendet (in „Ebenen“ wieder einblendbar)
  const rest = photos.filter(p => !slotLayers.includes(p)); rest.forEach(p => { p.hidden = true; delete p.slot; });
  layout.hiddenCount = rest.length;
  if (L.bg) { state.bg.c1 = L.bg.c1; state.bg.grad = false; state.bg.pattern = L.bg.pattern || 'none'; }
  // Deko mit „after“ liegt direkt über einem bestimmten Feld (z. B. Fotostreifen-Hintergrund über dem Stimmungsbild)
  const mid = []; slotLayers.forEach((sl0, j) => { mid.push(sl0); deco.filter(d => d.after === j).forEach(d => mid.push(d)); });
  state.layers = [...deco.filter(d => d.under), ...mid, ...rest, ...others, ...deco.filter(d => !d.under && d.after == null)];
  deco.forEach(d => { delete d.under; delete d.after; });
  relink();
  if (ui.sel && !state.layers.some(l => l.id === ui.sel)) ui.sel = null;
}
function place(l, s, j, W, t, gk) {
  const same = l.slot === j && l.tplKind === t.kind;
  l.x = (s.x + s.w / 2) * W; l.y = (s.y + s.h / 2) * W; l.w = s.w * W; l.rot = s.rot || 0;
  const z = same ? l.crop : null;
  l.crop = { ratio: s.w / s.h, zoom: z ? z.zoom : 1, px: z ? z.px : .5, py: z ? z.py : .5 };
  l.shape = s.frame || s.shape || (t.rad > 0 ? 'round' : 'rect');
  l.radius = s.shape === 'round' && !t.rad ? (s.radius ?? 7) : (t.rad || s.radius || 7);
  l.border = (s.border || 0) * W; l.borderColor = s.borderColor || '#ffffff'; l.edge = s.edge; l.edgeSides = s.edgeSides;
  l.shadow = t.shadow == null ? !!s.shadow : t.shadow;
  l.opacity = 1; l.blend = 'source-over'; l.slot = j; l.tplKind = t.kind; l.hidden = false;
  l.caption = s.caption || ''; l.keyline = s.keyline; l.keylineGap = s.keylineGap; l.sticker = !!s.sticker;
  // Vorlagen-Look (z. B. S/W im Fotostreifen) nur setzen, wenn das Foto noch keinen eigenen Look hat
  if (l.params) { if (l.tplLook && l.params.look === l.tplLook && l.tplLook !== s.look) { l.params.look = 'none'; delete l.tplLook; }
    if (s.look && l.params.look === 'none') { l.params.look = s.look; l.tplLook = s.look; } }
  if (s.pano) { l.pane = { R: s.pano.R, S: [s.x, s.y, s.w, s.h] }; if (l.srcId) { l.grp = gk + ':' + (l.dupOf || l.id); } computeBox(l); }
  else { delete l.pane; delete l.grp; delete l.crop.box; }
}
function makeDeco(d, old, W, kind) {
  let l;
  if (d.t === 'text') {
    l = newTextLayer(d.x * W, d.y * W, d.text);
    Object.assign(l, { font: d.font || 'Caveat', size: d.size * W, color: d.color || '#1d1d1d', shadow: !!d.shadow, spacing: d.spacing || 0, lineH: d.lineH || 1.16, rot: d.rot || 0, bg: d.bg || 'none', bgColor: d.bgColor || '#111111', align: d.align || 'center' });
    if (old && old.type === 'text') { l.text = old.text; for (const k of ['font', 'color', 'size', 'bg', 'bgColor', 'stroke', 'strokeColor', 'upper', 'glow', 'align', 'spacing', 'lineH']) if (old.userEdited) l[k] = old[k]; }
  } else {
    l = newShapeLayer(d.kind, d.x * W, d.y * W); Object.assign(l, { w: d.w * W, h: d.h * W, rot: d.rot || 0, shadow: !!d.shadow }); if (d.fill) l.fill = d.fill; if (d.sw) l.sw = d.sw; if (d.outline) l.outline = true;
  }
  l.tplKey = kind + ':' + (d.key || d.kind + ':' + d.x.toFixed(3) + ':' + d.y.toFixed(3)); l.under = !!d.under; if (d.after != null) l.after = d.after;
  return l;
}
/* Fenster und Wiederholungen eines Fotos teilen sich dieselben Bearbeitungs-Parameter */
export function relink(prefer) {
  const masters = new Map();
  for (const l of state.layers) if (l.type === 'image' && l.srcId) {
    const key = l.grp || (l.dupOf ? 'id' + l.dupOf : 'id' + l.id);
    const m = masters.get(key);
    if (!m || l.id === prefer) masters.set(key, l);
  }
  for (const l of state.layers) if (l.type === 'image' && l.srcId) { const m = masters.get(l.grp || (l.dupOf ? 'id' + l.dupOf : 'id' + l.id)); if (m && m !== l) { l.params = m.params; l.stampMs = m.stampMs; l.srcId = m.srcId; } }
}
export function shufflePhotos() {
  const ph = orderedPhotos(), r = seeded(Date.now() & 0xffff), slots = ph.map(p => p.slot ?? 0);
  for (let i = ph.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [ph[i], ph[j]] = [ph[j], ph[i]]; }
  ph.forEach((p, i) => { const s = slots[i]; state.layers.filter(l => l === p || (p.grp && l.grp === p.grp)).forEach(l => { l.slot = s; }); });
  // Verknüpfungen lösen, damit layout() die Fenstergruppen neu vergibt
  state.layers = state.layers.filter(l => !l.dupOf);
  ph.forEach(p => { delete p.grp; });
  layout(false);
}
export function releaseTemplate() {
  state.tpl = null;
  state.layers = state.layers.filter(l => !(l.type === 'image' && !l.srcId));
  state.layers.forEach(l => { delete l.tplKey; delete l.slot; delete l.tplKind; });
}
