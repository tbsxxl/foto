/* Ebenen anlegen und platzieren */
import { state, sources, dims, newId, defParams } from './core.js';
import { cropAspect, orientedAspect } from './scene.js';

export function newImageLayer(srcId, x = 0, y = 0, w = 100) {
  const src = sources.get(srcId);
  return { id: newId(), type: 'image', srcId, x, y, w, rot: 0, opacity: 1, blend: 'source-over', rot90: 0, flip: false,
    crop: { ratio: 'orig', zoom: 1, px: .5, py: .5 }, shape: 'rect', radius: 7, border: 0, borderColor: '#ffffff', shadow: false, caption: '',
    params: defParams(), stampMs: src ? src.date : Date.now() };
}
export function newTextLayer(x, y, text = 'Dein Text') {
  return { id: newId(), type: 'text', x, y, text, font: 'Caveat', size: 110, color: '#ffffff', align: 'center', bg: 'none', bgColor: '#111111', rot: 0, opacity: 1, blend: 'source-over',
    shadow: true, spacing: 0, lineH: 1.16, stroke: 0, strokeColor: '#111111', upper: false, glow: false };
}
const SHAPE_DEF = { line: [600, 14], arrow: [420, 150], tape: [300, 80], frame: [700, 860], heart: [300, 270], star: [300, 290], sparkle: [220, 220], paper: [600, 420], spiral: [1040, 90], clip: [70, 170], binder: [110, 95], laurel: [220, 200], scribble: [700, 860], corners: [700, 860], scribbleArrow: [260, 140], lace: [180, 1200], starSticker: [120, 115], leaves: [900, 1100], check: [60, 60] };
const SHAPE_FILL = { tape: '#f3e2b3', frame: '#ffffff', paper: '#fbfaf6', clip: '#9aa0a6', binder: '#1c1c1c', laurel: '#ffffff', scribble: '#1d1d1d', corners: '#1d1d1d', scribbleArrow: '#1d1d1d', lace: '#fbfaf6', check: '#3b82f6' };
export function newShapeLayer(kind, x, y) {
  const [w, h] = SHAPE_DEF[kind] || [420, 420];
  return { id: newId(), type: 'shape', kind, x, y, w, h, rot: 0, opacity: 1, blend: 'source-over', fill: SHAPE_FILL[kind] || '#f2c14e',
    outline: false, sw: /^(scribble|corners|scribbleArrow)$/.test(kind) ? 5 : 12, radius: 18, shadow: false };
}
export function coverSlide(l, i) {
  const { W, H } = dims(), a = cropAspect(l);
  l.w = Math.max(W, H * a); l.x = (i + .5) * W; l.y = H / 2; l.rot = 0;
}
export function coverAll(l) { const { W, H } = dims(), T = W * state.slides, a = cropAspect(l); l.w = Math.max(T, H * a); l.x = T / 2; l.y = H / 2; l.rot = 0; }
/* Foto exakt in ein Rechteck einpassen (Zuschnitt passend) */
export function fitRect(l, x0, y0, w, h) { l.crop.ratio = w / h; l.w = w; l.x = x0 + w / 2; l.y = y0 + h / 2; l.rot = 0; }

/* Ausschnitt für ein Panorama-Fenster: das Foto bedeckt die Fläche R, das Fenster S zeigt den passenden Teil */
export function computeBox(l) {
  if (!l.pane || !sources.get(l.srcId)) { if (l.crop) delete l.crop.box; return; }
  const [rx, ry, rw, rh] = l.pane.R, [sx, sy, sw, sh] = l.pane.S, ia = orientedAspect(l), ra = rw / rh;
  if (ia > ra) { const fw = ra / ia; l.crop.box = [(1 - fw) / 2 + (sx - rx) / rw * fw, (sy - ry) / rh, sw / rw * fw, sh / rh]; }
  else { const fh = ia / ra; l.crop.box = [(sx - rx) / rw, (1 - fh) / 2 + (sy - ry) / rh * fh, sw / rw, sh / rh * fh]; }
}
