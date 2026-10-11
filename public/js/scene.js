/* Ebenen, Quellen, Zeichnen der Szene */
import { clamp, seeded, state, ui, sources, cache, dims, FONTS, stampText } from './core.js';
import { mk, makeAux, processImage, prepare, cutout, shrink, cutHooks } from './process.js';
import { drawTapeReal, drawClipReal, drawBinderReal, drawDoodle, isDoodle, DOODLE_LIST } from './props.js';

export const flags = { fontsTick: 0, histDirty: false, throttle: 0, pending: false, draft: false };

/* ---------- Quellen ---------- */
export function orientCanvas(base, rot90, flip) {
  const odd = rot90 % 2 === 1, c = mk(odd ? base.height : base.width, odd ? base.width : base.height);
  const x = c.getContext('2d'); x.translate(c.width / 2, c.height / 2); x.rotate(rot90 * Math.PI / 2); if (flip) x.scale(-1, 1);
  x.drawImage(base, -base.width / 2, -base.height / 2); return c;
}
export async function loadScaled(src, maxLong) {
  if (src.kind === 'gen') { const s = Math.min(1, maxLong / Math.max(src.nw, src.nh)); return src.draw(Math.round(src.nw * s)); }
  let bmp = null, url = null;
  try {
    let img;
    if (window.createImageBitmap) { try { bmp = await createImageBitmap(src.file); img = bmp; } catch { bmp = null; } }
    if (!img) { url = URL.createObjectURL(src.file); img = new Image(); img.src = url; await img.decode(); }
    src.nw = img.naturalWidth || img.width; src.nh = img.naturalHeight || img.height;
    const s = Math.min(1, maxLong / Math.max(src.nw, src.nh)), c = mk(src.nw * s, src.nh * s);
    if (s < .5 && !bmp) { const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(img, 0, 0, c.width, c.height); return c; }
    const full = mk(src.nw * Math.min(1, s * 2), src.nh * Math.min(1, s * 2)), fx = full.getContext('2d'); fx.imageSmoothingQuality = 'high'; fx.drawImage(img, 0, 0, full.width, full.height);
    const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(full, 0, 0, c.width, c.height); full.width = full.height = 0; return c;
  } finally { if (url) URL.revokeObjectURL(url); if (bmp && bmp.close) bmp.close(); }
}
export function orientedAspect(l) { const s = sources.get(l.srcId); if (!s || !s.nw) return 1.5; return l.rot90 % 2 ? s.nh / s.nw : s.nw / s.nh; }
export function cropAspect(l) { return l.crop.ratio === 'orig' ? orientedAspect(l) : l.crop.ratio; }
export function cropRect(iw, ih, l) {
  const bx = l.crop.box; if (bx) return [bx[0] * iw, bx[1] * ih, bx[2] * iw, bx[3] * ih]; // fester Ausschnitt (Panorama-Fenster)
  const a = cropAspect(l), z = l.crop.zoom; let sw, sh;
  if (iw / ih > a) { sh = ih / z; sw = sh * a; } else { sw = iw / z; sh = sw / a; }
  return [(iw - sw) * l.crop.px, (ih - sh) * l.crop.py, sw, sh];
}
export const FRAMES = new Set(['polaroid', 'instax', 'film', 'filmv', 'dia']);
export function boxOf(l) {
  if (l.type === 'text') { const m = textMetrics(l), sx = l.sx || 1, sy = l.sy || 1; return { w: m.w * sx, h: m.h * sy, ow: m.w * sx, oh: m.h * sy, iy: 0, bb: 0 }; }
  if (l.type === 'shape') { const hh = l.kind === 'line' ? Math.max(l.h, 30) : l.h; return { w: l.w, h: hh, ow: l.w, oh: hh, iy: 0, bb: 0 }; }
  const w = l.w, h = w / cropAspect(l), b = l.border || 0;
  switch (l.shape) {
    case 'polaroid': { const bb = Math.max(b, w * .05), bot = bb * 3.4; return { w, h, ow: w + 2 * bb, oh: h + bb + bot, iy: -(bot - bb) / 2, bb, top: bb, bot }; }
    case 'instax': { const bb = Math.max(b, w * .075), top = bb * 1.3, bot = bb * 3.6; return { w, h, ow: w + 2 * bb, oh: h + top + bot, iy: (top - bot) / 2, bb, top, bot }; }
    case 'film': { const bb = Math.max(b, w * .025), tb = Math.max(b, h * .2); return { w, h, ow: w + 2 * bb, oh: h + 2 * tb, iy: 0, bb, top: tb, bot: tb }; }
    case 'filmv': { const sb = Math.max(b, w * .15), tb = Math.max(b, h * .025); return { w, h, ow: w + 2 * sb, oh: h + 2 * tb, iy: 0, bb: sb, top: tb, bot: tb }; }
    case 'dia': { const S = Math.max(w, h) * 1.42; return { w, h, ow: S, oh: S, iy: -S * .02, bb: (S - w) / 2, top: (S - h) / 2, bot: (S - h) / 2 }; }
    default: { const bb = l.edge === 'stamp' ? Math.max(b, Math.min(w, h) * .075) : b; return { w, h, ow: w + 2 * bb, oh: h + 2 * bb, iy: 0, bb }; }
  }
}

/* ---------- Kanten: zerrissen, Büttenrand, Briefmarke ---------- */
export function edgePath(c, x, y, w, h, seed, amp, sides = 'all', inset = 0, kind = 'torn') {
  const r = seeded(seed), m = Math.min(w, h), step = kind === 'deckle' ? Math.max(2, m / 140) : Math.max(4, m / 55);
  const on = s => sides === 'all' || sides.includes(s); let v = 0;
  const pts = [];
  const edge = (x0, y0, x1, y1, nx, ny, torn) => { const len = Math.hypot(x1 - x0, y1 - y0), n = Math.max(1, Math.round(len / step));
    for (let i = 0; i < n; i++) { const t = i / n; let j = inset;
      if (torn) { v = clamp(v + (r() - .5) * .7, -1, 1); j += kind === 'deckle' ? amp * r() : amp * (.5 + .45 * v) + amp * .3 * r(); }
      const k = i ? 0 : j / len; // Ecke: auch entlang der Kante einrücken, sonst bleibt dort eine Spitze stehen
      pts.push([x0 + (x1 - x0) * (t + k) + nx * j, y0 + (y1 - y0) * (t + k) + ny * j]); } };
  edge(x, y, x + w, y, 0, 1, on('t')); edge(x + w, y, x + w, y + h, -1, 0, on('r')); edge(x + w, y + h, x, y + h, 0, -1, on('b')); edge(x, y + h, x, y, 1, 0, on('l'));
  c.beginPath(); pts.forEach(([px, py], i) => i ? c.lineTo(px, py) : c.moveTo(px, py)); c.closePath();
}
export function stampPath(c, x, y, w, h, r) {
  const nx = Math.max(3, Math.round(w / (r * 2.7))), ny = Math.max(3, Math.round(h / (r * 2.7))), sx = w / nx, sy = h / ny;
  c.beginPath(); c.moveTo(x, y);
  for (let i = 0; i < nx; i++) { const cx = x + sx * (i + .5); c.lineTo(cx - r, y); c.arc(cx, y, r, Math.PI, 0, true); }
  c.lineTo(x + w, y);
  for (let i = 0; i < ny; i++) { const cy = y + sy * (i + .5); c.lineTo(x + w, cy - r); c.arc(x + w, cy, r, -Math.PI / 2, Math.PI / 2, true); }
  c.lineTo(x + w, y + h);
  for (let i = nx - 1; i >= 0; i--) { const cx = x + sx * (i + .5); c.lineTo(cx + r, y + h); c.arc(cx, y + h, r, 0, Math.PI, true); }
  c.lineTo(x, y + h);
  for (let i = ny - 1; i >= 0; i--) { const cy = y + sy * (i + .5); c.lineTo(x, cy + r); c.arc(x, cy, r, Math.PI / 2, -Math.PI / 2, true); }
  c.closePath();
}
const edgeAmp = (l, w, h) => Math.min(w, h) * (l.edge === 'deckle' ? .014 : .04);
/* Clip-Pfad für den Bildbereich eines Fotos (Form oder gerissene Kante) */
function imageClip(c, l, bx) {
  const { w, h, iy } = bx, framed = FRAMES.has(l.shape);
  if (!framed && (l.edge === 'torn' || l.edge === 'deckle')) { const a = edgeAmp(l, w, h); edgePath(c, -w / 2, -h / 2 + iy, w, h, (l.slot ?? l.id) * 7 + 3, a, l.edgeSides || 'all', a * .55, l.edge); }
  else shapePath(c, framed ? 'rect' : l.shape, -w / 2, -h / 2 + iy, w, h, l.radius ?? 7);
}
/* Kantenglättung: Safari glättet Clip-Pfade nicht – gedrehte Fotos bekämen Treppenkanten. Rechteckige Fotos werden deshalb
   direkt gezeichnet (Bildkanten glättet jeder Browser), alle anderen Formen ungedreht mit weicher Maske in eine eigene Fläche
   gerendert und dann gedreht hineingezeichnet. Die Fläche wird pro Ebene zwischengespeichert. */
