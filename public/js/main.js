/* Streifzug – Oberfläche, Gesten, Werkzeuge, Export */
import { logErr, errLog, haptic, $, clamp, clone, esc, state, ui, sources, cache, ids, newId, dims, selLayer, toast, defParams, upgradeParams, FORMATS, LOOKS, FONTS, ID_CURVE } from './core.js';
import { mk, makeAux, processImage, prepare, curveFn, pickHealSource, wbFromPoint, shrink } from './process.js';
import { focusPoint, flags, getCut, loadScaled, orientCanvas, cropAspect, cropRect, boxOf, drawScene, ensureCache, releaseAux, cacheKey, drawSample, FRAMES } from './scene.js';
import { newImageLayer, newTextLayer, newShapeLayer, coverSlide, coverAll, computeBox } from './layers.js';
import { tapeType } from './props.js';
import { tplDef, applyTemplate, layout, relink, shufflePhotos, releaseTemplate } from './templates.js';
import * as store from './store.js';
import { poolOK, call } from './pool.js';
import { cutHooks, maskToPNG, cleanMask } from './process.js';
import { sw, LS, brand, renderPanel, syncPanelValues, layerName, BRUSH_MODES, setVal, FMT, paintFill, applyColor, saveLogo, pushRecentColor, refreshAfterCommit, pushList, textPreset, TPL_STYLE_KEYS, insertLogo, group, chip } from './panels.js';
import { sv, IC, IMG_GROUPS, SUB_LABEL, groupOf } from './ui.js';

/* Fehler mitschreiben – für „Problem melden“ in der Hilfe */
addEventListener('error', e => logErr('Fehler', `${e.message} @ ${(e.filename || '').split('/').pop()}:${e.lineno}`));
addEventListener('unhandledrejection', e => logErr('Fehler (asynchron)', e.reason && (e.reason.stack || e.reason.message) || e.reason));
for (const k of ['error', 'warn']) { const o = console[k].bind(console); console[k] = (...a) => { try { logErr(k === 'error' ? 'Fehler' : 'Warnung', a.map(x => x && x.stack ? x.stack.split('\n').slice(0, 3).join(' | ') : typeof x === 'object' ? (JSON.stringify(x) || '').slice(0, 200) : String(x)).join(' ')); } catch {} o(...a); }; }
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

/* ---------- Werkzeugsuche ---------- */
const TOOL_INDEX = [
  ['looks', 'Looks & Filter', 'filter preset fuji kodak film look analog'], ['anpassen', 'Schnell anpassen', 'helligkeit kontrast sättigung ambiance'],
  ['licht', 'Licht & Histogramm', 'belichtung lichter tiefen weiß schwarz histogramm'], ['kurve', 'Gradationskurve', 'kurve kontrast s-kurve matt'],
  ['farbe', 'Farbe & HSL', 'weißabgleich temperatur tönung dynamik hsl farbmischer pipette'], ['grading', 'Color Grading', 'kino farbe teal orange split'],
  ['effekte', 'Film & Licht', 'körnung grain vignette glow halation lichteinfall light leak staub low-res farbsäume'], ['kreativ', 'Kreativ-Filter', 'tonaler kontrast drama grunge glitch doppelbelichtung'],
  ['details', 'Details', 'struktur klarheit textur dunst schärfen rauschen'], ['stempel', 'Datumsstempel', 'datum stempel kamera'],
  ['entfernen', 'Objekt entfernen', 'entfernen löschen person wegmachen radiergummi magic eraser clean up'], ['freistellen', 'Freistellen', 'ausschneiden motiv sticker lasso'],
  ['hintergrund', 'Hintergrund ersetzen', 'hintergrund unscharf color pop farbe ersetzen transparent'], ['gesicht', 'Gesicht & Haut', 'haut glätten retusche beauty strahlen'],
  ['selektiv', 'Auswahl & Masken', 'himmel person motiv maske selektiv lasso lokal bereich'], ['pinsel', 'Pinsel', 'abwedeln nachbelichten dodge burn malen'],
  ['reparieren', 'Reparieren', 'fleck pickel fussel heilen'], ['klonen', 'Kopierstempel', 'stempel klonen kopieren'], ['fokus', 'Fokus & Tilt-Shift', 'unschärfe tiefenschärfe tilt shift bokeh'],
  ['zuschnitt', 'Zuschnitt & Drehen', 'zuschneiden drehen spiegeln perspektive begradigen zoom ausschnitt'], ['rahmen', 'Rahmen & Form', 'rahmen polaroid form rand schatten ecken'],
  ['ebene', 'Ebene', 'deckkraft mischmodus ebene'],
  ['@vorlagen', 'Vorlagen', 'vorlage layout collage raster panorama'], ['@canvas', 'Format & Größe', 'format story pinterest größe ändern a4 slides hintergrund'],
  ['@marke', 'Marken-Kit', 'marke logo farben schriften brand'], ['@element', 'Elemente', 'sticker form kritzel emoji qr diagramm chart klebeband'],
  ['@text', 'Text hinzufügen', 'text schrift überschrift'], ['@ebenen', 'Ebenen & Verlauf', 'ebenen verlauf rückgängig history'], ['@export', 'Teilen & Exportieren', 'export teilen speichern instagram']
];
const norm = t => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
function openToolSearch() {
  ctxItems = []; ctxMenu.innerHTML = `<div class="ts"><input type="search" class="name" id="toolQ" placeholder="Werkzeug suchen, z. B. Himmel, Haut, Körnung" autocomplete="off" enterkeyhint="go"></div><div id="toolRes"></div>`;
  ctxEl.hidden = false; const w = ctxMenu.offsetWidth; ctxMenu.style.left = Math.max(12, (innerWidth - w) / 2) + 'px'; ctxMenu.style.top = ($('.top').getBoundingClientRect().bottom + 6) + 'px';
  ctxMenu.style.transformOrigin = '50% 0'; ctxMenu.classList.remove('in'); void ctxMenu.offsetWidth; ctxMenu.classList.add('in');
  const q = $('#toolQ'), show = () => { const t = norm(q.value.trim()), words = t.split(/\s+/).filter(Boolean);
    const hits = TOOL_INDEX.filter(([k, lb, kw]) => !words.length || words.every(wd => norm(lb + ' ' + kw + ' ' + k).includes(wd))).slice(0, words.length ? 9 : 7);
    ctxItems = hits.map(([k, lb]) => [lb, k.startsWith('@') ? 'tpl' : 'crop', () => goTool(k)]);
    $('#toolRes').innerHTML = hits.length ? hits.map(([k, lb, kw], i) => `<button class="ctx-item" role="menuitem" data-ci="${i}"><span>${lb}<small class="ts-kw">${kw.split(' ').slice(0, 4).join(' · ')}</small></span></button>`).join('') : '<p class="note" style="padding:12px 16px">Nichts gefunden</p>'; };
  q.addEventListener('input', show); q.addEventListener('keydown', e => { if (e.key === 'Enter' && ctxItems[0]) { closeMenu(); ctxItems[0][2](); } }); show(); q.focus();
}
function goTool(k) {
  if (k.startsWith('@')) { const m = { '@vorlagen': 'vorlagen', '@canvas': 'canvas', '@marke': 'canvas', '@element': 'element', '@ebenen': 'ebenen' }[k];
    if (k === '@text') { selectLayer(null); addTextHere(); return; } if (k === '@export') { doExport(); return; }
    ui.tab.none = m; selectLayer(null); renderUI(); if (k === '@marke') setTimeout(() => panel.querySelector('#brandColor')?.closest('.group')?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 80); return; }
  let l = selLayer(); if (!l || l.type !== 'image' || !l.srcId) l = state.layers.find(x => x.type === 'image' && x.srcId);
  if (!l) { toast('Füge zuerst ein Foto hinzu'); return; }
  const g = groupOf(k); ui.sub = ui.sub || {}; ui.sub[g[0]] = k; ui.tab.image = k; ui.pick = false; if (ui.sel !== l.id) selectLayer(l.id); renderUI();
}
/* einmalige Tipps beim ersten Öffnen eines Werkzeugs */
const TIPS = {
  entfernen: 'Tippe auf ein störendes Objekt oder übermale es – fertig. Kleine und mittlere Objekte klappen am besten.',
  freistellen: 'Tippe aufs Motiv. Danach kannst du Text hinter das Motiv legen oder es als Sticker verwenden.',
  hintergrund: 'Erst das Motiv erkennen lassen, dann den Hintergrund wählen: unscharf, Color Pop, Farbe oder ein anderes Foto.',
  gesicht: 'Die Haut wird automatisch erkannt. „Glätten“ sparsam einsetzen – 30 bis 50 wirkt natürlich.',
  selektiv: 'Wähle Himmel, Person oder Motiv – oder tippe ins Foto. Dann passt du nur diesen Bereich an.',
  klonen: 'Erst die Quelle antippen, dann dort malen, wo die Kopie hin soll.',
  kurve: 'Leichte S-Form = mehr Kontrast. Linken Punkt anheben = matter Film-Look.',
  grading: 'Tiefen kühl, Lichter warm – der klassische Kino-Look.',
  kreativ: 'Für die Doppelbelichtung brauchst du ein zweites Foto im Projekt.',
  pinsel: 'Mehrmals über dieselbe Stelle malen verstärkt die Wirkung.',
  fokus: 'Ziehe den Punkt auf das, was scharf bleiben soll – der Rest wird weich.',
  looks: '„Vorher“ oben gedrückt halten vergleicht mit dem Original.'
};
const tipCard = k => TIPS[k] && !LS.get('tipsSeen', {})[k] ? `<div class="tip" role="note"><span class="tip-ico">${IC.spark}</span><span>${TIPS[k]}</span><button class="tip-ok" data-tipok="${k}">OK</button></div>` : '';

