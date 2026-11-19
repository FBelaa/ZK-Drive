// ZK Drive – Client. Schlüssel existieren nur im Arbeitsspeicher.
import * as C from './crypto.js';
import { addons } from './addons.js';
const D = window.Drive, $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)], CH = 24 * 1024 * 1024;
const ls = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch { return null; } };
const S = { user: null, vk: null, folders: new Map(), files: new Map(), cwd: null, mode: 'drive', view: ls('zk-view') || 'list', q: '', sel: new Set(), last: null, items: [] };
const esc = s => String(s).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
const h = s => { const t = document.createElement('template'); t.innerHTML = s.trim(); return t.content.firstElementChild; };
const fmt = b => { if (b < 1024) return b + ' B'; const u = ['KB', 'MB', 'GB', 'TB']; let i = -1; do { b /= 1024; i++; } while (b >= 1024 && i < 3); return b.toLocaleString('de-DE', { maximumFractionDigits: b < 10 ? 1 : 0 }) + ' ' + u[i]; };
const date = t => t ? new Date(t).toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
const byName = (a, b) => a.name.localeCompare(b.name, 'de', { numeric: true });
const THEMES = [['light', 'Hell'], ['dark', 'Dunkel'], ['nightmare', 'Nightmare']];

const P = {
  folder: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z', file: 'M6 3h8l4 4v14H6zM14 3v4h4',
  img: 'M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M15 9h.01', video: 'M4 6h11v12H4zM15 10l5-3v10l-5-3',
  audio: 'M9 18V5l11-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM20 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z', pdf: 'M6 3h8l4 4v14H6zM9 12h6M9 16h6M9 8h2',
  zip: 'M6 3h12v18H6zM12 3v2M12 7v2M12 11v2M11 15h2v3h-2z', note: 'M5 3h14v18H5zM8 8h8M8 12h8M8 16h5', plus: 'M12 5v14M5 12h14',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4', grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z', list: 'M4 6h16M4 12h16M4 18h16',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13', drive: 'M3 15h18l-3-9H6zM3 15v4h18v-4M7 17h.01',
  gear: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2', out: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10',
  x: 'M6 6l12 12M18 6L6 18', down: 'M12 4v12M6 11l6 6 6-6M5 20h14', up: 'M12 20V8M6 13l6-6 6 6M5 4h14',
  share: 'M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 22a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM8.6 13.5l6.8 4M15.4 6.5l-6.8 4',
  edit: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4', move: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM10 13h6M13 10l3 3-3 3',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z', restore: 'M4 12a8 8 0 1 0 3-6.2M4 4v5h5',
  lock: 'M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4', dir: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM12 10v6M9 13l3-3 3 3'
};
const I = Object.fromEntries(Object.entries(P).map(([k, d]) => [k, `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`]));
function kind(it) {
  if (it.type === 'folder') return 'folder';
  const m = it.mime || '', n = it.name.toLowerCase();
  if (m.startsWith('image/')) return 'img'; if (m.startsWith('video/')) return 'video'; if (m.startsWith('audio/')) return 'audio';
  if (m === 'application/pdf' || n.endsWith('.pdf')) return 'pdf'; if (/\.(zip|rar|7z|tar|gz)$/.test(n)) return 'zip';
  if (m.startsWith('text/') || /\.(md|txt|json|js|css|html|csv|xml|log)$/.test(n)) return 'note';
  return 'file';
}

