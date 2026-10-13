/**
 * Client side of team invitations. Every rule — who may invite, what an
 * invitation grants, and when an account is created — is enforced by the
 * `team-invitation` edge function; what is here only talks to it and gives
 * quick feedback while typing.
 */
import { supabase } from "@/integrations/supabase/client";
import { ACTIVE_ORG_KEY } from "@/contexts/OrgContext";

export interface InviteeFields {
  first_name: string;
  last_name: string;
  designation: string;
  mobile_country_code: string;
  mobile_number: string;
}

export type InviteeFieldErrors = Partial<Record<keyof InviteeFields | "password", string>>;

export interface TeamInvitationReply {
  status: number;
  body: Record<string, unknown>;
}

/** Links issued by the edge function carry 64 hex characters; older links a uuid. */
export const isInvitationLinkToken = (token: string | null | undefined): token is string =>
  !!token && /^[0-9a-f]{64}$/.test(token);

/** Same checks as the server, for immediate feedback. The server decides. */
export function validateInviteeFields(fields: InviteeFields): InviteeFieldErrors {
  const errors: InviteeFieldErrors = {};
  if (!fields.first_name.trim()) errors.first_name = "Enter your first name.";
  if (!fields.last_name.trim()) errors.last_name = "Enter your last name.";
  if (!fields.designation.trim()) errors.designation = "Enter your designation.";
  if (!/^\+\d{1,4}$/.test(fields.mobile_country_code)) errors.mobile_country_code = "Choose a country code.";
  if (!/^\d{6,15}$/.test(fields.mobile_number.replace(/[\s()-]/g, ""))) errors.mobile_number = "Enter a valid mobile number.";
  return errors;
}

/** Calls the edge function and returns its answer whatever the HTTP status.
 *  A signed-in caller's session goes along automatically. */
export async function callTeamInvitation(body: Record<string, unknown>): Promise<TeamInvitationReply> {
  const { data, error } = await supabase.functions.invoke("team-invitation", { body });
  if (!error) return { status: 200, body: (data ?? {}) as Record<string, unknown> };
  // Non-2xx answers arrive as an error carrying the real response.
  const response = (error as { context?: Response }).context;
  if (response && typeof response.json === "function") {
    try {
      return { status: response.status, body: (await response.json()) as Record<string, unknown> };
    } catch { /* fall through */ }
  }
  return { status: 0, body: { ok: false, code: "unreachable", error: "We could not reach Illuxus. Check your connection and try again." } };
}

export const replyError = (reply: TeamInvitationReply, fallback: string): string =>
  typeof reply.body.error === "string" ? reply.body.error : fallback;

/** Opens the dashboard on the workspace the person just joined. */
export function openJoinedWorkspace(orgId: unknown): void {
  if (typeof orgId === "string") {
    try { window.localStorage.setItem(ACTIVE_ORG_KEY, orgId); } catch { /* storage unavailable */ }
  }
  // Full reload so the workspace list includes the new membership.
  window.location.replace("/dashboard");
}
