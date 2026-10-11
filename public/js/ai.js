/* KI-Werkzeuge auf dem Gerät – kein Upload, keine Kosten:
   – Objekt entfernen: MI-GAN (Auffüll-Modell, ONNX Runtime Web)
   – Himmel finden: Bildanalyse (Farbe, Glätte, Verbindung zum oberen Rand) mit Kantenverfeinerung */
import { mk } from './process.js';

const base = new URL('../vendor/', import.meta.url).href;
const MIGAN_PARTS = ['part0', 'part1', 'part2'], MIGAN_SIZE = 28079181;
let ortP = null, miganP = null;

function ort() {
  if (!ortP) ortP = import(base + 'ort/ort.wasm.min.mjs').then(o => { o.env.wasm.wasmPaths = base + 'ort/'; o.env.wasm.numThreads = 1; o.env.wasm.proxy = false; return o; })
    .catch(e => { ortP = null; throw e; });
  return ortP;
}
export function loadInpaint(onProgress) {
  if (!miganP) miganP = (async () => {
    const o = await ort(), bufs = []; let got = 0;
    for (const p of MIGAN_PARTS) {
      const r = await fetch(base + 'migan/migan.onnx.' + p); if (!r.ok) throw new Error('Modell nicht erreichbar');
      const b = new Uint8Array(await r.arrayBuffer()); bufs.push(b); got += b.length; onProgress && onProgress(Math.min(1, got / MIGAN_SIZE));
    }
    const all = new Uint8Array(got); let off = 0; for (const b of bufs) { all.set(b, off); off += b.length; }
    return { o, s: await o.InferenceSession.create(all, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' }) };
  })().catch(e => { miganP = null; throw e; });
  return miganP;
}

/* Modell nach 3 Minuten ohne Benutzung freigeben – spart auf dem iPhone viel Arbeitsspeicher */
let relT = 0;
function scheduleRelease() { clearTimeout(relT); relT = setTimeout(async () => { const p = miganP; miganP = null; try { const m = await p; m && m.s && m.s.release && await m.s.release(); } catch {} }, 180000); }
/* hole: Canvas in Quellgröße (oder kleiner), Alpha > 0 = entfernen.
   Ergebnis: Ausschnitt-Patch (mit weicher Alpha-Kante) und seine Lage in 0..1-Koordinaten */
export async function inpaint(src, hole, onProgress) {
  const W = src.width, H = src.height;
  // Maske in Arbeitsauflösung lesen, Rahmen bestimmen
  const ms = Math.min(1, 1024 / Math.max(W, H)), mw = Math.max(1, Math.round(W * ms)), mh = Math.max(1, Math.round(H * ms));
  const mc = mk(mw, mh), mx = mc.getContext('2d', { willReadFrequently: true }); mx.drawImage(hole, 0, 0, mw, mh);
  const md = mx.getImageData(0, 0, mw, mh).data; let x0 = mw, y0 = mh, x1 = -1, y1 = -1;
  for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) if (md[(y * mw + x) * 4 + 3] > 24) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return null;
  // Umgebung: großzügig um das Objekt, damit das Modell genug Kontext hat
  const bw = (x1 - x0 + 1) / ms, bh = (y1 - y0 + 1) / ms, cxs = (x0 + x1 + 1) / 2 / ms, cys = (y0 + y1 + 1) / 2 / ms;
  let side = Math.max(bw, bh) * 2.3, minSide = Math.min(W, H) * .32; side = Math.max(side, minSide);
  let rw = Math.min(W, Math.max(side, bw * 1.6)), rh = Math.min(H, Math.max(side, bh * 1.6));
  let rx = Math.round(Math.min(Math.max(0, cxs - rw / 2), W - rw)), ry = Math.round(Math.min(Math.max(0, cys - rh / 2), H - rh)); rw = Math.round(rw); rh = Math.round(rh);
  const k = Math.min(1, 512 / Math.max(rw, rh)), tw = Math.max(16, Math.round(rw * k)), th = Math.max(16, Math.round(rh * k));
  // Eingaben fürs Modell
  const ic = mk(tw, th), ix = ic.getContext('2d', { willReadFrequently: true }); ix.imageSmoothingQuality = 'high'; ix.drawImage(src, rx, ry, rw, rh, 0, 0, tw, th);
  const id = ix.getImageData(0, 0, tw, th).data;
  const hc = mk(tw, th), hx = hc.getContext('2d', { willReadFrequently: true }); hx.drawImage(hole, rx * hole.width / W, ry * hole.height / H, rw * hole.width / W, rh * hole.height / H, 0, 0, tw, th);
  const hd = hx.getImageData(0, 0, tw, th).data, n = tw * th, img = new Uint8Array(3 * n), mask = new Uint8Array(n);
  // Loch etwas erweitern: Ränder des Objekts (Schatten, Halo) gehören mit weg
  const grow = Math.max(3, Math.round(Math.max(tw, th) * .018)), holeA = new Uint8Array(n);
  for (let i = 0; i < n; i++) holeA[i] = hd[i * 4 + 3] > 40 ? 1 : 0;
  const dil = dilate(holeA, tw, th, grow);
  for (let i = 0; i < n; i++) { img[i] = id[i * 4]; img[n + i] = id[i * 4 + 1]; img[2 * n + i] = id[i * 4 + 2]; mask[i] = dil[i] ? 0 : 255; }
  const { o, s } = await loadInpaint(onProgress);
  onProgress && onProgress(1, 'run');
  await new Promise(r => setTimeout(r, 30)); // Anzeige aktualisieren lassen
  const res = await s.run({ image: new o.Tensor('uint8', img, [1, 3, th, tw]), mask: new o.Tensor('uint8', mask, [1, 1, th, tw]) });
  const out = res.result, [, , oh, ow] = out.dims, od = out.data;
  // Ergebnis + weiche Alpha-Kante aus dem erweiterten Loch
  const soft = blurA(dil, tw, th, Math.max(1, Math.round(grow * .8)));
  const pc = mk(ow, oh), px = pc.getContext('2d'), pd = px.createImageData(ow, oh), on = ow * oh;
  for (let i = 0; i < on; i++) { const j = i * 4; pd.data[j] = od[i]; pd.data[j + 1] = od[on + i]; pd.data[j + 2] = od[2 * on + i]; pd.data[j + 3] = Math.min(255, soft[i] * 255 * 1.6); }
  px.putImageData(pd, 0, 0);
  // Patch nur so groß wie nötig speichern (Auflösung des Quellausschnitts, höchstens 1024)
  const ps = Math.min(1, 1024 / Math.max(rw, rh)), fw = Math.max(1, Math.round(rw * ps)), fh = Math.max(1, Math.round(rh * ps));
  const fc = mk(fw, fh), fx = fc.getContext('2d'); fx.imageSmoothingQuality = 'high'; fx.drawImage(pc, 0, 0, fw, fh);
  // feines Korn aus der Umgebung, damit die gefüllte Stelle nicht glatter wirkt als das Foto
  scheduleRelease();
  return { x: rx / W, y: ry / H, w: rw / W, h: rh / H, canvas: fc };
}
function dilate(a, w, h, r) {
  const t = new Uint8Array(a.length), o = new Uint8Array(a.length);
  for (let y = 0; y < h; y++) { let last = -1e9; for (let x = 0; x < w; x++) { if (a[y * w + x]) last = x; t[y * w + x] = x - last <= r ? 1 : 0; } last = 1e9; for (let x = w - 1; x >= 0; x--) { if (a[y * w + x]) last = x; if (last - x <= r) t[y * w + x] = 1; } }
  for (let x = 0; x < w; x++) { let last = -1e9; for (let y = 0; y < h; y++) { if (t[y * w + x]) last = y; o[y * w + x] = y - last <= r ? 1 : 0; } last = 1e9; for (let y = h - 1; y >= 0; y--) { if (t[y * w + x]) last = y; if (last - y <= r) o[y * w + x] = 1; } }
  return o;
}
function blurA(a, w, h, r) {
  let f = new Float32Array(a.length); for (let i = 0; i < a.length; i++) f[i] = a[i];
  for (let pass = 0; pass < 2; pass++) {
    const t = new Float32Array(f.length);
    for (let y = 0; y < h; y++) { let s = 0; const row = y * w; for (let x = -r; x <= r; x++) s += f[row + Math.min(w - 1, Math.max(0, x))];
      for (let x = 0; x < w; x++) { t[row + x] = s / (2 * r + 1); s += f[row + Math.min(w - 1, x + r + 1)] - f[row + Math.max(0, x - r)]; } }
    const u = new Float32Array(f.length);
    for (let x = 0; x < w; x++) { let s = 0; for (let y = -r; y <= r; y++) s += t[Math.min(h - 1, Math.max(0, y)) * w + x];
      for (let y = 0; y < h; y++) { u[y * w + x] = s / (2 * r + 1); s += t[Math.min(h - 1, y + r + 1) * w + x] - t[Math.max(0, y - r) * w + x]; } }
    f = u;
  }
  return f;
}

/* ---------- Himmel ---------- */
/* Himmel = glatte, helle/bläuliche (oder Abendrot-)Fläche, die mit dem oberen Bildrand verbunden ist.
   Danach dürfen ähnliche glatte Pixel oberhalb des Horizonts dazukommen (Himmel zwischen Ästen). */
export function skyMask(src) {
  const s = Math.min(1, 360 / Math.max(src.width, src.height)), w = Math.max(8, Math.round(src.width * s)), h = Math.max(8, Math.round(src.height * s)), n = w * h;
  const c = mk(w, h), x = c.getContext('2d', { willReadFrequently: true }); x.imageSmoothingQuality = 'high'; x.drawImage(src, 0, 0, w, h);
  const d = x.getImageData(0, 0, w, h).data, L = new Float32Array(n), R = new Float32Array(n), G = new Float32Array(n), B = new Float32Array(n);
  for (let i = 0; i < n; i++) { R[i] = d[i * 4] / 255; G[i] = d[i * 4 + 1] / 255; B[i] = d[i * 4 + 2] / 255; L[i] = .2126 * R[i] + .7152 * G[i] + .0722 * B[i]; }
  // Kantenstärke (Sobel auf Luminanz), leicht geglättet
  const grad = new Float32Array(n);
  for (let y = 1; y < h - 1; y++) for (let xx = 1; xx < w - 1; xx++) { const i = y * w + xx;
    const gx = L[i - w + 1] + 2 * L[i + 1] + L[i + w + 1] - L[i - w - 1] - 2 * L[i - 1] - L[i + w - 1], gy = L[i + w - 1] + 2 * L[i + w] + L[i + w + 1] - L[i - w - 1] - 2 * L[i - w] - L[i - w + 1]; grad[i] = Math.hypot(gx, gy); }
  const gs = blurA(grad, w, h, 1);
  const skyish = i => { const r = R[i], g = G[i], b = B[i], l = L[i], mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    const blue = b > r * .95 && b >= g * .9 && l > .25, grey = mx - mn < .12 && l > .5, warm = r > b && l > .35 && (r - b) > .08; // Abendhimmel
    return (blue || grey || warm || l > .18) && gs[i] < .16; }; // auch Dämmerung und bunte Abendhimmel
  const sky = new Uint8Array(n), q = [];
  for (let xx = 0; xx < w; xx++) for (let y = 0; y < Math.max(2, Math.round(h * .04)); y++) { const i = y * w + xx; if (skyish(i) && !sky[i]) { sky[i] = 1; q.push(i); } }
  if (!q.length) return null;
  // Flutfüllung mit lokaler Farbähnlichkeit
  while (q.length) { const i = q.pop(), y = (i / w) | 0, xx = i - y * w;
    for (const j of [xx > 0 ? i - 1 : -1, xx < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) {
      if (j < 0 || sky[j]) continue; const dc = Math.abs(R[j] - R[i]) + Math.abs(G[j] - G[i]) + Math.abs(B[j] - B[i]);
      if (dc < .11 && gs[j] < .24) { sky[j] = 1; q.push(j); } } }
  let cnt = 0, mr = 0, mg = 0, mb = 0, maxRow = 0;
  for (let i = 0; i < n; i++) if (sky[i]) { cnt++; mr += R[i]; mg += G[i]; mb += B[i]; const y = (i / w) | 0; if (y > maxRow) maxRow = y; }
  if (cnt < n * .02) return null;
  mr /= cnt; mg /= cnt; mb /= cnt;
  // Lücken (Wolken, Himmel zwischen Ästen): Farbe ähnlich dem Himmel derselben Zeile, nur oberhalb des tiefsten Himmelpunkts
  for (let y = 0; y <= maxRow; y++) { let n = 0, rr = 0, gg = 0, bb = 0; for (let xx = 0; xx < w; xx++) { const i = y * w + xx; if (sky[i]) { n++; rr += R[i]; gg += G[i]; bb += B[i]; } }
    if (n < w * .05) { rr = mr; gg = mg; bb = mb; } else { rr /= n; gg /= n; bb /= n; }
    for (let xx = 0; xx < w; xx++) { const i = y * w + xx; if (sky[i]) continue;
      if (Math.abs(R[i] - rr) + Math.abs(G[i] - gg) + Math.abs(B[i] - bb) < .2 && gs[i] < .2) sky[i] = 1; } }
  // weiche Kante, an Bildkanten ausgerichtet
  let a = blurA(sky, w, h, 1);
  a = guided(a, L, w, h, 3, .002);
  const out = new Float32Array(n); for (let i = 0; i < n; i++) out[i] = Math.min(1, Math.max(0, (a[i] - .15) / .7));
  return { w, h, data: out };
}
/* Graustufen-Guided-Filter (He et al.) */
function guided(p, I, w, h, r, eps) {
  const box = a => blurOnce(a, w, h, r), n = w * h, Ip = new Float32Array(n), II = new Float32Array(n);
  for (let i = 0; i < n; i++) { Ip[i] = I[i] * p[i]; II[i] = I[i] * I[i]; }
  const mI = box(I), mp = box(p), mIp = box(Ip), mII = box(II), A = new Float32Array(n), Bv = new Float32Array(n);
  for (let i = 0; i < n; i++) { const cov = mIp[i] - mI[i] * mp[i], v = mII[i] - mI[i] * mI[i]; A[i] = cov / (v + eps); Bv[i] = mp[i] - A[i] * mI[i]; }
  const mA = box(A), mB = box(Bv), q = new Float32Array(n); for (let i = 0; i < n; i++) q[i] = mA[i] * I[i] + mB[i];
  return q;
}
function blurOnce(f, w, h, r) {
  const t = new Float32Array(f.length), u = new Float32Array(f.length);
  for (let y = 0; y < h; y++) { let s = 0; const row = y * w; for (let x = -r; x <= r; x++) s += f[row + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) { t[row + x] = s / (2 * r + 1); s += f[row + Math.min(w - 1, x + r + 1)] - f[row + Math.max(0, x - r)]; } }
  for (let x = 0; x < w; x++) { let s = 0; for (let y = -r; y <= r; y++) s += t[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) { u[y * w + x] = s / (2 * r + 1); s += t[Math.min(h - 1, y + r + 1) * w + x] - t[Math.max(0, y - r) * w + x]; } }
  return u;
}
