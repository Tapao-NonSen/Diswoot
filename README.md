# Diswoot

A Discord ↔ Chatwoot bridge bot. Discord users send DMs to the bot; messages appear as Chatwoot conversations. Agent replies are delivered back to the user's DMs automatically.

## Features

- **Discord DMs → Chatwoot conversations** — auto-creates contact + conversation on first message
- **Chatwoot agent replies → Discord DMs** via webhook
- **Smart conversation reopen** — respects Chatwoot's `lock_to_single_conversation` inbox setting; falls back to a configurable stale-window when unlocked
- **Native CSAT integration** — "Rate us" button → Discord modal (1–5 rating + optional comment), submitted to Chatwoot's native CSAT reports
- **Dynamic bot presence** synced with Chatwoot working hours (Online / Idle)
- **Outside-working-hours handling** — allow (accept + notify) or deny (reject with out-of-office message)
- **Out-of-office & greeting messages** pulled directly from Chatwoot inbox configuration (with env-var fallbacks)
- **Retry queue** — failed messages and CSAT submissions are queued in SQLite and retried automatically
- **Health monitoring** — periodic Chatwoot reachability check with graceful degradation
- **User slash commands** — `/status`, `/close`, `/reopen`, `/help`
- **HMAC webhook signature verification**
- **Configurable embed colors and branding**

---

## Prerequisites

