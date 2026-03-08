export interface ChatwootContact {
  id: number;
  name: string;
  email?: string;
  avatar_url?: string;
  identifier?: string;
}

export interface ChatwootContactInbox {
  source_id: string;
  inbox: { id: number };
}

export interface ChatwootConversation {
  id: number;
  uuid: string;
  status: "open" | "pending" | "resolved" | "snoozed";
  last_activity_at: number; // unix timestamp
  inbox_id: number;
  contact_inbox: { source_id: string };
  /** Populated when CSAT is enabled for the inbox and the conversation is resolved. */
  csat_survey_link?: string;
}

export interface ChatwootMessage {
  id: number;
  content: string;
  message_type: "incoming" | "outgoing" | "template" | "activity";
  /** True for private/internal notes — NOT for display to the end-user. */
  private?: boolean;
  content_attributes?: Record<string, unknown>;
  sender?: {
    type: "contact" | "agent_bot" | "agent";
    id: number;
  };
  conversation_id: number;
}

export interface WorkingHour {
  day_of_week: number;      // 0 = Sunday … 6 = Saturday
  closed_all_day: boolean;
  open_all_day: boolean;
  open_hour: number | null;    // null when closed_all_day is true
  open_minutes: number | null;
  close_hour: number | null;
  close_minutes: number | null;
}

export interface ChatwootInbox {
  id: number;
  name: string;
  working_hours_enabled: boolean;
  timezone: string;
  out_of_office_message: string;
  greeting_enabled: boolean;
  greeting_message: string;
  working_hours: WorkingHour[];
  /** Whether CSAT collection is enabled for this inbox (Chatwoot setting). */
  csat_survey_enabled?: boolean;
  /** Chatwoot 4.x — when true only one conversation per contact+inbox is allowed. */
  lock_to_single_conversation?: boolean;
}

export interface ChatwootAttachment {
  id: number;
  message_id: number;
  file_type: "image" | "audio" | "video" | "file" | "location" | "fallback" | "share" | "story_mention" | "contact";
  account_id: number;
  extension: string;
  data_url: string;
  thumb_url: string;
  file_size: number;
}

/** Shape of webhook POST body from Chatwoot */
export interface WebhookPayload {
  event: string;
  id?: number;
  content?: string;
  message_type?: "incoming" | "outgoing" | "template" | "activity";
  /** True when this is a private agent note — must NOT be forwarded to the user. */
  private?: boolean;
  content_attributes?: Record<string, unknown>;
  attachments?: ChatwootAttachment[];
  sender?: {
    type: string;
    id: number;
  };
  conversation?: {
    id: number;
    status: "open" | "pending" | "resolved" | "snoozed";
    /** Present on conversation_status_changed events — the status before the change. */
    previous_status?: "open" | "pending" | "resolved" | "snoozed";
  };
  account?: { id: number };
}
