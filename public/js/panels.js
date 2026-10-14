/* Seamly – Werkzeugfeld: Regler-Helfer und alle Bedienfelder (Leinwand, Vorlagen, Ebenen, Elemente, Foto, Text, Formen) */
import { clamp, clone, de, esc, state, ui, sources, cache, ids, dims, selLayer, toast, FORMATS, HSL_BANDS, LOOKS, LOOK_CATS, FONTS, TEXT_COLORS, BG_COLORS, FRAME_COLORS, RATIOS, BLENDS, STAMP_COLORS } from './core.js';
import { mk, LEAKS, shrink } from './process.js';
import { flags, drawScene, cacheKey, SHAPES, BG_PATTERNS, FRAMES, CHART_PALETTES } from './scene.js';
import { newShapeLayer } from './layers.js';
import { isDoodle, doodleSVG, tapeType, TAPE_KINDS, TAPE_PATTERNS, TAPE_COLORS, CLIP_COLORS, BINDER_COLORS } from './props.js';
import { TEMPLATES, TPL_CATS, tplSVG, tplDef, applyTemplate, layout } from './templates.js';
import { sv, groupOf, SUB_LABEL, IC } from './ui.js';
import { mode, fillThumbs, panel, tipCard, detectSkin, requestRender, setupCurve, visibleSlide, addFiles, commit, ptrs, hist, historyItems, loadPresets, maskName, otherPhotos } from './main.js'; // zyklisch: nur innerhalb von Funktionen benutzt

/* ---------- Regler ---------- */
export const fmtSigned = v => (v > 0 ? '+' : v < 0 ? '−' : '') + de(Math.abs(Math.round(v)));
export const FMT = { d1: v => de(v, 1), signed: fmtSigned, ev: v => (v > 0 ? '+' : v < 0 ? '−' : '') + de(Math.abs(v), 2) + ' EV', pct: v => de(Math.round(v)) + ' %', deg: v => fmtSigned(v) + '°', hue: v => de(Math.round(v)) + '°', px: v => de(Math.round(v)) + ' px', x: v => de(v, 2) + '×', n: v => de(Math.round(v)), lh: v => de(v, 2) };
/* Ziel-Objekte für Regler-Schlüssel "ns.feld" */
export function target(ns) {
  const l = selLayer(), P = l && l.params;
  switch (ns) {
    case 'p': return P; case 'l': return l; case 'c': return l.crop; case 'h': return P.hsl[ui.hslBand]; case 'g': return P.grade[ui.gradeRange]; case 'gr': return P.grade;
    case 'm': return P.masks[ui.maskSel]; case 'b': return P.blur; case 'pv': return P.persp; case 'ui': return ui; case 'bg': return state.bg; case 'tp': return state.tpl; case 'cut': return l && l.cut; case 'sk': return P && P.skin; case 'bgx': return l && (l.bgx = l.bgx || { mode: 'none' }); case 'dbl': return l && l.dbl;
  }
}
export function getVal(k) { const [ns, f] = k.split('.'); if (k === 'l.wpct') return Math.round(selLayer().w / dims().W * 100); if (k === 'l.wprop') return Math.round(selLayer().w); const t = target(ns); return t ? t[f] : 0; }
export function setVal(k, v) { const [ns, f] = k.split('.'); if (k === 'l.wpct') { selLayer().w = v / 100 * dims().W; return; } if (k === 'l.wprop') { const l = selLayer(), f2 = v / l.w; l.w = v; l.h *= f2; return; } const t = target(ns); if (t) t[f] = v; }
export function slider(key, label, min, max, step, fmt = 'signed', def = 0, scale = 1, cls = '') {
  const raw = getVal(key) ?? def, val = +(raw * scale).toFixed(4), id = 's_' + key.replace(/\W/g, '_');
  return `<div class="sl${val !== def ? ' changed' : ''}${cls ? ' ' + cls : ''}"><div class="sl-top"><label for="${id}">${label}</label><button class="sl-reset" data-reset aria-label="${label} zurücksetzen" title="Zurücksetzen">↺</button><output>${FMT[fmt](val)}</output></div>
    <input type="range" id="${id}" data-k="${key}" data-fmt="${fmt}" data-def="${def}" data-scale="${scale}" min="${min}" max="${max}" step="${step}" value="${val}"></div>`;
}
export function paintFill(inp) {
  const min = +inp.min, max = +inp.max, v = +inp.value, z = clamp(+inp.dataset.def, min, max);
  const pv = (v - min) / (max - min) * 100, pz = (z - min) / (max - min) * 100;
  inp.style.setProperty('--a', Math.min(pv, pz) + '%'); inp.style.setProperty('--b', Math.max(pv, pz) + '%');
}
export function refreshAfterCommit() { if (mode() === 'image' && ui.tab.image === 'looks') fillThumbs(); }
export function syncPanelValues() {
  panel.querySelectorAll('input[type=range][data-k]').forEach(inp => { const v = getVal(inp.dataset.k); if (v === undefined) return; inp.value = v * +inp.dataset.scale; paintFill(inp);
    const sl = inp.closest('.sl'); sl.querySelector('output').textContent = FMT[inp.dataset.fmt](+inp.value); sl.classList.toggle('changed', +inp.value !== +inp.dataset.def); });
}
export function applyColor(target, v) {
  const l = selLayer();
  if (/^bg/.test(target) && state.tpl) state.tpl.bgLock = true;
  if (target.startsWith('tpl')) { state.tpl[{ tplFrame: 'frameColor', tplText: 'textColor', tplInk: 'ink' }[target]] = v; layout(false); return; }
  if (target === 'bg1') state.bg.c1 = v; else if (target === 'bg2') state.bg.c2 = v;
  else if (target === 'frame') l.borderColor = v; else if (target === 'text') l.color = v; else if (target === 'textbg') { l.bgColor = v; l.bgSet = true; } else if (target === 'stroke') l.strokeColor = v; else if (target === 'fill') l.fill = v; else if (target === 'pin') l.pinColor = v; else if (target === 'fx') l.fxColor = v; else if (target === 'qrfg') l.qr.fg = v; else if (target === 'chartink') l.chart.ink = v; else if (target === 'chartcard') l.chart.cardColor = v;
  else if (target === 'bgx') { l.bgx = l.bgx || { mode: 'color' }; l.bgx.color = v; }
}
export const chip = (attrs, label, on) => `<button class="chip" ${attrs} aria-pressed="${!!on}">${label}</button>`;
export const sw = (target, c, on) => `<button class="sw" style="--c:${c}" data-col-set="${target}" data-v="${c}" aria-pressed="${!!on}" aria-label="Farbe ${c}"></button>`;
export const swatches = (target, list, cur) => `<div class="swatches">${brand().colors.map(c => sw(target, c, cur === c).replace('class="sw"', 'class="sw brand"')).join('')}${(() => { const pal = photoPalette().filter(c => !list.includes(c)); return pal.length ? pal.map(c => sw(target, c, cur === c)).join('') + '<span class="sw-label">↑ aus deinen Fotos</span>' : ''; })()}${LS.get('recentColors', []).filter(c => !list.includes(c)).slice(0, 4).map(c => sw(target, c, cur === c).replace('class="sw"', 'class="sw recent"')).join('')}${list.map(c => sw(target, c, cur === c)).join('')}<input type="color" class="color-in" data-col="${target}" value="${/^#[0-9a-f]{6}$/i.test(cur) ? cur : '#ffffff'}" aria-label="Eigene Farbe"></div>`;
export const toggle = (key, label, on) => `<div class="toggle"><span>${label}</span><button class="switch" role="switch" data-tog="${key}" aria-checked="${!!on}" aria-label="${label.replace(/<[^>]+>/g, '')}"></button></div>`;
export const group = (title, inner) => `<div class="group">${title ? `<span class="sec-label">${title}</span>` : ''}${inner}</div>`;
export const btn = (act, label, cls = 'ghost', extra = '') => `<button class="btn ${cls} small" data-act2="${act}" ${extra}>${label}</button>`;

