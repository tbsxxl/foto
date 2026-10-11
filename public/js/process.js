/* Bildverarbeitung: alles läuft auf der CPU bzw. mit Canvas-Resampling, damit es auch in Safari auf dem iPhone geht */
import { clamp, smooth, seeded, LOOKS, HSL_BANDS, ID_CURVE, STAMP_COLORS, stampText } from './core.js';

export const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };

export function eff(p) {
  const L = LOOKS[p.look] || LOOKS.none;
  const a = p.look === 'none' ? 0 : p.lookAmt / 100;
  const q = k => (L[k] || 0) * a, u = k => (p[k] || 0) / 100, amb = u('ambiance'), both = k => u(k) + q(k), pos = k => Math.max(0, both(k));
  return {
    ex: (p.exposure || 0) + q('exposure'), br: both('brightness'), co: both('contrast'),
    hl: both('highlights') - amb * .3, sh: both('shadows') + amb * .5, wh: both('whites'), bl: both('blacks'),
    temp: both('temp'), tint: both('tint'), vib: both('vibrance') + amb * .3, sat: both('saturation'),
    st: both('structure'), cl: both('clarity'), tx: both('texture'), dh: both('dehaze'), shp: pos('sharpen'), dn: pos('denoise'),
    vig: both('vignette'), vigSize: (p.vigSize ?? 50) / 100, gr: pos('grain'), grSize: (p.grainSize ?? 25) / 100, fade: pos('fade'),
    glow: pos('glow'), hal: pos('halation'), ca: pos('ca'), leak: pos('leak'), leakKind: p.leak ? p.leakKind : (L.leakKind || 0),
    dust: pos('dust'), lowres: pos('lowres'),
    tonH: u('tonHi'), tonM: u('tonMid'), tonL: u('tonLo'), dr: u('drama'), grunge: pos('grunge'), glitch: pos('glitch'),
    skin: p.skin && p.skin.d && (p.skin.amt || p.skin.glow) ? p.skin : null,
    mono: L.mono ? a : 0, monoTone: L.monoTone || null, monoMix: L.monoMix || null,
    mixM: L.mix ? L.mix.map((row, i) => row.map((v, j) => (i === j ? 1 : 0) + (v - (i === j ? 1 : 0)) * a)) : null,
    lcurve: L.curve ? L.curve.map((v, i) => ID_CURVE[i] + (v - ID_CURVE[i]) * a) : null,
    split: L.split ? { sh: (L.split.sh || [0, 0, 0]).map(v => v * a), hi: (L.split.hi || [0, 0, 0]).map(v => v * a) } : null,
    ch: L.ch || null, chA: a, lo: p.auto ? p.auto.lo : 0, hi: p.auto ? p.auto.hi : 1,
    curves: p.curves, hsl: L.hsl ? mergeHsl(p.hsl, L.hsl, a) : p.hsl, grade: p.grade, masks: p.masks || [], brush: p.brush || [], blur: p.blur,
    stamp: p.stamp, stampStyle: p.stampStyle || { fmt: 'yy', color: 'orange', pos: 'br' }
  };
}
/* Look-eigene Farbverschiebungen (Farbton/Sättigung/Luminanz je Farbbereich) zu den eigenen Reglern addieren */
function mergeHsl(user, look, a) { const o = {}; for (let k = 0; k < 8; k++) { const u = user[k] || [0, 0, 0], l = look[k] || [0, 0, 0]; o[k] = [u[0] + l[0] * a, u[1] + l[1] * a, u[2] + l[2] * a]; } return o; }
export function curveFn(ys) {
  // monotone kubische Interpolation über feste Stützstellen
  const n = ys.length, xs = ys.map((_, i) => i / (n - 1)), dx = 1 / (n - 1);
  const d = []; for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / dx);
  const m = [d[0]]; for (let i = 1; i < n - 1; i++) m.push(d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2); m.push(d[n - 2]);
  for (let i = 0; i < n - 1; i++) { if (d[i] === 0) { m[i] = m[i + 1] = 0; continue; } const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b; if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; } }
  return v => { const i = Math.min(n - 2, Math.max(0, Math.floor(v / dx))); const t = (v - xs[i]) / dx, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * dx * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * dx * m[i + 1]; };
}
export const isId = ys => ys.every((v, i) => Math.abs(v - ID_CURVE[i]) < 1e-4);
function toneLUT(e) {
  const N = 1024, lut = new Float32Array(N), cf = isId(e.curves.rgb) ? null : curveFn(e.curves.rgb), lcf = e.lcurve && !isId(e.lcurve) ? curveFn(e.lcurve) : null;
  const exm = Math.pow(2, e.ex), brx = Math.pow(2, -e.br * .9), span = Math.max(.05, e.hi - e.lo), f = e.fade * .18;
  for (let i = 0; i < N; i++) {
    let v = clamp((i / (N - 1) - e.lo) / span);
    if (e.ex) { v = Math.pow(Math.pow(v, 2.2) * exm, 1 / 2.2); if (v > .85) v = .85 + (1 - Math.exp(-(v - .85) / .15)) * .15; }
    v += e.bl * .12 * Math.pow(1 - v, 5);
    v += e.wh * .12 * Math.pow(v, 5);
    v += e.sh * .16 * (v * Math.pow(1 - v, 3)) / .1055;
    v += e.hl * .16 * (Math.pow(v, 3) * (1 - v)) / .1055;
    v = clamp(v);
    if (e.co > 0) { const s = v * v * (3 - 2 * v); v += (s - v) * e.co * 1.3; }
    else if (e.co < 0) v += ((.5 + (v - .5) * .4) - v) * (-e.co);
    v = Math.pow(clamp(v), brx);
    if (cf) v = cf(v);
    if (lcf) v = lcf(clamp(v));
    v = f + clamp(v) * (1 - f);
    lut[i] = clamp(v);
  }
  return lut;
}
function chLUTs(e) {
  const out = {};
  ['r', 'g', 'b'].forEach(c => {
    const cf = isId(e.curves[c]) ? null : curveFn(e.curves[c]);
    const lk = e.ch && e.ch[c] ? e.ch[c] : null;
    if (!cf && !lk) { out[c] = null; return; }
    const lut = new Float32Array(1024), a = e.chA;
    const lift = lk ? lk[0] * a : 0, gain = lk ? 1 + (lk[1] - 1) * a : 1, gam = lk ? 1 + (lk[2] - 1) * a : 1;
    for (let i = 0; i < 1024; i++) { let v = i / 1023; if (cf) v = clamp(cf(v)); v = Math.pow(clamp(lift + v * (gain - lift)), gam); lut[i] = v; }
    out[c] = lut;
  });
  return out;
}

/* ---------- Unschärfe-Puffer (Box-Blur, zweifach = fast Gauß) ---------- */
function blurPass(a, o, w, h, r, horiz) {
  const d = 2 * r + 1;
  if (horiz) for (let y = 0; y < h; y++) { const row = y * w; let s = 0; for (let k = -r; k <= r; k++) s += a[row + clamp(k, 0, w - 1)];
    for (let x = 0; x < w; x++) { o[row + x] = s / d; s += a[row + Math.min(w - 1, x + r + 1)] - a[row + Math.max(0, x - r)]; } }
  else for (let x = 0; x < w; x++) { let s = 0; for (let k = -r; k <= r; k++) s += a[clamp(k, 0, h - 1) * w + x];
    for (let y = 0; y < h; y++) { o[y * w + x] = s / d; s += a[Math.min(h - 1, y + r + 1) * w + x] - a[Math.max(0, y - r) * w + x]; } }
}
function blur2(src, w, h, r) { const t = new Float32Array(src.length), b = new Float32Array(src.length);
  blurPass(src, t, w, h, r, true); blurPass(t, b, w, h, r, false); blurPass(b, t, w, h, r, true); blurPass(t, b, w, h, r, false); return b; }
export function makeAux(c) {
  const w = c.width, h = c.height;
  return { w, h, M: Math.max(w, h), data: c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data, lum: null, lb: {}, rgb: {}, dark: {}, brushKey: null, brush: null };
}
function lumOf(aux) {
  if (!aux.lum) { const { w, h, data } = aux, n = w * h, lum = new Float32Array(n);
    for (let i = 0, j = 0; i < n; i++, j += 4) lum[i] = (.2126 * data[j] + .7152 * data[j + 1] + .0722 * data[j + 2]) / 255; aux.lum = lum; }
  return aux.lum;
}
const lumBlur = (aux, r) => aux.lb[r] || (aux.lb[r] = blur2(lumOf(aux), aux.w, aux.h, r));
function rgbBlur(aux, r) {
  if (aux.rgb[r]) return aux.rgb[r];
  const { w, h, data } = aux, n = w * h, ch = [0, 1, 2].map(c => { const a = new Float32Array(n); for (let i = 0; i < n; i++) a[i] = data[i * 4 + c] / 255; return blur2(a, w, h, r); });
  return aux.rgb[r] = ch;
}
function darkBlur(aux, r) {
  if (aux.dark[r]) return aux.dark[r];
  const { w, h, data } = aux, n = w * h, a = new Float32Array(n);
  for (let i = 0, j = 0; i < n; i++, j += 4) a[i] = Math.min(data[j], data[j + 1], data[j + 2]) / 255;
  return aux.dark[r] = blur2(a, w, h, r);
}

