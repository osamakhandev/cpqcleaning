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
      approved_users: {
        Row: {
          access_expires_at: string | null
          email: string
          first_login_at: string | null
          full_name: string | null
          id: string
          invited_at: string
          invited_by: string | null
          is_active: boolean
          last_login_at: string | null
          notes: string | null
        }
        Insert: {
          access_expires_at?: string | null
          email: string
          first_login_at?: string | null
          full_name?: string | null
          id?: string
          invited_at?: string
          invited_by?: string | null
          is_active?: boolean
          last_login_at?: string | null
          notes?: string | null
        }
        Update: {
          access_expires_at?: string | null
          email?: string
          first_login_at?: string | null
          full_name?: string | null
          id?: string
          invited_at?: string
          invited_by?: string | null
          is_active?: boolean
          last_login_at?: string | null
          notes?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          id: string
          plan_type: Database["public"]["Enums"]["plan_tier"]
          plan_updated_at: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id: string
          plan_type?: Database["public"]["Enums"]["plan_tier"]
          plan_updated_at?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          plan_type?: Database["public"]["Enums"]["plan_tier"]
          plan_updated_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          created_at: string
          data: Json
          folder: string | null
          id: string
          name: string
          owner_id: string
          status: Database["public"]["Enums"]["project_status"]
          submitted_at: string | null
          submitted_snapshot: Json | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          data?: Json
          folder?: string | null
          id?: string
          name?: string
          owner_id: string
          status?: Database["public"]["Enums"]["project_status"]
          submitted_at?: string | null
          submitted_snapshot?: Json | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          data?: Json
          folder?: string | null
          id?: string
          name?: string
          owner_id?: string
          status?: Database["public"]["Enums"]["project_status"]
          submitted_at?: string | null
          submitted_snapshot?: Json | null
          updated_at?: string
        }
        Relationships: []
      }
      stripe_products: {
        Row: {
          billing_interval: Database["public"]["Enums"]["billing_interval"]
          created_at: string
          currency: string | null
          id: string
          payment_link_url: string | null
          plan: Database["public"]["Enums"]["plan_tier"]
          stripe_price_id: string
          stripe_product_id: string
          unit_amount: number | null
        }
        Insert: {
          billing_interval: Database["public"]["Enums"]["billing_interval"]
          created_at?: string
          currency?: string | null
          id?: string
          payment_link_url?: string | null
          plan: Database["public"]["Enums"]["plan_tier"]
          stripe_price_id: string
          stripe_product_id: string
          unit_amount?: number | null
        }
        Update: {
          billing_interval?: Database["public"]["Enums"]["billing_interval"]
          created_at?: string
          currency?: string | null
          id?: string
          payment_link_url?: string | null
          plan?: Database["public"]["Enums"]["plan_tier"]
          stripe_price_id?: string
          stripe_product_id?: string
          unit_amount?: number | null
        }
        Relationships: []
      }
      stripe_webhook_events: {
        Row: {
          event_id: string
          payload: Json | null
          received_at: string
          type: string
        }
        Insert: {
          event_id: string
          payload?: Json | null
          received_at?: string
          type: string
        }
        Update: {
          event_id?: string
          payload?: Json | null
          received_at?: string
          type?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          created_at: string
          current_period_end: string | null
          email: string
          id: string
          pause_count_in_window: number
          pause_days_used: number
          pause_ends_at: string | null
          pause_window_start: string | null
          paused_at: string | null
          plan: Database["public"]["Enums"]["plan_tier"]
          scheduled_change_at: string | null
          scheduled_plan: Database["public"]["Enums"]["plan_tier"] | null
          scheduled_price_id: string | null
          status: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id: string | null
          stripe_price_id: string | null
          stripe_schedule_id: string | null
          stripe_subscription_id: string | null
          trial_end: string | null
          trial_start: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          email: string
          id?: string
          pause_count_in_window?: number
          pause_days_used?: number
          pause_ends_at?: string | null
          pause_window_start?: string | null
          paused_at?: string | null
          plan: Database["public"]["Enums"]["plan_tier"]
          scheduled_change_at?: string | null
          scheduled_plan?: Database["public"]["Enums"]["plan_tier"] | null
          scheduled_price_id?: string | null
          status: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id?: string | null
          stripe_price_id?: string | null
          stripe_schedule_id?: string | null
          stripe_subscription_id?: string | null
          trial_end?: string | null
          trial_start?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          email?: string
          id?: string
          pause_count_in_window?: number
          pause_days_used?: number
          pause_ends_at?: string | null
          pause_window_start?: string | null
          paused_at?: string | null
          plan?: Database["public"]["Enums"]["plan_tier"]
          scheduled_change_at?: string | null
          scheduled_plan?: Database["public"]["Enums"]["plan_tier"] | null
          scheduled_price_id?: string | null
          status?: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id?: string | null
          stripe_price_id?: string | null
          stripe_schedule_id?: string | null
          stripe_subscription_id?: string | null
          trial_end?: string | null
          trial_start?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      activate_trial: { Args: { user_email: string }; Returns: Json }
      is_current_user_approved: { Args: never; Returns: boolean }
      is_email_approved: { Args: { _email: string }; Returns: boolean }
    }
    Enums: {
      billing_interval: "month" | "year"
      plan_tier: "basic" | "advanced" | "integrated"
      project_status: "draft" | "active" | "submitted"
      subscription_status:
        | "trialing"
        | "active"
        | "past_due"
        | "canceled"
        | "incomplete"
        | "paused"
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
      billing_interval: ["month", "year"],
      plan_tier: ["basic", "advanced", "integrated"],
      project_status: ["draft", "active", "submitted"],
      subscription_status: [
        "trialing",
        "active",
        "past_due",
        "canceled",
        "incomplete",
        "paused",
      ],
    },
  },
} as const
