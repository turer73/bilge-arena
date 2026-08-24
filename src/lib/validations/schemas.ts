import { z } from 'zod'
import { REVIEW_ERROR_REASON_CODES } from '@/lib/review/error-reasons'

// ============================================================
// Chat API
// ============================================================

const CHAT_USER_MAX_LENGTH = 2000
const CHAT_ASSISTANT_MAX_LENGTH = 8000
const CHAT_HISTORY_MAX_LENGTH = 40_000

export const chatMessageSchema = z.discriminatedUnion('role', [
  z.object({
    role: z.literal('user'),
    content: z.string().min(1).max(CHAT_USER_MAX_LENGTH),
  }),
  z.object({
    role: z.literal('assistant'),
    content: z.string().min(1).max(CHAT_ASSISTANT_MAX_LENGTH),
  }),
])

export const chatRequestSchema = z.object({
  messages: z.array(chatMessageSchema).min(1).max(50).refine(
    (messages) => messages.reduce((total, message) => total + message.content.length, 0) <= CHAT_HISTORY_MAX_LENGTH,
    { message: 'Sohbet gecmisi cok uzun' }
  ),
  questionContext: z.string().max(1000).nullish(),
  mode: z.enum(['chat', 'topic_explanation']).optional().default('chat'),
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
  // Community quality claims are optional at the legacy boundary. The
  // governed route applies the stricter academic-claim schema below.
  proposed_answer_index: z.number().int().min(0).max(4).optional(),
  correction_text: z.string().trim().max(1000).optional(),
  confidence: z.number().int().min(0).max(100).optional(),
})

// In-app "soru hatali" bildirimi (#379): modal report'una questionId eklenir.
export const errorReportSubmitSchema = errorReportSchema.extend({
  questionId: z.string().uuid(),
  attemptId: z.string().uuid().nullable().optional(),
  requestId: z.string().uuid().optional(),
})

/**
 * Governed community-quality claim. Academic claims must be bound to an
 * issued attempt (the quiz has already been answered) and carry enough
 * structured evidence for later weighted consensus. Legacy report types keep
 * their old, deliberately lightweight contract.
 */
export const qualityClaimSubmitSchema = errorReportSubmitSchema.superRefine((value, ctx) => {
  if (!['wrong_answer', 'unclear'].includes(value.report_type)) return
  if (!value.attemptId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['attemptId'], message: 'Cevaplanmis soru kaniti gerekli' })
  }
  if ((value.description ?? '').trim().length < 20) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['description'], message: 'Gerekce en az 20 karakter olmali' })
  }
  if (value.proposed_answer_index === undefined && !(value.correction_text ?? '').trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['correction_text'], message: 'Onerilen cevap veya duzeltme gerekli' })
  }
  if (value.confidence === undefined) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['confidence'], message: 'Guven duzeyi gerekli' })
  }
})

export const qualityMissionAnswerLockSchema = z.object({
  missionId: z.string().uuid(),
  selectedAnswerIndex: z.number().int().min(0).max(4),
  requestId: z.string().uuid(),
})

export const qualityMissionSubmitSchema = z.object({
  missionId: z.string().uuid(),
  selectedAnswerIndex: z.number().int().min(0).max(4),
  verdict: z.enum(['clean', 'flawed']),
  reasonCode: z.enum(['wrong_key', 'ambiguous', 'invalid_content', 'outcome_mismatch', 'other']).nullable().optional(),
  proposedAnswerIndex: z.number().int().min(0).max(4).nullable().optional(),
  correctionText: z.string().trim().max(1000).nullable().optional(),
  explanation: z.string().trim().max(2000).default(''),
  confidence: z.number().int().min(0).max(100),
  requestId: z.string().uuid(),
}).superRefine((value, ctx) => {
  if (value.verdict === 'clean') {
    if (value.reasonCode || value.proposedAnswerIndex != null || value.correctionText) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Temiz karari duzeltme tasiyamaz' })
    }
    return
  }
  if (!value.reasonCode) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['reasonCode'], message: 'Hata turu gerekli' })
  if (value.explanation.length < 20) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['explanation'], message: 'Gerekce en az 20 karakter olmali' })
  if (value.proposedAnswerIndex == null && !value.correctionText) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['correctionText'], message: 'Onerilen cevap veya duzeltme gerekli' })
  }
})

