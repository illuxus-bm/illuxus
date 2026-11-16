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
      account_activation_tokens: {
        Row: {
          created_at: string
          email: string
          expires_at: string
          id: string
          next_path: string | null
          person_id: string | null
          purpose: string
          registration_id: string | null
          token_hash: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          expires_at: string
          id?: string
          next_path?: string | null
          person_id?: string | null
          purpose?: string
          registration_id?: string | null
          token_hash: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          next_path?: string | null
          person_id?: string | null
          purpose?: string
          registration_id?: string | null
          token_hash?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "account_activation_tokens_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_activation_tokens_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: false
            referencedRelation: "registrations"
            referencedColumns: ["id"]
          },
        ]
      }
      app_notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          link: string | null
          read: boolean
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          read?: boolean
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          read?: boolean
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
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
      booking_milestones: {
        Row: {
          amount: number
          booking_id: string
          due_date: string | null
          id: string
          label: string
          paid_at: string | null
          sort_order: number
          status: string
        }
        Insert: {
          amount: number
          booking_id: string
          due_date?: string | null
          id?: string
          label: string
          paid_at?: string | null
          sort_order?: number
          status?: string
        }
        Update: {
          amount?: number
          booking_id?: string
          due_date?: string | null
          id?: string
          label?: string
          paid_at?: string | null
          sort_order?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_milestones_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "vendor_bookings"
            referencedColumns: ["id"]
          },
        ]
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
      certificate_audit: {
        Row: {
          action: string
          actor: string | null
          certificate_id: string | null
          created_at: string
          detail: Json
          event_id: string
          id: number
        }
        Insert: {
          action: string
          actor?: string | null
          certificate_id?: string | null
          created_at?: string
          detail?: Json
          event_id: string
          id?: never
        }
        Update: {
          action?: string
          actor?: string | null
          certificate_id?: string | null
          created_at?: string
          detail?: Json
          event_id?: string
          id?: never
        }
        Relationships: [
          {
            foreignKeyName: "certificate_audit_certificate_id_fkey"
            columns: ["certificate_id"]
            isOneToOne: false
            referencedRelation: "certificates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificate_audit_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      certificate_template_versions: {
        Row: {
          design: Json
          id: string
          name: string
          org_id: string
          published_at: string
          published_by: string | null
          settings: Json
          template_id: string
          version: number
        }
        Insert: {
          design: Json
          id?: string
          name: string
          org_id: string
          published_at?: string
          published_by?: string | null
          settings: Json
          template_id: string
          version: number
        }
        Update: {
          design?: Json
          id?: string
          name?: string
          org_id?: string
          published_at?: string
          published_by?: string | null
          settings?: Json
          template_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "certificate_template_versions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificate_template_versions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "certificate_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      certificate_templates: {
        Row: {
          category: string | null
          created_at: string
          created_by: string | null
          current_version: number
          design: Json
          event_id: string | null
          id: string
          name: string
          org_id: string
          orientation: string
          published_at: string | null
          published_version_id: string | null
          settings: Json
          source_template: string | null
          status: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          current_version?: number
          design: Json
          event_id?: string | null
          id?: string
          name: string
          org_id: string
          orientation?: string
          published_at?: string | null
          published_version_id?: string | null
          settings?: Json
          source_template?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          current_version?: number
          design?: Json
          event_id?: string | null
          id?: string
          name?: string
          org_id?: string
          orientation?: string
          published_at?: string | null
          published_version_id?: string | null
          settings?: Json
          source_template?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "certificate_templates_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificate_templates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      certificates: {
        Row: {
          code: string
          email_count: number
          emailed_at: string | null
          event_id: string
          field_values: Json
          id: string
          issued_at: string
          issued_by: string | null
          org_id: string
          recipient_email: string | null
          recipient_name: string
          registration_id: string | null
          revoked_at: string | null
          revoked_by: string | null
          revoked_reason: string | null
          status: string
          template_version_id: string
        }
        Insert: {
          code: string
          email_count?: number
          emailed_at?: string | null
          event_id: string
          field_values?: Json
          id?: string
          issued_at?: string
          issued_by?: string | null
          org_id: string
          recipient_email?: string | null
          recipient_name: string
          registration_id?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          revoked_reason?: string | null
          status?: string
          template_version_id: string
        }
        Update: {
          code?: string
          email_count?: number
          emailed_at?: string | null
          event_id?: string
          field_values?: Json
          id?: string
          issued_at?: string
          issued_by?: string | null
          org_id?: string
          recipient_email?: string | null
          recipient_name?: string
          registration_id?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          revoked_reason?: string | null
          status?: string
          template_version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "certificates_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificates_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: false
            referencedRelation: "registrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificates_template_version_id_fkey"
            columns: ["template_version_id"]
            isOneToOne: false
            referencedRelation: "certificate_template_versions"
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
      communication_recipients: {
        Row: {
          communication_id: string
          created_at: string
          email: string | null
          email_clicked_at: string | null
          email_delivered_at: string | null
          email_opened_at: string | null
          email_sent_at: string | null
          email_status: string | null
          error_message: string | null
          id: string
          name: string | null
          phone: string | null
          rendered_body: string | null
          rendered_subject: string | null
          user_id: string | null
          whatsapp_delivered_at: string | null
          whatsapp_read_at: string | null
          whatsapp_sent_at: string | null
          whatsapp_status: string | null
        }
        Insert: {
          communication_id: string
          created_at?: string
          email?: string | null
          email_clicked_at?: string | null
          email_delivered_at?: string | null
          email_opened_at?: string | null
          email_sent_at?: string | null
          email_status?: string | null
          error_message?: string | null
          id?: string
          name?: string | null
          phone?: string | null
          rendered_body?: string | null
          rendered_subject?: string | null
          user_id?: string | null
          whatsapp_delivered_at?: string | null
          whatsapp_read_at?: string | null
          whatsapp_sent_at?: string | null
          whatsapp_status?: string | null
        }
        Update: {
          communication_id?: string
          created_at?: string
          email?: string | null
          email_clicked_at?: string | null
          email_delivered_at?: string | null
          email_opened_at?: string | null
          email_sent_at?: string | null
          email_status?: string | null
          error_message?: string | null
          id?: string
          name?: string | null
          phone?: string | null
          rendered_body?: string | null
          rendered_subject?: string | null
          user_id?: string | null
          whatsapp_delivered_at?: string | null
          whatsapp_read_at?: string | null
          whatsapp_sent_at?: string | null
          whatsapp_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "communication_recipients_communication_id_fkey"
            columns: ["communication_id"]
            isOneToOne: false
            referencedRelation: "communications"
            referencedColumns: ["id"]
          },
        ]
      }
      communications: {
        Row: {
          body_html: string | null
          body_text: string
          channels: string[]
          community_id: string | null
          created_at: string
          created_by: string
          event_id: string | null
          failed_count: number
          id: string
          last_error: string | null
          org_id: string
          recipient_count: number
          recipient_filter: Json
          scheduled_for: string | null
          sent_at: string | null
          sent_count: number
          status: string
          subject: string
          updated_at: string
          whatsapp_template_language: string | null
          whatsapp_template_name: string | null
          whatsapp_template_variables: Json | null
        }
        Insert: {
          body_html?: string | null
          body_text?: string
          channels?: string[]
          community_id?: string | null
          created_at?: string
          created_by: string
          event_id?: string | null
          failed_count?: number
          id?: string
          last_error?: string | null
          org_id: string
          recipient_count?: number
          recipient_filter?: Json
          scheduled_for?: string | null
          sent_at?: string | null
          sent_count?: number
          status?: string
          subject: string
          updated_at?: string
          whatsapp_template_language?: string | null
          whatsapp_template_name?: string | null
          whatsapp_template_variables?: Json | null
        }
        Update: {
          body_html?: string | null
          body_text?: string
          channels?: string[]
          community_id?: string | null
          created_at?: string
          created_by?: string
          event_id?: string | null
          failed_count?: number
          id?: string
          last_error?: string | null
          org_id?: string
          recipient_count?: number
          recipient_filter?: Json
          scheduled_for?: string | null
          sent_at?: string | null
          sent_count?: number
          status?: string
          subject?: string
          updated_at?: string
          whatsapp_template_language?: string | null
          whatsapp_template_name?: string | null
          whatsapp_template_variables?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "communications_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communications_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communications_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      communities: {
        Row: {
          banner_url: string | null
          category: Database["public"]["Enums"]["community_category"] | null
          created_at: string
          created_by: string | null
          description: string | null
          event_id: string | null
          id: string
          kind: Database["public"]["Enums"]["community_kind"]
          logo_url: string | null
          member_count: number
          name: string
          org_id: string | null
          parent_id: string | null
          post_count: number
          rules: string | null
          slug: string
          updated_at: string
          visibility: Database["public"]["Enums"]["community_visibility"]
        }
        Insert: {
          banner_url?: string | null
          category?: Database["public"]["Enums"]["community_category"] | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          event_id?: string | null
          id?: string
          kind: Database["public"]["Enums"]["community_kind"]
          logo_url?: string | null
          member_count?: number
          name: string
          org_id?: string | null
          parent_id?: string | null
          post_count?: number
          rules?: string | null
          slug: string
          updated_at?: string
          visibility?: Database["public"]["Enums"]["community_visibility"]
        }
        Update: {
          banner_url?: string | null
          category?: Database["public"]["Enums"]["community_category"] | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          event_id?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["community_kind"]
          logo_url?: string | null
          member_count?: number
          name?: string
          org_id?: string | null
          parent_id?: string | null
          post_count?: number
          rules?: string | null
          slug?: string
          updated_at?: string
          visibility?: Database["public"]["Enums"]["community_visibility"]
        }
        Relationships: [
          {
            foreignKeyName: "communities_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communities_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communities_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
        ]
      }
      community_badges: {
        Row: {
          description: string | null
          icon: string
          id: string
          label: string
          rule_kind: string
          threshold: number | null
        }
        Insert: {
          description?: string | null
          icon: string
          id: string
          label: string
          rule_kind: string
          threshold?: number | null
        }
        Update: {
          description?: string | null
          icon?: string
          id?: string
          label?: string
          rule_kind?: string
          threshold?: number | null
        }
        Relationships: []
      }
      community_bookmarks: {
        Row: {
          created_at: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_bookmarks_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      community_channels: {
        Row: {
          archived: boolean
          community_id: string
          created_at: string
          description: string | null
          id: string
          kind: string
          name: string
        }
        Insert: {
          archived?: boolean
          community_id: string
          created_at?: string
          description?: string | null
          id?: string
          kind?: string
          name: string
        }
        Update: {
          archived?: boolean
          community_id?: string
          created_at?: string
          description?: string | null
          id?: string
          kind?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_channels_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
        ]
      }
      community_comments: {
        Row: {
          author_id: string
          body_md: string
          created_at: string
          hidden: boolean
          id: string
          parent_id: string | null
          post_id: string
          reaction_count: number
          updated_at: string
        }
        Insert: {
          author_id: string
          body_md: string
          created_at?: string
          hidden?: boolean
          id?: string
          parent_id?: string | null
          post_id: string
          reaction_count?: number
          updated_at?: string
        }
        Update: {
          author_id?: string
          body_md?: string
          created_at?: string
          hidden?: boolean
          id?: string
          parent_id?: string | null
          post_id?: string
          reaction_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "community_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      community_connections: {
        Row: {
          context_community_id: string | null
          created_at: string
          id: string
          kind: string
          requester_id: string
          responded_at: string | null
          status: string
          target_id: string
        }
        Insert: {
          context_community_id?: string | null
          created_at?: string
          id?: string
          kind: string
          requester_id: string
          responded_at?: string | null
          status?: string
          target_id: string
        }
        Update: {
          context_community_id?: string | null
          created_at?: string
          id?: string
          kind?: string
          requester_id?: string
          responded_at?: string | null
          status?: string
          target_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_connections_context_community_id_fkey"
            columns: ["context_community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
        ]
      }
      community_members: {
        Row: {
          auto: boolean
          community_id: string
          id: string
          joined_at: string
          last_read_at: string | null
          notify_email: boolean
          notify_push: boolean
          role: Database["public"]["Enums"]["community_role"]
          status: string
          user_id: string
        }
        Insert: {
          auto?: boolean
          community_id: string
          id?: string
          joined_at?: string
          last_read_at?: string | null
          notify_email?: boolean
          notify_push?: boolean
          role?: Database["public"]["Enums"]["community_role"]
          status?: string
          user_id: string
        }
        Update: {
          auto?: boolean
          community_id?: string
          id?: string
          joined_at?: string
          last_read_at?: string | null
          notify_email?: boolean
          notify_push?: boolean
          role?: Database["public"]["Enums"]["community_role"]
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_members_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
        ]
      }
      community_messages: {
        Row: {
          attachments: Json
          author_id: string
          body: string
          channel_id: string
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          id: string
          reply_to: string | null
        }
        Insert: {
          attachments?: Json
          author_id: string
          body: string
          channel_id: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          reply_to?: string | null
        }
        Update: {
          attachments?: Json
          author_id?: string
          body?: string
          channel_id?: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          reply_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "community_messages_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "community_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_messages_reply_to_fkey"
            columns: ["reply_to"]
            isOneToOne: false
            referencedRelation: "community_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      community_poll_votes: {
        Row: {
          created_at: string
          option_id: string
          poll_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          option_id: string
          poll_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          option_id?: string
          poll_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_poll_votes_poll_id_fkey"
            columns: ["poll_id"]
            isOneToOne: false
            referencedRelation: "community_polls"
            referencedColumns: ["id"]
          },
        ]
      }
      community_polls: {
        Row: {
          closes_at: string | null
          created_at: string
          id: string
          multi: boolean
          options: Json
          post_id: string
        }
        Insert: {
          closes_at?: string | null
          created_at?: string
          id?: string
          multi?: boolean
          options: Json
          post_id: string
        }
        Update: {
          closes_at?: string | null
          created_at?: string
          id?: string
          multi?: boolean
          options?: Json
          post_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_polls_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: true
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      community_posts: {
        Row: {
          attachments: Json
          author_id: string
          body_md: string
          comment_count: number
          community_id: string
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          hidden: boolean
          id: string
          important: boolean
          link_url: string | null
          pinned: boolean
          reaction_count: number
          title: string | null
          ts_search: unknown
          type: Database["public"]["Enums"]["community_post_type"]
          updated_at: string
          view_count: number
        }
        Insert: {
          attachments?: Json
          author_id: string
          body_md?: string
          comment_count?: number
          community_id: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          hidden?: boolean
          id?: string
          important?: boolean
          link_url?: string | null
          pinned?: boolean
          reaction_count?: number
          title?: string | null
          ts_search?: unknown
          type?: Database["public"]["Enums"]["community_post_type"]
          updated_at?: string
          view_count?: number
        }
        Update: {
          attachments?: Json
          author_id?: string
          body_md?: string
          comment_count?: number
          community_id?: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          hidden?: boolean
          id?: string
          important?: boolean
          link_url?: string | null
          pinned?: boolean
          reaction_count?: number
          title?: string | null
          ts_search?: unknown
          type?: Database["public"]["Enums"]["community_post_type"]
          updated_at?: string
          view_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "community_posts_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
        ]
      }
      community_reactions: {
        Row: {
          comment_id: string | null
          created_at: string
          emoji: string
          id: string
          post_id: string | null
          user_id: string
        }
        Insert: {
          comment_id?: string | null
          created_at?: string
          emoji?: string
          id?: string
          post_id?: string | null
          user_id: string
        }
        Update: {
          comment_id?: string | null
          created_at?: string
          emoji?: string
          id?: string
          post_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_reactions_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "community_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_reactions_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      community_reports: {
        Row: {
          comment_id: string | null
          community_id: string
          created_at: string
          id: string
          notes: string | null
          post_id: string | null
          reason: string
          reporter_id: string
          resolved_at: string | null
          resolved_by: string | null
          status: string
        }
        Insert: {
          comment_id?: string | null
          community_id: string
          created_at?: string
          id?: string
          notes?: string | null
          post_id?: string | null
          reason: string
          reporter_id: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
        }
        Update: {
          comment_id?: string | null
          community_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          post_id?: string | null
          reason?: string
          reporter_id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_reports_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "community_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_reports_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_reports_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      community_resources: {
        Row: {
          category: string
          community_id: string
          created_at: string
          description: string | null
          download_count: number
          file_name: string
          file_size: number
          file_url: string
          id: string
          mime_type: string
          title: string
          uploaded_by: string | null
        }
        Insert: {
          category?: string
          community_id: string
          created_at?: string
          description?: string | null
          download_count?: number
          file_name: string
          file_size: number
          file_url: string
          id?: string
          mime_type: string
          title: string
          uploaded_by?: string | null
        }
        Update: {
          category?: string
          community_id?: string
          created_at?: string
          description?: string | null
          download_count?: number
          file_name?: string
          file_size?: number
          file_url?: string
          id?: string
          mime_type?: string
          title?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "community_resources_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
        ]
      }
      community_user_badges: {
        Row: {
          awarded_at: string
          badge_id: string
          community_id: string
          user_id: string
        }
        Insert: {
          awarded_at?: string
          badge_id: string
          community_id: string
          user_id: string
        }
        Update: {
          awarded_at?: string
          badge_id?: string
          community_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_user_badges_badge_id_fkey"
            columns: ["badge_id"]
            isOneToOne: false
            referencedRelation: "community_badges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_user_badges_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          common_name: string | null
          company_status: string
          company_type: string | null
          corporate_group: string | null
          created_at: string
          created_by: string | null
          description: string | null
          employee_range: string | null
          entry_count: number
          hq_city: string | null
          hq_country: string | null
          id: string
          industry: string | null
          last_enriched_at: string | null
          legal_name: string | null
          merged_into: string | null
          name: string
          name_key: string
          parent_company_id: string | null
          registered_address: string | null
          revenue_range: string | null
          source: string
          sub_industry: string | null
          technologies: Json
          updated_at: string
          verification_status: string
          website: string | null
        }
        Insert: {
          common_name?: string | null
          company_status?: string
          company_type?: string | null
          corporate_group?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          employee_range?: string | null
          entry_count?: number
          hq_city?: string | null
          hq_country?: string | null
          id?: string
          industry?: string | null
          last_enriched_at?: string | null
          legal_name?: string | null
          merged_into?: string | null
          name: string
          name_key: string
          parent_company_id?: string | null
          registered_address?: string | null
          revenue_range?: string | null
          source?: string
          sub_industry?: string | null
          technologies?: Json
          updated_at?: string
          verification_status?: string
          website?: string | null
        }
        Update: {
          common_name?: string | null
          company_status?: string
          company_type?: string | null
          corporate_group?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          employee_range?: string | null
          entry_count?: number
          hq_city?: string | null
          hq_country?: string | null
          id?: string
          industry?: string | null
          last_enriched_at?: string | null
          legal_name?: string | null
          merged_into?: string | null
          name?: string
          name_key?: string
          parent_company_id?: string | null
          registered_address?: string | null
          revenue_range?: string | null
          source?: string
          sub_industry?: string | null
          technologies?: Json
          updated_at?: string
          verification_status?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "companies_merged_into_fkey"
            columns: ["merged_into"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "companies_parent_company_id_fkey"
            columns: ["parent_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_aliases: {
        Row: {
          alias: string
          alias_key: string
          company_id: string
          id: string
          kind: string
        }
        Insert: {
          alias: string
          alias_key: string
          company_id: string
          id?: string
          kind?: string
        }
        Update: {
          alias?: string
          alias_key?: string
          company_id?: string
          id?: string
          kind?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_aliases_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_domains: {
        Row: {
          company_id: string
          created_at: string
          domain: string
          id: string
          kind: string
        }
        Insert: {
          company_id: string
          created_at?: string
          domain: string
          id?: string
          kind?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          domain?: string
          id?: string
          kind?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_domains_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_identifiers: {
        Row: {
          company_id: string
          id: string
          scheme: string
          value: string
          verified: boolean
        }
        Insert: {
          company_id: string
          id?: string
          scheme: string
          value: string
          verified?: boolean
        }
        Update: {
          company_id?: string
          id?: string
          scheme?: string
          value?: string
          verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "company_identifiers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_locations: {
        Row: {
          city: string | null
          company_id: string
          country: string | null
          id: string
          kind: string
          region: string | null
        }
        Insert: {
          city?: string | null
          company_id: string
          country?: string | null
          id?: string
          kind?: string
          region?: string | null
        }
        Update: {
          city?: string | null
          company_id?: string
          country?: string | null
          id?: string
          kind?: string
          region?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_locations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_match_candidates: {
        Row: {
          company_a: string
          company_b: string
          created_at: string
          id: string
          reasons: string[]
          reviewed_at: string | null
          reviewed_by: string | null
          score: number
          status: string
        }
        Insert: {
          company_a: string
          company_b: string
          created_at?: string
          id?: string
          reasons: string[]
          reviewed_at?: string | null
          reviewed_by?: string | null
          score?: number
          status?: string
        }
        Update: {
          company_a?: string
          company_b?: string
          created_at?: string
          id?: string
          reasons?: string[]
          reviewed_at?: string | null
          reviewed_by?: string | null
          score?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_match_candidates_company_a_fkey"
            columns: ["company_a"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_match_candidates_company_b_fkey"
            columns: ["company_b"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_mentions: {
        Row: {
          company_id: string
          created_at: string
          person_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          person_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          person_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_mentions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_mentions_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      company_source_records: {
        Row: {
          company_id: string | null
          data: Json
          external_id: string
          fetched_at: string
          id: string
          licence: string | null
          provider: string
        }
        Insert: {
          company_id?: string | null
          data?: Json
          external_id: string
          fetched_at?: string
          id?: string
          licence?: string | null
          provider: string
        }
        Update: {
          company_id?: string | null
          data?: Json
          external_id?: string
          fetched_at?: string
          id?: string
          licence?: string | null
          provider?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_source_records_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      correction_suggestions: {
        Row: {
          confidence: number
          created_at: string
          current_value: string | null
          entity_id: string
          entity_type: string
          evidence: string | null
          field: string
          id: string
          kind: string
          reason: string
          reviewed_at: string | null
          reviewed_by: string | null
          safe: boolean
          status: string
          suggested_value: string | null
        }
        Insert: {
          confidence: number
          created_at?: string
          current_value?: string | null
          entity_id: string
          entity_type: string
          evidence?: string | null
          field: string
          id?: string
          kind: string
          reason: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          safe?: boolean
          status?: string
          suggested_value?: string | null
        }
        Update: {
          confidence?: number
          created_at?: string
          current_value?: string | null
          entity_id?: string
          entity_type?: string
          evidence?: string | null
          field?: string
          id?: string
          kind?: string
          reason?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          safe?: boolean
          status?: string
          suggested_value?: string | null
        }
        Relationships: []
      }
      dial_codes: {
        Row: {
          dial: string
          iso: string
        }
        Insert: {
          dial: string
          iso: string
        }
        Update: {
          dial?: string
          iso?: string
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
      event_creative_ai_drafts: {
        Row: {
          copy: Json
          created_at: string
          created_by: string | null
          entity_id: string | null
          entity_type: string
          event_id: string
          id: string
          source: string
          status: string
          updated_at: string
        }
        Insert: {
          copy: Json
          created_at?: string
          created_by?: string | null
          entity_id?: string | null
          entity_type: string
          event_id: string
          id?: string
          source?: string
          status?: string
          updated_at?: string
        }
        Update: {
          copy?: Json
          created_at?: string
          created_by?: string | null
          entity_id?: string | null
          entity_type?: string
          event_id?: string
          id?: string
          source?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_creative_ai_drafts_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
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
          metadata?: Json
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
          metadata?: Json
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
            foreignKeyName: "event_creatives_speaker_id_fkey"
            columns: ["speaker_id"]
            isOneToOne: false
            referencedRelation: "speakers_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_creatives_sponsor_id_fkey"
            columns: ["sponsor_id"]
            isOneToOne: false
            referencedRelation: "sponsors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_creatives_sponsor_id_fkey"
            columns: ["sponsor_id"]
            isOneToOne: false
            referencedRelation: "sponsors_public"
            referencedColumns: ["id"]
          },
        ]
      }
      event_emails: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          event_id: string
          id: string
          recipient_filter: string
          recipients: string
          sent_at: string | null
          status: string
          subject: string
          updated_at: string
        }
        Insert: {
          body?: string
          created_at?: string
          created_by?: string | null
          event_id: string
          id?: string
          recipient_filter?: string
          recipients?: string
          sent_at?: string | null
          status?: string
          subject: string
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          event_id?: string
          id?: string
          recipient_filter?: string
          recipients?: string
          sent_at?: string | null
          status?: string
          subject?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_emails_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_private_details: {
        Row: {
          event_id: string
          updated_at: string
          virtual_url: string | null
        }
        Insert: {
          event_id: string
          updated_at?: string
          virtual_url?: string | null
        }
        Update: {
          event_id?: string
          updated_at?: string
          virtual_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_private_details_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "events"
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
          {
            foreignKeyName: "event_speakers_speaker_id_fkey"
            columns: ["speaker_id"]
            isOneToOne: false
            referencedRelation: "speakers_public"
            referencedColumns: ["id"]
          },
        ]
      }
      event_sponsor_contacts: {
        Row: {
          created_at: string
          created_by: string | null
          event_sponsor_id: string
          id: string
          member_id: string
          responsibilities: string | null
          role_label: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          event_sponsor_id: string
          id?: string
          member_id: string
          responsibilities?: string | null
          role_label?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          event_sponsor_id?: string
          id?: string
          member_id?: string
          responsibilities?: string | null
          role_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_sponsor_contacts_event_sponsor_id_fkey"
            columns: ["event_sponsor_id"]
            isOneToOne: false
            referencedRelation: "event_sponsors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_sponsor_contacts_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "sponsor_members"
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
          logo_url: string | null
          sponsor_id: string
          tier: string | null
          tier_label: string | null
          tier_override: string | null
        }
        Insert: {
          created_at?: string
          display_order?: number
          event_id: string
          id?: string
          logo_url?: string | null
          sponsor_id: string
          tier?: string | null
          tier_label?: string | null
          tier_override?: string | null
        }
        Update: {
          created_at?: string
          display_order?: number
          event_id?: string
          id?: string
          logo_url?: string | null
          sponsor_id?: string
          tier?: string | null
          tier_label?: string | null
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
          {
            foreignKeyName: "event_sponsors_sponsor_id_fkey"
            columns: ["sponsor_id"]
            isOneToOne: false
            referencedRelation: "sponsors_public"
            referencedColumns: ["id"]
          },
        ]
      }
      event_sponsorship_details: {
        Row: {
          commercial_value: number | null
          contract_url: string | null
          currency: string
          deliverables: string | null
          event_sponsor_id: string
          notes: string | null
          package: string | null
          payment_status: string
          status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          commercial_value?: number | null
          contract_url?: string | null
          currency?: string
          deliverables?: string | null
          event_sponsor_id: string
          notes?: string | null
          package?: string | null
          payment_status?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          commercial_value?: number | null
          contract_url?: string | null
          currency?: string
          deliverables?: string | null
          event_sponsor_id?: string
          notes?: string | null
          package?: string | null
          payment_status?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_sponsorship_details_event_sponsor_id_fkey"
            columns: ["event_sponsor_id"]
            isOneToOne: true
            referencedRelation: "event_sponsors"
            referencedColumns: ["id"]
          },
        ]
      }
      event_venue_selections: {
        Row: {
          created_at: string
          event_duration_hours: number | null
          event_id: string
          event_type: string | null
          expected_attendees: number | null
          id: string
          needs_additional_rooms: boolean
          needs_pre_function_area: boolean
          needs_vip_area: boolean
          notes: string | null
          notified_at: string | null
          org_id: string
          responded_at: string | null
          response_notified_status: string | null
          seating_arrangement: string | null
          seating_capacity: number | null
          selected_by: string | null
          selected_service_ids: string[]
          status: string
          updated_at: string
          vendor_id: string
          venue_id: string | null
          venue_link: string | null
        }
        Insert: {
          created_at?: string
          event_duration_hours?: number | null
          event_id: string
          event_type?: string | null
          expected_attendees?: number | null
          id?: string
          needs_additional_rooms?: boolean
          needs_pre_function_area?: boolean
          needs_vip_area?: boolean
          notes?: string | null
          notified_at?: string | null
          org_id: string
          responded_at?: string | null
          response_notified_status?: string | null
          seating_arrangement?: string | null
          seating_capacity?: number | null
          selected_by?: string | null
          selected_service_ids?: string[]
          status?: string
          updated_at?: string
          vendor_id: string
          venue_id?: string | null
          venue_link?: string | null
        }
        Update: {
          created_at?: string
          event_duration_hours?: number | null
          event_id?: string
          event_type?: string | null
          expected_attendees?: number | null
          id?: string
          needs_additional_rooms?: boolean
          needs_pre_function_area?: boolean
          needs_vip_area?: boolean
          notes?: string | null
          notified_at?: string | null
          org_id?: string
          responded_at?: string | null
          response_notified_status?: string | null
          seating_arrangement?: string | null
          seating_capacity?: number | null
          selected_by?: string | null
          selected_service_ids?: string[]
          status?: string
          updated_at?: string
          vendor_id?: string
          venue_id?: string | null
          venue_link?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_venue_selections_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_venue_selections_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_venue_selections_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          ask_sponsor_consent: boolean
          attendance_target_pct: number | null
          banner_landscape_url: string | null
          banner_portrait_url: string | null
          capacity: number | null
          community_category: string | null
          cover_video_url: string | null
          create_community: boolean
          created_at: string
          currency: string
          date: string
          deleted_at: string | null
          description: string | null
          end_date: string | null
          event_format: string
          id: string
          image_url: string | null
          location: string | null
          org_id: string | null
          page_config: Json | null
          previous_event_id: string | null
          price: number | null
          published: boolean | null
          requires_approval: boolean
          slug: string
          speaker_applications_enabled: boolean
          sponsor_applications_enabled: boolean
          status: string
          tickets_sold: number | null
          timezone: string | null
          title: string
          updated_at: string
          user_id: string
          venue: string | null
          video_provider: string | null
          virtual_provider: string | null
          virtual_url: string | null
          webinar_branding_enabled: boolean | null
        }
        Insert: {
          ask_sponsor_consent?: boolean
          attendance_target_pct?: number | null
          banner_landscape_url?: string | null
          banner_portrait_url?: string | null
          capacity?: number | null
          community_category?: string | null
          cover_video_url?: string | null
          create_community?: boolean
          created_at?: string
          currency?: string
          date: string
          deleted_at?: string | null
          description?: string | null
          end_date?: string | null
          event_format?: string
          id?: string
          image_url?: string | null
          location?: string | null
          org_id?: string | null
          page_config?: Json | null
          previous_event_id?: string | null
          price?: number | null
          published?: boolean | null
          requires_approval?: boolean
          slug: string
          speaker_applications_enabled?: boolean
          sponsor_applications_enabled?: boolean
          status?: string
          tickets_sold?: number | null
          timezone?: string | null
          title: string
          updated_at?: string
          user_id: string
          venue?: string | null
          video_provider?: string | null
          virtual_provider?: string | null
          virtual_url?: string | null
          webinar_branding_enabled?: boolean | null
        }
        Update: {
          ask_sponsor_consent?: boolean
          attendance_target_pct?: number | null
          banner_landscape_url?: string | null
          banner_portrait_url?: string | null
          capacity?: number | null
          community_category?: string | null
          cover_video_url?: string | null
          create_community?: boolean
          created_at?: string
          currency?: string
          date?: string
          deleted_at?: string | null
          description?: string | null
          end_date?: string | null
          event_format?: string
          id?: string
          image_url?: string | null
          location?: string | null
          org_id?: string | null
          page_config?: Json | null
          previous_event_id?: string | null
          price?: number | null
          published?: boolean | null
          requires_approval?: boolean
          slug?: string
          speaker_applications_enabled?: boolean
          sponsor_applications_enabled?: boolean
          status?: string
          tickets_sold?: number | null
          timezone?: string | null
          title?: string
          updated_at?: string
          user_id?: string
          venue?: string | null
          video_provider?: string | null
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
          {
            foreignKeyName: "events_previous_event_id_fkey"
            columns: ["previous_event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      guest_rate_limits: {
        Row: {
          bucket: string
          created_at: string
          id: number
          key_hash: string
        }
        Insert: {
          bucket: string
          created_at?: string
          id?: never
          key_hash: string
        }
        Update: {
          bucket?: string
          created_at?: string
          id?: never
          key_hash?: string
        }
        Relationships: []
      }
      identity_match_candidates: {
        Row: {
          created_at: string
          id: string
          person_a: string
          person_b: string
          reasons: string[]
          reviewed_at: string | null
          reviewed_by: string | null
          score: number
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          person_a: string
          person_b: string
          reasons: string[]
          reviewed_at?: string | null
          reviewed_by?: string | null
          score?: number
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          person_a?: string
          person_b?: string
          reasons?: string[]
          reviewed_at?: string | null
          reviewed_by?: string | null
          score?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "identity_match_candidates_person_a_fkey"
            columns: ["person_a"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "identity_match_candidates_person_b_fkey"
            columns: ["person_b"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      intel_field_history: {
        Row: {
          actor_id: string | null
          created_at: string
          entity_id: string
          entity_type: string
          field: string
          id: string
          merge_id: string | null
          new_value: string | null
          old_value: string | null
          reason: string | null
          reverted_at: string | null
          reverted_by: string | null
          source: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          entity_id: string
          entity_type: string
          field: string
          id?: string
          merge_id?: string | null
          new_value?: string | null
          old_value?: string | null
          reason?: string | null
          reverted_at?: string | null
          reverted_by?: string | null
          source: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          field?: string
          id?: string
          merge_id?: string | null
          new_value?: string | null
          old_value?: string | null
          reason?: string | null
          reverted_at?: string | null
          reverted_by?: string | null
          source?: string
        }
        Relationships: []
      }
      meeting_events: {
        Row: {
          action: string
          actor_id: string | null
          backfilled: boolean
          cause: string | null
          created_at: string
          event_id: string
          from_status: string | null
          id: string
          location: string | null
          meeting_id: string | null
          reason: string | null
          registration_id: string | null
          scheduled_at: string | null
          side: string | null
          speaker_id: string | null
          sponsor_id: string
          to_status: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          backfilled?: boolean
          cause?: string | null
          created_at?: string
          event_id: string
          from_status?: string | null
          id?: string
          location?: string | null
          meeting_id?: string | null
          reason?: string | null
          registration_id?: string | null
          scheduled_at?: string | null
          side?: string | null
          speaker_id?: string | null
          sponsor_id: string
          to_status?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          backfilled?: boolean
          cause?: string | null
          created_at?: string
          event_id?: string
          from_status?: string | null
          id?: string
          location?: string | null
          meeting_id?: string | null
          reason?: string | null
          registration_id?: string | null
          scheduled_at?: string | null
          side?: string | null
          speaker_id?: string | null
          sponsor_id?: string
          to_status?: string | null
        }
        Relationships: []
      }
      merge_operations: {
        Row: {
          actor_id: string | null
          created_at: string
          entity_type: string
          field_choices: Json
          id: string
          merged_ids: string[]
          moved: Json
          reason: string | null
          removed: Json
          reverted_at: string | null
          reverted_by: string | null
          survivor_before: Json
          survivor_id: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          entity_type: string
          field_choices?: Json
          id?: string
          merged_ids: string[]
          moved?: Json
          reason?: string | null
          removed?: Json
          reverted_at?: string | null
          reverted_by?: string | null
          survivor_before: Json
          survivor_id: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          entity_type?: string
          field_choices?: Json
          id?: string
          merged_ids?: string[]
          moved?: Json
          reason?: string | null
          removed?: Json
          reverted_at?: string | null
          reverted_by?: string | null
          survivor_before?: Json
          survivor_id?: string
        }
        Relationships: []
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
          accepted_at: string | null
          accepted_by: string | null
          claimed_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          org_id: string
          prefill: Json
          role: string
          status: string
          token: string
          token_hash: string | null
          transfer_ownership: boolean
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          claimed_at?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by: string
          org_id: string
          prefill?: Json
          role?: string
          status?: string
          token?: string
          token_hash?: string | null
          transfer_ownership?: boolean
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          claimed_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          org_id?: string
          prefill?: Json
          role?: string
          status?: string
          token?: string
          token_hash?: string | null
          transfer_ownership?: boolean
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
          feature_overrides: Json
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
          feature_overrides?: Json
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
          feature_overrides?: Json
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
      payment_escrow: {
        Row: {
          amount: number
          booking_id: string
          currency: string
          held_at: string
          id: string
          milestone_id: string | null
          notes: string | null
          refunded_at: string | null
          released_at: string | null
          status: string
        }
        Insert: {
          amount: number
          booking_id: string
          currency?: string
          held_at?: string
          id?: string
          milestone_id?: string | null
          notes?: string | null
          refunded_at?: string | null
          released_at?: string | null
          status?: string
        }
        Update: {
          amount?: number
          booking_id?: string
          currency?: string
          held_at?: string
          id?: string
          milestone_id?: string | null
          notes?: string | null
          refunded_at?: string | null
          released_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_escrow_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "vendor_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_escrow_milestone_id_fkey"
            columns: ["milestone_id"]
            isOneToOne: false
            referencedRelation: "booking_milestones"
            referencedColumns: ["id"]
          },
        ]
      }
      people: {
        Row: {
          city: string | null
          country: string | null
          created_at: string
          created_via: string
          current_company_id: string | null
          department: string | null
          designation: string | null
          display_name: string | null
          first_name: string | null
          id: string
          last_name: string | null
          merged_into: string | null
          name_key: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          city?: string | null
          country?: string | null
          created_at?: string
          created_via?: string
          current_company_id?: string | null
          department?: string | null
          designation?: string | null
          display_name?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          merged_into?: string | null
          name_key?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          city?: string | null
          country?: string | null
          created_at?: string
          created_via?: string
          current_company_id?: string | null
          department?: string | null
          designation?: string | null
          display_name?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          merged_into?: string | null
          name_key?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "people_current_company_id_fkey"
            columns: ["current_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "people_merged_into_fkey"
            columns: ["merged_into"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      person_company_affiliations: {
        Row: {
          company_id: string
          created_at: string
          designation: string | null
          designation_key: string
          ended_on: string | null
          id: string
          is_current: boolean
          person_id: string
          source: string
          started_on: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          designation?: string | null
          designation_key?: string
          ended_on?: string | null
          id?: string
          is_current?: boolean
          person_id: string
          source?: string
          started_on?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          designation?: string | null
          designation_key?: string
          ended_on?: string | null
          id?: string
          is_current?: boolean
          person_id?: string
          source?: string
          started_on?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "person_company_affiliations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_company_affiliations_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      person_emails: {
        Row: {
          created_at: string
          email: string
          email_key: string
          id: string
          person_id: string
          source: string
          verified_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          email_key: string
          id?: string
          person_id: string
          source?: string
          verified_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          email_key?: string
          id?: string
          person_id?: string
          source?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "person_emails_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      person_links: {
        Row: {
          created_at: string
          id: string
          kind: string
          person_id: string
          url: string
          url_key: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          person_id: string
          url: string
          url_key: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          person_id?: string
          url?: string
          url_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "person_links_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      person_phones: {
        Row: {
          country_code: string | null
          created_at: string
          id: string
          number: string
          person_id: string
          phone_e164: string
          source: string
          verified_at: string | null
        }
        Insert: {
          country_code?: string | null
          created_at?: string
          id?: string
          number: string
          person_id: string
          phone_e164: string
          source?: string
          verified_at?: string | null
        }
        Update: {
          country_code?: string | null
          created_at?: string
          id?: string
          number?: string
          person_id?: string
          phone_e164?: string
          source?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "person_phones_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      personal_email_domains: {
        Row: {
          domain: string
        }
        Insert: {
          domain: string
        }
        Update: {
          domain?: string
        }
        Relationships: []
      }
      plans: {
        Row: {
          created_at: string
          currency: string
          description: string
          features: string[]
          is_public: boolean
          key: string
          limits: Json
          name: string
          price_monthly: number | null
          price_yearly: number | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          description?: string
          features?: string[]
          is_public?: boolean
          key: string
          limits?: Json
          name: string
          price_monthly?: number | null
          price_yearly?: number | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          description?: string
          features?: string[]
          is_public?: boolean
          key?: string
          limits?: Json
          name?: string
          price_monthly?: number | null
          price_yearly?: number | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      profile_suggestion_dismissals: {
        Row: {
          created_at: string
          field: string
          user_id: string
          value_key: string
        }
        Insert: {
          created_at?: string
          field: string
          user_id: string
          value_key: string
        }
        Update: {
          created_at?: string
          field?: string
          user_id?: string
          value_key?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          account_type: string
          avatar_url: string | null
          banned_at: string | null
          banned_reason: string | null
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
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
          video_fx_prefs: Json
        }
        Insert: {
          account_type?: string
          avatar_url?: string | null
          banned_at?: string | null
          banned_reason?: string | null
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
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          video_fx_prefs?: Json
        }
        Update: {
          account_type?: string
          avatar_url?: string | null
          banned_at?: string | null
          banned_reason?: string | null
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
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          video_fx_prefs?: Json
        }
        Relationships: []
      }
      quote_line_items: {
        Row: {
          amount: number
          description: string
          id: string
          quote_id: string
          sort_order: number
        }
        Insert: {
          amount: number
          description: string
          id?: string
          quote_id: string
          sort_order?: number
        }
        Update: {
          amount?: number
          description?: string
          id?: string
          quote_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "quote_line_items_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes: {
        Row: {
          created_at: string
          currency: string
          id: string
          inclusions: string | null
          notes: string | null
          rfq_id: string
          status: string
          total: number
          updated_at: string
          valid_until: string
          vendor_id: string
        }
        Insert: {
          created_at?: string
          currency?: string
          id?: string
          inclusions?: string | null
          notes?: string | null
          rfq_id: string
          status?: string
          total: number
          updated_at?: string
          valid_until: string
          vendor_id: string
        }
        Update: {
          created_at?: string
          currency?: string
          id?: string
          inclusions?: string | null
          notes?: string | null
          rfq_id?: string
          status?: string
          total?: number
          updated_at?: string
          valid_until?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quotes_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfqs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      registrant_audit_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          details: Json
          id: string
          reg_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          reg_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          reg_id?: string
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
          company_id: string | null
          company_website: string | null
          confirmation_email_sent_at: string | null
          created_at: string
          created_by: string | null
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
          person_id: string | null
          qr_code: string | null
          sponsor_share_consent: boolean
          sponsor_share_consent_at: string | null
          sponsor_share_notice: string | null
          status: string
          ticket_type: string
          title: string | null
          total_minutes: number
          updated_at: string
          user_id: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
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
          company_id?: string | null
          company_website?: string | null
          confirmation_email_sent_at?: string | null
          created_at?: string
          created_by?: string | null
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
          person_id?: string | null
          qr_code?: string | null
          sponsor_share_consent?: boolean
          sponsor_share_consent_at?: string | null
          sponsor_share_notice?: string | null
          status?: string
          ticket_type?: string
          title?: string | null
          total_minutes?: number
          updated_at?: string
          user_id?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
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
          company_id?: string | null
          company_website?: string | null
          confirmation_email_sent_at?: string | null
          created_at?: string
          created_by?: string | null
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
          person_id?: string | null
          qr_code?: string | null
          sponsor_share_consent?: boolean
          sponsor_share_consent_at?: string | null
          sponsor_share_notice?: string | null
          status?: string
          ticket_type?: string
          title?: string | null
          total_minutes?: number
          updated_at?: string
          user_id?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "registrations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registrations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registrations_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      rfq_invitees: {
        Row: {
          declined: boolean
          id: string
          invited_at: string
          responded_at: string | null
          rfq_id: string
          vendor_id: string
        }
        Insert: {
          declined?: boolean
          id?: string
          invited_at?: string
          responded_at?: string | null
          rfq_id: string
          vendor_id: string
        }
        Update: {
          declined?: boolean
          id?: string
          invited_at?: string
          responded_at?: string | null
          rfq_id?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rfq_invitees_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfqs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfq_invitees_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      rfqs: {
        Row: {
          budget_max: number | null
          budget_min: number | null
          category_id: string | null
          created_at: string
          currency: string
          event_city: string | null
          event_date: string | null
          event_id: string | null
          expected_guests: number | null
          expires_at: string | null
          id: string
          org_id: string
          requirements: string
          status: string
        }
        Insert: {
          budget_max?: number | null
          budget_min?: number | null
          category_id?: string | null
          created_at?: string
          currency?: string
          event_city?: string | null
          event_date?: string | null
          event_id?: string | null
          expected_guests?: number | null
          expires_at?: string | null
          id?: string
          org_id: string
          requirements: string
          status?: string
        }
        Update: {
          budget_max?: number | null
          budget_min?: number | null
          category_id?: string | null
          created_at?: string
          currency?: string
          event_city?: string | null
          event_date?: string | null
          event_id?: string | null
          expected_guests?: number | null
          expires_at?: string | null
          id?: string
          org_id?: string
          requirements?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "rfqs_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "vendor_categories"
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
          {
            foreignKeyName: "sessions_speaker_id_fkey"
            columns: ["speaker_id"]
            isOneToOne: false
            referencedRelation: "speakers_public"
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
      speaker_applications: {
        Row: {
          bio: string | null
          company: string | null
          created_at: string
          email: string
          event_id: string
          expertise: string | null
          full_name: string
          id: string
          industry: string | null
          job_title: string | null
          key_takeaways: string | null
          linkedin_url: string | null
          mobile_country_code: string | null
          mobile_number: string | null
          notes: string | null
          past_experience: string | null
          past_videos_url: string | null
          portfolio_url: string | null
          rejection_reason: string | null
          resume_url: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          session_category: string | null
          session_description: string
          session_duration_minutes: number | null
          session_title: string
          status: string
          target_audience: string | null
          topics: string | null
          updated_at: string
          user_id: string
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
          years_experience: number | null
        }
        Insert: {
          bio?: string | null
          company?: string | null
          created_at?: string
          email: string
          event_id: string
          expertise?: string | null
          full_name: string
          id?: string
          industry?: string | null
          job_title?: string | null
          key_takeaways?: string | null
          linkedin_url?: string | null
          mobile_country_code?: string | null
          mobile_number?: string | null
          notes?: string | null
          past_experience?: string | null
          past_videos_url?: string | null
          portfolio_url?: string | null
          rejection_reason?: string | null
          resume_url?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          session_category?: string | null
          session_description: string
          session_duration_minutes?: number | null
          session_title: string
          status?: string
          target_audience?: string | null
          topics?: string | null
          updated_at?: string
          user_id: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          years_experience?: number | null
        }
        Update: {
          bio?: string | null
          company?: string | null
          created_at?: string
          email?: string
          event_id?: string
          expertise?: string | null
          full_name?: string
          id?: string
          industry?: string | null
          job_title?: string | null
          key_takeaways?: string | null
          linkedin_url?: string | null
          mobile_country_code?: string | null
          mobile_number?: string | null
          notes?: string | null
          past_experience?: string | null
          past_videos_url?: string | null
          portfolio_url?: string | null
          rejection_reason?: string | null
          resume_url?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          session_category?: string | null
          session_description?: string
          session_duration_minutes?: number | null
          session_title?: string
          status?: string
          target_audience?: string | null
          topics?: string | null
          updated_at?: string
          user_id?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          years_experience?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "speaker_applications_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
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
          person_id: string | null
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
          person_id?: string | null
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
          person_id?: string | null
          photo_url?: string | null
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "speakers_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      sponsor_applications: {
        Row: {
          brochure_url: string | null
          budget_range: string | null
          company_description: string | null
          company_name: string
          company_website: string | null
          contact_designation: string | null
          contact_email: string
          contact_mobile_country_code: string | null
          contact_mobile_number: string | null
          contact_name: string
          created_at: string
          deck_url: string | null
          event_id: string
          expected_outcomes: string | null
          id: string
          industry: string | null
          logo_url: string | null
          notes: string | null
          objectives: string | null
          promotional_url: string | null
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          sponsorship_tier: string | null
          status: string
          updated_at: string
          user_id: string
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
        }
        Insert: {
          brochure_url?: string | null
          budget_range?: string | null
          company_description?: string | null
          company_name: string
          company_website?: string | null
          contact_designation?: string | null
          contact_email: string
          contact_mobile_country_code?: string | null
          contact_mobile_number?: string | null
          contact_name: string
          created_at?: string
          deck_url?: string | null
          event_id: string
          expected_outcomes?: string | null
          id?: string
          industry?: string | null
          logo_url?: string | null
          notes?: string | null
          objectives?: string | null
          promotional_url?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sponsorship_tier?: string | null
          status?: string
          updated_at?: string
          user_id: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Update: {
          brochure_url?: string | null
          budget_range?: string | null
          company_description?: string | null
          company_name?: string
          company_website?: string | null
          contact_designation?: string | null
          contact_email?: string
          contact_mobile_country_code?: string | null
          contact_mobile_number?: string | null
          contact_name?: string
          created_at?: string
          deck_url?: string | null
          event_id?: string
          expected_outcomes?: string | null
          id?: string
          industry?: string | null
          logo_url?: string | null
          notes?: string | null
          objectives?: string | null
          promotional_url?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sponsorship_tier?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sponsor_applications_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      sponsor_data_access_log: {
        Row: {
          action: string
          created_at: string
          detail: Json | null
          id: string
          share_id: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          detail?: Json | null
          id?: string
          share_id: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          detail?: Json | null
          id?: string
          share_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sponsor_data_access_log_share_id_fkey"
            columns: ["share_id"]
            isOneToOne: false
            referencedRelation: "sponsor_data_shares"
            referencedColumns: ["id"]
          },
        ]
      }
      sponsor_data_share_rows: {
        Row: {
          data: Json
          registration_id: string
          share_id: string
        }
        Insert: {
          data: Json
          registration_id: string
          share_id: string
        }
        Update: {
          data?: Json
          registration_id?: string
          share_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sponsor_data_share_rows_share_id_fkey"
            columns: ["share_id"]
            isOneToOne: false
            referencedRelation: "sponsor_data_shares"
            referencedColumns: ["id"]
          },
        ]
      }
      sponsor_data_shares: {
        Row: {
          allow_export: boolean
          company_id: string | null
          event_id: string
          event_sponsor_id: string | null
          fields: Json
          id: string
          includes_without_permission: boolean
          record_count: number
          revoke_reason: string | null
          revoked_at: string | null
          revoked_by: string | null
          shared_at: string
          shared_before_end: boolean
          shared_by: string | null
          sponsor_id: string
          status: string
          version: number
          with_both: number
          with_email: number
          with_mobile: number
          without_contact: number
          without_permission: number
        }
        Insert: {
          allow_export?: boolean
          company_id?: string | null
          event_id: string
          event_sponsor_id?: string | null
          fields: Json
          id?: string
          includes_without_permission?: boolean
          record_count: number
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          shared_at?: string
          shared_before_end?: boolean
          shared_by?: string | null
          sponsor_id: string
          status?: string
          version: number
          with_both: number
          with_email: number
          with_mobile: number
          without_contact: number
          without_permission: number
        }
        Update: {
          allow_export?: boolean
          company_id?: string | null
          event_id?: string
          event_sponsor_id?: string | null
          fields?: Json
          id?: string
          includes_without_permission?: boolean
          record_count?: number
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          shared_at?: string
          shared_before_end?: boolean
          shared_by?: string | null
          sponsor_id?: string
          status?: string
          version?: number
          with_both?: number
          with_email?: number
          with_mobile?: number
          without_contact?: number
          without_permission?: number
        }
        Relationships: [
          {
            foreignKeyName: "sponsor_data_shares_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sponsor_data_shares_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sponsor_data_shares_event_sponsor_id_fkey"
            columns: ["event_sponsor_id"]
            isOneToOne: false
            referencedRelation: "event_sponsors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sponsor_data_shares_sponsor_id_fkey"
            columns: ["sponsor_id"]
            isOneToOne: false
            referencedRelation: "sponsors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sponsor_data_shares_sponsor_id_fkey"
            columns: ["sponsor_id"]
            isOneToOne: false
            referencedRelation: "sponsors_public"
            referencedColumns: ["id"]
          },
        ]
      }
      sponsor_meeting_interests: {
        Row: {
          created_at: string
          created_by: string | null
          dispute_note: string | null
          dispute_reason: string | null
          dispute_requested_status: string | null
          dispute_resolution: string | null
          dispute_status: string | null
          disputed_at: string | null
          event_id: string
          ever_progressed: boolean
          id: string
          location: string | null
          met_at: string | null
          note: string | null
          outcome_at: string | null
          registration_id: string | null
          resolved_at: string | null
          scheduled_at: string | null
          speaker_id: string | null
          sponsor_id: string
          status: string
          status_by: string | null
          status_by_side: string | null
          status_cause: string | null
          status_changed_at: string | null
          status_reason: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          dispute_note?: string | null
          dispute_reason?: string | null
          dispute_requested_status?: string | null
          dispute_resolution?: string | null
          dispute_status?: string | null
          disputed_at?: string | null
          event_id: string
          ever_progressed?: boolean
          id?: string
          location?: string | null
          met_at?: string | null
          note?: string | null
          outcome_at?: string | null
          registration_id?: string | null
          resolved_at?: string | null
          scheduled_at?: string | null
          speaker_id?: string | null
          sponsor_id: string
          status?: string
          status_by?: string | null
          status_by_side?: string | null
          status_cause?: string | null
          status_changed_at?: string | null
          status_reason?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          dispute_note?: string | null
          dispute_reason?: string | null
          dispute_requested_status?: string | null
          dispute_resolution?: string | null
          dispute_status?: string | null
          disputed_at?: string | null
          event_id?: string
          ever_progressed?: boolean
          id?: string
          location?: string | null
          met_at?: string | null
          note?: string | null
          outcome_at?: string | null
          registration_id?: string | null
          resolved_at?: string | null
          scheduled_at?: string | null
          speaker_id?: string | null
          sponsor_id?: string
          status?: string
          status_by?: string | null
          status_by_side?: string | null
          status_cause?: string | null
          status_changed_at?: string | null
          status_reason?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sponsor_meeting_interests_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sponsor_meeting_interests_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: false
            referencedRelation: "registrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sponsor_meeting_interests_speaker_id_fkey"
            columns: ["speaker_id"]
            isOneToOne: false
            referencedRelation: "speakers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sponsor_meeting_interests_speaker_id_fkey"
            columns: ["speaker_id"]
            isOneToOne: false
            referencedRelation: "speakers_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sponsor_meeting_interests_sponsor_id_fkey"
            columns: ["sponsor_id"]
            isOneToOne: false
            referencedRelation: "sponsors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sponsor_meeting_interests_sponsor_id_fkey"
            columns: ["sponsor_id"]
            isOneToOne: false
            referencedRelation: "sponsors_public"
            referencedColumns: ["id"]
          },
        ]
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
          person_id: string | null
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
          person_id?: string | null
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
          person_id?: string | null
          role?: string
          sponsor_id?: string
          title?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sponsor_members_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sponsor_members_sponsor_id_fkey"
            columns: ["sponsor_id"]
            isOneToOne: false
            referencedRelation: "sponsors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sponsor_members_sponsor_id_fkey"
            columns: ["sponsor_id"]
            isOneToOne: false
            referencedRelation: "sponsors_public"
            referencedColumns: ["id"]
          },
        ]
      }
      sponsors: {
        Row: {
          company_id: string | null
          created_at: string
          description: string | null
          email: string | null
          id: string
          logo_url: string | null
          merged_into: string | null
          name: string
          tier: string
          tier_label: string | null
          updated_at: string
          user_id: string
          website: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          description?: string | null
          email?: string | null
          id?: string
          logo_url?: string | null
          merged_into?: string | null
          name: string
          tier?: string
          tier_label?: string | null
          updated_at?: string
          user_id: string
          website?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string
          description?: string | null
          email?: string | null
          id?: string
          logo_url?: string | null
          merged_into?: string | null
          name?: string
          tier?: string
          tier_label?: string | null
          updated_at?: string
          user_id?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sponsors_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sponsors_merged_into_fkey"
            columns: ["merged_into"]
            isOneToOne: false
            referencedRelation: "sponsors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sponsors_merged_into_fkey"
            columns: ["merged_into"]
            isOneToOne: false
            referencedRelation: "sponsors_public"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          cancelled_at: string | null
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
          cancelled_at?: string | null
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
          cancelled_at?: string | null
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
      support_ticket_messages: {
        Row: {
          author_email: string
          author_id: string | null
          author_name: string
          author_type: string
          body: string
          created_at: string
          email_sent_at: string | null
          email_status: string | null
          id: string
          is_internal: boolean
          ticket_id: string
        }
        Insert: {
          author_email: string
          author_id?: string | null
          author_name: string
          author_type: string
          body: string
          created_at?: string
          email_sent_at?: string | null
          email_status?: string | null
          id?: string
          is_internal?: boolean
          ticket_id: string
        }
        Update: {
          author_email?: string
          author_id?: string | null
          author_name?: string
          author_type?: string
          body?: string
          created_at?: string
          email_sent_at?: string | null
          email_status?: string | null
          id?: string
          is_internal?: boolean
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_ticket_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          assigned_to: string | null
          category: Database["public"]["Enums"]["support_ticket_category"]
          closed_at: string | null
          created_at: string
          email: string
          first_response_at: string | null
          id: string
          internal_notes: string | null
          ip_hash: string | null
          message: string
          name: string
          page_url: string | null
          priority: Database["public"]["Enums"]["support_ticket_priority"]
          resolved_at: string | null
          source: string
          status: Database["public"]["Enums"]["support_ticket_status"]
          subject: string
          ticket_number: string
          updated_at: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          assigned_to?: string | null
          category?: Database["public"]["Enums"]["support_ticket_category"]
          closed_at?: string | null
          created_at?: string
          email: string
          first_response_at?: string | null
          id?: string
          internal_notes?: string | null
          ip_hash?: string | null
          message: string
          name: string
          page_url?: string | null
          priority?: Database["public"]["Enums"]["support_ticket_priority"]
          resolved_at?: string | null
          source?: string
          status?: Database["public"]["Enums"]["support_ticket_status"]
          subject: string
          ticket_number: string
          updated_at?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          assigned_to?: string | null
          category?: Database["public"]["Enums"]["support_ticket_category"]
          closed_at?: string | null
          created_at?: string
          email?: string
          first_response_at?: string | null
          id?: string
          internal_notes?: string | null
          ip_hash?: string | null
          message?: string
          name?: string
          page_url?: string | null
          priority?: Database["public"]["Enums"]["support_ticket_priority"]
          resolved_at?: string | null
          source?: string
          status?: Database["public"]["Enums"]["support_ticket_status"]
          subject?: string
          ticket_number?: string
          updated_at?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      unban_requests: {
        Row: {
          community_id: string | null
          created_at: string
          id: string
          message: string
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          scope: string
          status: string
          user_id: string
        }
        Insert: {
          community_id?: string | null
          created_at?: string
          id?: string
          message: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          scope: string
          status?: string
          user_id: string
        }
        Update: {
          community_id?: string | null
          created_at?: string
          id?: string
          message?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          scope?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "unban_requests_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
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
      utm_clicks: {
        Row: {
          clicked_at: string
          event_id: string
          id: string
          path: string | null
          referrer: string | null
          session_key: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
        }
        Insert: {
          clicked_at?: string
          event_id: string
          id?: string
          path?: string | null
          referrer?: string | null
          session_key?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Update: {
          clicked_at?: string
          event_id?: string
          id?: string
          path?: string | null
          referrer?: string | null
          session_key?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "utm_clicks_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      utm_links: {
        Row: {
          created_at: string
          created_by: string | null
          event_id: string
          id: string
          label: string | null
          updated_at: string
          url: string
          utm_campaign: string
          utm_content: string | null
          utm_medium: string
          utm_source: string
          utm_term: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          event_id: string
          id?: string
          label?: string | null
          updated_at?: string
          url: string
          utm_campaign: string
          utm_content?: string | null
          utm_medium: string
          utm_source: string
          utm_term?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          event_id?: string
          id?: string
          label?: string | null
          updated_at?: string
          url?: string
          utm_campaign?: string
          utm_content?: string | null
          utm_medium?: string
          utm_source?: string
          utm_term?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "utm_links_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      utm_partner_access: {
        Row: {
          accepted_at: string | null
          can_export: boolean
          can_register: boolean
          can_view_approval: boolean
          can_view_checkin: boolean
          created_at: string
          event_id: string
          granted_at: string
          granted_by: string | null
          id: string
          invited_email: string
          partner_user_id: string | null
          revoked_at: string | null
          status: string
          updated_at: string
          utm_campaign: string
          utm_medium: string
          utm_source: string
        }
        Insert: {
          accepted_at?: string | null
          can_export?: boolean
          can_register?: boolean
          can_view_approval?: boolean
          can_view_checkin?: boolean
          created_at?: string
          event_id: string
          granted_at?: string
          granted_by?: string | null
          id?: string
          invited_email: string
          partner_user_id?: string | null
          revoked_at?: string | null
          status?: string
          updated_at?: string
          utm_campaign?: string
          utm_medium?: string
          utm_source: string
        }
        Update: {
          accepted_at?: string | null
          can_export?: boolean
          can_register?: boolean
          can_view_approval?: boolean
          can_view_checkin?: boolean
          created_at?: string
          event_id?: string
          granted_at?: string
          granted_by?: string | null
          id?: string
          invited_email?: string
          partner_user_id?: string | null
          revoked_at?: string | null
          status?: string
          updated_at?: string
          utm_campaign?: string
          utm_medium?: string
          utm_source?: string
        }
        Relationships: [
          {
            foreignKeyName: "utm_partner_access_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_audit_log: {
        Row: {
          action: string
          actor_id: string
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          metadata: Json | null
          new_value: Json | null
          old_value: Json | null
        }
        Insert: {
          action: string
          actor_id: string
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          metadata?: Json | null
          new_value?: Json | null
          old_value?: Json | null
        }
        Update: {
          action?: string
          actor_id?: string
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          metadata?: Json | null
          new_value?: Json | null
          old_value?: Json | null
        }
        Relationships: []
      }
      vendor_availability: {
        Row: {
          booking_id: string | null
          date: string
          id: string
          note: string | null
          status: string
          vendor_id: string
          venue_id: string | null
        }
        Insert: {
          booking_id?: string | null
          date: string
          id?: string
          note?: string | null
          status?: string
          vendor_id: string
          venue_id?: string | null
        }
        Update: {
          booking_id?: string | null
          date?: string
          id?: string
          note?: string | null
          status?: string
          vendor_id?: string
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendor_availability_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_availability_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_bookings: {
        Row: {
          commission_amount: number
          commission_rate: number
          contract_url: string | null
          created_at: string
          currency: string
          deposit_status: string
          event_date: string | null
          event_id: string | null
          id: string
          org_id: string
          quote_id: string | null
          rfq_id: string | null
          status: string
          total: number
          updated_at: string
          vendor_id: string
        }
        Insert: {
          commission_amount?: number
          commission_rate?: number
          contract_url?: string | null
          created_at?: string
          currency?: string
          deposit_status?: string
          event_date?: string | null
          event_id?: string | null
          id?: string
          org_id: string
          quote_id?: string | null
          rfq_id?: string | null
          status?: string
          total: number
          updated_at?: string
          vendor_id: string
        }
        Update: {
          commission_amount?: number
          commission_rate?: number
          contract_url?: string | null
          created_at?: string
          currency?: string
          deposit_status?: string
          event_date?: string | null
          event_id?: string | null
          id?: string
          org_id?: string
          quote_id?: string | null
          rfq_id?: string | null
          status?: string
          total?: number
          updated_at?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_bookings_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_bookings_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfqs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_bookings_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_categories: {
        Row: {
          created_at: string
          icon: string | null
          id: string
          name: string
          slug: string
        }
        Insert: {
          created_at?: string
          icon?: string | null
          id?: string
          name: string
          slug: string
        }
        Update: {
          created_at?: string
          icon?: string | null
          id?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
      vendor_category_map: {
        Row: {
          category_id: string
          vendor_id: string
        }
        Insert: {
          category_id: string
          vendor_id: string
        }
        Update: {
          category_id?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_category_map_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "vendor_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_category_map_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_email_allowlist: {
        Row: {
          created_at: string
          email: string
          notes: string | null
        }
        Insert: {
          created_at?: string
          email: string
          notes?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          notes?: string | null
        }
        Relationships: []
      }
      vendor_email_otps: {
        Row: {
          attempts: number
          code_hash: string
          consumed_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          ip_hash: string | null
          max_attempts: number
          purpose: string
        }
        Insert: {
          attempts?: number
          code_hash: string
          consumed_at?: string | null
          created_at?: string
          email: string
          expires_at: string
          id?: string
          ip_hash?: string | null
          max_attempts?: number
          purpose?: string
        }
        Update: {
          attempts?: number
          code_hash?: string
          consumed_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          ip_hash?: string | null
          max_attempts?: number
          purpose?: string
        }
        Relationships: []
      }
      vendor_kyc_documents: {
        Row: {
          document_type: string
          file_name: string | null
          file_url: string
          id: string
          reviewed_at: string | null
          reviewed_by: string | null
          reviewer_notes: string | null
          status: string
          submitted_at: string
          vendor_id: string
        }
        Insert: {
          document_type: string
          file_name?: string | null
          file_url: string
          id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_notes?: string | null
          status?: string
          submitted_at?: string
          vendor_id: string
        }
        Update: {
          document_type?: string
          file_name?: string | null
          file_url?: string
          id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_notes?: string | null
          status?: string
          submitted_at?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_kyc_documents_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_members: {
        Row: {
          created_at: string
          id: string
          role: string
          user_id: string
          vendor_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: string
          user_id: string
          vendor_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: string
          user_id?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_members_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_message_threads: {
        Row: {
          booking_id: string | null
          created_at: string
          id: string
          last_message_at: string | null
          org_id: string
          rfq_id: string | null
          vendor_id: string
        }
        Insert: {
          booking_id?: string | null
          created_at?: string
          id?: string
          last_message_at?: string | null
          org_id: string
          rfq_id?: string | null
          vendor_id: string
        }
        Update: {
          booking_id?: string | null
          created_at?: string
          id?: string
          last_message_at?: string | null
          org_id?: string
          rfq_id?: string | null
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_message_threads_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "vendor_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_message_threads_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfqs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_message_threads_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_messages: {
        Row: {
          attachments: Json | null
          body: string
          created_at: string
          id: string
          sender_id: string
          thread_id: string
        }
        Insert: {
          attachments?: Json | null
          body: string
          created_at?: string
          id?: string
          sender_id: string
          thread_id: string
        }
        Update: {
          attachments?: Json | null
          body?: string
          created_at?: string
          id?: string
          sender_id?: string
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "vendor_message_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_payout_details: {
        Row: {
          bank_account_number: string | null
          bank_country: string | null
          bank_name: string | null
          bank_routing: string | null
          tax_id: string | null
          updated_at: string
          vendor_id: string
        }
        Insert: {
          bank_account_number?: string | null
          bank_country?: string | null
          bank_name?: string | null
          bank_routing?: string | null
          tax_id?: string | null
          updated_at?: string
          vendor_id: string
        }
        Update: {
          bank_account_number?: string | null
          bank_country?: string | null
          bank_name?: string | null
          bank_routing?: string | null
          tax_id?: string | null
          updated_at?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_payout_details_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: true
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_portfolio: {
        Row: {
          caption: string | null
          created_at: string
          id: string
          is_cover: boolean
          media_type: string
          sort_order: number
          url: string
          vendor_id: string
        }
        Insert: {
          caption?: string | null
          created_at?: string
          id?: string
          is_cover?: boolean
          media_type?: string
          sort_order?: number
          url: string
          vendor_id: string
        }
        Update: {
          caption?: string | null
          created_at?: string
          id?: string
          is_cover?: boolean
          media_type?: string
          sort_order?: number
          url?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_portfolio_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_reviews: {
        Row: {
          booking_id: string
          comment: string | null
          created_at: string
          id: string
          rating: number
          reviewer_id: string
          reviewer_type: string
        }
        Insert: {
          booking_id: string
          comment?: string | null
          created_at?: string
          id?: string
          rating: number
          reviewer_id: string
          reviewer_type: string
        }
        Update: {
          booking_id?: string
          comment?: string | null
          created_at?: string
          id?: string
          rating?: number
          reviewer_id?: string
          reviewer_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_reviews_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "vendor_bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_service_addons: {
        Row: {
          id: string
          is_optional: boolean
          name: string
          price: number
          service_id: string
        }
        Insert: {
          id?: string
          is_optional?: boolean
          name: string
          price?: number
          service_id: string
        }
        Update: {
          id?: string
          is_optional?: boolean
          name?: string
          price?: number
          service_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_service_addons_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "vendor_services"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_service_areas: {
        Row: {
          city: string
          country: string
          id: string
          radius_km: number | null
          vendor_id: string
        }
        Insert: {
          city: string
          country: string
          id?: string
          radius_km?: number | null
          vendor_id: string
        }
        Update: {
          city?: string
          country?: string
          id?: string
          radius_km?: number | null
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_service_areas_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_services: {
        Row: {
          base_price: number
          category: string | null
          created_at: string
          currency: string
          description: string | null
          duration: string | null
          id: string
          is_active: boolean
          is_instant_book: boolean
          quote_on_request: boolean
          title: string
          unit: string
          vendor_id: string
          venue_id: string | null
        }
        Insert: {
          base_price?: number
          category?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          duration?: string | null
          id?: string
          is_active?: boolean
          is_instant_book?: boolean
          quote_on_request?: boolean
          title: string
          unit?: string
          vendor_id: string
          venue_id?: string | null
        }
        Update: {
          base_price?: number
          category?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          duration?: string | null
          id?: string
          is_active?: boolean
          is_instant_book?: boolean
          quote_on_request?: boolean
          title?: string
          unit?: string
          vendor_id?: string
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendor_services_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_services_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      vendors: {
        Row: {
          auto_reply: string | null
          bank_account_number: string | null
          bank_country: string | null
          bank_name: string | null
          bank_routing: string | null
          bio: string | null
          business_name: string
          city: string | null
          commission_rate: number
          country: string | null
          cover_url: string | null
          created_at: string
          default_currency: string
          id: string
          kyc_submitted_at: string | null
          kyc_verified_at: string | null
          logo_url: string | null
          notify_email: boolean
          rating_avg: number | null
          rating_count: number
          response_time_hours: number | null
          socials: Json | null
          tagline: string | null
          tax_id: string | null
          updated_at: string
          verification_status: string
          website: string | null
          years_experience: number | null
        }
        Insert: {
          auto_reply?: string | null
          bank_account_number?: string | null
          bank_country?: string | null
          bank_name?: string | null
          bank_routing?: string | null
          bio?: string | null
          business_name: string
          city?: string | null
          commission_rate?: number
          country?: string | null
          cover_url?: string | null
          created_at?: string
          default_currency?: string
          id?: string
          kyc_submitted_at?: string | null
          kyc_verified_at?: string | null
          logo_url?: string | null
          notify_email?: boolean
          rating_avg?: number | null
          rating_count?: number
          response_time_hours?: number | null
          socials?: Json | null
          tagline?: string | null
          tax_id?: string | null
          updated_at?: string
          verification_status?: string
          website?: string | null
          years_experience?: number | null
        }
        Update: {
          auto_reply?: string | null
          bank_account_number?: string | null
          bank_country?: string | null
          bank_name?: string | null
          bank_routing?: string | null
          bio?: string | null
          business_name?: string
          city?: string | null
          commission_rate?: number
          country?: string | null
          cover_url?: string | null
          created_at?: string
          default_currency?: string
          id?: string
          kyc_submitted_at?: string | null
          kyc_verified_at?: string | null
          logo_url?: string | null
          notify_email?: boolean
          rating_avg?: number | null
          rating_count?: number
          response_time_hours?: number | null
          socials?: Json | null
          tagline?: string | null
          tax_id?: string | null
          updated_at?: string
          verification_status?: string
          website?: string | null
          years_experience?: number | null
        }
        Relationships: []
      }
      venue_media: {
        Row: {
          caption: string | null
          created_at: string
          id: string
          is_cover: boolean
          media_kind: string
          sort_order: number
          url: string
          venue_id: string
        }
        Insert: {
          caption?: string | null
          created_at?: string
          id?: string
          is_cover?: boolean
          media_kind?: string
          sort_order?: number
          url: string
          venue_id: string
        }
        Update: {
          caption?: string | null
          created_at?: string
          id?: string
          is_cover?: boolean
          media_kind?: string
          sort_order?: number
          url?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_media_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venues: {
        Row: {
          address_line: string | null
          alcohol_policy: string | null
          area_sqft: number | null
          capacity_banquet: number | null
          capacity_classroom: number | null
          capacity_floating: number | null
          capacity_theater: number | null
          capacity_ushape: number | null
          catering_policy: string | null
          ceiling_height_ft: number | null
          city: string | null
          climate_control: string | null
          created_at: string
          decor_policy: string | null
          description: string | null
          green_rooms_count: number | null
          has_elevator: boolean
          has_microphones: boolean
          has_power_backup: boolean
          has_projector: boolean
          has_screen: boolean
          has_sound_system: boolean
          has_stage: boolean
          has_valet: boolean
          has_wifi: boolean
          id: string
          is_active: boolean
          length_ft: number | null
          map_url: string | null
          music_curfew_time: string | null
          name: string
          noise_restrictions: string | null
          parking_car_capacity: number | null
          parking_two_wheeler_capacity: number | null
          pincode: string | null
          space_type: string | null
          stage_dimensions: string | null
          state: string | null
          updated_at: string
          vendor_id: string
          wheelchair_accessible: boolean
          width_ft: number | null
        }
        Insert: {
          address_line?: string | null
          alcohol_policy?: string | null
          area_sqft?: number | null
          capacity_banquet?: number | null
          capacity_classroom?: number | null
          capacity_floating?: number | null
          capacity_theater?: number | null
          capacity_ushape?: number | null
          catering_policy?: string | null
          ceiling_height_ft?: number | null
          city?: string | null
          climate_control?: string | null
          created_at?: string
          decor_policy?: string | null
          description?: string | null
          green_rooms_count?: number | null
          has_elevator?: boolean
          has_microphones?: boolean
          has_power_backup?: boolean
          has_projector?: boolean
          has_screen?: boolean
          has_sound_system?: boolean
          has_stage?: boolean
          has_valet?: boolean
          has_wifi?: boolean
          id?: string
          is_active?: boolean
          length_ft?: number | null
          map_url?: string | null
          music_curfew_time?: string | null
          name: string
          noise_restrictions?: string | null
          parking_car_capacity?: number | null
          parking_two_wheeler_capacity?: number | null
          pincode?: string | null
          space_type?: string | null
          stage_dimensions?: string | null
          state?: string | null
          updated_at?: string
          vendor_id: string
          wheelchair_accessible?: boolean
          width_ft?: number | null
        }
        Update: {
          address_line?: string | null
          alcohol_policy?: string | null
          area_sqft?: number | null
          capacity_banquet?: number | null
          capacity_classroom?: number | null
          capacity_floating?: number | null
          capacity_theater?: number | null
          capacity_ushape?: number | null
          catering_policy?: string | null
          ceiling_height_ft?: number | null
          city?: string | null
          climate_control?: string | null
          created_at?: string
          decor_policy?: string | null
          description?: string | null
          green_rooms_count?: number | null
          has_elevator?: boolean
          has_microphones?: boolean
          has_power_backup?: boolean
          has_projector?: boolean
          has_screen?: boolean
          has_sound_system?: boolean
          has_stage?: boolean
          has_valet?: boolean
          has_wifi?: boolean
          id?: string
          is_active?: boolean
          length_ft?: number | null
          map_url?: string | null
          music_curfew_time?: string | null
          name?: string
          noise_restrictions?: string | null
          parking_car_capacity?: number | null
          parking_two_wheeler_capacity?: number | null
          pincode?: string | null
          space_type?: string | null
          stage_dimensions?: string | null
          state?: string | null
          updated_at?: string
          vendor_id?: string
          wheelchair_accessible?: boolean
          width_ft?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "venues_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
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
          user_id: string | null
        }
        Insert: {
          created_at?: string
          emoji: string
          id?: string
          session_id: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          emoji?: string
          id?: string
          session_id?: string
          user_id?: string | null
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
      whatsapp_templates: {
        Row: {
          category: string | null
          components: Json
          created_at: string
          id: string
          language: string
          name: string
          org_id: string
          status: string
          synced_at: string
          variable_count: number
        }
        Insert: {
          category?: string | null
          components?: Json
          created_at?: string
          id?: string
          language: string
          name: string
          org_id: string
          status?: string
          synced_at?: string
          variable_count?: number
        }
        Update: {
          category?: string | null
          components?: Json
          created_at?: string
          id?: string
          language?: string
          name?: string
          org_id?: string
          status?: string
          synced_at?: string
          variable_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_templates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      community_calendar: {
        Row: {
          community_id: string | null
          ends_at: string | null
          event_slug: string | null
          item_id: string | null
          kind: string | null
          location: string | null
          session_id: string | null
          starts_at: string | null
          title: string | null
        }
        Relationships: []
      }
      community_leaderboard: {
        Row: {
          comments: number | null
          community_id: string | null
          points: number | null
          posts: number | null
          resources: number | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "community_members_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles_public: {
        Row: {
          avatar_url: string | null
          bio: string | null
          company: string | null
          designation: string | null
          display_name: string | null
          first_name: string | null
          headline: string | null
          last_name: string | null
          user_id: string | null
          username: string | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          company?: string | null
          designation?: string | null
          display_name?: string | null
          first_name?: string | null
          headline?: string | null
          last_name?: string | null
          user_id?: string | null
          username?: string | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          company?: string | null
          designation?: string | null
          display_name?: string | null
          first_name?: string | null
          headline?: string | null
          last_name?: string | null
          user_id?: string | null
          username?: string | null
        }
        Relationships: []
      }
      speakers_public: {
        Row: {
          bio: string | null
          company: string | null
          company_website: string | null
          created_at: string | null
          designation: string | null
          first_name: string | null
          id: string | null
          industry: string | null
          last_name: string | null
          linkedin_url: string | null
          name: string | null
          photo_url: string | null
          title: string | null
          updated_at: string | null
        }
        Insert: {
          bio?: string | null
          company?: string | null
          company_website?: string | null
          created_at?: string | null
          designation?: string | null
          first_name?: string | null
          id?: string | null
          industry?: string | null
          last_name?: string | null
          linkedin_url?: string | null
          name?: string | null
          photo_url?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          bio?: string | null
          company?: string | null
          company_website?: string | null
          created_at?: string | null
          designation?: string | null
          first_name?: string | null
          id?: string | null
          industry?: string | null
          last_name?: string | null
          linkedin_url?: string | null
          name?: string | null
          photo_url?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      sponsors_public: {
        Row: {
          created_at: string | null
          description: string | null
          id: string | null
          logo_url: string | null
          name: string | null
          tier: string | null
          tier_label: string | null
          updated_at: string | null
          website: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string | null
          logo_url?: string | null
          name?: string | null
          tier?: string | null
          tier_label?: string | null
          updated_at?: string | null
          website?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string | null
          logo_url?: string | null
          name?: string | null
          tier?: string | null
          tier_label?: string | null
          updated_at?: string | null
          website?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      _apply_attendance: {
        Args: {
          _actor: string
          _method: string
          _reg_id: string
          _target: string
        }
        Returns: string
      }
      _attendance_recompute: { Args: { _reg_id: string }; Returns: undefined }
      _audit_actor_email: { Args: { _uid: string }; Returns: string }
      _auth_user_email: { Args: never; Returns: string }
      _auto_join_event_community: {
        Args: {
          _event_id: string
          _role: Database["public"]["Enums"]["community_role"]
          _user_id: string
        }
        Returns: undefined
      }
      _caller_may_look_up: { Args: { _user_id: string }; Returns: boolean }
      _can_manage_event: {
        Args: { _event_id: string; _user_id: string }
        Returns: boolean
      }
      _can_manage_event_sponsors: { Args: { _event: string }; Returns: boolean }
      _can_manage_sponsor: { Args: { _sponsor: string }; Returns: boolean }
      _can_view_event_registrations: {
        Args: { _eid: string }
        Returns: boolean
      }
      _canonical_company: { Args: { _id: string }; Returns: string }
      _communications_dispatch_impl: {
        Args: { _communication_id: string }
        Returns: Json
      }
      _communications_render_text: {
        Args: { _ctx: Json; _text: string }
        Returns: string
      }
      _company_initials: { Args: { _key: string }; Returns: string }
      _company_name_usable: { Args: { _key: string }; Returns: boolean }
      _company_public_logo: { Args: { _company: string }; Returns: string }
      _company_website: { Args: { _company: string }; Returns: string }
      _copy_community_members_from_previous: {
        Args: { _new_community_id: string; _previous_event_id: string }
        Returns: number
      }
      _ensure_company_for_name: {
        Args: { _name: string; _source?: string }
        Returns: string
      }
      _ensure_company_for_sponsor: {
        Args: { _name: string; _website: string }
        Returns: string
      }
      _event_has_ended: { Args: { _event: string }; Returns: boolean }
      _event_over: { Args: { _eid: string }; Returns: boolean }
      _event_scope: { Args: { _event: string }; Returns: string }
      _event_seats_taken: { Args: { _event_id: string }; Returns: number }
      _event_sponsor_emails: { Args: { _event: string }; Returns: string[] }
      _intel_company_card: { Args: { _id: string }; Returns: Json }
      _intel_field_allowed: {
        Args: { _entity: string; _field: string }
        Returns: boolean
      }
      _intel_name_case: { Args: { _v: string }; Returns: string }
      _intel_name_similarity: {
        Args: { _a: string; _b: string }
        Returns: number
      }
      _intel_person_card: { Args: { _id: string }; Returns: Json }
      _intel_revert_sponsor_merge: {
        Args: { _merge: string; _reason: string; _uid: string }
        Returns: undefined
      }
      _intel_set_field: {
        Args: {
          _actor: string
          _entity: string
          _field: string
          _id: string
          _merge?: string
          _reason: string
          _source: string
          _value: string
        }
        Returns: boolean
      }
      _intel_suggest: {
        Args: {
          _confidence: number
          _current: string
          _entity: string
          _evidence: string
          _field: string
          _id: string
          _kind: string
          _reason: string
          _safe: boolean
          _suggested: string
        }
        Returns: undefined
      }
      _is_event_organizer: { Args: { _event_id: string }; Returns: boolean }
      _is_internal_caller: { Args: never; Returns: boolean }
      _is_organiser: { Args: { _uid: string }; Returns: boolean }
      _link_member_to_company: {
        Args: { _company: string; _member: string }
        Returns: string
      }
      _log_meeting: {
        Args: {
          _action: string
          _cause?: string
          _eid: string
          _from: string
          _location?: string
          _meeting_id: string
          _reason?: string
          _reg: string
          _scheduled_at?: string
          _sid: string
          _side: string
          _spk: string
          _to: string
        }
        Returns: undefined
      }
      _map_event_category_to_community: {
        Args: { _cat: string }
        Returns: Database["public"]["Enums"]["community_category"]
      }
      _marketplace_org_actor: { Args: { _org_id: string }; Returns: boolean }
      _meeting_actor: {
        Args: { _eid: string; _sponsor_id: string }
        Returns: {
          side: string
          sponsor_id: string
        }[]
      }
      _meeting_person_check: {
        Args: { _eid: string; _registration_id: string; _speaker_id: string }
        Returns: undefined
      }
      _my_event_sponsors: {
        Args: { _eid: string }
        Returns: {
          sponsor_id: string
        }[]
      }
      _note_company_mention: {
        Args: { _name: string; _person: string }
        Returns: string
      }
      _org_entitlements: { Args: { _org_id: string }; Returns: Json }
      _organises_sponsor_event: {
        Args: { _sponsor_id: string; _uid: string }
        Returns: boolean
      }
      _person_visible_to: {
        Args: { _person: string; _uid: string }
        Returns: boolean
      }
      _plan_audit: {
        Args: {
          _action: string
          _details: Json
          _target_id: string
          _target_type: string
        }
        Returns: undefined
      }
      _queue_identity_candidate: {
        Args: { _a: string; _b: string; _reason: string }
        Returns: undefined
      }
      _recompute_tickets_sold: { Args: { _eid: string }; Returns: undefined }
      _record_audit: {
        Args: {
          _action: string
          _details: Json
          _target_id: string
          _target_type: string
        }
        Returns: undefined
      }
      _registration_is_speaker: {
        Args: { r: Database["public"]["Tables"]["registrations"]["Row"] }
        Returns: boolean
      }
      _require_share_access: { Args: { _event: string }; Returns: string }
      _require_super_admin: { Args: never; Returns: string }
      _session_reactions_public: {
        Args: { _session: string }
        Returns: boolean
      }
      _share_reader: { Args: { _share: string }; Returns: string }
      _sponsor_company: { Args: { _sponsor: string }; Returns: string }
      _sponsor_scope: { Args: { _sponsor: string }; Returns: string }
      _sponsor_share_contact_keys: { Args: never; Returns: string[] }
      _sponsor_share_eligible: {
        Args: { _event: string }
        Returns: {
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
          company_id: string | null
          company_website: string | null
          confirmation_email_sent_at: string | null
          created_at: string
          created_by: string | null
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
          person_id: string | null
          qr_code: string | null
          sponsor_share_consent: boolean
          sponsor_share_consent_at: string | null
          sponsor_share_notice: string | null
          status: string
          ticket_type: string
          title: string | null
          total_minutes: number
          updated_at: string
          user_id: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "registrations"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      _sponsor_share_fields: { Args: never; Returns: Json }
      _sponsor_share_notice_version: { Args: never; Returns: string }
      _sponsor_share_people: {
        Args: { _ended: boolean; _event: string }
        Returns: {
          data: Json
          person_id: string
        }[]
      }
      _sponsor_share_row: {
        Args: {
          _ended: boolean
          r: Database["public"]["Tables"]["registrations"]["Row"]
        }
        Returns: Json
      }
      _sponsor_share_without_permission: {
        Args: { _event: string }
        Returns: number
      }
      _sponsor_usable_on: {
        Args: { _event: string; _sponsor: string }
        Returns: boolean
      }
      _sponsorship_access: { Args: { _event: string }; Returns: string }
      _sponsorship_title: {
        Args: { _label: string; _tier: string }
        Returns: string
      }
      _utm_partner_audit: {
        Args: { _access_id: string; _action: string; _details: Json }
        Returns: undefined
      }
      _utm_partner_grant: {
        Args: { _access_id: string }
        Returns: {
          accepted_at: string | null
          can_export: boolean
          can_register: boolean
          can_view_approval: boolean
          can_view_checkin: boolean
          created_at: string
          event_id: string
          granted_at: string
          granted_by: string | null
          id: string
          invited_email: string
          partner_user_id: string | null
          revoked_at: string | null
          status: string
          updated_at: string
          utm_campaign: string
          utm_medium: string
          utm_source: string
        }
        SetofOptions: {
          from: "*"
          to: "utm_partner_access"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      _utm_partner_manages_event: {
        Args: { _event_id: string }
        Returns: boolean
      }
      _utm_partner_notify: {
        Args: {
          _body: string
          _link: string
          _title: string
          _type: string
          _user_id: string
        }
        Returns: undefined
      }
      _utm_partner_row: {
        Args: { a: Database["public"]["Tables"]["utm_partner_access"]["Row"] }
        Returns: Json
      }
      _utm_partner_stats: {
        Args: {
          _campaign: string
          _event_id: string
          _medium: string
          _source: string
        }
        Returns: Json
      }
      _whatsapp_recipient_update: {
        Args: { _error?: string; _recipient_id: string; _status: string }
        Returns: undefined
      }
      accept_org_invitation: {
        Args: { _token: string }
        Returns: {
          accepted_org_id: string
          assigned_role: string
        }[]
      }
      accept_quote:
        | { Args: { p_quote_id: string }; Returns: string }
        | { Args: { p_actor_id: string; p_quote_id: string }; Returns: string }
      accept_sponsor_invite: {
        Args: { _token: string }
        Returns: {
          result: string
          sponsor_id: string
          sponsor_name: string
        }[]
      }
      accept_sponsor_invite_as: {
        Args: { _token: string; _user_id: string }
        Returns: string
      }
      accept_vendor_quote: { Args: { p_quote_id: string }; Returns: string }
      admin_ban_user: {
        Args: { _reason: string; _user_id: string }
        Returns: undefined
      }
      admin_delete_org: { Args: { _oid: string }; Returns: undefined }
      admin_delete_plan: { Args: { _key: string }; Returns: undefined }
      admin_delete_user: { Args: { _user_id: string }; Returns: undefined }
      admin_event_force_delete: {
        Args: { _event_id: string; _reason: string }
        Returns: undefined
      }
      admin_event_force_unpublish: {
        Args: { _event_id: string; _reason: string }
        Returns: undefined
      }
      admin_force_password_reset: {
        Args: { _user_id: string }
        Returns: string
      }
      admin_health_snapshot: {
        Args: never
        Returns: {
          db_size_mb: number
          last_24h_errors_logged: number
          last_24h_events_created: number
          last_24h_failed_email_count: number
          last_24h_signups: number
          total_communications_sent: number
          total_events: number
          total_orgs: number
          total_tickets: number
          total_users: number
        }[]
      }
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
      admin_list_super_admins: {
        Args: never
        Returns: {
          display_name: string
          email: string
          user_id: string
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
      admin_recent_activity: {
        Args: { _action_filter?: string; _limit?: number }
        Returns: {
          action: string
          actor_email: string
          actor_id: string
          created_at: string
          details: Json
          id: string
          target_id: string
          target_type: string
          total_count: number
        }[]
      }
      admin_revenue_summary: {
        Args: never
        Returns: {
          gross_revenue: number
          mrr: number
          net_revenue: number
          platform_fees: number
          refunds_issued: number
          ticket_count_paid: number
        }[]
      }
      admin_save_plan: {
        Args: {
          _description: string
          _features: string[]
          _is_public: boolean
          _key: string
          _limits: Json
          _name: string
          _pricing?: Json
          _sort_order: number
        }
        Returns: undefined
      }
      admin_set_org_features: {
        Args: { _oid: string; _overrides: Json }
        Returns: undefined
      }
      admin_set_user_role: {
        Args: {
          _grant: boolean
          _role: Database["public"]["Enums"]["app_role"]
          _uid: string
        }
        Returns: undefined
      }
      admin_ticket_stats: {
        Args: never
        Returns: {
          avg_resolution_hours: number
          awaiting_user_count: number
          closed_count: number
          high_count: number
          last_24h_count: number
          open_count: number
          pending_count: number
          resolved_count: number
          total: number
          urgent_count: number
        }[]
      }
      admin_unban_user: { Args: { _user_id: string }; Returns: undefined }
      admin_update_org: {
        Args: {
          _billing_email?: string
          _name?: string
          _oid: string
          _plan?: string
          _subdomain?: string
        }
        Returns: undefined
      }
      admin_update_org_plan: {
        Args: { _oid: string; _plan: string }
        Returns: undefined
      }
      admin_user_activity_feed: {
        Args: { _limit?: number; _user_id: string }
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
      admin_user_id_by_email: { Args: { _email: string }; Returns: string }
      apply_profile_suggestion: { Args: { _field: string }; Returns: string }
      approve_speaker_application: {
        Args: { _app_id: string }
        Returns: string
      }
      approve_sponsor_application: {
        Args: { _app_id: string }
        Returns: string
      }
      bootstrap_vendor: { Args: { p_business_name: string }; Returns: string }
      bulk_set_attendance: {
        Args: { p_ids: string[]; p_method?: string; p_target: string }
        Returns: {
          code: string
          registration_id: string
        }[]
      }
      can_manage_event_certificates: {
        Args: { _event_id: string; _user_id: string }
        Returns: boolean
      }
      can_manage_org_certificates: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
      can_moderate_community: {
        Args: { _community_id: string; _user_id: string }
        Returns: boolean
      }
      cancel_booking: {
        Args: { p_actor_id: string; p_booking_id: string; p_reason?: string }
        Returns: undefined
      }
      certificate_date_text: {
        Args: { _end: string; _start: string; _tz: string }
        Returns: string
      }
      claim_join_session: {
        Args: { _jt: string; _sid: string }
        Returns: {
          email: string
          event_id: string
          name: string
          registration_id: string
          user_id: string
        }[]
      }
      claim_person_for_verified_email: {
        Args: { _email: string; _user_id: string }
        Returns: string
      }
      communications_diagnose: { Args: { _id: string }; Returns: Json }
      communications_dispatch: {
        Args: { _communication_id: string }
        Returns: Json
      }
      communications_duplicate: {
        Args: { _communication_id: string }
        Returns: string
      }
      communications_recompute_email_counts: {
        Args: { _communication_id: string }
        Returns: undefined
      }
      communications_resolve_community_recipients: {
        Args: { _community_id: string; _filter: Json }
        Returns: {
          email: string
          name: string
          phone: string
          user_id: string
        }[]
      }
      communications_resolve_recipients: {
        Args: { _event_id: string; _filter: Json }
        Returns: {
          email: string
          name: string
          phone: string
          user_id: string
        }[]
      }
      communications_retry_failed: {
        Args: { _channel?: string; _communication_id: string }
        Returns: number
      }
      communications_run_scheduled: { Args: never; Returns: Json }
      communications_schedule: {
        Args: { _communication_id: string; _scheduled_for: string }
        Returns: undefined
      }
      communications_unschedule: {
        Args: { _communication_id: string }
        Returns: undefined
      }
      community_connect: {
        Args: { _community_id?: string; _kind?: string; _target_id: string }
        Returns: string
      }
      community_create_poll: {
        Args: {
          _closes_at?: string
          _community_id: string
          _multi?: boolean
          _options: Json
          _question: string
        }
        Returns: string
      }
      community_create_post: {
        Args: {
          _attachments?: Json
          _body_md: string
          _community_id: string
          _link_url?: string
          _title: string
          _type: Database["public"]["Enums"]["community_post_type"]
        }
        Returns: string
      }
      community_join: { Args: { _community_id: string }; Returns: string }
      community_leave: { Args: { _community_id: string }; Returns: undefined }
      community_moderate: {
        Args: {
          _action?: string
          _comment_id?: string
          _post_id?: string
          _reason?: string
        }
        Returns: undefined
      }
      community_react: {
        Args: { _comment_id?: string; _emoji?: string; _post_id?: string }
        Returns: boolean
      }
      community_report: {
        Args: {
          _comment_id?: string
          _notes?: string
          _post_id?: string
          _reason?: string
        }
        Returns: string
      }
      community_resolve_event: { Args: { _event_id: string }; Returns: string }
      community_respond_connection: {
        Args: { _accept: boolean; _request_id: string }
        Returns: undefined
      }
      community_resync_from_previous: {
        Args: { _event_id: string }
        Returns: number
      }
      community_role_of: {
        Args: { _community_id: string; _user_id: string }
        Returns: Database["public"]["Enums"]["community_role"]
      }
      community_search: {
        Args: { _community_id?: string; _limit?: number; _q: string }
        Returns: {
          community_id: string
          created_at: string
          id: string
          kind: string
          score: number
          snippet: string
          title: string
        }[]
      }
      community_set_member_role: {
        Args: {
          _community_id: string
          _role: Database["public"]["Enums"]["community_role"]
          _user_id: string
        }
        Returns: undefined
      }
      community_set_member_status: {
        Args: {
          _community_id: string
          _reason?: string
          _status: string
          _user_id: string
        }
        Returns: undefined
      }
      community_slugify: { Args: { _input: string }; Returns: string }
      community_vote: {
        Args: { _option_id: string; _poll_id: string }
        Returns: undefined
      }
      company_candidates: {
        Args: { _email?: string; _name?: string; _website?: string }
        Returns: {
          company_id: string
          name: string
          reasons: string[]
          verification_status: string
          website: string
        }[]
      }
      company_name_key: { Args: { _raw: string }; Returns: string }
      complete_org_invitation: {
        Args: {
          _invitation_id: string
          _new_account?: boolean
          _user_id: string
        }
        Returns: {
          accepted_org_id: string
          assigned_role: string
        }[]
      }
      create_my_workspace: {
        Args: { _name: string; _slug: string; _subdomain?: string }
        Returns: string
      }
      create_provisional_company: {
        Args: { _name: string; _website?: string }
        Returns: string
      }
      create_vendor_business: {
        Args: { p_business_name: string }
        Returns: string
      }
      delete_utm_tracking: {
        Args: {
          _event_id: string
          _utm_campaign: string
          _utm_content?: string
          _utm_medium: string
          _utm_source: string
          _utm_term?: string
        }
        Returns: Json
      }
      discard_site_draft: { Args: { _section: string }; Returns: undefined }
      dismiss_profile_suggestion: {
        Args: { _field: string }
        Returns: undefined
      }
      dispute_meeting: {
        Args: {
          _eid: string
          _reason: string
          _registration_id?: string
          _requested_status: string
          _speaker_id?: string
          _sponsor_id?: string
        }
        Returns: undefined
      }
      email_domain: { Args: { _raw: string }; Returns: string }
      ensure_contact_person: {
        Args: {
          _company?: string
          _company_id?: string
          _designation?: string
          _email: string
          _linkedin?: string
          _name?: string
          _phone?: string
          _phone_cc?: string
          _source?: string
        }
        Returns: string
      }
      ensure_event_community: { Args: { _event_id: string }; Returns: string }
      ensure_parent_community: {
        Args: { _category: Database["public"]["Enums"]["community_category"] }
        Returns: string
      }
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
      event_branding_enabled: { Args: { _eid: string }; Returns: boolean }
      event_meeting_interests: {
        Args: { _eid: string }
        Returns: {
          created_at: string
          dispute_note: string
          dispute_reason: string
          dispute_requested_status: string
          dispute_resolution: string
          dispute_status: string
          disputed_at: string
          ever_progressed: boolean
          location: string
          met_at: string
          note: string
          outcome_at: string
          registration_id: string
          resolved_at: string
          scheduled_at: string
          speaker_email: string
          speaker_id: string
          sponsor_id: string
          sponsor_name: string
          status: string
          status_by_side: string
          status_cause: string
          status_changed_at: string
          status_reason: string
        }[]
      }
      event_tracking_closed: { Args: { _event_id: string }; Returns: boolean }
      event_utm_summary: {
        Args: { _event_id: string }
        Returns: {
          clicks: number
          conversion_rate: number
          registrations: number
          utm_campaign: string
          utm_content: string
          utm_medium: string
          utm_source: string
          utm_term: string
        }[]
      }
      fold_text: { Args: { _raw: string }; Returns: string }
      generate_event_slug: {
        Args: { _event_id?: string; _org_id: string; _title: string }
        Returns: string
      }
      generate_ticket_number: { Args: never; Returns: string }
      get_certificate_public: { Args: { _code: string }; Returns: Json }
      get_event_attendees_public: {
        Args: { _eid: string; _limit?: number }
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
      get_event_join_url: { Args: { _event_id: string }; Returns: string }
      get_event_og: {
        Args: { _event_id?: string; _event_slug?: string; _org_slug?: string }
        Returns: {
          banner_landscape_url: string
          currency: string
          date: string
          description: string
          end_date: string
          event_format: string
          id: string
          image_url: string
          location: string
          org_id: string
          org_logo_url: string
          org_name: string
          org_slug: string
          org_subdomain: string
          price: number
          slug: string
          status: string
          timezone: string
          title: string
          venue: string
          virtual_url: string
        }[]
      }
      get_marketplace_vendors: {
        Args: {
          p_category_slug?: string
          p_city?: string
          p_limit?: number
          p_min_rating?: number
          p_offset?: number
        }
        Returns: {
          business_name: string
          city: string
          country: string
          cover_url: string
          default_currency: string
          id: string
          logo_url: string
          rating_avg: number
          rating_count: number
          response_time_hours: number
          tagline: string
          verification_status: string
        }[]
      }
      get_my_profile: {
        Args: never
        Returns: {
          account_type: string
          avatar_url: string | null
          banned_at: string | null
          banned_reason: string | null
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
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
          video_fx_prefs: Json
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_my_ticket: {
        Args: { p_email: string; p_ticket_number: string }
        Returns: {
          category: Database["public"]["Enums"]["support_ticket_category"]
          created_at: string
          email: string
          first_response_at: string
          id: string
          message: string
          name: string
          priority: Database["public"]["Enums"]["support_ticket_priority"]
          resolved_at: string
          status: Database["public"]["Enums"]["support_ticket_status"]
          subject: string
          ticket_number: string
          updated_at: string
        }[]
      }
      get_my_ticket_messages: {
        Args: { p_email: string; p_ticket_number: string }
        Returns: {
          author_name: string
          author_type: string
          body: string
          created_at: string
          id: string
        }[]
      }
      get_or_create_vendor_thread: {
        Args: {
          p_booking_id?: string
          p_org_id: string
          p_rfq_id?: string
          p_vendor_id: string
        }
        Returns: string
      }
      get_public_org_brief: {
        Args: { _oid: string }
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
      get_site_drafts: {
        Args: never
        Returns: {
          content: Json
          draft_content: Json
          published_at: string
          section: string
          updated_at: string
        }[]
      }
      get_webinar_analytics: { Args: { _sid: string }; Returns: Json }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      identity_candidates: {
        Args: {
          _company?: string
          _email?: string
          _linkedin?: string
          _name?: string
          _phone?: string
          _phone_cc?: string
        }
        Returns: {
          company: string
          display_name: string
          email_hint: string
          has_account: boolean
          person_id: string
          reasons: string[]
          visible: boolean
        }[]
      }
      instant_book_service: {
        Args: {
          p_actor_id: string
          p_event_date: string
          p_event_id: string
          p_org_id: string
          p_service_id: string
        }
        Returns: string
      }
      intel_approve_all_safe: {
        Args: { _entity?: string; _kind?: string }
        Returns: number
      }
      intel_audit_history: {
        Args: {
          _action?: string
          _entity?: string
          _entity_id?: string
          _from?: string
          _limit?: number
          _merge_offset?: number
          _offset?: number
          _to?: string
        }
        Returns: Json
      }
      intel_bulk_approve_safe: { Args: { _ids: string[] }; Returns: number }
      intel_combine_all_sponsor_repeats: {
        Args: { _reason?: string }
        Returns: Json
      }
      intel_company_detail: { Args: { _id: string }; Returns: Json }
      intel_company_identifier: {
        Args: {
          _id: string
          _kind?: string
          _op: string
          _reason?: string
          _value: string
        }
        Returns: undefined
      }
      intel_connect_sponsor: {
        Args: { _company: string; _reason?: string; _sponsor: string }
        Returns: undefined
      }
      intel_consolidate_company_sponsors: {
        Args: { _company: string; _reason?: string }
        Returns: Json
      }
      intel_contact_detail: { Args: { _id: string }; Returns: Json }
      intel_contact_identifier: {
        Args: {
          _country_code?: string
          _id: string
          _op: string
          _reason?: string
          _value: string
        }
        Returns: undefined
      }
      intel_corrections: {
        Args: {
          _entity?: string
          _kind?: string
          _limit?: number
          _offset?: number
          _status?: string
        }
        Returns: Json
      }
      intel_duplicate_queue: {
        Args: {
          _entity: string
          _limit?: number
          _min_score?: number
          _offset?: number
          _status?: string
        }
        Returns: Json
      }
      intel_generate_corrections: { Args: never; Returns: number }
      intel_merge_companies: {
        Args: {
          _allow_distinct?: boolean
          _choices?: Json
          _others: string[]
          _reason?: string
          _survivor: string
        }
        Returns: string
      }
      intel_merge_people: {
        Args: {
          _choices?: Json
          _others: string[]
          _reason?: string
          _survivor: string
        }
        Returns: string
      }
      intel_merge_preview: {
        Args: { _entity: string; _others: string[]; _survivor: string }
        Returns: Json
      }
      intel_merge_sponsors: {
        Args: { _others: string[]; _reason?: string; _survivor: string }
        Returns: string
      }
      intel_move_sponsorship: {
        Args: { _company: string; _event_sponsor: string; _reason?: string }
        Returns: string
      }
      intel_overview: {
        Args: {
          _country?: string
          _from?: string
          _industry?: string
          _to?: string
        }
        Returns: Json
      }
      intel_refresh_company_duplicates: { Args: never; Returns: number }
      intel_refresh_person_duplicates: { Args: never; Returns: number }
      intel_revert_change: {
        Args: { _history: string; _reason?: string }
        Returns: undefined
      }
      intel_revert_merge: {
        Args: { _merge: string; _reason?: string }
        Returns: undefined
      }
      intel_review_correction: {
        Args: {
          _approve: boolean
          _id: string
          _reason?: string
          _value?: string
        }
        Returns: string
      }
      intel_search_companies: {
        Args: {
          _country?: string
          _dir?: string
          _filter?: string
          _industry?: string
          _limit?: number
          _offset?: number
          _q?: string
          _sort?: string
        }
        Returns: {
          company_id: string
          contacts: number
          created_at: string
          domains: string[]
          entry_count: number
          hq_country: string
          industry: string
          name: string
          source: string
          total: number
          updated_at: string
          verification_status: string
          website: string
        }[]
      }
      intel_search_contacts: {
        Args: {
          _country?: string
          _dir?: string
          _filter?: string
          _limit?: number
          _offset?: number
          _q?: string
          _sort?: string
        }
        Returns: {
          company: string
          created_at: string
          designation: string
          display_name: string
          email: string
          first_name: string
          has_account: boolean
          last_name: string
          person_id: string
          phone: string
          registrations: number
          total: number
          updated_at: string
        }[]
      }
      intel_search_sponsors: {
        Args: {
          _filter?: string
          _limit?: number
          _offset?: number
          _q?: string
        }
        Returns: Json
      }
      intel_set_duplicate_status: {
        Args: {
          _entity: string
          _id: string
          _reason?: string
          _status: string
        }
        Returns: undefined
      }
      intel_set_duplicate_statuses: {
        Args: {
          _entity: string
          _ids: string[]
          _reason?: string
          _status: string
        }
        Returns: number
      }
      intel_sponsor_companies: {
        Args: {
          _filter?: string
          _limit?: number
          _offset?: number
          _q?: string
        }
        Returns: Json
      }
      intel_sponsor_merge_preview: {
        Args: { _others: string[]; _survivor: string }
        Returns: Json
      }
      intel_sponsor_review: {
        Args: { _kind?: string; _limit?: number; _offset?: number }
        Returns: Json
      }
      intel_update_company: {
        Args: { _changes: Json; _id: string; _reason?: string }
        Returns: number
      }
      intel_update_contact: {
        Args: { _changes: Json; _id: string; _reason?: string }
        Returns: number
      }
      invitation_prefill: {
        Args: { _email: string; _organiser_only?: boolean }
        Returns: Json
      }
      is_community_member: {
        Args: { _community_id: string; _user_id: string }
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
      is_event_speaker: {
        Args: { _event_id: string; _user_id: string }
        Returns: boolean
      }
      is_org_manager: {
        Args: { _org_id: string; _user_id: string }
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
        Args: { _sid: string; _uid: string }
        Returns: boolean
      }
      is_user_banned: { Args: { _user_id: string }; Returns: boolean }
      is_vendor_member:
        | { Args: { _user_id: string; _vendor_id: string }; Returns: boolean }
        | { Args: { p_vendor_id: string }; Returns: boolean }
      issue_certificates: {
        Args: {
          _audience: string
          _event_id: string
          _registration_ids?: string[]
          _version_id: string
        }
        Returns: {
          certificate_id: string
          code: string
          created: boolean
          registration_id: string
        }[]
      }
      issue_invitation_activation: {
        Args: { _email: string; _next_path?: string; _purpose: string }
        Returns: string
      }
      link_verified_email_records: {
        Args: { _email: string; _user_id: string }
        Returns: undefined
      }
      linkedin_key: { Args: { _raw: string }; Returns: string }
      log_registrant_action: {
        Args: { _action: string; _details?: Json; _registration_id: string }
        Returns: undefined
      }
      meeting_history: {
        Args: {
          _eid: string
          _registration_id?: string
          _speaker_id?: string
          _sponsor_id?: string
        }
        Returns: {
          action: string
          backfilled: boolean
          cause: string
          created_at: string
          from_status: string
          location: string
          reason: string
          scheduled_at: string
          side: string
          to_status: string
        }[]
      }
      mfa_satisfied: { Args: never; Returns: boolean }
      my_applications: { Args: never; Returns: Json }
      my_bans: {
        Args: never
        Returns: {
          banned_at: string
          community_id: string
          community_name: string
          community_slug: string
          reason: string
          request_created_at: string
          request_id: string
          request_status: string
          review_note: string
          scope: string
        }[]
      }
      my_profile_suggestions: {
        Args: never
        Returns: {
          current_value: string
          field: string
          suggested_value: string
        }[]
      }
      new_certificate_code: { Args: never; Returns: string }
      norm_country_code: { Args: { _raw: string }; Returns: string }
      norm_email: { Args: { _raw: string }; Returns: string }
      norm_phone: {
        Args: { _country_code: string; _number: string }
        Returns: string
      }
      norm_text: { Args: { _raw: string }; Returns: string }
      norm_website_domain: { Args: { _raw: string }; Returns: string }
      org_billing_email: { Args: { _org_id: string }; Returns: string }
      org_entitlements: { Args: { _org_id: string }; Returns: Json }
      org_has_feature: {
        Args: { _feature: string; _org_id: string }
        Returns: boolean
      }
      org_member_emails: {
        Args: { _org_id: string }
        Returns: {
          email: string
          user_id: string
        }[]
      }
      org_member_role: {
        Args: { _org_id: string; _user_id: string }
        Returns: string
      }
      organizer_add_event_sponsor: {
        Args: {
          _company?: string
          _description?: string
          _email?: string
          _event: string
          _logo_url?: string
          _name?: string
          _sponsor?: string
          _tier?: string
          _tier_label?: string
          _website?: string
        }
        Returns: Json
      }
      organizer_add_sponsor_contact: {
        Args: {
          _designation?: string
          _email: string
          _event_sponsor: string
          _first_name: string
          _last_name: string
          _linkedin?: string
          _phone?: string
          _phone_cc?: string
          _role_label?: string
          _title?: string
        }
        Returns: Json
      }
      organizer_assign_sponsor_contact: {
        Args: { _event_sponsor: string; _member: string; _role_label?: string }
        Returns: Json
      }
      organizer_event_sponsorships: { Args: { _event: string }; Returns: Json }
      organizer_revoke_sponsor_data: {
        Args: { _reason?: string; _share: string }
        Returns: undefined
      }
      organizer_search_company_contacts: {
        Args: { _event_sponsor: string; _limit?: number; _q?: string }
        Returns: Json
      }
      organizer_set_sponsor_contact: {
        Args: {
          _event_sponsor: string
          _member: string
          _remove?: boolean
          _responsibilities?: string
          _role_label?: string
        }
        Returns: undefined
      }
      organizer_share_sponsor_data: {
        Args: {
          _allow_export?: boolean
          _event_sponsor: string
          _include_without_permission?: boolean
          _share_before_end?: boolean
        }
        Returns: string
      }
      organizer_sponsor_options: {
        Args: { _event: string; _limit?: number; _q?: string }
        Returns: Json
      }
      organizer_sponsor_share_history: {
        Args: { _event_sponsor: string }
        Returns: Json
      }
      organizer_sponsor_share_preview: {
        Args: { _event_sponsor: string }
        Returns: Json
      }
      organizer_sponsor_share_status: {
        Args: { _event: string }
        Returns: Json
      }
      organizer_sponsorship_detail: {
        Args: { _event_sponsor: string }
        Returns: Json
      }
      organizer_update_speaker: {
        Args: { _event_id: string; _payload: Json; _speaker_id: string }
        Returns: {
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
          person_id: string | null
          photo_url: string | null
          title: string | null
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "speakers"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      organizer_update_sponsor_member: {
        Args: { _event_id: string; _member_id: string; _payload: Json }
        Returns: {
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
          person_id: string | null
          role: string
          sponsor_id: string
          title: string | null
          updated_at: string
          user_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "sponsor_members"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      organizer_update_sponsorship: {
        Args: { _changes: Json; _event_sponsor: string }
        Returns: undefined
      }
      partner_utm_analytics: { Args: { _access_id: string }; Returns: Json }
      partner_utm_export: { Args: { _access_id: string }; Returns: Json }
      partner_utm_grants: { Args: never; Returns: Json }
      partner_utm_has_access: { Args: never; Returns: boolean }
      partner_utm_participants: {
        Args: {
          _access_id: string
          _approval?: string
          _checkin?: string
          _from?: string
          _limit?: number
          _offset?: number
          _search?: string
          _to?: string
        }
        Returns: Json
      }
      partner_utm_register: {
        Args: { _access_id: string; _person: Json }
        Returns: Json
      }
      pending_invitation_path: { Args: { _email: string }; Returns: string }
      person_name_key: { Args: { _raw: string }; Returns: string }
      platform_utm_summary: {
        Args: { _limit?: number }
        Returns: {
          clicks: number
          conversion_rate: number
          event_id: string
          event_title: string
          registrations: number
          utm_campaign: string
          utm_medium: string
          utm_source: string
        }[]
      }
      prune_expired_vendor_otps: { Args: never; Returns: undefined }
      publish_certificate_template: {
        Args: { _template_id: string }
        Returns: {
          version: number
          version_id: string
        }[]
      }
      publish_site_section: { Args: { _section: string }; Returns: undefined }
      record_certificate_emails: {
        Args: { _certificate_ids: string[] }
        Returns: number
      }
      record_utm_click: {
        Args: {
          _event_id: string
          _path?: string
          _referrer?: string
          _session_key?: string
          _utm_campaign?: string
          _utm_content?: string
          _utm_medium?: string
          _utm_source?: string
          _utm_term?: string
        }
        Returns: undefined
      }
      registration_attendance_audit: {
        Args: { p_limit?: number; p_registration_id: string }
        Returns: {
          action: string
          actor_email: string
          created_at: string
          details: Json
          id: string
          target_id: string
        }[]
      }
      reject_speaker_application: {
        Args: { _app_id: string; _reason?: string }
        Returns: undefined
      }
      reject_sponsor_application: {
        Args: { _app_id: string; _reason?: string }
        Returns: undefined
      }
      release_escrow: {
        Args: { p_actor_id: string; p_escrow_id: string }
        Returns: undefined
      }
      reliable_company_match: {
        Args: { _email?: string; _name: string; _website?: string }
        Returns: string
      }
      request_unban: {
        Args: { _community_id: string; _message: string; _scope: string }
        Returns: string
      }
      require_second_factor: { Args: never; Returns: undefined }
      resolve_browser_session: {
        Args: { _csid: string; _fp?: string; _jt: string }
        Returns: string
      }
      resolve_meeting_dispute: {
        Args: {
          _eid: string
          _keep: boolean
          _note?: string
          _registration_id?: string
          _speaker_id?: string
          _sponsor_id: string
        }
        Returns: undefined
      }
      review_unban_request: {
        Args: { _approve: boolean; _note?: string; _request_id: string }
        Returns: undefined
      }
      revoke_certificate: {
        Args: { _certificate_id: string; _reason?: string }
        Returns: undefined
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
          event_id: string
          id: string
          name: string
          status: string
          ticket_type: string
        }[]
      }
      self_check_out: {
        Args: { p_event_id?: string; p_token: string }
        Returns: {
          checked_out_at: string
          event_id: string
          id: string
          name: string
          status: string
          ticket_type: string
        }[]
      }
      set_attendance: {
        Args: { p_method?: string; p_reg_id: string; p_target: string }
        Returns: {
          attendance_state: string
          code: string
          last_in_at: string
          last_out_at: string
          name: string
          registration_id: string
          ticket_type: string
          total_minutes: number
        }[]
      }
      set_meeting_note: {
        Args: {
          _eid: string
          _note: string
          _registration_id?: string
          _speaker_id?: string
          _sponsor_id?: string
        }
        Returns: {
          note: string
        }[]
      }
      set_meeting_status: {
        Args: {
          _cause?: string
          _eid: string
          _location?: string
          _reason?: string
          _registration_id?: string
          _scheduled_at?: string
          _speaker_id?: string
          _sponsor_id?: string
          _status: string
        }
        Returns: {
          registration_id: string
          speaker_id: string
          sponsor_id: string
          status: string
        }[]
      }
      set_my_sponsor_share_consent: {
        Args: { _consent: boolean; _registration: string }
        Returns: boolean
      }
      shared_dataset_export: { Args: { _share: string }; Returns: Json }
      shared_dataset_info: { Args: { _share: string }; Returns: Json }
      shared_dataset_rows: {
        Args: {
          _dir?: string
          _filter?: string
          _limit?: number
          _offset?: number
          _q?: string
          _share: string
          _sort?: string
          _type?: string
        }
        Returns: Json
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      site_asset_writable: {
        Args: { _name: string; _owner: string }
        Returns: boolean
      }
      slugify: { Args: { _input: string }; Returns: string }
      speaker_portal_event_details: { Args: { _eid: string }; Returns: Json }
      speaker_portal_events: {
        Args: never
        Returns: {
          end_date: string
          event_date: string
          event_description: string
          event_id: string
          event_slug: string
          event_title: string
          image_url: string
          location: string
          organizer_name: string
          session_count: number
          speaker_company: string
          speaker_id: string
          speaker_name: string
          speaker_photo_url: string
          status: string
          venue: string
        }[]
      }
      sponsor_event_counts: { Args: { _eid: string }; Returns: Json }
      sponsor_meeting_report: {
        Args: { _eid: string; _sponsor_id: string }
        Returns: {
          checked_in: boolean
          checked_in_at: string
          company: string
          designation: string
          dispute_note: string
          dispute_reason: string
          dispute_resolution: string
          dispute_status: string
          email: string
          history: Json
          interested_at: string
          kind: string
          location: string
          met_at: string
          name: string
          scheduled_at: string
          status: string
          status_by_side: string
          status_cause: string
          status_reason: string
        }[]
      }
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
        Args: { _eid: string }
        Returns: {
          checked_in: boolean
          checked_in_at: string
          company: string
          designation: string
          dispute_note: string
          dispute_reason: string
          dispute_requested_status: string
          dispute_resolution: string
          dispute_status: string
          disputed_at: string
          event_over: boolean
          ever_progressed: boolean
          id: string
          interested_at: string
          kind: string
          location: string
          meeting_interest: boolean
          meeting_status: string
          met_at: string
          name: string
          note: string
          outcome_at: string
          resolved_at: string
          scheduled_at: string
          status_by_side: string
          status_cause: string
          status_changed_at: string
          status_reason: string
          ticket_type: string
        }[]
      }
      sponsor_set_meeting_interest: {
        Args: {
          _eid: string
          _interested: boolean
          _registration_id: string
          _speaker_id?: string
          _sponsor_id?: string
        }
        Returns: {
          meeting_interest: boolean
          registration_id: string
          speaker_id: string
          sponsor_id: string
        }[]
      }
      sponsor_shared_datasets: { Args: never; Returns: Json }
      suggest_companies: {
        Args: { _limit?: number; _q: string }
        Returns: {
          company_id: string
          name: string
          verified: boolean
        }[]
      }
      take_rate_limit: {
        Args: {
          _bucket: string
          _key_hash: string
          _max: number
          _window_seconds: number
        }
        Returns: boolean
      }
      toggle_attendance: {
        Args: { p_method?: string; p_reg_id: string }
        Returns: {
          event_id: string
          occurred_at: string
          state: string
          total_minutes: number
        }[]
      }
      unavailable_venue_ids: {
        Args: { p_end?: string; p_exclude_event_id?: string; p_start: string }
        Returns: string[]
      }
      unban_requests_to_review: {
        Args: { _community_id?: string }
        Returns: {
          avatar_url: string
          ban_reason: string
          banned_at: string
          community_id: string
          community_name: string
          created_at: string
          display_name: string
          id: string
          message: string
          scope: string
          user_id: string
        }[]
      }
      undo_attendance: {
        Args: { p_kind: string; p_reg_id: string }
        Returns: {
          deleted: boolean
          state: string
          total_minutes: number
        }[]
      }
      user_role_assignments: { Args: never; Returns: Json }
      utm_link_has_data: { Args: { _link_id: string }; Returns: boolean }
      utm_partner_list: { Args: { _event_id: string }; Returns: Json }
      utm_partner_remove: { Args: { _access_id: string }; Returns: Json }
      utm_partner_revoke: { Args: { _access_id: string }; Returns: Json }
      utm_partner_share: {
        Args: {
          _email: string
          _event_id: string
          _permissions?: Json
          _utm_campaign: string
          _utm_medium: string
          _utm_source: string
        }
        Returns: Json
      }
      utm_partner_update: {
        Args: { _access_id: string; _permissions: Json }
        Returns: Json
      }
      vendor_can_read_org: { Args: { p_org_id: string }; Returns: boolean }
      vendor_venue_requests: {
        Args: never
        Returns: {
          created_at: string
          event_banner_url: string
          event_capacity: number
          event_date: string
          event_description: string
          event_duration_hours: number
          event_end_date: string
          event_format: string
          event_id: string
          event_location: string
          event_status: string
          event_timezone: string
          event_title: string
          event_type: string
          event_venue: string
          expected_attendees: number
          needs_additional_rooms: boolean
          needs_pre_function_area: boolean
          needs_vip_area: boolean
          notes: string
          org_name: string
          organizer_email: string
          organizer_name: string
          organizer_phone: string
          responded_at: string
          seating_arrangement: string
          seating_capacity: number
          selected_service_ids: string[]
          selection_id: string
          status: string
          vendor_id: string
          venue_id: string
          venue_link: string
          venue_name: string
        }[]
      }
      vendor_visible_booking_ids: {
        Args: never
        Returns: {
          id: string
        }[]
      }
      vendor_visible_rfq_ids: {
        Args: never
        Returns: {
          id: string
        }[]
      }
      webinar_react: {
        Args: {
          _emoji: string
          _join_token?: string
          _session_id: string
          _speaker_token?: string
        }
        Returns: undefined
      }
      whatsapp_templates_list: {
        Args: { _org_id: string }
        Returns: {
          category: string
          components: Json
          language: string
          name: string
          status: string
          synced_at: string
          variable_count: number
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
      community_category:
        | "tech"
        | "ai"
        | "startup"
        | "hackathon"
        | "cybersecurity"
        | "finance"
        | "education"
        | "design"
        | "marketing"
        | "health"
        | "sustainability"
        | "other"
      community_kind: "parent" | "event"
      community_post_type:
        | "discussion"
        | "question"
        | "announcement"
        | "resource"
        | "poll"
        | "event_update"
      community_role:
        | "member"
        | "speaker"
        | "sponsor"
        | "organizer"
        | "moderator"
        | "manager"
        | "mentor"
      community_visibility: "public" | "members_only" | "private"
      support_ticket_category:
        | "general"
        | "sales"
        | "support"
        | "billing"
        | "privacy"
        | "grievance"
        | "press"
        | "legal"
        | "feature_request"
        | "bug_report"
        | "other"
      support_ticket_priority: "low" | "normal" | "high" | "urgent"
      support_ticket_status:
        | "open"
        | "pending"
        | "awaiting_user"
        | "resolved"
        | "closed"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      community_category: [
        "tech",
        "ai",
        "startup",
        "hackathon",
        "cybersecurity",
        "finance",
        "education",
        "design",
        "marketing",
        "health",
        "sustainability",
        "other",
      ],
      community_kind: ["parent", "event"],
      community_post_type: [
        "discussion",
        "question",
        "announcement",
        "resource",
        "poll",
        "event_update",
      ],
      community_role: [
        "member",
        "speaker",
        "sponsor",
        "organizer",
        "moderator",
        "manager",
        "mentor",
      ],
      community_visibility: ["public", "members_only", "private"],
      support_ticket_category: [
        "general",
        "sales",
        "support",
        "billing",
        "privacy",
        "grievance",
        "press",
        "legal",
        "feature_request",
        "bug_report",
        "other",
      ],
      support_ticket_priority: ["low", "normal", "high", "urgent"],
      support_ticket_status: [
        "open",
        "pending",
        "awaiting_user",
        "resolved",
        "closed",
      ],
    },
  },
} as const
