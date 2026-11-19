// ZK-Drive API – Cloudflare Pages Function. Der Server sieht nur Chiffretexte.
const te = new TextEncoder(), DAY = 864e5, MAXC = 26 * 1024 * 1024, PCH = 24 * 1024 * 1024;
const J = (d, s = 200, h = {}) => new Response(JSON.stringify(d), { status: s, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...h } });
const E = (m, s = 400) => J({ error: m }, s);
const now = () => Date.now();
const rnd = n => crypto.getRandomValues(new Uint8Array(n));
const b64u = b => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
const sha = async s => hex(await crypto.subtle.digest('SHA-256', te.encode(s)));
const q = (env, s, ...a) => env.DB.prepare(s).bind(...a);
const body = async c => { try { return await c.req.json(); } catch { return {}; } };
const str = (v, max = 8192) => typeof v === 'string' && v.length > 0 && v.length <= max;
const eq = (a, b) => { if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return !r; };
const norm = n => String(n || '').trim().toLowerCase();
const user = (env, n) => q(env, 'SELECT * FROM users WHERE username=?', norm(n)).first();
const own = (c, t, id) => q(c.env, `SELECT * FROM ${t} WHERE id=? AND user_id=?`, String(id), c.uid).first();
const me = u => ({ username: u.username, email: u.email, salt: u.salt, vault: u.encrypted_vault_pw });
const quota = env => (+env.QUOTA_GB || 10) * 1024 ** 3;

async function pbkdf(secret, salt) {
  const k = await crypto.subtle.importKey('raw', te.encode(secret), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: te.encode(salt), iterations: 100000 }, k, 256));
}
async function newSession(env, uid) {
  const t = b64u(rnd(32));
  await env.DB.batch([q(env, 'DELETE FROM sessions WHERE expires<?', now()), q(env, 'INSERT INTO sessions(id,user_id,expires) VALUES(?,?,?)', await sha(t), uid, now() + 30 * DAY)]);
  return `zk_sid=${t}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${30 * 86400}`;
}
async function auth(c) {
  const m = (c.req.headers.get('Cookie') || '').match(/(?:^|;\s*)zk_sid=([^;]+)/);
  return m ? q(c.env, 'SELECT id,user_id FROM sessions WHERE id=? AND expires>?', await sha(m[1]), now()).first() : null;
}
async function sendMail(env, to, code) {
  if (!env.MAIL_API_KEY) { console.log(`[zk-drive] Reset-Code fuer ${to}: ${code}`); return; }
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { Authorization: 'Bearer ' + env.MAIL_API_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ from: env.MAIL_FROM || 'drive@resend.dev', to: [to], subject: 'Dein ZK-Drive Bestätigungscode', text: `Dein Code zum Zurücksetzen des Passworts: ${code}\n\nGültig für 15 Minuten. Falls du das nicht angefordert hast, ignoriere diese E-Mail.` })
  });
  if (!r.ok) console.error('Mailversand fehlgeschlagen', r.status, await r.text());
}
async function checkCode(env, b) {
  const u = await user(env, b.username); if (!u) return null;
  const r = await q(env, 'SELECT * FROM reset_codes WHERE user_id=?', u.id).first();
  if (!r || r.expires < now() || r.attempts >= 5) return null;
  if (!eq(await sha(u.id + ':' + String(b.code || '').trim()), r.code_hash)) {
    await q(env, 'UPDATE reset_codes SET attempts=attempts+1 WHERE user_id=?', u.id).run(); return null;
  }
  return u;
}
async function subtree(env, uid, id) {
  return (await q(env, 'WITH RECURSIVE t(id) AS (SELECT id FROM folders WHERE id=? AND user_id=? UNION SELECT f.id FROM folders f JOIN t ON f.parent_id=t.id) SELECT id FROM t', id, uid).all()).results.map(r => r.id);
}
async function delChunks(env, ids) {
  for (let i = 0; i < ids.length; i += 50) {
    const g = ids.slice(i, i + 50), ph = g.map(() => '?').join(',');
    const ks = (await q(env, `SELECT file_id,n FROM chunks WHERE file_id IN (${ph})`, ...g).all()).results.map(r => `f/${r.file_id}/${r.n}`);
    for (let j = 0; j < ks.length; j += 1000) await env.BUCKET.delete(ks.slice(j, j + 1000));
    await q(env, `DELETE FROM chunks WHERE file_id IN (${ph})`, ...g).run();
  }
}
async function delFiles(env, ids) {
  await delChunks(env, ids);
  for (let i = 0; i < ids.length; i += 50) {
    const g = ids.slice(i, i + 50), ph = g.map(() => '?').join(',');
    await env.DB.batch([q(env, `DELETE FROM shares WHERE file_id IN (${ph})`, ...g), q(env, `DELETE FROM files WHERE id IN (${ph})`, ...g)]);
  }
}
async function delFolders(env, uid, roots) {
  let ids = [];
  for (const r of roots) ids.push(...await subtree(env, uid, r));
  ids = [...new Set(ids)];
  for (let i = 0; i < ids.length; i += 50) {
    const g = ids.slice(i, i + 50), ph = g.map(() => '?').join(',');
    const f = (await q(env, `SELECT id FROM files WHERE user_id=? AND folder_id IN (${ph})`, uid, ...g).all()).results.map(r => r.id);
    await delFiles(env, f);
    await q(env, `DELETE FROM folders WHERE user_id=? AND id IN (${ph})`, uid, ...g).run();
  }
}
// Streamt alle Chunks nacheinander, jeweils mit 4-Byte-Big-Endian-Längenpräfix.
function streamFile(c, f, after) {
  const { readable, writable } = new TransformStream(), w = writable.getWriter();
  c.ctx.waitUntil((async () => {
    try {
      for (let n = 0; n < f.chunks; n++) {
        const o = await c.env.BUCKET.get(`f/${f.id}/${n}`);
        if (!o) throw new Error('Chunk fehlt: ' + n);
        const h = new Uint8Array(4); new DataView(h.buffer).setUint32(0, o.size);
        await w.write(h);
        const r = o.body.getReader();
        for (;;) { const { done, value } = await r.read(); if (done) break; await w.write(value); }
      }
      await w.close();
      if (after) await after();
    } catch (e) { console.error(e); await w.abort(e).catch(() => {}); }
  })());
  return new Response(readable, { headers: { 'content-type': 'application/octet-stream', 'cache-control': 'no-store', 'x-chunks': String(f.chunks) } });
}
async function share(c) {
  const s = await q(c.env, 'SELECT s.*,f.name,f.mime,f.size,f.chunks,f.complete,f.trashed FROM shares s JOIN files f ON f.id=s.file_id WHERE s.id=?', c.p.id).first();
  if (!s || !s.complete) return E('Freigabe nicht gefunden', 404);
  if (s.trashed) return E('Freigabe nicht mehr verfügbar', 410);
  if (s.expires && s.expires < now()) { await q(c.env, 'DELETE FROM shares WHERE id=?', s.id).run(); return E('Link abgelaufen', 410); }
  return s;
}