// ---------- Basis-UI ----------
async function api(m, p, b) {
  const r = await fetch('/api' + p, { method: m, headers: { 'X-ZK': '1', 'content-type': 'application/json' }, body: b ? JSON.stringify(b) : undefined, credentials: 'same-origin' });
  const d = await r.json().catch(() => ({}));
  if (r.status === 401 && S.vk) { location.replace('/'); throw new Error('Sitzung abgelaufen'); }
  if (!r.ok) { const e = new Error(d.error || 'Fehler ' + r.status); e.status = r.status; throw e; }
  return d;
}
function toast(m, t = '') { const e = h(`<div class="toast ${t}" role="status"></div>`); e.textContent = m; $('#toasts').append(e); setTimeout(() => e.remove(), t === 'err' ? 6000 : 3500); }
const show = n => $$('.scr').forEach(s => s.hidden = s.id !== 'scr-' + n);
const busy = fn => async e => {
  e.preventDefault();
  const f = e.target, b = f.querySelector('button.primary,button:not([type=button])'), er = f.querySelector('.err');
  if (er) er.textContent = ''; if (b) b.disabled = true;
  try { await fn(f.elements, f); } catch (x) { er ? er.textContent = x.message : toast(x.message, 'err'); } finally { if (b) b.disabled = false; }
};
function modal({ title, body, buttons = [], wide, onClose, noClose }) {
  const ov = h(`<div class="modal-bg"><div class="modal${wide ? ' wide' : ''}" role="dialog" aria-modal="true"><header><h3></h3>${noClose ? '' : `<button type="button" class="iconbtn x" aria-label="Schließen">${I.x}</button>`}</header><div class="mb"></div><footer></footer></div></div>`);
  ov.querySelector('h3').textContent = title;
  const mb = ov.querySelector('.mb'), ft = ov.querySelector('footer');
  if (body) mb.append(typeof body === 'string' ? h(body) : body);
  return new Promise(res => {
    const close = v => { if (!ov.isConnected) return; ov.remove(); onClose && onClose(); res(v); };
    ov.esc = noClose ? null : () => close(null);
    if (!noClose) { ov.querySelector('.x').onclick = () => close(null); ov.onmousedown = e => { if (e.target === ov) close(null); }; }
    let prim;
    for (const bt of buttons) {
      const b = h(`<button type="button" class="btn${bt.primary ? ' primary' : ''}${bt.danger ? ' danger' : ''}"></button>`);
      b.textContent = bt.label; if (bt.primary) prim = b;
      b.onclick = async () => {
        if (!bt.run) return close(null);
        b.disabled = true;
        try { const r = await bt.run(ov); if (r !== false) close(r === undefined ? true : r); } catch (e) { toast(e.message, 'err'); } finally { b.disabled = false; }
      };
      ft.append(b);
    }
    if (!buttons.length) ft.remove();
    ov.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.tagName === 'INPUT' && !e.target.form && prim) { e.preventDefault(); prim.click(); } });
    document.body.append(ov);
    const f = mb.querySelector('input:not([type=checkbox]):not([readonly]),textarea,select'); f && f.focus();
  });
}
function ask(title, val = '', stripExt) {
  const b = h('<div><input class="in"></div>'), i = b.firstChild; i.value = val;
  const p = modal({ title, body: b, buttons: [{ label: 'Abbrechen' }, { label: 'OK', primary: 1, run: () => i.value.trim() || false }] });
  const d = stripExt ? val.lastIndexOf('.') : -1; i.setSelectionRange(0, d > 0 ? d : val.length);
  return p;
}
const confirmDlg = (title, text, label = 'Löschen') => modal({ title, body: `<p>${esc(text)}</p>`, buttons: [{ label: 'Abbrechen' }, { label, danger: 1, run: () => true }] });
const copy = t => navigator.clipboard.writeText(t).then(() => toast('In die Zwischenablage kopiert'), () => toast('Kopieren nicht möglich', 'err'));
function progress(name) {
  const box = $('#prog'), e = h('<div class="pg"><span></span><div class="bar"><i></i></div></div>'), bar = e.querySelector('i');
  e.firstChild.textContent = name; box.querySelector('.pl').append(e); box.hidden = false;
  return {
    set: v => bar.style.width = Math.min(100, v * 100).toFixed(1) + '%',
    done: ok => { e.classList.add(ok ? 'ok' : 'bad'); bar.style.width = '100%'; setTimeout(() => { e.remove(); if (!box.querySelector('.pg')) box.hidden = true; }, ok ? 2500 : 8000); }
  };
}
function applyTheme(t) {
  if (!THEMES.some(x => x[0] === t)) t = 'light';
  document.documentElement.dataset.theme = t; ls('zk-theme', t);
  $$('.themes button').forEach(b => b.classList.toggle('on', b.dataset.t === t));
}
const saveBlob = (blob, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 6e4); };

