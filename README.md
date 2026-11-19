# ZK-Drive

**Your own end-to-end encrypted cloud – free on Cloudflare, deployed in one click.**

ZK stands for **Zero-Knowledge**: The server stores your files, but knows nothing about them. Everything is encrypted in your browser before it is uploaded. Neither Cloudflare, nor the operator, nor anyone with access to the database can read file contents, file names, or folder names.

- Google Drive-like interface: folders, search, drag & drop, right-click menu, list and grid view
- No framework, no build step, no dependencies – pure HTML, CSS, and JavaScript, under 100 KB of source code
- Runs completely on Cloudflare's free tier, no credit card required

---

## Contents

- [Features](#features)
- [Installation in 5 Minutes](#installation-in-5-minutes)
- [Usage](#usage)
- [Security & Encryption](#security--encryption)
- [Limits](#limits)
- [Project Structure](#project-structure)
- [Writing Addons](#writing-addons)
- [Manual Deployment](#manual-deployment)
- [Troubleshooting](#troubleshooting)

---

## Features

| Area | Capabilities |
|---|---|
| **Files** | Upload via button or drag & drop, folders, rename, move, trash with restore |
| **Large Files** | Split into 24 MB chunks in the browser, individually encrypted, and uploaded in parallel |
| **Preview** | Images, PDFs, text/code, audio, and video – decrypted in RAM only |
| **ZIP Download** | Multiple files or entire folders as a ZIP, assembled in the browser |
| **Notes** | Create and edit encrypted `.md`/`.txt` notes directly inside the Drive |
| **Sharing** | Link for a single file, with expiration time (1 hr / 24 hrs / 7 days / unlimited) and **Burn after reading** |
| **Account** | Login, change password, password reset via email code + recovery code |
| **Themes** | Light, Dark, and **Nightmare** (Neon Purple/Blue) – switchable instantly |
| **Extensible** | Addon system with hooks for context menu, preview, toolbar, and upload |

**Keyboard Shortcuts:** `Ctrl+K` Search · `Del` Move to trash · `F2` Rename · `Space` Quick preview · `Esc` Close

---

## Installation in 5 Minutes

All you need is a free Cloudflare account and Windows. You do **not** need to create a Worker beforehand; the script handles that for you.

### 1. Cloudflare Account
Sign up at [dash.cloudflare.com](https://dash.cloudflare.com) and verify your email.

### 2. Set your workers.dev Subdomain
Click **Workers & Pages** on the left. On the right, you will see **"Your subdomain"**. If you haven't set one yet, choose a name (e.g., `yourname`). Your cloud will later be accessible at `https://cloud.yourname.workers.dev`.

### 3. Install Node.js
Install the **LTS** version from [nodejs.org](https://nodejs.org) (default settings are fine).

### 4. Download the Project
Download the repository as a ZIP (**Code → Download ZIP**) and extract it – or clone it:

```bash
git clone [https://github.com/](https://github.com/)<your-name>/zk-drive.git
```

### 5. Double-click `deploy.bat`
The script handles everything automatically:

1. Cloudflare login in your browser (click **Allow** once)
2. Creates the D1 database `zk-drive` and sets up the tables
3. Creates the KV storage `zk-drive-files` for the encrypted files
4. Uploads the `cloud` Worker
5. Optional: Prompts for a Resend API key for password reset emails (press Enter to skip)

At the end, it displays your link. Open it, set up your account – done.

> ⚠️ **Save your recovery code!** During setup, a 24-character code is displayed once. Without it, if you forget your password, there is **no** way to recover your files – not even for the operator. That is the price of true zero-knowledge.

`deploy.bat` can be run again at any time (e.g., after code changes). Existing data remains intact.

**Linux/macOS:** Instead of the `.bat` file, simply run `node deploy.mjs` in the project folder.

---

## Usage

- **Upload:** Drag files into the window or click **+ New → Upload file**
- **Move:** Drag a file onto a folder or into the breadcrumb bar, or right-click → *Move*
- **Multi-select:** `Ctrl`/`Shift` + click, then right-click → *Download as ZIP*
- **Share:** Right-click → *Share*, choose an expiration time, copy the link
- **After reloading the page**, the app will ask for your password again – the key is intentionally kept only in RAM, never in browser storage.

### Forgot Password
1. On the login page, click **Forgot password** → enter your username
2. Enter the 6-digit code from your email + recovery code + new password
3. All files remain intact, and all other sessions are logged out

If you haven't configured an email key, the code will appear in the Worker log:

```bash
npx wrangler tail
```

### Set up Email Delivery (Optional)
1. Create an account at [resend.com](https://resend.com) and generate a key under **API Keys**
2. Run `deploy.bat` again and enter the key in the final step

With the default sender `drive@resend.dev`, Resend only delivers to your own account email address. To send to any recipient, verify your own domain in Resend and set it as the sender.

---

## Security & Encryption

All cryptography runs in the browser via the **Web Crypto API**. The server only ever sees encrypted bytes.

```
Password ──PBKDF2 (310,000 rounds)──┬──► Encryption Key ──► unlocks VaultKey   (never leaves the browser)
                                    └──► Auth Value ──────► Server (hashed again server-side)

VaultKey (256-bit, random)
 ├─ encrypted with Password         → encrypted_vault_pw
 ├─ encrypted with Recovery Code    → encrypted_vault_recovery
 └─ encrypts every FileKey + all folder names

FileKey (256-bit, per file)
 └─ encrypts file name, type, and every chunk (AES-256-GCM, unique IV per chunk)
```

- **AES-256-GCM** for all data; each chunk has its own random IV and is bound to its position (swapped or missing chunks are detected)
- **Password ≠ Login:** The server only receives a derived authentication value, never the password or the encryption key
- **Sessions** stored as `HttpOnly`/`Secure`/`SameSite=Strict` cookies, saved in the database only as hashes, valid for 30 days
- **Protection:** CSRF checks, lockout after 5 failed logins (10 min), reset codes valid for 15 min with max. 5 attempts

### How Sharing Works Without Exposing the Key

```
[https://cloud.yourname.workers.dev/s/](https://cloud.yourname.workers.dev/s/)<shareId>#<FileKey>
                                              └─ Fragment: never sent to the server by the browser
```

The guest downloads the encrypted file and decrypts it locally using the key from the `#` fragment. They only get access to that single file – no login, no access to other files. With **Burn after reading**, the link becomes invalid as soon as the download starts, and the file is deleted once the transfer completes.

### What the Server Still Sees
Zero-knowledge applies to contents and names. **Metadata** remains visible: file sizes, number of files, folder structure, timestamps, IP addresses upon access, username, and email address.

---

## Limits

On the free Cloudflare tier:

| Resource | Limit |
|---|---|
| Storage (Workers KV) | **1 GB** total |
| Uploads | approx. 1,000 chunks of 24 MB per day (≈ 24 GB/day) |
| Database (D1) | 500 MB – enough for hundreds of thousands of file entries |
| Worker Requests | 100,000 per day |
| ZIP Download | built in RAM, max. approx. 4 GB |

The storage limit can be adjusted in `wrangler.toml` via `QUOTA_GB`. For more than 1 GB, storage can be switched to **Cloudflare R2** (10 GB free, requires a payment method) – the API is already designed for it; only `worker.js` and `wrangler.toml` need to be adapted.

---

## Project Structure

```
zk-drive/
├─ deploy.bat              One-click deployment (Windows)
├─ deploy.mjs              Deployment logic (Node.js)
├─ wrangler.toml           Cloudflare configuration (D1, KV, Assets)
├─ worker.js               Entry point: /api/* → API, everything else → static files
├─ schema.sql              Tables: users, sessions, folders, files, chunks, shares, reset_codes
├─ functions/api/
│  └─ [[route]].js         REST & streaming API
└─ public/
   ├─ index.html           App UI, login, share view, dialogs
   ├─ app.js               State, rendering, context menu, drag & drop, shortcuts
   ├─ crypto.js            Web Crypto (PBKDF2, AES-GCM) + ZIP builder
   ├─ addons.js            Addon system + built-in addons
   ├─ style.css            Layout, grid/list view, animations
   └─ themes.css           Light, Dark, Nightmare
```

---

## Writing Addons

New features can be added without modifying the core code:

```js
Drive.registerAddon({
  name: 'hello-world',

  // Entry in the right-click context menu
  onContextMenu(items, ctx) {
    items.push({ label: 'Say hello', run: () => Drive.toast('Hello!') });
  },

  // Custom preview for specific file types – return a DOM element or null
  onPreview(file, blob) { return null; },

  // Button in the toolbar
  onToolbar(container) {},

  // Before upload: modify the file or reject it by returning false
  beforeUpload(file) { return file; }
});
```

Built-in addons (in `public/addons.js`): Quick preview, ZIP download, encrypted notes, storage indicator.

---

## Manual Deployment

If you prefer not to use `deploy.bat`:

```bash
npx wrangler login
npx wrangler d1 create zk-drive                 # add database_id to wrangler.toml
npx wrangler d1 execute zk-drive --remote --file=schema.sql
npx wrangler kv namespace create zk-drive-files # add id to wrangler.toml
npx wrangler deploy
npx wrangler secret put MAIL_API_KEY            # optional
npx wrangler secret put MAIL_FROM               # optional
```

---

## Troubleshooting

| Issue | Solution |
|---|---|
| `Node.js missing` | Install Node.js, close the window, restart `deploy.bat` |
| Windows: "Windows protected your PC" | Click **More info → Run anyway** |
| Page doesn't load after deployment | Wait 2–5 minutes; new subdomains take a moment to propagate |
| Notice "Expected …" | Your workers.dev subdomain has a different name – use the displayed link |
| "Storage full" | 1 GB limit reached – empty the trash or switch to R2 |
| Reset email doesn't arrive | Check your mail key or read the code in the logs via `npx wrangler tail` |
| View logs | Run `npx wrangler tail` in the project folder |
