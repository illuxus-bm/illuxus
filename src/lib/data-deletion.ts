/**
 * Data deletion requests.
 *
 * A request is filed as a support ticket in the "privacy" category, so it
 * lands in the queue the privacy team already works, gets a ticket number the
 * requester can track, and is confirmed by email — no separate system to
 * build or to forget to check. This module is the pure part: what can be
 * asked for, and how a request is written up.
 */

export type DeletionScope = "account" | "registrations" | "marketing" | "other";

export const DELETION_SCOPES: Array<{ value: DeletionScope; label: string; description: string }> = [
  {
    value: "account",
    label: "Delete my account and all my data",
    description: "Your profile, your registrations and tickets, and anything you uploaded.",
  },
  {
    value: "registrations",
    label: "Delete my registration for specific events",
    description: "Keep your account, remove your details from the events you name below.",
  },
  {
    value: "marketing",
    label: "Stop marketing and delete my marketing data",
    description: "Unsubscribe from everything and remove you from mailing lists.",
  },
  {
    value: "other",
    label: "Something else",
    description: "Describe what you would like deleted.",
  },
];

export interface DeletionRequest {
  name: string;
  email: string;
  scope: DeletionScope;
  details: string;
  /** `true` when the request was filed by someone signed in as `email`. */
  signedIn: boolean;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** A problem with the request, or `null` when it can be sent. Pure. */
export function validateDeletionRequest(request: DeletionRequest, confirmed: boolean): string | null {
  if (!request.name.trim()) return "Enter your name.";
  if (!EMAIL_PATTERN.test(request.email.trim())) return "Enter the email address your data is held under.";
  // "Which events?" and "what else?" can't be acted on without being told.
  if ((request.scope === "registrations" || request.scope === "other") && !request.details.trim()) {
    return request.scope === "registrations" ? "Tell us which events to remove you from." : "Describe what you would like deleted.";
  }
  if (!confirmed) return "Please confirm that you understand deletion is permanent.";
  return null;
}

/** The support ticket a deletion request becomes. Pure. */
export function buildDeletionTicket(request: DeletionRequest): { subject: string; category: "privacy"; message: string; source: string } {
  const scope = DELETION_SCOPES.find((s) => s.value === request.scope) ?? DELETION_SCOPES[0];
  const lines = [
    "DATA DELETION REQUEST",
    "",
    `Requested: ${scope.label}`,
    `Email the data is held under: ${request.email.trim()}`,
    `Identity: ${request.signedIn ? "submitted while signed in to this email address" : "NOT signed in — verify ownership of the email address before acting"}`,
    "",
    "Details from the requester:",
    request.details.trim() || "(none given)",
  ];
  return {
    subject: `Data deletion request — ${scope.label}`.slice(0, 200),
    category: "privacy",
    message: lines.join("\n"),
    source: "data_deletion_request",
  };
}
