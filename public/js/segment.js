/* Motiv-Erkennung per Antippen – läuft komplett auf dem Gerät (MediaPipe „Magic Touch“, Apache-2.0).
   Modell und Laufzeit liegen in /vendor/mediapipe und werden erst beim ersten Gebrauch geladen; danach offline aus dem Cache. */
let seg = null, loading = null;
const base = new URL('../vendor/mediapipe/', import.meta.url).href;

export const segmenterReady = () => !!seg;
export function loadSegmenter() {
  if (seg) return Promise.resolve(seg);
  if (!loading) loading = (async () => {
    const { FilesetResolver, InteractiveSegmenter } = await import(base + 'vision_bundle.mjs');
    const files = await FilesetResolver.forVisionTasks(base + 'wasm');
    seg = await InteractiveSegmenter.createFromOptions(files, {
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
