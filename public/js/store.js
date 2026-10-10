/* Projekte lokal im Browser speichern (IndexedDB) – Fotos verlassen das Gerät nicht */
let dbp = null;
const req = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
function db() {
  if (!dbp) dbp = new Promise((res, rej) => {
    const r = indexedDB.open('streifzug', 1);
    r.onupgradeneeded = () => { const d = r.result; d.createObjectStore('projects', { keyPath: 'id' }); d.createObjectStore('files', { keyPath: 'key' }); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  return dbp;
}
const done = t => new Promise((res, rej) => { t.oncomplete = () => res(); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); });
const range = id => IDBKeyRange.bound(id + ':', id + ':￿');

export async function listProjects() {
  const d = await db(), all = await req(d.transaction('projects').objectStore('projects').getAll());
  return all.map(p => ({ id: p.id, name: p.name, updated: p.updated, thumb: p.thumb, slides: p.doc?.slides, format: p.doc?.format })).sort((a, b) => b.updated - a.updated);
}
/* files: [{ srcId, blob, date }] – bereits gespeicherte werden übersprungen */
export async function saveProject(p, files) {
  const d = await db(), t = d.transaction(['projects', 'files'], 'readwrite'), fs = t.objectStore('files');
  t.objectStore('projects').put(p);
  for (const f of files) fs.put({ key: p.id + ':' + f.srcId, blob: f.blob, date: f.date });
  await done(t);
}
export async function pruneFiles(id, keepSrcIds) {
  const d = await db(), t = d.transaction('files', 'readwrite'), fs = t.objectStore('files'), keys = await req(fs.getAllKeys(range(id)));
  for (const k of keys) if (!keepSrcIds.has(k.slice(id.length + 1))) fs.delete(k);
  await done(t);
}
export async function loadProject(id) {
  const d = await db(), t = d.transaction(['projects', 'files']);
  const [p, files] = await Promise.all([req(t.objectStore('projects').get(id)), req(t.objectStore('files').getAll(range(id)))]);
  if (!p) return null;
  return { project: p, files: files.map(f => ({ srcId: f.key.slice(id.length + 1), blob: f.blob, date: f.date })) };
}
export async function deleteProject(id) {
  const d = await db(), t = d.transaction(['projects', 'files'], 'readwrite');
  t.objectStore('projects').delete(id); t.objectStore('files').delete(range(id));
  await done(t);
}
export async function renameProject(id, name) {
  const d = await db(), t = d.transaction('projects', 'readwrite'), s = t.objectStore('projects'), p = await req(s.get(id));
  if (p) { p.name = name; s.put(p); } await done(t);
}
export async function duplicateProject(id, newId) {
  const r = await loadProject(id); if (!r) return;
  const p = { ...r.project, id: newId, name: r.project.name + ' (Kopie)', updated: Date.now() };
  await saveProject(p, r.files);
}
export const newProjectId = () => 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
export function lastProject(set) { try { if (set !== undefined) localStorage.setItem('streifzug.last', set || ''); return localStorage.getItem('streifzug.last') || null; } catch { return null; } }
export function persist() { try { navigator.storage?.persist?.(); } catch {} }
