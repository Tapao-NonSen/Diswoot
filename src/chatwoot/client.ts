import { config } from "../config";
import type {
  ChatwootContact,
  ChatwootContactInbox,
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

/** Create a Chatwoot contact for a Discord user. */
export async function createContact(discordUser: {
  id: string;
  username: string;
  displayName: string;
  avatarURL: string | null;
}): Promise<{ contactId: number; sourceId: string }> {
  const contact = await request<ChatwootContact>("POST", "/contacts", {
    inbox_id: inboxId,
    name: `${discordUser.displayName} (Discord)`,
    identifier: `discord:${discordUser.id}`,
    avatar_url: discordUser.avatarURL ?? undefined,
    additional_attributes: {
      discord_id: discordUser.id,
      discord_username: discordUser.username,
    },
  });

  // Create contact inbox to get source_id
  const inbox = await request<ChatwootContactInbox>(
    "POST",
    `/contacts/${contact.id}/contact_inboxes`,
    { inbox_id: inboxId }
  );

  return { contactId: contact.id, sourceId: inbox.source_id };
}

/** Create a new conversation for the contact. */
export async function createConversation(
  sourceId: string,
  contactId: number
): Promise<number> {
  const conv = await request<ChatwootConversation>("POST", "/conversations", {
    inbox_id: inboxId,
    contact_id: contactId,
    contact_inbox_id: sourceId,
  });
  return conv.id;
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

/** Fetch inbox config including working hours. */
export async function getInbox(): Promise<ChatwootInbox> {
  return request<ChatwootInbox>("GET", `/inboxes/${inboxId}`);
}
