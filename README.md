# Streifzug

Web-App für nahtlose Instagram-Karussells: Fotos über mehrere Slides legen, bearbeiten (Looks, Licht, Farbe, Kurven, Effekte), Text hinzufügen und als einzelne JPEGs (1080 px breit) exportieren. Alles läuft im Browser – keine Fotos verlassen das Gerät.

Die komplette App steckt in `public/index.html`, ohne Build-Schritt.

## Lokal ansehen

```sh
npx serve public
```

## Hosting auf Cloudflare

**Variante A – Workers (empfohlen):** Im Cloudflare-Dashboard *Workers & Pages → Create → Import a repository* → dieses Repo wählen. Build-Befehl leer lassen, Deploy-Befehl `npx wrangler deploy`. Die Einstellungen kommen aus `wrangler.jsonc`.

**Variante B – Pages:** *Workers & Pages → Create → Pages → Connect to Git* → Repo wählen, Framework „None“, Build-Befehl leer, Ausgabeverzeichnis `public`.

Jeder Push auf `main` wird danach automatisch veröffentlicht.

Manuell von der Kommandozeile: `npx wrangler deploy`.
