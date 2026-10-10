/* Ebenen, Quellen, Zeichnen der Szene */
import { clamp, seeded, state, ui, sources, cache, dims, FONTS, stampText } from './core.js';
import { mk, makeAux, processImage, prepare, cutout } from './process.js';

export const flags = { fontsTick: 0, histDirty: false, throttle: 0, pending: false };

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
export const FRAMES = new Set(['polaroid', 'instax', 'film', 'dia']);
export function boxOf(l) {
  if (l.type === 'text') { const m = textMetrics(l); return { w: m.w, h: m.h, ow: m.w, oh: m.h, iy: 0, bb: 0 }; }
  if (l.type === 'shape') { const hh = l.kind === 'line' ? Math.max(l.h, 30) : l.h; return { w: l.w, h: hh, ow: l.w, oh: hh, iy: 0, bb: 0 }; }
  const w = l.w, h = w / cropAspect(l), b = l.border || 0;
  switch (l.shape) {
    case 'polaroid': { const bb = Math.max(b, w * .05), bot = bb * 3.4; return { w, h, ow: w + 2 * bb, oh: h + bb + bot, iy: -(bot - bb) / 2, bb, top: bb, bot }; }
    case 'instax': { const bb = Math.max(b, w * .075), top = bb * 1.3, bot = bb * 3.6; return { w, h, ow: w + 2 * bb, oh: h + top + bot, iy: (top - bot) / 2, bb, top, bot }; }
    case 'film': { const bb = Math.max(b, w * .025), tb = Math.max(b, h * .2); return { w, h, ow: w + 2 * bb, oh: h + 2 * tb, iy: 0, bb, top: tb, bot: tb }; }
    case 'dia': { const S = Math.max(w, h) * 1.42; return { w, h, ow: S, oh: S, iy: -S * .02, bb: (S - w) / 2, top: (S - h) / 2, bot: (S - h) / 2 }; }
    default: return { w, h, ow: w + 2 * b, oh: h + 2 * b, iy: 0, bb: b };
  }
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
let paperTex = null;
function paper() {
  if (paperTex) return paperTex;
  const c = mk(320, 320), x = c.getContext('2d'), r = seeded(5);
  for (let i = 0; i < 2600; i++) { x.fillStyle = r() < .5 ? `rgba(0,0,0,${r() * .07})` : `rgba(255,255,255,${r() * .12})`; x.fillRect(r() * 320, r() * 320, 1 + r() * 2, 1 + r() * 2); }
  x.lineWidth = .6; for (let i = 0; i < 70; i++) { const px = r() * 320, py = r() * 320, a = r() * Math.PI; x.strokeStyle = `rgba(90,70,40,${.05 + r() * .07})`; x.beginPath(); x.moveTo(px, py); x.quadraticCurveTo(px + Math.cos(a) * 8, py + Math.sin(a) * 8 + 3, px + Math.cos(a) * 18, py + Math.sin(a) * 18); x.stroke(); }
  return paperTex = c;
}
const lumHex = hex => { const n = parseInt(hex.slice(1), 16); return (.2126 * (n >> 16 & 255) + .7152 * (n >> 8 & 255) + .0722 * (n & 255)) / 255; };
export const BG_PATTERNS = [['none', 'Keins'], ['paper', 'Papier'], ['grid', 'Raster'], ['dots', 'Punkte'], ['lines', 'Linien'], ['check', 'Karo'], ['grain', 'Körnung']];
function drawBg(c, T, H) {
  const bg = state.bg;
  if (bg.grad) { const g = bg.dir === 'v' ? c.createLinearGradient(0, 0, 0, H) : bg.dir === 'd' ? c.createLinearGradient(0, 0, T, H) : c.createLinearGradient(0, 0, T, 0); g.addColorStop(0, bg.c1); g.addColorStop(1, bg.c2); c.fillStyle = g; }
  else c.fillStyle = bg.c1;
  c.fillRect(0, 0, T, H);
  const pat = bg.pattern || 'none'; if (pat === 'none') return;
  const dark = lumHex(bg.c1) < .45, ink = dark ? 'rgba(255,255,255,.16)' : 'rgba(0,0,0,.11)';
  c.save();
  if (pat === 'paper') { c.fillStyle = c.createPattern(paper(), 'repeat'); c.fillRect(0, 0, T, H); }
  else if (pat === 'grain') { const r = seeded(3); c.fillStyle = ink; for (let i = 0; i < T * H / 900; i++) c.fillRect(r() * T, r() * H, 2, 2); }
  else if (pat === 'grid') { c.strokeStyle = ink; c.lineWidth = 2; c.beginPath(); for (let x = 54; x < T; x += 54) { c.moveTo(x, 0); c.lineTo(x, H); } for (let y = 54; y < H; y += 54) { c.moveTo(0, y); c.lineTo(T, y); } c.stroke(); }
  else if (pat === 'lines') { c.strokeStyle = ink; c.lineWidth = 2; c.beginPath(); for (let y = 90; y < H; y += 60) { c.moveTo(0, y); c.lineTo(T, y); } c.stroke(); }
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
    if (l.type === 'image' && l.srcId && hasCut(l)) pend = l;
  }
  flush();
}
export const hasCut = l => !!(l.cut && l.cut.on !== false && l.cut.strokes && l.cut.strokes.length);
const cutCache = new WeakMap();
/* Freistellung zum verarbeiteten Bild holen (gecacht; beim Malen gedrosselt) */
export function getCut(l, img) {
  const key = JSON.stringify(l.cut.strokes); let e = cutCache.get(img);
  if (e && e.key === key) return e;
  if (e && flags.throttle && performance.now() - e.t < flags.throttle) { flags.pending = true; return e; }
  e = { key, t: performance.now(), ...cutout(img, l.cut.strokes) }; cutCache.set(img, e); return e;
}
function drawCut(c, l, opts) {
  if (ui.showOrig && l.id === ui.sel && !opts.procs) return;
  const img = opts.procs ? opts.procs.get(cacheKey(l)) : ensureCache(l)?.proc; if (!img) return;
  const cut = getCut(l, img).img, bx = boxOf(l), { w, h, iy } = bx, clip = FRAMES.has(l.shape) ? 'rect' : l.shape;
  c.save(); c.translate(l.x, l.y); c.rotate(l.rot * Math.PI / 180); c.globalAlpha = l.opacity ?? 1;
  shapePath(c, clip, -w / 2, -h / 2 + iy, w, h, l.radius ?? 7); c.clip();
  const [sx, sy, sw, sh] = cropRect(cut.width, cut.height, l); c.imageSmoothingQuality = 'high'; c.drawImage(cut, sx, sy, sw, sh, -w / 2, -h / 2 + iy, w, h);
  c.restore();
}
/* verknüpfte Fenster eines Fotos teilen sich die Berechnung */
export const cacheKey = l => l.grp ? 'g:' + l.grp : l.id;
export function ensureCache(l) {
  const ck = cacheKey(l); let c = cache.get(ck); if (!c) { c = {}; cache.set(ck, c); }
  const src = sources.get(l.srcId); if (!src || !src.base) return null;
  const ok = l.srcId + '|' + l.rot90 + '|' + (l.flip ? 1 : 0);
  if (c.orientKey !== ok) { c.orient = orientCanvas(src.base, l.rot90, l.flip); c.orientKey = ok; c.prepKey = null; c.thumbAux = null; c.thumbs = {}; }
  const prk = JSON.stringify(l.params.persp) + JSON.stringify(l.params.heal);
  if (c.prepKey !== prk) { c.prep = prepare(c.orient, l.params); c.prepKey = prk; c.aux = null; c.procKey = null; }
  const pk = JSON.stringify(l.params) + '|' + l.stampMs + '|' + flags.fontsTick;
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
  if (framed) drawFrame(c, l, bx);
  else if (bb > 0 || l.shadow) {
    c.save();
    if (l.shadow) { c.shadowColor = 'rgba(0,0,0,.38)'; c.shadowBlur = ow * .06; c.shadowOffsetY = ow * .025; }
    shapePath(c, clip, -ow / 2, -oh / 2, ow, oh, l.radius ?? 7, bb);
    c.fillStyle = bb > 0 ? l.borderColor : '#000'; c.fill(); c.restore();
  }
  c.save();
  shapePath(c, clip, -w / 2, -h / 2 + iy, w, h, l.radius ?? 7); c.clip();
  if (img) { const [sx, sy, sw, sh] = cropRect(img.width, img.height, l); c.imageSmoothingQuality = 'high'; c.drawImage(img, sx, sy, sw, sh, -w / 2, -h / 2 + iy, w, h); }
  else { c.fillStyle = 'rgba(128,128,128,.35)'; c.fillRect(-w / 2, -h / 2 + iy, w, h); }
  c.restore();
  if (l.shape === 'dia') { c.save(); c.strokeStyle = 'rgba(0,0,0,.18)'; c.lineWidth = ow * .006; c.strokeRect(-w / 2, -h / 2 + iy, w, h); c.restore(); }
}
/* leeres Vorlagen-Feld: antippen, um ein Foto einzusetzen */
function drawPlaceholder(c, l, bx, clip, framed) {
  const { w, h, iy, ow } = bx;
  if (framed) drawFrame(c, l, bx);
  c.save(); shapePath(c, clip, -w / 2, -h / 2 + iy, w, h, l.radius ?? 7); c.fillStyle = framed ? 'rgba(150,150,150,.45)' : 'rgba(150,150,150,.32)'; c.fill();
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
const textOf = l => { const t = l.text || ' '; return l.upper ? t.toUpperCase() : t; };
export function textMetrics(l) {
  mctx.font = fontStr(l); const lines = textOf(l).split('\n'), lh = l.size * (l.lineH || 1.16), ls = (l.spacing || 0) / 100 * l.size;
  const widths = lines.map(t => mctx.measureText(t || ' ').width + ls * Math.max(0, [...t].length - 1)), tw = Math.max(...widths);
  const st = (l.stroke || 0) / 100 * l.size, pad = (l.bg !== 'none' ? l.size * .38 : l.size * .08) + st;
  return { lines, widths, lh, ls, pad, st, w: tw + pad * 2, h: lines.length * lh + pad * 2 };
}
function drawTextLayer(c, l) {
  const m = textMetrics(l);
  if (l.bg === 'solid' || l.bg === 'soft') { c.save(); c.globalAlpha *= l.bg === 'soft' ? .62 : 1; c.fillStyle = l.bgColor; roundPath(c, -m.w / 2, -m.h / 2, m.w, m.h, l.size * .28); c.fill(); c.restore(); }
  c.font = fontStr(l); c.textBaseline = 'middle'; c.textAlign = 'left';
  const lineX = i => { const lw = m.widths[i]; return l.align === 'left' ? -m.w / 2 + m.pad : l.align === 'right' ? m.w / 2 - m.pad - lw : -lw / 2; };
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

/* ---------- Formen ---------- */
export const SHAPES = [['rect', 'Rechteck'], ['round', 'Abgerundet'], ['circle', 'Kreis'], ['frame', 'Rahmen'], ['line', 'Linie'], ['arrow', 'Pfeil'], ['star', 'Stern'], ['heart', 'Herz'], ['sparkle', 'Funkeln'], ['blob', 'Klecks'], ['tape', 'Klebeband'], ['arch', 'Bogen']];
function drawShapeLayer(c, l) {
  const w = l.w, h = l.h, x = -w / 2, y = -h / 2;
  if (l.shadow) { c.shadowColor = 'rgba(0,0,0,.35)'; c.shadowBlur = Math.max(w, h) * .05; c.shadowOffsetY = Math.max(w, h) * .02; }
  c.fillStyle = l.fill; c.strokeStyle = l.fill; c.lineJoin = 'round'; c.lineCap = 'round';
  const sw = Math.max(2, l.sw || 8);
  if (l.kind === 'line') { c.lineWidth = Math.max(2, h); c.beginPath(); c.moveTo(x + h / 2, 0); c.lineTo(x + w - h / 2, 0); c.stroke(); return; }
  if (l.kind === 'arrow') { const t = Math.max(3, h * .16), hl = Math.min(w * .4, h * .9); c.beginPath(); c.moveTo(x, -t / 2); c.lineTo(x + w - hl, -t / 2); c.lineTo(x + w - hl, -h / 2); c.lineTo(x + w, 0); c.lineTo(x + w - hl, h / 2); c.lineTo(x + w - hl, t / 2); c.lineTo(x, t / 2); c.closePath(); c.fill(); return; }
  if (l.kind === 'tape') { c.globalAlpha *= .8; const r = seeded(l.id * 7 + 1), z = h * .12; c.beginPath(); c.moveTo(x, y);
    for (let i = 1; i <= 6; i++) c.lineTo(x + w + (i % 2 ? -z : 0) * r(), y + h * i / 6); for (let i = 5; i >= 0; i--) c.lineTo(x + (i % 2 ? z : 0) * r(), y + h * i / 6); c.closePath(); c.fill();
    c.globalAlpha *= .25; c.fillStyle = '#fff'; c.fillRect(x + w * .05, y + h * .15, w * .9, h * .12); return; }
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
