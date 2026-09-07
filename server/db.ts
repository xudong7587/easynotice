import fs from 'node:fs';
import Database from 'better-sqlite3';
import { dbPath } from './config.js';
import { encryptSecret, encryptStoredData, isEncryptedPayload } from './crypto.js';
import { inferLegacyRecipeId } from './recipes.js';
import { redactSensitiveText } from './security.js';

export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    is_secret INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS admin (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    password_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS channels (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('wecom_app', 'wecom_robot', 'telegram', 'bark')),
    config_encrypted TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    last_status TEXT NOT NULL DEFAULT 'untested',
    last_error TEXT,
    last_success_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sources (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    recipe_id TEXT NOT NULL DEFAULT 'generic',
    token_hash TEXT NOT NULL UNIQUE,
    token_encrypted TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    route_mode TEXT NOT NULL DEFAULT 'failover' CHECK (route_mode IN ('failover', 'broadcast')),
    default_image_url TEXT,
    default_image_asset_id TEXT REFERENCES assets(id) ON DELETE SET NULL,
    default_link_url TEXT,
    last_received_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS source_channels (
    source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
    channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (source_id, channel_id)
  );

  CREATE TABLE IF NOT EXISTS ugreen_collectors (
    source_id TEXT PRIMARY KEY REFERENCES sources(id) ON DELETE CASCADE,
    config_encrypted TEXT NOT NULL,
    interval_minutes INTEGER NOT NULL DEFAULT 5 CHECK (interval_minutes BETWEEN 1 AND 60),
    import_recent INTEGER NOT NULL DEFAULT 0,
    initialized INTEGER NOT NULL DEFAULT 0,
    last_checked_at INTEGER,
    last_success_at INTEGER,
    last_error TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS ugreen_seen_messages (
    source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
    fingerprint TEXT NOT NULL,
    seen_at INTEGER NOT NULL,
    PRIMARY KEY (source_id, fingerprint)
  );

  CREATE TABLE IF NOT EXISTS ugreen_collector_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
    trigger_type TEXT NOT NULL CHECK (trigger_type IN ('scheduled', 'manual')),
    status TEXT NOT NULL CHECK (status IN ('running', 'success', 'failed')),
    started_at INTEGER NOT NULL,
    completed_at INTEGER,
    found_count INTEGER NOT NULL DEFAULT 0,
    seen_count INTEGER NOT NULL DEFAULT 0,
    queued_count INTEGER NOT NULL DEFAULT 0,
    newest_message_at INTEGER,
    error TEXT
  );

  CREATE TABLE IF NOT EXISTS assets (
    id TEXT PRIMARY KEY,
    original_name TEXT NOT NULL,
    stored_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS rules (
    id TEXT PRIMARY KEY,
    source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    priority INTEGER NOT NULL DEFAULT 0,
    match_field TEXT NOT NULL DEFAULT 'always',
    match_operator TEXT NOT NULL DEFAULT 'always',
    match_value TEXT NOT NULL DEFAULT '',
    title_template TEXT,
    body_template TEXT,
    image_url TEXT,
    image_asset_id TEXT REFERENCES assets(id) ON DELETE SET NULL,
    link_template TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
    request_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    event_type TEXT NOT NULL,
    severity TEXT NOT NULL,
    image_url TEXT,
    image_asset_id TEXT REFERENCES assets(id) ON DELETE SET NULL,
    link_url TEXT,
    raw_json TEXT NOT NULL,
    matched_rule_id TEXT REFERENCES rules(id) ON DELETE SET NULL,
    error TEXT,
    received_at INTEGER NOT NULL,
    processed_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS deliveries (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    attempt INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL,
    started_at INTEGER,
    completed_at INTEGER,
    duration_ms INTEGER,
    http_status INTEGER,
    response_excerpt TEXT,
    error TEXT
  );

  CREATE TABLE IF NOT EXISTS wecom_callback_events (
    id TEXT PRIMARY KEY,
    channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    message_id TEXT,
    message_type TEXT NOT NULL DEFAULT '',
    event_type TEXT NOT NULL DEFAULT '',
    from_user TEXT NOT NULL DEFAULT '',
    raw_xml TEXT NOT NULL,
    received_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_events_status_received ON events(status, received_at);
  CREATE INDEX IF NOT EXISTS idx_events_source_received ON events(source_id, received_at DESC);
  CREATE INDEX IF NOT EXISTS idx_deliveries_event ON deliveries(event_id);
  CREATE INDEX IF NOT EXISTS idx_rules_source_priority ON rules(source_id, priority);
  CREATE INDEX IF NOT EXISTS idx_wecom_callback_channel_received ON wecom_callback_events(channel_id, received_at DESC);
  CREATE INDEX IF NOT EXISTS idx_ugreen_collectors_due ON ugreen_collectors(last_checked_at);
  CREATE INDEX IF NOT EXISTS idx_ugreen_seen_source_time ON ugreen_seen_messages(source_id, seen_at DESC);
  CREATE INDEX IF NOT EXISTS idx_ugreen_runs_source_time ON ugreen_collector_runs(source_id, started_at DESC);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_wecom_callback_message_id ON wecom_callback_events(channel_id, message_id) WHERE message_id IS NOT NULL;
`);

function ensureColumn(table: string, column: string, definition: string): void {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!columns.some((item) => item.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

ensureColumn('sources', 'default_image_url', 'TEXT');
ensureColumn('sources', 'default_image_asset_id', 'TEXT REFERENCES assets(id) ON DELETE SET NULL');
ensureColumn('sources', 'default_link_url', 'TEXT');
ensureColumn('events', 'image_asset_id', 'TEXT REFERENCES assets(id) ON DELETE SET NULL');

function protectDatabaseFiles(): void {
  for (const file of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
    if (!fs.existsSync(file)) continue;
    try { fs.chmodSync(file, 0o600); } catch { /* Best effort on NAS filesystems without POSIX modes. */ }
  }
}

const migrateLegacySourceRecipes = db.transaction(() => {
  const sources = db.prepare("SELECT id, name, recipe_id FROM sources WHERE recipe_id = 'generic'")
    .all() as Array<{ id: string; name: string; recipe_id: string }>;
  const update = db.prepare('UPDATE sources SET recipe_id = ?, updated_at = ? WHERE id = ?');
  for (const source of sources) {
    const recipeId = inferLegacyRecipeId(source.name, source.recipe_id);
    if (recipeId !== source.recipe_id) update.run(recipeId, Date.now(), source.id);
  }
});

// A collector row is the durable source of truth for a UGREEN entrance. Older
// builds could save that entrance back as a generic webhook, which made the
// scheduler silently skip it forever. Repair existing databases on startup.
const repairCollectorSourceRecipes = db.transaction(() => {
  const now = Date.now();
  db.prepare(`
    UPDATE sources SET recipe_id = 'ugreen-dxp', updated_at = ?
    WHERE recipe_id <> 'ugreen-dxp'
      AND id IN (SELECT source_id FROM ugreen_collectors)
  `).run(now);
});

const protectLegacyPayloads = db.transaction(() => {
  const events = db.prepare("SELECT id, raw_json FROM events WHERE raw_json NOT LIKE 'v1.%'")
    .all() as Array<{ id: string; raw_json: string }>;
  const updateEvent = db.prepare('UPDATE events SET raw_json = ? WHERE id = ?');
  for (const event of events) {
    let value: unknown;
    try { value = JSON.parse(event.raw_json); } catch { value = { content: redactSensitiveText(event.raw_json) }; }
    updateEvent.run(encryptStoredData(value), event.id);
  }

  const callbacks = db.prepare("SELECT id, raw_xml FROM wecom_callback_events WHERE raw_xml NOT LIKE 'v1.%'")
    .all() as Array<{ id: string; raw_xml: string }>;
  const updateCallback = db.prepare('UPDATE wecom_callback_events SET raw_xml = ? WHERE id = ?');
  for (const callback of callbacks) {
    if (!isEncryptedPayload(callback.raw_xml)) updateCallback.run(encryptSecret(callback.raw_xml), callback.id);
  }
});

migrateLegacySourceRecipes();
repairCollectorSourceRecipes();
protectLegacyPayloads();
protectDatabaseFiles();

const now = Date.now();
const insertSetting = db.prepare(`
  INSERT INTO settings (key, value, is_secret, updated_at)
  VALUES (?, ?, ?, ?)
  ON CONFLICT(key) DO NOTHING
`);

insertSetting.run('app_name', 'EasyNotice', 0, now);
insertSetting.run('base_url', '', 0, now);
insertSetting.run('setup_complete', 'false', 0, now);
insertSetting.run('ai_config', '', 1, now);

export function getSetting(key: string, fallback = ''): string {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value ?? fallback;
}

export function setSetting(key: string, value: string, isSecret = false): void {
  db.prepare(`
    INSERT INTO settings (key, value, is_secret, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, is_secret = excluded.is_secret, updated_at = excluded.updated_at
  `).run(key, value, isSecret ? 1 : 0, Date.now());
}

export function purgeExpiredSessions(): void {
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
}