/* ---------- Pinsel-Masken ---------- */
const BRUSH_MODES = ['dodge', 'burn', 'sat', 'desat', 'warm', 'cool'];
function brushMaps(aux, strokes) {
  const key = JSON.stringify(strokes);
  if (aux.brushKey === key) return aux.brush;
  aux.brushKey = key; aux.brush = null;
  if (!strokes.length) return null;
  const mw = Math.max(1, Math.round(aux.w / 4)), mh = Math.max(1, Math.round(aux.h / 4)), MM = Math.max(mw, mh), cv = {};
  const get = m => cv[m] || (cv[m] = mk(mw, mh));
  for (const s of strokes) {
    const targets = s.m === 'erase' ? Object.values(cv) : [get(s.m)];
    for (const c of targets) {
      const x = c.getContext('2d'); x.save(); x.globalCompositeOperation = s.m === 'erase' ? 'destination-out' : 'source-over';
      const R = Math.max(1, s.s * MM), k = s.m === 'erase' ? 1 : s.k, pts = s.p;
      const dab = (px, py) => { const g = x.createRadialGradient(px, py, 0, px, py, R); g.addColorStop(0, `rgba(255,255,255,${k * .5})`); g.addColorStop(.5, `rgba(255,255,255,${k * .3})`); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(px - R, py - R, 2 * R, 2 * R); };
      for (let i = 0; i < pts.length; i += 2) {
        const px = pts[i] * mw, py = pts[i + 1] * mh;
        if (i >= 2) { const qx = pts[i - 2] * mw, qy = pts[i - 1] * mh, dist = Math.hypot(px - qx, py - qy), steps = Math.floor(dist / (R * .35));
          for (let j = 1; j < steps; j++) dab(qx + (px - qx) * j / steps, qy + (py - qy) * j / steps); }
        dab(px, py);
      }
      x.restore();
    }
  }
  const maps = { mw, mh };
  for (const m of BRUSH_MODES) if (cv[m]) { const d = cv[m].getContext('2d').getImageData(0, 0, mw, mh).data, a = new Uint8Array(mw * mh); for (let i = 0; i < a.length; i++) a[i] = d[i * 4 + 3]; maps[m] = a; }
  return aux.brush = maps;
}

/* ---------- Farbe für Color Grading ---------- */
function hue2(p, q, t) { if (t < 0) t += 1; if (t > 1) t -= 1; if (t < 1 / 6) return p + (q - p) * 6 * t; if (t < .5) return q; if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6; return p; }
function tintVec(hdeg, s, k) {
  if (!s) return [0, 0, 0]; const h = hdeg / 360, c = [hue2(0, 1, h + 1 / 3), hue2(0, 1, h), hue2(0, 1, h - 1 / 3)], m = (c[0] + c[1] + c[2]) / 3;
  return c.map(v => (v - m) * s / 100 * k);
}
function hash(x, y) { let n = Math.imul(x, 374761393) + Math.imul(y, 668265263); n = Math.imul(n ^ (n >>> 13), 1274126177); n ^= n >>> 16; return (n >>> 0) / 4294967295; }