const routes = [];
const on = (m, p, h, pub) => routes.push([m, new RegExp('^' + p.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$'), h, pub]);

// ---------- Status & Auth ----------
on('GET', '/status', async c => J({ setup: !(await q(c.env, 'SELECT 1 x FROM users LIMIT 1').first()) }), 1);
on('POST', '/auth/setup', async c => {
  const b = await body(c);
  if (await q(c.env, 'SELECT 1 x FROM users LIMIT 1').first()) return E('Bereits eingerichtet', 409);
  if (!str(norm(b.username), 64) || ![b.salt, b.auth, b.vault, b.saltRec, b.vaultRec].every(v => str(v, 512))) return E('Felder fehlen');
  const as = b64u(rnd(16));
  const r = await q(c.env, 'INSERT INTO users(username,email,salt,auth_salt,auth_hash,encrypted_vault_pw,salt_rec,encrypted_vault_recovery,created) VALUES(?,?,?,?,?,?,?,?,?)',
    norm(b.username), String(b.email || '').trim(), b.salt, as, await pbkdf(b.auth, as), b.vault, b.saltRec, b.vaultRec, now()).run();
  return J({ ok: true }, 200, { 'set-cookie': await newSession(c.env, r.meta.last_row_id) });
}, 1);
on('POST', '/auth/salt', async c => {
  const b = await body(c), u = await user(c.env, b.username);
  // Unbekannte Benutzer erhalten ein deterministisches Schein-Salt (keine Enumeration).
  return J({ salt: u ? u.salt : b64u(await crypto.subtle.digest('SHA-256', te.encode('zk-fake:' + norm(b.username) + (c.env.PEPPER || '')))).slice(0, 22) });
}, 1);
on('POST', '/auth/login', async c => {
  const b = await body(c), u = await user(c.env, b.username);
  if (u && u.locked_until > now()) return E('Zu viele Fehlversuche. Bitte in 10 Minuten erneut versuchen.', 429);
  const ok = u ? eq(await pbkdf(String(b.auth || ''), u.auth_salt), u.auth_hash) : (await pbkdf('x', 'y'), false);
  if (!ok) {
    if (u) { const f = u.failed + 1; await q(c.env, 'UPDATE users SET failed=?,locked_until=? WHERE id=?', f >= 5 ? 0 : f, f >= 5 ? now() + 6e5 : 0, u.id).run(); }
    return E('Benutzername oder Passwort falsch', 401);
  }
  await q(c.env, 'UPDATE users SET failed=0,locked_until=0 WHERE id=?', u.id).run();
  return J(me(u), 200, { 'set-cookie': await newSession(c.env, u.id) });
}, 1);
on('POST', '/auth/logout', async c => {
  await q(c.env, 'DELETE FROM sessions WHERE id=?', c.sid).run();
  return J({ ok: true }, 200, { 'set-cookie': 'zk_sid=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0' });
});
on('GET', '/auth/me', async c => J(me(await q(c.env, 'SELECT * FROM users WHERE id=?', c.uid).first())));
on('POST', '/auth/reset/request', async c => {
  const b = await body(c), u = await user(c.env, b.username);
  if (u && u.email) {
    const code = String(new Uint32Array(rnd(4).buffer)[0] % 1e6).padStart(6, '0');
    await q(c.env, 'INSERT OR REPLACE INTO reset_codes(user_id,code_hash,expires,attempts) VALUES(?,?,?,0)', u.id, await sha(u.id + ':' + code), now() + 9e5).run();
    c.ctx.waitUntil(sendMail(c.env, u.email, code));
  }
  return J({ ok: true });
}, 1);
on('POST', '/auth/reset/vault', async c => {
  const u = await checkCode(c.env, await body(c));
  return u ? J({ saltRec: u.salt_rec, vaultRec: u.encrypted_vault_recovery }) : E('Code ungültig oder abgelaufen', 403);
}, 1);
on('POST', '/auth/reset/complete', async c => {
  const b = await body(c), u = await checkCode(c.env, b);
  if (!u) return E('Code ungültig oder abgelaufen', 403);
  if (![b.salt, b.auth, b.vault].every(v => str(v, 512))) return E('Felder fehlen');
  const as = b64u(rnd(16));
  await c.env.DB.batch([
    q(c.env, 'UPDATE users SET salt=?,auth_salt=?,auth_hash=?,encrypted_vault_pw=?,failed=0,locked_until=0 WHERE id=?', b.salt, as, await pbkdf(b.auth, as), b.vault, u.id),
    q(c.env, 'DELETE FROM reset_codes WHERE user_id=?', u.id), q(c.env, 'DELETE FROM sessions WHERE user_id=?', u.id)]);
  return J({ ok: true });
}, 1);
on('POST', '/auth/password', async c => {
  const b = await body(c), u = await q(c.env, 'SELECT * FROM users WHERE id=?', c.uid).first();
  if (!eq(await pbkdf(String(b.oldAuth || ''), u.auth_salt), u.auth_hash)) return E('Aktuelles Passwort falsch', 403);
  if (![b.salt, b.auth, b.vault].every(v => str(v, 512))) return E('Felder fehlen');
  const as = b64u(rnd(16));
  await c.env.DB.batch([
    q(c.env, 'UPDATE users SET salt=?,auth_salt=?,auth_hash=?,encrypted_vault_pw=? WHERE id=?', b.salt, as, await pbkdf(b.auth, as), b.vault, u.id),
    q(c.env, 'DELETE FROM sessions WHERE user_id=? AND id!=?', u.id, c.sid)]);
  return J({ ok: true });
});
on('POST', '/auth/email', async c => {
  const b = await body(c);
  if (!str(b.email, 254) || !b.email.includes('@')) return E('Ungültige E-Mail');
  await q(c.env, 'UPDATE users SET email=? WHERE id=?', b.email.trim(), c.uid).run();
  return J({ ok: true });
});

// ---------- Ordner ----------
on('GET', '/folders', async c => J((await q(c.env, 'SELECT id,parent_id,name,trashed,created FROM folders WHERE user_id=?', c.uid).all()).results));
on('POST', '/folders', async c => {
  const b = await body(c);
  if (!str(b.name, 2048)) return E('Name fehlt');
  if (b.parentId && !await own(c, 'folders', b.parentId)) return E('Zielordner nicht gefunden', 404);
  const id = b64u(rnd(12));
  await q(c.env, 'INSERT INTO folders(id,user_id,parent_id,name,trashed,created) VALUES(?,?,?,?,0,?)', id, c.uid, b.parentId || null, b.name, now()).run();
  return J({ id });
});
async function patch(c, t) {
  const b = await body(c), id = c.p.id;
  if (!await own(c, t, id)) return E('Nicht gefunden', 404);
  const st = [];
  if ('name' in b) { if (!str(b.name, 2048)) return E('Name fehlt'); st.push(q(c.env, `UPDATE ${t} SET name=? WHERE id=?`, b.name, id)); }
  if ('parentId' in b) {
    const p = b.parentId || null;
    if (p) {
      if (!await own(c, 'folders', p)) return E('Zielordner nicht gefunden', 404);
      if (t === 'folders' && (await subtree(c.env, c.uid, id)).includes(p)) return E('Ordner kann nicht in sich selbst verschoben werden');
    }
    st.push(q(c.env, `UPDATE ${t} SET ${t === 'files' ? 'folder_id' : 'parent_id'}=? WHERE id=?`, p, id));
  }
  if ('trashed' in b) st.push(q(c.env, `UPDATE ${t} SET trashed=? WHERE id=?`, b.trashed ? 1 : 0, id));
  if (t === 'files') st.push(q(c.env, 'UPDATE files SET updated=? WHERE id=?', now(), id));
  if (st.length) await c.env.DB.batch(st);
  return J({ ok: true });
}
on('PATCH', '/folders/:id', c => patch(c, 'folders'));
on('DELETE', '/folders/:id', async c => {
  if (!await own(c, 'folders', c.p.id)) return E('Nicht gefunden', 404);
  await delFolders(c.env, c.uid, [c.p.id]);
  return J({ ok: true });
});

// ---------- Dateien ----------
on('GET', '/files', async c => {
  let s = 'SELECT id,folder_id,name,mime,size,chunks,file_key,trashed,created,updated FROM files WHERE user_id=? AND complete=1', a = [c.uid];
  const f = c.url.searchParams.get('folder');
  if (f !== null) { s += f ? ' AND folder_id=?' : ' AND folder_id IS NULL'; if (f) a.push(f); }
  if (c.url.searchParams.get('trash')) s += ' AND trashed=1';
  return J((await q(c.env, s, ...a).all()).results);
});
on('POST', '/files', async c => {
  const b = await body(c), size = b.size, n = b.chunks;
  if (!str(b.name, 4096) || !str(b.mime, 1024) || !str(b.fileKey, 512)) return E('Metadaten fehlen');
  if (!Number.isInteger(size) || size < 0 || !Number.isInteger(n) || n !== Math.max(1, Math.ceil(size / PCH))) return E('Ungültige Größe');
  if (b.folderId && !await own(c, 'folders', b.folderId)) return E('Zielordner nicht gefunden', 404);
  const used = (await q(c.env, 'SELECT COALESCE(SUM(size),0) u FROM files WHERE user_id=?', c.uid).first()).u;
  if (used + size > quota(c.env)) return E('Speicherplatz voll', 413);
  const id = b64u(rnd(16));
  await q(c.env, 'INSERT INTO files(id,user_id,folder_id,name,mime,size,chunks,file_key,complete,trashed,created,updated) VALUES(?,?,?,?,?,?,?,?,0,0,?,?)',
    id, c.uid, b.folderId || null, b.name, b.mime, size, n, b.fileKey, now(), now()).run();
  return J({ id });
});
on('PUT', '/files/:id/chunks/:n', async c => {
  const f = await own(c, 'files', c.p.id), n = +c.p.n;
  if (!f) return E('Nicht gefunden', 404);
  if (!Number.isInteger(n) || n < 0 || n >= f.chunks) return E('Ungültiger Chunk');
  const len = +c.req.headers.get('content-length');
  if (len > MAXC) return E('Chunk zu groß', 413);
  const buf = await c.req.arrayBuffer();
  if (!buf.byteLength || buf.byteLength > MAXC) return E('Ungültige Chunkgröße', 413);
  await c.env.BUCKET.put(`f/${f.id}/${n}`, buf);
  await q(c.env, 'INSERT OR REPLACE INTO chunks(file_id,n,size) VALUES(?,?,?)', f.id, n, buf.byteLength).run();
  return J({ ok: true });
});
on('POST', '/files/:id/complete', async c => {
  const f = await own(c, 'files', c.p.id);
  if (!f) return E('Nicht gefunden', 404);
  const k = (await q(c.env, 'SELECT COUNT(*) k FROM chunks WHERE file_id=?', f.id).first()).k;
  if (k !== f.chunks) return E(`Unvollständig (${k}/${f.chunks})`, 409);
  await q(c.env, 'UPDATE files SET complete=1,updated=? WHERE id=?', now(), f.id).run();
  return J({ ok: true });
});
on('POST', '/files/:id/replace', async c => {
  const f = await own(c, 'files', c.p.id), b = await body(c);
  if (!f) return E('Nicht gefunden', 404);
  if (!Number.isInteger(b.size) || b.size < 0 || b.chunks !== Math.max(1, Math.ceil(b.size / PCH))) return E('Ungültige Größe');
  await delChunks(c.env, [f.id]);
  await q(c.env, 'UPDATE files SET size=?,chunks=?,complete=0,updated=? WHERE id=?', b.size, b.chunks, now(), f.id).run();
  return J({ ok: true });
});
on('GET', '/files/:id/stream', async c => {
  const f = await own(c, 'files', c.p.id);
  return f && f.complete ? streamFile(c, f) : E('Nicht gefunden', 404);
});
on('PATCH', '/files/:id', c => patch(c, 'files'));
on('DELETE', '/files/:id', async c => {
  if (!await own(c, 'files', c.p.id)) return E('Nicht gefunden', 404);
  await delFiles(c.env, [c.p.id]);
  return J({ ok: true });
});
on('POST', '/trash/empty', async c => {
  const f = (await q(c.env, 'SELECT id FROM files WHERE user_id=? AND trashed=1', c.uid).all()).results.map(r => r.id);
  const d = (await q(c.env, 'SELECT id FROM folders WHERE user_id=? AND trashed=1', c.uid).all()).results.map(r => r.id);
  await delFiles(c.env, f); await delFolders(c.env, c.uid, d);
  return J({ ok: true });
});
on('GET', '/usage', async c => J({ used: (await q(c.env, 'SELECT COALESCE(SUM(size),0) u FROM files WHERE user_id=?', c.uid).first()).u, quota: quota(c.env) }));

// ---------- Freigaben ----------
on('POST', '/shares', async c => {
  const b = await body(c), f = await own(c, 'files', b.fileId);
  if (!f || !f.complete) return E('Datei nicht gefunden', 404);
  const ex = Number(b.expiresIn) > 0 ? now() + Number(b.expiresIn) * 1000 : null, id = b64u(rnd(16));
  await q(c.env, 'INSERT INTO shares(id,user_id,file_id,expires,burn,created) VALUES(?,?,?,?,?,?)', id, c.uid, f.id, ex, b.burn ? 1 : 0, now()).run();
  return J({ id });
});
on('GET', '/shares', async c => J((await q(c.env, 'SELECT id,file_id,expires,burn,created FROM shares WHERE user_id=? AND (expires IS NULL OR expires>?) ORDER BY created DESC', c.uid, now()).all()).results));
on('DELETE', '/shares/:id', async c => { await q(c.env, 'DELETE FROM shares WHERE id=? AND user_id=?', c.p.id, c.uid).run(); return J({ ok: true }); });
on('GET', '/s/:id', async c => {
  const s = await share(c);
  return s instanceof Response ? s : J({ name: s.name, mime: s.mime, size: s.size, chunks: s.chunks, burn: !!s.burn, expires: s.expires });
}, 1);
on('GET', '/s/:id/stream', async c => {
  const s = await share(c);
  if (s instanceof Response) return s;
  if (s.burn) {
    // Freigabe sofort atomar entwerten, Datei erst nach vollständigem Stream löschen.
    if (!await q(c.env, 'DELETE FROM shares WHERE id=? RETURNING id', s.id).first()) return E('Link bereits verwendet', 410);
    return streamFile(c, { id: s.file_id, chunks: s.chunks }, () => delFiles(c.env, [s.file_id]));
  }
  return streamFile(c, { id: s.file_id, chunks: s.chunks });
}, 1);

export async function onRequest(ctx) {
  const req = ctx.request, url = new URL(req.url), path = url.pathname.replace(/^\/api/, '') || '/';
  if (!['GET', 'HEAD'].includes(req.method)) {
    const o = req.headers.get('Origin');
    if ((o && o !== url.origin) || req.headers.get('X-ZK') !== '1') return E('CSRF-Prüfung fehlgeschlagen', 403);
  }
  for (const [m, re, h, pub] of routes) {
    if (m !== req.method) continue;
    const mt = path.match(re); if (!mt) continue;
    const c = { req, env: ctx.env, url, ctx, p: mt.groups || {} };
    try {
      if (!pub) { const s = await auth(c); if (!s) return E('Nicht angemeldet', 401); c.uid = s.user_id; c.sid = s.id; }
      return await h(c);
    } catch (e) { console.error(e); return E('Serverfehler: ' + (e.message || e), 500); }
  }
  return E('Nicht gefunden', 404);
}
