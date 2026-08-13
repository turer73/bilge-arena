import type { Database as GeneratedDatabase, Json } from './database.generated'

type PublicSchema = GeneratedDatabase['public']
type GeneratedFunctions = PublicSchema['Functions']
type CompleteGameSession = GeneratedFunctions['complete_game_session']
type UserAchievements = PublicSchema['Tables']['user_achievements']
type CurriculumOutcomes = PublicSchema['Tables']['curriculum_outcomes']
type QuestionOutcomes = PublicSchema['Tables']['question_outcomes']
type UserOutcomeState = PublicSchema['Tables']['user_outcome_state']

type CompleteGameSessionArgs = Omit<
  CompleteGameSession['Args'],
  'p_category' | 'p_filter_difficulty'
> & {
  p_category: string | null
  p_filter_difficulty: number | null
}

type VerifiedAttemptsRow = {
  id: string
  user_id: string
  game: string
  mode: string
  question_ids: string[]
  duration_sec: number
  started_at: string
  expires_at: string
  completed_at: string | null
  session_id: string | null
  created_at: string
}

type VerifiedAttemptsInsert = {
  id?: string
  user_id: string
  game: string
  mode: string
  question_ids: string[]
  duration_sec: number
  started_at?: string
  expires_at: string
  completed_at?: string | null
  session_id?: string | null
  created_at?: string
}

type VerifiedAttemptsUpdate = {
  id?: string
  user_id?: string
  game?: string
  mode?: string
  question_ids?: string[]
  duration_sec?: number
  started_at?: string
  expires_at?: string
  completed_at?: string | null
  session_id?: string | null
  created_at?: string
}

type UserAchievementsWithSource = {
  Row: UserAchievements['Row'] & { source_session_id: string | null }
  Insert: UserAchievements['Insert'] & { source_session_id?: string | null }
  Update: UserAchievements['Update'] & { source_session_id?: string | null }
  Relationships: UserAchievements['Relationships']
}

type ReviewCardsRow = {
  user_id: string
  question_id: string
  due_at: string
  stability: number
  difficulty: number
  elapsed_days: number
  scheduled_days: number
  reps: number
  lapses: number
  learning_steps: number
  state: number
  last_review_at: string | null
  last_answer_id: string | null
  revision: number
  created_at: string
  updated_at: string
}

type ReviewCardsInsert = {
  user_id: string
  question_id: string
  due_at?: string
  stability?: number
  difficulty?: number
  elapsed_days?: number
  scheduled_days?: number
  reps?: number
  lapses?: number
  learning_steps?: number
  state?: number
  last_review_at?: string | null
  last_answer_id?: string | null
  revision?: number
  created_at?: string
  updated_at?: string
}

type ReviewCardsUpdate = Partial<ReviewCardsInsert>

type ReviewLogsRow = {
  id: string
  user_id: string
  question_id: string
  session_id: string
  answer_id: string
  rating: number
  reviewed_at: string
  created_at: string
}

type ReviewLogsInsert = Omit<ReviewLogsRow, 'id' | 'created_at'> & {
  id?: string
  created_at?: string
}

type ReviewErrorReasonsRow = {
  code: string
  label_tr: string
  is_active: boolean
  sort_order: number
}

type ReviewErrorAnnotationsRow = {
  review_log_id: string
  user_id: string
  reason_code: string
  created_at: string
  updated_at: string
}

type ReviewErrorAnnotationsInsert = Omit<ReviewErrorAnnotationsRow, 'created_at' | 'updated_at'> & {
  created_at?: string
  updated_at?: string
}

type DailyPlanItemsRow = {
  plan_id: string
  position: number
  question_id: string
  slot_type: string
  source_type: string
  source_ref: string | null
  completed_at: string | null
  created_at: string
}

type DailyPlanItemsInsert = Omit<DailyPlanItemsRow, 'created_at'> & {
  created_at?: string
}

type CurriculumNodesRow = {
  id: string
  code: string
  taxonomy_version: string
  game: string
  exam_ref: string | null
  node_type: 'course' | 'unit' | 'topic' | 'outcome'
  parent_id: string | null
  category: string | null
  title: string
  sort_order: number
  is_active: boolean
  created_at: string
  updated_at: string
}

