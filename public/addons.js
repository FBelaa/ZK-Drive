// Plugin-Engine + eingebaute Addons. API: window.Drive (wird von app.js befüllt).
import { Zip } from './crypto.js';
const D = window.Drive = window.Drive || {};
export const addons = [];
/* Addon-Schnittstelle:
   { name, init(Drive), onChange(), onToolbar(container), onContextMenu(items, ctx),
     onPreview(file, blob) -> Element|null, beforeUpload(file) -> File|false } */
D.registerAddon = a => { addons.push(a); if (D.ready) D.mount(a); return a; };

// 1) Quick-Preview: Bilder, PDF, Text/Code, Audio, Video – komplett im RAM entschlüsselt.
const TXT = /\.(txt|md|markdown|json|js|mjs|ts|css|html?|xml|csv|ya?ml|ini|toml|log|py|java|c|cpp|h|cs|go|rs|php|rb|sh|ps1|bat|sql|env)$/i;
D.registerAddon({
  name: 'Quick-Preview',
  async onPreview(f, blob) {
    const m = f.mime || '', n = f.name, url = t => URL.createObjectURL(new Blob([blob], { type: t || m }));
    const el = t => document.createElement(t);
    if (m.startsWith('image/')) { const e = el('img'); e.alt = n; e.src = url(); return e; }
    if (m === 'application/pdf' || /\.pdf$/i.test(n)) { const e = el('iframe'); e.title = n; e.src = url('application/pdf'); return e; }
    if (m.startsWith('video/') || m.startsWith('audio/')) { const e = el(m[0] === 'v' ? 'video' : 'audio'); e.controls = e.autoplay = true; e.src = url(); return e; }
    if (m.startsWith('text/') || /json|javascript|xml/.test(m) || TXT.test(n)) {
      const e = el('pre'), big = blob.size > 5e6;
      e.textContent = (await (big ? blob.slice(0, 5e6) : blob).text()) + (big ? '\n\n… (gekürzt)' : '');
      return e;
    }
    return null;
  }
});

// 2) ZIP-Downloader: Auswahl / Ordner rekursiv -> unkomprimiertes ZIP im Browser.
const safe = s => s.replace(/[\\/:*?"<>|]/g, '_');
async function zipDownload(sel) {
  const list = [], used = new Set();
  const walk = (it, pre) => {
    if (it.type === 'file') {
      let p = pre + safe(it.name), i = 1;
      while (used.has(p)) p = pre + safe(it.name).replace(/(\.[^.]*)?$/, ` (${i++})$1`);
      used.add(p); list.push([p, it]);
    } else { const c = D.children(it.id); [...c.folders, ...c.files].forEach(x => walk(x, pre + safe(it.name) + '/')); }
  };
  sel.forEach(x => walk(x, ''));
  if (!list.length) return D.toast('Keine Dateien zum Packen', 'err');
  if (list.reduce((a, [, f]) => a + f.size, 0) > 4e9) return D.toast('Auswahl zu groß für ZIP (max. 4 GB)', 'err');
  D.toast(`Packe ${list.length} Datei(en) …`);
  const z = new Zip();
  for (const [p, f] of list) z.add(p, new Uint8Array(await (await D.getBlob(f)).arrayBuffer()), new Date(f.updated || Date.now()));
  D.saveBlob(z.blob(), sel.length === 1 ? safe(sel[0].name) + '.zip' : 'drive-' + new Date().toISOString().slice(0, 10) + '.zip');
}
D.zipDownload = zipDownload;
D.registerAddon({
  name: 'ZIP-Download',
  onContextMenu(items, ctx) {
    if (!ctx.trash && ctx.sel.length && (ctx.sel.length > 1 || ctx.sel[0].type === 'folder'))
      items.push({ label: 'Als ZIP herunterladen', icon: 'zip', run: () => zipDownload(ctx.sel) });
  }
});

// 3) Verschlüsselte Notizen (.md/.txt): Bearbeiten ersetzt den Inhalt (alte Chunks gelöscht, neu hochgeladen).
const NOTE = /\.(md|txt)$/i;
async function note(f) {
  const b = D.h('<div class="note"><input class="in" placeholder="Dateiname"><textarea rows="16" placeholder="Schreibe etwas … (wird Ende-zu-Ende verschlüsselt gespeichert)"></textarea></div>');
  const [inp, ta] = b.children;
  inp.value = f ? f.name : 'Notiz ' + new Date().toLocaleString('de-DE').replace(/[/:,]/g, '-') + '.md';
  if (f) { ta.disabled = true; ta.value = 'Wird entschlüsselt …'; }
  const done = D.modal({
    title: f ? 'Notiz bearbeiten' : 'Neue Notiz', body: b, wide: 1,
    buttons: [{ label: 'Abbrechen' }, {
      label: 'Speichern', primary: 1, run: async () => {
        if (ta.disabled) return false;
        let n = inp.value.trim() || 'Notiz.md'; if (!NOTE.test(n)) n += '.md';
        const file = new File([ta.value], n, { type: /\.md$/i.test(n) ? 'text/markdown' : 'text/plain' });
        if (f) { await D.replaceFile(f, file); if (n !== f.name) await D.renameFile(f, n); }
        else await D.upload(file, D.state.cwd);
        D.toast('Notiz verschlüsselt gespeichert'); await D.refresh();
      }
    }]
  });
  if (f) { try { ta.value = await (await D.getBlob(f)).text(); ta.disabled = false; ta.focus(); } catch (e) { D.toast(e.message, 'err'); } }
  else ta.focus();
  return done;
}
D.registerAddon({
  name: 'Notizen',
  onToolbar(menu) { const b = D.h(`<button type="button">${D.I.note}<span>Neue Notiz</span></button>`); b.onclick = () => note(); menu.append(b); },
  onContextMenu(items, ctx) {
    const f = ctx.one;
    if (!ctx.trash && f && f.type === 'file' && NOTE.test(f.name)) items.splice(1, 0, { label: 'Notiz bearbeiten', icon: 'edit', run: () => note(f) });
  }
});

// 4) Speicheranzeige in der Seitenleiste.
D.registerAddon({
  name: 'Speicheranzeige',
  async onChange() {
    const el = document.getElementById('storage'); if (!el) return;
    try {
      const u = await D.api('GET', '/usage'), p = u.quota ? Math.min(100, u.used / u.quota * 100) : 0;
      el.innerHTML = `<div class="bar${p > 90 ? ' full' : ''}"><i style="width:${p.toFixed(1)}%"></i></div><small>${D.fmt(u.used)} / ${D.fmt(u.quota)} belegt</small>`;
    } catch { el.textContent = ''; }
  }
});