// ---------- Down-/Upload ----------
async function fetchDec(url, key, meta, sink) {
  const r = await fetch(url, { credentials: 'same-origin' });
  if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error || 'Download fehlgeschlagen (' + r.status + ')'); }
  const p = progress('↓ ' + meta.name), tot = meta.size + meta.chunks * 32 || 1;
  try { await C.decryptStream(r, key, sink, n => p.set(n / tot), meta.chunks); p.done(true); } catch (e) { p.done(false); throw e; }
}
async function saveFile(url, key, meta) {
  if (window.showSaveFilePicker) {
    let fh = null;
    try { fh = await window.showSaveFilePicker({ suggestedName: meta.name }); } catch (e) { if (e.name === 'AbortError') return false; }
    if (fh) {
      const w = await fh.createWritable();
      try { await fetchDec(url, key, meta, c => w.write(c)); await w.close(); return true; } catch (e) { await w.abort().catch(() => {}); throw e; }
    }
  }
  const parts = []; await fetchDec(url, key, meta, c => { parts.push(c); });
  saveBlob(new Blob(parts, { type: meta.mime || 'application/octet-stream' }), meta.name); return true;
}
async function getBlob(f) { const parts = []; await fetchDec(`/api/files/${f.id}/stream`, f.key, f, c => { parts.push(c); }); return new Blob(parts, { type: f.mime }); }
const download = f => saveFile(`/api/files/${f.id}/stream`, f.key, f);
const put = (url, body, onp) => new Promise((res, rej) => {
  const x = new XMLHttpRequest(); x.open('PUT', url); x.setRequestHeader('X-ZK', '1');
  x.upload.onprogress = e => onp(e.loaded);
  x.onload = () => x.status < 300 ? (onp(body.length), res()) : rej(new Error('Upload fehlgeschlagen (' + x.status + ')'));
  x.onerror = () => rej(new Error('Netzwerkfehler beim Upload')); x.send(body);
});
// existing: Datei, deren Inhalt ersetzt wird (Notizen). Gibt false zurück, wenn ein Addon den Upload ablehnt.
async function uploadOne(file, folder, existing) {
  for (const a of addons) if (a.beforeUpload) { const r = await a.beforeUpload(file); if (r === false) return false; if (r) file = r; }
  const n = Math.max(1, Math.ceil(file.size / CH)), p = progress('↑ ' + file.name), done = new Array(n).fill(0);
  let id, key;
  try {
    if (existing) { id = existing.id; key = existing.key; await api('POST', `/files/${id}/replace`, { size: file.size, chunks: n }); }
    else {
      const raw = C.rand(32); key = await C.importKey(raw);
      id = (await api('POST', '/files', { name: await C.encStr(key, file.name), mime: await C.encStr(key, file.type || ''), size: file.size, chunks: n, fileKey: C.b64(await C.encrypt(S.vk, raw)), folderId: folder || null })).id;
    }
    let i = 0;
    const worker = async () => {
      while (i < n) {
        const k = i++, ct = await C.encrypt(key, await file.slice(k * CH, (k + 1) * CH).arrayBuffer(), C.chunkAad(k));
        for (let t = 1; ; t++) {
          try { await put(`/api/files/${id}/chunks/${k}`, ct, x => { done[k] = x; p.set(done.reduce((a, b) => a + b, 0) / (file.size + n * 28 || 1)); }); break; }
          catch (e) { if (t >= 3) throw e; await new Promise(r => setTimeout(r, 1000 * t)); }
        }
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    await api('POST', `/files/${id}/complete`);
    p.done(true); return true;
  } catch (e) { p.done(false); if (id && !existing) api('DELETE', '/files/' + id).catch(() => {}); throw e; }
}
async function ensurePath(parts, base) {
  let cur = base;
  for (const n of parts) {
    let f = [...S.folders.values()].find(x => x.parent === cur && x.name === n && !x.trashed);
    if (!f) {
      const id = (await api('POST', '/folders', { name: await C.encStr(S.vk, n), parentId: cur })).id;
      f = { type: 'folder', id, parent: cur, name: n, trashed: false }; S.folders.set(id, f);
    }
    cur = f.id;
  }
  return cur;
}
async function uploadMany(list, dirs) {
  list = [...list]; if (!list.length) return;
  let ok = 0;
  for (const f of list) {
    try {
      let to = S.cwd;
      if (dirs) { const parts = (f.webkitRelativePath || f.name).split('/'); parts.pop(); to = await ensurePath(parts, S.cwd); }
      if (await uploadOne(f, to)) ok++;
    } catch (e) { toast(`${f.name}: ${e.message}`, 'err'); }
  }
  if (ok) toast(`${ok} Datei(en) verschlüsselt hochgeladen`);
  await refresh();
}

// ---------- Daten & Rendering ----------
const key = it => (it.type === 'file' ? 'f:' : 'd:') + it.id;
const get = k => (k[0] === 'f' ? S.files : S.folders).get(k.slice(2));
const ipath = i => (i.type === 'file' ? '/files/' : '/folders/') + i.id;
const selItems = () => [...S.sel].map(get).filter(Boolean);
function alive(it) {
  if (!it || it.trashed) return false;
  let p = it.type === 'file' ? it.folder : it.parent, n = 0;
  while (p && n++ < 1e4) { const f = S.folders.get(p); if (!f || f.trashed) return false; p = f.parent; }
  return true;
}
const isDesc = (a, t) => { for (let n = 0; t && n < 1e4; n++) { if (t === a) return true; t = S.folders.get(t)?.parent; } return false; };
const children = id => ({ folders: [...S.folders.values()].filter(f => f.parent === id && !f.trashed).sort(byName), files: [...S.files.values()].filter(f => f.folder === id && !f.trashed).sort(byName) });

async function refresh() {
  const [fo, fi] = await Promise.all([api('GET', '/folders'), api('GET', '/files')]);
  const folders = new Map(), files = new Map();
  await Promise.all(fo.map(async r => {
    const p = S.folders.get(r.id); let name = p && p.enc === r.name ? p.name : null;
    if (name == null) try { name = await C.decStr(S.vk, r.name); } catch { name = '(nicht entschlüsselbar)'; }
    folders.set(r.id, { type: 'folder', id: r.id, parent: r.parent_id, name, enc: r.name, trashed: !!r.trashed, updated: r.created });
  }));
  await Promise.all(fi.map(async r => {
    try {
      const p = S.files.get(r.id); let raw, k;
      if (p && p.fk === r.file_key) { raw = p.raw; k = p.key; } else { raw = await C.decrypt(S.vk, C.unb64(r.file_key)); k = await C.importKey(raw); }
      const name = p && p.enc === r.name ? p.name : await C.decStr(k, r.name), mime = p && p.encm === r.mime ? p.mime : await C.decStr(k, r.mime);
      files.set(r.id, { type: 'file', id: r.id, folder: r.folder_id, name, mime, size: r.size, chunks: r.chunks, key: k, raw, fk: r.file_key, enc: r.name, encm: r.mime, trashed: !!r.trashed, updated: r.updated });
    } catch (e) { console.warn('Datei nicht entschlüsselbar', r.id, e); }
  }));
  S.folders = folders; S.files = files;
  if (S.cwd && !alive(folders.get(S.cwd))) S.cwd = null;
  for (const k of [...S.sel]) if (!get(k)) S.sel.delete(k);
  render(); addons.forEach(a => a.onChange && Promise.resolve(a.onChange()).catch(console.error));
}
function visible() {
  const all = () => [...S.folders.values(), ...S.files.values()];
  let l;
  if (S.mode === 'trash') l = all().filter(i => i.trashed);
  else if (S.q) { const q = S.q.toLowerCase(); l = all().filter(i => alive(i) && i.name.toLowerCase().includes(q)); }
  else { const c = children(S.cwd); l = [...c.folders, ...c.files]; }
  return l.sort((a, b) => (a.type === b.type ? 0 : a.type === 'folder' ? -1 : 1) || byName(a, b));
}
function crumbs() {
  const c = $('#crumbs');
  if (S.mode === 'trash') return c.innerHTML = '<span class="crumb">Papierkorb</span>';
  if (S.q) return c.innerHTML = `<span class="crumb">Suchergebnisse für „${esc(S.q)}“</span>`;
  const path = []; let p = S.cwd;
  while (p) { const f = S.folders.get(p); if (!f) break; path.unshift(f); p = f.parent; }
  c.innerHTML = '<span class="crumb" data-drop="" data-id="">Mein Drive</span>' + path.map(f => `<span class="sep">›</span><span class="crumb" data-drop="${f.id}" data-id="${f.id}">${esc(f.name)}</span>`).join('');
}
function render() {
  const list = S.items = visible(), box = $('#items'), tr = S.mode === 'trash';
  crumbs();
  box.className = 'items ' + S.view; $('#main').classList.toggle('v-list', S.view === 'list');
  $('#btn-view').innerHTML = S.view === 'list' ? I.grid : I.list;
  $('#nav-drive').classList.toggle('on', !tr); $('#nav-trash').classList.toggle('on', tr);
  $('#btn-empty').hidden = !tr || !list.length;
  box.innerHTML = list.length ? '' : `<div class="empty">${I[tr ? 'trash' : S.q ? 'search' : 'drive']}<p>${tr ? 'Der Papierkorb ist leer.' : S.q ? 'Keine Treffer.' : 'Hier ist noch nichts. Dateien hierher ziehen oder über „+ Neu“ hochladen.'}</p></div>`;
  for (const it of list) {
    const k = kind(it), e = h(`<div class="item" tabindex="-1" data-k="${key(it)}"${it.type === 'folder' && !tr ? ` data-drop="${it.id}"` : ''}><span class="ic ${k}">${I[k]}</span><span class="nm"></span><span class="sz">${it.type === 'file' ? fmt(it.size) : '—'}</span><span class="dt">${date(it.updated)}</span></div>`);
    e.draggable = !tr; e.querySelector('.nm').textContent = e.title = it.name;
    box.append(e);
  }
  markSel();
}
const markSel = () => $$('#items .item').forEach(e => e.classList.toggle('sel', S.sel.has(e.dataset.k)));
function select(k, e) {
  if (e.shiftKey && S.last) {
    const ks = S.items.map(key); let a = ks.indexOf(S.last), b = ks.indexOf(k);
    if (a < 0) a = b; if (a > b) [a, b] = [b, a];
    if (!e.ctrlKey && !e.metaKey) S.sel.clear();
    ks.slice(a, b + 1).forEach(x => S.sel.add(x));
  } else if (e.ctrlKey || e.metaKey) { S.sel.has(k) ? S.sel.delete(k) : S.sel.add(k); S.last = k; }
  else { S.sel = new Set([k]); S.last = k; }
  markSel();
}
function cd(id) { S.cwd = id; S.mode = 'drive'; S.q = ''; $('#search').value = ''; S.sel.clear(); document.body.classList.remove('side-open'); render(); }
function open(it) { if (S.mode === 'trash') return; it.type === 'folder' ? cd(it.id) : preview(it); }

// ---------- Aktionen ----------
async function preview(f) {
  const body = h('<div class="pv"><div class="spin"></div></div>');
  const done = modal({ title: f.name, body, wide: 1, buttons: [{ label: 'Herunterladen', run: () => { download(f).catch(e => toast(e.message, 'err')); return false; } }], onClose: () => body.querySelectorAll('[src^="blob:"]').forEach(x => URL.revokeObjectURL(x.src)) });
  try {
    const b = await getBlob(f); let el = null;
    if (!body.isConnected) return done;
    for (const a of addons) if (a.onPreview && (el = await a.onPreview(f, b))) break;
    body.replaceChildren(el || h(`<div class="empty">${I[kind(f)]}<p>Für diesen Dateityp gibt es keine Vorschau.</p></div>`));
  } catch (e) { body.replaceChildren(h('<p class="err"></p>')); body.firstChild.textContent = e.message; }
  if (!body.isConnected) body.querySelectorAll('[src^="blob:"]').forEach(x => URL.revokeObjectURL(x.src));
  return done;
}
async function rename() {
  const it = selItems()[0]; if (!it) return;
  const n = await ask('Umbenennen', it.name, it.type === 'file'); if (!n || n === it.name) return;
  await api('PATCH', ipath(it), { name: await C.encStr(it.type === 'file' ? it.key : S.vk, n) });
  await refresh();
}
async function newFolder() {
  const n = await ask('Neuer Ordner', 'Unbenannter Ordner'); if (!n) return;
  await api('POST', '/folders', { name: await C.encStr(S.vk, n), parentId: S.cwd }); await refresh();
}
async function trash() {
  const s = selItems(); if (!s.length) return;
  await Promise.all(s.map(i => api('PATCH', ipath(i), { trashed: true })));
  S.sel.clear(); toast(`${s.length} Element(e) in den Papierkorb verschoben`); await refresh();
}
async function restore() {
  const s = selItems();
  await Promise.all(s.map(i => {
    const p = i.type === 'file' ? i.folder : i.parent, b = { trashed: false };
    if (p && !alive(S.folders.get(p))) b.parentId = null;
    return api('PATCH', ipath(i), b);
  }));
  S.sel.clear(); toast('Wiederhergestellt'); await refresh();
}
async function purge() {
  const s = selItems(); if (!s.length) return;
  if (!await confirmDlg('Endgültig löschen', `${s.length} Element(e) endgültig löschen? Das kann nicht rückgängig gemacht werden.`)) return;
  await Promise.all(s.map(i => api('DELETE', ipath(i)))); S.sel.clear(); toast('Endgültig gelöscht'); await refresh();
}
async function emptyTrash() {
  if (!await confirmDlg('Papierkorb leeren', 'Alle Elemente im Papierkorb endgültig löschen?', 'Leeren')) return;
  await api('POST', '/trash/empty'); S.sel.clear(); toast('Papierkorb geleert'); await refresh();
}
async function moveTo(keys, t) {
  const its = keys.map(get).filter(i => i && (i.type === 'file' ? i.folder : i.parent) !== t && !(i.type === 'folder' && isDesc(i.id, t)));
  if (!its.length) return;
  await Promise.all(its.map(i => api('PATCH', ipath(i), { parentId: t })));
  S.sel.clear(); toast(`${its.length} Element(e) verschoben`); await refresh();
}
async function moveDlg() {
  const s = selItems(); if (!s.length) return;
  const bad = new Set(s.filter(i => i.type === 'folder').map(i => i.id)), tree = h('<div class="tree"></div>');
  let target = null;
  const add = (id, name, depth) => {
    const b = h(`<button type="button" style="padding-left:${8 + depth * 18}px">${I.folder}<span></span></button>`);
    b.lastChild.textContent = name;
    b.onclick = () => { tree.querySelectorAll('.on').forEach(x => x.classList.remove('on')); b.classList.add('on'); target = id; };
    tree.append(b);
    children(id).folders.filter(f => !bad.has(f.id)).forEach(f => add(f.id, f.name, depth + 1));
  };
  add(null, 'Mein Drive', 0); tree.firstChild.classList.add('on');
  const r = await modal({ title: `${s.length} Element(e) verschieben`, body: tree, buttons: [{ label: 'Abbrechen' }, { label: 'Hierher verschieben', primary: 1, run: () => ({ t: target }) }] });
  if (r) await moveTo(s.map(key), r.t);
}
async function shareDlg(f) {
  const b = h(`<div><label>Gültigkeit<select class="in"><option value="3600">1 Std</option><option value="86400" selected>24 Std</option><option value="604800">7 Tage</option><option value="0">Unbegrenzt</option></select></label>
<label class="chk"><input type="checkbox"> Burn after reading – nach dem ersten Download löschen</label>
<p class="muted small">Der Schlüssel steht nur im Link-Fragment (#…) und erreicht nie den Server.</p><div class="linkrow" hidden><input class="in" readonly><button type="button" class="btn">Kopieren</button></div></div>`);
  const sel = b.querySelector('select'), burn = b.querySelector('[type=checkbox]'), row = b.querySelector('.linkrow'), li = row.querySelector('input');
  row.querySelector('button').onclick = () => copy(li.value);
  await modal({
    title: 'Teilen: ' + f.name, body: b, buttons: [{ label: 'Schließen' }, {
      label: 'Link erstellen', primary: 1, run: async () => {
        const r = await api('POST', '/shares', { fileId: f.id, expiresIn: +sel.value || null, burn: burn.checked });
        li.value = `${location.origin}/s/${r.id}#${C.b64url(f.raw)}`; row.hidden = false; li.select(); copy(li.value); return false;
      }
    }]
  });
}
async function settings() {
  const [u, sh] = await Promise.all([api('GET', '/usage'), api('GET', '/shares')]);
  const b = h(`<div class="set"><h4>Speicher</h4><div class="bar"><i style="width:${Math.min(100, u.used / u.quota * 100).toFixed(1)}%"></i></div><p class="muted">${fmt(u.used)} von ${fmt(u.quota)} belegt · ${S.files.size} Dateien</p>
<h4>Design</h4><select class="in theme">${THEMES.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>
<h4>E-Mail</h4><form class="row fe"><input class="in" name="email" type="email" required><button class="btn">Speichern</button></form>
<h4>Passwort ändern</h4><form class="col fp"><input class="in" name="old" type="password" placeholder="Aktuelles Passwort" required autocomplete="current-password"><input class="in" name="pw" type="password" minlength="10" placeholder="Neues Passwort (min. 10 Zeichen)" required autocomplete="new-password"><input class="in" name="pw2" type="password" placeholder="Neues Passwort wiederholen" required autocomplete="new-password"><p class="err"></p><button class="btn primary">Passwort ändern</button></form>
<h4>Aktive Freigaben</h4><div class="shares">${sh.map(s => `<div class="srow" data-id="${s.id}"><span>${esc(S.files.get(s.file_id)?.name || '?')}</span><small class="muted">${s.expires ? 'bis ' + new Date(s.expires).toLocaleString('de-DE') : 'unbegrenzt'}${s.burn ? ' · Burn' : ''}</small><button type="button" class="btn danger">Widerrufen</button></div>`).join('') || '<p class="muted">Keine aktiven Freigaben.</p>'}</div></div>`);
  const th = b.querySelector('.theme'); th.value = document.documentElement.dataset.theme; th.onchange = () => applyTheme(th.value);
  const fe = b.querySelector('.fe'); fe.email.value = S.user.email || '';
  fe.onsubmit = busy(async el => { await api('POST', '/auth/email', { email: el.email.value.trim() }); S.user.email = el.email.value.trim(); toast('E-Mail gespeichert'); });
  b.querySelector('.fp').onsubmit = busy(async el => {
    if (el.pw.value !== el.pw2.value) throw new Error('Neue Passwörter stimmen nicht überein');
    const old = await C.deriveFromPassword(el.old.value, S.user.salt); let raw;
    try { raw = await C.decrypt(old.key, C.unb64(S.user.vault)); } catch { throw new Error('Aktuelles Passwort falsch'); }
    const salt = C.b64url(C.rand(16)), n = await C.deriveFromPassword(el.pw.value, salt), vault = C.b64(await C.encrypt(n.key, raw)); raw.fill(0);
    await api('POST', '/auth/password', { oldAuth: old.auth, salt, auth: n.auth, vault });
    Object.assign(S.user, { salt, vault }); el.old.value = el.pw.value = el.pw2.value = '';
    toast('Passwort geändert – andere Sitzungen wurden abgemeldet');
  });
  b.querySelector('.shares').onclick = async e => {
    const r = e.target.closest('.srow'); if (!r || !e.target.closest('button')) return;
    await api('DELETE', '/shares/' + r.dataset.id).then(() => { r.remove(); toast('Freigabe widerrufen'); }, x => toast(x.message, 'err'));
  };
  await modal({ title: 'Einstellungen', body: b, wide: 0 });
}
async function logout() { try { await api('POST', '/auth/logout'); } catch { } S.vk = null; location.replace('/'); }

// ---------- Kontextmenü ----------
function menuItems(bg) {
  const sel = selItems(), one = sel.length === 1 ? sel[0] : null, ctx = { sel, one, trash: S.mode === 'trash', cwd: S.cwd };
  let it = [];
  if (bg) it = ctx.trash ? [{ label: 'Papierkorb leeren', icon: 'trash', danger: 1, run: emptyTrash }] : [{ label: 'Neuer Ordner', icon: 'folder', run: newFolder }, { label: 'Datei hochladen', icon: 'up', run: () => $('#up-file').click() }];
  else if (ctx.trash) it = [{ label: 'Wiederherstellen', icon: 'restore', run: restore }, { label: 'Endgültig löschen', icon: 'trash', danger: 1, run: purge }];
  else {
    if (one && one.type === 'file') it.push({ label: 'Vorschau', icon: 'eye', run: () => preview(one) }, { label: 'Herunterladen', icon: 'down', run: () => download(one) });
    if (one && one.type === 'folder') it.push({ label: 'Öffnen', icon: 'folder', run: () => cd(one.id) });
    if (one) it.push({ label: 'Umbenennen', icon: 'edit', run: rename });
    it.push({ label: 'Verschieben', icon: 'move', run: moveDlg });
    if (one && one.type === 'file') it.push({ label: 'Teilen', icon: 'share', run: () => shareDlg(one) });
    it.push({ label: 'In Papierkorb', icon: 'trash', danger: 1, run: trash });
  }
  if (!bg) addons.forEach(a => { try { a.onContextMenu && a.onContextMenu(it, ctx); } catch (e) { console.error(e); } });
  return it;
}
function showMenu(x, y, items) {
  const m = $('#ctx'); m.innerHTML = '';
  for (const it of items) {
    const b = h(`<button type="button" class="${it.danger ? 'danger' : ''}">${I[it.icon] || '<svg viewBox="0 0 24 24"></svg>'}<span></span></button>`);
    b.lastChild.textContent = it.label;
    b.onclick = async () => { hideMenu(); try { await it.run(); } catch (e) { toast(e.message, 'err'); } };
    m.append(b);
  }
  m.hidden = false;
  const r = m.getBoundingClientRect();
  m.style.left = Math.max(4, Math.min(x, innerWidth - r.width - 8)) + 'px'; m.style.top = Math.max(4, Math.min(y, innerHeight - r.height - 8)) + 'px';
}
const hideMenu = () => { const v = !$('#ctx').hidden || !$('#newmenu').hidden; $('#ctx').hidden = $('#newmenu').hidden = true; return v; };

// ---------- Initialisierung der App-Oberfläche ----------
let inited = false;
function initApp() {
  if (inited) return; inited = true;
  const items = $('#items'), touch = matchMedia('(hover: none)').matches;
  items.onclick = e => {
    const el = e.target.closest('.item');
    if (!el) { if (!e.ctrlKey && !e.shiftKey) { S.sel.clear(); markSel(); } return; }
    if (touch && !e.ctrlKey && !e.shiftKey) { const it = get(el.dataset.k); S.sel = new Set([el.dataset.k]); markSel(); return it && open(it); }
    select(el.dataset.k, e);
  };
  items.ondblclick = e => { const el = e.target.closest('.item'), it = el && get(el.dataset.k); if (it) open(it); };
  items.oncontextmenu = e => {
    e.preventDefault(); const el = e.target.closest('.item');
    if (el && !S.sel.has(el.dataset.k)) { S.sel = new Set([el.dataset.k]); S.last = el.dataset.k; markSel(); }
    if (!el) { S.sel.clear(); markSel(); }
    showMenu(e.clientX, e.clientY, menuItems(!el));
  };
  items.ondragstart = e => {
    const el = e.target.closest('.item'); if (!el) return;
    if (!S.sel.has(el.dataset.k)) { S.sel = new Set([el.dataset.k]); markSel(); }
    e.dataTransfer.setData('application/x-zk', JSON.stringify([...S.sel])); e.dataTransfer.effectAllowed = 'move';
  };
  $('#crumbs').onclick = e => { const c = e.target.closest('[data-id]'); if (c) cd(c.dataset.id || null); };
  $('#nav-drive').onclick = () => cd(null);
  $('#nav-trash').onclick = () => { S.mode = 'trash'; S.q = ''; $('#search').value = ''; S.sel.clear(); document.body.classList.remove('side-open'); render(); };
  $('#nav-settings').onclick = () => settings().catch(e => toast(e.message, 'err'));
  $('#nav-out').onclick = logout;
  $('#btn-empty').onclick = () => emptyTrash().catch(e => toast(e.message, 'err'));
  $('#btn-side').onclick = () => document.body.classList.toggle('side-open');
  $('#btn-view').onclick = () => { S.view = S.view === 'list' ? 'grid' : 'list'; ls('zk-view', S.view); render(); };
  $('#search').oninput = e => { S.q = e.target.value.trim(); if (S.q && S.mode === 'trash') S.mode = 'drive'; S.sel.clear(); render(); };
  $('#btn-new').onclick = e => { e.stopPropagation(); const m = $('#newmenu'); const o = m.hidden; hideMenu(); m.hidden = !o; };
  $('#newmenu').onclick = e => {
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (a === 'upload') $('#up-file').click(); else if (a === 'folderup') $('#up-dir').click(); else if (a === 'mkdir') newFolder().catch(x => toast(x.message, 'err'));
  };
  for (const id of ['#up-file', '#up-dir']) $(id).onchange = e => { const f = [...e.target.files]; e.target.value = ''; uploadMany(f, id === '#up-dir'); };
  $('.themes').onclick = e => { const b = e.target.closest('[data-t]'); if (b) applyTheme(b.dataset.t); };
  applyTheme(document.documentElement.dataset.theme);
  Object.assign(D, { mount: a => { try { a.init && a.init(D); a.onToolbar && a.onToolbar($('#newmenu')); } catch (e) { console.error('Addon', a.name, e); } } });
  addons.forEach(D.mount); D.ready = true;
}
async function enterApp() { show('app'); initApp(); $('#me').textContent = S.user.username; await refresh(); }
async function openVault(me, k) {
  let raw;
  try { raw = await C.decrypt(k, C.unb64(me.vault)); } catch { throw new Error('Falsches Passwort'); }
  S.vk = await C.importKey(raw); raw.fill(0); S.user = me; await enterApp();
}

// ---------- Globale Ereignisse (DnD, Tastatur) ----------
let depth = 0;
const isFiles = e => e.dataTransfer && [...e.dataTransfer.types].includes('Files');
const canDrop = () => S.vk && S.mode === 'drive' && !$('#scr-app').hidden;
document.addEventListener('dragenter', e => { if (isFiles(e) && canDrop()) { depth++; $('#drop').hidden = false; } });
document.addEventListener('dragleave', e => {
  if (isFiles(e) && --depth <= 0) { depth = 0; $('#drop').hidden = true; }
  const t = e.target.closest && e.target.closest('[data-drop]'); if (t && !t.contains(e.relatedTarget)) t.classList.remove('over');
});
document.addEventListener('dragover', e => {
  const t = e.target.closest && e.target.closest('[data-drop]');
  if (t && [...e.dataTransfer.types].includes('application/x-zk')) { e.preventDefault(); t.classList.add('over'); }
  else if (isFiles(e)) e.preventDefault();
});
document.addEventListener('drop', e => {
  e.preventDefault(); depth = 0; $('#drop').hidden = true; $$('.over').forEach(x => x.classList.remove('over'));
  const t = e.target.closest && e.target.closest('[data-drop]'), zk = e.dataTransfer.getData('application/x-zk');
  if (zk) { if (t) moveTo(JSON.parse(zk), t.dataset.drop || null).catch(x => toast(x.message, 'err')); }
  else if (e.dataTransfer.files.length && canDrop()) uploadMany(e.dataTransfer.files);
});
document.addEventListener('click', e => { if (!e.target.closest('#ctx,#btn-new')) hideMenu(); });
window.addEventListener('blur', hideMenu); window.addEventListener('resize', hideMenu);
document.addEventListener('keydown', e => {
  if (!S.vk) return;
  const ae = document.activeElement, typing = ae && /INPUT|TEXTAREA|SELECT/.test(ae.tagName), mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); $$('.modal-bg').forEach(m => m.esc && m.esc()); $('#search').focus(); $('#search').select(); return; }
  if (e.key === 'Escape') {
    const m = $$('.modal-bg').pop(); if (m) return m.esc && m.esc();
    if (hideMenu()) return; if (typing) return ae.blur();
    S.sel.clear(); markSel(); document.body.classList.remove('side-open'); return;
  }
  if (typing || $('.modal-bg') || $('#scr-app').hidden) return;
  const sel = selItems();
  if (e.key === 'Delete' && sel.length) (S.mode === 'trash' ? purge() : trash()).catch(x => toast(x.message, 'err'));
  else if (e.key === 'F2' && sel.length === 1 && S.mode !== 'trash') { e.preventDefault(); rename().catch(x => toast(x.message, 'err')); }
  else if (e.key === ' ' && sel.length === 1 && sel[0].type === 'file' && S.mode !== 'trash') { e.preventDefault(); preview(sel[0]); }
  else if (e.key === 'Enter' && sel.length === 1) open(sel[0]);
  else if (mod && e.key.toLowerCase() === 'a') { e.preventDefault(); S.items.forEach(i => S.sel.add(key(i))); markSel(); }
});
window.addEventListener('unhandledrejection', e => { console.error(e.reason); toast(e.reason?.message || String(e.reason), 'err'); });

