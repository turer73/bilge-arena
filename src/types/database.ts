/**
 * Supabase Database type tanımları — full-schema.sql + migrations'dan türetilmiş
 * Son güncelleme: Migration 011
 */

// ─── Enum Types ──────────────────────────────────────────

export type GameType = 'wordquest' | 'matematik' | 'turkce' | 'fen' | 'sosyal'
export type Difficulty = 1 | 2 | 3 | 4 | 5
export type GameMode = 'classic' | 'blitz' | 'marathon' | 'boss' | 'practice' | 'deneme'
export type SessionStatus = 'active' | 'completed' | 'abandoned'
export type BadgeCategory = 'streak' | 'accuracy' | 'speed' | 'volume' | 'level' | 'special'
export type BadgeRarity = 'common' | 'rare' | 'epic' | 'legendary'
export type QuestType = 'play_sessions' | 'correct_answers' | 'streak_maintain' | 'accuracy' | 'specific_game'
export type XPReason = 'correct_answer' | 'streak_bonus' | 'speed_bonus' | 'session_complete' | 'badge_earned' | 'daily_quest' | 'level_up_bonus' | 'admin'
export type ReportType = 'wrong_answer' | 'typo' | 'unclear' | 'duplicate' | 'offensive' | 'other'
export type ReportStatus = 'pending' | 'reviewed' | 'resolved' | 'rejected'
export type ConsentType = 'cookie' | 'terms' | 'kvkk'
export type MasteryLevel = 0 | 1 | 2 | 3 | 4 | 5

// ─── Core Tables ─────────────────────────────────────────

/** profiles — auth.users ile 1:1 bağlantılı kullanıcı profili */
export interface Profile {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
  city: string | null
  grade: number | null           // 9-13 (9-12 lise, 13 mezun)
  role: 'user' | 'admin'
  // XP & Seviye
  total_xp: number
  level: number
  level_name: string             // Acemi / Öğrenci / Azimli / Uzman / Efsane
  // Streak
  current_streak: number
  longest_streak: number
  last_played_at: string | null
  // İstatistik
  total_questions: number
  correct_answers: number
  total_sessions: number
  // Premium
  is_premium: boolean
  premium_until: string | null
  // Tercihler
  preferred_theme: 'dark' | 'light'
  notifications: boolean
  created_at: string
  updated_at: string
}

/** questions — Tüm oyunlar için ortak soru tablosu (JSONB content) */
export interface Question {
  id: string
  external_id: string | null
  // Sınıflandırma
  game: GameType
  category: string
  subcategory: string | null
  topic: string | null
  // Zorluk
  difficulty: Difficulty
  level_tag: string | null       // A1-C2 (WordQuest)
  // İçerik
  content: QuestionContent
  // Puan (GENERATED: difficulty * 10)
  base_points: number
  // Meta
  is_active: boolean
  is_boss: boolean
  times_answered: number
  times_correct: number
  // Kaynak
  source: string
  exam_ref: string | null
  created_at: string
  updated_at: string
}

/** questions.content JSONB yapısı */
export interface QuestionContent {
  question: string
  options: string[]
  answer: number                 // 0-based index
  solution?: string
  sentence?: string              // WordQuest cloze format
  context?: string               // Ek bağlam
  hint?: string
  type?: string                  // multiple_choice, cloze_test, dialogue vb.
  explanation?: string           // WordQuest detaylı açıklama
}

/** game_sessions — Her oyun oturumu = 1 kayıt */
export interface GameSession {
  id: string
  user_id: string
  // Oyun bilgisi
  game: GameType
  mode: GameMode
  // Sonuç
  status: SessionStatus
  total_questions: number
  correct_count: number
  wrong_count: number
  skipped_count: number
  // Puanlama
  base_xp: number
  bonus_xp: number
  total_xp: number
  // Zaman
  time_spent_sec: number
  avg_time_sec: number | null
  // Streak
  streak_at_start: number
  // Filtreler
  filter_category: string | null
  filter_difficulty: number | null
  started_at: string
  completed_at: string | null
}

/** session_answers — Her soru cevabı = 1 satır */
export interface SessionAnswer {
  id: string
  session_id: string
  question_id: string
  user_id: string
  // Cevap
  selected_option: number | null  // 0-4
  is_correct: boolean
  is_skipped: boolean
  // Zaman
  time_taken_sec: number | null
  is_fast: boolean               // < 10 sn
  // Puan
  xp_earned: number
  question_order: number | null
  answered_at: string
}

/** leaderboard_weekly — Haftalık sıralama */
export interface LeaderboardWeekly {
  id: string
  user_id: string
  week_start: string             // DATE (Pazartesi)
  week_end: string               // DATE (Pazar)
  xp_earned: number
  sessions_played: number
  correct_answers: number
  accuracy_pct: number | null
  rank: number | null
}

/** leaderboard_weekly_ranked VIEW — Profil bilgisiyle birleştirilmiş sıralama */
export interface LeaderboardWeeklyRanked extends LeaderboardWeekly {
  username: string
  display_name: string | null
  avatar_url: string | null
  city: string | null
  level_name: string
  current_streak: number
  current_rank: number
}

// ─── Gamification Tables ─────────────────────────────────