type CurriculumNodesInsert = Omit<CurriculumNodesRow, 'id' | 'created_at' | 'updated_at'> & {
  id?: string
  created_at?: string
  updated_at?: string
}

type CurriculumOutcomesWithGraph = {
  Row: CurriculumOutcomes['Row'] & {
    node_id: string | null
    taxonomy_version: string | null
  }
  Insert: CurriculumOutcomes['Insert'] & {
    node_id?: string | null
    taxonomy_version?: string | null
  }
  Update: CurriculumOutcomes['Update'] & {
    node_id?: string | null
    taxonomy_version?: string | null
  }
  Relationships: CurriculumOutcomes['Relationships']
}

type QuestionOutcomesWithSource = {
  Row: QuestionOutcomes['Row'] & { mapping_source: 'manual' | 'taxonomy_auto' }
  Insert: QuestionOutcomes['Insert'] & { mapping_source?: 'manual' | 'taxonomy_auto' }
  Update: QuestionOutcomes['Update'] & { mapping_source?: 'manual' | 'taxonomy_auto' }
  Relationships: QuestionOutcomes['Relationships']
}

type UserOutcomeStateV2Columns = {
  v2_attempts: number
  difficulty_weighted_earned: number
  difficulty_weighted_possible: number
  timed_attempts: number
  total_time_sec: number
  fast_wrong: number
  hinted_attempts: number
  hint_stage_sum: number
  guess_annotations: number
  careless_annotations: number
}

type UserOutcomeStateV2 = {
  Row: UserOutcomeState['Row'] & UserOutcomeStateV2Columns
  Insert: UserOutcomeState['Insert'] & Partial<UserOutcomeStateV2Columns>
  Update: UserOutcomeState['Update'] & Partial<UserOutcomeStateV2Columns>
  Relationships: UserOutcomeState['Relationships']
}

type AdaptiveDiagnosticSessionsRow = {
  id: string
  user_id: string
  game: 'matematik'
  exam_ref: 'TYT'
  taxonomy_version: 'ba-tyt-math-v1'
  kind: 'initial' | 'recheck'
  status: 'active' | 'completed' | 'abandoned'
  current_question_id: string | null
  answered_count: number
  covered_outcomes: number
  started_at: string
  expires_at: string
  completed_at: string | null
  created_at: string
  updated_at: string
}

type AdaptiveDiagnosticAnswersRow = {
  id: string
  session_id: string
  user_id: string
  question_id: string
  outcome_id: string
  sequence: number
  difficulty: number
  is_correct: boolean
  response_time_ms: number
  request_id: string
  next_question_id: string | null
  covered_outcomes_after: number
  status_after: 'active' | 'completed' | 'abandoned'
  created_at: string
}

type UserDiagnosticOutcomeStateRow = {
  user_id: string
  outcome_id: string
  completed_session_id: string
  attempts: number
  correct_attempts: number
  difficulty_weighted_earned: number
  difficulty_weighted_possible: number
  score: number
  recommended_difficulty: number
  last_diagnosed_at: string
  updated_at: string
}

type VerifiedCoachSessionsRow = {
  id: string
  attempt_id: string
  user_id: string
  question_id: string
  initial_selected_option: number
  stage: number
  expires_at: string
  transfer_question_id: string | null
  transfer_request_id: string | null
  transfer_selected_option: number | null
  transfer_is_correct: boolean | null
  transfer_completed_at: string | null
  created_at: string
  updated_at: string
}

type VerifiedCoachStageEventsRow = {
  id: string
  session_id: string
  stage: number
  request_id: string
  response_text: string | null
  source: 'authored' | 'ai' | 'fallback' | 'solution'
  evaluation_passed: boolean
  policy_version: string
  content_sha256: string
  created_at: string
}

