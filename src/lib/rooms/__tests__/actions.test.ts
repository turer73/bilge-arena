/**
 * Bilge Arena Oda Sistemi: createRoomAction (Server Action) unit tests
 * Sprint 1 PR4a Task 1
 *
 * Codebase'in ILK Server Action ornegi. 12 senaryo:
 *   - 5 happy/error path: anon, expired session, invalid title, P0002, success
 *   - 4 boundary: max_players (1/2/20/21), per_question_seconds (9/10/60/61),
 *                 mode 'invalid', defaults uygulanir
 *   - 3 edge: network exception, revalidate ONCE before redirect, Zod strip
 *
 * Mock pattern:
 *   - vi.hoisted ile spy refs (next/cache + next/navigation Vite resolve edemez)
 *   - createClient (Panola Supabase) -> auth.getUser/getSession
 *   - callRpc -> RpcResult discriminated union
 */

import { describe, test, expect, vi, beforeEach } from 'vitest'

const { mockCreateClient, mockCallRpc, mockRedirect, mockRevalidatePath } =
  vi.hoisted(() => ({
    mockCreateClient: vi.fn(),
    mockCallRpc: vi.fn(),
    mockRedirect: vi.fn(),
    mockRevalidatePath: vi.fn(),
  }))

vi.mock('@/lib/supabase/server', () => ({ createClient: mockCreateClient }))
vi.mock('../client', () => ({ callRpc: mockCallRpc }))
vi.mock('next/navigation', () => ({ redirect: mockRedirect }))
vi.mock('next/cache', () => ({ revalidatePath: mockRevalidatePath }))

import { createRoomAction, joinRoomAction } from '../actions'

const mockSupabase = (user: unknown, session: unknown) => {
  mockCreateClient.mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user } }),
      getSession: vi.fn().mockResolvedValue({ data: { session } }),
    },
  })
}

const validForm = () => {
  const fd = new FormData()
  fd.set('title', 'Genel Kultur Yarismasi')
  fd.set('category', 'genel-kultur')
  fd.set('difficulty', '3')
  fd.set('question_count', '10')
  fd.set('max_players', '6')
  fd.set('per_question_seconds', '20')
  fd.set('mode', 'sync')
  return fd
}

