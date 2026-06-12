// Capability helpers mirroring the RLS rules in 004_community.sql.
// Server is the source of truth — these are UI-affordance toggles only.

export type CommunityRole =
  | "member"
  | "speaker"
  | "sponsor"
  | "organizer"
  | "moderator"
  | "manager"
  | "mentor";

export type CommunityKind = "parent" | "event";
export type CommunityVisibility = "public" | "members_only" | "private";
export type CommunityPostType =
  | "discussion"
  | "question"
  | "announcement"
  | "resource"
  | "poll"
  | "event_update";

export const COMMUNITY_POST_TYPE_LABEL: Record<CommunityPostType, string> = {
  discussion: "Discussion",
  question: "Question",
  announcement: "Announcement",
  resource: "Resource",
  poll: "Poll",
  event_update: "Update",
};

export function canPostAnnouncement(role: CommunityRole | null | undefined): boolean {
  return role === "organizer" || role === "moderator" || role === "manager";
}

export function canModerate(role: CommunityRole | null | undefined): boolean {
  return role === "moderator" || role === "manager";
}

export function canManageSettings(role: CommunityRole | null | undefined): boolean {
  return role === "manager";
}

export function canPin(role: CommunityRole | null | undefined): boolean {
  return canPostAnnouncement(role);
}

export function canUploadResource(role: CommunityRole | null | undefined): boolean {
  return role !== null && role !== undefined && role !== "member";
}