/* ---------- Hauptfunktion ---------- */
export function processImage(aux, p, stampMs) {
  const { w, h, data: d, M } = aux, e = eff(p), tone = toneLUT(e), ch = chLUTs(e);
  const out = new ImageData(w, h), o = out.data;
  const wr = 1 + .18 * e.temp + .05 * e.tint, wg = 1 - .1 * e.tint, wb = 1 - .18 * e.temp + .05 * e.tint;
  const masks = e.masks.filter(m => m.ex || m.co || m.sat || m.temp || m.st).map(m => ({ ...m, px: m.x * w, py: m.y * h, R1: Math.max(1, m.rx * M), R2: Math.max(1, (m.ry ?? m.rx) * M), c: Math.cos(m.angle || 0), s: Math.sin(m.angle || 0), f: Math.max(.02, m.feather ?? .5),
    wm: m.kind === 'ai' || m.kind === 'lasso' ? regionMap(aux, m) : null })).filter(m => !(m.kind === 'ai' || m.kind === 'lasso') || m.wm);
  const maskSt = masks.some(m => m.st), ton = e.tonH || e.tonM || e.tonL;
  const lum = (e.st || e.cl || e.tx || e.shp || e.dn || maskSt || ton || e.dr) ? lumOf(aux) : null;
  const bT = ton ? lumBlur(aux, Math.max(2, Math.round(M / 70))) : null, bD = e.dr ? lumBlur(aux, Math.max(4, Math.round(M / 14))) : null;
  // Hautglättung: kantenerhaltend weichzeichnen, nur auf erkannter Haut
  const skinM = e.skin ? maskData(e.skin.d, w, h) : null, skinR = Math.max(2, Math.round(M / 260)), skinB = skinM && e.skin.amt ? rgbBlur(aux, skinR) : null,
    skinL = skinB ? lumBlur(aux, skinR) : null, lumA = skinB ? lumOf(aux) : null, skA = e.skin ? (e.skin.amt || 0) / 100 : 0, skG = e.skin ? (e.skin.glow || 0) / 100 : 0;
  const bM = (e.st || maskSt) ? lumBlur(aux, Math.max(2, Math.round(M / 90))) : null;
  const bL = e.cl ? lumBlur(aux, Math.max(3, Math.round(M / 28))) : null;
  const bS = e.tx ? lumBlur(aux, Math.max(1, Math.round(M / 320))) : null;
  const bX = (e.shp || e.dn) ? lumBlur(aux, Math.max(1, Math.round(M / 900))) : null;
  const rgbB = e.dn ? rgbBlur(aux, Math.max(1, Math.round(M / 500))) : null;
  const dark = e.dh > 0 ? darkBlur(aux, Math.max(3, Math.round(M / 50))) : null;
  const bm = e.brush.length ? brushMaps(aux, e.brush) : null, bsx = bm ? bm.mw / w : 0, bsy = bm ? bm.mh / h : 0;
  const hs = [], sm = [], la = []; let hslOn = false;
  for (let k = 0; k < 8; k++) { const v = e.hsl[k] || [0, 0, 0]; hs[k] = v[0] / 100; sm[k] = v[1] / 100; la[k] = v[2] / 100; if (v[0] || v[1] || v[2]) hslOn = true; }
  const G = e.grade || {}, gS = tintVec(...(G.sh || [0, 0]), .22), gM = tintVec(...(G.mid || [0, 0]), .18), gH = tintVec(...(G.hi || [0, 0]), .22), gG = tintVec(...(G.glob || [0, 0]), .14), gBal = (G.bal || 0) / 100;
  const gradeOn = [gS, gM, gH, gG].some(v => v[0] || v[1] || v[2]);
  const MX = e.mixM, mmx = e.monoMix, sp = e.split, vig = e.vig, vStart = clamp(.62 - e.vigSize * .6, .02, .9), gr = e.gr, gs = Math.max(1, M / 1100 * (.4 + e.grSize * 3.2)), mono = e.mono, mt = e.monoTone;
  const cx = w / 2, cy = h / 2, dx2 = new Float32Array(w), dy2 = new Float32Array(h);
  if (vig) { for (let x = 0; x < w; x++) { const t = (x - cx) / cx; dx2[x] = t * t; } for (let y = 0; y < h; y++) { const t = (y - cy) / cy; dy2[y] = t * t; } }
  const satK = 1 + e.sat, vib = e.vib, chR = ch.r, chG = ch.g, chB = ch.b, dh = e.dh;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const pi = y * w + x, i = pi * 4;
      let r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255;
      if (rgbB) { const edge = Math.min(1, Math.abs(lum[pi] - bX[pi]) * 14), k = e.dn * .9 * (1 - edge); r += (rgbB[0][pi] - r) * k; g += (rgbB[1][pi] - g) * k; b += (rgbB[2][pi] - b) * k; }
      if (skinB) { const sv = skinM[pi]; if (sv > .02) { const edge = Math.min(1, Math.abs(lumA[pi] - skinL[pi]) * 7), k = skA * sv * (1 - edge) * .92; r += (skinB[0][pi] - r) * k; g += (skinB[1][pi] - g) * k; b += (skinB[2][pi] - b) * k; } }
      r *= wr; g *= wg; b *= wb;
      if (MX) { const r0 = r, g0 = g, b0 = b; r = MX[0][0] * r0 + MX[0][1] * g0 + MX[0][2] * b0; g = MX[1][0] * r0 + MX[1][1] * g0 + MX[1][2] * b0; b = MX[2][0] * r0 + MX[2][1] * g0 + MX[2][2] * b0; }
      let L = .2126 * r + .7152 * g + .0722 * b; if (L > 1) L = 1;
      let t = tone[(L * 1023) | 0];
      // lokale Anpassungen (Masken, Pinsel)
      let lex = 0, lco = 0, lsat = 0, ltemp = 0, lst = 0;
      for (let q = 0; q < masks.length; q++) {
        const m = masks[q], dx = x - m.px, dy = y - m.py; let wt;
        if (m.wm) wt = m.wm[pi];
        else if (m.kind === 'linear') { const s = (dx * m.c + dy * m.s) / m.R1; wt = smooth(clamp(.5 - s * .5 / m.f)); }
        else { const u = (dx * m.c + dy * m.s) / m.R1, v = (-dx * m.s + dy * m.c) / m.R2, dd = Math.sqrt(u * u + v * v); wt = dd >= 1 ? 0 : dd <= 1 - m.f ? 1 : smooth((1 - dd) / m.f); }
        if (m.inv) wt = 1 - wt;
        if (wt > 0) { lex += (m.ex || 0) * wt; lco += (m.co || 0) * wt; lsat += (m.sat || 0) * wt; ltemp += (m.temp || 0) * wt; lst += (m.st || 0) * wt; }
      }
      if (bm) { const mi = ((y * bsy) | 0) * bm.mw + ((x * bsx) | 0);
        if (bm.dodge) lex += bm.dodge[mi] / 255 * 1.2; if (bm.burn) lex -= bm.burn[mi] / 255 * 1.2;
        if (bm.sat) lsat += bm.sat[mi] / 255; if (bm.desat) lsat -= bm.desat[mi] / 255;
        if (bm.warm) ltemp += bm.warm[mi] / 255 * .8; if (bm.cool) ltemp -= bm.cool[mi] / 255 * .8; }
      if (lum) {
        const lv = lum[pi];
        if (bM) t += (lv - bM[pi]) * (e.st + lst) * 1.6;
        if (bL) t += (lv - bL[pi]) * e.cl * 1.5 * (.3 + 2.8 * t * (1 - t));
        if (bS) t += (lv - bS[pi]) * e.tx * 2.2;
        if (e.shp) t += (lv - bX[pi]) * e.shp * 3;
        if (bT) { const wl = (1 - t) * (1 - t), wh = t * t, wm = 1 - wl - wh; t += (lv - bT[pi]) * (e.tonH * wh + e.tonM * wm + e.tonL * wl) * 3.4; }
        if (bD) t += (lv - bD[pi]) * e.dr * 2.6 * (.35 + 2.6 * t * (1 - t));
        t = t < 0 ? 0 : t > 1 ? 1 : t;
      }
      if (L > .0005) { const k = t / L; r *= k; g *= k; b *= k; } else { r = g = b = t; }
      if (dark) { const tt = Math.max(.15, 1 - .9 * dh * dark[pi]), A = .92; r = (r - A * (1 - tt)) / tt; g = (g - A * (1 - tt)) / tt; b = (b - A * (1 - tt)) / tt; }
      else if (dh < 0) { const k = -dh * .55; r += (.86 - r) * k; g += (.87 - g) * k; b += (.89 - b) * k; }
      if (skG && skinM) lex += skG * .5 * skinM[pi];
      if (lex) { const f = Math.pow(2, lex); r *= f; g *= f; b *= f; }
      if (lco) { const f = 1 + lco; r = (r - .5) * f + .5; g = (g - .5) * f + .5; b = (b - .5) * f + .5; }
      if (ltemp) { r *= 1 + .2 * ltemp; b *= 1 - .2 * ltemp; }
      let gray = .2126 * r + .7152 * g + .0722 * b;
      const mx = r > g ? (r > b ? r : b) : (g > b ? g : b), mn = r < g ? (r < b ? r : b) : (g < b ? g : b);
      let k = satK * (1 + vib * (1 - Math.min(1, (mx - mn) * 1.6))) * (1 + lsat);
      if (dark) k *= 1 + .3 * dh;
      if (e.dr) k *= 1 - .5 * e.dr;
      if (mono && mmx) { const g2 = r * mmx[0] + g * mmx[1] + b * mmx[2]; r += (g2 - r) * mono; g += (g2 - g) * mono; b += (g2 - b) * mono; gray = .2126 * r + .7152 * g + .0722 * b; }
      if (mono) k *= (1 - mono);
      if (k !== 1) { if (k < 0) k = 0; r = gray + (r - gray) * k; g = gray + (g - gray) * k; b = gray + (b - gray) * k; }
      if (mt && mono) { r *= 1 + (mt[0] - 1) * mono; g *= 1 + (mt[1] - 1) * mono; b *= 1 + (mt[2] - 1) * mono; }
      if (hslOn) {
        r = clamp(r); g = clamp(g); b = clamp(b);
        const Mx = Math.max(r, g, b), m = Math.min(r, g, b), dd = Mx - m;
        if (dd > 1e-4) {
          let l = (Mx + m) / 2, s = l > .5 ? dd / (2 - Mx - m) : dd / (Mx + m), hh;
          if (Mx === r) hh = (g - b) / dd + (g < b ? 6 : 0); else if (Mx === g) hh = (b - r) / dd + 2; else hh = (r - g) / dd + 4; hh *= 60;
          let H = 0, S = 0, A = 0;
          for (let q = 0; q < 8; q++) { let dist = Math.abs(hh - HSL_BANDS[q][1]); if (dist > 180) dist = 360 - dist; const wk = 1 - dist / 42; if (wk > 0) { H += wk * hs[q]; S += wk * sm[q]; A += wk * la[q]; } }
          if (H || S || A) {
            hh = ((hh + H * 30) % 360 + 360) % 360 / 360; s = clamp(s * (1 + S)); l = clamp(l + A * .22 * s);
            const qq = l < .5 ? l * (1 + s) : l + s - l * s, pp = 2 * l - qq;
            r = hue2(pp, qq, hh + 1 / 3); g = hue2(pp, qq, hh); b = hue2(pp, qq, hh - 1 / 3);
          }
        }
      }
      if (gradeOn || sp) gray = clamp(.2126 * r + .7152 * g + .0722 * b);
      if (gradeOn) { const pg = clamp(gray - gBal * .3), ws = (1 - pg) * (1 - pg), wh = pg * pg, wm = 1 - ws - wh;
        r += gS[0] * ws + gM[0] * wm + gH[0] * wh + gG[0]; g += gS[1] * ws + gM[1] * wm + gH[1] * wh + gG[1]; b += gS[2] * ws + gM[2] * wm + gH[2] * wh + gG[2]; }
      if (sp) { const ws = (1 - gray) * (1 - gray), wh = gray * gray; r += sp.sh[0] * ws + sp.hi[0] * wh; g += sp.sh[1] * ws + sp.hi[1] * wh; b += sp.sh[2] * ws + sp.hi[2] * wh; }
      r = r < 0 ? 0 : r > 1 ? 1 : r; g = g < 0 ? 0 : g > 1 ? 1 : g; b = b < 0 ? 0 : b > 1 ? 1 : b;
      if (chR) r = chR[(r * 1023) | 0]; if (chG) g = chG[(g * 1023) | 0]; if (chB) b = chB[(b * 1023) | 0];
      if (vig) { let dv = Math.sqrt((dx2[x] + dy2[y]) / 2); dv = dv < vStart ? 0 : (dv - vStart) / (1 - vStart); if (dv > 1) dv = 1; dv = dv * dv * (3 - 2 * dv);
        if (vig > 0) { const vm = 1 - vig * .85 * dv; r *= vm; g *= vm; b *= vm; } else { const vm = -vig * .8 * dv; r += (1 - r) * vm; g += (1 - g) * vm; b += (1 - b) * vm; } }
      if (gr) { const n = hash((x / gs) | 0, (y / gs) | 0) - .5, gw = gr * .24 * (.35 + 2.6 * gray * (1 - gray)); r += n * gw; g += n * gw; b += n * gw; }
      o[i] = r * 255; o[i + 1] = g * 255; o[i + 2] = b * 255; o[i + 3] = d[i + 3];
    }
  }
  if (e.ca) chromaShift(o, w, h, e.ca);
  let c = mk(w, h); const x = c.getContext('2d'); x.putImageData(out, 0, 0);
  if (e.lowres) { const s = 1 - e.lowres * .82, sm = shrink(c, Math.max(8, w * s), Math.max(8, h * s)); x.save(); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'low'; x.drawImage(sm, 0, 0, w, h); x.restore(); }
  if (e.hal) { const hm = brightMask(c, 'hal'); x.save(); x.globalCompositeOperation = 'screen'; x.globalAlpha = Math.min(1, e.hal * 1.1); x.drawImage(hm, 0, 0, w, h); x.restore(); }
  if (e.glow) { const gb = brightMask(c, 'glow'); x.save(); x.globalCompositeOperation = 'screen'; x.globalAlpha = Math.min(1, e.glow * .8); x.drawImage(gb, 0, 0, w, h); x.restore(); }
  if (e.blur && e.blur.mode !== 'off' && e.blur.amt > 0) lensBlur(c, e.blur, M);
  if (e.grunge) drawGrunge(x, w, h, e.grunge);
  if (e.leak) drawLeak(x, w, h, e.leakKind, e.leak);
  if (e.dust) drawDust(x, w, h, e.dust);
  if (e.glitch) glitchFx(x, w, h, e.glitch);
  if (e.stamp) drawStamp(x, w, h, stampMs, e.stampStyle);
  return c;
}
/* Gewichtskarte für KI- und Lasso-Masken in Bildgröße (mit weicher Kante), je Hilfsbild zwischengespeichert */
function regionMap(aux, m) {
  const { w, h, M } = aux, key = (m.d ? 'd' + m.d.length + m.d.slice(-48) : 'l' + JSON.stringify(m.pts)) + '|' + (m.feather ?? .1);
  aux.rm = aux.rm || new Map(); if (aux.rm.has(key)) return aux.rm.get(key);
  let a = null;
  if (m.kind === 'ai') { const md = maskData(m.d, w, h); if (!md) return null; a = md; }
  else { const c = mk(w, h), x = c.getContext('2d', { willReadFrequently: true }), pts = m.pts || []; if (pts.length < 6) return null;
    x.fillStyle = '#fff'; x.beginPath(); x.moveTo(pts[0] * w, pts[1] * h); for (let i = 2; i < pts.length; i += 2) x.lineTo(pts[i] * w, pts[i + 1] * h); x.closePath(); x.fill();
    const d = x.getImageData(0, 0, w, h).data; a = new Float32Array(w * h); for (let i = 0; i < a.length; i++) a[i] = d[i * 4 + 3] / 255; }
  const r = Math.round((m.feather ?? .1) * M * .05); if (r >= 1) a = boxBlur(boxBlur(a, w, h, r), w, h, r);
  aux.rm.set(key, a); if (aux.rm.size > 8) aux.rm.delete(aux.rm.keys().next().value);
  return a;
}
/* Grunge: fleckige Struktur, Kratzer, gealterte Farbe */
const grungeTex = new Map();
function drawGrunge(x, w, h, a) {
  const tw = Math.max(64, Math.round(w / 3)), th = Math.max(64, Math.round(h / 3)), key = tw + 'x' + th; let t = grungeTex.get(key);
  if (!t) { t = mk(tw, th); const tx = t.getContext('2d'), id = tx.createImageData(tw, th), d = id.data, r = seeded(5);
    const oct = [[6, .5], [14, .27], [34, .15], [90, .08]];
    for (let y = 0; y < th; y++) for (let xx = 0; xx < tw; xx++) { let v = 0;
      for (const [f, amp] of oct) { const fx = xx / tw * f, fy = y / th * f, x0 = Math.floor(fx), y0 = Math.floor(fy), sx = fx - x0, sy = fy - y0, s1 = sx * sx * (3 - 2 * sx), s2 = sy * sy * (3 - 2 * sy);
        const h00 = hash(x0, y0 + f * 97), h10 = hash(x0 + 1, y0 + f * 97), h01 = hash(x0, y0 + 1 + f * 97), h11 = hash(x0 + 1, y0 + 1 + f * 97);
        v += ((h00 * (1 - s1) + h10 * s1) * (1 - s2) + (h01 * (1 - s1) + h11 * s1) * s2) * amp; }
      v = clamp((v - .5) * 1.9 + .5); const j = (y * tw + xx) * 4; d[j] = d[j + 1] = d[j + 2] = v * 255; d[j + 3] = 255; }
    tx.putImageData(id, 0, 0);
    tx.lineCap = 'round'; for (let i = 0; i < 60; i++) { const px = r() * tw, py = r() * th, l = (.03 + r() * .12) * Math.max(tw, th), an = r() * Math.PI;
      tx.strokeStyle = r() < .5 ? `rgba(255,255,255,${.25 + r() * .35})` : `rgba(0,0,0,${.2 + r() * .3})`; tx.lineWidth = .4 + r() * 1.1; tx.beginPath(); tx.moveTo(px, py); tx.lineTo(px + Math.cos(an) * l, py + Math.sin(an) * l); tx.stroke(); }
    grungeTex.set(key, t); if (grungeTex.size > 4) grungeTex.delete(grungeTex.keys().next().value); }
  x.save(); x.imageSmoothingQuality = 'high';
  x.globalCompositeOperation = 'overlay'; x.globalAlpha = Math.min(1, a * .85); x.drawImage(t, 0, 0, w, h);
  x.globalCompositeOperation = 'multiply'; x.globalAlpha = a * .35; x.fillStyle = '#b39a6a'; x.fillRect(0, 0, w, h);
  x.globalCompositeOperation = 'source-over'; const g = x.createRadialGradient(w / 2, h / 2, Math.min(w, h) * .3, w / 2, h / 2, Math.max(w, h) * .75);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(20,14,6,${.55 * a})`); x.globalAlpha = 1; x.fillStyle = g; x.fillRect(0, 0, w, h);
  x.restore();
}
/* Glitch: verschobene Farbkanäle, versetzte Streifen, Zeilen */
function glitchFx(x, w, h, a) {
  const id = x.getImageData(0, 0, w, h), d = id.data, src = d.slice(), M = Math.max(w, h), off = Math.max(1, Math.round(a * M * .01)), r = seeded(23);
  const shift = new Int32Array(h); const n = Math.round(4 + a * 14);
  for (let k = 0; k < n; k++) { const y0 = Math.floor(r() * h), hh = Math.max(1, Math.round((.004 + r() * r() * .05) * h)), dx = Math.round((r() - .5) * 2 * a * M * .07); for (let y = y0; y < Math.min(h, y0 + hh); y++) shift[y] = dx; }
  for (let y = 0; y < h; y++) { const sh = shift[y], line = (y % 3 === 0) ? 1 - a * .18 : 1;
    for (let xx = 0; xx < w; xx++) { const j = (y * w + xx) * 4, bx = Math.min(w - 1, Math.max(0, xx - sh));
      const rx = Math.min(w - 1, bx + off), gx = bx, bxx = Math.max(0, bx - off), row = y * w;
      d[j] = src[(row + rx) * 4] * line; d[j + 1] = src[(row + gx) * 4 + 1] * line; d[j + 2] = src[(row + bxx) * 4 + 2] * line; } }
  x.putImageData(id, 0, 0);
}

function chromaShift(o, w, h, amt) {
  const src = o.slice(), k = amt * .007, cx = w / 2, cy = h / 2;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = x - cx, dy = y - cy, i = (y * w + x) * 4;
    const rx = Math.round(cx + dx * (1 - k)), ry = Math.round(cy + dy * (1 - k)), bx = Math.round(cx + dx * (1 + k)), by = Math.round(cy + dy * (1 + k));
    if (rx >= 0 && rx < w && ry >= 0 && ry < h) o[i] = src[(ry * w + rx) * 4];
    if (bx >= 0 && bx < w && by >= 0 && by < h) o[i + 2] = src[(by * w + bx) * 4 + 2];
  }
}
/* Verkleinern in Halbierungsschritten (sauberes Filtern auch in Safari) */
export function shrink(src, tw, th) {
  tw = Math.max(1, Math.round(tw)); th = Math.max(1, Math.round(th));
  let cur = src, w = src.width, h = src.height;
  while (w / 2 > tw && h / 2 > th) { w = Math.round(w / 2); h = Math.round(h / 2); const c = mk(w, h), x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(cur, 0, 0, w, h); cur = c; }
  const c = mk(tw, th), x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(cur, 0, 0, tw, th); return c;
}
/* weiche Unschärfe über Verkleinern + schrittweises Vergrößern */
export function blurCanvas(src, f) {
  const W = src.width, H = src.height; let cur = shrink(src, W * f, H * f), w = cur.width, h = cur.height;
  while (w * 2 < W) { w *= 2; h *= 2; const c = mk(w, h), x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(cur, 0, 0, w, h); cur = c; }
  return cur;
}
function brightMask(c, kind) {
  const sm = shrink(c, c.width / 8, c.height / 8), x = sm.getContext('2d'), id = x.getImageData(0, 0, sm.width, sm.height), d = id.data;
  for (let i = 0; i < d.length; i += 4) {
    const l = (.2126 * d[i] + .7152 * d[i + 1] + .0722 * d[i + 2]) / 255;
    if (kind === 'hal') { const v = Math.max(0, (l - .7) / .3); d[i] = 255 * v; d[i + 1] = 60 * v; d[i + 2] = 25 * v; }
    else { const v = l * l; d[i] *= v; d[i + 1] *= v; d[i + 2] *= v; }
  }
  x.putImageData(id, 0, 0);
  return blurCanvas(sm, kind === 'hal' ? .25 : .35);
}
function lensBlur(c, bl, M) {
  const w = c.width, h = c.height, f = 1 / (3 + bl.amt / 100 * 26), b = blurCanvas(c, f);
  const m = mk(w, h), mx = m.getContext('2d'); mx.drawImage(b, 0, 0, w, h); mx.globalCompositeOperation = 'destination-in';
  const cx = bl.x * w, cy = bl.y * h, hw = bl.size * M, fe = Math.max(1, bl.feather * M); let g;
  if (bl.mode === 'radial') { g = mx.createRadialGradient(cx, cy, hw, cx, cy, hw + fe); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, '#000'); }
  else { const nx = -Math.sin(bl.angle || 0), ny = Math.cos(bl.angle || 0), tot = hw + fe; g = mx.createLinearGradient(cx - nx * tot, cy - ny * tot, cx + nx * tot, cy + ny * tot);
    const s1 = fe / (2 * tot), s2 = 1 - s1; g.addColorStop(0, '#000'); g.addColorStop(s1, 'rgba(0,0,0,0)'); g.addColorStop(s2, 'rgba(0,0,0,0)'); g.addColorStop(1, '#000'); }
  mx.fillStyle = g; mx.fillRect(0, 0, w, h);
  c.getContext('2d').drawImage(m, 0, 0);
}
export const LEAKS = ['Rot links', 'Orange Ecke', 'Gelb oben', 'Streifen', 'Regenbogen'];
function drawLeak(x, w, h, kind, a) {
  const M = Math.max(w, h);
  x.save(); x.globalCompositeOperation = 'screen'; x.globalAlpha = Math.min(1, a);
  const rad = (px, py, r, stops) => { const g = x.createRadialGradient(px, py, 0, px, py, r); stops.forEach(([o, c]) => g.addColorStop(o, c)); x.fillStyle = g; x.fillRect(0, 0, w, h); };
  const lin = (x0, y0, x1, y1, stops) => { const g = x.createLinearGradient(x0, y0, x1, y1); stops.forEach(([o, c]) => g.addColorStop(o, c)); x.fillStyle = g; x.fillRect(0, 0, w, h); };
  if (kind === 0) rad(-.05 * w, h * .55, M * .65, [[0, 'rgba(255,60,20,1)'], [.4, 'rgba(255,110,40,.55)'], [1, 'rgba(255,80,0,0)']]);
  else if (kind === 1) rad(w * 1.02, -.02 * h, M * .75, [[0, 'rgba(255,215,110,1)'], [.35, 'rgba(255,120,40,.6)'], [1, 'rgba(255,60,0,0)']]);
  else if (kind === 2) lin(0, 0, 0, h * .7, [[0, 'rgba(255,220,120,.95)'], [.4, 'rgba(255,170,60,.35)'], [1, 'rgba(255,140,0,0)']]);
  else if (kind === 3) { lin(w * .62, 0, w, 0, [[0, 'rgba(255,40,0,0)'], [.45, 'rgba(255,70,20,.9)'], [.6, 'rgba(255,190,80,1)'], [.75, 'rgba(255,70,20,.7)'], [1, 'rgba(255,40,0,0)']]);
    lin(0, 0, w * .25, 0, [[0, 'rgba(255,120,30,.45)'], [1, 'rgba(255,60,0,0)']]); }
  else { x.globalAlpha = Math.min(1, a) * .7; lin(0, h, w, 0, [[0, 'rgba(0,0,0,0)'], [.36, 'rgba(0,0,0,0)'], [.42, 'rgba(255,40,40,.8)'], [.47, 'rgba(255,200,40,.8)'], [.52, 'rgba(60,255,90,.7)'], [.57, 'rgba(50,120,255,.8)'], [.62, 'rgba(170,60,255,.7)'], [.68, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0)']]); }
  x.restore();
}
function drawDust(x, w, h, a) {
  const r = seeded(11), M = Math.max(w, h); x.save();
  const n = Math.round(40 + a * 160);
  for (let i = 0; i < n; i++) { const px = r() * w, py = r() * h, s = (.0006 + r() * r() * .0035) * M, light = r() < .75;
    x.fillStyle = light ? `rgba(255,255,250,${(.3 + .5 * r()) * a})` : `rgba(20,15,10,${(.3 + .4 * r()) * a})`; x.beginPath(); x.arc(px, py, s, 0, Math.PI * 2); x.fill(); }
  x.lineWidth = .0011 * M; x.lineCap = 'round';
  for (let i = 0; i < 3 + Math.round(a * 5); i++) { const px = r() * w, py = r() * h, l = (.02 + r() * .05) * M;
    x.strokeStyle = `rgba(255,255,250,${.45 * a})`; x.beginPath(); x.moveTo(px, py); x.bezierCurveTo(px + l * (r() - .5), py + l * r(), px + l * (r() - .5), py + l * (r() - .2), px + l * (r() - .5), py + l * (r() + .3)); x.stroke(); }
  for (let i = 0; i < 2; i++) { const px = r() * w; x.strokeStyle = `rgba(255,255,255,${.22 * a})`; x.lineWidth = .0008 * M; x.beginPath(); x.moveTo(px, 0); x.lineTo(px + (r() - .5) * w * .03, h); x.stroke(); }
  x.restore();
}
function drawStamp(ctx, w, h, ms, st) {
  const size = Math.max(12, Math.min(w, h) * .075), [fill, glow] = STAMP_COLORS[st.color] || STAMP_COLORS.orange, m = Math.min(w, h) * .055, txt = stampText(ms, st.fmt);
  ctx.save(); ctx.font = `${size}px "VT323", "Space Mono", monospace`; ctx.textBaseline = 'alphabetic';
  ctx.shadowColor = glow; ctx.shadowBlur = size * .35; ctx.fillStyle = fill;
  if (st.pos === 'bl') { ctx.textAlign = 'left'; ctx.fillText(txt, m, h - m); }
  else if (st.pos === 'tr') { ctx.textAlign = 'right'; ctx.textBaseline = 'top'; ctx.fillText(txt, w - m, m); }
  else { ctx.textAlign = 'right'; ctx.fillText(txt, w - m, h - m); }
  ctx.restore();
}

/* ---------- Vorbereitung: Perspektive und Reparatur ---------- */
export function prepare(orient, p) {
  const pv = p.persp || { v: 0, h: 0 }, heal = p.heal || [], clone = p.clone || [], erase = p.erase || [];
  if (!pv.v && !pv.h && !heal.length && !clone.length && !erase.length) return orient;
  const w = orient.width, h = orient.height; let c;
  if (pv.v || pv.h || heal.length || clone.length) {
    const src = orient.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
    let out = pv.v || pv.h ? perspective(src, w, h, pv.v / 100, pv.h / 100) : new Uint8ClampedArray(src);
    for (const s of heal) healSpot(out, w, h, s);
    for (const s of clone) cloneStroke(out, w, h, s);
    c = mk(w, h); c.getContext('2d').putImageData(new ImageData(out, w, h), 0, 0);
  } else { c = mk(w, h); c.getContext('2d').drawImage(orient, 0, 0); }
  // entfernte Objekte: gespeicherte Füll-Patches darüberlegen
  if (erase.length) { const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; for (const e of erase) { const im = patchImg(e.d); if (im) x.drawImage(im, e.x * w, e.y * h, e.w * w, e.h * h); } }
  return c;
}
/* Kopierstempel: Pixel aus dem um (dx, dy) versetzten Bereich entlang des Strichs übertragen, weiche Pinselkante */
function cloneStroke(o, w, h, s) {
  const M = Math.max(w, h), R = Math.max(1.5, s.s * M), ox = Math.round(s.dx * w), oy = Math.round(s.dy * h), src = o.slice(), pts = s.p, hard = s.hard ?? .5, done = new Float32Array(w * h);
  const dab = (cx, cy) => {
    for (let y = Math.max(0, Math.floor(cy - R)); y <= Math.min(h - 1, Math.ceil(cy + R)); y++)
      for (let x = Math.max(0, Math.floor(cx - R)); x <= Math.min(w - 1, Math.ceil(cx + R)); x++) {
        const dd = Math.hypot(x - cx, y - cy) / R; if (dd >= 1) continue;
        const wt = dd <= hard ? 1 : smooth((1 - dd) / (1 - hard)), pi = y * w + x; if (wt <= done[pi]) continue;
        const sx = x + ox, sy = y + oy; if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
        const i = pi * 4, si = (sy * w + sx) * 4, a = (wt - done[pi]) / (1 - done[pi] + 1e-6); done[pi] = wt;
        for (let c = 0; c < 3; c++) o[i + c] = o[i + c] * (1 - a) + src[si + c] * a;
      }
  };
  for (let i = 0; i < pts.length; i += 2) {
    const px = pts[i] * w, py = pts[i + 1] * h;
    if (i >= 2) { const qx = pts[i - 2] * w, qy = pts[i - 1] * h, dist = Math.hypot(px - qx, py - qy), steps = Math.floor(dist / (R * .25));
      for (let j = 1; j < steps; j++) dab(qx + (px - qx) * j / steps, qy + (py - qy) * j / steps); }
    dab(px, py);
  }
}
function perspective(s, w, h, v, hz) {
  const o = new Uint8ClampedArray(s.length), kv = v * .35, kh = hz * .35, z = 1 / (1 + Math.abs(kv) + Math.abs(kh));
  for (let y = 0; y < h; y++) { const Y = ((y + .5) / h * 2 - 1) * z;
    for (let x = 0; x < w; x++) { const X = ((x + .5) / w * 2 - 1) * z, fx = X * (1 + kv * Y), fy = Y * (1 + kh * X);
      const px = clamp((fx + 1) / 2 * w - .5, 0, w - 1.001), py = clamp((fy + 1) / 2 * h - .5, 0, h - 1.001), x0 = px | 0, y0 = py | 0, ax = px - x0, ay = py - y0;
      const i00 = (y0 * w + x0) * 4, i10 = i00 + 4, i01 = i00 + w * 4, i11 = i01 + 4, j = (y * w + x) * 4;
      for (let c = 0; c < 4; c++) o[j + c] = (s[i00 + c] * (1 - ax) + s[i10 + c] * ax) * (1 - ay) + (s[i01 + c] * (1 - ax) + s[i11 + c] * ax) * ay; } }
  return o;
}
function ringMean(d, w, h, cx, cy, R) {
  const a = [0, 0, 0]; let n = 0;
  for (let k = 0; k < 32; k++) { const an = k / 32 * Math.PI * 2; for (const rr of [R * 1.08, R * 1.3]) { const x = Math.round(cx + Math.cos(an) * rr), y = Math.round(cy + Math.sin(an) * rr);
    if (x < 0 || y < 0 || x >= w || y >= h) continue; const i = (y * w + x) * 4; a[0] += d[i]; a[1] += d[i + 1]; a[2] += d[i + 2]; n++; } }
  return n ? a.map(v => v / n) : null;
}
function healSpot(o, w, h, s) {
  const M = Math.max(w, h), cx = s.x * w, cy = s.y * h, R = Math.max(2, s.r * M), ox = (s.sx - s.x) * w, oy = (s.sy - s.y) * h;
  const t = ringMean(o, w, h, cx, cy, R), sr = ringMean(o, w, h, cx + ox, cy + oy, R), off = t && sr ? t.map((v, i) => v - sr[i]) : [0, 0, 0];
  const src = o.slice();
  for (let y = Math.max(0, Math.floor(cy - R)); y <= Math.min(h - 1, Math.ceil(cy + R)); y++)
    for (let x = Math.max(0, Math.floor(cx - R)); x <= Math.min(w - 1, Math.ceil(cx + R)); x++) {
      const dd = Math.hypot(x - cx, y - cy) / R; if (dd >= 1) continue;
      const wt = smooth((1 - dd) / .45), sx = clamp(Math.round(x + ox), 0, w - 1), sy = clamp(Math.round(y + oy), 0, h - 1), i = (y * w + x) * 4, si = (sy * w + sx) * 4;
      for (let c = 0; c < 3; c++) o[i + c] = src[i + c] * (1 - wt) + (src[si + c] + off[c] * (1 - dd * .5)) * wt;
    }
}
/* Quelle für die Reparatur automatisch wählen: ähnliche Umgebung, wenig Struktur */
export function pickHealSource(canvas, x, y, r) {
  const w = canvas.width, h = canvas.height, d = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data, M = Math.max(w, h);
  const cx = x * w, cy = y * h, R = Math.max(2, r * M), t = ringMean(d, w, h, cx, cy, R); let best = null;
  for (const dist of [2.4, 3.4]) for (let k = 0; k < 16; k++) {
    const an = k / 16 * Math.PI * 2, px = cx + Math.cos(an) * R * dist, py = cy + Math.sin(an) * R * dist;
    if (px - R < 0 || py - R < 0 || px + R >= w || py + R >= h) continue;
    const m = ringMean(d, w, h, px, py, R); if (!m || !t) continue;
    let v = 0, mu = 0, n = 0; for (let j = 0; j < 40; j++) { const a = j * 2.4, rr = R * Math.sqrt(j / 40), i = (Math.round(py + Math.sin(a) * rr) * w + Math.round(px + Math.cos(a) * rr)) * 4, l = d[i] * .3 + d[i + 1] * .6 + d[i + 2] * .1; mu += l; v += l * l; n++; }
    mu /= n; v = v / n - mu * mu;
    const score = Math.hypot(m[0] - t[0], m[1] - t[1], m[2] - t[2]) + Math.sqrt(Math.max(0, v)) * .8 + dist * 2;
    if (!best || score < best.s) best = { s: score, sx: px / w, sy: py / h };
  }
  return best ? { sx: best.sx, sy: best.sy } : { sx: clamp(x + r * 2.5 * M / w, 0, 1), sy: y };
}
/* Weißabgleich-Pipette: Temperatur/Tönung so wählen, dass der Punkt neutral wird */
export function wbFromPoint(canvas, x, y) {
  const w = canvas.width, h = canvas.height, R = Math.max(2, Math.round(Math.max(w, h) * .006)), px = Math.round(x * w), py = Math.round(y * h);
  const d = canvas.getContext('2d', { willReadFrequently: true }).getImageData(clamp(px - R, 0, w - 1), clamp(py - R, 0, h - 1), 2 * R + 1, 2 * R + 1).data;
  let r = 0, g = 0, b = 0, n = 0; for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
  r /= n; g /= n; b /= n; let best = null;
  for (let ti = -40; ti <= 40; ti++) for (let ni = -24; ni <= 24; ni++) {
    const t = ti / 40, nn = ni / 40, R2 = r * (1 + .18 * t + .05 * nn), G2 = g * (1 - .1 * nn), B2 = b * (1 - .18 * t + .05 * nn), m = (R2 + G2 + B2) / 3;
    const e = ((R2 - m) ** 2 + (G2 - m) ** 2 + (B2 - m) ** 2) / (m * m + 1) + (t * t + nn * nn) * .002; if (!best || e < best.e) best = { e, t, nn };
  }
  return { temp: Math.round(best.t * 100), tint: Math.round(best.nn * 100) };
}

/* ---------- Freistellen: Motiv vor Text legen ---------- */
/* Strich-Maske in normierten Bildkoordinaten; mit Kantenerkennung wird nur ähnliche Farbe erfasst */
/* KI-Masken (Antippen) liegen als PNG im Projekt; Dekodieren ist asynchron, danach wird neu gezeichnet */
export const cutHooks = { ver: 0, onReady: null };
const maskImgs = new Map();
export function maskData(d, mw, mh) {
  let e = maskImgs.get(d);
  if (!e) { e = { ready: false, sized: new Map() }; maskImgs.set(d, e); const im = new Image();
    im.onload = () => { e.img = im; e.ready = true; cutHooks.ver++; cutHooks.onReady && cutHooks.onReady(); }; im.onerror = () => { e.ready = true; e.bad = true; cutHooks.ver++; }; im.src = d; }
  if (!e.ready || e.bad) return null;
  const k = mw + 'x' + mh; let m = e.sized.get(k);
  if (!m) { const c = mk(mw, mh), x = c.getContext('2d', { willReadFrequently: true }); x.imageSmoothingQuality = 'high'; x.drawImage(e.img, 0, 0, mw, mh);
    const px = x.getImageData(0, 0, mw, mh).data; m = new Float32Array(mw * mh); for (let i = 0; i < m.length; i++) m[i] = px[i * 4] / 255; e.sized.set(k, m); if (e.sized.size > 3) e.sized.delete(e.sized.keys().next().value); }
  return m;
}
/* Farb-Patches (Objekt entfernen) – ebenfalls asynchron dekodiert */
const patchImgs = new Map();
function patchImg(d) {
  let e = patchImgs.get(d);
  if (!e) { e = { ready: false }; patchImgs.set(d, e); const im = new Image();
    im.onload = () => { e.img = im; e.ready = true; cutHooks.ver++; cutHooks.onReady && cutHooks.onReady(); }; im.onerror = () => { e.ready = true; e.bad = true; cutHooks.ver++; }; im.src = d; }
  return e.ready && !e.bad ? e.img : null;
}
const imgReady = (d, isPatch) => { const e = (isPatch ? patchImgs : maskImgs).get(d); return !!(e && e.ready); };
/* Anzahl noch nicht geladener Masken/Patches – fließt in die Cache-Schlüssel ein, damit nach dem Laden neu gerechnet wird */
export function pendingAssets(p) {
  let n = 0;
  for (const e of p.erase || []) if (!imgReady(e.d, true)) { patchImg(e.d); n++; }
  for (const m of p.masks || []) if (m.d && !imgReady(m.d)) { maskData(m.d, 1, 1); n++; }
  if (p.skin && p.skin.d && !imgReady(p.skin.d)) { maskData(p.skin.d, 1, 1); n++; }
  return n;
}
/* Rohes Modell-Ergebnis säubern: Unsicherheit → klare Kante, nur Bereiche behalten, die mit der angetippten Stelle verbunden sind */
export function cleanMask(m, u, v) {
  const { w, h } = m, d = m.data, out = new Float32Array(d.length), st = x => x <= .3 ? 0 : x >= .7 ? 1 : (x = (x - .3) / .4, x * x * (3 - 2 * x));
  for (let i = 0; i < d.length; i++) out[i] = st(d[i]);
  // Zusammenhangskomponenten (Schwelle 0,5), Startpunkt = Antippstelle bzw. nächster sicherer Pixel
  const lab = new Int32Array(d.length), sizes = [0]; let n = 0;
  for (let i = 0; i < d.length; i++) { if (lab[i] || out[i] < .5) continue; n++; let sz = 0; const stack = [i]; lab[i] = n;
    while (stack.length) { const k = stack.pop(); sz++; const x = k % w, y = (k / w) | 0;
      for (const q of [x > 0 ? k - 1 : -1, x < w - 1 ? k + 1 : -1, y > 0 ? k - w : -1, y < h - 1 ? k + w : -1]) if (q >= 0 && !lab[q] && out[q] >= .5) { lab[q] = n; stack.push(q); } }
    sizes.push(sz); }
  if (!n) return { w, h, data: out };
  const tx = Math.min(w - 1, Math.round(u * w)), ty = Math.min(h - 1, Math.round(v * h)); let main = lab[ty * w + tx];
  if (!main) { let best = 1e18; for (let i = 0; i < d.length; i += 3) if (lab[i]) { const dd = ((i % w) - tx) ** 2 + (((i / w) | 0) - ty) ** 2; if (dd < best) { best = dd; main = lab[i]; } } }
  const keep = new Uint8Array(n + 1); keep[main] = 1; for (let k = 1; k <= n; k++) if (sizes[k] > sizes[main] * .3) keep[k] = 1;
  // weiche Randpixel gehören zur Komponente ihres sicheren Nachbarn – sonst entfernen
  const near = new Uint8Array(d.length); for (let i = 0; i < d.length; i++) if (lab[i] && keep[lab[i]]) near[i] = 1;
  for (let pass = 0; pass < 3; pass++) { const nn = near.slice(); for (let i = 0; i < d.length; i++) if (!near[i] && out[i] > 0) { const x = i % w; if ((x > 0 && near[i - 1]) || (x < w - 1 && near[i + 1]) || near[i - w] || near[i + w]) nn[i] = 1; } near.set(nn); }
  for (let i = 0; i < d.length; i++) if (!near[i]) out[i] = 0;
  // kleine, rundum eingeschlossene Löcher füllen (z. B. eine Hand, die das Modell übersehen hat)
  let area = 0; for (let i = 0; i < d.length; i++) area += out[i] >= .5;
  const seen = new Uint8Array(d.length);
  for (let i = 0; i < d.length; i++) { if (seen[i] || out[i] >= .5) continue; const comp = [], stack = [i]; seen[i] = 1; let border = false;
    while (stack.length) { const k = stack.pop(); comp.push(k); const x = k % w, y = (k / w) | 0; if (!x || !y || x === w - 1 || y === h - 1) border = true;
      for (const q of [x > 0 ? k - 1 : -1, x < w - 1 ? k + 1 : -1, y > 0 ? k - w : -1, y < h - 1 ? k + w : -1]) if (q >= 0 && !seen[q] && out[q] < .5) { seen[q] = 1; stack.push(q); } }
    if (!border && comp.length < area * .025) for (const k of comp) out[k] = 1; }
  return { w, h, data: out };
}
export function maskToPNG(m, maxSide = 1280) { // Ergebnis der Erkennung → kompaktes Graustufen-PNG
  const s = Math.min(1, maxSide / Math.max(m.w, m.h)), w = Math.max(1, Math.round(m.w * s)), h = Math.max(1, Math.round(m.h * s));
  const full = mk(m.w, m.h), fx = full.getContext('2d'), id = fx.createImageData(m.w, m.h);
  for (let i = 0; i < m.data.length; i++) { const v = Math.round(clamp(m.data[i]) * 255), j = i * 4; id.data[j] = id.data[j + 1] = id.data[j + 2] = v; id.data[j + 3] = 255; }
  fx.putImageData(id, 0, 0); const c = mk(w, h), x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(full, 0, 0, w, h); return c.toDataURL('image/png');
}
/* separabler Kastenfilter (Radius r) */
function boxBlur(a, w, h, r) {
  if (r < 1) return a; const t = new Float32Array(a.length), o = new Float32Array(a.length), n = 2 * r + 1;
  for (let y = 0; y < h; y++) { let s = 0; const row = y * w; for (let x = -r; x <= r; x++) s += a[row + clamp(x, 0, w - 1)];
    for (let x = 0; x < w; x++) { t[row + x] = s / n; s += a[row + Math.min(w - 1, x + r + 1)] - a[row + Math.max(0, x - r)]; } }
  for (let x = 0; x < w; x++) { let s = 0; for (let y = -r; y <= r; y++) s += t[clamp(y, 0, h - 1) * w + x];
    for (let y = 0; y < h; y++) { o[y * w + x] = s / n; s += t[Math.min(h - 1, y + r + 1) * w + x] - t[Math.max(0, y - r) * w + x]; } }
  return o;
}
/* Kantenerhaltender Filter (Guided Filter, Farbversion): legt die Maskenkante an echte Bildkanten an – Haare, Fell, Ränder */
function guidedEdges(a, ref, w, h, MM) {
  const N = w * h, r = Math.max(2, Math.round(MM * .006)), eps = 6e-4, I = [0, 1, 2].map(c => { const o = new Float32Array(N); for (let i = 0; i < N; i++) o[i] = ref[i * 4 + c] / 255; return o; });
  const mul = (x, y) => { const o = new Float32Array(N); for (let i = 0; i < N; i++) o[i] = x[i] * y[i]; return o; }, B = x => boxBlur(x, w, h, r);
  const mI = I.map(B), mp = B(a), mIp = I.map(c => B(mul(c, a))), cov = [[0, 0], [0, 1], [0, 2], [1, 1], [1, 2], [2, 2]].map(([i, j]) => B(mul(I[i], I[j])));
  const A = [new Float32Array(N), new Float32Array(N), new Float32Array(N)], bb = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const m0 = mI[0][i], m1 = mI[1][i], m2 = mI[2][i], p = mp[i];
    const c0 = mIp[0][i] - m0 * p, c1 = mIp[1][i] - m1 * p, c2 = mIp[2][i] - m2 * p;
    const s00 = cov[0][i] - m0 * m0 + eps, s01 = cov[1][i] - m0 * m1, s02 = cov[2][i] - m0 * m2, s11 = cov[3][i] - m1 * m1 + eps, s12 = cov[4][i] - m1 * m2, s22 = cov[5][i] - m2 * m2 + eps;
    const i00 = s11 * s22 - s12 * s12, i01 = s02 * s12 - s01 * s22, i02 = s01 * s12 - s02 * s11, det = s00 * i00 + s01 * i01 + s02 * i02;
    if (Math.abs(det) < 1e-14) { A[0][i] = A[1][i] = A[2][i] = 0; bb[i] = p; continue; }
    const i11 = s00 * s22 - s02 * s02, i12 = s02 * s01 - s00 * s12, i22 = s00 * s11 - s01 * s01;
    const a0 = (c0 * i00 + c1 * i01 + c2 * i02) / det, a1 = (c0 * i01 + c1 * i11 + c2 * i12) / det, a2 = (c0 * i02 + c1 * i12 + c2 * i22) / det;
    A[0][i] = a0; A[1][i] = a1; A[2][i] = a2; bb[i] = p - a0 * m0 - a1 * m1 - a2 * m2;
  }
  mIp.length = 0; cov.length = 0; mI.length = 0; // freigeben
  const mA = A.map(B), mb = B(bb), out = new Float32Array(N); A.length = 0;
  for (let i = 0; i < N; i++) { const q = mA[0][i] * I[0][i] + mA[1][i] * I[1][i] + mA[2][i] * I[2][i] + mb[i];
    // nur am Rand wirken lassen; klare Innen- und Außenflächen bleiben exakt
    out[i] = mp[i] > .985 ? 1 : mp[i] < .015 ? 0 : clamp((q - .5) * 1.25 + .5); }
  return out;
}
/* Kanten an die Bildfarben anpassen: lokales Farbmodell von Motiv und Hintergrund, Alpha per Projektion (gut für Haare/Fell) */
function refineEdges(a, ref, mw, mh, MM) {
  const band = boxBlur(a, mw, mh, Math.max(2, Math.round(MM * .008))), W = mw >> 1 || 1, H = mh >> 1 || 1, N = W * H;
  const ch = Array.from({ length: 8 }, () => new Float32Array(N));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const k = y * W + x;
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { const i = Math.min(mh - 1, 2 * y + dy) * mw + Math.min(mw - 1, 2 * x + dx), j = i * 4, f = a[i], b = 1 - f;
      ch[0][k] += f * ref[j] / 4; ch[1][k] += f * ref[j + 1] / 4; ch[2][k] += f * ref[j + 2] / 4; ch[3][k] += f / 4; ch[4][k] += b * ref[j] / 4; ch[5][k] += b * ref[j + 1] / 4; ch[6][k] += b * ref[j + 2] / 4; ch[7][k] += b / 4; } }
  const R = Math.max(3, Math.round(MM * .012)), S = ch.map(c => boxBlur(c, W, H, R)), out = Float32Array.from(a);
  for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) {
    const i = y * mw + x, bv = band[i]; if (bv < .015 || bv > .985) continue;
    const k = Math.min(H - 1, y >> 1) * W + Math.min(W - 1, x >> 1), wf = S[3][k], wb = S[7][k]; if (wf < .04 || wb < .04) continue;
    const fr = S[0][k] / wf, fg = S[1][k] / wf, fb = S[2][k] / wf, br = S[4][k] / wb, bg = S[5][k] / wb, bb = S[6][k] / wb, dr = fr - br, dg = fg - bg, db = fb - bb, L2 = dr * dr + dg * dg + db * db;
    if (L2 < 500) continue; const j = i * 4, al = clamp(((ref[j] - br) * dr + (ref[j + 1] - bg) * dg + (ref[j + 2] - bb) * db) / L2);
    const conf = Math.min(1, (L2 - 500) / 4000); out[i] = a[i] * (1 - .8 * conf) + al * .8 * conf;
  }
  return out;
}
export function cutMask(src, strokes, opt = {}) {
  const res = strokes.some(st => st.m === 'ai' || st.m === 'aisub') ? 900 : 720, s = Math.min(1, res / Math.max(src.width, src.height)), mw = Math.max(1, Math.round(src.width * s)), mh = Math.max(1, Math.round(src.height * s)), MM = Math.max(mw, mh);
  const ref = shrink(src, mw, mh).getContext('2d', { willReadFrequently: true }).getImageData(0, 0, mw, mh).data; let a = new Float32Array(mw * mh), incomplete = false;
  for (const st of strokes) {
    if (st.m === 'ai' || st.m === 'aisub') { const m = maskData(st.d, mw, mh); if (!m) { incomplete = true; continue; }
      if (st.m === 'ai') for (let i = 0; i < a.length; i++) a[i] = Math.max(a[i], m[i]); else for (let i = 0; i < a.length; i++) a[i] *= 1 - m[i]; continue; }
    if (st.m === 'lasso' || st.m === 'lassosub') { const pts = st.p; if (pts.length < 6) continue; const lc = mk(mw, mh), lx = lc.getContext('2d', { willReadFrequently: true });
      lx.fillStyle = '#fff'; lx.beginPath(); lx.moveTo(pts[0] * mw, pts[1] * mh); for (let i = 2; i < pts.length; i += 2) lx.lineTo(pts[i] * mw, pts[i + 1] * mh); lx.closePath(); lx.fill();
      const ld = lx.getImageData(0, 0, mw, mh).data; if (st.m === 'lasso') for (let i = 0; i < a.length; i++) a[i] = Math.max(a[i], ld[i * 4 + 3] / 255); else for (let i = 0; i < a.length; i++) a[i] *= 1 - ld[i * 4 + 3] / 255; continue; }
    const R = Math.max(1.5, st.s * MM), erase = st.m === 'erase', smart = st.smart && !erase, pts = st.p;
    // Referenzfarbe: Startpunkt des Strichs; sie folgt nur weichen Farbverläufen, nicht über Kanten in den Hintergrund
    const col = (cx, cy) => { const i = (clamp(Math.round(cy), 0, mh - 1) * mw + clamp(Math.round(cx), 0, mw - 1)) * 4; return [ref[i], ref[i + 1], ref[i + 2]]; };
    let cur = smart ? col(pts[0] * mw, pts[1] * mh) : null;
    const dab = (cx, cy) => {
      let rr = 0, gg = 0, bb = 0;
      if (smart) { const c2 = col(cx, cy); if (Math.hypot(c2[0] - cur[0], c2[1] - cur[1], c2[2] - cur[2]) < 34) cur = c2; [rr, gg, bb] = cur; }
      const y0 = Math.max(0, Math.floor(cy - R)), y1 = Math.min(mh - 1, Math.ceil(cy + R)), x0 = Math.max(0, Math.floor(cx - R)), x1 = Math.min(mw - 1, Math.ceil(cx + R));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const d = Math.hypot(x - cx, y - cy) / R; if (d >= 1) continue;
        let w = d < .55 ? 1 : 1 - (d - .55) / .45;
        if (smart) { const j = (y * mw + x) * 4, dist = Math.hypot(ref[j] - rr, ref[j + 1] - gg, ref[j + 2] - bb); w *= clamp(1 - (dist - 28) / 46); if (w <= 0) continue; }
        const pi = y * mw + x; a[pi] = erase ? a[pi] * (1 - w) : a[pi] + (1 - a[pi]) * w;
      }
    };
    for (let i = 0; i < pts.length; i += 2) {
      const px = pts[i] * mw, py = pts[i + 1] * mh;
      if (i >= 2) { const qx = pts[i - 2] * mw, qy = pts[i - 1] * mh, dist = Math.hypot(px - qx, py - qy), steps = Math.floor(dist / (R * .3));
        for (let j = 1; j < steps; j++) dab(qx + (px - qx) * j / steps, qy + (py - qy) * j / steps); }
      dab(px, py);
    }
  }
  if (opt.refine) { a = guidedEdges(a, ref, mw, mh, MM); for (let i = 0; i < a.length; i++) if (a[i] < .04) a[i] = 0; else if (a[i] > .97) a[i] = 1; }
  const f = Math.round((opt.feather || 0) * MM / 720 * 1.5), sh = (opt.shift || 0) * MM / 720 * 1.2;
  if (f || sh) { const r = Math.max(1, f, Math.ceil(Math.abs(sh))); a = boxBlur(boxBlur(a, mw, mh, r), mw, mh, r);
    const off = sh / (2 * r + 1); for (let i = 0; i < a.length; i++) { let v = a[i] + off; if (!f) v = (v - .5) * 3 + .5; a[i] = clamp(v); } }
  const c = mk(mw, mh), x = c.getContext('2d'), id = x.createImageData(mw, mh);
  for (let i = 0; i < a.length; i++) { const j = i * 4; id.data[j] = id.data[j + 1] = id.data[j + 2] = 255; id.data[j + 3] = a[i] * 255; }
  x.putImageData(id, 0, 0); c.incomplete = incomplete; return c;
}
export function cutout(img, strokes, opt) {
  const mask = cutMask(img, strokes, opt), c = mk(img.width, img.height), x = c.getContext('2d');
  x.drawImage(img, 0, 0); x.globalCompositeOperation = 'destination-in'; x.imageSmoothingQuality = 'high'; x.drawImage(mask, 0, 0, img.width, img.height);
  return { img: c, mask };
}
