export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      attendance_events: {
        Row: {
          actor_id: string | null
          created_at: string
          event_day: string | null
          event_id: string
          id: string
          kind: string
          method: string
          occurred_at: string
          registration_id: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          event_day?: string | null
          event_id: string
          id?: string
          kind: string
          method?: string
          occurred_at?: string
          registration_id: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          event_day?: string | null
          event_id?: string
          id?: string
          kind?: string
          method?: string
          occurred_at?: string
          registration_id?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          created_at: string
          details: Json
          id: string
          target_id: string | null
          target_type: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          target_id?: string | null
          target_type?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          target_id?: string | null
          target_type?: string | null
        }
        Relationships: []
      }
      brand_kits: {
        Row: {
          created_at: string
          created_by: string
          id: string
          name: string
          org_id: string
          snapshot: Json
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          name: string
          org_id: string
          snapshot?: Json
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          name?: string
          org_id?: string
          snapshot?: Json
        }
        Relationships: [
          {
            foreignKeyName: "brand_kits_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      cities: {
        Row: {
          ascii_name: string
          country: string
          country_code: string
          created_at: string
          geoname_id: number | null
          id: string
          latitude: number | null
          longitude: number | null
          name: string
          population: number
          region: string | null
          region_code: string | null
          timezone: string | null
        }
        Insert: {
          ascii_name: string
          country: string
          country_code: string
          created_at?: string
          geoname_id?: number | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          name: string
          population?: number
          region?: string | null
          region_code?: string | null
          timezone?: string | null
        }
        Update: {
          ascii_name?: string
          country?: string
          country_code?: string
          created_at?: string
          geoname_id?: number | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          name?: string
          population?: number
          region?: string | null
          region_code?: string | null
          timezone?: string | null
        }
        Relationships: []
      }
      email_otp_codes: {
        Row: {
          attempts: number
          code_hash: string
          consumed_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          user_id: string
        }
        Insert: {
          attempts?: number
          code_hash: string
          consumed_at?: string | null
          created_at?: string
          email: string
          expires_at: string
          id?: string
          user_id: string
        }
        Update: {
          attempts?: number
          code_hash?: string
          consumed_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      email_settings: {
        Row: {
          domain_configured: boolean
          id: string
          notes: string | null
          require_2fa_for_admins: boolean
          send_approval_emails: boolean
          send_ticket_emails: boolean
          singleton: boolean
          updated_at: string
        }
        Insert: {
          domain_configured?: boolean
          id?: string
          notes?: string | null
          require_2fa_for_admins?: boolean
          send_approval_emails?: boolean
          send_ticket_emails?: boolean
          singleton?: boolean
          updated_at?: string
        }
        Update: {
          domain_configured?: boolean
          id?: string
          notes?: string | null
          require_2fa_for_admins?: boolean
          send_approval_emails?: boolean
          send_ticket_emails?: boolean
          singleton?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      event_creative_backgrounds: {
        Row: {
          aspect_ratio: string
          asset_url: string
          cache_key: string
          created_at: string
          created_by: string
          event_id: string
          expires_at: string | null
          height: number | null
          id: string
          media_type: string
          model: string | null
          prompt: string
          prompt_normalized: string
          provider: string
          size_bytes: number | null
          storage_bucket: string
          storage_path: string
          style_preset: string
          updated_at: string
          width: number | null
        }
        Insert: {
          aspect_ratio: string
          asset_url: string
          cache_key: string
          created_at?: string
          created_by: string
          event_id: string
          expires_at?: string | null
          height?: number | null
          id?: string
          media_type?: string
          model?: string | null
          prompt: string
          prompt_normalized: string
          provider?: string
          size_bytes?: number | null
          storage_bucket?: string
          storage_path: string
          style_preset: string
          updated_at?: string
          width?: number | null
        }
        Update: {
          aspect_ratio?: string
          asset_url?: string
          cache_key?: string
          created_at?: string
          created_by?: string
          event_id?: string
          expires_at?: string | null
          height?: number | null
          id?: string
          media_type?: string
          model?: string | null
          prompt?: string
          prompt_normalized?: string
          provider?: string
          size_bytes?: number | null
          storage_bucket?: string
          storage_path?: string
          style_preset?: string
          updated_at?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "event_creative_backgrounds_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_creatives: {
        Row: {
          asset_url: string
          created_at: string
          created_by: string
          creative_type: string
          customization: Json
          event_id: string
          id: string
          metadata: Json
          platform_format: string
          speaker_id: string | null
          sponsor_id: string | null
          storage_path: string
          template_id: string
        }
        Insert: {
          asset_url: string
          created_at?: string
          created_by: string
          creative_type: string
          customization?: Json
          event_id: string
          id?: string
          metadata?: Json | null
          platform_format: string
          speaker_id?: string | null
          sponsor_id?: string | null
          storage_path: string
          template_id: string
        }
        Update: {
          asset_url?: string
          created_at?: string
          created_by?: string
          creative_type?: string
          customization?: Json
          event_id?: string
          id?: string
          metadata?: Json | null
          platform_format?: string
          speaker_id?: string | null
          sponsor_id?: string | null
          storage_path?: string
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_creatives_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_creatives_speaker_id_fkey"
            columns: ["speaker_id"]
            isOneToOne: false
            referencedRelation: "speakers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_creatives_sponsor_id_fkey"
            columns: ["sponsor_id"]
            isOneToOne: false
            referencedRelation: "sponsors"
            referencedColumns: ["id"]
          },
        ]
      }
      event_speakers: {
        Row: {
          created_at: string
          display_order: number
          event_id: string
          id: string
          speaker_id: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          event_id: string
          id?: string
          speaker_id: string
        }
        Update: {
          created_at?: string
          display_order?: number
          event_id?: string
          id?: string
          speaker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_speakers_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_speakers_speaker_id_fkey"
            columns: ["speaker_id"]
            isOneToOne: false
            referencedRelation: "speakers"
            referencedColumns: ["id"]
          },
        ]
      }
      event_sponsors: {
        Row: {
          created_at: string
          display_order: number
          event_id: string
          id: string
          sponsor_id: string
          tier_override: string | null
        }
        Insert: {
          created_at?: string
          display_order?: number
          event_id: string
          id?: string
          sponsor_id: string
          tier_override?: string | null
        }
        Update: {
          created_at?: string
          display_order?: number
          event_id?: string
          id?: string
          sponsor_id?: string
          tier_override?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_sponsors_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_sponsors_sponsor_id_fkey"
            columns: ["sponsor_id"]
            isOneToOne: false
            referencedRelation: "sponsors"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          attendance_target_pct: number | null
          banner_landscape_url: string | null
          banner_portrait_url: string | null
          capacity: number | null
          cover_video_url: string | null
          created_at: string
          currency: string
          date: string
          description: string | null
          end_date: string | null
          event_format: string
          id: string
          image_url: string | null
          location: string | null
          org_id: string | null
          page_config: Json | null
          price: number | null
          requires_approval: boolean
          slug: string
          status: string
          tickets_sold: number | null
          timezone: string | null
          title: string
          updated_at: string
          user_id: string
          venue: string | null
          virtual_provider: string | null
          virtual_url: string | null
          webinar_branding_enabled: boolean | null
        }
        Insert: {
          attendance_target_pct?: number | null
          banner_landscape_url?: string | null
          banner_portrait_url?: string | null
          capacity?: number | null
          cover_video_url?: string | null
          created_at?: string
          currency?: string
          date: string
          description?: string | null
          end_date?: string | null
          event_format?: string
          id?: string
          image_url?: string | null
          location?: string | null
          org_id?: string | null
          page_config?: Json | null
          price?: number | null
          requires_approval?: boolean
          slug: string
          status?: string
          tickets_sold?: number | null
          timezone?: string | null
          title: string
          updated_at?: string
          user_id: string
          venue?: string | null
          virtual_provider?: string | null
          virtual_url?: string | null
          webinar_branding_enabled?: boolean | null
        }
        Update: {
          attendance_target_pct?: number | null
          banner_landscape_url?: string | null
          banner_portrait_url?: string | null
          capacity?: number | null
          cover_video_url?: string | null
          created_at?: string
          currency?: string
          date?: string
          description?: string | null
          end_date?: string | null
          event_format?: string
          id?: string
          image_url?: string | null
          location?: string | null
          org_id?: string | null
          page_config?: Json | null
          price?: number | null
          requires_approval?: boolean
          slug?: string
          status?: string
          tickets_sold?: number | null
          timezone?: string | null
          title?: string
          updated_at?: string
          user_id?: string
          venue?: string | null
          virtual_provider?: string | null
          virtual_url?: string | null
          webinar_branding_enabled?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_followers: {
        Row: {
          created_at: string
          id: string
          org_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          org_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          org_id?: string
          user_id?: string
        }
        Relationships: []
      }
      org_invitations: {
        Row: {
          created_at: string
          email: string
          id: string
          invited_by: string
          org_id: string
          role: string
          status: string
          token: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          invited_by: string
          org_id: string
          role?: string
          status?: string
          token?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          invited_by?: string
          org_id?: string
          role?: string
          status?: string
          token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_invitations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_members: {
        Row: {
          id: string
          joined_at: string
          org_id: string
          role: string
          user_id: string
        }
        Insert: {
          id?: string
          joined_at?: string
          org_id: string
          role?: string
          user_id: string
        }
        Update: {
          id?: string
          joined_at?: string
          org_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_sponsor_tiers: {
        Row: {
          color: string | null
          created_at: string
          created_by: string | null
          display_order: number
          id: string
          label: string
          org_id: string
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          created_by?: string | null
          display_order?: number
          id?: string
          label: string
          org_id: string
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          created_by?: string | null
          display_order?: number
          id?: string
          label?: string
          org_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      organizations: {
        Row: {
          addons: string[]
          billing_email: string | null
          created_at: string
          custom_domain: string | null
          custom_domain_verified: boolean
          id: string
          landing_config: Json
          landing_published: boolean
          logo_url: string | null
          name: string
          owner_id: string
          plan: string
          plan_limits: Json
          slug: string
          subdomain: string | null
          updated_at: string
          webinar_branding_enabled: boolean
        }
        Insert: {
          addons?: string[]
          billing_email?: string | null
          created_at?: string
          custom_domain?: string | null
          custom_domain_verified?: boolean
          id?: string
          landing_config?: Json
          landing_published?: boolean
          logo_url?: string | null
          name: string
          owner_id: string
          plan?: string
          plan_limits?: Json
          slug: string
          subdomain?: string | null
          updated_at?: string
          webinar_branding_enabled?: boolean
        }
        Update: {
          addons?: string[]
          billing_email?: string | null
          created_at?: string
          custom_domain?: string | null
          custom_domain_verified?: boolean
          id?: string
          landing_config?: Json
          landing_published?: boolean
          logo_url?: string | null
          name?: string
          owner_id?: string
          plan?: string
          plan_limits?: Json
          slug?: string
          subdomain?: string | null
          updated_at?: string
          webinar_branding_enabled?: boolean
        }
        Relationships: []
      }
      profiles: {
        Row: {
          account_type: string
          avatar_url: string | null
          bio: string | null
          city_id: string | null
          company: string | null
          company_employee_count: string | null
          company_website: string | null
          created_at: string
          department: string | null
          designation: string | null
          display_name: string | null
          email_verified: boolean
          first_name: string | null
          headline: string | null
          id: string
          industry: string | null
          last_name: string | null
          linkedin_url: string | null
          mobile_country_code: string | null
          mobile_number: string | null
          mobile_verified: boolean
          onboarding_completed: boolean
          profile_completed: boolean
          title: string | null
          two_factor_enabled: boolean
          updated_at: string
          user_id: string
          username: string | null
          video_fx_prefs: Json
        }
        Insert: {
          account_type?: string
          avatar_url?: string | null
          bio?: string | null
          city_id?: string | null
          company?: string | null
          company_employee_count?: string | null
          company_website?: string | null
          created_at?: string
          department?: string | null
          designation?: string | null
          display_name?: string | null
          email_verified?: boolean
          first_name?: string | null
          headline?: string | null
          id?: string
          industry?: string | null
          last_name?: string | null
          linkedin_url?: string | null
          mobile_country_code?: string | null
          mobile_number?: string | null
          mobile_verified?: boolean
          onboarding_completed?: boolean
          profile_completed?: boolean
          title?: string | null
          two_factor_enabled?: boolean
          updated_at?: string
          user_id: string
          username?: string | null
          video_fx_prefs?: Json
        }
        Update: {
          account_type?: string
          avatar_url?: string | null
          bio?: string | null
          city_id?: string | null
          company?: string | null
          company_employee_count?: string | null
          company_website?: string | null
          created_at?: string
          department?: string | null
          designation?: string | null
          display_name?: string | null
          email_verified?: boolean
          first_name?: string | null
          headline?: string | null
          id?: string
          industry?: string | null
          last_name?: string | null
          linkedin_url?: string | null
          mobile_country_code?: string | null
          mobile_number?: string | null
          mobile_verified?: boolean
          onboarding_completed?: boolean
          profile_completed?: boolean
          title?: string | null
          two_factor_enabled?: boolean
          updated_at?: string
          user_id?: string
          username?: string | null
          video_fx_prefs?: Json
        }
        Relationships: []
      }
      registrations: {
        Row: {
          active_session_id: string | null
          active_session_started_at: string | null
          amount_paid: number | null
          approval_status: string
          approved_at: string | null
          approved_by: string | null
          attendance_state: string
          checked_in: boolean
          checked_in_at: string | null
          checked_in_method: string | null
          company: string | null
          company_employee_count: string | null
          company_website: string | null
          created_at: string
          decline_reason: string | null
          designation: string | null
          email: string
          event_id: string
          first_name: string | null
          id: string
          industry: string | null
          join_token: string
          last_in_at: string | null
          last_name: string | null
          last_out_at: string | null
          linkedin_url: string | null
          mobile_country_code: string | null
          mobile_number: string | null
          name: string
          qr_code: string | null
          status: string
          ticket_type: string
          title: string | null
          total_minutes: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          active_session_id?: string | null
          active_session_started_at?: string | null
          amount_paid?: number | null
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          attendance_state?: string
          checked_in?: boolean
          checked_in_at?: string | null
          checked_in_method?: string | null
          company?: string | null
          company_employee_count?: string | null
          company_website?: string | null
          created_at?: string
          decline_reason?: string | null
          designation?: string | null
          email: string
          event_id: string
          first_name?: string | null
          id?: string
          industry?: string | null
          join_token?: string
          last_in_at?: string | null
          last_name?: string | null
          last_out_at?: string | null
          linkedin_url?: string | null
          mobile_country_code?: string | null
          mobile_number?: string | null
          name: string
          qr_code?: string | null
          status?: string
          ticket_type?: string
          title?: string | null
          total_minutes?: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          active_session_id?: string | null
          active_session_started_at?: string | null
          amount_paid?: number | null
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          attendance_state?: string
          checked_in?: boolean
          checked_in_at?: string | null
          checked_in_method?: string | null
          company?: string | null
          company_employee_count?: string | null
          company_website?: string | null
          created_at?: string
          decline_reason?: string | null
          designation?: string | null
          email?: string
          event_id?: string
          first_name?: string | null
          id?: string
          industry?: string | null
          join_token?: string
          last_in_at?: string | null
          last_name?: string | null
          last_out_at?: string | null
          linkedin_url?: string | null
          mobile_country_code?: string | null
          mobile_number?: string | null
          name?: string
          qr_code?: string | null
          status?: string
          ticket_type?: string
          title?: string | null
          total_minutes?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "registrations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      session_speakers: {
        Row: {
          created_at: string
          position: number
          session_id: string
          speaker_id: string
        }
        Insert: {
          created_at?: string
          position?: number
          session_id: string
          speaker_id: string
        }
        Update: {
          created_at?: string
          position?: number
          session_id?: string
          speaker_id?: string
        }
        Relationships: []
      }
      sessions: {
        Row: {
          created_at: string
          description: string | null
          end_time: string
          event_id: string
          id: string
          location: string | null
          session_type: string
          speaker_id: string | null
          start_time: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          end_time: string
          event_id: string
          id?: string
          location?: string | null
          session_type?: string
          speaker_id?: string | null
          start_time: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          end_time?: string
          event_id?: string
          id?: string
          location?: string | null
          session_type?: string
          speaker_id?: string | null
          start_time?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sessions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_speaker_id_fkey"
            columns: ["speaker_id"]
            isOneToOne: false
            referencedRelation: "speakers"
            referencedColumns: ["id"]
          },
        ]
      }
      site_content: {
        Row: {
          content: Json
          created_at: string
          draft_content: Json | null
          id: string
          published_at: string | null
          section: string
          updated_at: string
        }
        Insert: {
          content?: Json
          created_at?: string
          draft_content?: Json | null
          id?: string
          published_at?: string | null
          section: string
          updated_at?: string
        }
        Update: {
          content?: Json
          created_at?: string
          draft_content?: Json | null
          id?: string
          published_at?: string | null
          section?: string
          updated_at?: string
        }
        Relationships: []
      }
      speakers: {
        Row: {
          bio: string | null
          company: string | null
          company_employee_count: string | null
          company_website: string | null
          created_at: string
          designation: string | null
          email: string | null
          first_name: string | null
          id: string
          industry: string | null
          last_name: string | null
          linkedin_url: string | null
          mobile_country_code: string | null
          mobile_number: string | null
          name: string
          photo_url: string | null
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          bio?: string | null
          company?: string | null
          company_employee_count?: string | null
          company_website?: string | null
          created_at?: string
          designation?: string | null
          email?: string | null
          first_name?: string | null
          id?: string
          industry?: string | null
          last_name?: string | null
          linkedin_url?: string | null
          mobile_country_code?: string | null
          mobile_number?: string | null
          name: string
          photo_url?: string | null
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          bio?: string | null
          company?: string | null
          company_employee_count?: string | null
          company_website?: string | null
          created_at?: string
          designation?: string | null
          email?: string | null
          first_name?: string | null
          id?: string
          industry?: string | null
          last_name?: string | null
          linkedin_url?: string | null
          mobile_country_code?: string | null
          mobile_number?: string | null
          name?: string
          photo_url?: string | null
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      sponsor_members: {
        Row: {
          accepted_at: string | null
          company: string | null
          company_employee_count: string | null
          company_website: string | null
          created_at: string
          designation: string | null
          display_name: string | null
          email: string
          first_name: string | null
          id: string
          industry: string | null
          invite_token: string
          last_name: string | null
          linkedin_url: string | null
          mobile_country_code: string | null
          mobile_number: string | null
          role: string
          sponsor_id: string
          title: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          accepted_at?: string | null
          company?: string | null
          company_employee_count?: string | null
          company_website?: string | null
          created_at?: string
          designation?: string | null
          display_name?: string | null
          email: string
          first_name?: string | null
          id?: string
          industry?: string | null
          invite_token?: string
          last_name?: string | null
          linkedin_url?: string | null
          mobile_country_code?: string | null
          mobile_number?: string | null
          role?: string
          sponsor_id: string
          title?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          accepted_at?: string | null
          company?: string | null
          company_employee_count?: string | null
          company_website?: string | null
          created_at?: string
          designation?: string | null
          display_name?: string | null
          email?: string
          first_name?: string | null
          id?: string
          industry?: string | null
          invite_token?: string
          last_name?: string | null
          linkedin_url?: string | null
          mobile_country_code?: string | null
          mobile_number?: string | null
          role?: string
          sponsor_id?: string
          title?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sponsor_members_sponsor_id_fkey"
            columns: ["sponsor_id"]
            isOneToOne: false
            referencedRelation: "sponsors"
            referencedColumns: ["id"]
          },
        ]
      }
      sponsors: {
        Row: {
          created_at: string
          description: string | null
          email: string | null
          id: string
          logo_url: string | null
          name: string
          tier: string
          tier_label: string | null
          updated_at: string
          user_id: string
          website: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          email?: string | null
          id?: string
          logo_url?: string | null
          name: string
          tier?: string
          tier_label?: string | null
          updated_at?: string
          user_id: string
          website?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          email?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          tier?: string
          tier_label?: string | null
          updated_at?: string
          user_id?: string
          website?: string | null
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          created_at: string
          current_period_end: string
          current_period_start: string
          id: string
          org_id: string
          plan: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_period_end?: string
          current_period_start?: string
          id?: string
          org_id: string
          plan?: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_period_end?: string
          current_period_start?: string
          id?: string
          org_id?: string
          plan?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      webinar_announcements: {
        Row: {
          created_at: string
          id: string
          message: string
          session_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          session_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "webinar_announcements_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "webinar_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      webinar_attendance: {
        Row: {
          display_name: string | null
          duration_seconds: number | null
          id: string
          identity: string
          joined_at: string
          left_at: string | null
          role: string
          session_id: string
          user_id: string | null
        }
        Insert: {
          display_name?: string | null
          duration_seconds?: number | null
          id?: string
          identity: string
          joined_at?: string
          left_at?: string | null
          role?: string
          session_id: string
          user_id?: string | null
        }
        Update: {
          display_name?: string | null
          duration_seconds?: number | null
          id?: string
          identity?: string
          joined_at?: string
          left_at?: string | null
          role?: string
          session_id?: string
          user_id?: string | null
        }
        Relationships: []
      }
      webinar_booths: {
        Row: {
          created_at: string
          cta_label: string | null
          cta_url: string | null
          description: string | null
          event_id: string
          id: string
          logo_url: string | null
          sponsor_id: string | null
          title: string
          video_url: string | null
        }
        Insert: {
          created_at?: string
          cta_label?: string | null
          cta_url?: string | null
          description?: string | null
          event_id: string
          id?: string
          logo_url?: string | null
          sponsor_id?: string | null
          title: string
          video_url?: string | null
        }
        Update: {
          created_at?: string
          cta_label?: string | null
          cta_url?: string | null
          description?: string | null
          event_id?: string
          id?: string
          logo_url?: string | null
          sponsor_id?: string | null
          title?: string
          video_url?: string | null
        }
        Relationships: []
      }
      webinar_browser_sessions: {
        Row: {
          browser_session_id: string
          created_at: string
          fingerprint: string | null
          id: string
          last_seen_at: string
          registration_id: string
        }
        Insert: {
          browser_session_id: string
          created_at?: string
          fingerprint?: string | null
          id?: string
          last_seen_at?: string
          registration_id: string
        }
        Update: {
          browser_session_id?: string
          created_at?: string
          fingerprint?: string | null
          id?: string
          last_seen_at?: string
          registration_id?: string
        }
        Relationships: []
      }
      webinar_chat: {
        Row: {
          created_at: string
          deleted: boolean
          id: string
          message: string
          session_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deleted?: boolean
          id?: string
          message: string
          session_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          deleted?: boolean
          id?: string
          message?: string
          session_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "webinar_chat_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "webinar_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      webinar_lounge_tables: {
        Row: {
          capacity: number
          created_at: string
          id: string
          livekit_subroom: string
          name: string
          session_id: string
        }
        Insert: {
          capacity?: number
          created_at?: string
          id?: string
          livekit_subroom: string
          name: string
          session_id: string
        }
        Update: {
          capacity?: number
          created_at?: string
          id?: string
          livekit_subroom?: string
          name?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "webinar_lounge_tables_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "webinar_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      webinar_poll_votes: {
        Row: {
          created_at: string
          id: string
          option_index: number
          poll_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          option_index: number
          poll_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          option_index?: number
          poll_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "webinar_poll_votes_poll_id_fkey"
            columns: ["poll_id"]
            isOneToOne: false
            referencedRelation: "webinar_polls"
            referencedColumns: ["id"]
          },
        ]
      }
      webinar_polls: {
        Row: {
          created_at: string
          id: string
          open: boolean
          options: Json
          question: string
          session_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          open?: boolean
          options: Json
          question: string
          session_id: string
        }
        Update: {
          created_at?: string
          id?: string
          open?: boolean
          options?: Json
          question?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "webinar_polls_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "webinar_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      webinar_qa: {
        Row: {
          answered: boolean
          created_at: string
          id: string
          pinned: boolean
          question: string
          session_id: string
          upvotes: number
          user_id: string
        }
        Insert: {
          answered?: boolean
          created_at?: string
          id?: string
          pinned?: boolean
          question: string
          session_id: string
          upvotes?: number
          user_id: string
        }
        Update: {
          answered?: boolean
          created_at?: string
          id?: string
          pinned?: boolean
          question?: string
          session_id?: string
          upvotes?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "webinar_qa_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "webinar_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      webinar_reactions: {
        Row: {
          created_at: string
          emoji: string
          id: string
          session_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          id?: string
          session_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          id?: string
          session_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "webinar_reactions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "webinar_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      webinar_sessions: {
        Row: {
          attendance_minutes: number
          branding: Json
          created_at: string
          created_by: string
          egress_id: string | null
          ended_at: string | null
          event_id: string
          id: string
          layout: string
          livekit_room: string
          lobby_open_at: string | null
          lounge_enabled: boolean
          publisher_peak: number
          reactions_enabled: boolean
          record_enabled: boolean
          recording_url: string | null
          started_at: string | null
          status: string
          updated_at: string
          viewer_peak: number
          viewer_total: number
        }
        Insert: {
          attendance_minutes?: number
          branding?: Json
          created_at?: string
          created_by: string
          egress_id?: string | null
          ended_at?: string | null
          event_id: string
          id?: string
          layout?: string
          livekit_room: string
          lobby_open_at?: string | null
          lounge_enabled?: boolean
          publisher_peak?: number
          reactions_enabled?: boolean
          record_enabled?: boolean
          recording_url?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
          viewer_peak?: number
          viewer_total?: number
        }
        Update: {
          attendance_minutes?: number
          branding?: Json
          created_at?: string
          created_by?: string
          egress_id?: string | null
          ended_at?: string | null
          event_id?: string
          id?: string
          layout?: string
          livekit_room?: string
          lobby_open_at?: string | null
          lounge_enabled?: boolean
          publisher_peak?: number
          reactions_enabled?: boolean
          record_enabled?: boolean
          recording_url?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
          viewer_peak?: number
          viewer_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "webinar_sessions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      webinar_speakers: {
        Row: {
          accepted_at: string | null
          created_at: string
          display_name: string
          email: string
          id: string
          invite_token: string
          role: string
          session_id: string
          user_id: string | null
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          display_name: string
          email: string
          id?: string
          invite_token?: string
          role?: string
          session_id: string
          user_id?: string | null
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          display_name?: string
          email?: string
          id?: string
          invite_token?: string
          role?: string
          session_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "webinar_speakers_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "webinar_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      webinar_stage_requests: {
        Row: {
          created_at: string
          id: string
          session_id: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          session_id: string
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          session_id?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "webinar_stage_requests_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "webinar_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _attendance_recompute: { Args: { _reg_id: string }; Returns: undefined }
      _record_audit: {
        Args: {
          _action: string
          _details: Json
          _target_id: string
          _target_type: string
        }
        Returns: undefined
      }
      admin_delete_org: { Args: { _org_id: string }; Returns: undefined }
      admin_list_audit_logs: {
        Args: { _limit?: number }
        Returns: {
          action: string
          actor_email: string
          actor_id: string
          created_at: string
          details: Json
          id: string
          target_id: string
          target_type: string
        }[]
      }
      admin_list_orgs: {
        Args: never
        Returns: {
          billing_email: string
          created_at: string
          custom_domain: string
          event_count: number
          id: string
          member_count: number
          name: string
          owner_id: string
          plan: string
          slug: string
          subdomain: string
        }[]
      }
      admin_list_users: {
        Args: never
        Returns: {
          avatar_url: string
          created_at: string
          display_name: string
          is_platform_admin: boolean
          onboarding_completed: boolean
          org_name: string
          org_plan: string
          user_id: string
        }[]
      }
      admin_set_user_role: {
        Args: {
          _grant: boolean
          _role: Database["public"]["Enums"]["app_role"]
          _target_user_id: string
        }
        Returns: undefined
      }
      admin_update_org_plan: {
        Args: { _new_plan: string; _org_id: string }
        Returns: undefined
      }
      attendance_auto_close: { Args: never; Returns: number }
      attendance_diagnostics: {
        Args: { _event_id: string }
        Returns: {
          attendance_state: string
          blocked_reason: string
          can_check_in: boolean
          email: string
          id: string
          last_event_at: string
          name: string
          ticket_type: string
        }[]
      }
      bulk_set_attendance: {
        Args: { p_ids: string[]; p_method?: string; p_target_state: string }
        Returns: number
      }
      bulk_set_registration_approval: {
        Args: {
          _decline_reason?: string
          _new_status: string
          _registration_ids: string[]
        }
        Returns: number
      }
      cancel_my_registration: {
        Args: { _registration_id: string }
        Returns: undefined
      }
      claim_join_session: {
        Args: { _join_token: string; _session_id: string }
        Returns: {
          email: string
          event_id: string
          name: string
          registration_id: string
          user_id: string
        }[]
      }
      discard_site_draft: { Args: { _section: string }; Returns: undefined }
      event_attendance_audit: {
        Args: { _event_id: string; _limit?: number }
        Returns: {
          action: string
          actor_email: string
          created_at: string
          details: Json
          id: string
          target_id: string
        }[]
      }
      event_branding_enabled: { Args: { _event_id: string }; Returns: boolean }
      event_tracking_closed: { Args: { _event_id: string }; Returns: boolean }
      generate_event_slug: {
        Args: { _event_id?: string; _org_id: string; _title: string }
        Returns: string
      }
      get_event_attendees_public: {
        Args: { _event_id: string; _limit?: number }
        Returns: {
          attendees: Json
          going_count: number
        }[]
      }
      get_event_by_slug: {
        Args: { _org_slug?: string; _slug: string }
        Returns: {
          id: string
          org_id: string
          slug: string
          status: string
        }[]
      }
      get_my_profile: {
        Args: never
        Returns: {
          account_type: string
          avatar_url: string | null
          bio: string | null
          city_id: string | null
          company: string | null
          company_employee_count: string | null
          company_website: string | null
          created_at: string
          department: string | null
          designation: string | null
          display_name: string | null
          email_verified: boolean
          first_name: string | null
          headline: string | null
          id: string
          industry: string | null
          last_name: string | null
          linkedin_url: string | null
          mobile_country_code: string | null
          mobile_number: string | null
          mobile_verified: boolean
          onboarding_completed: boolean
          profile_completed: boolean
          title: string | null
          two_factor_enabled: boolean
          updated_at: string
          user_id: string
          username: string | null
          video_fx_prefs: Json
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_org_by_host: {
        Args: { _host: string }
        Returns: {
          custom_domain: string
          id: string
          landing_config: Json
          landing_published: boolean
          logo_url: string
          name: string
          plan: string
          slug: string
          subdomain: string
        }[]
      }
      get_public_org_brief: {
        Args: { _org_id: string }
        Returns: {
          id: string
          logo_url: string
          name: string
          slug: string
          subdomain: string
        }[]
      }
      get_public_org_by_slug: {
        Args: { _slug: string }
        Returns: {
          custom_domain: string
          id: string
          landing_config: Json
          landing_published: boolean
          logo_url: string
          name: string
          plan: string
          slug: string
          subdomain: string
        }[]
      }
      get_webinar_analytics: { Args: { _session_id: string }; Returns: Json }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_event_approved_attendee: {
        Args: { _event_id: string; _user_id: string }
        Returns: boolean
      }
      is_event_owner: {
        Args: { _event_id: string; _user_id: string }
        Returns: boolean
      }
      is_org_member: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
      is_org_owner: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
      is_sponsor_member: {
        Args: { _sponsor_id: string; _user_id: string }
        Returns: boolean
      }
      log_registrant_action: {
        Args: { _action: string; _details?: Json; _registration_id: string }
        Returns: undefined
      }
      publish_site_section: { Args: { _section: string }; Returns: undefined }
      registration_attendance_audit: {
        Args: { _limit?: number; _registration_id: string }
        Returns: {
          action: string
          actor_email: string
          created_at: string
          details: Json
          id: string
        }[]
      }
      resolve_browser_session: {
        Args: {
          _candidate_session_id: string
          _fingerprint?: string
          _join_token: string
        }
        Returns: string
      }
      save_site_draft: {
        Args: { _content: Json; _section: string }
        Returns: undefined
      }
      search_cities: {
        Args: { _limit?: number; _q: string }
        Returns: {
          country: string
          country_code: string
          id: string
          label: string
          name: string
          population: number
          region: string
        }[]
      }
      self_check_in: {
        Args: { p_event_id?: string; p_token: string }
        Returns: {
          checked_in_at: string
          email: string
          event_id: string
          id: string
          name: string
          status: string
          ticket_type: string
        }[]
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      slugify: { Args: { _input: string }; Returns: string }
      sponsor_portal_events: {
        Args: never
        Returns: {
          checked_in_count: number
          end_date: string
          event_date: string
          event_id: string
          event_title: string
          location: string
          registrations_count: number
          sponsor_id: string
          sponsor_name: string
          tier: string
        }[]
      }
      sponsor_portal_people: {
        Args: { _event_id: string }
        Returns: {
          checked_in: boolean
          checked_in_at: string
          company: string
          id: string
          kind: string
          name: string
          ticket_type: string
        }[]
      }
      toggle_attendance: {
        Args: { p_method?: string; p_registration_id: string }
        Returns: {
          event_id: string
          occurred_at: string
          state: string
          total_minutes: number
        }[]
      }
      undo_attendance: {
        Args: { p_kind: string; p_registration_id: string }
        Returns: {
          deleted: boolean
          state: string
          total_minutes: number
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "moderator", "user"],
    },
  },
} as const
