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
      agent_notifications: {
        Row: {
          body: string | null
          created_at: string
          href: string | null
          id: string
          kind: string
          level: string
          read_at: string | null
          root_session_id: string | null
          session_id: string | null
          status: string
          subject_id: string | null
          subject_type: string | null
          title: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          body?: string | null
          created_at?: string
          href?: string | null
          id?: string
          kind: string
          level?: string
          read_at?: string | null
          root_session_id?: string | null
          session_id?: string | null
          status: string
          subject_id?: string | null
          subject_type?: string | null
          title: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          body?: string | null
          created_at?: string
          href?: string | null
          id?: string
          kind?: string
          level?: string
          read_at?: string | null
          root_session_id?: string | null
          session_id?: string | null
          status?: string
          subject_id?: string | null
          subject_type?: string | null
          title?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      chat_conversations: {
        Row: {
          created_at: string
          eve_run_ids: string[]
          eve_session_id: string | null
          id: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          eve_run_ids?: string[]
          eve_session_id?: string | null
          id?: string
          title?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          eve_run_ids?: string[]
          eve_session_id?: string | null
          id?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      design_presets: {
        Row: {
          active: boolean
          character: string
          created_at: string
          font_pairs: string[]
          hero_variants: string[]
          industries: string[]
          slug: string
          variation_notes: string | null
        }
        Insert: {
          active?: boolean
          character: string
          created_at?: string
          font_pairs: string[]
          hero_variants: string[]
          industries: string[]
          slug: string
          variation_notes?: string | null
        }
        Update: {
          active?: boolean
          character?: string
          created_at?: string
          font_pairs?: string[]
          hero_variants?: string[]
          industries?: string[]
          slug?: string
          variation_notes?: string | null
        }
        Relationships: []
      }
      design_references: {
        Row: {
          active: boolean
          analysis: Json | null
          analyzed_at: string | null
          claimed_at: string | null
          created_at: string
          do_steal: string | null
          dont_steal: string | null
          id: string
          industries: string[]
          layout_notes: string | null
          palette: Json | null
          quality_score: number | null
          screenshot_mobile_path: string | null
          screenshot_path: string | null
          slug: string
          source: string | null
          status: string
          style_tags: string[]
          typography: Json | null
          url: string
        }
        Insert: {
          active?: boolean
          analysis?: Json | null
          analyzed_at?: string | null
          claimed_at?: string | null
          created_at?: string
          do_steal?: string | null
          dont_steal?: string | null
          id?: string
          industries?: string[]
          layout_notes?: string | null
          palette?: Json | null
          quality_score?: number | null
          screenshot_mobile_path?: string | null
          screenshot_path?: string | null
          slug: string
          source?: string | null
          status?: string
          style_tags?: string[]
          typography?: Json | null
          url: string
        }
        Update: {
          active?: boolean
          analysis?: Json | null
          analyzed_at?: string | null
          claimed_at?: string | null
          created_at?: string
          do_steal?: string | null
          dont_steal?: string | null
          id?: string
          industries?: string[]
          layout_notes?: string | null
          palette?: Json | null
          quality_score?: number | null
          screenshot_mobile_path?: string | null
          screenshot_path?: string | null
          slug?: string
          source?: string | null
          status?: string
          style_tags?: string[]
          typography?: Json | null
          url?: string
        }
        Relationships: []
      }
      lead_activity: {
        Row: {
          actor: string | null
          created_at: string
          id: string
          lead_id: string
          note: string | null
          type: string
        }
        Insert: {
          actor?: string | null
          created_at?: string
          id?: string
          lead_id: string
          note?: string | null
          type: string
        }
        Update: {
          actor?: string | null
          created_at?: string
          id?: string
          lead_id?: string
          note?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_activity_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_brand: {
        Row: {
          colors: Json
          created_at: string
          differentiators: string | null
          eve_run_ids: string[]
          eve_session_id: string | null
          fonts: string[]
          icon_path: string | null
          image_meta: Json
          images: Json
          lead_id: string
          logo_path: string | null
          notes: string | null
          services: Json
          short_name: string | null
          tagline: string | null
          updated_at: string
          voice: Json | null
        }
        Insert: {
          colors?: Json
          created_at?: string
          differentiators?: string | null
          eve_run_ids?: string[]
          eve_session_id?: string | null
          fonts?: string[]
          icon_path?: string | null
          image_meta?: Json
          images?: Json
          lead_id: string
          logo_path?: string | null
          notes?: string | null
          services?: Json
          short_name?: string | null
          tagline?: string | null
          updated_at?: string
          voice?: Json | null
        }
        Update: {
          colors?: Json
          created_at?: string
          differentiators?: string | null
          eve_run_ids?: string[]
          eve_session_id?: string | null
          fonts?: string[]
          icon_path?: string | null
          image_meta?: Json
          images?: Json
          lead_id?: string
          logo_path?: string | null
          notes?: string | null
          services?: Json
          short_name?: string | null
          tagline?: string | null
          updated_at?: string
          voice?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_brand_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: true
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          address: string | null
          business_type: string | null
          category: string | null
          city: string
          created_at: string
          description: string | null
          email: string | null
          fetched_at: string
          google_types: string[] | null
          id: string
          language: string
          manual_rating: string | null
          maps_uri: string | null
          name: string | null
          notes: string | null
          phone: string | null
          place_id: string
          rated_at: string | null
          rating: number | null
          rating_note: string | null
          reviews_count: number | null
          site_instructions: string | null
          status: string
          status_updated_at: string | null
          website: string | null
          website_quality: string | null
          website_score: number | null
          website_signals: Json
        }
        Insert: {
          address?: string | null
          business_type?: string | null
          category?: string | null
          city: string
          created_at?: string
          description?: string | null
          email?: string | null
          fetched_at?: string
          google_types?: string[] | null
          id?: string
          language?: string
          manual_rating?: string | null
          maps_uri?: string | null
          name?: string | null
          notes?: string | null
          phone?: string | null
          place_id: string
          rated_at?: string | null
          rating?: number | null
          rating_note?: string | null
          reviews_count?: number | null
          site_instructions?: string | null
          status?: string
          status_updated_at?: string | null
          website?: string | null
          website_quality?: string | null
          website_score?: number | null
          website_signals?: Json
        }
        Update: {
          address?: string | null
          business_type?: string | null
          category?: string | null
          city?: string
          created_at?: string
          description?: string | null
          email?: string | null
          fetched_at?: string
          google_types?: string[] | null
          id?: string
          language?: string
          manual_rating?: string | null
          maps_uri?: string | null
          name?: string | null
          notes?: string | null
          phone?: string | null
          place_id?: string
          rated_at?: string | null
          rating?: number | null
          rating_note?: string | null
          reviews_count?: number | null
          site_instructions?: string | null
          status?: string
          status_updated_at?: string | null
          website?: string | null
          website_quality?: string | null
          website_score?: number | null
          website_signals?: Json
        }
        Relationships: []
      }
      model_pricing: {
        Row: {
          cache_read_per_1m: number
          input_per_1m: number
          model: string
          note: string | null
          output_per_1m: number
        }
        Insert: {
          cache_read_per_1m?: number
          input_per_1m: number
          model: string
          note?: string | null
          output_per_1m: number
        }
        Update: {
          cache_read_per_1m?: number
          input_per_1m?: number
          model?: string
          note?: string | null
          output_per_1m?: number
        }
        Relationships: []
      }
      pending_inputs: {
        Row: {
          created_at: string
          options: Json | null
          prompt: string
          request_id: string
          responded_at: string | null
          session_id: string
        }
        Insert: {
          created_at?: string
          options?: Json | null
          prompt: string
          request_id: string
          responded_at?: string | null
          session_id: string
        }
        Update: {
          created_at?: string
          options?: Json | null
          prompt?: string
          request_id?: string
          responded_at?: string | null
          session_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      session_context: {
        Row: {
          lead_id: string | null
          session_id: string
          site_id: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          lead_id?: string | null
          session_id: string
          site_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          lead_id?: string | null
          session_id?: string
          site_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "session_context_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_context_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      site_versions: {
        Row: {
          actor: string | null
          changelog: string | null
          commit_sha: string | null
          created_at: string
          deployed_at: string | null
          id: string
          preview_url: string | null
          qa_report: Json | null
          site_id: string
          spec: Json
          vercel_deployment_id: string | null
          version_n: number
        }
        Insert: {
          actor?: string | null
          changelog?: string | null
          commit_sha?: string | null
          created_at?: string
          deployed_at?: string | null
          id?: string
          preview_url?: string | null
          qa_report?: Json | null
          site_id: string
          spec: Json
          vercel_deployment_id?: string | null
          version_n: number
        }
        Update: {
          actor?: string | null
          changelog?: string | null
          commit_sha?: string | null
          created_at?: string
          deployed_at?: string | null
          id?: string
          preview_url?: string | null
          qa_report?: Json | null
          site_id?: string
          spec?: Json
          vercel_deployment_id?: string | null
          version_n?: number
        }
        Relationships: [
          {
            foreignKeyName: "site_versions_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      sites: {
        Row: {
          brief: Json
          created_at: string
          current_version: number | null
          deploy_url: string | null
          eve_run_id: string | null
          eve_run_ids: string[]
          eve_session_id: string | null
          id: string
          lead_id: string
          published_at: string | null
          repo_url: string | null
          slug: string
          status: string
          status_updated_at: string | null
          updated_at: string
          vercel_project_id: string | null
        }
        Insert: {
          brief: Json
          created_at?: string
          current_version?: number | null
          deploy_url?: string | null
          eve_run_id?: string | null
          eve_run_ids?: string[]
          eve_session_id?: string | null
          id?: string
          lead_id: string
          published_at?: string | null
          repo_url?: string | null
          slug: string
          status?: string
          status_updated_at?: string | null
          updated_at?: string
          vercel_project_id?: string | null
        }
        Update: {
          brief?: Json
          created_at?: string
          current_version?: number | null
          deploy_url?: string | null
          eve_run_id?: string | null
          eve_run_ids?: string[]
          eve_session_id?: string | null
          id?: string
          lead_id?: string
          published_at?: string | null
          repo_url?: string | null
          slug?: string
          status?: string
          status_updated_at?: string | null
          updated_at?: string
          vercel_project_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sites_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: true
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_images: {
        Row: {
          created_at: string
          dominant_tone: string | null
          id: string
          industry: string[]
          orientation: string | null
          path: string
          source_url: string | null
          tags: string[]
        }
        Insert: {
          created_at?: string
          dominant_tone?: string | null
          id?: string
          industry: string[]
          orientation?: string | null
          path: string
          source_url?: string | null
          tags?: string[]
        }
        Update: {
          created_at?: string
          dominant_tone?: string | null
          id?: string
          industry?: string[]
          orientation?: string | null
          path?: string
          source_url?: string | null
          tags?: string[]
        }
        Relationships: []
      }
      token_usage: {
        Row: {
          agent: string
          cache_read_tokens: number
          created_at: string
          id: string
          input_tokens: number
          model: string
          output_tokens: number
          session_id: string
          step_index: number | null
          turn_id: string | null
        }
        Insert: {
          agent: string
          cache_read_tokens?: number
          created_at?: string
          id?: string
          input_tokens?: number
          model: string
          output_tokens?: number
          session_id: string
          step_index?: number | null
          turn_id?: string | null
        }
        Update: {
          agent?: string
          cache_read_tokens?: number
          created_at?: string
          id?: string
          input_tokens?: number
          model?: string
          output_tokens?: number
          session_id?: string
          step_index?: number | null
          turn_id?: string | null
        }
        Relationships: []
      }
      tool_calls: {
        Row: {
          agent: string
          created_at: string
          id: string
          kind: string
          session_id: string
          step_index: number | null
          tool_name: string
          turn_id: string | null
        }
        Insert: {
          agent: string
          created_at?: string
          id?: string
          kind?: string
          session_id: string
          step_index?: number | null
          tool_name: string
          turn_id?: string | null
        }
        Update: {
          agent?: string
          created_at?: string
          id?: string
          kind?: string
          session_id?: string
          step_index?: number | null
          tool_name?: string
          turn_id?: string | null
        }
        Relationships: []
      }
      tool_timing: {
        Row: {
          agent: string
          created_at: string
          duration_ms: number
          id: number
          meta: Json | null
          ok: boolean | null
          session_id: string
          tool: string
        }
        Insert: {
          agent: string
          created_at?: string
          duration_ms: number
          id?: never
          meta?: Json | null
          ok?: boolean | null
          session_id: string
          tool: string
        }
        Update: {
          agent?: string
          created_at?: string
          duration_ms?: number
          id?: never
          meta?: Json | null
          ok?: boolean | null
          session_id?: string
          tool?: string
        }
        Relationships: []
      }
    }
    Views: {
      build_cost_by_model: {
        Row: {
          approved_pct: number | null
          build_cycles_p50: number | null
          builds: number | null
          cost_usd_p50: number | null
          dominant_model: string | null
          review_rounds_p50: number | null
          steps_p50: number | null
          wall_min_p50: number | null
        }
        Relationships: []
      }
      build_quality_by_codegen: {
        Row: {
          approved_pct: number | null
          builds: number | null
          codegen_model: string | null
          cost_usd_p50: number | null
          review_rounds_p50: number | null
          section_ms_p50: number | null
          section_retries_p50: number | null
        }
        Relationships: []
      }
      build_summary: {
        Row: {
          approved_final: boolean | null
          build_cycles: number | null
          build_ms_p50: number | null
          build_ms_total: number | null
          cache_read_pct: number | null
          codegen_model: string | null
          cost_usd: number | null
          critical_issues: number | null
          dominant_model: string | null
          draft_section_ms_p50: number | null
          draft_section_retries: number | null
          draft_sections: number | null
          ended_at: string | null
          major_issues: number | null
          review_rounds: number | null
          session_id: string | null
          site_id: string | null
          started_at: string | null
          steps: number | null
          wall_min: number | null
        }
        Relationships: [
          {
            foreignKeyName: "session_context_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      cache_health: {
        Row: {
          agent: string | null
          cache_read_pct: number | null
          cache_read_tokens: number | null
          calls: number | null
          first_seen: string | null
          input_tokens: number | null
          last_seen: string | null
          model: string | null
        }
        Relationships: []
      }
      lead_cost_by_stage: {
        Row: {
          agent: string | null
          cache_read_tokens: number | null
          cost_usd: number | null
          input_tokens: number | null
          lead_id: string | null
          model: string | null
          output_tokens: number | null
        }
        Relationships: []
      }
      lead_cost_total: {
        Row: {
          cache_read_tokens: number | null
          cost_usd: number | null
          input_tokens: number | null
          lead_id: string | null
          output_tokens: number | null
        }
        Relationships: []
      }
      lead_tool_calls: {
        Row: {
          agent: string | null
          calls: number | null
          lead_id: string | null
          tool_name: string | null
        }
        Relationships: []
      }
      lead_tool_cost: {
        Row: {
          agent: string | null
          cache_read_tokens: number | null
          calls: number | null
          cost_usd: number | null
          input_tokens: number | null
          lead_id: string | null
          output_tokens: number | null
          tool_name: string | null
        }
        Relationships: []
      }
      model_usage: {
        Row: {
          cache_read_tokens: number | null
          calls: number | null
          cost_usd: number | null
          input_tokens: number | null
          last_used: string | null
          model: string | null
          output_tokens: number | null
        }
        Relationships: []
      }
      site_activity_ping: {
        Row: {
          last_activity_at: string | null
          site_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "session_context_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      site_tool_calls: {
        Row: {
          agent: string | null
          calls: number | null
          scope_id: string | null
          site_id: string | null
          tool_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "session_context_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      hook_restrict_signup_domain: { Args: { event: Json }; Returns: Json }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
