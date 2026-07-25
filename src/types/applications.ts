/**
 * Speaker & Sponsor application types — mirrors DB schema in 001_tables.sql.
 */

export type ApplicationStatus = "pending" | "under_review" | "approved" | "rejected";

export interface SpeakerApplication {
  id: string;
  event_id: string;
  user_id: string;
  // Personal
  full_name: string;
  email: string;
  mobile_country_code: string | null;
  mobile_number: string | null;
  linkedin_url: string | null;
  portfolio_url: string | null;
  // Professional
  job_title: string | null;
  company: string | null;
  years_experience: number | null;
  industry: string | null;
  // Speaker profile
  bio: string | null;
  expertise: string | null;
  topics: string | null;
  past_experience: string | null;
  // Session proposal
  session_title: string;
  session_description: string;
  key_takeaways: string | null;
  target_audience: string | null;
  session_category: string | null;
  session_duration_minutes: number | null;
  // Optional
  past_videos_url: string | null;
  resume_url: string | null;
  notes: string | null;
  // Status
  status: ApplicationStatus;
  rejection_reason: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
  // First-touch UTM attribution — stamped at submission time from
  // sessionStorage. See .kiro/specs/utm-attribution-coverage/.
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
}

export interface SponsorApplication {
  id: string;
  event_id: string;
  user_id: string;
  // Company
  company_name: string;
  company_website: string | null;
  industry: string | null;
  company_description: string | null;
  logo_url: string | null;
  // Contact
  contact_name: string;
  contact_email: string;
  contact_mobile_country_code: string | null;
  contact_mobile_number: string | null;
  contact_designation: string | null;
  // Sponsorship
  sponsorship_tier: string | null;
  budget_range: string | null;
  objectives: string | null;
  expected_outcomes: string | null;
  // Assets (URLs)
  brochure_url: string | null;
  deck_url: string | null;
  promotional_url: string | null;
  // Status
  notes: string | null;
  status: ApplicationStatus;
  rejection_reason: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
  // First-touch UTM attribution — stamped at submission time from
  // sessionStorage. See .kiro/specs/utm-attribution-coverage/.
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
}

export interface MyApplicationRow {
  id: string;
  event_id: string;
  event_title: string;
  event_date: string | null;
  image_url: string | null;
  status: ApplicationStatus;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface MyApplicationsSpeaker extends MyApplicationRow {
  session_title: string;
  expertise: string | null;
}

export interface MyApplicationsSponsor extends MyApplicationRow {
  company_name: string;
  sponsorship_tier: string | null;
}

export interface MyApplications {
  speaker: MyApplicationsSpeaker[];
  sponsor: MyApplicationsSponsor[];
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
