/**
 * Type definitions for Speaker and Sponsor portals.
 * These mirror the SECURITY DEFINER RPC return shapes in 002_functions.sql.
 */

export interface UserRoleAssignments {
  has_speaker: boolean;
  has_sponsor: boolean;
}

export interface SpeakerPortalEvent {
  event_id: string;
  event_slug: string | null;
  event_title: string;
  event_description: string | null;
  event_date: string | null;
  end_date: string | null;
  location: string | null;
  venue: string | null;
  image_url: string | null;
  status: string;
  organizer_name: string | null;
  speaker_id: string;
  speaker_name: string;
  speaker_photo_url: string | null;
  speaker_company: string | null;
  session_count: number;
}

export interface SpeakerPortalEventDetails {
  event: {
    id: string;
    slug: string | null;
    title: string;
    description: string | null;
    date: string | null;
    end_date: string | null;
    location: string | null;
    venue: string | null;
    image_url: string | null;
    banner_landscape_url: string | null;
    status: string;
    timezone: string | null;
    event_format: string | null;
    organizer_name: string | null;
    organizer_slug: string | null;
    organizer_logo: string | null;
  } | null;
  speaker: {
    id: string;
    name: string;
    email: string | null;
    bio: string | null;
    photo_url: string | null;
    company: string | null;
    designation: string | null;
    linkedin_url: string | null;
    company_website: string | null;
    title: string | null;
    first_name: string | null;
    last_name: string | null;
  } | null;
  sessions: Array<{
    id: string;
    title: string;
    description: string | null;
    session_type: string;
    start_time: string;
    end_time: string;
    location: string | null;
  }>;
  analytics: {
    total_registrations: number;
    checked_in_count: number;
  };
}

export interface SponsorPortalEvent {
  event_id: string;
  event_title: string;
  event_date: string | null;
  end_date: string | null;
  location: string | null;
  sponsor_id: string;
  sponsor_name: string;
  tier: string;
  registrations_count: number;
  checked_in_count: number;
}

export interface SponsorPortalPerson {
  kind: "speaker" | "attendee";
  id: string;
  name: string;
  company: string | null;
  ticket_type: string;
  checked_in: boolean;
  checked_in_at: string | null;
}
