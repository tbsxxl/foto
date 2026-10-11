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
  '9:16': { W: 1080, H: 1920, label: 'Story', px: '1080×1920' },
  '2:3': { W: 1000, H: 1500, label: 'Pinterest', px: '1000×1500' },
  '16:9': { W: 1920, H: 1080, label: 'Quer 16:9', px: '1920×1080' },
  'A4': { W: 1240, H: 1754, label: 'A4 Poster', px: '1240×1754' }
};
export const HSL_BANDS = [
  ['Rot', 0, '#e5484d'], ['Orange', 30, '#f08c3a'], ['Gelb', 58, '#f2d14e'], ['Grün', 115, '#4fb26b'],
  ['Aqua', 180, '#3fbcc4'], ['Blau', 222, '#3f7fe0'], ['Lila', 272, '#8b5cf6'], ['Magenta', 318, '#d9539b']
];

/* Looks: Werte in Regler-Einheiten /100 (also .2 = Regler +20). Effekt-Schlüssel wie in eff(). */
export const LOOK_CATS = [['fuji', 'Fuji'], ['kodak', 'Kodak & Co.'], ['retro', 'Retro & Digicam'], ['film', 'Film-Mix'], ['insta', 'Insta-Klassiker'], ['sw', 'S/W'], ['stil', 'Stile']];
export const LOOKS = {
  none:     { name: 'Original', cat: '*' },
  /* Fujifilm-Filmsimulationen (nachempfunden) – hsl: {Farbbereich: [Farbton, Sättigung, Luminanz]}, 0 Rot … 7 Magenta */
  provia:   { cat: 'fuji', name: 'Provia', contrast: .08, saturation: .06, vibrance: .05 },
  velvia:   { cat: 'fuji', name: 'Velvia', contrast: .22, saturation: .32, vibrance: .15, blacks: -.1, hsl: { 0: [0, 10, -5], 3: [8, 25, -8], 5: [-5, 18, -12] } },
  astia:    { cat: 'fuji', name: 'Astia', contrast: -.04, saturation: .08, highlights: -.12, hsl: { 1: [0, -10, 8], 5: [0, 10, 0] } },
  chrome:   { cat: 'fuji', name: 'Classic Chrome', contrast: .14, saturation: -.22, shadows: -.08, highlights: -.15, curve: [.035, .235, .5, .745, .965],
              hsl: { 0: [0, -10, -5], 1: [0, -8, 0], 2: [-12, -25, 0], 3: [12, -35, -10], 4: [0, -25, -8], 5: [-8, -12, -18] }, split: { sh: [0, .008, .02], hi: [.02, .012, -.008] } },
  classicneg: { cat: 'fuji', name: 'Classic Neg', contrast: .2, saturation: -.08, temp: -.02, grain: .08, curve: [.06, .21, .5, .79, .95],
              hsl: { 0: [-12, 5, -5], 1: [0, -10, 0], 2: [-18, -20, 0], 3: [25, -18, -15], 4: [12, -5, -10], 5: [-12, -8, -15] }, split: { sh: [-.012, .03, .04], hi: [.04, .022, -.02] } },
  nostalgic: { cat: 'fuji', name: 'Nostalgic Neg', temp: .12, saturation: .04, fade: .08, highlights: -.18, shadows: .06, hsl: { 1: [5, 12, 5], 2: [-6, 10, 4] }, split: { sh: [.03, .012, -.01], hi: [.05, .03, -.02] } },
  eterna:   { cat: 'fuji', name: 'Eterna', contrast: -.22, saturation: -.3, shadows: .2, highlights: -.22, fade: .06, split: { sh: [0, .02, .03], hi: [.02, .02, 0] } },
  bleach:   { cat: 'fuji', name: 'Bleach Bypass', contrast: .45, saturation: -.6, clarity: .2, blacks: -.15, highlights: -.1 },
  proneghi: { cat: 'fuji', name: 'Pro Neg Hi', contrast: .14, saturation: .02, hsl: { 1: [0, -8, 6] } },
  pronegstd: { cat: 'fuji', name: 'Pro Neg Std', contrast: -.08, saturation: -.05, highlights: -.1, hsl: { 1: [0, -6, 6] } },
  reala:    { cat: 'fuji', name: 'Reala Ace', contrast: .1, saturation: .08, vibrance: .06, hsl: { 0: [0, 6, 0], 3: [4, 6, 0] } },
  acros:    { cat: 'fuji', name: 'Acros', mono: true, contrast: .22, grain: .18, clarity: .08, curve: [.02, .22, .5, .78, .98] },
  acrosR:   { cat: 'fuji', name: 'Acros + R', mono: true, monoMix: [.72, .33, -.05], contrast: .24, grain: .18 },
  acrosYe:  { cat: 'fuji', name: 'Acros + Ye', mono: true, monoMix: [.5, .48, .02], contrast: .22, grain: .18 },
  acrosG:   { cat: 'fuji', name: 'Acros + G', mono: true, monoMix: [.22, .72, .06], contrast: .2, grain: .18 },
  fujisepia: { cat: 'fuji', name: 'Sepia', mono: true, monoTone: [1.1, .98, .8], contrast: .05 },
  /* Kodak & Co. (nachempfunden) */
  portra160: { cat: 'kodak', name: 'Portra 160', temp: .06, saturation: -.12, contrast: -.05, highlights: -.2, hsl: { 1: [3, -5, 8] }, split: { sh: [0, .005, .015], hi: [.02, .01, -.005] } },
  portra800: { cat: 'kodak', name: 'Portra 800', temp: .1, saturation: -.04, grain: .2, fade: .1, shadows: .1, split: { sh: [0, .01, .03], hi: [.04, .02, -.01] } },
  ektar:    { cat: 'kodak', name: 'Ektar 100', saturation: .3, contrast: .2, vibrance: .1, hsl: { 0: [0, 15, -5], 5: [-5, 15, -5] } },
  ultramax: { cat: 'kodak', name: 'Ultramax 400', temp: .12, saturation: .2, contrast: .12, grain: .2, split: { sh: [0, .01, .015], hi: [.05, .03, -.02] } },
  colorplus: { cat: 'kodak', name: 'ColorPlus 200', temp: .18, saturation: .1, fade: .12, grain: .25, highlights: -.1, split: { hi: [.04, .02, -.02], sh: [.01, .01, 0] } },
  kodachrome: { cat: 'kodak', name: 'Kodachrome 64', contrast: .3, saturation: .18, blacks: -.15, hsl: { 0: [0, 20, -10], 2: [-5, 10, 0], 5: [5, 12, -20] }, split: { sh: [.012, 0, -.02], hi: [.02, .01, 0] } },
  ektachrome: { cat: 'kodak', name: 'Ektachrome E100', temp: -.08, saturation: .25, contrast: .2, hsl: { 4: [0, 15, 0], 5: [0, 20, 0] } },
  tmax:     { cat: 'kodak', name: 'T-Max 400', mono: true, contrast: .2, grain: .1, clarity: .06 },
  cine50:   { cat: 'kodak', name: 'Kunstlicht 50 (Tag)', temp: -.05, contrast: .1, halation: .3, saturation: .05 },
  lomopurple: { cat: 'kodak', name: 'Lomo Purple', saturation: .15, contrast: .15, mix: [[1, 0, 0], [0, .15, .85], [.1, .8, .1]] },
  polaroid600: { cat: 'kodak', name: 'Polaroid 600', fade: .25, contrast: -.1, temp: .08, tint: -.05, saturation: -.15, vignette: .25, split: { sh: [0, .03, .04], hi: [.03, .02, 0] } },
  /* Klassische Insta-Filter (nachempfunden) */
  clarendon: { cat: 'insta', name: 'Clarendon', contrast: .2, saturation: .15, highlights: .1, temp: -.08, split: { sh: [-.02, 0, .04] } },
  juno:     { cat: 'insta', name: 'Juno', contrast: .12, saturation: .2, temp: .08, hsl: { 0: [0, 10, 0], 2: [0, 15, 5] } },
  lark:     { cat: 'insta', name: 'Lark', exposure: .15, saturation: -.1, hsl: { 0: [0, -20, 0], 3: [0, 15, 5], 5: [0, 10, 10] } },
  gingham:  { cat: 'insta', name: 'Gingham', fade: .25, contrast: -.15, saturation: -.15, temp: .04 },
  valencia: { cat: 'insta', name: 'Valencia', temp: .2, fade: .1, contrast: .05, exposure: .08 },
  nashville: { cat: 'insta', name: 'Nashville', temp: .15, tint: .1, fade: .2, exposure: .1, split: { sh: [.06, .02, 0], hi: [.05, 0, -.05] } },
  xpro:     { cat: 'insta', name: 'X-Pro II', contrast: .35, saturation: .2, vignette: .45, ch: { b: [.08, .85, 1], r: [0, 1.05, .9] } },
  i1977:    { cat: 'insta', name: '1977', fade: .2, tint: .15, exposure: .1, saturation: .05, split: { sh: [.05, 0, .02] } },
  hefe:     { cat: 'insta', name: 'Hefe', contrast: .25, saturation: .15, vignette: .4, temp: .1 },
  earlybird: { cat: 'insta', name: 'Earlybird', temp: .25, fade: .2, vignette: .3, saturation: -.1, contrast: .05 },
  moon:     { cat: 'insta', name: 'Moon', mono: true, contrast: .1, exposure: .05, fade: .1 },
  inkwell:  { cat: 'insta', name: 'Inkwell', mono: true, contrast: .15 },
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
  ['Archivo Black', 'Fett', 400], ['Space Mono', 'Schreibmaschine', 700], ['Special Elite', 'Farbband', 400], ['VT323', 'Digital', 400], ['Press Start 2P', 'Pixel', 400], ['Abril Fatface', 'Vogue', 400], ['Lobster', 'Diner', 400], ['Shadows Into Light', 'Notizzettel', 400], ['Courier Prime', 'Courier', 700]
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
    persp: { v: 0, h: 0 }, masks: [], brush: [], heal: [], clone: [], erase: [],
    tonHi: 0, tonMid: 0, tonLo: 0, drama: 0, grunge: 0, glitch: 0, skin: { amt: 0, glow: 0, d: null },
    blur: { mode: 'off', x: .5, y: .5, size: .22, feather: .25, amt: 55, angle: 0 }
  };
}
/* ältere Parameter-Objekte (Presets, Projekte) auf den aktuellen Stand bringen */
export function upgradeParams(p) {
  const d = defParams();
  for (const k in d) if (p[k] === undefined) p[k] = d[k];
  for (const k of ['grade', 'persp', 'blur', 'stampStyle', 'skin']) p[k] = Object.assign(clone(d[k]), p[k]);
  return p;
}

