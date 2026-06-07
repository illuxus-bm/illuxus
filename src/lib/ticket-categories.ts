export type TicketCategory = {
  value: string;
  label: string;
};

export const TICKET_CATEGORIES: TicketCategory[] = [
  { value: "general", label: "General" },
  { value: "vip", label: "VIP" },
  { value: "early_bird", label: "Early Bird" },
  { value: "student", label: "Student" },
  { value: "speaker", label: "Speaker" },
  { value: "sponsor", label: "Sponsor" },
  { value: "webinar", label: "Webinar" },
  { value: "complimentary", label: "Complimentary" },
];

export const REGISTRATION_STATUSES: { value: string; label: string }[] = [
  { value: "confirmed", label: "Confirmed" },
  { value: "pending", label: "Pending" },
  { value: "cancelled", label: "Cancelled" },
];

export function ticketLabel(value: string | null | undefined): string {
  if (!value) return "—";
  const match = TICKET_CATEGORIES.find((c) => c.value === value);
  return match ? match.label : value;
}