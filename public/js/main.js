/* Streifzug – Oberfläche, Gesten, Werkzeuge, Export */
import { $, clamp, clone, de, esc, state, ui, sources, cache, ids, newId, dims, selLayer, toast, defParams, upgradeParams,
  FORMATS, HSL_BANDS, LOOKS, LOOK_CATS, FONTS, TEXT_COLORS, BG_COLORS, FRAME_COLORS, RATIOS, ID_CURVE, BLENDS, STAMP_COLORS } from './core.js';
import { mk, makeAux, processImage, prepare, curveFn, pickHealSource, wbFromPoint, LEAKS } from './process.js';
import { flags, loadScaled, orientCanvas, cropAspect, cropRect, boxOf, drawScene, ensureCache, releaseAux, drawSample, SHAPES, BG_PATTERNS, FRAMES } from './scene.js';
import { newImageLayer, newTextLayer, newShapeLayer, coverSlide, coverAll } from './layers.js';
import { TEMPLATES, miniSVG, applyTemplate } from './templates.js';
import * as store from './store.js';

const PREVIEW_PX = 1200; // Vorschau-Auflösung (Export rechnet mit voller Auflösung)

/* ---------- Bühne ---------- */
const stage = $('#stage'), cv = $('#cv'), ctx = cv.getContext('2d');
const view = { s: .2, ox: 20, oy: 20 };
const css = getComputedStyle(document.documentElement);
const COL = { stage: css.getPropertyValue('--stage').trim(), accent: css.getPropertyValue('--accent').trim(), muted: css.getPropertyValue('--muted').trim(), fg: css.getPropertyValue('--fg').trim() };
let needRender = false;
function requestRender() { if (!needRender) { needRender = true; requestAnimationFrame(() => { needRender = false; render(); }); } }
function fit() {
  const sw = stage.clientWidth, sh = stage.clientHeight, { W, H } = dims(), T = W * state.slides, pad = 16;
  let s = (sh - 52) / H; if (W * s > sw - 2 * pad) s = (sw - 2 * pad) / W;
  view.s = Math.max(.02, s); view.oy = (sh - H * view.s) / 2 - 8;
  view.ox = T * view.s < sw - 2 * pad ? (sw - T * view.s) / 2 : pad;
}
function clampView() {
  const sw = stage.clientWidth, sh = stage.clientHeight, { W, H } = dims(), T = W * state.slides * view.s, Hs = H * view.s, pad = 16;
  if (T < sw - 2 * pad) view.ox = (sw - T) / 2; else view.ox = clamp(view.ox, sw - pad - T, pad);
  if (Hs < sh - 40) view.oy = clamp(view.oy, 8, sh - Hs - 32); else view.oy = clamp(view.oy, sh - 32 - Hs, 8);
}
function resize() {
  const dpr = Math.min(3, devicePixelRatio || 1);
  cv.width = Math.round(stage.clientWidth * dpr); cv.height = Math.round(stage.clientHeight * dpr);
  fit(); render();
}
function visibleSlide() { const { W } = dims(), cx = (stage.clientWidth / 2 - view.ox) / view.s; return clamp(Math.floor(cx / W), 0, state.slides - 1); }

