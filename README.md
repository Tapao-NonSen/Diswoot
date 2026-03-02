# Diswoot

A Discord ↔ Chatwoot bridge bot. Discord users send DMs to the bot; messages appear as Chatwoot conversations. Agent replies are delivered back to the user's DMs automatically.

## Features

- Discord DMs → Chatwoot conversations (auto-creates contact + conversation on first message)
- Chatwoot agent replies → Discord DMs via webhook
- Auto-reopens resolved/snoozed conversations when the user messages again
- Dynamic bot presence synced with Chatwoot working hours (Online / Idle)
- Outside-working-hours handling: allow (accept + notify) or deny (reject with message)
- Out-of-office message pulled directly from Chatwoot inbox configuration
- User slash commands: `/status`, `/close`, `/reopen`, `/help`
- HMAC webhook signature verification
- Configurable embed colors

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
3. Under the inbox configuration:
   - Set **Working Hours** and **Timezone** as needed.
   - Fill in **Out of office message** (shown to users outside working hours).
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
# Required
DISCORD_TOKEN=          # Bot token from Discord Developer Portal
DISCORD_CLIENT_ID=      # Application ID from Discord Developer Portal
CHATWOOT_BASE_URL=      # e.g. https://app.chatwoot.com (no trailing slash)
CHATWOOT_ACCOUNT_ID=    # Numeric account ID (visible in the URL when logged in)
CHATWOOT_API_TOKEN=     # Profile → Access Token
CHATWOOT_INBOX_ID=      # Settings → Inboxes → your API inbox → Settings → ID

# Webhook
WEBHOOK_PORT=3000
WEBHOOK_SECRET=         # Copy from Chatwoot webhook HMAC token (recommended)

# Optional — UX
CONFIRM_EMOJI=✅
RESOLVED_MESSAGE=Your support ticket has been resolved. DM us again to reopen it.

# Optional — embed colors (hex without #)
COLOR_PRIMARY=4A9EFF
COLOR_SUCCESS=57F287
COLOR_DANGER=ED4245
COLOR_WARNING=FEE75C
COLOR_INFO=5865F2

# Optional — bot presence
PRESENCE_POLL_INTERVAL_MS=300000
PRESENCE_ONLINE_TEXT=DM to open a support ticket
PRESENCE_OFFLINE_TEXT=Support is currently offline

# Optional — outside working hours
# "allow" → accept message + send out-of-office notice (default)
# "deny"  → reject message with out-of-office notice, no ticket created
OUTSIDE_HOURS_BEHAVIOR=allow
# Fallback only used if Chatwoot inbox out-of-office message is blank
OUTSIDE_HOURS_FALLBACK_MESSAGE=Our support team is currently offline.
```

> **Out-of-office message content** is pulled from your Chatwoot inbox configuration
> (Inbox Settings → Configuration → Out of office message). The fallback above is
> only shown when that field is empty.

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
    ├─ Auto-reopen resolved/snoozed conversation
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
        └─ Send resolved notification DM
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
│   │       └── interactionHandler.ts # Slash command router
│   ├── chatwoot/
│   │   ├── client.ts           # Chatwoot REST API client
│   │   ├── types.ts            # TypeScript interfaces
│   │   ├── workingHours.ts     # Working hours / next-opening logic
│   │   └── inboxCache.ts       # 5-minute TTL inbox cache
│   ├── db/
│   │   ├── index.ts            # SQLite init + migrations
│   │   └── queries.ts          # Prepared statement helpers
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

The SQLite database is created automatically at `data/diswoot.db` on first run.