const maskCache = new Map(), imgIds = new WeakMap(); let imgN = 0;
const imgId = o => { let v = imgIds.get(o); if (!v) { v = ++imgN; imgIds.set(o, v); } return v; };
function drawMasked(c, l, bx, img, sx, sy, sw, sh, tag = 'i') {
  const { w, h, iy } = bx, framed = FRAMES.has(l.shape), soft = !framed && (l.edge === 'torn' || l.edge === 'deckle');
  if (framed || (!soft && (!l.shape || l.shape === 'rect'))) { c.drawImage(img, sx, sy, sw, sh, -w / 2, -h / 2 + iy, w, h); return; }
  const m = c.getTransform(); let q = Math.hypot(m.a, m.b) || 1; q = q > 1.5 ? Math.round(q * 4) / 4 : Math.max(.05, Math.round(q * 40) / 40);
  q = Math.min(q, 4096 / Math.max(w, h)); const W2 = Math.ceil(w * q) + 2, H2 = Math.ceil(h * q) + 2;
  // iOS: Canvas-Speicher ist knapp – sehr große Flächen (starkes Reinzoomen) lieber direkt mit Clip zeichnen
  if (W2 * H2 > 3.5e6) { c.save(); imageClip(c, l, bx); c.clip(); c.drawImage(img, sx, sy, sw, sh, -w / 2, -h / 2 + iy, w, h); c.restore(); return; }
  const key = [imgId(img), sx | 0, sy | 0, sw | 0, sh | 0, w.toFixed(1), h.toFixed(1), iy.toFixed(1), q, l.shape, l.radius, l.edge, l.edgeSides, l.slot ?? l.id].join('|'), ck = l.id + tag;
  let e = maskCache.get(ck);
  if (!e || e.key !== key) {
    const o = e && e.cv.width === W2 && e.cv.height === H2 ? e.cv : mk(W2, H2), x = o.getContext('2d');
    x.setTransform(1, 0, 0, 1, 0, 0); x.globalCompositeOperation = 'source-over'; x.clearRect(0, 0, W2, H2); x.imageSmoothingQuality = 'high';
    x.drawImage(img, sx, sy, sw, sh, 1, 1, w * q, h * q);
    x.globalCompositeOperation = 'destination-in'; x.setTransform(q, 0, 0, q, w * q / 2 + 1, h * q / 2 - iy * q + 1); imageClip(x, l, bx); x.fill();
    e = { key, cv: o }; maskCache.delete(ck); maskCache.set(ck, e);
    while (maskCache.size > 14) { const k0 = maskCache.keys().next().value, old = maskCache.get(k0); maskCache.delete(k0); if (old.cv !== o) { old.cv.width = old.cv.height = 0; } } // Speicher sofort freigeben (Safari)
  }
  c.drawImage(e.cv, -w / 2 - 1 / q, -h / 2 + iy - 1 / q, W2 / q, H2 / q);
}
function drawEdge(c, l, bx) {
  const { ow, oh, w, h, iy } = bx;
  c.save(); if (l.shadow) { c.shadowColor = 'rgba(0,0,0,.35)'; c.shadowBlur = ow * .04; c.shadowOffsetY = ow * .015; }
  c.fillStyle = l.borderColor || '#ffffff';
  if (l.edge === 'stamp') stampPath(c, -ow / 2, -oh / 2, ow, oh, bx.bb * .3);
  else edgePath(c, -w / 2, -h / 2 + iy, w, h, (l.slot ?? l.id) * 7 + 1, edgeAmp(l, w, h) * .6, l.edgeSides || 'all', 0, l.edge);
  c.fill(); c.restore();
}

/* ---------- Pfade ---------- */
export function roundPath(c, x, y, w, h, r) { r = Math.max(0, Math.min(r, w / 2, h / 2)); c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
export function shapePath(c, shape, x, y, w, h, rad = 7, extra = 0) {
  if (shape === 'circle') { c.beginPath(); c.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2); }
  else if (shape === 'round') roundPath(c, x, y, w, h, Math.min(w, h) * rad / 100 + extra);
  else if (shape === 'arch') { const r = Math.min(w / 2, h); c.beginPath(); c.moveTo(x, y + h); c.lineTo(x, y + r); c.arc(x + w / 2, y + r, w / 2, Math.PI, 0, false); c.lineTo(x + w, y + h); c.closePath(); }
  else if (shape === 'heart') {
    const P = (u, v) => [x + u * w, y + (v - .12) / .84 * h]; c.beginPath(); c.moveTo(...P(.5, .3));
    c.bezierCurveTo(...P(.5, .27), ...P(.45, .13), ...P(.25, .13)); c.bezierCurveTo(...P(0, .13), ...P(0, .43), ...P(0, .43));
    c.bezierCurveTo(...P(0, .6), ...P(.15, .78), ...P(.5, .96)); c.bezierCurveTo(...P(.85, .78), ...P(1, .6), ...P(1, .43));
    c.bezierCurveTo(...P(1, .43), ...P(1, .13), ...P(.75, .13)); c.bezierCurveTo(...P(.6, .13), ...P(.5, .27), ...P(.5, .3)); c.closePath();
  }
  else if (shape === 'star') { c.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? .42 : 1; c[i ? 'lineTo' : 'moveTo'](x + w / 2 + Math.cos(a) * w / 2 * rr, y + h / 2 + Math.sin(a) * h / 2 * rr); } c.closePath(); }
  else if (shape === 'sparkle') { const cx = x + w / 2, cy = y + h / 2; c.beginPath(); c.moveTo(cx, y); c.quadraticCurveTo(cx, cy, x + w, cy); c.quadraticCurveTo(cx, cy, cx, y + h); c.quadraticCurveTo(cx, cy, x, cy); c.quadraticCurveTo(cx, cy, cx, y); c.closePath(); }
  else if (shape === 'blob') { const cx = x + w / 2, cy = y + h / 2, pts = [1, .86, 1.04, .9, .98, .84, 1.02, .92]; c.beginPath();
    for (let i = 0; i <= 8; i++) { const a = i / 8 * Math.PI * 2, r = pts[i % 8], px = cx + Math.cos(a) * w / 2 * r, py = cy + Math.sin(a) * h / 2 * r; if (!i) c.moveTo(px, py); else { const a0 = (i - .5) / 8 * Math.PI * 2, rr = (pts[(i - 1) % 8] + r) / 2 * 1.06; c.quadraticCurveTo(cx + Math.cos(a0) * w / 2 * rr, cy + Math.sin(a0) * h / 2 * rr, px, py); } } c.closePath(); }
  else { c.beginPath(); c.rect(x, y, w, h); }
}

/* ---------- Hintergrund ---------- */
/* Papier wird physikalisch nachgebaut: wolkige Faserdichte (groß, nicht kachelnd), Fasern, Körnung und
   Oberflächenrelief mit Licht von oben links (kachelbar, volle Auflösung), Knitterpapier aus Knickfacetten. */
