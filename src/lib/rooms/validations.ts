/**
 * Bilge Arena Oda Sistemi: Zod validation schemas
 * Sprint 1 PR3
 *
 * DB CHECK constraint'lerle birebir uyumlu (2_rooms.sql):
 *   - title: 3-80 char (chk_rooms_title_length)
 *   - difficulty: 1-5 (chk_rooms_difficulty)
 *   - question_count: 5-30 (chk_rooms_question_count)
 *   - max_players: 2-20 (chk_rooms_max_players)
 *   - per_question_seconds: 10-60 (chk_rooms_per_question_seconds)
 *   - mode: 'sync' | 'async' (chk_rooms_mode)
 *   - code: ^[A-HJ-NP-Z2-9]{6}$ (chk_rooms_code_format)
 *
 * NOT: SQL function default'lari TS'te de varsayilan olarak duruyor.
 * API katmani once Zod, sonra DB CHECK, ikinci savunma hatti.
 */

import { z } from 'zod'

// =============================================================================
// Crockford-32 code regex (chk_rooms_code_format ile birebir)
// =============================================================================
export const ROOM_CODE_REGEX = /^[A-HJ-NP-Z2-9]{6}$/

// =============================================================================
// POST /api/rooms (create_room input)
// =============================================================================
export const createRoomSchema = z.object({
  title: z
    .string()
    .trim()
    .min(3, 'Baslik en az 3 karakter olmali')
    .max(80, 'Baslik en fazla 80 karakter olabilir'),
  category: z
    .string()
    .trim()
    .min(1, 'Kategori secilmeli')
    .max(30, 'Kategori en fazla 30 karakter'),
  difficulty: z
    .number()
    .int()
    .min(1)
    .max(5)
    .default(2),
  question_count: z
    .number()
    .int()
    .min(5)
    .max(30)
    .default(10),
  max_players: z
    .number()
    .int()
    .min(2)
    .max(20)
    .default(8),
  per_question_seconds: z
    .number()
    .int()
    .min(10)
    .max(60)
    .default(20),
  mode: z.enum(['sync', 'async']).default('sync'),
  // Sprint 2A Task 1: 0=manuel mode, 1-30=auto-advance saniye sayisi
  auto_advance_seconds: z
    .number()
    .int()
    .min(0, 'Otomatik geçiş süresi 0-30 arasında olmalı')
    .max(30, 'Otomatik geçiş süresi en fazla 30 saniye olabilir')
    .default(5),
  // Sprint 2A Task 3: public oda discovery (host opt-in)
  is_public: z.boolean().default(false),
}).refine(
  (data) => !data.is_public || data.max_players <= 6,
  {
    message: 'Herkese açık odalarda en fazla 6 oyunculu olabilir',
    path: ['max_players'],
  },
)

export type CreateRoomBody = z.infer<typeof createRoomSchema>

// =============================================================================
// POST /api/rooms/join (join_room input)
// =============================================================================
export const joinRoomSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(ROOM_CODE_REGEX, 'Gecersiz oda kodu format'),
})

export type JoinRoomBody = z.infer<typeof joinRoomSchema>

// =============================================================================
// POST /api/rooms/:id/answer (submit_answer input)
// =============================================================================
export const submitAnswerSchema = z.object({
  answer_value: z
    .string()
    .trim()
    .min(1, 'Cevap bos olamaz')
    .max(200, 'Cevap cok uzun'),
})

export type SubmitAnswerBody = z.infer<typeof submitAnswerSchema>

// =============================================================================
// POST /api/rooms/:id/cancel (cancel_room input)
// =============================================================================
export const cancelRoomSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .default('host_canceled'),
})

export type CancelRoomBody = z.infer<typeof cancelRoomSchema>

// =============================================================================
// POST /api/rooms/:id/kick (kick_member input)
// =============================================================================
export const kickMemberSchema = z.object({
  target_user_id: z.string().uuid('Gecersiz user_id format'),
})

export type KickMemberBody = z.infer<typeof kickMemberSchema>

// =============================================================================
// startRoomAction (Server Action) — PR4c
// =============================================================================
export const startRoomSchema = z.object({
  room_id: z.string().uuid('Gecersiz oda kimligi'),
})

export type StartRoomBody = z.infer<typeof startRoomSchema>

// =============================================================================
// cancelRoomAction (Server Action) — PR4c
// =============================================================================
export const cancelRoomActionSchema = z.object({
  room_id: z.string().uuid('Gecersiz oda kimligi'),
  reason: z.string().trim().min(1).max(100).default('host_canceled'),
})

export type CancelRoomActionBody = z.infer<typeof cancelRoomActionSchema>

// =============================================================================
// kickMemberAction (Server Action) — PR4d
// =============================================================================
export const kickMemberActionSchema = z.object({
  room_id: z.string().uuid('Gecersiz oda kimligi'),
  target_user_id: z.string().uuid('Gecersiz hedef kullanici kimligi'),
})

export type KickMemberActionBody = z.infer<typeof kickMemberActionSchema>

