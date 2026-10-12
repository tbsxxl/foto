# UI-Leitfaden Streifzug – zum Übernehmen in andere Apps

So ist die Oberfläche von Streifzug aufgebaut, mit Maßen, Farben und Gesten, damit du sie in einer anderen App nachbauen kannst. Dazu gehören:

- **`docs/ui-kit.css`**: alle Bausteine als CSS zum Kopieren, Klassen mit `k-` davor
- **`docs/ui-kit-demo.html`**: Demo-Seite mit allen Bausteinen und den wichtigsten Gesten, im Browser öffnen

Stil: **iOS-Dunkelmodus mit „Liquid Glass“**. Feste Leisten gibt es nicht mehr, stattdessen schweben Glas-Kapseln über dem Inhalt, Ecken sind groß und rund, Bewegungen federn.

---

## 1. Grundregeln

1. **Eine Akzentfarbe, sparsam.** Gelb (`#ffd60a`) bekommen nur: der aktive Tab, die Hauptaktion („Teilen“), geänderte Reglerwerte und Hinweise. Alles andere ist Weiß oder Grau.
2. **Der Inhalt ist der Star.** Die Bedienung ist dunkel und zurückhaltend. Apple macht das bei allen Foto-Editoren so, weil man Farben auf Dunkel besser beurteilt.
3. **Alles Schwebende ist Glas.** Kopfzeile, Tab-Leiste, Menüs, Meldungen und Seitenzähler nutzen dasselbe Glas-Rezept (siehe 3.4).
4. **Nichts dauerhaft erklären.** Hinweise erscheinen kurz und nur die ersten paar Male. Tipps erscheinen einmal pro Werkzeug, mit „OK“ zum Wegtippen.
5. **Jede Aktion ist umkehrbar.** Nach Löschen, Tauschen oder Anwenden kommt eine Meldung mit „Rückgängig“. Dazu gibt es einen Verlauf zum Zurückspringen.
6. **Tippflächen mindestens 44 Punkt groß**, auch wenn ein Knopf optisch kleiner wirkt.
7. **Bewegung mit Feder**, nicht linear (siehe 3.5). Bei „Bewegung reduzieren“ in den iOS-Einstellungen wird alles abgeschaltet.

---

## 2. Bildschirmaufbau (Handy, Hochformat)

```
┌────────────────────────────────────┐
│ Statusleiste (Safe Area oben)      │
│ Marke     ( 📁 ↶ ↷ ▶ )  [ Teilen ] │ ← keine Leiste: Marke links, Glas-Kapsel mit Symbolen, gelbe Hauptaktion
│                                    │
│        ARBEITSFLÄCHE / BÜHNE       │ ← der eigentliche Inhalt, dunkel (#0c0c0e)
│      ( Hinweis-Pille, kurz )       │
│         ( 1  2  3  ⛶ )             │ ← Seitenzähler als Glas-Kapsel
│ ╭────────────────────────────────╮ │
│ │            ───                 │ │ ← Griff: Karte hoch- und runterziehen
│ │ Titel groß          (🔍)(📋)   │ │ ← Titelzeile, ebenfalls zum Ziehen
│ │ [Segment | Segment | Segment]  │ │ ← Unterbereiche als Kapsel-Segmente
│ │ ╭ GRUPPE ───────────────────╮  │ │
│ │ │ Regler, Schalter, Chips   │  │ │ ← Inhalt scrollt UNTER der Tab-Kapsel durch
│ │ ╰───────────────────────────╯  │ │
│ │ ( 🖼  ✨  ☀︎  💧  ⭐ )          │ │ ← Tab-Leiste: schwebende Glas-Kapsel
│ ╰────────────────────────────────╯ │
│        Home-Balken (Safe Area)     │
└────────────────────────────────────┘
```

