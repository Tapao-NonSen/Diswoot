import { isChatwootHealthy } from "../chatwoot/health";
import { sendMessage, submitCsatRating } from "../chatwoot/client";
import {
  getPendingRetryJobs,
  bumpRetryAttempt,
  deleteRetryJob,
  purgeDeadRetryJobs,
  getRetryQueueSize,
  enqueueRetry,
} from "../db/queries";

const POLL_MS = 15_000; // process the queue every 15 seconds
let timer: ReturnType<typeof setInterval> | null = null;

// ── Public helpers to enqueue jobs from other modules ────────────────────────

/** Queue a user message for later delivery to Chatwoot. */
export function enqueueMessage(convId: number, content: string): void {
  enqueueRetry("message", { convId, content });
}

/** Queue a CSAT rating (with optional comment) for later submission to Chatwoot. */
export function enqueueCsat(conversationUuid: string, rating: number, feedbackMessage = ""): void {
  enqueueRetry("csat", { conversationUuid, rating, feedbackMessage });
}

// ── Worker ───────────────────────────────────────────────────────────────────

async function processQueue(): Promise<void> {
  if (!isChatwootHealthy()) return; // don't bother if server is still down

  const jobs = getPendingRetryJobs();
  if (jobs.length === 0) return;

  console.log(`[retry] Processing ${jobs.length} queued job(s)…`);

  for (const job of jobs) {
    try {
      const data = JSON.parse(job.payload) as Record<string, unknown>;

      if (job.type === "message") {
        await sendMessage(
          data.convId as number,
          data.content as string,
          "incoming"
        );
      } else if (job.type === "csat") {
        await submitCsatRating(
          data.conversationUuid as string,
          data.rating as number,
          (data.feedbackMessage as string) || ""
        );
      }

      // Success — remove from queue
      deleteRetryJob(job.id);
      console.log(`[retry] ✅ Job ${job.id} (${job.type}) delivered`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);

      // CSAT locked (>14 days) — permanent failure, don't retry
      if (msg.startsWith("CSAT_LOCKED")) {
        deleteRetryJob(job.id);
        console.warn(`[retry] 🔒 Job ${job.id} (csat) permanently locked — removed`);
        continue;
      }

      bumpRetryAttempt(job.id);
      console.warn(
        `[retry] ⚠️  Job ${job.id} (${job.type}) attempt ${job.attempts + 1}/${job.max_retries} failed:`,
        msg
      );
    }
  }

  // Clean up jobs that have exceeded max retries
  purgeDeadRetryJobs();
}

/** Start the retry-queue worker. Call once at boot. */
export function startRetryWorker(): void {
  if (timer) return;
  timer = setInterval(() => {
    processQueue().catch((err) =>
      console.error("[retry] Unhandled worker error:", err)
    );
  }, POLL_MS);

  const size = getRetryQueueSize();
  console.log(
    `[retry] Worker started (every ${POLL_MS / 1000}s)` +
    (size > 0 ? ` — ${size} job(s) pending from previous run` : "")
  );
}

/** Stop the worker (for graceful shutdown). */
export function stopRetryWorker(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
