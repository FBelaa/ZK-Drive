CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  salt TEXT NOT NULL,              -- Client-Salt fuer PBKDF2(Passwort)
  auth_salt TEXT NOT NULL,         -- Server-Salt fuer Hash des Auth-Werts
  auth_hash TEXT NOT NULL,
  encrypted_vault_pw TEXT NOT NULL,
  salt_rec TEXT NOT NULL,
  encrypted_vault_recovery TEXT NOT NULL,
  failed INTEGER NOT NULL DEFAULT 0,
  locked_until INTEGER NOT NULL DEFAULT 0,
  created INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,             -- SHA-256 des Tokens
  user_id INTEGER NOT NULL,
  expires INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS folders (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  parent_id TEXT,
  name TEXT NOT NULL,              -- AES-GCM(VaultKey)
  trashed INTEGER NOT NULL DEFAULT 0,
  created INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  folder_id TEXT,
  name TEXT NOT NULL,              -- AES-GCM(FileKey)
  mime TEXT NOT NULL,              -- AES-GCM(FileKey)
  size INTEGER NOT NULL,
  chunks INTEGER NOT NULL,
  file_key TEXT NOT NULL,          -- AES-GCM(VaultKey, FileKey)
  complete INTEGER NOT NULL DEFAULT 0,
  trashed INTEGER NOT NULL DEFAULT 0,
  created INTEGER NOT NULL,
  updated INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS chunks (
  file_id TEXT NOT NULL,
  n INTEGER NOT NULL,
  size INTEGER NOT NULL,
  PRIMARY KEY (file_id, n)
);
CREATE TABLE IF NOT EXISTS shares (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  file_id TEXT NOT NULL,
  expires INTEGER,
  burn INTEGER NOT NULL DEFAULT 0,
  created INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS reset_codes (
  user_id INTEGER PRIMARY KEY,
  code_hash TEXT NOT NULL,
  expires INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_folders_user ON folders(user_id, parent_id);
CREATE INDEX IF NOT EXISTS idx_files_user ON files(user_id, folder_id);
CREATE INDEX IF NOT EXISTS idx_shares_file ON shares(file_id);
