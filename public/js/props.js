/* Realistische Requisiten (Klebeband, Büroklammer, Foldback-Klammer) – pixelweise mit Licht und Material berechnet –
   und handgezeichnete Kritzeleien mit Filzstift-Strich. */

/* ---------- Hilfen ---------- */
const cache = new Map();
function memo(key, make) {
  let v = cache.get(key);
  if (!v) { v = make(); cache.set(key, v); if (cache.size > 120) cache.delete(cache.keys().next().value); }
  return v;
}
function hash(x, y, s) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const fbm = (x, y, s, o = 3) => { let t = 0, a = .5, f = 1, n = 0; for (let i = 0; i < o; i++) { t += a * vnoise(x * f, y * f, s + i * 17); n += a; f *= 2.03; a *= .5; } return t / n; };
const rng = s => { let a = (Math.imul((s | 0) ^ 0x9e3779b9, 0x85ebca6b) >>> 0) || 1; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const cl = (v, a = 0, b = 1) => v < a ? a : v > b ? b : v;
const hex = h => { const m = /^#?([0-9a-f]{6})$/i.exec(h || ''); const n = m ? parseInt(m[1], 16) : 0xefe3c4; return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
/* Pixelgröße, in der etwas der Breite w gerade gezeichnet wird */
const devScale = c => { const m = c.getTransform(); return Math.hypot(m.a, m.b) || 1; };

/* Studio-Umgebung für spiegelnde Oberflächen: Softbox oben, dunkler Horizont, heller Boden */
function env(rx, ry) {
  let e = ry < -.4 ? 1 : ry < -.08 ? 1 - (ry + .4) / .32 * .62 : ry < .3 ? .38 + (ry + .08) / .38 * .3 : .68 - (ry - .3) * .2;
  return e + .12 * Math.max(0, rx);
}
const L = (() => { const v = [-.45, -.75, .6], n = Math.hypot(...v); return v.map(q => q / n); })();

/* ---------- Draht (Büroklammer, Bügel der Foldback-Klammer) ---------- */
function samplePath(segs, step) { // segs: ['M',x,y] | ['L',x,y] | ['A',cx,cy,r,a0,a1]
  const pts = []; let px = 0, py = 0;
  for (const s of segs) {
    if (s[0] === 'M') { px = s[1]; py = s[2]; pts.push([px, py]); }
    else if (s[0] === 'L') { const d = Math.hypot(s[1] - px, s[2] - py), n = Math.max(1, Math.ceil(d / step)); for (let i = 1; i <= n; i++) pts.push([px + (s[1] - px) * i / n, py + (s[2] - py) * i / n]); px = s[1]; py = s[2]; }
    else { const [, cx, cy, r, a0, a1] = s, n = Math.max(4, Math.ceil(Math.abs(a1 - a0) * r / step)); for (let i = 1; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } px = cx + Math.cos(a1) * r; py = cy + Math.sin(a1) * r; }
  }
  return pts;
}
function wire(img, W, H, pts, R, mat) {
  const D = new Float32Array(W * H).fill(1e9), VX = new Float32Array(W * H), VY = new Float32Array(W * H);
  for (let k = 1; k < pts.length; k++) {
    const [ax, ay] = pts[k - 1], [bx, by] = pts[k], dx = bx - ax, dy = by - ay, ll = dx * dx + dy * dy || 1;
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - R - 1)), x1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx) + R + 1)), y0 = Math.max(0, Math.floor(Math.min(ay, by) - R - 1)), y1 = Math.min(H - 1, Math.ceil(Math.max(ay, by) + R + 1));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const px = x + .5, py = y + .5, t = cl(((px - ax) * dx + (py - ay) * dy) / ll), qx = px - (ax + t * dx), qy = py - (ay + t * dy), d = qx * qx + qy * qy, i = y * W + x;
      if (d < D[i]) { D[i] = d; VX[i] = qx; VY[i] = qy; }
    }
  }
  const P = img.data, [cr, cg, cb] = mat.color;
  for (let i = 0; i < W * H; i++) {
    const d = Math.sqrt(D[i]); if (d > R + .5) continue;
    const a = cl(R - d + .5), nx = cl(VX[i] / R, -1, 1), ny = cl(VY[i] / R, -1, 1), nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
    const rx = 2 * nz * nx, ry = 2 * nz * ny, rz = 2 * nz * nz - 1, spec = Math.pow(Math.max(0, rx * L[0] + ry * L[1] + rz * L[2]), mat.metal ? 70 : 30);
    let r, g, b;
    if (mat.metal) { const e = env(rx, ry); r = cr * e + 255 * spec; g = cg * e + 255 * spec; b = cb * e + 255 * spec; }
    else { const df = .3 + .7 * Math.max(0, nx * L[0] + ny * L[1] + nz * L[2]), e = .25 * env(rx, ry) * Math.pow(1 - nz, 2); r = cr * df + 255 * (spec * .7 + e); g = cg * df + 255 * (spec * .7 + e); b = cb * df + 255 * (spec * .7 + e); }
    const o = i * 4, ea = P[o + 3] / 255, na = a + ea * (1 - a);
    P[o] = (cl(r, 0, 255) * a + P[o] * ea * (1 - a)) / na; P[o + 1] = (cl(g, 0, 255) * a + P[o + 1] * ea * (1 - a)) / na; P[o + 2] = (cl(b, 0, 255) * a + P[o + 2] * ea * (1 - a)) / na; P[o + 3] = na * 255;
  }
}
function material(fill) {
  const f = (fill || '').toLowerCase();
  if (!f || f === '#9aa0a6' || f === '#c0c0c0') return { metal: true, color: [205, 210, 216] };
  if (f === '#d4af37' || f === '#c9a227') return { metal: true, color: [236, 196, 112] };
  return { metal: false, color: hex(f) };
}

