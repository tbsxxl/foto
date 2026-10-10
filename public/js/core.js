/* Gemeinsamer Zustand, Konstanten und kleine Helfer */
export const $ = s => document.querySelector(s);
export const clamp = (v, a = 0, b = 1) => v < a ? a : v > b ? b : v;
export const clone = o => JSON.parse(JSON.stringify(o));
export const de = (v, d = 0) => v.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });
export const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const smooth = t => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
export function seeded(s) { return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

export const FORMATS = {
  '4:5': { W: 1080, H: 1350, label: 'Hochformat', px: '1080×1350' },
  '1:1': { W: 1080, H: 1080, label: 'Quadrat', px: '1080×1080' },
  '3:4': { W: 1080, H: 1440, label: 'Hoch 3:4', px: '1080×1440' },
  '9:16': { W: 1080, H: 1920, label: 'Story', px: '1080×1920' }
};
export const HSL_BANDS = [
  ['Rot', 0, '#e5484d'], ['Orange', 30, '#f08c3a'], ['Gelb', 58, '#f2d14e'], ['Grün', 115, '#4fb26b'],
  ['Aqua', 180, '#3fbcc4'], ['Blau', 222, '#3f7fe0'], ['Lila', 272, '#8b5cf6'], ['Magenta', 318, '#d9539b']
];

/* Looks: Werte in Regler-Einheiten /100 (also .2 = Regler +20). Effekt-Schlüssel wie in eff(). */
export const LOOK_CATS = [['retro', 'Retro & Digicam'], ['film', 'Film'], ['sw', 'S/W'], ['stil', 'Stile']];
export const LOOKS = {
  none:     { name: 'Original', cat: '*' },
  digicam:  { cat: 'retro', name: "Digicam '06", contrast: .18, saturation: .12, temp: -.1, whites: .35, structure: .3, grain: .14, vignette: .12, ch: { b: [.04, 1, 1], r: [0, 1.02, 1] }, stamp: true },
  ccd:      { cat: 'retro', name: 'CCD', contrast: .12, saturation: .18, temp: -.18, tint: -.04, whites: .5, highlights: .2, sharpen: .45, lowres: .25, ca: .25, grain: .08, stamp: true },
  blitz:    { cat: 'retro', name: 'Blitz', exposure: .25, contrast: .28, shadows: -.25, temp: -.15, saturation: .06, vignette: .38, whites: .45, structure: .15, stamp: true },
  wegwerf:  { cat: 'retro', name: 'Wegwerfkamera', exposure: .12, contrast: .2, temp: .16, saturation: .1, vignette: .42, grain: .3, leak: .35, leakKind: 1, fade: .1, stamp: true, split: { sh: [0, .02, .03], hi: [.05, .02, -.03] } },
  y2k:      { cat: 'retro', name: "Sommer '99", exposure: .1, temp: .2, tint: .06, saturation: .2, fade: .15, glow: .3, grain: .12, leak: .2, leakKind: 0, stamp: true },
  camcorder:{ cat: 'retro', name: 'Camcorder', contrast: .1, saturation: .25, temp: -.08, lowres: .5, ca: .6, sharpen: .3, fade: .08, grain: .1, stamp: true },
  abgelaufen:{ cat: 'retro', name: 'Abgelaufen', fade: .35, contrast: -.05, saturation: -.12, tint: -.18, temp: .1, grain: .35, leak: .4, leakKind: 3, dust: .45, split: { sh: [.02, .05, -.01], hi: [.06, .02, .03] } },
  lomo:     { cat: 'retro', name: 'Lomo', contrast: .35, saturation: .35, vignette: .65, ch: { r: [0, 1.05, .92], b: [.1, .9, 1.1] } },
  gold:     { cat: 'film', name: 'Gold 200', temp: .22, tint: .05, saturation: .14, fade: .22, contrast: .06, grain: .22, split: { sh: [0, .01, .035], hi: [.06, .035, -.02] } },
  portra:   { cat: 'film', name: 'Portra', temp: .1, saturation: -.1, vibrance: .12, fade: .18, highlights: -.25, shadows: .15, grain: .12, split: { sh: [0, .01, .02], hi: [.035, .018, -.01] } },
  superia:  { cat: 'film', name: 'Superia', tint: -.14, saturation: .05, contrast: .1, grain: .18, split: { sh: [-.02, .025, .035], hi: [.02, .03, -.015] } },
  cine800:  { cat: 'film', name: 'Kunstlicht 800', temp: -.22, contrast: .15, halation: .55, grain: .25, fade: .08, split: { sh: [-.02, .02, .06], hi: [.06, .02, -.02] } },
  diafilm:  { cat: 'film', name: 'Diafilm', contrast: .32, saturation: .22, blacks: -.2, temp: .06, vignette: .15, split: { sh: [0, -.01, .03], hi: [.03, .01, 0] } },
  velvet:   { cat: 'film', name: 'Velvet', contrast: .2, saturation: .38, vibrance: .2, highlights: -.15, grain: .1 },
  kino:     { cat: 'film', name: 'Kino', contrast: .22, saturation: .08, fade: .06, split: { sh: [-.045, .01, .065], hi: [.075, .03, -.045] } },
  sofort:   { cat: 'film', name: 'Sofortbild', fade: .38, contrast: -.18, saturation: -.18, temp: .1, vignette: .28, grain: .1, split: { sh: [0, .03, .05], hi: [.05, .04, 0] } },
  frost:    { cat: 'film', name: 'Frost', temp: -.3, tint: .04, saturation: -.2, fade: .25, exposure: .1, contrast: -.1 },
  pastell:  { cat: 'film', name: 'Pastell', exposure: .15, contrast: -.28, fade: .2, saturation: -.1, vibrance: .15, highlights: -.2, tint: .05 },
  nacht:    { cat: 'film', name: 'Nachtfahrt', exposure: -.12, contrast: .22, temp: -.25, grain: .3, vignette: .36, split: { sh: [0, .02, .075], hi: [.02, 0, -.02] } },
  trix:     { cat: 'sw', name: 'Tri-X', mono: true, contrast: .38, grain: .36, structure: .22, vignette: .16 },
  hp5:      { cat: 'sw', name: 'Weich S/W', mono: true, contrast: -.05, fade: .18, grain: .22, shadows: .2 },
  noir:     { cat: 'sw', name: 'Noir', mono: true, contrast: .55, blacks: -.3, clarity: .3, vignette: .5, grain: .3, exposure: -.1 },
  sepia:    { cat: 'sw', name: 'Sepia', mono: true, monoTone: [1.08, .97, .82], fade: .15, contrast: .1, grain: .2, vignette: .25 },
  selen:    { cat: 'sw', name: 'Selen', mono: true, monoTone: [.96, .97, 1.06], contrast: .2, grain: .15 },
  drama:    { cat: 'stil', name: 'Drama', clarity: .6, structure: .5, contrast: .1, saturation: -.25, shadows: .3, highlights: -.3, vignette: .2 },
  hdr:      { cat: 'stil', name: 'HDR', shadows: .6, highlights: -.55, clarity: .45, structure: .3, vibrance: .3 },
  glamour:  { cat: 'stil', name: 'Glamour Glow', glow: .65, saturation: -.05, temp: .06, contrast: .05 },
  klar:     { cat: 'stil', name: 'Klar & frisch', dehaze: .35, vibrance: .25, clarity: .15, sharpen: .3 },
  traum:    { cat: 'stil', name: 'Traum', glow: .5, fade: .2, exposure: .1, saturation: -.1, tint: .08, contrast: -.15 }
};

export const FONTS = [
  ['Instrument Sans', 'Klar', 600], ['Playfair Display', 'Edel', 600], ['DM Serif Display', 'Magazin', 400], ['Caveat', 'Handschrift', 600], ['Great Vibes', 'Schreibschrift', 400],
  ['Permanent Marker', 'Marker', 400], ['Pacifico', 'Retro', 400], ['Bebas Neue', 'Plakat', 400], ['Anton', 'Schlagzeile', 400],
  ['Archivo Black', 'Fett', 400], ['Space Mono', 'Schreibmaschine', 700], ['Special Elite', 'Farbband', 400], ['VT323', 'Digital', 400], ['Press Start 2P', 'Pixel', 400]
];
export const TEXT_COLORS = ['#ffffff', '#111111', '#f2c14e', '#ff9a2e', '#e5484d', '#ff7eb6', '#3f7fe0', '#a8c5b5'];
export const BG_COLORS = ['#ffffff', '#efece6', '#e8dcc8', '#111111', '#1f3a4d', '#b5543f', '#e9c46a', '#a8c5b5', '#e3d0e6', '#c9d6e8'];
export const FRAME_COLORS = ['#ffffff', '#f4efe6', '#111111', '#f2c14e', '#a8c5b5', '#e3d0e6'];
export const RATIOS = [['orig', 'Original'], [1, '1:1'], [0.8, '4:5'], [0.75, '3:4'], [1.5, '3:2'], [4 / 3, '4:3'], [16 / 9, '16:9'], [9 / 16, '9:16'], [2.4, 'Kino']];
export const ID_CURVE = [0, .25, .5, .75, 1];
export const BLENDS = [['source-over', 'Normal'], ['multiply', 'Multiplizieren'], ['screen', 'Negativ multipl.'], ['overlay', 'Ineinander'], ['soft-light', 'Weiches Licht'], ['lighten', 'Aufhellen'], ['darken', 'Abdunkeln'], ['difference', 'Differenz'], ['luminosity', 'Luminanz']];
export const STAMP_COLORS = { orange: ['#ffa23a', 'rgba(255,110,10,.85)'], rot: ['#ff5b3a', 'rgba(255,40,10,.85)'], gelb: ['#ffe066', 'rgba(255,190,20,.8)'], gruen: ['#9dff7a', 'rgba(60,220,40,.75)'], weiss: ['#ffffff', 'rgba(255,255,255,.5)'] };

export function defParams() {
  const hsl = {}; HSL_BANDS.forEach((b, i) => hsl[i] = [0, 0, 0]);
  return {
    exposure: 0, brightness: 0, contrast: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0, temp: 0, tint: 0,
    vibrance: 0, saturation: 0, ambiance: 0, structure: 0, clarity: 0, texture: 0, dehaze: 0, sharpen: 0, denoise: 0,
    vignette: 0, vigSize: 50, grain: 0, grainSize: 25, fade: 0, glow: 0, halation: 0, ca: 0, leak: 0, leakKind: 0, dust: 0, lowres: 0,
    look: 'none', lookAmt: 100, stamp: false, stampStyle: { fmt: 'yy', color: 'orange', pos: 'br' }, auto: null,
    curves: { rgb: ID_CURVE.slice(), r: ID_CURVE.slice(), g: ID_CURVE.slice(), b: ID_CURVE.slice() }, hsl,
    grade: { sh: [220, 0], mid: [40, 0], hi: [40, 0], glob: [40, 0], bal: 0 },
    persp: { v: 0, h: 0 }, masks: [], brush: [], heal: [],
    blur: { mode: 'off', x: .5, y: .5, size: .22, feather: .25, amt: 55, angle: 0 }
  };
}
/* ältere Parameter-Objekte (Presets, Projekte) auf den aktuellen Stand bringen */
export function upgradeParams(p) {
  const d = defParams();
  for (const k in d) if (p[k] === undefined) p[k] = d[k];
  for (const k of ['grade', 'persp', 'blur', 'stampStyle']) p[k] = Object.assign(clone(d[k]), p[k]);
  return p;
}

/* ---------- Zustand ---------- */
export const state = { format: '4:5', slides: 3, bg: { c1: '#efece6', c2: '#a8c5b5', grad: false, dir: 'h', pattern: 'none' }, layers: [] };
export const ui = {
  sel: null, tab: { none: 'canvas', image: 'looks', text: 'text', shape: 'form' }, showOrig: false, sample: true, hslBand: 0, curveCh: 'rgb', clip: null, guides: [],
  confirmClear: false, confirmPresets: false, lookCat: 'retro', gradeRange: 'sh', tool: null, maskSel: 0, brushMode: 'dodge', brushSize: 6, brushStrength: 50,
  healSize: 3, cutMode: 'add', cutSize: 5, cutSmart: true, cutShow: true, projectId: null, projectName: 'Mein Karussell', panelScroll: 0
};
export const sources = new Map();
export const cache = new Map();
export const ids = { n: 1 };
export const newId = () => ids.n++;
export const dims = () => FORMATS[state.format];
export const selLayer = () => state.layers.find(l => l.id === ui.sel) || null;

let toastT;
/* Meldung, optional mit Aktion (z. B. „Rückgängig“) */
export function toast(msg, actLabel, act) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  if (actLabel && act) { const b = document.createElement('button'); b.className = 'toast-act'; b.textContent = actLabel; b.onclick = () => { t.hidden = true; act(); }; t.append(b); }
  clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, actLabel ? 4500 : 2200);
}

export const stampText = (ms, fmt) => {
  const d = new Date(ms), p = n => String(n).padStart(2, '0'), y = p(d.getFullYear() % 100), m = p(d.getMonth() + 1), dd = p(d.getDate());
  if (fmt === 'dmy') return `${dd}.${m}.${y}`;
  if (fmt === 'mdy') return `${m} ${dd} '${y}`;
  if (fmt === 'time') return `${p(d.getHours())}:${p(d.getMinutes())}  ${dd}.${m}.${y}`;
  return `'${y}  ${m}  ${dd}`;
};
