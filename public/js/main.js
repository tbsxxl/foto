/* Streifzug – Oberfläche, Gesten, Werkzeuge, Export */
import { haptic, $, clamp, clone, de, esc, state, ui, sources, cache, ids, newId, dims, selLayer, toast, defParams, upgradeParams,
  FORMATS, HSL_BANDS, LOOKS, LOOK_CATS, FONTS, TEXT_COLORS, BG_COLORS, FRAME_COLORS, RATIOS, ID_CURVE, BLENDS, STAMP_COLORS } from './core.js';
import { mk, makeAux, processImage, prepare, curveFn, pickHealSource, wbFromPoint, LEAKS, shrink } from './process.js';
import { flags, getCut, hasCut, loadScaled, orientCanvas, cropAspect, cropRect, boxOf, drawScene, ensureCache, releaseAux, cacheKey, drawSample, SHAPES, BG_PATTERNS, FRAMES } from './scene.js';
import { newImageLayer, newTextLayer, newShapeLayer, coverSlide, coverAll, computeBox } from './layers.js';
import { isDoodle, doodleSVG, tapeType, TAPE_KINDS, TAPE_PATTERNS, TAPE_COLORS, CLIP_COLORS, BINDER_COLORS } from './props.js';
import { TEMPLATES, TPL_CATS, tplSVG, tplDef, applyTemplate, layout, relink, shufflePhotos, releaseTemplate } from './templates.js';
import * as store from './store.js';
import { cutHooks, maskToPNG, cleanMask } from './process.js';

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
  ctx.strokeStyle = COL.accent; ctx.lineWidth = 1 / s;
  for (const g of ui.guides) { ctx.beginPath(); if (g.x != null) { ctx.moveTo(g.x, -20 / s); ctx.lineTo(g.x, H + 20 / s); } else { ctx.moveTo(-20 / s, g.y); ctx.lineTo(T + 20 / s, g.y); } ctx.stroke(); }
  const l = selLayer();
  if (l) {
    const b = boxOf(l), tool = activeTool();
    ctx.save(); ctx.translate(l.x, l.y); ctx.rotate(l.rot * Math.PI / 180);
    ctx.lineWidth = 2 / s; ctx.strokeStyle = tool ? 'rgba(255,255,255,.35)' : COL.accent; ctx.strokeRect(-b.ow / 2, -b.oh / 2, b.ow, b.oh);
    if (!tool && !l.locked && edgeOK(l)) { const pw = 5 / s, pl = 24 / s; ctx.fillStyle = '#ffffff'; ctx.strokeStyle = COL.accent; ctx.lineWidth = 1.5 / s;
      for (const [cx, cy, vert] of [[-b.ow / 2, 0, 1], [b.ow / 2, 0, 1], [0, -b.oh / 2, 0], [0, b.oh / 2, 0]]) { const w0 = vert ? pw * 2 : pl, h0 = vert ? pl : pw * 2; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(cx - w0 / 2, cy - h0 / 2, w0, h0, pw) : ctx.rect(cx - w0 / 2, cy - h0 / 2, w0, h0); ctx.fill(); ctx.stroke(); } }
    if (!tool && !l.locked) { const r = 11 / s; ctx.fillStyle = COL.accent; ctx.beginPath(); ctx.arc(b.ow / 2, -b.oh / 2, r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#1d1704'; ctx.lineWidth = 1.8 / s; ctx.beginPath(); ctx.arc(b.ow / 2, -b.oh / 2, r * .48, -.4, Math.PI * 1.25); ctx.stroke(); }
    if (tool) drawToolOverlay(l, b);
    if (ui.dropId) { const o = state.layers.find(x => x.id === ui.dropId); if (o) { ctx.restore(); ctx.save(); ctx.translate(o.x, o.y); ctx.rotate(o.rot * Math.PI / 180); const ob = boxOf(o); ctx.lineWidth = 6 / s; ctx.strokeStyle = '#4ade80'; ctx.setLineDash([14 / s, 8 / s]); ctx.strokeRect(-ob.w / 2, -ob.h / 2 + ob.iy, ob.w, ob.h); ctx.setLineDash([]); } }
    ctx.restore();
  }
  if (flags.histDirty) { flags.histDirty = false; drawHist(); }
  if (flags.pending) { flags.pending = false; setTimeout(requestRender, 40); }
  updateChrome();
}
/* Bedienelemente auf der Bühne */
const quick = $('#quick'), slideNav = $('#slideNav'), emptyEl = $('#emptyState');
let navKey = '';
function updateChrome() {
  const l = selLayer(), tool = activeTool();
  quick.hidden = !l; void tool;
  emptyEl.hidden = state.layers.length > 0;
  const vs = visibleSlide(), key = state.slides + ':' + vs;
  if (key !== navKey) { if (navKey && gest && /^(pan|pinchView)$/.test(gest.mode) && navKey.split(':')[0] === String(state.slides)) haptic(); navKey = key;
    slideNav.innerHTML = (state.slides > 1 ? Array.from({ length: state.slides }, (_, i) => `<button data-slide="${i}" aria-label="Slide ${i + 1}" aria-current="${i === vs}">${i + 1}</button>`).join('') : '')
      + `<button data-slide="all" class="all" aria-label="Alle Slides zeigen" title="Alle zeigen">${sv('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>')}</button>`; }
}
quick.addEventListener('click', e => { const b = e.target.closest('[data-q]'), l = selLayer(); if (!b || !l) return; if (b.dataset.q === 'menu') { const r = b.getBoundingClientRect(); openMenu(layerMenu(l), r.right, r.bottom + 4, 'tr'); } else action(b.dataset.q, l); });

/* ---------- Kontextmenü wie in iOS (lange drücken oder „•••“) ---------- */
const ctxEl = $('#ctx'), ctxMenu = $('#ctxMenu');
const MI = {
  copy: sv('<rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>'), dup: sv('<rect x="3" y="3" width="13" height="13" rx="2.5"/><path d="M8 21h10a3 3 0 0 0 3-3V8M9.5 9.5h0"/>'),
  paste: sv('<rect x="5" y="4" width="14" height="17" rx="2.5"/><path d="M9 4.5V3.5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1z"/>'),
  front: sv('<rect x="8" y="8" width="12" height="12" rx="2" fill="currentColor" fill-opacity=".25"/><path d="M4 14V6a2 2 0 0 1 2-2h8"/>'), back: sv('<rect x="4" y="4" width="12" height="12" rx="2" fill="currentColor" fill-opacity=".25"/><path d="M20 10v8a2 2 0 0 1-2 2h-8"/>'),
  crop: sv('<path d="M6 2v16h16"/><path d="M2 6h16v16"/>'), replace: sv('<path d="M4 12a8 8 0 0 1 14-5.3L20 9M20 4v5h-5M20 12a8 8 0 0 1-14 5.3L4 15M4 20v-5h5"/>'),
  all: sv('<rect x="2" y="6" width="6" height="12" rx="1.5"/><rect x="9" y="6" width="6" height="12" rx="1.5"/><rect x="16" y="6" width="6" height="12" rx="1.5"/>'),
  lock: sv('<rect x="5" y="11" width="14" height="10" rx="2.5"/><path d="M8 11V7.5a4 4 0 0 1 8 0V11"/>'), unlock: sv('<rect x="5" y="11" width="14" height="10" rx="2.5"/><path d="M8 11V7.5a4 4 0 0 1 7.7-1.5"/>'),
  del: sv('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'), text: sv('<path d="M5 6V4h14v2M12 4v16M9 20h6"/>'),
  photo: sv('<rect x="3" y="5" width="18" height="14" rx="2.5"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 8"/>'), tpl: sv('<rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="5" rx="1.5"/><rect x="13" y="10" width="8" height="11" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/>')
};
function layerMenu(l) {
  const img = l.type === 'image' && l.srcId;
  return [['Kopieren', 'copy', () => copyLayer(l)], ['Duplizieren', 'dup', () => action('dup', l)], ui.layerClip ? ['Einfügen', 'paste', pasteLayer] : null, '-',
    img ? ['Ausschnitt & Zoom', 'crop', () => enterCrop(true)] : null, img ? ['Foto ersetzen', 'replace', () => action('replace', l)] : null,
    ['Nach vorn', 'front', () => action('front', l)], ['Nach hinten', 'back', () => action('back', l)],
    state.slides > 1 ? ['Auf jede Slide', 'all', () => action('toAll', l)] : null, [l.locked ? 'Entsperren' : 'Sperren', l.locked ? 'unlock' : 'lock', () => action('lock', l)], '-',
    ['Löschen', 'del', () => action('del', l), true]].filter(Boolean);
}
function emptyMenu() {
  return [['Einfügen', 'paste', pasteAny], ['Text hinzufügen', 'text', addTextHere], ['Fotos hinzufügen', 'photo', () => $('#fileIn').click()],
    ['Vorlage wählen', 'tpl', () => { ui.tab.none = 'vorlagen'; selectLayer(null); }]];
}
function addTextHere() { const { W, H } = dims(), l = newTextLayer((visibleSlide() + .5) * W, H * .5); state.layers.push(l); ui.tab.text = 'text'; selectLayer(l.id); pushHistory(); setTimeout(() => $('#txtIn')?.select(), 50); }
let ctxItems = [];
function openMenu(items, x, y, anchor) {
  ctxItems = items; let k = 0;
  ctxMenu.innerHTML = items.map(it => it === '-' ? '<div class="ctx-sep" role="separator"></div>'
    : `<button class="ctx-item${it[3] ? ' danger' : ''}" role="menuitem" data-ci="${items.indexOf(it)}"><span>${it[0]}</span>${MI[it[1]] || ''}</button>`).join(''); void k;
  ctxEl.hidden = false; const w = ctxMenu.offsetWidth, h = ctxMenu.offsetHeight, m = 12;
  let left = anchor === 'tr' ? x - w : x - w / 2, top = anchor === 'tr' ? y : (y + h + 24 < innerHeight - m ? y + 18 : y - h - 18);
  left = clamp(left, m, innerWidth - w - m); top = clamp(top, m + 40, innerHeight - h - m);
  ctxMenu.style.left = left + 'px'; ctxMenu.style.top = top + 'px'; ctxMenu.style.transformOrigin = `${clamp(x - left, 0, w)}px ${clamp(y - top, 0, h)}px`;
  ctxMenu.classList.remove('in'); void ctxMenu.offsetWidth; ctxMenu.classList.add('in'); ctxMenu.querySelector('.ctx-item')?.focus({ preventScroll: true });
}
function closeMenu() { if (ctxEl.hidden) return; ctxEl.classList.add('out'); setTimeout(() => { ctxEl.hidden = true; ctxEl.classList.remove('out'); }, 160); }
ctxEl.addEventListener('click', e => { const b = e.target.closest('[data-ci]'); if (!b && lpMenu && (lpMenu.held || performance.now() < lpMenu.until)) return; lpMenu = null; closeMenu(); if (b) { const it = ctxItems[+b.dataset.ci]; haptic(); setTimeout(it[2], 10); } });
ctxEl.addEventListener('contextmenu', e => e.preventDefault());
/* Mess-Pille beim Drehen und Skalieren */
const hud = $('#hud');
function showHud(l, g) { const sz = g.size0 ? Math.round(sizeOf(l) / g.size0 * 100) : null; hud.textContent = `${Math.round(l.rot)}°${sz ? '  ·  ' + sz + ' %' : ''}`; hud.hidden = false; }
function hideHud() { hud.hidden = true; }
$('#emptyTpl').addEventListener('click', () => { ui.tab.none = 'vorlagen'; selectLayer(null); });
/* weich zu einer Slide fahren */
function animateView(to) {
  const from = { ...view }, t0 = performance.now(), d = 260;
  const step = now => { const k = Math.min(1, (now - t0) / d), e = 1 - Math.pow(1 - k, 3); view.s = from.s + (to.s - from.s) * e; view.ox = from.ox + (to.ox - from.ox) * e; view.oy = from.oy + (to.oy - from.oy) * e; render(); if (k < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}
function goSlide(i) {
  const sw = stage.clientWidth, sh = stage.clientHeight, { W, H } = dims();
  if (i === 'all') { const s = Math.min((sh - 70) / H, (sw - 32) / (W * state.slides)); animateView({ s, ox: (sw - W * state.slides * s) / 2, oy: (sh - H * s) / 2 - 14 }); return; }
  const s = Math.min((sh - 70) / H, (sw - 32) / W); animateView({ s, ox: sw / 2 - (i + .5) * W * s, oy: (sh - H * s) / 2 - 14 });
}
slideNav.addEventListener('click', e => { const b = e.target.closest('[data-slide]'); if (b) goSlide(b.dataset.slide === 'all' ? 'all' : +b.dataset.slide); });
/* Werkzeugfeld per Griff größer/kleiner ziehen (Handy) */
const dock = document.querySelector('.dock'), grab = $('#grab');
const DOCK_SNAPS = [.3, .46, .7], DOCK_MIN = .22, DOCK_MAX = .82;
function setDock(f, save, anim) {
  if (anim) { dock.classList.add('anim'); clearTimeout(setDock.t); setDock.t = setTimeout(() => dock.classList.remove('anim'), 520); }
  document.documentElement.style.setProperty('--dock', (f * 100).toFixed(1) + 'dvh'); if (save) try { localStorage.setItem('streifzug.dock', f); } catch {}
}
try { const f = +localStorage.getItem('streifzug.dock'); if (f) setDock(f); } catch {}
/* Werkzeugfeld wie ein iOS-Sheet: am Griff oder an der Titelzeile ziehen, mit Schwung loslassen, rastet federnd ein */
function dockDrag(e) {
  if (matchMedia('(min-width:900px)').matches || e.button > 0) return;
  const el = e.currentTarget, y0 = e.clientY, h0 = dock.getBoundingClientRect().height, vh = innerHeight, f0 = h0 / vh;
  let f = f0, dragging = el === grab, last = [{ y: y0, t: performance.now() }];
  if (dragging) el.setPointerCapture(e.pointerId);
  const mv = ev => {
    if (!dragging) { if (Math.abs(ev.clientY - y0) < 8) return; dragging = true; el.setPointerCapture(ev.pointerId); }
    let raw = (h0 + y0 - ev.clientY) / vh;
    // Gummiband jenseits der Grenzen
    f = raw > DOCK_MAX ? DOCK_MAX + (raw - DOCK_MAX) * .25 : raw < DOCK_MIN ? DOCK_MIN - (DOCK_MIN - raw) * .25 : raw;
    setDock(f); last.push({ y: ev.clientY, t: performance.now() }); if (last.length > 6) last.shift();
  };
  const up = () => {
    el.removeEventListener('pointermove', mv); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up);
    if (!dragging) return;
    const a = last[0], b = last[last.length - 1], v = (a.y - b.y) / Math.max(16, b.t - a.t) / vh * 1000; // Anteil pro Sekunde, nach oben positiv
    const aim = clamp(f + v * .18, DOCK_MIN, DOCK_MAX), snap = DOCK_SNAPS.reduce((p, q) => Math.abs(q - aim) < Math.abs(p - aim) ? q : p);
    if (Math.abs(snap - f0) > .01) haptic(); setDock(snap, true, true);
  };
  el.addEventListener('pointermove', mv); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
}
grab.addEventListener('pointerdown', dockDrag);
$('#panelHead').addEventListener('pointerdown', e => { if (!e.target.closest('button,input,label,a')) dockDrag(e); });
grab.addEventListener('dblclick', () => { const cur = dock.getBoundingClientRect().height / innerHeight, i = DOCK_SNAPS.findIndex(x => x > cur + .02); haptic(); setDock(DOCK_SNAPS[i < 0 ? 0 : i], true, true); });

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
const TOOL_OF_TAB = { freistellen: 'cut', selektiv: 'mask', pinsel: 'brush', reparieren: 'heal', fokus: 'focus', zuschnitt: 'crop' };
function activeTool() { const l = selLayer(); if (!l || l.type !== 'image' || !l.srcId) return null; if (ui.pick) return 'wb'; return TOOL_OF_TAB[ui.tab.image] || null; }
function drawToolOverlay(l) {
  const tool = activeTool(), G = imgGeom(l); if (!G) return; const s = view.s, p = l.params;
  if (tool === 'crop' && !l.crop.box) { // ganzes Foto halbtransparent zeigen, damit man sieht, was außerhalb des Rahmens liegt
    const x0 = -G.sx * G.k - G.bx.w / 2, y0 = -G.sy * G.k - G.bx.h / 2 + G.bx.iy, fw = G.iw * G.k, fh = G.ih * G.k;
    const fx = -G.bx.w / 2, fy = -G.bx.h / 2 + G.bx.iy, src = G.c.proc || G.c.prep;
    ctx.save(); ctx.beginPath(); ctx.rect(x0 - 2, y0 - 2, fw + 4, fh + 4); ctx.rect(fx, fy, G.bx.w, G.bx.h); ctx.clip('evenodd');
    ctx.globalAlpha = .4; ctx.drawImage(src, x0, y0, fw, fh); ctx.globalAlpha = 1; ctx.lineWidth = 1.5 / s; ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.setLineDash([6 / s, 5 / s]); ctx.strokeRect(x0, y0, fw, fh); ctx.setLineDash([]); ctx.restore(); ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,.45)'; ctx.lineWidth = 1 / s; ctx.beginPath();
    for (const f of [1 / 3, 2 / 3]) { ctx.moveTo(-G.bx.w / 2 + f * G.bx.w, -G.bx.h / 2 + G.bx.iy); ctx.lineTo(-G.bx.w / 2 + f * G.bx.w, G.bx.h / 2 + G.bx.iy); ctx.moveTo(-G.bx.w / 2, -G.bx.h / 2 + G.bx.iy + f * G.bx.h); ctx.lineTo(G.bx.w / 2, -G.bx.h / 2 + G.bx.iy + f * G.bx.h); }
    ctx.stroke(); ctx.lineWidth = 2.5 / s; ctx.strokeStyle = COL.accent; ctx.strokeRect(-G.bx.w / 2, -G.bx.h / 2 + G.bx.iy, G.bx.w, G.bx.h); ctx.restore();
  }
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
  else if (tool === 'cut') {
    const c = G.c; if (ui.cutView === 'dim' && c.proc && l.cut && l.cut.strokes.length) { const m = getCut(l, c.proc).mask;
      if (!m.dim) { const t = mk(m.width, m.height), tx = t.getContext('2d'); tx.fillStyle = 'rgba(8,10,14,.74)'; tx.fillRect(0, 0, t.width, t.height); tx.globalCompositeOperation = 'destination-out'; tx.drawImage(m, 0, 0); m.dim = t; }
      const [sx, sy, sw, sh] = cropRect(m.width, m.height, l); ctx.drawImage(m.dim, sx, sy, sw, sh, -G.bx.w / 2, -G.bx.h / 2 + G.bx.iy, G.bx.w, G.bx.h); }
    else if (ui.cutView === 'red' && c.proc && l.cut && l.cut.strokes.length) { const m = getCut(l, c.proc).mask;
      if (!m.tint || m.tintKey !== m) { const t = mk(m.width, m.height), tx = t.getContext('2d'); tx.drawImage(m, 0, 0); tx.globalCompositeOperation = 'source-in'; tx.fillStyle = 'rgba(255,50,70,.55)'; tx.fillRect(0, 0, t.width, t.height); m.tint = t; m.tintKey = m; }
      const [sx, sy, sw, sh] = cropRect(m.width, m.height, l); ctx.drawImage(m.tint, sx, sy, sw, sh, -G.bx.w / 2, -G.bx.h / 2 + G.bx.iy, G.bx.w, G.bx.h); }
    if (ui.cursor && !/^ai/.test(ui.cutMode)) { const P = localOf(G, ui.cursor.u, ui.cursor.v); ring(P, R(ui.cutSize / 100), R(ui.cutSize / 100), 0, ui.cutMode === 'erase'); }
    if (ui.segAt) { const P = localOf(G, ui.segAt.u, ui.segAt.v), t = performance.now() / 300; ring(P, 18 / s + Math.sin(t) * 6 / s, 18 / s + Math.sin(t) * 6 / s, 0, true); pin(P, true); requestAnimationFrame(requestRender); }
  }
  else if (tool === 'brush' && ui.cursor) { const P = localOf(G, ui.cursor.u, ui.cursor.v); ring(P, R(ui.brushSize / 100), R(ui.brushSize / 100), 0, false); }
  ctx.restore();
}

/* ---------- Gesten ---------- */
const ptrs = new Map(); let gest = null, lastTap = { id: null, t: 0 };
function hitTest(p) { for (let i = state.layers.length - 1; i >= 0; i--) { const l = state.layers[i]; if (l.hidden || l.locked) continue; const b = boxOf(l), q = toLocal(l, p); if (Math.abs(q.x) <= b.ow / 2 && Math.abs(q.y) <= b.oh / 2) return l; } return null; }
const edgeOK = l => !(l.type === 'image' && (l.pane || !l.srcId)) && !(l.type === 'shape' && l.kind === 'line');
function hitEdge(l, p) {
  if (l.locked || !edgeOK(l)) return null; const b = boxOf(l), q = toLocal(l, p), r = 18 / view.s, along = (L) => Math.max(26 / view.s, L * .22);
  if (Math.abs(Math.abs(q.x) - b.ow / 2) < r && Math.abs(q.y) < along(b.oh)) return q.x > 0 ? 'r' : 'l';
  if (Math.abs(Math.abs(q.y) - b.oh / 2) < r && Math.abs(q.x) < along(b.ow)) return q.y > 0 ? 'b' : 't';
  return null;
}
function hitHandle(l, p) { if (l.locked) return false; const b = boxOf(l), q = toLocal(l, p), r = 24 / view.s; return Math.hypot(q.x - b.ow / 2, q.y + b.oh / 2) < r; }
/* Vorlagen-Fotos lassen sich auf ein anderes Feld ziehen und tauschen dort die Plätze */
const swappable = l => l.type === 'image' && l.slot != null && !l.grp && !l.pane;
function swapTarget(l, p) {
  for (let i = state.layers.length - 1; i >= 0; i--) { const o = state.layers[i]; if (o === l || o.hidden || !swappable(o)) continue; const b = boxOf(o), q = toLocal(o, p); if (Math.abs(q.x) <= b.w / 2 && Math.abs(q.y - b.iy) <= b.h / 2) return o; }
  return null;
}
function swapPhotos(a, b) {
  for (const k of ['srcId', 'params', 'stampMs', 'rot90', 'flip', 'cut', 'dupOf', 'tplLook', 'ph']) { const t = a[k]; a[k] = b[k]; b[k] = t; }
  for (const l of [a, b]) { l.crop = { ...l.crop, zoom: 1, px: .5, py: .5 }; delete l.crop.box; }
}
function sizeOf(l) { return l.type === 'text' ? l.size : l.w; }
function setSize(l, v) { if (l.type === 'text') l.size = clamp(v, 12, 900); else if (l.type === 'shape') { const f = clamp(v, 20, 30000) / l.w; l.w *= f; if (l.kind !== 'line') l.h *= f; } else l.w = clamp(v, 40, 30000); }
function snapMove(l, nx, ny) {
  const { W, H } = dims(), T = W * state.slides, b = boxOf(l), th = 10 / view.s, guides = [];
  const xs = [T / 2]; for (let i = 0; i <= state.slides; i++) xs.push(i * W); for (let i = 0; i < state.slides; i++) xs.push((i + .5) * W);
  const straight = Math.abs(((l.rot % 360) + 360) % 360) < .01;
  const ys0 = [];
  for (const o of state.layers) if (o !== l && !o.hidden) { const ob = boxOf(o); xs.push(o.x); ys0.push(o.y); if (Math.abs(((o.rot % 360) + 360) % 360) < .01) { xs.push(o.x - ob.ow / 2, o.x + ob.ow / 2); ys0.push(o.y - ob.oh / 2, o.y + ob.oh / 2); } }
  const cand = straight ? [[0, nx], [-b.ow / 2, nx - b.ow / 2], [b.ow / 2, nx + b.ow / 2]] : [[0, nx]];
  let best = null; for (const [off, v] of cand) for (const t of xs) { const d = Math.abs(v - t); if (d < th && (!best || d < best.d)) best = { d, x: t - off, g: t }; }
  if (best) { nx = best.x; guides.push({ x: best.g }); }
  const ys = [H / 2, 0, H, ...ys0]; const cy = straight ? [[0, ny], [-b.oh / 2, ny - b.oh / 2], [b.oh / 2, ny + b.oh / 2]] : [[0, ny]];
  let by = null; for (const [off, v] of cy) for (const t of ys) { const d = Math.abs(v - t); if (d < th && (!by || d < by.d)) by = { d, y: t - off, g: t }; }
  if (by) { ny = by.y; guides.push({ y: by.g }); }
  const gk = guides.map(g => g.x ?? 'y' + g.y).join(); if (gk && gk !== ui.guideKey) haptic(); ui.guideKey = gk;
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
  if (tool === 'cut') {
    if (!ip.inside) return null;
    if (/^ai/.test(ui.cutMode)) return { mode: 'aiTap', l, u: ip.u, v: ip.v, sx: p.sx, sy: p.sy, moved: false };
    if (!l.cut) l.cut = { on: true, strokes: [] }; l.cut.on = true;
    const st = { m: ui.cutMode, s: ui.cutSize / 100, smart: ui.cutSmart, p: [+ip.u.toFixed(4), +ip.v.toFixed(4)] };
    l.cut.strokes.push(st); ui.cursor = { u: ip.u, v: ip.v }; flags.throttle = 110;
    return { mode: 'brush', st, l, arr: l.cut.strokes, moved: true };
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
let multiTap = null, lpT = 0, lpMenu = null;
/* Finger nach dem langen Drücken liegen lassen und aufs Menü ziehen – wie in iOS */
const ctxAt = e => { const el = document.elementFromPoint(e.clientX, e.clientY); return el && el.closest('#ctxMenu [data-ci]'); };
function armLongPress(e, p) {
  clearTimeout(lpT); const g0 = gest; if (!g0 || !/^(move|pan)$/.test(g0.mode) || e.pointerType === 'mouse') return;
  g0.lp = { sx: p.sx, sy: p.sy };
  lpT = setTimeout(() => {
    if (gest !== g0 || ptrs.size !== 1 || g0.lpOff) return;
    if (g0.mode === 'move') { g0.l.x = g0.x0; g0.l.y = g0.y0; }
    gest = null; ui.guides = []; ui.dropId = null; haptic(); requestRender();
    const q = ptrs.values().next().value; lpMenu = { held: true };
    openMenu(g0.mode === 'move' ? layerMenu(g0.l) : emptyMenu(), q ? q.sx + cv.getBoundingClientRect().left : e.clientX, q ? q.sy + cv.getBoundingClientRect().top : e.clientY);
  }, 480);
}
cv.addEventListener('contextmenu', e => { e.preventDefault(); if (e.pointerType && e.pointerType !== 'mouse') return; const p = toCanvas(e), hit = hitTest(p); if (hit) selectLayer(hit.id); openMenu(hit ? layerMenu(hit) : emptyMenu(), e.clientX, e.clientY); });
cv.addEventListener('pointerdown', e => {
  cv.setPointerCapture(e.pointerId); const p = toCanvas(e); ptrs.set(e.pointerId, p);
  if (e.pointerType === 'touch') { if (ptrs.size === 1) multiTap = { n: 1, t: performance.now(), x: p.sx, y: p.sy, moved: false }; else if (multiTap) multiTap.n = Math.max(multiTap.n, ptrs.size); }
  if (ptrs.size === 1) {
    const l = selLayer(), tool = activeTool();
    if (tool) { const g = startTool(tool, l, p); if (g) { gest = g; requestRender(); return; } }
    let side = l && !tool ? hitEdge(l, p) : null;
    if (side && hitHandle(l, p)) { const b0 = boxOf(l), q = toLocal(l, p), dc = Math.hypot(q.x - b0.ow / 2, q.y + b0.oh / 2), mid = { l: [-b0.ow / 2, 0], r: [b0.ow / 2, 0], t: [0, -b0.oh / 2], b: [0, b0.oh / 2] }[side];
      if (Math.hypot(q.x - mid[0], q.y - mid[1]) >= dc) side = null; } // näher am Eck-Griff → skalieren/drehen
    if (side) { const bx = boxOf(l); gest = { mode: 'edge', side, l, p0: p, x0: l.x, y0: l.y, ow0: bx.ow, oh0: bx.oh, w0: l.w, h0: l.type === 'image' ? l.w / cropAspect(l) : l.h, sx0: l.sx || 1, sy0: l.sy || 1, moved: false }; }
    else if (l && !tool && hitHandle(l, p)) { gest = { mode: 'handle', l, d0: Math.hypot(p.x - l.x, p.y - l.y), a0: Math.atan2(p.y - l.y, p.x - l.x), size0: sizeOf(l), rot0: l.rot, moved: false }; }
    else {
      const hit = hitTest(p);
      if (hit && !(tool && tool !== 'crop' && hit !== l)) { if (ui.sel !== hit.id) { if (hit.type === 'image' && hit.srcId && (!l || l.type !== 'image' || tool === 'crop')) ui.tab.image = 'rahmen'; selectLayer(hit.id); } gest = { mode: 'move', l: hit, dx: p.x - hit.x, dy: p.y - hit.y, x0: hit.x, y0: hit.y, moved: false }; }
      else gest = { mode: 'pan', sx: p.sx, sy: p.sy, ox: view.ox, oy: view.oy, moved: false };
    }
    armLongPress(e, p);
    requestRender();
  } else if (ptrs.size === 2) {
    const [a, b] = [...ptrs.values()];
    const mid = { sx: (a.sx + b.sx) / 2, sy: (a.sy + b.sy) / 2 }, dist = Math.hypot(a.sx - b.sx, a.sy - b.sy), ang = Math.atan2(b.sy - a.sy, b.sx - a.sx);
    if (gest && gest.mode === 'brush') { const arr = gest.arr || gest.l.params.brush; if (arr[arr.length - 1] === gest.st && gest.st.p.length < 8) arr.pop(); flags.throttle = 0; }
    if (gest && gest.mode === 'crop') gest = { mode: 'pinchCrop', l: gest.l, dist, z0: gest.l.crop.zoom, moved: true };
    else if (gest && gest.mode === 'pinDrag' && gest.get() && gest.get().rx != null) { const m = gest.get(); gest = { mode: 'pinchPin', m, dist, ang, rx0: m.rx, ry0: m.ry, a0: m.angle || 0, moved: true }; }
    else if (gest && (gest.mode === 'move' || gest.mode === 'handle') && gest.l) gest = { mode: 'pinchLayer', l: gest.l, dist, ang, size0: sizeOf(gest.l), rot0: gest.l.rot, moved: true };
    else gest = { mode: 'pinchView', dist, s0: view.s, mid, ox: view.ox, oy: view.oy, moved: true };
  }
});
cv.addEventListener('pointermove', e => {
  const p = toCanvas(e);
  if (lpMenu && lpMenu.held) { const it = ctxAt(e); if (it !== lpMenu.hover) { lpMenu.hover?.classList.remove('hover'); it?.classList.add('hover'); if (it) haptic(); lpMenu.hover = it; } return; }
  if (!ptrs.has(e.pointerId) || !gest) { if (/^(brush|cut)$/.test(activeTool() || '') && e.pointerType === 'mouse') { const ip = imgPt(selLayer(), p); if (ip) { ui.cursor = { u: ip.u, v: ip.v }; requestRender(); } } return; }
  const prev = ptrs.get(e.pointerId); ptrs.set(e.pointerId, p);
  if (gest.lp && !gest.lpOff && Math.hypot(p.sx - gest.lp.sx, p.sy - gest.lp.sy) > 9) { gest.lpOff = true; clearTimeout(lpT); }
  if (multiTap && Math.hypot(p.sx - prev.sx, p.sy - prev.sy) > 0 && (multiTap.d = (multiTap.d || 0) + Math.hypot(p.sx - prev.sx, p.sy - prev.sy)) > 14) multiTap.moved = true;
  if (Math.abs(p.sx - prev.sx) + Math.abs(p.sy - prev.sy) > 0) gest.moved = gest.moved || Math.hypot(p.sx - (gest.sx ?? prev.sx), p.sy - (gest.sy ?? prev.sy)) > (gest.mode === 'aiTap' ? 8 : 3) || (gest.mode !== 'pan' && gest.mode !== 'aiTap');
  const m = gest.mode;
  if (m === 'move') { if (gest.l.locked) return; const [nx, ny] = snapMove(gest.l, p.x - gest.dx, p.y - gest.dy); gest.l.x = nx; gest.l.y = ny;
    if (swappable(gest.l)) { const t = swapTarget(gest.l, p); gest.target = t; ui.dropId = t ? t.id : null; } }
  else if (m === 'edge') { const g = gest, l = g.l, a = (l.rot || 0) * Math.PI / 180, ux = Math.cos(a), uy = Math.sin(a), dx = p.x - g.p0.x, dy = p.y - g.p0.y;
    const horiz = g.side === 'l' || g.side === 'r', proj = horiz ? dx * ux + dy * uy : -dx * uy + dy * ux, sign = g.side === 'r' || g.side === 'b' ? 1 : -1;
    const full = horiz ? g.ow0 : g.oh0, d = Math.max(-full + 30, sign * proj), shift = sign * d / 2;
    l.x = g.x0 + (horiz ? ux : -uy) * shift; l.y = g.y0 + (horiz ? uy : ux) * shift;
    if (l.type === 'text') { if (horiz) l.sx = clamp(g.sx0 * (full + d) / full, .2, 6); else l.sy = clamp(g.sy0 * (full + d) / full, .2, 6); }
    else if (l.type === 'image') { const nw = horiz ? Math.max(40, g.w0 + d) : g.w0, nh = horiz ? g.h0 : Math.max(40, g.h0 + d); l.w = nw; l.crop.ratio = nw / nh; delete l.crop.box; }
    else { if (horiz) l.w = Math.max(20, g.w0 + d); else l.h = Math.max(10, g.h0 + d); }
  }
  else if (m === 'handle') { const l = gest.l, d = Math.hypot(p.x - l.x, p.y - l.y), a = Math.atan2(p.y - l.y, p.x - l.x);
    setSize(l, gest.size0 * d / gest.d0); let r = gest.rot0 + (a - gest.a0) * 180 / Math.PI; r = ((r + 540) % 360) - 180;
    let sn = false; for (const t of [-180, -90, 0, 90, 180]) if (Math.abs(r - t) < 3) { r = t; sn = true; } if (sn && !gest.sn) haptic(); gest.sn = sn; l.rot = r; showHud(l, gest); }
  else if (m === 'pan') { if (gest.moved) { view.ox = gest.ox + (p.sx - gest.sx); view.oy = gest.oy + (p.sy - gest.sy); clampView(); } }
  else if (m === 'pinDrag') { const ip = imgPt(gest.l, p), t = gest.get(); if (ip && t) { t.x = clamp(ip.u + (gest.du || 0)); t.y = clamp(ip.v + (gest.dv || 0)); } }
  else if (m === 'brush') { const ip = imgPt(gest.l, p); if (ip) { const a = gest.st.p, lu = a[a.length - 2], lv = a[a.length - 1]; ui.cursor = { u: ip.u, v: ip.v };
      if (Math.hypot(ip.u - lu, ip.v - lv) > gest.st.s * .15) a.push(+ip.u.toFixed(4), +ip.v.toFixed(4)); } }
  else if (m === 'crop') { const l = gest.l, q = toLocal(l, p), G = gest.G, dxImg = (q.x - gest.q0.x) / G.k, dyImg = (q.y - gest.q0.y) / G.k;
    if (l.crop.box) { const b = l.crop.box; gest.b0 = gest.b0 || b.slice(); b[0] = clamp(gest.b0[0] - dxImg / G.iw, 0, 1 - b[2]); b[1] = clamp(gest.b0[1] - dyImg / G.ih, 0, 1 - b[3]); }
    else if (G.iw - G.sw > 1) l.crop.px = clamp(gest.px0 - dxImg / (G.iw - G.sw)); if (!l.crop.box && G.ih - G.sh > 1) l.crop.py = clamp(gest.py0 - dyImg / (G.ih - G.sh)); }
  else if (ptrs.size === 2) {
    const [a, b] = [...ptrs.values()]; const dist = Math.hypot(a.sx - b.sx, a.sy - b.sy), ang = Math.atan2(b.sy - a.sy, b.sx - a.sx);
    if (m === 'pinchLayer') { setSize(gest.l, gest.size0 * dist / gest.dist); let r = gest.rot0 + (ang - gest.ang) * 180 / Math.PI; r = ((r + 540) % 360) - 180; let sn = false; for (const t of [-90, 0, 90]) if (Math.abs(r - t) < 3) { r = t; sn = true; } if (sn && !gest.sn) haptic(); gest.sn = sn; gest.l.rot = r; showHud(gest.l, gest); }
    else if (m === 'pinchCrop') gest.l.crop.zoom = clamp(gest.z0 * dist / gest.dist, 1, 4);
    else if (m === 'pinchPin') { const f = dist / gest.dist; gest.m.rx = clamp(gest.rx0 * f, .01, 1.5); if (gest.ry0 != null) gest.m.ry = clamp(gest.ry0 * f, .01, 1.5); if (gest.m.angle != null) gest.m.angle = gest.a0 + (ang - gest.ang); }
    else if (m === 'pinchView') { const ns = clamp(gest.s0 * dist / gest.dist, .03, 3), cx = (gest.mid.sx - gest.ox) / gest.s0, cy = (gest.mid.sy - gest.oy) / gest.s0; view.s = ns; view.ox = gest.mid.sx - cx * ns; view.oy = gest.mid.sy - cy * ns; clampView(); }
  }
  requestRender();
});
function endPtr(e) {
  if (!ptrs.has(e.pointerId)) return; ptrs.delete(e.pointerId); clearTimeout(lpT); hideHud();
  if (lpMenu && lpMenu.held) { const it = e.type === 'pointerup' && ctxAt(e); lpMenu = { until: performance.now() + 450 }; multiTap = null; if (it) it.click(); return; }
  if (!ptrs.size && multiTap) { const mt = multiTap; multiTap = null; if (mt.n >= 2 && !mt.moved && performance.now() - mt.t < 350 && e.type === 'pointerup') { gest = null; ui.guides = []; haptic(); if (mt.n === 2) { undo(); toast('Rückgängig'); } else { redo(); toast('Wiederholt'); } return; } }
  if (ptrs.size > 0) { if (gest && /^pinch(Layer|Crop|Pin)$/.test(gest.mode)) gest = { mode: 'none', l: gest.l, moved: true }; return; }
  const g = gest; gest = null; ui.guides = []; flags.throttle = 0; if (!g || !g.target) ui.dropId = null;
  if (g) {
    if (g.mode === 'aiTap') { if (!g.moved) runSegment(g.l, g.u, g.v, ui.cutMode); }
    else if (g.mode === 'pan' && !g.moved && ui.sel && !activeTool()) selectLayer(null);
    else if (g.mode === 'move' && !g.moved && g.l && g.l.type === 'image' && !g.l.srcId) ui.tapPh = g.l.id;
    else if ((g.mode === 'move' || g.mode === 'crop') && !g.moved && g.l && g.l.type === 'image' && g.l.srcId) { const now = performance.now();
      if (lastTap.id === g.l.id && now - lastTap.t < 400) { lastTap.id = null; enterCrop(g.mode !== 'crop'); } else lastTap = { id: g.l.id, t: now };
      if (g.mode === 'crop') { pushHistory(); syncPanelValues(); } }
    else if (g.mode === 'move' && !g.moved && g.l && g.l.type === 'text') { const now = performance.now();
      if (lastTap.id === g.l.id && now - lastTap.t < 380) { ui.tab.text = 'text'; renderUI(); const ta = $('#txtIn'); if (ta) { ta.focus(); ta.select(); } lastTap.id = null; } else lastTap = { id: g.l.id, t: now }; }
    else if (g.mode === 'brush' || g.mode === 'pinDrag' || g.mode === 'crop' || g.mode === 'none' || g.mode === 'pinchPin' || g.mode === 'pinchCrop') { pushHistory(); syncPanelValues(); }
    else if (g.target) { swapPhotos(g.l, g.target); g.l.x = g.x0; g.l.y = g.y0; ui.dropId = null; commit(); toast('Fotos getauscht', 'Rückgängig', undo); }
    else if (g.l && g.moved) { pushHistory(); syncPanelValues(); }
  }
  if (e.pointerType !== 'mouse') ui.cursor = null;
  requestRender();
}
cv.addEventListener('pointerup', endPtr); cv.addEventListener('pointercancel', endPtr);
cv.addEventListener('click', () => { if (ui.tapPh) { ui.fillSlot = ui.tapPh; ui.tapPh = null; $('#fileIn').click(); } }); // leeres Feld: Fotoauswahl öffnen
cv.addEventListener('dblclick', e => { const p = toCanvas(e); if (!hitTest(p)) { fit(); requestRender(); } });
cv.addEventListener('wheel', e => { e.preventDefault(); const p = toCanvas(e);
  if (e.ctrlKey) { const ns = clamp(view.s * Math.exp(-e.deltaY * .01), .03, 3); view.ox = p.sx - p.x * ns; view.oy = p.sy - p.y * ns; view.s = ns; }
  else { view.ox -= e.deltaX || e.deltaY; } clampView(); requestRender(); }, { passive: false });

/* Doppeltipp aufs Foto: Ausschnitt im Rahmen verschieben und zoomen (nochmal Doppeltipp: zurück zum Rahmen) */
function enterCrop(on) {
  const l = selLayer(); if (!l || l.type !== 'image' || !l.srcId) return;
  ui.tab.image = on ? 'zuschnitt' : 'rahmen'; ui.pick = false; haptic(); renderUI();
  if (on) toast(l.crop.box ? 'Ziehen verschiebt den Ausschnitt im Panorama' : 'Foto im Rahmen verschieben · Doppeltipp: fertig');
}
/* Motiv per Antippen erkennen (lokales Modell, kein Upload) */
async function runSegment(l, u, v, mode) {
  if (ui.segBusy) return; const c = ensureCache(l); if (!c) return;
  ui.segBusy = true; ui.segAt = { u, v }; requestRender();
  try {
    const S = await import('./segment.js');
    toast(S.segmenterReady() ? (mode === 'ai' ? 'Erkenne Motiv …' : 'Erkenne Bereich …') : 'Erkennung wird vorbereitet – einmalig ca. 16 MB, danach offline …');
    const p = c.prep, k = Math.min(1, 1024 / Math.max(p.width, p.height)), img = k < 1 ? shrink(p, Math.round(p.width * k), Math.round(p.height * k)) : p;
    const m = await S.segmentAt(img, u, v); let cov = 0; for (let i = 0; i < m.data.length; i += 7) cov += m.data[i] > .5; cov /= m.data.length / 7;
    if (cov < .002) { toast('Hier wurde nichts erkannt – tippe mitten aufs Motiv'); return; }
    if (!l.cut) l.cut = { on: true, strokes: [] }; l.cut.on = true; if (l.cut.refine == null) l.cut.refine = true;
    l.cut.strokes.push({ m: mode, d: maskToPNG(cleanMask(m, u, v)), p: [+u.toFixed(4), +v.toFixed(4)] });
    haptic(); commit(); toast(mode === 'ai' ? 'Motiv erkannt · weitere Teile antippen oder mit „Radieren“ korrigieren' : 'Bereich entfernt');
  } catch (e) { console.error(e); toast('Die Erkennung ist auf diesem Gerät nicht verfügbar – nutze „Malen“.'); }
  finally { ui.segBusy = false; ui.segAt = null; requestRender(); }
}
cutHooks.onReady = () => requestRender();
function selectLayer(id) {
  if (id != null && id !== ui.sel) haptic();
  if (ui.sel && ui.sel !== id) releaseAux(selLayer());
  ui.sel = id; ui.pick = false; ui.maskSel = 0; renderUI();
}

/* ---------- Verlauf & automatisches Speichern ---------- */
let hist = [], hIdx = -1;
const snap = () => JSON.stringify({ format: state.format, slides: state.slides, bg: state.bg, tpl: state.tpl || null, layers: state.layers });
function pushHistory() { relink(ui.sel); const s = snap(); if (hist[hIdx] === s) return; hist = hist.slice(0, hIdx + 1); hist.push(s); if (hist.length > 60) hist.shift(); hIdx = hist.length - 1; updateTop(); scheduleSave(); }
function restore(s) {
  const o = JSON.parse(s); state.format = o.format; state.slides = o.slides; state.bg = o.bg; state.tpl = o.tpl || null; state.layers = o.layers; relink();
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
    await store.saveProject({ id, name: ui.projectName, updated: Date.now(), doc: { format: state.format, slides: state.slides, bg: state.bg, tpl: state.tpl || null, layers: state.layers }, thumb }, files);
    files.forEach(f => savedSrc.add(f.srcId));
    await store.pruneFiles(id, used); savedSrc = new Set([...savedSrc].filter(s => used.has(s)));
  }).catch(err => { console.warn(err); toast('Speichern hat nicht geklappt – ist der Speicher voll?'); });
  return saveChain;
}
async function makeThumb() {
  const { W, H } = dims(), T = W * state.slides, s = 240 / H, c = mk(Math.min(T * s, 1600), 240), x = c.getContext('2d');
  x.scale(c.width / T, 240 / H); drawScene(x, { clean: true });
  return new Promise(r => c.toBlob(r, 'image/jpeg', .72));
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && saveT) { clearTimeout(saveT); saveT = null; saveNow(); } });