/* ---------- Kontextmenü wie in iOS (lange drücken oder „•••“) ---------- */
const ctxEl = $('#ctx'), ctxMenu = $('#ctxMenu');
const MI = {
  copy: sv('<rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>'), dup: sv('<rect x="3" y="3" width="13" height="13" rx="2.5"/><path d="M8 21h10a3 3 0 0 0 3-3V8M9.5 9.5h0"/>'),
  paste: sv('<rect x="5" y="4" width="14" height="17" rx="2.5"/><path d="M9 4.5V3.5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1z"/>'),
  front: sv('<rect x="8" y="8" width="12" height="12" rx="2" fill="currentColor" fill-opacity=".25"/><path d="M4 14V6a2 2 0 0 1 2-2h8"/>'), back: sv('<rect x="4" y="4" width="12" height="12" rx="2" fill="currentColor" fill-opacity=".25"/><path d="M20 10v8a2 2 0 0 1-2 2h-8"/>'),
  crop: sv('<path d="M6 2v16h16"/><path d="M2 6h16v16"/>'), replace: sv('<path d="M4 12a8 8 0 0 1 14-5.3L20 9M20 4v5h-5M20 12a8 8 0 0 1-14 5.3L4 15M4 20v-5h5"/>'),
  all: sv('<rect x="2" y="6" width="6" height="12" rx="1.5"/><rect x="9" y="6" width="6" height="12" rx="1.5"/><rect x="16" y="6" width="6" height="12" rx="1.5"/>'),
  lock: sv('<rect x="5" y="11" width="14" height="10" rx="2.5"/><path d="M8 11V7.5a4 4 0 0 1 8 0V11"/>'), unlock: sv('<rect x="5" y="11" width="14" height="10" rx="2.5"/><path d="M8 11V7.5a4 4 0 0 1 7.7-1.5"/>'),
  del: sv('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'), check: sv('<path d="m5 12 5 5 9-10"/>'), clock: sv('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'), text: sv('<path d="M5 6V4h14v2M12 4v16M9 20h6"/>'),
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
function addTextHere() { const { W, H } = dims(), l = newTextLayer((visibleSlide() + .5) * W, H * .5); if (brand().head) l.font = brand().head; state.layers.push(l); ui.tab.text = 'text'; selectLayer(l.id); pushHistory(); setTimeout(() => $('#txtIn')?.select(), 50); }
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
ctxEl.addEventListener('click', e => { const b = e.target.closest('[data-ci]'); if (!b && e.target.closest('#ctxMenu')) return; if (!b && lpMenu && (lpMenu.held || performance.now() < lpMenu.until)) return; lpMenu = null; closeMenu(); if (b) { const it = ctxItems[+b.dataset.ci]; it[2](); haptic(); } }); // sofort ausführen: Safari erlaubt die Zwischenablage nur direkt beim Tippen
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
const TOOL_OF_TAB = { entfernen: 'erase', klonen: 'clone', freistellen: 'cut', selektiv: 'mask', pinsel: 'brush', reparieren: 'heal', fokus: 'focus', zuschnitt: 'crop' };
function activeTool() { const l = selLayer(); if (!l || l.type !== 'image' || !l.srcId) return null; if (ui.pick) return 'wb'; return TOOL_OF_TAB[ui.tab.image] || null; }
/* KI-Maske rot eingefärbt (für die Anzeige), je Maske zwischengespeichert */
const tintCache = new Map();
function regionTint(m) {
  const key = m.d.length + m.d.slice(-40) + (m.inv ? 'i' : ''); let e = tintCache.get(key); if (e) return e.c;
  if (!tintCache.has('L' + key)) { tintCache.set('L' + key, 1); const im = new Image(); im.onload = () => {
    const c = mk(im.width, im.height), x = c.getContext('2d'); x.drawImage(im, 0, 0); const id = x.getImageData(0, 0, c.width, c.height), d = id.data;
    for (let i = 0; i < d.length; i += 4) { const v = m.inv ? 255 - d[i] : d[i]; d[i] = 255; d[i + 1] = 59; d[i + 2] = 80; d[i + 3] = v * .5; }
    x.putImageData(id, 0, 0); tintCache.set(key, { c }); if (tintCache.size > 24) tintCache.delete(tintCache.keys().next().value); requestRender(); }; im.src = m.d; }
  return null;
}
const maskName = (m, i) => m.kind === 'ai' ? ({ sky: 'Himmel', person: 'Person', subject: 'Motiv', bg: 'Hintergrund' }[m.sub] || 'Auswahl') : m.kind === 'lasso' ? 'Lasso' : `Punkt ${i + 1}`;
function otherPhotos(l) { const seen = new Set([l.srcId]), out = []; let n = 0;
  for (const o of state.layers) if (o.type === 'image' && o.srcId) { n++; if (!seen.has(o.srcId)) { seen.add(o.srcId); out.push({ srcId: o.srcId, name: 'Foto ' + n }); } }
  return out; }
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
  const full = () => [-G.sx * G.k - G.bx.w / 2, -G.sy * G.k - G.bx.h / 2 + G.bx.iy, G.iw * G.k, G.ih * G.k];
  if (tool === 'mask') p.masks.forEach((m, i) => { const P = localOf(G, m.x, m.y);
    if (i === ui.maskSel && m.kind === 'ai') { const t = regionTint(m); if (t) { const [x0, y0, fw, fh] = full(); ctx.drawImage(t, x0, y0, fw, fh); } }
    else if (i === ui.maskSel && m.kind === 'lasso' && m.pts.length > 2) { ctx.beginPath(); m.pts.forEach((v, j) => { if (j % 2) return; const Q = localOf(G, v, m.pts[j + 1]); j ? ctx.lineTo(Q.x, Q.y) : ctx.moveTo(Q.x, Q.y); }); ctx.closePath();
      ctx.fillStyle = 'rgba(255,59,80,.28)'; if (!m.inv) ctx.fill(); ctx.setLineDash([8 / s, 6 / s]); ctx.lineWidth = 2 / s; ctx.strokeStyle = '#fff'; ctx.stroke(); ctx.setLineDash([]); }
    else if (i === ui.maskSel) { if (m.kind === 'linear') { line(P, m.angle, 0, false); line(P, m.angle, -R(m.rx) * m.feather, true); line(P, m.angle, R(m.rx) * m.feather, true); } else { ring(P, R(m.rx), R(m.ry), m.angle, false); ring(P, R(m.rx) * (1 - m.feather), R(m.ry) * (1 - m.feather), m.angle, true); } }
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
  else if (tool === 'erase') {
    const st = ui.erStroke; if (st && st.p.length) { ctx.beginPath(); for (let i = 0; i < st.p.length; i += 2) { const Q = localOf(G, st.p[i], st.p[i + 1]); i ? ctx.lineTo(Q.x, Q.y) : ctx.moveTo(Q.x, Q.y); }
      if (st.p.length === 2) { const Q = localOf(G, st.p[0], st.p[1]); ctx.lineTo(Q.x + .01, Q.y); }
      ctx.lineCap = ctx.lineJoin = 'round'; ctx.lineWidth = 2 * R(st.s); ctx.strokeStyle = 'rgba(255,59,48,.5)'; ctx.stroke();
      if (ui.erBusy) { const t = performance.now() / 260; ctx.lineWidth = 2 * R(st.s) * (1 + .08 * Math.sin(t)); ctx.strokeStyle = `rgba(255,255,255,${.18 + .12 * Math.sin(t)})`; ctx.stroke(); requestAnimationFrame(requestRender); } }
    if (ui.cursor && !ui.erBusy) { const P = localOf(G, ui.cursor.u, ui.cursor.v); ring(P, R(ui.erSize / 100), R(ui.erSize / 100), 0, false); }
  }
  else if (tool === 'clone') {
    const cross = (P, col) => { const a = 14 / s; ctx.beginPath(); ctx.moveTo(P.x - a, P.y); ctx.lineTo(P.x + a, P.y); ctx.moveTo(P.x, P.y - a); ctx.lineTo(P.x, P.y + a); ctx.lineWidth = 4 / s; ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.stroke(); ctx.lineWidth = 2 / s; ctx.strokeStyle = col; ctx.stroke(); };
    if (ui.cursor) { const P = localOf(G, ui.cursor.u, ui.cursor.v); ring(P, R(ui.cloneSize / 100), R(ui.cloneSize / 100), 0, false);
      if (ui.cloneOff) cross(localOf(G, ui.cursor.u + ui.cloneOff.du, ui.cursor.v + ui.cloneOff.dv), COL.accent); }
    if (ui.cloneSrc && !(ui.cursor && ui.cloneOff)) cross(localOf(G, ui.cloneSrc.u, ui.cloneSrc.v), COL.accent);
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
  if (tool === 'erase') { if (!ip.inside || ui.erBusy) return null; ui.erStroke = { s: ui.erSize / 100, p: [+ip.u.toFixed(4), +ip.v.toFixed(4)] }; ui.cursor = { u: ip.u, v: ip.v };
    return { mode: 'erPaint', l, st: ui.erStroke, sx: p.sx, sy: p.sy, moved: false }; }
  if (tool === 'clone') {
    if (!ip.inside) return null;
    if (ui.cloneMode === 'src' || !ui.cloneSrc) { ui.cloneSrc = { u: ip.u, v: ip.v }; ui.cloneOff = null; ui.cloneMode = 'paint'; haptic(); renderPanel(); toast('Quelle gesetzt – jetzt dort malen, wo kopiert werden soll'); return { mode: 'tap' }; }
    if (!ui.cloneOff) ui.cloneOff = { du: ui.cloneSrc.u - ip.u, dv: ui.cloneSrc.v - ip.v };
    const st = { s: ui.cloneSize / 100, dx: +ui.cloneOff.du.toFixed(4), dy: +ui.cloneOff.dv.toFixed(4), hard: .45, p: [+ip.u.toFixed(4), +ip.v.toFixed(4)] };
    P.clone.push(st); ui.cursor = { u: ip.u, v: ip.v }; flags.throttle = 160; return { mode: 'brush', st, l, moved: true };
  }
  if (tool === 'mask' && ui.lasso) { if (!ip.inside) return null;
    const m = { kind: 'lasso', pts: [+ip.u.toFixed(4), +ip.v.toFixed(4)], x: ip.u, y: ip.v, rx: .16, ry: .16, angle: 0, feather: .15, inv: false, ex: 0, co: 0, sat: 0, temp: 0, st: 0 };
    P.masks.push(m); ui.maskSel = P.masks.length - 1; return { mode: 'lasso', m, l, moved: true }; }
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
    if (/^lasso/.test(ui.cutMode)) { if (!l.cut) l.cut = { on: true, strokes: [] }; l.cut.on = true; const st = { m: ui.cutMode, s: .004, p: [+ip.u.toFixed(4), +ip.v.toFixed(4)] }; l.cut.strokes.push(st); flags.throttle = 140; return { mode: 'brush', st, l, arr: l.cut.strokes, moved: true }; }
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
  if (tool === 'crop') { if (!ip.inside) return null; materializeCrop(l); return { mode: 'crop', l, q0: toLocal(l, p), px0: l.crop.px, py0: l.crop.py, G, moved: false }; }
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
  else if (m === 'erPaint') { const ip = imgPt(gest.l, p); if (ip) { const a = gest.st.p, lu = a[a.length - 2], lv = a[a.length - 1]; ui.cursor = { u: ip.u, v: ip.v };
      if (Math.hypot(ip.u - lu, ip.v - lv) > gest.st.s * .2) a.push(+ip.u.toFixed(4), +ip.v.toFixed(4)); } }
  else if (m === 'lasso') { const ip = imgPt(gest.l, p); if (ip) { const a = gest.m.pts, lu = a[a.length - 2], lv = a[a.length - 1]; if (Math.hypot(ip.u - lu, ip.v - lv) > .006) a.push(+clamp(ip.u).toFixed(4), +clamp(ip.v).toFixed(4)); } }
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
    else if (g.mode === 'erPaint') { const st = g.st; if (st.p.length <= 4) { const ip = { u: st.p[0], v: st.p[1] }; runErase(g.l, ip); } else runErase(g.l, { stroke: st }); }
    else if (g.mode === 'lasso') { const P = g.l.params, m = g.m; ui.lasso = false;
      if (m.pts.length < 12) { P.masks.splice(P.masks.indexOf(m), 1); ui.maskSel = Math.max(0, P.masks.length - 1); toast('Zu klein – umfahre den Bereich'); renderPanel(); }
      else { let sx = 0, sy = 0; for (let i = 0; i < m.pts.length; i += 2) { sx += m.pts[i]; sy += m.pts[i + 1]; } m.x = sx / (m.pts.length / 2); m.y = sy / (m.pts.length / 2); haptic(); commit(); toast('Bereich ausgewählt – jetzt die Regler anpassen'); } }
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
/* automatischen Ausschnitt (Motiv im Bild) in echte Werte übernehmen, bevor man selbst verschiebt */
function materializeCrop(l) {
  if (!l.crop || l.crop.box || l.crop.px !== .5 || l.crop.py !== .5) return; const c = ensureCache(l); if (!c || !c.prep) return;
  const iw = c.prep.width, ih = c.prep.height, [sx, sy, sw, sh] = cropRect(iw, ih, l);
  l.crop.px = iw > sw + 1 ? +(sx / (iw - sw)).toFixed(4) : .5; l.crop.py = ih > sh + 1 ? +(sy / (ih - sh)).toFixed(4) : .5; if (l.crop.px === .5 && l.crop.py === .5) l.crop.auto = false;
}
function enterCrop(on) {
  const l = selLayer(); if (!l || l.type !== 'image' || !l.srcId) return; if (on) materializeCrop(l);
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
/* ---------- KI-Werkzeuge ---------- */
const busyHud = t => { hud.textContent = t; hud.hidden = false; };
const workImg = (c, max = 1024) => { const p = c.prep, k = Math.min(1, max / Math.max(p.width, p.height)); return k < 1 ? shrink(p, Math.round(p.width * k), Math.round(p.height * k)) : p; };
const coverage = m => { let n = 0; for (let i = 0; i < m.data.length; i += 5) n += m.data[i] > .5; return n / (m.data.length / 5); };
const centroid = m => { let sx = 0, sy = 0, n = 0; for (let y = 0; y < m.h; y += 2) for (let x = 0; x < m.w; x += 2) { const v = m.data[y * m.w + x]; if (v > .5) { sx += x; sy += y; n++; } } return n ? [sx / n / m.w, sy / n / m.h] : [.5, .5]; };
/* Motiv: erst Personen suchen, sonst das Objekt in der Bildmitte */
async function findSubject(c) {
  const S = await import('./segment.js'), img = workImg(c);
  try { const r = await S.segmentPeople(img), m = { w: r.w, h: r.h, data: r.person }; if (coverage(m) > .03) return m; } catch (e) { console.warn(e); }
  const m = await S.segmentAt(img, .5, .5); return coverage(m) > .01 ? cleanMask(m, .5, .5) : null;
}
async function addAiMask(l, kind) {
  if (ui.aiBusy) return; const c = ensureCache(l); if (!c) return; ui.aiBusy = true;
  busyHud(kind === 'sky' ? 'Himmel wird gesucht …' : 'Wird erkannt …');
  try {
    let m = null;
    if (kind === 'sky') { const A = await import('./ai.js'); m = A.skyMask(workImg(c, 720)); }
    else if (kind === 'person') { const S = await import('./segment.js'), r = await S.segmentPeople(workImg(c)); m = { w: r.w, h: r.h, data: r.person }; if (coverage(m) < .01) m = null; }
    else m = await findSubject(c);
    if (!m) { toast(kind === 'sky' ? 'Kein Himmel gefunden' : kind === 'person' ? 'Keine Person gefunden' : 'Kein Motiv gefunden – nutze das Lasso'); return; }
    const [x, y] = centroid(m), P = l.params;
    P.masks.push({ kind: 'ai', sub: kind, d: maskToPNG(m, 1024), inv: kind === 'bg', x: kind === 'bg' ? clamp(1 - x, .1, .9) : x, y, rx: .16, ry: .16, angle: 0, feather: .1, ex: 0, co: 0, sat: 0, temp: 0, st: 0 });
    ui.maskSel = P.masks.length - 1; haptic(); commit(); toast(({ sky: 'Himmel', person: 'Person', subject: 'Motiv', bg: 'Hintergrund' })[kind] + ' ausgewählt – jetzt die Regler anpassen');
  } catch (e) { console.error(e); toast('Die Erkennung hat nicht geklappt – beim ersten Mal ist Internet nötig'); }
  finally { ui.aiBusy = false; hud.hidden = true; }
}
async function detectSkin(l, force) {
  if (ui.skinBusy) return; const c = ensureCache(l); if (!c || (!force && l.params.skin.d)) return; ui.skinBusy = true; busyHud('Haut wird erkannt …'); renderPanel();
  try { const S = await import('./segment.js'), r = await S.segmentPeople(workImg(c)), m = { w: r.w, h: r.h, data: r.skin };
    if (coverage(m) < .004) { toast('Keine Haut gefunden – funktioniert bei Fotos von Menschen'); return; }
    l.params.skin.d = maskToPNG(m, 1024); if (!l.params.skin.amt && !l.params.skin.glow) l.params.skin.amt = 45; haptic(); commit(); toast('Haut erkannt');
  } catch (e) { console.error(e); toast('Die Erkennung hat nicht geklappt – beim ersten Mal ist Internet nötig'); }
  finally { ui.skinBusy = false; hud.hidden = true; renderPanel(); }
}
async function autoCut(l) {
  if (ui.aiBusy) return; const c = ensureCache(l); if (!c) return; ui.aiBusy = true; busyHud('Motiv wird erkannt …');
  try { const m = await findSubject(c); if (!m) { toast('Kein Motiv gefunden – stelle es unter „Freistellen“ selbst frei'); return; }
    const [x, y] = centroid(m); if (!l.cut) l.cut = { on: true, strokes: [] }; if (l.cut.refine == null) l.cut.refine = true;
    l.cut.strokes.push({ m: 'ai', d: maskToPNG(m), p: [+x.toFixed(4), +y.toFixed(4)] }); haptic(); commit(); toast('Motiv erkannt');
  } catch (e) { console.error(e); toast('Die Erkennung hat nicht geklappt – beim ersten Mal ist Internet nötig'); }
  finally { ui.aiBusy = false; hud.hidden = true; }
}
/* Objekt entfernen: Antippen (Objekt erkennen) oder Übermalen, dann füllt MI-GAN die Stelle */
async function runErase(l, how) {
  if (ui.erBusy) return; const c = ensureCache(l); if (!c || !c.prep) return;
  ui.erBusy = true; requestRender();
  const prog = (f, ph) => busyHud(ph === 'run' ? 'Wird entfernt …' : f < 1 ? `KI-Modell wird geladen … ${Math.round(f * 100)} %` : 'Wird entfernt …');
  try {
    const src = c.prep, W = src.width, H = src.height, k = Math.min(1, 1024 / Math.max(W, H)), hole = mk(W * k, H * k), hx = hole.getContext('2d'), hw = hole.width, hh = hole.height;
    if (how.stroke) { const st = how.stroke, R = Math.max(2, st.s * Math.max(hw, hh)), pts = st.p;
      hx.strokeStyle = hx.fillStyle = '#fff'; hx.lineCap = hx.lineJoin = 'round'; hx.lineWidth = 2 * R;
      hx.beginPath(); hx.moveTo(pts[0] * hw, pts[1] * hh); for (let i = 2; i < pts.length; i += 2) hx.lineTo(pts[i] * hw, pts[i + 1] * hh); hx.stroke();
      hx.beginPath(); hx.arc(pts[0] * hw, pts[1] * hh, R, 0, Math.PI * 2); hx.fill();
      // geschlossene Umrandung: Inneres mitnehmen
      if (pts.length > 16 && Math.hypot((pts[0] - pts[pts.length - 2]) * hw, (pts[1] - pts[pts.length - 1]) * hh) < R * 3) { hx.beginPath(); hx.moveTo(pts[0] * hw, pts[1] * hh); for (let i = 2; i < pts.length; i += 2) hx.lineTo(pts[i] * hw, pts[i + 1] * hh); hx.closePath(); hx.fill(); } }
    else { busyHud('Objekt wird erkannt …'); const S = await import('./segment.js'), m = await S.segmentAt(workImg(c), how.u, how.v);
      if (coverage(m) < .0015) { toast('Hier wurde nichts erkannt – übermale das Objekt'); return; }
      if (coverage(m) > .45) { toast('Das ist zu groß zum Entfernen – übermale nur das störende Objekt'); return; }
      const cm = cleanMask(m, how.u, how.v), t = mk(cm.w, cm.h), tx = t.getContext('2d'), id = tx.createImageData(cm.w, cm.h);
      for (let i = 0; i < cm.data.length; i++) { id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = 255; id.data[i * 4 + 3] = cm.data[i] > .35 ? 255 : 0; }
      tx.putImageData(id, 0, 0); hx.drawImage(t, 0, 0, hw, hh); }
    prog(0); let r, d;
    if (poolOK()) { // im Hintergrund-Rechner, damit die Oberfläche nicht einfriert
      try { const sb = await createImageBitmap(src), hb = await createImageBitmap(hole), m = await call({ type: 'inpaint', src: sb, hole: hb }, [sb, hb], prog);
        r = m.r; if (r) d = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(r.blob); }); else r = null; }
      catch (err) { logErr('Entfernen (Hintergrund)', err && err.message); r = undefined; }
    }
    if (r === undefined) { const A = await import('./ai.js'); r = await A.inpaint(src, hole, prog); if (r) d = r.canvas.toDataURL('image/png'); }
    if (!r) { toast('Nichts zum Entfernen markiert'); return; }
    l.params.erase.push({ x: +r.x.toFixed(5), y: +r.y.toFixed(5), w: +r.w.toFixed(5), h: +r.h.toFixed(5), d });
    ui.nextLabel = layerName(l) + ' · Objekt entfernt'; haptic(); commit(); toast('Entfernt', 'Rückgängig', undo);
  } catch (e) { console.error(e); toast('Entfernen hat nicht geklappt – beim ersten Mal ist Internet nötig, sonst Speicher knapp'); }
  finally { ui.erBusy = false; ui.erStroke = null; hud.hidden = true; requestRender(); }
}
function selectLayer(id) {
  { const l = state.layers.find(x => x.id === id), sr = $('#srLive'); if (sr) sr.textContent = l ? layerName(l) + ' ausgewählt' : ''; }
  if (id != null && id !== ui.sel) haptic();
  if (ui.sel && ui.sel !== id) releaseAux(selLayer());
  ui.sel = id; ui.pick = false; ui.maskSel = 0; renderUI();
}

/* ---------- Verlauf & automatisches Speichern ---------- */
let hist = [], hIdx = -1, histLbl = [];
/* große Daten (Masken, Füll-Patches) nur einmal im Speicher halten – der Verlauf verweist darauf */
const BLOBS = new Map();
function blobKey(v) { let h = 0; for (let i = 0; i < v.length; i += 61) h = (h * 31 + v.charCodeAt(i)) | 0; return '@@b' + v.length + ':' + h + ':' + v.slice(-12); }
const snap = () => JSON.stringify({ format: state.format, slides: state.slides, bg: state.bg, tpl: state.tpl || null, layers: state.layers },
  (k, v) => { if (typeof v === 'string' && v.length > 4000) { const bk = blobKey(v); BLOBS.set(bk, v); return bk; } return v; });
function autoLabel() {
  const m = mode(), l = selLayer();
  if (m === 'image') return layerName(l) + ' · ' + (SUB_LABEL[ui.tab.image] || { looks: 'Looks', rahmen: 'Rahmen', zuschnitt: 'Zuschnitt', ebene: 'Ebene', licht: 'Licht' }[ui.tab.image] || 'Bearbeitung');
  if (m === 'text') return 'Text „' + esc((l.text || '').split('\n')[0].slice(0, 16)) + '“';
  if (m === 'shape') return layerName(l); if (m === 'slot') return 'Leeres Feld';
  return { canvas: 'Leinwand', vorlagen: 'Vorlage', ebenen: 'Ebenen', element: 'Element' }[ui.tab.none] || 'Änderung';
}
function pushHistory() { relink(ui.sel); const s = snap(); if (hist[hIdx] === s) return; hist = hist.slice(0, hIdx + 1); histLbl = histLbl.slice(0, hIdx + 1);
  hist.push(s); histLbl.push({ t: Date.now(), l: hist.length === 1 ? 'Geöffnet' : (ui.nextLabel || autoLabel()) }); ui.nextLabel = null;
  if (hist.length > 60) { hist.shift(); histLbl.shift(); } hIdx = hist.length - 1; updateTop(); scheduleSave(); }
function restore(s) {
  const o = JSON.parse(s, (k, v) => typeof v === 'string' && v.startsWith('@@b') && BLOBS.has(v) ? BLOBS.get(v) : v); state.format = o.format; state.slides = o.slides; state.bg = o.bg; state.tpl = o.tpl || null; state.layers = o.layers; relink();
  ids.n = Math.max(ids.n, ...state.layers.map(l => l.id + 1), 1);
  if (!selLayer()) ui.sel = null; fit(); renderUI(); requestRender(); scheduleSave();
}
function undo() { if (hIdx > 0) { hIdx--; restore(hist[hIdx]); } }
function goHistory(i) { if (i >= 0 && i < hist.length && i !== hIdx) { hIdx = i; restore(hist[hIdx]); haptic(); } }
/* Verlauf als Liste (Rückgängig-Knopf lange drücken oder in „Ebenen“) */
function historyItems(max = 14) {
  const out = []; for (let i = hist.length - 1; i >= Math.max(0, hist.length - max); i--) out.push([(i === hIdx ? '✓ ' : '') + histLbl[i]?.l + ' · ' + ago(histLbl[i]?.t), i === hIdx ? 'check' : 'clock', () => goHistory(i)]);
  return out;
}
const ago = t => { if (!t) return ''; const s = Math.round((Date.now() - t) / 1000); return s < 50 ? 'gerade' : s < 3600 ? Math.round(s / 60) + ' Min.' : new Date(t).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }); };
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
  hintEl.textContent = tool === 'mask' && ui.lasso ? 'Umfahre den Bereich mit dem Finger'
    : tool === 'erase' ? (ui.erBusy ? 'Wird entfernt …' : 'Objekt antippen oder übermalen')
    : tool === 'clone' ? (ui.cloneSrc && ui.cloneMode === 'paint' ? 'Malen – das Kreuz zeigt die Quelle' : 'Tippe auf die Stelle, von der kopiert wird')
    : tool === 'mask' ? 'Tippe ins Foto für einen neuen Punkt · Punkt ziehen verschiebt · zwei Finger: Größe & Drehung'
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
/* Foto-Werkzeuge in Gruppen: obere Reiter, darunter Unterreiter */
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
  if (k === 'addText') { const { W, H } = dims(); const l = newTextLayer((visibleSlide() + .5) * W, H * .5); if (brand().head) l.font = brand().head; state.layers.push(l); ui.tab.text = 'text'; selectLayer(l.id); pushHistory(); setTimeout(() => $('#txtIn')?.select(), 50); return; }
  if (mode() === 'image') { const g = IMG_GROUPS.find(x => x[0] === k); ui.sub = ui.sub || {}; k = ui.sub[k] || g[3][0]; }
  ui.tab[mode()] = k; ui.pick = false; renderTabs(); renderHead(); renderPanel(); updateTop(); requestRender();
});
tabs.addEventListener('keydown', e => { const lb = e.target.closest('label[for]'); if ((e.key === 'Enter' || e.key === ' ') && lb) { e.preventDefault(); $('#' + lb.htmlFor).click(); } });
$('#fileIn').addEventListener('change', e => { const f = [...e.target.files]; e.target.value = ''; if (ui.replaceId) { replacePhoto(f[0]); } else addFiles(f); });
$('#camIn').addEventListener('change', e => { const f = [...e.target.files]; e.target.value = ''; addFiles(f); });