/* Büroklammer */
function clipCanvas(W, H, fill) {
  return memo(`clip|${W}|${H}|${fill}`, () => {
    const cv = canvas(W, H), x = cv.getContext('2d'), img = x.createImageData(W, H), w = W, t = Math.max(1.2, w * .085), R = t / 2;
    const r1 = w * .2, r2 = w * .3 - R * .2, r3 = w * .4 - R * .3, yb1 = H - w * .6, yt = r2 + t, yb2 = H - r3 - t;
    const pts = samplePath([['M', w * .3, H * .3], ['L', w * .3, yb1], ['A', w * .5, yb1, r1, Math.PI, 0], ['L', w * .5 + r1, yt], ['A', w * .5 + r1 - r2, yt, r2, 0, -Math.PI],
      ['L', w * .5 + r1 - 2 * r2, yb2], ['A', w * .5 + r1 - 2 * r2 + r3, yb2, r3, Math.PI, 0], ['L', w * .5 + r1 - 2 * r2 + 2 * r3, H * .4]], Math.max(.5, R * .4));
    wire(img, W, H, pts, R, material(fill)); x.putImageData(img, 0, 0); return cv;
  });
}
/* Foldback-Klammer: Lackkörper mit gerollter Kante, ein Bügel nach vorn über das Foto geklappt */
function binderCanvas(W, H, fill) {
  return memo(`binder|${W}|${H}|${fill}`, () => {
    const cv = canvas(W, H), x = cv.getContext('2d'), top = H * .1, bot = H * .58, bh = bot - top, R = Math.max(.8, W * .017), inset = W * .06;
    const body = canvas(W, H), b = body.getContext('2d');
    b.beginPath(); b.moveTo(inset + W * .02, top); b.lineTo(W - inset - W * .02, top); b.quadraticCurveTo(W - inset, top, W - inset * .9, top + bh * .12); b.lineTo(W - 2, bot); b.lineTo(2, bot); b.lineTo(inset * .9, top + bh * .12); b.quadraticCurveTo(inset, top, inset + W * .02, top); b.closePath();
    b.fillStyle = '#000'; b.fill();
    const im = b.getImageData(0, 0, W, H), P = im.data, base = hex(fill && fill !== '#1c1c1c' ? fill : '#141414');
    for (let y = Math.floor(top); y < Math.ceil(bot); y++) {
      const v = (y - top) / bh, xl = inset * (1 - v) + 2 * v, xr = W - xl;
      for (let x2 = 0; x2 < W; x2++) {
        const o = (y * W + x2) * 4; if (!P[o + 3]) continue;
        let nx = 0, ny, nz;
        if (v < .17) { const ang = (v / .17 - .55) * Math.PI * .95; ny = Math.sin(ang); nz = Math.cos(ang); }
        else if (v > .94) { ny = .7; nz = .71; }
        else { ny = -.3 + .22 * v; nz = Math.sqrt(1 - ny * ny); }
        const ew = W * .05, dl = x2 - xl, dr = xr - x2;
        if (dl < ew) nx = -(1 - dl / ew) * .7; else if (dr < ew) nx = (1 - dr / ew) * .7;
        const nn = Math.hypot(nx, ny, nz); nx /= nn; ny /= nn; nz /= nn;
        const rx = 2 * nz * nx, ry = 2 * nz * ny, rz = 2 * nz * nz - 1, e = env(rx, ry), fr = .04 + .96 * Math.pow(1 - nz, 4), spec = Math.pow(Math.max(0, rx * L[0] + ry * L[1] + rz * L[2]), 60);
        const k = e * (.05 + .6 * fr) + spec * .85, n = (hash(x2, y, 7) - .5) * 3;
        P[o] = cl(base[0] + 230 * k + n, 0, 255); P[o + 1] = cl(base[1] + 230 * k + n, 0, 255); P[o + 2] = cl(base[2] + 234 * k + n, 0, 255);
      }
    }
    b.putImageData(im, 0, 0); x.drawImage(body, 0, 0);
    // Schatten des Bügels auf dem Lack, dann der Bügel selbst
    const loop = [['M', W * .2, top + bh * .08], ['L', W * .27, H - R * 1.6], ['L', W * .73, H - R * 1.6], ['L', W * .8, top + bh * .08]];
    x.save(); x.strokeStyle = 'rgba(0,0,0,.45)'; x.lineWidth = R * 2.2; x.lineJoin = 'round'; x.beginPath(); x.moveTo(W * .2 + R, top + bh * .08 + R * 1.5); x.lineTo(W * .27 + R, H - R * .4); x.lineTo(W * .73 + R, H - R * .4); x.lineTo(W * .8 + R, top + bh * .08 + R * 1.5); x.stroke(); x.restore();
    const img = x.getImageData(0, 0, W, H);
    wire(img, W, H, samplePath(loop, Math.max(.5, R * .4)), R, { metal: true, color: [205, 210, 216] });
    x.putImageData(img, 0, 0); return cv;
  });
}

