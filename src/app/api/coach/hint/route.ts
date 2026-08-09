import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { createRateLimiter } from '@/lib/utils/rate-limit'
import { getClientIp } from '@/lib/utils/client-ip'
import {
  supportsGuidedCoachQuestion,
  type StagedCoachQuestionContent,
} from '@/lib/coach/question-shape'
import {
  authoredCoachText,
  buildCoachPrompt,
  coachSourceLabel,
  COACH_POLICY_VERSION,
  evaluateCoachText,
  fallbackHint,
  type CoachContentSource,
  type CoachHintStage,
} from '@/lib/coach/hints'
import { coachPublicResponseSchema } from '@/lib/coach/public-contract'
import { toDomainQuestion, toPublicQuestion, type QuestionRow as PublicQuestionRow } from '@/lib/utils/question-public'

const userLimiter = createRateLimiter('coach-hint-user', 20, 60_000)
const ipLimiter = createRateLimiter('coach-hint-ip', 40, 60_000)

const stageSchema = z.enum(['hint1', 'hint2', 'hint3', 'solution', 'transfer'])

const requestSchema = z.object({
  attemptId: z.string().uuid(),
  questionId: z.string().uuid(),
  requestId: z.string().uuid(),
  stage: stageSchema,
  selectedOption: z.number().int().min(0).max(4).optional(),
  token: z.string().min(1).max(4_000).optional(),
}).strict().superRefine((value, ctx) => {
  const needsSelection = value.stage === 'hint1' || value.stage === 'transfer'
  if (needsSelection !== (value.selectedOption !== undefined)) {
    ctx.addIssue({ code: 'custom', path: ['selectedOption'], message: 'selection_stage_mismatch' })
  }
  if (value.stage === 'hint1' ? value.token !== undefined : value.token === undefined) {
    ctx.addIssue({ code: 'custom', path: ['token'], message: 'token_stage_mismatch' })
  }
})

// Gemini'den DeepSeek'e gecildi: Gemini aylik kotasi tukendiginde koc ipuclari
// sessizce fallback'e dusuyordu (kesif #1403). Chat route'u ile ayni saglayici.
// NOT: 'deepseek-chat' alias'i artik kabul edilmiyor; desteklenen adlar
// deepseek-v4-pro / deepseek-v4-flash. Koc icin ucuz/hizli varyant secildi.
const DEEPSEEK_MODEL = 'deepseek-v4-flash'
const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions'
const COACH_TOKEN_TTL_MS = 10 * 60_000

interface QuestionRow {
  id: string
  game: string
  category: string
  topic: string | null
  content: unknown
  question_outcomes?: Array<{
    outcome_id?: string
    is_primary?: boolean
    curriculum_outcomes?: { title?: string; is_active?: boolean }
      | Array<{ title?: string; is_active?: boolean }>
      | null
  }>
}

interface AttemptRow {
  id: string
  user_id: string
  question_ids: string[]
  expires_at: string
  completed_at: string | null
}

type NextCoachStage = 'hint2' | 'hint3' | 'solution' | 'transfer'

interface CoachProgressPayload {
  v: 3
  userId: string
  attemptId: string
  questionId: string
  sessionId: string
  initialSelectedOption: number
  nextStage: NextCoachStage
  transferQuestionId?: string
  exp: number
}

const startResultSchema = z.object({
  sessionId: z.string().uuid(),
  expiresAt: z.string().datetime({ offset: true }),
  stage: z.number().int().min(0).max(4),
  replayed: z.boolean(),
}).passthrough()

const advanceResultSchema = z.object({
  replayed: z.boolean(),
  responseText: z.string().max(1_000).nullable(),
  source: z.enum(['authored', 'ai', 'fallback', 'solution']),
  evaluationPassed: z.literal(true),
  policyVersion: z.string().min(1).max(80),
  contentSha256: z.string().regex(/^[0-9a-f]{64}$/),
  transferQuestionId: z.string().uuid().nullable(),
}).passthrough()

const transferResultSchema = z.object({
  isCorrect: z.boolean(),
  correctOption: z.number().int().min(0).max(4),
  solution: z.string().max(2_000).nullable(),
  coachDepth: z.literal(4),
  replayed: z.boolean(),
  transferQuestionId: z.string().uuid(),
}).passthrough()

