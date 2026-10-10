# Streifzug

Foto-Web-App fürs iPhone (und jeden Browser), die vier Apps in einer vereint – ohne App Store, ohne Konto, ohne Upload. Alles läuft lokal im Browser.

| Vorbild | In Streifzug |
|---|---|
| **SCRL** | Fotos laufen nahtlos über bis zu 20 Slides · 66 Vorlagen mit 180 Varianten in 9 Kategorien (Panorama-Fenster, Risskanten, Briefmarken, Notizbuch, Kritzel-Rahmen, Filmplakat, Schräge Collage, Raster mit Worten …) · Kanten: zerrissen, Büttenrand, Briefmarke · Deko: Spiralbindung, Büroklammer, Lorbeer, Kritzeleien · Text als Perlen-Buchstaben, Zeitungsausschnitte oder 📍-Orts-Pille · Sticker (freigestelltes Motiv mit weißem Rand) · Glitzersterne, Herbstblätter, Spitzenrand · Papierstrukturen: Knitterpapier, Kraftpapier, Pappe, Leinen · leere Felder zum Antippen, Abstand/Ecken/Schatten einstellbar, Fotos mischen · Vorlagen-Suche, Favoriten und „Zuletzt“ · „Stil anpassen“ für jede Vorlage: Fotos neigen, Rahmen und Rahmenfarbe, Schrift und Textfarbe der Vorlagen-Texte, Kritzeleien keine/ein paar/viele samt Farbe – bleibt beim Vorlagenwechsel erhalten · eigener Hintergrund bleibt beim Neu-Anordnen erhalten · Folgeseiten wechseln automatisch ihr Layout – über 20 Seitenmuster, Wiederholung frühestens nach 10 Slides (Abwechslungsreich/Einheitlich, Seiten neu würfeln) · Klebeband (Malerkrepp, Tesafilm, Washi mit Mustern), Büroklammern und Foldback-Klammern pixelgenau mit Licht und Material berechnet · Klebeband-Art, Washi-Muster und „Neu abreißen“, Büroklammern und Klammern in vielen Farben · Bogentext · Orts-Pille mit frei wählbarer Pillen- und Stecknadelfarbe · Ausrichten auf der Slide (links, mittig, rechts, oben, unten) · zuletzt benutzte Elemente und eigene Farben · 24 handgezeichnete Kritzeleien (Herzen, Sterne, Pfeile, Wolke, Blume, Krone, Papierflieger, Textmarker …) und die Vorlagen Kritzel-Tagebuch und Gekritzelt aufs Foto · Formen, Sticker, Emoji · 12 Schriften, Text-Stile mit Kontur, Neon, Zeilenband · Hintergrund-Verläufe und Muster · Ebenenliste mit Sperren/Ausblenden · Mischmodi (Doppelbelichtung) · Slides einfügen, löschen, verschieben · Instagram-Vorschau |
| **Snapseed** | Feinabstimmung, Auto-Korrektur, Freistellen (Motiv vor Text legen, mit Kantenerkennung), Details (Struktur, Schärfen), Zuschnitt mit Gesten, Begradigen, Perspektive · Selektiv (Kontrollpunkte) · Pinsel (Abwedeln, Nachbelichten, Sättigung, Wärme) · Reparieren · Objektivunschärfe (Tilt-Shift / rund) · Glamour Glow, HDR, Drama, Noir |
| **Lightroom** | Belichtung, Lichter, Tiefen, Weiß, Schwarz mit Histogramm · Temperatur/Tönung mit Pipette · Farbmischer (HSL) · Color Grading · Gradationskurven (RGB + Kanäle) · Klarheit, Textur, Dunst entfernen, Rauschreduzierung · Radial- und Verlaufsmasken · eigene Presets inkl. Export/Import · Bearbeitung kopieren/einfügen/auf alle |
| **Fuji, Kodak & Insta** | Fuji-Filmsimulationen (Provia, Velvia, Astia, Classic Chrome, Classic Neg, Nostalgic Neg, Eterna, Bleach Bypass, Pro Neg, Reala Ace, Acros mit R/Ye/G-Filter), Kodak & Co. (Portra, Ektar, Ultramax, ColorPlus, Kodachrome, Ektachrome, T-Max, Lomo Purple, Polaroid 600) und klassische Insta-Filter (Clarendon, Juno, Lark, Gingham, Valencia, Nashville, X-Pro II, 1977, Hefe, Earlybird, Moon, Inkwell) – alle nachempfunden |
| **WayShot** | 29 Looks (Digicam, CCD, Wegwerfkamera, Camcorder, Kunstlicht 800, Abgelaufen, Lomo, Sepia …) · Datumsstempel mit Datum, Format, Farbe, Position · Lichteinfall, Staub & Kratzer, Halation, Low-Res, Farbsäume · Rahmen: Sofortbild, Instax, Kleinbild, Dia |

Außerdem: Projekte werden automatisch im Browser gespeichert (IndexedDB), die App lässt sich über „Teilen → Zum Home-Bildschirm“ wie eine echte App installieren und funktioniert danach auch offline. Export als JPEG oder PNG (1080 px breit), optional zusätzlich als Panorama; auf dem iPhone landen alle Slides mit einem Tipp in den Fotos.

## Bedienung in Kürze

- Unten wählst du die Werkzeug-Gruppe, darüber die Unterreiter (z. B. Licht → Schnell / Licht & Histogramm / Kurve).
- Das Werkzeugfeld lässt sich am Griff größer und kleiner ziehen.
- Über der Leinwand: Slide-Navigation (Antippen springt zur Slide) und Schnellaktionen fürs gewählte Element.
- Veränderte Regler zeigen ein ↺ zum Zurücksetzen; Text doppelt antippen zum Bearbeiten.

## Aufbau

Kein Build-Schritt – reine ES-Module in `public/`:

- `js/core.js` – Zustand, Konstanten, Looks, Schriften
- `js/process.js` – Bildverarbeitung (Tonwerte, lokaler Kontrast, Masken, Pinsel, Reparatur, Perspektive, Effekte)
- `js/scene.js` – Zeichnen der Leinwand: Fotos, Rahmen, Text, Formen, Hintergrund
- `js/templates.js` – Vorlagen
- `js/props.js` – Klebeband, Klammern und Kritzeleien
- `js/store.js` – Projekte speichern
- `js/main.js` – Oberfläche, Gesten, Werkzeuge, Export
- `sw.js`, `manifest.webmanifest`, `icons/` – Home-Bildschirm & offline

## Lokal ansehen

```sh
npx serve public
```

## Hosting auf Cloudflare

**Variante A – Workers (empfohlen):** Im Cloudflare-Dashboard *Workers & Pages → Create → Import a repository* → dieses Repo wählen. Build-Befehl leer lassen, Deploy-Befehl `npx wrangler deploy`. Die Einstellungen kommen aus `wrangler.jsonc`.

**Variante B – Pages:** *Workers & Pages → Create → Pages → Connect to Git* → Repo wählen, Framework „None“, Build-Befehl leer, Ausgabeverzeichnis `public`.

Jeder Push auf `main` wird danach automatisch veröffentlicht.