/* ---------- Klebeband ---------- */
export function tapeType(fill) {
  const [r, g, b] = hex(fill), mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  if (mn > 236 && mx - mn < 14) return 'clear';
  if (r > g && g > b && r - b > 25 && r - b < 70 && r > 215) return 'masking';
  return 'washi';
}
function tapeCanvas(W, H, fill, seed, kind, pattern) {
  return memo(`tape|${W}|${H}|${fill}|${seed}|${kind}|${pattern}`, () => {
    const type = kind || tapeType(fill), cv = canvas(W, H), x = cv.getContext('2d'), img = x.createImageData(W, H), P = img.data, r = rng(seed), [cr, cg, cb] = hex(fill), s = seed * 7 + 3;
    const tearDepth = H * (type === 'clear' ? .07 : .16), sl = (r() - .5) * H * .35, sr = (r() - .5) * H * .35;
    const prof = (y, side) => { const v = y / H;
      if (type === 'clear') { const p = H / 8.5, tt = ((y / p + (side ? .37 : 0)) % 1); return tearDepth * (1 - Math.abs(tt * 2 - 1)) + H * .015 * vnoise(y / (H * .05), side, s); }
      return tearDepth * (.55 * fbm(v * 3.2, side * 9, s + side) + .45 * vnoise(y / (H * (type === 'washi' ? .09 : .055)), side * 5, s + 31)); };
    const xl = new Float32Array(H), xr = new Float32Array(H);
    for (let y = 0; y < H; y++) { const v = y / H; xl[y] = H * .05 + Math.max(0, sl) - sl * v + prof(y, 0); xr[y] = W - H * .05 - Math.max(0, -sr) - sr * v - prof(y, 1); }
    const creases = []; for (let k = 0, n = type === 'clear' ? 1 : Math.floor(r() * 3); k < n; k++) { const a = (90 + (r() - .5) * 70) * Math.PI / 180; creases.push([W * (.2 + r() * .6), Math.cos(a), Math.sin(a), r() < .5 ? 1 : -1]); }
    const pr0 = Math.floor(r() * 4), pat = type === 'washi' ? (pattern != null ? pattern : pr0) : 0, sheen = W * (.2 + r() * .6), fib = H * .06;
    for (let y = 0; y < H; y++) for (let x2 = 0; x2 < W; x2++) {
      const o = (y * W + x2) * 4, edgeT = Math.min(y + .5, H - y - .5), dL = x2 - xl[y], dR = xr[y] - x2;
      let cov = cl(Math.min(dL, dR, edgeT - (type === 'clear' ? 0 : .6 * vnoise(x2 / 3, y > H / 2 ? 1 : 0, s + 9))) + .5);
      if (cov <= 0 && type !== 'clear') { const dOut = Math.max(-dL, -dR); if (dOut > 0 && dOut < fib && edgeT > 1) { const n = vnoise(x2 / (H * .05), y / (H * .011), s + 5); if (n > .7) cov = (n - .7) / .3 * (1 - dOut / fib) * .8; } }
      if (cov <= 0) continue;
      let shade = 1 + .045 * (1 - 2 * y / H), alpha, cR = cr, cG = cg, cB = cb;
      for (const [cx, ux, uy, sg] of creases) { const sd = (x2 - cx) * ux + (y - H / 2) * uy, e = Math.exp(-Math.abs(sd) / (H * .03)); shade += (sd * sg > 0 ? .06 : -.045) * e; }
      if (type === 'masking') {
        const crepe = fbm(x2 / (H * .012), y / (H * .09), s, 2), grain = hash(x2, y, s) - .5, edge = Math.min(edgeT, dL, dR) / (H * .08);
        shade *= .965 + .07 * crepe + .03 * grain - (edge < 1 ? .05 * (1 - edge) : 0); alpha = .86 + .06 * crepe;
      } else if (type === 'washi') {
        const f1 = fbm(x2 / (H * .03), y / (H * .03), s, 3), f2 = vnoise(x2 / (H * .08), y / (H * .02), s + 2);
        shade *= .97 + .05 * f1 + (f2 > .85 ? .025 : 0); alpha = .72 + .12 * f1;
        if (pat) { const u = x2 / H, v = y / H; let on = 0;
          const aa = 1.5 / H, band = (q, wdt) => cl((wdt - Math.abs(q - .5)) / aa + .5); // weiche Druckkanten
          if (pat === 1) on = band((u * 3 + v * 3) % 1, .16);
          else if (pat === 2) { const gx = (u * 4.5) % 1 - .5, gy = ((v * 4.5 + (Math.floor(u * 4.5) % 2) * .5) % 1) - .5; on = cl((.14 - Math.hypot(gx, gy)) / aa + .5); }
          else on = Math.max(band((u * 5) % 1, .03), band((v * 5) % 1, .03));
          const pr = .5 * on * (.85 + .15 * f1); cR *= 1 - pr * .45; cG *= 1 - pr * .42; cB *= 1 - pr * .38; }
      } else {
        const st = fbm(x2 / (H * 1.6), y / (H * .045), s, 2), fr = hash(x2, y, s) * .03;
        cR = cG = cB = 252; alpha = .1 + .09 * st + fr;
        const ed = Math.min(edgeT, dL + 1, dR + 1); if (ed < 2.2) alpha += .32 * (1 - ed / 2.2);
        alpha += .14 * Math.exp(-Math.pow((x2 - sheen - (y - H / 2) * .8) / (H * .55), 2));
      }
      P[o] = cl(cR * shade, 0, 255); P[o + 1] = cl(cG * shade, 0, 255); P[o + 2] = cl(cB * shade, 0, 255); P[o + 3] = cl(alpha * cov) * 255;
    }
    x.putImageData(img, 0, 0); return cv;
  });
}