/* ---------- Oberfläche ---------- */
const panel = $('#panel'), tabs = $('#tabs'), head = $('#panelHead');
const mode = () => { const l = selLayer(); return l ? (l.type === 'image' && !l.srcId ? 'slot' : l.type) : 'none'; };
function updateTop() {
  $('#undoBtn').disabled = hIdx <= 0; $('#redoBtn').disabled = hIdx >= hist.length - 1;
  $('#fmtTag').textContent = `${state.format} · ${state.slides} ${state.slides === 1 ? 'Slide' : 'Slides'}`;
  const tool = activeTool(), l = selLayer();
  const hintEl = $('#stageHint'), prevHint = hintEl.textContent;
  hintEl.textContent = tool === 'mask' ? 'Tippe ins Foto für einen neuen Punkt · Punkt ziehen verschiebt · zwei Finger: Größe & Drehung'
    : tool === 'cut' && ui.cutMode === 'ai' ? 'Tippe aufs Motiv – es wird automatisch freigestellt' : tool === 'cut' && ui.cutMode === 'aisub' ? 'Tippe auf einen Bereich, der weg soll'
    : tool === 'cut' ? (ui.cutMode === 'erase' ? 'Radierer: übermaltes Motiv wieder zurücknehmen' : 'Male über das Motiv – es liegt dann vor Text & Elementen · zwei Finger: Ansicht')
    : tool === 'brush' ? `Mit dem Finger malen: ${BRUSH_MODES.find(b => b[0] === ui.brushMode)[1]} · zwei Finger: Ansicht verschieben`
    : tool === 'heal' ? 'Tippe auf Flecken, Fussel oder störende Punkte'
    : tool === 'focus' ? 'Ziehen verschiebt den Schärfebereich' : tool === 'crop' ? 'Foto im Rahmen verschieben · zwei Finger zoomen · Doppeltipp: fertig'
    : tool === 'wb' ? 'Tippe auf etwas, das weiß oder grau sein sollte'
    : l && l.type === 'image' && !l.srcId ? 'Tippe auf das „+“, um ein Foto einzusetzen'
    : state.layers.length ? (l ? (l.locked ? 'Ebene ist gesperrt – entsperren unter „Ebenen“' : l.type === 'image' && l.srcId ? 'Doppeltippen für Ausschnitt & Zoom' : 'Eck-Griff: Größe & Drehung') : 'Antippen zum Bearbeiten') : 'Füge Fotos hinzu – sie dürfen über die Slide-Grenzen ragen.';
  // Hinweise wie bei iOS: kurz einblenden, allgemeine nur die ersten paar Male
  if (hintEl.textContent !== prevHint) { const seen = LS.get('hintSeen', {}), key = hintEl.textContent, n = seen[key] || 0;
    clearTimeout(updateTop.t);
    if (!tool && n >= 3) hintEl.classList.add('fade');
    else { hintEl.classList.remove('fade'); updateTop.t = setTimeout(() => hintEl.classList.add('fade'), tool ? 4500 : 3200); if (!tool) { seen[key] = n + 1; LS.set('hintSeen', seen); } } }
}
function renderUI() { renderTabs(); renderHead(); renderPanel(); updateTop(); requestRender(); }
function sv(d) { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`; }
const IC = {
  canvas: sv('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M9 5v14M15 5v14"/>'), tpl: sv('<rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="5" rx="1.5"/><rect x="13" y="10" width="8" height="11" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/>'),
  layers: sv('<path d="M12 3 3 8l9 5 9-5z"/><path d="m3 13 9 5 9-5"/>'), photo: sv('<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 8"/>'),
  cam: sv('<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>'), text: sv('<path d="M5 6V4h14v2M12 4v16M9 20h6"/>'), el: sv('<path d="m12 3 2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z"/>'),
  looks: sv('<circle cx="8" cy="9" r="5"/><circle cx="16" cy="9" r="5"/><circle cx="12" cy="15" r="5"/>'), light: sv('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
  color: sv('<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>'), fx: sv('<path d="M5 19 19 5M14 5h5v5M7 4v4M5 6h4M17 16v4M15 18h4"/>'), tools: sv('<path d="M15 4l5 5L9 20H4v-5z"/><path d="m13 6 5 5"/>'),
  paste: sv('<rect x="5" y="4" width="14" height="17" rx="2.5"/><path d="M9 4.5V3.5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1z"/><path d="M9 11h6M9 15h4"/>'),
  eye: sv('<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'), eyeOff: sv('<path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6C3.8 8.4 2 12 2 12s3.6 7 10 7a9.7 9.7 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>'),
  lock: sv('<rect x="5" y="11" width="14" height="10" rx="2.5"/><path d="M8 11V7.5a4 4 0 0 1 8 0V11"/>'), unlock: sv('<rect x="5" y="11" width="14" height="10" rx="2.5"/><path d="M8 11V7.5a4 4 0 0 1 7.7-1.5"/>'),
  up: sv('<path d="m6 15 6-6 6 6"/>'), down: sv('<path d="m6 9 6 6 6-6"/>'), star: sv('<path d="m12 3 2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z"/>'),
  starFill: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="m12 3 2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z"/></svg>',
  shuffle: sv('<path d="M3 7h3.5c2 0 3.3 1 4.5 3l2 4c1.2 2 2.5 3 4.5 3H21M3 17h3.5c1.4 0 2.5-.5 3.4-1.5M14 8.5c.9-1 2-1.5 3.5-1.5H21M18 4l3 3-3 3M18 14l3 3-3 3"/>'),
  more: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5.5" cy="12" r="1.9" fill="currentColor"/><circle cx="12" cy="12" r="1.9" fill="currentColor"/><circle cx="18.5" cy="12" r="1.9" fill="currentColor"/></svg>',
  crop: sv('<path d="M6 2v16h16"/><path d="M2 6h16v16"/>'), frame: sv('<rect x="3" y="3" width="18" height="18" rx="2"/><rect x="7" y="7" width="10" height="10" rx="1"/>'), style: sv('<path d="M4 20h4L19 9l-4-4L4 16z"/>'), shape: sv('<rect x="4" y="4" width="16" height="16" rx="3"/>'), slot: sv('<path d="M12 5v14M5 12h14"/>')
};
/* Foto-Werkzeuge in Gruppen: obere Reiter, darunter Unterreiter */
const IMG_GROUPS = [['rahmen', 'Rahmen', 'frame', ['rahmen']], ['looks', 'Looks', 'looks', ['looks']], ['licht', 'Licht', 'light', ['anpassen', 'licht', 'kurve']], ['farbe', 'Farbe', 'color', ['farbe', 'grading']],
  ['effekte', 'Effekte', 'fx', ['effekte', 'details', 'stempel']], ['werkzeuge', 'Werkzeuge', 'tools', ['freistellen', 'selektiv', 'pinsel', 'reparieren', 'fokus']], ['zuschnitt', 'Zuschnitt', 'crop', ['zuschnitt']], ['ebene', 'Ebene', 'layers', ['ebene']]];
const SUB_LABEL = { anpassen: 'Schnell', licht: 'Licht & Histogramm', kurve: 'Kurve', farbe: 'Farbe & HSL', grading: 'Color Grading', effekte: 'Film & Licht', details: 'Details', stempel: 'Datumsstempel',
  freistellen: 'Freistellen', selektiv: 'Selektiv', pinsel: 'Pinsel', reparieren: 'Reparieren', fokus: 'Fokus' };
const groupOf = leaf => IMG_GROUPS.find(g => g[3].includes(leaf)) || IMG_GROUPS[0];
const TABSETS = {
  none: [['canvas', 'Leinwand', 'canvas'], ['vorlagen', 'Vorlagen', 'tpl'], ['ebenen', 'Ebenen', 'layers'], ['addPhoto', 'Foto', 'photo'], ['addText', 'Text', 'text'], ['element', 'Element', 'el']],
  image: IMG_GROUPS.map(([k, lb, ic]) => [k, lb, ic]),
  text: [['text', 'Text', 'text'], ['stil', 'Stil', 'style'], ['ebene', 'Ebene', 'layers']],
  shape: [['form', 'Form', 'shape'], ['ebene', 'Ebene', 'layers']],
  slot: [['slot', 'Leeres Feld', 'slot']]
};
function renderTabs() {
  const m = mode(), cur = m === 'image' ? groupOf(ui.tab.image)[0] : ui.tab[m];
  tabs.innerHTML = TABSETS[m].map(([k, lab, ic]) => { const inner = `${IC[ic] || ''}<span>${lab}</span>`, add = /^add|^element$/.test(k) ? ' add' : '';
    return k === 'addPhoto' ? `<label class="tab add" for="fileIn" role="button" tabindex="0">${inner}</label>` : k === 'addCam' ? `<label class="tab add" for="camIn" role="button" tabindex="0">${inner}</label>`
      : `<button class="tab${add}" role="tab" data-tab="${k}" aria-selected="${cur === k}">${inner}</button>`; }).join('');
  const on = tabs.querySelector('[aria-selected="true"]'); if (on) on.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  tabFade();
}
function tabFade() { tabs.classList.toggle('more', tabs.scrollWidth - tabs.clientWidth - tabs.scrollLeft > 8); }
tabs.addEventListener('scroll', tabFade, { passive: true }); addEventListener('resize', tabFade);
tabs.addEventListener('click', e => {
  const b = e.target.closest('[data-tab]'); if (!b) return; let k = b.dataset.tab;
  if (k === 'addText') { const { W, H } = dims(); const l = newTextLayer((visibleSlide() + .5) * W, H * .5); state.layers.push(l); ui.tab.text = 'text'; selectLayer(l.id); pushHistory(); setTimeout(() => $('#txtIn')?.select(), 50); return; }
  if (mode() === 'image') { const g = IMG_GROUPS.find(x => x[0] === k); ui.sub = ui.sub || {}; k = ui.sub[k] || g[3][0]; }
  ui.tab[mode()] = k; ui.pick = false; renderTabs(); renderHead(); renderPanel(); updateTop(); requestRender();
});
tabs.addEventListener('keydown', e => { const lb = e.target.closest('label[for]'); if ((e.key === 'Enter' || e.key === ' ') && lb) { e.preventDefault(); $('#' + lb.htmlFor).click(); } });
$('#fileIn').addEventListener('change', e => { const f = [...e.target.files]; e.target.value = ''; if (ui.replaceId) { replacePhoto(f[0]); } else addFiles(f); });
$('#camIn').addEventListener('change', e => { const f = [...e.target.files]; e.target.value = ''; addFiles(f); });

function renderHead() {
  const m = mode(), l = selLayer();
  if (m === 'none') { const tb = TABSETS.none.find(x => x[0] === ui.tab.none) || TABSETS.none[0];
    head.innerHTML = `<span class="title">${tb[1]}</span><button class="icon-btn" data-act="paste" aria-label="Einfügen" title="Bild, Text oder kopierte Ebene einfügen">${IC.paste}</button>`; return; }
  if (m === 'text' || m === 'shape' || m === 'slot') { head.innerHTML = `<span class="title">${m === 'text' ? 'Text' : m === 'slot' ? 'Leeres Feld' : 'Element'}</span><button class="btn primary small icon" data-act="done" aria-label="Fertig" title="Fertig"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5 9-10"/></svg></button>`; return; }
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
  else if (a === 'paste') pasteAny();
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
const FMT = { d1: v => de(v, 1), signed: fmtSigned, ev: v => (v > 0 ? '+' : v < 0 ? '−' : '') + de(Math.abs(v), 2) + ' EV', pct: v => de(Math.round(v)) + ' %', deg: v => fmtSigned(v) + '°', hue: v => de(Math.round(v)) + '°', px: v => de(Math.round(v)) + ' px', x: v => de(v, 2) + '×', n: v => de(Math.round(v)), lh: v => de(v, 2) };
/* Ziel-Objekte für Regler-Schlüssel "ns.feld" */
function target(ns) {
  const l = selLayer(), P = l && l.params;
  switch (ns) {
    case 'p': return P; case 'l': return l; case 'c': return l.crop; case 'h': return P.hsl[ui.hslBand]; case 'g': return P.grade[ui.gradeRange]; case 'gr': return P.grade;
    case 'm': return P.masks[ui.maskSel]; case 'b': return P.blur; case 'pv': return P.persp; case 'ui': return ui; case 'bg': return state.bg; case 'tp': return state.tpl; case 'cut': return l && l.cut;
  }
}
function getVal(k) { const [ns, f] = k.split('.'); if (k === 'l.wpct') return Math.round(selLayer().w / dims().W * 100); if (k === 'l.wprop') return Math.round(selLayer().w); const t = target(ns); return t ? t[f] : 0; }
function setVal(k, v) { const [ns, f] = k.split('.'); if (k === 'l.wpct') { selLayer().w = v / 100 * dims().W; return; } if (k === 'l.wprop') { const l = selLayer(), f2 = v / l.w; l.w = v; l.h *= f2; return; } const t = target(ns); if (t) t[f] = v; }
function slider(key, label, min, max, step, fmt = 'signed', def = 0, scale = 1, cls = '') {
  const raw = getVal(key) ?? def, val = +(raw * scale).toFixed(4), id = 's_' + key.replace(/\W/g, '_');
  return `<div class="sl${val !== def ? ' changed' : ''}${cls ? ' ' + cls : ''}"><div class="sl-top"><label for="${id}">${label}</label><button class="sl-reset" data-reset aria-label="${label} zurücksetzen" title="Zurücksetzen">↺</button><output>${FMT[fmt](val)}</output></div>
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
    let v = +t.value; const def = +t.dataset.def, span = +t.max - +t.min;
    if (v !== def && Math.abs(v - def) < span * .012 && def >= +t.min && def <= +t.max) { v = def; t.value = def; if (!t._mag) haptic(); t._mag = true; } else if (Math.abs(v - def) > span * .03) t._mag = false;
    if (/^(p|h|g|gr|m|b|pv)\./.test(t.dataset.k)) flags.draft = true; if (/^cut\./.test(t.dataset.k)) flags.throttle = 160; setVal(t.dataset.k, v / +t.dataset.scale); t.closest('.sl').querySelector('output').textContent = FMT[t.dataset.fmt](v);
    t.closest('.sl').classList.toggle('changed', v !== +t.dataset.def); paintFill(t);
    if (t.dataset.k.startsWith('h.')) markBands(); if (t.dataset.k.startsWith('g.')) markGrade();
    if (t.dataset.k.startsWith('tp.')) layout(false);
    if (t.dataset.k.startsWith('c.') && l && l.crop.box) delete l.crop.box;
    requestRender();
  } else if (t.id === 'txtIn') { l.text = t.value; requestRender(); }
  else if (t.id === 'capIn') { l.caption = t.value; requestRender(); }
  else if (t.matches('input[type=color][data-col]')) { applyColor(t.dataset.col, t.value); requestRender(); }
});
panel.addEventListener('input', e => { if (e.target.id !== 'tplSearch') return; ui.tplQuery = e.target.value; const q = ui.tplQuery.trim().toLowerCase();
  panel.querySelectorAll('.tpl[data-q]').forEach(b => b.hidden = !!q && !b.dataset.q.includes(q)); });
panel.addEventListener('toggle', e => { if (e.target.id === 'tplStyle') ui.tplStyleOpen = e.target.open; }, true);
panel.addEventListener('change', e => {
  const t = e.target, l = selLayer();
  if (t.id === 'projName') { ui.projectName = t.value.trim() || 'Mein Karussell'; scheduleSave(); return; }
  if (t.id === 'stampDate') { const [y, m, d] = t.value.split('-').map(Number); if (y) { const old = new Date(l.stampMs); l.stampMs = new Date(y, m - 1, d, old.getHours(), old.getMinutes()).getTime(); commit(); } return; }
  if (t.id === 'presetFile') { importPresets(t.files[0]); t.value = ''; return; }
  if (t.matches('input[type=color]')) pushRecentColor(t.value);
  if (t.matches('input[type=range],textarea,input[type=color],#capIn')) { if (flags.draft || flags.throttle) { flags.draft = false; flags.throttle = 0; requestRender(); } pushHistory(); refreshAfterCommit(); }
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
  if (/^bg/.test(target) && state.tpl) state.tpl.bgLock = true;
  if (target.startsWith('tpl')) { state.tpl[{ tplFrame: 'frameColor', tplText: 'textColor', tplInk: 'ink' }[target]] = v; layout(false); return; }
  if (target === 'bg1') state.bg.c1 = v; else if (target === 'bg2') state.bg.c2 = v;
  else if (target === 'frame') l.borderColor = v; else if (target === 'text') l.color = v; else if (target === 'textbg') { l.bgColor = v; l.bgSet = true; } else if (target === 'stroke') l.strokeColor = v; else if (target === 'fill') l.fill = v; else if (target === 'pin') l.pinColor = v;
}
const chip = (attrs, label, on) => `<button class="chip" ${attrs} aria-pressed="${!!on}">${label}</button>`;
const sw = (target, c, on) => `<button class="sw" style="--c:${c}" data-col-set="${target}" data-v="${c}" aria-pressed="${!!on}" aria-label="Farbe ${c}"></button>`;
const swatches = (target, list, cur) => `<div class="swatches">${(() => { const pal = photoPalette().filter(c => !list.includes(c)); return pal.length ? pal.map(c => sw(target, c, cur === c)).join('') + '<span class="sw-label">↑ aus deinen Fotos</span>' : ''; })()}${LS.get('recentColors', []).filter(c => !list.includes(c)).slice(0, 4).map(c => sw(target, c, cur === c).replace('class="sw"', 'class="sw recent"')).join('')}${list.map(c => sw(target, c, cur === c)).join('')}<input type="color" class="color-in" data-col="${target}" value="${/^#[0-9a-f]{6}$/i.test(cur) ? cur : '#ffffff'}" aria-label="Eigene Farbe"></div>`;
const toggle = (key, label, on) => `<div class="toggle"><span>${label}</span><button class="switch" role="switch" data-tog="${key}" aria-checked="${!!on}" aria-label="${label.replace(/<[^>]+>/g, '')}"></button></div>`;
const group = (title, inner) => `<div class="group">${title ? `<span class="sec-label">${title}</span>` : ''}${inner}</div>`;
const btn = (act, label, cls = 'ghost', extra = '') => `<button class="btn ${cls} small" data-act2="${act}" ${extra}>${label}</button>`;

/* Farbpalette aus den Fotos des Projekts (gecacht) */
let palKey = '', palVal = [];
function photoPalette() {
  const ids = [...new Set(state.layers.filter(l => l.type === 'image' && l.srcId && sources.get(l.srcId)?.base).map(l => l.srcId))].slice(0, 8), key = ids.join(',');
  if (key === palKey) return palVal; palKey = key; if (!ids.length) return palVal = [];
  const buckets = new Map();
  for (const id of ids) { const c = shrink(sources.get(id).base, 28, 28), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    for (let i = 0; i < d.length; i += 4) { const k = (d[i] >> 5) << 6 | (d[i + 1] >> 5) << 3 | (d[i + 2] >> 5), b = buckets.get(k) || { n: 0, r: 0, g: 0, b: 0 }; b.n++; b.r += d[i]; b.g += d[i + 1]; b.b += d[i + 2]; buckets.set(k, b); } }
  const cand = [...buckets.values()].map(b => { const r = b.r / b.n, g = b.g / b.n, bl = b.b / b.n, mx = Math.max(r, g, bl), mn = Math.min(r, g, bl); return { r, g, b: bl, score: b.n * (.35 + (mx - mn) / 255) }; }).sort((a, b) => b.score - a.score), out = [];
  for (const c of cand) { if (out.every(o => Math.hypot(o.r - c.r, o.g - c.g, o.b - c.b) > 60)) out.push(c); if (out.length >= 5) break; }
  return palVal = out.map(c => '#' + [c.r, c.g, c.b].map(v => Math.round(v).toString(16).padStart(2, '0')).join(''));
}
/* Kleine Merkliste im Browser (Favoriten, zuletzt benutzt, eigene Farben) */
const LS = { get(k, d) { try { return JSON.parse(localStorage.getItem('streifzug.' + k)) ?? d; } catch { return d; } }, set(k, v) { try { localStorage.setItem('streifzug.' + k, JSON.stringify(v)); } catch {} } };
const pushList = (k, v, max = 10) => LS.set(k, [v, ...LS.get(k, []).filter(x => x !== v)].slice(0, max));
const pushRecentColor = c => { if (/^#[0-9a-f]{6}$/i.test(c)) pushList('recentColors', c.toLowerCase(), 8); };
const ALIGN_IC = { l: '<path d="M4 3v18M8 7h10v4H8zM8 14h6v4H8z"/>', c: '<path d="M12 3v18M6 7h12v4H6zM8 14h8v4H8z"/>', r: '<path d="M20 3v18M6 7h10v4H6zM10 14h6v4h-6z"/>', t: '<path d="M3 4h18M7 8h4v10H7zM14 8h4v6h-4z"/>', m: '<path d="M3 12h18M7 6h4v12H7zM14 8h4v8h-4z"/>', b: '<path d="M3 20h18M7 6h4v10H7zM14 10h4v6h-4z"/>' };
const alignRow = () => group('Auf der Slide ausrichten', `<div class="align-row">${[['l', 'Links'], ['c', 'Waagerecht mittig'], ['r', 'Rechts'], ['t', 'Oben'], ['m', 'Senkrecht mittig'], ['b', 'Unten']].map(([k, lb]) => `<button class="icon-btn" data-al="${k}" aria-label="${lb}" title="${lb}">${sv(ALIGN_IC[k])}</button>`).join('')}</div>`);

/* ---------- Panels ---------- */
function renderPanel() {
  const m = mode(), t = ui.tab[m], l = selLayer(); let h = '';
  if (m === 'none') h = t === 'vorlagen' ? panelTemplates() : t === 'ebenen' ? panelLayers() : t === 'element' ? panelElements() : panelCanvas();
  else if (m === 'text') h = t === 'stil' ? panelTextStyle(l) : t === 'ebene' ? panelLayerCommon(l) : panelText(l);
  else if (m === 'shape') h = t === 'ebene' ? panelLayerCommon(l) : panelShape(l);
  else if (m === 'slot') h = panelSlot(l);
  else { const g = groupOf(t); h = (g[3].length > 1 ? `<div class="seg" role="tablist">${g[3].map(k => `<button data-sub="${k}" aria-selected="${k === t}">${SUB_LABEL[k]}</button>`).join('')}</div>` : '') + (IMAGE_PANELS[t] || IMAGE_PANELS.looks)(l, l.params); }
  const same = panel.dataset.key === m + t, keep = same ? panel.scrollTop : 0;
  panel.innerHTML = h; panel.dataset.key = m + t; panel.scrollTop = keep;
  if (!same) { panel.classList.remove('enter'); void panel.offsetWidth; panel.classList.add('enter'); }
  panel.querySelectorAll('input[type=range]').forEach(paintFill);
  if (m === 'none' && t === 'canvas') drawSlideThumbs();
  if (m === 'image') { if (t === 'looks') fillThumbs(); if (t === 'licht') { flags.histDirty = true; requestRender(); } if (t === 'kurve') setupCurve(); }
}
function panelCanvas() {
  const f = state.format, i = visibleSlide() + 1;
  return `${ui.sample ? `<div class="callout"><span class="note"><b>Beispielprojekt</b> mit generiertem Motiv. Beim ersten eigenen Foto wird es ersetzt.</span></div>` : ''}
  <div class="row"><input class="name" id="projName" value="${esc(ui.projectName)}" maxlength="40" aria-label="Projektname"><button class="btn ghost small" data-act2="projects">Projekte</button><button class="btn ghost small" data-act2="help">? Hilfe</button></div>
  ${group('Format', `<div class="chips">${Object.entries(FORMATS).map(([k, v]) => chip(`data-format="${k}"`, `${v.label}<small>${v.px}</small>`, f === k)).join('')}</div>`)}
  ${group('Slides', `<div class="row"><div class="stepper"><button data-slides="-1" aria-label="Eine Slide weniger">−</button><span>${state.slides}</span><button data-slides="1" aria-label="Eine Slide mehr">+</button></div><span class="note">Instagram erlaubt bis zu 20 Bilder pro Post.</span></div>
    <div class="slide-strip" id="slideStrip">${Array.from({ length: state.slides }, (_, k) => `<button class="sthumb" data-goslide="${k}" aria-current="${k + 1 === i}" aria-label="Slide ${k + 1}"><canvas width="72" height="${Math.round(72 * dims().H / dims().W)}"></canvas><span>${k + 1}</span></button>`).join('')}</div>
    <div class="row"><span class="note">Slide ${i}:</span>${btn('slideLeft', '←')}${btn('slideRight', '→')}${btn('slideDup', 'Duplizieren')}${btn('slideInsert', '+ Leere danach')}${btn('slideDelete', 'Löschen', 'danger')}</div>`)}
  ${group('Hintergrund', `${swatches('bg1', BG_COLORS, state.bg.c1)}
  ${toggle('grad', 'Verlauf', state.bg.grad)}
  ${state.bg.grad ? `${swatches('bg2', BG_COLORS, state.bg.c2)}<div class="chips">${[['h', 'Waagerecht'], ['v', 'Senkrecht'], ['d', 'Diagonal']].map(([k, lb]) => chip(`data-bgdir="${k}"`, lb, (state.bg.dir || 'h') === k)).join('')}</div>` : ''}
  <span class="sec-label">Muster</span><div class="chips">${BG_PATTERNS.map(([k, lb]) => chip(`data-pattern="${k}"`, lb, (state.bg.pattern || 'none') === k)).join('')}</div>`)}
  ${toggle('grid', 'Drittel-Raster einblenden', ui.grid)}
  <div class="row">${btn('clear', ui.confirmClear ? 'Wirklich alles leeren?' : 'Neues leeres Projekt', 'danger')}${btn('sample', 'Beispiel laden')}</div>`;
}
function drawSlideThumbs() {
  const { W, H } = dims();
  panel.querySelectorAll('#slideStrip canvas').forEach((cnv, k) => { const x = cnv.getContext('2d'), s = cnv.width / W; x.setTransform(s, 0, 0, s, -k * W * s, 0); drawScene(x, { clean: true }); });
}
const TPL_TAGS = { polaroid: 'polaroid sofortbild', instax: 'polaroid sofortbild', scrapbook: 'polaroid tape klebeband', pinned: 'büroklammer klammer tape klebeband', doodleDiary: 'washi tape klebeband herz doodle', doodleOverlay: 'doodle marker herz', scribble: 'doodle', moodboard: 'doodle', hearts: 'liebe valentinstag', booth: 'photobooth fotobox', film: 'analog negativ', filmV: 'analog negativ', contact: 'analog negativ', poster: 'kino film movie', ovalNoir: 'kino film', pano: 'panorama landschaft', spread: 'panorama' };
const TPL_STYLE_KEYS = ['tilt', 'frame', 'frameColor', 'font', 'textColor', 'doodles', 'ink'];
function panelTemplates() {
  const t = state.tpl, def = t && tplDef(t.kind), cat = ui.tplCat || 'all', favs = LS.get('tplFav', []), recent = LS.get('tplRecent', []), q = (ui.tplQuery || '').toLowerCase();
  let list = cat === 'fav' ? TEMPLATES.filter(T => favs.includes(T.id)) : cat === 'recent' ? recent.map(id => tplDef(id)).filter(Boolean) : TEMPLATES.filter(T => cat === 'all' || T.cat === cat);
  const nPh = state.layers.filter(l => l.type === 'image' && !l.srcId).length, styled = t && TPL_STYLE_KEYS.some(k => t[k] != null && t[k] !== 0);
  const cur = def ? `<div class="tpl-cur">
    <div class="tpl-head"><b>${def.name}</b><button class="icon-btn fav${favs.includes(def.id) ? ' on' : ''}" data-act2="tplFav" aria-label="${favs.includes(def.id) ? 'Aus Favoriten entfernen' : 'Als Favorit merken'}" title="Merken">${favs.includes(def.id) ? IC.starFill : IC.star}</button></div>
    <div class="row">${btn('tplShuffle', IC.shuffle + 'Fotos mischen')}${btn('tplRelease', 'Vorlage lösen')}</div>
    <div class="vars">${def.vars.map((vn, i) => `<button class="var" data-tplvar="${i}" aria-pressed="${t.v === i}">${tplSVG(def.id, i)}<span>${vn}</span></button>`).join('')}</div>
    ${slider('tp.gap', 'Abstand', 0, 8, .1, 'd1', (def.gap ?? .025) * 100, 100)}${slider('tp.rad', 'Ecken', 0, 40, 1, 'n', 0)}
    <div class="row"><span class="note">Schatten</span><div class="chips">${[['tpl', 'Vorlage'], ['on', 'An'], ['off', 'Aus']].map(([k, lb]) => chip(`data-tplshadow="${k}"`, lb, (t.shadow == null ? 'tpl' : t.shadow ? 'on' : 'off') === k)).join('')}</div></div>
    ${def.fixed ? '' : `<div class="row"><span class="note">Seiten</span><div class="chips">${chip('data-tplmix="mix"', 'Abwechslungsreich', !t.uniform)}${chip('data-tplmix="uni"', 'Einheitlich', !!t.uniform)}</div>${t.uniform ? '' : btn('tplReroll', 'Neu würfeln')}</div>`}
    <div class="row"><span class="note">Leere Felder</span><div class="chips">${chip('data-tplfill="ph"', 'Platzhalter', t.fill !== 'repeat')}${chip('data-tplfill="repeat"', 'Fotos wiederholen', t.fill === 'repeat')}</div></div>
    <details class="more" id="tplStyle"${ui.tplStyleOpen ? ' open' : ''}><summary>Stil anpassen${styled ? ' <span class="dot-on">geändert</span>' : ''}</summary>
      ${slider('tp.tilt', 'Fotos neigen', 0, 12, .5, 'deg', 0)}
      <span class="sec-label">Rahmen um die Fotos</span><div class="chips">${[['', 'Vorlage'], ['0', 'Keiner'], ['0.012', 'Fein'], ['0.025', 'Mittel'], ['0.045', 'Breit']].map(([k, lb]) => chip(`data-tplframe="${k}"`, lb, String(t.frame ?? '') === k)).join('')}</div>
      ${swatches('tplFrame', FRAME_COLORS, t.frameColor)}
      <span class="sec-label">Schrift der Vorlagen-Texte</span>
      <div class="chips scroll">${chip('data-tplfont=""', 'Vorlage', !t.font)}${FONTS.map(([f, lb, wgt]) => `<button class="fontchip" data-tplfont="${f}" aria-pressed="${t.font === f}"><span class="aa" style="font-family:'${f}';font-weight:${wgt}">Aa</span><span>${lb}</span></button>`).join('')}</div>
      ${swatches('tplText', TEXT_COLORS, t.textColor)}
      <span class="sec-label">Kritzeleien</span><div class="chips">${[['', 'Vorlage'], ['off', 'Keine'], ['few', 'Ein paar'], ['lots', 'Viele']].map(([k, lb]) => chip(`data-tpldood="${k}"`, lb, (t.doodles || '') === k)).join('')}</div>
      ${t.doodles !== 'off' ? swatches('tplInk', TEXT_COLORS, t.ink) : ''}
      <div class="row">${btn('tplStyleReset', 'Stil zurücksetzen')}${t.bgLock ? btn('tplBgReset', 'Vorlagen-Hintergrund') : ''}</div>
      <p class="note">Der Stil bleibt erhalten, wenn du eine andere Vorlage wählst.</p>
    </details>
    ${nPh ? `<p class="note"><b>${nPh} leere${nPh === 1 ? 's Feld' : ' Felder'}</b> – tippe auf ein „+“ oder <label class="linkish" for="fileIn">wähle Fotos</label>, sie werden der Reihe nach eingesetzt.</p>` : ''}
  </div>` : `<p class="note">Wähle eine Vorlage – leere Felder füllst du danach per Antippen. Nochmal tippen wechselt die Variante.</p>`;
  const cats = [['all', 'Alle'], ['fav', 'Favoriten'], ['recent', 'Zuletzt'], ...TPL_CATS.slice(1)];
  return `${cur}<input type="search" class="name tpl-search" id="tplSearch" placeholder="Vorlage suchen, z. B. Polaroid, Herz, Magazin …" value="${esc(ui.tplQuery || '')}" aria-label="Vorlage suchen">
  <div class="chips scroll">${cats.map(([k, lb]) => chip(`data-tplcat="${k}"`, lb, cat === k)).join('')}</div>
  ${!list.length ? `<p class="note">${cat === 'fav' ? 'Noch keine Favoriten – wähle eine Vorlage und tippe auf den Stern.' : 'Noch keine zuletzt benutzten Vorlagen.'}</p>` : ''}
  <div class="tpl-grid">${list.map(T => { const on = t && t.kind === T.id, hay = (T.name + ' ' + T.desc + ' ' + T.vars.join(' ') + ' ' + T.id + ' ' + (TPL_CATS.find(c => c[0] === T.cat) || ['', ''])[1] + ' ' + (TPL_TAGS[T.id] || '')).toLowerCase();
    return `<button class="tpl${on ? ' on' : ''}" data-tpl="${T.id}" data-q="${esc(hay)}"${q && !hay.includes(q) ? ' hidden' : ''}>${tplSVG(T.id, on ? t.v : 0)}<b>${favs.includes(T.id) ? '★ ' : ''}${T.name}</b><span>${T.vars.length} Variante${T.vars.length === 1 ? '' : 'n'} · ${T.desc}</span></button>`; }).join('')}</div>`;
}
function panelSlot(l) {
  return `<p class="note">Ein leeres Feld der Vorlage. Setze ein Foto ein – mehrere ausgewählte Fotos füllen die nächsten leeren Felder.</p>
  <div class="row"><label class="btn primary" for="fileIn" data-fillslot="${l.id}">Foto einsetzen</label><label class="btn ghost" for="camIn" data-fillslot="${l.id}">Kamera</label>${btn('del', 'Feld entfernen', 'danger')}</div>`;
}
const layerName = l => l.type === 'image' ? `Foto ${state.layers.filter(x => x.type === 'image').indexOf(l) + 1}` : l.type === 'text' ? `„${esc((l.text || '').split('\n')[0].slice(0, 18))}“` : (SHAPES.find(s => s[0] === l.kind) || ['', 'Form'])[1];
const ICON = { image: IC.photo, text: IC.text, shape: IC.shape };
function panelLayers() {
  if (!state.layers.length) return '<p class="note">Noch keine Ebenen.</p>';
  return `<div class="layer-list">${state.layers.map((l, i) => ({ l, i })).reverse().map(({ l, i }) => `<div class="layer-row${l.hidden ? ' off' : ''}">
    <button class="layer-pick" data-pick="${l.id}"><span class="layer-ico">${ICON[l.type]}</span><span>${layerName(l)}</span></button>
    <button class="icon-btn sm" data-lvis="${l.id}" aria-label="${l.hidden ? 'Einblenden' : 'Ausblenden'}" title="${l.hidden ? 'Einblenden' : 'Ausblenden'}">${l.hidden ? IC.eyeOff : IC.eye}</button>
    <button class="icon-btn sm${l.locked ? ' on' : ''}" data-llock="${l.id}" aria-label="${l.locked ? 'Entsperren' : 'Sperren'}" title="${l.locked ? 'Entsperren' : 'Sperren'}">${l.locked ? IC.lock : IC.unlock}</button>
    <button class="icon-btn sm" data-lup="${l.id}" aria-label="Nach vorn" ${i === state.layers.length - 1 ? 'disabled' : ''}>${IC.up}</button>
    <button class="icon-btn sm" data-ldown="${l.id}" aria-label="Nach hinten" ${i === 0 ? 'disabled' : ''}>${IC.down}</button></div>`).join('')}</div>
    <p class="note">Oben in der Liste liegt vorne. Gesperrte Ebenen lassen sich nicht versehentlich verschieben.</p>`;
}
const EMOJI = ['☀️', '🌊', '❤️', '✨', '📍', '🌸', '🍂', '⭐', '🌙', '📷', '🎞️', '🍦', '🐚', '⛵', '🌿', '🔥', '🦋', '🌈', '💌', '🎉'];
function panelElements() {
  const el = ([k, lb]) => `<button class="el" data-addshape="${k}"><svg viewBox="0 0 40 40" aria-hidden="true">${shapeIcon(k)}</svg><span>${lb}</span></button>`;
  const rec = LS.get('recentEl', []).map(k => k.startsWith('e:') ? `<button class="emo" data-emoji="${k.slice(2)}">${k.slice(2)}</button>` : SHAPES.find(x => x[0] === k) ? el(SHAPES.find(x => x[0] === k)) : '').join('');
  return `${`<div class="paste-pad" contenteditable="true" inputmode="none" enterkeyhint="done" role="button" aria-label="Einfügen – antippen oder lange drücken und Einsetzen wählen">${IC.paste}<span>Einfügen<small>${ui.layerClip ? 'Kopiertes Element, Bild oder Text' : 'Bild oder Text aus anderen Apps'} · lange drücken → „Einsetzen“</small></span></div>`}
  ${rec ? group('Zuletzt benutzt', `<div class="el-grid recent">${rec}</div>`) : ''}
  ${group('Kritzeleien', `<div class="el-grid">${SHAPES.filter(([k]) => isDoodle(k)).map(el).join('')}</div>`)}
  ${group('Formen & Sticker', `<div class="el-grid">${SHAPES.filter(([k]) => !isDoodle(k)).map(el).join('')}</div>`)}
  ${group('Emoji', `<div class="emoji-row">${EMOJI.map(e => `<button class="emo" data-emoji="${e}">${e}</button>`).join('')}</div>`)}
  ${group('Text-Vorlagen', `<div class="chips">${TEXT_PRESETS.map(([k, lb]) => chip(`data-addtext="${k}"`, lb, false)).join('')}</div>`)}`;
}
function shapeIcon(k) {
  if (isDoodle(k)) return doodleSVG(k);
  const f = 'fill="var(--accent)"';
  return { rect: `<rect x="6" y="9" width="28" height="22" ${f}/>`, round: `<rect x="6" y="9" width="28" height="22" rx="6" ${f}/>`, circle: `<circle cx="20" cy="20" r="13" ${f}/>`,
    frame: `<rect x="8" y="6" width="24" height="28" fill="none" stroke="var(--accent)" stroke-width="3"/>`, line: `<path d="M6 20h28" stroke="var(--accent)" stroke-width="3" stroke-linecap="round"/>`,
    arrow: `<path d="M6 18h18v-5l10 7-10 7v-5H6z" ${f}/>`, star: `<path d="M20 5l4.4 9.3 10 1.2-7.4 6.9 2 10L20 27.4 11 32.4l2-10-7.4-6.9 10-1.2z" ${f}/>`,
    heart: `<path d="M20 33C8 25 5 19 5 14a7.5 7.5 0 0 1 15-2 7.5 7.5 0 0 1 15 2c0 5-3 11-15 19z" ${f}/>`, sparkle: `<path d="M20 4Q20 20 36 20Q20 20 20 36Q20 20 4 20Q20 20 20 4z" ${f}/>`,
    blob: `<path d="M20 6c9 0 15 5 14 13s-6 15-15 15S5 29 6 20 11 6 20 6z" ${f}/>`, tape: `<path d="M4 14l2 3-2 3 2 3-2 3h32l-2-3 2-3-2-3 2-3z" fill="#f3e2b3" opacity=".9"/>`,
    arch: `<path d="M9 34V18a11 11 0 0 1 22 0v16z" ${f}/>`,
    lace: `<path d="M14 4h12v32H14z" fill="#fbfaf6"/><g fill="#fbfaf6">${[8, 16, 24, 32].map(y => `<circle cx="14" cy="${y}" r="4"/><circle cx="26" cy="${y}" r="4"/>`).join('')}</g>`,
    starSticker: `<path d="M20 5l4.4 9.3 10 1.2-7.4 6.9 2 10L20 27.4 11 32.4l2-10-7.4-6.9 10-1.2z" fill="#d8d3c8" stroke="#fff"/>`,
    leaves: `<path d="M12 8q7 5 0 12q-7-7 0-12zM27 18q7 5 0 12q-7-7 0-12z" fill="#d9822b"/>`,
    check: `<circle cx="20" cy="20" r="12" fill="#3b82f6"/><path d="M14 20l4 4 8-8" fill="none" stroke="#fff" stroke-width="3"/>`,
    paper: `<path d="M5 9l4 1 3-2 4 2 5-1 4 1 5-2 5 2-1 4 1 5-1 6 1 5-1 4-5-1-4 2-5-1-4 1-4-2-4 1-1-5 1-5-1-6 1-5z" fill="#fbfaf6"/>`,
    spiral: [6, 14, 22, 30].map(x => `<ellipse cx="${x + 2}" cy="20" rx="3" ry="9" fill="none" stroke="#c8ccd0" stroke-width="2"/>`).join(''),
    clip: `<path d="M24 14v16a5 5 0 0 1-10 0V9a6 6 0 0 1 12 0v17" fill="none" stroke="#9aa0a6" stroke-width="2.5"/>`,
    binder: `<path d="M12 22h16l4 12H8z" fill="#888"/><path d="M14 22l2-14h8l2 14" fill="none" stroke="#c8ccd0" stroke-width="2"/>`,
    laurel: `<path d="M12 32a14 14 0 0 1 0-24M28 32a14 14 0 0 0 0-24" fill="none" stroke="var(--accent)" stroke-width="3" stroke-dasharray="3 2"/>`,
    scribble: `<path d="M7 8l27 1-1 24-26-1z M9 6l23 3" fill="none" stroke="var(--fg)" stroke-width="2"/>`,
    corners: `<path d="M6 16V6h10M34 24v10H24" fill="none" stroke="var(--fg)" stroke-width="2.5"/>`,
    scribbleArrow: `<path d="M5 12q6 20 17 14t13-14M30 10h5v6" fill="none" stroke="var(--fg)" stroke-width="2.5"/>` }[k] || '';
}
const TEXT_PRESETS = [['seite', 'Seitenzahl 1/5'], ['wischen', 'Wischen →'], ['handle', '@Name'], ['ort', '📍 Ort'], ['perlen', 'Perlen'], ['erpresser', 'Ausschnitte'], ['schreibschrift', 'Schreibschrift'], ['klassisch', 'Klassisch'], ['etikett', 'Etikett'], ['neon', 'Neon'], ['zeitung', 'Zeitung'], ['plakat', 'Plakat'], ['pixel', 'Pixel'], ['notiz', 'Notiz'], ['kontur', 'Kontur']];
function textPreset(l, k) {
  const base = { bg: 'none', shadow: true, glow: false, stroke: 0, spacing: 0, upper: false, lineH: 1.16 };
  const P = {
    seite: { text: '{n}/{N}', font: 'Space Mono', color: '#ffffff', bg: 'soft', bgColor: '#111111', size: 34, shadow: false },
    wischen: { text: 'WISCHEN →', font: 'Space Mono', color: '#ffffff', spacing: 18, size: 30, shadow: true },
    handle: { text: '@deinname', font: 'Instrument Sans', color: '#ffffff', size: 36, shadow: true },
    ort: { font: 'Instrument Sans', color: '#1d1d1d', bg: 'pin', bgColor: '#ffffff', size: 40, shadow: false },
    perlen: { font: 'Archivo Black', color: '#1d1d1d', bg: 'beads', bgColor: '#e4e1da', upper: true, size: 90, shadow: false },
    erpresser: { font: 'Anton', color: '#1d1d1d', bg: 'ransom', size: 120, shadow: false },
    schreibschrift: { font: 'Great Vibes', color: '#f4e7b4', size: 150 },
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
  freistellen: (l, p) => { const n = l.cut ? l.cut.strokes.length : 0, ai = /^ai/.test(ui.cutMode);
    return `<div class="chips">${[['ai', '✨ Motiv antippen'], ['add', 'Malen'], ['erase', 'Radieren'], ['aisub', 'Bereich entfernen']].map(([k, lb]) => chip(`data-cutmode="${k}"`, lb, ui.cutMode === k)).join('')}</div>
    ${ai ? `<p class="note">${ui.cutMode === 'ai' ? '<b>Tippe aufs Motiv</b> – Person, Tier oder Gegenstand wird automatisch erkannt. Nochmal tippen fügt weitere Teile hinzu.' : '<b>Tippe auf einen Bereich</b>, der nicht zum Motiv gehören soll.'} Die Erkennung läuft auf deinem Gerät, es wird nichts hochgeladen.</p>`
      : group('', slider('ui.cutSize', 'Pinselgröße', 1, 25, .5, 'n', 5)) + (ui.cutMode === 'add' ? toggle('cutsmart', 'Kantenerkennung beim Malen (nur ähnliche Farben)', ui.cutSmart) : '')}
    ${n ? group('Kante', toggle('cutrefine', 'Kanten an Farben anpassen (Haare, Fell)', !!l.cut.refine) + slider('cut.feather', 'Weichheit', 0, 10, .5, 'd1', 0) + slider('cut.shift', 'Kante schrumpfen / erweitern', -10, 10, .5, 'd1', 0)) : ''}
    ${group('Ansicht', `<div class="chips">${[['dim', 'Hintergrund abdunkeln'], ['red', 'Maske rot'], ['off', 'Normal']].map(([k, lb]) => chip(`data-cutview="${k}"`, lb, ui.cutView === k)).join('')}</div>`)}
    ${group('Verwenden', (n ? toggle('cuton', 'Motiv liegt vor Text & Elementen', l.cut.on !== false) : '') + toggle('sticker', 'Nur das Motiv zeigen (Hintergrund weg)', l.sticker)
      + (l.sticker ? slider('l.stickerBorder', 'Sticker-Rand', 0, 5, .1, 'd1', 1.6) + swatches('frame', ['#ffffff', '#111111', '#f2c14e', '#ff7eb6', '#3f7fe0'], l.borderColor) + toggle('stickershadow', 'Schatten', l.stickerShadow !== false) : ''))}
    <div class="row">${btn('cutUndo', 'Letzten Schritt entfernen', 'ghost', n ? '' : 'disabled')}${btn('cutClear', 'Alles löschen', 'danger', n ? '' : 'disabled')}${btn('cutCopy', 'Motiv als eigene Ebene', 'ghost', n ? '' : 'disabled')}</div>
    <p class="note">Text hinter dem Motiv: Text über das Foto legen – das Motiv bleibt davor. Für feine Stellen reinzoomen (zwei Finger) und mit „Malen“/„Radieren“ nacharbeiten.</p>`; },
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
  rahmen: (l, p) => panelFrame(l),
  ebene: (l, p) => panelImageLayer(l)
};
const BRUSH_MODES = [['dodge', 'Aufhellen'], ['burn', 'Abdunkeln'], ['sat', 'Sättigung +'], ['desat', 'Sättigung −'], ['warm', 'Wärmer'], ['cool', 'Kühler'], ['erase', 'Radierer']];
const CLIPS = [['rect', 'Rechteck'], ['round', 'Abgerundet'], ['circle', 'Kreis'], ['arch', 'Bogen'], ['heart', 'Herz'], ['star', 'Stern'], ['blob', 'Klecks']];
const FRAME_LIST = [['polaroid', 'Sofortbild'], ['instax', 'Instax'], ['film', 'Kleinbild'], ['filmv', 'Kleinbild hoch'], ['dia', 'Dia']];
const EDGES = [['', 'Glatt'], ['torn', 'Zerrissen'], ['deckle', 'Büttenrand'], ['stamp', 'Briefmarke']];
function panelFrame(l) {
  const framed = FRAMES.has(l.shape);
  return `<div class="callout"><span class="note"><b>Doppelt aufs Foto tippen</b>, um den Ausschnitt im Rahmen zu verschieben und zu zoomen.</span>${btn('enterCrop', 'Ausschnitt & Zoom')}</div>`
  + group('Form', `<div class="chips">${CLIPS.map(([k, lb]) => chip(`data-shape="${k}"`, lb, l.shape === k)).join('')}</div>${l.shape === 'round' ? slider('l.radius', 'Eckenradius', 1, 50, 1, 'n', 7) : ''}`)
  + group('Rand & Rahmen', `<div class="chips">${chip('data-shape="rect"', 'Kein Rahmen', !framed && !l.border)}${FRAME_LIST.map(([k, lb]) => chip(`data-shape="${k}"`, lb, l.shape === k)).join('')}</div>
    ${slider('l.border', framed ? 'Randbreite' : 'Rand', 0, 120, 1, 'px')}${swatches('frame', FRAME_COLORS.concat(l.shape === 'film' ? ['#161616'] : []), l.borderColor)}
    ${!framed ? `<div class="row"><span class="note">Feine Linie</span><div class="chips">${[['', 'Keine'], ['#111111', 'Schwarz'], ['#ffffff', 'Weiß']].map(([k, lb]) => chip(`data-keyline="${k}"`, lb, (l.keyline || '') === k)).join('')}</div></div>` : ''}
    ${framed ? `<input class="name" id="capIn" value="${esc(l.caption || '')}" placeholder="${l.shape === 'film' ? 'Filmaufdruck' : 'Beschriftung, z. B. Juli 24'}" maxlength="40" aria-label="Beschriftung">` : ''}
    ${toggle('shadow', 'Schatten', l.shadow)}`)
  + (framed ? '' : group('Kante', `<div class="chips">${EDGES.map(([k, lb]) => chip(`data-edge="${k}"`, lb, (l.edge || '') === k)).join('')}</div>
    ${l.edge === 'torn' ? `<div class="chips">${[['all', 'Rundum'], ['tb', 'Oben & unten'], ['lr', 'Links & rechts']].map(([k, lb]) => chip(`data-edgesides="${k}"`, lb, (l.edgeSides || 'all') === k)).join('')}</div>` : ''}`))
  + group('', slider('l.wpct', 'Größe (Slide-Breite)', 10, 100 * state.slides + 100, 1, 'pct', 100) + slider('l.rot', 'Drehung', -180, 180, .5, 'deg'));
}
function panelImageLayer(l) {
  return group('', slider('l.wpct', 'Größe (Slide-Breite)', 10, 100 * state.slides + 100, 1, 'pct', 100) + slider('l.rot', 'Drehung', -180, 180, .5, 'deg') + slider('l.opacity', 'Deckkraft', 0, 100, 1, 'pct', 100, 100))
  + group('Mischmodus', `<div class="chips scroll">${BLENDS.map(([k, lb]) => chip(`data-blend="${k}"`, lb, (l.blend || 'source-over') === k)).join('')}</div><span class="note">Für Doppelbelichtung: Foto über ein anderes legen, „Negativ multipl.“ oder „Aufhellen“ wählen.</span>`)
  + alignRow() + `<div class="row">${btn('fillSlide', 'Slide füllen')}${btn('fillAll', 'Alle Slides füllen')}${btn('replace', 'Foto ersetzen')}${btn('bgBlur', 'Als unscharfer Hintergrund')}</div>` + layerOrderRow(l);
}
const layerOrderRow = l => `<div class="row">${btn('front', 'Nach vorn')}${btn('back', 'Nach hinten')}${btn('dup', 'Duplizieren')}${btn('lock', l.locked ? 'Entsperren' : 'Sperren')}${btn('del', 'Löschen', 'danger')}</div>`;
function panelLayerCommon(l) {
  return group('', (l.type === 'text' ? '' : slider('l.rot', 'Drehung', -180, 180, .5, 'deg')) + slider('l.opacity', 'Deckkraft', 0, 100, 1, 'pct', 100, 100))
    + group('Mischmodus', `<div class="chips scroll">${BLENDS.map(([k, lb]) => chip(`data-blend="${k}"`, lb, (l.blend || 'source-over') === k)).join('')}</div>`)
    + alignRow() + `<div class="row">${btn('toAll', 'Auf jede Slide kopieren')}</div>` + layerOrderRow(l);
}
function panelText(l) {
  return `<textarea class="txt" id="txtIn" aria-label="Text" rows="2">${esc(l.text)}</textarea>
  <span class="note">Platzhalter: <b>{n}</b> Slide-Nummer · <b>{N}</b> Anzahl Slides · <b>{datum}</b> heute</span>
  ${swatches('text', TEXT_COLORS, l.color)}
  <div class="chips scroll">${FONTS.map(([f, lb, wgt]) => `<button class="fontchip" data-font="${f}" aria-pressed="${l.font === f}"><span class="aa" style="font-family:'${f}';font-weight:${wgt}">Aa</span><span>${lb}</span></button>`).join('')}</div>
  ${group('Schnell-Stile', `<div class="chips">${TEXT_PRESETS.map(([k, lb]) => chip(`data-tpreset="${k}"`, lb, false)).join('')}</div>`)}`;
}
const PIN_COLORS = ['#8a4bd8', '#e5484d', '#ff7eb6', '#ff9a2e', '#f2c14e', '#3fa36b', '#3f7fe0', '#111111', '#ffffff'];
function panelTextStyle(l) {
  return group('Farbe', swatches('text', TEXT_COLORS, l.color)) + group('', slider('l.size', 'Größe', 16, 400, 1, 'px', 110) + slider('l.rot', 'Drehung', -180, 180, .5, 'deg') + slider('l.spacing', 'Laufweite', -10, 60, 1, 'n') + slider('l.lineH', 'Zeilenabstand', .8, 2, .02, 'lh', 1.16) + slider('l.sx', 'Breite (stauchen / strecken)', 20, 300, 1, 'pct', 100, 100) + slider('l.sy', 'Höhe (stauchen / strecken)', 20, 300, 1, 'pct', 100, 100) + slider('l.curve', 'Bogen', -100, 100, 1, 'signed', 0) + (l.curve && l.bg !== 'none' ? '<span class="note">Bogentext gibt es nur ohne Hinterlegung.</span>' : ''))
  + group('Ausrichtung', `<div class="chips">${[['left', 'Links'], ['center', 'Mitte'], ['right', 'Rechts']].map(([k, lb]) => chip(`data-align="${k}"`, lb, l.align === k)).join('')}</div>`)
  + group('Hinterlegung', `<div class="chips">${[['none', 'Keine'], ['solid', 'Fläche'], ['soft', 'Halbtransparent'], ['band', 'Zeilenband'], ['beads', 'Perlen'], ['ransom', 'Ausschnitte'], ['pin', 'Orts-Pille']].map(([k, lb]) => chip(`data-tbg="${k}"`, lb, l.bg === k)).join('')}</div>
    ${l.bg === 'pin' ? `<span class="sec-label">Pille</span>${swatches('textbg', TEXT_COLORS, l.bgColor)}<span class="sec-label">Stecknadel</span>${swatches('pin', PIN_COLORS, l.pinColor || '#8a4bd8')}` : l.bg !== 'none' ? swatches('textbg', TEXT_COLORS, l.bgColor) : ''}`)
  + group('Kontur', slider('l.stroke', 'Konturstärke', 0, 20, .5, 'n') + (l.stroke ? swatches('stroke', TEXT_COLORS, l.strokeColor) : ''))
  + toggle('upper', 'Großbuchstaben', l.upper) + toggle('glow', 'Leuchten (Neon)', l.glow) + (l.bg === 'none' ? toggle('tshadow', 'Schatten für Lesbarkeit', l.shadow) : '');
}
const SHAPE_FAM = { basic: ['rect', 'round', 'circle', 'frame', 'line', 'arrow', 'star', 'heart', 'sparkle', 'blob', 'arch'], prop: ['tape', 'clip', 'binder', 'paper', 'lace', 'starSticker', 'leaves', 'check', 'spiral', 'laurel'] };
const famOf = k => isDoodle(k) || /^(scribble|corners|scribbleArrow)$/.test(k) ? 'doodle' : SHAPE_FAM.prop.includes(k) ? 'prop' : 'basic';
function panelShape(l) {
  const k = l.kind, fam = famOf(k), real = /^(tape|clip|binder)$/.test(k), doodle = fam === 'doodle';
  const canOutline = fam === 'basic' && !['line', 'arrow', 'frame'].includes(k);
  let h = group(fam === 'doodle' ? 'Kritzelei' : fam === 'prop' ? 'Requisite' : 'Form', `<div class="chips">${SHAPES.filter(([x]) => famOf(x) === fam).map(([x, lb]) => chip(`data-skind="${x}"`, lb, k === x)).join('')}</div>`);
  if (k === 'tape') { const tt = l.tape || tapeType(l.fill);
    h += group('Klebeband', `<div class="chips">${TAPE_KINDS.map(([x, lb]) => chip(`data-tape="${x}"`, lb, (l.tape || '') === x)).join('')}</div>
      ${tt === 'washi' ? `<span class="sec-label">Muster</span><div class="chips">${chip('data-tpat=""', 'Zufall', l.pattern == null)}${TAPE_PATTERNS.map(([x, lb]) => chip(`data-tpat="${x}"`, lb, l.pattern === x)).join('')}</div>` : ''}
      ${swatches('fill', TAPE_COLORS, l.fill)}<div class="row">${btn('reseed', 'Neu abreißen')}</div>`); }
  else if (k === 'clip' || k === 'binder') h += group('Farbe', `<div class="chips">${(k === 'clip' ? CLIP_COLORS : BINDER_COLORS).map(([c, lb]) => chip(`data-fillc="${c}"`, `<i class="cdot" style="--c:${c}"></i>${lb}`, l.fill === c)).join('')}</div>`);
  else h += group('Farbe', swatches('fill', TEXT_COLORS.concat(['#f3e2b3']), l.fill));
  const prop = real || doodle || ['starSticker', 'laurel', 'leaves', 'spiral', 'check'].includes(k);
  h += group('', (prop ? slider('l.wprop', 'Größe', 20, 3000, 1, 'px') : slider('l.w', k === 'line' ? 'Länge' : 'Breite', 20, 3000, 1, 'px') + slider('l.h', k === 'line' ? 'Stärke' : 'Höhe', 2, 3000, 1, 'px'))
    + (k === 'round' ? slider('l.radius', 'Eckenradius', 1, 50, 1, 'n', 18) : '') + (canOutline && l.outline || doodle || k === 'frame' ? slider('l.sw', doodle ? 'Strichstärke' : 'Linienstärke', 2, doodle ? 40 : 80, 1, 'px', doodle ? 7 : 12) : '')
    + slider('l.rot', 'Drehung', -180, 180, .5, 'deg'));
  if (doodle) h += `<div class="row">${btn('reseed', 'Neu zeichnen')}</div>`;
  return h + (canOutline ? toggle('outline', 'Nur Umriss', l.outline) : '') + (real ? '' : toggle('shadow', 'Schatten', l.shadow)) + alignRow();
}

panel.addEventListener('click', async e => {
  if (e.target.closest('.paste-pad')) { pasteAny(); return; }
  const sub = e.target.closest('[data-sub]'); if (sub) { const k = sub.dataset.sub; ui.sub = ui.sub || {}; ui.sub[groupOf(k)[0]] = k; ui.tab.image = k; ui.pick = false; renderPanel(); updateTop(); requestRender(); return; }
  const rs = e.target.closest('[data-reset]'); if (rs) { const inp = rs.closest('.sl').querySelector('input'); inp.value = inp.dataset.def; inp.dispatchEvent(new Event('input', { bubbles: true })); flags.draft = false; pushHistory(); refreshAfterCommit(); requestRender(); return; }
  const fs = e.target.closest('[data-fillslot]'); if (fs) { ui.fillSlot = +fs.dataset.fillslot; return; }
  const t = e.target.closest('button'); if (!t || t.disabled) return; const l = selLayer(); const d = t.dataset;
  if (d.format) { const oh = dims().H; state.format = d.format; const nh = dims().H; state.layers.forEach(x => x.y *= nh / oh); fit(); commit(); }
  else if (d.slides) { state.slides = clamp(state.slides + +d.slides, 1, 20); fit(); commit(); }
  else if (d.colSet) { applyColor(d.colSet, d.v); commit(); }
  else if (d.tog) {
    const on = t.getAttribute('aria-checked') !== 'true', k = d.tog; haptic();
    if (k === 'grad') { state.bg.grad = on; if (state.tpl) state.tpl.bgLock = true; } else if (k === 'grid') { ui.grid = on; renderPanel(); requestRender(); return; }
    else if (k === 'stamp') l.params.stamp = on; else if (k === 'shadow' || k === 'tshadow') l.shadow = on; else if (k === 'upper') l.upper = on; else if (k === 'glow') l.glow = on;
    else if (k === 'outline') l.outline = on; else if (k === 'cutsmart') { ui.cutSmart = on; renderPanel(); return; } else if (k === 'cutrefine') l.cut.refine = on; else if (k === 'stickershadow') l.stickerShadow = on; else if (k === 'cutshow') { ui.cutShow = on; renderPanel(); requestRender(); return; }
    else if (k === 'cuton') l.cut.on = on; else if (k === 'sticker') { l.sticker = on; if (on && !(l.cut && l.cut.strokes.length)) toast('Male jetzt über das Motiv – nur das wird zum Sticker'); } else if (k === 'minv') l.params.masks[ui.maskSel].inv = on;
    commit();
  }
  else if (d.tpl) { haptic(); pushList('tplRecent', d.tpl, 12); const T = tplDef(d.tpl), v = state.tpl && state.tpl.kind === d.tpl ? (state.tpl.v + 1) % T.vars.length : 0; const n0 = state.slides;
    applyTemplate(d.tpl, v); ui.sel = null; fit(); panel.dataset.key = ''; commit(); toast(`${T.name} · ${T.vars[v]}${state.slides !== n0 ? ` · ${state.slides} Slides` : ''}${layout.hiddenCount ? ` · ${layout.hiddenCount} Foto${layout.hiddenCount === 1 ? '' : 's'} ausgeblendet` : ''}`, 'Rückgängig', undo); }
  else if (d.tplvar) { applyTemplate(state.tpl.kind, +d.tplvar); fit(); commit(); }
  else if (d.tplcat) { ui.tplCat = d.tplcat; renderPanel(); panel.querySelector('.tpl-grid')?.scrollIntoView({ block: 'nearest' }); }
  else if (d.tplshadow) { state.tpl.shadow = d.tplshadow === 'tpl' ? null : d.tplshadow === 'on'; layout(false); commit(); }
  else if (d.tplmix) { state.tpl.uniform = d.tplmix === 'uni'; layout(false); commit(); }
  else if (d.tplfill) { state.tpl.fill = d.tplfill; layout(false); commit(); }
  else if (d.tplframe !== undefined) { state.tpl.frame = d.tplframe === '' ? null : +d.tplframe; layout(false); commit(); }
  else if (d.tplfont !== undefined) { state.tpl.font = d.tplfont || null; layout(false); commit(); }
  else if (d.tpldood !== undefined) { state.tpl.doodles = d.tpldood || null; layout(false); commit(); }
  else if (d.tape !== undefined) { l.tape = d.tape || undefined; if (d.tape === 'clear') l.fill = '#f4f4ee'; else if (d.tape === 'masking') l.fill = '#efe3c4'; else if (d.tape === 'washi' && tapeType(l.fill) !== 'washi') l.fill = '#f2c6c2'; commit(); }
  else if (d.tpat !== undefined) { if (d.tpat === '') delete l.pattern; else l.pattern = +d.tpat; commit(); }
  else if (d.fillc) { l.fill = d.fillc; commit(); }
  else if (d.al) { const { W, H } = dims(), i = clamp(Math.floor(l.x / W), 0, state.slides - 1), b = boxOf(l), m = W * .04;
    if (d.al === 'l') l.x = i * W + m + b.ow / 2; else if (d.al === 'c') l.x = (i + .5) * W; else if (d.al === 'r') l.x = (i + 1) * W - m - b.ow / 2;
    else if (d.al === 't') l.y = m + b.oh / 2; else if (d.al === 'm') l.y = H / 2; else l.y = H - m - b.oh / 2; commit(); }
  else if (d.lookcat) { ui.lookCat = d.lookcat; renderPanel(); }
  else if (d.look) { const was = l.params.look; l.params.look = d.look; if (LOOKS[d.look].stamp && was !== d.look) l.params.stamp = true; if (!LOOKS[d.look].stamp && LOOKS[was]?.stamp) l.params.stamp = false; commit(); }
  else if (d.preset) { const pr = loadPresets()[+d.preset]; if (pr) { l.params = upgradeParams(clone(pr.params)); toast(`Preset „${pr.name}“ angewendet`); commit(); } }
  else if (d.band) { ui.hslBand = +d.band; renderPanel(); }
  else if (d.grade) { ui.gradeRange = d.grade; renderPanel(); }
  else if (d.curve) { ui.curveCh = d.curve; renderPanel(); }
  else if (d.ratio) { l.crop.ratio = d.ratio === 'orig' ? 'orig' : +d.ratio; delete l.crop.box; commit(); }
  else if (d.shape) { l.shape = d.shape; if (d.shape === 'film') l.borderColor = '#161616'; else if (d.shape === 'dia') l.borderColor = '#ece8de'; else if (FRAMES.has(d.shape) && l.borderColor === '#161616') l.borderColor = '#ffffff'; commit(); }
  else if (d.blend) { l.blend = d.blend; commit(); }
  else if (d.edge !== undefined) { l.edge = d.edge || undefined; if (d.edge === 'stamp' && !l.borderColor) l.borderColor = '#ffffff'; commit(); }
  else if (d.keyline !== undefined) { l.keyline = d.keyline || undefined; commit(); }
  else if (d.edgesides) { l.edgeSides = d.edgesides; commit(); }
  else if (d.font) { l.font = d.font; commit(); }
  else if (d.tpreset) { textPreset(l, d.tpreset); commit(); }
  else if (d.align) { l.align = d.align; commit(); }
  else if (d.tbg) { l.bg = d.tbg; commit(); }
  else if (d.skind) { l.kind = d.skind; commit(); }
  else if (d.bgdir) { state.bg.dir = d.bgdir; if (state.tpl) state.tpl.bgLock = true; commit(); }
  else if (d.pattern) { state.bg.pattern = d.pattern; if (state.tpl) state.tpl.bgLock = true; commit(); }
  else if (d.leak) { l.params.leakKind = +d.leak; commit(); }
  else if (d.sfmt) { l.params.stampStyle.fmt = d.sfmt; l.params.stamp = true; commit(); }
  else if (d.scol) { l.params.stampStyle.color = d.scol; l.params.stamp = true; commit(); }
  else if (d.spos) { l.params.stampStyle.pos = d.spos; l.params.stamp = true; commit(); }
  else if (d.mask) { ui.maskSel = +d.mask; renderPanel(); requestRender(); }
  else if (d.mkind) { const m = l.params.masks[ui.maskSel]; m.kind = d.mkind; if (m.kind === 'linear') { m.rx = .25; m.feather = .6; m.angle = Math.PI / 2; } else { m.rx = m.ry = .16; m.angle = 0; } commit(); }
  else if (d.cutmode) { ui.cutMode = d.cutmode; renderPanel(); updateTop(); }
  else if (d.cutview) { ui.cutView = d.cutview; renderPanel(); requestRender(); }
  else if (d.bmode) { ui.brushMode = d.bmode; renderPanel(); updateTop(); }
  else if (d.blur) { l.params.blur.mode = d.blur; commit(); }
  else if (d.addshape) { pushList('recentEl', d.addshape, 8); const { W, H } = dims(), s = newShapeLayer(d.addshape, (visibleSlide() + .5) * W, H / 2); state.layers.push(s); ui.tab.shape = 'form'; selectLayer(s.id); pushHistory(); }
  else if (d.emoji) { pushList('recentEl', 'e:' + d.emoji, 8); const { W, H } = dims(), s = newTextLayer((visibleSlide() + .5) * W, H / 2, d.emoji); s.size = 220; s.shadow = false; s.font = 'Instrument Sans'; state.layers.push(s); ui.tab.text = 'stil'; selectLayer(s.id); pushHistory(); }
  else if (d.addtext) { const { W, H } = dims(), s = newTextLayer((visibleSlide() + .5) * W, H / 2, 'Dein Text'); textPreset(s, d.addtext); state.layers.push(s); ui.tab.text = 'text';
    if (d.addtext === 'seite') { s.x = (visibleSlide() + .88) * W; s.y = H * .05; selectLayer(s.id); action('toAll', s); ui.sel = s.id; renderUI(); toast('Seitenzahl auf jeder Slide – zählt automatisch mit'); }
    else if (d.addtext === 'handle') { s.y = H * .94; selectLayer(s.id); pushHistory(); setTimeout(() => $('#txtIn')?.select(), 50); toast('Tipp: unter „Ebene“ → „Auf jede Slide kopieren“'); }
    else { selectLayer(s.id); pushHistory(); } }
  else if (d.pick) { selectLayer(+d.pick); }
  else if (d.goslide) { goSlide(+d.goslide); setTimeout(renderPanel, 300); }
  else if (d.lvis) { const x = state.layers.find(y => y.id === +d.lvis); x.hidden = !x.hidden; commit(); }
  else if (d.llock) { const x = state.layers.find(y => y.id === +d.llock); x.locked = !x.locked; commit(); }
  else if (d.lup || d.ldown) { const id = +(d.lup || d.ldown), i = state.layers.findIndex(y => y.id === id), j = i + (d.lup ? 1 : -1); if (j >= 0 && j < state.layers.length) { const [x] = state.layers.splice(i, 1); state.layers.splice(j, 0, x); } commit(); }
  else if (d.act2) action(d.act2, l);
});
function commit() { const l = selLayer(); if (l && l.tplKey && l.type === 'text') l.userEdited = true; pushHistory(); renderUI(); }
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
    case 'help': openHelp(); return;
    case 'slideLeft': { const i = visibleSlide(); if (shiftSlide(i, -1)) { commit(); view.ox += W * view.s; clampView(); } return; }
    case 'slideRight': { const i = visibleSlide(); if (shiftSlide(i, 1)) { commit(); view.ox -= W * view.s; clampView(); } return; }
    case 'slideDup': { if (state.slides >= 20) { toast('Maximal 20 Slides'); return; } const i = visibleSlide(), inside = x => { const b = boxOf(x); return x.x - b.ow / 2 >= i * W - 1 && x.x + b.ow / 2 <= (i + 1) * W + 1; };
      const copies = state.layers.filter(inside).map(x => { const c = unlinked(clone(x)); c.id = newId(); c.x += W; return c; });
      state.layers.forEach(x => { if (x.x > (i + 1) * W) x.x += W; }); state.layers.push(...copies); state.slides++; fit(); commit(); toast(`Slide ${i + 1} dupliziert`, 'Rückgängig', undo); return; }
    case 'slideInsert': { if (state.slides >= 20) { toast('Maximal 20 Slides'); return; } const i = visibleSlide(); state.layers.forEach(x => { if (x.x > (i + 1) * W) x.x += W; }); state.slides++; fit(); commit(); toast(`Leere Slide ${i + 2} eingefügt`); return; }
    case 'slideDelete': { if (state.slides <= 1) return; const i = visibleSlide(); state.layers = state.layers.filter(x => { const b = boxOf(x); return !(x.x - b.ow / 2 >= i * W - 1 && x.x + b.ow / 2 <= (i + 1) * W + 1); });
      state.layers.forEach(x => { if (x.x > (i + 1) * W) x.x -= W; }); state.slides--; fit(); commit(); toast(`Slide ${i + 1} gelöscht`, 'Rückgängig', undo); return; }
    case 'curveReset': P.curves[ui.curveCh] = ID_CURVE.slice(); commit(); return;
    case 'curveS': P.curves[ui.curveCh] = [0, .2, .5, .8, 1]; commit(); return;
    case 'curveFade': P.curves[ui.curveCh] = [.08, .27, .5, .74, .95]; commit(); return;
    case 'gradeReset': P.grade = defParams().grade; commit(); return;
    case 'pick': ui.pick = !ui.pick; renderPanel(); updateTop(); return;
    case 'rot90': { cache.delete(cacheKey(l)); const a0 = cropAspect(l), h0 = l.w / a0; l.rot90 = (l.rot90 + 1) % 4; if (l.crop.ratio === 'orig') l.w = h0; resetGeoEdits(l); commit(); return; }
    case 'flip': cache.delete(cacheKey(l)); l.flip = !l.flip; resetGeoEdits(l); commit(); return;
    case 'toAll': { const i = clamp(Math.floor(l.x / W), 0, state.slides - 1), copies = [];
      for (let k = 0; k < state.slides; k++) if (k !== i) { const c = unlinked(clone(l)); c.id = newId(); c.x += (k - i) * W; copies.push(c); }
      state.layers.splice(state.layers.indexOf(l) + 1, 0, ...copies); commit(); toast(`Auf ${copies.length} weitere Slide${copies.length === 1 ? '' : 's'} kopiert`, 'Rückgängig', undo); return; }
    case 'copyLayer': copyLayer(l); return;
    case 'pasteAny': pasteAny(); return;
    case 'enterCrop': enterCrop(true); return;
    case 'tplReroll': state.tpl.seed = (state.tpl.seed || 0) + 1; layout(false); commit(); toast('Seiten neu gewürfelt'); return;
    case 'tplFav': { const f = LS.get('tplFav', []), id = state.tpl.kind, on = f.includes(id); LS.set('tplFav', on ? f.filter(x => x !== id) : [id, ...f]); toast(on ? 'Aus Favoriten entfernt' : 'Als Favorit gemerkt'); renderPanel(); return; }
    case 'tplStyleReset': TPL_STYLE_KEYS.forEach(k => delete state.tpl[k]); layout(false); commit(); toast('Stil zurückgesetzt'); return;
    case 'tplBgReset': delete state.tpl.bgLock; layout(false); commit(); return;
    case 'reseed': l.seed = (l.seed || 0) + 1; commit(); return;
    case 'tplShuffle': shufflePhotos(); commit(); toast('Fotos neu gemischt'); return;
    case 'tplRelease': releaseTemplate(); commit(); toast('Vorlage gelöst – alles frei verschiebbar'); return;
    case 'cropReset': l.crop = { ratio: 'orig', zoom: 1, px: .5, py: .5 }; l.rot = 0; P.persp = { v: 0, h: 0 }; commit(); return;
    case 'fillSlide': coverSlide(l, clamp(Math.floor(l.x / W), 0, state.slides - 1)); commit(); return;
    case 'fillAll': coverAll(l); commit(); return;
    case 'center': l.x = (clamp(Math.floor(l.x / W), 0, state.slides - 1) + .5) * W; l.y = H / 2; commit(); return;
    case 'replace': ui.replaceId = l.id; $('#fileIn').removeAttribute('multiple'); $('#fileIn').click(); setTimeout(() => $('#fileIn').setAttribute('multiple', ''), 1000); return;
    case 'bgBlur': { const c = unlinked(clone(l)); c.id = newId(); c.shape = 'rect'; c.border = 0; c.shadow = false; c.opacity = 1; c.blend = 'source-over'; c.crop = { ratio: 'orig', zoom: 1, px: .5, py: .5 }; coverAll(c);
      c.params.blur = { mode: 'radial', x: .5, y: .5, size: 0, feather: .02, amt: 100, angle: 0 }; c.params.exposure = -.35; c.params.stamp = false; c.params.masks = []; c.params.brush = []; c.params.heal = [];
      state.layers.unshift(c); commit(); toast('Unscharfer Hintergrund über alle Slides angelegt'); return; }
    case 'lock': l.locked = !l.locked; commit(); toast(l.locked ? 'Gesperrt' : 'Entsperrt'); return;
    case 'front': { const i = state.layers.indexOf(l); if (i < state.layers.length - 1) { state.layers.splice(i, 1); state.layers.splice(i + 1, 0, l); } commit(); toast('Eine Ebene nach vorn'); return; }
    case 'back': { const i = state.layers.indexOf(l); if (i > 0) { state.layers.splice(i, 1); state.layers.splice(i - 1, 0, l); } commit(); toast('Eine Ebene nach hinten'); return; }
    case 'dup': { const c = unlinked(clone(l)); c.id = newId(); c.x += 60; c.y += 60; c.locked = false; state.layers.splice(state.layers.indexOf(l) + 1, 0, c); ui.sel = c.id; commit(); return; }
    case 'del': state.layers = state.layers.filter(x => x !== l); if (!state.layers.some(x => cacheKey(x) === cacheKey(l))) cache.delete(cacheKey(l)); ui.sel = null; commit(); toast('Gelöscht', 'Rückgängig', undo); return;
    case 'copy': ui.clip = clone(l.params); toast('Bearbeitung kopiert'); renderPanel(); return;
    case 'paste': if (ui.clip) { const keep = { heal: P.heal, brush: P.brush, masks: P.masks }; l.params = upgradeParams(clone(ui.clip)); Object.assign(l.params, keep); commit(); toast('Bearbeitung eingefügt'); } return;
    case 'applyAll': state.layers.filter(x => x.type === 'image' && x !== l).forEach(x => { const keep = { heal: x.params.heal, brush: x.params.brush, masks: x.params.masks }; x.params = clone(l.params); Object.assign(x.params, keep); }); commit(); toast('Auf alle Fotos übertragen'); return;
    case 'savePreset': { const name = ($('#presetName').value || '').trim() || `Preset ${loadPresets().length + 1}`; const ps = loadPresets(), pp = clone(P); pp.heal = []; pp.brush = []; pp.masks = []; pp.persp = { v: 0, h: 0 }; ps.push({ name, params: pp }); savePresets(ps); renderPanel(); toast(`„${name}“ gesichert`); return; }
    case 'clearPresets': if (!ui.confirmPresets) { ui.confirmPresets = true; renderPanel(); return; } ui.confirmPresets = false; savePresets([]); renderPanel(); toast('Presets gelöscht'); return;
    case 'exportPresets': { const blob = new Blob([JSON.stringify({ streifzug: 1, presets: loadPresets() }, null, 1)], { type: 'application/json' }); webSave([{ blob, name: 'streifzug-presets.json' }]); return; }
    case 'maskDel': P.masks.splice(ui.maskSel, 1); ui.maskSel = Math.max(0, ui.maskSel - 1); commit(); return;
    case 'maskDup': { const m = clone(P.masks[ui.maskSel]); m.x = clamp(m.x + .05); m.y = clamp(m.y + .05); P.masks.push(m); ui.maskSel = P.masks.length - 1; commit(); return; }
    case 'cutUndo': l.cut.strokes.pop(); commit(); return;
    case 'cutCopy': { const c = unlinked(clone(l)); c.id = newId(); c.sticker = true; c.stickerBorder = 0; c.shape = 'rect'; c.border = 0; c.edge = undefined; c.x += W * .06; c.y -= H * .03; c.locked = false;
      state.layers.splice(state.layers.indexOf(l) + 1, 0, c); ui.tab.image = 'rahmen'; ui.sel = c.id; commit(); toast('Motiv als eigene Ebene – frei verschieben, vergrößern, Rand geben'); return; }
    case 'cutClear': l.cut = { on: true, strokes: [] }; commit(); return;
    case 'brushUndo': P.brush.pop(); commit(); return;
    case 'brushClear': P.brush = []; commit(); return;
    case 'healUndo': P.heal.pop(); commit(); return;
    case 'healClear': P.heal = []; commit(); return;
  }
}
/* Kopie ohne Vorlagen-Verknüpfung */
function unlinked(c) { for (const k of ['grp', 'dupOf', 'slot', 'tplKind', 'tplKey', 'pane', 'paneKey', 'userEdited']) delete c[k]; if (c.crop) delete c.crop.box; if (c.params) c.params = clone(c.params); return c; }
/* Drehen/Spiegeln verändert das Bildkoordinatensystem – ortsgebundene Bearbeitungen passen dann nicht mehr */
function resetGeoEdits(l) { if (l.cut) l.cut.strokes = []; const P = l.params; if (P.masks.length || P.brush.length || P.heal.length) toast('Punkte, Pinsel und Reparaturen wurden zurückgesetzt'); P.masks = []; P.brush = []; P.heal = []; }
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
  const cnv = $('#hist'), l = selLayer(); if (!cnv || !l) return; const c = cache.get(cacheKey(l)); if (!c || !c.proc) return;
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
  cnv.onpointermove = e => { if (idx < 0) return; flags.draft = true; const p = pos(e); l.params.curves[ui.curveCh][idx] = +p.y.toFixed(3); draw(); requestRender(); };
  cnv.onpointerup = cnv.onpointercancel = () => { if (idx >= 0) { idx = -1; flags.draft = false; pushHistory(); requestRender(); } };
}

/* ---------- Fotos laden ---------- */
async function addFiles(files) {
  files = [...files].filter(f => f.type.startsWith('image/') || /\.(heic|heif|jpe?g|png|webp|avif)$/i.test(f.name));
  if (!files.length) { ui.fillSlot = null; return; }
  if (ui.sample) { state.layers = []; state.tpl = null; cache.clear(); sources.clear(); ui.sample = false; ui.projectId = null; ui.projectName = 'Mein Karussell'; }
  toast(files.length === 1 ? 'Foto wird geladen …' : `${files.length} Fotos werden geladen …`);
  // leere Vorlagen-Felder zuerst füllen – das angetippte zuerst
  const empties = state.layers.filter(l => l.type === 'image' && !l.srcId).sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0));
  if (ui.fillSlot) { const i = empties.findIndex(l => l.id === ui.fillSlot); if (i > 0) empties.unshift(empties.splice(i, 1)[0]); ui.fillSlot = null; }
  const fresh = !state.tpl && files.length > 1 && !state.layers.some(l => l.type === 'image' && l.srcId);
  if (fresh) { state.slides = clamp(files.length, state.slides, 20); fit(); }
  const start = fresh ? 0 : visibleSlide(); const added = []; let free = 0;
  for (let k = 0; k < files.length; k++) {
    const f = files[k], id = 's' + newId();
    const src = { kind: 'file', file: f, nw: 0, nh: 0, date: f.lastModified || Date.now(), base: null };
    sources.set(id, src);
    if (files.length > 2) toast(`Fotos werden geladen … ${k + 1} von ${files.length}`);
    try { src.base = await loadScaled(src, PREVIEW_PX); }
    catch { toast(`„${f.name}“ konnte nicht gelesen werden.`); sources.delete(id); continue; }
    const slot = empties.shift();
    if (slot) {
      const group = slot.paneKey ? state.layers.filter(x => x.type === 'image' && !x.srcId && x.paneKey === slot.paneKey) : [slot];
      group.forEach((x, gi) => { x.srcId = id; x.ph = false; x.stampMs = src.date; x.params = slot.params; if (gi) x.dupOf = slot.id;
        if (x.pane) { x.grp = slot.paneKey + ':' + slot.id; computeBox(x); } const ei = empties.indexOf(x); if (ei >= 0) empties.splice(ei, 1); });
      added.push(slot);
    } else { const l = newImageLayer(id); coverSlide(l, (start + free++) % state.slides); state.layers.push(l); added.push(l); }
    requestRender();
  }
  if (free && state.tpl) { const n0 = state.slides; layout(true); fit(); if (state.slides !== n0) toast(`In die Vorlage einsortiert · ${state.slides} Slides`); }
  if (added.length && fresh) { selectLayer(null); pushHistory(); goSlide(0); toast(`${added.length} Fotos · je eine Slide`, 'Vorlage wählen', () => { selectLayer(null); ui.tab.none = 'vorlagen'; renderUI(); }); }
  else if (added.length) { ui.tab.image = 'rahmen'; selectLayer(added[added.length - 1].id); pushHistory(); if (!free || !state.tpl) toast(added.length === 1 ? 'Foto eingesetzt' : `${added.length} Fotos eingesetzt`); }
}
async function replacePhoto(f) {
  const l = state.layers.find(x => x.id === ui.replaceId); ui.replaceId = null; if (!l || !f) return;
  const id = 's' + newId(), src = { kind: 'file', file: f, nw: 0, nh: 0, date: f.lastModified || Date.now(), base: null };
  try { src.base = await loadScaled(src, PREVIEW_PX); } catch { toast('Foto konnte nicht gelesen werden.'); return; }
  sources.set(id, src); cache.delete(cacheKey(l)); l.srcId = id; l.stampMs = src.date; resetGeoEdits(l);
  relink(l.id); state.layers.filter(x => x.pane && x.srcId === id).forEach(computeBox); commit(); toast('Foto ersetzt – Bearbeitung bleibt');
}

/* ---------- Projekte ---------- */
function resetSession() { cache.clear(); sources.clear(); hist = []; hIdx = -1; ui.sel = null; ui.clip = ui.clip || null; savedSrc = new Set(); }
function newProject() {
  saveNow(); resetSession(); ui.confirmClear = false; ui.sample = false; ui.projectId = null; ui.projectName = 'Mein Karussell';
  state.layers = []; state.tpl = null; state.bg = { c1: '#efece6', c2: '#a8c5b5', grad: false, dir: 'h', pattern: 'none' }; fit(); pushHistory(); renderUI(); toast('Neues Projekt');
}
function loadSample() {
  if (!ui.sample) saveNow();
  resetSession(); ui.sample = true; ui.projectId = null; ui.projectName = 'Beispiel'; state.format = '4:5'; state.slides = 3; state.tpl = null;
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
  state.tpl = doc.tpl || null;
  state.layers = doc.layers.filter(l => l.type !== 'image' || !l.srcId || sources.has(l.srcId)); relink();
  state.layers.forEach(l => { if (l.type === 'image') { upgradeParams(l.params); if (l.stampMs == null) l.stampMs = sources.get(l.srcId)?.date || Date.now(); } });
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
$('#helpBtn').addEventListener('click', () => openHelp());
function openHelp() {
  $('#helpSheet').hidden = false;
  // kleine Technik-Zeile, hilft bei Darstellungsproblemen auf dem iPhone
  const pr = document.createElement('div'); pr.style.cssText = 'position:fixed;bottom:0;height:env(safe-area-inset-bottom,0px)'; document.body.append(pr);
  const a = $('#app').getBoundingClientRect(); $('#diag').textContent = `Version ${VERSION} · Fenster ${innerWidth}×${innerHeight} · Bildschirm ${screen.width}×${screen.height} · App bis ${Math.round(a.bottom)} · unten frei ${pr.offsetHeight} · ${navigator.standalone ? 'Home-Bildschirm' : 'Browser'}${document.documentElement.classList.contains('pwa-short') ? ' · kurz' : ''}`; pr.remove();
}
$('#closeHelp').addEventListener('click', () => $('#helpSheet').hidden = true);

/* ---------- Vorschau ---------- */
function openPreview() {
  selectLayer(null);
  const { W, H } = dims(), track = $('#igTrack'), dots = $('#igDots'); track.innerHTML = ''; dots.innerHTML = '';
  const dpr = Math.min(3, devicePixelRatio || 1), cw = Math.round(Math.min(440, innerWidth - 32) * dpr), chh = Math.round(cw * H / W);
  $('#previewSheet').hidden = false;
  for (let i = 0; i < state.slides; i++) {
    const c = mk(cw, chh); const x = c.getContext('2d');
    x.scale(cw / W, cw / W); x.translate(-i * W, 0); drawScene(x, { clean: true }); track.appendChild(c);
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
const setBar = f => { $('#expBar').style.width = Math.round(f * 100) + '%'; };
async function doExport() {
  if (!state.layers.some(l => l.type !== 'image' || l.srcId)) { toast('Füge zuerst ein Foto hinzu.'); return; }
  selectLayer(null);
  const sheet = $('#exportSheet'), grid = $('#expGrid'), prog = $('#expProgress'), note = $('#expNote');
  exportBlobs.forEach(b => URL.revokeObjectURL(b.url)); exportBlobs = [];
  sheet.hidden = false; grid.innerHTML = ''; note.textContent = ''; $('#saveAll').hidden = true; renderExpOpts();
  const { W, H } = dims(), procs = new Map(), all = state.layers.filter(l => l.type === 'image' && !l.hidden && l.srcId), byKey = new Map();
  for (const l of all) { const src = sources.get(l.srcId); if (!src) continue; const odd = l.rot90 % 2, onw = odd ? src.nh : src.nw, onh = odd ? src.nw : src.nh, [, , swp] = cropRect(onw, onh, l);
    const need = Math.max(onw, onh) * Math.min(1, l.w / swp) * 1.05, k = cacheKey(l), e = byKey.get(k); if (!e || need > e.need) byKey.set(k, { l, need }); }
  const imgs = [...byKey.values()];
  const mime = expOpt.type === 'png' ? 'image/png' : 'image/jpeg', ext = expOpt.type === 'png' ? 'png' : 'jpg';
  try {
    for (let k = 0; k < imgs.length; k++) {
      const { l, need } = imgs[k], src = sources.get(l.srcId); prog.textContent = `Foto ${k + 1} von ${imgs.length} wird in voller Auflösung entwickelt …`; setBar(k / (imgs.length + state.slides)); await pause(30);
      const base = await loadScaled(src, Math.min(4320, Math.ceil(need))), o = orientCanvas(base, l.rot90, l.flip), pr = prepare(o, l.params);
      procs.set(cacheKey(l), processImage(makeAux(pr), l.params, l.stampMs));
    }
    const push = async (c, name, label) => {
      const blob = await new Promise(r => c.toBlob(r, mime, .93)); const url = URL.createObjectURL(blob), i = exportBlobs.length; exportBlobs.push({ blob, url, name });
      grid.insertAdjacentHTML('beforeend', `<div class="exp-item${label === 'Panorama' ? ' wide' : ''}"><img src="${url}" alt="${label}"><div class="row"><span class="num">${label} · ${c.width}×${c.height}</span><button class="btn ghost small" data-save="${i}">Sichern</button></div></div>`);
    };
    for (let i = 0; i < state.slides; i++) {
      prog.textContent = `Slide ${i + 1} von ${state.slides} wird gerendert …`; setBar((imgs.length + i) / (imgs.length + state.slides)); await pause(20);
      const c = mk(W, H), x = c.getContext('2d'); x.translate(-i * W, 0); drawScene(x, { procs });
      await push(c, `streifzug-${String(i + 1).padStart(2, '0')}.${ext}`, `${i + 1} / ${state.slides}`);
    }
    if (expOpt.pano && state.slides > 1) {
      const T = W * state.slides, s = Math.min(1, Math.sqrt(16e6 / (T * H))), c = mk(T * s, H * s), x = c.getContext('2d'); x.scale(s, s); drawScene(x, { procs });
      await push(c, `streifzug-panorama.${ext}`, 'Panorama');
    }
  } catch (err) { console.error(err); prog.textContent = 'Der Export ist fehlgeschlagen. Vermutlich war ein Foto zu groß für den Speicher – versuche es mit weniger Fotos auf einmal.'; return; }
  setBar(1); prog.textContent = `${state.slides} ${state.slides === 1 ? 'Slide' : 'Slides'} fertig · ${expOpt.type.toUpperCase()}, ${W}×${H} px`;
  $('#saveAll').hidden = !exportBlobs.length; $('#saveAll').innerHTML = `${sv('<path d="M12 15V3M7.5 7.5 12 3l4.5 4.5"/><path d="M8 11H6a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-2"/>')}${coarse() ? (exportBlobs.length > 1 ? 'Alle teilen' : 'Teilen') : (exportBlobs.length > 1 ? 'Alle laden' : 'Laden')}`;
  note.innerHTML = coarse() ? '<b>So geht’s weiter:</b> „Alle teilen“ öffnet das Teilen-Menü – dort direkt Instagram wählen oder „Bilder sichern“. In Instagram die Slides in der Reihenfolge 1, 2, 3 … auswählen.'
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
  else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'd' && l) { e.preventDefault(); action('dup', l); }
  else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'c' && l) { copyLayer(l); }
  else if ((e.key === 'Delete' || e.key === 'Backspace') && l) { e.preventDefault(); action('del', l); }
  else if (l && !l.locked && e.key.startsWith('Arrow')) { e.preventDefault(); const s = e.shiftKey ? 50 : 5; if (e.key === 'ArrowLeft') l.x -= s; if (e.key === 'ArrowRight') l.x += s; if (e.key === 'ArrowUp') l.y -= s; if (e.key === 'ArrowDown') l.y += s; requestRender(); clearTimeout(keyT); keyT = setTimeout(pushHistory, 400); }
  else if (e.key === 'Escape' && !ctxEl.hidden) closeMenu();
  else if (e.key === 'Escape') { for (const s of ['#exportSheet', '#previewSheet', '#projSheet', '#helpSheet']) if (!$(s).hidden) { $(s).hidden = true; return; } if (ui.pick) { ui.pick = false; renderPanel(); } else selectLayer(null); }
});
let keyT;
/* ---------- Kopieren & Einfügen ---------- */
const VERSION = 32;
const CLIP_MARK = 'streifzug-ebene:';
function copyLayer(l) {
  ui.layerClip = clone(l); LS.set('layerClip', ui.layerClip); haptic();
  const txt = l.type === 'text' ? l.text : CLIP_MARK + l.id;
  try { navigator.clipboard && navigator.clipboard.writeText(txt).catch(() => {}); } catch {}
  toast(l.type === 'image' ? 'Foto kopiert' : l.type === 'text' ? 'Text kopiert' : 'Element kopiert', 'Einfügen', pasteLayer);
}
function pasteLayer() {
  if (!ui.layerClip) return; const { W } = dims(), c = unlinked(clone(ui.layerClip)); c.id = newId(); c.locked = false; c.hidden = false;
  const rel = ((ui.layerClip.x % W) + W) % W, slide = visibleSlide(); c.x = slide * W + rel;
  if (state.layers.some(x => Math.abs(x.x - c.x) < 4 && Math.abs(x.y - c.y) < 4)) { c.x += 40; c.y += 40; } // nicht genau übereinander
  state.layers.push(c); ui.sel = c.id; haptic(); commit(); toast('Eingefügt');
}
function pasteText(txt) {
  txt = String(txt || '').replace(/\r/g, '').trim(); if (!txt) return false;
  if (txt.startsWith(CLIP_MARK)) {
    if (!ui.layerClip) { const src = state.layers.find(x => String(x.id) === txt.slice(CLIP_MARK.length).trim()); if (src) ui.layerClip = clone(src); }
    if (ui.layerClip) { pasteLayer(); return true; } return false;
  }
  if (ui.layerClip && ui.layerClip.type === 'text' && ui.layerClip.text === txt) { pasteLayer(); return true; }
  const { W, H } = dims(), t = newTextLayer((visibleSlide() + .5) * W, H / 2, txt.slice(0, 600)); if (txt.length > 40) t.size = 60;
  state.layers.push(t); ui.tab.text = 'text'; ui.sel = t.id; haptic(); commit(); toast('Text eingefügt'); return true;
}
/* Einfügen-Knopf: System-Zwischenablage lesen (Bild vor Text), sonst die zuletzt kopierte Ebene */
async function pasteAny() {
  let denied = false, seen = false;
  try {
    if (navigator.clipboard && navigator.clipboard.read) {
      const items = await navigator.clipboard.read(), texts = [];
      for (const it of items) {
        seen = seen || it.types.length > 0;
        // Bilder zuerst – iOS liefert Fotos u. a. als image/png, image/jpeg oder image/heic
        const t = it.types.find(x => x.startsWith('image/'));
        if (t) { const blob = await it.getType(t); await addFiles([new File([blob], 'eingefuegt.' + (t.split('/')[1] || 'png'), { type: t })]); return; }
        for (const ty of ['text/plain', 'text/uri-list']) if (it.types.includes(ty)) texts.push(await (await it.getType(ty)).text());
        if (it.types.includes('text/html')) { const h = await (await it.getType('text/html')).text(), d = new DOMParser().parseFromString(h, 'text/html'); texts.push(d.body.textContent || ''); }
      }
      for (const txt of texts) if (pasteText(txt)) return;
    } else if (navigator.clipboard && navigator.clipboard.readText) { const txt = await navigator.clipboard.readText(); seen = !!txt; if (pasteText(txt)) return; }
  } catch (e) { denied = true; }
  if (ui.layerClip) { pasteLayer(); return; }
  toast(denied ? 'Einfügen wurde nicht erlaubt – nochmal tippen und „Einsetzen“ wählen'
    : seen ? 'Das in der Zwischenablage kann hier nicht eingefügt werden – kopiere ein Bild, einen Text oder ein Element'
    : 'Die Zwischenablage ist leer – kopiere ein Bild, einen Text oder ein Element');
}
document.addEventListener('paste', e => {
  if (e.target.matches && e.target.matches('input,textarea')) return; const dt = e.clipboardData; if (!dt) return;
  if (e.target.closest && e.target.closest('.paste-pad')) { e.preventDefault(); document.activeElement && document.activeElement.blur(); }
  const files = [...dt.files].filter(f => f.type.startsWith('image/') || /\.(heic|heif|jpe?g|png|webp|avif)$/i.test(f.name));
  if (files.length) { e.preventDefault(); addFiles(files); return; }
  const txt = dt.getData('text/plain'); if (txt) { e.preventDefault(); if (!pasteText(txt) && ui.layerClip) pasteLayer(); return; }
  if (ui.layerClip) { e.preventDefault(); pasteLayer(); return; }
  if (e.target.closest && e.target.closest('.paste-pad')) toast('Das in der Zwischenablage kann hier nicht eingefügt werden');
});
// Einfügefeld: nichts hineintippen lassen, nur „Einsetzen“
document.addEventListener('beforeinput', e => { if (e.target.closest && e.target.closest('.paste-pad') && e.inputType !== 'insertFromPaste') e.preventDefault(); });
stage.addEventListener('dragover', e => e.preventDefault());
stage.addEventListener('drop', e => { e.preventDefault(); if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files); });

/* ---------- Bildschirmhöhe (iOS meldet sie je nach Modus unterschiedlich) ---------- */
function setAppHeight() {
  let h = Math.max(window.innerHeight || 0, window.visualViewport ? visualViewport.height : 0, document.documentElement.clientHeight || 0);
  const standalone = navigator.standalone || matchMedia('(display-mode: standalone)').matches;
  if (standalone && screen.height) { const portrait = innerHeight >= innerWidth; h = Math.max(h, portrait ? Math.max(screen.height, screen.width) : Math.min(screen.height, screen.width)); }
  document.documentElement.style.setProperty('--app-h', Math.round(h) + 'px');
  // iOS-Homescreen-App-Fehler: das Fenster endet um die Statusleisten-Höhe zu früh, darunter zeichnet iOS nichts.
  // Strecken geht nicht (wird abgeschnitten) – stattdessen den Abstand für den Home-Balken weglassen, der liegt dann ohnehin im toten Streifen.
  const short = standalone && Math.max(screen.height, screen.width) - innerHeight > 30 && innerHeight >= innerWidth;
  document.documentElement.classList.toggle('pwa-short', !!short);
}
setAppHeight();
addEventListener('resize', setAppHeight); addEventListener('orientationchange', () => setTimeout(setAppHeight, 300));
window.visualViewport && visualViewport.addEventListener('resize', setAppHeight);

if (!ui.layerClip) ui.layerClip = LS.get('layerClip', null); // kopierte Ebene übersteht Neustart der App

/* ---------- Willkommen (einmalig, wie „Neu in …“ bei Apple) ---------- */
function showWelcome() {
  if (LS.get('welcomed', false)) return; const w = $('#welcome'); w.hidden = false;
  const done = () => { LS.set('welcomed', true); w.classList.add('out'); setTimeout(() => { w.hidden = true; w.classList.remove('out'); }, 260); };
  $('#welcomeGo').addEventListener('click', done); $('#welcomeLook').addEventListener('click', done);
}

/* ---------- Start ---------- */
new ResizeObserver(resize).observe(stage);
resize();
(async () => {
  const last = store.lastProject();
  let ok = false;
  if (last) { try { ok = await openProject(last, true); } catch (err) { console.warn(err); } }
  if (!ok) loadSample();
  showWelcome();
})();
if (document.fonts) {
  Promise.all(FONTS.map(f => document.fonts.load(`${f[2]} 40px "${f[0]}"`))).catch(() => {}).then(() => { flags.fontsTick++; requestRender(); });
}
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').then(reg => reg.addEventListener('updatefound', () => { const w = reg.installing; w && w.addEventListener('statechange', () => { if (w.state === 'activated' && navigator.serviceWorker.controller) toast('Neue Version von Streifzug ist da', 'Neu laden', () => { saveNow(); setTimeout(() => location.reload(), 300); }); }); })).catch(() => {});
window.__streifzug = { openTab: k => { ui.tab[mode() === 'image' ? 'image' : mode()] = k; renderUI(); }, state, ui, view, sources, cache, action, applyTemplate, layout, fit, selectLayer, commit, render, runSegment, addFiles, saveNow, openProject,
  snapshot: (h = 360) => { const { W, H } = dims(), T = W * state.slides, c = mk(T * h / H, h), x = c.getContext('2d'); x.scale(h / H, h / H); drawScene(x, { clean: true }); return c.toDataURL('image/jpeg', .85); } };