/** badges — Rozet tanımları */
export interface Badge {
  id: string
  slug: string
  name: string
  description: string | null
  icon: string | null
  color: string | null
  category: BadgeCategory
  condition: BadgeCondition
  rarity: BadgeRarity
  xp_reward: number
  is_active: boolean
  created_at: string
}

/** badges.condition JSONB yapısı */
export interface BadgeCondition {
  type: string                   // streak, correct_total, accuracy, fast_correct, sessions, level, boss_correct, unique_games
  value: number
  min?: number                   // accuracy rozetleri için minimum soru sayısı
}

/** user_badges — Kazanılan rozetler */
export interface UserBadge {
  id: string
  user_id: string
  badge_id: string
  earned_at: string
}

/** user_topic_progress — Konu bazlı ilerleme */
export interface UserTopicProgress {
  id: string
  user_id: string
  game: GameType
  category: string
  questions_seen: number
  correct: number
  accuracy_pct: number           // GENERATED: (correct / questions_seen) * 100
  mastery_level: MasteryLevel
  last_seen_at: string | null
  updated_at: string
}

/** daily_quests — Günlük görev tanımları */
export interface DailyQuestDef {
  id: string
  slug: string
  title: string
  description: string | null
  icon: string | null
  quest_type: QuestType
  target_value: number
  target_game: GameType | null
  xp_reward: number
  is_active: boolean
}

/** user_daily_quests — Kullanıcı günlük görev ilerlemesi */
export interface UserDailyQuest {
  id: string
  user_id: string
  quest_id: string
  date: string
  current_value: number
  is_completed: boolean
  completed_at: string | null
  xp_claimed: boolean
  // Join ile gelen görev tanımı (opsiyonel)
  quest?: DailyQuestDef
}

/** xp_log — XP audit trail */
export interface XPLog {
  id: string
  user_id: string
  amount: number
  reason: XPReason
  reference_id: string | null    // session_id veya badge_id
  created_at: string
}

/** user_question_history — Görülmüş soru takibi */
export interface UserQuestionHistory {
  user_id: string
  question_id: string
  times_seen: number
  times_correct: number
  last_seen_at: string
}

// ─── Social Tables ───────────────────────────────────────

/** comments — Soru yorumları */
export interface Comment {
  id: string
  user_id: string
  question_id: string
  content: string
  parent_id: string | null
  is_deleted: boolean
  likes_count: number
  created_at: string
  updated_at: string
}

export interface CommentLike {
  id: string
  user_id: string
  comment_id: string
  created_at: string
}

export interface QuestionLike {
  id: string
  user_id: string
  question_id: string
  created_at: string
}

// ─── Error Reports ───────────────────────────────────────

export interface ErrorReport {
  id: string
  user_id: string
  question_id: string
  report_type: ReportType
  description: string | null
  status: ReportStatus
  admin_note: string | null
  resolved_by: string | null
  created_at: string
  updated_at: string
}

// ─── Admin Tables ────────────────────────────────────────

export interface AdminLog {
  id: string
  admin_id: string
  action: string
  target_type: string
  target_id: string | null
  details: Record<string, unknown> | null
  created_at: string
}

export interface SiteSetting {
  key: string
  value: unknown
  updated_at: string
  updated_by: string | null
}

// ─── Consent / KVKK ─────────────────────────────────────

export interface ConsentLog {
  id: string
  user_id: string | null
  consent_type: ConsentType
  consent_value: Record<string, unknown>
  ip_address: string | null
  user_agent: string | null
  created_at: string
}

// ─── Supabase Database Interface ─────────────────────────

type TableDef<R> = {
  Row: R
  Insert: Partial<R>
  Update: Partial<R>
  Relationships: []
}

export interface Database {
  public: {
    Tables: {
      profiles: TableDef<Profile>
      questions: TableDef<Question>
      game_sessions: TableDef<GameSession>
      session_answers: TableDef<SessionAnswer>
      leaderboard_weekly: TableDef<LeaderboardWeekly>
      badges: TableDef<Badge>
      user_badges: TableDef<UserBadge>
      user_topic_progress: TableDef<UserTopicProgress>
      daily_quests: TableDef<DailyQuestDef>
      user_daily_quests: TableDef<UserDailyQuest>
      xp_log: TableDef<XPLog>
      user_question_history: TableDef<UserQuestionHistory>
      comments: TableDef<Comment>
      comment_likes: TableDef<CommentLike>
      question_likes: TableDef<QuestionLike>
      error_reports: TableDef<ErrorReport>
      admin_logs: TableDef<AdminLog>
      site_settings: TableDef<SiteSetting>
      consent_logs: TableDef<ConsentLog>
    }
    Views: {
      leaderboard_weekly_ranked: { Row: LeaderboardWeeklyRanked }
    }
    Functions: Record<string, never>
    Enums: {
      report_type: ReportType
      report_status: ReportStatus
    }
    CompositeTypes: Record<string, never>
  }
}

// ─── Backward Compatibility Aliases ──────────────────────
// Eski kod referansları için (kademeli olarak kaldırılacak)

/** @deprecated Badge kullanın */
export type Achievement = Badge
/** @deprecated UserBadge kullanın */
export type UserAchievement = UserBadge
/** @deprecated LeaderboardWeekly kullanın */
export type LeaderboardEntry = LeaderboardWeekly
