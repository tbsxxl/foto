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
const today = () => new Date().toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX'];

/* ---------- Abwechslung über die Slides ---------- */
/* Seitenmuster je Slide: Slide 1 folgt der gewählten Variante, danach wechselnd – nie zweimal gleich hintereinander */
function pager(n, o, k) {
  if (!o.mix || k < 2) return () => 0;
  const r = seeded(91 + (o.seed || 0) * 13 + k * 7), seq = [];
  for (let i = 0; i < n; i++) { let v = i === 0 ? 0 : Math.floor(r() * k); if (i && v === seq[i - 1]) v = (v + 1) % k; seq.push(v); }
  return i => seq[i] || 0;
}
/* Bibliothek einzelner Seiten-Layouts (Koordinaten einer Slide) */
const PAGES = {
  full: (i, A, st) => [S(i, 0, 1, A, st.full)],
  margin: (i, A, st) => [C(i + .5, A / 2, .84, A * .84, st.card)],
  two: (i, A, st) => { const h = (A - .24) / 2; return [S(i + .08, .08, .84, h, st.card), S(i + .08, .16 + h, .84, h, st.card)]; },
  twoTall: (i, A, st) => [S(i + .06, .1, .42, A - .2, st.card), S(i + .52, .1, .42, A - .2, st.card)],
  pip: (i, A, st) => [S(i, 0, 1, A, st.full), C(i + .63, A * .68, .46, A * .4, { ...st.card, border: .012, borderColor: '#ffffff', shadow: true })],
  trio: (i, A, st) => { const h = (A - .18) / 2; return [S(i + .06, .06, .5, A - .12, st.card), S(i + .6, .06, .34, h, st.card), S(i + .6, .12 + h, .34, h, st.card)]; },
  small: (i, A, st) => [C(i + .5, A * .46, .5, .62, st.card)],
  offset: (i, A, st) => [S(i + .08, .1, .6, A * .66, st.card), S(i + .58, A * .62, .34, A * .3, st.card)],
  grid4: (i, A, st) => grid(i + .06, .06, .88, A - .12, 2, 2, .03, st.card),
  topTwo: (i, A, st) => { const t = A * .56; return [S(i + .06, .06, .88, t, st.card), S(i + .06, t + .1, .42, A - t - .16, st.card), S(i + .52, t + .1, .42, A - t - .16, st.card)]; },
  tilt: (i, A, st) => [C(i + .5, A * .46, .66, .66, { frame: 'polaroid', rot: i % 2 ? 4 : -4, shadow: true })],
  diag: (i, A, st) => [C(i + .38, A * .33, .6, A * .42, { ...st.card, shadow: true, rot: -2 }), C(i + .62, A * .68, .6, A * .42, { ...st.card, shadow: true, rot: 2 })]
};
function pages(n, A, o, from, kinds, st = {}) {
  const P = pager(n, o, kinds.length), out = [], sty = { full: {}, card: {}, ...st };
  for (let i = from; i < n; i++) out.push(...PAGES[kinds[P(i)]](i, A, sty));
  return out;
}
/* Allgemeine Abwechslung: einzelne Slides spiegeln (nur Felder, die ganz auf der Slide liegen) */
export function vary(L, n, o, T) {
  if (!o.mix || T.noMirror) return L;
  const P = pager(n, { ...o, seed: (o.seed || 0) + 5 }, 2);
  for (let i = 1; i < n; i++) {
    if (P(i) !== 1) continue;
    for (const s of L.slots) { if (s.pano || s.x < i - 1e-6 || s.x + s.w > i + 1 + 1e-6) continue; s.x = 2 * i + 1 - (s.x + s.w); if (s.rot) s.rot = -s.rot; if (s.edgeSides) s.edgeSides = s.edgeSides.replace(/[lr]/g, c => c === 'l' ? 'r' : 'l'); }
    for (const d of L.deco || []) { if (d.x < i || d.x > i + 1) continue; d.x = 2 * i + 1 - d.x; if (d.rot && Math.abs(d.rot) !== 90) d.rot = -d.rot; }
  }
  return L;
}

export const TPL_CATS = [['all', 'Alle'], ['pano', 'Panorama'], ['grid', 'Raster'], ['seam', 'Über die Naht'], ['collage', 'Collage'], ['paper', 'Papier & Notizbuch'], ['doodle', 'Kritzeleien'], ['analog', 'Analog'], ['edit', 'Editorial'], ['shape', 'Formen']];