function renderHead() {
  const m = mode(), l = selLayer();
  if (m === 'none') { const tb = TABSETS.none.find(x => x[0] === ui.tab.none) || TABSETS.none[0];
    head.innerHTML = `<span class="title">${tb[1]}</span><button class="icon-btn" data-act="search" aria-label="Werkzeug suchen" title="Werkzeug suchen">${IC.search}</button><button class="icon-btn" data-act="paste" aria-label="Einfügen" title="Bild, Text oder kopierte Ebene einfügen">${IC.paste}</button>`; return; }
  if (m === 'text' || m === 'shape' || m === 'slot') { head.innerHTML = `<span class="title">${m === 'text' ? 'Text' : m === 'slot' ? 'Leeres Feld' : 'Element'}</span><button class="btn primary small icon" data-act="done" aria-label="Fertig" title="Fertig"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5 9-10"/></svg></button>`; return; }
  const n = state.layers.filter(x => x.type === 'image').indexOf(l) + 1;
  head.innerHTML = `<span class="title">Foto ${n}</span>
    <button class="btn ghost small icon" data-act="search" aria-label="Werkzeug suchen" title="Werkzeug suchen">${IC.search}</button>
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
  else if (a === 'search') openToolSearch();
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

panel.addEventListener('input', e => {
  const t = e.target, l = selLayer();
  if (t.matches('input[type=range][data-k]')) {
    let v = +t.value; const def = +t.dataset.def, span = +t.max - +t.min;
    if (v !== def && Math.abs(v - def) < span * .012 && def >= +t.min && def <= +t.max) { v = def; t.value = def; if (!t._mag) haptic(); t._mag = true; } else if (Math.abs(v - def) > span * .03) t._mag = false;
    if (/^(p|h|g|gr|m|b|pv|sk)\./.test(t.dataset.k)) flags.draft = true; if (/^cut\./.test(t.dataset.k)) flags.throttle = 160; setVal(t.dataset.k, v / +t.dataset.scale); t.closest('.sl').querySelector('output').textContent = FMT[t.dataset.fmt](v);
    t.closest('.sl').classList.toggle('changed', v !== +t.dataset.def); paintFill(t);
    if (t.dataset.k.startsWith('h.')) markBands(); if (t.dataset.k.startsWith('g.')) markGrade();
    if (t.dataset.k.startsWith('tp.')) layout(false);
    if (t.dataset.k.startsWith('c.') && l && l.crop.box) delete l.crop.box;
    requestRender();
  } else if (t.id === 'txtIn') { l.text = t.value; requestRender(); }
  else if (t.id === 'qrIn') { l.qr.text = t.value.trim(); requestRender(); }
  else if (t.id === 'chartIn') { l.chart.data = t.value; requestRender(); }
  else if (t.id === 'chartUnit') { l.chart.unit = t.value; requestRender(); }
  else if (t.id === 'capIn') { l.caption = t.value; requestRender(); }
  else if (t.matches('input[type=color][data-col]')) { applyColor(t.dataset.col, t.value); requestRender(); }
});
panel.addEventListener('input', e => { if (e.target.id !== 'tplSearch') return; ui.tplQuery = e.target.value; const q = ui.tplQuery.trim().toLowerCase();
  panel.querySelectorAll('.tpl[data-q]').forEach(b => b.hidden = !!q && !b.dataset.q.includes(q)); });
panel.addEventListener('toggle', e => { if (e.target.id === 'tplStyle') ui.tplStyleOpen = e.target.open; }, true);
panel.addEventListener('change', e => {
  const t = e.target, l = selLayer();
  if (t.id === 'brandColor') { const b = brand(); if (!b.colors.includes(t.value)) b.colors = [...b.colors, t.value].slice(-10); LS.set('brand', b); renderPanel(); toast('Markenfarbe gespeichert'); return; }
  if (t.id === 'brandHead' || t.id === 'brandBody') { const b = brand(); b[t.id === 'brandHead' ? 'head' : 'body'] = t.value; LS.set('brand', b); toast('Markenschrift gespeichert'); return; }
  if (t.id === 'logoIn') { const f = t.files[0]; t.value = ''; if (f) saveLogo(f); return; }
  if (t.id === 'chartUnit') { pushHistory(); return; }
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

panel.addEventListener('click', async e => {
  if (e.target.closest('.paste-pad')) { pasteAny(); return; }
  const tok = e.target.closest('[data-tipok]'); if (tok) { const seen = LS.get('tipsSeen', {}); seen[tok.dataset.tipok] = 1; LS.set('tipsSeen', seen); const card = tok.closest('.tip'); card.classList.add('out'); setTimeout(() => card.remove(), 220); return; }
  const sub = e.target.closest('[data-sub]'); if (sub) { const k = sub.dataset.sub; ui.sub = ui.sub || {}; ui.sub[groupOf(k)[0]] = k; ui.tab.image = k; ui.pick = false; renderPanel(); updateTop(); requestRender(); return; }
  const rs = e.target.closest('[data-reset]'); if (rs) { const inp = rs.closest('.sl').querySelector('input'); inp.value = inp.dataset.def; inp.dispatchEvent(new Event('input', { bubbles: true })); flags.draft = false; pushHistory(); refreshAfterCommit(); requestRender(); return; }
  const fs = e.target.closest('[data-fillslot]'); if (fs) { ui.fillSlot = +fs.dataset.fillslot; return; }
  const t = e.target.closest('button'); if (!t || t.disabled) return; const l = selLayer(); const d = t.dataset;
  if (d.format) { magicResize(d.format); }
  else if (d.slides) { state.slides = clamp(state.slides + +d.slides, 1, 20); fit(); commit(); }
  else if (d.colSet) { applyColor(d.colSet, d.v); commit(); }
  else if (d.tog) {
    const on = t.getAttribute('aria-checked') !== 'true', k = d.tog; haptic();
    if (k === 'grad') { state.bg.grad = on; if (state.tpl) state.tpl.bgLock = true; } else if (k === 'grid') { ui.grid = on; renderPanel(); requestRender(); return; }
    else if (k === 'stamp') l.params.stamp = on; else if (k === 'shadow' || k === 'tshadow') l.shadow = on; else if (k === 'upper') l.upper = on; else if (k === 'glow') l.glow = on;
    else if (k === 'outline') l.outline = on; else if (k === 'cutsmart') { ui.cutSmart = on; renderPanel(); return; } else if (k === 'cutrefine') l.cut.refine = on; else if (k === 'stickershadow') l.stickerShadow = on; else if (k === 'cutshow') { ui.cutShow = on; renderPanel(); requestRender(); return; }
    else if (k === 'dblin') l.dbl.inside = on;
    else if (k === 'cvalues') l.chart.values = on; else if (k === 'ccard') l.chart.card = on;
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
  else if (d.preset) { const pr = loadPresets()[+d.preset]; if (pr) { const o = l.params; l.params = upgradeParams(clone(pr.params)); Object.assign(l.params, { heal: o.heal, brush: o.brush, masks: o.masks, clone: o.clone || [], erase: o.erase || [] }); l.params.skin.d = o.skin && o.skin.d; toast(`Preset „${pr.name}“ angewendet`); commit(); } }
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
  else if (d.tfx) { l.fx = d.tfx; if (d.tfx === 'neon' && !l.fxColor) l.fxColor = '#3fe0c5'; commit(); }
  else if (d.qrstyle) { l.qr.style = d.qrstyle; commit(); }
  else if (d.qrbg) { l.qr.bg = d.qrbg; commit(); }
  else if (d.ctype) { l.chart.type = d.ctype; commit(); }
  else if (d.cpal) { l.chart.pal = d.cpal; if (d.cpal === 'marke') { const bc = brand().colors; l.chart.colors = bc.length ? bc.slice() : null; if (!bc.length) toast('Lege zuerst Markenfarben an (Leinwand → Marken-Kit)'); } else l.chart.colors = null; commit(); }
  else if (d.brandrm) { const b = brand(); b.colors = b.colors.filter(c => c !== d.brandrm); LS.set('brand', b); renderPanel(); }
  else if (d.aimask) { addAiMask(l, d.aimask); }
  else if (d.clonemode) { ui.cloneMode = d.clonemode; if (d.clonemode === 'src') { ui.cloneSrc = null; ui.cloneOff = null; } renderPanel(); updateTop(); }
  else if (d.bgx) { if (d.bgx === 'clear') { l.sticker = true; l.bgx = { ...(l.bgx || {}), mode: 'none' }; } else { l.sticker = false; l.bgx = { ...(l.bgx || {}), mode: d.bgx }; if (d.bgx === 'photo' && !l.bgx.src) l.bgx.src = otherPhotos(l)[0]?.srcId; if (d.bgx === 'color' && !l.bgx.color) l.bgx.color = '#ffffff'; } commit(); }
  else if (d.bgsrc) { l.bgx.src = d.bgsrc; commit(); }
  else if (d.dbl != null) { l.dbl = d.dbl ? { mode: 'screen', amt: 70, zoom: 1, px: .5, py: .5, ...(l.dbl || {}), src: d.dbl } : null; commit(); }
  else if (d.dblmode) { l.dbl.mode = d.dblmode; commit(); }
  else if (d.hist) { goHistory(+d.hist); }
  else if (d.goslide) { goSlide(+d.goslide); setTimeout(renderPanel, 300); }
  else if (d.lvis) { const x = state.layers.find(y => y.id === +d.lvis); x.hidden = !x.hidden; commit(); }
  else if (d.llock) { const x = state.layers.find(y => y.id === +d.llock); x.locked = !x.locked; commit(); }
  else if (d.lup || d.ldown) { const id = +(d.lup || d.ldown), i = state.layers.findIndex(y => y.id === id), j = i + (d.lup ? 1 : -1); if (j >= 0 && j < state.layers.length) { const [x] = state.layers.splice(i, 1); state.layers.splice(j, 0, x); } commit(); }
  else if (d.act2) action(d.act2, l);
});
/* Magic Resize: alles proportional ins neue Format übertragen; Fotos, die eine Slide füllten, füllen sie wieder */
function magicResize(fmt) {
  if (fmt === state.format) return; const o = dims(), filled = new Map();
  for (const l of state.layers) if (l.type === 'image' && !l.slot && !l.pane) { const b = boxOf(l), i = Math.floor(l.x / o.W);
    if (b.ow >= o.W * .97 && b.oh >= o.H * .97 && Math.abs(l.x - (i + .5) * o.W) < o.W * .05) filled.set(l, i); else if (b.ow >= o.W * state.slides * .97 && b.oh >= o.H * .97) filled.set(l, 'all'); }
  state.format = fmt; const n = dims(), sx = n.W / o.W, sy = n.H / o.H, f = Math.min(sx, sy);
  for (const l of state.layers) {
    if (state.tpl && (l.tplKey || l.slot != null || l.dupOf)) continue;
    l.x *= sx; l.y *= sy;
    if (filled.has(l)) { const i = filled.get(l); i === 'all' ? coverAll(l) : coverSlide(l, i); continue; }
    if (l.type === 'text') l.size *= f; else if (l.type === 'shape') { l.w *= f; l.h *= f; } else l.w *= f;
  }
  if (state.tpl) layout(false);
  fit(); commit(); toast(`Größe geändert: ${n.label} · ${n.px}`, 'Rückgängig', undo);
}
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
    case 'tplBrand': { const b = brand(), cs = b.colors, lum = h => { const v = parseInt(h.slice(1), 16); return ((v >> 16 & 255) * .3 + (v >> 8 & 255) * .59 + (v & 255) * .11) / 255; };
      const t = state.tpl; if (b.head || b.body) t.font = b.head || b.body; if (cs.length) { const dark = cs.filter(c => lum(c) < .55), light = cs.filter(c => lum(c) >= .75);
        t.textColor = dark[0] || cs[0]; t.ink = cs[1] || cs[0]; t.frameColor = light[0] || '#ffffff'; if (light[0]) { state.bg.c1 = light[0]; t.bgLock = true; } }
      layout(false); commit(); toast('Marken-Look angewendet', 'Rückgängig', undo); return; }
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
    case 'paste': if (ui.clip) { const keep = { heal: P.heal, brush: P.brush, masks: P.masks, clone: P.clone, erase: P.erase, skin: { ...(ui.clip.skin || {}), d: P.skin && P.skin.d } }; l.params = upgradeParams(clone(ui.clip)); Object.assign(l.params, keep); commit(); toast('Bearbeitung eingefügt'); } return;
    case 'applyAll': state.layers.filter(x => x.type === 'image' && x !== l).forEach(x => { const keep = { heal: x.params.heal, brush: x.params.brush, masks: x.params.masks, clone: x.params.clone || [], erase: x.params.erase || [], skin: { ...l.params.skin, d: x.params.skin && x.params.skin.d } }; x.params = clone(l.params); Object.assign(x.params, keep); }); commit(); toast('Auf alle Fotos übertragen'); return;
    case 'savePreset': { const name = ($('#presetName').value || '').trim() || `Preset ${loadPresets().length + 1}`; const ps = loadPresets(), pp = clone(P); pp.heal = []; pp.brush = []; pp.masks = []; pp.clone = []; pp.erase = []; if (pp.skin) pp.skin.d = null; pp.persp = { v: 0, h: 0 }; ps.push({ name, params: pp }); savePresets(ps); renderPanel(); toast(`„${name}“ gesichert`); return; }
    case 'clearPresets': if (!ui.confirmPresets) { ui.confirmPresets = true; renderPanel(); return; } ui.confirmPresets = false; savePresets([]); renderPanel(); toast('Presets gelöscht'); return;
    case 'exportPresets': { const blob = new Blob([JSON.stringify({ streifzug: 1, presets: loadPresets() }, null, 1)], { type: 'application/json' }); webSave([{ blob, name: 'streifzug-presets.json' }]); return; }
    case 'maskDel': P.masks.splice(ui.maskSel, 1); ui.maskSel = Math.max(0, ui.maskSel - 1); commit(); return;
    case 'maskDup': { const m = clone(P.masks[ui.maskSel]); m.x = clamp(m.x + .05); m.y = clamp(m.y + .05); P.masks.push(m); ui.maskSel = P.masks.length - 1; commit(); return; }
    case 'cutUndo': l.cut.strokes.pop(); commit(); return;
    case 'brandLogoDel': { const b = brand(); b.logo = null; LS.set('brand', b); renderPanel(); return; }
    case 'brandLogoUse': insertLogo(); return;
    case 'brandApply': { const b = brand(); if (!b.head && !b.body) { toast('Wähle zuerst Markenschriften'); return; } let n = 0;
      for (const x of state.layers) if (x.type === 'text') { const f = x.size >= 90 ? (b.head || b.body) : (b.body || b.head); if (f) { x.font = f; x.userEdited = true; n++; } }
      commit(); toast(`Marke auf ${n} Text${n === 1 ? '' : 'e'} angewendet`, 'Rückgängig', undo); return; }
    case 'lassoMask': ui.lasso = !ui.lasso; renderPanel(); updateTop(); if (ui.lasso) toast('Umfahre den Bereich mit dem Finger'); return;
    case 'eraseUndo': P.erase.pop(); commit(); return;
    case 'eraseClear': P.erase = []; commit(); toast('Alle Entfernungen zurückgenommen', 'Rückgängig', undo); return;
    case 'cloneUndo': P.clone.pop(); commit(); return;
    case 'cloneClear': P.clone = []; commit(); return;
    case 'skinDetect': detectSkin(l, true); return;
    case 'autoCut': autoCut(l); return;
    case 'goCut': ui.sub = ui.sub || {}; ui.sub.ki = 'freistellen'; ui.tab.image = 'freistellen'; renderUI(); return;
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
    try { src.base = await loadScaled(src, PREVIEW_PX); try { src.focus = focusPoint(src.base); } catch {} }
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
  if (added.length && fresh) { ui.tab.none = 'vorlagen'; ui.tplCat = 'all'; selectLayer(null); pushHistory(); goSlide(0); toast(`${added.length} Fotos · je eine Slide – oben Vorschläge für passende Vorlagen`); }
  else if (added.length) { ui.tab.image = 'rahmen'; selectLayer(added[added.length - 1].id); pushHistory(); if (!free || !state.tpl) toast(added.length === 1 ? 'Foto eingesetzt' : `${added.length} Fotos eingesetzt`); }
}
async function replacePhoto(f) {
  const l = state.layers.find(x => x.id === ui.replaceId); ui.replaceId = null; if (!l || !f) return;
  const id = 's' + newId(), src = { kind: 'file', file: f, nw: 0, nh: 0, date: f.lastModified || Date.now(), base: null };
  try { src.base = await loadScaled(src, PREVIEW_PX); try { src.focus = focusPoint(src.base); } catch {} } catch { toast('Foto konnte nicht gelesen werden.'); return; }
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
    try { src.base = await loadScaled(src, PREVIEW_PX); try { src.focus = focusPoint(src.base); } catch {} sources.set(f.srcId, src); savedSrc.add(f.srcId); } catch { console.warn('Quelle fehlt', f.srcId); } }
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
async function buildReport() {
  let est = ''; try { const q = await navigator.storage.estimate(); est = `${Math.round(q.usage / 1e6)} MB von ${Math.round(q.quota / 1e6)} MB`; } catch {}
  let persisted = '?'; try { persisted = await navigator.storage.persisted(); } catch {}
  const ph = state.layers.filter(l => l.type === 'image' && l.srcId).length;
  return [`Streifzug Version ${VERSION} · ${new Date().toLocaleString('de-DE')}`, navigator.userAgent, `Fenster ${innerWidth}×${innerHeight}, Bildschirm ${screen.width}×${screen.height}, DPR ${devicePixelRatio}, ${navigator.standalone ? 'Home-Bildschirm' : 'Browser'}`,
    `Projekt: ${state.slides} Slides, ${state.layers.length} Ebenen, ${ph} Fotos, Format ${state.format}, Vorlage ${state.tpl ? state.tpl.kind : '–'}`, `Speicher: ${est || '?'} · dauerhaft: ${persisted} · Hintergrund-Rechner: ${poolOK() ? 'an' : 'aus'}`, '',
    'Letzte Meldungen:', ...(errLog.length ? errLog.slice(-25).map(e => `${new Date(e.t).toLocaleTimeString('de-DE')}${e.old ? ' (vorher)' : ''} ${e.kind}: ${e.msg}`) : ['keine'])].join('\n');
}
async function reportProblem(how) {
  const txt = await buildReport();
  if (how === 'share' && navigator.share) { try { await navigator.share({ title: 'Streifzug Fehlerbericht', text: txt }); return; } catch (e) { if (e.name === 'AbortError') return; } }
  try { await navigator.clipboard.writeText(txt); toast('Fehlerbericht kopiert – einfach in den Chat einfügen'); } catch { toast('Kopieren ging nicht – nutze „Teilen“'); }
}
function openHelp() {
  $('#helpSheet').hidden = false;
  // kleine Technik-Zeile, hilft bei Darstellungsproblemen auf dem iPhone
  const pr = document.createElement('div'); pr.style.cssText = 'position:fixed;bottom:0;height:env(safe-area-inset-bottom,0px)'; document.body.append(pr);
  const a = $('#app').getBoundingClientRect(); $('#diag').textContent = `Version ${VERSION} · Fenster ${innerWidth}×${innerHeight} · Bildschirm ${screen.width}×${screen.height} · App bis ${Math.round(a.bottom)} · unten frei ${pr.offsetHeight} · ${navigator.standalone ? 'Home-Bildschirm' : 'Browser'}${document.documentElement.classList.contains('pwa-short') ? ' · kurz' : ''}`; pr.remove();
}
$('#reportCopy').addEventListener('click', () => reportProblem('copy'));
$('#reportShare').addEventListener('click', () => reportProblem('share'));
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
$('#undoBtn').addEventListener('click', () => { if (performance.now() - (undoLP.t || 0) < 600) return; undo(); });
const undoLP = { timer: 0, t: 0 };
$('#undoBtn').addEventListener('pointerdown', e => { clearTimeout(undoLP.timer); undoLP.timer = setTimeout(() => { if (hist.length < 2) return; undoLP.t = performance.now(); haptic(); const r = $('#undoBtn').getBoundingClientRect(); openMenu(historyItems(), r.left + r.width / 2 + 125, r.bottom + 6, 'tr'); }, 450); });
['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => $('#undoBtn').addEventListener(ev, () => clearTimeout(undoLP.timer)));
$('#undoBtn').addEventListener('contextmenu', e => { e.preventDefault(); if (hist.length < 2) return; undoLP.t = performance.now(); const r = $('#undoBtn').getBoundingClientRect(); openMenu(historyItems(), r.left + r.width / 2 + 125, r.bottom + 6, 'tr'); });
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
const VERSION = 40;
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
  let denied = false, seen = false, found = [];
  try {
    if (navigator.clipboard && navigator.clipboard.read) {
      const items = await navigator.clipboard.read(), texts = [];
      for (const it of items) {
        seen = seen || it.types.length > 0; found.push(...it.types);
        // Bilder zuerst – iOS liefert Fotos als image/png (teils auch jpeg/heic); jeden Bildtyp einzeln versuchen
        const imgTypes = it.types.filter(x => x.startsWith('image/')).sort((a, b) => (b === 'image/png') - (a === 'image/png'));
        for (const t of imgTypes) { try { const blob = await it.getType(t); if (blob && blob.size) { await addFiles([new File([blob], 'eingefuegt.' + (t.split('/')[1] || 'png').replace('jpeg', 'jpg'), { type: blob.type || t })]); return; } } catch (err) { console.warn(err); } }
        // manche Quellen geben das Bild unter einem anderen Typ heraus
        for (const t of it.types) if (!t.startsWith('text/') && !t.startsWith('image/')) { try { const blob = await it.getType(t); if (blob && blob.type.startsWith('image/')) { await addFiles([new File([blob], 'eingefuegt.png', { type: blob.type })]); return; } } catch {} }
        for (const ty of ['text/plain', 'text/uri-list']) if (it.types.includes(ty)) { try { texts.push(await (await it.getType(ty)).text()); } catch {} }
        if (it.types.includes('text/html')) { try { const h = await (await it.getType('text/html')).text(), d = new DOMParser().parseFromString(h, 'text/html'), im = d.querySelector('img[src^="data:image"]');
          if (im) { const blob = await (await fetch(im.src)).blob(); await addFiles([new File([blob], 'eingefuegt.png', { type: blob.type })]); return; } texts.push(d.body.textContent || ''); } catch {} }
      }
      for (const txt of texts) if (pasteText(txt)) return;
    } else if (navigator.clipboard && navigator.clipboard.readText) { const txt = await navigator.clipboard.readText(); seen = !!txt; if (pasteText(txt)) return; }
  } catch (e) { console.warn(e); denied = true; }
  // die zuletzt in Streifzug kopierte Ebene nur nehmen, wenn die Zwischenablage nichts anderes enthält
  if (ui.layerClip && !seen) { pasteLayer(); return; }
  toast(denied ? 'Einfügen wurde nicht erlaubt – nochmal tippen und „Einsetzen“ wählen, oder unter „Element“ ins Feld lange drücken'
    : seen ? `Das lässt sich hier nicht einfügen (${[...new Set(found)].join(', ').slice(0, 60)}) – versuch es unter „Element“: ins Feld lange drücken → „Einsetzen“`
    : 'Die Zwischenablage ist leer – kopiere ein Bild, einen Text oder ein Element');
}
const isImgFile = f => f && (f.type.startsWith('image/') || /\.(heic|heif|jpe?g|png|webp|avif|gif)$/i.test(f.name || ''));
document.addEventListener('paste', e => {
  if (e.target.matches && e.target.matches('input,textarea')) return; const dt = e.clipboardData; if (!dt) return;
  const pad = e.target.closest && e.target.closest('.paste-pad');
  let files = [...(dt.files || [])].filter(isImgFile);
  if (!files.length && dt.items) files = [...dt.items].filter(it => it.kind === 'file').map(it => it.getAsFile()).filter(isImgFile);
  if (files.length) { e.preventDefault(); pad && pad.blur(); addFiles(files); return; }
  const html = dt.getData('text/html'); if (html && /<img/i.test(html)) { const im = new DOMParser().parseFromString(html, 'text/html').querySelector('img');
    if (im && /^(data:image|blob:|https?:)/.test(im.src)) { e.preventDefault(); pad && pad.blur(); fetch(im.src).then(r => r.blob()).then(b => b.type.startsWith('image/') ? addFiles([new File([b], 'eingefuegt.png', { type: b.type })]) : toast('Das Bild konnte nicht gelesen werden')).catch(() => toast('Das Bild konnte nicht gelesen werden')); return; } }
  const txt = dt.getData('text/plain'); if (txt) { e.preventDefault(); pad && pad.blur(); if (!pasteText(txt) && ui.layerClip) pasteLayer(); return; }
  if (pad) { // iOS fügt Bilder teils direkt als <img> ins Feld ein – dann von dort übernehmen
    setTimeout(async () => { const im = pad.querySelector('img'); if (im && im.src) { try { const b = await (await fetch(im.src)).blob(); if (b.type.startsWith('image/')) { await addFiles([new File([b], 'eingefuegt.png', { type: b.type })]); renderPanel(); return; } } catch (err) { console.warn(err); } }
      renderPanel(); if (ui.layerClip && !dt.types.length) pasteLayer(); else toast('Das lässt sich hier nicht einfügen'); }, 60);
    return;
  }
  if (ui.layerClip && !dt.types.length) { e.preventDefault(); pasteLayer(); }
});
// Einfügefeld: nichts hineintippen lassen, nur „Einsetzen“
document.addEventListener('beforeinput', e => { if (e.target.closest && e.target.closest('.paste-pad') && !/^insertFromPaste|^insertFromDrop/.test(e.inputType)) e.preventDefault(); });
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
  runErase, addAiMask, detectSkin, autoCut, goHistory, hist: () => [hist.length, hIdx, histLbl.map(x => x.l)],
  snapshot: (h = 360) => { const { W, H } = dims(), T = W * state.slides, c = mk(T * h / H, h), x = c.getContext('2d'); x.scale(h / H, h / H); drawScene(x, { clean: true }); return c.toDataURL('image/jpeg', .85); } };

/* für die Bedienfelder (panels.js) */
export { mode, fillThumbs, panel, tipCard, detectSkin, requestRender, setupCurve, visibleSlide, addFiles, commit, ptrs, hist, historyItems, loadPresets, maskName, otherPhotos };
