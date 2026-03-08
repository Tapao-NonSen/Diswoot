/**
 * ── Singlty Plugin ──────────────────────────────────────────────────
 *
 * Optional integration with the Singlty platform backend.
 * When enabled, enriches Chatwoot contacts with the user's platform
 * **email** and **user_id** by looking them up via their Discord ID.
 *
 * ## Required env vars
 *
 * | Variable           | Description                                           |
 * |--------------------|-------------------------------------------------------|
 * | `SINGLTY_API_URL`  | Backend API URL                                       |
 * | `SINGLTY_API_KEY`  | Service-to-service key (`INTERNAL_API_KEY` on backend)|
 *
 * If either variable is missing/empty, the plugin disables itself
 * silently and Diswoot works as a generic Discord ↔ Chatwoot bridge.
 * ────────────────────────────────────────────────────────────────────
 */

import type { DiswootPlugin, DiscordUserInfo, ContactEnrichment } from "./types";
import { ATTR } from "../chatwoot/contact-attributes";

// ── Config (read once at init) ───────────────────────────────────────

let apiUrl = "";
let apiKey = "";

// ── Helpers ──────────────────────────────────────────────────────────

interface SingltyUserResponse {
  data?: {
    userId?: string;
    email?: string;
  };
}

/**
 * Look up a Singlty platform user by their Discord ID.
 * Returns `{ userId, email }` if found, otherwise `null`.
 */
async function lookupUser(
  discordId: string
): Promise<{ userId: string; email: string } | null> {
  try {
    const res = await fetch(
      `${apiUrl}/internal/users/by-discord/${discordId}`,
      {
        headers: {
          "x-api-key": apiKey,
          Accept: "application/json",
        },
      }
    );
    if (!res.ok) return null;

    const json = (await res.json()) as SingltyUserResponse;
    const d = json.data;
    if (d?.userId && d?.email) return { userId: d.userId, email: d.email };
    return null;
  } catch (err) {
    console.warn("[singlty-plugin] Lookup failed:", err);
    return null;
  }
}

// ── Plugin export ────────────────────────────────────────────────────

export const singltyPlugin: DiswootPlugin = {
  name: "singlty",

  init() {
    apiUrl = (process.env.SINGLTY_API_URL ?? "").replace(/\/$/, "");
    apiKey = process.env.SINGLTY_API_KEY ?? "";

    if (!apiUrl || !apiKey) {
      // Not configured — disable silently
      return false;
    }

    console.log(`[singlty-plugin] Backend: ${apiUrl}`);
    return true;
  },

  async enrichContact(user: DiscordUserInfo): Promise<ContactEnrichment | null> {
    const result = await lookupUser(user.id);
    if (!result) return null;

    return {
      email: result.email,
      customAttributes: {
        [ATTR.USER_ID]: result.userId,
      },
    };
  },
};