function noStoreJson(body: unknown, init?: { status?: number; headers?: Record<string, string> }) {
  return NextResponse.json(body, {
    status: init?.status,
    headers: { 'Cache-Control': 'no-store', ...init?.headers },
  })
}

function coachTokenSecret(): string | null {
  const value = process.env.COACH_TOKEN_SECRET?.trim()
  return value || null
}

function nextStage(stage: Exclude<CoachHintStage, 'solution'> | 'solution'): NextCoachStage {
  if (stage === 'hint1') return 'hint2'
  if (stage === 'hint2') return 'hint3'
  if (stage === 'hint3') return 'solution'
  return 'transfer'
}

function signCoachToken(payload: CoachProgressPayload, secret: string): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signature = createHmac('sha256', secret).update(encoded).digest('base64url')
  return `${encoded}.${signature}`
}

function verifyCoachToken(
  token: string,
  secret: string,
  expected: Pick<CoachProgressPayload, 'userId' | 'attemptId' | 'questionId' | 'nextStage'>,
): CoachProgressPayload | null {
  const parts = token.split('.')
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null

  try {
    const expectedSignature = createHmac('sha256', secret).update(parts[0]).digest()
    const suppliedSignature = Buffer.from(parts[1], 'base64url')
    if (suppliedSignature.length !== expectedSignature.length
      || !timingSafeEqual(suppliedSignature, expectedSignature)) return null

    const payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')) as CoachProgressPayload
    const valid = payload.v === 3
      && payload.userId === expected.userId
      && payload.attemptId === expected.attemptId
      && payload.questionId === expected.questionId
      && payload.nextStage === expected.nextStage
      && typeof payload.sessionId === 'string'
      && z.string().uuid().safeParse(payload.sessionId).success
      && Number.isInteger(payload.initialSelectedOption)
      && payload.initialSelectedOption >= 0
      && payload.initialSelectedOption <= 4
      && Number.isInteger(payload.exp)
      && payload.exp > Date.now()
    if (!valid) return null
    if (payload.nextStage === 'transfer'
      && !z.string().uuid().safeParse(payload.transferQuestionId).success) return null
    return payload
  } catch {
    return null
  }
}

function primaryOutcomeTitle(row: QuestionRow): string | null {
  const primary = (row.question_outcomes ?? []).filter((item) => item.is_primary)
  if (primary.length !== 1) return null
  const related = primary[0]?.curriculum_outcomes
  if (Array.isArray(related) && related.length !== 1) return null
  const outcome = Array.isArray(related) ? related[0] : related
  if (outcome?.is_active !== true) return null
  const title = outcome.title
  return typeof title === 'string' && title.trim() ? title.trim() : null
}

function answerDetails(content: StagedCoachQuestionContent) {
  const answerText = content.options[content.answer] ?? null
  const answerLetter = content.answer >= 0 && content.answer < 26
    ? String.fromCharCode(65 + content.answer)
    : null
  return { answerText, answerLetter }
}

/**
 * Koc ipucu metnini uretir. Prompt tamamen sunucuda, yalnizca DB-onayli soru /
 * cozum / kazanim baglamindan kurulur; istemci serbest metin gonderemez.
 *
 * Gemini'nin safetySettings + finishReason katmani DeepSeek'te yok. Koc icin
 * asil koruma zaten sonraki adimdaki evaluateCoachText sizinti kontrolu: model
 * cevabi nihai cevabi ele veriyorsa 'fallback'e dusulur. Prompt kullanici
 * metni icermedigi icin injection yuzeyi chat route'una gore cok dardir.
 */
async function generateCoachText(prompt: string): Promise<string | null> {
  if (process.env.COACH_AI_ENABLED !== 'true') return null
  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) return null

  const response = await fetch(DEEPSEEK_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(8_000),
    body: JSON.stringify({
      model: DEEPSEEK_MODEL,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 180,
      temperature: 0,
      stream: false,
    }),
  })
  if (!response.ok) return null
  const json = await response.json().catch(() => null)
  const choice = json?.choices?.[0]
  // Kesilmis uretim yarim/yaniltici ipucu birakabilir; guvenli tarafta kal.
  if (!choice || choice.finish_reason === 'content_filter' || choice.finish_reason === 'length') {
    return null
  }
  const text = choice.message?.content
  return typeof text === 'string' && text.trim() ? text.trim().slice(0, 700) : null
}

