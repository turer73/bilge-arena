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
      _backup_questions_taxonomy_109_20260810: {
        Row: {
          backed_up_at: string
          change_scope: string
          id: string
          new_category: string | null
          new_exam_ref: string | null
          new_published_revision_id: string | null
          old_category: string | null
          old_exam_ref: string | null
          old_published_revision_id: string | null
        }
        Insert: {
          backed_up_at?: string
          change_scope: string
          id: string
          new_category?: string | null
          new_exam_ref?: string | null
          new_published_revision_id?: string | null
          old_category?: string | null
          old_exam_ref?: string | null
          old_published_revision_id?: string | null
        }
        Update: {
          backed_up_at?: string
          change_scope?: string
          id?: string
          new_category?: string | null
          new_exam_ref?: string | null
          new_published_revision_id?: string | null
          old_category?: string | null
          old_exam_ref?: string | null
          old_published_revision_id?: string | null
        }
        Relationships: []
      }
      _backup_questions_taxonomy_20260810: {
        Row: {
          backed_up_at: string
          id: string
          old_category: string | null
          old_exam_ref: string | null
        }
        Insert: {
          backed_up_at?: string
          id: string
          old_category?: string | null
          old_exam_ref?: string | null
        }
        Update: {
          backed_up_at?: string
          id?: string
          old_category?: string | null
          old_exam_ref?: string | null
        }
        Relationships: []
      }
      activation_reward_claims: {
        Row: {
          created_at: string
          id: string
          user_id: string
          xp_amount: number
        }
        Insert: {
          created_at?: string
          id: string
          user_id: string
          xp_amount: number
        }
        Update: {
          created_at?: string
          id?: string
          user_id?: string
          xp_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "activation_reward_claims_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      adaptive_diagnostic_answers: {
        Row: {
          covered_outcomes_after: number
          created_at: string
          difficulty: number
          id: string
          is_correct: boolean
          next_question_id: string | null
          outcome_id: string
          question_id: string
          request_id: string
          response_time_ms: number
          sequence: number
          session_id: string
          status_after: string
          user_id: string
        }
        Insert: {
          covered_outcomes_after: number
          created_at?: string
          difficulty: number
          id?: string
          is_correct: boolean
          next_question_id?: string | null
          outcome_id: string
          question_id: string
          request_id: string
          response_time_ms: number
          sequence: number
          session_id: string
          status_after: string
          user_id: string
        }
        Update: {
          covered_outcomes_after?: number
          created_at?: string
          difficulty?: number
          id?: string
          is_correct?: boolean
          next_question_id?: string | null
          outcome_id?: string
          question_id?: string
          request_id?: string
          response_time_ms?: number
          sequence?: number
          session_id?: string
          status_after?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "adaptive_diagnostic_answers_next_question_id_fkey"
            columns: ["next_question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "adaptive_diagnostic_answers_outcome_id_fkey"
            columns: ["outcome_id"]
            isOneToOne: false
            referencedRelation: "curriculum_outcomes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "adaptive_diagnostic_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "adaptive_diagnostic_answers_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "adaptive_diagnostic_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "adaptive_diagnostic_answers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      adaptive_diagnostic_sessions: {
        Row: {
          answered_count: number
          completed_at: string | null
          covered_outcomes: number
          created_at: string
          current_question_id: string | null
          exam_ref: string
          expires_at: string
          game: string
          id: string
          kind: string
          started_at: string
          status: string
          taxonomy_version: string
          updated_at: string
          user_id: string
        }
        Insert: {
          answered_count?: number
          completed_at?: string | null
          covered_outcomes?: number
          created_at?: string
          current_question_id?: string | null
          exam_ref: string
          expires_at: string
          game: string
          id: string
          kind: string
          started_at?: string
          status: string
          taxonomy_version: string
          updated_at?: string
          user_id: string
        }
        Update: {
          answered_count?: number
          completed_at?: string | null
          covered_outcomes?: number
          created_at?: string
          current_question_id?: string | null
          exam_ref?: string
          expires_at?: string
          game?: string
          id?: string
          kind?: string
          started_at?: string
          status?: string
          taxonomy_version?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "adaptive_diagnostic_sessions_current_question_id_fkey"
            columns: ["current_question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "adaptive_diagnostic_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
      content_governance_requests: {
        Row: {
          created_at: string
          operation: string
          payload_hash: string
          request_id: string
          result: Json
          user_id: string
        }
        Insert: {
          created_at?: string
          operation: string
          payload_hash: string
          request_id: string
          result: Json
          user_id: string
        }
        Update: {
          created_at?: string
          operation?: string
          payload_hash?: string
          request_id?: string
          result?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_governance_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      content_governance_runtime: {
        Row: {
          enforce_direct_mutation: boolean
          singleton: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          enforce_direct_mutation?: boolean
          singleton?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          enforce_direct_mutation?: boolean
          singleton?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_governance_runtime_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      controlled_experiment_assignments: {
        Row: {
          bucket: number
          created_at: string
          experiment_id: string
          id: string
          user_id: string
          variant: string
        }
        Insert: {
          bucket: number
          created_at?: string
          experiment_id: string
          id?: string
          user_id: string
          variant: string
        }
        Update: {
          bucket?: number
          created_at?: string
          experiment_id?: string
          id?: string
          user_id?: string
          variant?: string
        }
        Relationships: [
          {
            foreignKeyName: "controlled_experiment_assignments_experiment_id_fkey"
            columns: ["experiment_id"]
            isOneToOne: false
            referencedRelation: "controlled_experiments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "controlled_experiment_assignments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      controlled_experiment_exposures: {
        Row: {
          assignment_id: string
          attempt_id: string
          exposed_at: string
          id: string
          request_id: string
          session_id: string
        }
        Insert: {
          assignment_id: string
          attempt_id: string
          exposed_at?: string
          id?: string
          request_id: string
          session_id: string
        }
        Update: {
          assignment_id?: string
          attempt_id?: string
          exposed_at?: string
          id?: string
          request_id?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "controlled_experiment_exposures_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "controlled_experiment_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "controlled_experiment_exposures_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "verified_exam_attempts"
            referencedColumns: ["attempt_id"]
          },
          {
            foreignKeyName: "controlled_experiment_exposures_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "game_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      controlled_experiments: {
        Row: {
          activated_at: string | null
          allocation_bps: number
          allocation_salt: string
          created_at: string
          experiment_key: string
          game: string
          id: string
          mode: string
          revision: number
          status: string
        }
        Insert: {
          activated_at?: string | null
          allocation_bps?: number
          allocation_salt: string
          created_at?: string
          experiment_key: string
          game: string
          id?: string
          mode: string
          revision: number
          status?: string
        }
        Update: {
          activated_at?: string | null
          allocation_bps?: number
          allocation_salt?: string
          created_at?: string
          experiment_key?: string
          game?: string
          id?: string
          mode?: string
          revision?: number
          status?: string
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
      curriculum_nodes: {
        Row: {
          category: string | null
          code: string
          created_at: string
          exam_ref: string | null
          game: string
          id: string
          is_active: boolean
          node_type: string
          parent_id: string | null
          sort_order: number
          taxonomy_version: string
          title: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          code: string
          created_at?: string
          exam_ref?: string | null
          game: string
          id?: string
          is_active?: boolean
          node_type: string
          parent_id?: string | null
          sort_order?: number
          taxonomy_version: string
          title: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          code?: string
          created_at?: string
          exam_ref?: string | null
          game?: string
          id?: string
          is_active?: boolean
          node_type?: string
          parent_id?: string | null
          sort_order?: number
          taxonomy_version?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "curriculum_nodes_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "curriculum_nodes"
            referencedColumns: ["id"]
          },
        ]
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
          node_id: string | null
          sort_order: number
          taxonomy_version: string | null
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
          node_id?: string | null
          sort_order?: number
          taxonomy_version?: string | null
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
          node_id?: string | null
          sort_order?: number
          taxonomy_version?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "curriculum_outcomes_node_id_fkey"
            columns: ["node_id"]
            isOneToOne: false
            referencedRelation: "curriculum_nodes"
            referencedColumns: ["id"]
          },
        ]
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
      daily_plan_items: {
        Row: {
          completed_at: string | null
          created_at: string
          plan_id: string
          position: number
          question_id: string
          slot_type: string
          source_ref: string | null
          source_type: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          plan_id: string
          position: number
          question_id: string
          slot_type: string
          source_ref?: string | null
          source_type: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          plan_id?: string
          position?: number
          question_id?: string
          slot_type?: string
          source_ref?: string | null
          source_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_plan_items_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "daily_plan"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_plan_items_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
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
      mastery_materialized_attempts: {
        Row: {
          attempt_id: string
          materialized_at: string
        }
        Insert: {
          attempt_id: string
          materialized_at?: string
        }
        Update: {
          attempt_id?: string
          materialized_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mastery_materialized_attempts_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: true
            referencedRelation: "verified_attempts"
            referencedColumns: ["id"]
          },
        ]
      }
      mastery_outcome_evidence: {
        Row: {
          answer_id: string
          attempt_id: string
          base_already_recorded: boolean
          created_at: string
          delayed_correct: boolean
          difficulty: number
          difficulty_weighted_earned: number
          difficulty_weighted_possible: number
          fast_wrong: boolean
          is_correct: boolean
          mapping_weight: number
          max_hint_stage: number
          outcome_id: string
          question_id: string
          session_id: string
          time_taken_sec: number | null
          user_id: string
        }
        Insert: {
          answer_id: string
          attempt_id: string
          base_already_recorded: boolean
          created_at?: string
          delayed_correct?: boolean
          difficulty: number
          difficulty_weighted_earned: number
          difficulty_weighted_possible: number
          fast_wrong?: boolean
          is_correct: boolean
          mapping_weight: number
          max_hint_stage?: number
          outcome_id: string
          question_id: string
          session_id: string
          time_taken_sec?: number | null
          user_id: string
        }
        Update: {
          answer_id?: string
          attempt_id?: string
          base_already_recorded?: boolean
          created_at?: string
          delayed_correct?: boolean
          difficulty?: number
          difficulty_weighted_earned?: number
          difficulty_weighted_possible?: number
          fast_wrong?: boolean
          is_correct?: boolean
          mapping_weight?: number
          max_hint_stage?: number
          outcome_id?: string
          question_id?: string
          session_id?: string
          time_taken_sec?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mastery_outcome_evidence_answer_id_fkey"
            columns: ["answer_id"]
            isOneToOne: false
            referencedRelation: "session_answers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mastery_outcome_evidence_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "verified_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mastery_outcome_evidence_outcome_id_fkey"
            columns: ["outcome_id"]
            isOneToOne: false
            referencedRelation: "curriculum_outcomes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mastery_outcome_evidence_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mastery_outcome_evidence_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "game_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mastery_outcome_evidence_user_id_fkey"
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
      paper_outcome_evidence: {
        Row: {
          created_at: string
          is_correct: boolean
          mapping_weight: number
          mastery_delta: number
          outcome_id: string
          pack_id: string
          position: number
          user_id: string
        }
        Insert: {
          created_at?: string
          is_correct: boolean
          mapping_weight: number
          mastery_delta: number
          outcome_id: string
          pack_id: string
          position: number
          user_id: string
        }
        Update: {
          created_at?: string
          is_correct?: boolean
          mapping_weight?: number
          mastery_delta?: number
          outcome_id?: string
          pack_id?: string
          position?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "paper_outcome_evidence_pack_id_fkey"
            columns: ["pack_id"]
            isOneToOne: false
            referencedRelation: "paper_study_packs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paper_outcome_evidence_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      paper_study_pack_item_outcomes: {
        Row: {
          mapping_weight: number
          outcome_id: string
          pack_id: string
          position: number
        }
        Insert: {
          mapping_weight: number
          outcome_id: string
          pack_id: string
          position: number
        }
        Update: {
          mapping_weight?: number
          outcome_id?: string
          pack_id?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "paper_study_pack_item_outcomes_outcome_id_fkey"
            columns: ["outcome_id"]
            isOneToOne: false
            referencedRelation: "curriculum_outcomes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paper_study_pack_item_outcomes_pack_id_position_fkey"
            columns: ["pack_id", "position"]
            isOneToOne: false
            referencedRelation: "paper_study_pack_items"
            referencedColumns: ["pack_id", "position"]
          },
        ]
      }
      paper_study_pack_items: {
        Row: {
          category: string | null
          content: Json
          correct_option: number
          difficulty: number
          game: string
          is_correct: boolean | null
          pack_id: string
          position: number
          question_id: string
          selected_option: number | null
          topic: string | null
        }
        Insert: {
          category?: string | null
          content: Json
          correct_option: number
          difficulty: number
          game: string
          is_correct?: boolean | null
          pack_id: string
          position: number
          question_id: string
          selected_option?: number | null
          topic?: string | null
        }
        Update: {
          category?: string | null
          content?: Json
          correct_option?: number
          difficulty?: number
          game?: string
          is_correct?: boolean | null
          pack_id?: string
          position?: number
          question_id?: string
          selected_option?: number | null
          topic?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "paper_study_pack_items_pack_id_fkey"
            columns: ["pack_id"]
            isOneToOne: false
            referencedRelation: "paper_study_packs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paper_study_pack_items_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      paper_study_pack_submission_requests: {
        Row: {
          created_at: string
          pack_id: string
          payload_hash: string
          request_id: string
          result: Json
          user_id: string
        }
        Insert: {
          created_at?: string
          pack_id: string
          payload_hash: string
          request_id: string
          result: Json
          user_id: string
        }
        Update: {
          created_at?: string
          pack_id?: string
          payload_hash?: string
          request_id?: string
          result?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "paper_study_pack_submission_requests_pack_id_fkey"
            columns: ["pack_id"]
            isOneToOne: false
            referencedRelation: "paper_study_packs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paper_study_pack_submission_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      paper_study_packs: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          issue_request_id: string
          plan_id: string
          status: string
          submit_result: Json | null
          submitted_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          issue_request_id: string
          plan_id: string
          status?: string
          submit_result?: Json | null
          submitted_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          issue_request_id?: string
          plan_id?: string
          status?: string
          submit_result?: Json | null
          submitted_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "paper_study_packs_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "daily_plan"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paper_study_packs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pilot_institution_memberships: {
        Row: {
          assigned_by: string
          ended_at: string | null
          id: string
          institution_id: string
          joined_at: string
          member_ref: string
          role: string
          status: string
          user_id: string
        }
        Insert: {
          assigned_by: string
          ended_at?: string | null
          id?: string
          institution_id: string
          joined_at?: string
          member_ref?: string
          role: string
          status?: string
          user_id: string
        }
        Update: {
          assigned_by?: string
          ended_at?: string | null
          id?: string
          institution_id?: string
          joined_at?: string
          member_ref?: string
          role?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pilot_institution_memberships_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pilot_institution_memberships_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "pilot_institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pilot_institution_memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pilot_institution_requests: {
        Row: {
          created_at: string
          operation: string
          payload_hash: string
          request_id: string
          result: Json
          user_id: string
        }
        Insert: {
          created_at?: string
          operation: string
          payload_hash: string
          request_id: string
          result: Json
          user_id: string
        }
        Update: {
          created_at?: string
          operation?: string
          payload_hash?: string
          request_id?: string
          result?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pilot_institution_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pilot_institutions: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string
          id: string
          name: string
          staff_limit: number
          status: string
          student_limit: number
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by: string
          id?: string
          name: string
          staff_limit?: number
          status?: string
          student_limit?: number
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string
          id?: string
          name?: string
          staff_limit?: number
          status?: string
          student_limit?: number
        }
        Relationships: [
          {
            foreignKeyName: "pilot_institutions_created_by_fkey"
            columns: ["created_by"]
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
      question_appeal_events: {
        Row: {
          actor_id: string | null
          appeal_id: string
          created_at: string
          event_type: string
          id: string
          internal_note: string | null
          public_message: string | null
        }
        Insert: {
          actor_id?: string | null
          appeal_id: string
          created_at?: string
          event_type: string
          id?: string
          internal_note?: string | null
          public_message?: string | null
        }
        Update: {
          actor_id?: string | null
          appeal_id?: string
          created_at?: string
          event_type?: string
          id?: string
          internal_note?: string | null
          public_message?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "question_appeal_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_appeal_events_appeal_id_fkey"
            columns: ["appeal_id"]
            isOneToOne: false
            referencedRelation: "question_appeals"
            referencedColumns: ["id"]
          },
        ]
      }
      question_appeals: {
        Row: {
          ack_due_at: string
          acknowledged_at: string | null
          description: string
          id: string
          legacy_error_report_id: string | null
          question_id: string
          reason_code: string
          resolve_due_at: string
          resolved_at: string | null
          revision_id: string | null
          session_answer_id: string | null
          sla_breached_at: string | null
          status: string
          submitted_at: string
          user_id: string
        }
        Insert: {
          ack_due_at?: string
          acknowledged_at?: string | null
          description: string
          id?: string
          legacy_error_report_id?: string | null
          question_id: string
          reason_code: string
          resolve_due_at?: string
          resolved_at?: string | null
          revision_id?: string | null
          session_answer_id?: string | null
          sla_breached_at?: string | null
          status?: string
          submitted_at?: string
          user_id: string
        }
        Update: {
          ack_due_at?: string
          acknowledged_at?: string | null
          description?: string
          id?: string
          legacy_error_report_id?: string | null
          question_id?: string
          reason_code?: string
          resolve_due_at?: string
          resolved_at?: string | null
          revision_id?: string | null
          session_answer_id?: string | null
          sla_breached_at?: string | null
          status?: string
          submitted_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "question_appeals_legacy_error_report_id_fkey"
            columns: ["legacy_error_report_id"]
            isOneToOne: true
            referencedRelation: "error_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_appeals_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_appeals_revision_id_fkey"
            columns: ["revision_id"]
            isOneToOne: false
            referencedRelation: "question_content_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_appeals_session_answer_id_fkey"
            columns: ["session_answer_id"]
            isOneToOne: false
            referencedRelation: "session_answers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_appeals_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      question_content_revisions: {
        Row: {
          base_revision_id: string | null
          category: string
          change_kind: string
          change_summary: string
          content: Json
          content_sha256: string
          difficulty: number
          exam_ref: string | null
          game: string
          id: string
          is_boss: boolean
          level_tag: string | null
          prepared_at: string
          prepared_by: string | null
          published_at: string | null
          question_id: string
          revision_no: number
          status: string
          subcategory: string | null
          topic: string | null
        }
        Insert: {
          base_revision_id?: string | null
          category: string
          change_kind: string
          change_summary: string
          content: Json
          content_sha256: string
          difficulty: number
          exam_ref?: string | null
          game: string
          id?: string
          is_boss?: boolean
          level_tag?: string | null
          prepared_at?: string
          prepared_by?: string | null
          published_at?: string | null
          question_id: string
          revision_no: number
          status?: string
          subcategory?: string | null
          topic?: string | null
        }
        Update: {
          base_revision_id?: string | null
          category?: string
          change_kind?: string
          change_summary?: string
          content?: Json
          content_sha256?: string
          difficulty?: number
          exam_ref?: string | null
          game?: string
          id?: string
          is_boss?: boolean
          level_tag?: string | null
          prepared_at?: string
          prepared_by?: string | null
          published_at?: string | null
          question_id?: string
          revision_no?: number
          status?: string
          subcategory?: string | null
          topic?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "question_content_revisions_base_revision_id_fkey"
            columns: ["base_revision_id"]
            isOneToOne: false
            referencedRelation: "question_content_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_content_revisions_prepared_by_fkey"
            columns: ["prepared_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_content_revisions_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      question_error_incidents: {
        Row: {
          changed_count: number
          closed_at: string | null
          corrected_revision_id: string
          created_at: string
          created_by: string
          eligible_count: number
          erroneous_revision_id: string
          error_type: string
          id: string
          manual_required_count: number
          question_id: string
          status: string
        }
        Insert: {
          changed_count?: number
          closed_at?: string | null
          corrected_revision_id: string
          created_at?: string
          created_by: string
          eligible_count?: number
          erroneous_revision_id: string
          error_type: string
          id?: string
          manual_required_count?: number
          question_id: string
          status?: string
        }
        Update: {
          changed_count?: number
          closed_at?: string | null
          corrected_revision_id?: string
          created_at?: string
          created_by?: string
          eligible_count?: number
          erroneous_revision_id?: string
          error_type?: string
          id?: string
          manual_required_count?: number
          question_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "question_error_incidents_corrected_revision_id_fkey"
            columns: ["corrected_revision_id"]
            isOneToOne: false
            referencedRelation: "question_content_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_error_incidents_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_error_incidents_erroneous_revision_id_fkey"
            columns: ["erroneous_revision_id"]
            isOneToOne: false
            referencedRelation: "question_content_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_error_incidents_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      question_governance_events: {
        Row: {
          actor_id: string | null
          created_at: string
          event_type: string
          id: string
          private_note: string | null
          public_reason: string | null
          question_id: string
          revision_id: string | null
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          private_note?: string | null
          public_reason?: string | null
          question_id: string
          revision_id?: string | null
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          private_note?: string | null
          public_reason?: string | null
          question_id?: string
          revision_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "question_governance_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_governance_events_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_governance_events_revision_id_fkey"
            columns: ["revision_id"]
            isOneToOne: false
            referencedRelation: "question_content_revisions"
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
          mapping_source: string
          outcome_id: string
          question_id: string
          weight: number
        }
        Insert: {
          created_at?: string
          is_primary?: boolean
          mapping_source?: string
          outcome_id: string
          question_id: string
          weight?: number
        }
        Update: {
          created_at?: string
          is_primary?: boolean
          mapping_source?: string
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
      question_result_corrections: {
        Row: {
          applied_at: string
          corrected_revision_id: string
          id: string
          incident_id: string
          new_is_correct: boolean
          old_is_correct: boolean
          presented_revision_id: string
          score_delta: number
          session_answer_id: string
          user_id: string
        }
        Insert: {
          applied_at?: string
          corrected_revision_id: string
          id?: string
          incident_id: string
          new_is_correct: boolean
          old_is_correct: boolean
          presented_revision_id: string
          score_delta: number
          session_answer_id: string
          user_id: string
        }
        Update: {
          applied_at?: string
          corrected_revision_id?: string
          id?: string
          incident_id?: string
          new_is_correct?: boolean
          old_is_correct?: boolean
          presented_revision_id?: string
          score_delta?: number
          session_answer_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "question_result_corrections_corrected_revision_id_fkey"
            columns: ["corrected_revision_id"]
            isOneToOne: false
            referencedRelation: "question_content_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_result_corrections_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "question_error_incidents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_result_corrections_presented_revision_id_fkey"
            columns: ["presented_revision_id"]
            isOneToOne: false
            referencedRelation: "question_content_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_result_corrections_session_answer_id_fkey"
            columns: ["session_answer_id"]
            isOneToOne: false
            referencedRelation: "session_answers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_result_corrections_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      question_revision_approvals: {
        Row: {
          decided_at: string
          decision: string
          rationale: string
          reviewer_id: string
          revision_id: string
          stage: number
        }
        Insert: {
          decided_at?: string
          decision: string
          rationale: string
          reviewer_id: string
          revision_id: string
          stage: number
        }
        Update: {
          decided_at?: string
          decision?: string
          rationale?: string
          reviewer_id?: string
          revision_id?: string
          stage?: number
        }
        Relationships: [
          {
            foreignKeyName: "question_revision_approvals_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_revision_approvals_revision_id_fkey"
            columns: ["revision_id"]
            isOneToOne: false
            referencedRelation: "question_content_revisions"
            referencedColumns: ["id"]
          },
        ]
      }
      question_revision_outcomes: {
        Row: {
          is_primary: boolean
          outcome_id: string
          revision_id: string
          weight: number
        }
        Insert: {
          is_primary?: boolean
          outcome_id: string
          revision_id: string
          weight: number
        }
        Update: {
          is_primary?: boolean
          outcome_id?: string
          revision_id?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "question_revision_outcomes_outcome_id_fkey"
            columns: ["outcome_id"]
            isOneToOne: false
            referencedRelation: "curriculum_outcomes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_revision_outcomes_revision_id_fkey"
            columns: ["revision_id"]
            isOneToOne: false
            referencedRelation: "question_content_revisions"
            referencedColumns: ["id"]
          },
        ]
      }
      question_revision_psychometrics: {
        Row: {
          correct_n: number
          discrimination: number | null
          materialization_hash: string
          materialized_at: string
          p_correct: number | null
          revision_id: string
          sample_n: number
          wilson_high: number | null
          wilson_low: number | null
          window_end: string
          window_start: string
        }
        Insert: {
          correct_n: number
          discrimination?: number | null
          materialization_hash: string
          materialized_at?: string
          p_correct?: number | null
          revision_id: string
          sample_n: number
          wilson_high?: number | null
          wilson_low?: number | null
          window_end: string
          window_start: string
        }
        Update: {
          correct_n?: number
          discrimination?: number | null
          materialization_hash?: string
          materialized_at?: string
          p_correct?: number | null
          revision_id?: string
          sample_n?: number
          wilson_high?: number | null
          wilson_low?: number | null
          window_end?: string
          window_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "question_revision_psychometrics_revision_id_fkey"
            columns: ["revision_id"]
            isOneToOne: false
            referencedRelation: "question_content_revisions"
            referencedColumns: ["id"]
          },
        ]
      }
      question_revision_sources: {
        Row: {
          attribution: string | null
          created_at: string
          license_code: string
          license_url: string | null
          provenance_ref: string | null
          revision_id: string
          source_kind: string
          source_title: string
          source_url: string | null
        }
        Insert: {
          attribution?: string | null
          created_at?: string
          license_code: string
          license_url?: string | null
          provenance_ref?: string | null
          revision_id: string
          source_kind: string
          source_title: string
          source_url?: string | null
        }
        Update: {
          attribution?: string | null
          created_at?: string
          license_code?: string
          license_url?: string | null
          provenance_ref?: string | null
          revision_id?: string
          source_kind?: string
          source_title?: string
          source_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "question_revision_sources_revision_id_fkey"
            columns: ["revision_id"]
            isOneToOne: true
            referencedRelation: "question_content_revisions"
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
          published_revision_id: string | null
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
          published_revision_id?: string | null
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
          published_revision_id?: string | null
          source?: string | null
          subcategory?: string | null
          times_answered?: number | null
          times_correct?: number | null
          topic?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "questions_published_revision_id_fkey"
            columns: ["published_revision_id"]
            isOneToOne: false
            referencedRelation: "question_content_revisions"
            referencedColumns: ["id"]
          },
        ]
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
      review_cards: {
        Row: {
          created_at: string
          difficulty: number
          due_at: string
          elapsed_days: number
          lapses: number
          last_answer_id: string | null
          last_review_at: string | null
          learning_steps: number
          question_id: string
          reps: number
          revision: number
          scheduled_days: number
          stability: number
          state: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          difficulty?: number
          due_at: string
          elapsed_days?: number
          lapses?: number
          last_answer_id?: string | null
          last_review_at?: string | null
          learning_steps?: number
          question_id: string
          reps?: number
          revision?: number
          scheduled_days?: number
          stability?: number
          state?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          difficulty?: number
          due_at?: string
          elapsed_days?: number
          lapses?: number
          last_answer_id?: string | null
          last_review_at?: string | null
          learning_steps?: number
          question_id?: string
          reps?: number
          revision?: number
          scheduled_days?: number
          stability?: number
          state?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_cards_last_answer_id_fkey"
            columns: ["last_answer_id"]
            isOneToOne: false
            referencedRelation: "session_answers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_cards_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_cards_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      review_error_annotations: {
        Row: {
          created_at: string
          reason_code: string
          review_log_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          reason_code: string
          review_log_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          reason_code?: string
          review_log_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_error_annotations_log_owner_fkey"
            columns: ["review_log_id", "user_id"]
            isOneToOne: false
            referencedRelation: "review_logs"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "review_error_annotations_reason_code_fkey"
            columns: ["reason_code"]
            isOneToOne: false
            referencedRelation: "review_error_reasons"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "review_error_annotations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      review_error_reasons: {
        Row: {
          code: string
          is_active: boolean
          label_tr: string
          sort_order: number
        }
        Insert: {
          code: string
          is_active?: boolean
          label_tr: string
          sort_order: number
        }
        Update: {
          code?: string
          is_active?: boolean
          label_tr?: string
          sort_order?: number
        }
        Relationships: []
      }
      review_logs: {
        Row: {
          answer_id: string
          created_at: string
          id: string
          question_id: string
          rating: number
          reviewed_at: string
          session_id: string
          user_id: string
        }
        Insert: {
          answer_id: string
          created_at?: string
          id?: string
          question_id: string
          rating: number
          reviewed_at: string
          session_id: string
          user_id: string
        }
        Update: {
          answer_id?: string
          created_at?: string
          id?: string
          question_id?: string
          rating?: number
          reviewed_at?: string
          session_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_logs_answer_id_fkey"
            columns: ["answer_id"]
            isOneToOne: true
            referencedRelation: "session_answers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_logs_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_logs_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "game_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reward_ledger: {
        Row: {
          amount: number
          created_at: string
          id: string
          metadata: Json
          reward_key: string
          reward_type: string
          source_id: string
          source_type: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          metadata?: Json
          reward_key: string
          reward_type: string
          source_id: string
          source_type: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          metadata?: Json
          reward_key?: string
          reward_type?: string
          source_id?: string
          source_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reward_ledger_user_id_fkey"
            columns: ["user_id"]
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
          question_revision_id: string | null
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
          question_revision_id?: string | null
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
          question_revision_id?: string | null
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
            foreignKeyName: "session_answers_question_revision_id_fkey"
            columns: ["question_revision_id"]
            isOneToOne: false
            referencedRelation: "question_content_revisions"
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
      teacher_assignment_items: {
        Row: {
          assignment_id: string
          category: string | null
          content: Json
          correct_option: number
          difficulty: number
          game: string
          position: number
          question_id: string
          topic: string | null
        }
        Insert: {
          assignment_id: string
          category?: string | null
          content: Json
          correct_option: number
          difficulty: number
          game: string
          position: number
          question_id: string
          topic?: string | null
        }
        Update: {
          assignment_id?: string
          category?: string | null
          content?: Json
          correct_option?: number
          difficulty?: number
          game?: string
          position?: number
          question_id?: string
          topic?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "teacher_assignment_items_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "teacher_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teacher_assignment_items_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      teacher_assignment_recipients: {
        Row: {
          assigned_at: string
          assignment_id: string
          classroom_id: string
          membership_id: string
          student_id: string
        }
        Insert: {
          assigned_at?: string
          assignment_id: string
          classroom_id: string
          membership_id: string
          student_id: string
        }
        Update: {
          assigned_at?: string
          assignment_id?: string
          classroom_id?: string
          membership_id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "teacher_assignment_recipients_assignment_id_classroom_id_fkey"
            columns: ["assignment_id", "classroom_id"]
            isOneToOne: false
            referencedRelation: "teacher_assignments"
            referencedColumns: ["id", "classroom_id"]
          },
          {
            foreignKeyName: "teacher_assignment_recipients_membership_id_student_id_cla_fkey"
            columns: ["membership_id", "student_id", "classroom_id"]
            isOneToOne: false
            referencedRelation: "teacher_classroom_memberships"
            referencedColumns: ["id", "student_id", "classroom_id"]
          },
        ]
      }
      teacher_assignment_submission_items: {
        Row: {
          assignment_id: string
          is_correct: boolean | null
          position: number
          selected_option: number | null
          submission_id: string
        }
        Insert: {
          assignment_id: string
          is_correct?: boolean | null
          position: number
          selected_option?: number | null
          submission_id: string
        }
        Update: {
          assignment_id?: string
          is_correct?: boolean | null
          position?: number
          selected_option?: number | null
          submission_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "teacher_assignment_submission__submission_id_assignment_id_fkey"
            columns: ["submission_id", "assignment_id"]
            isOneToOne: false
            referencedRelation: "teacher_assignment_submissions"
            referencedColumns: ["id", "assignment_id"]
          },
          {
            foreignKeyName: "teacher_assignment_submission_items_assignment_id_position_fkey"
            columns: ["assignment_id", "position"]
            isOneToOne: false
            referencedRelation: "teacher_assignment_items"
            referencedColumns: ["assignment_id", "position"]
          },
        ]
      }
      teacher_assignment_submissions: {
        Row: {
          answered_count: number
          assignment_id: string
          correct_count: number
          id: string
          recipient_membership_id: string
          student_id: string
          submitted_at: string
        }
        Insert: {
          answered_count: number
          assignment_id: string
          correct_count: number
          id?: string
          recipient_membership_id: string
          student_id: string
          submitted_at?: string
        }
        Update: {
          answered_count?: number
          assignment_id?: string
          correct_count?: number
          id?: string
          recipient_membership_id?: string
          student_id?: string
          submitted_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "teacher_assignment_submission_assignment_id_recipient_memb_fkey"
            columns: ["assignment_id", "recipient_membership_id", "student_id"]
            isOneToOne: false
            referencedRelation: "teacher_assignment_recipients"
            referencedColumns: ["assignment_id", "membership_id", "student_id"]
          },
        ]
      }
      teacher_assignments: {
        Row: {
          available_at: string
          classroom_id: string
          created_at: string
          due_at: string
          id: string
          item_count: number
          status: string
          teacher_id: string
          title: string
        }
        Insert: {
          available_at: string
          classroom_id: string
          created_at?: string
          due_at: string
          id?: string
          item_count: number
          status?: string
          teacher_id: string
          title: string
        }
        Update: {
          available_at?: string
          classroom_id?: string
          created_at?: string
          due_at?: string
          id?: string
          item_count?: number
          status?: string
          teacher_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "teacher_assignments_classroom_id_fkey"
            columns: ["classroom_id"]
            isOneToOne: false
            referencedRelation: "teacher_classrooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teacher_assignments_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      teacher_classroom_invites: {
        Row: {
          classroom_id: string
          created_at: string
          expires_at: string
          id: string
          invite_ref: string
          issuer_id: string
          max_uses: number
          revoked_at: string | null
          token_digest: string
          used_count: number
        }
        Insert: {
          classroom_id: string
          created_at?: string
          expires_at: string
          id?: string
          invite_ref?: string
          issuer_id: string
          max_uses: number
          revoked_at?: string | null
          token_digest: string
          used_count?: number
        }
        Update: {
          classroom_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          invite_ref?: string
          issuer_id?: string
          max_uses?: number
          revoked_at?: string | null
          token_digest?: string
          used_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "teacher_classroom_invites_classroom_id_fkey"
            columns: ["classroom_id"]
            isOneToOne: false
            referencedRelation: "teacher_classrooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teacher_classroom_invites_issuer_id_fkey"
            columns: ["issuer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      teacher_classroom_memberships: {
        Row: {
          accepted_at: string
          classroom_id: string
          ended_at: string | null
          id: string
          member_ref: string
          status: string
          student_id: string
        }
        Insert: {
          accepted_at?: string
          classroom_id: string
          ended_at?: string | null
          id?: string
          member_ref?: string
          status?: string
          student_id: string
        }
        Update: {
          accepted_at?: string
          classroom_id?: string
          ended_at?: string | null
          id?: string
          member_ref?: string
          status?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "teacher_classroom_memberships_classroom_id_fkey"
            columns: ["classroom_id"]
            isOneToOne: false
            referencedRelation: "teacher_classrooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teacher_classroom_memberships_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      teacher_classroom_privacy_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          membership_id: string
          student_id: string
          version: string | null
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          membership_id: string
          student_id: string
          version?: string | null
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          membership_id?: string
          student_id?: string
          version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "teacher_classroom_privacy_events_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "teacher_classroom_memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teacher_classroom_privacy_events_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      teacher_classroom_requests: {
        Row: {
          created_at: string
          operation: string
          payload_hash: string
          request_id: string
          result: Json
          user_id: string
        }
        Insert: {
          created_at?: string
          operation: string
          payload_hash: string
          request_id: string
          result: Json
          user_id: string
        }
        Update: {
          created_at?: string
          operation?: string
          payload_hash?: string
          request_id?: string
          result?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "teacher_classroom_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      teacher_classrooms: {
        Row: {
          archived_at: string | null
          created_at: string
          id: string
          institution_id: string
          name: string
          status: string
          teacher_id: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          id?: string
          institution_id: string
          name: string
          status?: string
          teacher_id: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          id?: string
          institution_id?: string
          name?: string
          status?: string
          teacher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "teacher_classrooms_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "pilot_institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teacher_classrooms_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_achievements: {
        Row: {
          achievement_id: string
          earned_at: string
          id: string
          source_session_id: string | null
          user_id: string
        }
        Insert: {
          achievement_id: string
          earned_at?: string
          id?: string
          source_session_id?: string | null
          user_id: string
        }
        Update: {
          achievement_id?: string
          earned_at?: string
          id?: string
          source_session_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_achievements_source_session_id_fkey"
            columns: ["source_session_id"]
            isOneToOne: false
            referencedRelation: "game_sessions"
            referencedColumns: ["id"]
          },
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
      user_diagnostic_outcome_state: {
        Row: {
          attempts: number
          completed_session_id: string
          correct_attempts: number
          difficulty_weighted_earned: number
          difficulty_weighted_possible: number
          last_diagnosed_at: string
          outcome_id: string
          recommended_difficulty: number
          score: number
          updated_at: string
          user_id: string
        }
        Insert: {
          attempts: number
          completed_session_id: string
          correct_attempts: number
          difficulty_weighted_earned: number
          difficulty_weighted_possible: number
          last_diagnosed_at: string
          outcome_id: string
          recommended_difficulty: number
          score: number
          updated_at?: string
          user_id: string
        }
        Update: {
          attempts?: number
          completed_session_id?: string
          correct_attempts?: number
          difficulty_weighted_earned?: number
          difficulty_weighted_possible?: number
          last_diagnosed_at?: string
          outcome_id?: string
          recommended_difficulty?: number
          score?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_diagnostic_outcome_state_completed_session_id_fkey"
            columns: ["completed_session_id"]
            isOneToOne: false
            referencedRelation: "adaptive_diagnostic_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_diagnostic_outcome_state_outcome_id_fkey"
            columns: ["outcome_id"]
            isOneToOne: false
            referencedRelation: "curriculum_outcomes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_diagnostic_outcome_state_user_id_fkey"
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
          careless_annotations: number
          correct_attempts: number
          delayed_correct: number
          difficulty_weighted_earned: number
          difficulty_weighted_possible: number
          fast_wrong: number
          guess_annotations: number
          hint_stage_sum: number
          hinted_attempts: number
          last_answered_at: string | null
          outcome_id: string
          timed_attempts: number
          total_time_sec: number
          updated_at: string
          user_id: string
          v2_attempts: number
          weighted_earned: number
          weighted_possible: number
        }
        Insert: {
          attempts?: number
          careless_annotations?: number
          correct_attempts?: number
          delayed_correct?: number
          difficulty_weighted_earned?: number
          difficulty_weighted_possible?: number
          fast_wrong?: number
          guess_annotations?: number
          hint_stage_sum?: number
          hinted_attempts?: number
          last_answered_at?: string | null
          outcome_id: string
          timed_attempts?: number
          total_time_sec?: number
          updated_at?: string
          user_id: string
          v2_attempts?: number
          weighted_earned?: number
          weighted_possible?: number
        }
        Update: {
          attempts?: number
          careless_annotations?: number
          correct_attempts?: number
          delayed_correct?: number
          difficulty_weighted_earned?: number
          difficulty_weighted_possible?: number
          fast_wrong?: number
          guess_annotations?: number
          hint_stage_sum?: number
          hinted_attempts?: number
          last_answered_at?: string | null
          outcome_id?: string
          timed_attempts?: number
          total_time_sec?: number
          updated_at?: string
          user_id?: string
          v2_attempts?: number
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
      verified_attempt_hint_events: {
        Row: {
          attempt_id: string
          created_at: string
          question_id: string
          stage: number
          user_id: string
        }
        Insert: {
          attempt_id: string
          created_at?: string
          question_id: string
          stage: number
          user_id: string
        }
        Update: {
          attempt_id?: string
          created_at?: string
          question_id?: string
          stage?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "verified_attempt_hint_events_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "verified_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verified_attempt_hint_events_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verified_attempt_hint_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      verified_attempt_question_revisions: {
        Row: {
          attempt_id: string
          base_points: number
          category: string | null
          content: Json
          content_sha256: string
          correct_option: number
          difficulty: number
          exam_ref: string | null
          game: string
          level_tag: string | null
          position: number
          question_id: string
          revision_id: string
          subcategory: string | null
          topic: string | null
        }
        Insert: {
          attempt_id: string
          base_points: number
          category?: string | null
          content: Json
          content_sha256: string
          correct_option: number
          difficulty: number
          exam_ref?: string | null
          game: string
          level_tag?: string | null
          position: number
          question_id: string
          revision_id: string
          subcategory?: string | null
          topic?: string | null
        }
        Update: {
          attempt_id?: string
          base_points?: number
          category?: string | null
          content?: Json
          content_sha256?: string
          correct_option?: number
          difficulty?: number
          exam_ref?: string | null
          game?: string
          level_tag?: string | null
          position?: number
          question_id?: string
          revision_id?: string
          subcategory?: string | null
          topic?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "verified_attempt_question_revisions_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "verified_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verified_attempt_question_revisions_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verified_attempt_question_revisions_revision_id_fkey"
            columns: ["revision_id"]
            isOneToOne: false
            referencedRelation: "question_content_revisions"
            referencedColumns: ["id"]
          },
        ]
      }
      verified_attempts: {
        Row: {
          completed_at: string | null
          created_at: string
          duration_sec: number
          expires_at: string
          game: string
          id: string
          mode: string
          question_ids: string[]
          session_id: string | null
          started_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          duration_sec: number
          expires_at: string
          game: string
          id?: string
          mode: string
          question_ids: string[]
          session_id?: string | null
          started_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          duration_sec?: number
          expires_at?: string
          game?: string
          id?: string
          mode?: string
          question_ids?: string[]
          session_id?: string | null
          started_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "verified_attempts_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: true
            referencedRelation: "game_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verified_attempts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      verified_coach_sessions: {
        Row: {
          attempt_id: string
          created_at: string
          expires_at: string
          id: string
          initial_selected_option: number
          question_id: string
          stage: number
          transfer_completed_at: string | null
          transfer_is_correct: boolean | null
          transfer_question_id: string | null
          transfer_request_id: string | null
          transfer_selected_option: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          attempt_id: string
          created_at?: string
          expires_at: string
          id?: string
          initial_selected_option: number
          question_id: string
          stage?: number
          transfer_completed_at?: string | null
          transfer_is_correct?: boolean | null
          transfer_question_id?: string | null
          transfer_request_id?: string | null
          transfer_selected_option?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          attempt_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          initial_selected_option?: number
          question_id?: string
          stage?: number
          transfer_completed_at?: string | null
          transfer_is_correct?: boolean | null
          transfer_question_id?: string | null
          transfer_request_id?: string | null
          transfer_selected_option?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "verified_coach_sessions_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "verified_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verified_coach_sessions_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verified_coach_sessions_transfer_question_id_fkey"
            columns: ["transfer_question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verified_coach_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      verified_coach_stage_events: {
        Row: {
          content_sha256: string
          created_at: string
          evaluation_passed: boolean
          id: string
          policy_version: string
          request_id: string
          response_text: string | null
          session_id: string
          source: string
          stage: number
        }
        Insert: {
          content_sha256: string
          created_at?: string
          evaluation_passed: boolean
          id?: string
          policy_version: string
          request_id: string
          response_text?: string | null
          session_id: string
          source: string
          stage: number
        }
        Update: {
          content_sha256?: string
          created_at?: string
          evaluation_passed?: boolean
          id?: string
          policy_version?: string
          request_id?: string
          response_text?: string | null
          session_id?: string
          source?: string
          stage?: number
        }
        Relationships: [
          {
            foreignKeyName: "verified_coach_stage_events_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "verified_coach_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      verified_exam_attempt_items: {
        Row: {
          attempt_id: string
          created_at: string
          position: number
          question_id: string
          source_bucket: string
        }
        Insert: {
          attempt_id: string
          created_at?: string
          position: number
          question_id: string
          source_bucket: string
        }
        Update: {
          attempt_id?: string
          created_at?: string
          position?: number
          question_id?: string
          source_bucket?: string
        }
        Relationships: [
          {
            foreignKeyName: "verified_exam_attempt_items_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "verified_exam_attempts"
            referencedColumns: ["attempt_id"]
          },
          {
            foreignKeyName: "verified_exam_attempt_items_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      verified_exam_attempts: {
        Row: {
          attempt_id: string
          blueprint_version: string
          completed_at: string | null
          deadline_at: string | null
          exam_ref: string | null
          experiment_assignment_id: string | null
          finalize_request_id: string | null
          game: string
          issue_request_id: string
          issued_at: string
          planned_duration_sec: number
          question_set_hash: string
          session_id: string | null
          start_request_id: string | null
          started_at: string | null
          status: string
          user_id: string
        }
        Insert: {
          attempt_id: string
          blueprint_version: string
          completed_at?: string | null
          deadline_at?: string | null
          exam_ref?: string | null
          experiment_assignment_id?: string | null
          finalize_request_id?: string | null
          game: string
          issue_request_id: string
          issued_at?: string
          planned_duration_sec: number
          question_set_hash: string
          session_id?: string | null
          start_request_id?: string | null
          started_at?: string | null
          status?: string
          user_id: string
        }
        Update: {
          attempt_id?: string
          blueprint_version?: string
          completed_at?: string | null
          deadline_at?: string | null
          exam_ref?: string | null
          experiment_assignment_id?: string | null
          finalize_request_id?: string | null
          game?: string
          issue_request_id?: string
          issued_at?: string
          planned_duration_sec?: number
          question_set_hash?: string
          session_id?: string | null
          start_request_id?: string | null
          started_at?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "verified_exam_attempts_assignment_fk"
            columns: ["experiment_assignment_id"]
            isOneToOne: false
            referencedRelation: "controlled_experiment_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verified_exam_attempts_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: true
            referencedRelation: "verified_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verified_exam_attempts_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "game_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verified_exam_attempts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      verified_exam_strategy_events: {
        Row: {
          attempt_id: string
          client_event_id: string
          event_type: string
          id: string
          position: number | null
          sequence: number
          server_received_at: string
        }
        Insert: {
          attempt_id: string
          client_event_id: string
          event_type: string
          id?: string
          position?: number | null
          sequence: number
          server_received_at?: string
        }
        Update: {
          attempt_id?: string
          client_event_id?: string
          event_type?: string
          id?: string
          position?: number | null
          sequence?: number
          server_received_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "verified_exam_strategy_events_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "verified_exam_attempts"
            referencedColumns: ["attempt_id"]
          },
        ]
      }
      weekly_learning_league_cohorts: {
        Row: {
          cohort_number: number
          created_at: string
          exam_type: string
          finalized_at: string | null
          id: string
          status: string
          tier: string
          week_start: string
        }
        Insert: {
          cohort_number: number
          created_at?: string
          exam_type: string
          finalized_at?: string | null
          id?: string
          status?: string
          tier: string
          week_start: string
        }
        Update: {
          cohort_number?: number
          created_at?: string
          exam_type?: string
          finalized_at?: string | null
          id?: string
          status?: string
          tier?: string
          week_start?: string
        }
        Relationships: []
      }
      weekly_learning_league_contributions: {
        Row: {
          cohort_id: string
          contributed_at: string
          created_at: string
          membership_id: string
          points: number
          session_id: string
          user_id: string
        }
        Insert: {
          cohort_id: string
          contributed_at: string
          created_at?: string
          membership_id: string
          points: number
          session_id: string
          user_id: string
        }
        Update: {
          cohort_id?: string
          contributed_at?: string
          created_at?: string
          membership_id?: string
          points?: number
          session_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "weekly_learning_league_contributions_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "weekly_learning_league_cohorts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_learning_league_contributions_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "weekly_learning_league_memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_learning_league_contributions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: true
            referencedRelation: "game_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_learning_league_contributions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_learning_league_formation_requests: {
        Row: {
          created_at: string
          request_id: string
          result: Json
          week_start: string
        }
        Insert: {
          created_at?: string
          request_id: string
          result: Json
          week_start: string
        }
        Update: {
          created_at?: string
          request_id?: string
          result?: Json
          week_start?: string
        }
        Relationships: []
      }
      weekly_learning_league_memberships: {
        Row: {
          active_days: number
          cohort_id: string | null
          created_at: string
          final_rank: number | null
          final_zone: string | null
          id: string
          last_contribution_at: string | null
          points: number
          status: string
          user_id: string
          week_start: string
        }
        Insert: {
          active_days?: number
          cohort_id?: string | null
          created_at?: string
          final_rank?: number | null
          final_zone?: string | null
          id?: string
          last_contribution_at?: string | null
          points?: number
          status: string
          user_id: string
          week_start: string
        }
        Update: {
          active_days?: number
          cohort_id?: string | null
          created_at?: string
          final_rank?: number | null
          final_zone?: string | null
          id?: string
          last_contribution_at?: string | null
          points?: number
          status?: string
          user_id?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "weekly_learning_league_memberships_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "weekly_learning_league_cohorts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_learning_league_memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_learning_league_preference_requests: {
        Row: {
          created_at: string
          effective_week_start: string
          opted_in: boolean
          request_id: string
          result: Json
          user_id: string
        }
        Insert: {
          created_at?: string
          effective_week_start: string
          opted_in: boolean
          request_id: string
          result: Json
          user_id: string
        }
        Update: {
          created_at?: string
          effective_week_start?: string
          opted_in?: boolean
          request_id?: string
          result?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "weekly_learning_league_preference_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_learning_league_preferences: {
        Row: {
          effective_week_start: string | null
          opted_in: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          effective_week_start?: string | null
          opted_in?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          effective_week_start?: string | null
          opted_in?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "weekly_learning_league_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_learning_league_tiers: {
        Row: {
          tier: string
          updated_at: string
          user_id: string
        }
        Insert: {
          tier?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          tier?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "weekly_learning_league_tiers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
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
      accept_teacher_classroom_invite: {
        Args: {
          p_consent_version: string
          p_notice_version: string
          p_request_id: string
          p_token_digest: string
          p_user_id: string
        }
        Returns: Json
      }
      add_pilot_institution_teacher: {
        Args: {
          p_institution_id: string
          p_request_id: string
          p_teacher_user_id: string
          p_user_id: string
        }
        Returns: Json
      }
      advance_verified_coach_stage: {
        Args: {
          p_content_sha256: string
          p_evaluation_passed: boolean
          p_policy_version: string
          p_request_id: string
          p_response_text: string
          p_session_id: string
          p_source: string
          p_stage: number
          p_user_id: string
        }
        Returns: Json
      }
      answer_verified_coach_transfer: {
        Args: {
          p_request_id: string
          p_selected_option: number
          p_session_id: string
          p_user_id: string
        }
        Returns: Json
      }
      apply_question_result_corrections: {
        Args: { p_incident_id: string; p_request_id: string; p_user_id: string }
        Returns: Json
      }
      apply_review_answer: { Args: { p_answer_id: string }; Returns: undefined }
      apply_verified_session_rewards: {
        Args: { p_attempt_id: string; p_session_id: string }
        Returns: undefined
      }
      award_badges: {
        Args: { p_badge_codes: string[]; p_user_id: string }
        Returns: {
          awarded_codes: string[]
          total_xp_earned: number
        }[]
      }
      backfill_review_cards: {
        Args: {
          p_batch_size?: number
          p_cursor_at?: string
          p_cursor_id?: string
        }
        Returns: Json
      }
      backfill_verified_attempt_mastery: {
        Args: { p_limit: number }
        Returns: Json
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
      claim_activation_reward: {
        Args: { p_amount: number; p_claim_id: string; p_user_id: string }
        Returns: Json
      }
      claim_daily_quest_reward: {
        Args: { p_user_id: string; p_user_quest_id: string }
        Returns: Json
      }
      complete_daily_plan_items: {
        Args: { p_plan_id: string; p_question_ids: string[]; p_user_id: string }
        Returns: Json
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
      complete_verified_game_session: {
        Args: {
          p_answers: Json
          p_attempt_id: string
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
      content_governance_has_permission: {
        Args: { p_permission: string; p_user_id: string }
        Returns: boolean
      }
      content_governance_hash: { Args: { p_payload: Json }; Returns: string }
      content_governance_lock_request: {
        Args: { p_operation: string; p_request_id: string; p_user_id: string }
        Returns: undefined
      }
      content_governance_validate_payload: {
        Args: { p_payload: Json }
        Returns: boolean
      }
      create_daily_plan_v2: {
        Args: {
          p_exam_ref: string
          p_game: string
          p_items: Json
          p_plan_date: string
          p_user_id: string
        }
        Returns: Json
      }
      create_governed_question: {
        Args: { p_payload: Json; p_request_id: string; p_user_id: string }
        Returns: Json
      }
      create_question_content_revision: {
        Args: {
          p_base_revision_id: string
          p_payload: Json
          p_question_id: string
          p_request_id: string
          p_user_id: string
        }
        Returns: Json
      }
      create_question_error_incident: {
        Args: {
          p_corrected_revision_id: string
          p_erroneous_revision_id: string
          p_error_type: string
          p_question_id: string
          p_request_id: string
          p_user_id: string
        }
        Returns: Json
      }
      create_teacher_classroom: {
        Args: { p_name: string; p_request_id: string; p_user_id: string }
        Returns: Json
      }
      curriculum_graph_integrity: { Args: never; Returns: Json }
      finalize_verified_exam_attempt: {
        Args: { p_attempt_id: string; p_request_id: string; p_user_id: string }
        Returns: Json
      }
      form_weekly_learning_leagues: {
        Args: { p_request_id: string; p_week_start: string }
        Returns: Json
      }
      fsrs_review_transition: {
        Args: {
          p_difficulty: number
          p_lapses: number
          p_last_review: string
          p_learning_steps: number
          p_rating: number
          p_reps: number
          p_reviewed_at: string
          p_stability: number
          p_state: number
        }
        Returns: Json
      }
      get_content_governance_enforcement: {
        Args: { p_user_id: string }
        Returns: Json
      }
      get_my_paper_study_pack: {
        Args: { p_pack_id: string; p_user_id: string }
        Returns: Json
      }
      get_my_pilot_institution: { Args: { p_user_id: string }; Returns: Json }
      get_my_question_appeals: { Args: { p_user_id: string }; Returns: Json }
      get_my_question_result_corrections: {
        Args: { p_user_id: string }
        Returns: Json
      }
      get_my_teacher_assignment: {
        Args: { p_assignment_id: string; p_user_id: string }
        Returns: Json
      }
      get_my_teacher_assignments: { Args: { p_user_id: string }; Returns: Json }
      get_my_teacher_classroom_memberships: {
        Args: { p_user_id: string }
        Returns: Json
      }
      get_my_teacher_classroom_overview: {
        Args: { p_classroom_id: string; p_user_id: string }
        Returns: Json
      }
      get_my_teacher_classrooms: { Args: { p_user_id: string }; Returns: Json }
      get_my_weekly_learning_league: {
        Args: { p_user_id: string }
        Returns: Json
      }
      get_my_weekly_learning_spotlights: {
        Args: { p_user_id: string }
        Returns: Json
      }
      get_my_weekly_team_boss: { Args: { p_user_id: string }; Returns: Json }
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
      get_published_question_content_revision: {
        Args: { p_question_id: string; p_user_id: string }
        Returns: Json
      }
      get_question_appeal_queue: {
        Args: {
          p_cursor: string
          p_limit: number
          p_status: string
          p_user_id: string
        }
        Returns: Json
      }
      get_question_content_governance_queue: {
        Args: {
          p_cursor: string
          p_limit: number
          p_status: string
          p_user_id: string
        }
        Returns: Json
      }
      get_question_content_revision: {
        Args: { p_revision_id: string; p_user_id: string }
        Returns: Json
      }
      get_verified_attempt_question_snapshots: {
        Args: {
          p_attempt_id: string
          p_require_active: boolean
          p_user_id: string
        }
        Returns: Json
      }
      get_verified_exam_strategy_evidence: {
        Args: { p_attempt_id: string; p_user_id: string }
        Returns: Json
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
      institution_pilot_active_institution: {
        Args: { p_user_id: string }
        Returns: string
      }
      institution_pilot_has_role: {
        Args: { p_institution_id: string; p_roles: string[]; p_user_id: string }
        Returns: boolean
      }
      institution_pilot_is_platform_admin: {
        Args: { p_user_id: string }
        Returns: boolean
      }
      institution_pilot_payload_hash: {
        Args: { p_payload: Json }
        Returns: string
      }
      is_disposable_email: { Args: { p_email: string }; Returns: boolean }
      issue_paper_study_pack: {
        Args: { p_plan_id: string; p_request_id: string; p_user_id: string }
        Returns: Json
      }
      issue_teacher_classroom_invite: {
        Args: {
          p_classroom_id: string
          p_expires_at: string
          p_max_uses: number
          p_request_id: string
          p_token_digest: string
          p_user_id: string
        }
        Returns: Json
      }
      issue_verified_attempt: {
        Args: {
          p_duration_sec: number
          p_game: string
          p_mode: string
          p_question_ids: string[]
          p_user_id: string
        }
        Returns: Json
      }
      issue_verified_exam_attempt: {
        Args: {
          p_blueprint_version: string
          p_duration_sec: number
          p_exam_ref: string
          p_game: string
          p_items: Json
          p_planned_duration_sec: number
          p_request_id: string
          p_user_id: string
        }
        Returns: Json
      }
      materialize_question_revision_psychometrics: {
        Args: {
          p_request_id: string
          p_revision_id: string
          p_user_id: string
          p_window_end: string
          p_window_start: string
        }
        Returns: Json
      }
      materialize_verified_attempt_mastery: {
        Args: { p_attempt_id: string }
        Returns: undefined
      }
      preview_teacher_classroom_invite: {
        Args: { p_token_digest: string; p_user_id: string }
        Returns: Json
      }
      provision_pilot_institution: {
        Args: {
          p_manager_user_id: string
          p_name: string
          p_request_id: string
          p_user_id: string
        }
        Returns: Json
      }
      publish_question_content_revision: {
        Args: { p_request_id: string; p_revision_id: string; p_user_id: string }
        Returns: Json
      }
      publish_teacher_assignment: {
        Args: {
          p_available_at: string
          p_classroom_id: string
          p_due_at: string
          p_items: Json
          p_request_id: string
          p_title: string
          p_user_id: string
        }
        Returns: Json
      }
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
      quarantine_question_content: {
        Args: {
          p_question_id: string
          p_reason: string
          p_request_id: string
          p_user_id: string
        }
        Returns: Json
      }
      question_content_basic_guard: {
        Args: { p_content: Json; p_game: string }
        Returns: boolean
      }
      rebuild_review_card: {
        Args: { p_question_id: string; p_user_id: string }
        Returns: undefined
      }
      record_adaptive_diagnostic_answer: {
        Args: {
          p_is_correct: boolean
          p_next_question_id: string
          p_question_id: string
          p_request_id: string
          p_response_time_ms: number
          p_session_id: string
          p_user_id: string
        }
        Returns: Json
      }
      record_verified_exam_exposure: {
        Args: {
          p_attempt_id: string
          p_experiment_key: string
          p_request_id: string
          p_revision: number
          p_user_id: string
        }
        Returns: Json
      }
      record_verified_exam_strategy_event: {
        Args: {
          p_attempt_id: string
          p_client_event_id: string
          p_event_type: string
          p_position: number
          p_sequence: number
          p_user_id: string
        }
        Returns: Json
      }
      record_verified_hint_event: {
        Args: {
          p_attempt_id: string
          p_question_id: string
          p_stage: number
          p_user_id: string
        }
        Returns: Json
      }
      remove_pilot_institution_teacher: {
        Args: {
          p_institution_id: string
          p_member_ref: string
          p_request_id: string
          p_user_id: string
        }
        Returns: Json
      }
      remove_teacher_classroom_member: {
        Args: {
          p_classroom_id: string
          p_member_ref: string
          p_request_id: string
          p_user_id: string
        }
        Returns: Json
      }
      resolve_adaptive_diagnostic_question: {
        Args: { p_question_id: string }
        Returns: {
          difficulty: number
          outcome_id: string
        }[]
      }
      resolve_question_appeal: {
        Args: {
          p_appeal_id: string
          p_internal_note: string
          p_public_message: string
          p_request_id: string
          p_status: string
          p_user_id: string
        }
        Returns: Json
      }
      review_question_content_revision: {
        Args: {
          p_decision: string
          p_rationale: string
          p_request_id: string
          p_revision_id: string
          p_stage: number
          p_user_id: string
        }
        Returns: Json
      }
      revoke_teacher_classroom_invite: {
        Args: { p_invite_ref: string; p_request_id: string; p_user_id: string }
        Returns: Json
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
          published_revision_id: string | null
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
      set_content_governance_enforcement: {
        Args: { p_enforced: boolean; p_request_id: string; p_user_id: string }
        Returns: Json
      }
      set_review_error_reason: {
        Args: {
          p_reason_code: string
          p_review_log_id: string
          p_user_id: string
        }
        Returns: undefined
      }
      set_weekly_learning_league_preference: {
        Args: { p_opted_in: boolean; p_request_id: string; p_user_id: string }
        Returns: Json
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      soft_delete_user: { Args: { p_user_id: string }; Returns: undefined }
      spend_coins: {
        Args: { p_amount: number; p_user_id: string }
        Returns: undefined
      }
      start_adaptive_diagnostic: {
        Args: {
          p_first_question_id: string
          p_session_id: string
          p_user_id: string
        }
        Returns: Json
      }
      start_verified_coach_session: {
        Args: {
          p_attempt_id: string
          p_question_id: string
          p_selected_option: number
          p_user_id: string
        }
        Returns: Json
      }
      start_verified_exam_attempt: {
        Args: { p_attempt_id: string; p_request_id: string; p_user_id: string }
        Returns: Json
      }
      submit_challenge_answer: {
        Args: { p_challenge_id: string; p_score: Json; p_user_id: string }
        Returns: Json
      }
      submit_paper_study_pack: {
        Args: {
          p_answers: Json
          p_pack_id: string
          p_request_id: string
          p_user_id: string
        }
        Returns: Json
      }
      submit_question_appeal: {
        Args: {
          p_description: string
          p_question_id: string
          p_reason: string
          p_request_id: string
          p_session_answer_id: string
          p_user_id: string
        }
        Returns: Json
      }
      submit_teacher_assignment: {
        Args: {
          p_answers: Json
          p_assignment_id: string
          p_request_id: string
          p_user_id: string
        }
        Returns: Json
      }
      sweep_question_appeal_sla: { Args: { p_now: string }; Returns: Json }
      sync_taxonomy_auto_question_outcomes: {
        Args: {
          p_category: string
          p_exam_ref: string
          p_game: string
          p_is_active: boolean
          p_question_id: string
        }
        Returns: undefined
      }
      teacher_classroom_is_blocked: {
        Args: { p_first: string; p_second: string }
        Returns: boolean
      }
      teacher_classroom_is_teacher: {
        Args: { p_user_id: string }
        Returns: boolean
      }
      teacher_classroom_payload_hash: {
        Args: { p_payload: Json }
        Returns: string
      }
      teacher_classroom_safe_alias: {
        Args: { p_user_id: string }
        Returns: string
      }
      unaccent: { Args: { "": string }; Returns: string }
      update_streak: { Args: { p_user_id: string }; Returns: undefined }
      verified_attempt_private_snapshot: {
        Args: { p_attempt_id: string }
        Returns: Json
      }
      verified_attempts_question_ids_valid: {
        Args: { p_question_ids: string[] }
        Returns: boolean
      }
      verified_coach_correct_option: {
        Args: { p_content: Json }
        Returns: number
      }
      verified_coach_option_count: {
        Args: { p_content: Json }
        Returns: number
      }
      verified_exam_private_snapshot: {
        Args: { p_attempt_id: string }
        Returns: Json
      }
      weekly_learning_league_week_start: {
        Args: { p_at: string }
        Returns: string
      }
      withdraw_teacher_classroom_membership: {
        Args: {
          p_classroom_id: string
          p_request_id: string
          p_user_id: string
        }
        Returns: Json
      }
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