/* ---------- Zustand ---------- */
export const state = { format: '4:5', slides: 3, bg: { c1: '#efece6', c2: '#a8c5b5', grad: false, dir: 'h', pattern: 'none' }, layers: [] };
export const ui = {
  sel: null, tab: { none: 'canvas', image: 'looks', text: 'text', shape: 'form' }, showOrig: false, sample: true, hslBand: 0, curveCh: 'rgb', clip: null, guides: [],
  confirmClear: false, confirmPresets: false, lookCat: 'fuji', gradeRange: 'sh', tool: null, maskSel: 0, brushMode: 'dodge', brushSize: 6, brushStrength: 50,
  healSize: 3, erSize: 4, cloneSize: 3, cloneMode: 'src', cutMode: 'ai', cutSize: 5, cutSmart: true, cutShow: true, cutView: 'dim', projectId: null, projectName: 'Mein Karussell', panelScroll: 0
};
export const sources = new Map();
export const cache = new Map();
export const ids = { n: 1 };
export const newId = () => ids.n++;
export const dims = () => FORMATS[state.format];
export const selLayer = () => state.layers.find(l => l.id === ui.sel) || null;

let toastT;
/* Meldung, optional mit Aktion (z. B. „Rückgängig“) */
/* Haptisches Feedback: Android per vibrate, iOS (ab 18) über einen versteckten Schalter */
let hapEl = null, hapT = 0;
export function haptic() {
  const now = performance.now(); if (now - hapT < 60) return; hapT = now;
  try { if (navigator.vibrate) { navigator.vibrate(7); return; }
    if (!hapEl) { hapEl = document.createElement('label'); hapEl.setAttribute('aria-hidden', 'true'); hapEl.style.cssText = 'position:fixed;left:-200px;top:0;opacity:0;pointer-events:none';
      const i = document.createElement('input'); i.type = 'checkbox'; i.setAttribute('switch', ''); i.tabIndex = -1; hapEl.append(i); document.body.append(hapEl); }
    hapEl.click(); } catch {}
}
const TI = {
  ok: '<path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z" fill="currentColor"/><path d="m7.5 12.3 3 3 6-6.3" stroke="#000" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  warn: '<path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z" fill="currentColor"/><path d="M12 7v6" stroke="#000" stroke-width="2.4" stroke-linecap="round"/><circle cx="12" cy="16.6" r="1.4" fill="#000"/>',
  info: '<path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z" fill="currentColor"/><path d="M12 11v6" stroke="#000" stroke-width="2.4" stroke-linecap="round"/><circle cx="12" cy="7.6" r="1.4" fill="#000"/>'
};
/* Symbol passend zur Meldung: Hinweis, Warnung oder erledigt */
const toastKind = m => /^tipp|^tippe|^ziehen|^male|–.*(antippen|tippen|wählen)/i.test(m) ? 'info' : /nicht|fehl|leer|zuerst|maximal|kein|zu groß|erlaubt/i.test(m) ? 'warn' : 'ok';
export function toast(msg, actLabel, act) {
  const t = $('#toast'), k = toastKind(msg); t.innerHTML = `<span class="ti ${k}"><svg viewBox="0 0 24 24" aria-hidden="true">${TI[k]}</svg></span>`;
  const sp = document.createElement('span'); sp.textContent = msg; t.append(sp); t.hidden = false; t.classList.remove('in', 'out'); void t.offsetWidth; t.classList.add('in');
  if (actLabel && act) { const b = document.createElement('button'); b.className = 'toast-act'; b.textContent = actLabel; b.onclick = () => { t.hidden = true; act(); }; t.append(b); }
  if (k === 'warn') haptic();
  clearTimeout(toastT); toastT = setTimeout(() => { t.classList.add('out'); toastT = setTimeout(() => { t.hidden = true; t.classList.remove('out'); }, 200); }, actLabel ? 4500 : 2400);
}

export const stampText = (ms, fmt) => {
  const d = new Date(ms), p = n => String(n).padStart(2, '0'), y = p(d.getFullYear() % 100), m = p(d.getMonth() + 1), dd = p(d.getDate());
  if (fmt === 'dmy') return `${dd}.${m}.${y}`;
  if (fmt === 'mdy') return `${m} ${dd} '${y}`;
  if (fmt === 'time') return `${p(d.getHours())}:${p(d.getMinutes())}  ${dd}.${m}.${y}`;
  return `'${y}  ${m}  ${dd}`;
};
