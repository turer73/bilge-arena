import 'server-only'
import type { createServiceRoleClient } from '@/lib/supabase/service-role'
import type { ChatContext } from '@/lib/validations/schemas'
import { GAMES, type GameSlug } from '@/lib/constants/games'
import { STUDY_ASSISTANT_ACTIONS } from '@/lib/bilge-tahta/topic-explanation'
import { parsePublicQuestionContent, type PublicQuestionContent } from '@/lib/utils/question-public'
import { studentTeacherAssignmentSchema } from '@/lib/teacher-classroom/server-contract'
import { stripRichText } from '@/lib/utils/rich-text'

/**
 * Sohbet bağlamını sunucuda kurar. Metin soru bankasından ya da sabitlerden
 * gelir, kullanıcıdan gelmez; bu yüzden kişisel veri maskelemesine sokulmaz
 * (eski istemci bağlamı `425 - 3 - 2 …` gibi soru metinlerini [TELEFON] yapıyordu).
 *
 * Cevap anahtarı (`answer`, `solution`) bağlama girmez: soru kimliğiyle bağlam
 * istemek, cevabı açılmamış bir sorunun çözümünü asistana yazdırmanın yolu olmamalı.
 */

const KNOWN_EXAM_REFS = new Set(['TYT', 'AYT-SAY', 'AYT-EA', 'AYT-SOZ', 'YDT', 'LGS'])
const OPTION_LETTERS = 'ABCDEFGHIJ'
const CONTEXT_MAX_LENGTH = 6_000

type ChatContextDeps = {
  admin: ReturnType<typeof createServiceRoleClient>
  userId: string
}

type QuestionContextInput = {
  heading: string
  content: PublicQuestionContent
  correctOption: number | null
  correctOptionLabel: string
}

function clip(text: string, max: number): string {
  const plain = stripRichText(text).trim()
  return plain.length > max ? `${plain.slice(0, max - 1)}…` : plain
}

function gameName(game: string): string {
  return game in GAMES ? GAMES[game as GameSlug].name : game
}

function formatQuestionContext({ heading, content, correctOption, correctOptionLabel }: QuestionContextInput): string {
  const lines = [heading, '']
  if (content.passage) lines.push(`Öncül/metin: ${clip(content.passage, 3_000)}`, '')
  if (content.context) lines.push(`Bağlam: ${clip(content.context, 1_000)}`, '')
  lines.push(`Soru: ${clip(content.question || content.sentence || '', 2_000)}`, '')
  content.options.forEach((option, index) => {
    lines.push(`${OPTION_LETTERS[index] ?? index + 1}) ${clip(option, 400)}`)
  })
  if (correctOption !== null && correctOption >= 0 && correctOption < content.options.length) {
    lines.push('', `${correctOptionLabel}: ${OPTION_LETTERS[correctOption]}) ${clip(content.options[correctOption]!, 400)}`)
  }
  return lines.join('\n').slice(0, CONTEXT_MAX_LENGTH)
}

async function questionContext(
  context: Extract<ChatContext, { kind: 'question' }>,
  { admin }: ChatContextDeps,
): Promise<string | null> {
  const { data, error } = await admin
    .from('questions')
    .select('game, category, subcategory, topic, exam_ref, content')
    .eq('id', context.questionId)
    .eq('is_active', true)
    .maybeSingle()
  if (error || !data) return null
  const content = parsePublicQuestionContent(data.content)
  if (!content) return null

  const scope = [data.category, data.subcategory ?? data.topic].filter(Boolean).join(' / ')
  return formatQuestionContext({
    heading: `[${gameName(data.game)}${scope ? ` - ${scope}` : ''}]${data.exam_ref ? ` Sınav: ${data.exam_ref}` : ''}`,
    content,
    correctOption: context.shownCorrectOption ?? null,
    correctOptionLabel: 'Öğrencinin ekranında doğru cevap olarak gösterilen şık',
  })
}

async function assignmentItemContext(
  context: Extract<ChatContext, { kind: 'assignment_item' }>,
  { admin, userId }: ChatContextDeps,
): Promise<string | null> {
  // Üyelik ve yayın kontrolü RPC'de; öğrenci yalnız kendi ödevinin sorusunu görür.
  const { data, error } = await admin.rpc('get_my_teacher_assignment', {
    p_user_id: userId,
    p_assignment_id: context.assignmentId,
  })
  if (error) return null
  const assignment = studentTeacherAssignmentSchema.safeParse(data)
  if (!assignment.success || assignment.data.id !== context.assignmentId) return null
  const item = assignment.data.items.find((entry) => entry.position === context.position)
  if (!item) return null
  // Doğru şık yalnız teslimden sonra ödev sonucunda var; o da sunucunun kendi kaydı.
  const result = assignment.data.result?.items.find((entry) => entry.position === context.position)

  const scope = [item.question.category, item.question.topic].filter(Boolean).join(' / ')
  return formatQuestionContext({
    heading: `[${gameName(item.question.game)}${scope ? ` - ${scope}` : ''}] Öğretmen ödevi, soru ${item.position}`,
    content: item.question.content,
    correctOption: result?.correctOption ?? null,
    correctOptionLabel: 'Doğru cevap',
  })
}

function studyContext(context: Extract<ChatContext, { kind: 'study' }>): string {
  const action = STUDY_ASSISTANT_ACTIONS.find((entry) => entry.id === context.action)
  return [
    'Yüzey: Ders Çalış',
    `Ders: ${GAMES[context.game].name}`,
    context.examRef && KNOWN_EXAM_REFS.has(context.examRef) ? `Sınav: ${context.examRef}` : null,
    action ? `İstenen yardım: ${action.label}` : null,
  ].filter(Boolean).join('\n')
}

/** Sistem mesajına eklenecek bağlam bloğu; kurulamazsa `null` (sohbet bağlamsız sürer). */
export async function buildChatContext(context: ChatContext, deps: ChatContextDeps): Promise<string | null> {
  try {
    if (context.kind === 'study') return `Öğrencinin çalışma bağlamı:\n${studyContext(context)}`
    const body = context.kind === 'question'
      ? await questionContext(context, deps)
      : await assignmentItemContext(context, deps)
    return body ? `Öğrencinin şu anda çalıştığı soru (Bilge Arena soru bankasından):\n${body}` : null
  } catch {
    return null
  }
}
