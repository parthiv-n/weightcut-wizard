Initialising login role...
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
    PostgrestVersion: "13.0.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      chat_messages: {
        Row: {
          content: string
          created_at: string | null
          id: string
          role: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          role: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      fight_camp_calendar: {
        Row: {
          bodyweight: number | null
          created_at: string | null
          date: string
          duration_minutes: number
          fatigue_level: number | null
          id: string
          intensity: string
          intensity_level: number | null
          mobility_done: boolean | null
          notes: string | null
          rpe: number
          session_type: string
          sleep_hours: number | null
          sleep_quality: string | null
          soreness_level: number | null
          user_id: string
        }
        Insert: {
          bodyweight?: number | null
          created_at?: string | null
          date: string
          duration_minutes: number
          fatigue_level?: number | null
          id?: string
          intensity: string
          intensity_level?: number | null
          mobility_done?: boolean | null
          notes?: string | null
          rpe: number
          session_type: string
          sleep_hours?: number | null
          sleep_quality?: string | null
          soreness_level?: number | null
          user_id: string
        }
        Update: {
          bodyweight?: number | null
          created_at?: string | null
          date?: string
          duration_minutes?: number
          fatigue_level?: number | null
          id?: string
          intensity?: string
          intensity_level?: number | null
          mobility_done?: boolean | null
          notes?: string | null
          rpe?: number
          session_type?: string
          sleep_hours?: number | null
          sleep_quality?: string | null
          soreness_level?: number | null
          user_id?: string
        }
        Relationships: []
      }
      fight_camps: {
        Row: {
          created_at: string | null
          end_weight_kg: number | null
          event_name: string | null
          fight_date: string
          id: string
          is_completed: boolean | null
          name: string
          performance_feeling: string | null
          profile_pic_url: string | null
          rehydration_notes: string | null
          starting_weight_kg: number | null
          total_weight_cut: number | null
          updated_at: string | null
          user_id: string
          weigh_in_timing: string | null
          weight_via_carb_reduction: number | null
          weight_via_dehydration: number | null
        }
        Insert: {
          created_at?: string | null
          end_weight_kg?: number | null
          event_name?: string | null
          fight_date: string
          id?: string
          is_completed?: boolean | null
          name: string
          performance_feeling?: string | null
          profile_pic_url?: string | null
          rehydration_notes?: string | null
          starting_weight_kg?: number | null
          total_weight_cut?: number | null
          updated_at?: string | null
          user_id: string
          weigh_in_timing?: string | null
          weight_via_carb_reduction?: number | null
          weight_via_dehydration?: number | null
        }
        Update: {
          created_at?: string | null
          end_weight_kg?: number | null
          event_name?: string | null
          fight_date?: string
          id?: string
          is_completed?: boolean | null
          name?: string
          performance_feeling?: string | null
          profile_pic_url?: string | null
          rehydration_notes?: string | null
          starting_weight_kg?: number | null
          total_weight_cut?: number | null
          updated_at?: string | null
          user_id?: string
          weigh_in_timing?: string | null
          weight_via_carb_reduction?: number | null
          weight_via_dehydration?: number | null
        }
        Relationships: []
      }
      fight_week_logs: {
        Row: {
          carbs_g: number | null
          created_at: string | null
          fluid_intake_ml: number | null
          id: string
          log_date: string
          notes: string | null
          supplements: string | null
          sweat_session_min: number | null
          updated_at: string | null
          user_id: string
          weight_kg: number | null
        }
        Insert: {
          carbs_g?: number | null
          created_at?: string | null
          fluid_intake_ml?: number | null
          id?: string
          log_date: string
          notes?: string | null
          supplements?: string | null
          sweat_session_min?: number | null
          updated_at?: string | null
          user_id: string
          weight_kg?: number | null
        }
        Update: {
          carbs_g?: number | null
          created_at?: string | null
          fluid_intake_ml?: number | null
          id?: string
          log_date?: string
          notes?: string | null
          supplements?: string | null
          sweat_session_min?: number | null
          updated_at?: string | null
          user_id?: string
          weight_kg?: number | null
        }
        Relationships: []
      }
      fight_week_plans: {
        Row: {
          created_at: string | null
          fight_camp_id: string | null
          fight_date: string
          id: string
          starting_weight_kg: number
          target_weight_kg: number
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          fight_camp_id?: string | null
          fight_date: string
          id?: string
          starting_weight_kg: number
          target_weight_kg: number
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          fight_camp_id?: string | null
          fight_date?: string
          id?: string
          starting_weight_kg?: number
          target_weight_kg?: number
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fight_week_plans_fight_camp_id_fkey"
            columns: ["fight_camp_id"]
            isOneToOne: false
            referencedRelation: "fight_camps"
            referencedColumns: ["id"]
          },
        ]
      }
      hydration_logs: {
        Row: {
          amount_ml: number
          created_at: string | null
          date: string
          id: string
          notes: string | null
          sodium_mg: number | null
          sweat_loss_percent: number | null
          training_weight_post: number | null
          training_weight_pre: number | null
          user_id: string
        }
        Insert: {
          amount_ml: number
          created_at?: string | null
          date: string
          id?: string
          notes?: string | null
          sodium_mg?: number | null
          sweat_loss_percent?: number | null
          training_weight_post?: number | null
          training_weight_pre?: number | null
          user_id: string
        }
        Update: {
          amount_ml?: number
          created_at?: string | null
          date?: string
          id?: string
          notes?: string | null
          sodium_mg?: number | null
          sweat_loss_percent?: number | null
          training_weight_post?: number | null
          training_weight_pre?: number | null
          user_id?: string
        }
        Relationships: []
      }
      meal_plans: {
        Row: {
          created_at: string | null
          daily_calorie_target: number
          dietary_preferences: string | null
          end_date: string
          id: string
          plan_name: string
          start_date: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          daily_calorie_target: number
          dietary_preferences?: string | null
          end_date: string
          id?: string
          plan_name: string
          start_date: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          daily_calorie_target?: number
          dietary_preferences?: string | null
          end_date?: string
          id?: string
          plan_name?: string
          start_date?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      nutrition_logs: {
        Row: {
          calories: number
          carbs_g: number | null
          created_at: string | null
          date: string
          fats_g: number | null
          id: string
          ingredients: Json | null
          is_ai_generated: boolean | null
          meal_name: string
          meal_type: string | null
          portion_size: string | null
          protein_g: number | null
          recipe_notes: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          calories: number
          carbs_g?: number | null
          created_at?: string | null
          date: string
          fats_g?: number | null
          id?: string
          ingredients?: Json | null
          is_ai_generated?: boolean | null
          meal_name: string
          meal_type?: string | null
          portion_size?: string | null
          protein_g?: number | null
          recipe_notes?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          calories?: number
          carbs_g?: number | null
          created_at?: string | null
          date?: string
          fats_g?: number | null
          id?: string
          ingredients?: Json | null
          is_ai_generated?: boolean | null
          meal_name?: string
          meal_type?: string | null
          portion_size?: string | null
          protein_g?: number | null
          recipe_notes?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          activity_level: string
          age: number
          ai_recommendations_updated_at: string | null
          ai_recommended_calories: number | null
          ai_recommended_carbs_g: number | null
          ai_recommended_fats_g: number | null
          ai_recommended_protein_g: number | null
          avatar_url: string | null
          bmr: number | null
          created_at: string | null
          current_weight_kg: number
          fight_week_target_kg: number | null
          goal_weight_kg: number
          height_cm: number
          id: string
          manual_nutrition_override: boolean | null
          sex: string
          target_date: string
          tdee: number | null
          training_frequency: number | null
          updated_at: string | null
        }
        Insert: {
          activity_level: string
          age: number
          ai_recommendations_updated_at?: string | null
          ai_recommended_calories?: number | null
          ai_recommended_carbs_g?: number | null
          ai_recommended_fats_g?: number | null
          ai_recommended_protein_g?: number | null
          avatar_url?: string | null
          bmr?: number | null
          created_at?: string | null
          current_weight_kg: number
          fight_week_target_kg?: number | null
          goal_weight_kg: number
          height_cm: number
          id: string
          manual_nutrition_override?: boolean | null
          sex: string
          target_date: string
          tdee?: number | null
          training_frequency?: number | null
          updated_at?: string | null
        }
        Update: {
          activity_level?: string
          age?: number
          ai_recommendations_updated_at?: string | null
          ai_recommended_calories?: number | null
          ai_recommended_carbs_g?: number | null
          ai_recommended_fats_g?: number | null
          ai_recommended_protein_g?: number | null
          avatar_url?: string | null
          bmr?: number | null
          created_at?: string | null
          current_weight_kg?: number
          fight_week_target_kg?: number | null
          goal_weight_kg?: number
          height_cm?: number
          id?: string
          manual_nutrition_override?: boolean | null
          sex?: string
          target_date?: string
          tdee?: number | null
          training_frequency?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      rate_limits: {
        Row: {
          function_name: string
          id: number
          request_count: number
          user_id: string
          window_start: string
        }
        Insert: {
          function_name: string
          id?: never
          request_count?: number
          user_id: string
          window_start?: string
        }
        Update: {
          function_name?: string
          id?: never
          request_count?: number
          user_id?: string
          window_start?: string
        }
        Relationships: []
      }
      user_dietary_preferences: {
        Row: {
          created_at: string | null
          dietary_restrictions: string[] | null
          disliked_foods: string[] | null
          favorite_cuisines: string[] | null
          id: string
          meal_preferences: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          dietary_restrictions?: string[] | null
          disliked_foods?: string[] | null
          favorite_cuisines?: string[] | null
          id?: string
          meal_preferences?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          dietary_restrictions?: string[] | null
          disliked_foods?: string[] | null
          favorite_cuisines?: string[] | null
          id?: string
          meal_preferences?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_insights: {
        Row: {
          confidence_score: number | null
          created_at: string | null
          id: string
          insight_data: Json
          insight_type: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          confidence_score?: number | null
          created_at?: string | null
          id?: string
          insight_data: Json
          insight_type: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          confidence_score?: number | null
          created_at?: string | null
          id?: string
          insight_data?: Json
          insight_type?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      weight_logs: {
        Row: {
          created_at: string | null
          date: string
          id: string
          user_id: string
          weight_kg: number
        }
        Insert: {
          created_at?: string | null
          date: string
          id?: string
          user_id: string
          weight_kg: number
        }
        Update: {
          created_at?: string | null
          date?: string
          id?: string
          user_id?: string
          weight_kg?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      increment_rate_limit: {
        Args: {
          p_function_name: string
          p_max_requests: number
          p_user_id: string
        }
        Returns: boolean
      }
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
A new version of Supabase CLI is available: v2.75.0 (currently installed v2.62.5)
We recommend updating regularly for new features and bug fixes: https://supabase.com/docs/guides/cli/getting-started#updating-the-supabase-cli
