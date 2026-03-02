function require(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required environment variable: ${name}`);
  return val;
}

function optional(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

function hex(name: string, fallback: string): number {
  return parseInt(optional(name, fallback).replace(/^#/, ""), 16);
}

export const config = {
  discord: {
    token: require("DISCORD_TOKEN"),
    clientId: require("DISCORD_CLIENT_ID"),
  },
  chatwoot: {
    baseUrl: require("CHATWOOT_BASE_URL").replace(/\/$/, ""),
    accountId: require("CHATWOOT_ACCOUNT_ID"),
    apiToken: require("CHATWOOT_API_TOKEN"),
    inboxId: Number(require("CHATWOOT_INBOX_ID")),
  },
  webhook: {
    port: Number(optional("WEBHOOK_PORT", "3000")),
    secret: optional("WEBHOOK_SECRET", ""),
  },
  ux: {
    confirmEmoji: optional("CONFIRM_EMOJI", "✅"),
    resolvedMessage: optional(
      "RESOLVED_MESSAGE",
      "Your support ticket has been resolved. DM us again to reopen it."
    ),
  },
  colors: {
    primary: hex("COLOR_PRIMARY", "4A9EFF"),   // blue — general/info
    success: hex("COLOR_SUCCESS", "57F287"),   // green — ticket opened/reopened
    danger:  hex("COLOR_DANGER",  "ED4245"),   // red — ticket closed/error
    warning: hex("COLOR_WARNING", "FEE75C"),   // yellow — already open/closed
    info:    hex("COLOR_INFO",    "5865F2"),   // indigo — status/help
  },
  presence: {
    pollIntervalMs: Number(optional("PRESENCE_POLL_INTERVAL_MS", "300000")), // 5 min
    onlineText: optional("PRESENCE_ONLINE_TEXT", "DM to open a support ticket"),
    offlineText: optional("PRESENCE_OFFLINE_TEXT", "Support is currently offline"),
  },
  outsideHours: {
    // "allow" → accept message, forward ticket, then send the inbox's out_of_office_message
    // "deny"  → reject message with out_of_office_message, don't create a ticket
    behavior: optional("OUTSIDE_HOURS_BEHAVIOR", "allow") as "allow" | "deny",
    // Fallback shown if out_of_office_message is blank in Chatwoot
    fallbackMessage: optional(
      "OUTSIDE_HOURS_FALLBACK_MESSAGE",
      "Our support team is currently offline."
    ),
  },
} as const;

export type Config = typeof config;
