# ZK-Drive

**Deine eigene, Ende-zu-Ende-verschlüsselte Cloud – kostenlos auf Cloudflare, in einem Klick deployt.**

ZK steht für **Zero-Knowledge**: Der Server speichert deine Dateien, weiß aber nichts über sie. Alles wird im Browser verschlüsselt, bevor es hochgeladen wird. Weder Cloudflare noch der Betreiber noch jemand mit Zugriff auf die Datenbank kann Dateiinhalte, Dateinamen oder Ordnernamen lesen.

- Oberfläche wie Google Drive: Ordner, Suche, Drag & Drop, Rechtsklick-Menü, Listen- und Kachelansicht
- Kein Framework, kein Build-Step, keine Abhängigkeiten – reines HTML, CSS und JavaScript, unter 100 KB Quellcode
- Läuft komplett im kostenlosen Cloudflare-Tarif, ohne Kreditkarte

---

## Inhalt

- [Features](#features)
- [Installation in 5 Minuten](#installation-in-5-minuten)
- [Bedienung](#bedienung)
- [Sicherheit & Verschlüsselung](#sicherheit--verschlüsselung)
- [Limits](#limits)
- [Projektstruktur](#projektstruktur)
- [Addons schreiben](#addons-schreiben)
- [Manuelles Deployment](#manuelles-deployment)
- [Fehlerbehebung](#fehlerbehebung)

---

## Features

| Bereich | Was es kann |
|---|---|
| **Dateien** | Upload per Button oder Drag & Drop, Ordner, Umbenennen, Verschieben, Papierkorb mit Wiederherstellen |
| **Große Dateien** | Werden im Browser in 24-MB-Stücke geteilt, einzeln verschlüsselt und parallel hochgeladen |
| **Vorschau** | Bilder, PDFs, Text/Code, Audio und Video – entschlüsselt nur im Arbeitsspeicher |
| **ZIP-Download** | Mehrere Dateien oder ganze Ordner als ZIP, im Browser zusammengebaut |
| **Notizen** | Verschlüsselte `.md`/`.txt`-Notizen direkt im Drive erstellen und bearbeiten |
| **Teilen** | Link für eine einzelne Datei, mit Ablaufzeit (1 Std / 24 Std / 7 Tage / unbegrenzt) und **Burn after reading** |
| **Konto** | Login, Passwort ändern, Passwort-Reset per E-Mail-Code + Wiederherstellungscode |
| **Themes** | Light, Dark und **Nightmare** (Neon-Lila/Blau) – sofort umschaltbar |
| **Erweiterbar** | Addon-System mit Hooks für Kontextmenü, Vorschau, Toolbar und Upload |

**Tastenkürzel:** `Strg+K` Suche · `Entf` in den Papierkorb · `F2` umbenennen · `Leertaste` Schnellvorschau · `Esc` schließen

---

## Installation in 5 Minuten

Du brauchst nur ein kostenloses Cloudflare-Konto und Windows. Ein Worker muss vorher **nicht** angelegt werden, das erledigt das Skript.

### 1. Cloudflare-Konto
Auf [dash.cloudflare.com](https://dash.cloudflare.com) registrieren und die E-Mail bestätigen.

### 2. workers.dev-Subdomain festlegen
Links auf **Workers & Pages** klicken. Rechts steht **„Your subdomain“**. Falls noch keine vergeben ist, einen Namen wählen (z. B. `meinname`). Deine Cloud ist später unter `https://cloud.meinname.workers.dev` erreichbar.

### 3. Node.js installieren
Die **LTS**-Version von [nodejs.org](https://nodejs.org) installieren (Standardeinstellungen reichen).

### 4. Projekt herunterladen
Repository als ZIP herunterladen (**Code → Download ZIP**) und entpacken – oder klonen:

```bash
git clone https://github.com/<dein-name>/zk-drive.git
```

### 5. `deploy.bat` doppelklicken
Das Skript erledigt alles automatisch:

1. Cloudflare-Anmeldung im Browser (einmal auf **Allow** klicken)
2. D1-Datenbank `zk-drive` anlegen und Tabellen erstellen
3. KV-Speicher `zk-drive-files` für die verschlüsselten Dateien anlegen
4. Worker `cloud` hochladen
5. Optional: Resend-API-Key für Passwort-Reset-Mails abfragen (Enter = überspringen)

Am Ende zeigt es deinen Link an. Öffnen, Konto einrichten – fertig.

> ⚠️ **Wiederherstellungscode sichern!** Beim Einrichten wird einmalig ein 24-stelliger Code angezeigt. Ohne ihn gibt es bei vergessenem Passwort **keinen** Weg zurück an deine Dateien – auch nicht für den Betreiber. Das ist der Preis für echtes Zero-Knowledge.

`deploy.bat` kann jederzeit erneut ausgeführt werden (z. B. nach Code-Änderungen). Vorhandene Daten bleiben erhalten.

**Linux/macOS:** statt der `.bat` einfach `node deploy.mjs` im Projektordner ausführen.

---

## Bedienung

- **Hochladen:** Dateien ins Fenster ziehen oder **+ Neu → Datei hochladen**
- **Verschieben:** Datei auf einen Ordner oder in die Breadcrumb-Leiste ziehen, oder Rechtsklick → *Verschieben*
- **Mehrfachauswahl:** `Strg`/`Shift` + Klick, dann Rechtsklick → *Als ZIP herunterladen*
- **Teilen:** Rechtsklick → *Teilen*, Ablaufzeit wählen, Link kopieren
- **Nach Neuladen der Seite** fragt die App das Passwort erneut ab – der Schlüssel liegt bewusst nur im Arbeitsspeicher, nie im Browser-Speicher.

### Passwort vergessen
1. Auf der Login-Seite **Passwort vergessen** → Benutzername eingeben
2. 6-stelligen Code aus der E-Mail + Wiederherstellungscode + neues Passwort eingeben
3. Alle Dateien bleiben erhalten, alle anderen Sitzungen werden abgemeldet

Ohne eingerichteten Mail-Key steht der Code im Worker-Log:

```bash
npx wrangler tail
```

### E-Mail-Versand einrichten (optional)
1. Konto auf [resend.com](https://resend.com) anlegen, unter **API Keys** einen Schlüssel erstellen
2. `deploy.bat` erneut starten und den Schlüssel im letzten Schritt eingeben

Mit dem Standard-Absender `drive@resend.dev` stellt Resend nur an die eigene Konto-Adresse zu. Für beliebige Empfänger in Resend eine eigene Domain verifizieren und diese als Absender angeben.

---

## Sicherheit & Verschlüsselung

Alle Kryptografie läuft im Browser über die **Web Crypto API**. Der Server sieht nur verschlüsselte Bytes.

```
Passwort ──PBKDF2 (310.000 Runden)──┬──► Verschlüsselungsschlüssel ──► entsperrt VaultKey   (verlässt nie den Browser)
                                    └──► Anmeldewert ──► Server (dort nochmals gehasht)

VaultKey (256 Bit, zufällig)
 ├─ verschlüsselt mit Passwort         → encrypted_vault_pw
 ├─ verschlüsselt mit Recovery-Code    → encrypted_vault_recovery
 └─ verschlüsselt jeden FileKey + alle Ordnernamen

FileKey (256 Bit, pro Datei)
 └─ verschlüsselt Dateiname, Typ und jeden Chunk (AES-256-GCM, eigener IV pro Chunk)
```

- **AES-256-GCM** für alle Daten, jeder Chunk mit eigenem zufälligen IV und an seine Position gebunden (vertauschte oder fehlende Chunks werden erkannt)
- **Passwort ≠ Anmeldung:** Der Server erhält nur einen abgeleiteten Anmeldewert, niemals das Passwort oder den Schlüssel
- **Sitzungen** als HttpOnly-/Secure-/SameSite=Strict-Cookie, in der Datenbank nur als Hash gespeichert, 30 Tage gültig
- **Schutz:** CSRF-Prüfung, Sperre nach 5 falschen Logins (10 Min), Reset-Codes mit 15 Min Gültigkeit und max. 5 Versuchen

### Wie Teilen ohne Schlüsselweitergabe funktioniert

```
https://cloud.meinname.workers.dev/s/<shareId>#<FileKey>
                                             └─ Fragment: wird vom Browser nie an den Server gesendet
```

Der Gast lädt die verschlüsselte Datei und entschlüsselt sie lokal mit dem Schlüssel aus dem `#`-Teil. Er bekommt nur diese eine Datei – kein Login, kein Zugriff auf andere Dateien. Bei **Burn after reading** wird der Link beim ersten Download-Start ungültig und die Datei nach vollständiger Übertragung gelöscht.

### Was der Server trotzdem sieht
Zero-Knowledge betrifft Inhalte und Namen. Sichtbar bleiben **Metadaten**: Dateigrößen, Anzahl der Dateien, Ordnerstruktur, Zeitpunkte, IP-Adressen beim Zugriff, Benutzername und E-Mail-Adresse.

---

## Limits

Im kostenlosen Cloudflare-Tarif:

| Ressource | Limit |
|---|---|
| Speicherplatz (Workers KV) | **1 GB** gesamt |
| Uploads | ca. 1.000 Chunks à 24 MB pro Tag (≈ 24 GB/Tag) |
| Datenbank (D1) | 500 MB – reicht für Hunderttausende Dateieinträge |
| Worker-Anfragen | 100.000 pro Tag |
| ZIP-Download | wird im Arbeitsspeicher gebaut, max. ca. 4 GB |

Das Speicherlimit lässt sich in `wrangler.toml` über `QUOTA_GB` anpassen. Für mehr als 1 GB kann der Speicher auf **Cloudflare R2** (10 GB kostenlos, benötigt Zahlungsmethode) umgestellt werden – die API ist bereits darauf ausgelegt, nur `worker.js` und `wrangler.toml` müssen angepasst werden.

---

## Projektstruktur

```
zk-drive/
├─ deploy.bat              Ein-Klick-Deployment (Windows)
├─ deploy.mjs              Deployment-Logik (Node.js)
├─ wrangler.toml           Cloudflare-Konfiguration (D1, KV, Assets)
├─ worker.js               Einstieg: /api/* → API, alles andere → statische Dateien
├─ schema.sql              Tabellen: users, sessions, folders, files, chunks, shares, reset_codes
├─ functions/api/
│  └─ [[route]].js         REST- & Streaming-API
└─ public/
   ├─ index.html           App-Oberfläche, Login, Share-Ansicht, Dialoge
   ├─ app.js               Zustand, Rendering, Kontextmenü, Drag & Drop, Shortcuts
   ├─ crypto.js            Web Crypto (PBKDF2, AES-GCM) + ZIP-Builder
   ├─ addons.js            Addon-System + eingebaute Addons
   ├─ style.css            Layout, Raster/Liste, Animationen
   └─ themes.css           Light, Dark, Nightmare
```

---

## Addons schreiben

Neue Funktionen lassen sich ohne Eingriff in den Kern ergänzen:

```js
Drive.registerAddon({
  name: 'hallo-welt',

  // Eintrag im Rechtsklick-Menü
  onContextMenu(items, ctx) {
    items.push({ label: 'Hallo sagen', run: () => Drive.toast('Hallo!') });
  },

  // Eigene Vorschau für bestimmte Dateitypen – Element zurückgeben oder null
  onPreview(file, blob) { return null; },

  // Button in der Toolbar
  onToolbar(container) {},

  // Vor dem Upload: Datei verändern oder mit false ablehnen
  beforeUpload(file) { return file; }
});
```

Eingebaute Addons (in `public/addons.js`): Schnellvorschau, ZIP-Download, verschlüsselte Notizen, Speicheranzeige.

---

## Manuelles Deployment

Falls du `deploy.bat` nicht nutzen willst:

```bash
npx wrangler login
npx wrangler d1 create zk-drive                 # database_id in wrangler.toml eintragen
npx wrangler d1 execute zk-drive --remote --file=schema.sql
npx wrangler kv namespace create zk-drive-files # id in wrangler.toml eintragen
npx wrangler deploy
npx wrangler secret put MAIL_API_KEY            # optional
npx wrangler secret put MAIL_FROM               # optional
```

---

## Fehlerbehebung

| Problem | Lösung |
|---|---|
| `Node.js fehlt` | Node.js installieren, Fenster schließen, `deploy.bat` neu starten |
| Windows: „Der Computer wurde geschützt“ | **Weitere Informationen → Trotzdem ausführen** |
| Seite lädt nach dem Deploy nicht | 2–5 Minuten warten, neue Subdomains brauchen etwas |
| Hinweis „Erwartet war …“ | Deine workers.dev-Subdomain heißt anders – den angezeigten Link nutzen |
| „Speicherplatz voll“ | 1-GB-Grenze erreicht – Papierkorb leeren oder auf R2 umstellen |
| Reset-Mail kommt nicht an | Mail-Key prüfen bzw. Code per `npx wrangler tail` im Log lesen |
| Logs ansehen | `npx wrangler tail` im Projektordner |
