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
      daily_wellness_checkins: {
        Row: {
          appetite_level: number | null
          created_at: string | null
          date: string
          energy_level: number | null
          fatigue_level: number
          hooper_index: number | null
          hydration_feeling: number | null
          id: string
          motivation_level: number | null
          readiness_score: number | null
          sleep_hours: number | null
          sleep_quality: number
          soreness_level: number
          stress_level: number
          user_id: string
        }
        Insert: {
          appetite_level?: number | null
          created_at?: string | null
          date: string
          energy_level?: number | null
          fatigue_level: number
          hooper_index?: number | null
          hydration_feeling?: number | null
          id?: string
          motivation_level?: number | null
          readiness_score?: number | null
          sleep_hours?: number | null
          sleep_quality: number
          soreness_level: number
          stress_level: number
          user_id: string
        }
        Update: {
          appetite_level?: number | null
          created_at?: string | null
          date?: string
          energy_level?: number | null
          fatigue_level?: number
          hooper_index?: number | null
          hydration_feeling?: number | null
          id?: string
          motivation_level?: number | null
          readiness_score?: number | null
          sleep_hours?: number | null
          sleep_quality?: number
          soreness_level?: number
          stress_level?: number
          user_id?: string
        }
        Relationships: []
      }
      exercise_prs: {
        Row: {
          best_set_id: string | null
          estimated_1rm: number | null
          exercise_id: string
          id: string
          max_reps: number | null
          max_volume: number | null
          max_weight_kg: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          best_set_id?: string | null
          estimated_1rm?: number | null
          exercise_id: string
          id?: string
          max_reps?: number | null
          max_volume?: number | null
          max_weight_kg?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          best_set_id?: string | null
          estimated_1rm?: number | null
          exercise_id?: string
          id?: string
          max_reps?: number | null
          max_volume?: number | null
          max_weight_kg?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exercise_prs_best_set_id_fkey"
            columns: ["best_set_id"]
            isOneToOne: false
            referencedRelation: "gym_sets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exercise_prs_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
        ]
      }
      exercises: {
        Row: {
          category: string
          created_at: string
          equipment: string | null
          id: string
          is_bodyweight: boolean
          is_custom: boolean
          muscle_group: string
          name: string
          user_id: string | null
        }
        Insert: {
          category: string
          created_at?: string
          equipment?: string | null
          id?: string
          is_bodyweight?: boolean
          is_custom?: boolean
          muscle_group: string
          name: string
          user_id?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          equipment?: string | null
          id?: string
          is_bodyweight?: boolean
          is_custom?: boolean
          muscle_group?: string
          name?: string
          user_id?: string | null
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
          media_url: string | null
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
          media_url?: string | null
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
          media_url?: string | null
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
      foods: {
        Row: {
          barcode: string | null
          brand: string | null
          calories_per_100g: number
          carbs_per_100g: number
          created_at: string
          created_by: string | null
          default_serving_g: number | null
          fats_per_100g: number
          id: string
          name: string
          protein_per_100g: number
          source: string
          source_ref: string | null
          verified: boolean
        }
        Insert: {
          barcode?: string | null
          brand?: string | null
          calories_per_100g: number
          carbs_per_100g?: number
          created_at?: string
          created_by?: string | null
          default_serving_g?: number | null
          fats_per_100g?: number
          id?: string
          name: string
          protein_per_100g?: number
          source: string
          source_ref?: string | null
          verified?: boolean
        }
        Update: {
          barcode?: string | null
          brand?: string | null
          calories_per_100g?: number
          carbs_per_100g?: number
          created_at?: string
          created_by?: string | null
          default_serving_g?: number | null
          fats_per_100g?: number
          id?: string
          name?: string
          protein_per_100g?: number
          source?: string
          source_ref?: string | null
          verified?: boolean
        }
        Relationships: []
      }
      gym_sessions: {
        Row: {
          created_at: string
          date: string
          duration_minutes: number | null
          id: string
          notes: string | null
          perceived_fatigue: number | null
          session_type: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          date?: string
          duration_minutes?: number | null
          id?: string
          notes?: string | null
          perceived_fatigue?: number | null
          session_type: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          date?: string
          duration_minutes?: number | null
          id?: string
          notes?: string | null
          perceived_fatigue?: number | null
          session_type?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      gym_sets: {
        Row: {
          assisted_weight_kg: number | null
          created_at: string
          exercise_id: string
          exercise_order: number
          id: string
          is_bodyweight: boolean
          is_warmup: boolean
          notes: string | null
          reps: number
          rpe: number | null
          session_id: string
          set_order: number
          user_id: string
          weight_kg: number | null
        }
        Insert: {
          assisted_weight_kg?: number | null
          created_at?: string
          exercise_id: string
          exercise_order: number
          id?: string
          is_bodyweight?: boolean
          is_warmup?: boolean
          notes?: string | null
          reps: number
          rpe?: number | null
          session_id: string
          set_order: number
          user_id: string
          weight_kg?: number | null
        }
        Update: {
          assisted_weight_kg?: number | null
          created_at?: string
          exercise_id?: string
          exercise_order?: number
          id?: string
          is_bodyweight?: boolean
          is_warmup?: boolean
          notes?: string | null
          reps?: number
          rpe?: number | null
          session_id?: string
          set_order?: number
          user_id?: string
          weight_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "gym_sets_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gym_sets_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "gym_sessions"
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
      meal_items: {
        Row: {
          calories: number
          carbs_g: number
          fats_g: number
          food_id: string | null
          grams: number
          id: string
          meal_id: string
          name: string
          position: number
          protein_g: number
        }
        Insert: {
          calories: number
          carbs_g?: number
          fats_g?: number
          food_id?: string | null
          grams: number
          id?: string
          meal_id: string
          name: string
          position?: number
          protein_g?: number
        }
        Update: {
          calories?: number
          carbs_g?: number
          fats_g?: number
          food_id?: string | null
          grams?: number
          id?: string
          meal_id?: string
          name?: string
          position?: number
          protein_g?: number
        }
        Relationships: [
          {
            foreignKeyName: "meal_items_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "foods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_items_meal_id_fkey"
            columns: ["meal_id"]
            isOneToOne: false
            referencedRelation: "meals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_items_meal_id_fkey"
            columns: ["meal_id"]
            isOneToOne: false
            referencedRelation: "meals_with_totals"
            referencedColumns: ["id"]
          },
        ]
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
      meals: {
        Row: {
          created_at: string
          date: string
          id: string
          is_ai_generated: boolean
          meal_name: string
          meal_type: string
          notes: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          date: string
          id?: string
          is_ai_generated?: boolean
          meal_name: string
          meal_type?: string
          notes?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          is_ai_generated?: boolean
          meal_name?: string
          meal_type?: string
          notes?: string | null
          user_id?: string
        }
        Relationships: []
      }
      nutrition_logs_v1: {
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
          meal_type: string
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
          meal_name?: string
          meal_type?: string
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
          meal_type?: string
          portion_size?: string | null
          protein_g?: number | null
          recipe_notes?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      personal_baselines: {
        Row: {
          avg_deficit_14d: number | null
          avg_deficit_7d: number | null
          baseline_date: string
          created_at: string | null
          daily_load_mean_14d: number | null
          daily_load_mean_60d: number | null
          daily_load_std_14d: number | null
          daily_load_std_60d: number | null
          fatigue_mean_14d: number | null
          fatigue_mean_60d: number | null
          fatigue_std_14d: number | null
          fatigue_std_60d: number | null
          hooper_cv_14d: number | null
          hooper_mean_14d: number | null
          hooper_mean_60d: number | null
          hooper_std_14d: number | null
          hooper_std_60d: number | null
          id: string
          sleep_hours_mean_14d: number | null
          sleep_hours_mean_60d: number | null
          sleep_hours_std_14d: number | null
          sleep_hours_std_60d: number | null
          soreness_mean_14d: number | null
          soreness_mean_60d: number | null
          soreness_std_14d: number | null
          soreness_std_60d: number | null
          stress_mean_14d: number | null
          stress_mean_60d: number | null
          stress_std_14d: number | null
          stress_std_60d: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          avg_deficit_14d?: number | null
          avg_deficit_7d?: number | null
          baseline_date: string
          created_at?: string | null
          daily_load_mean_14d?: number | null
          daily_load_mean_60d?: number | null
          daily_load_std_14d?: number | null
          daily_load_std_60d?: number | null
          fatigue_mean_14d?: number | null
          fatigue_mean_60d?: number | null
          fatigue_std_14d?: number | null
          fatigue_std_60d?: number | null
          hooper_cv_14d?: number | null
          hooper_mean_14d?: number | null
          hooper_mean_60d?: number | null
          hooper_std_14d?: number | null
          hooper_std_60d?: number | null
          id?: string
          sleep_hours_mean_14d?: number | null
          sleep_hours_mean_60d?: number | null
          sleep_hours_std_14d?: number | null
          sleep_hours_std_60d?: number | null
          soreness_mean_14d?: number | null
          soreness_mean_60d?: number | null
          soreness_std_14d?: number | null
          soreness_std_60d?: number | null
          stress_mean_14d?: number | null
          stress_mean_60d?: number | null
          stress_std_14d?: number | null
          stress_std_60d?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          avg_deficit_14d?: number | null
          avg_deficit_7d?: number | null
          baseline_date?: string
          created_at?: string | null
          daily_load_mean_14d?: number | null
          daily_load_mean_60d?: number | null
          daily_load_std_14d?: number | null
          daily_load_std_60d?: number | null
          fatigue_mean_14d?: number | null
          fatigue_mean_60d?: number | null
          fatigue_std_14d?: number | null
          fatigue_std_60d?: number | null
          hooper_cv_14d?: number | null
          hooper_mean_14d?: number | null
          hooper_mean_60d?: number | null
          hooper_std_14d?: number | null
          hooper_std_60d?: number | null
          id?: string
          sleep_hours_mean_14d?: number | null
          sleep_hours_mean_60d?: number | null
          sleep_hours_std_14d?: number | null
          sleep_hours_std_60d?: number | null
          soreness_mean_14d?: number | null
          soreness_mean_60d?: number | null
          soreness_std_14d?: number | null
          soreness_std_60d?: number | null
          stress_mean_14d?: number | null
          stress_mean_60d?: number | null
          stress_std_14d?: number | null
          stress_std_60d?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          activity_level: string
          ads_watched_date: string | null
          ads_watched_today: number
          age: number
          ai_recommendations_updated_at: string | null
          ai_recommended_calories: number | null
          ai_recommended_carbs_g: number | null
          ai_recommended_fats_g: number | null
          ai_recommended_protein_g: number | null
          athlete_type: string | null
          avatar_url: string | null
          bmr: number | null
          body_fat_pct: number | null
          created_at: string | null
          current_weight_kg: number
          cut_plan_json: Json | null
          experience_level: string | null
          fight_week_target_kg: number | null
          food_budget: string | null
          gems: number
          goal_type: string
          goal_weight_kg: number
          height_cm: number
          id: string
          last_free_gem_date: string | null
          manual_nutrition_override: boolean | null
          normal_daily_carbs_g: number | null
          plan_aggressiveness: string | null
          primary_struggle: string | null
          revenuecat_customer_id: string | null
          sex: string
          sleep_hours: string | null
          subscription_expires_at: string | null
          subscription_tier: string
          subscription_updated_at: string | null
          target_date: string
          tdee: number | null
          training_frequency: number | null
          training_types: string[] | null
          updated_at: string | null
        }
        Insert: {
          activity_level: string
          ads_watched_date?: string | null
          ads_watched_today?: number
          age: number
          ai_recommendations_updated_at?: string | null
          ai_recommended_calories?: number | null
          ai_recommended_carbs_g?: number | null
          ai_recommended_fats_g?: number | null
          ai_recommended_protein_g?: number | null
          athlete_type?: string | null
          avatar_url?: string | null
          bmr?: number | null
          body_fat_pct?: number | null
          created_at?: string | null
          current_weight_kg: number
          cut_plan_json?: Json | null
          experience_level?: string | null
          fight_week_target_kg?: number | null
          food_budget?: string | null
          gems?: number
          goal_type?: string
          goal_weight_kg: number
          height_cm: number
          id: string
          last_free_gem_date?: string | null
          manual_nutrition_override?: boolean | null
          normal_daily_carbs_g?: number | null
          plan_aggressiveness?: string | null
          primary_struggle?: string | null
          revenuecat_customer_id?: string | null
          sex: string
          sleep_hours?: string | null
          subscription_expires_at?: string | null
          subscription_tier?: string
          subscription_updated_at?: string | null
          target_date: string
          tdee?: number | null
          training_frequency?: number | null
          training_types?: string[] | null
          updated_at?: string | null
        }
        Update: {
          activity_level?: string
          ads_watched_date?: string | null
          ads_watched_today?: number
          age?: number
          ai_recommendations_updated_at?: string | null
          ai_recommended_calories?: number | null
          ai_recommended_carbs_g?: number | null
          ai_recommended_fats_g?: number | null
          ai_recommended_protein_g?: number | null
          athlete_type?: string | null
          avatar_url?: string | null
          bmr?: number | null
          body_fat_pct?: number | null
          created_at?: string | null
          current_weight_kg?: number
          cut_plan_json?: Json | null
          experience_level?: string | null
          fight_week_target_kg?: number | null
          food_budget?: string | null
          gems?: number
          goal_type?: string
          goal_weight_kg?: number
          height_cm?: number
          id?: string
          last_free_gem_date?: string | null
          manual_nutrition_override?: boolean | null
          normal_daily_carbs_g?: number | null
          plan_aggressiveness?: string | null
          primary_struggle?: string | null
          revenuecat_customer_id?: string | null
          sex?: string
          sleep_hours?: string | null
          subscription_expires_at?: string | null
          subscription_tier?: string
          subscription_updated_at?: string | null
          target_date?: string
          tdee?: number | null
          training_frequency?: number | null
          training_types?: string[] | null
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
      saved_routines: {
        Row: {
          created_at: string
          exercises: Json
          goal: string
          id: string
          is_ai_generated: boolean
          name: string
          sort_order: number
          sport: string | null
          training_days_per_week: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          exercises?: Json
          goal: string
          id?: string
          is_ai_generated?: boolean
          name: string
          sort_order?: number
          sport?: string | null
          training_days_per_week?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          exercises?: Json
          goal?: string
          id?: string
          is_ai_generated?: boolean
          name?: string
          sort_order?: number
          sport?: string | null
          training_days_per_week?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      sleep_logs: {
        Row: {
          created_at: string | null
          date: string
          hours: number
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          date: string
          hours: number
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          date?: string
          hours?: number
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      technique_edges: {
        Row: {
          created_at: string | null
          from_technique_id: string
          id: string
          relation_type: string
          to_technique_id: string
        }
        Insert: {
          created_at?: string | null
          from_technique_id: string
          id?: string
          relation_type?: string
          to_technique_id: string
        }
        Update: {
          created_at?: string | null
          from_technique_id?: string
          id?: string
          relation_type?: string
          to_technique_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "technique_edges_from_technique_id_fkey"
            columns: ["from_technique_id"]
            isOneToOne: false
            referencedRelation: "techniques"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "technique_edges_to_technique_id_fkey"
            columns: ["to_technique_id"]
            isOneToOne: false
            referencedRelation: "techniques"
            referencedColumns: ["id"]
          },
        ]
      }
      techniques: {
        Row: {
          category: string | null
          created_at: string | null
          id: string
          name: string
          name_normalized: string
          position: string | null
          sport: string
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          id?: string
          name: string
          name_normalized: string
          position?: string | null
          sport: string
        }
        Update: {
          category?: string | null
          created_at?: string | null
          id?: string
          name?: string
          name_normalized?: string
          position?: string | null
          sport?: string
        }
        Relationships: []
      }
      training_summaries: {
        Row: {
          created_at: string | null
          id: string
          notes_fingerprint: string
          session_ids: string[]
          summary_data: Json
          updated_at: string | null
          user_id: string
          week_start: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          notes_fingerprint?: string
          session_ids?: string[]
          summary_data: Json
          updated_at?: string | null
          user_id: string
          week_start: string
        }
        Update: {
          created_at?: string | null
          id?: string
          notes_fingerprint?: string
          session_ids?: string[]
          summary_data?: Json
          updated_at?: string | null
          user_id?: string
          week_start?: string
        }
        Relationships: []
      }
      training_technique_logs: {
        Row: {
          created_at: string | null
          date: string
          id: string
          notes: string | null
          session_id: string | null
          technique_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          date?: string
          id?: string
          notes?: string | null
          session_id?: string | null
          technique_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          date?: string
          id?: string
          notes?: string | null
          session_id?: string | null
          technique_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_technique_logs_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "fight_camp_calendar"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_technique_logs_technique_id_fkey"
            columns: ["technique_id"]
            isOneToOne: false
            referencedRelation: "techniques"
            referencedColumns: ["id"]
          },
        ]
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
      user_technique_progress: {
        Row: {
          first_logged_at: string | null
          id: string
          last_logged_at: string | null
          level: string
          technique_id: string
          times_logged: number
          user_id: string
        }
        Insert: {
          first_logged_at?: string | null
          id?: string
          last_logged_at?: string | null
          level?: string
          technique_id: string
          times_logged?: number
          user_id: string
        }
        Update: {
          first_logged_at?: string | null
          id?: string
          last_logged_at?: string | null
          level?: string
          technique_id?: string
          times_logged?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_technique_progress_technique_id_fkey"
            columns: ["technique_id"]
            isOneToOne: false
            referencedRelation: "techniques"
            referencedColumns: ["id"]
          },
        ]
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
      meals_with_totals: {
        Row: {
          created_at: string | null
          date: string | null
          id: string | null
          is_ai_generated: boolean | null
          item_count: number | null
          meal_name: string | null
          meal_type: string | null
          notes: string | null
          total_calories: number | null
          total_carbs_g: number | null
          total_fats_g: number | null
          total_protein_g: number | null
          user_id: string | null
        }
        Relationships: []
      }
      nutrition_logs: {
        Row: {
          calories: number | null
          carbs_g: number | null
          created_at: string | null
          date: string | null
          fats_g: number | null
          id: string | null
          ingredients: Json | null
          is_ai_generated: boolean | null
          item_name: string | null
          meal_name: string | null
          meal_type: string | null
          portion_size: string | null
          portion_size_g: number | null
          protein_g: number | null
          recipe_notes: string | null
          user_id: string | null
        }
        Insert: {
          calories?: number | null
          carbs_g?: number | null
          created_at?: string | null
          date?: string | null
          fats_g?: number | null
          id?: string | null
          ingredients?: Json | null
          is_ai_generated?: boolean | null
          item_name?: string | null
          meal_name?: string | null
          meal_type?: string | null
          portion_size?: string | null
          portion_size_g?: number | null
          protein_g?: number | null
          recipe_notes?: string | null
          user_id?: string | null
        }
        Update: {
          calories?: number | null
          carbs_g?: number | null
          created_at?: string | null
          date?: string | null
          fats_g?: number | null
          id?: string | null
          ingredients?: Json | null
          is_ai_generated?: boolean | null
          item_name?: string | null
          meal_name?: string | null
          meal_type?: string | null
          portion_size?: string | null
          portion_size_g?: number | null
          protein_g?: number | null
          recipe_notes?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      create_meal_with_items: {
        Args: {
          p_date: string
          p_is_ai_generated?: boolean
          p_items?: Json
          p_meal_name: string
          p_meal_type: string
          p_notes?: string
        }
        Returns: {
          item_ids: string[]
          meal_id: string
        }[]
      }
      deduct_gem: { Args: { p_user_id: string }; Returns: number }
      grant_daily_free_gem: { Args: { p_user_id: string }; Returns: number }
      increment_rate_limit: {
        Args: {
          p_function_name: string
          p_max_requests: number
          p_user_id: string
        }
        Returns: boolean
      }
      reward_ad_gem: { Args: { p_user_id: string }; Returns: Json }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
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
A new version of Supabase CLI is available: v2.90.0 (currently installed v2.62.5)
We recommend updating regularly for new features and bug fixes: https://supabase.com/docs/guides/cli/getting-started#updating-the-supabase-cli
