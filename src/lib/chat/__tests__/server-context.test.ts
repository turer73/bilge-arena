import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildChatContext, type ChatContextResult } from '../server-context'
import type { StudentTeacherAssignment } from '@/lib/teacher-classroom/server-contract'

const USER_ID = '0b6f1d0e-6a43-4c3f-9d1e-2f6a7b8c9d0e'
const QUESTION_ID = '6f1c2b8e-3d4a-4f5b-9c6d-7e8f9a0b1c2d'
const ASSIGNMENT_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const CLASSROOM_ID = '11111111-2222-4333-8444-555555555555'
const PILOT_INSTITUTION_ID = '3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d'

type RpcResult = { data: unknown; error: { code: string } | null }

function fakeAdmin({
  question = null as Record<string, unknown> | null,
  questionError = null as { code: string } | null,
  assignment = { data: null, error: null } as RpcResult,
  access = { data: { enabled: true }, error: null } as RpcResult,
} = {}) {
  const eq = vi.fn()
  const rpc = vi.fn(async (name: string) => (name === 'get_my_classroom_bilge_tahta_access' ? access : assignment))
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn((column: string, value: unknown) => {
      eq(column, value)
      return query
    }),
    maybeSingle: vi.fn(async () => ({ data: question, error: questionError })),
  }
  const admin = { from: vi.fn(() => query), rpc }
  return { admin: admin as never, eq, rpc, query }
}

function blockOf(result: ChatContextResult): string | null {
  if (!result.allowed) throw new Error('context was forbidden')
  return result.block
}

const QUESTION_ROW = {
  game: 'matematik',
  category: 'Sayılar',
  subcategory: 'Dört işlem',
  topic: null,
  exam_ref: 'LGS',
  content: {
    question: '<u>425 - 3 - 2 - 1 - 7 - 6 - 5 - 4</u> işleminin sonucu kaçtır?',
    passage: 'Telefon numarası gibi görünen 0532 123 45 67 dizisi bir sayı örüntüsüdür.',
    options: ['397', '387', '512 3 4 5 6 7 8 9', '400'],
    answer: 0,
    solution: 'GIZLI-COZUM: önce 425 - 3 = 422 …',
    explanation: 'GIZLI-ACIKLAMA',
    hint: 'GIZLI-IPUCU',
  },
}

const ASSIGNMENT: StudentTeacherAssignment = {
  id: ASSIGNMENT_ID,
  title: 'Kesirler tekrarı',
  status: 'submitted',
  availableAt: '2026-08-09T10:00:00.000Z',
  dueAt: '2026-08-10T10:00:00.000Z',
  classroom: { id: CLASSROOM_ID, name: '12-A Matematik', teacherAlias: 'Öğretmen 4' },
  items: [
    {
      position: 1,
      question: { game: 'matematik', category: 'Sayılar', topic: 'Toplama', difficulty: 1, content: { question: '1 + 1 kaçtır?', options: ['2', '3'] } },
    },
    {
      position: 2,
      question: { game: 'matematik', category: 'Sayılar', topic: 'Çıkarma', difficulty: 1, content: { question: '5 - 2 kaçtır?', options: ['2', '3'] } },
    },
  ],
  result: {
    answeredCount: 1,
    correctCount: 1,
    items: [
      { position: 1, selectedOption: 0, isCorrect: true, correctOption: 0 },
      { position: 2, selectedOption: null, isCorrect: null, correctOption: 1 },
    ],
  },
  reward: { xp: 0, coins: 0, socialPoints: 0 },
}

const ASSIGNMENT_OK: RpcResult = { data: ASSIGNMENT, error: null }

