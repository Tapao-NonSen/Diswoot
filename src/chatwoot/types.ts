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
  status: "open" | "pending" | "resolved" | "snoozed";
  last_activity_at: number; // unix timestamp
  inbox_id: number;
  contact_inbox: { source_id: string };
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
  working_hours: WorkingHour[];
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
  sender?: {
    type: string;
    id: number;
  };
  conversation?: {
    id: number;
    status: "open" | "pending" | "resolved" | "snoozed";
  };
  account?: { id: number };
}
