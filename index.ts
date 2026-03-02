import { Events } from "discord.js";
import { config } from "./src/config";
import "./src/db/index"; // run migrations on startup
import { cleanOldSentMessages } from "./src/db/queries";
import { discordClient } from "./src/bot/client";
import { handleDM } from "./src/bot/handlers/dmHandler";
import { handleInteraction } from "./src/bot/handlers/interactionHandler";
import { startWebhookServer } from "./src/webhook/server";
import { startPresencePoller } from "./src/bot/presence";

// ── Webhook server ──────────────────────────────────────────────────────────
const webhookServer = startWebhookServer();

// ── Discord event handlers ──────────────────────────────────────────────────
discordClient.once(Events.ClientReady, (client) => {
  console.log(`[discord] Logged in as ${client.user.tag}`);
  startPresencePoller(); // start after client.user is available
  // Prune dedup table once on startup, then every 6 hours
  cleanOldSentMessages();
  setInterval(cleanOldSentMessages, 6 * 60 * 60 * 1000);
});

discordClient.on(Events.MessageCreate, handleDM);
discordClient.on(Events.InteractionCreate, handleInteraction);

// ── Graceful shutdown ───────────────────────────────────────────────────────
function shutdown() {
  console.log("\n[main] Shutting down…");
  discordClient.destroy();
  webhookServer.stop();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// ── Login ───────────────────────────────────────────────────────────────────
await discordClient.login(config.discord.token);