export const TEMPLATES = [
  /* ---------- Panorama ---------- */
  { id: 'pano', noMirror: true, cat: 'pano', name: 'Panorama', desc: 'Ein Foto läuft über alle Slides.', vars: ['Randlos', 'Mit Rand', 'Band', 'Abzug'],
    build(n, A, o) {
      if (o.v === 1) { const b = Math.max(.045, o.g * 1.6); return { slots: [S(b, b, n - 2 * b, A - 2 * b)], bg: { c1: '#ffffff' } }; }
      if (o.v === 2) return { slots: [S(0, A * .2, n, A * .6)], bg: { c1: '#f4efe6' } };
      if (o.v === 3) return { slots: [S(.1, A * .15, n - .2, A * .7, { rot: -1.2, border: .025, shadow: true })], bg: { c1: '#e8dcc8', pattern: 'paper' } };
      return { slots: [S(0, 0, n, A)] };
    } },
  { id: 'panoWin', noMirror: true, cat: 'pano', name: 'Panorama-Fenster', desc: 'Ein Foto, sichtbar durch viele Rahmen.', gap: .03, vars: ['Raster', 'Streifen', 'Kreise', 'Bögen', 'Mosaik'],
    build(n, A, o) {
      const g = o.g, P = { k: 'w', R: [0, 0, n, A] }, sl = [];
      if (o.v === 0) for (let i = 0; i < n; i++) sl.push(...grid(i + g, g, 1 - 2 * g, A - 2 * g, 2, 2, g, { pano: P }));
      else if (o.v === 1) { const N = n * 4, w = (n - g * (N + 1)) / N; for (let j = 0; j < N; j++) sl.push(S(g + j * (w + g), g, w, A - 2 * g, { pano: P })); }
      else if (o.v === 2) { for (let i = 0; i < n; i++) sl.push(C(i + .5, A * .44, .7, .7, { shape: 'circle', pano: P })); for (const x of seams(n)) if (n > 1) sl.push(C(x, A * .84, .26, .26, { shape: 'circle', pano: P })); }
      else if (o.v === 3) for (let i = 0; i < n; i++) sl.push(S(i + .15, A * .1, .7, A * .8, { shape: 'arch', pano: P }));
      else partition([g, g, n - 2 * g, A - 2 * g], n * 3, g, seeded(5 + o.seed * 13)).forEach(r => sl.push(S(...r, { pano: P })));
      return { slots: sl, bg: { c1: o.v === 1 ? '#111111' : '#ffffff' } };
    } },
  { id: 'panoCards', noMirror: true, cat: 'pano', name: 'Panorama + Karten', desc: 'Hintergrund-Panorama, weitere Fotos als Karten auf den Nähten.', vars: ['Sofortbilder', 'Karten', 'Kreise'],
    build(n, A, o) {
      const sl = [S(0, 0, n, A)];
      seams(n).forEach((x, i) => {
        if (o.v === 0) sl.push(C(x, A * .47, .48, .48, { frame: 'polaroid', rot: i % 2 ? 5 : -5, shadow: true }));
        else if (o.v === 1) sl.push(C(x, A / 2, .56, .7, { shape: 'round', radius: 6, border: .018, shadow: true }));
        else sl.push(C(x, A / 2, .6, .6, { shape: 'circle', border: .02, shadow: true }));
      });
      return { slots: sl };
    } },
  { id: 'panoSplit', noMirror: true, cat: 'pano', name: 'Panorama + Reihe', desc: 'Breites Panorama, darunter Einzelbilder.', gap: .025, vars: ['Panorama oben', 'Panorama unten', 'Mit Kreisen'],
    build(n, A, o) {
      const g = o.g, sl = [];
      if (o.v === 2) { sl.push(S(0, 0, n, A * .64)); for (let i = 0; i < n; i++) sl.push(C(i + .5, A * .64, .44, .44, { shape: 'circle', border: .02, shadow: true })); return { slots: sl, bg: { c1: '#f4efe6' } }; }
      const ph = A * .56, top = o.v === 0;
      sl.push(S(0, top ? 0 : A - ph, n, ph));
      for (let i = 0; i < n; i++) sl.push(S(i + g, top ? ph + g : g, 1 - 2 * g, A - ph - 2 * g));
      return { slots: sl, bg: { c1: '#ffffff' } };
    } },
  { id: 'spread', noMirror: true, cat: 'pano', name: 'Doppelseite', desc: 'Je ein Foto über zwei Slides.', gap: .03, vars: ['Randlos', 'Mit Rand', 'Mit Fuge'],
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
  { id: 'grid', cat: 'grid', name: 'Raster', desc: 'Felder auf jeder Slide – jede Slide anders aufgeteilt.', gap: .025, vars: ['2×2', '3×3', '1×2', '2×1', '3×2', '2×3', '1×3'],
    build(n, A, o) {
      const V = [[2, 2], [3, 3], [1, 2], [2, 1], [3, 2], [2, 3], [1, 3]], g = o.g, sl = [], P = pager(n, o, 4), alt = [0, 2, 3, 5];
      for (let i = 0; i < n; i++) { const [c, r] = V[(o.v + alt[P(i)]) % 7]; sl.push(...grid(i + g, g, 1 - 2 * g, A - 2 * g, c, r, g)); }
      return { slots: sl, bg: { c1: '#ffffff' } };
    } },
  { id: 'mosaic', noMirror: true, cat: 'grid', name: 'Mosaik', desc: 'Freie Aufteilung, Felder laufen über die Nähte.', gap: .022, vars: ['Mix 1', 'Mix 2', 'Mix 3', 'Mix 4'],
    build(n, A, o) {
      const cnt = Math.min(n * 5, Math.max(o.k, n * 2)), g = o.g;
      return { slots: partition([g, g, n - 2 * g, A - 2 * g], cnt, g, seeded(17 + o.v * 31 + o.seed * 7)).map(r => S(...r)), bg: { c1: '#ffffff' } };
    } },
  { id: 'feature', cat: 'grid', name: 'Groß + zwei', desc: 'Ein Hauptbild und zwei kleine – Anordnung wechselt.', gap: .025, vars: ['Groß links', 'Groß rechts', 'Groß oben', 'Abwechselnd'],
    build(n, A, o) {
      const g = o.g, sl = [], P = pager(n, o, 3);
      for (let i = 0; i < n; i++) {
        const x = i + g, y = g, w = 1 - 2 * g, h = A - 2 * g, v = o.v === 3 ? i % 2 : (o.v + P(i)) % 3;
        if (v === 2) { const bh = (h - g) * .6, sw = (w - g) / 2; sl.push(S(x, y, w, bh), S(x, y + bh + g, sw, h - bh - g), S(x + sw + g, y + bh + g, sw, h - bh - g)); }
        else { const bw = (w - g) * .62, sw = w - bw - g, sh = (h - g) / 2, bx = v === 0 ? x : x + sw + g, sx = v === 0 ? x + bw + g : x; sl.push(S(bx, y, bw, h), S(sx, y, sw, sh), S(sx, y + sh + g, sw, sh)); }
      }
      return { slots: sl, bg: { c1: '#ffffff' } };
    } },
  { id: 'bento', cat: 'grid', name: 'Bento', desc: 'Jede Slide anders aufgeteilt.', gap: .025, vars: ['Start A', 'Start B', 'Start C'],
    build(n, A, o) {
      const g = o.g, sl = [];
      for (let i = 0; i < n; i++) {
        const x = i + g, y = g, w = 1 - 2 * g, h = A - 2 * g, p = (i + o.v) % 3;
        if (p === 0) { const lw = (w - g) * .58, rh = (h - g) * .4; sl.push(S(x, y, lw, h), S(x + lw + g, y, w - lw - g, rh), S(x + lw + g, y + rh + g, w - lw - g, h - rh - g)); }
        else if (p === 1) { const th = (h - g) * .46, lw = (w - g) * .42; sl.push(S(x, y, w, th), S(x, y + th + g, lw, h - th - g), S(x + lw + g, y + th + g, w - lw - g, h - th - g)); }
        else { const th = (h - g) * .5, lw = (w - g) / 2; sl.push(S(x, y, lw, th), S(x + lw + g, y, w - lw - g, th), S(x, y + th + g, w, h - th - g)); }
      }
      return { slots: sl, bg: { c1: '#ffffff' } };
    } },
  { id: 'brick', noMirror: true, cat: 'grid', name: 'Mauerwerk', desc: 'Spalten mit versetzten Höhen über die Nähte.', gap: .022, vars: ['2 Spalten', '3 Spalten'],
    build(n, A, o) {
      const g = o.g, per = o.v ? 3 : 2, N = n * per + 1, cw = (n - (N - 1) * g) / (N - 1), r = seeded(9 + o.seed * 5), sl = [];
      for (let j = 0; j < N; j++) {
        const x = -cw / 2 + j * (cw + g), cells = r() < .5 ? 2 : (o.v ? 3 : 1), fs = [];
        for (let c = 0; c < cells; c++) fs.push(.6 + r() * .8);
        const tot = fs.reduce((a, b) => a + b, 0), hAvail = A - g * (cells + 1); let y = g;
        fs.forEach(f => { const h = hAvail * f / tot; sl.push(S(x, y, cw, h)); y += h + g; });
      }
      return { slots: sl, bg: { c1: '#ffffff' } };
    } },

  /* ---------- Über die Naht ---------- */
  { id: 'seam', noMirror: true, cat: 'seam', name: 'Über die Naht', desc: 'Fotos sitzen genau auf den Übergängen.', vars: ['Gerade', 'Gedreht', 'Groß mit Rand', 'Kreise'],
    build(n, A, o) {
      const sl = seams(n).map((x, i) => o.v === 3 ? C(x, A / 2, .78, .78, { shape: 'circle', border: .02, shadow: true })
        : o.v === 2 ? C(x, A / 2, 1.04, A * .78, { border: .022, shadow: true })
        : C(x, A / 2, A * .72 * .8, A * .72, { shadow: true, rot: o.v === 1 ? (i % 2 ? 4 : -4) : 0 }));
      return { slots: sl };
    } },
  { id: 'offset', noMirror: true, cat: 'seam', name: 'Versetzt', desc: 'Jede Slide zeigt zwei halbe Fotos.', gap: .025, vars: ['Volle Höhe', 'Mit Rand', 'Gestaffelt'],
    build(n, A, o) {
      const g = o.g, sl = [];
      for (let i = 0; i <= n; i++) {
        if (o.v === 0) sl.push(S(i - .5 + g / 2, 0, 1 - g, A));
        else if (o.v === 1) sl.push(S(i - .5 + g / 2, g, 1 - g, A - 2 * g));
        else sl.push(S(i - .5 + g / 2, i % 2 ? A * .2 : g, 1 - g, A * .78));
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
      const sl = []; for (let i = 0; i < 2 * n - 1; i++) sl.push(C(.5 + i * .5, A * (i % 2 ? .66 : .34), .58, .58 / .8 * (A > 1.3 ? 1 : .86),
        o.v === 1 ? { border: .018, shadow: true, rot: i % 2 ? 2 : -2 } : o.v === 2 ? { shape: 'round', radius: 10, shadow: true } : { shadow: true }));
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
  { id: 'polaroid', cat: 'analog', name: 'Sofortbilder', desc: 'Abzüge mit weißem Rand.', vars: ['Verstreut', 'Reihe', 'Stapel'],
    build(n, A, o) {
      const sl = [], R = [-8, 5, -3, 7, -6, 4];
      if (o.v === 0) { const c = 2 * n; for (let i = 0; i < c; i++) sl.push(C((i + .5) * n / c, A * (i % 2 ? .6 : .38), .5, .5, { frame: 'polaroid', rot: R[i % 6], shadow: true })); }
      else if (o.v === 1) for (let i = 0; i < n; i++) sl.push(C(i + .5, A * .45, .66, .66, { frame: 'polaroid', rot: i % 2 ? 1.5 : -1.5, shadow: true }));
      else for (let i = 0; i < n; i++) [[-.12, -.1, -9], [.1, .08, 7], [0, 0, -2]].forEach(([dx, dy, r]) => sl.push(C(i + .5 + dx, A * .45 + dy, .55, .55, { frame: 'polaroid', rot: r, shadow: true })));
      return { slots: sl, bg: { c1: '#ece6dc', pattern: 'paper' } };
    } },
  { id: 'instax', cat: 'analog', name: 'Instax', desc: 'Kleine Sofortbilder im Hochformat.', vars: ['Reihe', 'Verstreut', 'Groß auf Dunkel', 'Mit Notiz'],
    build(n, A, o) {
      if (o.v === 3) { const sl = [], N = ['ein Schnappschuss vom\nersten Tag', 'der beste Kaffee', 'Sonne im Gesicht', 'bis bald, Meer', 'wir zwei', 'Lieblingsmoment'];
        for (let i = 0; i < 2 * n; i++) sl.push(C(.28 + i * .5, A * .44, .44, .44 / .78, { frame: 'instax', borderColor: '#fbfaf6', caption: N[i % 6].replace('\n', ' '), shadow: true })); return { slots: sl, bg: { c1: '#ffffff' } }; }
      if (o.v === 2) { const sl = []; for (let i = 0; i < n; i++) sl.push(C(i + .5, A * .46, .68, .68 / .82, { frame: 'instax', borderColor: '#f4f2ee', rot: i % 2 ? 1.5 : -1, shadow: true })); return { slots: sl, bg: { c1: '#1b1b1d' } }; }
      const sl = [], c = 2 * n, r = seeded(3 + o.seed * 11);
      for (let i = 0; i < c; i++) sl.push(C((i + .5) * n / c + (o.v ? (r() - .5) * .15 : 0), A * (o.v ? .3 + r() * .4 : .46), .36, .46, { frame: 'instax', rot: o.v ? (r() - .5) * 16 : (i % 2 ? 2 : -2), shadow: true }));
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
  { id: 'contact', noMirror: true, cat: 'analog', name: 'Kontaktabzug', desc: 'Viele kleine Negative wie auf dem Leuchttisch.', vars: ['Schwarz', 'Weiß'],
    build(n, A, o) {
      const sl = [], deco = [];
      for (let i = 0; i < n; i++) {
        for (let r = 0; r < 3; r++) for (let c = 0; c < 2; c++) sl.push(C(i + .5 + (c - .5) * .45, A / 2 + .03 + (r - 1) * .36, .38, .253, { frame: 'film', borderColor: '#161616' }));
        deco.push(TX('ct' + i, i + .5, .07, `STREIFZUG 400 · BLATT ${i + 1}`, { font: 'Space Mono', size: .026, color: '#e8a33a', spacing: 10 }));
      }
      return { slots: sl, deco, bg: { c1: o.v ? '#f4f1ea' : '#141414' } };
    } },
  { id: 'booth', cat: 'analog', name: 'Fotoautomat', desc: 'Streifen mit vier Bildern.', vars: ['Ein Streifen', 'Zwei Streifen'],
    build(n, A, o) {
      const sl = [], deco = [];
      for (let i = 0; i < n; i++) {
        const strips = o.v ? [[i + .29, 4], [i + .71, -3]] : [[i + .5, i % 2 ? 3 : -3]], pw = o.v ? .26 : .32, ph = pw * .75, gap = pw * .09, pad = pw * .14;
        for (const [cx, rot] of strips) {
          const cy = A / 2, sh = 4 * ph + 3 * gap + pad * 2 + ph * .35;
          deco.push(SH('rect', cx, cy, pw + pad * 2, sh, { fill: '#fbfaf6', rot, shadow: true, under: true }));
          for (let k = 0; k < 4; k++) { const py = cy - sh / 2 + pad + ph / 2 + k * (ph + gap), [x, y] = rotPt(cx, cy, cx, py, rot); sl.push(C(x, y, pw, ph, { rot })); }
        }
      }
      return { slots: sl, deco, bg: { c1: '#d9d1c4', pattern: 'paper' } };
    } },
  { id: 'dia', cat: 'analog', name: 'Dias', desc: 'Kleinbild-Dias im Rahmen.', vars: ['Groß', 'Raster'],
    build(n, A, o) {
      const sl = [];
      for (let i = 0; i < n; i++) {
        if (!o.v) sl.push(C(i + .5, A / 2, .56, .373, { frame: 'dia', borderColor: '#ece8de', rot: i % 2 ? 3 : -2, shadow: true }));
        else for (let k = 0; k < 4; k++) sl.push(C(i + .5 + (k % 2 - .5) * .48, A / 2 + ((k >> 1) - .5) * .5, .3, .2, { frame: 'dia', borderColor: '#ece8de', rot: [-3, 2, 4, -2][k], shadow: true }));
      }
      return { slots: sl, bg: { c1: o.v ? '#f2efe9' : '#22262c' } };
    } },
  { id: 'scrapbook', noMirror: true, cat: 'analog', name: 'Album', desc: 'Abzüge mit Klebeband und Handschrift.', vars: ['Papier', 'Kraftpapier', 'Kariert'],
    build(n, A, o) {
      const c = Math.max(2, Math.round(n * 1.5)), sl = [], deco = [];
      for (let i = 0; i < c; i++) {
        const ins = i % 2 === 1, w = ins ? .46 : .52, h = ins ? w / .78 : w, cx = (i + .5) * n / c, cy = A * (i % 2 ? .6 : .42), rot = [-6, 4, -2, 7, -5, 3][i % 6];
        sl.push(C(cx, cy, w, h, { frame: ins ? 'instax' : 'polaroid', borderColor: '#fbfaf6', rot, shadow: true }));
        deco.push(SH('tape', cx, cy - h * .62, .2, .06, { fill: ['#f3e2b3', '#f2c6c2', '#c9dfe6'][i % 3], rot: rot + (i % 2 ? -8 : 10) }));
      }
      deco.push(TX('title', .5, A * .1, 'Unser Sommer', { font: 'Caveat', size: .11, color: o.v === 1 ? '#2a2117' : '#3a3226', rot: -3 }));
      return { slots: sl, deco, bg: o.v === 1 ? { c1: '#c8a97e', pattern: 'paper' } : o.v === 2 ? { c1: '#ffffff', pattern: 'grid' } : { c1: '#e8dcc8', pattern: 'paper' } };
    } },

  /* ---------- Editorial ---------- */
  { id: 'cover', cat: 'edit', name: 'Titel + Galerie', desc: 'Titelseite, dann abwechslungsreiche Galerieseiten.', vars: ['Bogen', 'Kreis', 'Vollbild'],
    build(n, A, o) {
      const sl = [], deco = [];
      if (o.v === 0) sl.push(S(.19, A * .34, .62, A * .55, { shape: 'arch' }));
      else if (o.v === 1) sl.push(C(.5, A * .6, .66, .66, { shape: 'circle' }));
      else sl.push(S(0, 0, 1, A));
      sl.push(...pages(n, A, o, 1, ['margin', 'two', 'small', 'twoTall', 'offset', 'grid4', 'tilt']));
      const dark = o.v === 2;
      deco.push(TX('title', .5, dark ? A * .78 : A * .17, 'Wochenende\nam Meer', { font: 'DM Serif Display', size: .11, color: dark ? '#ffffff' : '#1d1d1d', lineH: 1.02, shadow: dark }));
      deco.push(TX('sub', .5, A * .94, 'WISCHEN →', { font: 'Space Mono', size: .032, color: dark ? '#ffffff' : '#1d1d1d', spacing: 18 }));
      return { slots: sl, deco, bg: { c1: '#f4efe6' } };
    } },
  { id: 'magazine', cat: 'edit', name: 'Magazin', desc: 'Großes Titelbild mit Schlagzeile, dann Magazinseiten.', vars: ['Schlagzeile', 'Kapitel'],
    build(n, A, o) {
      const sl = [S(0, 0, 1, A)], deco = [TX('title', .5, A * .13, 'DER NORDEN', { font: 'Anton', size: .16, color: '#ffffff', spacing: 4 }), TX('sub', .5, A * .9, 'Eine Fotostrecke über Wind & Licht', { font: 'Playfair Display', size: .043, color: '#ffffff' })];
      const P = pager(n, o, 4);
      for (let i = 1; i < n; i++) {
        const k = P(i), num = TX('p' + i, i + .5, A * .955, String(i + 1).padStart(2, '0'), { font: 'Space Mono', size: .03, color: '#1d1d1d' });
        if (o.v === 1 && k < 2) { sl.push(S(i + .08, .08, .84, A * .6)); deco.push(TX('k' + i, i + .5, A * .6 + .2, `Kapitel ${ROMAN[i]}`, { font: 'DM Serif Display', size: .075, color: '#1d1d1d' }), TX('kt' + i, i + .5, A * .6 + .31, 'Notizen vom Weg', { font: 'Space Mono', size: .028, color: '#6b665e', spacing: 6 })); continue; }
        if (k === 0) sl.push(S(i + .11, A * .08, .78, A * .78));
        else if (k === 1) { sl.push(S(i, 0, 1, A * .62), S(i + .08, A * .62 + .06, .4, A * .3), S(i + .52, A * .62 + .06, .4, A * .3)); }
        else if (k === 2) { sl.push(S(i + .08, .08, .55, A * .55), S(i + .37, A * .45, .55, A * .45)); deco.push(TX('q' + i, i + .78, A * .25, '„Der Wind\nweiß Bescheid.“', { font: 'Playfair Display', size: .04, color: '#1d1d1d', lineH: 1.1 })); }
        else { sl.push(S(i + .06, .06, .42, A * .86), S(i + .52, .06, .42, A * .42), S(i + .52, A * .5, .42, A * .42)); }
        deco.push(num);
      }
      return { slots: sl, deco, bg: { c1: '#ffffff' } };
    } },
  { id: 'minimal', cat: 'edit', name: 'Galerie', desc: 'Viel Weißraum, kleine Bildunterschrift – Größe und Lage wechseln.', vars: ['Klein', 'Mittel', 'Mit Datum'],
    build(n, A, o) {
      const sl = [], deco = [], P = pager(n, o, 4), cap = i => o.v === 2 ? `${today()} · ${String(i + 1).padStart(2, '0')}` : `No. ${String(i + 1).padStart(2, '0')}`, T = { font: 'Space Mono', size: .026, color: '#4a463f', spacing: 8 };
      for (let i = 0; i < n; i++) {
        const k = (P(i) + (o.v === 1 ? 1 : 0)) % 4;
        if (k === 0) { sl.push(C(i + .5, A * .45, .52, .65)); deco.push(TX('c' + i, i + .5, A * .45 + .4, cap(i), T)); }
        else if (k === 1) { sl.push(C(i + .5, A * .46, .7, .875)); deco.push(TX('c' + i, i + .5, A * .46 + .5, cap(i), T)); }
        else if (k === 2) { sl.push(S(i + .1, .12, .5, .62)); deco.push(TX('c' + i, i + .78, .14 + .58, cap(i), { ...T, align: 'left' })); }
        else { sl.push(S(i + .12, A * .18, .36, .45), S(i + .52, A * .18 + .2, .36, .45)); deco.push(TX('c' + i, i + .5, A * .18 + .78, cap(i), T)); }
      }
      return { slots: sl, deco, bg: { c1: '#f4f1ea' } };
    } },
  { id: 'split', cat: 'edit', name: 'Halb & halb', desc: 'Foto und Farbfläche mit Text.', vars: ['Links', 'Wechselnd', 'Oben'],
    build(n, A, o) {
      const sl = [], deco = [];
      for (let i = 0; i < n; i++) {
        if (o.v === 2) { sl.push(S(i, 0, 1, A * .62)); deco.push(TX('s' + i, i + .5, A * .81, `Kapitel ${ROMAN[i]}`, { font: 'DM Serif Display', size: .08, color: '#f4efe6' })); }
        else { const left = o.v === 0 || i % 2 === 0; sl.push(S(i + (left ? 0 : .5), 0, .5, A)); deco.push(TX('s' + i, i + (left ? .75 : .25), A / 2, ROMAN[i], { font: 'DM Serif Display', size: .16, color: '#f4efe6' })); }
      }
      return { slots: sl, deco, bg: { c1: '#1f3a4d' } };
    } },
  { id: 'timeline', noMirror: true, cat: 'edit', name: 'Zeitstrahl', desc: 'Eine Linie verbindet alle Bilder.', vars: ['Rechteckig', 'Kreise'],
    build(n, A, o) {
      const sl = [], deco = [SH('line', n / 2, A / 2, n - .1, .008, { fill: '#1d1d1d', under: true })], c = 2 * n - 1;
      for (let i = 0; i < c; i++) {
        const x = .5 + i * .5, up = i % 2 === 0, w = o.v ? .4 : .42, h = o.v ? .4 : .52;
        sl.push(C(x, up ? A / 2 - .06 - h / 2 : A / 2 + .06 + h / 2, w, h, o.v ? { shape: 'circle', border: .012 } : { shape: 'round', radius: 5 }));
        deco.push(SH('circle', x, A / 2, .045, .045, { fill: '#1d1d1d' }), TX('d' + i, x + .1, up ? A / 2 + .045 : A / 2 - .045, `Tag ${i + 1}`, { font: 'Space Mono', size: .024, color: '#1d1d1d' }));
      }
      return { slots: sl, deco, bg: { c1: '#f4efe6' } };
    } },
  { id: 'quote', cat: 'edit', name: 'Zitat', desc: 'Erste Slide ein Satz, dann abwechslungsreiche Bildseiten.', vars: ['Hell', 'Dunkel'],
    build(n, A, o) {
      const dark = o.v === 1, col = dark ? '#f4efe6' : '#1d1d1d', deco = [TX('q', .5, A * .46, '„Manche Tage\nmöchte man\neinrahmen.“', { font: 'Playfair Display', size: .095, color: col, lineH: 1.1 }), TX('qa', .5, A * .78, '— NOTIZ AN MICH', { font: 'Space Mono', size: .026, color: col, spacing: 12 })];
      const sl = pages(n, A, o, 1, dark ? ['full', 'pip', 'twoTall', 'trio'] : ['margin', 'two', 'small', 'tilt', 'diag']);
      if (n === 1) sl.push(C(.5, A * .9, .2, .2, { shape: 'circle' }));
      return { slots: sl, deco, bg: { c1: dark ? '#121212' : '#f4efe6' } };
    } },

  /* ---------- Papier & Notizbuch ---------- */
  { id: 'torn', cat: 'paper', name: 'Risskanten', desc: 'Fotostreifen mit zerrissenen Papierkanten.', vars: ['3 Streifen', '2 Streifen', 'Senkrecht'],
    build(n, A, o) {
      const sl = [], E = { edge: 'torn', shadow: true };
      if (o.v === 2) { const N = n * 2, w = n / N; for (let j = 0; j < N; j++) sl.push(S(j * w - .03, -.02, w + .06, A + .04, { ...E, edgeSides: 'lr' })); return { slots: sl, bg: { c1: '#ffffff' } }; }
      const P = pager(n, o, 3);
      for (let i = 0; i < n; i++) {
        const k = [o.v ? 2 : 3, o.v ? 3 : 2, 4][P(i)], bh = A / k;
        if (P(i) === 2 && o.mix) { sl.push(S(i - .01, -.02, .55, A + .04, { ...E, edgeSides: 'r' }), S(i + .47, -.02, .54, A / 2 + .03, { ...E, edgeSides: 'lb' }), S(i + .47, A / 2 - .03, .54, A / 2 + .05, { ...E, edgeSides: 'lt' })); continue; }
        for (let j = 0; j < k; j++) sl.push(S(i - .01, j * bh - (j ? .035 : .02), 1.02, bh + (j ? .07 : .055), { ...E, edgeSides: 'tb' }));
      }
      return { slots: sl, bg: { c1: '#ffffff' } };
    } },
  { id: 'tornCollage', cat: 'paper', name: 'Zerrissene Collage', desc: 'Großes Foto, darauf gerissene Abzüge.', vars: ['Hell', 'Dunkel', "Today's dump"],
    build(n, A, o) {
      const sl = [], deco = [], E = { edge: 'torn', shadow: true };
      for (let i = 0; i < n; i++) {
        if (o.v === 1) { [[.36, .26, -3], [.62, .58, 4], [.4, .92, -2]].forEach(([fx, fy, rt]) => sl.push(C(i + fx + .1, A * fy * .9 + .05, .66, A * .34, { ...E, rot: rt }))); continue; }
        sl.push(S(i, 0, 1, A));
        sl.push(C(i + .64, A * .33, .62, A * .38, { ...E, rot: -3 }), C(i + .38, A * .74, .62, A * .34, { ...E, rot: 4 }));
      }
      if (o.v === 2) deco.push(TX('dump', .42, A * .12, "Today's\ndump", { font: 'Anton', size: .11, color: '#1d1d1d', bg: 'ransom', rot: -3 }));
      return { slots: sl, deco, bg: { c1: o.v === 1 ? '#161616' : '#f4efe6' } };
    } },
  { id: 'stamps', cat: 'paper', name: 'Briefmarken', desc: 'Fotos mit gezacktem Briefmarkenrand.', vars: ['Raster auf Rot', 'Großmarke + Perlen', 'Blau 2×2'],
    build(n, A, o) {
      const sl = [], deco = [], St = { edge: 'stamp', borderColor: '#fbf8f1', shadow: true }, P = pager(n, o, 3);
      for (let i = 0; i < n; i++) {
        const k = o.mix ? (o.v + P(i)) % 3 : o.v;
        if (k === 0) for (let j = 0; j < 6; j++) sl.push(C(i + .5 + (j % 2 - .5) * .4, A / 2 + (Math.floor(j / 2) - 1) * .36, .32, .27, St));
        else if (k === 1) sl.push(C(i + .5, A * .44, .66, .54, { ...St, rot: i % 2 ? 3 : -4 }));
        else for (let j = 0; j < 4; j++) sl.push(C(i + .5 + (j % 2 - .5) * .44, A / 2 + ((j >> 1) - .5) * .5, .36, .36, { ...St, rot: [-2, 2, 3, -3][j] }));
      }
      if (o.v === 1) deco.push(TX('beads', .5, A * .44 + .33, 'SUMMER', { font: 'Archivo Black', size: .095, color: '#1d1d1d', bg: 'beads', bgColor: '#e4e1da', rot: -4 }));
      return { slots: sl, deco, bg: { c1: ['#9e2b25', '#cdd7e2', '#1f3a5f'][o.v] } };
    } },
  { id: 'deckle', cat: 'paper', name: 'Büttenrand', desc: 'Abzüge mit fransigem Papierrand.', vars: ['Drei', 'Zwei', 'Dunkel'],
    build(n, A, o) {
      const sl = [], P = pager(n, o, 3), D = { edge: 'deckle', borderColor: o.v === 2 ? '#f4f1ea' : '#ffffff' };
      for (let i = 0; i < n; i++) {
        const k = o.mix ? ((o.v === 1 ? 1 : 0) + P(i)) % 3 : (o.v === 1 ? 1 : 0);
        if (k === 2) { sl.push(C(i + .5, A * .5, .78, A * .82, { ...D, rot: .8 })); continue; }
        const c = k ? 2 : 3, h = (A - .12) / c - .035, w = k ? .7 : .58;
        for (let j = 0; j < c; j++) sl.push(C(i + .5 + (k ? 0 : (j - 1) * .04), .06 + h / 2 + j * (h + .035), w, h, { ...D, rot: (j % 2 ? .8 : -.6) }));
      }
      return { slots: sl, bg: { c1: o.v === 2 ? '#141414' : '#ffffff' } };
    } },
  { id: 'notebook', cat: 'paper', name: 'Notizbuch', desc: 'Spiralbindung, Foto und kleine Notiz – Seiten wechseln.', vars: ['Foto unten', 'Foto oben', 'Ganze Seite'],
    build(n, A, o) {
      const sl = [], deco = [], W = ['(Blumen)', '(Licht)', '(Meer)', '(Zuhause)', '(Morgens)', '(Wir)', '(Unterwegs)', '(Abends)'], P = pager(n, o, 3), T = { font: 'Playfair Display', size: .03, color: '#3a3226' };
      for (let i = 0; i < n; i++) {
        const k = (o.v + P(i)) % 3;
        if (k === 0) { sl.push(S(i, A * .47, 1, A * .53)); deco.push(SH('spiral', i + .5, A * .47, .96, .09, {}), TX('n' + i, i + .5, A * .23, W[i % 8], T)); }
        else if (k === 1) { sl.push(S(i, 0, 1, A * .53)); deco.push(SH('spiral', i + .5, A * .53, .96, .09, {}), TX('n' + i, i + .5, A * .8, W[i % 8], T)); }
        else { sl.push(C(i + .5, A * .5, .8, A * .62)); deco.push(SH('spiral', i + .5, .06, .96, .09, {}), TX('n' + i, i + .5, A * .9, W[i % 8], T)); }
      }
      return { slots: sl, deco, bg: { c1: o.v === 2 ? '#fbfaf6' : '#e6dccd', pattern: o.v === 2 ? 'lines' : 'paper' } };
    } },
  { id: 'pinned', cat: 'paper', name: 'Angeheftet', desc: 'Abzüge mit Büroklammer und Foldback-Klammer.', vars: ['Rot', 'Beige', 'Nacht'],
    build(n, A, o) {
      const sl = [], deco = [], ink = o.v === 1 ? '#3a3226' : '#f4efe6', P = pager(n, o, 3), B = { border: .022, borderColor: '#f7f5f0', shadow: true }, NOTE = ['Gemacht, um erinnert zu werden', 'Kleine Dinge', 'Für später', 'Nicht vergessen'];
      for (let i = 0; i < n; i++) {
        const k = P(i), rot = i % 2 ? 2 : -2.5;
        if (k === 0) { const h = A * .6; sl.push(C(i + .5, A * .48, .6, h, { ...B, rot }));
          deco.push(SH('clip', i + .32, A * .48 - h / 2 - .02, .055, .14, { rot: rot - 8 }), SH('binder', i + .82, A * .55, .1, .085, { rot: 90 + rot }), TX('pc' + i, i + .5, A * .48 + h / 2 + .095, NOTE[i % 4], { font: 'Special Elite', size: .026, color: ink, spacing: 10 })); }
        else if (k === 1) { sl.push(C(i + .38, A * .34, .5, A * .36, { ...B, rot: -4 }), C(i + .6, A * .68, .5, A * .36, { ...B, rot: 3 }));
          deco.push(SH('clip', i + .2, A * .15, .05, .13, { rot: -12 }), SH('binder', i + .6, A * .48, .1, .085, {}), TX('pc' + i, i + .5, A * .94, NOTE[i % 4], { font: 'Special Elite', size: .024, color: ink, spacing: 10 })); }
        else { sl.push(C(i + .5, A * .42, .76, A * .56, { ...B, rot: 1.5 }));
          deco.push(SH('tape', i + .22, A * .14, .2, .06, { rot: -30, fill: '#f3e2b3' }), SH('tape', i + .8, A * .14, .2, .06, { rot: 28, fill: '#f3e2b3' }), TX('pc' + i, i + .5, A * .82, NOTE[i % 4], { font: 'Caveat', size: .05, color: ink })); }
      }
      return { slots: sl, deco, bg: { c1: ['#7a1712', '#e8dccb', '#1b1f2a'][o.v], pattern: 'paper' } };
    } },
  { id: 'margin', cat: 'paper', name: 'Notizrand', desc: 'Papierstreifen mit Schreibschrift am Rand.', vars: ['Links', 'Rechts', 'Spitzenrand'],
    build(n, A, o) {
      const sl = [], deco = [], L = o.v !== 1;
      if (o.v === 2) { for (let i = 0; i < n; i++) { sl.push(S(i + .2, 0, .8, A)); deco.push(SH('lace', i + .11, A / 2, .22, A + .1, { shadow: true }), TX('m' + i, i + .1, A / 2, ['Ein Tag im Leben', 'Kleine Fluchten', 'Nur wir zwei', 'Irgendwo am Meer'][i % 4], { font: 'Great Vibes', size: .065, color: '#3a3226', rot: -90 }), SH('clip', i + .16, A * .1, .05, .13, { rot: 10 })); } return { slots: sl, deco, bg: { c1: '#f4f1ea' } }; }
      for (let i = 0; i < n; i++) {
        sl.push(S(i + (L ? .2 : 0), 0, .8, A));
        const px = i + (L ? .1 : .9);
        deco.push(SH('paper', px, A / 2, .24, A + .1, { under: false, shadow: true }), TX('m' + i, px, A / 2, ['Ein Tag im Leben', 'Kleine Fluchten', 'Nur wir zwei', 'Irgendwo am Meer'][i % 4], { font: 'Great Vibes', size: .07, color: '#3a3226', rot: -90 }),
          SH('clip', px + (L ? .05 : -.05), A * .12, .05, .13, { rot: L ? 10 : -10 }), SH('clip', px + (L ? .05 : -.05), A * .82, .05, .13, { rot: L ? -6 : 6 }));
      }
      return { slots: sl, deco, bg: { c1: '#f4f1ea' } };
    } },

  /* ---------- Kritzeleien ---------- */
  { id: 'scribble', cat: 'doodle', name: 'Kritzel-Rahmen', desc: 'Handgezeichnete Linien um die Fotos – jede Slide anders.', vars: ['Rahmen', 'Mit Pfeil', 'Ecken'],
    build(n, A, o) {
      const sl = [], deco = [], P = pager(n, o, 4), K = { fill: '#1d1d1d' };
      for (let i = 0; i < n; i++) {
        const k = o.mix ? (o.v + P(i)) % 4 : o.v;
        if (k === 0) { sl.push(C(i + .5, A / 2, .72, A * .66)); deco.push(SH('scribble', i + .5, A / 2, .76, A * .7, K)); }
        else if (k === 1) { sl.push(C(i + .42, A * .55, .62, A * .62)); deco.push(SH('scribble', i + .42, A * .55, .66, A * .66, K), SH('scribbleArrow', i + .78, A * .15, .2, .1, { ...K, rot: 8 }),
          TX('a' + i, i + .56, A * .11, ['alles, was ich brauche', 'genau so', 'mein Lieblingsort', 'nochmal bitte'][i % 4], { font: 'Caveat', size: .045, color: '#1d1d1d', rot: -6 })); }
        else if (k === 2) { sl.push(C(i + .5, A / 2, .72, A * .7)); deco.push(SH('corners', i + .5, A / 2, .82, A * .8, K)); }
        else { sl.push(C(i + .36, A * .32, .5, A * .4, { rot: -3 }), C(i + .62, A * .7, .5, A * .4, { rot: 2 })); deco.push(SH('scribble', i + .36, A * .32, .54, A * .44, K), SH('scribbleArrow', i + .3, A * .66, .16, .1, { ...K, rot: 100 }),
          TX('b' + i, i + .25, A * .86, ['und dann …', 'später', 'wir'][i % 3], { font: 'Caveat', size: .045, color: '#1d1d1d', rot: -4 })); }
      }
      return { slots: sl, deco, bg: { c1: '#fbfaf8' } };
    } },
  { id: 'moodboard', cat: 'doodle', name: 'Moodboard', desc: 'Lockeres Raster mit kleinen Kritzeleien.', gap: .02, vars: ['Hell', 'Mit Zitat'],
    build(n, A, o) {
      const sl = [], deco = [], g = o.g;
      for (let i = 0; i < n; i++) {
        sl.push(S(i + .1, .06, .5, A * .42), S(i + .64, .06, .3, A * .3));
        const y2 = .06 + A * .42 + g; sl.push(S(i, y2, .33 - g / 2, A * .25), S(i + .33 + g / 2, y2, .33 - g, A * .25), S(i + .66 + g / 2, y2, .34 - g / 2, A * .25));
        sl.push(S(i + .55, y2 + A * .25 + g, .3, A - (y2 + A * .25 + g) - .05));
        deco.push(SH('sparkle', i + .2, y2 + .04, .05, .05, { outline: true, fill: '#1d1d1d', sw: 3 }), SH('sparkle', i + .53, y2 + .04, .05, .05, { outline: true, fill: '#1d1d1d', sw: 3 }), SH('scribbleArrow', i + .33, y2 + A * .25 + .12, .16, .08, { fill: '#1d1d1d' }));
        if (o.v) deco.push(TX('q' + i, i + .25, A * .87, ['so fühlt sich\nSommer an', 'weniger, aber\nbesser', 'mehr davon', 'leise Tage'][i % 4], { font: 'Caveat', size: .045, color: '#1d1d1d', rot: -4 }));
      }
      return { slots: sl, deco, bg: { c1: '#ffffff' } };
    } },

  /* ---------- weitere Raster & Editorial ---------- */
  { id: 'textGrid', cat: 'grid', name: 'Raster mit Worten', desc: 'Fotos und Wörter im Schachbrett.', vars: ['Satz', 'Nummeriert', 'Mittelspalte'],
    build(n, A, o) {
      const sl = [], deco = [], words = ['Hallo,', 'mein', 'liebster', 'Sommer', 'bisher.', 'Danke', 'für', 'alles', '♡'];
      let wi = 0, num = 1; const cw = 1 / 3, ch = A / 3;
      for (let i = 0; i < n; i++) for (let k = 0; k < 9; k++) {
        const r = Math.floor(k / 3), c = k % 3, isText = o.v === 2 ? c === 1 : (r + c) % 2 === 1, x = i + c * cw, y = r * ch;
        if (isText) deco.push(TX('w' + i + k, x + cw / 2, y + ch / 2, o.v === 1 ? `(${String(num++).padStart(2, '0')})` : words[wi++ % words.length], { font: o.v === 1 ? 'Space Mono' : 'Playfair Display', size: o.v === 1 ? .022 : .03, color: '#2b2b2b' }));
        else sl.push(S(x, y, cw, ch));
      }
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
  { id: 'pip', cat: 'pano', name: 'Bild im Bild', desc: 'Foto als Hintergrund, darauf gerahmte Fotos.', vars: ['Mittig', 'Versetzt', 'Zwei nebeneinander'],
    build(n, A, o) {
      const sl = [], F = { border: .012, borderColor: '#ffffff', shadow: true }, P = pager(n, o, 4);
      for (let i = 0; i < n; i++) {
        sl.push(S(i, 0, 1, A));
        const k = o.mix ? (o.v + P(i)) % 4 : o.v;
        if (k === 0) sl.push(C(i + .5, A * .55, .58, A * .5, F));
        else if (k === 1) sl.push(C(i + .36, A * .66, .5, A * .48, F));
        else if (k === 2) sl.push(C(i + .3, A * .52, .38, A * .48, { ...F, shadow: false }), C(i + .7, A * .52, .38, A * .48, { ...F, shadow: false }));
        else sl.push(C(i + .66, A * .3, .46, A * .34, { ...F, rot: 3 }));
      }
      return { slots: sl };
    } },
  { id: 'poster', cat: 'edit', name: 'Filmplakat', desc: 'Titel, Lorbeerkränze und Abspann, dann Filmszenen.', vars: ['Klassisch', 'Schreibschrift'],
    build(n, A, o) {
      const sl = [S(0, 0, 1, A)], deco = [], col = o.v ? '#d9b8e8' : '#ffffff';
      [.3, .5, .7].forEach((x, k) => deco.push(SH('laurel', x, A * .33, .17, .13, { fill: '#ffffff' }), TX('lw' + k, x, A * .33, ['KAMERA\nROLLE', 'BESTER\nTAG', 'SCHÖNE\nMOMENTE'][k], { font: 'Bebas Neue', size: .018, color: '#ffffff', lineH: 1 })));
      deco.push(TX('pt', .5, A * .6, o.v ? 'Hamburg' : 'HAMBURG', { font: o.v ? 'Great Vibes' : 'DM Serif Display', size: o.v ? .14 : .16, color: col }),
        TX('pd', .62, A * .5, today().toUpperCase(), { font: 'Bebas Neue', size: .055, color: col }),
        TX('pc', .5, A * .91, 'EIN FILM VON DIR · KAMERA STREIFZUG · MUSIK VOM WIND\nIN DEN HAUPTROLLEN: SONNE, MEER UND EIN BISSCHEN REGEN\nDEMNÄCHST IN EINEM KARUSSELL IN DEINER NÄHE', { font: 'Bebas Neue', size: .016, color: '#ffffff', lineH: 1.2, spacing: 6 }));
      const P = pager(n, o, 3);
      for (let i = 1; i < n; i++) {
        const k = P(i);
        if (k === 0) sl.push(S(i, 0, 1, A));
        else if (k === 1) sl.push(S(i, A * .12, 1, A * .76)); // Kinobalken
        else sl.push(S(i, 0, 1, A * .5 - .006), S(i, A * .5 + .006, 1, A * .5 - .006));
        deco.push(TX('pk' + i, i + .5, A * .95, `SZENE ${i + 1} · ${today().toUpperCase()}`, { font: 'Bebas Neue', size: .02, color: '#ffffff', spacing: 20 }));
      }
      return { slots: sl, deco, bg: { c1: '#111111' } };
    } },
  { id: 'ovalNoir', cat: 'edit', name: 'Kino-Oval', desc: 'Ovale und Bögen auf Schwarz, leise Typo.', vars: ['Oval', 'Bogen'],
    build(n, A, o) {
      const sl = [], deco = [], P = pager(n, o, 3), SHP = ['circle', 'arch', 'round'];
      for (let i = 0; i < n; i++) {
        const sh = SHP[(o.v + P(i)) % 3];
        if (sh === 'round') sl.push(C(i + .36, A * .4, .5, A * .6, { shape: 'circle' }), C(i + .7, A * .55, .38, A * .4, { shape: 'arch' }));
        else sl.push(C(i + .5, A * .4, .84, A * .66, { shape: sh }));
        deco.push(TX('l' + i, i + .19, A * .88, ['DIE SCHÖNHEIT', 'NUR EIN', 'LEISE', 'AM ENDE'][i % 4], { font: 'Space Mono', size: .018, color: '#e9e6df', spacing: 8 }),
          TX('r' + i, i + .78, A * .88, ['DER KLEINEN DINGE', 'MOMENT', 'TAGE', 'DES TAGES'][i % 4], { font: 'Space Mono', size: .018, color: '#e9e6df', spacing: 8 }));
      }
      return { slots: sl, deco, bg: { c1: '#0b0b0b' } };
    } },
  { id: 'notes', cat: 'edit', name: 'Reisenotizen', desc: 'Randlose Fotos mit kleinen Schreibmaschinen-Notizen.', vars: ['Notizen', 'Mit Rahmenlinie'],
    build(n, A, o) {
      const sl = [], deco = [], T = { font: 'Space Mono', color: '#ffffff', shadow: true };
      for (let i = 0; i < n; i++) {
        sl.push(S(i, 0, 1, A));
        deco.push(TX('t1' + i, i + .82, .08, 'REISEARCHIV', { ...T, size: .016, spacing: 20 }),
          TX('t2' + i, i + .2, A * .32, `FILMROLLE 0${(i % 9) + 1}\nORTSZEIT ${13 + i}:4${i % 10}\nUNTERWEGS: ZU FUSS`, { ...T, size: .015, lineH: 1.35 }),
          TX('t3' + i, i + .78, A * .66, 'NOTIZEN AUS\nDER STADT', { ...T, size: .028, lineH: 1.1, spacing: 6 }),
          TX('t4' + i, i + .78, A * .94, `ORTSMARKE · ${['53°33′N', '48°08′N', '52°31′N', '50°56′N'][i % 4]}`, { ...T, size: .014, spacing: 10 }));
        if (o.v) deco.push(SH('frame', i + .5, A / 2, .92, A - .08, { fill: '#ffffff', sw: 3 }));
      }
      return { slots: sl, deco };
    } },
  { id: 'scriptTitle', cat: 'edit', name: 'Schreibschrift-Titel', desc: 'Geschwungener Titel über geteiltem Bild.', vars: ['Geteilt', 'Vollbild'],
    build(n, A, o) {
      const sl = o.v ? [S(0, 0, 1, A)] : [S(0, 0, .5, A), S(.5, 0, .5, A)], deco = [];
      sl.push(...pages(n, A, o, 1, ['full', 'twoTall', 'pip', 'two']));
      deco.push(TX('st', .48, A * .36, 'Langsame Tage', { font: 'Great Vibes', size: .13, color: '#f4e7b4', rot: -7, shadow: true }), TX('ss', .36, A * .44, 'AUF EINER INSEL', { font: 'Playfair Display', size: .032, color: '#f4e7b4', spacing: 4, shadow: true }));
      return { slots: sl, deco };
    } },
  { id: 'filmV', cat: 'analog', name: 'Filmstreifen hoch', desc: 'Kleinbildstreifen im Hochformat.', vars: ['Großes Bild', 'Drei Bilder', 'Randlos'],
    build(n, A, o) {
      const sl = [], F = { frame: 'filmv', borderColor: '#161616' };
      if (o.v === 2) { for (let i = 0; i < n; i++) sl.push(C(i + .5, A / 2, 1 / 1.3, A / 1.05, F)); return { slots: sl }; }
      const P = pager(n, o, 3);
      for (let i = 0; i < n; i++) {
        const k = o.mix ? (o.v + P(i)) % 3 : o.v;
        if (k === 0) sl.push(C(i + .5, A / 2, .6, A * .88, { ...F, rot: i % 2 ? 1.5 : -1, shadow: true }));
        else if (k === 1) { const h = .33, w = Math.min(.58, h * 1.5), oh = h * 1.05; for (let j = 0; j < 3; j++) sl.push(C(i + .5, A / 2 + (j - 1) * oh, w, h, F)); }
        else { sl.push(C(i + .3, A * .48, .34, A * .55, { ...F, rot: -4, shadow: true }), C(i + .7, A * .52, .34, A * .55, { ...F, rot: 3, shadow: true })); }
      }
      return { slots: sl, bg: { c1: o.v ? '#e9e4da' : '#efece6', pattern: 'paper' } };
    } },

  /* ---------- Collage ---------- */
  { id: 'party', cat: 'collage', name: 'Party-Collage', desc: 'Fotostreifen, Sofortbild, Sticker und Glitzersterne.', vars: ['Nacht', 'Hell'],
    build(n, A, o) {
      const sl = [], deco = [], dark = !o.v;
      for (let i = 0; i < n; i++) {
        deco.push(SH('paper', i + .3, A * .5, .6, A * 1.02, { fill: dark ? '#1b1b1b' : '#efe9de', rot: -2, under: true }));
        for (let k = 0; k < 3; k++) sl.push(S(i + .02, .04 + k * (A * .31), .5, A * .29, { look: 'trix', border: .008, borderColor: '#151515' }));
        sl.push(C(i + .72, A * .36, .44, .44, { frame: 'polaroid', rot: 6, shadow: true }));
        sl.push(C(i + .7, A * .76, .56, A * .4, { sticker: true, border: .02, borderColor: '#ffffff', shadow: true, rot: -3 }));
        [[.55, .12], [.38, .64], [.93, .55], [.6, .9]].forEach(([fx, fy], k) => deco.push(SH('starSticker', i + fx, A * fy, .07, .067, { rot: k * 17 })));
        if (i === 0) deco.push(TX('pt', .72, A * .07, 'Alles Liebe\nzum Geburtstag!', { font: 'Great Vibes', size: .06, color: dark ? '#ffffff' : '#2b2b2b', rot: -8, lineH: 1 }));
      }
      return { slots: sl, deco, bg: { c1: dark ? '#0f0f10' : '#ffffff', pattern: dark ? 'none' : 'crumpled' } };
    } },
  { id: 'spots', cat: 'collage', name: 'Orte-Collage', desc: 'Überlappende Fotos mit 📍-Ortsmarken.', vars: ['Hell', 'Herbst'],
    build(n, A, o) {
      const sl = [], deco = [], P = ['Gemütliches Café', 'Kürbisfeld', 'Lieblingsplatz', 'Wochenmarkt', 'Am Hafen', 'Altstadt'], B = { border: .012, borderColor: '#ffffff' };
      for (let i = 0; i < n; i++) {
        sl.push(S(i + .07, .1, .42, A * .32, B), S(i + .5, .04, .44, A * .3, B), S(i + .4, A * .32, .46, A * .34, { ...B, shadow: true }), S(i + .1, A * .4, .4, A * .32, B), S(i + .52, A * .64, .42, A * .32, B), S(i + .06, A * .73, .44, A * .23, B));
        deco.push(TX('p' + i, i + .27, A * .2, P[(i * 2) % 6], { font: 'Instrument Sans', size: .022, color: '#1d1d1d', bg: 'pin' }), TX('q' + i, i + .7, A * .58, P[(i * 2 + 1) % 6], { font: 'Instrument Sans', size: .022, color: '#1d1d1d', bg: 'pin' }));
      }
      return { slots: sl, deco, bg: { c1: o.v ? '#f3ece2' : '#ffffff', pattern: o.v ? 'kraft' : 'none' } };
    } },
  { id: 'overlapCols', cat: 'collage', name: 'Überlappende Spalten', desc: 'Zwei Spalten, Fotos schieben sich übereinander.', vars: ['Locker', 'Dicht'],
    build(n, A, o) {
      const sl = [], B = { border: .01, borderColor: '#ffffff', shadow: !!o.v };
      for (let i = 0; i < n; i++) {
        const k = o.v ? 4 : 3, h = (A - .1) / k + .08;
        for (let j = 0; j < k; j++) { sl.push(S(i + .06 + (j % 2) * .04, .05 + j * (A - .1 - h) / (k - 1), .44, h, B)); sl.push(S(i + .5 - (j % 2) * .04, .05 + (j + .5) * (A - .1 - h) / (k - .5), .44, h * .9, B)); }
      }
      return { slots: sl, bg: { c1: '#ffffff' } };
    } },
  { id: 'stack', cat: 'collage', name: 'Stapel auf Foto', desc: 'Randloses Foto, darauf versetzte Abzüge.', vars: ['Drei', 'Zwei groß'],
    build(n, A, o) {
      const sl = [], B = { border: .01, borderColor: '#ffffff', shadow: true }, P = pager(n, o, 3);
      for (let i = 0; i < n; i++) {
        sl.push(S(i, 0, 1, A));
        const k = o.mix ? (o.v + P(i)) % 3 : o.v;
        if (k === 0) [[.44, .2], [.58, .5], [.44, .8]].forEach(([fx, fy]) => sl.push(C(i + fx, A * fy, .44, A * .28, B)));
        else if (k === 1) [[.4, .3], [.62, .7]].forEach(([fx, fy], j) => sl.push(C(i + fx, A * fy, .56, A * .38, { ...B, rot: j ? 2 : -2 })));
        else sl.push(C(i + .5, A * .5, .62, A * .62, { ...B, frame: 'polaroid', rot: -3 }));
      }
      return { slots: sl };
    } },
  { id: 'tornReveal', cat: 'paper', name: 'Riss-Übergang', desc: 'Ein gerissener Rand gibt das nächste Foto frei.', vars: ['Rechts', 'Mit Rissspalte'],
    build(n, A, o) {
      const sl = [];
      for (let i = 0; i < n; i++) {
        sl.push(S(i + .7, 0, .32, A));
        sl.push(S(i - .01, 0, .9, A, { edge: 'torn', edgeSides: 'r', shadow: true }));
        if (o.v) sl.push(C(i + .9, A * .3, .34, A * .3, { edge: 'torn', shadow: true, rot: 3 }), C(i + .92, A * .72, .32, A * .3, { edge: 'torn', shadow: true, rot: -2 }));
      }
      return { slots: sl };
    } },
  { id: 'postedDeleted', cat: 'grid', name: 'Gepostet vs. gelöscht', desc: 'Das eine Bild – und all die anderen.', fill: 'repeat', gap: .006, vars: ['Raster', 'Groß'],
    build(n, A, o) {
      const sl = [], deco = [], cols = 3, rows = o.v ? 6 : 9, g = o.g, cw = (.5 - g * (cols + 1)) / cols, ch = (A - g * (rows + 1)) / rows;
      for (let i = 0; i < n; i++) {
        sl.push(S(i, 0, .5, A));
        for (let r2 = 0; r2 < rows; r2++) for (let c = 0; c < cols; c++) { const x = i + .5 + g + c * (cw + g), y = g + r2 * (ch + g); sl.push(S(x, y, cw, ch)); deco.push(SH('check', x + cw - .022, y + ch - .022, .028, .028, {})); }
        deco.push(TX('pp' + i, i + .25, A * .52, 'gepostet', { font: 'Instrument Sans', size: .028, color: '#ffffff', shadow: true }), TX('pd' + i, i + .75, A * .52, 'gelöscht', { font: 'Instrument Sans', size: .028, color: '#ffffff', shadow: true }));
      }
      return { slots: sl, deco, bg: { c1: '#ffffff' } };
    } },

  /* ---------- weitere Editorial ---------- */
  { id: 'titleCenter', cat: 'edit', name: 'Titel mittig', desc: 'Kleiner, edler Titel in der Bildmitte.', vars: ['Erinnerungen', 'Mit Rahmenlinie', 'Mit Untertitel'],
    build(n, A, o) {
      const sl = [S(0, 0, 1, A)], deco = [];
      sl.push(...pages(n, A, o, 1, ['full', 'pip', 'twoTall', 'full']));
      if (o.v === 1) for (let i = 0; i < n; i++) deco.push(SH('frame', i + .5, A / 2, .9, A - .1, { fill: '#ffffff', sw: 3 }));
      if (o.v === 2) deco.push(TX('t1', .5, A * .44, 'Herbstbilder', { font: 'Playfair Display', size: .055, color: '#ffffff', shadow: true }), TX('t2', .5, A * .48, 'AUFGENOMMEN AUF FILM', { font: 'Instrument Sans', size: .014, color: '#ffffff', spacing: 12, shadow: true }));
      else deco.push(TX('t1', .5, A * .43, 'HERBST', { font: 'Instrument Sans', size: .016, color: '#ffffff', spacing: 30, shadow: true }), TX('t2', .5, A * .47, 'ERINNERUNGEN', { font: 'DM Serif Display', size: .06, color: '#ffffff', spacing: 2, shadow: true }));
      return { slots: sl, deco, bg: { c1: '#111111' } };
    } },
  { id: 'framePeek', cat: 'seam', name: 'Rand mit Vorschau', desc: 'Weißer Rand, das nächste Foto lugt über die Naht.', vars: ['Mit Titel', 'Ohne Titel'],
    build(n, A, o) {
      const sl = [], deco = [];
      for (let i = 0; i < n; i++) sl.push(i ? S(i - .14, .1, .9, A - .2, { shadow: true }) : S(.04, .04, .82, A - .08));
      if (!o.v) deco.push(TX('t1', .45, A * .42, 'Herbstbilder', { font: 'Playfair Display', size: .05, color: '#ffffff', shadow: true }), TX('t2', .45, A * .46, 'AUFGENOMMEN AUF FILM', { font: 'Instrument Sans', size: .013, color: '#ffffff', spacing: 12, shadow: true }));
      return { slots: sl, deco, bg: { c1: '#ffffff' } };
    } },
  { id: 'keyline', cat: 'edit', name: 'Feine Linie', desc: 'Viel Weiß, Fotos mit Haarlinie – Anordnung wechselt.', vars: ['Schwarz', 'Abgesetzt'],
    build(n, A, o) {
      const K = { keyline: '#111111', keylineGap: o.v ? .02 : 0 };
      return { slots: [C(.5, A / 2, .84, A - .2, K), ...pages(n, A, o, 1, ['margin', 'two', 'small', 'twoTall', 'offset'], { card: K })], bg: { c1: '#fbfbfa' } };
    } },
  { id: 'handCaption', cat: 'edit', name: 'Handnotiz', desc: 'Fotos mit handschriftlicher Zeile.', vars: ['Unten', 'Oben'],
    build(n, A, o) {
      const sl = [S(0, 0, 1, A)], deco = [], N = ['Hamburg, auf 35mm', 'Sonntagmorgen', 'irgendwo im Norden', 'Licht um halb acht', 'der Weg nach Hause'];
      sl.push(...pages(n, A, o, 1, ['full', 'pip', 'margin', 'full', 'twoTall'], { card: { border: .01, borderColor: '#ffffff' } }));
      for (let i = 0; i < n; i++) deco.push(TX('h' + i, i + .5, o.v ? A * .08 : A * .93, N[i % 5], { font: 'Caveat', size: .05, color: '#ffffff', shadow: true }));
      return { slots: sl, deco, bg: { c1: '#2b2b2b' } };
    } },
  { id: 'bigWord', cat: 'edit', name: 'Großes Wort', desc: 'Foto im Foto, darüber ein großes Wort.', vars: ['okt🌼ber', 'SOMMER', 'hallo'],
    build(n, A, o) {
      const sl = [], deco = [];
      for (let i = 0; i < n; i++) { sl.push(S(i, 0, 1, A)); sl.push(C(i + .5, A * .5, .7, A * .76)); }
      deco.push(TX('w', .5, A * .52, ['okt🌼ber', 'SOMMER', 'hallo'][o.v], { font: o.v === 1 ? 'Anton' : 'DM Serif Display', size: .2, color: '#f6efdc', shadow: true, spacing: o.v === 1 ? 4 : 0 }));
      return { slots: sl, deco };
    } },
  { id: 'travelFrame', cat: 'edit', name: 'Reise-Rahmen', desc: 'Schmaler Rand, Ort und Bildnummer.', vars: ['Weiß', 'Creme'],
    build(n, A, o) {
      const sl = [], deco = [], ink = '#3a3226', P = pager(n, o, 3);
      for (let i = 0; i < n; i++) {
        const k = P(i), y1 = A - .09;
        if (k === 0) sl.push(S(i + .025, .025, .95, y1 - .025));
        else if (k === 1) { const h = (y1 - .05) / 2; sl.push(S(i + .025, .025, .95, h), S(i + .025, .05 + h, .95, h)); }
        else sl.push(S(i + .025, .025, .6, y1 - .025), S(i + .645, .025, .33, (y1 - .05) / 2), S(i + .645, .05 + (y1 - .05) / 2, .33, (y1 - .05) / 2));
        deco.push(TX('o' + i, i + .14, A - .032, ['Rom, 2026', 'Lissabon', 'Kopenhagen', 'Wien', 'Paris'][i % 5], { font: 'Caveat', size: .03, color: ink }), TX('n' + i, i + .93, A - .032, String(i + 1).padStart(2, '0'), { font: 'Special Elite', size: .022, color: ink }));
      }
      return { slots: sl, deco, bg: { c1: o.v ? '#efe8da' : '#ffffff', pattern: o.v ? 'paper' : 'none' } };
    } },
  { id: 'boothOnPhoto', cat: 'analog', name: 'Fotostreifen auf Foto', desc: 'Schwarz-weißer Fotostreifen auf einem Stimmungsbild.', vars: ['Mit Blättern', 'Ohne'],
    build(n, A, o) {
      const sl = [], deco = [];
      for (let i = 0; i < n; i++) {
        sl.push(S(i, 0, 1, A));
        const cx = i + .5, rot = i % 2 ? 2 : -2, pw = .36, ph = pw * .8, sh = 4 * ph + 3 * .015 + .06;
        deco.push(SH('rect', cx, A / 2, pw + .05, sh, { fill: '#111111', rot, shadow: true, after: sl.length - 1 }));
        for (let k = 0; k < 4; k++) { const [x, y] = rotPt(cx, A / 2, cx, A / 2 - sh / 2 + .03 + ph / 2 + k * (ph + .015), rot); sl.push(C(x, y, pw, ph, { rot, look: 'trix' })); }
        if (!o.v) deco.push(SH('leaves', i + .5, A / 2, .95, A * .9, {}));
        deco.push(TX('b' + i, i + .78, A * .74, ['Herbst\nromantisieren,\nTag 1', 'kleine\nPause', 'mit dir'][i % 3], { font: 'Caveat', size: .032, color: '#ffffff', rot: -8, shadow: true, lineH: 1 }));
      }
      return { slots: sl, deco };
    } },

  /* ---------- Formen ---------- */
  { id: 'circles', noMirror: true, cat: 'shape', name: 'Kreise', desc: 'Runde Ausschnitte mit Rand.', vars: ['Welle', 'Groß & klein', 'Verschieden'],
    build(n, A, o) {
      const sl = [], B = { shape: 'circle', border: .02, shadow: true };
      if (o.v === 0) { const c = n + 1; for (let i = 0; i < c; i++) sl.push(C(.5 + i * (n - 1) / Math.max(1, c - 1), A * (i % 2 ? .6 : .4), .62, .62, B)); }
      else if (o.v === 1) { for (let i = 0; i < n; i++) sl.push(C(i + .5, A * .42, .74, .74, B)); for (const x of seams(n)) if (n > 1) sl.push(C(x, A * .82, .3, .3, B)); }
      else { const r = seeded(21 + o.seed * 3), c = 2 * n; for (let i = 0; i < c; i++) { const d = .3 + r() * .4; sl.push(C((i + .5) * n / c, d / 2 + .05 + r() * (A - d - .1), d, d, B)); } }
      return { slots: sl, bg: { c1: '#ffffff' } };
    } },
  { id: 'arches', noMirror: true, cat: 'shape', name: 'Bögen', desc: 'Fotos in Bogenform.', vars: ['Reihe', 'Gestaffelt'],
    build(n, A, o) {
      const sl = [];
      if (!o.v) for (let i = 0; i < n; i++) sl.push(S(i + .15, A * .12, .7, A * .78, { shape: 'arch' }));
      else for (let i = 0; i < 2 * n - 1; i++) sl.push(S(.26 + i * .5, i % 2 ? A * .3 : A * .06, .48, .78, { shape: 'arch', shadow: true }));
      return { slots: sl, bg: { c1: '#f1e7da' } };
    } },
  { id: 'hearts', noMirror: true, cat: 'shape', name: 'Herzen', desc: 'Fotos in Herzform.', vars: ['Reihe', 'Verstreut'],
    build(n, A, o) {
      const sl = [];
      if (!o.v) for (let i = 0; i < n; i++) sl.push(C(i + .5, A / 2, .78, .7, { shape: 'heart', shadow: true }));
      else { const r = seeded(31 + o.seed), c = 2 * n; for (let i = 0; i < c; i++) sl.push(C((i + .5) * n / c, A * (.3 + r() * .4), .46, .41, { shape: 'heart', rot: (r() - .5) * 24, shadow: true })); }
      return { slots: sl, bg: { c1: '#f7e1e6' } };
    } },
  { id: 'blobs', noMirror: true, cat: 'shape', name: 'Organisch', desc: 'Weiche, freie Formen.', vars: ['Welle', 'Reihe'],
    build(n, A, o) {
      const sl = [];
      if (!o.v) { const c = n + 1; for (let i = 0; i < c; i++) sl.push(C(.5 + i * (n - 1) / Math.max(1, c - 1), A * (i % 2 ? .62 : .38), .64, .64, { shape: 'blob', rot: i * 40 })); }
      else for (let i = 0; i < n; i++) sl.push(C(i + .5, A / 2, .82, .82, { shape: 'blob', rot: i * 70 }));
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