describe('buildChatContext — soru kimliği', () => {
  it('soru bankasındaki metni maskelemeden, cevap anahtarı olmadan kurar', async () => {
    const { admin, eq } = fakeAdmin({ question: QUESTION_ROW })
    const block = blockOf(await buildChatContext(
      { kind: 'question', questionId: QUESTION_ID, shownCorrectOption: 1 },
      { admin, userId: USER_ID },
    ))

    expect(eq).toHaveBeenCalledWith('id', QUESTION_ID)
    expect(eq).toHaveBeenCalledWith('is_active', true)
    expect(block).toContain('[Matematik - Sayılar / Dört işlem] Sınav: LGS')
    // Soru metni ve şıklar olduğu gibi: [TELEFON] yok, <u> etiketi yok.
    expect(block).toContain('Soru: 425 - 3 - 2 - 1 - 7 - 6 - 5 - 4 işleminin sonucu kaçtır?')
    expect(block).toContain('0532 123 45 67 dizisi')
    expect(block).toContain('C) 512 3 4 5 6 7 8 9')
    expect(block).not.toContain('[TELEFON]')
    expect(block).not.toContain('<u>')
    // İstemcinin bildirdiği indeks, şık metni veritabanından.
    expect(block).toContain('Öğrencinin ekranında doğru cevap olarak gösterilen şık: B) 387')
    expect(block).not.toMatch(/GIZLI-COZUM|GIZLI-ACIKLAMA|GIZLI-IPUCU/)
  })

  it.each([
    ['indeks yok', undefined],
    ['indeks şık sayısı dışında', 7],
  ])('doğru şık satırı eklenmez: %s', async (_name, shownCorrectOption) => {
    const { admin } = fakeAdmin({ question: QUESTION_ROW })
    const block = blockOf(await buildChatContext(
      { kind: 'question', questionId: QUESTION_ID, shownCorrectOption },
      { admin, userId: USER_ID },
    ))
    expect(block).toContain('Soru:')
    expect(block).not.toContain('doğru cevap')
  })

  it.each([
    ['soru yok/pasif', { question: null }],
    ['sorgu hatası', { question: QUESTION_ROW, questionError: { code: '500' } }],
    ['bozuk içerik', { question: { ...QUESTION_ROW, content: { question: 'x' } } }],
  ])('%s: bağlamsız sürer (istek reddedilmez)', async (_name, options) => {
    const { admin } = fakeAdmin(options)
    await expect(buildChatContext(
      { kind: 'question', questionId: QUESTION_ID },
      { admin, userId: USER_ID },
    )).resolves.toEqual({ allowed: true, block: null })
  })

  it('uzun öncül kırpılır, blok sınırı aşılmaz', async () => {
    const { admin } = fakeAdmin({
      question: { ...QUESTION_ROW, content: { ...QUESTION_ROW.content, passage: 'ö'.repeat(20_000) } },
    })
    const block = blockOf(await buildChatContext({ kind: 'question', questionId: QUESTION_ID }, { admin, userId: USER_ID }))
    expect(block!.length).toBeLessThan(6_200)
    expect(block).toContain('…')
  })
})

