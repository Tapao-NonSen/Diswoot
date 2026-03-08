import { config } from "../config";
import type {
  ChatwootContact,
  ChatwootConversation,
  ChatwootMessage,
  ChatwootInbox,
} from "./types";
import {
  discordIdentifier,
  pickDisplayName,
  ATTR,
} from "./contact-attributes";
import { runEnrichContact } from "../plugins";

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
 * Chatwoot wraps some responses in { payload: T }, { payload: { contact: T } },
 * or returns them directly. Unwraps safely through all known shapes.
 */
function unwrap<T>(raw: unknown): T {
  const obj = raw as Record<string, unknown>;

  // Shape: { payload: { contact: T } }  (some Chatwoot versions)
  if (obj.payload && typeof obj.payload === "object") {
    const payload = obj.payload as Record<string, unknown>;
    if (payload.contact && typeof payload.contact === "object") {
      return payload.contact as T;
    }
    // Shape: { payload: T }
    return payload as T;
  }

  // Shape: { contact: T }  (no payload wrapper)
  if (obj.contact && typeof obj.contact === "object") {
    return obj.contact as T;
  }

  // Shape: T directly
  return obj as T;
}

// ── Contact helpers ──────────────────────────────────────────────────────────

/** Search Chatwoot for a contact with a given Discord user ID. */
async function findContactByDiscordId(
  discordId: string
): Promise<ChatwootContact | null> {
  const identifier = discordIdentifier(discordId);
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

/** Update an existing Chatwoot contact (name, email, custom_attributes, etc.). */
async function updateContact(
  contactId: number,
  payload: Record<string, unknown>
): Promise<void> {
  await request("PUT", `/contacts/${contactId}`, payload);
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

  // Run plugin enrichment hooks (e.g. Singlty backend → email + user_id)
  const enrichment = await runEnrichContact(discordUser);

  // Best display name: displayName (guild nick) > username
  const name = pickDisplayName({
    displayName: discordUser.displayName,
    username: discordUser.username,
  });

  // custom_attributes visible in the agent sidebar — same keys as the web widget
  const customAttrs: Record<string, string> = {
    [ATTR.DISCORD_ID]: discordUser.id,
    [ATTR.DISCORD_USERNAME]: discordUser.username,
    [ATTR.DISCORD_DISPLAY_NAME]: discordUser.displayName,
    [ATTR.SOURCE]: "discord",
    ...enrichment.customAttributes,
  };

  try {
    const raw = await request<unknown>("POST", "/contacts", {
      name,
      identifier: discordIdentifier(discordUser.id),
      avatar_url: discordUser.avatarURL ?? undefined,
      email: enrichment.email ?? undefined,
      custom_attributes: customAttrs,
    });
    console.debug("[createContact] raw:", JSON.stringify(raw));
    const contact = unwrap<ChatwootContact>(raw);
    contactId = contact.id;
    if (typeof contactId !== "number" || !Number.isFinite(contactId)) {
      throw new Error(
        `Could not extract contact id from POST /contacts response: ${JSON.stringify(raw)}`
      );
    }
  } catch (err) {
    // Contact already exists — find it and update attributes to stay aligned.
    if (err instanceof Error && err.message.includes("422")) {
      const found = await findContactByDiscordId(discordUser.id);
      if (!found) {
        throw new Error(
          `Contact discord:${discordUser.id} exists but could not be found via search`
        );
      }
      contactId = found.id;

      // Sync name, avatar, email, and custom_attributes to latest values
      await updateContact(contactId, {
        name,
        avatar_url: discordUser.avatarURL ?? undefined,
        email: enrichment.email ?? undefined,
        custom_attributes: customAttrs,
      });
    } else {
      throw err;
    }
  }

  const sourceId = await createContactInbox(contactId);
  return { contactId, sourceId };
}

/** Create a new conversation for the contact.
 *  Sends both source_id and inbox_id — Chatwoot v4.11.1 marks
 *  source_id-only lookup as deprecated (will require inbox_id in future). */
export async function createConversation(
  sourceId: string,
  contactId: number,
  status: "open" | "pending" = "open"
): Promise<number> {
  const raw = await request<unknown>("POST", "/conversations", {
    source_id: sourceId,
    inbox_id: inboxId,
    status,
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

/**
 * Submit a CSAT rating via Chatwoot's public survey API so it appears in
 * native CSAT reports. Uses the conversation UUID from csat_survey_link.
 * No API token required — this is a public endpoint.
 *
 * Chatwoot expects a PATCH (update) on the existing `input_csat` message
 * created when the conversation was resolved. The body shape must match the
 * permitted params: `{ message: { submitted_values: { csat_survey_response } } }`.
 */
export async function submitCsatRating(
  conversationUuid: string,
  rating: number,
  feedbackMessage = ""
): Promise<void> {
  const url = `${config.chatwoot.baseUrl}/public/api/v1/csat_survey/${conversationUuid}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: {
        submitted_values: {
          csat_survey_response: { rating, feedback_message: feedbackMessage },
        },
      },
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    // Chatwoot locks CSAT submissions after 14 days — return a typed error
    if (res.status === 422) {
      throw new Error(`CSAT_LOCKED: ${text}`);
    }
    throw new Error(`Chatwoot CSAT PATCH → ${res.status}: ${text}`);
  }
}

/** Toggle conversation status. */
export async function toggleStatus(
  convId: number,
  status: "open" | "resolved" | "pending"
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
