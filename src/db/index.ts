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

console.log("[db] SQLite ready.");