function render() {
  const dpr = cv.width / Math.max(1, stage.clientWidth), { W, H } = dims(), T = W * state.slides, s = view.s;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = COL.stage; ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * view.ox, dpr * view.oy);
  ctx.save(); ctx.beginPath(); ctx.rect(0, 0, T, H); ctx.clip(); drawScene(ctx); ctx.restore();
  ctx.lineWidth = 1 / s; ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.setLineDash([6 / s, 6 / s]);
  for (let i = 1; i < state.slides; i++) { ctx.beginPath(); ctx.moveTo(i * W, 0); ctx.lineTo(i * W, H); ctx.stroke(); }
  ctx.setLineDash([]); ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.strokeRect(0, 0, T, H);
  if (ui.grid) { ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1 / s; ctx.beginPath(); for (let i = 0; i < state.slides; i++) for (const f of [1 / 3, 2 / 3]) { ctx.moveTo(i * W + f * W, 0); ctx.lineTo(i * W + f * W, H); } for (const f of [1 / 3, 2 / 3]) { ctx.moveTo(0, f * H); ctx.lineTo(T, f * H); } ctx.stroke(); }
  ctx.fillStyle = COL.muted; ctx.font = `500 ${12 / s}px "JetBrains Mono", monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  for (let i = 0; i < state.slides; i++) ctx.fillText(String(i + 1), (i + .5) * W, H + 8 / s);
  ctx.strokeStyle = COL.accent; ctx.lineWidth = 1 / s;
  for (const g of ui.guides) { ctx.beginPath(); if (g.x != null) { ctx.moveTo(g.x, -20 / s); ctx.lineTo(g.x, H + 20 / s); } else { ctx.moveTo(-20 / s, g.y); ctx.lineTo(T + 20 / s, g.y); } ctx.stroke(); }
  const l = selLayer();
  if (l) {
    const b = boxOf(l), tool = activeTool();
    ctx.save(); ctx.translate(l.x, l.y); ctx.rotate(l.rot * Math.PI / 180);
    ctx.lineWidth = 2 / s; ctx.strokeStyle = tool ? 'rgba(255,255,255,.35)' : COL.accent; ctx.strokeRect(-b.ow / 2, -b.oh / 2, b.ow, b.oh);
    if (!tool && !l.locked) { const r = 11 / s; ctx.fillStyle = COL.accent; ctx.beginPath(); ctx.arc(b.ow / 2, -b.oh / 2, r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#1d1704'; ctx.lineWidth = 1.8 / s; ctx.beginPath(); ctx.arc(b.ow / 2, -b.oh / 2, r * .48, -.4, Math.PI * 1.25); ctx.stroke(); }
    if (tool) drawToolOverlay(l, b);
    ctx.restore();
  }
  if (flags.histDirty) { flags.histDirty = false; drawHist(); }
  if (flags.pending) { flags.pending = false; setTimeout(requestRender, 40); }
}

/* ---------- Koordinaten Bild <-> Welt ---------- */
function toCanvas(e) { const r = cv.getBoundingClientRect(); const sx = e.clientX - r.left, sy = e.clientY - r.top; return { sx, sy, x: (sx - view.ox) / view.s, y: (sy - view.oy) / view.s }; }
function toLocal(l, p) { const a = -l.rot * Math.PI / 180, dx = p.x - l.x, dy = p.y - l.y; return { x: dx * Math.cos(a) - dy * Math.sin(a), y: dx * Math.sin(a) + dy * Math.cos(a) }; }
function imgGeom(l) { const c = ensureCache(l); if (!c) return null; const iw = c.prep.width, ih = c.prep.height, bx = boxOf(l), [sx, sy, sw, sh] = cropRect(iw, ih, l); return { c, iw, ih, bx, sx, sy, sw, sh, k: bx.w / sw, M: Math.max(iw, ih) }; }
function imgPt(l, p) {
  const G = imgGeom(l); if (!G) return null; const q = toLocal(l, p), fx = (q.x + G.bx.w / 2) / G.bx.w, fy = (q.y - G.bx.iy + G.bx.h / 2) / G.bx.h;
  return { u: (G.sx + fx * G.sw) / G.iw, v: (G.sy + fy * G.sh) / G.ih, inside: fx >= 0 && fx <= 1 && fy >= 0 && fy <= 1, G };
}
/* lokale (Ebenen-)Koordinaten eines Bildpunkts */
const localOf = (G, u, v) => ({ x: (u * G.iw - G.sx) * G.k - G.bx.w / 2, y: (v * G.ih - G.sy) * G.k - G.bx.h / 2 + G.bx.iy });

/* ---------- Werkzeuge ---------- */
const TOOL_OF_TAB = { selektiv: 'mask', pinsel: 'brush', reparieren: 'heal', fokus: 'focus', zuschnitt: 'crop' };
function activeTool() { const l = selLayer(); if (!l || l.type !== 'image') return null; if (ui.pick) return 'wb'; return TOOL_OF_TAB[ui.tab.image] || null; }
function drawToolOverlay(l) {
  const tool = activeTool(), G = imgGeom(l); if (!G) return; const s = view.s, p = l.params;
  ctx.save(); ctx.beginPath(); ctx.rect(-G.bx.w / 2, -G.bx.h / 2 + G.bx.iy, G.bx.w, G.bx.h); ctx.clip();
  const pin = (P, on) => { ctx.beginPath(); ctx.arc(P.x, P.y, 12 / s, 0, Math.PI * 2); ctx.fillStyle = on ? COL.accent : '#fff'; ctx.fill(); ctx.lineWidth = 2.5 / s; ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.stroke(); };
  const ring = (P, rx, ry, a, dash) => { ctx.save(); ctx.translate(P.x, P.y); ctx.rotate(a); ctx.beginPath(); ctx.ellipse(0, 0, Math.max(1, rx), Math.max(1, ry), 0, 0, Math.PI * 2); ctx.restore(); ctx.setLineDash(dash ? [8 / s, 6 / s] : []); ctx.lineWidth = 2 / s; ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.stroke(); ctx.setLineDash([]); };
  const line = (P, a, off, dash) => { const L = 4000, nx = Math.cos(a), ny = Math.sin(a), tx = -ny, ty = nx; ctx.beginPath(); ctx.moveTo(P.x + nx * off - tx * L, P.y + ny * off - ty * L); ctx.lineTo(P.x + nx * off + tx * L, P.y + ny * off + ty * L); ctx.setLineDash(dash ? [8 / s, 6 / s] : []); ctx.lineWidth = 2 / s; ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.stroke(); ctx.setLineDash([]); };
  const R = v => v * G.M * G.k;
  if (tool === 'mask') p.masks.forEach((m, i) => { const P = localOf(G, m.x, m.y);
    if (i === ui.maskSel) { if (m.kind === 'linear') { line(P, m.angle, 0, false); line(P, m.angle, -R(m.rx) * m.feather, true); line(P, m.angle, R(m.rx) * m.feather, true); } else { ring(P, R(m.rx), R(m.ry), m.angle, false); ring(P, R(m.rx) * (1 - m.feather), R(m.ry) * (1 - m.feather), m.angle, true); } }
    pin(P, i === ui.maskSel); });
  else if (tool === 'focus' && p.blur.mode !== 'off') { const b = p.blur, P = localOf(G, b.x, b.y);
    if (b.mode === 'radial') { ring(P, R(b.size), R(b.size), 0, false); ring(P, R(b.size + b.feather), R(b.size + b.feather), 0, true); }
    else { const a = b.angle + Math.PI / 2; line(P, a, -R(b.size), false); line(P, a, R(b.size), false); line(P, a, -R(b.size + b.feather), true); line(P, a, R(b.size + b.feather), true); }
    pin(P, true); }
  else if (tool === 'heal') p.heal.forEach(h => { const P = localOf(G, h.x, h.y); ring(P, R(h.r), R(h.r), 0, true); });
  else if (tool === 'brush' && ui.cursor) { const P = localOf(G, ui.cursor.u, ui.cursor.v); ring(P, R(ui.brushSize / 100), R(ui.brushSize / 100), 0, false); }
  ctx.restore();
}

/* ---------- Gesten ---------- */
const ptrs = new Map(); let gest = null;
function hitTest(p) { for (let i = state.layers.length - 1; i >= 0; i--) { const l = state.layers[i]; if (l.hidden || l.locked) continue; const b = boxOf(l), q = toLocal(l, p); if (Math.abs(q.x) <= b.ow / 2 && Math.abs(q.y) <= b.oh / 2) return l; } return null; }
function hitHandle(l, p) { if (l.locked) return false; const b = boxOf(l), q = toLocal(l, p), r = 24 / view.s; return Math.hypot(q.x - b.ow / 2, q.y + b.oh / 2) < r; }
function sizeOf(l) { return l.type === 'text' ? l.size : l.w; }
function setSize(l, v) { if (l.type === 'text') l.size = clamp(v, 12, 900); else if (l.type === 'shape') { const f = clamp(v, 20, 30000) / l.w; l.w *= f; if (l.kind !== 'line') l.h *= f; } else l.w = clamp(v, 40, 30000); }
function snapMove(l, nx, ny) {
  const { W, H } = dims(), T = W * state.slides, b = boxOf(l), th = 10 / view.s, guides = [];
  const xs = [T / 2]; for (let i = 0; i <= state.slides; i++) xs.push(i * W); for (let i = 0; i < state.slides; i++) xs.push((i + .5) * W);
  const straight = Math.abs(((l.rot % 360) + 360) % 360) < .01;
  for (const o of state.layers) if (o !== l && !o.hidden && Math.abs(((o.rot % 360) + 360) % 360) < .01) { const ob = boxOf(o); xs.push(o.x - ob.ow / 2, o.x + ob.ow / 2); }
  const cand = straight ? [[0, nx], [-b.ow / 2, nx - b.ow / 2], [b.ow / 2, nx + b.ow / 2]] : [[0, nx]];
  let best = null; for (const [off, v] of cand) for (const t of xs) { const d = Math.abs(v - t); if (d < th && (!best || d < best.d)) best = { d, x: t - off, g: t }; }
  if (best) { nx = best.x; guides.push({ x: best.g }); }
  const ys = [H / 2, 0, H]; const cy = straight ? [[0, ny], [-b.oh / 2, ny - b.oh / 2], [b.oh / 2, ny + b.oh / 2]] : [[0, ny]];
  let by = null; for (const [off, v] of cy) for (const t of ys) { const d = Math.abs(v - t); if (d < th && (!by || d < by.d)) by = { d, y: t - off, g: t }; }
  if (by) { ny = by.y; guides.push({ y: by.g }); }
  ui.guides = guides; return [nx, ny];
}
function startTool(tool, l, p) {
  const ip = imgPt(l, p); if (!ip) return null; const P = l.params, G = ip.G;
  const near = (u, v) => { const L = localOf(G, u, v), q = toLocal(l, p); return Math.hypot(L.x - q.x, L.y - q.y) * view.s < 26; };
  if (tool === 'wb') { if (!ip.inside) return null; const r = wbFromPoint(G.c.prep, ip.u, ip.v); P.temp = r.temp; P.tint = r.tint; ui.pick = false; toast('Weißabgleich gesetzt'); commit(); return { mode: 'tap' }; }
  if (tool === 'mask') {
    const hit = P.masks.findIndex(m => near(m.x, m.y));
    if (hit >= 0) { ui.maskSel = hit; renderPanel(); return { mode: 'pinDrag', get: () => P.masks[hit], du: 0, dv: 0, l }; }
    if (!ip.inside) return null;
    P.masks.push({ kind: 'radial', x: ip.u, y: ip.v, rx: .16, ry: .16, angle: 0, feather: .6, inv: false, ex: .5, co: 0, sat: 0, temp: 0, st: 0 });
    ui.maskSel = P.masks.length - 1; renderPanel(); toast('Punkt gesetzt – Regler unten anpassen');
    return { mode: 'pinDrag', get: () => P.masks[ui.maskSel], l, moved: true };
  }
  if (tool === 'focus') {
    if (P.blur.mode === 'off') { P.blur.mode = 'radial'; P.blur.x = ip.u; P.blur.y = ip.v; renderPanel(); }
    return { mode: 'pinDrag', get: () => P.blur, l, moved: true, du: P.blur.x - ip.u, dv: P.blur.y - ip.v };
  }
  if (tool === 'heal') {
    if (!ip.inside) return null;
    const r = ui.healSize / 100, src = pickHealSource(G.c.prep, ip.u, ip.v, r);
    P.heal.push({ x: +ip.u.toFixed(4), y: +ip.v.toFixed(4), r, sx: +src.sx.toFixed(4), sy: +src.sy.toFixed(4) }); commit(); return { mode: 'tap' };
  }
  if (tool === 'brush') {
    if (!ip.inside) return null;
    const st = { m: ui.brushMode, s: ui.brushSize / 100, k: ui.brushStrength / 100, p: [+ip.u.toFixed(4), +ip.v.toFixed(4)] };
    P.brush.push(st); ui.cursor = { u: ip.u, v: ip.v }; flags.throttle = 120;
    return { mode: 'brush', st, l, moved: true };
  }
  if (tool === 'crop') { if (!ip.inside) return null; return { mode: 'crop', l, q0: toLocal(l, p), px0: l.crop.px, py0: l.crop.py, G, moved: false }; }
  return null;
}
cv.addEventListener('pointerdown', e => {
  cv.setPointerCapture(e.pointerId); const p = toCanvas(e); ptrs.set(e.pointerId, p);
  if (ptrs.size === 1) {
    const l = selLayer(), tool = activeTool();
    if (tool) { const g = startTool(tool, l, p); if (g) { gest = g; requestRender(); return; } }
    if (l && !tool && hitHandle(l, p)) { gest = { mode: 'handle', l, d0: Math.hypot(p.x - l.x, p.y - l.y), a0: Math.atan2(p.y - l.y, p.x - l.x), size0: sizeOf(l), rot0: l.rot, moved: false }; }
    else {
      const hit = hitTest(p);
      if (hit && !(tool && hit !== l)) { if (ui.sel !== hit.id) selectLayer(hit.id); gest = { mode: 'move', l: hit, dx: p.x - hit.x, dy: p.y - hit.y, moved: false }; }
      else gest = { mode: 'pan', sx: p.sx, sy: p.sy, ox: view.ox, oy: view.oy, moved: false };
    }
    requestRender();
  } else if (ptrs.size === 2) {
    const [a, b] = [...ptrs.values()];
    const mid = { sx: (a.sx + b.sx) / 2, sy: (a.sy + b.sy) / 2 }, dist = Math.hypot(a.sx - b.sx, a.sy - b.sy), ang = Math.atan2(b.sy - a.sy, b.sx - a.sx);
    if (gest && gest.mode === 'brush') { const arr = gest.l.params.brush; if (arr[arr.length - 1] === gest.st && gest.st.p.length < 8) arr.pop(); flags.throttle = 0; }
    if (gest && gest.mode === 'crop') gest = { mode: 'pinchCrop', l: gest.l, dist, z0: gest.l.crop.zoom, moved: true };
    else if (gest && gest.mode === 'pinDrag' && gest.get() && gest.get().rx != null) { const m = gest.get(); gest = { mode: 'pinchPin', m, dist, ang, rx0: m.rx, ry0: m.ry, a0: m.angle || 0, moved: true }; }
    else if (gest && (gest.mode === 'move' || gest.mode === 'handle') && gest.l) gest = { mode: 'pinchLayer', l: gest.l, dist, ang, size0: sizeOf(gest.l), rot0: gest.l.rot, moved: true };
    else gest = { mode: 'pinchView', dist, s0: view.s, mid, ox: view.ox, oy: view.oy, moved: true };
  }
});
cv.addEventListener('pointermove', e => {
  const p = toCanvas(e);
  if (!ptrs.has(e.pointerId) || !gest) { if (activeTool() === 'brush' && e.pointerType === 'mouse') { const ip = imgPt(selLayer(), p); if (ip) { ui.cursor = { u: ip.u, v: ip.v }; requestRender(); } } return; }
  const prev = ptrs.get(e.pointerId); ptrs.set(e.pointerId, p);
  if (Math.abs(p.sx - prev.sx) + Math.abs(p.sy - prev.sy) > 0) gest.moved = gest.moved || Math.hypot(p.sx - (gest.sx ?? prev.sx), p.sy - (gest.sy ?? prev.sy)) > 3 || gest.mode !== 'pan';
  const m = gest.mode;
  if (m === 'move') { if (gest.l.locked) return; const [nx, ny] = snapMove(gest.l, p.x - gest.dx, p.y - gest.dy); gest.l.x = nx; gest.l.y = ny; }
  else if (m === 'handle') { const l = gest.l, d = Math.hypot(p.x - l.x, p.y - l.y), a = Math.atan2(p.y - l.y, p.x - l.x);
    setSize(l, gest.size0 * d / gest.d0); let r = gest.rot0 + (a - gest.a0) * 180 / Math.PI; r = ((r + 540) % 360) - 180;
    for (const t of [-180, -90, 0, 90, 180]) if (Math.abs(r - t) < 3) r = t; l.rot = r; }
  else if (m === 'pan') { if (gest.moved) { view.ox = gest.ox + (p.sx - gest.sx); view.oy = gest.oy + (p.sy - gest.sy); clampView(); } }
  else if (m === 'pinDrag') { const ip = imgPt(gest.l, p), t = gest.get(); if (ip && t) { t.x = clamp(ip.u + (gest.du || 0)); t.y = clamp(ip.v + (gest.dv || 0)); } }
  else if (m === 'brush') { const ip = imgPt(gest.l, p); if (ip) { const a = gest.st.p, lu = a[a.length - 2], lv = a[a.length - 1]; ui.cursor = { u: ip.u, v: ip.v };
      if (Math.hypot(ip.u - lu, ip.v - lv) > gest.st.s * .15) a.push(+ip.u.toFixed(4), +ip.v.toFixed(4)); } }
  else if (m === 'crop') { const l = gest.l, q = toLocal(l, p), G = gest.G, dxImg = (q.x - gest.q0.x) / G.k, dyImg = (q.y - gest.q0.y) / G.k;
    if (G.iw - G.sw > 1) l.crop.px = clamp(gest.px0 - dxImg / (G.iw - G.sw)); if (G.ih - G.sh > 1) l.crop.py = clamp(gest.py0 - dyImg / (G.ih - G.sh)); }
  else if (ptrs.size === 2) {
    const [a, b] = [...ptrs.values()]; const dist = Math.hypot(a.sx - b.sx, a.sy - b.sy), ang = Math.atan2(b.sy - a.sy, b.sx - a.sx);
    if (m === 'pinchLayer') { setSize(gest.l, gest.size0 * dist / gest.dist); let r = gest.rot0 + (ang - gest.ang) * 180 / Math.PI; r = ((r + 540) % 360) - 180; for (const t of [-90, 0, 90]) if (Math.abs(r - t) < 3) r = t; gest.l.rot = r; }
    else if (m === 'pinchCrop') gest.l.crop.zoom = clamp(gest.z0 * dist / gest.dist, 1, 4);
    else if (m === 'pinchPin') { const f = dist / gest.dist; gest.m.rx = clamp(gest.rx0 * f, .01, 1.5); if (gest.ry0 != null) gest.m.ry = clamp(gest.ry0 * f, .01, 1.5); if (gest.m.angle != null) gest.m.angle = gest.a0 + (ang - gest.ang); }
    else if (m === 'pinchView') { const ns = clamp(gest.s0 * dist / gest.dist, .03, 3), cx = (gest.mid.sx - gest.ox) / gest.s0, cy = (gest.mid.sy - gest.oy) / gest.s0; view.s = ns; view.ox = gest.mid.sx - cx * ns; view.oy = gest.mid.sy - cy * ns; clampView(); }
  }
  requestRender();
});
function endPtr(e) {
  if (!ptrs.has(e.pointerId)) return; ptrs.delete(e.pointerId);
  if (ptrs.size > 0) { if (gest && /^pinch(Layer|Crop|Pin)$/.test(gest.mode)) gest = { mode: 'none', l: gest.l, moved: true }; return; }
  const g = gest; gest = null; ui.guides = []; flags.throttle = 0;
  if (g) {
    if (g.mode === 'pan' && !g.moved && ui.sel && !activeTool()) selectLayer(null);
    else if (g.mode === 'brush' || g.mode === 'pinDrag' || g.mode === 'crop' || g.mode === 'none' || g.mode === 'pinchPin' || g.mode === 'pinchCrop') { pushHistory(); syncPanelValues(); }
    else if (g.l && g.moved) { pushHistory(); syncPanelValues(); }
  }
  if (e.pointerType !== 'mouse') ui.cursor = null;
  requestRender();
}
cv.addEventListener('pointerup', endPtr); cv.addEventListener('pointercancel', endPtr);
cv.addEventListener('dblclick', e => { const p = toCanvas(e); if (!hitTest(p)) { fit(); requestRender(); } });
cv.addEventListener('wheel', e => { e.preventDefault(); const p = toCanvas(e);
  if (e.ctrlKey) { const ns = clamp(view.s * Math.exp(-e.deltaY * .01), .03, 3); view.ox = p.sx - p.x * ns; view.oy = p.sy - p.y * ns; view.s = ns; }
  else { view.ox -= e.deltaX || e.deltaY; } clampView(); requestRender(); }, { passive: false });

function selectLayer(id) {
  if (ui.sel && ui.sel !== id) releaseAux(ui.sel);
  ui.sel = id; ui.pick = false; ui.maskSel = 0; renderUI();
}

/* ---------- Verlauf & automatisches Speichern ---------- */
let hist = [], hIdx = -1;
const snap = () => JSON.stringify({ format: state.format, slides: state.slides, bg: state.bg, layers: state.layers });
function pushHistory() { const s = snap(); if (hist[hIdx] === s) return; hist = hist.slice(0, hIdx + 1); hist.push(s); if (hist.length > 60) hist.shift(); hIdx = hist.length - 1; updateTop(); scheduleSave(); }
function restore(s) {
  const o = JSON.parse(s); state.format = o.format; state.slides = o.slides; state.bg = o.bg; state.layers = o.layers;
  ids.n = Math.max(ids.n, ...state.layers.map(l => l.id + 1), 1);
  if (!selLayer()) ui.sel = null; fit(); renderUI(); requestRender(); scheduleSave();
}
function undo() { if (hIdx > 0) { hIdx--; restore(hist[hIdx]); } }
function redo() { if (hIdx < hist.length - 1) { hIdx++; restore(hist[hIdx]); } }

let saveT = null, savedSrc = new Set(), saveChain = Promise.resolve();
function scheduleSave() { if (ui.sample) return; clearTimeout(saveT); saveT = setTimeout(() => { saveT = null; saveNow(); }, 1200); }
function saveNow() {
  if (ui.sample) return saveChain;
  saveChain = saveChain.then(async () => {
    if (!ui.projectId) { ui.projectId = store.newProjectId(); savedSrc = new Set(); store.lastProject(ui.projectId); store.persist(); }
    const id = ui.projectId, used = new Set(state.layers.filter(l => l.type === 'image').map(l => l.srcId));
    const files = [...used].filter(s => !savedSrc.has(s) && sources.get(s)?.kind === 'file').map(s => ({ srcId: s, blob: sources.get(s).file, date: sources.get(s).date }));
    const thumb = await makeThumb();
    await store.saveProject({ id, name: ui.projectName, updated: Date.now(), doc: { format: state.format, slides: state.slides, bg: state.bg, layers: state.layers }, thumb }, files);
    files.forEach(f => savedSrc.add(f.srcId));
    await store.pruneFiles(id, used); savedSrc = new Set([...savedSrc].filter(s => used.has(s)));
  }).catch(err => { console.warn(err); toast('Speichern hat nicht geklappt – ist der Speicher voll?'); });
  return saveChain;
}
async function makeThumb() {
  const { W, H } = dims(), T = W * state.slides, s = 240 / H, c = mk(Math.min(T * s, 1600), 240), x = c.getContext('2d');
  x.scale(c.width / T, 240 / H); drawScene(x);
  return new Promise(r => c.toBlob(r, 'image/jpeg', .72));
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && saveT) { clearTimeout(saveT); saveT = null; saveNow(); } });

/* ---------- Oberfläche ---------- */
const panel = $('#panel'), tabs = $('#tabs'), head = $('#panelHead');
const mode = () => { const l = selLayer(); return l ? l.type : 'none'; };
function updateTop() {
  $('#undoBtn').disabled = hIdx <= 0; $('#redoBtn').disabled = hIdx >= hist.length - 1;
  $('#fmtTag').textContent = `${state.format} · ${state.slides} ${state.slides === 1 ? 'Slide' : 'Slides'}`;
  const tool = activeTool(), l = selLayer();
  $('#stageHint').textContent = tool === 'mask' ? 'Tippe ins Foto für einen neuen Punkt · Punkt ziehen verschiebt · zwei Finger: Größe & Drehung'
    : tool === 'brush' ? `Mit dem Finger malen: ${BRUSH_MODES.find(b => b[0] === ui.brushMode)[1]} · zwei Finger: Ansicht verschieben`
    : tool === 'heal' ? 'Tippe auf Flecken, Fussel oder störende Punkte'
    : tool === 'focus' ? 'Ziehen verschiebt den Schärfebereich' : tool === 'crop' ? 'Im Foto ziehen verschiebt den Ausschnitt · zwei Finger zoomen'
    : tool === 'wb' ? 'Tippe auf etwas, das weiß oder grau sein sollte'
    : state.layers.length ? (l ? (l.locked ? 'Ebene ist gesperrt – entsperren unter „Ebenen“' : 'Ziehen verschiebt · Eck-Griff skaliert und dreht · zwei Finger: Zoom') : 'Antippen zum Bearbeiten · leere Fläche ziehen zum Scrollen') : 'Füge Fotos hinzu – sie dürfen über die Slide-Grenzen ragen.';
}
function renderUI() { renderTabs(); renderHead(); renderPanel(); updateTop(); requestRender(); }
const TABSETS = {
  none: [['canvas', 'Leinwand'], ['vorlagen', 'Vorlagen'], ['ebenen', 'Ebenen'], ['addPhoto', '<b>+</b>Foto'], ['addCam', '<b>+</b>Kamera'], ['addText', '<b>+</b>Text'], ['element', '<b>+</b>Element']],
  image: [['looks', 'Looks'], ['anpassen', 'Anpassen'], ['licht', 'Licht'], ['farbe', 'Farbe'], ['grading', 'Color Grading'], ['kurve', 'Kurve'], ['details', 'Details'], ['effekte', 'Effekte'], ['stempel', 'Stempel'],
    ['selektiv', 'Selektiv'], ['pinsel', 'Pinsel'], ['reparieren', 'Reparieren'], ['fokus', 'Fokus'], ['zuschnitt', 'Zuschnitt'], ['ebene', 'Ebene']],
  text: [['text', 'Text'], ['stil', 'Stil'], ['ebene', 'Ebene']],
  shape: [['form', 'Form'], ['ebene', 'Ebene']]
};
function renderTabs() {
  const m = mode();
  tabs.innerHTML = TABSETS[m].map(([k, lab]) => k === 'addPhoto' ? `<label class="tab add" for="fileIn" role="button" tabindex="0">${lab}</label>`
    : k === 'addCam' ? `<label class="tab add" for="camIn" role="button" tabindex="0">${lab}</label>`
    : `<button class="tab${k.startsWith('add') || k === 'element' ? ' add' : ''}" role="tab" data-tab="${k}" aria-selected="${ui.tab[m] === k}">${lab}</button>`).join('');
  const on = tabs.querySelector('[aria-selected="true"]'); if (on) on.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}
tabs.addEventListener('click', e => {
  const b = e.target.closest('[data-tab]'); if (!b) return; const k = b.dataset.tab;
  if (k === 'addText') { const { W, H } = dims(); const l = newTextLayer((visibleSlide() + .5) * W, H * .5); state.layers.push(l); ui.tab.text = 'text'; selectLayer(l.id); pushHistory(); setTimeout(() => $('#txtIn')?.select(), 50); return; }
  ui.tab[mode()] = k; ui.pick = false; renderTabs(); renderHead(); renderPanel(); updateTop(); requestRender();
});
tabs.addEventListener('keydown', e => { const lb = e.target.closest('label[for]'); if ((e.key === 'Enter' || e.key === ' ') && lb) { e.preventDefault(); $('#' + lb.htmlFor).click(); } });
$('#fileIn').addEventListener('change', e => { const f = [...e.target.files]; e.target.value = ''; if (ui.replaceId) { replacePhoto(f[0]); } else addFiles(f); });
$('#camIn').addEventListener('change', e => { const f = [...e.target.files]; e.target.value = ''; addFiles(f); });

function renderHead() {
  const m = mode(), l = selLayer();
  if (m === 'none') { head.innerHTML = `<span class="hint">${state.layers.length ? 'Tippe ein Foto, einen Text oder ein Element an.' : 'Noch leer. Starte mit „+ Foto“ oder einer Vorlage.'}</span>`; return; }
  if (m === 'text' || m === 'shape') { head.innerHTML = `<span class="title">${m === 'text' ? 'Text' : 'Element'}</span><button class="btn primary small icon" data-act="done" aria-label="Fertig" title="Fertig"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5 9-10"/></svg></button>`; return; }
  const n = state.layers.filter(x => x.type === 'image').indexOf(l) + 1;
  head.innerHTML = `<span class="title">Foto ${n}</span>
    <button class="btn ghost small" data-act="before" aria-label="Vorher anzeigen, gedrückt halten" title="Gedrückt halten: Vorher">Vorher</button>
    <button class="btn ghost small${l.params.auto ? ' on' : ''}" data-act="auto" title="Automatisch verbessern">Auto</button>
    <button class="btn ghost small icon" data-act="reset" aria-label="Bearbeitung zurücksetzen" title="Bearbeitung zurücksetzen"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg></button>
    <button class="btn primary small icon" data-act="done" aria-label="Fertig" title="Fertig"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5 9-10"/></svg></button>`;
}
head.addEventListener('pointerdown', e => { if (e.target.closest('[data-act=before]')) { ui.showOrig = true; requestRender(); } });
['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => head.addEventListener(ev, () => { if (ui.showOrig) { ui.showOrig = false; requestRender(); } }));
head.addEventListener('click', e => {
  const a = e.target.closest('[data-act]')?.dataset.act, l = selLayer(); if (!a) return;
  if (a === 'done') selectLayer(null);
  else if (a === 'auto' && l) { if (l.params.auto) { l.params.auto = null; l.params.brightness = 0; toast('Auto-Korrektur entfernt'); } else autoFix(l); commit(); }
  else if (a === 'reset' && l) { l.params = defParams(); toast('Bearbeitung zurückgesetzt'); commit(); }
});
function autoFix(l) {
  const c = ensureCache(l); if (!c) return; const d = (c.aux || makeAux(c.prep)).data, hst = new Uint32Array(256); let n = 0;
  for (let i = 0; i < d.length; i += 16) { hst[Math.round(.2126 * d[i] + .7152 * d[i + 1] + .0722 * d[i + 2])]++; n++; }
  let acc = 0, lo = 0, hi = 255; for (let i = 0; i < 256; i++) { acc += hst[i]; if (acc > n * .005) { lo = i; break; } }
  acc = 0; for (let i = 255; i >= 0; i--) { acc += hst[i]; if (acc > n * .005) { hi = i; break; } }
  lo /= 255; hi /= 255; if (hi - lo < .3) { const m = (hi + lo) / 2; lo = Math.max(0, m - .15); hi = Math.min(1, m + .15); }
  let sum = 0; for (let i = 0; i < 256; i++) sum += hst[i] * clamp((i / 255 - lo) / (hi - lo)); const mean = clamp(sum / n, .05, .95);
  const ex = Math.log(.47) / Math.log(mean), br = -Math.log2(ex) / .9;
  Object.assign(l.params, { auto: { lo: +lo.toFixed(3), hi: +hi.toFixed(3) }, brightness: Math.round(clamp(br * 100, -50, 50)), vibrance: Math.max(l.params.vibrance, 18), structure: Math.max(l.params.structure, 12) });
  toast('Auto-Korrektur angewendet');
}

/* ---------- Regler ---------- */
const fmtSigned = v => (v > 0 ? '+' : v < 0 ? '−' : '') + de(Math.abs(Math.round(v)));
const FMT = { signed: fmtSigned, ev: v => (v > 0 ? '+' : v < 0 ? '−' : '') + de(Math.abs(v), 2) + ' EV', pct: v => de(Math.round(v)) + ' %', deg: v => fmtSigned(v) + '°', hue: v => de(Math.round(v)) + '°', px: v => de(Math.round(v)) + ' px', x: v => de(v, 2) + '×', n: v => de(Math.round(v)), lh: v => de(v, 2) };
/* Ziel-Objekte für Regler-Schlüssel "ns.feld" */
function target(ns) {
  const l = selLayer(), P = l && l.params;
  switch (ns) {
    case 'p': return P; case 'l': return l; case 'c': return l.crop; case 'h': return P.hsl[ui.hslBand]; case 'g': return P.grade[ui.gradeRange]; case 'gr': return P.grade;
    case 'm': return P.masks[ui.maskSel]; case 'b': return P.blur; case 'pv': return P.persp; case 'ui': return ui; case 'bg': return state.bg;
  }
}
function getVal(k) { const [ns, f] = k.split('.'); if (k === 'l.wpct') return Math.round(selLayer().w / dims().W * 100); const t = target(ns); return t ? t[f] : 0; }
function setVal(k, v) { const [ns, f] = k.split('.'); if (k === 'l.wpct') { selLayer().w = v / 100 * dims().W; return; } const t = target(ns); if (t) t[f] = v; }
function slider(key, label, min, max, step, fmt = 'signed', def = 0, scale = 1, cls = '') {
  const raw = getVal(key) ?? def, val = +(raw * scale).toFixed(4), id = 's_' + key.replace(/\W/g, '_');
  return `<div class="sl${val !== def ? ' changed' : ''}${cls ? ' ' + cls : ''}"><div class="sl-top"><label for="${id}">${label}</label><output>${FMT[fmt](val)}</output></div>
    <input type="range" id="${id}" data-k="${key}" data-fmt="${fmt}" data-def="${def}" data-scale="${scale}" min="${min}" max="${max}" step="${step}" value="${val}"></div>`;
}
function paintFill(inp) {
  const min = +inp.min, max = +inp.max, v = +inp.value, z = clamp(+inp.dataset.def, min, max);
  const pv = (v - min) / (max - min) * 100, pz = (z - min) / (max - min) * 100;
  inp.style.setProperty('--a', Math.min(pv, pz) + '%'); inp.style.setProperty('--b', Math.max(pv, pz) + '%');
}
panel.addEventListener('input', e => {
  const t = e.target, l = selLayer();
  if (t.matches('input[type=range][data-k]')) {
    const v = +t.value; setVal(t.dataset.k, v / +t.dataset.scale); t.closest('.sl').querySelector('output').textContent = FMT[t.dataset.fmt](v);
    t.closest('.sl').classList.toggle('changed', v !== +t.dataset.def); paintFill(t);
    if (t.dataset.k.startsWith('h.')) markBands(); if (t.dataset.k.startsWith('g.')) markGrade(); requestRender();
  } else if (t.id === 'txtIn') { l.text = t.value; requestRender(); }
  else if (t.id === 'capIn') { l.caption = t.value; requestRender(); }
  else if (t.matches('input[type=color][data-col]')) { applyColor(t.dataset.col, t.value); requestRender(); }
});
panel.addEventListener('change', e => {
  const t = e.target, l = selLayer();
  if (t.id === 'projName') { ui.projectName = t.value.trim() || 'Mein Karussell'; scheduleSave(); return; }
  if (t.id === 'stampDate') { const [y, m, d] = t.value.split('-').map(Number); if (y) { const old = new Date(l.stampMs); l.stampMs = new Date(y, m - 1, d, old.getHours(), old.getMinutes()).getTime(); commit(); } return; }
  if (t.id === 'presetFile') { importPresets(t.files[0]); t.value = ''; return; }
  if (t.matches('input[type=range],textarea,input[type=color],#capIn')) { pushHistory(); refreshAfterCommit(); }
});
panel.addEventListener('dblclick', e => {
  const top = e.target.closest('.sl-top'); if (!top) return; const inp = top.parentElement.querySelector('input');
  inp.value = inp.dataset.def; inp.dispatchEvent(new Event('input', { bubbles: true })); pushHistory(); refreshAfterCommit();
});
function refreshAfterCommit() { if (mode() === 'image' && ui.tab.image === 'looks') fillThumbs(); }
function syncPanelValues() {
  panel.querySelectorAll('input[type=range][data-k]').forEach(inp => { const v = getVal(inp.dataset.k); if (v === undefined) return; inp.value = v * +inp.dataset.scale; paintFill(inp);
    const sl = inp.closest('.sl'); sl.querySelector('output').textContent = FMT[inp.dataset.fmt](+inp.value); sl.classList.toggle('changed', +inp.value !== +inp.dataset.def); });
}
function applyColor(target, v) {
  const l = selLayer();
  if (target === 'bg1') state.bg.c1 = v; else if (target === 'bg2') state.bg.c2 = v;
  else if (target === 'frame') l.borderColor = v; else if (target === 'text') l.color = v; else if (target === 'textbg') l.bgColor = v; else if (target === 'stroke') l.strokeColor = v; else if (target === 'fill') l.fill = v;
}
const chip = (attrs, label, on) => `<button class="chip" ${attrs} aria-pressed="${!!on}">${label}</button>`;
const sw = (target, c, on) => `<button class="sw" style="--c:${c}" data-col-set="${target}" data-v="${c}" aria-pressed="${!!on}" aria-label="Farbe ${c}"></button>`;
const swatches = (target, list, cur) => `<div class="swatches">${list.map(c => sw(target, c, cur === c)).join('')}<input type="color" class="color-in" data-col="${target}" value="${/^#[0-9a-f]{6}$/i.test(cur) ? cur : '#ffffff'}" aria-label="Eigene Farbe"></div>`;
const toggle = (key, label, on) => `<div class="toggle"><span>${label}</span><button class="switch" role="switch" data-tog="${key}" aria-checked="${!!on}" aria-label="${label.replace(/<[^>]+>/g, '')}"></button></div>`;
const group = (title, inner) => `<div class="group">${title ? `<span class="sec-label">${title}</span>` : ''}${inner}</div>`;
const btn = (act, label, cls = 'ghost', extra = '') => `<button class="btn ${cls} small" data-act2="${act}" ${extra}>${label}</button>`;

/* ---------- Panels ---------- */
function renderPanel() {
  const m = mode(), t = ui.tab[m], l = selLayer(); let h = '';
  if (m === 'none') h = t === 'vorlagen' ? panelTemplates() : t === 'ebenen' ? panelLayers() : t === 'element' ? panelElements() : panelCanvas();
  else if (m === 'text') h = t === 'stil' ? panelTextStyle(l) : t === 'ebene' ? panelLayerCommon(l) : panelText(l);
  else if (m === 'shape') h = t === 'ebene' ? panelLayerCommon(l) : panelShape(l);
  else h = (IMAGE_PANELS[t] || IMAGE_PANELS.looks)(l, l.params);
  const keep = panel.dataset.key === m + t ? panel.scrollTop : 0;
  panel.innerHTML = h; panel.dataset.key = m + t; panel.scrollTop = keep;
  panel.querySelectorAll('input[type=range]').forEach(paintFill);
  if (m === 'image') { if (t === 'looks') fillThumbs(); if (t === 'licht') { flags.histDirty = true; requestRender(); } if (t === 'kurve') setupCurve(); }
}
function panelCanvas() {
  const f = state.format, i = visibleSlide() + 1;
  return `${ui.sample ? `<div class="callout"><span class="note"><b>Beispielprojekt</b> mit generiertem Motiv. Beim ersten eigenen Foto wird es ersetzt.</span></div>` : ''}
  <div class="row"><input class="name" id="projName" value="${esc(ui.projectName)}" maxlength="40" aria-label="Projektname"><button class="btn ghost small" data-act2="projects">Projekte</button></div>
  ${group('Format', `<div class="chips">${Object.entries(FORMATS).map(([k, v]) => chip(`data-format="${k}"`, `${v.label}<small>${v.px}</small>`, f === k)).join('')}</div>`)}
  ${group('Slides', `<div class="row"><div class="stepper"><button data-slides="-1" aria-label="Eine Slide weniger">−</button><span>${state.slides}</span><button data-slides="1" aria-label="Eine Slide mehr">+</button></div><span class="note">Instagram erlaubt bis zu 20 Bilder pro Post.</span></div>
    <div class="row"><span class="note">Slide ${i}:</span>${btn('slideLeft', '← nach vorn')}${btn('slideRight', 'nach hinten →')}${btn('slideInsert', '+ danach einfügen')}${btn('slideDelete', 'Löschen', 'danger')}</div>`)}
  ${group('Hintergrund', `${swatches('bg1', BG_COLORS, state.bg.c1)}
  ${toggle('grad', 'Verlauf', state.bg.grad)}
  ${state.bg.grad ? `${swatches('bg2', BG_COLORS, state.bg.c2)}<div class="chips">${[['h', 'Waagerecht'], ['v', 'Senkrecht'], ['d', 'Diagonal']].map(([k, lb]) => chip(`data-bgdir="${k}"`, lb, (state.bg.dir || 'h') === k)).join('')}</div>` : ''}
  <span class="sec-label">Muster</span><div class="chips">${BG_PATTERNS.map(([k, lb]) => chip(`data-pattern="${k}"`, lb, (state.bg.pattern || 'none') === k)).join('')}</div>`)}
  ${toggle('grid', 'Drittel-Raster einblenden', ui.grid)}
  <div class="row">${btn('clear', ui.confirmClear ? 'Wirklich alles leeren?' : 'Neues leeres Projekt', 'danger')}${btn('sample', 'Beispiel laden')}</div>`;
}
function panelTemplates() {
  const n = state.layers.filter(l => l.type === 'image').length;
  return `${n ? '' : '<p class="note">Füge zuerst Fotos hinzu, dann ordnet eine Vorlage sie an. Fehlen Fotos, werden vorhandene wiederholt.</p>'}<div class="tpl-grid">${TEMPLATES.map(([k, nm, d]) => `<button class="tpl" data-tpl="${k}">${miniSVG(k)}<b>${nm}</b><span>${d}</span></button>`).join('')}</div>
  <p class="note">Vorlagen ordnen deine vorhandenen Fotos neu an. Rückgängig geht jederzeit oben links.</p>`;
}
const layerName = l => l.type === 'image' ? `Foto ${state.layers.filter(x => x.type === 'image').indexOf(l) + 1}` : l.type === 'text' ? `„${esc((l.text || '').split('\n')[0].slice(0, 18))}“` : (SHAPES.find(s => s[0] === l.kind) || ['', 'Form'])[1];
const ICON = { image: '▣', text: 'T', shape: '◆' };
function panelLayers() {
  if (!state.layers.length) return '<p class="note">Noch keine Ebenen.</p>';
  return `<div class="layer-list">${state.layers.map((l, i) => ({ l, i })).reverse().map(({ l, i }) => `<div class="layer-row${l.hidden ? ' off' : ''}">
    <button class="layer-pick" data-pick="${l.id}"><span class="layer-ico">${ICON[l.type]}</span><span>${layerName(l)}</span></button>
    <button class="icon-btn sm" data-lvis="${l.id}" aria-label="${l.hidden ? 'Einblenden' : 'Ausblenden'}" title="${l.hidden ? 'Einblenden' : 'Ausblenden'}">${l.hidden ? '◌' : '●'}</button>
    <button class="icon-btn sm" data-llock="${l.id}" aria-label="${l.locked ? 'Entsperren' : 'Sperren'}" title="${l.locked ? 'Entsperren' : 'Sperren'}">${l.locked ? '🔒' : '🔓'}</button>
    <button class="icon-btn sm" data-lup="${l.id}" aria-label="Nach vorn" ${i === state.layers.length - 1 ? 'disabled' : ''}>↑</button>
    <button class="icon-btn sm" data-ldown="${l.id}" aria-label="Nach hinten" ${i === 0 ? 'disabled' : ''}>↓</button></div>`).join('')}</div>
    <p class="note">Oben in der Liste liegt vorne. Gesperrte Ebenen lassen sich nicht versehentlich verschieben.</p>`;
}
const EMOJI = ['☀️', '🌊', '❤️', '✨', '📍', '🌸', '🍂', '⭐', '🌙', '📷', '🎞️', '🍦', '🐚', '⛵', '🌿', '🔥', '🦋', '🌈', '💌', '🎉'];
function panelElements() {
  return `${group('Formen & Sticker', `<div class="el-grid">${SHAPES.map(([k, lb]) => `<button class="el" data-addshape="${k}"><svg viewBox="0 0 40 40" aria-hidden="true">${shapeIcon(k)}</svg><span>${lb}</span></button>`).join('')}</div>`)}
  ${group('Emoji', `<div class="emoji-row">${EMOJI.map(e => `<button class="emo" data-emoji="${e}">${e}</button>`).join('')}</div>`)}
  ${group('Text-Vorlagen', `<div class="chips">${TEXT_PRESETS.map(([k, lb]) => chip(`data-addtext="${k}"`, lb, false)).join('')}</div>`)}`;
}
function shapeIcon(k) {
  const f = 'fill="var(--accent)"';
  return { rect: `<rect x="6" y="9" width="28" height="22" ${f}/>`, round: `<rect x="6" y="9" width="28" height="22" rx="6" ${f}/>`, circle: `<circle cx="20" cy="20" r="13" ${f}/>`,
    frame: `<rect x="8" y="6" width="24" height="28" fill="none" stroke="var(--accent)" stroke-width="3"/>`, line: `<path d="M6 20h28" stroke="var(--accent)" stroke-width="3" stroke-linecap="round"/>`,
    arrow: `<path d="M6 18h18v-5l10 7-10 7v-5H6z" ${f}/>`, star: `<path d="M20 5l4.4 9.3 10 1.2-7.4 6.9 2 10L20 27.4 11 32.4l2-10-7.4-6.9 10-1.2z" ${f}/>`,
    heart: `<path d="M20 33C8 25 5 19 5 14a7.5 7.5 0 0 1 15-2 7.5 7.5 0 0 1 15 2c0 5-3 11-15 19z" ${f}/>`, sparkle: `<path d="M20 4Q20 20 36 20Q20 20 20 36Q20 20 4 20Q20 20 20 4z" ${f}/>`,
    blob: `<path d="M20 6c9 0 15 5 14 13s-6 15-15 15S5 29 6 20 11 6 20 6z" ${f}/>`, tape: `<path d="M4 14l2 3-2 3 2 3-2 3h32l-2-3 2-3-2-3 2-3z" fill="#f3e2b3" opacity=".9"/>`,
    arch: `<path d="M9 34V18a11 11 0 0 1 22 0v16z" ${f}/>` }[k] || '';
}
const TEXT_PRESETS = [['klassisch', 'Klassisch'], ['etikett', 'Etikett'], ['neon', 'Neon'], ['zeitung', 'Zeitung'], ['plakat', 'Plakat'], ['pixel', 'Pixel'], ['notiz', 'Notiz'], ['kontur', 'Kontur']];
function textPreset(l, k) {
  const base = { bg: 'none', shadow: true, glow: false, stroke: 0, spacing: 0, upper: false, lineH: 1.16 };
  const P = {
    klassisch: { font: 'Playfair Display', color: '#ffffff', size: 100 },
    etikett: { font: 'Space Mono', color: '#ffffff', bg: 'band', bgColor: '#111111', upper: true, spacing: 6, size: 54, shadow: false },
    neon: { font: 'Pacifico', color: '#ff7eb6', glow: true, size: 110, shadow: false },
    zeitung: { font: 'DM Serif Display', color: '#111111', bg: 'band', bgColor: '#ffffff', size: 70, shadow: false },
    plakat: { font: 'Anton', color: '#f2c14e', upper: true, spacing: 3, size: 180, shadow: false },
    pixel: { font: 'Press Start 2P', color: '#9dff7a', size: 46, lineH: 1.5 },
    notiz: { font: 'Caveat', color: '#2a2a2a', bg: 'solid', bgColor: '#f7e98d', size: 80, shadow: false },
    kontur: { font: 'Archivo Black', color: '#ffffff', stroke: 6, strokeColor: '#111111', upper: true, size: 120, shadow: false }
  }[k];
  Object.assign(l, base, P);
}
const IMAGE_PANELS = {
  looks: (l, p) => {
    const presets = loadPresets(), cats = LOOK_CATS.map(([k, lb]) => chip(`data-lookcat="${k}"`, lb, ui.lookCat === k)).join('');
    const list = Object.entries(LOOKS).filter(([k, v]) => v.cat === '*' || v.cat === ui.lookCat || (k === p.look && ui.lookCat !== v.cat && false));
    return `<div class="chips scroll">${cats}</div>
    <div class="looks">${list.map(([k, v]) => `<button class="look" data-look="${k}" aria-pressed="${p.look === k}"><canvas width="140" height="140" data-thumb="${k}"></canvas>${v.name}</button>`).join('')}</div>
    ${p.look !== 'none' ? `<p class="note">Aktiv: <b>${LOOKS[p.look].name}</b></p>` + slider('p.lookAmt', 'Stärke', 0, 100, 1, 'pct', 100) : ''}
    ${toggle('stamp', 'Datumsstempel', p.stamp)}
    ${group('Eigene Presets', `${presets.length ? `<div class="chips">${presets.map((pr, i) => `<button class="chip" data-preset="${i}">${esc(pr.name)}</button>`).join('')}</div>` : '<span class="note">Noch keine. Bearbeite ein Foto und sichere den Stil.</span>'}
    <div class="row"><input class="name" id="presetName" placeholder="Name, z. B. Herbst Emden" maxlength="28" aria-label="Preset-Name">${btn('savePreset', 'Sichern')}</div>
    <div class="row">${presets.length ? btn('exportPresets', 'Exportieren') : ''}<label class="btn ghost small" for="presetFile">Importieren</label><input type="file" id="presetFile" accept=".json,application/json" hidden>
    ${presets.length ? btn('clearPresets', ui.confirmPresets ? 'Alle Presets löschen?' : 'Alle löschen', 'danger') : ''}</div>`)}
    <div class="row">${btn('copy', 'Bearbeitung kopieren')}${btn('paste', 'Einfügen', 'ghost', ui.clip ? '' : 'disabled')}${btn('applyAll', 'Auf alle Fotos')}</div>`;
  },
  anpassen: (l, p) => group('', slider('p.brightness', 'Helligkeit', -100, 100, 1) + slider('p.contrast', 'Kontrast', -100, 100, 1) + slider('p.saturation', 'Sättigung', -100, 100, 1)
    + slider('p.ambiance', 'Ambiance', -100, 100, 1) + slider('p.highlights', 'Lichter', -100, 100, 1) + slider('p.shadows', 'Schatten', -100, 100, 1) + slider('p.temp', 'Wärme', -100, 100, 1)
    + slider('p.structure', 'Struktur', -100, 100, 1) + slider('p.sharpen', 'Schärfen', 0, 100, 1)),
  licht: (l, p) => `<canvas class="hist" id="hist" aria-label="Histogramm"></canvas>` + group('', slider('p.exposure', 'Belichtung', -3, 3, .05, 'ev') + slider('p.contrast', 'Kontrast', -100, 100, 1)
    + slider('p.highlights', 'Lichter', -100, 100, 1) + slider('p.shadows', 'Tiefen', -100, 100, 1) + slider('p.whites', 'Weiß', -100, 100, 1) + slider('p.blacks', 'Schwarz', -100, 100, 1)),
  farbe: (l, p) => group('Weißabgleich', `<div class="row">${btn('pick', ui.pick ? 'Tippe ins Foto …' : 'Pipette: neutralen Punkt wählen', ui.pick ? 'primary' : 'ghost')}</div>` + slider('p.temp', 'Temperatur', -100, 100, 1) + slider('p.tint', 'Tönung', -100, 100, 1))
    + group('Präsenz', slider('p.vibrance', 'Dynamik', -100, 100, 1) + slider('p.saturation', 'Sättigung', -100, 100, 1))
    + group(`Farbmischer · ${HSL_BANDS[ui.hslBand][0]}`, `<div class="bands">${HSL_BANDS.map((b, i) => `<button class="band${p.hsl[i].some(v => v) ? ' mod' : ''}" style="--c:${b[2]}" data-band="${i}" aria-pressed="${i === ui.hslBand}" aria-label="${b[0]}"></button>`).join('')}</div>
      ${slider('h.0', 'Farbton', -100, 100, 1)}${slider('h.1', 'Sättigung', -100, 100, 1)}${slider('h.2', 'Luminanz', -100, 100, 1)}`),
  grading: (l, p) => { const R = [['sh', 'Tiefen'], ['mid', 'Mitten'], ['hi', 'Lichter'], ['glob', 'Global']];
    return `<div class="chips">${R.map(([k, lb]) => chip(`data-grade="${k}"`, `<i class="gdot" style="--c:hsl(${p.grade[k][0]} ${p.grade[k][1] ? 80 : 0}% 55%)"></i>${lb}`, ui.gradeRange === k)).join('')}</div>
    <div class="group">${slider('g.0', 'Farbton', 0, 360, 1, 'hue', ui.gradeRange === 'sh' ? 220 : 40, 1, 'hue')}${slider('g.1', 'Sättigung', 0, 100, 1, 'n')}</div>
    ${group('', slider('gr.bal', 'Abgleich (Tiefen ↔ Lichter)', -100, 100, 1))}
    <p class="note">Wie in Lightroom: Tiefen kühl, Lichter warm ergibt den typischen Kino-Look.</p><div class="row">${btn('gradeReset', 'Color Grading zurücksetzen')}</div>`; },
  kurve: (l, p) => `<div class="chips">${[['rgb', 'Helligkeit'], ['r', 'Rot'], ['g', 'Grün'], ['b', 'Blau']].map(([k, lb]) => chip(`data-curve="${k}"`, lb, ui.curveCh === k)).join('')}</div>
    <div class="curve-wrap"><canvas class="curve" id="curve" aria-label="Gradationskurve, Punkte ziehen"></canvas></div>
    <div class="row"><span class="note grow">Punkte nach oben oder unten ziehen. Leichtes S = mehr Kontrast.</span>${btn('curveS', 'S-Kurve')}${btn('curveFade', 'Matt')}${btn('curveReset', 'Zurücksetzen')}</div>`,
  details: (l, p) => group('Lokaler Kontrast', slider('p.structure', 'Struktur', -100, 100, 1) + slider('p.clarity', 'Klarheit', -100, 100, 1) + slider('p.texture', 'Textur', -100, 100, 1) + slider('p.dehaze', 'Dunst entfernen', -100, 100, 1))
    + group('Schärfe & Rauschen', slider('p.sharpen', 'Schärfen', 0, 100, 1) + slider('p.denoise', 'Rauschreduzierung', 0, 100, 1)),
  effekte: (l, p) => group('Film', slider('p.grain', 'Körnung', 0, 100, 1) + slider('p.grainSize', 'Korngröße', 0, 100, 1, 'n', 25) + slider('p.fade', 'Verblassen', 0, 100, 1) + slider('p.halation', 'Halation (roter Schein)', 0, 100, 1))
    + group('Licht', slider('p.glow', 'Glow', 0, 100, 1) + slider('p.vignette', 'Vignette', -100, 100, 1) + slider('p.vigSize', 'Vignetten-Größe', 0, 100, 1, 'n', 50)
      + slider('p.leak', 'Lichteinfall', 0, 100, 1) + (p.leak ? `<div class="chips">${LEAKS.map((n, i) => chip(`data-leak="${i}"`, n, p.leakKind === i)).join('')}</div>` : ''))
    + group('Digital & alt', slider('p.lowres', 'Low-Res', 0, 100, 1) + slider('p.ca', 'Farbsäume', 0, 100, 1) + slider('p.dust', 'Staub & Kratzer', 0, 100, 1)),
  stempel: (l, p) => { const st = p.stampStyle, d = new Date(l.stampMs), iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return `${toggle('stamp', 'Datumsstempel anzeigen', p.stamp)}
    <div class="row"><label class="note" for="stampDate">Datum</label><input type="date" class="name date" id="stampDate" value="${iso}"></div>
    ${group('Format', `<div class="chips">${[['yy', "'24 10 06"], ['dmy', '06.10.24'], ['mdy', "10 06 '24"], ['time', '18:42 06.10.24']].map(([k, lb]) => chip(`data-sfmt="${k}"`, lb, st.fmt === k)).join('')}</div>`)}
    ${group('Farbe', `<div class="swatches">${Object.entries(STAMP_COLORS).map(([k, [c]]) => `<button class="sw" style="--c:${c}" data-scol="${k}" aria-pressed="${st.color === k}" aria-label="${k}"></button>`).join('')}</div>`)}
    ${group('Position', `<div class="chips">${[['br', 'Unten rechts'], ['bl', 'Unten links'], ['tr', 'Oben rechts']].map(([k, lb]) => chip(`data-spos="${k}"`, lb, st.pos === k)).join('')}</div>`)}`; },
  selektiv: (l, p) => {
    const m = p.masks[ui.maskSel];
    const list = p.masks.length ? `<div class="chips">${p.masks.map((mm, i) => chip(`data-mask="${i}"`, `Punkt ${i + 1}`, i === ui.maskSel)).join('')}</div>` : '<p class="note"><b>Tippe ins Foto</b>, um einen Bereich gezielt aufzuhellen, abzudunkeln oder einzufärben – wie „Selektiv“ in Snapseed oder Masken in Lightroom.</p>';
    if (!m) return list;
    return `${list}<div class="chips">${chip('data-mkind="radial"', 'Radial', m.kind !== 'linear')}${chip('data-mkind="linear"', 'Verlauf', m.kind === 'linear')}</div>
    ${group('Anpassung', slider('m.ex', 'Helligkeit', -2, 2, .05, 'ev') + slider('m.co', 'Kontrast', -100, 100, 1, 'signed', 0, 100) + slider('m.sat', 'Sättigung', -100, 100, 1, 'signed', 0, 100) + slider('m.temp', 'Wärme', -100, 100, 1, 'signed', 0, 100) + slider('m.st', 'Struktur', -100, 100, 1, 'signed', 0, 100))}
    ${group('Form', slider('m.rx', m.kind === 'linear' ? 'Breite' : 'Größe', 1, 100, 1, 'n', 16, 100) + (m.kind !== 'linear' ? slider('m.ry', 'Höhe', 1, 100, 1, 'n', 16, 100) : '') + slider('m.feather', 'Weiche Kante', 2, 100, 1, 'pct', 60, 100) + slider('m.angle', 'Drehung', -180, 180, 1, 'deg', 0, 180 / Math.PI))}
    ${toggle('minv', 'Umkehren (außen statt innen)', m.inv)}
    <div class="row">${btn('maskDel', 'Punkt löschen', 'danger')}${btn('maskDup', 'Duplizieren')}</div>`;
  },
  pinsel: (l, p) => `<div class="chips">${BRUSH_MODES.map(([k, lb]) => chip(`data-bmode="${k}"`, lb, ui.brushMode === k)).join('')}</div>
    ${group('', slider('ui.brushSize', 'Pinselgröße', 1, 30, .5, 'n', 6) + slider('ui.brushStrength', 'Stärke', 5, 100, 1, 'pct', 50))}
    <p class="note">Male direkt auf das Foto – wie der Pinsel in Snapseed. Mehrfach drübermalen verstärkt.</p>
    <div class="row">${btn('brushUndo', 'Letzten Strich entfernen', 'ghost', p.brush.length ? '' : 'disabled')}${btn('brushClear', 'Alle Striche löschen', 'danger', p.brush.length ? '' : 'disabled')}</div>`,
  reparieren: (l, p) => `${group('', slider('ui.healSize', 'Größe', .5, 12, .1, 'lh', 3))}
    <p class="note">Tippe auf Fussel, Pickel oder kleine Störungen. Die Stelle wird mit passender Umgebung gefüllt. ${p.heal.length ? `<b>${p.heal.length}</b> Stelle${p.heal.length === 1 ? '' : 'n'} repariert.` : ''}</p>
    <div class="row">${btn('healUndo', 'Letzte entfernen', 'ghost', p.heal.length ? '' : 'disabled')}${btn('healClear', 'Alle entfernen', 'danger', p.heal.length ? '' : 'disabled')}</div>`,
  fokus: (l, p) => `<div class="chips">${[['off', 'Aus'], ['linear', 'Tilt-Shift'], ['radial', 'Rund']].map(([k, lb]) => chip(`data-blur="${k}"`, lb, p.blur.mode === k)).join('')}</div>
    ${p.blur.mode === 'off' ? '<p class="note">Unscharfer Hintergrund wie bei „Objektivunschärfe“ in Snapseed. Wähle eine Form oder tippe ins Foto.</p>'
    : group('', slider('b.amt', 'Unschärfe', 0, 100, 1, 'n', 55) + slider('b.size', 'Scharfer Bereich', 2, 80, 1, 'n', 22, 100) + slider('b.feather', 'Übergang', 2, 80, 1, 'n', 25, 100) + (p.blur.mode === 'linear' ? slider('b.angle', 'Drehung', -90, 90, 1, 'deg', 0, 180 / Math.PI) : ''))}`,
  zuschnitt: (l, p) => group('Seitenverhältnis', `<div class="chips scroll">${RATIOS.map(([v, lb]) => chip(`data-ratio="${v}"`, lb, String(l.crop.ratio) === String(v))).join('')}</div>`)
    + group('', slider('c.zoom', 'Zoom', 1, 4, .01, 'x', 1) + slider('c.px', 'Ausschnitt waagerecht', 0, 100, 1, 'pct', 50, 100) + slider('c.py', 'Ausschnitt senkrecht', 0, 100, 1, 'pct', 50, 100) + slider('l.rot', 'Begradigen / Drehen', -180, 180, .5, 'deg'))
    + `<div class="row">${btn('rot90', '90° drehen')}${btn('flip', 'Spiegeln')}${btn('cropReset', 'Zurücksetzen')}</div>`
    + group('Perspektive', slider('pv.v', 'Senkrecht (stürzende Linien)', -100, 100, 1) + slider('pv.h', 'Waagerecht', -100, 100, 1)),
  ebene: (l, p) => panelImageLayer(l)
};
const BRUSH_MODES = [['dodge', 'Aufhellen'], ['burn', 'Abdunkeln'], ['sat', 'Sättigung +'], ['desat', 'Sättigung −'], ['warm', 'Wärmer'], ['cool', 'Kühler'], ['erase', 'Radierer']];
const CLIPS = [['rect', 'Rechteck'], ['round', 'Abgerundet'], ['circle', 'Kreis'], ['arch', 'Bogen'], ['heart', 'Herz'], ['star', 'Stern'], ['blob', 'Klecks']];
const FRAME_LIST = [['polaroid', 'Sofortbild'], ['instax', 'Instax'], ['film', 'Kleinbild'], ['dia', 'Dia']];
function panelImageLayer(l) {
  const framed = FRAMES.has(l.shape);
  return group('', slider('l.wpct', 'Größe (Slide-Breite)', 10, 100 * state.slides + 100, 1, 'pct', 100) + slider('l.rot', 'Drehung', -180, 180, .5, 'deg') + slider('l.opacity', 'Deckkraft', 0, 100, 1, 'pct', 100, 100))
  + group('Form', `<div class="chips">${CLIPS.map(([k, lb]) => chip(`data-shape="${k}"`, lb, l.shape === k)).join('')}</div>${l.shape === 'round' ? slider('l.radius', 'Eckenradius', 1, 50, 1, 'n', 7) : ''}`)
  + group('Rahmen', `<div class="chips">${FRAME_LIST.map(([k, lb]) => chip(`data-shape="${k}"`, lb, l.shape === k)).join('')}</div>
    ${slider('l.border', framed ? 'Randbreite' : 'Rand', 0, 120, 1, 'px')}${swatches('frame', FRAME_COLORS.concat(l.shape === 'film' ? ['#161616'] : []), l.borderColor)}
    ${framed ? `<input class="name" id="capIn" value="${esc(l.caption || '')}" placeholder="${l.shape === 'film' ? 'Filmaufdruck' : 'Beschriftung, z. B. Juli 24'}" maxlength="40" aria-label="Beschriftung">` : ''}
    ${toggle('shadow', 'Schatten', l.shadow)}`)
  + group('Mischmodus', `<div class="chips scroll">${BLENDS.map(([k, lb]) => chip(`data-blend="${k}"`, lb, (l.blend || 'source-over') === k)).join('')}</div><span class="note">Für Doppelbelichtung: Foto über ein anderes legen, „Negativ multipl.“ oder „Aufhellen“ wählen.</span>`)
  + `<div class="row">${btn('fillSlide', 'Slide füllen')}${btn('fillAll', 'Alle Slides füllen')}${btn('center', 'Auf Slide zentrieren')}${btn('replace', 'Foto ersetzen')}${btn('bgBlur', 'Als unscharfer Hintergrund')}</div>` + layerOrderRow(l);
}
const layerOrderRow = l => `<div class="row">${btn('front', 'Nach vorn')}${btn('back', 'Nach hinten')}${btn('dup', 'Duplizieren')}${btn('lock', l.locked ? 'Entsperren' : 'Sperren')}${btn('del', 'Löschen', 'danger')}</div>`;
function panelLayerCommon(l) {
  return group('', (l.type === 'text' ? '' : slider('l.rot', 'Drehung', -180, 180, .5, 'deg')) + slider('l.opacity', 'Deckkraft', 0, 100, 1, 'pct', 100, 100))
    + group('Mischmodus', `<div class="chips scroll">${BLENDS.map(([k, lb]) => chip(`data-blend="${k}"`, lb, (l.blend || 'source-over') === k)).join('')}</div>`)
    + `<div class="row">${btn('center', 'Auf Slide zentrieren')}</div>` + layerOrderRow(l);
}
function panelText(l) {
  return `<textarea class="txt" id="txtIn" aria-label="Text" rows="2">${esc(l.text)}</textarea>
  <div class="chips scroll">${FONTS.map(([f, lb, wgt]) => `<button class="fontchip" data-font="${f}" aria-pressed="${l.font === f}"><span class="aa" style="font-family:'${f}';font-weight:${wgt}">Aa</span><span>${lb}</span></button>`).join('')}</div>
  ${group('Schnell-Stile', `<div class="chips">${TEXT_PRESETS.map(([k, lb]) => chip(`data-tpreset="${k}"`, lb, false)).join('')}</div>`)}`;
}
function panelTextStyle(l) {
  return group('', slider('l.size', 'Größe', 16, 400, 1, 'px', 110) + slider('l.rot', 'Drehung', -180, 180, .5, 'deg') + slider('l.spacing', 'Laufweite', -10, 60, 1, 'n') + slider('l.lineH', 'Zeilenabstand', .8, 2, .02, 'lh', 1.16))
  + group('Farbe', swatches('text', TEXT_COLORS, l.color))
  + group('Ausrichtung', `<div class="chips">${[['left', 'Links'], ['center', 'Mitte'], ['right', 'Rechts']].map(([k, lb]) => chip(`data-align="${k}"`, lb, l.align === k)).join('')}</div>`)
  + group('Hinterlegung', `<div class="chips">${[['none', 'Keine'], ['solid', 'Fläche'], ['soft', 'Halbtransparent'], ['band', 'Zeilenband']].map(([k, lb]) => chip(`data-tbg="${k}"`, lb, l.bg === k)).join('')}</div>
    ${l.bg !== 'none' ? swatches('textbg', TEXT_COLORS, l.bgColor) : ''}`)
  + group('Kontur', slider('l.stroke', 'Konturstärke', 0, 20, .5, 'n') + (l.stroke ? swatches('stroke', TEXT_COLORS, l.strokeColor) : ''))
  + toggle('upper', 'Großbuchstaben', l.upper) + toggle('glow', 'Leuchten (Neon)', l.glow) + (l.bg === 'none' ? toggle('tshadow', 'Schatten für Lesbarkeit', l.shadow) : '');
}
function panelShape(l) {
  const canOutline = !['line', 'arrow', 'tape', 'frame'].includes(l.kind);
  return group('Form', `<div class="chips">${SHAPES.map(([k, lb]) => chip(`data-skind="${k}"`, lb, l.kind === k)).join('')}</div>`)
    + group('Farbe', swatches('fill', TEXT_COLORS.concat(['#f3e2b3']), l.fill))
    + group('', slider('l.w', l.kind === 'line' ? 'Länge' : 'Breite', 20, 3000, 1, 'px') + slider('l.h', l.kind === 'line' ? 'Stärke' : 'Höhe', 2, 3000, 1, 'px')
      + (l.kind === 'round' ? slider('l.radius', 'Eckenradius', 1, 50, 1, 'n', 18) : '') + (canOutline && l.outline || l.kind === 'frame' ? slider('l.sw', 'Linienstärke', 2, 80, 1, 'px', 12) : ''))
    + (canOutline ? toggle('outline', 'Nur Umriss', l.outline) : '') + toggle('shadow', 'Schatten', l.shadow);
}

panel.addEventListener('click', async e => {
  const t = e.target.closest('button'); if (!t || t.disabled) return; const l = selLayer(); const d = t.dataset;
  if (d.format) { const oh = dims().H; state.format = d.format; const nh = dims().H; state.layers.forEach(x => x.y *= nh / oh); fit(); commit(); }
  else if (d.slides) { state.slides = clamp(state.slides + +d.slides, 1, 20); fit(); commit(); }
  else if (d.colSet) { applyColor(d.colSet, d.v); commit(); }
  else if (d.tog) {
    const on = t.getAttribute('aria-checked') !== 'true', k = d.tog;
    if (k === 'grad') state.bg.grad = on; else if (k === 'grid') { ui.grid = on; renderPanel(); requestRender(); return; }
    else if (k === 'stamp') l.params.stamp = on; else if (k === 'shadow' || k === 'tshadow') l.shadow = on; else if (k === 'upper') l.upper = on; else if (k === 'glow') l.glow = on;
    else if (k === 'outline') l.outline = on; else if (k === 'minv') l.params.masks[ui.maskSel].inv = on;
    commit();
  }
  else if (d.tpl) { if (applyTemplate(d.tpl)) { ui.sel = null; commit(); toast('Vorlage angewendet'); } }
  else if (d.lookcat) { ui.lookCat = d.lookcat; renderPanel(); }
  else if (d.look) { const was = l.params.look; l.params.look = d.look; if (LOOKS[d.look].stamp && was !== d.look) l.params.stamp = true; if (!LOOKS[d.look].stamp && LOOKS[was]?.stamp) l.params.stamp = false; commit(); }
  else if (d.preset) { const pr = loadPresets()[+d.preset]; if (pr) { l.params = upgradeParams(clone(pr.params)); toast(`Preset „${pr.name}“ angewendet`); commit(); } }
  else if (d.band) { ui.hslBand = +d.band; renderPanel(); }
  else if (d.grade) { ui.gradeRange = d.grade; renderPanel(); }
  else if (d.curve) { ui.curveCh = d.curve; renderPanel(); }
  else if (d.ratio) { l.crop.ratio = d.ratio === 'orig' ? 'orig' : +d.ratio; commit(); }
  else if (d.shape) { l.shape = d.shape; if (d.shape === 'film') l.borderColor = '#161616'; else if (d.shape === 'dia') l.borderColor = '#ece8de'; else if (FRAMES.has(d.shape) && l.borderColor === '#161616') l.borderColor = '#ffffff'; commit(); }
  else if (d.blend) { l.blend = d.blend; commit(); }
  else if (d.font) { l.font = d.font; commit(); }
  else if (d.tpreset) { textPreset(l, d.tpreset); commit(); }
  else if (d.align) { l.align = d.align; commit(); }
  else if (d.tbg) { l.bg = d.tbg; commit(); }
  else if (d.skind) { l.kind = d.skind; commit(); }
  else if (d.bgdir) { state.bg.dir = d.bgdir; commit(); }
  else if (d.pattern) { state.bg.pattern = d.pattern; commit(); }
  else if (d.leak) { l.params.leakKind = +d.leak; commit(); }
  else if (d.sfmt) { l.params.stampStyle.fmt = d.sfmt; l.params.stamp = true; commit(); }
  else if (d.scol) { l.params.stampStyle.color = d.scol; l.params.stamp = true; commit(); }
  else if (d.spos) { l.params.stampStyle.pos = d.spos; l.params.stamp = true; commit(); }
  else if (d.mask) { ui.maskSel = +d.mask; renderPanel(); requestRender(); }
  else if (d.mkind) { const m = l.params.masks[ui.maskSel]; m.kind = d.mkind; if (m.kind === 'linear') { m.rx = .25; m.feather = .6; m.angle = Math.PI / 2; } else { m.rx = m.ry = .16; m.angle = 0; } commit(); }
  else if (d.bmode) { ui.brushMode = d.bmode; renderPanel(); updateTop(); }
  else if (d.blur) { l.params.blur.mode = d.blur; commit(); }
  else if (d.addshape) { const { W, H } = dims(), s = newShapeLayer(d.addshape, (visibleSlide() + .5) * W, H / 2); state.layers.push(s); ui.tab.shape = 'form'; selectLayer(s.id); pushHistory(); }
  else if (d.emoji) { const { W, H } = dims(), s = newTextLayer((visibleSlide() + .5) * W, H / 2, d.emoji); s.size = 220; s.shadow = false; s.font = 'Instrument Sans'; state.layers.push(s); ui.tab.text = 'stil'; selectLayer(s.id); pushHistory(); }
  else if (d.addtext) { const { W, H } = dims(), s = newTextLayer((visibleSlide() + .5) * W, H / 2, 'Dein Text'); textPreset(s, d.addtext); state.layers.push(s); ui.tab.text = 'text'; selectLayer(s.id); pushHistory(); }
  else if (d.pick) { selectLayer(+d.pick); }
  else if (d.lvis) { const x = state.layers.find(y => y.id === +d.lvis); x.hidden = !x.hidden; commit(); }
  else if (d.llock) { const x = state.layers.find(y => y.id === +d.llock); x.locked = !x.locked; commit(); }
  else if (d.lup || d.ldown) { const id = +(d.lup || d.ldown), i = state.layers.findIndex(y => y.id === id), j = i + (d.lup ? 1 : -1); if (j >= 0 && j < state.layers.length) { const [x] = state.layers.splice(i, 1); state.layers.splice(j, 0, x); } commit(); }
  else if (d.act2) action(d.act2, l);
});
function commit() { pushHistory(); renderUI(); }
function shiftSlide(i, dir) { // Inhalte von Slide i mit Nachbar tauschen
  const { W } = dims(), j = i + dir; if (j < 0 || j >= state.slides) return false;
  state.layers.forEach(l => { const s = Math.floor(l.x / W); if (s === i) l.x += dir * W; else if (s === j) l.x -= dir * W; }); return true;
}
function action(a, l) {
  const { W, H } = dims(), P = l && l.params;
  if (a !== 'clear') ui.confirmClear = false;
  if (a !== 'clearPresets') ui.confirmPresets = false;
  switch (a) {
    case 'clear': if (!ui.confirmClear) { ui.confirmClear = true; renderPanel(); return; } newProject(); return;
    case 'sample': loadSample(); return;
    case 'projects': openProjects(); return;
    case 'slideLeft': { const i = visibleSlide(); if (shiftSlide(i, -1)) { commit(); view.ox += W * view.s; clampView(); } return; }
    case 'slideRight': { const i = visibleSlide(); if (shiftSlide(i, 1)) { commit(); view.ox -= W * view.s; clampView(); } return; }
    case 'slideInsert': { if (state.slides >= 20) { toast('Maximal 20 Slides'); return; } const i = visibleSlide(); state.layers.forEach(x => { if (x.x > (i + 1) * W) x.x += W; }); state.slides++; fit(); commit(); toast(`Leere Slide ${i + 2} eingefügt`); return; }
    case 'slideDelete': { if (state.slides <= 1) return; const i = visibleSlide(); state.layers = state.layers.filter(x => { const b = boxOf(x); return !(x.x - b.ow / 2 >= i * W - 1 && x.x + b.ow / 2 <= (i + 1) * W + 1); });
      state.layers.forEach(x => { if (x.x > (i + 1) * W) x.x -= W; }); state.slides--; fit(); commit(); toast(`Slide ${i + 1} gelöscht`); return; }
    case 'curveReset': P.curves[ui.curveCh] = ID_CURVE.slice(); commit(); return;
    case 'curveS': P.curves[ui.curveCh] = [0, .2, .5, .8, 1]; commit(); return;
    case 'curveFade': P.curves[ui.curveCh] = [.08, .27, .5, .74, .95]; commit(); return;
    case 'gradeReset': P.grade = defParams().grade; commit(); return;
    case 'pick': ui.pick = !ui.pick; renderPanel(); updateTop(); return;
    case 'rot90': { const a0 = cropAspect(l), h0 = l.w / a0; l.rot90 = (l.rot90 + 1) % 4; if (l.crop.ratio === 'orig') l.w = h0; resetGeoEdits(l); commit(); return; }
    case 'flip': l.flip = !l.flip; resetGeoEdits(l); commit(); return;
    case 'cropReset': l.crop = { ratio: 'orig', zoom: 1, px: .5, py: .5 }; l.rot = 0; P.persp = { v: 0, h: 0 }; commit(); return;
    case 'fillSlide': coverSlide(l, clamp(Math.floor(l.x / W), 0, state.slides - 1)); commit(); return;
    case 'fillAll': coverAll(l); commit(); return;
    case 'center': l.x = (clamp(Math.floor(l.x / W), 0, state.slides - 1) + .5) * W; l.y = H / 2; commit(); return;
    case 'replace': ui.replaceId = l.id; $('#fileIn').removeAttribute('multiple'); $('#fileIn').click(); setTimeout(() => $('#fileIn').setAttribute('multiple', ''), 1000); return;
    case 'bgBlur': { const c = clone(l); c.id = newId(); c.shape = 'rect'; c.border = 0; c.shadow = false; c.opacity = 1; c.blend = 'source-over'; c.crop = { ratio: 'orig', zoom: 1, px: .5, py: .5 }; coverAll(c);
      c.params.blur = { mode: 'radial', x: .5, y: .5, size: 0, feather: .02, amt: 100, angle: 0 }; c.params.exposure = -.35; c.params.stamp = false; c.params.masks = []; c.params.brush = []; c.params.heal = [];
      state.layers.unshift(c); commit(); toast('Unscharfer Hintergrund über alle Slides angelegt'); return; }
    case 'lock': l.locked = !l.locked; commit(); toast(l.locked ? 'Gesperrt' : 'Entsperrt'); return;
    case 'front': { const i = state.layers.indexOf(l); if (i < state.layers.length - 1) { state.layers.splice(i, 1); state.layers.splice(i + 1, 0, l); } commit(); toast('Eine Ebene nach vorn'); return; }
    case 'back': { const i = state.layers.indexOf(l); if (i > 0) { state.layers.splice(i, 1); state.layers.splice(i - 1, 0, l); } commit(); toast('Eine Ebene nach hinten'); return; }
    case 'dup': { const c = clone(l); c.id = newId(); c.x += 60; c.y += 60; c.locked = false; state.layers.splice(state.layers.indexOf(l) + 1, 0, c); ui.sel = c.id; commit(); return; }
    case 'del': state.layers = state.layers.filter(x => x !== l); cache.delete(l.id); ui.sel = null; commit(); toast('Gelöscht – oben links rückgängig machen'); return;
    case 'copy': ui.clip = clone(l.params); toast('Bearbeitung kopiert'); renderPanel(); return;
    case 'paste': if (ui.clip) { const keep = { heal: P.heal, brush: P.brush, masks: P.masks }; l.params = upgradeParams(clone(ui.clip)); Object.assign(l.params, keep); commit(); toast('Bearbeitung eingefügt'); } return;
    case 'applyAll': state.layers.filter(x => x.type === 'image' && x !== l).forEach(x => { const keep = { heal: x.params.heal, brush: x.params.brush, masks: x.params.masks }; x.params = clone(l.params); Object.assign(x.params, keep); }); commit(); toast('Auf alle Fotos übertragen'); return;
    case 'savePreset': { const name = ($('#presetName').value || '').trim() || `Preset ${loadPresets().length + 1}`; const ps = loadPresets(), pp = clone(P); pp.heal = []; pp.brush = []; pp.masks = []; pp.persp = { v: 0, h: 0 }; ps.push({ name, params: pp }); savePresets(ps); renderPanel(); toast(`„${name}“ gesichert`); return; }
    case 'clearPresets': if (!ui.confirmPresets) { ui.confirmPresets = true; renderPanel(); return; } ui.confirmPresets = false; savePresets([]); renderPanel(); toast('Presets gelöscht'); return;
    case 'exportPresets': { const blob = new Blob([JSON.stringify({ streifzug: 1, presets: loadPresets() }, null, 1)], { type: 'application/json' }); webSave([{ blob, name: 'streifzug-presets.json' }]); return; }
    case 'maskDel': P.masks.splice(ui.maskSel, 1); ui.maskSel = Math.max(0, ui.maskSel - 1); commit(); return;
    case 'maskDup': { const m = clone(P.masks[ui.maskSel]); m.x = clamp(m.x + .05); m.y = clamp(m.y + .05); P.masks.push(m); ui.maskSel = P.masks.length - 1; commit(); return; }
    case 'brushUndo': P.brush.pop(); commit(); return;
    case 'brushClear': P.brush = []; commit(); return;
    case 'healUndo': P.heal.pop(); commit(); return;
    case 'healClear': P.heal = []; commit(); return;
  }
}
/* Drehen/Spiegeln verändert das Bildkoordinatensystem – ortsgebundene Bearbeitungen passen dann nicht mehr */
function resetGeoEdits(l) { const P = l.params; if (P.masks.length || P.brush.length || P.heal.length) toast('Punkte, Pinsel und Reparaturen wurden zurückgesetzt'); P.masks = []; P.brush = []; P.heal = []; }
function loadPresets() { try { return JSON.parse(localStorage.getItem('streifzug.presets') || '[]'); } catch { return []; } }
function savePresets(p) { try { localStorage.setItem('streifzug.presets', JSON.stringify(p)); } catch { toast('Presets können in diesem Browser nicht gespeichert werden.'); } }
async function importPresets(f) {
  if (!f) return;
  try { const j = JSON.parse(await f.text()), list = (j.presets || j).filter(p => p && p.name && p.params); if (!list.length) throw 0; savePresets(loadPresets().concat(list.map(p => ({ name: String(p.name).slice(0, 28), params: upgradeParams(p.params) })))); renderPanel(); toast(`${list.length} Preset${list.length === 1 ? '' : 's'} importiert`); }
  catch { toast('Die Datei enthält keine Streifzug-Presets.'); }
}
function markBands() { const l = selLayer(); panel.querySelectorAll('.band').forEach((b, i) => b.classList.toggle('mod', l.params.hsl[i].some(v => v))); }
function markGrade() { const l = selLayer(); panel.querySelectorAll('[data-grade]').forEach(b => { const g = l.params.grade[b.dataset.grade]; b.querySelector('.gdot').style.setProperty('--c', `hsl(${g[0]} ${g[1] ? 80 : 0}% 55%)`); }); }

/* Look-Vorschaubilder */
function fillThumbs() {
  const l = selLayer(); if (!l) return; const c = ensureCache(l); if (!c) return;
  if (!c.thumbAux) { const o = c.prep, s = 140 / Math.min(o.width, o.height), t = mk(o.width * s, o.height * s); t.getContext('2d').drawImage(o, 0, 0, t.width, t.height); c.thumbAux = makeAux(t); c.thumbs = {}; }
  const base = { ...l.params, stamp: false, masks: [], brush: [], heal: [], blur: { ...l.params.blur, mode: 'off' } }, keyBase = JSON.stringify({ ...base, look: '', lookAmt: 100 });
  const cells = [...panel.querySelectorAll('canvas[data-thumb]')]; let i = 0;
  const step = () => { // gestaffelt, damit die Oberfläche flüssig bleibt
    const t0 = performance.now();
    while (i < cells.length && performance.now() - t0 < 30) {
      const cnv = cells[i++], k = cnv.dataset.thumb, key = keyBase + k;
      if (!c.thumbs[k] || c.thumbs[k].key !== key) c.thumbs[k] = { key, img: processImage(c.thumbAux, { ...base, look: k, lookAmt: 100 }, Date.now()) };
      const im = c.thumbs[k].img, x = cnv.getContext('2d'), s = Math.min(im.width, im.height);
      x.drawImage(im, (im.width - s) / 2, (im.height - s) / 2, s, s, 0, 0, 140, 140);
    }
    if (i < cells.length && cells[i].isConnected) requestAnimationFrame(step);
  };
  step();
}
/* Histogramm */
function drawHist() {
  const cnv = $('#hist'), l = selLayer(); if (!cnv || !l) return; const c = cache.get(l.id); if (!c || !c.proc) return;
  const dpr = Math.min(3, devicePixelRatio || 1), W = cnv.clientWidth * dpr, H = cnv.clientHeight * dpr; cnv.width = W; cnv.height = H;
  const src = c.proc, s = Math.min(1, 300 / Math.max(src.width, src.height)), t = mk(src.width * s, src.height * s);
  t.getContext('2d').drawImage(src, 0, 0, t.width, t.height); const d = t.getContext('2d').getImageData(0, 0, t.width, t.height).data;
  const hr = new Float32Array(64), hg = new Float32Array(64), hb = new Float32Array(64);
  for (let i = 0; i < d.length; i += 4) { hr[d[i] >> 2]++; hg[d[i + 1] >> 2]++; hb[d[i + 2] >> 2]++; }
  const mx = Math.max(...hr.slice(1, 63), ...hg.slice(1, 63), ...hb.slice(1, 63)) || 1, x = cnv.getContext('2d');
  x.globalCompositeOperation = 'lighter';
  [[hr, 'rgba(229,72,77,.55)'], [hg, 'rgba(79,178,107,.55)'], [hb, 'rgba(63,127,224,.6)']].forEach(([a, col]) => {
    x.fillStyle = col; x.beginPath(); x.moveTo(0, H);
    for (let i = 0; i < 64; i++) x.lineTo(i / 63 * W, H - Math.min(1, a[i] / mx) * H * .92);
    x.lineTo(W, H); x.closePath(); x.fill();
  });
}
/* Gradationskurve */
function setupCurve() {
  const cnv = $('#curve'); if (!cnv) return; const l = selLayer();
  const draw = () => {
    const dpr = Math.min(3, devicePixelRatio || 1), W = cnv.clientWidth * dpr, H = cnv.clientHeight * dpr; cnv.width = W; cnv.height = H;
    const x = cnv.getContext('2d'), pad = 14 * dpr, iw = W - 2 * pad, ih = H - 2 * pad, ys = l.params.curves[ui.curveCh];
    const col = { rgb: COL.fg, r: '#e5484d', g: '#4fb26b', b: '#3f7fe0' }[ui.curveCh];
    x.strokeStyle = 'rgba(255,255,255,.08)'; x.lineWidth = 1 * dpr;
    for (let i = 0; i <= 4; i++) { x.beginPath(); x.moveTo(pad + iw * i / 4, pad); x.lineTo(pad + iw * i / 4, pad + ih); x.stroke(); x.beginPath(); x.moveTo(pad, pad + ih * i / 4); x.lineTo(pad + iw, pad + ih * i / 4); x.stroke(); }
    x.strokeStyle = 'rgba(255,255,255,.18)'; x.setLineDash([4 * dpr, 4 * dpr]); x.beginPath(); x.moveTo(pad, pad + ih); x.lineTo(pad + iw, pad); x.stroke(); x.setLineDash([]);
    const f = curveFn(ys); x.strokeStyle = col; x.lineWidth = 2 * dpr; x.beginPath();
    for (let i = 0; i <= 100; i++) { const v = i / 100; const yy = clamp(f(v)); i ? x.lineTo(pad + v * iw, pad + (1 - yy) * ih) : x.moveTo(pad + v * iw, pad + (1 - yy) * ih); } x.stroke();
    ys.forEach((v, i) => { x.fillStyle = col; x.beginPath(); x.arc(pad + i / 4 * iw, pad + (1 - v) * ih, 7 * dpr, 0, Math.PI * 2); x.fill(); x.strokeStyle = COL.stage; x.lineWidth = 2 * dpr; x.stroke(); });
  };
  draw();
  let idx = -1;
  const pos = e => { const r = cnv.getBoundingClientRect(), pad = 14; return { x: clamp((e.clientX - r.left - pad) / (r.width - 2 * pad)), y: clamp(1 - (e.clientY - r.top - pad) / (r.height - 2 * pad)) }; };
  cnv.onpointerdown = e => { cnv.setPointerCapture(e.pointerId); const p = pos(e); idx = Math.round(p.x * 4); l.params.curves[ui.curveCh][idx] = +p.y.toFixed(3); draw(); requestRender(); };
  cnv.onpointermove = e => { if (idx < 0) return; const p = pos(e); l.params.curves[ui.curveCh][idx] = +p.y.toFixed(3); draw(); requestRender(); };
  cnv.onpointerup = cnv.onpointercancel = () => { if (idx >= 0) { idx = -1; pushHistory(); } };
}

/* ---------- Fotos laden ---------- */
async function addFiles(files) {
  files = [...files].filter(f => f.type.startsWith('image/') || /\.(heic|heif|jpe?g|png|webp|avif)$/i.test(f.name));
  if (!files.length) return;
  if (ui.sample) { state.layers = []; cache.clear(); sources.clear(); ui.sample = false; ui.projectId = null; ui.projectName = 'Mein Karussell'; }
  toast(files.length === 1 ? 'Foto wird geladen …' : `${files.length} Fotos werden geladen …`);
  const start = visibleSlide(); const added = [];
  for (let k = 0; k < files.length; k++) {
    const f = files[k], id = 's' + newId();
    const src = { kind: 'file', file: f, nw: 0, nh: 0, date: f.lastModified || Date.now(), base: null };
    sources.set(id, src);
    try { src.base = await loadScaled(src, PREVIEW_PX); }
    catch { toast(`„${f.name}“ konnte nicht gelesen werden.`); sources.delete(id); continue; }
    const l = newImageLayer(id); coverSlide(l, (start + k) % state.slides);
    state.layers.push(l); added.push(l); requestRender();
  }
  if (added.length) { ui.tab.image = 'looks'; selectLayer(added[added.length - 1].id); pushHistory(); toast(added.length === 1 ? 'Foto hinzugefügt' : `${added.length} Fotos hinzugefügt`); }
}
async function replacePhoto(f) {
  const l = state.layers.find(x => x.id === ui.replaceId); ui.replaceId = null; if (!l || !f) return;
  const id = 's' + newId(), src = { kind: 'file', file: f, nw: 0, nh: 0, date: f.lastModified || Date.now(), base: null };
  try { src.base = await loadScaled(src, PREVIEW_PX); } catch { toast('Foto konnte nicht gelesen werden.'); return; }
  sources.set(id, src); l.srcId = id; l.stampMs = src.date; resetGeoEdits(l); cache.delete(l.id); commit(); toast('Foto ersetzt – Bearbeitung bleibt');
}

/* ---------- Projekte ---------- */
function resetSession() { cache.clear(); sources.clear(); hist = []; hIdx = -1; ui.sel = null; ui.clip = ui.clip || null; savedSrc = new Set(); }
function newProject() {
  saveNow(); resetSession(); ui.confirmClear = false; ui.sample = false; ui.projectId = null; ui.projectName = 'Mein Karussell';
  state.layers = []; state.bg = { c1: '#efece6', c2: '#a8c5b5', grad: false, dir: 'h', pattern: 'none' }; fit(); pushHistory(); renderUI(); toast('Neues Projekt');
}
function loadSample() {
  if (!ui.sample) saveNow();
  resetSession(); ui.sample = true; ui.projectId = null; ui.projectName = 'Beispiel'; state.format = '4:5'; state.slides = 3;
  state.bg = { c1: '#efece6', c2: '#a8c5b5', grad: false, dir: 'h', pattern: 'none' };
  const id = 's0'; sources.set(id, { kind: 'gen', draw: drawSample, nw: 4800, nh: 2000, date: Date.now(), base: drawSample(PREVIEW_PX) });
  const { W, H } = dims();
  const pano = newImageLayer(id); coverAll(pano); pano.x = W * state.slides / 2 + W * .2;
  pano.params.look = 'gold'; pano.params.lookAmt = 70;
  const txt = newTextLayer(W * .5, H * .16, 'Krummhörn, Oktober'); txt.size = 120;
  state.layers = [pano, txt]; fit(); pushHistory(); renderUI(); store.lastProject('');
}
async function openProject(id, quiet) {
  const r = await store.loadProject(id); if (!r) return false;
  if (!quiet) { await saveNow(); toast('Projekt wird geöffnet …'); }
  resetSession(); ui.sample = false; ui.projectId = id; ui.projectName = r.project.name || 'Mein Karussell';
  for (const f of r.files) { const src = { kind: 'file', file: f.blob, nw: 0, nh: 0, date: f.date || Date.now(), base: null };
    try { src.base = await loadScaled(src, PREVIEW_PX); sources.set(f.srcId, src); savedSrc.add(f.srcId); } catch { console.warn('Quelle fehlt', f.srcId); } }
  const doc = r.project.doc; state.format = FORMATS[doc.format] ? doc.format : '4:5'; state.slides = doc.slides; state.bg = Object.assign({ dir: 'h', pattern: 'none' }, doc.bg);
  state.layers = doc.layers.filter(l => l.type !== 'image' || sources.has(l.srcId));
  state.layers.forEach(l => { if (l.type === 'image') { upgradeParams(l.params); if (l.stampMs == null) l.stampMs = sources.get(l.srcId).date; } });
  ids.n = Math.max(1, ...state.layers.map(l => l.id + 1), ...[...sources.keys()].map(k => +k.slice(1) + 1 || 1));
  store.lastProject(id); fit(); pushHistory(); renderUI(); return true;
}
async function openProjects() {
  await saveNow();
  const sheet = $('#projSheet'), grid = $('#projGrid'); sheet.hidden = false; grid.innerHTML = '<p class="progress">Lade …</p>';
  let list = []; try { list = await store.listProjects(); } catch { grid.innerHTML = '<p class="note">Projekte können in diesem Browser nicht gespeichert werden (privates Fenster?).</p>'; return; }
  grid.querySelectorAll('img').forEach(i => URL.revokeObjectURL(i.src));
  grid.innerHTML = list.length ? list.map(p => `<div class="proj${p.id === ui.projectId ? ' cur' : ''}"><button class="proj-open" data-open="${p.id}">${p.thumb ? `<img src="${URL.createObjectURL(p.thumb)}" alt="">` : '<span class="proj-empty"></span>'}</button>
    <div class="proj-meta"><b>${esc(p.name)}</b><span>${p.format || ''} · ${p.slides || '?'} Slides · ${new Date(p.updated).toLocaleDateString('de-DE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span></div>
    <div class="row">${`<button class="btn ghost small" data-pdup="${p.id}">Duplizieren</button><button class="btn danger small" data-pdel="${p.id}">Löschen</button>`}</div></div>`).join('')
    : '<p class="note">Noch keine gespeicherten Projekte. Sobald du ein eigenes Foto hinzufügst, speichert Streifzug automatisch.</p>';
}
$('#projGrid').addEventListener('click', async e => {
  const b = e.target.closest('button'); if (!b) return; const d = b.dataset;
  if (d.open) { $('#projSheet').hidden = true; if (d.open !== ui.projectId) await openProject(d.open); }
  else if (d.pdup) { await store.duplicateProject(d.pdup, store.newProjectId()); openProjects(); toast('Kopie angelegt'); }
  else if (d.pdel) { if (b.dataset.sure) { await store.deleteProject(d.pdel); if (d.pdel === ui.projectId) { ui.projectId = null; store.lastProject(''); newProject(); } openProjects(); toast('Projekt gelöscht'); } else { b.dataset.sure = '1'; b.textContent = 'Wirklich löschen?'; } }
});
$('#projNew').addEventListener('click', () => { $('#projSheet').hidden = true; newProject(); });
$('#closeProj').addEventListener('click', () => $('#projSheet').hidden = true);
$('#projBtn').addEventListener('click', openProjects);

/* ---------- Vorschau ---------- */
function openPreview() {
  selectLayer(null);
  const { W, H } = dims(), track = $('#igTrack'), dots = $('#igDots'); track.innerHTML = ''; dots.innerHTML = '';
  const dpr = Math.min(3, devicePixelRatio || 1), cw = Math.round(Math.min(440, innerWidth - 32) * dpr), chh = Math.round(cw * H / W);
  $('#previewSheet').hidden = false;
  for (let i = 0; i < state.slides; i++) {
    const c = mk(cw, chh); const x = c.getContext('2d');
    x.scale(cw / W, cw / W); x.translate(-i * W, 0); drawScene(x); track.appendChild(c);
    dots.insertAdjacentHTML('beforeend', `<i class="${i ? '' : 'on'}"></i>`);
  }
  $('#igCount').textContent = `1/${state.slides}`; track.scrollLeft = 0;
}
$('#igTrack').addEventListener('scroll', e => { const t = e.target, i = Math.round(t.scrollLeft / t.clientWidth); $('#igCount').textContent = `${i + 1}/${state.slides}`; [...$('#igDots').children].forEach((d, k) => d.classList.toggle('on', k === i)); }, { passive: true });

/* ---------- Export ---------- */
const pause = ms => new Promise(r => setTimeout(r, ms));
const coarse = () => matchMedia('(pointer:coarse)').matches;
let exportBlobs = [];
const expOpt = { type: 'jpeg', pano: false };
async function webSave(items) {
  const files = items.map(b => new File([b.blob], b.name, { type: b.blob.type }));
  if (coarse() && navigator.canShare && navigator.canShare({ files })) {
    try { await navigator.share({ files }); return true; } catch (e) { if (e && e.name === 'AbortError') return false; }
  }
  for (const b of items) { const a = document.createElement('a'), url = URL.createObjectURL(b.blob); a.href = url; a.download = b.name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000); await pause(250); }
  return true;
}
async function doExport() {
  if (!state.layers.length) { toast('Füge zuerst ein Foto hinzu.'); return; }
  selectLayer(null);
  const sheet = $('#exportSheet'), grid = $('#expGrid'), prog = $('#expProgress'), note = $('#expNote');
  exportBlobs.forEach(b => URL.revokeObjectURL(b.url)); exportBlobs = [];
  sheet.hidden = false; grid.innerHTML = ''; note.textContent = ''; $('#saveAll').hidden = true; renderExpOpts();
  const { W, H } = dims(), procs = new Map(), imgs = state.layers.filter(l => l.type === 'image' && !l.hidden);
  const mime = expOpt.type === 'png' ? 'image/png' : 'image/jpeg', ext = expOpt.type === 'png' ? 'png' : 'jpg';
  try {
    for (let k = 0; k < imgs.length; k++) {
      const l = imgs[k]; prog.textContent = `Foto ${k + 1} von ${imgs.length} wird in voller Auflösung entwickelt …`; await pause(30);
      const src = sources.get(l.srcId); if (!src) continue;
      const odd = l.rot90 % 2, onw = odd ? src.nh : src.nw, onh = odd ? src.nw : src.nh;
      const [, , swp] = cropRect(onw, onh, l), need = Math.max(onw, onh) * Math.min(1, l.w / swp) * 1.05;
      const base = await loadScaled(src, Math.min(4320, Math.ceil(need))), o = orientCanvas(base, l.rot90, l.flip), pr = prepare(o, l.params);
      procs.set(l.id, processImage(makeAux(pr), l.params, l.stampMs));
    }
    const push = async (c, name, label) => {
      const blob = await new Promise(r => c.toBlob(r, mime, .93)); const url = URL.createObjectURL(blob), i = exportBlobs.length; exportBlobs.push({ blob, url, name });
      grid.insertAdjacentHTML('beforeend', `<div class="exp-item${label === 'Panorama' ? ' wide' : ''}"><img src="${url}" alt="${label}"><div class="row"><span class="num">${label} · ${c.width}×${c.height}</span><button class="btn ghost small" data-save="${i}">Sichern</button></div></div>`);
    };
    for (let i = 0; i < state.slides; i++) {
      prog.textContent = `Slide ${i + 1} von ${state.slides} wird gerendert …`; await pause(20);
      const c = mk(W, H), x = c.getContext('2d'); x.translate(-i * W, 0); drawScene(x, { procs });
      await push(c, `streifzug-${String(i + 1).padStart(2, '0')}.${ext}`, `${i + 1} / ${state.slides}`);
    }
    if (expOpt.pano && state.slides > 1) {
      const T = W * state.slides, s = Math.min(1, Math.sqrt(16e6 / (T * H))), c = mk(T * s, H * s), x = c.getContext('2d'); x.scale(s, s); drawScene(x, { procs });
      await push(c, `streifzug-panorama.${ext}`, 'Panorama');
    }
  } catch (err) { console.error(err); prog.textContent = 'Der Export ist fehlgeschlagen. Vermutlich war ein Foto zu groß für den Speicher – versuche es mit weniger Fotos auf einmal.'; return; }
  prog.textContent = `${state.slides} ${state.slides === 1 ? 'Slide' : 'Slides'} fertig · ${expOpt.type.toUpperCase()}, ${W}×${H} px`;
  $('#saveAll').hidden = exportBlobs.length < 2;
  note.innerHTML = coarse() ? '<b>So geht’s weiter:</b> „Alle sichern“ öffnet das Teilen-Menü – dort „Bilder sichern“ wählen. In Instagram dann die Slides in der Reihenfolge 1, 2, 3 … auswählen.'
    : '<b>So geht’s weiter:</b> „Sichern“ lädt die Slides herunter. In Instagram dann alle Slides in der Reihenfolge 1, 2, 3 … auswählen.';
}
function renderExpOpts() {
  $('#expOpts').innerHTML = `${chip('data-etype="jpeg"', 'JPEG', expOpt.type === 'jpeg')}${chip('data-etype="png"', 'PNG', expOpt.type === 'png')}${state.slides > 1 ? chip('data-epano="1"', '+ Panorama', expOpt.pano) : ''}`;
}
$('#expOpts').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; if (b.dataset.etype) expOpt.type = b.dataset.etype; if (b.dataset.epano) expOpt.pano = !expOpt.pano; doExport(); });
$('#expGrid').addEventListener('click', async e => { const b = e.target.closest('[data-save]'); if (!b) return; const it = exportBlobs[+b.dataset.save]; if (it && await webSave([it])) { b.textContent = 'Gesichert'; b.disabled = true; } });
$('#saveAll').addEventListener('click', async () => { if (await webSave(exportBlobs)) $('#expGrid').querySelectorAll('[data-save]').forEach(b => { b.textContent = 'Gesichert'; b.disabled = true; }); });
$('#closeExport').addEventListener('click', () => $('#exportSheet').hidden = true);
$('#closePreview').addEventListener('click', () => $('#previewSheet').hidden = true);
$('#previewBtn').addEventListener('click', openPreview);
$('#exportBtn').addEventListener('click', doExport);
$('#undoBtn').addEventListener('click', undo);
$('#redoBtn').addEventListener('click', redo);
document.addEventListener('keydown', e => {
  if (e.target.matches('input,textarea')) return;
  const l = selLayer();
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
  else if ((e.key === 'Delete' || e.key === 'Backspace') && l) { e.preventDefault(); action('del', l); }
  else if (l && !l.locked && e.key.startsWith('Arrow')) { e.preventDefault(); const s = e.shiftKey ? 50 : 5; if (e.key === 'ArrowLeft') l.x -= s; if (e.key === 'ArrowRight') l.x += s; if (e.key === 'ArrowUp') l.y -= s; if (e.key === 'ArrowDown') l.y += s; requestRender(); clearTimeout(keyT); keyT = setTimeout(pushHistory, 400); }
  else if (e.key === 'Escape') { for (const s of ['#exportSheet', '#previewSheet', '#projSheet']) if (!$(s).hidden) { $(s).hidden = true; return; } if (ui.pick) { ui.pick = false; renderPanel(); } else selectLayer(null); }
});
let keyT;
stage.addEventListener('dragover', e => e.preventDefault());
stage.addEventListener('drop', e => { e.preventDefault(); if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files); });

/* ---------- Start ---------- */
new ResizeObserver(resize).observe(stage);
resize();
(async () => {
  const last = store.lastProject();
  let ok = false;
  if (last) { try { ok = await openProject(last, true); } catch (err) { console.warn(err); } }
  if (!ok) loadSample();
})();
if (document.fonts) {
  Promise.all(FONTS.map(f => document.fonts.load(`${f[2]} 40px "${f[0]}"`))).catch(() => {}).then(() => { flags.fontsTick++; requestRender(); });
}
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
window.__streifzug = { state, ui, view, sources, cache, action, applyTemplate, selectLayer, commit, render, addFiles, saveNow, openProject,
  snapshot: (h = 360) => { const { W, H } = dims(), T = W * state.slides, c = mk(T * h / H, h), x = c.getContext('2d'); x.scale(h / H, h / H); drawScene(x); return c.toDataURL('image/jpeg', .85); } };
