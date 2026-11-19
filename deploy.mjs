// Komplett-Deploy auf Cloudflare Workers: cloud.<account>.workers.dev
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';

const DB = 'zk-drive', KV = 'zk-drive-files', WANT = 'cloud.fwunderlich2020.workers.dev';
const W = ['-y', 'wrangler@4'];

const run = (args, { capture = false, input } = {}) => {
  const r = spawnSync('npx', [...W, ...args], { shell: true, encoding: 'utf8', input, stdio: capture || input !== undefined ? ['pipe', 'pipe', 'inherit'] : 'inherit' });
  if (capture && r.stdout) return { ok: r.status === 0, out: r.stdout };
  return { ok: r.status === 0, out: r.stdout || '' };
};
const step = s => console.log(`\n=== ${s} ===`);
const die = m => { console.error(`\nFEHLER: ${m}`); process.exit(1); };
const json = s => { const i = s.search(/[[{]/); return JSON.parse(s.slice(i)); };

step('1/6 Cloudflare-Anmeldung');
const who = run(['whoami'], { capture: true });
if (!who.ok || /not authenticated|not logged in/i.test(who.out)) {
  console.log('Browser öffnet sich – bitte bei Cloudflare anmelden und Zugriff erlauben.');
  if (!run(['login']).ok) die('Anmeldung fehlgeschlagen.');
}

step('2/6 D1-Datenbank');
let list = run(['d1', 'list', '--json'], { capture: true });
if (!list.ok) die('D1-Liste konnte nicht gelesen werden.');
let db = json(list.out).find(d => d.name === DB);
if (!db) {
  process.stdout.write(run(['d1', 'create', DB], { capture: true }).out);
  db = json(run(['d1', 'list', '--json'], { capture: true }).out).find(d => d.name === DB);
}
if (!db) die('D1-Datenbank nicht gefunden.');
const toml = readFileSync('wrangler.toml', 'utf8').replace(/database_id = ".*"/, `database_id = "${db.uuid}"`);
writeFileSync('wrangler.toml', toml);
console.log(`D1 ${DB}: ${db.uuid}`);

step('3/6 Datenbank-Schema');
if (!run(['d1', 'execute', DB, '--remote', '--file=schema.sql', '--yes']).ok) die('Schema konnte nicht ausgeführt werden.');

step('4/6 KV-Speicher für Dateien');
const findKv = () => { const r = run(['kv', 'namespace', 'list'], { capture: true }); if (!r.ok) die('KV-Liste konnte nicht gelesen werden.'); return json(r.out).find(n => n.title === KV || n.title.endsWith('-' + KV)); };
let ns = findKv();
if (!ns) {
  const c = run(['kv', 'namespace', 'create', KV], { capture: true });
  process.stdout.write(c.out);
  ns = findKv();
}
if (!ns) die('KV-Namespace konnte nicht erstellt werden.');
writeFileSync('wrangler.toml', readFileSync('wrangler.toml', 'utf8').replace(/^id = ".*"/m, `id = "${ns.id}"`));
console.log(`KV ${ns.title}: ${ns.id}`);

step('5/6 Worker deployen');
const dep = run(['deploy'], { capture: true });
process.stdout.write(dep.out);
if (!dep.ok) die('Deploy fehlgeschlagen.');
const url = (dep.out.match(/https:\/\/[^\s]+\.workers\.dev/) || [])[0];

step('6/6 E-Mail für Passwort-Reset (optional)');
const rl = createInterface({ input: process.stdin, output: process.stdout });
const key = (await rl.question('Resend API-Key (Enter = überspringen/beibehalten): ')).trim();
if (key) {
  const from = (await rl.question('Absender-Adresse (Enter = drive@resend.dev): ')).trim() || 'drive@resend.dev';
  rl.close();
  run(['secret', 'put', 'MAIL_API_KEY'], { input: key + '\n' });
  run(['secret', 'put', 'MAIL_FROM'], { input: from + '\n' });
} else rl.close();

console.log(`\nFertig! Deine Cloud: ${url || 'https://' + WANT}`);
if (url && !url.includes(WANT)) console.log(`Hinweis: Erwartet war https://${WANT} – deine workers.dev-Subdomain im Konto heißt anders.`);
if (!key) console.log('Ohne Mail-Key erscheint der Reset-Code im Log: npx wrangler tail');