// ---------- Auth-Bildschirme ----------
async function showRecovery(rec) {
  const b = h(`<div><p>Das ist dein <b>Wiederherstellungscode</b>. Er wird <b>nur jetzt</b> angezeigt. Ohne ihn sind deine Daten bei vergessenem Passwort verloren.</p><div class="rec">${rec}</div><button type="button" class="btn">Kopieren</button><label class="chk"><input type="checkbox"> Ich habe den Code sicher aufbewahrt.</label></div>`);
  b.querySelector('button').onclick = () => copy(rec);
  await modal({ title: 'Wiederherstellungscode', body: b, noClose: 1, buttons: [{ label: 'Weiter', primary: 1, run: () => { if (!b.querySelector('input').checked) throw new Error('Bitte bestätige, dass du den Code gesichert hast.'); } }] });
}
$('#f-setup').onsubmit = busy(async el => {
  if (el.pw.value.length < 10) throw new Error('Passwort muss mindestens 10 Zeichen haben');
  if (el.pw.value !== el.pw2.value) throw new Error('Passwörter stimmen nicht überein');
  const username = el.user.value.trim().toLowerCase(), email = el.email.value.trim();
  const vkRaw = C.rand(32), salt = C.b64url(C.rand(16)), saltRec = C.b64url(C.rand(16)), rec = C.genRecovery();
  const { key: k, auth } = await C.deriveFromPassword(el.pw.value, salt), rk = await C.deriveRecovery(rec, saltRec);
  const vault = C.b64(await C.encrypt(k, vkRaw));
  await api('POST', '/auth/setup', { username, email, salt, auth, vault, saltRec, vaultRec: C.b64(await C.encrypt(rk, vkRaw)) });
  S.vk = await C.importKey(vkRaw); vkRaw.fill(0); S.user = { username, email, salt, vault };
  await showRecovery(rec); await enterApp();
});
$('#f-login').onsubmit = busy(async el => {
  const username = el.user.value.trim().toLowerCase(), { salt } = await api('POST', '/auth/salt', { username });
  const { key: k, auth } = await C.deriveFromPassword(el.pw.value, salt);
  await openVault(await api('POST', '/auth/login', { username, auth }), k);
});
$('#f-unlock').onsubmit = busy(async el => { const { key: k } = await C.deriveFromPassword(el.pw.value, S.user.salt); await openVault(S.user, k); });
$('#unlock-out').onclick = e => { e.preventDefault(); logout(); };
let resetUser = '';
$('#to-reset').onclick = e => { e.preventDefault(); $('#f-reset1').hidden = false; $('#f-reset2').hidden = true; show('reset'); };
$$('.to-login').forEach(a => a.onclick = e => { e.preventDefault(); show('login'); });
$('#f-reset1').onsubmit = busy(async el => {
  resetUser = el.user.value.trim().toLowerCase();
  await api('POST', '/auth/reset/request', { username: resetUser });
  $('#f-reset1').hidden = true; $('#f-reset2').hidden = false;
  toast('Falls der Benutzer existiert, wurde ein Code per E-Mail gesendet.');
});
$('#f-reset2').onsubmit = busy(async el => {
  if (el.pw.value.length < 10) throw new Error('Passwort muss mindestens 10 Zeichen haben');
  if (el.pw.value !== el.pw2.value) throw new Error('Passwörter stimmen nicht überein');
  const code = el.code.value.trim(), v = await api('POST', '/auth/reset/vault', { username: resetUser, code });
  let raw;
  try { raw = await C.decrypt(await C.deriveRecovery(el.rec.value, v.saltRec), C.unb64(v.vaultRec)); } catch { throw new Error('Wiederherstellungscode falsch'); }
  const salt = C.b64url(C.rand(16)), { key: k, auth } = await C.deriveFromPassword(el.pw.value, salt);
  await api('POST', '/auth/reset/complete', { username: resetUser, code, salt, auth, vault: C.b64(await C.encrypt(k, raw)) });
  raw.fill(0); el.pw.value = el.pw2.value = el.rec.value = '';
  toast('Passwort zurückgesetzt. Bitte neu anmelden.'); show('login');
});