/* ---------- Zeichnen in die Szene ---------- */
const quant = v => v < 64 ? Math.max(6, Math.round(v)) : Math.round(v / 8) * 8;
export function drawTapeReal(c, l, x, y, w, h) {
  const sc = devScale(c); let W = quant(Math.min(1100, w * sc)); const H = Math.max(4, Math.round(W * h / w));
  const cv = tapeCanvas(W, H, l.fill, ((l.id | 0) + (l.seed || 0) * 7919) % 99991, l.tape, l.pattern);
  c.save(); c.shadowColor = 'rgba(0,0,0,.2)'; c.shadowBlur = Math.max(1, H * .1); c.shadowOffsetY = Math.max(.5, H * .035); c.drawImage(cv, x, y, w, h); c.restore();
}
export function drawClipReal(c, l, x, y, w, h) {
  const sc = devScale(c), W = quant(Math.min(260, w * sc)), H = Math.max(8, Math.round(W * h / w)), cv = clipCanvas(W, H, l.fill), u = W * .09;
  c.save(); c.shadowColor = 'rgba(0,0,0,.28)'; c.shadowBlur = u * 2.2; c.shadowOffsetX = u * 1.6; c.shadowOffsetY = u * 2; c.drawImage(cv, x, y, w, h);
  c.shadowColor = 'rgba(0,0,0,.4)'; c.shadowBlur = u * .5; c.shadowOffsetX = u * .45; c.shadowOffsetY = u * .6; c.drawImage(cv, x, y, w, h); c.restore();
}
export function drawBinderReal(c, l, x, y, w, h) {
  const sc = devScale(c), W = quant(Math.min(420, w * sc)), H = Math.max(8, Math.round(W * h / w)), cv = binderCanvas(W, H, l.fill), u = W * .02;
  c.save(); c.shadowColor = 'rgba(0,0,0,.35)'; c.shadowBlur = u * 4; c.shadowOffsetX = u * 1.5; c.shadowOffsetY = u * 3; c.drawImage(cv, x, y, w, h);
  c.shadowColor = 'rgba(0,0,0,.35)'; c.shadowBlur = u; c.shadowOffsetX = u * .4; c.shadowOffsetY = u; c.drawImage(cv, x, y, w, h); c.restore();
}

