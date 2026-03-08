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
    greetingEnabled: optional("GREETING_ENABLED", "true") === "true",
    greetingMessage: optional(
      "GREETING_MESSAGE",
      "Thanks for reaching out! A support agent will get back to you as soon as possible."
    ),
    csatEnabled: optional("CSAT_ENABLED", "true") === "true",
    csatButtonLabel: optional("CSAT_BUTTON_LABEL", "⭐ Rate us"),
    csatQuestion: optional(
      "CSAT_QUESTION",
      "How would you rate your support experience?"
    ),
    csatCommentEnabled: optional("CSAT_COMMENT_ENABLED", "true") === "true",
    csatCommentPlaceholder: optional(
      "CSAT_COMMENT_PLACEHOLDER",
      "Share your thoughts… (optional)"
    ),
    reopenedMessage: optional(
      "REOPENED_MESSAGE",
      "Your support ticket has been reopened."
    ),
    snoozedMessage: optional("SNOOZED_MESSAGE", ""),
    pendingMessage: optional("PENDING_MESSAGE", ""),
  },
  colors: {
    primary: hex("COLOR_PRIMARY", "7BB8F5"),   // pastel blue — general/branded
    success: hex("COLOR_SUCCESS", "6FD8A0"),   // pastel mint — success/opened
    danger:  hex("COLOR_DANGER",  "F28B87"),   // pastel rose — closed/error
    warning: hex("COLOR_WARNING", "F5CF7B"),   // pastel amber — warnings/idle
    info:    hex("COLOR_INFO",    "A89EF5"),   // pastel lavender — info/status
  },
  brand: {
    /** Brand name shown in embed footers. */
    name: optional("BRAND_NAME", "Support"),
    /** Optional URL to a small icon shown in embed footers. */
    iconUrl: optional("BRAND_ICON_URL", ""),
    /** Override the full footer text. Defaults to BRAND_NAME. */
    footerText: optional("BRAND_FOOTER_TEXT", ""),
  },
  presence: {
    pollIntervalMs: Number(optional("PRESENCE_POLL_INTERVAL_MS", "300000")), // 5 min
    onlineText: optional("PRESENCE_ONLINE_TEXT", "DM to open a support ticket"),
    offlineText: optional("PRESENCE_OFFLINE_TEXT", "Support is currently offline"),
  },
  outsideHours: {
    // true  → accept and forward the message, then show the out-of-office message
    // false → show the out-of-office message and do NOT create a ticket
    behavior: optional("OUTSIDE_HOURS_BEHAVIOR", "true") === "true",
    fallbackMessage: optional(
      "OUTSIDE_HOURS_FALLBACK_MESSAGE",
      "Our support team is currently offline."
    ),
  },
  tickets: {
    /** Hours after resolution during which a DM reopens the existing ticket.
     *  After this window, a new conversation is created instead (if inbox allows). */
    reopenWindowHours: Number(optional("REOPEN_WINDOW_HOURS", "0")),
  },
} as const;

export type Config = typeof config;
