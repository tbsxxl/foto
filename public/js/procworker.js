/* Hintergrund-Rechner: Fotobearbeitung und „Objekt entfernen“ laufen hier, damit die Oberfläche flüssig bleibt */
import { processImage, auxFromData, preloadAssets } from './process.js';

const auxes = new Map(); // Hilfspuffer je Foto (wenige, um Arbeitsspeicher zu sparen)
const post = (m, t) => self.postMessage(m, t || []);

self.onmessage = async ev => {
  const m = ev.data;
  try {
    if (m.type === 'aux') {
      auxes.delete(m.key); auxes.set(m.key, auxFromData(m.w, m.h, new Uint8ClampedArray(m.buf)));
      while (auxes.size > 2) auxes.delete(auxes.keys().next().value);
    } else if (m.type === 'proc') {
      const aux = auxes.get(m.key); if (!aux) { post({ type: 'need', id: m.id }); return; }
      auxes.delete(m.key); auxes.set(m.key, aux); // zuletzt benutzt
      await preloadAssets(m.params);
      const c = processImage(aux, m.params, m.stampMs, { noStamp: true }), bmp = c.transferToImageBitmap();
      post({ type: 'done', id: m.id, bmp }, [bmp]);
    } else if (m.type === 'inpaint') {
      const A = await import('./ai.js');
      const r = await A.inpaint(m.src, m.hole, (f, ph) => post({ type: 'progress', id: m.id, f, ph }));
      if (!r) { post({ type: 'done', id: m.id, r: null }); return; }
      const blob = await r.canvas.convertToBlob({ type: 'image/png' });
      post({ type: 'done', id: m.id, r: { x: r.x, y: r.y, w: r.w, h: r.h, blob } });
    } else if (m.type === 'drop') auxes.clear();
  } catch (err) { post({ type: 'error', id: m.id, msg: String(err && err.message || err) }); }
};