async function resolveGuidance(
  stage: 'hint1' | 'hint2' | 'hint3',
  question: QuestionRow,
  content: StagedCoachQuestionContent & { solution: string },
  selectedOption: number,
): Promise<{ text: string; source: Extract<CoachContentSource, 'authored' | 'ai' | 'fallback'> }> {
  const { answerText, answerLetter } = answerDetails(content)
  const authored = authoredCoachText(stage, content, selectedOption)
  if (authored && evaluateCoachText(stage, authored, answerText, answerLetter)) {
    return { text: authored, source: 'authored' }
  }

  const outcomeTitle = primaryOutcomeTitle(question)
  if (outcomeTitle) {
    try {
      const generated = await generateCoachText(buildCoachPrompt(stage, {
        question: content.question,
        category: question.category,
        topic: question.topic,
        outcomeTitle,
        selectedOptionText: content.options[selectedOption] ?? '',
        solution: content.solution,
      }))
      if (generated && evaluateCoachText(stage, generated, answerText, answerLetter)) {
        return { text: generated, source: 'ai' }
      }
    } catch (error) {
      console.error('[CoachHint] model bağlantı hatası:', error instanceof Error ? error.name : 'unknown')
    }
  }

  return { text: fallbackHint(stage), source: 'fallback' }
}

