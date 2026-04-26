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
// Log (client error reporting)
// ============================================================

export const logSchema = z.object({
  type: z.enum(['error', 'warn', 'info']).optional().default('error'),
  message: z.string().max(500).optional(),
  meta: z.unknown().optional(),
})

// ============================================================
// Quest progress update
// ============================================================

export const questProgressSchema = z.object({
  sessionData: z.object({
    correctAnswers: z.number().int().min(0).max(1000).optional(),
    maxStreak: z.number().int().min(0).max(1000).optional(),
    accuracy: z.number().min(0).max(100).optional(),
    game: z.string().max(50).optional(),
  }),
})

// ============================================================
// Admin: questions update
// ============================================================

export const questionUpdateSchema = z.object({
  questionId: z.string().uuid(),
  updates: z.record(z.string(), z.unknown()).optional(),
})

// ============================================================
// Admin: error reports
// ============================================================

const REPORT_STATUSES = ['pending', 'in_review', 'resolved', 'dismissed'] as const

export const reportUpdateSchema = z.object({
  reportId: z.string().uuid(),
  status: z.enum(REPORT_STATUSES),
  adminNote: z.string().max(2000).nullish(),
})

// ============================================================
// Admin: homepage editor
// ============================================================

export const homepageElementCreateSchema = z.object({
  section_key: z.string().min(1).max(100),
  element_type: z.string().min(1).max(50),
  content: z.unknown().nullish(),
  image_url: z.string().url().max(500).nullish(),
  alt_text: z.string().max(200).nullish(),
  placement: z.string().max(50).nullish(),
  alignment: z.string().max(50).nullish(),
  size: z.string().max(50).nullish(),
  styles: z.record(z.string(), z.unknown()).nullish(),
})

export const homepageElementUpdateSchema = z.object({
  content: z.unknown().optional(),
  image_url: z.string().url().max(500).nullish(),
  alt_text: z.string().max(200).nullish(),
  placement: z.string().max(50).nullish(),
  alignment: z.string().max(50).nullish(),
  size: z.string().max(50).nullish(),
  styles: z.record(z.string(), z.unknown()).nullish(),
  sort_order: z.number().int().min(0).max(10000).optional(),
  is_published: z.boolean().optional(),
}).refine(data => Object.keys(data).length > 0, {
  message: 'Guncellenecek alan yok',
})

export const homepageReorderSchema = z.object({
  section_key: z.string().min(1).max(100),
  ordered_ids: z.array(z.string().uuid()).min(1).max(100),
})

export const homepagePublishSchema = z.object({
  action: z.enum(['publish', 'unpublish']),
  section_keys: z.array(z.string().max(100)).optional(),
  element_ids: z.array(z.string().uuid()).optional(),
})

export const homepageSectionUpdateSchema = z.object({
  config: z.record(z.string(), z.unknown()),
})

// ============================================================
// Admin: role update
// ============================================================

export const roleUpdateSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  description: z.string().trim().max(500).optional(),
  permissions: z.array(z.string().max(100)).max(100).optional(),
}).refine(data => Object.keys(data).length > 0, {
  message: 'Guncellenecek alan yok',
})

// ============================================================
// Premium waitlist (lansman bekleme listesi)
// ============================================================
// /arena/premium sayfasindaki "Bildirim al" formunun submit body'si.
// kvkkConsent literal(true): KVKK m.5 acik riza zorunlu, uncheck submit reddedilir.

export const premiumWaitlistSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(5, 'Email cok kisa')
    .max(255, 'Email cok uzun')
    .email('Gecerli email girin'),
  plan: z.enum(['monthly', 'yearly']),
  kvkkConsent: z.literal(true, {
    message: 'KVKK aydinlatma metni onayi zorunlu',
  }),
  source: z.string().max(100).optional(),
})

export type PremiumWaitlistInput = z.infer<typeof premiumWaitlistSchema>

// ============================================================
// Sabitleri export et (client tarafinda da kullanilabilir)
// ============================================================

export const LIMITS = {
  COMMENT_MAX_LENGTH: 500,
  CHAT_MAX_LENGTH: 2000,
  REPORT_DESCRIPTION_MAX_LENGTH: 1000,
  CHAT_MAX_MESSAGES: 50,
} as const
