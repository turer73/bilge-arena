/** Supabase Database type tanımlari — schema.sql'den turetilmis */

export type GameType = 'wordquest' | 'matematik' | 'turkce' | 'fen' | 'sosyal'
export type Difficulty = 1 | 2 | 3 | 4 | 5

export interface Profile {
  id: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
  role: 'user' | 'admin'
  total_xp: number
  level: number
  current_streak: number
  best_streak: number
  games_played: number
  correct_answers: number
  total_answers: number
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

export interface DailyQuest {
  id: string
  user_id: string
  quest_type: string
  target_value: number
  current_value: number
  xp_reward: number
  is_completed: boolean
  quest_date: string
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

// Supabase client tip entegrasyonu
export interface Database {
  public: {
    Tables: {
      profiles: { Row: Profile; Insert: Partial<Profile>; Update: Partial<Profile> }
      questions: { Row: Question; Insert: Partial<Question>; Update: Partial<Question> }
      game_sessions: { Row: GameSession; Insert: Partial<GameSession>; Update: Partial<GameSession> }
      session_answers: { Row: SessionAnswer; Insert: Partial<SessionAnswer>; Update: Partial<SessionAnswer> }
      achievements: { Row: Achievement; Insert: Partial<Achievement>; Update: Partial<Achievement> }
      user_achievements: { Row: UserAchievement; Insert: Partial<UserAchievement>; Update: Partial<UserAchievement> }
      daily_quests: { Row: DailyQuest; Insert: Partial<DailyQuest>; Update: Partial<DailyQuest> }
      leaderboard: { Row: LeaderboardEntry; Insert: Partial<LeaderboardEntry>; Update: Partial<LeaderboardEntry> }
      xp_log: { Row: XPLog; Insert: Partial<XPLog>; Update: Partial<XPLog> }
    }
  }
}
