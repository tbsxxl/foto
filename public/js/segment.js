/* Motiv-Erkennung per Antippen und Personen/Haut-Erkennung – läuft komplett auf dem Gerät (MediaPipe, Apache-2.0).
   Modelle und Laufzeit liegen in /vendor/mediapipe und werden erst beim ersten Gebrauch geladen; danach offline aus dem Cache. */
let seg = null, loading = null, mc = null, mcLoading = null, filesP = null;
const base = new URL('../vendor/mediapipe/', import.meta.url).href;
let vision = null;
async function fileset() {
  if (!filesP) filesP = (async () => { vision = await import(base + 'vision_bundle.mjs'); return vision.FilesetResolver.forVisionTasks(base + 'wasm'); })().catch(e => { filesP = null; throw e; });
  return filesP;
}
export const segmenterReady = () => !!seg;
export function loadSegmenter() {
  if (seg) return Promise.resolve(seg);
  if (!loading) loading = (async () => {
    const files = await fileset();
    seg = await vision.InteractiveSegmenter.createFromOptions(files, {
      baseOptions: { modelAssetPath: base + 'magic_touch.tflite', delegate: 'CPU' },
      outputCategoryMask: false, outputConfidenceMasks: true
    });
    return seg;
  })().catch(e => { loading = null; throw e; });
  return loading;
}
/* Liefert eine Maske (0..1) für das Objekt unter dem Punkt (u, v in 0..1) */
export async function segmentAt(img, u, v) {
  const s = await loadSegmenter();
  const r = s.segment(img, { keypoint: { x: u, y: v } });
  try {
    const m = r.confidenceMasks[0], w = m.width, h = m.height, data = Float32Array.from(m.getAsFloat32Array());
    return { w, h, data };
  } finally { r.close && r.close(); }
}
/* Personen: 0 Hintergrund, 1 Haare, 2 Körper-Haut, 3 Gesichts-Haut, 4 Kleidung, 5 Sonstiges */
function loadMulticlass() {
  if (mc) return Promise.resolve(mc);
  if (!mcLoading) mcLoading = (async () => {
    const files = await fileset();
    mc = await vision.ImageSegmenter.createFromOptions(files, {
      baseOptions: { modelAssetPath: base + 'selfie_multiclass.tflite', delegate: 'CPU' },
      runningMode: 'IMAGE', outputCategoryMask: false, outputConfidenceMasks: true
    });
    return mc;
  })().catch(e => { mcLoading = null; throw e; });
  return mcLoading;
}
export async function segmentPeople(img) {
  const s = await loadMulticlass(), r = s.segment(img);
  try {
    const M = r.confidenceMasks, w = M[0].width, h = M[0].height, n = w * h, get = i => M[i].getAsFloat32Array();
    const bg = get(0), b = get(2), f = get(3), person = new Float32Array(n), skin = new Float32Array(n), face = new Float32Array(n);
    for (let i = 0; i < n; i++) { person[i] = 1 - bg[i]; skin[i] = Math.min(1, b[i] + f[i]); face[i] = f[i]; }
    return { w, h, person, skin, face };
  } finally { r.close && r.close(); }
}
