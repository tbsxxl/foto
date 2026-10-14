/* Seamly – gemeinsame Oberflächen-Bausteine: Symbole und Gruppen der Foto-Werkzeuge */
export function sv(d) { return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`; }
export const IC = {
  spark: sv('<path d="M12 3c.5 3.5 2.5 5.5 6 6-3.5.5-5.5 2.5-6 6-.5-3.5-2.5-5.5-6-6 3.5-.5 5.5-2.5 6-6z"/><path d="M19 15c.2 1.4 1 2.2 2.4 2.4-1.4.2-2.2 1-2.4 2.4-.2-1.4-1-2.2-2.4-2.4 1.4-.2 2.2-1 2.4-2.4z"/>'),
  search: sv('<circle cx="11" cy="11" r="7"/><path d="m20 20-4.2-4.2"/>'),
  canvas: sv('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M9 5v14M15 5v14"/>'), tpl: sv('<rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="5" rx="1.5"/><rect x="13" y="10" width="8" height="11" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/>'),
  layers: sv('<path d="M12 3 3 8l9 5 9-5z"/><path d="m3 13 9 5 9-5"/>'), photo: sv('<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 8"/>'),
  cam: sv('<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>'), text: sv('<path d="M5 6V4h14v2M12 4v16M9 20h6"/>'), el: sv('<path d="m12 3 2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z"/>'),
  looks: sv('<circle cx="8" cy="9" r="5"/><circle cx="16" cy="9" r="5"/><circle cx="12" cy="15" r="5"/>'), light: sv('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
  color: sv('<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>'), fx: sv('<path d="M5 19 19 5M14 5h5v5M7 4v4M5 6h4M17 16v4M15 18h4"/>'), tools: sv('<path d="M15 4l5 5L9 20H4v-5z"/><path d="m13 6 5 5"/>'),
  paste: sv('<rect x="5" y="4" width="14" height="17" rx="2.5"/><path d="M9 4.5V3.5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1z"/><path d="M9 11h6M9 15h4"/>'),
  eye: sv('<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'), eyeOff: sv('<path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6C3.8 8.4 2 12 2 12s3.6 7 10 7a9.7 9.7 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>'),
  lock: sv('<rect x="5" y="11" width="14" height="10" rx="2.5"/><path d="M8 11V7.5a4 4 0 0 1 8 0V11"/>'), unlock: sv('<rect x="5" y="11" width="14" height="10" rx="2.5"/><path d="M8 11V7.5a4 4 0 0 1 7.7-1.5"/>'),
  up: sv('<path d="m6 15 6-6 6 6"/>'), down: sv('<path d="m6 9 6 6 6-6"/>'), star: sv('<path d="m12 3 2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z"/>'),
  starFill: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="m12 3 2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z"/></svg>',
  shuffle: sv('<path d="M3 7h3.5c2 0 3.3 1 4.5 3l2 4c1.2 2 2.5 3 4.5 3H21M3 17h3.5c1.4 0 2.5-.5 3.4-1.5M14 8.5c.9-1 2-1.5 3.5-1.5H21M18 4l3 3-3 3M18 14l3 3-3 3"/>'),
  more: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5.5" cy="12" r="1.9" fill="currentColor"/><circle cx="12" cy="12" r="1.9" fill="currentColor"/><circle cx="18.5" cy="12" r="1.9" fill="currentColor"/></svg>',
  crop: sv('<path d="M6 2v16h16"/><path d="M2 6h16v16"/>'), frame: sv('<rect x="3" y="3" width="18" height="18" rx="2"/><rect x="7" y="7" width="10" height="10" rx="1"/>'), style: sv('<path d="M4 20h4L19 9l-4-4L4 16z"/>'), shape: sv('<rect x="4" y="4" width="16" height="16" rx="3"/>'), slot: sv('<path d="M12 5v14M5 12h14"/>')
};
export const IMG_GROUPS = [['rahmen', 'Rahmen', 'frame', ['rahmen']], ['looks', 'Looks', 'looks', ['looks']], ['licht', 'Licht', 'light', ['anpassen', 'licht', 'kurve']], ['farbe', 'Farbe', 'color', ['farbe', 'grading']],
  ['effekte', 'Effekte', 'fx', ['effekte', 'kreativ', 'details', 'stempel']], ['ki', 'KI', 'spark', ['entfernen', 'freistellen', 'hintergrund', 'gesicht', 'selektiv']], ['retusche', 'Retusche', 'tools', ['pinsel', 'reparieren', 'klonen', 'fokus']], ['zuschnitt', 'Zuschnitt', 'crop', ['zuschnitt']], ['ebene', 'Ebene', 'layers', ['ebene']]];
export const SUB_LABEL = { anpassen: 'Schnell', licht: 'Licht & Histogramm', kurve: 'Kurve', farbe: 'Farbe & HSL', grading: 'Color Grading', effekte: 'Film & Licht', details: 'Details', stempel: 'Datumsstempel',
  kreativ: 'Kreativ', entfernen: 'Entfernen', hintergrund: 'Hintergrund', gesicht: 'Gesicht & Haut', klonen: 'Stempel',
  freistellen: 'Freistellen', selektiv: 'Auswahl', pinsel: 'Pinsel', reparieren: 'Reparieren', fokus: 'Fokus' };
export const groupOf = leaf => IMG_GROUPS.find(g => g[3].includes(leaf)) || IMG_GROUPS[0];
