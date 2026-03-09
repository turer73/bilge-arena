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
  questionContext: z.string().max(1000).optional(),
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
// Sabitleri export et (client tarafinda da kullanilabilir)
// ============================================================

export const LIMITS = {
  COMMENT_MAX_LENGTH: 500,
  CHAT_MAX_LENGTH: 2000,
  REPORT_DESCRIPTION_MAX_LENGTH: 1000,
  CHAT_MAX_MESSAGES: 50,
} as const