// =============================================================================
// submitAnswerAction (Server Action) — PR4e-2
// =============================================================================
export const submitAnswerActionSchema = z.object({
  room_id: z.string().uuid('Gecersiz oda kimligi'),
  answer_value: z.string().trim().min(1, 'Cevap bos olamaz').max(200, 'Cevap cok uzun'),
  // Async PR1 Faz B3: opsiyonel mode field (default 'sync', backwards-compat).
  // Frontend GameView async modda 'async' gonderir, action submit_answer_async RPC'ye geder.
  mode: z.enum(['sync', 'async']).optional().default('sync'),
})

export type SubmitAnswerActionBody = z.infer<typeof submitAnswerActionSchema>

// =============================================================================
// advanceRoundAction + revealRoundAction (host) — PR4e-3
// (Ikisi de ayni shape: room_id UUID; ayri schema gerekmiyor ama isim
// ayriligi action'lar arasinda netlik saglar.)
// =============================================================================
export const advanceRoundActionSchema = z.object({
  room_id: z.string().uuid('Gecersiz oda kimligi'),
})

export const revealRoundActionSchema = z.object({
  room_id: z.string().uuid('Gecersiz oda kimligi'),
})

export type AdvanceRoundActionBody = z.infer<typeof advanceRoundActionSchema>
export type RevealRoundActionBody = z.infer<typeof revealRoundActionSchema>

// =============================================================================
// quickPlayRoomAction — Sprint 2B Task 4 (Solo mode)
// =============================================================================
// Codex P3 #5 fix: kategori whitelist (UI dropdown ile tek kaynak). Backend
// herhangi bir string kabul etmemeli — kotuniyetli/eski client farkli kategori
// gonderemez. 2026-05-03 fix: DB taxonomy ile uyumlu 18 alt-kategori
// (questions tablosundaki gercek category degerleri).
export const QUICK_PLAY_CATEGORIES = [
  // Türkçe
  'paragraf', 'dil_bilgisi', 'sozcuk', 'anlam_bilgisi', 'yazim_kurallari',
  // Matematik
  'geometri', 'problemler', 'sayilar', 'denklemler', 'fonksiyonlar', 'olasilik',
  // Fen
  'fizik', 'kimya', 'biyoloji',
  // Sosyal
  'tarih', 'cografya', 'felsefe', 'sosyoloji',
] as const

/** Kategori → ders ayrımı (UI optgroup için, RoomInfoPanel display için ortak kaynak) */
export const CATEGORY_GROUPS = [
  { game: 'turkce', label: 'Türkçe', categories: [
    { value: 'paragraf', label: 'Paragraf' },
    { value: 'dil_bilgisi', label: 'Dil Bilgisi' },
    { value: 'sozcuk', label: 'Sözcük' },
    { value: 'anlam_bilgisi', label: 'Anlam Bilgisi' },
    { value: 'yazim_kurallari', label: 'Yazım Kuralları' },
  ]},
  { game: 'matematik', label: 'Matematik', categories: [
    { value: 'geometri', label: 'Geometri' },
    { value: 'problemler', label: 'Problemler' },
    { value: 'sayilar', label: 'Sayılar' },
    { value: 'denklemler', label: 'Denklemler' },
    { value: 'fonksiyonlar', label: 'Fonksiyonlar' },
    { value: 'olasilik', label: 'Olasılık' },
  ]},
  { game: 'fen', label: 'Fen Bilimleri', categories: [
    { value: 'fizik', label: 'Fizik' },
    { value: 'kimya', label: 'Kimya' },
    { value: 'biyoloji', label: 'Biyoloji' },
  ]},
  { game: 'sosyal', label: 'Sosyal Bilimler', categories: [
    { value: 'tarih', label: 'Tarih' },
    { value: 'cografya', label: 'Coğrafya' },
    { value: 'felsefe', label: 'Felsefe' },
    { value: 'sosyoloji', label: 'Sosyoloji' },
  ]},
] as const

export const quickPlayRoomActionSchema = z.object({
  category: z.enum(QUICK_PLAY_CATEGORIES, {
    message: 'Geçersiz kategori',
  }),
  difficulty: z.number().int().min(1).max(5).default(2),
  question_count: z.number().int().min(5).max(30).default(10),
})

export type QuickPlayRoomActionBody = z.infer<typeof quickPlayRoomActionSchema>

// =============================================================================
// refreshLobbyPreviewAction — Sprint 2A Task 2
// =============================================================================
export const refreshLobbyPreviewActionSchema = z.object({
  category: z
    .string()
    .trim()
    .min(1, 'Kategori bos olamaz')
    .max(30, 'Kategori cok uzun'),
})

export type RefreshLobbyPreviewActionBody = z.infer<
  typeof refreshLobbyPreviewActionSchema
>

// =============================================================================
// POST /api/rooms/:id/invite — email davet (host -> guest)
// =============================================================================
export const inviteRoomSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, 'Email bos olamaz')
    .max(254, 'Email cok uzun')
    .email('Gecerli bir email girin'),
})

export type InviteRoomBody = z.infer<typeof inviteRoomSchema>

// =============================================================================
// replayRoomAction — Sprint 2C Task 8 (Replay & Share)
// =============================================================================
export const replayRoomActionSchema = z.object({
  source_room_id: z.string().uuid('Gecersiz oda kimligi'),
})

export type ReplayRoomActionBody = z.infer<typeof replayRoomActionSchema>