const TILE = 640;
const ph = (x, y, s) => { let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1442695041); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
function pnoise(x, y, s, P) { // kachelbares Wertrauschen, Periode P Gitterzellen
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), m = k => ((k % P) + P) % P;
  const a = ph(m(xi), m(yi), s), b = ph(m(xi + 1), m(yi), s), c = ph(m(xi), m(yi + 1), s), d = ph(m(xi + 1), m(yi + 1), s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const pfbm = (x, y, s, P, o) => { let t = 0, a = .5, n = 0, f = 1; for (let i = 0; i < o; i++) { t += a * pnoise(x * f, y * f, s + i * 31, P * f); n += a; a *= .5; f *= 2; } return t / n; };
const PAPER_KINDS = { paper: { mottle: .034, grain: .024, tooth: .04, toothP: 80, fib: 1300, fibL: [5, 22], fibA: .05 },
  kraft: { mottle: .055, grain: .03, tooth: .03, toothP: 70, fib: 2600, fibL: [6, 34], fibA: .1, brown: true, specks: 260 },
  cardboard: { mottle: .07, grain: .04, tooth: .04, toothP: 55, fib: 2000, fibL: [4, 26], fibA: .1, brown: true, specks: 900, chips: true },
  watercolor: { mottle: .035, grain: .015, tooth: .2, toothP: 22, fib: 500, fibL: [4, 16], fibA: .04 },
  newsprint: { mottle: .04, grain: .03, tooth: .02, toothP: 90, fib: 3200, fibL: [3, 14], fibA: .09, specks: 500 },
  recycled: { mottle: .05, grain: .03, tooth: .03, toothP: 70, fib: 1500, fibL: [4, 20], fibA: .07, specks: 700, color: true },
  linen: { mottle: .025, grain: .015, tooth: 0, fib: 300, fibL: [4, 12], fibA: .04, weave: true },
  crumpled: { mottle: .03, grain: .02, tooth: .025, toothP: 90, fib: 800, fibL: [5, 20], fibA: .05 },
  lines: { mottle: .022, grain: .018, tooth: .02, toothP: 90, fib: 500, fibL: [5, 18], fibA: .04 },
  grid: { mottle: .022, grain: .018, tooth: .02, toothP: 90, fib: 500, fibL: [5, 18], fibA: .04 } };
const tileCache = new Map();
function paperTile(kind) {
  if (tileCache.has(kind)) return tileCache.get(kind);
  const K = PAPER_KINDS[kind], N = TILE, c = mk(N, N), x = c.getContext('2d'), id = x.createImageData(N, N), d = id.data, sd = kind.length * 97 + 11, r = seeded(sd);
  const hgt = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let xx = 0; xx < N; xx++) {
    const u = xx / N, v = y / N; let hv = 0;
    if (K.weave) { // Leinen: Kett- und Schussfäden mit unregelmäßiger Dicke
      const tx = xx / 6.4, ty = y / 6.4, cx = Math.floor(tx), cy = Math.floor(ty), slubX = pnoise(cx * .37, v * 18, sd + 3, 64) - .5, slubY = pnoise(u * 18, cy * .37, sd + 5, 64) - .5;
      const wx = Math.sin((tx - cx) * Math.PI) * (1 + slubX * .8), wy = Math.sin((ty - cy) * Math.PI) * (1 + slubY * .8), over = (cx + cy) % 2 ? wx : wy;
      hv = over * .9 + Math.max(wx, wy) * .3;
    } else hv = K.tooth ? pfbm(u * K.toothP, v * K.toothP, sd + 7, K.toothP, 3) : 0;
    hgt[y * N + xx] = hv;
  }
  for (let y = 0; y < N; y++) for (let xx = 0; xx < N; xx++) {
    const i = y * N + xx, u = xx / N, v = y / N, l = hgt[y * N + (xx + N - 1) % N], t = hgt[((y + N - 1) % N) * N + xx];
    let val = 0;
    if (K.tooth || K.weave) val += ((hgt[i] - l) + (hgt[i] - t)) * (K.weave ? .12 : K.tooth * 4.5); // Relief, Licht oben links
    val += (pfbm(u * 10, v * 10, sd + 13, 10, 4) - .5) * K.mottle * 1.4; // feine Wolkigkeit
    val += (ph(xx, y, sd + 17) - .5) * K.grain * 2;
    const j = i * 4; d[j] = d[j + 1] = d[j + 2] = val > 0 ? 255 : 0; d[j + 3] = Math.min(255, Math.abs(val) * 255);
  }
  x.putImageData(id, 0, 0);
  // Fasern: kurze, leicht gebogene Linien, hell und dunkel, nahtlos über den Kachelrand
  const fibCol = () => K.color && r() < .25 ? [['70,110,190', '190,70,80', '90,150,90'][Math.floor(r() * 3)], .35] : K.brown ? (r() < .55 ? ['75,50,25', 1] : ['255,248,230', 1]) : (r() < .5 ? ['60,55,45', 1] : ['255,255,255', 1.3]);
  for (let k = 0; k < K.fib; k++) {
    const px = r() * N, py = r() * N, a = r() * Math.PI * 2, L = K.fibL[0] + r() * (K.fibL[1] - K.fibL[0]), bend = (r() - .5) * L * .5, [col, m] = fibCol();
    x.strokeStyle = `rgba(${col},${(K.fibA * (.4 + r() * .8) * m).toFixed(3)})`; x.lineWidth = .5 + r() * .9;
    for (const ox of [0, -N, N]) for (const oy of [0, -N, N]) { const sx = px + ox, sy = py + oy; if (sx < -40 || sx > N + 40 || sy < -40 || sy > N + 40) continue;
      x.beginPath(); x.moveTo(sx, sy); x.quadraticCurveTo(sx + Math.cos(a) * L / 2 - Math.sin(a) * bend, sy + Math.sin(a) * L / 2 + Math.cos(a) * bend, sx + Math.cos(a) * L, sy + Math.sin(a) * L); x.stroke(); }
  }
  // Einschlüsse / Flecken (Kraft, Pappe, Recycling, Zeitung)
  for (let k = 0; k < (K.specks || 0); k++) { const px = r() * N, py = r() * N, sz = .5 + r() * r() * (K.chips ? 3.5 : 2);
    x.fillStyle = K.color && r() < .3 ? `rgba(${['60,90,170', '170,60,70', '80,130,80'][Math.floor(r() * 3)]},.35)` : `rgba(${K.brown ? '50,32,15' : '40,40,40'},${(.12 + r() * .3).toFixed(2)})`;
    x.beginPath(); x.ellipse(px, py, sz, sz * (.5 + r() * .5), r() * 3, 0, Math.PI * 2); x.fill(); }
  tileCache.set(kind, c); return c;
}
/* große, nicht kachelnde Wolkigkeit + Knitterfacetten – niedrige Auflösung, weich hochskaliert */
const bigCache = new Map();
function paperLarge(kind, T, H) {
  const key = kind + T + 'x' + H; if (bigCache.has(key)) return bigCache.get(key);
  const crumple = kind === 'crumpled', f = crumple ? 3 : 12, w = Math.max(2, Math.round(T / f)), h = Math.max(2, Math.round(H / f)), c = mk(w, h), x = c.getContext('2d'), id = x.createImageData(w, h), d = id.data, sd = kind.length * 13 + 5;
  const K = PAPER_KINDS[kind] || PAPER_KINDS.paper;
  let hf = null;
  if (crumple) { // Worley-Höhenfeld: Mulden mit scharfen Graten an den Zellgrenzen = Knicke; zwei Größen + feine Falten
    const r = seeded(sd), layers = [[Math.max(30, Math.round(w * h / 3800)), 1], [Math.max(80, Math.round(w * h / 900)), .3]];
    hf = new Float32Array(w * h);
    for (const [n, amp] of layers) {
      const cs = Math.sqrt(w * h / n), gw = Math.ceil(w / cs) + 1, gh = Math.ceil(h / cs) + 1, grid = Array.from({ length: gw * gh }, () => []);
      for (let k = 0; k < n; k++) { const px = r() * w, py = r() * h; grid[Math.floor(py / cs) * gw + Math.floor(px / cs)].push([px, py, .6 + r() * .8]); }
      for (let y = 0; y < h; y++) for (let xx = 0; xx < w; xx++) { const gx = Math.floor(xx / cs), gy = Math.floor(y / cs); let b1 = 1e9, s1 = 1;
        for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) { const cx = gx + ox, cy = gy + oy; if (cx < 0 || cy < 0 || cx >= gw || cy >= gh) continue;
          for (const sp of grid[cy * gw + cx]) { const dd = (sp[0] - xx) ** 2 + (sp[1] - y) ** 2; if (dd < b1) { b1 = dd; s1 = sp[2]; } } }
        hf[y * w + xx] += Math.sqrt(b1) / cs * amp * s1; }
    }
    for (let i = 0; i < hf.length; i++) hf[i] += (pfbm((i % w) / w * 8, Math.floor(i / w) / h * 8 * h / w, sd + 9, 1e6, 3) - .5) * .25;
    for (let pass = 0; pass < 2; pass++) { const t = new Float32Array(hf.length); // leicht weichzeichnen: Grate bleiben, Treppen verschwinden
      for (let y = 0; y < h; y++) for (let xx = 0; xx < w; xx++) { let sum = 0, n = 0; for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) { const X = xx + ox, Y = y + oy; if (X >= 0 && Y >= 0 && X < w && Y < h) { sum += hf[Y * w + X]; n++; } } t[y * w + xx] = sum / n; }
      hf = t; }
  }
  const L = [-.55, -.65, .52];
  for (let y = 0; y < h; y++) for (let xx = 0; xx < w; xx++) {
    let val = (pfbm(xx / w * 3 * (T / H), y / h * 3, sd, 1e6, 4) - .5) * K.mottle * 2.2;
    if (crumple) { const i = y * w + xx, gx = (hf[i + (xx < w - 1 ? 1 : 0)] - hf[i - (xx > 0 ? 1 : 0)]) * 6, gy = (hf[i + (y < h - 1 ? w : 0)] - hf[i - (y > 0 ? w : 0)]) * 6, nn = Math.hypot(gx, gy, 1);
      val += ((-gx * L[0] - gy * L[1] + L[2]) / nn - L[2]) * .3; }
    const j = (y * w + xx) * 4; d[j] = d[j + 1] = d[j + 2] = val > 0 ? 255 : 0; d[j + 3] = Math.min(255, Math.abs(val) * 255);
  }
  x.putImageData(id, 0, 0);
  bigCache.set(key, c); if (bigCache.size > 6) bigCache.delete(bigCache.keys().next().value);
  return c;
}
function drawPaper(c, kind, T, H) {
  c.save(); c.imageSmoothingQuality = 'high'; c.drawImage(paperLarge(kind, T, H), 0, 0, T, H);
  c.fillStyle = c.createPattern(paperTile(kind), 'repeat'); c.fillRect(0, 0, T, H); c.restore();
}
const TEXTURES = new Set(Object.keys(PAPER_KINDS));
const lumHex = hex => { const n = parseInt(hex.slice(1), 16); return (.2126 * (n >> 16 & 255) + .7152 * (n >> 8 & 255) + .0722 * (n & 255)) / 255; };
export const BG_PATTERNS = [['none', 'Keins'], ['paper', 'Papier'], ['watercolor', 'Aquarellpapier'], ['crumpled', 'Knitterpapier'], ['kraft', 'Kraftpapier'], ['cardboard', 'Pappe'], ['recycled', 'Recycling'], ['newsprint', 'Zeitungspapier'], ['linen', 'Leinen'], ['lines', 'Liniert'], ['grid', 'Kariert'], ['dots', 'Punkte'], ['check', 'Karo-Muster'], ['grain', 'Körnung']];
function drawBg(c, T, H) {
  const bg = state.bg;
  if (bg.grad) { const g = bg.dir === 'v' ? c.createLinearGradient(0, 0, 0, H) : bg.dir === 'd' ? c.createLinearGradient(0, 0, T, H) : c.createLinearGradient(0, 0, T, 0); g.addColorStop(0, bg.c1); g.addColorStop(1, bg.c2); c.fillStyle = g; }
  else c.fillStyle = bg.c1;
  c.fillRect(0, 0, T, H);
  const pat = bg.pattern || 'none'; if (pat === 'none') return;
  const dark = lumHex(bg.c1) < .45, ink = dark ? 'rgba(255,255,255,.16)' : 'rgba(0,0,0,.11)';
  c.save();
  if (TEXTURES.has(pat)) drawPaper(c, pat, T, H);
  else if (pat === 'grain') { const r = seeded(3); c.fillStyle = ink; for (let i = 0; i < T * H / 900; i++) c.fillRect(r() * T, r() * H, 2, 2); }
  if (pat === 'grid') { c.strokeStyle = dark ? 'rgba(255,255,255,.14)' : 'rgba(70,110,170,.26)'; c.lineWidth = 1.6; c.beginPath(); for (let x = 46; x < T; x += 46) { c.moveTo(x, 0); c.lineTo(x, H); } for (let y = 46; y < H; y += 46) { c.moveTo(0, y); c.lineTo(T, y); } c.stroke(); }
  else if (pat === 'lines') { c.strokeStyle = dark ? 'rgba(255,255,255,.14)' : 'rgba(70,110,170,.3)'; c.lineWidth = 1.8; c.beginPath(); for (let y = 130; y < H; y += 56) { c.moveTo(0, y); c.lineTo(T, y); } c.stroke();
    c.strokeStyle = 'rgba(214,80,90,.42)'; c.lineWidth = 2; c.beginPath(); for (let i = 0; i < T / 1080; i++) { c.moveTo(i * 1080 + 120, 0); c.lineTo(i * 1080 + 120, H); } c.stroke(); }
  else if (pat === 'dots') { c.fillStyle = ink; for (let y = 30; y < H; y += 48) for (let x = 30; x < T; x += 48) { c.beginPath(); c.arc(x, y, 4, 0, Math.PI * 2); c.fill(); } }
  else if (pat === 'check') { c.fillStyle = dark ? 'rgba(255,255,255,.07)' : 'rgba(0,0,0,.06)'; for (let x = 0; x < T; x += 120) c.fillRect(x, 0, 60, H); for (let y = 0; y < H; y += 120) c.fillRect(0, y, T, 60); }
  c.restore();
}