- **Werkzeug-Karte („Sheet“):** rastet bei **30 %, 46 % und 70 %** der Bildschirmhöhe ein, gezogen zwischen 22 % und 82 %. Jenseits der Grenzen gibt sie wie ein Gummiband nach (Faktor 0,25). Beim Loslassen zählt der Schwung: Die Geschwindigkeit wird mit 0,18 Sekunden hochgerechnet, dann rastet die Karte an der nächsten Höhe ein, mit Feder-Animation und Haptik.
- **Tabs wechseln je nach Auswahl:**
  - Nichts ausgewählt: Leinwand · Vorlagen · Ebenen · Foto · Text · Element
  - Foto ausgewählt: Rahmen · Looks · Licht · Farbe · Effekte · KI · Retusche · Zuschnitt · Ebene
  - Text oder Form ausgewählt: jeweils eigene, kurze Tab-Sätze

  Mehr als 6 Tabs scrollen in der Kapsel waagerecht.
- **Unterbereiche:** Haben Tabs mehrere Unterbereiche (zum Beispiel „Licht“ mit Schnell, Licht & Histogramm, Kurve), stehen diese als Kapsel-Segment oben im Panel und bleiben beim Scrollen stehen.
- **Großer Bildschirm (ab 900 px):** Die Karte steht rechts als 380 px breite Spalte.

---

## 3. Design-Tokens

### 3.1 Farben (iOS-Systemfarben, dunkel)

| Rolle | Wert |
|---|---|
| App-Hintergrund | `#000` |
| Arbeitsfläche | `#0c0c0e` |
| Karte / Sheet | `#1c1c1e` (mit 7 % Weiß-Verlauf oben) |
| Gruppe in Karte | `rgba(255,255,255,.055)` |
| Knopf / Chip | `rgba(255,255,255,.10)` + 0,5-px-Lichtkante oben |
| Text | `#fff`, sekundär `rgba(235,235,245,.6)` |
| Akzent | `#ffd60a`, Schrift darauf `#1d1800` |
| Erfolg / Schalter an | `#30d158` |
| Warnung | `#ff9f0a` |
| Löschen | `#ff453a` |

### 3.2 Schrift

- **Systemschrift** `-apple-system` (SF Pro). Grundgröße 15 px, Zeichenabstand −0,01 em.
- **Titel:** SF Pro Display, 22 px, fett (700), −0,03 em.
- **Marke:** `ui-rounded` (SF Pro Rounded), 20 px, fett.
- **Zahlen in Reglern:** `font-variant-numeric: tabular-nums`, damit sie beim Ziehen nicht springen.
- **Kleine Überschriften in Gruppen:** 12 px, Großbuchstaben, sekundäre Farbe.

### 3.3 Radien (konzentrisch: innen = außen minus Abstand)

Karte 30 · Sheet 34 · Gruppe 22 · Kontextmenü 26 · Eingabefeld 14 · Menüeintrag 14 · alles Kleine als Kapsel (999).

### 3.4 Glas-Rezept

```css
background: linear-gradient(180deg, rgba(255,255,255,.16), rgba(255,255,255,.03) 45%, transparent 60%, rgba(255,255,255,.05)),
            rgba(58,58,62,.42);
backdrop-filter: blur(22px) saturate(190%) brightness(1.08);
box-shadow: inset 0 .5px 0 rgba(255,255,255,.38),   /* Lichtkante oben */
            inset 0 -.5px 0 rgba(255,255,255,.1),   /* zarte Kante unten */
            inset 0 0 0 .5px rgba(255,255,255,.12), /* Umriss */
            0 12px 32px -10px rgba(0,0,0,.6);       /* Schweben */
```

Für Meldungen und Menüs ist das Glas dichter (`rgba(44,44,48,.72)` bzw. 30 px Unschärfe).

### 3.5 Bewegung

- **Feder:** `linear(0,.009,.035 2.1%,.141 4.4%,.723 12.9%,.938 16.7%,1.017 19.8%,1.043 22.4%,1.044 25.8%,1.013 33.3%,.998 40.2%,1)`. Rückfall für alte Browser: `cubic-bezier(.2,.9,.25,1.12)`.
- **Dauern:**

  | Element | Dauer |
  |---|---|
  | Panelwechsel | 0,38 s, von 10 px unten einblenden |
  | Kontextmenü | 0,42 s, wächst aus dem Fingerpunkt (scale 0,35 → 1) |
  | Meldung | 0,45 s, fällt von oben |
  | Sheet | 0,5 s, von unten |
  | Schalter-Knopf | 0,32 s |

- **Drücken:** Knöpfe `scale(.95)` mit `opacity .75`, Tabs `scale(.92)`, Farbfelder `scale(.86)`.

