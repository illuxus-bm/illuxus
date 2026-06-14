/**
 * TypeScript types for the unified communications module.
 *
 * Mirrors the shape of `public.communications` and `public.communication_recipients`.
 * These are not sourced from the auto-generated Supabase types because Phase 1
 * lands the migration in a separate file (`009_communications.sql`) — this
 * module gets regenerated upstream after the migration is applied.
 */

export type CommunicationChannel = "email" | "whatsapp";

export type CommunicationStatus =
  | "draft"
  | "scheduled"
  | "queued"
  | "sending"
  | "sent"
  | "failed";

export type RecipientType =
  | "all_attendees"
  | "checked_in"
  | "paid"
  | "speakers"
  | "sponsors"
  | "custom"
  // Community-scope recipient types (only meaningful when scope is community)
  | "all_members"
  | "managers"
  | "moderators"
  | "organizers"
  | "mentors";

/**
 * Filter shape persisted in `communications.recipient_filter`. The set is
 * deliberately additive — picking multiple types unions their results, after
 * which the resolver dedups by email.
 */
export interface RecipientFilter {
  types: RecipientType[];
  /** Required when `types` includes `"custom"`. Ignored otherwise. */
  user_ids?: string[];
}

export interface Communication {
  id: string;
  org_id: string;
  event_id: string | null;
  community_id: string | null;
  channels: CommunicationChannel[];
  recipient_filter: RecipientFilter;
  subject: string;
  body_text: string;
  body_html: string | null;
  /** Phase 3: WhatsApp template binding (when channels includes 'whatsapp'). */
  whatsapp_template_name: string | null;
  whatsapp_template_language: string | null;
  whatsapp_template_variables: WhatsAppTemplateBinding | null;
  status: CommunicationStatus;
  scheduled_for: string | null;
  recipient_count: number;
  sent_count: number;
  failed_count: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  sent_at: string | null;
}

export interface CommunicationRecipient {
  id: string;
  communication_id: string;
  user_id: string | null;
  email: string | null;
  phone: string | null;
  name: string | null;
  email_status:
    | "pending" | "sending" | "sent" | "delivered"
    | "opened" | "clicked" | "bounced" | "failed" | null;
  whatsapp_status:
    | "pending" | "sending" | "sent" | "delivered" | "read" | "failed" | null;
  email_sent_at: string | null;
  email_delivered_at: string | null;
  email_opened_at: string | null;
  email_clicked_at: string | null;
  whatsapp_sent_at: string | null;
  whatsapp_delivered_at: string | null;
  whatsapp_read_at: string | null;
  error_message: string | null;
  created_at: string;
}

/**
 * Row returned by the `communications_resolve_recipients` RPC. Used both to
 * preview the recipient count in the compose flow and to feed the bulk send.
 */
export interface ResolvedRecipient {
  user_id: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
}

/**
 * Variables that can appear in subject/body and are interpolated server-side
 * (or for Phase 1, client-side at preview time). Keep this list short — every
 * variable here implies a corresponding column in the recipient row that the
 * resolver must populate.
 */
export const COMMUNICATION_VARIABLES = [
  { token: "{{user_name}}", description: "Recipient's display name" },
  { token: "{{event_name}}", description: "Event title" },
  { token: "{{event_date}}", description: "Event start date (event-local)" },
  { token: "{{event_location}}", description: "Event venue or location" },
  { token: "{{community_name}}", description: "Community name (when applicable)" },
] as const;

/**
 * WhatsApp template registry row — synced from Meta into `whatsapp_templates`
 * by the `whatsapp-sync-templates` edge function. Used by the compose UI to
 * render the template picker + variable inputs.
 */
export interface WhatsAppTemplate {
  name: string;
  language: string;
  category: string | null;
  status: "APPROVED" | "PENDING" | "REJECTED" | "PAUSED" | "DISABLED";
  /** Number of `{{n}}` placeholders in the body component. */
  variable_count: number;
  /** Raw Meta `components` array — kept for header/button parsing in later phases. */
  components: unknown;
  synced_at: string;
}

/**
 * Saved per-communication WhatsApp template binding. Phase 3 stores body
 * variables as a flat array; header / buttons are parked for later phases.
 */
export interface WhatsAppTemplateBinding {
  body?: string[];
  header?: string[];
}

/** Stable ordering for the recipient picker UI. */
export const RECIPIENT_TYPE_LABELS: Record<RecipientType, { label: string; description: string }> = {
  all_attendees: {
    label: "All attendees",
    description: "Everyone with a confirmed registration",
  },
  checked_in: {
    label: "Checked-in attendees",
    description: "Anyone who has scanned in at the venue",
  },
  paid: {
    label: "Paid attendees",
    description: "Registrations with a non-zero amount paid",
  },
  speakers: {
    label: "Speakers",
    description: "Speakers attached to this event / community",
  },
  sponsors: {
    label: "Sponsors",
    description: "Sponsors attached to this event / community",
  },
  custom: {
    label: "Custom selection",
    description: "Pick individual users from the list",
  },
  // Community-scope types
  all_members: {
    label: "All members",
    description: "Every active member of the community",
  },
  managers: {
    label: "Managers",
    description: "Members with the manager role",
  },
  moderators: {
    label: "Moderators",
    description: "Members with the moderator role",
  },
  organizers: {
    label: "Organizers",
    description: "Members with the organizer role",
  },
  mentors: {
    label: "Mentors",
    description: "Members with the mentor role",
  },
};

/**
 * Recipient types available per scope. Used to drive the picker grid.
 *   - `event` scope: attendee-centric filters
 *   - `community` scope: role-based filters
 */
export const RECIPIENT_TYPES_BY_SCOPE = {
  event: ["all_attendees", "checked_in", "paid", "speakers", "sponsors", "custom"] as RecipientType[],
  community: ["all_members", "managers", "moderators", "organizers", "mentors", "speakers", "sponsors", "custom"] as RecipientType[],
} as const;