/* ---------- Kritzeleien ---------- */
const TAU = Math.PI * 2;
const ring = (cx, cy, rx, ry, a0 = 0, turns = 1, n = 40, f) => Array.from({ length: n + 1 }, (_, i) => { const a = a0 + turns * TAU * i / n, k = f ? f(a) : 1; return [cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]; });
const heartPts = (cx, cy, s, n = 40) => Array.from({ length: n + 1 }, (_, i) => { const t = TAU * i / n; return [cx + s * 16 * Math.sin(t) ** 3 / 17, cy - s * (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 17 - s * .1]; });
const starPts = (cx, cy, R, r, k = 5, rot = -Math.PI / 2) => Array.from({ length: 2 * k + 1 }, (_, i) => { const a = rot + Math.PI * i / k, q = i % 2 ? r : R; return [cx + Math.cos(a) * q, cy + Math.sin(a) * q]; });
const sparkPts = (cx, cy, R) => Array.from({ length: 9 }, (_, i) => { const a = -Math.PI / 2 + Math.PI * i / 4, q = i % 2 ? R * .22 : R; return [cx + Math.cos(a) * q, cy + Math.sin(a) * q]; });
/* Jede Kritzelei: Liste von Strichen in Einheitskoordinaten [0..1]; {p, sharp, w} – sharp = eckig statt geglättet */
export const DOODLES = {
  dHeart: () => [{ p: heartPts(.5, .52, .46) }, { p: heartPts(.51, .53, .4).slice(3, 34), w: .7 }],
  dHearts: () => [{ p: heartPts(.28, .62, .24) }, { p: heartPts(.62, .36, .2) }, { p: heartPts(.82, .74, .14) }],
  dStar: () => [{ p: starPts(.5, .53, .47, .2), sharp: true }, { p: starPts(.51, .54, .41, .17).slice(0, 8), sharp: true, w: .6 }],
  dSparkles: () => [{ p: sparkPts(.36, .4, .32), sharp: true }, { p: sparkPts(.78, .22, .16), sharp: true }, { p: sparkPts(.74, .76, .12), sharp: true }],
  dSwirl: () => [{ p: Array.from({ length: 60 }, (_, i) => { const a = i / 59 * 3.3 * TAU, q = .03 + .44 * i / 59; return [.5 + Math.cos(a) * q, .5 + Math.sin(a) * q]; }) }],
  dCircle: () => [{ p: ring(.5, .5, .47, .4, -.6, 1.12, 50, a => 1 + .05 * Math.sin(a * 3)) }],
  dUnderline: () => [{ p: Array.from({ length: 30 }, (_, i) => [.02 + .96 * i / 29, .35 + .14 * Math.sin(i / 29 * TAU * 2.5)]) }, { p: [[.08, .78], [.5, .7], [.92, .74]], w: .8 }],
  dArrowCurve: () => [{ p: [[.04, .78], [.2, .5], [.42, .38], [.5, .58], [.36, .66], [.34, .44], [.55, .26], [.8, .22], [.95, .3]] }, { p: [[.78, .1], [.96, .3], [.74, .44]], sharp: true }],
  dSun: () => [{ p: ring(.5, .5, .22, .22, 0, 1.05, 30) }, ...Array.from({ length: 10 }, (_, i) => { const a = i / 10 * TAU; return { p: [[.5 + Math.cos(a) * .32, .5 + Math.sin(a) * .32], [.5 + Math.cos(a) * .47, .5 + Math.sin(a) * .47]], sharp: true }; })],
  dCloud: () => [{ p: [[.12, .72], [.06, .56], [.18, .44], [.24, .3], [.4, .26], [.5, .16], [.68, .2], [.76, .36], [.9, .4], [.95, .58], [.86, .72], [.12, .72]] }],
  dFlower: () => [...Array.from({ length: 6 }, (_, i) => { const a = i / 6 * TAU, cx = .5 + Math.cos(a) * .2, cy = .38 + Math.sin(a) * .2; return { p: ring(cx, cy, .13, .13, a, 1, 18, t => 1 - .25 * Math.cos(t - a)) }; }), { p: ring(.5, .38, .07, .07, 0, 1.1, 14) }, { p: [[.5, .62], [.52, .8], [.5, .98]] }, { p: [[.51, .84], [.66, .74], [.7, .82], [.52, .86]] }],
  dSmile: () => [{ p: ring(.5, .5, .45, .45, -1, 1.05, 40) }, { p: [[.36, .36], [.37, .44]], w: 1.4 }, { p: [[.63, .36], [.64, .44]], w: 1.4 }, { p: [[.28, .58], [.4, .74], [.6, .74], [.72, .57]] }],
  dCrown: () => [{ p: [[.08, .78], [.06, .3], [.3, .55], [.5, .18], [.7, .55], [.94, .3], [.92, .78], [.08, .78]], sharp: true }, { p: [[.1, .9], [.9, .9]] }],
  dBolt: () => [{ p: [[.6, .02], [.24, .55], [.5, .55], [.36, .98], [.78, .4], [.52, .4], [.6, .02]], sharp: true }],
  dMusic: () => [{ p: [[.3, .78], [.32, .2], [.82, .1], [.8, .66]], sharp: true }, { p: ring(.22, .8, .1, .07, 0, 1.2, 14), w: 1.4 }, { p: ring(.72, .68, .1, .07, 0, 1.2, 14), w: 1.4 }, { p: [[.32, .34], [.81, .24]] }],
  dExclaim: () => [{ p: [[.33, .06], [.36, .66]], w: 1.3 }, { p: [[.37, .86], [.37, .9]], w: 2 }, { p: [[.66, .1], [.64, .66]], w: 1.3 }, { p: [[.64, .86], [.64, .9]], w: 2 }],
  dBurst: () => [{ p: starPts(.5, .5, .48, .34, 14, 0), sharp: true }],
  dPlane: () => [{ p: [[.55, .3], [.98, .06], [.72, .56], [.62, .42], [.55, .3]], sharp: true }, { p: [[.62, .42], [.98, .06]], sharp: true }, { p: [[.5, .38], [.3, .44], [.2, .62], [.32, .7], [.36, .56], [.18, .54], [.04, .8]], dash: true }],
  dLoops: () => [{ p: Array.from({ length: 80 }, (_, i) => { const t = i / 79, a = t * 4.5 * TAU; return [.04 + .9 * t + .07 * Math.cos(a + Math.PI), .55 + .26 * Math.sin(a + Math.PI) * .9]; }) }],
  dTick: () => [{ p: [[.08, .52], [.36, .86], [.94, .08]], sharp: true }],
  dDots: () => Array.from({ length: 14 }, (_, i) => { const r = rng(i * 13 + 5), x = .08 + r() * .84, y = .08 + r() * .84, a = r() * TAU, d = .03 + r() * .05; return { p: [[x, y], [x + Math.cos(a) * d, y + Math.sin(a) * d]], w: 1.2 }; }),
  dFlourish: () => [{ p: [[.02, .6], [.2, .4], [.35, .5], [.3, .66], [.2, .58], [.3, .4], [.5, .36], [.66, .58], [.8, .62], [.72, .46], [.62, .5], [.74, .7], [.98, .5]] }],
  dArrowDown: () => [{ p: [[.5, .04], [.44, .4], [.56, .66], [.5, .94]] }, { p: [[.3, .74], [.5, .96], [.72, .72]], sharp: true }],
  dHighlight: () => [{ p: [[.02, .5], [.5, .46], [.98, .52]], marker: true }]
};
export const DOODLE_LIST = [['dHeart', 'Herz'], ['dHearts', 'Herzchen'], ['dStar', 'Stern'], ['dSparkles', 'Funkeln'], ['dSwirl', 'Spirale'], ['dCircle', 'Einkreisen'], ['dUnderline', 'Unterstrich'], ['dArrowCurve', 'Schleifenpfeil'],
  ['dArrowDown', 'Pfeil runter'], ['dSun', 'Sonne'], ['dCloud', 'Wolke'], ['dFlower', 'Blume'], ['dSmile', 'Smiley'], ['dCrown', 'Krone'], ['dBolt', 'Blitz'], ['dMusic', 'Noten'], ['dExclaim', 'Ausrufe'], ['dBurst', 'Zacken'],
  ['dPlane', 'Papierflieger'], ['dLoops', 'Schlaufen'], ['dTick', 'Haken'], ['dDots', 'Konfetti'], ['dFlourish', 'Schnörkel'], ['dHighlight', 'Textmarker']];
export const isDoodle = k => /^d[A-Z]/.test(k || '');

/* Catmull-Rom-Glättung */
function smoothPts(p, steps) {
  if (p.length < 3) return p;
  const out = [];
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[i - 1] || p[i], p1 = p[i], p2 = p[i + 1], p3 = p[i + 2] || p2;
    for (let k = 0; k < steps; k++) { const t = k / steps, t2 = t * t, t3 = t2 * t;
      out.push([.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        .5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)]); }
  }
  out.push(p[p.length - 1]); return out;
}
/* Filzstift: leicht zitternde Linie mit wechselnder Strichstärke */
export function drawDoodle(c, l, x, y, w, h, sw) {
  const def = DOODLES[l.kind]; if (!def) return false;
  const r = rng((l.id | 0) * 31 + 7 + (l.seed || 0) * 1013), J = Math.min(w, h) * .012;
  c.save(); c.shadowColor = 'transparent'; c.strokeStyle = l.fill; c.lineCap = 'round'; c.lineJoin = 'round';
  for (const st of def()) {
    let pts = st.p.map(([u, v]) => [x + u * w + (r() - .5) * J * 2, y + v * h + (r() - .5) * J * 2]);
    if (st.marker) { c.globalAlpha *= .5; c.globalCompositeOperation = 'multiply'; c.lineCap = 'butt'; c.lineWidth = h * .8; pts = smoothPts(pts, 10); c.beginPath(); pts.forEach((q, i) => i ? c.lineTo(...q) : c.moveTo(...q)); c.stroke(); continue; }
    if (!st.sharp) pts = smoothPts(pts, 6);
    const dense = []; for (let i = 0; i < pts.length - 1; i++) { const [ax, ay] = pts[i], [bx, by] = pts[i + 1], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / Math.max(1, sw * .6))); for (let k = 0; k < n; k++) dense.push([ax + (bx - ax) * k / n, ay + (by - ay) * k / n]); }
    dense.push(pts[pts.length - 1]);
    const base = sw * (st.w || 1), ph = r() * 10;
    for (let i = 0; i < dense.length - 1; i++) {
      if (st.dash && Math.floor(i / 5) % 2) continue;
      const t = i / dense.length, taper = Math.min(1, (i + 1) / 3, (dense.length - i) / 3);
      c.lineWidth = Math.max(.6, base * (.82 + .3 * vnoise(i * .12 + ph, 0, 3)) * (.55 + .45 * taper));
      c.beginPath(); c.moveTo(...dense[i]); c.lineTo(...dense[i + 1]); c.stroke();
    }
  }
  c.restore(); return true;
}
export function doodleSVG(k) {
  const def = DOODLES[k]; if (!def) return '';
  return def().map(st => { const p = (st.sharp ? st.p : smoothPts(st.p, 3)).map(([u, v]) => `${(4 + u * 32).toFixed(1)} ${(4 + v * 32).toFixed(1)}`);
    return `<path d="M${p.join('L')}" fill="none" stroke="${st.marker ? '#ffe066' : 'var(--accent)'}" stroke-width="${st.marker ? 12 : 2.2 * (st.w || 1)}" stroke-linecap="round" stroke-linejoin="round" ${st.marker ? 'opacity=".7"' : ''}${st.dash ? ' stroke-dasharray="3 3"' : ''}/>`; }).join('');
}