/* ---------- Szene ---------- */
export function drawScene(c, opts = {}) {
  const { W, H } = dims(), T = W * state.slides;
  drawBg(c, T, H);
  // freigestelltes Motiv liegt über den Texten/Elementen darüber – bis zum nächsten Foto
  let pend = null;
  const flush = () => { if (pend) { drawCut(c, pend, opts); pend = null; } };
  for (const l of state.layers) {
    if (l.hidden) continue;
    if (l.type === 'image') flush();
    c.save(); c.translate(l.x, l.y); c.rotate(l.rot * Math.PI / 180); c.globalAlpha = l.opacity ?? 1;
    if (l.blend && l.blend !== 'source-over') c.globalCompositeOperation = l.blend;
    if (l.type === 'image') drawImageLayer(c, l, opts); else if (l.type === 'text') drawTextLayer(c, l); else drawShapeLayer(c, l);
    c.restore();
    if (l.type === 'image' && l.srcId && hasCut(l) && !l.sticker) pend = l;
  }
  flush();
}
export const hasCut = l => !!(l.cut && l.cut.on !== false && l.cut.strokes && l.cut.strokes.length);
const cutCache = new WeakMap();
/* Freistellung zum verarbeiteten Bild holen (gecacht; beim Malen gedrosselt) */
export function getCut(l, img) {
  const opt = { refine: !!l.cut.refine, feather: l.cut.feather || 0, shift: l.cut.shift || 0 }, key = JSON.stringify(l.cut.strokes) + JSON.stringify(opt) + '|' + cutHooks.ver; let e = cutCache.get(img);
  if (e && e.key === key) return e;
  if (e && flags.throttle && performance.now() - e.t < flags.throttle) { flags.pending = true; return e; }
  e = { key, t: performance.now(), ...cutout(img, l.cut.strokes, opt) }; cutCache.set(img, e); return e;
}
function drawCut(c, l, opts) {
  if (ui.showOrig && l.id === ui.sel && !opts.procs) return;
  const img = opts.procs ? opts.procs.get(cacheKey(l)) : ensureCache(l)?.proc; if (!img) return;
  const cut = getCut(l, img).img, bx = boxOf(l), { w, h, iy } = bx, clip = FRAMES.has(l.shape) ? 'rect' : l.shape;
  c.save(); c.translate(l.x, l.y); c.rotate(l.rot * Math.PI / 180); c.globalAlpha = l.opacity ?? 1;
  const [sx, sy, sw, sh] = cropRect(cut.width, cut.height, l); c.imageSmoothingQuality = 'high'; drawMasked(c, l, bx, cut, sx, sy, sw, sh, 'c');
  c.restore();
}
/* verknüpfte Fenster eines Fotos teilen sich die Berechnung */
export const cacheKey = l => l.grp ? 'g:' + l.grp : 'd:' + (l.dupOf || l.id); // Wiederholungen eines Fotos teilen sich die Berechnung
export function ensureCache(l) {
  const ck = cacheKey(l); let c = cache.get(ck); if (!c) { c = {}; cache.set(ck, c); }
  const src = sources.get(l.srcId); if (!src || !src.base) return null;
  const ok = l.srcId + '|' + l.rot90 + '|' + (l.flip ? 1 : 0);
  if (c.orientKey !== ok) { c.orient = orientCanvas(src.base, l.rot90, l.flip); c.orientKey = ok; c.prepKey = null; c.thumbAux = null; c.thumbs = {}; }
  const prk = JSON.stringify(l.params.persp) + JSON.stringify(l.params.heal);
  if (c.prepKey !== prk) { c.prep = prepare(c.orient, l.params); c.prepKey = prk; c.aux = null; c.procKey = null; c.draftAux = null; c.draftKey = null; }
  const pk = JSON.stringify(l.params) + '|' + l.stampMs + '|' + flags.fontsTick;
  // Beim Ziehen eines Reglers: schnelle Vorschau in kleiner Auflösung, volle Qualität beim Loslassen
  const selL = flags.draft && state.layers.find(x => x.id === ui.sel);
  if (selL && cacheKey(selL) === ck && c.procKey !== pk) {
    if (!c.draftAux) { const p = c.prep, s = Math.min(1, 560 / Math.max(p.width, p.height)); c.draftAux = makeAux(shrink(p, p.width * s, p.height * s)); }
    if (c.draftKey !== pk) { c.draftProc = processImage(c.draftAux, l.params, l.stampMs); c.draftKey = pk; }
    return { ...c, proc: c.draftProc };
  }
  if (c.procKey !== pk && flags.throttle && c.proc && performance.now() - (c.t || 0) < flags.throttle) flags.pending = true;
  else if (c.procKey !== pk) {
    if (!c.aux) c.aux = makeAux(c.prep);
    c.t = performance.now();
    c.proc = processImage(c.aux, l.params, l.stampMs); c.procKey = pk;
    if (l.id === ui.sel) flags.histDirty = true; else c.aux = null; // Speicher sparen: Hilfspuffer nur für das gewählte Foto behalten
  }
  return c;
}
export function releaseAux(l) { const c = l && cache.get(cacheKey(l)); if (c) c.aux = null; }