export type Database = Omit<GeneratedDatabase, 'public'> & {
  public: Omit<PublicSchema, 'Functions' | 'Tables'> & {
    Tables: Omit<
      PublicSchema['Tables'],
      'user_achievements' | 'curriculum_outcomes' | 'question_outcomes' | 'user_outcome_state'
    > & {
      user_achievements: UserAchievementsWithSource
      curriculum_nodes: {
        Row: CurriculumNodesRow
        Insert: CurriculumNodesInsert
        Update: Partial<CurriculumNodesInsert>
        Relationships: []
      }
      curriculum_outcomes: CurriculumOutcomesWithGraph
      question_outcomes: QuestionOutcomesWithSource
      user_outcome_state: UserOutcomeStateV2
      verified_attempts: {
        Row: VerifiedAttemptsRow
        Insert: VerifiedAttemptsInsert
        Update: VerifiedAttemptsUpdate
        Relationships: []
      }
      review_cards: {
        Row: ReviewCardsRow
        Insert: ReviewCardsInsert
        Update: ReviewCardsUpdate
        Relationships: []
      }
      review_logs: {
        Row: ReviewLogsRow
        Insert: ReviewLogsInsert
        Update: Partial<ReviewLogsInsert>
        Relationships: []
      }
      review_error_reasons: {
        Row: ReviewErrorReasonsRow
        Insert: ReviewErrorReasonsRow
        Update: Partial<ReviewErrorReasonsRow>
        Relationships: []
      }
      review_error_annotations: {
        Row: ReviewErrorAnnotationsRow
        Insert: ReviewErrorAnnotationsInsert
        Update: Partial<ReviewErrorAnnotationsInsert>
        Relationships: []
      }
      daily_plan_items: {
        Row: DailyPlanItemsRow
        Insert: DailyPlanItemsInsert
        Update: Partial<DailyPlanItemsInsert>
        Relationships: []
      }
      adaptive_diagnostic_sessions: {
        Row: AdaptiveDiagnosticSessionsRow
        Insert: Partial<AdaptiveDiagnosticSessionsRow> & Pick<
          AdaptiveDiagnosticSessionsRow,
          'id' | 'user_id' | 'game' | 'exam_ref' | 'taxonomy_version' | 'kind' | 'status' | 'expires_at'
        >
        Update: Partial<AdaptiveDiagnosticSessionsRow>
        Relationships: []
      }
      adaptive_diagnostic_answers: {
        Row: AdaptiveDiagnosticAnswersRow
        Insert: Partial<AdaptiveDiagnosticAnswersRow> & Pick<
          AdaptiveDiagnosticAnswersRow,
          'session_id' | 'user_id' | 'question_id' | 'outcome_id' | 'sequence' | 'difficulty' | 'is_correct' | 'response_time_ms' | 'request_id' | 'covered_outcomes_after' | 'status_after'
        >
        Update: Partial<AdaptiveDiagnosticAnswersRow>
        Relationships: []
      }
      user_diagnostic_outcome_state: {
        Row: UserDiagnosticOutcomeStateRow
        Insert: UserDiagnosticOutcomeStateRow
        Update: Partial<UserDiagnosticOutcomeStateRow>
        Relationships: []
      }
      verified_coach_sessions: {
        Row: VerifiedCoachSessionsRow
        Insert: Partial<VerifiedCoachSessionsRow> & Pick<
          VerifiedCoachSessionsRow,
          'attempt_id' | 'user_id' | 'question_id' | 'initial_selected_option' | 'expires_at'
        >
        Update: Partial<VerifiedCoachSessionsRow>
        Relationships: []
      }
      verified_coach_stage_events: {
        Row: VerifiedCoachStageEventsRow
        Insert: Partial<VerifiedCoachStageEventsRow> & Pick<
          VerifiedCoachStageEventsRow,
          'session_id' | 'stage' | 'request_id' | 'source' | 'evaluation_passed' | 'policy_version' | 'content_sha256'
        >
        Update: Partial<VerifiedCoachStageEventsRow>
        Relationships: []
      }
    }
    Functions: Omit<GeneratedFunctions, 'complete_game_session'> & {
      complete_game_session: Omit<CompleteGameSession, 'Args'> & {
        Args: CompleteGameSessionArgs
      }
      issue_verified_attempt: {
        Args: {
          p_user_id: string
          p_game: string
          p_mode: string
          p_question_ids: string[]
          p_duration_sec: number
        }
        Returns: Json
      }
      complete_verified_game_session: {
        Args: {
          p_attempt_id: string
          p_user_id: string
          p_client_request_id: string
          p_game: string
          p_mode: string
          p_category: string | null
          p_filter_difficulty: number | null
          p_answers: Json
          p_total_xp: number
          p_base_xp: number
          p_bonus_xp: number
          p_correct_count: number
          p_wrong_count: number
          p_time_spent_sec: number
          p_avg_time_sec: number
        }
        Returns: Json
      }
      claim_daily_quest_reward: {
        Args: {
          p_user_id: string
          p_user_quest_id: string
        }
        Returns: Json
      }
      claim_activation_reward: {
        Args: {
          p_user_id: string
          p_claim_id: string
          p_amount: number
        }
        Returns: Json
      }
      set_review_error_reason: {
        Args: {
          p_user_id: string
          p_review_log_id: string
          p_reason_code: string
        }
        Returns: undefined
      }
      create_daily_plan_v2: {
        Args: {
          p_user_id: string
          p_game: string
          p_plan_date: string
          p_exam_ref: string | null
          p_items: Json
        }
        Returns: Json
      }
      complete_daily_plan_items: {
        Args: {
          p_user_id: string
          p_plan_id: string
          p_question_ids: string[]
        }
        Returns: Json
      }
      curriculum_graph_integrity: {
        Args: never
        Returns: Json
      }
      record_verified_hint_event: {
        Args: {
          p_attempt_id: string
          p_user_id: string
          p_question_id: string
          p_stage: number
        }
        Returns: Json
      }
      start_adaptive_diagnostic: {
        Args: {
          p_user_id: string
          p_session_id: string
          p_first_question_id: string
        }
        Returns: Json
      }
      record_adaptive_diagnostic_answer: {
        Args: {
          p_user_id: string
          p_session_id: string
          p_question_id: string
          p_is_correct: boolean
          p_response_time_ms: number
          p_request_id: string
          p_next_question_id: string | null
        }
        Returns: Json
      }
      start_verified_coach_session: {
        Args: {
          p_attempt_id: string
          p_user_id: string
          p_question_id: string
          p_selected_option: number
        }
        Returns: Json
      }
      advance_verified_coach_stage: {
        Args: {
          p_session_id: string
          p_user_id: string
          p_stage: number
          p_request_id: string
          p_response_text: string | null
          p_source: string
          p_evaluation_passed: boolean
          p_policy_version: string
          p_content_sha256: string
        }
        Returns: Json
      }
      answer_verified_coach_transfer: {
        Args: {
          p_session_id: string
          p_user_id: string
          p_request_id: string
          p_selected_option: number
        }
        Returns: Json
      }
      get_institution_student_learning_analysis: {
        Args: {
          p_user_id: string
          p_classroom_id: string
          p_member_ref: string
          p_game: string
          p_exam_ref: string
          p_window_end: string
        }
        Returns: Json
      }
      get_institution_tracking_directory: {
        Args: { p_user_id: string }
        Returns: Json
      }
      create_institution_study_program_draft: {
        Args: { p_user_id: string; p_classroom_id: string; p_member_ref: string; p_week_start: string; p_daily_minute_limit: number; p_model_version: string; p_items: Json; p_request_id: string }
        Returns: Json
      }
      publish_institution_study_program: {
        Args: { p_user_id: string; p_program_ref: string; p_request_id: string }
        Returns: Json
      }
      issue_verified_exam_attempt: {
        Args: {
          p_user_id: string
          p_game: string
          p_exam_ref: string | null
          p_blueprint_version: string
          p_items: Json
          p_duration_sec: number
          p_planned_duration_sec: number
          p_request_id: string
        }
        Returns: Json
      }
      start_verified_exam_attempt: {
        Args: {
          p_attempt_id: string
          p_user_id: string
          p_request_id: string
        }
        Returns: Json
      }
      record_verified_exam_strategy_event: {
        Args: {
          p_attempt_id: string
          p_user_id: string
          p_client_event_id: string
          p_sequence: number
          p_position: number
          p_event_type: string
        }
        Returns: Json
      }
      finalize_verified_exam_attempt: {
        Args: {
          p_attempt_id: string
          p_user_id: string
          p_request_id: string
        }
        Returns: Json
      }
      get_verified_exam_strategy_evidence: {
        Args: {
          p_attempt_id: string
          p_user_id: string
        }
        Returns: Json
      }
      record_verified_exam_exposure: {
        Args: {
          p_attempt_id: string
          p_user_id: string
          p_experiment_key: string
          p_revision: number
          p_request_id: string
        }
        Returns: Json
      }
      set_weekly_learning_league_preference: {
        Args: {
          p_user_id: string
          p_opted_in: boolean
          p_request_id: string
        }
        Returns: Json
      }
      get_my_weekly_learning_league: {
        Args: {
          p_user_id: string
        }
        Returns: Json
      }
      get_my_weekly_learning_spotlights: {
        Args: {
          p_user_id: string
        }
        Returns: Json
      }
      get_my_weekly_team_boss: {
        Args: {
          p_user_id: string
        }
        Returns: Json
      }
      issue_paper_study_pack: {
        Args: {
          p_user_id: string
          p_plan_id: string
          p_request_id: string
        }
        Returns: Json
      }
      get_my_paper_study_pack: {
        Args: {
          p_user_id: string
          p_pack_id: string
        }
        Returns: Json
      }
      submit_paper_study_pack: {
        Args: {
          p_user_id: string
          p_pack_id: string
          p_answers: Json
          p_request_id: string
        }
        Returns: Json
      }
      create_teacher_classroom: {
        Args: {
          p_user_id: string
          p_name: string
          p_request_id: string
        }
        Returns: Json
      }
      get_my_teacher_classrooms: {
        Args: { p_user_id: string }
        Returns: Json
      }
      get_my_classroom_bilge_tahta_access: {
        Args: { p_user_id: string; p_classroom_id: string; p_institution_id: string }
        Returns: Json
      }
      set_teacher_classroom_bilge_tahta: {
        Args: {
          p_user_id: string
          p_classroom_id: string
          p_enabled: boolean
          p_institution_id: string
          p_request_id: string
        }
        Returns: Json
      }
      issue_teacher_classroom_invite: {
        Args: {
          p_user_id: string
          p_classroom_id: string
          p_token_digest: string
          p_expires_at: string
          p_max_uses: number
          p_request_id: string
        }
        Returns: Json
      }
      revoke_teacher_classroom_invite: {
        Args: {
          p_user_id: string
          p_invite_ref: string
          p_request_id: string
        }
        Returns: Json
      }
      preview_teacher_classroom_invite: {
        Args: {
          p_user_id: string
          p_token_digest: string
        }
        Returns: Json
      }
      accept_teacher_classroom_invite: {
        Args: {
          p_user_id: string
          p_token_digest: string
          p_notice_version: string
          p_consent_version: string
          p_request_id: string
        }
        Returns: Json
      }
      get_my_teacher_classroom_memberships: {
        Args: { p_user_id: string }
        Returns: Json
      }
      withdraw_teacher_classroom_membership: {
        Args: {
          p_user_id: string
          p_classroom_id: string
          p_request_id: string
        }
        Returns: Json
      }
      remove_teacher_classroom_member: {
        Args: {
          p_user_id: string
          p_classroom_id: string
          p_member_ref: string
          p_request_id: string
        }
        Returns: Json
      }
      publish_teacher_assignment: {
        Args: {
          p_user_id: string
          p_classroom_id: string
          p_title: string
          p_items: Json
          p_available_at: string
          p_due_at: string
          p_request_id: string
        }
        Returns: Json
      }
      get_my_teacher_classroom_overview: {
        Args: {
          p_user_id: string
          p_classroom_id: string
        }
        Returns: Json
      }
      get_my_teacher_assignments: {
        Args: { p_user_id: string }
        Returns: Json
      }
      get_my_teacher_assignment: {
        Args: {
          p_user_id: string
          p_assignment_id: string
        }
        Returns: Json
      }
      submit_teacher_assignment: {
        Args: {
          p_user_id: string
          p_assignment_id: string
          p_answers: Json
          p_request_id: string
        }
        Returns: Json
      }
      form_weekly_learning_leagues: {
        Args: {
          p_week_start: string
          p_request_id: string
        }
        Returns: Json
      }
    }
  }
}
