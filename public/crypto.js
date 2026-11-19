// Web-Crypto-Helfer, Stream-Entschlüsselung und ZIP-Builder (stored, CRC32).
export const te = new TextEncoder(), td = new TextDecoder();
const S = crypto.subtle, ITER = 310000;
export const rand = n => crypto.getRandomValues(new Uint8Array(n));
export const b64 = u => { u = new Uint8Array(u); let s = ''; for (let i = 0; i < u.length; i += 32768) s += String.fromCharCode.apply(null, u.subarray(i, i + 32768)); return btoa(s); };
export const b64url = u => b64(u).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const unb64 = s => { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return Uint8Array.from(atob(s), c => c.charCodeAt(0)); };
export const importKey = raw => S.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
const gcm = (iv, aad) => aad ? { name: 'AES-GCM', iv, additionalData: aad } : { name: 'AES-GCM', iv };

// Ausgabe: IV (12 Byte) || Chiffretext+Tag
export async function encrypt(key, data, aad) {
  const iv = rand(12), ct = new Uint8Array(await S.encrypt(gcm(iv, aad), key, data));
  const o = new Uint8Array(12 + ct.length); o.set(iv); o.set(ct, 12); return o;
}
export async function decrypt(key, data, aad) {
  data = new Uint8Array(data);
  return new Uint8Array(await S.decrypt(gcm(data.subarray(0, 12), aad), key, data.subarray(12)));
}
export const encStr = async (k, s) => b64(await encrypt(k, te.encode(s)));
export const decStr = async (k, s) => td.decode(await decrypt(k, unb64(s)));

async function pbkdf2(secret, salt) {
  const k = await S.importKey('raw', te.encode(secret), 'PBKDF2', false, ['deriveBits']);
  return S.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: unb64(salt), iterations: ITER }, k, 256);
}
// Passwort -> Master (PBKDF2) -> HKDF-Split: Verschlüsselungsschlüssel bleibt lokal, nur "auth" geht an den Server.
export async function deriveFromPassword(pw, salt) {
  const m = await S.importKey('raw', await pbkdf2(pw, salt), 'HKDF', false, ['deriveBits', 'deriveKey']);
  const p = info => ({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: te.encode(info) });
  const key = await S.deriveKey(p('zk-drive/enc/v1'), m, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  const auth = b64(await S.deriveBits(p('zk-drive/auth/v1'), m, 256));
  return { key, auth };
}
export const normRec = c => c.toUpperCase().replace(/[^A-Z0-9]/g, '');
export const deriveRecovery = async (code, salt) => importKey(await pbkdf2(normRec(code), salt));
const AL = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 32 Zeichen, ohne I/O/0/1
export const genRecovery = () => [...rand(24)].map(x => AL[x & 31]).join('').match(/.{4}/g).join('-');
export const chunkAad = n => te.encode('chunk:' + n);

// Liest [len u32 BE][iv|ct] Rahmen aus dem Response-Stream und entschlüsselt on-the-fly.
export async function decryptStream(res, key, onChunk, onProg, expect) {
  const rd = res.body.getReader(), parts = [];
  let have = 0, got = 0, len = -1, idx = 0;
  const take = n => {
    const o = new Uint8Array(n); let off = 0;
    while (off < n) { const p = parts[0], k = Math.min(p.length, n - off); o.set(p.subarray(0, k), off); off += k; if (k === p.length) parts.shift(); else parts[0] = p.subarray(k); }
    have -= n; return o;
  };
  for (;;) {
    const { done, value } = await rd.read();
    if (value) { parts.push(value); have += value.length; got += value.length; onProg && onProg(got); }
    for (;;) {
      if (len < 0) { if (have < 4) break; len = new DataView(take(4).buffer).getUint32(0); }
      if (have < len) break;
      await onChunk(await decrypt(key, take(len), chunkAad(idx++)));
      len = -1;
    }
    if (done) break;
  }
  if (len >= 0 || have || (expect != null && idx !== expect)) throw new Error('Download unvollständig oder manipuliert');
}

// ---------- CRC32 + ZIP (ohne Kompression, UTF-8-Flag) ----------
const T = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
export function crc32(d, c = 0) { c = ~c; for (let i = 0; i < d.length; i++) c = T[(c ^ d[i]) & 255] ^ (c >>> 8); return ~c >>> 0; }
const pack = f => { const v = new DataView(new ArrayBuffer(f.reduce((a, [s]) => a + s, 0))); let o = 0; for (const [s, x] of f) { s === 2 ? v.setUint16(o, x, true) : v.setUint32(o, x, true); o += s; } return v; };
export class Zip {
  constructor() { this.parts = []; this.cd = []; this.off = 0; this.n = 0; }
  add(name, data, date = new Date()) {
    const nm = te.encode(name), crc = crc32(data), sz = data.length;
    const t = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
    const d = ((Math.max(1980, date.getFullYear()) - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
    const common = [[2, 0x800], [2, 0], [2, t], [2, d], [4, crc], [4, sz], [4, sz], [2, nm.length], [2, 0]];
    this.parts.push(pack([[4, 0x04034b50], [2, 20], ...common]), nm, data);
    this.cd.push(pack([[4, 0x02014b50], [2, 20], [2, 20], ...common, [2, 0], [2, 0], [2, 0], [4, 0], [4, this.off]]), nm);
    this.off += 30 + nm.length + sz; this.n++;
    if (this.off > 0xFFFFFFFF) throw new Error('ZIP größer als 4 GB wird nicht unterstützt');
  }
  blob() {
    const cs = this.cd.reduce((a, p) => a + p.byteLength, 0);
    const end = pack([[4, 0x06054b50], [2, 0], [2, 0], [2, this.n], [2, this.n], [4, cs], [4, this.off], [2, 0]]);
    return new Blob([...this.parts, ...this.cd, end], { type: 'application/zip' });
  }
}
