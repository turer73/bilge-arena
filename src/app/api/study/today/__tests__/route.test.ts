import { describe, it, expect, vi, beforeEach } from 'vitest'

// Esnek queue-tabanli mock'lar. daily_plan tablosu 3 farkli zincir kullanir
// (select->maybeSingle / insert->single / update->single) -- ayri kuyruklarla
// ayristirilir ki insert/update cagri-argumanlari da yakalanabilsin.
const {
  mockGetUser,
  mockRpc,
  mockFetchDue,
  mockComputeStrengths,
  dailyPlanMock,
  questionsMock,
  historyMock,
  profileMock,
} = vi.hoisted(() => {
  function makeDailyPlanMock() {
    const selectQueue: { data: unknown; error?: unknown }[] = []
    const insertQueue: { data: unknown; error?: unknown }[] = []
    const updateQueue: { data: unknown; error?: unknown }[] = []
    const insertCalls: unknown[] = []
    const updateCalls: unknown[] = []

    const from = vi.fn(() => {
      let mode: 'select' | 'insert' | 'update' = 'select'
      const chain: Record<string, unknown> = {}
      chain.select = vi.fn(() => chain)
      chain.eq = vi.fn(() => chain)
      chain.is = vi.fn(() => chain)
      chain.insert = vi.fn((obj: unknown) => {
        mode = 'insert'
        insertCalls.push(obj)
        return chain
      })
      chain.update = vi.fn((obj: unknown) => {
        mode = 'update'
        updateCalls.push(obj)
        return chain
      })
      chain.maybeSingle = vi.fn(() =>
        Promise.resolve(selectQueue.length > 0 ? selectQueue.shift()! : { data: null, error: null }),
      )
      chain.single = vi.fn(() => {
        if (mode === 'insert') {
          return Promise.resolve(insertQueue.length > 0 ? insertQueue.shift()! : { data: null, error: null })
        }
        if (mode === 'update') {
          return Promise.resolve(updateQueue.length > 0 ? updateQueue.shift()! : { data: null, error: null })
        }
        return Promise.resolve({ data: null, error: null })
      })
      return chain
    })

    return {
      from,
      pushSelect: (r: { data: unknown; error?: unknown }) => selectQueue.push(r),
      pushInsert: (r: { data: unknown; error?: unknown }) => insertQueue.push(r),
      pushUpdate: (r: { data: unknown; error?: unknown }) => updateQueue.push(r),
      insertCalls,
      updateCalls,
      reset: () => {
        selectQueue.length = 0
        insertQueue.length = 0
        updateQueue.length = 0
        insertCalls.length = 0
        updateCalls.length = 0
      },
    }
  }

  function makeReadTableMock(defaultResult: { data: unknown; error?: unknown } = { data: [], error: null }) {
    const queue: { data: unknown; error?: unknown }[] = []
    const from = vi.fn(() => {
      const result = queue.length > 0 ? queue.shift()! : defaultResult
      const chain: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'is', 'order', 'limit', 'in']) {
        chain[m] = vi.fn(() => chain)
      }
      chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve(result).then(resolve, reject)
      chain.maybeSingle = vi.fn(() => Promise.resolve(result))
      return chain
    })
    return { from, push: (r: { data: unknown; error?: unknown }) => queue.push(r), reset: () => { queue.length = 0 } }
  }

  return {
    mockGetUser: vi.fn(),
    mockRpc: vi.fn(),
    mockFetchDue: vi.fn(),
    mockComputeStrengths: vi.fn(),
    dailyPlanMock: makeDailyPlanMock(),
    questionsMock: makeReadTableMock(),
    historyMock: makeReadTableMock(),
    profileMock: makeReadTableMock({ data: { exam_type: null }, error: null }),
  }
})

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mockGetUser } })),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => ({
    rpc: mockRpc,
    from: vi.fn((table: string) => {
      if (table === 'daily_plan') return dailyPlanMock.from()
      if (table === 'questions') return questionsMock.from()
      if (table === 'user_question_history') return historyMock.from()
      if (table === 'profiles') return profileMock.from()
      throw new Error(`unexpected table: ${table}`)
    }),
  })),
}))

vi.mock('@/lib/utils/rate-limit', () => ({
  createRateLimiter: vi.fn(() => ({ check: vi.fn(async () => ({ success: true })) })),
}))

vi.mock('@/lib/review/due-questions', () => ({ fetchDueQuestions: mockFetchDue }))
vi.mock('@/lib/review/topic-strengths', () => ({ computeTopicStrengths: mockComputeStrengths }))

import { GET, PATCH } from '../route'

const U1 = '11111111-1111-1111-1111-111111111111'

