import { z } from 'zod'

// ============================================================
// Chat API
// ============================================================

export const chatMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1).max(2000),
})

export const chatRequestSchema = z.object({
  messages: z.array(chatMessageSchema).min(1).max(50),
  questionContext: z.string().max(1000).nullish(),
})

// ============================================================
// Yorum sistemi
// ============================================================

/** Yorum icerigi: 1-500 karakter, trim edilir */
export const commentContentSchema = z
  .string()
  .trim()
  .min(1, 'Yorum bos olamaz')
  .max(500, 'Yorum en fazla 500 karakter olabilir')

// ============================================================
// Hata raporu
// ============================================================

const REPORT_TYPES = [
  'wrong_answer',
  'typo',
  'unclear',
  'duplicate',
  'offensive',
  'other',
] as const

export const errorReportSchema = z.object({
  report_type: z.enum(REPORT_TYPES),
  description: z.string().trim().max(1000).optional().default(''),
})

// ============================================================
// Profil guncelleme
// ============================================================

export const profileUpdateSchema = z.object({
  username: z.string().trim().min(2).max(30).optional(),
  display_name: z.string().trim().max(50).optional(),
  city: z.string().trim().max(50).optional(),
  grade: z.number().int().min(9).max(13).optional(),
  onboarding_completed: z.literal(true).optional(),
}).refine(data => Object.keys(data).length > 0, {
  message: 'Guncellenecek alan yok',
})

// ============================================================
// Session submit (oyun oturumu)
// ============================================================

const answerSchema = z.object({
  questionId: z.string().uuid(),
  selectedOption: z.number().int(),
  isCorrect: z.boolean(),
  timeTaken: z.number().min(0).max(300),
})

export const sessionSubmitSchema = z.object({
  game: z.string().min(1).max(50),
  mode: z.string().min(1).max(30),
  answers: z.array(answerSchema).min(1).max(100),
  category: z.string().max(50).nullish(),
  difficulty: z.number().int().min(1).max(5).nullish(),
  timeLimit: z.number().int().min(5).max(120).optional().default(30),
})

// ============================================================
// Arkadas sistemi
// ============================================================

export const friendRequestSchema = z.object({
  friendId: z.string().uuid(),
})

export const friendActionSchema = z.object({
  friendshipId: z.string().uuid(),
})

// ============================================================
// Referral
// ============================================================

export const referralApplySchema = z.object({
  code: z.string().trim().min(1).max(20),
})

// ============================================================
// Sabitleri export et (client tarafinda da kullanilabilir)
// ============================================================

// ============================================================
// Challenge (duello)
// ============================================================

export const challengeCreateSchema = z.object({
  opponentId: z.string().uuid(),
  game: z.string().min(1).max(50),
  category: z.string().max(50).nullish(),
})

export const challengeActionSchema = z.object({
  action: z.enum(['accept', 'decline']),
})

export const challengeSubmitSchema = z.object({
  answers: z.array(z.object({
    questionId: z.string().uuid(),
    selectedOption: z.number().int().min(0),
    isCorrect: z.boolean(),
    timeTaken: z.number().min(0).max(300),
  })).min(1).max(50),
})

// ============================================================
// Push bildirim
// ============================================================

export const pushSubscribeSchema = z.object({
  endpoint: z.string().url().max(500),
  p256dh: z.string().min(1).max(500),
  auth: z.string().min(1).max(500),
})

export const pushUnsubscribeSchema = z.object({
  endpoint: z.string().url().max(500),
})

// ============================================================
// Quest claim
// ============================================================

export const questClaimSchema = z.object({
  questId: z.string().min(1).max(100),
})

// ============================================================
// Admin role assign
// ============================================================

export const roleAssignSchema = z.object({
  userId: z.string().uuid(),
  roleId: z.string().uuid(),
})

// ============================================================
// Sabitleri export et (client tarafinda da kullanilabilir)
// ============================================================

export const LIMITS = {
  COMMENT_MAX_LENGTH: 500,
  CHAT_MAX_LENGTH: 2000,
  REPORT_DESCRIPTION_MAX_LENGTH: 1000,
  CHAT_MAX_MESSAGES: 50,
} as const
