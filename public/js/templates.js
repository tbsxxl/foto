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

export const TPL_CATS = [['all', 'Alle'], ['pano', 'Panorama'], ['grid', 'Raster'], ['seam', 'Über die Naht'], ['analog', 'Analog'], ['edit', 'Editorial'], ['shape', 'Formen']];

export const TEMPLATES = [
  /* ---------- Panorama ---------- */
  { id: 'pano', cat: 'pano', name: 'Panorama', desc: 'Ein Foto läuft über alle Slides.', vars: ['Randlos', 'Mit Rand', 'Band', 'Abzug'],
    build(n, A, o) {
      if (o.v === 1) { const b = Math.max(.045, o.g * 1.6); return { slots: [S(b, b, n - 2 * b, A - 2 * b)], bg: { c1: '#ffffff' } }; }
      if (o.v === 2) return { slots: [S(0, A * .2, n, A * .6)], bg: { c1: '#f4efe6' } };
      if (o.v === 3) return { slots: [S(.1, A * .15, n - .2, A * .7, { rot: -1.2, border: .025, shadow: true })], bg: { c1: '#e8dcc8', pattern: 'paper' } };
      return { slots: [S(0, 0, n, A)] };
    } },
  { id: 'panoWin', cat: 'pano', name: 'Panorama-Fenster', desc: 'Ein Foto, sichtbar durch viele Rahmen.', gap: .03, vars: ['Raster', 'Streifen', 'Kreise', 'Bögen', 'Mosaik'],
    build(n, A, o) {
      const g = o.g, P = { k: 'w', R: [0, 0, n, A] }, sl = [];
      if (o.v === 0) for (let i = 0; i < n; i++) sl.push(...grid(i + g, g, 1 - 2 * g, A - 2 * g, 2, 2, g, { pano: P }));
      else if (o.v === 1) { const N = n * 4, w = (n - g * (N + 1)) / N; for (let j = 0; j < N; j++) sl.push(S(g + j * (w + g), g, w, A - 2 * g, { pano: P })); }
      else if (o.v === 2) { for (let i = 0; i < n; i++) sl.push(C(i + .5, A * .44, .7, .7, { shape: 'circle', pano: P })); for (const x of seams(n)) if (n > 1) sl.push(C(x, A * .84, .26, .26, { shape: 'circle', pano: P })); }
      else if (o.v === 3) for (let i = 0; i < n; i++) sl.push(S(i + .15, A * .1, .7, A * .8, { shape: 'arch', pano: P }));
      else partition([g, g, n - 2 * g, A - 2 * g], n * 3, g, seeded(5 + o.seed * 13)).forEach(r => sl.push(S(...r, { pano: P })));
      return { slots: sl, bg: { c1: o.v === 1 ? '#111111' : '#ffffff' } };
    } },
  { id: 'panoCards', cat: 'pano', name: 'Panorama + Karten', desc: 'Hintergrund-Panorama, weitere Fotos als Karten auf den Nähten.', vars: ['Sofortbilder', 'Karten', 'Kreise'],
    build(n, A, o) {
      const sl = [S(0, 0, n, A)];
      seams(n).forEach((x, i) => {
        if (o.v === 0) sl.push(C(x, A * .47, .48, .48, { frame: 'polaroid', rot: i % 2 ? 5 : -5, shadow: true }));
        else if (o.v === 1) sl.push(C(x, A / 2, .56, .7, { shape: 'round', radius: 6, border: .018, shadow: true }));
        else sl.push(C(x, A / 2, .6, .6, { shape: 'circle', border: .02, shadow: true }));
      });
      return { slots: sl };
    } },
  { id: 'panoSplit', cat: 'pano', name: 'Panorama + Reihe', desc: 'Breites Panorama, darunter Einzelbilder.', gap: .025, vars: ['Panorama oben', 'Panorama unten', 'Mit Kreisen'],
    build(n, A, o) {
      const g = o.g, sl = [];
      if (o.v === 2) { sl.push(S(0, 0, n, A * .64)); for (let i = 0; i < n; i++) sl.push(C(i + .5, A * .64, .44, .44, { shape: 'circle', border: .02, shadow: true })); return { slots: sl, bg: { c1: '#f4efe6' } }; }
      const ph = A * .56, top = o.v === 0;
      sl.push(S(0, top ? 0 : A - ph, n, ph));
      for (let i = 0; i < n; i++) sl.push(S(i + g, top ? ph + g : g, 1 - 2 * g, A - ph - 2 * g));
      return { slots: sl, bg: { c1: '#ffffff' } };
    } },
  { id: 'spread', cat: 'pano', name: 'Doppelseite', desc: 'Je ein Foto über zwei Slides.', gap: .03, vars: ['Randlos', 'Mit Rand', 'Mit Fuge'],
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
  { id: 'grid', cat: 'grid', name: 'Raster', desc: 'Gleichmäßige Felder auf jeder Slide.', gap: .025, vars: ['2×2', '3×3', '1×2', '2×1', '3×2', '2×3', '1×3'],
    build(n, A, o) {
      const [c, r] = [[2, 2], [3, 3], [1, 2], [2, 1], [3, 2], [2, 3], [1, 3]][o.v] || [2, 2], g = o.g, sl = [];
      for (let i = 0; i < n; i++) sl.push(...grid(i + g, g, 1 - 2 * g, A - 2 * g, c, r, g));
      return { slots: sl, bg: { c1: '#ffffff' } };
    } },
  { id: 'mosaic', cat: 'grid', name: 'Mosaik', desc: 'Freie Aufteilung, Felder laufen über die Nähte.', gap: .022, vars: ['Mix 1', 'Mix 2', 'Mix 3', 'Mix 4'],
    build(n, A, o) {
      const cnt = Math.min(n * 5, Math.max(o.k, n * 2)), g = o.g;
      return { slots: partition([g, g, n - 2 * g, A - 2 * g], cnt, g, seeded(17 + o.v * 31 + o.seed * 7)).map(r => S(...r)), bg: { c1: '#ffffff' } };
    } },
  { id: 'feature', cat: 'grid', name: 'Groß + zwei', desc: 'Ein Hauptbild und zwei kleine pro Slide.', gap: .025, vars: ['Groß links', 'Groß rechts', 'Groß oben', 'Abwechselnd'],
    build(n, A, o) {
      const g = o.g, sl = [];
      for (let i = 0; i < n; i++) {
        const x = i + g, y = g, w = 1 - 2 * g, h = A - 2 * g, v = o.v === 3 ? i % 2 : o.v;
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
  { id: 'brick', cat: 'grid', name: 'Mauerwerk', desc: 'Spalten mit versetzten Höhen über die Nähte.', gap: .022, vars: ['2 Spalten', '3 Spalten'],
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
  { id: 'seam', cat: 'seam', name: 'Über die Naht', desc: 'Fotos sitzen genau auf den Übergängen.', vars: ['Gerade', 'Gedreht', 'Groß mit Rand', 'Kreise'],
    build(n, A, o) {
      const sl = seams(n).map((x, i) => o.v === 3 ? C(x, A / 2, .78, .78, { shape: 'circle', border: .02, shadow: true })
        : o.v === 2 ? C(x, A / 2, 1.04, A * .78, { border: .022, shadow: true })
        : C(x, A / 2, A * .72 * .8, A * .72, { shadow: true, rot: o.v === 1 ? (i % 2 ? 4 : -4) : 0 }));
      return { slots: sl };
    } },
  { id: 'offset', cat: 'seam', name: 'Versetzt', desc: 'Jede Slide zeigt zwei halbe Fotos.', gap: .025, vars: ['Volle Höhe', 'Mit Rand', 'Gestaffelt'],
    build(n, A, o) {
      const g = o.g, sl = [];
      for (let i = 0; i <= n; i++) {
        if (o.v === 0) sl.push(S(i - .5 + g / 2, 0, 1 - g, A));
        else if (o.v === 1) sl.push(S(i - .5 + g / 2, g, 1 - g, A - 2 * g));
        else sl.push(S(i - .5 + g / 2, i % 2 ? A * .2 : g, 1 - g, A * .78));
      }
      return { slots: sl, bg: { c1: '#ffffff' } };
    } },
  { id: 'stairs', cat: 'seam', name: 'Treppe', desc: 'Fotos laufen schräg durchs Karussell.', vars: ['Abwärts', 'Aufwärts', 'Welle'],
    build(n, A, o) {
      const c = n + 1, w = .56, h = w / .85, sl = [];
      for (let i = 0; i < c; i++) { const t = i / Math.max(1, c - 1), f = o.v === 0 ? t : o.v === 1 ? 1 - t : .5 + .5 * Math.sin(t * Math.PI * 2);
        sl.push(C(.36 + i * (n - .72) / Math.max(1, c - 1), h / 2 + .06 + f * (A - h - .12), w, h, { shape: 'round', radius: 5, shadow: true })); }
      return { slots: sl };
    } },
  { id: 'zigzag', cat: 'seam', name: 'Zickzack', desc: 'Abwechselnd oben und unten.', vars: ['Klar', 'Weißer Rand', 'Abgerundet'],
    build(n, A, o) {
      const sl = []; for (let i = 0; i < 2 * n - 1; i++) sl.push(C(.5 + i * .5, A * (i % 2 ? .66 : .34), .58, .58 / .8 * (A > 1.3 ? 1 : .86),
        o.v === 1 ? { border: .018, shadow: true, rot: i % 2 ? 2 : -2 } : o.v === 2 ? { shape: 'round', radius: 10, shadow: true } : { shadow: true }));
      return { slots: sl };
    } },
  { id: 'overlap', cat: 'seam', name: 'Überlappend', desc: 'Große Abzüge überlagern sich über die Nähte.', vars: ['Locker', 'Dicht'],
    build(n, A, o) {
      const c = o.v ? 2 * n : n + 1, w = o.v ? .7 : .9, h = A * .6, sl = [];
      for (let i = 0; i < c; i++) sl.push(C(w / 2 + .05 + i * (n - w - .1) / Math.max(1, c - 1), A * (i % 2 ? .62 : .38), w, h, { border: .015, shadow: true, rot: i % 2 ? 2.5 : -2 }));
      return { slots: sl };
    } },
  { id: 'ribbon', cat: 'seam', name: 'Bildband', desc: 'Eine Reihe gleicher Bilder läuft durch.', gap: .025, vars: ['Mittig', 'Zwei Reihen', 'Schräg'],
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
  { id: 'instax', cat: 'analog', name: 'Instax', desc: 'Kleine Sofortbilder im Hochformat.', vars: ['Reihe', 'Verstreut'],
    build(n, A, o) {
      const sl = [], c = 2 * n, r = seeded(3 + o.seed * 11);
      for (let i = 0; i < c; i++) sl.push(C((i + .5) * n / c + (o.v ? (r() - .5) * .15 : 0), A * (o.v ? .3 + r() * .4 : .46), .36, .46, { frame: 'instax', rot: o.v ? (r() - .5) * 16 : (i % 2 ? 2 : -2), shadow: true }));
      return { slots: sl, bg: { c1: '#f6f1ea' } };
    } },
  { id: 'film', cat: 'analog', name: 'Filmstreifen', desc: 'Kleinbild-Negativstreifen.', vars: ['Waagerecht', 'Zwei Streifen', 'Schräg'],
    build(n, A, o) {
      const sl = [], F = { frame: 'film', borderColor: '#161616' };
      const strip = (cy, w, off = 0, rot = 0) => { const ow = w * 1.05, cnt = Math.ceil(n / ow) + 2;
        for (let j = 0; j < cnt; j++) { const cx = ow * (j + .5) - (cnt * ow - n) / 2 + off, dy = rot ? -(cx - n / 2) * Math.tan(rot * Math.PI / 180) : 0; sl.push(C(cx, cy + dy, w, w / 1.5, { ...F, rot })); } };
      if (o.v === 0) strip(A / 2, .6);
      else if (o.v === 1) { strip(A * .29, .5); strip(A * .71, .5, .26); }
      else strip(A / 2, .72, 0, -7);
      return { slots: sl, bg: { c1: o.v === 2 ? '#e9e4da' : '#efece6', pattern: o.v === 2 ? 'paper' : 'none' } };
    } },
  { id: 'contact', cat: 'analog', name: 'Kontaktabzug', desc: 'Viele kleine Negative wie auf dem Leuchttisch.', vars: ['Schwarz', 'Weiß'],
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
  { id: 'scrapbook', cat: 'analog', name: 'Album', desc: 'Abzüge mit Klebeband und Handschrift.', vars: ['Papier', 'Kraftpapier', 'Kariert'],
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
  { id: 'cover', cat: 'edit', name: 'Titel + Galerie', desc: 'Titelseite, dann die Bilder.', vars: ['Bogen', 'Kreis', 'Vollbild'],
    build(n, A, o) {
      const sl = [], deco = [];
      if (o.v === 0) sl.push(S(.19, A * .34, .62, A * .55, { shape: 'arch' }));
      else if (o.v === 1) sl.push(C(.5, A * .6, .66, .66, { shape: 'circle' }));
      else sl.push(S(0, 0, 1, A));
      for (let i = 1; i < n; i++) sl.push(C(i + .5, A / 2, .84, .84 / .8));
      const dark = o.v === 2;
      deco.push(TX('title', .5, dark ? A * .78 : A * .17, 'Wochenende\nam Meer', { font: 'DM Serif Display', size: .11, color: dark ? '#ffffff' : '#1d1d1d', lineH: 1.02, shadow: dark }));
      deco.push(TX('sub', .5, A * .94, 'WISCHEN →', { font: 'Space Mono', size: .032, color: dark ? '#ffffff' : '#1d1d1d', spacing: 18 }));
      return { slots: sl, deco, bg: { c1: '#f4efe6' } };
    } },
  { id: 'magazine', cat: 'edit', name: 'Magazin', desc: 'Großes Titelbild mit Schlagzeile.', vars: ['Schlagzeile', 'Kapitel'],
    build(n, A, o) {
      const sl = [S(0, 0, 1, A)], deco = [TX('title', .5, A * .13, 'DER NORDEN', { font: 'Anton', size: .16, color: '#ffffff', spacing: 4 }), TX('sub', .5, A * .9, 'Eine Fotostrecke über Wind & Licht', { font: 'Playfair Display', size: .043, color: '#ffffff' })];
      for (let i = 1; i < n; i++) {
        if (o.v === 0) { sl.push(S(i + .11, A * .08, .78, A * .72)); deco.push(TX('p' + i, i + .5, A * .9, String(i + 1).padStart(2, '0'), { font: 'Space Mono', size: .037, color: '#1d1d1d' })); }
        else { sl.push(S(i + .08, .08, .84, A * .6)); deco.push(TX('k' + i, i + .5, A * .6 + .2, `Kapitel ${ROMAN[i]}`, { font: 'DM Serif Display', size: .075, color: '#1d1d1d' }), TX('kt' + i, i + .5, A * .6 + .31, 'Notizen vom Weg', { font: 'Space Mono', size: .028, color: '#6b665e', spacing: 6 })); }
      }
      return { slots: sl, deco, bg: { c1: '#ffffff' } };
    } },
  { id: 'minimal', cat: 'edit', name: 'Galerie', desc: 'Viel Weißraum, kleine Bildunterschrift.', vars: ['Klein', 'Mittel', 'Mit Datum'],
    build(n, A, o) {
      const sl = [], deco = [], w = o.v === 1 ? .7 : .52, h = w / .8, cy = A * .45;
      for (let i = 0; i < n; i++) { sl.push(C(i + .5, cy, w, h)); deco.push(TX('c' + i, i + .5, cy + h / 2 + .07, o.v === 2 ? `${today()} · ${String(i + 1).padStart(2, '0')}` : `No. ${String(i + 1).padStart(2, '0')}`, { font: 'Space Mono', size: .026, color: '#4a463f', spacing: 8 })); }
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
  { id: 'timeline', cat: 'edit', name: 'Zeitstrahl', desc: 'Eine Linie verbindet alle Bilder.', vars: ['Rechteckig', 'Kreise'],
    build(n, A, o) {
      const sl = [], deco = [SH('line', n / 2, A / 2, n - .1, .008, { fill: '#1d1d1d', under: true })], c = 2 * n - 1;
      for (let i = 0; i < c; i++) {
        const x = .5 + i * .5, up = i % 2 === 0, w = o.v ? .4 : .42, h = o.v ? .4 : .52;
        sl.push(C(x, up ? A / 2 - .06 - h / 2 : A / 2 + .06 + h / 2, w, h, o.v ? { shape: 'circle', border: .012 } : { shape: 'round', radius: 5 }));
        deco.push(SH('circle', x, A / 2, .045, .045, { fill: '#1d1d1d' }), TX('d' + i, x + .1, up ? A / 2 + .045 : A / 2 - .045, `Tag ${i + 1}`, { font: 'Space Mono', size: .024, color: '#1d1d1d' }));
      }
      return { slots: sl, deco, bg: { c1: '#f4efe6' } };
    } },
  { id: 'quote', cat: 'edit', name: 'Zitat', desc: 'Erste Slide ein Satz, dann die Bilder.', vars: ['Hell', 'Dunkel'],
    build(n, A, o) {
      const dark = o.v === 1, col = dark ? '#f4efe6' : '#1d1d1d', sl = [], deco = [TX('q', .5, A * .46, '„Manche Tage\nmöchte man\neinrahmen.“', { font: 'Playfair Display', size: .095, color: col, lineH: 1.1 }), TX('qa', .5, A * .78, '— NOTIZ AN MICH', { font: 'Space Mono', size: .026, color: col, spacing: 12 })];
      for (let i = 1; i < n; i++) sl.push(dark ? S(i, 0, 1, A) : C(i + .5, A / 2, .84, .84 / .8));
      if (n === 1) sl.push(C(.5, A * .9, .2, .2, { shape: 'circle' }));
      return { slots: sl, deco, bg: { c1: dark ? '#121212' : '#f4efe6' } };
    } },

  /* ---------- Formen ---------- */
  { id: 'circles', cat: 'shape', name: 'Kreise', desc: 'Runde Ausschnitte mit Rand.', vars: ['Welle', 'Groß & klein', 'Verschieden'],
    build(n, A, o) {
      const sl = [], B = { shape: 'circle', border: .02, shadow: true };
      if (o.v === 0) { const c = n + 1; for (let i = 0; i < c; i++) sl.push(C(.5 + i * (n - 1) / Math.max(1, c - 1), A * (i % 2 ? .6 : .4), .62, .62, B)); }
      else if (o.v === 1) { for (let i = 0; i < n; i++) sl.push(C(i + .5, A * .42, .74, .74, B)); for (const x of seams(n)) if (n > 1) sl.push(C(x, A * .82, .3, .3, B)); }
      else { const r = seeded(21 + o.seed * 3), c = 2 * n; for (let i = 0; i < c; i++) { const d = .3 + r() * .4; sl.push(C((i + .5) * n / c, d / 2 + .05 + r() * (A - d - .1), d, d, B)); } }
      return { slots: sl, bg: { c1: '#ffffff' } };
    } },
  { id: 'arches', cat: 'shape', name: 'Bögen', desc: 'Fotos in Bogenform.', vars: ['Reihe', 'Gestaffelt'],
    build(n, A, o) {
      const sl = [];
      if (!o.v) for (let i = 0; i < n; i++) sl.push(S(i + .15, A * .12, .7, A * .78, { shape: 'arch' }));
      else for (let i = 0; i < 2 * n - 1; i++) sl.push(S(.26 + i * .5, i % 2 ? A * .3 : A * .06, .48, .78, { shape: 'arch', shadow: true }));
      return { slots: sl, bg: { c1: '#f1e7da' } };
    } },
  { id: 'hearts', cat: 'shape', name: 'Herzen', desc: 'Fotos in Herzform.', vars: ['Reihe', 'Verstreut'],
    build(n, A, o) {
      const sl = [];
      if (!o.v) for (let i = 0; i < n; i++) sl.push(C(i + .5, A / 2, .78, .7, { shape: 'heart', shadow: true }));
      else { const r = seeded(31 + o.seed), c = 2 * n; for (let i = 0; i < c; i++) sl.push(C((i + .5) * n / c, A * (.3 + r() * .4), .46, .41, { shape: 'heart', rot: (r() - .5) * 24, shadow: true })); }
      return { slots: sl, bg: { c1: '#f7e1e6' } };
    } },
  { id: 'blobs', cat: 'shape', name: 'Organisch', desc: 'Weiche, freie Formen.', vars: ['Welle', 'Reihe'],
    build(n, A, o) {
      const sl = [];
      if (!o.v) { const c = n + 1; for (let i = 0; i < c; i++) sl.push(C(.5 + i * (n - 1) / Math.max(1, c - 1), A * (i % 2 ? .62 : .38), .64, .64, { shape: 'blob', rot: i * 40 })); }
      else for (let i = 0; i < n; i++) sl.push(C(i + .5, A / 2, .82, .82, { shape: 'blob', rot: i * 70 }));
      return { slots: sl, bg: { c1: '#e9efe6' } };
    } },
  { id: 'mix', cat: 'shape', name: 'Formen-Mix', desc: 'Kreis, Bogen, Herz und Stern im Wechsel.', vars: ['Bunt', 'Ruhig'],
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
  const T = byId[id], A = 1.25, U = 40, L = T.build(n, A, { v, g: T.gap ?? .025, seed: 0, k: 6 }), W = n * U, H = A * U;
  const ph = 'var(--muted)', ac = 'var(--accent)';
  let s = `<defs><linearGradient id="pg${id}${v}" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${W}" y2="${H}"><stop offset="0" stop-color="#e08a5c"/><stop offset=".5" stop-color="#7a5b86"/><stop offset="1" stop-color="#2f4a6b"/></linearGradient></defs>`;
  s += `<rect width="${W}" height="${H}" fill="${L.bg?.c1 || 'var(--line)'}"/>`;
  const tf = (o, cx, cy) => o.rot ? ` transform="rotate(${o.rot} ${cx} ${cy})"` : '';
  const deco = (d) => {
    const cx = d.x * U, cy = d.y * U;
    if (d.t === 'text') { const lines = d.text.split('\n'), lh = d.size * U * 1.1, wmax = Math.max(...lines.map(t => t.length)) * d.size * U * .48;
      return lines.map((t, i) => `<rect x="${cx - wmax / 2}" y="${cy - lines.length * lh / 2 + i * lh + lh * .2}" width="${wmax * t.length / Math.max(...lines.map(q => q.length))}" height="${lh * .55}" rx="1" fill="${d.color}"${tf(d, cx, cy)}/>`).join(''); }
    const w = d.w * U, h = d.kind === 'line' ? Math.max(1, d.h * U) : d.h * U;
    return d.kind === 'circle' ? `<circle cx="${cx}" cy="${cy}" r="${w / 2}" fill="${d.fill}"/>` : `<rect x="${cx - w / 2}" y="${cy - h / 2}" width="${w}" height="${h}" fill="${d.fill}" opacity="${d.kind === 'tape' ? .9 : 1}"${tf(d, cx, cy)}/>`;
  };
  (L.deco || []).filter(d => d.under).forEach(d => s += deco(d));
  let pi = 0;
  L.slots.forEach(o => {
    const x = o.x * U, y = o.y * U, w = o.w * U, h = o.h * U, cx = x + w / 2, cy = y + h / 2, fill = o.pano ? `url(#pg${id}${v})` : (pi++ % 3 === 1 ? ac : ph);
    let g = '';
    if (o.frame) { const fc = o.borderColor || '#ffffff', b = w * .07;
      g += o.frame === 'film' ? `<rect x="${x - w * .03}" y="${y - h * .2}" width="${w * 1.06}" height="${h * 1.4}" fill="#161616"/>`
        : o.frame === 'dia' ? `<rect x="${cx - Math.max(w, h) * .71}" y="${cy - Math.max(w, h) * .71}" width="${Math.max(w, h) * 1.42}" height="${Math.max(w, h) * 1.42}" rx="2" fill="${fc}"/>`
        : `<rect x="${x - b}" y="${y - b}" width="${w + 2 * b}" height="${h + b * (o.frame === 'instax' ? 4.2 : 3.6)}" fill="${fc}"/>`; }
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
export const defaultTpl = (kind, v = 0) => ({ kind, v, gap: byId[kind].gap ?? .025, rad: 0, shadow: null, seed: 0, fill: 'ph' });
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
  const o = n => ({ v: t.v, g: t.gap, seed: t.seed, k });
  let n = state.slides;
  // nur Slides ergänzen, solange dadurch wirklich mehr Felder entstehen
  if (fitSlides) { const cnt = m => countGroups(T.build(m, A, o(m)).slots); let m = n; while (m < 20 && cnt(m) < k) m++; if (cnt(m) > cnt(n)) n = m; }
  state.slides = n;
  const L = T.build(n, A, o(n));
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
  state.layers = [...deco.filter(d => d.under), ...slotLayers, ...rest, ...others, ...deco.filter(d => !d.under)];
  deco.forEach(d => delete d.under);
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
  l.border = (s.border || 0) * W; l.borderColor = s.borderColor || '#ffffff';
  l.shadow = t.shadow == null ? !!s.shadow : t.shadow;
  l.opacity = 1; l.blend = 'source-over'; l.slot = j; l.tplKind = t.kind; l.hidden = false;
  if (s.pano) { l.pane = { R: s.pano.R, S: [s.x, s.y, s.w, s.h] }; if (l.srcId) { l.grp = gk + ':' + (l.dupOf || l.id); } computeBox(l); }
  else { delete l.pane; delete l.grp; delete l.crop.box; }
}
function makeDeco(d, old, W, kind) {
  let l;
  if (d.t === 'text') {
    l = newTextLayer(d.x * W, d.y * W, d.text);
    Object.assign(l, { font: d.font || 'Caveat', size: d.size * W, color: d.color || '#1d1d1d', shadow: !!d.shadow, spacing: d.spacing || 0, lineH: d.lineH || 1.16, rot: d.rot || 0 });
    if (old && old.type === 'text') { l.text = old.text; for (const k of ['font', 'color', 'size', 'bg', 'bgColor', 'stroke', 'strokeColor', 'upper', 'glow', 'align', 'spacing', 'lineH']) if (old.userEdited) l[k] = old[k]; }
  } else {
    l = newShapeLayer(d.kind, d.x * W, d.y * W); Object.assign(l, { w: d.w * W, h: d.h * W, fill: d.fill, rot: d.rot || 0, shadow: !!d.shadow });
  }
  l.tplKey = kind + ':' + (d.key || d.kind + ':' + d.x.toFixed(3) + ':' + d.y.toFixed(3)); l.under = !!d.under;
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
