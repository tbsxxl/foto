/* Verbindung zum Hintergrund-Rechner (Web Worker). Fällt bei Problemen still auf die Berechnung im Hauptfenster zurück. */
import { logErr } from './core.js';

let W = null, seq = 0;
let ok = typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined' && typeof createImageBitmap !== 'undefined' && !/[?&]noworker/.test(location.search);
const jobs = new Map();
export const poolOK = () => ok;
export function disablePool(why) {
  if (ok) logErr('Hintergrund-Rechner aus', why); ok = false;
  if (W) { W.terminate(); W = null; } for (const j of jobs.values()) j.reject(new Error(why)); jobs.clear();
}
function worker() {
  if (!W && ok) {
    try { W = new Worker(new URL('./procworker.js', import.meta.url), { type: 'module' }); W.onmessage = onMsg; W.onerror = e => { e.preventDefault && e.preventDefault(); disablePool('Worker-Fehler ' + (e.message || '')); }; }
    catch (e) { disablePool(String(e)); }
  }
  return W;
}
function onMsg(ev) {
  const m = ev.data, j = jobs.get(m.id); if (!j) return;
  if (m.type === 'progress') { j.onProgress && j.onProgress(m.f, m.ph); return; }
  jobs.delete(m.id); clearTimeout(j.t);
  if (m.type === 'error') j.reject(new Error(m.msg)); else j.resolve(m);
}
/* Auftrag mit Antwort; timeout in ms (0 = keiner) */
export function call(msg, transfer, onProgress, timeout = 0) {
  const w = worker(); if (!w) return Promise.reject(new Error('kein Hintergrund-Rechner'));
  const id = ++seq;
  return new Promise((resolve, reject) => {
    const j = { resolve, reject, onProgress }; jobs.set(id, j);
    if (timeout) j.t = setTimeout(() => { jobs.delete(id); reject(new Error('Zeitüberschreitung')); }, timeout);
    w.postMessage({ ...msg, id }, transfer || []);
  });
}
export function send(msg, transfer) { const w = worker(); if (w) w.postMessage(msg, transfer || []); }
