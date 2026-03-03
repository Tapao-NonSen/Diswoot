// eslint-disable-next-line @typescript-eslint/no-explicit-any
type BunServer = ReturnType<typeof Bun.serve<any>>;
import { createHmac, timingSafeEqual } from "crypto";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from "discord.js";
import { brandFooter } from "../bot/embed";
import { config } from "../config";
import { getMappingByConv, isMessageSent, markMessageSent } from "../db/queries";
import { getConversation } from "../chatwoot/client";
import { discordClient } from "../bot/client";
import type { ChatwootAttachment, WebhookPayload } from "../chatwoot/types";

// ── HMAC validation ──────────────────────────────────────────────────────────
function verifySignature(rawBody: string, header: string | null): boolean {
  if (!config.webhook.secret) return true; // no secret configured → skip check
  if (!header) return false;
  const expected = createHmac("sha256", config.webhook.secret)
    .update(rawBody)
    .digest("hex");
  try {
    return timingSafeEqual(
      Buffer.from(header, "hex"),
      Buffer.from(expected, "hex")
    );
  } catch {
    return false;
  }
}

// ── Attachment formatter ──────────────────────────────────────────────────────
function formatAttachments(attachments: ChatwootAttachment[]): string {
  return attachments
    .map((a) => {
      const emoji =
        a.file_type === "image" ? "🖼️" :
        a.file_type === "audio" ? "🎵" :
        a.file_type === "video" ? "🎬" : "📎";
      // Try to extract filename from the URL; fall back to extension or generic name
      const filename =
        (a.data_url.split("?")[0] ?? "").split("/").pop() ||
        (a.extension ? `file.${a.extension}` : "attachment");
      return `${emoji} [${filename}](${a.data_url})`;
    })
    .join("\n");
}

// ── Text chunker ─────────────────────────────────────────────────────────────
function chunkText(text: string, limit = 2000): string[] {
  const chunks: string[] = [];
  // Split at the last safe codepoint boundary within the limit to avoid
  // cutting surrogate pairs or multi-byte sequences
  while (text.length > limit) {
    let cut = limit;
    // Step back if we're in the middle of a surrogate pair
    if (
      cut > 0 &&
      text.charCodeAt(cut - 1) >= 0xd800 &&
      text.charCodeAt(cut - 1) <= 0xdbff
    ) {
      cut -= 1;
    }
    chunks.push(text.slice(0, cut));
    text = text.slice(cut);
  }
  if (text.length) chunks.push(text);
  return chunks;
}

