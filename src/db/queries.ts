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

const updateCsatFeedbackStmt = db.prepare(
  "UPDATE csat_responses SET feedback_message = ? WHERE conv_uuid = ?"
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

/** Update the feedback comment for an existing CSAT response. */
export function updateCsatFeedback(convUuid: string, feedbackMessage: string): void {
  updateCsatFeedbackStmt.run(feedbackMessage, convUuid);
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

// ── Bot-resolved tracking (prevent double resolved DMs) ──────────────────────

const markBotResolvedStmt = db.prepare(
  "INSERT OR IGNORE INTO bot_resolved (chatwoot_conv_id) VALUES (?)"
);

const consumeBotResolvedStmt = db.prepare(
  "DELETE FROM bot_resolved WHERE chatwoot_conv_id = ?"
);

/**
 * Mark that the bot itself resolved this conversation (e.g. via !close).
 * The webhook handler can then consume this flag to skip the duplicate DM.
 */
export function markBotResolved(convId: number): void {
  markBotResolvedStmt.run(convId);
}

/**
 * Consume (and delete) the bot-resolved flag for this conversation.
 * Returns true if the flag existed (meaning the bot resolved it).
 */
export function consumeBotResolved(convId: number): boolean {
  const result = consumeBotResolvedStmt.run(convId);
  return result.changes > 0;
}

// ── Retry queue ──────────────────────────────────────────────────────────────

export interface RetryJob {
  id: number;
  type: "message" | "csat";
  payload: string;
  attempts: number;
  max_retries: number;
  created_at: string;
  next_at: string;
}

const enqueueStmt = db.prepare(
  `INSERT INTO retry_queue (type, payload, max_retries)
   VALUES (?, ?, ?)`
);

const pendingJobsStmt = db.prepare<RetryJob, []>(
  `SELECT * FROM retry_queue
   WHERE attempts < max_retries AND next_at <= datetime('now')
   ORDER BY created_at ASC
   LIMIT 50`
);

// Exponential back-off: 1m, 2m, 4m, 8m, … capped at 60m
// Note: SQLite has no POWER() — use bit-shift (1 << attempts) instead.
const bumpAttemptExpStmt = db.prepare(
  `UPDATE retry_queue
   SET attempts = attempts + 1,
       next_at  = datetime('now', '+' || MIN(1 << attempts, 60) || ' minutes')
   WHERE id = ?`
);

const deleteJobStmt = db.prepare(
  "DELETE FROM retry_queue WHERE id = ?"
);

const deleteDeadJobsStmt = db.prepare(
  "DELETE FROM retry_queue WHERE attempts >= max_retries"
);

const queueSizeStmt = db.prepare<{ cnt: number }, []>(
  "SELECT COUNT(*) as cnt FROM retry_queue"
);

/** Add a job to the retry queue. */
export function enqueueRetry(
  type: "message" | "csat",
  payload: Record<string, unknown>,
  maxRetries = 10
): void {
  enqueueStmt.run(type, JSON.stringify(payload), maxRetries);
}

/** Get all jobs that are due for retry. */
export function getPendingRetryJobs(): RetryJob[] {
  return pendingJobsStmt.all();
}

/** Bump the attempt count and push next_at with exponential back-off. */
export function bumpRetryAttempt(jobId: number): void {
  bumpAttemptExpStmt.run(jobId);
}

/** Remove a successfully processed job. */
export function deleteRetryJob(jobId: number): void {
  deleteJobStmt.run(jobId);
}

/** Purge jobs that have exceeded max retries. */
export function purgeDeadRetryJobs(): void {
  deleteDeadJobsStmt.run();
}

/** Return the number of jobs currently in the retry queue. */
export function getRetryQueueSize(): number {
  return queueSizeStmt.get()?.cnt ?? 0;
}