describe('createRoomAction', () => {
  beforeEach(() => vi.clearAllMocks())

  test('1) anon user → error: Giris yapmalisin', async () => {
    mockSupabase(null, null)
    const r = await createRoomAction({}, validForm())
    expect(r.error).toMatch(/Giris yapmalisin/)
  })

  test('2) expired session → error: Oturum suresi doldu', async () => {
    mockSupabase({ id: 'u1' }, null)
    const r = await createRoomAction({}, validForm())
    expect(r.error).toMatch(/Oturum suresi doldu/)
  })

  test('3) invalid title (2 char) → fieldErrors.title', async () => {
    mockSupabase({ id: 'u1' }, { access_token: 'jwt' })
    const fd = validForm()
    fd.set('title', 'Ab')
    const r = await createRoomAction({}, fd)
    expect(r.fieldErrors?.title?.length).toBeGreaterThan(0)
  })

  test('4) RPC P0002 → error: Profil olusturulmali', async () => {
    mockSupabase({ id: 'u1' }, { access_token: 'jwt' })
    mockCallRpc.mockResolvedValue({
      ok: false,
      error: { code: 'P0002', message: 'Profil olusturulmali', status: 400 },
    })
    const r = await createRoomAction({}, validForm())
    expect(r.error).toMatch(/Profil olusturulmali/)
  })

  test('5) success → callRpc + revalidatePath + redirect chain', async () => {
    mockSupabase({ id: 'u1' }, { access_token: 'jwt' })
    mockCallRpc.mockResolvedValue({
      ok: true,
      data: { id: 'room1', code: 'BIL2GE' },
    })
    await createRoomAction({}, validForm())
    expect(mockCallRpc).toHaveBeenCalledWith(
      'jwt',
      'create_room',
      expect.objectContaining({ title: 'Genel Kultur Yarismasi', mode: 'sync' }),
    )
    expect(mockRevalidatePath).toHaveBeenCalledWith('/oda')
    expect(mockRedirect).toHaveBeenCalledWith('/oda/BIL2GE')
  })

  test('6) max_players boundary 1/2/20/21', async () => {
    mockSupabase({ id: 'u1' }, { access_token: 'jwt' })
    mockCallRpc.mockResolvedValue({ ok: true, data: { id: 'r', code: 'X' } })
    for (const [val, valid] of [
      ['1', false],
      ['2', true],
      ['20', true],
      ['21', false],
    ] as const) {
      const fd = validForm()
      fd.set('max_players', val)
      const r = await createRoomAction({}, fd)
      // valid: action redirect()'e gider, mocked redirect undefined doner
      // invalid: action {fieldErrors} ile early-return
      if (valid) expect(r?.fieldErrors).toBeUndefined()
      else expect(r?.fieldErrors?.max_players?.length).toBeGreaterThan(0)
    }
  })

  test('7) per_question_seconds boundary 9/10/60/61', async () => {
    mockSupabase({ id: 'u1' }, { access_token: 'jwt' })
    mockCallRpc.mockResolvedValue({ ok: true, data: { id: 'r', code: 'X' } })
    for (const [val, valid] of [
      ['9', false],
      ['10', true],
      ['60', true],
      ['61', false],
    ] as const) {
      const fd = validForm()
      fd.set('per_question_seconds', val)
      const r = await createRoomAction({}, fd)
      if (valid) expect(r?.fieldErrors).toBeUndefined()
      else expect(r?.fieldErrors?.per_question_seconds?.length).toBeGreaterThan(0)
    }
  })

  test('8) FormData eksik field → Zod default uygulanir', async () => {
    mockSupabase({ id: 'u1' }, { access_token: 'jwt' })
    mockCallRpc.mockResolvedValue({ ok: true, data: { id: 'r', code: 'X' } })
    const fd = new FormData()
    fd.set('title', 'Bos Form Test')
    fd.set('category', 'genel')
    await createRoomAction({}, fd)
    expect(mockCallRpc).toHaveBeenCalledWith(
      'jwt',
      'create_room',
      expect.objectContaining({
        difficulty: 2,
        question_count: 10,
        max_players: 8,
        per_question_seconds: 20,
        mode: 'sync',
      }),
    )
  })

  test('9) mode "invalid" → fieldErrors.mode', async () => {
    mockSupabase({ id: 'u1' }, { access_token: 'jwt' })
    const fd = validForm()
    fd.set('mode', 'invalid')
    const r = await createRoomAction({}, fd)
    expect(r.fieldErrors?.mode?.length).toBeGreaterThan(0)
  })

  test('10) callRpc network exception → error: Network', async () => {
    mockSupabase({ id: 'u1' }, { access_token: 'jwt' })
    mockCallRpc.mockResolvedValue({
      ok: false,
      error: { code: 'UNKNOWN', message: 'fetch failed', status: 502 },
    })
    const r = await createRoomAction({}, validForm())
    expect(r.error).toMatch(/fetch failed|Network/)
  })

  test('11) success: revalidatePath ONCE redirect ONCE order', async () => {
    mockSupabase({ id: 'u1' }, { access_token: 'jwt' })
    mockCallRpc.mockResolvedValue({ ok: true, data: { id: 'r', code: 'X' } })
    await createRoomAction({}, validForm())
    expect(mockRevalidatePath).toHaveBeenCalledTimes(1)
    expect(mockRedirect).toHaveBeenCalledTimes(1)
    const revalidateOrder = mockRevalidatePath.mock.invocationCallOrder[0]
    const redirectOrder = mockRedirect.mock.invocationCallOrder[0]
    expect(revalidateOrder).toBeLessThan(redirectOrder)
  })

  test('12) FormData fazladan field → Zod strip', async () => {
    mockSupabase({ id: 'u1' }, { access_token: 'jwt' })
    mockCallRpc.mockResolvedValue({ ok: true, data: { id: 'r', code: 'X' } })
    const fd = validForm()
    fd.set('csrf', 'xxx')
    fd.set('garbage', '123')
    await createRoomAction({}, fd)
    const callArgs = mockCallRpc.mock.calls[0]
    expect(callArgs[2]).not.toHaveProperty('csrf')
    expect(callArgs[2]).not.toHaveProperty('garbage')
  })
})

// =============================================================================
// joinRoomAction: form submit → join_room RPC → redirect
// PR4b Task 1: 3 senaryo (auth, validation, success)
// =============================================================================

describe('joinRoomAction', () => {
  beforeEach(() => vi.clearAllMocks())

  test('1) anon user → error: Giris yapmalisin', async () => {
    mockSupabase(null, null)
    const fd = new FormData()
    fd.set('code', 'BLZGE2')
    const r = await joinRoomAction({}, fd)
    expect(r.error).toMatch(/Giris yapmalisin/)
  })

  test('2) invalid code (3 char) → fieldErrors.code', async () => {
    mockSupabase({ id: 'u1' }, { access_token: 'jwt' })
    const fd = new FormData()
    fd.set('code', 'abc')
    const r = await joinRoomAction({}, fd)
    expect(r.fieldErrors?.code?.length).toBeGreaterThan(0)
  })

  test('3) success → callRpc(join_room) + redirect', async () => {
    mockSupabase({ id: 'u1' }, { access_token: 'jwt' })
    mockCallRpc.mockResolvedValue({ ok: true, data: null })
    const fd = new FormData()
    // Crockford-32: I, O, 0, 1 yasak; 'BLZGE2' tum karakterler valid
    fd.set('code', 'BLZGE2')
    await joinRoomAction({}, fd)
    expect(mockCallRpc).toHaveBeenCalledWith('jwt', 'join_room', { p_code: 'BLZGE2' })
    expect(mockRedirect).toHaveBeenCalledWith('/oda/BLZGE2')
  })
})