function uid(n: number): string {
  return `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`
}

function makeGetRequest(params: Record<string, string> = {}) {
  const url = new URL('http://localhost/api/study/today')
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const headers = new Headers()
  headers.set('x-forwarded-for', '1.2.3.4')
  return new Request(url.toString(), { headers })
}

function makePatchRequest(body: unknown) {
  const headers = new Headers()
  headers.set('x-forwarded-for', '1.2.3.4')
  headers.set('Content-Type', 'application/json')
  return new Request('http://localhost/api/study/today', {
    method: 'PATCH',
    headers,
    body: JSON.stringify(body),
  })
}

describe('GET /api/study/today', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dailyPlanMock.reset()
    questionsMock.reset()
    historyMock.reset()
    profileMock.reset()
  })

  it('401 doner kullanici auth degilse', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await GET(makeGetRequest({ game: 'matematik' }) as never)
    expect(res.status).toBe(401)
  })

  it('400 doner game eksik/gecersizse', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: U1 } } })
    const res = await GET(makeGetRequest({ game: 'gecersiz' }) as never)
    expect(res.status).toBe(400)
  })

  it('400 doner exam_ref allowlist disindaysa', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: U1 } } })
    const res = await GET(makeGetRequest({ game: 'matematik', exam_ref: 'LGS_OR_1_1' }) as never)
    expect(res.status).toBe(400)
    expect(dailyPlanMock.from).not.toHaveBeenCalled()
  })

  it('bugunku plan zaten varsa yeniden uretmez, aynen doner (idempotent)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: U1 } } })
    const qids = [uid(1), uid(2), uid(3)]
    dailyPlanMock.pushSelect({
      data: { id: 'plan-1', plan_date: '2026-07-21', question_ids: qids, completed_ids: [uid(1)] },
      error: null,
    })
    questionsMock.push({ data: qids.map((id) => ({ id, game: 'matematik' })), error: null })

    const res = await GET(makeGetRequest({ game: 'matematik' }) as never)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.questions.map((q: { id: string }) => q.id)).toEqual(qids)
    expect(body.completedIds).toEqual([uid(1)])
    expect(mockFetchDue).not.toHaveBeenCalled()
    expect(mockComputeStrengths).not.toHaveBeenCalled()
    expect(dailyPlanMock.insertCalls).toHaveLength(0)
  })

  it('plan yoksa uretir: 6 due + 4 weak + 5 new -> tam 15 benzersiz id, insert edilir', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: U1 } } })

    // 1) existing check -> yok
    dailyPlanMock.pushSelect({ data: null, error: null })

    // 2) due: 6 soru
    mockFetchDue.mockResolvedValueOnce(
      Array.from({ length: 6 }, (_, i) => ({ id: uid(100 + i), game: 'matematik' })),
    )

    // 3) weak: 2 kategori (total>=5), en dusuk yuzdeli 2 tanesi
    mockComputeStrengths.mockResolvedValueOnce([
      { label: 'Sayilar', category: 'sayilar', percentage: 80, total: 10 },
      { label: 'Geometri', category: 'geometri', percentage: 20, total: 8 },
      { label: 'Problemler', category: 'problemler', percentage: 40, total: 6 },
      { label: 'Az-Ornek', category: 'az_ornek', percentage: 0, total: 2 }, // total<5 -- elenir
    ])

    // 4) weak-kategori RPC cagrilari (en zayif once: geometri(20), sonra problemler(40))
    mockRpc
      .mockResolvedValueOnce({ data: [{ id: uid(200) }, { id: uid(201) }], error: null }) // geometri
      .mockResolvedValueOnce({ data: [{ id: uid(210) }, { id: uid(211) }], error: null }) // problemler

    // 5) history (new-exclude icin) -- bos
    historyMock.push({ data: [], error: null })

    // 6) new RPC -- kalan 5
    mockRpc.mockResolvedValueOnce({
      data: Array.from({ length: 5 }, (_, i) => ({ id: uid(300 + i) })),
      error: null,
    })

    // 7) insert -- ne gonderilirse capture edilip ayni sekilde geri donsun
    dailyPlanMock.pushInsert({
      data: { id: 'plan-new', plan_date: '2026-07-21', question_ids: [], completed_ids: [] },
      error: null,
    })

    // 8) final fetchQuestionsInOrder -- insert'e gonderilen id'lerle ayni sayida satir
    questionsMock.push({
      data: Array.from({ length: 15 }, (_, i) => ({ id: `q${i}`, game: 'matematik' })),
      error: null,
    })

    const res = await GET(makeGetRequest({ game: 'matematik' }) as never)
    expect(res.status).toBe(200)

    // insert'e gonderilen question_ids: 6 due + (geometri 2 + problemler 2) + 5 new = 15, benzersiz
    expect(dailyPlanMock.insertCalls).toHaveLength(1)
    const insertedIds = (dailyPlanMock.insertCalls[0] as { question_ids: string[] }).question_ids
    expect(insertedIds).toHaveLength(15)
    expect(new Set(insertedIds).size).toBe(15)

    // RPC en zayif kategoriler once cagrilmis olmali (geometri once problemler'den)
    expect(mockRpc).toHaveBeenNthCalledWith(1, 'select_random_questions', expect.objectContaining({
      p_category: 'geometri',
    }))
    expect(mockRpc).toHaveBeenNthCalledWith(2, 'select_random_questions', expect.objectContaining({
      p_category: 'problemler',
    }))
  })

  it('due bossa (fetchDue=[]) weak+new devreye girer, plan yine hedefe yakin dolar', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: U1 } } })
    dailyPlanMock.pushSelect({ data: null, error: null })
    mockFetchDue.mockResolvedValueOnce([])
    mockComputeStrengths.mockResolvedValueOnce([]) // zayif-sinyal yok -- yeni kullanici
    historyMock.push({ data: [], error: null })
    // kalan = 15 - 0 - 0 = 15 -- new RPC 15 soru doner
    mockRpc.mockResolvedValueOnce({
      data: Array.from({ length: 15 }, (_, i) => ({ id: uid(400 + i) })),
      error: null,
    })
    dailyPlanMock.pushInsert({
      data: { id: 'plan-new2', plan_date: '2026-07-21', question_ids: [], completed_ids: [] },
      error: null,
    })
    questionsMock.push({
      data: Array.from({ length: 15 }, (_, i) => ({ id: `q${i}`, game: 'matematik' })),
      error: null,
    })

    const res = await GET(makeGetRequest({ game: 'matematik' }) as never)
    expect(res.status).toBe(200)
    const insertedIds = (dailyPlanMock.insertCalls[0] as { question_ids: string[] }).question_ids
    expect(insertedIds).toHaveLength(15)
  })

  it('profil exam_type defaultunu due, weak ve new kovalarinin tumune uygular', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: U1 } } })
    dailyPlanMock.pushSelect({ data: null, error: null })
    profileMock.push({ data: { exam_type: 'lgs' }, error: null })
    mockFetchDue.mockResolvedValueOnce([{ id: uid(1), game: 'matematik' }])
    mockComputeStrengths.mockResolvedValueOnce([
      { label: 'Geometri', category: 'geometri', percentage: 20, total: 8 },
    ])
    mockRpc
      .mockResolvedValueOnce({ data: [{ id: uid(2) }], error: null })
      .mockResolvedValueOnce({ data: [{ id: uid(3) }], error: null })
    historyMock.push({ data: [], error: null })
    dailyPlanMock.pushInsert({
      data: { id: 'plan-lgs', plan_date: '2026-07-21', question_ids: [uid(1), uid(2), uid(3)], completed_ids: [] },
      error: null,
    })
    questionsMock.push({ data: [], error: null })

    const res = await GET(makeGetRequest({ game: 'matematik' }) as never)
    expect(res.status).toBe(200)
    expect(mockFetchDue).toHaveBeenCalledWith(expect.anything(), U1, 'matematik', null, null, 'LGS')
    expect(mockRpc).toHaveBeenNthCalledWith(1, 'select_random_questions', expect.objectContaining({ p_exam_ref: 'LGS' }))
    expect(mockRpc).toHaveBeenNthCalledWith(2, 'select_random_questions', expect.objectContaining({ p_exam_ref: 'LGS' }))
  })

  it('explicit exam_ref profil defaultunun onune gecer', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: U1 } } })
    dailyPlanMock.pushSelect({ data: null, error: null })
    mockFetchDue.mockResolvedValueOnce([])
    mockComputeStrengths.mockResolvedValueOnce([])
    historyMock.push({ data: [], error: null })
    mockRpc.mockResolvedValueOnce({ data: [], error: null })

    const res = await GET(makeGetRequest({ game: 'matematik', exam_ref: 'AYT-SAY' }) as never)
    expect(res.status).toBe(200)
    expect(mockFetchDue).toHaveBeenCalledWith(expect.anything(), U1, 'matematik', null, null, 'AYT-SAY')
    expect(mockRpc).toHaveBeenCalledWith('select_random_questions', expect.objectContaining({ p_exam_ref: 'AYT-SAY' }))
  })

  it('profil sinav turuyle uyumsuz stale exam_ref snapshot olusturmaz', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: U1 } } })
    dailyPlanMock.pushSelect({ data: null, error: null })
    profileMock.push({ data: { exam_type: 'lgs' }, error: null })

    const res = await GET(makeGetRequest({ game: 'matematik', exam_ref: 'TYT' }) as never)
    expect(res.status).toBe(400)
    expect(mockFetchDue).not.toHaveBeenCalled()
    expect(dailyPlanMock.insertCalls).toHaveLength(0)
  })

  it('new RPC hatasinda 500 doner ve partial plan persist etmez', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: U1 } } })
    dailyPlanMock.pushSelect({ data: null, error: null })
    mockFetchDue.mockResolvedValueOnce([{ id: uid(1) }])
    mockComputeStrengths.mockResolvedValueOnce([])
    historyMock.push({ data: [], error: null })
    mockRpc.mockResolvedValueOnce({ data: null, error: { code: '08006' } })

    const res = await GET(makeGetRequest({ game: 'matematik', exam_ref: 'TYT' }) as never)
    expect(res.status).toBe(500)
    expect(dailyPlanMock.insertCalls).toHaveLength(0)
  })

  it('weak RPC hatasinda 500 doner ve partial plan persist etmez', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: U1 } } })
    dailyPlanMock.pushSelect({ data: null, error: null })
    mockFetchDue.mockResolvedValueOnce([{ id: uid(1) }])
    mockComputeStrengths.mockResolvedValueOnce([
      { label: 'Geometri', category: 'geometri', percentage: 10, total: 8 },
    ])
    mockRpc.mockResolvedValueOnce({ data: null, error: { code: '08006' } })

    const res = await GET(makeGetRequest({ game: 'matematik', exam_ref: 'TYT' }) as never)
    expect(res.status).toBe(500)
    expect(dailyPlanMock.insertCalls).toHaveLength(0)
  })

  it('tum havuzlar mesru bicimde bossa 200 doner ama bos snapshot persist etmez', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: U1 } } })
    dailyPlanMock.pushSelect({ data: null, error: null })
    mockFetchDue.mockResolvedValueOnce([])
    mockComputeStrengths.mockResolvedValueOnce([])
    historyMock.push({ data: [], error: null })
    mockRpc.mockResolvedValueOnce({ data: [], error: null })

    const res = await GET(makeGetRequest({ game: 'matematik', exam_ref: 'TYT' }) as never)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      planDate: expect.any(String),
      game: 'matematik',
      examRef: 'TYT',
      questions: [],
      completedIds: [],
    })
    expect(dailyPlanMock.insertCalls).toHaveLength(0)
  })

  it('Cache-Control no-store header her zaman set edilir', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: U1 } } })
    dailyPlanMock.pushSelect({
      data: { id: 'plan-1', plan_date: '2026-07-21', question_ids: [], completed_ids: [] },
      error: null,
    })
    questionsMock.push({ data: [], error: null })
    const res = await GET(makeGetRequest({ game: 'matematik' }) as never)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
  })
})