function drawImageLayer(c, l, opts) {
  const bx = boxOf(l);
  let img = null;
  const { ow, oh, bb, w, h, iy } = bx, framed = FRAMES.has(l.shape), clip = framed ? 'rect' : l.shape;
  if (!l.srcId) { if (!opts.procs && !opts.clean) drawPlaceholder(c, l, bx, clip, framed); return; }
  if (opts.procs) img = opts.procs.get(cacheKey(l));
  else { const ch = ensureCache(l); if (ch) img = ui.showOrig && l.id === ui.sel ? ch.orient : ch.proc; }
  if (l.sticker && img && hasCut(l)) { drawSticker(c, l, bx, img); return; }
  if (framed) drawFrame(c, l, bx);
  else if (l.edge) drawEdge(c, l, bx);
  else if (bb > 0 || l.shadow) {
    c.save();
    if (l.shadow) { c.shadowColor = 'rgba(0,0,0,.38)'; c.shadowBlur = ow * .06; c.shadowOffsetY = ow * .025; }
    const ins = bb > 0 ? 0 : Math.min(ow, oh) * .004; // ohne Rand: Schattenfläche minimal einrücken, sonst dunkler Saum an geglätteten Kanten
    shapePath(c, clip, -ow / 2 + ins, -oh / 2 + ins, ow - 2 * ins, oh - 2 * ins, l.radius ?? 7, bb);
    c.fillStyle = bb > 0 ? l.borderColor : '#000'; c.fill(); c.restore();
  }
  c.save();
  if (img) { const [sx, sy, sw, sh] = cropRect(img.width, img.height, l); c.imageSmoothingQuality = 'high'; drawMasked(c, l, bx, img, sx, sy, sw, sh); }
  else { imageClip(c, l, bx); c.fillStyle = 'rgba(128,128,128,.35)'; c.fill(); }
  c.restore();
  if (l.shape === 'dia') { c.save(); c.strokeStyle = 'rgba(0,0,0,.18)'; c.lineWidth = ow * .006; c.strokeRect(-w / 2, -h / 2 + iy, w, h); c.restore(); }
  if (l.keyline) { c.save(); c.strokeStyle = l.keyline; c.lineWidth = Math.max(2, Math.min(w, h) * .004); const o = (l.keylineGap || 0) * Math.min(w, h); c.strokeRect(-w / 2 - o, -h / 2 + iy - o, w + 2 * o, h + 2 * o); c.restore(); }
}
/* Sticker: nur das freigestellte Motiv mit weißem Rand und Schatten */
function drawSticker(c, l, bx, img) {
  const e = getCut(l, img), m = e.mask, { w, h, iy } = bx;
  const sb = l.stickerBorder ?? 1.6, ok = sb + '|' + (l.borderColor || '#ffffff');
  if (e.outKey !== ok) { const t = mk(m.width, m.height), tx = t.getContext('2d'); tx.drawImage(m, 0, 0); tx.globalCompositeOperation = 'source-in'; tx.fillStyle = l.borderColor || '#ffffff'; tx.fillRect(0, 0, t.width, t.height);
    const o = mk(m.width, m.height), ox = o.getContext('2d'), R = Math.max(m.width, m.height) * sb / 100; if (R > 0) for (let k = 0; k < 24; k++) { const a = k / 24 * Math.PI * 2; ox.drawImage(t, Math.cos(a) * R, Math.sin(a) * R); } ox.drawImage(t, 0, 0); e.outline = o; e.outKey = ok; }
  const [sx, sy, sw, sh] = cropRect(m.width, m.height, l);
  c.save(); if (l.stickerShadow !== false) { c.shadowColor = 'rgba(0,0,0,.4)'; c.shadowBlur = w * .03; c.shadowOffsetY = w * .012; } if (sb > 0 || l.stickerShadow !== false) c.drawImage(sb > 0 ? e.outline : e.img, ...(sb > 0 ? [sx, sy, sw, sh] : cropRect(e.img.width, e.img.height, l)), -w / 2, -h / 2 + iy, w, h); c.restore();
  const [ax, ay, aw, ah] = cropRect(e.img.width, e.img.height, l); c.imageSmoothingQuality = 'high'; c.drawImage(e.img, ax, ay, aw, ah, -w / 2, -h / 2 + iy, w, h);
}
/* leeres Vorlagen-Feld: antippen, um ein Foto einzusetzen */
function drawPlaceholder(c, l, bx, clip, framed) {
  const { w, h, iy, ow } = bx;
  if (framed) drawFrame(c, l, bx); else if (l.edge) drawEdge(c, l, bx);
  c.save(); imageClip(c, l, bx); c.fillStyle = framed ? 'rgba(150,150,150,.45)' : 'rgba(150,150,150,.32)'; c.fill();
  c.setLineDash([Math.max(8, w * .03), Math.max(6, w * .02)]); c.lineWidth = Math.max(3, Math.min(w, h) * .012); c.strokeStyle = 'rgba(255,255,255,.75)'; c.stroke(); c.setLineDash([]);
  const r = Math.max(18, Math.min(w, h, ow) * .11); c.fillStyle = 'rgba(255,255,255,.88)'; c.beginPath(); c.arc(0, iy, r, 0, Math.PI * 2); c.fill();
  c.strokeStyle = '#1d1d1d'; c.lineWidth = r * .16; c.lineCap = 'round'; c.beginPath(); c.moveTo(-r * .45, iy); c.lineTo(r * .45, iy); c.moveTo(0, iy - r * .45); c.lineTo(0, iy + r * .45); c.stroke();
  c.restore();
}
function drawFrame(c, l, bx) {
  const { ow, oh, w, h, iy } = bx, x0 = -ow / 2, y0 = -oh / 2;
  c.save();
  if (l.shadow) { c.shadowColor = 'rgba(0,0,0,.36)'; c.shadowBlur = ow * .05; c.shadowOffsetY = ow * .022; }
  c.fillStyle = l.borderColor;
  if (l.shape === 'film') {
    c.beginPath(); c.rect(x0, y0, ow, oh);
    const tb = bx.top, hh = tb * .38, hw = hh * .72, gap = hw * 1.25;
    for (const yy of [y0 + tb * .3, y0 + oh - tb * .3 - hh]) for (let x = x0 + gap * .6; x + hw < x0 + ow; x += hw + gap) { const r = hw * .22; c.moveTo(x + r, yy); c.arcTo(x + hw, yy, x + hw, yy + hh, r); c.arcTo(x + hw, yy + hh, x, yy + hh, r); c.arcTo(x, yy + hh, x, yy, r); c.arcTo(x, yy, x + hw, yy, r); c.closePath(); }
    c.fill('evenodd'); c.shadowColor = 'transparent';
    c.fillStyle = 'rgba(240,160,50,.85)'; c.font = `700 ${tb * .2}px "Space Mono", monospace`; c.textBaseline = 'middle'; c.textAlign = 'left';
    c.fillText(`▸ ${l.caption || 'STREIFZUG 400'}`, x0 + ow * .05, y0 + tb * .82); c.textAlign = 'right'; c.fillText(String((l.id % 36) + 1) + 'A', x0 + ow * .95, y0 + oh - tb * .82);
  } else if (l.shape === 'filmv') {
    c.beginPath(); c.rect(x0, y0, ow, oh);
    const sb = bx.bb, hw = sb * .38, hh = hw * .72, gap = hh * 1.3;
    for (const xx of [x0 + sb * .3, x0 + ow - sb * .3 - hw]) for (let y = y0 + gap * .6; y + hh < y0 + oh; y += hh + gap) { const rr = hh * .22; c.moveTo(xx + rr, y); c.arcTo(xx + hw, y, xx + hw, y + hh, rr); c.arcTo(xx + hw, y + hh, xx, y + hh, rr); c.arcTo(xx, y + hh, xx, y, rr); c.arcTo(xx, y, xx + hw, y, rr); c.closePath(); }
    c.fill('evenodd'); c.shadowColor = 'transparent';
    c.save(); c.rotate(-Math.PI / 2); c.fillStyle = 'rgba(240,160,50,.85)'; c.font = `700 ${sb * .2}px "Space Mono", monospace`; c.textBaseline = 'middle'; c.textAlign = 'center';
    c.fillText(`${l.caption || 'STREIFZUG 200'}   ▸ ${(l.id % 36) + 1}`, 0, x0 + sb * .82); c.restore();
  } else if (l.shape === 'dia') {
    roundPath(c, x0, y0, ow, oh, ow * .05); c.fill(); c.shadowColor = 'transparent';
    c.fillStyle = 'rgba(0,0,0,.05)'; roundPath(c, x0 + ow * .03, y0 + oh * .03, ow * .94, oh * .94, ow * .035); c.fill();
    if (l.caption) { c.fillStyle = 'rgba(40,40,60,.8)'; c.font = `600 ${ow * .055}px "Caveat", cursive`; c.textAlign = 'center'; c.textBaseline = 'middle'; const by = iy + h / 2; c.fillText(l.caption, 0, by + (oh / 2 - by) / 2); }
  } else {
    if (l.shape === 'instax') roundPath(c, x0, y0, ow, oh, ow * .025); else { c.beginPath(); c.rect(x0, y0, ow, oh); }
    c.fill(); c.shadowColor = 'transparent';
    if (l.caption) { const by = -h / 2 + iy + h, bot = bx.bot; c.fillStyle = lumOf(l.borderColor) < .45 ? 'rgba(255,255,255,.9)' : 'rgba(30,30,40,.85)'; c.font = `600 ${Math.min(bot * .5, ow * .085)}px "Caveat", cursive`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(l.caption, 0, by + bot / 2); }
  }
  c.restore();
}
const lumOf = hex => /^#[0-9a-f]{6}$/i.test(hex) ? lumHex(hex) : 1;