async function handleWebhook(payload: WebhookPayload): Promise<void> {
  const { event } = payload;

  // ── Outgoing/template message (agent → user) ────────────────────────────
  if (event === "message_created") {
    if (payload.message_type !== "outgoing" && payload.message_type !== "template") return;
    if (payload.private) return; // skip private/internal agent notes

    const hasContent = !!payload.content;
    const hasAttachments = (payload.attachments?.length ?? 0) > 0;
    if (!payload.id || !payload.conversation?.id || (!hasContent && !hasAttachments)) return;

    // Dedup — Chatwoot can fire the webhook more than once per message.
    // We check first (synchronous), and only mark as sent after the DM is
    // delivered so a Discord failure doesn't permanently discard the message.
    if (isMessageSent(payload.id)) return;

    const mapping = getMappingByConv(payload.conversation.id);
    if (!mapping) return;

    try {
      const user = await discordClient.users.fetch(mapping.discord_user_id);
      const dm = await user.createDM();

      // Send text content in chunks
      if (hasContent) {
        for (const chunk of chunkText(payload.content!)) {
          await dm.send(chunk);
        }
      }

      // Send attachments as formatted links
      if (hasAttachments) {
        for (const chunk of chunkText(formatAttachments(payload.attachments!))) {
          await dm.send(chunk);
        }
      }

      // Mark only after successful delivery to allow retry on failure
      markMessageSent(payload.id);
    } catch (err) {
      console.error("[webhook] Failed to send DM:", err);
    }
    return;
  }

  // ── Conversation status changed ──────────────────────────────────────────
  if (event === "conversation_status_changed") {
    const status = payload.conversation?.status;
    console.log(`[webhook] conversation_status_changed → status: ${status}, conv: ${payload.conversation?.id}`);
    if (!payload.conversation?.id) return;

    const mapping = getMappingByConv(payload.conversation.id);
    if (!mapping) {
      console.warn(`[webhook] No mapping found for conv ${payload.conversation.id} — status DM skipped`);
      return;
    }

    try {
      const user = await discordClient.users.fetch(mapping.discord_user_id);
      const dm = await user.createDM();

      if (status === "resolved") {
        await dm.send({
          embeds: [
            new EmbedBuilder()
              .setColor(config.colors.danger)
              .setTitle("🎫  Ticket Resolved")
              .setDescription(config.ux.resolvedMessage)
              .setFooter(brandFooter())
              .setTimestamp(),
          ],
        });
        console.log(`[webhook] Sent resolved DM to ${mapping.discord_user_id}`);

        // ── CSAT ────────────────────────────────────────────────────────────
        if (config.ux.csatEnabled) {
          const conv = await getConversation(payload.conversation.id);
          const csatId = conv.uuid;
          const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId(`csat_${csatId}_1`).setLabel("1 ⭐").setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`csat_${csatId}_2`).setLabel("2 ⭐").setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`csat_${csatId}_3`).setLabel("3 ⭐").setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`csat_${csatId}_4`).setLabel("4 ⭐").setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`csat_${csatId}_5`).setLabel("5 ⭐").setStyle(ButtonStyle.Success),
          );
          await dm.send({
            embeds: [
              new EmbedBuilder()
                .setColor(config.colors.primary)
                .setTitle("⭐  Rate Your Experience")
                .setDescription(config.ux.csatQuestion)
                .setFooter(brandFooter()),
            ],
            components: [row],
          });
        }
        return;
      }

      if (status === "open" && config.ux.reopenedMessage) {
        await dm.send({
          embeds: [
            new EmbedBuilder()
              .setColor(config.colors.success)
              .setTitle("🎫  Ticket Reopened")
              .setDescription(config.ux.reopenedMessage)
              .setFooter(brandFooter())
              .setTimestamp(),
          ],
        });
        console.log(`[webhook] Sent reopened DM to ${mapping.discord_user_id}`);
        return;
      }

      if (status === "snoozed" && config.ux.snoozedMessage) {
        await dm.send({
          embeds: [
            new EmbedBuilder()
              .setColor(config.colors.warning)
              .setTitle("😴  Ticket Snoozed")
              .setDescription(config.ux.snoozedMessage)
              .setFooter(brandFooter())
              .setTimestamp(),
          ],
        });
        console.log(`[webhook] Sent snoozed DM to ${mapping.discord_user_id}`);
        return;
      }

      if (status === "pending" && config.ux.pendingMessage) {
        await dm.send({
          embeds: [
            new EmbedBuilder()
              .setColor(config.colors.warning)
              .setTitle("⏳  Awaiting Response")
              .setDescription(config.ux.pendingMessage)
              .setFooter(brandFooter())
              .setTimestamp(),
          ],
        });
        console.log(`[webhook] Sent pending DM to ${mapping.discord_user_id}`);
        return;
      }
    } catch (err) {
      console.error("[webhook] Failed to send status DM:", err);
    }
  }
}

export function startWebhookServer(): BunServer {
  const server = Bun.serve({
    port: config.webhook.port,
    async fetch(req) {
      const url = new URL(req.url);

      if (req.method === "POST" && url.pathname === "/webhook") {
        const rawBody = await req.text().catch(() => null);
        if (rawBody === null) {
          return new Response("Bad request", { status: 400 });
        }

        // Validate HMAC signature when a secret is configured
        // Chatwoot sends the digest in X-Chatwoot-Hmac-Sha256
        const sig = req.headers.get("X-Chatwoot-Hmac-Sha256");
        if (!verifySignature(rawBody, sig)) {
          console.warn("[webhook] Rejected request: invalid signature");
          return new Response("Forbidden", { status: 403 });
        }

        let payload: WebhookPayload;
        try {
          payload = JSON.parse(rawBody) as WebhookPayload;
        } catch {
          return new Response("Bad JSON", { status: 400 });
        }

        // Fire-and-forget — respond immediately so Chatwoot doesn't time out
        handleWebhook(payload).catch((err) =>
          console.error("[webhook] Unhandled error:", err)
        );

        return new Response("OK", { status: 200 });
      }

      if (req.method === "GET" && url.pathname === "/health") {
        return new Response("OK");
      }

      return new Response("Not Found", { status: 404 });
    },
  });

  console.log(`[webhook] Listening on port ${config.webhook.port}`);
  return server;
}