/* Auswahl für die Oberfläche */
export const TAPE_KINDS = [['', 'Automatisch'], ['masking', 'Malerkrepp'], ['clear', 'Tesafilm'], ['washi', 'Washi']];
export const TAPE_PATTERNS = [[0, 'Uni'], [1, 'Streifen'], [2, 'Punkte'], [3, 'Karo']];
export const TAPE_COLORS = ['#efe3c4', '#f4f4ee', '#f2c6c2', '#c9dfe6', '#d8e6c8', '#f6d98b', '#d9c6ec', '#f3a6a0', '#a9c7e8', '#2b2b2b'];
export const CLIP_COLORS = [['#9aa0a6', 'Silber'], ['#d4af37', 'Gold'], ['#e04a4a', 'Rot'], ['#3b6fd8', 'Blau'], ['#f29bb5', 'Rosa'], ['#3fa36b', 'Grün'], ['#222222', 'Schwarz'], ['#f2f2f2', 'Weiß']];
export const BINDER_COLORS = [['#1c1c1c', 'Schwarz'], ['#b3261e', 'Rot'], ['#1f4fa8', 'Blau'], ['#2f7d4f', 'Grün'], ['#e58fae', 'Rosa'], ['#e8c547', 'Gelb'], ['#f0f0f0', 'Weiß']];
