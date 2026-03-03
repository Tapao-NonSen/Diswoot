import { db } from "./index";

export interface Mapping {
  discord_user_id: string;
  chatwoot_contact_id: number;
  chatwoot_source_id: string;
  chatwoot_conv_id: number;
  created_at: string;
}

const getStmt = db.prepare<Mapping, [string]>(
  "SELECT * FROM mappings WHERE discord_user_id = ?"
);

const upsertStmt = db.prepare(
  `INSERT INTO mappings (discord_user_id, chatwoot_contact_id, chatwoot_source_id, chatwoot_conv_id)
   VALUES (?, ?, ?, ?)
   ON CONFLICT(discord_user_id) DO UPDATE SET
     chatwoot_contact_id = excluded.chatwoot_contact_id,
     chatwoot_source_id  = excluded.chatwoot_source_id,
     chatwoot_conv_id    = excluded.chatwoot_conv_id`
);

const getByConvStmt = db.prepare<Mapping, [number]>(
  "SELECT * FROM mappings WHERE chatwoot_conv_id = ?"
);

const isSentStmt = db.prepare<{ chatwoot_message_id: number }, [number]>(
  "SELECT chatwoot_message_id FROM sent_messages WHERE chatwoot_message_id = ?"
);

const markSentStmt = db.prepare(
  "INSERT OR IGNORE INTO sent_messages (chatwoot_message_id) VALUES (?)"
);

const cleanOldSentStmt = db.prepare(
  // Keep only the last 24 hours; duplicates within that window are still caught
  "DELETE FROM sent_messages WHERE sent_at < datetime('now', '-1 day')"
);

const hasCsatStmt = db.prepare<{ conv_uuid: string }, [string]>(
  "SELECT conv_uuid FROM csat_responses WHERE conv_uuid = ?"
);

const saveCsatStmt = db.prepare(
  "INSERT OR IGNORE INTO csat_responses (conv_uuid, discord_user_id, rating) VALUES (?, ?, ?)"
);

export function cleanOldSentMessages(): void {
  cleanOldSentStmt.run();
}

export function getMapping(discordUserId: string): Mapping | null {
  return getStmt.get(discordUserId) ?? null;
}

export function saveMapping(
  discordUserId: string,
  contactId: number,
  sourceId: string,
  convId: number
): void {
  upsertStmt.run(discordUserId, contactId, sourceId, convId);
}

export function getMappingByConv(convId: number): Mapping | null {
  return getByConvStmt.get(convId) ?? null;
}

export function isMessageSent(messageId: number): boolean {
  return isSentStmt.get(messageId) !== null;
}

export function markMessageSent(messageId: number): void {
  markSentStmt.run(messageId);
}

export function hasCsatResponse(convUuid: string): boolean {
  return hasCsatStmt.get(convUuid) !== null;
}

export function saveCsatResponse(convUuid: string, discordUserId: string, rating: number): void {
  saveCsatStmt.run(convUuid, discordUserId, rating);
}

// ── Outside-hours notice tracking ────────────────────────────────────────────

const hasOohNoticeStmt = db.prepare<{ chatwoot_conv_id: number }, [number]>(
  "SELECT chatwoot_conv_id FROM ooh_notices WHERE chatwoot_conv_id = ?"
);

const markOohNoticeStmt = db.prepare(
  "INSERT OR IGNORE INTO ooh_notices (chatwoot_conv_id) VALUES (?)"
);

const clearOohNoticeStmt = db.prepare(
  "DELETE FROM ooh_notices WHERE chatwoot_conv_id = ?"
);

/** Returns true if the outside-hours notice was already sent for this conversation. */
export function hasOohNotice(convId: number): boolean {
  return hasOohNoticeStmt.get(convId) !== null;
}

/** Mark that the outside-hours notice has been sent for this conversation. */
export function markOohNotice(convId: number): void {
  markOohNoticeStmt.run(convId);
}

/** Clear the outside-hours notice flag (e.g. when a ticket is resolved, so a new cycle can start). */
export function clearOohNotice(convId: number): void {
  clearOohNoticeStmt.run(convId);
}
