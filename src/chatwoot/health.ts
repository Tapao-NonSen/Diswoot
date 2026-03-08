import { config } from "../config";

const POLL_MS = 30_000; // check every 30 seconds
const TIMEOUT_MS = 5_000; // 5-second request timeout

let healthy = true;
let lastCheck = 0;
let timer: ReturnType<typeof setInterval> | null = null;

/**
 * Lightweight probe: hits the Chatwoot /auth/sign_in page (unauthenticated GET)
 * which always returns quickly. We only care about "can we reach the server at all?"
 */
async function probe(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), TIMEOUT_MS);

    await fetch(
      `${config.chatwoot.baseUrl}/auth/sign_in`,
      { method: "HEAD", signal: controller.signal }
    );

    clearTimeout(id);
    // Any HTTP response (even 4xx) means the server is alive.
    // Only network errors / timeouts mean "down".
    return true;
  } catch {
    return false;
  }
}

async function tick(): Promise<void> {
  const wasHealthy = healthy;
  healthy = await probe();
  lastCheck = Date.now();

  if (wasHealthy && !healthy) {
    console.warn("[health] ⚠️  Chatwoot is unreachable");
  } else if (!wasHealthy && healthy) {
    console.log("[health] ✅  Chatwoot is back online");
  }
}

/** Returns true if Chatwoot was reachable on the last probe. */
export function isChatwootHealthy(): boolean {
  return healthy;
}

/** Milliseconds since the last successful probe, or -1 if never checked. */
export function msSinceLastCheck(): number {
  return lastCheck === 0 ? -1 : Date.now() - lastCheck;
}

/** Start the periodic health-check poller. Call once at boot. */
export function startHealthCheck(): void {
  if (timer) return;
  // Run the first check immediately
  tick();
  timer = setInterval(tick, POLL_MS);
  console.log(`[health] Chatwoot health check started (every ${POLL_MS / 1000}s)`);
}

/** Stop the poller (for graceful shutdown). */
export function stopHealthCheck(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
