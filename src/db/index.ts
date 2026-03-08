import { Database } from "bun:sqlite";
import { mkdirSync } from "fs";

mkdirSync("data", { recursive: true });

export const db = new Database("data/diswoot.db", { create: true });

db.run("PRAGMA journal_mode = WAL;");
db.run("PRAGMA foreign_keys = ON;");

db.run(`
  CREATE TABLE IF NOT EXISTS mappings (
    discord_user_id     TEXT PRIMARY KEY,
    chatwoot_contact_id INTEGER NOT NULL,
    chatwoot_source_id  TEXT NOT NULL,
    chatwoot_conv_id    INTEGER NOT NULL,
    created_at          TEXT DEFAULT (datetime('now'))
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS sent_messages (
    chatwoot_message_id INTEGER PRIMARY KEY,
    sent_at             TEXT DEFAULT (datetime('now'))
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS csat_responses (
    conv_uuid        TEXT PRIMARY KEY,
    discord_user_id  TEXT NOT NULL,
    rating           INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    feedback_message TEXT NOT NULL DEFAULT '',
    submitted_at     TEXT DEFAULT (datetime('now'))
  )
`);

// Migration: add feedback_message column if upgrading from an older schema
try {
  db.run(`ALTER TABLE csat_responses ADD COLUMN feedback_message TEXT NOT NULL DEFAULT ''`);
} catch {
  // Column already exists — ignore
}

db.run(`
  CREATE TABLE IF NOT EXISTS ooh_notices (
    chatwoot_conv_id INTEGER PRIMARY KEY,
    sent_at          TEXT DEFAULT (datetime('now'))
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS bot_resolved (
    chatwoot_conv_id INTEGER PRIMARY KEY,
    resolved_at      TEXT DEFAULT (datetime('now'))
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS retry_queue (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    type        TEXT NOT NULL CHECK (type IN ('message', 'csat')),
    payload     TEXT NOT NULL,
    attempts    INTEGER NOT NULL DEFAULT 0,
    max_retries INTEGER NOT NULL DEFAULT 10,
    created_at  TEXT DEFAULT (datetime('now')),
    next_at     TEXT DEFAULT (datetime('now'))
  )
`);

console.log("[db] SQLite ready.");