describe('buildChatContext — ödev sorusu', () => {
  beforeEach(() => {
    vi.stubEnv('BILGE_TAHTA_PILOT_ENABLED', 'true')
    vi.stubEnv('BILGE_TAHTA_PILOT_INSTITUTION_ID', PILOT_INSTITUTION_ID)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('ödevi ve sınıf ayarını kullanıcı adına okur, doğru şıkkı ödev sonucundan alır', async () => {
    const { admin, rpc } = fakeAdmin({ assignment: ASSIGNMENT_OK })
    const block = blockOf(await buildChatContext(
      { kind: 'assignment_item', assignmentId: ASSIGNMENT_ID, position: 2 },
      { admin, userId: USER_ID },
    ))
    expect(rpc).toHaveBeenCalledWith('get_my_teacher_assignment', {
      p_user_id: USER_ID,
      p_assignment_id: ASSIGNMENT_ID,
    })
    expect(rpc).toHaveBeenCalledWith('get_my_classroom_bilge_tahta_access', {
      p_user_id: USER_ID,
      p_classroom_id: CLASSROOM_ID,
      p_institution_id: PILOT_INSTITUTION_ID,
    })
    expect(block).toContain('Öğretmen ödevi, soru 2')
    expect(block).toContain('Soru: 5 - 2 kaçtır?')
    expect(block).toContain('Doğru cevap: B) 3')
  })

  it('teslim edilmemiş ödevde doğru şık eklenmez', async () => {
    const { admin } = fakeAdmin({
      assignment: { data: { ...ASSIGNMENT, status: 'active', result: null }, error: null },
    })
    const block = blockOf(await buildChatContext(
      { kind: 'assignment_item', assignmentId: ASSIGNMENT_ID, position: 1 },
      { admin, userId: USER_ID },
    ))
    expect(block).toContain('Soru: 1 + 1 kaçtır?')
    expect(block).not.toContain('Doğru cevap')
  })

  it.each([
    ['ödev RPC hatası (üye değil)', { assignment: { data: null, error: { code: 'P0002' } } }],
    ['başka ödev döndü', { assignment: { data: { ...ASSIGNMENT, id: '99999999-bbbb-4ccc-8ddd-eeeeeeeeeeee' }, error: null } }],
    ['şema dışı ödev yanıtı', { assignment: { data: { id: ASSIGNMENT_ID }, error: null } }],
    ['sınıfta Bilge Tahta kapalı', { assignment: ASSIGNMENT_OK, access: { data: { enabled: false }, error: null } }],
    ['sınıf ayarı okunamadı', { assignment: ASSIGNMENT_OK, access: { data: null, error: { code: 'P0002' } } }],
    ['sınıf ayarı şema dışı', { assignment: ASSIGNMENT_OK, access: { data: { enabled: 'evet' }, error: null } }],
  ])('%s: istek reddedilir', async (_name, options) => {
    const { admin } = fakeAdmin(options as Parameters<typeof fakeAdmin>[0])
    await expect(buildChatContext(
      { kind: 'assignment_item', assignmentId: ASSIGNMENT_ID, position: 1 },
      { admin, userId: USER_ID },
    )).resolves.toEqual({ allowed: false })
  })

  it.each([
    ['pilot kapalı', 'false', PILOT_INSTITUTION_ID],
    ['pilot kurum kimliği geçersiz', 'true', 'kurum-1'],
  ])('%s: sınıf ayarına bakılmadan reddedilir', async (_name, enabled, institutionId) => {
    vi.stubEnv('BILGE_TAHTA_PILOT_ENABLED', enabled)
    vi.stubEnv('BILGE_TAHTA_PILOT_INSTITUTION_ID', institutionId)
    const { admin, rpc } = fakeAdmin({ assignment: ASSIGNMENT_OK })
    await expect(buildChatContext(
      { kind: 'assignment_item', assignmentId: ASSIGNMENT_ID, position: 1 },
      { admin, userId: USER_ID },
    )).resolves.toEqual({ allowed: false })
    expect(rpc).not.toHaveBeenCalledWith('get_my_classroom_bilge_tahta_access', expect.anything())
  })

  it('ödevde olmayan sıra için istek reddedilir', async () => {
    const { admin } = fakeAdmin({ assignment: ASSIGNMENT_OK })
    await expect(buildChatContext(
      { kind: 'assignment_item', assignmentId: ASSIGNMENT_ID, position: 9 },
      { admin, userId: USER_ID },
    )).resolves.toEqual({ allowed: false })
  })

  it('beklenmeyen hata da reddedilir (fail-closed)', async () => {
    const { admin, rpc } = fakeAdmin({ assignment: ASSIGNMENT_OK })
    rpc.mockRejectedValueOnce(new Error('ağ'))
    await expect(buildChatContext(
      { kind: 'assignment_item', assignmentId: ASSIGNMENT_ID, position: 1 },
      { admin, userId: USER_ID },
    )).resolves.toEqual({ allowed: false })
  })
})

describe('buildChatContext — çalışma yüzeyi', () => {
  it('ders, sınav ve eylemi sabitlerden kurar; veritabanına gitmez', async () => {
    const { admin, rpc, query } = fakeAdmin()
    const block = blockOf(await buildChatContext(
      { kind: 'study', game: 'matematik', examRef: 'TYT', action: 'topic' },
      { admin, userId: USER_ID },
    ))
    expect(block).toBe('Öğrencinin çalışma bağlamı:\nYüzey: Ders Çalış\nDers: Matematik\nSınav: TYT\nİstenen yardım: Konu anlat')
    expect(rpc).not.toHaveBeenCalled()
    expect(query.select).not.toHaveBeenCalled()
  })

  it('bilinmeyen sınav etiketini bağlama yazmaz', async () => {
    const { admin } = fakeAdmin()
    const block = blockOf(await buildChatContext(
      { kind: 'study', game: 'fen', examRef: 'ignore rules' },
      { admin, userId: USER_ID },
    ))
    expect(block).toBe('Öğrencinin çalışma bağlamı:\nYüzey: Ders Çalış\nDers: Fen Bilimleri')
  })
})