// ---------- Isolierte Freigabe-Ansicht ----------
async function shareView(id) {
  show('share');
  const box = $('#share-box'), head = `<div class="logo">${I.lock}<span>ZK Drive</span></div>`;
  try {
    const hash = location.hash.slice(1);
    if (!hash) throw new Error('Der Link ist unvollständig (Schlüssel fehlt).');
    const k = await C.importKey(C.unb64(hash)), m = await api('GET', '/s/' + encodeURIComponent(id));
    let name, mime;
    try { name = await C.decStr(k, m.name); mime = await C.decStr(k, m.mime); } catch { throw new Error('Schlüssel ungültig – bitte Link prüfen.'); }
    box.innerHTML = `${head}<div class="sfile"><span class="ic ${kind({ type: 'file', name, mime })}">${I[kind({ type: 'file', name, mime })]}</span><div><b></b><div class="muted">${fmt(m.size)}${m.expires ? ' · gültig bis ' + new Date(m.expires).toLocaleString('de-DE') : ''}</div></div></div>${m.burn ? '<p class="warn">Burn after reading: Die Datei wird nach dem Download unwiderruflich gelöscht.</p>' : ''}<button type="button" class="btn primary">${I.down}<span>Herunterladen</span></button><p class="muted small">Ende-zu-Ende verschlüsselt – die Entschlüsselung erfolgt ausschließlich in deinem Browser.</p>`;
    box.querySelector('b').textContent = name;
    const btn = box.querySelector('button');
    btn.onclick = async () => {
      btn.disabled = true;
      try {
        if (await saveFile(`/api/s/${encodeURIComponent(id)}/stream`, k, { name, mime, size: m.size, chunks: m.chunks })) {
          toast('Download abgeschlossen');
          if (m.burn) { btn.remove(); box.querySelector('.warn').textContent = 'Die Datei wurde nach dem Download gelöscht.'; }
        }
      } catch (e) { toast(e.message, 'err'); } finally { btn.disabled = false; }
    };
  } catch (e) { box.innerHTML = head + '<p class="err"></p>'; box.querySelector('.err').textContent = e.message; }
}

// ---------- Drive-API für Addons & Start ----------
Object.assign(D, {
  state: S, api, toast, modal, h, I, fmt, refresh, getBlob, saveBlob, download, children, preview, selection: selItems,
  upload: (file, folder) => uploadOne(file, folder), replaceFile: (f, file) => uploadOne(file, null, f),
  renameFile: async (f, n) => api('PATCH', '/files/' + f.id, { name: await C.encStr(f.key, n) })
});
(async function boot() {
  applyTheme(ls('zk-theme') || 'light');
  const m = location.pathname.match(/^\/s\/([\w-]+)/);
  if (m) return shareView(m[1]);
  try {
    const st = await api('GET', '/status');
    if (st.setup) return show('setup');
    try { S.user = await api('GET', '/auth/me'); $('#unlock-user').textContent = S.user.username; show('unlock'); } catch { show('login'); }
  } catch (e) { show('login'); toast('Server nicht erreichbar: ' + e.message, 'err'); }
})();