function hashCoachContent(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

function publicCoachResponse(body: unknown) {
  const parsed = coachPublicResponseSchema.safeParse(body)
  if (!parsed.success) {
    console.error('[CoachHint] public sözleşme oluşturulamadı')
    return noStoreJson({ error: 'Koç yanıtı doğrulanamadı' }, { status: 500 })
  }
  return noStoreJson(parsed.data)
}

function rpcFailureStatus(code: string | undefined): number {
  return code === '22023' || code === '23514' || code === 'P0001' ? 409 : 500
}

/**
 * POST /api/coach/hint
 *
 * İstemci serbest prompt veya akademik bağlam gönderemez. Yardım, owner'a ait
 * aktif verified attempt + ilk seçenek denemesiyle başlar; imzalı zincir
 * hint1 → hint2 → küçük örnek → çözüm → bağımsız transfer sırasını zorlar.
 */
export async function POST(request: Request) {
  if (process.env.COACH_ENABLED !== 'true') {
    return noStoreJson({ error: 'Koç servisi devre dışı' }, { status: 503 })
  }

  const ip = getClientIp(request.headers)
  const ipRl = await ipLimiter.check(ip)
  if (!ipRl.success) {
    return noStoreJson(
      { error: 'Çok fazla istek' },
      { status: 429, headers: { 'Retry-After': String(ipRl.retryAfter ?? 60) } },
    )
  }

  const cookieClient = await createClient()
  const { data: { user } } = await cookieClient.auth.getUser()
  if (!user) return noStoreJson({ error: 'Yetkisiz' }, { status: 401 })

  const userRl = await userLimiter.check(user.id)
  if (!userRl.success) {
    return noStoreJson(
      { error: 'Çok fazla istek' },
      { status: 429, headers: { 'Retry-After': String(userRl.retryAfter ?? 60) } },
    )
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return noStoreJson({ error: 'Geçersiz istek' }, { status: 400 })

  const secret = coachTokenSecret()
  if (!secret) {
    console.error('[CoachHint] ayrı COACH_TOKEN_SECRET tanımlı değil')
    return noStoreJson({ error: 'Koç servisi yapılandırılmamış' }, { status: 503 })
  }

  const { attemptId, questionId, requestId, selectedOption, stage, token } = parsed.data
  let progress: CoachProgressPayload | null = null
  if (stage !== 'hint1') {
    progress = verifyCoachToken(token!, secret, {
      userId: user.id,
      attemptId,
      questionId,
      nextStage: stage,
    })
    if (!progress) {
      return noStoreJson({ error: 'Geçersiz veya süresi dolmuş Koç sırası' }, { status: 409 })
    }
  }

  const supabase = createServiceRoleClient()
  const { data: attemptData, error: attemptError } = await supabase
    .from('verified_attempts')
    .select('id, user_id, question_ids, expires_at, completed_at')
    .eq('id', attemptId)
    .eq('user_id', user.id)
    .maybeSingle()
  const activeAttempt = attemptData as AttemptRow | null
  if (attemptError) {
    console.error('[CoachHint] attempt sorgu hatası:', attemptError.code)
    return noStoreJson({ error: 'Sorgu başarısız' }, { status: 500 })
  }
  if (
    !activeAttempt
    || activeAttempt.completed_at !== null
    || !Array.isArray(activeAttempt.question_ids)
    || !activeAttempt.question_ids.includes(questionId)
    || !Number.isFinite(Date.parse(activeAttempt.expires_at))
    || Date.parse(activeAttempt.expires_at) <= Date.now()
  ) {
    return noStoreJson({ error: 'Geçersiz veya süresi dolmuş deneme' }, { status: 409 })
  }

  const { data, error } = await supabase
    .from('questions')
    .select('id, game, category, topic, content, question_outcomes(outcome_id, is_primary, curriculum_outcomes(title, is_active))')
    .eq('id', questionId)
    .eq('is_active', true)
    .maybeSingle()

  if (error) {
    console.error('[CoachHint] soru sorgu hatası:', error.code)
    return noStoreJson({ error: 'Sorgu başarısız' }, { status: 500 })
  }
  if (!data) return noStoreJson({ error: 'Soru bulunamadı' }, { status: 404 })

  const question = data as unknown as QuestionRow
  if (!supportsGuidedCoachQuestion(question.content) || !primaryOutcomeTitle(question)) {
    return noStoreJson({ error: 'Bu soru kontrollü Koç için hazır değil' }, { status: 422 })
  }
  const content = question.content

  if (stage === 'hint1' && (selectedOption! >= content.options.length)) {
    return noStoreJson({ error: 'Geçersiz ilk deneme' }, { status: 400 })
  }
  if (progress && progress.initialSelectedOption >= content.options.length) {
    return noStoreJson({ error: 'Koç oturumu doğrulanamadı' }, { status: 409 })
  }

  if (stage === 'transfer') {
    if (!progress?.transferQuestionId) {
      return noStoreJson({ error: 'Transfer sorusu doğrulanamadı' }, { status: 409 })
    }
    const { data: resultData, error: resultError } = await supabase.rpc('answer_verified_coach_transfer', {
      p_session_id: progress.sessionId,
      p_user_id: user.id,
      p_request_id: requestId,
      p_selected_option: selectedOption!,
    })
    const result = transferResultSchema.safeParse(resultData)
    if (resultError || !result.success || result.data.transferQuestionId !== progress.transferQuestionId) {
      console.error('[CoachHint] transfer kaydı başarısız:', resultError?.code ?? 'invalid_result')
      return noStoreJson(
        { error: 'Transfer cevabı kaydedilemedi' },
        { status: rpcFailureStatus(resultError?.code) },
      )
    }
    return publicCoachResponse({
      sessionId: progress.sessionId,
      stage: 'transfer',
      isCorrect: result.data.isCorrect,
      correctOption: result.data.correctOption,
      solution: result.data.solution,
      source: 'approved_transfer',
      sourceLabel: coachSourceLabel('approved_transfer'),
      evaluation: { passed: true, policyVersion: COACH_POLICY_VERSION },
      nextToken: null,
    })
  }

  let sessionId: string
  let initialSelectedOption: number
  if (stage === 'hint1') {
    const { data: startData, error: startError } = await supabase.rpc('start_verified_coach_session', {
      p_attempt_id: attemptId,
      p_user_id: user.id,
      p_question_id: questionId,
      p_selected_option: selectedOption!,
    })
    const started = startResultSchema.safeParse(startData)
    if (startError || !started.success || Date.parse(started.data.expiresAt) <= Date.now()) {
      console.error('[CoachHint] Koç oturumu başlatılamadı:', startError?.code ?? 'invalid_result')
      return noStoreJson(
        { error: 'Koç oturumu başlatılamadı' },
        { status: rpcFailureStatus(startError?.code) },
      )
    }
    sessionId = started.data.sessionId
    initialSelectedOption = selectedOption!
  } else {
    sessionId = progress!.sessionId
    initialSelectedOption = progress!.initialSelectedOption
  }

  const stageNumber = stage === 'hint1' ? 1 : stage === 'hint2' ? 2 : stage === 'hint3' ? 3 : 4
  let candidateText: string | null
  let candidateSource: Exclude<CoachContentSource, 'approved_transfer'>
  if (stage === 'solution') {
    candidateText = null
    candidateSource = 'solution'
  } else {
    const guidance = await resolveGuidance(stage, question, content, initialSelectedOption)
    candidateText = guidance.text
    candidateSource = guidance.source
  }

  const contentForHash = stage === 'solution' ? content.solution.trim().slice(0, 2_000) : candidateText!
  const { data: advanceData, error: advanceError } = await supabase.rpc('advance_verified_coach_stage', {
    p_session_id: sessionId,
    p_user_id: user.id,
    p_stage: stageNumber,
    p_request_id: requestId,
    p_response_text: candidateText,
    p_source: candidateSource,
    p_evaluation_passed: true,
    p_policy_version: COACH_POLICY_VERSION,
    p_content_sha256: hashCoachContent(contentForHash),
  })
  const advanced = advanceResultSchema.safeParse(advanceData)
  if (advanceError || !advanced.success) {
    console.error('[CoachHint] Koç aşaması kaydedilemedi:', advanceError?.code ?? 'invalid_result')
    return noStoreJson(
      { error: 'Koç aşaması kaydedilemedi' },
      { status: rpcFailureStatus(advanceError?.code) },
    )
  }

  if (stage !== 'solution') {
    if (!advanced.data.responseText || advanced.data.transferQuestionId !== null) {
      return noStoreJson({ error: 'Koç aşaması doğrulanamadı' }, { status: 500 })
    }
    const nextToken = signCoachToken({
      v: 3,
      userId: user.id,
      attemptId,
      questionId,
      sessionId,
      initialSelectedOption,
      nextStage: nextStage(stage),
      exp: Date.now() + COACH_TOKEN_TTL_MS,
    }, secret)
    return publicCoachResponse({
      sessionId,
      stage,
      hint: advanced.data.responseText,
      source: advanced.data.source,
      sourceLabel: coachSourceLabel(advanced.data.source),
      evaluation: {
        passed: advanced.data.evaluationPassed,
        policyVersion: advanced.data.policyVersion,
      },
      nextToken,
    })
  }

  if (advanced.data.responseText !== null || !advanced.data.transferQuestionId) {
    return noStoreJson({ error: 'Transfer sorusu hazırlanamadı' }, { status: 500 })
  }
  const { data: transferData, error: transferError } = await supabase
    .from('questions')
    .select('*')
    .eq('id', advanced.data.transferQuestionId)
    .eq('is_active', true)
    .maybeSingle()
  const transferDomain = transferData
    ? toDomainQuestion(transferData as unknown as PublicQuestionRow)
    : null
  if (transferError || !transferDomain || transferDomain.id === questionId || transferDomain.game !== question.game) {
    console.error('[CoachHint] transfer sorusu yüklenemedi:', transferError?.code ?? 'invalid_result')
    return noStoreJson({ error: 'Transfer sorusu hazırlanamadı' }, { status: 500 })
  }
  const transferQuestion = toPublicQuestion(transferDomain)
  const nextToken = signCoachToken({
    v: 3,
    userId: user.id,
    attemptId,
    questionId,
    sessionId,
    initialSelectedOption,
    nextStage: 'transfer',
    transferQuestionId: transferQuestion.id,
    exp: Date.now() + COACH_TOKEN_TTL_MS,
  }, secret)
  return publicCoachResponse({
    sessionId,
    stage: 'solution',
    hint: content.solution.trim().slice(0, 2_000),
    source: 'solution',
    sourceLabel: coachSourceLabel('solution'),
    evaluation: {
      passed: advanced.data.evaluationPassed,
      policyVersion: advanced.data.policyVersion,
    },
    transferQuestion,
    nextToken,
  })
}
