import { config } from "../config";
import type {
  ChatwootContact,
  ChatwootConversation,
  ChatwootMessage,
  ChatwootInbox,
} from "./types";

const { baseUrl, accountId, apiToken, inboxId } = config.chatwoot;
const base = `${baseUrl}/api/v1/accounts/${accountId}`;

const headers = {
  "Content-Type": "application/json",
  api_access_token: apiToken,
};

async function request<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Chatwoot ${method} ${path} → ${res.status}: ${text}`);
  }

  return res.json() as Promise<T>;
}

/**
 * Chatwoot wraps some responses in { payload: T } and returns others directly.
 * Unwraps safely — if the raw value has a `payload` key we use it,
 * otherwise we treat the whole object as T.
 */
function unwrap<T>(raw: unknown): T {
  const obj = raw as Record<string, unknown>;
  return (obj.payload ?? obj) as T;
}

// ── Contact helpers ──────────────────────────────────────────────────────────

/** Search Chatwoot for a contact with a given Discord user ID. */
async function findContactByDiscordId(
  discordId: string
): Promise<ChatwootContact | null> {
  const identifier = `discord:${discordId}`;
  const data = await request<{
    payload: Array<ChatwootContact & { identifier?: string }>;
  }>(
    "GET",
    `/contacts/search?q=${encodeURIComponent(identifier)}&include_contacts=true`
  );
  return data.payload.find((c) => c.identifier === identifier) ?? null;
}

/**
 * POST /contacts/{id}/contact_inboxes — creates a source_id for this inbox.
 * Chatwoot's API has no GET for this; only POST exists.
 * The response shape is confirmed via debug logging below.
 */
async function createContactInbox(contactId: number): Promise<string> {
  const raw = await request<unknown>(
    "POST",
    `/contacts/${contactId}/contact_inboxes`,
    { inbox_id: inboxId }
  );
  console.debug("[createContactInbox] raw:", JSON.stringify(raw));

  // Handle possible response shapes from different Chatwoot versions
  const obj = raw as Record<string, unknown>;
  if (typeof obj.source_id === "string") return obj.source_id;
  const payload = obj.payload as Record<string, unknown> | undefined;
  if (payload && typeof payload.source_id === "string") return payload.source_id;

  throw new Error(
    `Cannot extract source_id from contact_inboxes response: ${JSON.stringify(raw)}`
  );
}

// ── Public API ───────────────────────────────────────────────────────────────

/** Create a Chatwoot contact for a Discord user, or reuse an existing one. */
export async function createContact(discordUser: {
  id: string;
  username: string;
  displayName: string;
  avatarURL: string | null;
}): Promise<{ contactId: number; sourceId: string }> {
  let contactId: number;

  try {
    // Create contact WITHOUT inbox_id to get a simple, predictable response shape
    const raw = await request<unknown>("POST", "/contacts", {
      name: discordUser.username,
      identifier: `discord:${discordUser.id}`,
      avatar_url: discordUser.avatarURL ?? undefined,
      additional_attributes: {
        discord_id: discordUser.id,
        discord_username: discordUser.username,
      },
    });
    console.debug("[createContact] raw:", JSON.stringify(raw));
    contactId = unwrap<ChatwootContact>(raw).id;
  } catch (err) {
    // Contact already exists — find it by identifier instead of failing
    if (err instanceof Error && err.message.includes("422")) {
      const found = await findContactByDiscordId(discordUser.id);
      if (!found) {
        throw new Error(
          `Contact discord:${discordUser.id} exists but could not be found via search`
        );
      }
      contactId = found.id;
    } else {
      throw err;
    }
  }

  const sourceId = await createContactInbox(contactId);
  return { contactId, sourceId };
}

/** Create a new conversation for the contact. */
export async function createConversation(
  sourceId: string,
  contactId: number
): Promise<number> {
  const raw = await request<unknown>("POST", "/conversations", {
    inbox_id: inboxId,
    contact_id: contactId,
    contact_inbox_id: sourceId,
  });
  console.debug("[createConversation] raw:", JSON.stringify(raw));
  return unwrap<ChatwootConversation>(raw).id;
}

/** Send an incoming (user→agent) or outgoing message to a conversation. */
export async function sendMessage(
  convId: number,
  content: string,
  type: "incoming" | "outgoing" = "incoming"
): Promise<number> {
  const msg = await request<ChatwootMessage>(
    "POST",
    `/conversations/${convId}/messages`,
    { content, message_type: type, private: false }
  );
  return msg.id;
}

/** Post a private note visible only to agents. */
export async function sendNote(convId: number, content: string): Promise<void> {
  await request("POST", `/conversations/${convId}/messages`, {
    content,
    message_type: "outgoing",
    private: true,
  });
}

/** Toggle conversation status between open and resolved. */
export async function toggleStatus(
  convId: number,
  status: "open" | "resolved"
): Promise<void> {
  await request("POST", `/conversations/${convId}/toggle_status`, { status });
}

/** Fetch current conversation metadata. */
export async function getConversation(
  convId: number
): Promise<ChatwootConversation> {
  return request<ChatwootConversation>("GET", `/conversations/${convId}`);
}

/** Fetch inbox config including working hours.
 *  Chatwoot has no GET /inboxes/:id endpoint — we list all and filter. */
export async function getInbox(): Promise<ChatwootInbox> {
  const data = await request<{ payload: ChatwootInbox[] }>("GET", "/inboxes");
  const inbox = data.payload.find((i) => i.id === inboxId);
  if (!inbox) {
    throw new Error(`Inbox ${inboxId} not found in account ${accountId}`);
  }
  return inbox;
}