| Requirement | Notes |
|-------------|-------|
| [Bun](https://bun.sh) v1.3+ | Runtime and package manager |
| Discord bot application | [Discord Developer Portal](https://discord.com/developers/applications) |
| Chatwoot instance | Self-hosted or cloud |
| Chatwoot **API-type** inbox | Settings → Inboxes → Add Inbox → API |
| Public webhook URL | Chatwoot must be able to POST to your server |

### Discord bot setup

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications) and create an application.
2. Under **Bot**, enable these **Privileged Gateway Intents**:
   - Message Content Intent
3. Under **OAuth2 → URL Generator**, select scopes:
   - `bot`
   - `applications.commands`
4. Add bot permissions: **Send Messages**, **Read Message History**, **Add Reactions**, **Use Slash Commands**.
5. Copy the **Bot Token** and **Application ID** for your `.env`.

### Chatwoot setup

1. Create an **API inbox** (Settings → Inboxes → Add Inbox → API).
2. Note the **Inbox ID** from the inbox settings URL.
3. Under the inbox **Configuration** tab:
   - Set **Working Hours** and **Timezone** as needed.
   - Fill in **Out of office message** (shown to users outside working hours).
   - Fill in **Greeting message** (shown once when a user first opens a ticket).
   - Enable/disable **CSAT** — the bot reads this setting at runtime.
   - Set **Lock to single conversation** — when enabled, returning users always reopen their last conversation instead of creating a new one.
4. Create a webhook pointing to `http://your-server:3000/webhook` with events:
   - `message_created`
   - `conversation_status_changed`
5. Optionally set a webhook **HMAC token** (copy it to `WEBHOOK_SECRET` in `.env`).

---

## Installation

```bash
# 1. Clone the repo
git clone https://github.com/your-org/diswoot.git
cd diswoot

# 2. Install dependencies
bun install

# 3. Configure environment
cp .env.example .env
# Edit .env and fill in all required values
```

---

## Configuration

Copy `.env.example` to `.env` and fill in the values:

```env
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 🔐  REQUIRED — Core credentials & connections
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# Discord
DISCORD_TOKEN=                  # Bot token — Discord Developer Portal > Bot > Token
DISCORD_CLIENT_ID=              # Application ID — Discord Developer Portal > General Information

# Chatwoot
CHATWOOT_BASE_URL=              # e.g. https://app.chatwoot.com  (no trailing slash)
CHATWOOT_ACCOUNT_ID=            # Numeric account ID (visible in the URL when logged in)
CHATWOOT_API_TOKEN=             # Profile > Access Token
CHATWOOT_INBOX_ID=              # Settings > Inboxes > your API inbox > Settings > ID

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 🌐  Webhook — Chatwoot will POST events here
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

WEBHOOK_PORT=3000
WEBHOOK_SECRET=                 # Optional HMAC secret (leave blank if not using)

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 🏷️  Branding — footer shown on every embed (optional)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

BRAND_NAME=Support              # Short name shown in every embed footer
BRAND_ICON_URL=                 # Optional URL to a small icon (e.g. your logo)
BRAND_FOOTER_TEXT=              # Override the full footer text (defaults to BRAND_NAME)

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 🎨  Embed Colors — hex without # prefix (optional)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

COLOR_PRIMARY=7BB8F5            # pastel blue — general/branded
COLOR_SUCCESS=6FD8A0            # pastel mint — success/opened
COLOR_DANGER=F28B87             # pastel rose — closed/error
COLOR_WARNING=F5CF7B            # pastel amber — warnings/idle
COLOR_INFO=A89EF5               # pastel lavender — info/status

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 🟢  Presence — bot status synced from Chatwoot working hours (optional)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PRESENCE_POLL_INTERVAL_MS=300000
PRESENCE_ONLINE_TEXT=DM to open a support ticket
PRESENCE_OFFLINE_TEXT=Support is currently offline

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 💬  UX — Messages & user-facing text (optional)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CONFIRM_EMOJI=✅
RESOLVED_MESSAGE=Your support ticket has been resolved. DM us again to reopen it.

# Greeting — sent the very first time a user opens a ticket
# Prefers Chatwoot inbox "Greeting message" (Inbox Settings → Configuration).
# These env vars are fallback only when the Chatwoot value is blank/disabled.
GREETING_ENABLED=true
GREETING_MESSAGE=Thanks for reaching out! A support agent will get back to you as soon as possible.

# CSAT — "Rate us" button sent after a ticket is resolved
# Also respects inbox-level "CSAT" toggle in Chatwoot settings.
CSAT_ENABLED=true
CSAT_QUESTION=How would you rate your support experience?
CSAT_BUTTON_LABEL=⭐ Rate us
CSAT_COMMENT_ENABLED=true
CSAT_COMMENT_PLACEHOLDER=Any additional feedback? (optional)

# Status change notifications — leave blank to disable each one
SNOOZED_MESSAGE="Your ticket has been snoozed. We'll follow up with you soon."
PENDING_MESSAGE="Your ticket is queued and will be assigned to an agent shortly."

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 🎫  Ticket Lifecycle (optional)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Also respects Chatwoot "Lock to single conversation" inbox setting.
# If locked in Chatwoot → always reopens the existing conversation.
# If unlocked → uses the stale window below.
# 0 = always reopen the last conversation (default)
REOPEN_WINDOW_HOURS=0

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 🕐  Outside Working Hours (optional)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# The out-of-office message shown to users is pulled from Chatwoot:
#   Inbox Settings → Configuration → Out of office message
#
# true  — accept and forward the message, then show the out-of-office message (default)
# false — show the out-of-office message and do NOT create a ticket

OUTSIDE_HOURS_BEHAVIOR=true
OUTSIDE_HOURS_FALLBACK_MESSAGE=Our support team is currently offline.
```

> **Out-of-office message content** is pulled from your Chatwoot inbox configuration
> (Inbox Settings → Configuration → Out of office message). The fallback above is
> only shown when that field is empty.

> **CSAT toggle** is read from the Chatwoot inbox at runtime. If the inbox has CSAT
> disabled, the "Rate us" button will not be sent even if `CSAT_ENABLED=true` in `.env`.

> **Lock to single conversation** is read from the Chatwoot inbox at runtime. When
> enabled, the bot always reopens the user's last conversation regardless of
> `REOPEN_WINDOW_HOURS`.

### Optional: Plugins

Diswoot has a **plugin system** for extending functionality without modifying
core code. Plugins can enrich Chatwoot contacts with data from external
systems (e.g. email, user IDs from your platform).

Plugins live in `src/plugins/`. Each plugin is auto-loaded at startup — if
its required env vars are missing, it disables itself silently.

```env
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# �  Singlty Plugin (optional — leave blank to disable)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SINGLTY_API_URL=                # Backend URL, e.g. https://api.singlty.com
SINGLTY_API_KEY=                # Must match INTERNAL_API_KEY in the Backend .env
```

> **Backend setup**: Set `INTERNAL_API_KEY` in your Singlty Backend `.env` to a
> strong random secret. Use the same value as `SINGLTY_API_KEY` here. The plugin
> calls `GET /internal/users/by-discord/:discordId` with an `x-api-key` header.

#### Writing a custom plugin

Create a file in `src/plugins/` that exports a `DiswootPlugin` object:

```typescript
// src/plugins/my-platform.ts
import type { DiswootPlugin } from "./types";

export const myPlugin: DiswootPlugin = {
  name: "my-platform",

  init() {
    const apiKey = process.env.MY_PLATFORM_KEY ?? "";
    if (!apiKey) return false; // disable if not configured
    return true;
  },

  async enrichContact(user) {
    // Look up the user in your platform by user.id (Discord snowflake)
    // Return { email, customAttributes } to merge into the Chatwoot contact
    return {
      email: "user@example.com",
      customAttributes: { platform_id: "12345" },
    };
  },
};
```

Then register it in `src/plugins/index.ts`:

```typescript
import { myPlugin } from "./my-platform";

const ALL_PLUGINS: DiswootPlugin[] = [singltyPlugin, myPlugin];
```

---

## Usage

### 1. Register slash commands

Run this once (or whenever you add/change commands). Global commands take up to **1 hour** to propagate to all Discord servers and DMs.

```bash
bun run deploy-commands
```

### 2. Start the bot

```bash
bun start
```

The bot will:
- Connect to Discord and log in
- Start the webhook HTTP server on `WEBHOOK_PORT`
- Begin polling Chatwoot working hours for presence updates

---

## Slash commands

All commands are **ephemeral** (only visible to the user who ran them) and only work in **DMs with the bot**.

| Command | Description |
|---------|-------------|
| `/status` | Show current ticket status, last activity, and ticket ID |
| `/close [reason]` | Close your open ticket (optional reason sent as a private note) |
| `/reopen` | Reopen a resolved ticket |
| `/help` | Show command list and how the bot works |

---

## Message flow

```
User DMs bot
    │
    ▼
dmHandler.ts
    ├─ Working hours check
    │   ├─ deny mode  → send out-of-office embed, stop
    │   └─ allow mode → continue
    ├─ Find or create Chatwoot contact + conversation
    ├─ Smart reopen logic
    │   ├─ lock_to_single_conversation ON  → always reopen
    │   └─ lock_to_single_conversation OFF → reopen within REOPEN_WINDOW_HOURS, else new ticket
    ├─ Forward message to Chatwoot as "incoming"
    ├─ React ✅ to confirm receipt
    └─ (allow + outside hours) → send out-of-office embed

Agent replies in Chatwoot
    │
    ▼
Chatwoot webhook → POST /webhook
    │
    ├─ message_created (outgoing, non-private)
    │   └─ Fetch Discord user → send DM
    │
    └─ conversation_status_changed (resolved)
        ├─ Send resolved notification DM
        └─ Send CSAT "Rate us" button (if inbox CSAT enabled)
                │
                ▼ (user clicks button)
        interactionHandler.ts
            ├─ Show Discord modal (rating 1–5 + optional comment)
            ├─ Save to local SQLite DB
            └─ Submit to Chatwoot native CSAT API
                └─ On failure → enqueue to retry queue
```

---

## Project structure

```
diswoot/
├── index.ts                    # Entry point
├── src/
│   ├── config.ts               # Typed env-var config
│   ├── bot/
│   │   ├── client.ts           # discord.js Client singleton
│   │   ├── embed.ts            # Pre-styled EmbedBuilder helpers
│   │   ├── presence.ts         # Working-hours presence poller
│   │   ├── deploy-commands.ts  # One-shot slash command registration
│   │   ├── commands/
│   │   │   ├── close.ts
│   │   │   ├── reopen.ts
│   │   │   ├── status.ts
│   │   │   └── help.ts
│   │   └── handlers/
│   │       ├── dmHandler.ts         # Incoming Discord DM → Chatwoot
│   │       └── interactionHandler.ts # CSAT modal + slash command router
│   ├── chatwoot/
│   │   ├── client.ts           # Chatwoot REST API client (v4.11.1)
│   │   ├── contact-attributes.ts # Shared contact identifier & attribute keys
│   │   ├── health.ts           # Periodic reachability check
│   │   ├── types.ts            # TypeScript interfaces
│   │   ├── workingHours.ts     # Working hours / next-opening logic
│   │   └── inboxCache.ts       # 5-minute TTL inbox config cache
│   ├── plugins/
│   │   ├── types.ts            # DiswootPlugin interface
│   │   ├── index.ts            # Plugin registry & lifecycle
│   │   └── singlty.ts          # (Example) Singlty Backend enrichment
│   ├── db/
│   │   ├── index.ts            # SQLite init + migrations
│   │   └── queries.ts          # Prepared statement helpers
│   ├── lib/
│   │   └── retryQueue.ts       # SQLite-backed retry queue for failed API calls
│   └── webhook/
│       └── server.ts           # Bun HTTP server for Chatwoot webhooks
└── data/
    └── diswoot.db              # SQLite database (auto-created, git-ignored)
```

---

## Development

```bash
# Type-check without running
bun run typecheck

# Run (Bun reads .env automatically)
bun start
```

The SQLite database is created automatically at `data/diswoot.db` on first run (WAL mode enabled for concurrent reads).

---

## Chatwoot API compatibility

All endpoints are verified against **Chatwoot v4.11.1** ([swagger.json](https://raw.githubusercontent.com/chatwoot/chatwoot/v4.11.1/swagger/swagger.json)):

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/accounts/{id}/contacts/search` | GET | Find existing contact by Discord ID |
| `/api/v1/accounts/{id}/contacts` | POST | Create new contact |
| `/api/v1/accounts/{id}/contacts/{id}` | PUT | Update contact (name, email, custom_attributes) |
| `/api/v1/accounts/{id}/contacts/{id}/contact_inboxes` | POST | Link contact to inbox |
| `/api/v1/accounts/{id}/conversations` | POST | Create conversation |
| `/api/v1/accounts/{id}/conversations/{id}/messages` | POST | Send message / private note |
| `/api/v1/accounts/{id}/conversations/{id}/toggle_status` | POST | Open / resolve / pending |
| `/api/v1/accounts/{id}/conversations/{id}` | GET | Fetch conversation metadata |
| `/api/v1/accounts/{id}/inboxes/{id}` | GET | Fetch inbox config (CSAT, lock, hours) |
| `/public/api/v1/csat_survey/{uuid}` | PATCH | Submit native CSAT rating |

---

## Contact attribute alignment

Diswoot and web widgets both create / identify Chatwoot contacts.
To ensure agents see a single, merged view, both sides should use the
**same `identifier` format and `custom_attributes` keys**.

| Field | Diswoot (Discord bot) | Web Widget (example) | Result in Chatwoot |
|-------|-----------------------|----------------------|---------------------|
| `identifier` | `discord:{discordId}` | `discord:{discordId}` (if linked) or `user:{userId}` | Same contact when Discord is linked |
| `name` | `displayName` (guild nick > username) | `globalName > username > email` | Best available name |
| `email` | Via plugin enrichment (if configured) | From auth session | ✅ |
| `custom_attributes.user_id` | Via plugin enrichment (if configured) | Always set | Platform user ID |
| `custom_attributes.discord_id` | Always set | Set when linked | Discord snowflake |
| `custom_attributes.discord_username` | Always set | Set when linked | Raw Discord username |
| `custom_attributes.discord_display_name` | Always set | Set when linked | Display name |
| `custom_attributes.source` | `"discord"` | `"web"` | Origin of the contact |

Key files:
- **Diswoot**: `src/chatwoot/contact-attributes.ts` — identifier helpers, `ATTR` keys, `pickDisplayName`
- **Plugins**: `src/plugins/` — enrich contacts with platform-specific data (email, user_id, etc.)

