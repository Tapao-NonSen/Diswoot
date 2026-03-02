import { getInbox } from "./client";
import type { ChatwootInbox } from "./types";

const TTL_MS = 5 * 60 * 1000; // 5 minutes

let cached: ChatwootInbox | null = null;
let lastFetch = 0;

/**
 * Returns the cached inbox response, refreshing at most once every 5 minutes.
 * Falls back to the stale cache if the API call fails.
 */
export async function getCachedInbox(): Promise<ChatwootInbox | null> {
  const now = Date.now();
  if (!cached || now - lastFetch > TTL_MS) {
    try {
      cached = await getInbox();
      lastFetch = now;
    } catch (err) {
      console.error("[inboxCache] Failed to refresh inbox:", err);
    }
  }
  return cached;
}
