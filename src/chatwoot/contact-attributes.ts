/**
 * ── Chatwoot Contact Attribute Contract ─────────────────────────────
 *
 * Shared constants for Chatwoot contact identification. These ensure
 * contacts created by Diswoot and any external web widget merge
 * seamlessly in the Chatwoot agent dashboard.
 *
 * ## Key concepts
 *
 * | Chatwoot field           | Purpose                                             |
 * |--------------------------|-----------------------------------------------------|
 * | `identifier`             | **Unique merge key** — same value = same contact    |
 * | `name`                   | Display name shown to agents                        |
 * | `email`                  | Contact email                                       |
 * | `custom_attributes`      | Visible in the agent sidebar (searchable / filterable) |
 * | `additional_attributes`  | Internal / technical (browser info etc.) — NOT shown |
 *
 * Both Diswoot and the web widget MUST use the same `identifier`
 * format and `custom_attributes` keys so agents see a single,
 * merged view of every contact.
 * ────────────────────────────────────────────────────────────────────
 */

// ── Identifier format ────────────────────────────────────────────────

/** Build the Chatwoot `identifier` for a Discord-linked user. */
export function discordIdentifier(discordId: string): string {
  return `discord:${discordId}`;
}

/** Build the Chatwoot `identifier` for a web-only user (no Discord). */
export function userIdentifier(userId: string): string {
  return `user:${userId}`;
}

// ── Custom attribute keys ────────────────────────────────────────────
// These appear in the agent sidebar under "Conversation Details".
// Both Diswoot and the web widget MUST use the exact same keys.

export const ATTR = {
  /** Singlty platform user ID */
  USER_ID: "user_id",
  /** Discord user ID (numeric snowflake) */
  DISCORD_ID: "discord_id",
  /** Discord username (e.g. "john") */
  DISCORD_USERNAME: "discord_username",
  /** Discord display name (e.g. "John Doe") — may differ from username */
  DISCORD_DISPLAY_NAME: "discord_display_name",
  /** Source of the contact: "web" | "discord" */
  SOURCE: "source",
} as const;

// ── Display name helper ──────────────────────────────────────────────
// Determines the best `name` to send to Chatwoot.

/**
 * Pick the best display name for a Chatwoot contact.
 *
 * Priority: globalName → displayName → username → email → "Unknown"
 */
export function pickDisplayName(opts: {
  globalName?: string | null;
  displayName?: string | null;
  username?: string | null;
  email?: string | null;
}): string {
  return (
    opts.globalName?.trim() ||
    opts.displayName?.trim() ||
    opts.username?.trim() ||
    opts.email?.trim() ||
    "Unknown"
  );
}
