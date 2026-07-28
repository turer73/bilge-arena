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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      _backup_question_stats_20260712: {
        Row: {
          backed_up_at: string | null
          id: string | null
          times_answered: number | null
          times_correct: number | null
        }
        Insert: {
          backed_up_at?: string | null
          id?: string | null
          times_answered?: number | null
          times_correct?: number | null
        }
        Update: {
          backed_up_at?: string | null
          id?: string | null
          times_answered?: number | null
          times_correct?: number | null
        }
        Relationships: []
      }
      admin_logs: {
        Row: {
          action: string
          admin_id: string
          created_at: string | null
          details: Json | null
          id: string
          target_id: string | null
          target_type: string
        }
        Insert: {
          action: string
          admin_id: string
          created_at?: string | null
          details?: Json | null
          id?: string
          target_id?: string | null
          target_type: string
        }
        Update: {
          action?: string
          admin_id?: string
          created_at?: string | null
          details?: Json | null
          id?: string
          target_id?: string | null
          target_type?: string
        }
        Relationships: []
      }
      background_assets: {
        Row: {
          category: string
          coin_cost: number
          created_at: string
          description: string | null
          id: string
          is_published: boolean
          name: string
          poster_url: string | null
          rarity: string
          slug: string
          updated_at: string
          variants: Json
        }
        Insert: {
          category?: string
          coin_cost: number
          created_at?: string
          description?: string | null
          id?: string
          is_published?: boolean
          name: string
          poster_url?: string | null
          rarity?: string
          slug: string
          updated_at?: string
          variants?: Json
        }
        Update: {
          category?: string
          coin_cost?: number
          created_at?: string
          description?: string | null
          id?: string
          is_published?: boolean
          name?: string
          poster_url?: string | null
          rarity?: string
          slug?: string
          updated_at?: string
          variants?: Json
        }
        Relationships: []
      }
      badges: {
        Row: {
          category: string | null
          color: string | null
          condition: Json
          created_at: string | null
          description: string | null
          icon: string | null
          id: string
          is_active: boolean | null
          name: string
          rarity: string | null
          slug: string
          xp_reward: number | null
        }
        Insert: {
          category?: string | null
          color?: string | null
          condition: Json
          created_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          rarity?: string | null
          slug: string
          xp_reward?: number | null
        }
        Update: {
          category?: string | null
          color?: string | null
          condition?: Json
          created_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          rarity?: string | null
          slug?: string
          xp_reward?: number | null
        }
        Relationships: []
      }
      challenges: {
        Row: {
          category: string | null
          challenger_id: string
          challenger_score: Json | null
          created_at: string
          expires_at: string
          game: string
          id: string
          opponent_id: string
          opponent_score: Json | null
          question_ids: string[]
          status: string
          winner_id: string | null
          xp_reward: number
        }
        Insert: {
          category?: string | null
          challenger_id: string
          challenger_score?: Json | null
          created_at?: string
          expires_at?: string
          game: string
          id?: string
          opponent_id: string
          opponent_score?: Json | null
          question_ids: string[]
          status?: string
          winner_id?: string | null
          xp_reward?: number
        }
        Update: {
          category?: string | null
          challenger_id?: string
          challenger_score?: Json | null
          created_at?: string
          expires_at?: string
          game?: string
          id?: string
          opponent_id?: string
          opponent_score?: Json | null
          question_ids?: string[]
          status?: string
          winner_id?: string | null
          xp_reward?: number
        }
        Relationships: [
          {
            foreignKeyName: "challenges_challenger_id_fkey"
            columns: ["challenger_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "challenges_opponent_id_fkey"
            columns: ["opponent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "challenges_winner_id_fkey"
            columns: ["winner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      client_logs: {
        Row: {
          created_at: string
          id: string
          message: string
          meta: string | null
          type: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          meta?: string | null
          type?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          meta?: string | null
          type?: string
          user_id?: string | null
        }
        Relationships: []
      }
      comment_likes: {
        Row: {
          comment_id: string
          created_at: string | null
          id: string
          user_id: string
        }
        Insert: {
          comment_id: string
          created_at?: string | null
          id?: string
          user_id: string
        }
        Update: {
          comment_id?: string
          created_at?: string | null
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comment_likes_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
        ]
      }
      comments: {
        Row: {
          content: string
          created_at: string | null
          id: string
          is_deleted: boolean | null
          likes_count: number | null
          parent_id: string | null
          question_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          is_deleted?: boolean | null
          likes_count?: number | null
          parent_id?: string | null
          question_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          is_deleted?: boolean | null
          likes_count?: number | null
          parent_id?: string | null
          question_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      consent_logs: {
        Row: {
          consent_type: string
          consent_value: Json
          created_at: string
          id: string
          ip_address: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          consent_type: string
          consent_value: Json
          created_at?: string
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          consent_type?: string
          consent_value?: Json
          created_at?: string
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      cosmetic_badges: {
        Row: {
          category: string
          coin_cost: number
          created_at: string
          description: string | null
          icon_url: string | null
          id: string
          is_published: boolean
          name: string
          rarity: string
          slug: string
          updated_at: string
        }
        Insert: {
          category?: string
          coin_cost: number
          created_at?: string
          description?: string | null
          icon_url?: string | null
          id?: string
          is_published?: boolean
          name: string
          rarity?: string
          slug: string
          updated_at?: string
        }
        Update: {
          category?: string
          coin_cost?: number
          created_at?: string
          description?: string | null
          icon_url?: string | null
          id?: string
          is_published?: boolean
          name?: string
          rarity?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      curriculum_outcomes: {
        Row: {
          category: string
          code: string
          created_at: string
          description: string | null
          exam_ref: string | null
          game: string
          id: string
          is_active: boolean
          sort_order: number
          title: string
        }
        Insert: {
          category: string
          code: string
          created_at?: string
          description?: string | null
          exam_ref?: string | null
          game: string
          id?: string
          is_active?: boolean
          sort_order?: number
          title: string
        }
        Update: {
          category?: string
          code?: string
          created_at?: string
          description?: string | null
          exam_ref?: string | null
          game?: string
          id?: string
          is_active?: boolean
          sort_order?: number
          title?: string
        }
        Relationships: []
      }
      daily_plan: {
        Row: {
          completed_ids: string[]
          created_at: string
          exam_ref: string | null
          game: string
          id: string
          plan_date: string
          question_ids: string[]
          user_id: string
        }
        Insert: {
          completed_ids?: string[]
          created_at?: string
          exam_ref?: string | null
          game: string
          id?: string
          plan_date?: string
          question_ids: string[]
          user_id: string
        }
        Update: {
          completed_ids?: string[]
          created_at?: string
          exam_ref?: string | null
          game?: string
          id?: string
          plan_date?: string
          question_ids?: string[]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_plan_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_quests: {
        Row: {
          description: string | null
          icon: string | null
          id: string
          is_active: boolean | null
          quest_type: string | null
          slug: string
          target_game: string | null
          target_value: number
          title: string
          xp_reward: number | null
        }
        Insert: {
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          quest_type?: string | null
          slug: string
          target_game?: string | null
          target_value: number
          title: string
          xp_reward?: number | null
        }
        Update: {
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          quest_type?: string | null
          slug?: string
          target_game?: string | null
          target_value?: number
          title?: string
          xp_reward?: number | null
        }
        Relationships: []
      }
      disposable_email_domains: {
        Row: {
          added_at: string
          domain: string
          source: string | null
        }
        Insert: {
          added_at?: string
          domain: string
          source?: string | null
        }
        Update: {
          added_at?: string
          domain?: string
          source?: string | null
        }
        Relationships: []
      }
      error_reports: {
        Row: {
          admin_note: string | null
          created_at: string | null
          description: string | null
          id: string
          question_id: string
          report_type: Database["public"]["Enums"]["report_type"]
          resolved_by: string | null
          status: Database["public"]["Enums"]["report_status"] | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          admin_note?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          question_id: string
          report_type: Database["public"]["Enums"]["report_type"]
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["report_status"] | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          admin_note?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          question_id?: string
          report_type?: Database["public"]["Enums"]["report_type"]
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["report_status"] | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "error_reports_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      friendships: {
        Row: {
          created_at: string | null
          friend_id: string
          id: string
          status: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          friend_id: string
          id?: string
          status?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          friend_id?: string
          id?: string
          status?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "friendships_friend_id_fkey"
            columns: ["friend_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friendships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      game_sessions: {
        Row: {
          avg_time_sec: number | null
          base_xp: number | null
          bonus_xp: number | null
          client_request_id: string | null
          completed_at: string | null
          correct_count: number | null
          filter_category: string | null
          filter_difficulty: number | null
          game: string
          id: string
          mode: string | null
          skipped_count: number | null
          started_at: string | null
          status: string | null
          streak_at_start: number | null
          time_spent_sec: number | null
          total_questions: number | null
          total_xp: number | null
          user_id: string
          wrong_count: number | null
        }
        Insert: {
          avg_time_sec?: number | null
          base_xp?: number | null
          bonus_xp?: number | null
          client_request_id?: string | null
          completed_at?: string | null
          correct_count?: number | null
          filter_category?: string | null
          filter_difficulty?: number | null
          game: string
          id?: string
          mode?: string | null
          skipped_count?: number | null
          started_at?: string | null
          status?: string | null
          streak_at_start?: number | null
          time_spent_sec?: number | null
          total_questions?: number | null
          total_xp?: number | null
          user_id: string
          wrong_count?: number | null
        }
        Update: {
          avg_time_sec?: number | null
          base_xp?: number | null
          bonus_xp?: number | null
          client_request_id?: string | null
          completed_at?: string | null
          correct_count?: number | null
          filter_category?: string | null
          filter_difficulty?: number | null
          game?: string
          id?: string
          mode?: string | null
          skipped_count?: number | null
          started_at?: string | null
          status?: string | null
          streak_at_start?: number | null
          time_spent_sec?: number | null
          total_questions?: number | null
          total_xp?: number | null
          user_id?: string
          wrong_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "game_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      homepage_elements: {
        Row: {
          alignment: string
          alt_text: string
          content: string | null
          created_at: string
          created_by: string | null
          element_type: string
          id: string
          image_url: string | null
          is_published: boolean
          placement: string
          section_key: string
          size: string
          sort_order: number
          styles: Json
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          alignment?: string
          alt_text?: string
          content?: string | null
          created_at?: string
          created_by?: string | null
          element_type: string
          id?: string
          image_url?: string | null
          is_published?: boolean
          placement?: string
          section_key: string
          size?: string
          sort_order?: number
          styles?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          alignment?: string
          alt_text?: string
          content?: string | null
          created_at?: string
          created_by?: string | null
          element_type?: string
          id?: string
          image_url?: string | null
          is_published?: boolean
          placement?: string
          section_key?: string
          size?: string
          sort_order?: number
          styles?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      homepage_sections: {
        Row: {
          config: Json
          created_at: string
          id: string
          is_published: boolean
          section_key: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          config?: Json
          created_at?: string
          id?: string
          is_published?: boolean
          section_key: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          config?: Json
          created_at?: string
          id?: string
          is_published?: boolean
          section_key?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      leaderboard_weekly: {
        Row: {
          accuracy_pct: number | null
          correct_answers: number | null
          id: string
          rank: number | null
          sessions_played: number | null
          user_id: string
          week_end: string
          week_start: string
          xp_earned: number | null
        }
        Insert: {
          accuracy_pct?: number | null
          correct_answers?: number | null
          id?: string
          rank?: number | null
          sessions_played?: number | null
          user_id: string
          week_end: string
          week_start: string
          xp_earned?: number | null
        }
        Update: {
          accuracy_pct?: number | null
          correct_answers?: number | null
          id?: string
          rank?: number | null
          sessions_played?: number | null
          user_id?: string
          week_end?: string
          week_start?: string
          xp_earned?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "leaderboard_weekly_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      multiplayer_room_stats_log: {
        Row: {
          first_place: boolean
          id: string
          room_id: string
          synced_at: string
          user_id: string
        }
        Insert: {
          first_place?: boolean
          id?: string
          room_id: string
          synced_at?: string
          user_id: string
        }
        Update: {
          first_place?: boolean
          id?: string
          room_id?: string
          synced_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "multiplayer_room_stats_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          is_read: boolean
          link: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          link?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          link?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      premium_waitlist: {
        Row: {
          contacted_at: string | null
          created_at: string
          email: string
          id: string
          ip_address: string | null
          kvkk_consent_at: string
          plan: string
          source: string | null
          user_agent: string | null
        }
        Insert: {
          contacted_at?: string | null
          created_at?: string
          email: string
          id?: string
          ip_address?: string | null
          kvkk_consent_at: string
          plan: string
          source?: string | null
          user_agent?: string | null
        }
        Update: {
          contacted_at?: string | null
          created_at?: string
          email?: string
          id?: string
          ip_address?: string | null
          kvkk_consent_at?: string
          plan?: string
          source?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          city: string | null
          coin_balance: number
          correct_answers: number | null
          created_at: string | null
          current_streak: number | null
          deleted_at: string | null
          display_name: string | null
          exam_type: string | null
          grade: number | null
          id: string
          is_discoverable: boolean
          is_premium: boolean | null
          last_played_at: string | null
          level: number | null
          level_name: string | null
          longest_streak: number | null
          multiplayer_firsts: number
          multiplayer_wins: number
          notifications: boolean | null
          onboarding_completed: boolean | null
          owned_avatar_decorations: string[]
          owned_backgrounds: string[]
          owned_cosmetic_badges: string[]
          owned_frames: string[]
          owned_nameplates: string[]
          preferred_theme: string | null
          premium_until: string | null
          referral_code: string | null
          referred_by: string | null
          role: string | null
          rooms_completed: number
          selected_avatar_decorations: string[]
          selected_nameplate: string
          total_questions: number | null
          total_sessions: number | null
          total_xp: number | null
          updated_at: string | null
          username: string
        }
        Insert: {
          avatar_url?: string | null
          city?: string | null
          coin_balance?: number
          correct_answers?: number | null
          created_at?: string | null
          current_streak?: number | null
          deleted_at?: string | null
          display_name?: string | null
          exam_type?: string | null
          grade?: number | null
          id: string
          is_discoverable?: boolean
          is_premium?: boolean | null
          last_played_at?: string | null
          level?: number | null
          level_name?: string | null
          longest_streak?: number | null
          multiplayer_firsts?: number
          multiplayer_wins?: number
          notifications?: boolean | null
          onboarding_completed?: boolean | null
          owned_avatar_decorations?: string[]
          owned_backgrounds?: string[]
          owned_cosmetic_badges?: string[]
          owned_frames?: string[]
          owned_nameplates?: string[]
          preferred_theme?: string | null
          premium_until?: string | null
          referral_code?: string | null
          referred_by?: string | null
          role?: string | null
          rooms_completed?: number
          selected_avatar_decorations?: string[]
          selected_nameplate?: string
          total_questions?: number | null
          total_sessions?: number | null
          total_xp?: number | null
          updated_at?: string | null
          username: string
        }
        Update: {
          avatar_url?: string | null
          city?: string | null
          coin_balance?: number
          correct_answers?: number | null
          created_at?: string | null
          current_streak?: number | null
          deleted_at?: string | null
          display_name?: string | null
          exam_type?: string | null
          grade?: number | null
          id?: string
          is_discoverable?: boolean
          is_premium?: boolean | null
          last_played_at?: string | null
          level?: number | null
          level_name?: string | null
          longest_streak?: number | null
          multiplayer_firsts?: number
          multiplayer_wins?: number
          notifications?: boolean | null
          onboarding_completed?: boolean | null
          owned_avatar_decorations?: string[]
          owned_backgrounds?: string[]
          owned_cosmetic_badges?: string[]
          owned_frames?: string[]
          owned_nameplates?: string[]
          preferred_theme?: string | null
          premium_until?: string | null
          referral_code?: string | null
          referred_by?: string | null
          role?: string | null
          rooms_completed?: number
          selected_avatar_decorations?: string[]
          selected_nameplate?: string
          total_questions?: number | null
          total_sessions?: number | null
          total_xp?: number | null
          updated_at?: string | null
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_referred_by_fkey"
            columns: ["referred_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string | null
          endpoint: string
          id: string
          p256dh: string
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string | null
          endpoint: string
          id?: string
          p256dh: string
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string | null
          endpoint?: string
          id?: string
          p256dh?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      question_likes: {
        Row: {
          created_at: string | null
          id: string
          question_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          question_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          question_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "question_likes_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      question_outcomes: {
        Row: {
          created_at: string
          is_primary: boolean
          outcome_id: string
          question_id: string
          weight: number
        }
        Insert: {
          created_at?: string
          is_primary?: boolean
          outcome_id: string
          question_id: string
          weight?: number
        }
        Update: {
          created_at?: string
          is_primary?: boolean
          outcome_id?: string
          question_id?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "question_outcomes_outcome_id_fkey"
            columns: ["outcome_id"]
            isOneToOne: false
            referencedRelation: "curriculum_outcomes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_outcomes_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      question_submissions: {
        Row: {
          category: string
          content: Json
          created_at: string
          difficulty: number
          game: string
          id: string
          question_id: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          user_id: string
        }
        Insert: {
          category: string
          content: Json
          created_at?: string
          difficulty: number
          game: string
          id?: string
          question_id?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          user_id: string
        }
        Update: {
          category?: string
          content?: Json
          created_at?: string
          difficulty?: number
          game?: string
          id?: string
          question_id?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "question_submissions_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_submissions_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_submissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      questions: {
        Row: {
          base_points: number | null
          category: string
          content: Json
          created_at: string | null
          difficulty: number | null
          exam_ref: string | null
          external_id: string | null
          game: string
          id: string
          is_active: boolean | null
          is_boss: boolean | null
          level_tag: string | null
          source: string | null
          subcategory: string | null
          times_answered: number | null
          times_correct: number | null
          topic: string | null
          updated_at: string | null
        }
        Insert: {
          base_points?: number | null
          category: string
          content: Json
          created_at?: string | null
          difficulty?: number | null
          exam_ref?: string | null
          external_id?: string | null
          game: string
          id?: string
          is_active?: boolean | null
          is_boss?: boolean | null
          level_tag?: string | null
          source?: string | null
          subcategory?: string | null
          times_answered?: number | null
          times_correct?: number | null
          topic?: string | null
          updated_at?: string | null
        }
        Update: {
          base_points?: number | null
          category?: string
          content?: Json
          created_at?: string | null
          difficulty?: number | null
          exam_ref?: string | null
          external_id?: string | null
          game?: string
          id?: string
          is_active?: boolean | null
          is_boss?: boolean | null
          level_tag?: string | null
          source?: string | null
          subcategory?: string | null
          times_answered?: number | null
          times_correct?: number | null
          topic?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      referral_rewards: {
        Row: {
          created_at: string | null
          id: string
          referred_id: string
          referrer_id: string
          xp_awarded: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          referred_id: string
          referrer_id: string
          xp_awarded?: number
        }
        Update: {
          created_at?: string | null
          id?: string
          referred_id?: string
          referrer_id?: string
          xp_awarded?: number
        }
        Relationships: [
          {
            foreignKeyName: "referral_rewards_referred_id_fkey"
            columns: ["referred_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_rewards_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          created_at: string
          id: string
          permission: string
          role_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          permission: string
          role_id: string
        }
        Update: {
          created_at?: string
          id?: string
          permission?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_system: boolean
          name: string
          slug: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_system?: boolean
          name: string
          slug: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_system?: boolean
          name?: string
          slug?: string
        }
        Relationships: []
      }
      session_answers: {
        Row: {
          answered_at: string | null
          id: string
          is_correct: boolean
          is_fast: boolean | null
          is_skipped: boolean | null
          question_id: string
          question_order: number | null
          selected_option: number | null
          session_id: string
          time_taken_sec: number | null
          user_id: string
          xp_earned: number | null
        }
        Insert: {
          answered_at?: string | null
          id?: string
          is_correct: boolean
          is_fast?: boolean | null
          is_skipped?: boolean | null
          question_id: string
          question_order?: number | null
          selected_option?: number | null
          session_id: string
          time_taken_sec?: number | null
          user_id: string
          xp_earned?: number | null
        }
        Update: {
          answered_at?: string | null
          id?: string
          is_correct?: boolean
          is_fast?: boolean | null
          is_skipped?: boolean | null
          question_id?: string
          question_order?: number | null
          selected_option?: number | null
          session_id?: string
          time_taken_sec?: number | null
          user_id?: string
          xp_earned?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "session_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_answers_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "game_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_answers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      site_settings: {
        Row: {
          key: string
          updated_at: string | null
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string | null
          updated_by?: string | null
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string | null
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      user_achievements: {
        Row: {
          achievement_id: string
          earned_at: string
          id: string
          user_id: string
        }
        Insert: {
          achievement_id: string
          earned_at?: string
          id?: string
          user_id: string
        }
        Update: {
          achievement_id?: string
          earned_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_achievements_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_badges: {
        Row: {
          badge_id: string
          earned_at: string | null
          id: string
          user_id: string
        }
        Insert: {
          badge_id: string
          earned_at?: string | null
          id?: string
          user_id: string
        }
        Update: {
          badge_id?: string
          earned_at?: string | null
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_badges_badge_id_fkey"
            columns: ["badge_id"]
            isOneToOne: false
            referencedRelation: "badges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_badges_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_daily_quests: {
        Row: {
          completed_at: string | null
          current_value: number | null
          date: string
          id: string
          is_completed: boolean | null
          quest_id: string
          user_id: string
          xp_claimed: boolean | null
        }
        Insert: {
          completed_at?: string | null
          current_value?: number | null
          date?: string
          id?: string
          is_completed?: boolean | null
          quest_id: string
          user_id: string
          xp_claimed?: boolean | null
        }
        Update: {
          completed_at?: string | null
          current_value?: number | null
          date?: string
          id?: string
          is_completed?: boolean | null
          quest_id?: string
          user_id?: string
          xp_claimed?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "user_daily_quests_quest_id_fkey"
            columns: ["quest_id"]
            isOneToOne: false
            referencedRelation: "daily_quests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_daily_quests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_outcome_state: {
        Row: {
          attempts: number
          correct_attempts: number
          delayed_correct: number
          last_answered_at: string | null
          outcome_id: string
          updated_at: string
          user_id: string
          weighted_earned: number
          weighted_possible: number
        }
        Insert: {
          attempts?: number
          correct_attempts?: number
          delayed_correct?: number
          last_answered_at?: string | null
          outcome_id: string
          updated_at?: string
          user_id: string
          weighted_earned?: number
          weighted_possible?: number
        }
        Update: {
          attempts?: number
          correct_attempts?: number
          delayed_correct?: number
          last_answered_at?: string | null
          outcome_id?: string
          updated_at?: string
          user_id?: string
          weighted_earned?: number
          weighted_possible?: number
        }
        Relationships: [
          {
            foreignKeyName: "user_outcome_state_outcome_id_fkey"
            columns: ["outcome_id"]
            isOneToOne: false
            referencedRelation: "curriculum_outcomes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_outcome_state_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_question_history: {
        Row: {
          last_seen_at: string | null
          question_id: string
          times_correct: number | null
          times_seen: number | null
          user_id: string
        }
        Insert: {
          last_seen_at?: string | null
          question_id: string
          times_correct?: number | null
          times_seen?: number | null
          user_id: string
        }
        Update: {
          last_seen_at?: string | null
          question_id?: string
          times_correct?: number | null
          times_seen?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_question_history_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_question_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_reports: {
        Row: {
          admin_note: string | null
          created_at: string | null
          id: string
          reason: string | null
          report_type: Database["public"]["Enums"]["user_report_type"]
          reported_user_id: string
          reporter_id: string
          resolved_by: string | null
          status: Database["public"]["Enums"]["report_status"] | null
          updated_at: string | null
        }
        Insert: {
          admin_note?: string | null
          created_at?: string | null
          id?: string
          reason?: string | null
          report_type: Database["public"]["Enums"]["user_report_type"]
          reported_user_id: string
          reporter_id: string
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["report_status"] | null
          updated_at?: string | null
        }
        Update: {
          admin_note?: string | null
          created_at?: string | null
          id?: string
          reason?: string | null
          report_type?: Database["public"]["Enums"]["user_report_type"]
          reported_user_id?: string
          reporter_id?: string
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["report_status"] | null
          updated_at?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          assigned_by: string | null
          created_at: string
          id: string
          role_id: string
          user_id: string
        }
        Insert: {
          assigned_by?: string | null
          created_at?: string
          id?: string
          role_id: string
          user_id: string
        }
        Update: {
          assigned_by?: string | null
          created_at?: string
          id?: string
          role_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_topic_progress: {
        Row: {
          accuracy_pct: number | null
          category: string
          correct: number | null
          game: string
          id: string
          last_seen_at: string | null
          mastery_level: number | null
          questions_seen: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          accuracy_pct?: number | null
          category: string
          correct?: number | null
          game: string
          id?: string
          last_seen_at?: string | null
          mastery_level?: number | null
          questions_seen?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          accuracy_pct?: number | null
          category?: string
          correct?: number | null
          game?: string
          id?: string
          last_seen_at?: string | null
          mastery_level?: number | null
          questions_seen?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_topic_progress_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      xp_log: {
        Row: {
          amount: number
          created_at: string | null
          id: string
          reason: string
          reference_id: string | null
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string | null
          id?: string
          reason: string
          reference_id?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string | null
          id?: string
          reason?: string
          reference_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "xp_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      leaderboard_weekly_ranked: {
        Row: {
          accuracy_pct: number | null
          avatar_url: string | null
          correct_answers: number | null
          current_rank: number | null
          current_streak: number | null
          display_name: string | null
          id: string | null
          level_name: string | null
          rank: number | null
          sessions_played: number | null
          user_id: string | null
          username: string | null
          week_end: string | null
          week_start: string | null
          xp_earned: number | null
        }
        Relationships: [
          {
            foreignKeyName: "leaderboard_weekly_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      award_badges: {
        Args: { p_badge_codes: string[]; p_user_id: string }
        Returns: {
          awarded_codes: string[]
          total_xp_earned: number
        }[]
      }
      batch_increment_question_stats: {
        Args: { correct_flags: boolean[]; q_ids: string[] }
        Returns: undefined
      }
      block_user: { Args: { p_target: string }; Returns: undefined }
      check_honeypot_integrity: {
        Args: never
        Returns: {
          drift_detected: boolean
          honeypot_exists: boolean
          honeypot_last_played_at: string
          honeypot_username: string
          honeypot_xp: number
          message: string
        }[]
      }
      complete_game_session: {
        Args: {
          p_answers: Json
          p_avg_time_sec: number
          p_base_xp: number
          p_bonus_xp: number
          p_category: string
          p_client_request_id: string
          p_correct_count: number
          p_filter_difficulty: number
          p_game: string
          p_mode: string
          p_time_spent_sec: number
          p_total_xp: number
          p_user_id: string
          p_wrong_count: number
        }
        Returns: Json
      }
      get_public_profile: {
        Args: { p_username: string }
        Returns: {
          avatar_url: string
          correct_answers: number
          created_at: string
          current_streak: number
          id: string
          level: number
          level_name: string
          longest_streak: number
          selected_avatar_decorations: string[]
          selected_nameplate: string
          total_questions: number
          total_xp: number
          username: string
        }[]
      }
      grant_multiplayer_stats: {
        Args: { p_first_place: boolean; p_room_id: string; p_user_id: string }
        Returns: Json
      }
      hard_delete_expired_users: { Args: never; Returns: number }
      has_any_role: { Args: { p_user_id: string }; Returns: boolean }
      has_permission: {
        Args: { p_permission: string; p_user_id: string }
        Returns: boolean
      }
      immutable_unaccent: { Args: { "": string }; Returns: string }
      increment_coins: {
        Args: { p_amount: number; p_user_id: string }
        Returns: undefined
      }
      increment_question_stats: {
        Args: { answered_inc?: number; correct_inc?: number; q_id: string }
        Returns: undefined
      }
      increment_xp: {
        Args: {
          p_amount: number
          p_reason?: string
          p_reference_id?: string
          p_user_id: string
        }
        Returns: undefined
      }
      is_disposable_email: { Args: { p_email: string }; Returns: boolean }
      purchase_avatar_decoration: {
        Args: { p_cost: number; p_decoration_id: string; p_user_id: string }
        Returns: {
          new_balance: number
          new_owned: string[]
        }[]
      }
      purchase_background: {
        Args: { p_background_id: string; p_cost: number; p_user_id: string }
        Returns: {
          new_balance: number
          new_owned: string[]
        }[]
      }
      purchase_cosmetic_badge: {
        Args: { p_badge_id: string; p_cost: number; p_user_id: string }
        Returns: {
          new_balance: number
          new_owned: string[]
        }[]
      }
      purchase_frame: {
        Args: { p_cost: number; p_frame_id: string; p_user_id: string }
        Returns: {
          new_balance: number
          new_owned: string[]
        }[]
      }
      purchase_nameplate: {
        Args: { p_cost: number; p_nameplate_id: string; p_user_id: string }
        Returns: {
          new_balance: number
          new_owned: string[]
        }[]
      }
      question_content_basic_guard: {
        Args: { p_content: Json; p_game: string }
        Returns: boolean
      }
      search_profiles: {
        Args: { exclude_id?: string; q: string; result_limit?: number }
        Returns: {
          avatar_url: string
          display_name: string
          id: string
          total_xp: number
          username: string
        }[]
      }
      search_profiles_admin: {
        Args: { q?: string; result_limit?: number; result_offset?: number }
        Returns: {
          avatar_url: string
          correct_answers: number
          created_at: string
          current_streak: number
          deleted_at: string
          display_name: string
          id: string
          level: number
          role: string
          total_count: number
          total_questions: number
          total_xp: number
          username: string
        }[]
      }
      search_questions: {
        Args: {
          active_filter?: boolean
          admin_view?: boolean
          category_filter?: string
          difficulty_filter?: number
          game_filter?: string
          result_limit?: number
          result_offset?: number
          search_q?: string
        }
        Returns: {
          category: string
          content: Json
          created_at: string
          difficulty: number
          exam_ref: string
          external_id: string
          game: string
          id: string
          is_active: boolean
          is_boss: boolean
          level_tag: string
          source: string
          subcategory: string
          times_answered: number
          times_correct: number
          topic: string
          total_count: number
        }[]
      }
      select_random_questions: {
        Args: {
          p_category?: string
          p_difficulty?: number
          p_exam_ref?: string
          p_exclude_ids?: string[]
          p_game: string
          p_limit?: number
        }
        Returns: {
          base_points: number | null
          category: string
          content: Json
          created_at: string | null
          difficulty: number | null
          exam_ref: string | null
          external_id: string | null
          game: string
          id: string
          is_active: boolean | null
          is_boss: boolean | null
          level_tag: string | null
          source: string | null
          subcategory: string | null
          times_answered: number | null
          times_correct: number | null
          topic: string | null
          updated_at: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "questions"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      soft_delete_user: { Args: { p_user_id: string }; Returns: undefined }
      spend_coins: {
        Args: { p_amount: number; p_user_id: string }
        Returns: undefined
      }
      submit_challenge_answer: {
        Args: { p_challenge_id: string; p_score: Json; p_user_id: string }
        Returns: Json
      }
      unaccent: { Args: { "": string }; Returns: string }
      update_streak: { Args: { p_user_id: string }; Returns: undefined }
    }
    Enums: {
      report_status: "pending" | "reviewed" | "resolved" | "rejected"
      report_type:
        | "wrong_answer"
        | "typo"
        | "unclear"
        | "duplicate"
        | "offensive"
        | "other"
      user_report_type:
        | "harassment"
        | "inappropriate"
        | "impersonation"
        | "spam"
        | "other"
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
      report_status: ["pending", "reviewed", "resolved", "rejected"],
      report_type: [
        "wrong_answer",
        "typo",
        "unclear",
        "duplicate",
        "offensive",
        "other",
      ],
      user_report_type: [
        "harassment",
        "inappropriate",
        "impersonation",
        "spam",
        "other",
      ],
    },
  },
} as const
