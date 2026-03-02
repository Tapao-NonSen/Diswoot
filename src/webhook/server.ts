// eslint-disable-next-line @typescript-eslint/no-explicit-any
type BunServer = ReturnType<typeof Bun.serve<any>>;
import { createHmac, timingSafeEqual } from "crypto";
import { config } from "../config";
import { getMappingByConv, isMessageSent, markMessageSent } from "../db/queries";
import { discordClient } from "../bot/client";
import type { WebhookPayload } from "../chatwoot/types";

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

  // ── Outgoing message (agent → user) ─────────────────────────────────────
  if (event === "message_created") {
    if (payload.message_type !== "outgoing") return;
    if (payload.private) return; // skip private/internal agent notes
    if (!payload.id || !payload.conversation?.id || !payload.content) return;

    // Dedup — Chatwoot can fire the webhook more than once per message.
    // We check first (synchronous), and only mark as sent after the DM is
    // delivered so a Discord failure doesn't permanently discard the message.
    if (isMessageSent(payload.id)) return;

    const mapping = getMappingByConv(payload.conversation.id);
    if (!mapping) return;

    try {
      const user = await discordClient.users.fetch(mapping.discord_user_id);
      const dm = await user.createDM();
      for (const chunk of chunkText(payload.content)) {
        await dm.send(chunk);
      }
      // Mark only after a successful delivery to allow retry on failure
      markMessageSent(payload.id);
    } catch (err) {
      console.error("[webhook] Failed to send DM:", err);
    }
    return;
  }

  // ── Conversation resolved ────────────────────────────────────────────────
  if (event === "conversation_status_changed") {
    if (payload.conversation?.status !== "resolved") return;
    if (!payload.conversation?.id) return;

    const mapping = getMappingByConv(payload.conversation.id);
    if (!mapping) return;

    try {
      const user = await discordClient.users.fetch(mapping.discord_user_id);
      const dm = await user.createDM();
      await dm.send(config.ux.resolvedMessage);
    } catch (err) {
      console.error("[webhook] Failed to send resolved notification:", err);
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