describe('PATCH /api/study/today', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dailyPlanMock.reset()
    questionsMock.reset()
    historyMock.reset()
  })

  it('401 doner kullanici auth degilse', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await PATCH(makePatchRequest({ game: 'matematik', questionIds: [] }) as never)
    expect(res.status).toBe(401)
  })

  it('404 doner bugun icin plan yoksa', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: U1 } } })
    dailyPlanMock.pushSelect({ data: null, error: null })
    const res = await PATCH(makePatchRequest({ game: 'matematik', questionIds: [uid(1)] }) as never)
    expect(res.status).toBe(404)
  })

  it('completed_ids set-union yapar ve plan-disi id"leri yok sayar', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: U1 } } })
    const planIds = [uid(1), uid(2), uid(3)]
    dailyPlanMock.pushSelect({
      data: { id: 'plan-1', question_ids: planIds, completed_ids: [uid(1)] },
      error: null,
    })
    dailyPlanMock.pushUpdate({ data: { completed_ids: [uid(1), uid(2)] }, error: null })

    const outsideId = uid(999) // plan disi -- yok sayilmali
    const res = await PATCH(
      makePatchRequest({ game: 'matematik', questionIds: [uid(2), outsideId] }) as never,
    )
    expect(res.status).toBe(200)

    // update'e gonderilen completed_ids: mevcut [uid(1)] + gecerli-yeni [uid(2)] (outsideId YOK)
    const updateArg = dailyPlanMock.updateCalls[0] as { completed_ids: string[] }
    expect(updateArg.completed_ids.sort()).toEqual([uid(1), uid(2)].sort())
    expect(updateArg.completed_ids).not.toContain(outsideId)

    const body = await res.json()
    expect(body.completedIds).toEqual([uid(1), uid(2)])
  })
})
