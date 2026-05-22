import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const dbPath = process.env.DB_PATH || path.join(process.cwd(), 'data', 'locutor.db');

// Ensure the directory exists
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

export const db = new Database(dbPath);

// Initialize schema
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS announcement_templates (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    type          TEXT NOT NULL,
    name          TEXT NOT NULL,
    text_template TEXT NOT NULL,
    voice         TEXT DEFAULT 'ef_dora',
    speed         REAL DEFAULT 0.95,
    active        BOOLEAN DEFAULT 1,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS generated_audios (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    template_id     INTEGER REFERENCES announcement_templates(id),
    filename        TEXT NOT NULL UNIQUE,
    filepath        TEXT NOT NULL,
    text_rendered   TEXT NOT NULL,
    duration_ms     INTEGER,
    file_size_bytes INTEGER,
    voice           TEXT,
    azuracast_media_id TEXT,
    generated_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    valid_until     DATETIME,
    status          TEXT DEFAULT 'ready'
  );

  CREATE TABLE IF NOT EXISTS playback_schedules (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    audio_id        INTEGER REFERENCES generated_audios(id),
    cron_expression TEXT,
    azuracast_playlist_id TEXT,
    enabled         BOOLEAN DEFAULT 1,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS generation_logs (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    job_type     TEXT,
    status       TEXT,
    details      TEXT,
    audios_generated INTEGER,
    duration_ms  INTEGER,
    started_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    finished_at  DATETIME
  );
`);

export default db;