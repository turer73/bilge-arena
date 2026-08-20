import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const rpc = vi.hoisted(() => vi.fn())
const getUser = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: () => ({ rpc }),
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser } }),
}))

const { GET } = await import('../route')

const OPEN = { examMode: false, board: true, coach: true, assistant: true, until: null }

describe('GET /api/assistance-policy', () => {
  beforeEach(() => {
    rpc.mockReset()
    getUser.mockReset()
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
  })

  afterEach(() => vi.clearAllMocks())

  test('giriş yapmamış kullanıcıda yardımcılar açık', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    const response = await GET()
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(OPEN)
    expect(rpc).not.toHaveBeenCalled()
  })

  test('sınav modu açıkken üç yardımcı da kapalı döner', async () => {
    rpc.mockResolvedValue({
      data: { examMode: true, board: false, coach: false, assistant: false, until: '2026-08-15T12:00:00+03:00' },
      error: null,
    })
    const response = await GET()
    const body = await response.json()
    expect(body.examMode).toBe(true)
    expect(body.board).toBe(false)
    expect(body.coach).toBe(false)
    expect(body.assistant).toBe(false)
  })

  /**
   * Migration 127 uygulanmadan kod canliya giderse fonksiyon yoktur.
   * Fail-closed uygulanirsa ozellik hic yokken butun platformda yardimcilar
   * kapanirdi; kapatilacak bir sinav da olmadigi icin bu durum ACIK sayilir.
   */
  test('fonksiyon henüz yoksa (42883) yardımcılar açık kalır', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '42883', message: 'undefined function' } })
    const response = await GET()
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(OPEN)
  })

  test('PostgREST şema önbelleğinde yoksa (PGRST202) da açık kalır', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'not found' } })
    expect(await (await GET()).json()).toEqual(OPEN)
  })

  test('başka bir RPC hatasında fail-closed davranır', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'permission denied' } })
    const response = await GET()
    expect(response.status).toBe(503)
    const body = await response.json()
    expect(body.board).toBe(false)
    expect(body.coach).toBe(false)
    expect(body.assistant).toBe(false)
  })

  test('sözleşmeye uymayan yanıtta fail-closed davranır', async () => {
    rpc.mockResolvedValue({ data: { examMode: 'evet' }, error: null })
    const response = await GET()
    expect(response.status).toBe(503)
    expect((await response.json()).board).toBe(false)
  })

  test('yanıt önbelleğe alınmaz', async () => {
    rpc.mockResolvedValue({ data: OPEN, error: null })
    const response = await GET()
    expect(response.headers.get('Cache-Control')).toContain('no-store')
  })
})