// Yanlis Defteri hata nedeni: serbest metin yok, yalniz dusuk kardinalli katalog.
export const reviewErrorReasonSchema = z.object({
  questionId: z.string().uuid(),
  reasonCode: z.enum(REVIEW_ERROR_REASON_CODES),
})

// ============================================================
// Profil guncelleme
// ============================================================

/**
 * Reserved username patterns — sistem hesaplari icin ayrilmis.
 * Kullanici bu pattern'lere uyan username alirsa admin paneli/arkadas
 * arama filtrelerinden gizlenir (migration 053). Codex PR #160 P2.
 */
const RESERVED_USERNAME_PATTERN = /^__honeypot_/i

export const profileUpdateSchema = z.object({
  username: z.string()
    .trim()
    .min(2)
    .max(30)
    .refine(v => !RESERVED_USERNAME_PATTERN.test(v), {
      message: 'Bu kullanici adi sistem icin ayrilmistir',
    })
    .optional(),
  display_name: z.string().trim().max(50).optional(),
  city: z.string().trim().max(50).optional(),
  grade: z.number().int().min(9).max(13).optional(),
  exam_type: z.enum(['yks', 'lgs']).optional(),
  onboarding_completed: z.literal(true).optional(),
  preferred_theme: z.enum(['dark', 'light', 'okyanus', 'orman', 'gunbatimi', 'mor-gece']).optional(),
  is_discoverable: z.boolean().optional(),
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
  attemptId: z.string().uuid(),
  game: z.string().min(1).max(50),
  mode: z.string().min(1).max(30),
  answers: z.array(answerSchema).min(1).max(100),
  category: z.string().max(50).nullish(),
  difficulty: z.number().int().min(1).max(5).nullish(),
  timeLimit: z.number().int().min(5).max(120).optional().default(30),
  // Idempotency: client tarafinda sonuc-ekranina girince BIR KEZ uretilir, ayni
  // oturum-kaydetme denemesi (network-retry) icin sabit kalir (migration 081).
  clientRequestId: z.string().uuid(),
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

// Engelle / sikayet
export const blockUserSchema = z.object({
  targetId: z.string().uuid(),
})

export const reportUserSchema = z.object({
  reportedUserId: z.string().uuid(),
  reportType: z.enum(['harassment', 'inappropriate', 'impersonation', 'spam', 'other']),
  reason: z.string().trim().max(1000).optional(),
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
    // vestigial: sunucu skoru questions tablosundan hesaplar, client isCorrect'i YOK SAYILIR
    // (duello cevap sizintisi fix — client artik dogru cevabi bilmiyor)
    isCorrect: z.boolean().optional(),
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
  questId: z.string().uuid(),
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
// Admin: questions update
// ============================================================

export const questionUpdateSchema = z.object({
  questionId: z.string().uuid(),
  updates: z.record(z.string(), z.unknown()).optional(),
})

// ============================================================
// Admin: error reports
// ============================================================

// DB enum report_status ile birebir: pending/reviewed/resolved/rejected.
// (Onceki ['in_review','dismissed'] DB'de yoktu -> admin "Incelendi"/"Reddet"
//  PATCH'leri Zod'da 400 yiyordu; UI zaten reviewed/rejected gonderiyor.)
const REPORT_STATUSES = ['pending', 'reviewed', 'resolved', 'rejected'] as const

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

// NOT: nullish() yalnizca DB'de gercekten NULL kabul eden sutunlarda.
// alt_text/placement/alignment/size/styles migration 017'de NOT NULL DEFAULT'lu;
// bunlara null gecirmek zod'dan geciyor ama PostgREST'te patlıyordu (23502).
export const homepageElementUpdateSchema = z.object({
  content: z.string().nullish(),
  image_url: z.string().url().max(500).nullish(),
  alt_text: z.string().max(200).optional(),
  placement: z.string().max(50).optional(),
  alignment: z.string().max(50).optional(),
  size: z.string().max(50).optional(),
  styles: z.record(z.string(), z.unknown()).optional(),
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
  CHAT_MAX_LENGTH: CHAT_USER_MAX_LENGTH,
  CHAT_ASSISTANT_MAX_LENGTH,
  CHAT_HISTORY_MAX_LENGTH,
  REPORT_DESCRIPTION_MAX_LENGTH: 1000,
  CHAT_MAX_MESSAGES: 50,
} as const