---

## 4. Bausteine (Klassen in `ui-kit.css`)

| Baustein | Maße / Verhalten |
|---|---|
| **Symbolknopf** `.k-icon` | 40 × 40, rund; in der Kopfzeile zu mehreren in einer Glas-Kapsel `.k-capsule.glass` |
| **Hauptaktion** `.k-btn.primary.hero` | 44 px hoch, Kapsel, Akzentfarbe mit Glanzverlauf und gelbem Schein |
| **Knopf** `.k-btn` | 36 px hoch, Kapsel, gläserne Füllung |
| **Chip** `.k-chip` | 36 px, Kapsel; gewählt = weiß mit schwarzer Schrift und kurzem „Pop“ |
| **Segment** `.k-seg` | Kapsel-Spur, gewählter Teil als gläserne Pille |
| **Regler** `.k-slider` | Spur 6 px; Griff ist eine weiße Kapsel 38 × 24. Beim Ziehen wird er 35 % größer und durchsichtig wie eine Linse. Die Füllung läuft **vom Standardwert aus** (bei ±-Reglern von der Mitte). Geänderter Wert ist gelb, Doppeltipp auf den Namen setzt zurück. In der Nähe des Standardwerts rastet er magnetisch ein (1,2 % der Spanne), mit Haptik. |
| **Schalter** `.k-switch` | Spur 62 × 28; Knopf ist eine Kapsel 38 × 24, wächst beim Drücken; an = grün |
| **Gruppe** `.k-group` | Radius 22, Abstand 14/16; Überschrift `.k-label` |
| **Tab-Leiste** `.k-tabs` | schwebende Glas-Kapsel, Tabs mindestens 56 × 54; aktiv = gelbes Symbol und Text auf heller Glas-Pille, inaktiv = Weiß 88 %, nie farbig |
| **Meldung** `.k-toast` | Pille oben unter der Kopfzeile, mit Symbol: ✓ grün = erledigt, ! orange = Problem, i gelb = Hinweis. 2,4 s sichtbar, mit Aktion („Rückgängig“) 4,5 s. Bei Warnungen kommt zusätzlich Haptik. |
| **Kontextmenü** `.k-menu` | 250 px breit, Einträge 46 px, Symbol rechts, gefährliche Aktion rot ganz unten, Gruppen durch Trennlinien |
| **Sheet** `.k-sheet` | 6 px vom Rand eingerückt, oben Radius 34, dahinter abgedunkelt; „Schließen“ als Kapselknopf rechts |
| **Hinweis-Pille** `.k-hint` | Glas, unten auf der Arbeitsfläche, blendet nach 3,2 s aus |
| **Tipp-Karte** `.k-tip` | gelblich getönt, einmalig pro Werkzeug, „OK“ blendet aus |

---

## 5. Gesten und Verhalten

| Geste | Wirkung |
|---|---|
| Antippen | auswählen; leere Fläche antippen hebt die Auswahl auf |
| Doppeltippen (Foto) | Ausschnitt im Rahmen verschieben und zoomen; nochmal doppeltippen = fertig |
| Ziehen | verschieben, rastet an Mitte, Rändern und anderen Elementen ein (mit Haptik) |
| Eck-Griff ziehen | Größe und Drehung, rastet bei 0°/90° ein (Haptik); oben erscheint eine Pille mit Grad und % |
| Seiten-Griff ziehen | Breite oder Höhe ändern (bei Text: stauchen und strecken) |
| **Lange drücken** (480 ms, Finger bewegt sich höchstens 9 px) | Kontextmenü am Finger. **Finger liegen lassen und auf einen Eintrag ziehen**, beim Loslassen wird er ausgeführt, wie in iOS. Auf leerer Fläche: Einfügen, Text, Fotos, Vorlage. |
| **Über ein anderes Foto ziehen und still halten** (520 ms, Finger bewegt sich höchstens 14 px) | rastet spürbar ein, das Ziel wird umrandet; „Loslassen zum Tauschen“. Ohne Halten wird nur verschoben. |
| Zwei Finger tippen / drei Finger tippen | Rückgängig / Wiederholen |
| Rückgängig-Knopf lange drücken | Verlauf mit allen Schritten zum Zurückspringen |
| Karte am Griff oder an der Titelzeile ziehen | Höhe ändern, rastet federnd ein |
| Lupe | Werkzeugsuche: Suchwörter wie „Himmel“, „Haut“ oder „Körnung“ führen direkt ins richtige Werkzeug |

