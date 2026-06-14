// Phase-1 types. These don't yet exist in `src/integrations/supabase/types.ts`
// (the supabase generated types haven't been re-pulled). Once you regenerate,
// these can be replaced with `Tables<"communities">` etc.

import type { CommunityKind, CommunityPostType, CommunityRole, CommunityVisibility } from "./rbac";

export interface Community {
  id: string;
  kind: CommunityKind;
  category: string | null;
  parent_id: string | null;
  event_id: string | null;
  org_id: string | null;
  slug: string;
  name: string;
  description: string | null;
  banner_url: string | null;
  logo_url: string | null;
  visibility: CommunityVisibility;
  rules: string | null;
  member_count: number;
  post_count: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CommunityMember {
  id: string;
  community_id: string;
  user_id: string;
  role: CommunityRole;
  status: "active" | "suspended" | "banned" | "left";
  auto: boolean;
  joined_at: string;
  notify_email: boolean;
  notify_push: boolean;
  last_read_at: string | null;
}

export interface CommunityPost {
  id: string;
  community_id: string;
  author_id: string;
  type: CommunityPostType;
  title: string | null;
  body_md: string;
  attachments: Array<{ url: string; kind: string; size?: number; name?: string }>;
  link_url: string | null;
  pinned: boolean;
  important: boolean;
  hidden: boolean;
  comment_count: number;
  reaction_count: number;
  view_count: number;
  created_at: string;
  updated_at: string;
  edited_at: string | null;
  deleted_at: string | null;
}

export interface CommunityComment {
  id: string;
  post_id: string;
  parent_id: string | null;
  author_id: string;
  body_md: string;
  hidden: boolean;
  reaction_count: number;
  created_at: string;
  updated_at: string;
}

export interface AuthorProfile {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
}

export type PostWithAuthor = CommunityPost & { author: AuthorProfile | null };
export type CommentWithAuthor = CommunityComment & { author: AuthorProfile | null };


// ── Phase 2-4 types ────────────────────────────────────────────────────────

export interface CommunityChannel {
  id: string;
  community_id: string;
  kind: "general" | "sessions" | "networking" | "qa" | "custom";
  name: string;
  description: string | null;
  archived: boolean;
  created_at: string;
}

export interface CommunityMessage {
  id: string;
  channel_id: string;
  author_id: string;
  body: string;
  attachments: Array<{ url: string; kind: string; size?: number; name?: string }>;
  reply_to: string | null;
  edited_at: string | null;
  deleted_at: string | null;
  created_at: string;
}

export type MessageWithAuthor = CommunityMessage & { author: AuthorProfile | null };

export interface CommunityResource {
  id: string;
  community_id: string;
  uploaded_by: string | null;
  category: "learning" | "event" | "sponsor" | "session" | "general";
  title: string;
  description: string | null;
  file_url: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  download_count: number;
  created_at: string;
}

export interface CommunityPoll {
  id: string;
  post_id: string;
  multi: boolean;
  options: Array<{ id: string; label: string }>;
  closes_at: string | null;
  created_at: string;
}

export interface CommunityPollVote {
  poll_id: string;
  user_id: string;
  option_id: string;
  created_at: string;
}

export interface CommunityReport {
  id: string;
  community_id: string;
  reporter_id: string;
  post_id: string | null;
  comment_id: string | null;
  reason: string;
  notes: string | null;
  status: "open" | "reviewing" | "actioned" | "dismissed";
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
}

export interface CommunityConnection {
  id: string;
  requester_id: string;
  target_id: string;
  kind: "follow" | "connect";
  status: "pending" | "accepted" | "rejected" | "cancelled";
  context_community_id: string | null;
  created_at: string;
  responded_at: string | null;
}

export interface CalendarItem {
  community_id: string;
  item_id: string;
  kind: "event" | "session";
  title: string;
  starts_at: string;
  ends_at: string;
  location: string | null;
  event_slug: string | null;
  session_id: string | null;
}

export interface AppNotification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  created_at: string;
}
