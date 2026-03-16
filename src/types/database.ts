/** Supabase Database type tanımlari — schema.sql'den turetilmis */

export type GameType = 'wordquest' | 'matematik' | 'turkce' | 'fen' | 'sosyal'
export type Difficulty = 1 | 2 | 3 | 4 | 5

export interface Profile {
  id: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
  role?: 'user' | 'admin'
  // XP & Seviye
  total_xp: number
  level: number
  level_name: string
  // Streak
  current_streak: number
  longest_streak: number
  last_played_at: string | null
  // İstatistik (DB kolon adlariyla uyumlu)
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

export interface Question {
  id: string
  game: GameType
  category: string
  sub_category: string | null
  difficulty: Difficulty
  content: QuestionContent
  is_active: boolean
  play_count: number
  success_rate: number
  created_at: string
}

export interface QuestionContent {
  question: string
  options: string[]
  answer: number         // 0-based index
  solution?: string
  sentence?: string      // WordQuest format
  context?: string       // Ek baglam
}

export interface GameSession {
  id: string
  user_id: string
  game: GameType
  mode: string
  score: number
  correct_count: number
  total_count: number
  xp_earned: number
  time_spent: number
  streak_max: number
  completed_at: string
  created_at: string
}

export interface SessionAnswer {
  id: string
  session_id: string
  question_id: string
  selected_option: number
  is_correct: boolean
  time_taken: number
  xp_earned: number
}

export interface Achievement {
  id: string
  code: string
  name: string
  description: string
  icon: string
  condition_type: string
  condition_value: number
  xp_reward: number
}

export interface UserAchievement {
  id: string
  user_id: string
  achievement_id: string
  earned_at: string
}

// Görev tanımı (daily_quests tablosu)
export interface DailyQuestDef {
  id: string
  slug: string
  title: string
  description: string
  icon: string
  quest_type: 'play_sessions' | 'correct_answers' | 'streak_maintain' | 'accuracy' | 'specific_game'
  target_value: number
  target_game: string | null
  xp_reward: number
  is_active: boolean
}

// Kullanıcının günlük görev ilerlemesi (user_daily_quests + join)
export interface UserDailyQuest {
  id: string
  user_id: string
  quest_id: string
  date: string
  current_value: number
  is_completed: boolean
  completed_at: string | null
  xp_claimed: boolean
  // Join ile gelen görev tanımı
  quest: DailyQuestDef
}

export interface LeaderboardEntry {
  id: string
  user_id: string
  game: GameType | null
  period: 'weekly' | 'monthly' | 'alltime'
  score: number
  rank: number
  period_start: string
}

export interface XPLog {
  id: string
  user_id: string
  amount: number
  source: string
  source_id: string | null
  created_at: string
}

// ============================================================
// Sosyal tablolar (Migration 002)
// ============================================================

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

// ============================================================
// Hata raporlama (Migration 003)
// ============================================================

export type ReportType = 'wrong_answer' | 'typo' | 'unclear' | 'duplicate' | 'offensive' | 'other'
export type ReportStatus = 'pending' | 'reviewed' | 'resolved' | 'rejected'

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

// ============================================================
// Admin tablolari (Migration 004)
// ============================================================

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

// ============================================================
// Consent / KVKK (Migration 005)
// ============================================================

export type ConsentType = 'cookie' | 'terms' | 'kvkk'

export interface ConsentLog {
  id: string
  user_id: string | null
  consent_type: ConsentType
  consent_value: Record<string, unknown>
  ip_address: string | null
  user_agent: string | null
  created_at: string
}

// ============================================================
// Supabase client tip entegrasyonu
// ============================================================

// Supabase tipi icin helper — her tablo Row/Insert/Update/Relationships ister
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
      achievements: TableDef<Achievement>
      user_achievements: TableDef<UserAchievement>
      daily_quests: TableDef<DailyQuestDef>
      leaderboard: TableDef<LeaderboardEntry>
      xp_log: TableDef<XPLog>
      comments: TableDef<Comment>
      comment_likes: TableDef<CommentLike>
      question_likes: TableDef<QuestionLike>
      error_reports: TableDef<ErrorReport>
      admin_logs: TableDef<AdminLog>
      site_settings: TableDef<SiteSetting>
      consent_logs: TableDef<ConsentLog>
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
