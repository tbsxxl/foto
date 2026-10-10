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
    mono: L.mono ? a : 0, monoTone: L.monoTone || null,
    split: L.split ? { sh: L.split.sh.map(v => v * a), hi: L.split.hi.map(v => v * a) } : null,
    ch: L.ch || null, chA: a, lo: p.auto ? p.auto.lo : 0, hi: p.auto ? p.auto.hi : 1,
    curves: p.curves, hsl: p.hsl, grade: p.grade, masks: p.masks || [], brush: p.brush || [], blur: p.blur,
    stamp: p.stamp, stampStyle: p.stampStyle || { fmt: 'yy', color: 'orange', pos: 'br' }
  };
}
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
  const N = 1024, lut = new Float32Array(N), cf = isId(e.curves.rgb) ? null : curveFn(e.curves.rgb);
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
  const masks = e.masks.filter(m => m.ex || m.co || m.sat || m.temp || m.st).map(m => ({ ...m, px: m.x * w, py: m.y * h, R1: Math.max(1, m.rx * M), R2: Math.max(1, (m.ry ?? m.rx) * M), c: Math.cos(m.angle || 0), s: Math.sin(m.angle || 0), f: Math.max(.02, m.feather ?? .5) }));
  const maskSt = masks.some(m => m.st);
  const lum = (e.st || e.cl || e.tx || e.shp || e.dn || maskSt) ? lumOf(aux) : null;
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
  const sp = e.split, vig = e.vig, vStart = clamp(.62 - e.vigSize * .6, .02, .9), gr = e.gr, gs = Math.max(1, M / 1100 * (.4 + e.grSize * 3.2)), mono = e.mono, mt = e.monoTone;
  const cx = w / 2, cy = h / 2, dx2 = new Float32Array(w), dy2 = new Float32Array(h);
  if (vig) { for (let x = 0; x < w; x++) { const t = (x - cx) / cx; dx2[x] = t * t; } for (let y = 0; y < h; y++) { const t = (y - cy) / cy; dy2[y] = t * t; } }
  const satK = 1 + e.sat, vib = e.vib, chR = ch.r, chG = ch.g, chB = ch.b, dh = e.dh;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const pi = y * w + x, i = pi * 4;
      let r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255;
      if (rgbB) { const edge = Math.min(1, Math.abs(lum[pi] - bX[pi]) * 14), k = e.dn * .9 * (1 - edge); r += (rgbB[0][pi] - r) * k; g += (rgbB[1][pi] - g) * k; b += (rgbB[2][pi] - b) * k; }
      r *= wr; g *= wg; b *= wb;
      let L = .2126 * r + .7152 * g + .0722 * b; if (L > 1) L = 1;
      let t = tone[(L * 1023) | 0];
      // lokale Anpassungen (Masken, Pinsel)
      let lex = 0, lco = 0, lsat = 0, ltemp = 0, lst = 0;
      for (let q = 0; q < masks.length; q++) {
        const m = masks[q], dx = x - m.px, dy = y - m.py; let wt;
        if (m.kind === 'linear') { const s = (dx * m.c + dy * m.s) / m.R1; wt = smooth(clamp(.5 - s * .5 / m.f)); }
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
        t = t < 0 ? 0 : t > 1 ? 1 : t;
      }
      if (L > .0005) { const k = t / L; r *= k; g *= k; b *= k; } else { r = g = b = t; }
      if (dark) { const tt = Math.max(.15, 1 - .9 * dh * dark[pi]), A = .92; r = (r - A * (1 - tt)) / tt; g = (g - A * (1 - tt)) / tt; b = (b - A * (1 - tt)) / tt; }
      else if (dh < 0) { const k = -dh * .55; r += (.86 - r) * k; g += (.87 - g) * k; b += (.89 - b) * k; }
      if (lex) { const f = Math.pow(2, lex); r *= f; g *= f; b *= f; }
      if (lco) { const f = 1 + lco; r = (r - .5) * f + .5; g = (g - .5) * f + .5; b = (b - .5) * f + .5; }
      if (ltemp) { r *= 1 + .2 * ltemp; b *= 1 - .2 * ltemp; }
      let gray = .2126 * r + .7152 * g + .0722 * b;
      const mx = r > g ? (r > b ? r : b) : (g > b ? g : b), mn = r < g ? (r < b ? r : b) : (g < b ? g : b);
      let k = satK * (1 + vib * (1 - Math.min(1, (mx - mn) * 1.6))) * (1 + lsat);
      if (dark) k *= 1 + .3 * dh;
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
  if (e.leak) drawLeak(x, w, h, e.leakKind, e.leak);
  if (e.dust) drawDust(x, w, h, e.dust);
  if (e.stamp) drawStamp(x, w, h, stampMs, e.stampStyle);
  return c;
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
  const pv = p.persp || { v: 0, h: 0 }, heal = p.heal || [];
  if (!pv.v && !pv.h && !heal.length) return orient;
  const w = orient.width, h = orient.height, src = orient.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
  let out = pv.v || pv.h ? perspective(src, w, h, pv.v / 100, pv.h / 100) : new Uint8ClampedArray(src);
  for (const s of heal) healSpot(out, w, h, s);
  const c = mk(w, h); c.getContext('2d').putImageData(new ImageData(out, w, h), 0, 0); return c;
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
export function cutMask(src, strokes) {
  const s = Math.min(1, 720 / Math.max(src.width, src.height)), mw = Math.max(1, Math.round(src.width * s)), mh = Math.max(1, Math.round(src.height * s)), MM = Math.max(mw, mh);
  const ref = shrink(src, mw, mh).getContext('2d', { willReadFrequently: true }).getImageData(0, 0, mw, mh).data, a = new Float32Array(mw * mh);
  for (const st of strokes) {
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
  const c = mk(mw, mh), x = c.getContext('2d'), id = x.createImageData(mw, mh);
  for (let i = 0; i < a.length; i++) { const j = i * 4; id.data[j] = id.data[j + 1] = id.data[j + 2] = 255; id.data[j + 3] = a[i] * 255; }
  x.putImageData(id, 0, 0); return c;
}
export function cutout(img, strokes) {
  const mask = cutMask(img, strokes), c = mk(img.width, img.height), x = c.getContext('2d');
  x.drawImage(img, 0, 0); x.globalCompositeOperation = 'destination-in'; x.imageSmoothingQuality = 'high'; x.drawImage(mask, 0, 0, img.width, img.height);
  return { img: c, mask };
}