/* Farbpalette aus den Fotos des Projekts (gecacht) */
export let palKey = '', palVal = [];
export function photoPalette() {
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
export const LS = { get(k, d) { try { return JSON.parse(localStorage.getItem('streifzug.' + k)) ?? d; } catch { return d; } }, set(k, v) { try { localStorage.setItem('streifzug.' + k, JSON.stringify(v)); } catch {} } };
export const pushList = (k, v, max = 10) => LS.set(k, [v, ...LS.get(k, []).filter(x => x !== v)].slice(0, max));
export const pushRecentColor = c => { if (/^#[0-9a-f]{6}$/i.test(c)) pushList('recentColors', c.toLowerCase(), 8); };
export const ALIGN_IC = { l: '<path d="M4 3v18M8 7h10v4H8zM8 14h6v4H8z"/>', c: '<path d="M12 3v18M6 7h12v4H6zM8 14h8v4H8z"/>', r: '<path d="M20 3v18M6 7h10v4H6zM10 14h6v4h-6z"/>', t: '<path d="M3 4h18M7 8h4v10H7zM14 8h4v6h-4z"/>', m: '<path d="M3 12h18M7 6h4v12H7zM14 8h4v8h-4z"/>', b: '<path d="M3 20h18M7 6h4v10H7zM14 10h4v6h-4z"/>' };
export const alignRow = () => group('Auf der Slide ausrichten', `<div class="align-row">${[['l', 'Links'], ['c', 'Waagerecht mittig'], ['r', 'Rechts'], ['t', 'Oben'], ['m', 'Senkrecht mittig'], ['b', 'Unten']].map(([k, lb]) => `<button class="icon-btn" data-al="${k}" aria-label="${lb}" title="${lb}">${sv(ALIGN_IC[k])}</button>`).join('')}</div>`);

/* ---------- Panels ---------- */
export function renderPanel() {
  const m = mode(), t = ui.tab[m], l = selLayer(); let h = '';
  if (m === 'none') h = t === 'vorlagen' ? panelTemplates() : t === 'ebenen' ? panelLayers() : t === 'element' ? panelElements() : panelCanvas();
  else if (m === 'text') h = t === 'stil' ? panelTextStyle(l) : t === 'ebene' ? panelLayerCommon(l) : panelText(l);
  else if (m === 'shape') h = t === 'ebene' ? panelLayerCommon(l) : panelShape(l);
  else if (m === 'slot') h = panelSlot(l);
  else { const g = groupOf(t); h = tipCard(t) + (g[3].length > 1 ? `<div class="seg" role="tablist">${g[3].map(k => `<button data-sub="${k}" aria-selected="${k === t}">${SUB_LABEL[k]}</button>`).join('')}</div>` : '') + (IMAGE_PANELS[t] || IMAGE_PANELS.looks)(l, l.params); }
  const same = panel.dataset.key === m + t, keep = same ? panel.scrollTop : 0;
  panel.innerHTML = h; panel.dataset.key = m + t; panel.scrollTop = keep;
  if (!same) { panel.classList.remove('enter'); void panel.offsetWidth; panel.classList.add('enter'); }
  panel.querySelectorAll('input[type=range]').forEach(paintFill);
  if (m === 'none' && t === 'canvas') drawSlideThumbs();
  if (m === 'none' && t === 'vorlagen') realTplPreviews();
  if (m === 'image' && t === 'gesicht' && !l.params.skin.d && !ui.skinBusy) { ui.skinTried = ui.skinTried || new Set(); if (!ui.skinTried.has(l.id)) { ui.skinTried.add(l.id); setTimeout(() => detectSkin(l), 50); } }
  if (m === 'image') { if (t === 'looks') fillThumbs(); if (t === 'licht') { flags.histDirty = true; requestRender(); } if (t === 'kurve') setupCurve(); }
}
export function panelCanvas() {
  const f = state.format, i = visibleSlide() + 1;
  return `${ui.sample ? `<div class="callout"><span class="note"><b>Beispielprojekt</b> mit generiertem Motiv. Beim ersten eigenen Foto wird es ersetzt.</span></div>` : ''}
  <div class="row"><input class="name" id="projName" value="${esc(ui.projectName)}" maxlength="40" aria-label="Projektname"><button class="btn ghost small" data-act2="projects">Projekte</button><button class="btn ghost small" data-act2="help">? Hilfe</button></div>
  ${group('Format · Größe ändern', `<div class="chips">${Object.entries(FORMATS).map(([k, v]) => chip(`data-format="${k}"`, `${v.label}<small>${v.px}</small>`, f === k)).join('')}</div>`)}
  ${group('Slides', `<div class="row"><div class="stepper"><button data-slides="-1" aria-label="Eine Slide weniger">−</button><span>${state.slides}</span><button data-slides="1" aria-label="Eine Slide mehr">+</button></div><span class="note">Instagram erlaubt bis zu 20 Bilder pro Post.</span></div>
    <div class="slide-strip" id="slideStrip">${Array.from({ length: state.slides }, (_, k) => `<button class="sthumb" data-goslide="${k}" aria-current="${k + 1 === i}" aria-label="Slide ${k + 1}"><canvas width="72" height="${Math.round(72 * dims().H / dims().W)}"></canvas><span>${k + 1}</span></button>`).join('')}</div>
    <div class="row"><span class="note">Slide ${i}:</span>${btn('slideLeft', '←')}${btn('slideRight', '→')}${btn('slideDup', 'Duplizieren')}${btn('slideInsert', '+ Leere danach')}${btn('slideDelete', 'Löschen', 'danger')}</div>`)}
  ${group('Hintergrund', `${swatches('bg1', BG_COLORS, state.bg.c1)}
  ${toggle('grad', 'Verlauf', state.bg.grad)}
  ${state.bg.grad ? `${swatches('bg2', BG_COLORS, state.bg.c2)}<div class="chips">${[['h', 'Waagerecht'], ['v', 'Senkrecht'], ['d', 'Diagonal']].map(([k, lb]) => chip(`data-bgdir="${k}"`, lb, (state.bg.dir || 'h') === k)).join('')}</div>` : ''}
  <span class="sec-label">Muster</span><div class="chips">${BG_PATTERNS.map(([k, lb]) => chip(`data-pattern="${k}"`, lb, (state.bg.pattern || 'none') === k)).join('')}</div>`)}
  ${panelBrand()}
  ${toggle('grid', 'Drittel-Raster einblenden', ui.grid)}
  <div class="row">${btn('clear', ui.confirmClear ? 'Wirklich alles leeren?' : 'Neues leeres Projekt', 'danger')}${btn('sample', 'Beispiel laden')}</div>`;
}
/* ---------- Marken-Kit: eigene Farben, Schriften, Logo – überall griffbereit ---------- */
export const brand = () => LS.get('brand', { colors: [], head: '', body: '', logo: null });
export function panelBrand() {
  const b = brand(), fopt = cur => `<option value="">– Vorgabe –</option>` + FONTS.map(([f, lb]) => `<option value="${f}"${cur === f ? ' selected' : ''}>${lb}</option>`).join('');
  return group('Marken-Kit', `<span class="sec-label">Farben</span>
    <div class="swatches">${b.colors.map(c => `<button class="sw" style="--c:${c}" data-brandrm="${c}" aria-label="Markenfarbe ${c} entfernen" title="Antippen zum Entfernen"></button>`).join('')}<input type="color" class="color-in" id="brandColor" value="#3f7fe0" aria-label="Markenfarbe hinzufügen"><span class="note">${b.colors.length ? 'Antippen entfernt eine Farbe' : '＋ Farbe hinzufügen'}</span></div>
    <div class="row"><label class="note" for="brandHead">Überschrift</label><select class="name" id="brandHead">${fopt(b.head)}</select></div>
    <div class="row"><label class="note" for="brandBody">Text</label><select class="name" id="brandBody">${fopt(b.body)}</select></div>
    <span class="sec-label">Logo</span>
    <div class="row">${b.logo ? `<img class="brand-logo" src="${b.logo}" alt="Logo">${btn('brandLogoUse', 'Einfügen', 'primary')}${btn('brandLogoDel', 'Entfernen', 'danger')}` : ''}<label class="btn ghost small" for="logoIn">${b.logo ? 'Ändern' : 'Logo wählen'}</label><input type="file" id="logoIn" accept="image/*" hidden></div>
    <div class="row">${btn('brandApply', 'Marke auf alle Texte anwenden')}</div>
    <p class="note">Markenfarben stehen in jeder Farbauswahl ganz vorn, Markenschriften in jeder Schriftliste. Bleibt für alle Projekte gespeichert.</p>`);
}
export async function saveLogo(f) {
  try { const bmp = await createImageBitmap(f), k = Math.min(1, 640 / Math.max(bmp.width, bmp.height)), c = mk(bmp.width * k, bmp.height * k); c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const b = brand(); b.logo = c.toDataURL('image/png'); LS.set('brand', b); renderPanel(); toast('Logo gespeichert'); }
  catch (e) { console.warn(e); toast('Das Logo konnte nicht gelesen werden'); }
}
export async function insertLogo() {
  const b = brand(); if (!b.logo) return; const blob = await (await fetch(b.logo)).blob(), before = new Set(state.layers.map(x => x.id));
  await addFiles([new File([blob], 'logo.png', { type: 'image/png' })]);
  const l = state.layers.find(x => !before.has(x.id) && x.type === 'image'); if (!l) return;
  const { W, H } = dims(), i = visibleSlide(); l.w = W * .22; l.x = (i + 1) * W - W * .16; l.y = H - W * .12; l.shadow = false; l.border = 0; l.shape = 'rect';
  ui.nextLabel = 'Logo eingefügt'; commit();
}
export function drawSlideThumbs() {
  const { W, H } = dims();
  panel.querySelectorAll('#slideStrip canvas').forEach((cnv, k) => { const x = cnv.getContext('2d'), s = cnv.width / W; x.setTransform(s, 0, 0, s, -k * W * s, 0); drawScene(x, { clean: true }); });
}
export const TPL_TAGS = { polaroid: 'polaroid sofortbild', instax: 'polaroid sofortbild', scrapbook: 'polaroid tape klebeband', pinned: 'büroklammer klammer tape klebeband', doodleDiary: 'washi tape klebeband herz doodle', doodleOverlay: 'doodle marker herz', scribble: 'doodle', moodboard: 'doodle', hearts: 'liebe valentinstag', booth: 'photobooth fotobox', film: 'analog negativ', filmV: 'analog negativ', contact: 'analog negativ', poster: 'kino film movie', ovalNoir: 'kino film', pano: 'panorama landschaft', spread: 'panorama' };
export const TPL_STYLE_KEYS = ['tilt', 'frame', 'frameColor', 'font', 'textColor', 'doodles', 'ink'];
export function panelTemplates() {
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
      <div class="row">${brand().colors.length || brand().head ? btn('tplBrand', '★ Marken-Look') : ''}${btn('tplStyleReset', 'Stil zurücksetzen')}${t.bgLock ? btn('tplBgReset', 'Vorlagen-Hintergrund') : ''}</div>
      <p class="note">Der Stil bleibt erhalten, wenn du eine andere Vorlage wählst.</p>
    </details>
    ${nPh ? `<p class="note"><b>${nPh} leere${nPh === 1 ? 's Feld' : ' Felder'}</b> – tippe auf ein „+“ oder <label class="linkish" for="fileIn">wähle Fotos</label>, sie werden der Reihe nach eingesetzt.</p>` : ''}
  </div>` : `<p class="note">Wähle eine Vorlage – leere Felder füllst du danach per Antippen. Nochmal tippen wechselt die Variante.</p>`;
  const sug = !t && !q && cat === 'all' ? suggestTemplates() : [];
  const tile = (T, on) => `<button class="tpl${on ? ' on' : ''}" data-tpl="${T.id}">${tplSVG(T.id, on ? t.v : 0)}<b>${favs.includes(T.id) ? '★ ' : ''}${T.name}</b><span>${T.vars.length} Variante${T.vars.length === 1 ? '' : 'n'} · ${T.desc}</span></button>`;
  const sugHtml = sug.length ? group('Passt zu deinen Fotos', `<div class="tpl-grid">${sug.map(T => tile(T, false)).join('')}</div>`) : '';
  const cats = [['all', 'Alle'], ['fav', 'Favoriten'], ['recent', 'Zuletzt'], ...TPL_CATS.slice(1)];
  return `${cur}${sugHtml}<input type="search" class="name tpl-search" id="tplSearch" placeholder="Vorlage suchen, z. B. Polaroid, Herz, Magazin …" value="${esc(ui.tplQuery || '')}" aria-label="Vorlage suchen">
  <div class="chips scroll">${cats.map(([k, lb]) => chip(`data-tplcat="${k}"`, lb, cat === k)).join('')}</div>
  ${!list.length ? `<p class="note">${cat === 'fav' ? 'Noch keine Favoriten – wähle eine Vorlage und tippe auf den Stern.' : 'Noch keine zuletzt benutzten Vorlagen.'}</p>` : ''}
  <div class="tpl-grid">${list.map(T => { const on = t && t.kind === T.id, hay = (T.name + ' ' + T.desc + ' ' + T.vars.join(' ') + ' ' + T.id + ' ' + (TPL_CATS.find(c => c[0] === T.cat) || ['', ''])[1] + ' ' + (TPL_TAGS[T.id] || '')).toLowerCase();
    return `<button class="tpl${on ? ' on' : ''}" data-tpl="${T.id}" data-q="${esc(hay)}"${q && !hay.includes(q) ? ' hidden' : ''}>${tplSVG(T.id, on ? t.v : 0)}<b>${favs.includes(T.id) ? '★ ' : ''}${T.name}</b><span>${T.vars.length} Variante${T.vars.length === 1 ? '' : 'n'} · ${T.desc}</span></button>`; }).join('')}</div>`;
}
/* ---------- Echte Vorschauen der Vorlagen – mit den eigenen Fotos, im Hintergrund nacheinander gerechnet ---------- */
export const tplThumbs = new Map(); let tplQueue = [], tplTimer = 0, tplIO = null;

export const procOf = l => { const c = cache.get(cacheKey(l)); return c && c.proc; };
export function tplSig() { return state.format + '|' + state.layers.filter(l => l.type === 'image' && l.srcId && !l.dupOf).map(l => l.srcId + ':' + (l.rot90 || 0) + (l.flip ? 'f' : '') + ':' + (l.params.look || '')).join(',') + '|' + JSON.stringify(state.tpl ? TPL_STYLE_KEYS.map(k => state.tpl[k]) : []); }
export function renderTplThumb(id, v) {
  const saved = { tpl: state.tpl, layers: state.layers, slides: state.slides, bg: state.bg, n: ids.n }, bySrc = new Map();
  for (const l of saved.layers) if (l.type === 'image' && l.srcId) { const p = procOf(l); if (p) bySrc.set(l.srcId + '|' + (l.rot90 || 0) + (l.flip ? 'f' : ''), p); }
  try {
    state.layers = clone(saved.layers); state.bg = clone(saved.bg); state.tpl = saved.tpl ? clone(saved.tpl) : null;
    applyTemplate(id, v);
    const { W, H } = dims(), n = Math.min(state.slides, 3), th = 168, s = th / H, c = document.createElement('canvas');
    c.width = Math.round(W * n * s); c.height = th; const x = c.getContext('2d'); x.scale(s, s);
    const procs = new Map(); for (const l of state.layers) if (l.type === 'image' && l.srcId) { const p = bySrc.get(l.srcId + '|' + (l.rot90 || 0) + (l.flip ? 'f' : '')); if (p) procs.set(cacheKey(l), p); }
    drawScene(x, { procs, ph: true }); return c;
  } finally { state.tpl = saved.tpl; state.layers = saved.layers; state.slides = saved.slides; state.bg = saved.bg; ids.n = saved.n; }
}
export function pumpTplThumbs() {
  clearTimeout(tplTimer); if (!tplQueue.length) return;
  tplTimer = setTimeout(() => {
    if (ptrs.size) { pumpTplThumbs(); return; } // nicht während einer Geste rechnen
    const el = tplQueue.shift(); if (el && el.isConnected && !el.querySelector('canvas.real')) {
      const key = el.dataset.tk; let c = tplThumbs.get(key);
      if (!c) { try { c = renderTplThumb(el.dataset.tid, +el.dataset.tv); } catch (err) { console.warn(err); c = null; } if (c) { tplThumbs.set(key, c); if (tplThumbs.size > 160) tplThumbs.delete(tplThumbs.keys().next().value); } }
      if (c) { const cp = document.createElement('canvas'); cp.width = c.width; cp.height = c.height; cp.className = 'real'; cp.getContext('2d').drawImage(c, 0, 0); const svg = el.querySelector('svg'); if (svg) svg.replaceWith(cp); }
    }
    pumpTplThumbs();
  }, 24);
}
export function realTplPreviews() {
  if (!state.layers.some(l => l.type === 'image' && l.srcId && procOf(l))) return;
  const sig = tplSig(); tplQueue = []; if (tplIO) tplIO.disconnect();
  tplIO = new IntersectionObserver(es => { for (const e of es) if (e.isIntersecting) { tplIO.unobserve(e.target); tplQueue.push(e.target); } pumpTplThumbs(); }, { root: panel, rootMargin: '200px' });
  panel.querySelectorAll('[data-tpl],[data-tplvar]').forEach(b => {
    const id = b.dataset.tpl || state.tpl?.kind, v = b.dataset.tpl ? (state.tpl && state.tpl.kind === id ? state.tpl.v : 0) : +b.dataset.tplvar; if (!id) return;
    b.dataset.tid = id; b.dataset.tv = v; b.dataset.tk = id + '|' + v + '|' + sig;
    const c = tplThumbs.get(b.dataset.tk); if (c) { const cp = document.createElement('canvas'); cp.width = c.width; cp.height = c.height; cp.className = 'real'; cp.getContext('2d').drawImage(c, 0, 0); b.querySelector('svg')?.replaceWith(cp); }
    else tplIO.observe(b);
  });
}
/* Vorlagen-Vorschläge nach Anzahl und Form der Fotos */
export function suggestTemplates() {
  const ph = state.layers.filter(l => l.type === 'image' && l.srcId && !l.dupOf), n = ph.length; if (!n) return [];
  const land = ph.filter(l => { const s = sources.get(l.srcId); if (!s || !s.nw) return false; const a = (l.rot90 % 2 ? s.nh / s.nw : s.nw / s.nh); return a > 1.15; }).length / n;
  const ids = n === 1 ? ['pano', 'cover', 'polaroid', 'minimal', 'framePeek'] : n >= 6 ? ['grid', 'mosaic', 'bento', 'contact', 'scrapbook', 'moodboard']
    : land >= .6 ? ['panoWin', 'pano', 'seam', 'film', 'spread', 'stairs'] : land <= .3 ? ['polaroid', 'offset', 'magazine', 'tornCollage', 'instax', 'booth'] : ['seam', 'offset', 'polaroid', 'feature', 'torn', 'stack'];
  return ids.map(id => tplDef(id)).filter(Boolean).slice(0, 4);
}
export function panelSlot(l) {
  return `<p class="note">Ein leeres Feld der Vorlage. Setze ein Foto ein – mehrere ausgewählte Fotos füllen die nächsten leeren Felder.</p>
  <div class="row"><label class="btn primary" for="fileIn" data-fillslot="${l.id}">Foto einsetzen</label><label class="btn ghost" for="camIn" data-fillslot="${l.id}">Kamera</label>${btn('del', 'Feld entfernen', 'danger')}</div>`;
}
export const layerName = l => l.type === 'image' ? `Foto ${state.layers.filter(x => x.type === 'image').indexOf(l) + 1}` : l.type === 'text' ? `„${esc((l.text || '').split('\n')[0].slice(0, 18))}“` : (SHAPES.find(s => s[0] === l.kind) || ['', 'Form'])[1];
export const ICON = { image: IC.photo, text: IC.text, shape: IC.shape };
export function panelLayers() {
  if (!state.layers.length) return '<p class="note">Noch keine Ebenen.</p>';
  return `<div class="layer-list">${state.layers.map((l, i) => ({ l, i })).reverse().map(({ l, i }) => `<div class="layer-row${l.hidden ? ' off' : ''}">
    <button class="layer-pick" data-pick="${l.id}"><span class="layer-ico">${ICON[l.type]}</span><span>${layerName(l)}</span></button>
    <button class="icon-btn sm" data-lvis="${l.id}" aria-label="${l.hidden ? 'Einblenden' : 'Ausblenden'}" title="${l.hidden ? 'Einblenden' : 'Ausblenden'}">${l.hidden ? IC.eyeOff : IC.eye}</button>
    <button class="icon-btn sm${l.locked ? ' on' : ''}" data-llock="${l.id}" aria-label="${l.locked ? 'Entsperren' : 'Sperren'}" title="${l.locked ? 'Entsperren' : 'Sperren'}">${l.locked ? IC.lock : IC.unlock}</button>
    <button class="icon-btn sm" data-lup="${l.id}" aria-label="Nach vorn" ${i === state.layers.length - 1 ? 'disabled' : ''}>${IC.up}</button>
    <button class="icon-btn sm" data-ldown="${l.id}" aria-label="Nach hinten" ${i === 0 ? 'disabled' : ''}>${IC.down}</button></div>`).join('')}</div>
    <p class="note">Oben in der Liste liegt vorne. Gesperrte Ebenen lassen sich nicht versehentlich verschieben.</p>
    ${hist.length > 1 ? group('Verlauf', `<div class="hist-list">${historyItems(12).map(([lb, ic], k) => `<button class="hist-row${lb.startsWith('✓') ? ' on' : ''}" data-hist="${hist.length - 1 - k}">${lb.replace('✓ ', '')}</button>`).join('')}</div><p class="note">Tippe einen Schritt an, um dorthin zurückzuspringen. Tipp: Rückgängig-Knopf lange drücken.</p>`) : ''}`;
}
export const EMOJI = ['☀️', '🌊', '❤️', '✨', '📍', '🌸', '🍂', '⭐', '🌙', '📷', '🎞️', '🍦', '🐚', '⛵', '🌿', '🔥', '🦋', '🌈', '💌', '🎉'];
export function panelElements() {
  const b0 = brand();
  const el = ([k, lb]) => `<button class="el" data-addshape="${k}"><svg viewBox="0 0 40 40" aria-hidden="true">${shapeIcon(k)}</svg><span>${lb}</span></button>`;
  const rec = LS.get('recentEl', []).map(k => k.startsWith('e:') ? `<button class="emo" data-emoji="${k.slice(2)}">${k.slice(2)}</button>` : SHAPES.find(x => x[0] === k) ? el(SHAPES.find(x => x[0] === k)) : '').join('');
  return `${`<div class="paste-pad" contenteditable="true" inputmode="none" enterkeyhint="done" role="button" aria-label="Einfügen – antippen oder lange drücken und Einsetzen wählen">${IC.paste}<span>Einfügen<small>${ui.layerClip ? 'Kopiertes Element, Bild oder Text' : 'Bild oder Text aus anderen Apps'} · lange drücken → „Einsetzen“</small></span></div>`}
  ${rec ? group('Zuletzt benutzt', `<div class="el-grid recent">${rec}</div>`) : ''}
  ${group('Kritzeleien', `<div class="el-grid">${SHAPES.filter(([k]) => isDoodle(k)).map(el).join('')}</div>`)}
  ${group('Infografik', `<div class="el-grid">${SHAPES.filter(([k]) => k === 'qr' || k === 'chart').map(el).join('')}${b0.logo ? `<button class="el" data-act2="brandLogoUse"><img src="${b0.logo}" alt="" style="width:34px;height:34px;object-fit:contain"><span>Mein Logo</span></button>` : ''}</div>`)}
  ${group('Formen & Sticker', `<div class="el-grid">${SHAPES.filter(([k]) => !isDoodle(k) && k !== 'qr' && k !== 'chart').map(el).join('')}</div>`)}
  ${group('Emoji', `<div class="emoji-row">${EMOJI.map(e => `<button class="emo" data-emoji="${e}">${e}</button>`).join('')}</div>`)}
  ${group('Text-Vorlagen', `<div class="chips">${TEXT_PRESETS.map(([k, lb]) => chip(`data-addtext="${k}"`, lb, false)).join('')}</div>`)}`;
}
export function shapeIcon(k) {
  if (isDoodle(k)) return doodleSVG(k);
  if (k === 'qr') return '<g fill="var(--accent)"><path d="M6 6h11v11H6zM9 9v5h5V9zM23 6h11v11H23zM26 9v5h5V9zM6 23h11v11H6zM9 26v5h5v-5z" fill-rule="evenodd"/><rect x="23" y="23" width="4" height="4"/><rect x="30" y="23" width="4" height="4"/><rect x="26.5" y="27" width="4" height="4"/><rect x="23" y="30" width="4" height="4"/><rect x="30" y="30" width="4" height="4"/></g>';
  if (k === 'chart') return '<g fill="var(--accent)"><rect x="7" y="20" width="6" height="13" rx="1.5"/><rect x="17" y="11" width="6" height="22" rx="1.5"/><rect x="27" y="16" width="6" height="17" rx="1.5"/></g>';
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
export const TEXT_PRESETS = [['seite', 'Seitenzahl 1/5'], ['wischen', 'Wischen →'], ['handle', '@Name'], ['ort', '📍 Ort'], ['perlen', 'Perlen'], ['erpresser', 'Ausschnitte'], ['schreibschrift', 'Schreibschrift'], ['klassisch', 'Klassisch'], ['etikett', 'Etikett'], ['neon', 'Neon'], ['zeitung', 'Zeitung'], ['plakat', 'Plakat'], ['pixel', 'Pixel'], ['notiz', 'Notiz'], ['kontur', 'Kontur']];
export function textPreset(l, k) {
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
export const IMAGE_PANELS = {
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
    const m = p.masks[ui.maskSel], region = m && (m.kind === 'ai' || m.kind === 'lasso');
    const add = group('Neue Auswahl', `<div class="chips">${[['sky', '☁️ Himmel'], ['subject', '✨ Motiv'], ['person', '🧍 Person'], ['bg', '🏞 Hintergrund']].map(([k, lb]) => chip(`data-aimask="${k}"`, lb, false)).join('')}${chip('data-act2="lassoMask"', ui.lasso ? 'Jetzt umfahren …' : '✏️ Lasso', ui.lasso)}</div>
      <p class="note">KI-Auswahl erkennt den Bereich auf dem Gerät. Oder <b>ins Foto tippen</b> für einen runden Punkt.</p>`);
    const list = p.masks.length ? `<div class="chips">${p.masks.map((mm, i) => chip(`data-mask="${i}"`, maskName(mm, i), i === ui.maskSel)).join('')}</div>` : '<p class="note"><b>Tippe ins Foto</b>, um einen Bereich gezielt aufzuhellen, abzudunkeln oder einzufärben – wie „Selektiv“ in Snapseed oder Masken in Lightroom.</p>';
    if (!m) return add + list;
    if (region) return `${add}${list}
    ${group('Anpassung', slider('m.ex', 'Helligkeit', -2, 2, .05, 'ev') + slider('m.co', 'Kontrast', -100, 100, 1, 'signed', 0, 100) + slider('m.sat', 'Sättigung', -100, 100, 1, 'signed', 0, 100) + slider('m.temp', 'Wärme', -100, 100, 1, 'signed', 0, 100) + slider('m.st', 'Struktur', -100, 100, 1, 'signed', 0, 100))}
    ${group('Kante', slider('m.feather', 'Weiche Kante', 0, 100, 1, 'pct', 10, 100))}
    ${toggle('minv', 'Auswahl umkehren', m.inv)}
    <div class="row">${btn('maskDel', 'Auswahl löschen', 'danger')}${btn('maskDup', 'Duplizieren')}</div>`;
    return `${add}${list}<div class="chips">${chip('data-mkind="radial"', 'Radial', m.kind !== 'linear')}${chip('data-mkind="linear"', 'Verlauf', m.kind === 'linear')}</div>
    ${group('Anpassung', slider('m.ex', 'Helligkeit', -2, 2, .05, 'ev') + slider('m.co', 'Kontrast', -100, 100, 1, 'signed', 0, 100) + slider('m.sat', 'Sättigung', -100, 100, 1, 'signed', 0, 100) + slider('m.temp', 'Wärme', -100, 100, 1, 'signed', 0, 100) + slider('m.st', 'Struktur', -100, 100, 1, 'signed', 0, 100))}
    ${group('Form', slider('m.rx', m.kind === 'linear' ? 'Breite' : 'Größe', 1, 100, 1, 'n', 16, 100) + (m.kind !== 'linear' ? slider('m.ry', 'Höhe', 1, 100, 1, 'n', 16, 100) : '') + slider('m.feather', 'Weiche Kante', 2, 100, 1, 'pct', 60, 100) + slider('m.angle', 'Drehung', -180, 180, 1, 'deg', 0, 180 / Math.PI))}
    ${toggle('minv', 'Auswahl umkehren (außen statt innen)', m.inv)}
    <div class="row">${btn('maskDel', 'Punkt löschen', 'danger')}${btn('maskDup', 'Duplizieren')}</div>`;
  },
  freistellen: (l, p) => { const n = l.cut ? l.cut.strokes.length : 0, ai = /^ai/.test(ui.cutMode);
    return `<div class="chips">${[['ai', '✨ Motiv antippen'], ['add', 'Malen'], ['erase', 'Radieren'], ['lasso', 'Lasso +'], ['lassosub', 'Lasso −'], ['aisub', 'Bereich entfernen']].map(([k, lb]) => chip(`data-cutmode="${k}"`, lb, ui.cutMode === k)).join('')}</div>
    ${ai ? `<p class="note">${ui.cutMode === 'ai' ? '<b>Tippe aufs Motiv</b> – Person, Tier oder Gegenstand wird automatisch erkannt. Nochmal tippen fügt weitere Teile hinzu.' : '<b>Tippe auf einen Bereich</b>, der nicht zum Motiv gehören soll.'} Die Erkennung läuft auf deinem Gerät, es wird nichts hochgeladen.</p>`
      : /^lasso/.test(ui.cutMode) ? `<p class="note"><b>Umfahre einen Bereich</b> mit dem Finger – er wird ${ui.cutMode === 'lasso' ? 'zum Motiv hinzugefügt' : 'vom Motiv abgezogen'}.</p>`
      : group('', slider('ui.cutSize', 'Pinselgröße', 1, 25, .5, 'n', 5)) + (ui.cutMode === 'add' ? toggle('cutsmart', 'Kantenerkennung beim Malen (nur ähnliche Farben)', ui.cutSmart) : '')}
    ${n ? toggle('cutinv', 'Auswahl umkehren (alles außer dem Motiv)', !!l.cut.inv) : ''}
    ${n ? group('Kante', toggle('cutrefine', 'Kanten an Farben anpassen (Haare, Fell)', !!l.cut.refine) + slider('cut.feather', 'Weichheit', 0, 10, .5, 'd1', 0) + slider('cut.shift', 'Kante schrumpfen / erweitern', -10, 10, .5, 'd1', 0)) : ''}
    ${group('Ansicht', `<div class="chips">${[['dim', 'Hintergrund abdunkeln'], ['red', 'Maske rot'], ['off', 'Normal']].map(([k, lb]) => chip(`data-cutview="${k}"`, lb, ui.cutView === k)).join('')}</div>`)}
    ${group('Verwenden', (n ? toggle('cuton', 'Motiv liegt vor Text & Elementen', l.cut.on !== false) : '') + toggle('sticker', 'Nur das Motiv zeigen (Hintergrund weg)', l.sticker)
      + (l.sticker ? slider('l.stickerBorder', 'Sticker-Rand', 0, 5, .1, 'd1', 1.6) + swatches('frame', ['#ffffff', '#111111', '#f2c14e', '#ff7eb6', '#3f7fe0'], l.borderColor) + toggle('stickershadow', 'Schatten', l.stickerShadow !== false) : ''))}
    <div class="row">${btn('cutUndo', 'Letzten Schritt entfernen', 'ghost', n ? '' : 'disabled')}${btn('cutClear', 'Alles löschen', 'danger', n ? '' : 'disabled')}${btn('cutCopy', 'Motiv als eigene Ebene', 'ghost', n ? '' : 'disabled')}</div>
    <p class="note">Text hinter dem Motiv: Text über das Foto legen – das Motiv bleibt davor. Für feine Stellen reinzoomen (zwei Finger) und mit „Malen“/„Radieren“ nacharbeiten.</p>`; },
  entfernen: (l, p) => `<p class="note"><b>Tippe auf ein Objekt</b> oder <b>übermale es</b> – Personen, Mülleimer, Kabel, Flecken. Die Stelle wird von der KI passend aufgefüllt, auf deinem Gerät.</p>
    ${group('', slider('ui.erSize', 'Pinselgröße', 1, 15, .5, 'n', 4))}
    <p class="note">${p.erase.length ? `<b>${p.erase.length}</b> Objekt${p.erase.length === 1 ? '' : 'e'} entfernt. ` : ''}Beim ersten Mal lädt das KI-Modell einmalig (ca. 40 MB), danach geht es offline.</p>
    <div class="row">${btn('eraseUndo', 'Letzte zurücknehmen', 'ghost', p.erase.length ? '' : 'disabled')}${btn('eraseClear', 'Alle zurücknehmen', 'danger', p.erase.length ? '' : 'disabled')}</div>`,
  klonen: (l, p) => `<div class="chips">${chip('data-clonemode="src"', '⊕ Quelle wählen', ui.cloneMode === 'src' || !ui.cloneSrc)}${chip('data-clonemode="paint"', 'Malen', ui.cloneMode === 'paint' && !!ui.cloneSrc)}</div>
    ${group('', slider('ui.cloneSize', 'Pinselgröße', .5, 12, .1, 'n', 3))}
    <p class="note">${ui.cloneSrc ? 'Male dort, wo die Kopie hin soll – das Kreuz zeigt, woher kopiert wird.' : '<b>Tippe zuerst auf die Stelle</b>, von der kopiert werden soll.'} Wie der Kopierstempel in Photoshop.</p>
    <div class="row">${btn('cloneUndo', 'Letzten Strich entfernen', 'ghost', p.clone.length ? '' : 'disabled')}${btn('cloneClear', 'Alle Striche löschen', 'danger', p.clone.length ? '' : 'disabled')}</div>`,
  gesicht: (l, p) => `${p.skin.d ? '' : `<p class="note">${ui.skinBusy ? 'Haut wird erkannt …' : 'Noch keine Haut erkannt.'}</p>`}
    ${group('Haut', slider('sk.amt', 'Glätten', 0, 100, 1, 'n', 0) + slider('sk.glow', 'Strahlen', 0, 100, 1, 'n', 0))}
    <p class="note">Glättet nur erkannte Haut, Kanten wie Augen, Lippen und Haare bleiben scharf. Läuft auf dem Gerät.</p>
    <div class="row">${btn('skinDetect', p.skin.d ? 'Neu erkennen' : 'Haut erkennen')}</div>`,
  hintergrund: (l, p) => { const has = l.cut && l.cut.strokes.length, b = l.bgx || { mode: 'none' };
    if (!has) return `<p class="note">Dafür wird das Motiv vom Hintergrund getrennt.</p><div class="row">${btn('autoCut', '✨ Motiv automatisch erkennen', 'primary')}${btn('goCut', 'Selbst freistellen')}</div>`;
    const others = otherPhotos(l);
    return `<div class="chips">${[['none', 'Original'], ['blur', 'Unscharf'], ['mono', 'Color Pop'], ['color', 'Farbe'], ['photo', 'Anderes Foto'], ['clear', 'Transparent']].map(([k, lb]) => chip(`data-bgx="${k}"`, lb, k === 'clear' ? !!l.sticker : !l.sticker && (b.mode || 'none') === k)).join('')}</div>
    ${b.mode === 'blur' && !l.sticker ? group('', slider('bgx.amt', 'Unschärfe', 0, 100, 1, 'n', 60)) : ''}
    ${b.mode === 'color' && !l.sticker ? group('Farbe', swatches('bgx', ['#ffffff', '#111111', '#f2c14e', '#ff7eb6', '#7ec8ff', '#a8e6a1', '#efece6'], b.color)) : ''}
    ${b.mode === 'photo' && !l.sticker ? group('Foto', others.length ? `<div class="chips">${others.map(o => chip(`data-bgsrc="${o.srcId}"`, o.name, b.src === o.srcId)).join('')}</div>` + slider('bgx.zoom', 'Zoom', 1, 3, .01, 'x', 1) : '<p class="note">Füge dem Projekt ein weiteres Foto hinzu.</p>') : ''}
    ${b.mode && b.mode !== 'none' && !l.sticker ? group('', slider('bgx.dim', 'Hintergrund abdunkeln ↔ aufhellen', -100, 100, 1)) : ''}
    <p class="note">Die Motivkante verfeinerst du unter „Freistellen“.</p>`; },
  kreativ: (l, p) => { const db = l.dbl, others = otherPhotos(l);
    return group('Tonaler Kontrast', slider('p.tonHi', 'Lichter', -100, 100, 1) + slider('p.tonMid', 'Mitten', -100, 100, 1) + slider('p.tonLo', 'Tiefen', -100, 100, 1))
    + group('Stil', slider('p.drama', 'Drama', 0, 100, 1) + slider('p.grunge', 'Grunge', 0, 100, 1) + slider('p.glitch', 'Glitch', 0, 100, 1))
    + group('Doppelbelichtung', others.length ? `<div class="chips">${chip('data-dbl=""', 'Aus', !db)}${others.map(o => chip(`data-dbl="${o.srcId}"`, o.name, db && db.src === o.srcId)).join('')}</div>`
      + (db ? `<div class="chips">${[['screen', 'Aufhellen'], ['lighten', 'Hellere Farbe'], ['overlay', 'Ineinander'], ['multiply', 'Multiplizieren']].map(([k, lb]) => chip(`data-dblmode="${k}"`, lb, (db.mode || 'screen') === k)).join('')}</div>
        ${slider('dbl.amt', 'Stärke', 0, 100, 1, 'n', 70)}${slider('dbl.zoom', 'Zoom', 1, 3, .01, 'x', 1)}${slider('dbl.px', 'Position waagerecht', 0, 100, 1, 'pct', 50, 100)}${slider('dbl.py', 'Position senkrecht', 0, 100, 1, 'pct', 50, 100)}
        ${toggle('dblin', 'Nur im Motiv (Silhouette)', !!db.inside)}${db.inside && !(l.cut && l.cut.strokes.length) ? `<div class="row">${btn('autoCut', '✨ Motiv erkennen')}</div>` : ''}` : '')
      : '<p class="note">Füge dem Projekt ein zweites Foto hinzu – es wird dann über dieses gelegt.</p>'); },
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
export const BRUSH_MODES = [['dodge', 'Aufhellen'], ['burn', 'Abdunkeln'], ['sat', 'Sättigung +'], ['desat', 'Sättigung −'], ['warm', 'Wärmer'], ['cool', 'Kühler'], ['erase', 'Radierer']];
export const CLIPS = [['rect', 'Rechteck'], ['round', 'Abgerundet'], ['circle', 'Kreis'], ['arch', 'Bogen'], ['heart', 'Herz'], ['star', 'Stern'], ['blob', 'Klecks']];
export const FRAME_LIST = [['polaroid', 'Sofortbild'], ['instax', 'Instax'], ['film', 'Kleinbild'], ['filmv', 'Kleinbild hoch'], ['dia', 'Dia']];
export const EDGES = [['', 'Glatt'], ['torn', 'Zerrissen'], ['deckle', 'Büttenrand'], ['stamp', 'Briefmarke']];
export function panelFrame(l) {
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
export function panelImageLayer(l) {
  return group('', slider('l.wpct', 'Größe (Slide-Breite)', 10, 100 * state.slides + 100, 1, 'pct', 100) + slider('l.rot', 'Drehung', -180, 180, .5, 'deg') + slider('l.opacity', 'Deckkraft', 0, 100, 1, 'pct', 100, 100))
  + group('Mischmodus', `<div class="chips scroll">${BLENDS.map(([k, lb]) => chip(`data-blend="${k}"`, lb, (l.blend || 'source-over') === k)).join('')}</div><span class="note">Für Doppelbelichtung: Foto über ein anderes legen, „Negativ multipl.“ oder „Aufhellen“ wählen.</span>`)
  + alignRow() + `<div class="row">${btn('fillSlide', 'Slide füllen')}${btn('fillAll', 'Alle Slides füllen')}${btn('replace', 'Foto ersetzen')}${btn('bgBlur', 'Als unscharfer Hintergrund')}</div>` + layerOrderRow(l);
}
export const layerOrderRow = l => `<div class="row">${btn('front', 'Nach vorn')}${btn('back', 'Nach hinten')}${btn('dup', 'Duplizieren')}${btn('lock', l.locked ? 'Entsperren' : 'Sperren')}${btn('del', 'Löschen', 'danger')}</div>`;
export function panelLayerCommon(l) {
  return group('', (l.type === 'text' ? '' : slider('l.rot', 'Drehung', -180, 180, .5, 'deg')) + slider('l.opacity', 'Deckkraft', 0, 100, 1, 'pct', 100, 100))
    + group('Mischmodus', `<div class="chips scroll">${BLENDS.map(([k, lb]) => chip(`data-blend="${k}"`, lb, (l.blend || 'source-over') === k)).join('')}</div>`)
    + alignRow() + `<div class="row">${btn('toAll', 'Auf jede Slide kopieren')}</div>` + layerOrderRow(l);
}
export function panelText(l) {
  return `<textarea class="txt" id="txtIn" aria-label="Text" rows="2">${esc(l.text)}</textarea>
  <span class="note">Platzhalter: <b>{n}</b> Slide-Nummer · <b>{N}</b> Anzahl Slides · <b>{datum}</b> heute</span>
  ${swatches('text', TEXT_COLORS, l.color)}
  <div class="chips scroll">${brandFirst(FONTS).map(([f, lb, wgt]) => `<button class="fontchip${isBrandFont(f) ? ' brand' : ''}" data-font="${f}" aria-pressed="${l.font === f}"><span class="aa" style="font-family:'${f}';font-weight:${wgt}">Aa</span><span>${isBrandFont(f) ? '★ ' : ''}${lb}</span></button>`).join('')}</div>
  ${group('Schnell-Stile', `<div class="chips">${TEXT_PRESETS.map(([k, lb]) => chip(`data-tpreset="${k}"`, lb, false)).join('')}</div>`)}`;
}
export const TEXT_FX = [['none', 'Ohne'], ['lift', 'Anheben'], ['hollow', 'Hohl'], ['splice', 'Spleißen'], ['echo', 'Echo'], ['hard', '3D'], ['neon', 'Neon'], ['glitch', 'Glitch']];
export const isBrandFont = f => { const b = brand(); return !!f && (b.head === f || b.body === f); };
export const brandFirst = list => [...list.filter(x => isBrandFont(x[0])), ...list.filter(x => !isBrandFont(x[0]))];
export const PIN_COLORS = ['#8a4bd8', '#e5484d', '#ff7eb6', '#ff9a2e', '#f2c14e', '#3fa36b', '#3f7fe0', '#111111', '#ffffff'];
export function panelTextStyle(l) {
  return group('Farbe', swatches('text', TEXT_COLORS, l.color)) + group('', slider('l.size', 'Größe', 16, 400, 1, 'px', 110) + slider('l.rot', 'Drehung', -180, 180, .5, 'deg') + slider('l.spacing', 'Laufweite', -10, 60, 1, 'n') + slider('l.lineH', 'Zeilenabstand', .8, 2, .02, 'lh', 1.16) + slider('l.sx', 'Breite (stauchen / strecken)', 20, 300, 1, 'pct', 100, 100) + slider('l.sy', 'Höhe (stauchen / strecken)', 20, 300, 1, 'pct', 100, 100) + slider('l.curve', 'Bogen', -100, 100, 1, 'signed', 0) + (l.curve && l.bg !== 'none' ? '<span class="note">Bogentext gibt es nur ohne Hinterlegung.</span>' : ''))
  + group('Ausrichtung', `<div class="chips">${[['left', 'Links'], ['center', 'Mitte'], ['right', 'Rechts']].map(([k, lb]) => chip(`data-align="${k}"`, lb, l.align === k)).join('')}</div>`)
  + group('Hinterlegung', `<div class="chips">${[['none', 'Keine'], ['solid', 'Fläche'], ['soft', 'Halbtransparent'], ['band', 'Zeilenband'], ['beads', 'Perlen'], ['ransom', 'Ausschnitte'], ['pin', 'Orts-Pille']].map(([k, lb]) => chip(`data-tbg="${k}"`, lb, l.bg === k)).join('')}</div>
    ${l.bg === 'pin' ? `<span class="sec-label">Pille</span>${swatches('textbg', TEXT_COLORS, l.bgColor)}<span class="sec-label">Stecknadel</span>${swatches('pin', PIN_COLORS, l.pinColor || '#8a4bd8')}` : l.bg !== 'none' ? swatches('textbg', TEXT_COLORS, l.bgColor) : ''}`)
  + group('Effekt', `<div class="chips">${TEXT_FX.map(([k, lb]) => chip(`data-tfx="${k}"`, lb, (l.fx || 'none') === k)).join('')}</div>
    ${l.fx && l.fx !== 'none' ? slider('l.fxAmt', 'Stärke', 0, 100, 1, 'n', 50) + (['splice', 'echo', 'hard', 'neon'].includes(l.fx) ? `<span class="sec-label">Effektfarbe</span>${swatches('fx', ['#ff3b6b', '#ff9a2e', '#f2c14e', '#3fe0c5', '#3f7fe0', '#b45cff', '#111111', '#ffffff'], l.fxColor || '#ff3b6b')}` : '') : ''}`)
  + group('Kontur', slider('l.stroke', 'Konturstärke', 0, 20, .5, 'n') + (l.stroke ? swatches('stroke', TEXT_COLORS, l.strokeColor) : ''))
  + toggle('upper', 'Großbuchstaben', l.upper) + toggle('glow', 'Leuchten (Neon)', l.glow) + (l.bg === 'none' ? toggle('tshadow', 'Schatten für Lesbarkeit', l.shadow) : '');
}
export function panelQR(l) { const q = l.qr = l.qr || newShapeLayer('qr', 0, 0).qr;
  return group('QR-Code', `<textarea class="txt" id="qrIn" rows="2" aria-label="Inhalt des QR-Codes" placeholder="Link, Text, Telefonnummer …">${esc(q.text)}</textarea>
    <span class="note">Link zu Profil, Shop oder Speisekarte. Wird beim Scannen geöffnet.</span>`)
    + group('Stil', `<div class="chips">${chip('data-qrstyle="square"', 'Klassisch', q.style !== 'dots')}${chip('data-qrstyle="dots"', 'Punkte', q.style === 'dots')}</div>
      <span class="sec-label">Farbe</span>${swatches('qrfg', ['#111111', '#1d3557', '#7a1f3d', '#2d6a4f', '#ffffff'], q.fg)}
      <span class="sec-label">Hintergrund</span><div class="chips">${chip('data-qrbg="#ffffff"', 'Weiß', q.bg === '#ffffff')}${chip('data-qrbg="#f6f1e7"', 'Creme', q.bg === '#f6f1e7')}${chip('data-qrbg="#111111"', 'Schwarz', q.bg === '#111111')}${chip('data-qrbg="none"', 'Keiner', q.bg === 'none')}</div>`)
    + group('', slider('l.wprop', 'Größe', 120, 1600, 1, 'px') + slider('l.rot', 'Drehung', -180, 180, .5, 'deg')) + `<p class="note">Tipp: dunkel auf hell scannt am zuverlässigsten.</p>` + alignRow();
}
export function panelChart(l) { const ch = l.chart = l.chart || newShapeLayer('chart', 0, 0).chart;
  return group('Daten', `<textarea class="txt" id="chartIn" rows="5" aria-label="Daten, je Zeile Beschriftung und Wert">${esc(ch.data)}</textarea>
    <span class="note">Je Zeile: Beschriftung und Zahl, z. B. „Kaffee 42“.</span>
    <div class="row"><label class="note" for="chartUnit">Einheit</label><input class="name" id="chartUnit" maxlength="6" value="${esc(ch.unit || '')}" placeholder="z. B. %, €, km" style="max-width:120px"></div>`)
    + group('Art', `<div class="chips">${[['bar', 'Säulen'], ['hbar', 'Balken'], ['pie', 'Torte'], ['donut', 'Ring'], ['line', 'Linie']].map(([k, lb]) => chip(`data-ctype="${k}"`, lb, ch.type === k)).join('')}</div>`)
    + group('Farben', `<div class="chips">${chip('data-cpal="marke"', '★ Marke', ch.pal === 'marke')}${Object.keys(CHART_PALETTES).map(k => chip(`data-cpal="${k}"`, k[0].toUpperCase() + k.slice(1), ch.pal === k)).join('')}</div>
      <span class="sec-label">Schrift</span>${swatches('chartink', ['#1d1d1d', '#ffffff', '#4a4a4a', '#7a1f3d'], ch.ink)}`)
    + toggle('cvalues', 'Werte anzeigen', ch.values !== false) + toggle('ccard', 'Karte dahinter', !!ch.card) + (ch.card ? swatches('chartcard', ['#ffffff', '#f6f1e7', '#111111', '#1d3557', '#fde2e4'], ch.cardColor) : '')
    + group('', slider('l.w', 'Breite', 200, 3000, 1, 'px') + slider('l.h', 'Höhe', 150, 3000, 1, 'px') + slider('l.rot', 'Drehung', -180, 180, .5, 'deg')) + alignRow();
}
export const SHAPE_FAM = { basic: ['rect', 'round', 'circle', 'frame', 'line', 'arrow', 'star', 'heart', 'sparkle', 'blob', 'arch'], prop: ['tape', 'clip', 'binder', 'paper', 'lace', 'starSticker', 'leaves', 'check', 'spiral', 'laurel'] };
export const famOf = k => k === 'qr' || k === 'chart' ? 'info' : isDoodle(k) || /^(scribble|corners|scribbleArrow)$/.test(k) ? 'doodle' : SHAPE_FAM.prop.includes(k) ? 'prop' : 'basic';
export function panelShape(l) {
  if (l.kind === 'qr') return panelQR(l); if (l.kind === 'chart') return panelChart(l);
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