/* ---------- Text ---------- */
export const fontStr = l => { const f = FONTS.find(f => f[0] === l.font) || FONTS[0]; return `${f[2]} ${l.size}px "${l.font}", system-ui, sans-serif`; };
const mctx = mk(4, 4).getContext('2d');
/* Platzhalter im Text: {n} = Nummer der Slide, {N} = Anzahl Slides, {datum} = heute */
const textOf = l => { let t = l.text || ' ';
  if (t.includes('{')) { const { W } = dims(), n = Math.min(state.slides, Math.max(1, Math.floor(l.x / W) + 1)); t = t.replace(/\{n\}/g, n).replace(/\{N\}/g, state.slides).replace(/\{datum\}/gi, new Date().toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' })); }
  return l.upper ? t.toUpperCase() : t; };
const LETTER_BG = new Set(['beads', 'ransom']);
export function textMetrics(l) {
  if (LETTER_BG.has(l.bg)) { const lines = textOf(l).split('\n'), cell = l.size * (l.bg === 'beads' ? 1.02 : .92), lh = l.size * 1.25 * (l.lineH || 1.16) / 1.16;
    const widths = lines.map(t => [...t].reduce((a, ch) => a + (ch === ' ' ? cell * .45 : cell), 0)), pad = l.size * .2;
    return { lines, widths, lh, ls: 0, pad, st: 0, cell, w: Math.max(...widths) + pad * 2, h: lines.length * lh + pad * 2 }; }
  mctx.font = fontStr(l); const lines = textOf(l).split('\n'), lh = l.size * (l.lineH || 1.16), ls = (l.spacing || 0) / 100 * l.size;
  const widths = lines.map(t => mctx.measureText(t || ' ').width + ls * Math.max(0, [...t].length - 1)), tw = Math.max(...widths);
  const st = (l.stroke || 0) / 100 * l.size, pad = (l.bg !== 'none' ? l.size * .38 : l.size * .08) + st, pinX = l.bg === 'pin' ? l.size * .75 : 0;
  if (l.curve && l.bg === 'none') { // Bogentext: Rahmen an die Kurve anpassen
    const k = Math.min(1, Math.abs(l.curve) / 100), R = Math.max(tw, 1) / (k * Math.PI * 1.15), half = Math.max(tw, 1) / (2 * R), sag = R * (1 - Math.cos(half));
    return { lines, widths, lh, ls, pad, st, pinX, sag, w: 2 * R * Math.sin(Math.min(half, Math.PI / 2)) + lh + pad * 2, h: lines.length * lh + sag + pad * 2 }; }
  return { lines, widths, lh, ls, pad, st, pinX, w: tw + pad * 2 + pinX, h: lines.length * lh + pad * 2 };
}
const RANSOM_FONTS = [['Anton', 400], ['DM Serif Display', 400], ['Archivo Black', 400], ['Playfair Display', 600], ['Bebas Neue', 400], ['Space Mono', 700], ['Pacifico', 400], ['Permanent Marker', 400], ['Special Elite', 400]];
const RANSOM_BG = ['#ffffff', '#f3e6c8', '#1d1d1d', '#e9d2d2', '#d9e4f2', '#f2c14e', '#c9dfc9'];
function drawLetters(c, l, m) {
  const r = seeded(l.id * 13 + 5);
  m.lines.forEach((t, i) => {
    const lw = m.widths[i]; let x = l.align === 'left' ? -m.w / 2 + m.pad : l.align === 'right' ? m.w / 2 - m.pad - lw : -lw / 2; const y = -m.h / 2 + m.pad + m.lh * (i + .5);
    for (const ch of t) {
      if (ch === ' ') { x += m.cell * .45; continue; }
      const cx = x + m.cell / 2; c.save(); c.translate(cx, y);
      if (l.bg === 'beads') {
        const rr = l.size * .47; c.save(); c.shadowColor = 'rgba(0,0,0,.35)'; c.shadowBlur = rr * .3; c.shadowOffsetY = rr * .12;
        const g = c.createRadialGradient(-rr * .35, -rr * .4, rr * .1, 0, 0, rr); g.addColorStop(0, '#ffffff'); g.addColorStop(1, l.bgColor && l.bgColor !== '#111111' ? l.bgColor : '#e4e1da');
        c.fillStyle = g; c.beginPath(); c.arc(0, 0, rr, 0, Math.PI * 2); c.fill(); c.restore();
        c.fillStyle = l.color; c.font = `700 ${l.size * .6}px "${l.font}", system-ui, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(ch, 0, l.size * .03);
      } else {
        const [fn, wt] = RANSOM_FONTS[Math.floor(r() * RANSOM_FONTS.length)], bg = RANSOM_BG[Math.floor(r() * RANSOM_BG.length)], sz = l.size * (.78 + r() * .3);
        c.rotate((r() - .5) * .3); c.font = `${wt} ${sz}px "${fn}", serif`; const cw = Math.min(m.cell * .98, c.measureText(ch).width + sz * .28), chh = sz * 1.08;
        c.save(); c.shadowColor = 'rgba(0,0,0,.25)'; c.shadowBlur = sz * .08; c.shadowOffsetY = sz * .04; c.fillStyle = bg; c.fillRect(-cw / 2, -chh / 2, cw, chh); c.restore();
        c.fillStyle = lumHex(bg) < .45 ? '#ffffff' : (r() < .3 ? '#b8322a' : '#1d1d1d'); c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(ch, 0, sz * .04);
      }
      c.restore(); x += m.cell;
    }
  });
}
function drawTextLayer(c, l) {
  const m = textMetrics(l);
  if ((l.sx && l.sx !== 1) || (l.sy && l.sy !== 1)) c.scale(l.sx || 1, l.sy || 1); // gestaucht / gestreckt
  if (LETTER_BG.has(l.bg)) { drawLetters(c, l, m); return; }
  if (l.bg === 'pin') { // Orts-Pille mit Stecknadel
    c.save(); c.shadowColor = 'rgba(0,0,0,.18)'; c.shadowBlur = l.size * .3; c.shadowOffsetY = l.size * .06; c.fillStyle = l.bgColor && (l.bgSet || l.bgColor !== '#111111') ? l.bgColor : '#ffffff';
    roundPath(c, -m.w / 2, -m.h / 2, m.w, m.h, m.h / 2); c.fill(); c.restore();
    const px = -m.w / 2 + m.pad * .55 + l.size * .3, py = 0, pr = l.size * .28; c.fillStyle = l.pinColor || '#8a4bd8'; c.beginPath(); c.arc(px, py - pr * .25, pr, Math.PI * .85, Math.PI * 2.15); c.lineTo(px, py + pr * 1.15); c.closePath(); c.fill();
    c.fillStyle = /^#(f|e)[0-9a-f](f|e)/i.test(l.pinColor || '') ? '#1d1d1d' : '#ffffff'; c.beginPath(); c.arc(px, py - pr * .25, pr * .38, 0, Math.PI * 2); c.fill();
  }
  if (l.curve && l.bg === 'none') { drawCurvedText(c, l, m); return; }
  if (l.bg === 'solid' || l.bg === 'soft') { c.save(); c.globalAlpha *= l.bg === 'soft' ? .62 : 1; c.fillStyle = l.bgColor; roundPath(c, -m.w / 2, -m.h / 2, m.w, m.h, l.size * .28); c.fill(); c.restore(); }
  c.font = fontStr(l); c.textBaseline = 'middle'; c.textAlign = 'left';
  const lineX = i => { const lw = m.widths[i]; return (l.align === 'left' ? -m.w / 2 + m.pad : l.align === 'right' ? m.w / 2 - m.pad - lw : -lw / 2) + (m.pinX || 0) / 2; };
  const lineY = i => -m.h / 2 + m.pad + m.lh * (i + .5) + l.size * .04;
  if (l.bg === 'band') { c.save(); c.fillStyle = l.bgColor; m.lines.forEach((t, i) => { const px = l.size * .22; roundPath(c, lineX(i) - px, lineY(i) - m.lh / 2 - l.size * .02, m.widths[i] + 2 * px, m.lh, l.size * .14); c.fill(); }); c.restore(); }
  const put = (fn, t, x, y) => { if (!m.ls) { c[fn](t, x, y); return; } for (const ch of t) { c[fn](ch, x, y); x += c.measureText(ch).width + m.ls; } };
  if (m.st) { c.save(); c.lineJoin = 'round'; c.lineWidth = m.st * 2; c.strokeStyle = l.strokeColor || '#111'; m.lines.forEach((t, i) => put('strokeText', t, lineX(i), lineY(i))); c.restore(); }
  c.save(); c.fillStyle = l.color;
  if (l.glow) { c.shadowColor = l.color; c.shadowBlur = l.size * .5; }
  else if (l.shadow && l.bg === 'none' && !m.st) { c.shadowColor = 'rgba(0,0,0,.45)'; c.shadowBlur = l.size * .18; c.shadowOffsetY = l.size * .04; }
  m.lines.forEach((t, i) => put('fillText', t, lineX(i), lineY(i)));
  if (l.glow) { c.shadowBlur = l.size * .15; m.lines.forEach((t, i) => put('fillText', t, lineX(i), lineY(i))); }
  c.restore();
}

/* Text auf einem Bogen: positiv = nach oben gewölbt, negativ = nach unten */
function drawCurvedText(c, l, m) {
  c.font = fontStr(l); c.textBaseline = 'middle'; c.textAlign = 'center';
  const k = clamp(l.curve / 100, -1, 1), up = k > 0, maxW = Math.max(...m.widths, 1), R = maxW / (Math.abs(k) * Math.PI * 1.15), ls = m.ls || 0;
  const glyphs = [];
  m.lines.forEach((t, i) => {
    const y0 = -(m.h - (m.sag || 0)) / 2 + m.pad + m.lh * (i + .5) + (up ? -1 : 1) * (m.sag || 0) / 2, r = up ? R + (m.lines.length - 1 - i) * m.lh : R + i * m.lh, cy = up ? y0 + r : y0 - r;
    const chars = [...t], cw = chars.map(ch => c.measureText(ch).width + ls), tot = cw.reduce((a, b) => a + b, 0) - ls;
    let x = -tot / 2;
    chars.forEach((ch, j) => { const a = (x + cw[j] / 2 - ls / 2) / r; x += cw[j];
      glyphs.push(up ? [ch, Math.sin(a) * r, cy - Math.cos(a) * r, a] : [ch, Math.sin(-a) * -r, cy + Math.cos(a) * r, -a]); });
  });
  const pass = fn => glyphs.forEach(([ch, x, y, a]) => { c.save(); c.translate(x, y); c.rotate(a); c[fn](ch, 0, 0); c.restore(); });
  if (m.st) { c.save(); c.lineJoin = 'round'; c.lineWidth = m.st * 2; c.strokeStyle = l.strokeColor || '#111'; pass('strokeText'); c.restore(); }
  c.save(); c.fillStyle = l.color;
  if (l.glow) { c.shadowColor = l.color; c.shadowBlur = l.size * .5; } else if (l.shadow && !m.st) { c.shadowColor = 'rgba(0,0,0,.45)'; c.shadowBlur = l.size * .18; c.shadowOffsetY = l.size * .04; }
  pass('fillText'); c.restore();
}

/* ---------- Formen ---------- */
export const SHAPES = [['rect', 'Rechteck'], ['round', 'Abgerundet'], ['circle', 'Kreis'], ['frame', 'Rahmen'], ['line', 'Linie'], ['arrow', 'Pfeil'], ['star', 'Stern'], ['heart', 'Herz'], ['sparkle', 'Funkeln'], ['blob', 'Klecks'], ['tape', 'Klebeband'], ['arch', 'Bogen'],
  ['paper', 'Papierfetzen'], ['lace', 'Spitzenrand'], ['starSticker', 'Glitzerstern'], ['leaves', 'Herbstblätter'], ['check', 'Häkchen'], ['spiral', 'Spiralbindung'], ['clip', 'Büroklammer'], ['binder', 'Klammer'], ['laurel', 'Lorbeer'], ['scribble', 'Kritzel-Rahmen'], ['corners', 'Kritzel-Ecken'], ['scribbleArrow', 'Kritzel-Pfeil'], ...DOODLE_LIST];
/* handgezeichnete Linie mit leichtem Zittern */
function wobble(c, pts, seed, amp) {
  const r = seeded(seed); c.beginPath();
  pts.forEach(([x, y], i) => { const jx = (r() - .5) * amp, jy = (r() - .5) * amp; if (!i) c.moveTo(x + jx, y + jy); else { const [px, py] = pts[i - 1]; c.quadraticCurveTo((px + x) / 2 + (r() - .5) * amp * 2, (py + y) / 2 + (r() - .5) * amp * 2, x + jx, y + jy); } });
  c.stroke();
}
function drawDecoShape(c, l, x, y, w, h, sw) {
  const k = l.kind;
  if (k === 'lace') { // Papierspitze: Bögen mit Löchern an beiden Längsseiten
    const n = Math.max(3, Math.round(h / (w * .22))), st = h / n, rr = st / 2; c.beginPath(); c.moveTo(x + rr, y);
    for (let i = 0; i < n; i++) c.arc(x + rr * .9, y + st * (i + .5), rr, -Math.PI / 2, Math.PI / 2, true);
    c.lineTo(x + w - rr, y + h); for (let i = n - 1; i >= 0; i--) c.arc(x + w - rr * .9, y + st * (i + .5), rr, Math.PI / 2, -Math.PI / 2, true); c.closePath(); c.fill();
    c.save(); c.shadowColor = 'transparent'; c.globalCompositeOperation = 'destination-out'; for (let i = 0; i < n; i++) for (const xx of [x + rr * .9, x + w - rr * .9]) { c.beginPath(); c.arc(xx, y + st * (i + .5), rr * .28, 0, Math.PI * 2); c.fill(); } c.restore(); return true; }
  if (k === 'starSticker') { const g = c.createLinearGradient(x, y, x + w, y + h); g.addColorStop(0, '#f7f3ea'); g.addColorStop(.45, '#b8b2a4'); g.addColorStop(.55, '#fffdf6'); g.addColorStop(1, '#9d978a');
    shapePath(c, 'star', x, y, w, h); c.fillStyle = g; c.fill(); c.shadowColor = 'transparent'; c.lineWidth = Math.max(1, w * .04); c.strokeStyle = '#ffffff'; c.stroke(); return true; }
  if (k === 'check') { c.fillStyle = l.fill; c.beginPath(); c.arc(0, 0, Math.min(w, h) / 2, 0, Math.PI * 2); c.fill(); c.shadowColor = 'transparent'; c.strokeStyle = '#ffffff'; c.lineWidth = Math.min(w, h) * .12;
    c.beginPath(); c.moveTo(-w * .22, 0); c.lineTo(-w * .05, h * .18); c.lineTo(w * .24, -h * .17); c.stroke(); return true; }
  if (k === 'leaves') { const r = seeded(l.id * 3 + 17), cols = ['#d9822b', '#c4541f', '#e8b04a', '#9c3d1c', '#d6a33d'];
    for (let i = 0; i < 14; i++) { const px = x + r() * w, py = y + r() * h, s = Math.min(w, h) * (.035 + r() * .04); c.save(); c.translate(px, py); c.rotate(r() * Math.PI * 2); c.fillStyle = cols[i % 5];
      c.beginPath(); c.moveTo(0, -s); c.quadraticCurveTo(s * .9, -s * .2, 0, s); c.quadraticCurveTo(-s * .9, -s * .2, 0, -s); c.fill(); c.restore(); } return true; }
  if (k === 'paper') { edgePath(c, x, y, w, h, l.id * 5 + 2, Math.min(w, h) * .05, 'all', 0, 'torn'); c.fill(); return true; }
  if (k === 'spiral') {
    const n = Math.max(3, Math.round(w / (h * .5))), step = w / n;
    for (let i = 0; i < n; i++) { const cx = x + step * (i + .5);
      c.save(); c.shadowColor = 'transparent'; c.fillStyle = '#2a2a2a'; c.beginPath(); c.ellipse(cx, y + h * .8, step * .13, h * .1, 0, 0, Math.PI * 2); c.fill(); c.restore();
      c.lineWidth = Math.max(2, h * .1); c.strokeStyle = '#3c3f44'; c.beginPath(); c.ellipse(cx - step * .05, y + h * .46, step * .2, h * .4, .12, Math.PI * .55, Math.PI * 2.2); c.stroke();
      c.lineWidth = Math.max(1, h * .04); c.strokeStyle = '#d9dde2'; c.beginPath(); c.ellipse(cx - step * .05, y + h * .44, step * .18, h * .38, .12, Math.PI * 1.1, Math.PI * 1.9); c.stroke(); }
    return true; }
  if (k === 'clip') { drawClipReal(c, l, x, y, w, h); return true; }
  if (k === 'binder') { drawBinderReal(c, l, x, y, w, h); return true; }
  if (isDoodle(k)) return drawDoodle(c, l, x, y, w, h, sw);
  if (k === 'laurel') { const R = Math.min(w, h * 1.1) * .46;
    for (const sgn of [-1, 1]) { c.save(); c.scale(sgn, 1); c.lineWidth = Math.max(1.5, R * .03); c.beginPath(); c.arc(0, 0, R, Math.PI * .62, Math.PI * 1.35); c.stroke();
      for (let i = 0; i < 9; i++) { const a = Math.PI * (.66 + i * .075), px = Math.cos(a) * R, py = Math.sin(a) * R;
        for (const o of [-1, 1]) { c.save(); c.translate(px, py); c.rotate(a + Math.PI / 2 + o * .55); c.beginPath(); c.ellipse(0, -R * .1 * o, R * .045, R * .12, 0, 0, Math.PI * 2); c.fill(); c.restore(); } }
      c.restore(); }
    return true; }
  if (k === 'scribble') { c.lineWidth = sw; const o = sw * 2; wobble(c, [[x - o, y], [x + w + o * .5, y + o * .3], [x + w, y - o], [x + w - o * .3, y + h + o], [x + w + o, y + h], [x - o * .5, y + h - o * .3], [x, y + h + o], [x + o * .3, y - o]], l.id * 3 + 1, sw * 1.5);
    c.lineWidth = sw * .6; wobble(c, [[x + o, y + o * .6], [x + w - o * .4, y - o * .2], [x + w + o * .2, y + h - o], [x + o * .3, y + h + o * .2], [x - o * .2, y + o * 1.5]], l.id * 3 + 2, sw * 2); return true; }
  if (k === 'corners') { c.lineWidth = sw; const L = Math.min(w, h) * .22;
    wobble(c, [[x, y + L], [x - sw, y - sw * .5], [x + L, y]], l.id * 2 + 7, sw); wobble(c, [[x + w - L, y + h], [x + w + sw, y + h + sw * .5], [x + w, y + h - L]], l.id * 2 + 8, sw); return true; }
  if (k === 'scribbleArrow') { c.lineWidth = sw; wobble(c, [[x, y + h * .2], [x + w * .25, y + h * .85], [x + w * .55, y + h * .95], [x + w * .78, y + h * .55], [x + w * .95, y + h * .25]], l.id + 11, sw * .8);
    wobble(c, [[x + w * .72, y + h * .22], [x + w * .96, y + h * .22], [x + w * .93, y + h * .5]], l.id + 12, sw * .5); return true; }
  return false;
}
function drawShapeLayer(c, l) {
  const w = l.w, h = l.h, x = -w / 2, y = -h / 2;
  if (l.shadow) { c.shadowColor = 'rgba(0,0,0,.35)'; c.shadowBlur = Math.max(w, h) * .05; c.shadowOffsetY = Math.max(w, h) * .02; }
  c.fillStyle = l.fill; c.strokeStyle = l.fill; c.lineJoin = 'round'; c.lineCap = 'round';
  const sw = Math.max(2, l.sw || 8);
  if (l.kind === 'line') { c.lineWidth = Math.max(2, h); c.beginPath(); c.moveTo(x + h / 2, 0); c.lineTo(x + w - h / 2, 0); c.stroke(); return; }
  if (l.kind === 'arrow') { const t = Math.max(3, h * .16), hl = Math.min(w * .4, h * .9); c.beginPath(); c.moveTo(x, -t / 2); c.lineTo(x + w - hl, -t / 2); c.lineTo(x + w - hl, -h / 2); c.lineTo(x + w, 0); c.lineTo(x + w - hl, h / 2); c.lineTo(x + w - hl, t / 2); c.lineTo(x, t / 2); c.closePath(); c.fill(); return; }
  if (l.kind === 'tape') { drawTapeReal(c, l, x, y, w, h); return; }
  if (drawDecoShape(c, l, x, y, w, h, sw)) return;
  if (l.kind === 'frame') { c.lineWidth = sw; c.strokeRect(x + sw / 2, y + sw / 2, w - sw, h - sw); return; }
  shapePath(c, l.kind, x, y, w, h, l.radius ?? 18);
  if (l.outline) { c.lineWidth = sw; c.save(); c.clip(); c.lineWidth = sw * 2; c.stroke(); c.restore(); } else c.fill();
}

/* ---------- Beispielmotiv: Leuchtturm am Deich ---------- */
export function drawSample(w) {
  const h = Math.round(w / 2.4), c = mk(w, h);
  const x = c.getContext('2d'), rnd = seeded(7), hz = h * .6;
  let g = x.createLinearGradient(0, 0, 0, hz);
  g.addColorStop(0, '#26355f'); g.addColorStop(.45, '#7a5b86'); g.addColorStop(.78, '#ef8a5c'); g.addColorStop(1, '#f9cf8a');
  x.fillStyle = g; x.fillRect(0, 0, w, hz);
  const sx = w * .64, sy = hz - h * .045;
  g = x.createRadialGradient(sx, sy, 0, sx, sy, h * .35); g.addColorStop(0, 'rgba(255,236,190,.95)'); g.addColorStop(.12, 'rgba(255,205,140,.6)'); g.addColorStop(1, 'rgba(255,160,100,0)');
  x.fillStyle = g; x.fillRect(0, 0, w, hz);
  x.fillStyle = '#fff3d6'; x.beginPath(); x.arc(sx, sy, h * .055, 0, Math.PI * 2); x.fill();
  for (let i = 0; i < 14; i++) { const cx = rnd() * w, cy = h * (.08 + rnd() * .32), rw = w * (.05 + rnd() * .1), rh = h * (.015 + rnd() * .03);
    x.fillStyle = `rgba(${240 - rnd() * 40},${150 + rnd() * 50},${150 + rnd() * 40},${.25 + rnd() * .3})`; x.beginPath(); x.ellipse(cx, cy, rw, rh, 0, 0, Math.PI * 2); x.fill(); }
  g = x.createLinearGradient(0, hz, 0, h * .82); g.addColorStop(0, '#d98a6c'); g.addColorStop(.25, '#5f5f7e'); g.addColorStop(1, '#22344a');
  x.fillStyle = g; x.fillRect(0, hz, w, h * .25);
  for (let i = 0; i < 160; i++) { const yy = hz + Math.pow(rnd(), 1.6) * h * .2, spread = (yy - hz) / (h * .2), lw = w * (.01 + rnd() * .05) * (1 - spread * .5);
    x.fillStyle = `rgba(255,${200 + rnd() * 40},${150 + rnd() * 50},${.5 * (1 - spread)})`; x.fillRect(sx + (rnd() - .5) * w * (.05 + spread * .25) - lw / 2, yy, lw, Math.max(1, h * .003)); }
  x.fillStyle = '#2e3a26'; x.beginPath(); x.moveTo(0, h);
  for (let i = 0; i <= 40; i++) { const t = i / 40, yy = h * (.79 - .05 * Math.sin(t * Math.PI * 1.2 + .4) - .015 * Math.sin(t * 17)); x.lineTo(t * w, yy); }
  x.lineTo(w, h); x.closePath(); x.fill();
  g = x.createLinearGradient(0, h * .74, 0, h); g.addColorStop(0, 'rgba(120,140,70,.55)'); g.addColorStop(1, 'rgba(20,30,15,0)'); x.fillStyle = g; x.fill();
  const lx = w * .27, base = h * .755, th = h * .36, bw = h * .075, tw = h * .05, top = base - th, bands = 6;
  for (let i = 0; i < bands; i++) { const y0 = base - th * i / bands, y1 = base - th * (i + 1) / bands, w0 = bw - (bw - tw) * i / bands, w1 = bw - (bw - tw) * (i + 1) / bands;
    x.fillStyle = i % 2 ? '#f0c43c' : '#c8352b'; x.beginPath(); x.moveTo(lx - w0 / 2, y0); x.lineTo(lx + w0 / 2, y0); x.lineTo(lx + w1 / 2, y1); x.lineTo(lx - w1 / 2, y1); x.closePath(); x.fill(); }
  x.fillStyle = 'rgba(0,0,0,.25)'; x.fillRect(lx + tw * .1, top, bw * .25, th);
  x.fillStyle = '#1f2a2a'; x.fillRect(lx - tw * .75, top - h * .012, tw * 1.5, h * .012);
  x.fillStyle = '#ffe9a8'; x.fillRect(lx - tw * .45, top - h * .05, tw * .9, h * .038);
  g = x.createRadialGradient(lx, top - h * .03, 0, lx, top - h * .03, h * .09); g.addColorStop(0, 'rgba(255,240,180,.7)'); g.addColorStop(1, 'rgba(255,240,180,0)'); x.fillStyle = g; x.fillRect(lx - h * .1, top - h * .13, h * .2, h * .2);
  x.fillStyle = '#c8352b'; x.beginPath(); x.moveTo(lx - tw * .6, top - h * .05); x.lineTo(lx, top - h * .085); x.lineTo(lx + tw * .6, top - h * .05); x.closePath(); x.fill();
  for (let i = 0; i < 9; i++) { const px = w * (.42 + rnd() * .5), py = h * (.8 + rnd() * .1), s = h * (.012 + rnd() * .008);
    x.fillStyle = '#e9e4da'; x.beginPath(); x.ellipse(px, py, s * 1.6, s, 0, 0, Math.PI * 2); x.fill(); x.fillStyle = '#2a2622'; x.beginPath(); x.ellipse(px + s * 1.6, py - s * .3, s * .5, s * .45, 0, 0, Math.PI * 2); x.fill(); }
  return c;
}
export { stampText };