**Haptik nur an Momenten mit Bedeutung:** Einrasten (Hilfslinie, 0°, Sheet-Höhe, Tauschen, Regler am Standardwert), Wechsel der Slide beim Wischen, Menü öffnen, Warnungen. Nicht bei jedem Tippen.

---

## 6. Texte und Tonfall

- **Duzen, kurz, ohne Fachjargon:** „Tippe aufs Motiv“ statt „Klicken Sie auf das Objekt, um die Segmentierung zu starten“.
- **Meldungen sagen, was passiert ist, und bieten den nächsten Schritt an:** „Fotos getauscht · Rückgängig“.
- **Fehler erklären die Lösung:** „Einfügen wurde nicht erlaubt – nochmal tippen und ‚Einsetzen‘ wählen“.
- **Leere Zustände zeigen einen klaren ersten Schritt:** „Fotos wählen“ als großer Knopf statt leerer Fläche.

---

## 7. iOS-Fallen (Web-App vom Home-Bildschirm)

1. **Safe Areas:** `viewport-fit=cover` setzen, oben `env(safe-area-inset-top)` einrechnen, unten den Home-Balken. Die Tab-Kapsel darf etwa 14 px in den unteren Bereich ragen.
2. **iOS-Fehler „Fenster zu kurz“:** Als Home-Bildschirm-App mit `black-translucent` meldet iOS die Fensterhöhe teils um die Statusleisten-Höhe zu kurz. Darunter zeichnet iOS nichts.
   - **Erkennen:** `screen.height − innerHeight > 30` im Standalone-Modus.
   - **Umgehen:** nicht strecken, sondern den unteren Abstand weglassen und den Seitenhintergrund (`html`) in der Farbe der Arbeitsfläche halten, dann fällt der tote Streifen nicht auf.
3. **Statusleiste:** Bei `black-translucent` ist die Schrift der Statusleiste immer weiß. Ein heller Modus wäre dort unlesbar, deshalb bleibt die App dunkel.
4. **Zwischenablage:** `navigator.clipboard.read()` nur **direkt im Tipp-Ereignis** aufrufen, nie nach `setTimeout` oder `await`, sonst blockiert Safari. Als Rückfall ein Feld mit `contenteditable` anbieten, in dem man lange drückt und „Einsetzen“ wählt. Das liefert Bilder auch über das `paste`-Ereignis.
5. **Haptik im Web:** `navigator.vibrate` gibt es auf dem iPhone nicht. Ab iOS 18 gibt ein unsichtbares `<input type="checkbox" switch>` per Label-Klick ein Tick-Feedback.
6. **Tippflächen:** `touch-action: manipulation` auf Knöpfen verhindert die Zoom-Verzögerung. Auf der Arbeitsfläche `touch-action: none` und eigene Gesten.
7. **Schwere Arbeit in einen Web Worker** (mit `OffscreenCanvas`), mit Rückfall aufs Hauptfenster. Sonst friert die Oberfläche ein.

---

## 8. Checkliste zum Übernehmen

- [ ] `ui-kit.css` einbinden, Akzentfarbe in `--accent` anpassen
- [ ] Kopfzeile: Marke links, Symbole in einer Glas-Kapsel, genau eine gelbe Hauptaktion
- [ ] Inhalt oben, Werkzeug-Karte unten mit Griff, drei Rasthöhen und schwebender Tab-Kapsel
- [ ] Tabs je nach Auswahl wechseln, Unterbereiche als Segment
- [ ] Regler mit Füllung ab Standardwert, Magnet und Doppeltipp zum Zurücksetzen
- [ ] Meldungen oben mit Symbol und „Rückgängig“
- [ ] Langes Drücken → Kontextmenü mit Ziehen-zum-Auswählen
- [ ] Haptik an Einrast-Momenten
- [ ] Hinweise kurz und begrenzt, Tipps einmalig
- [ ] Safe Areas und iOS-Fallen aus Abschnitt 7 beachten
- [ ] „Bewegung reduzieren“ respektieren
