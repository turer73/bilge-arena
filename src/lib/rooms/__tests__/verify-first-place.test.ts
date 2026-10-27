import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { verifyRoomFirstPlace } from '../server-fetch'

const ROOM = '3f2a9c1e-7b4d-4e8a-9c21-5d6e7f8a9b0c'

// Oda-DB REST fetch'ini mock'la: URL'e gore rooms / room_members doner.
function mockRoomDb(opts: {
  roomOk?: boolean
  state?: string
  membersOk?: boolean
  members?: Array<{ user_id: string; score: number }>
}) {
  const {
    roomOk = true, state = 'completed', membersOk = true, members = [],
  } = opts
  return vi.fn(async (url: string) => {
    if (url.includes('/rooms?')) {
      return { ok: roomOk, json: async () => (roomOk ? [{ state }] : []) }
    }
    if (url.includes('/room_members?')) {
      return { ok: membersOk, json: async () => members }
    }
    return { ok: false, json: async () => [] }
  })
}

describe('verifyRoomFirstPlace', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => vi.unstubAllGlobals())

  it('oda completed degilse finished:false', async () => {
    vi.stubGlobal('fetch', mockRoomDb({ state: 'active', members: [{ user_id: 'u1', score: 100 }] }))
    const r = await verifyRoomFirstPlace('jwt', ROOM, 'u1')
    expect(r.finished).toBe(false)
    expect(r.isFirstPlace).toBe(false)
  })

  it('caller en yuksek skor -> isFirstPlace:true', async () => {
    vi.stubGlobal('fetch', mockRoomDb({
      members: [{ user_id: 'u1', score: 300 }, { user_id: 'u2', score: 150 }],
    }))
    const r = await verifyRoomFirstPlace('jwt', ROOM, 'u1')
    expect(r).toEqual({ finished: true, isFirstPlace: true })
  })

  it('caller birinci DEGIL -> isFirstPlace:false (sahte-iddia engellendi)', async () => {
    vi.stubGlobal('fetch', mockRoomDb({
      members: [{ user_id: 'u1', score: 100 }, { user_id: 'u2', score: 500 }],
    }))
    const r = await verifyRoomFirstPlace('jwt', ROOM, 'u1')
    expect(r).toEqual({ finished: true, isFirstPlace: false })
  })

  it('caller uye degilse isFirstPlace:false', async () => {
    vi.stubGlobal('fetch', mockRoomDb({
      members: [{ user_id: 'u2', score: 500 }],
    }))
    const r = await verifyRoomFirstPlace('jwt', ROOM, 'u1')
    expect(r).toEqual({ finished: true, isFirstPlace: false })
  })

  it('tum skorlar 0 (iptal/all-zero) -> isFirstPlace:false (score>0 sarti)', async () => {
    vi.stubGlobal('fetch', mockRoomDb({
      members: [{ user_id: 'u1', score: 0 }, { user_id: 'u2', score: 0 }],
    }))
    const r = await verifyRoomFirstPlace('jwt', ROOM, 'u1')
    expect(r.isFirstPlace).toBe(false)
  })

  it('oda-DB erisilemezse fail-closed (finished:false)', async () => {
    vi.stubGlobal('fetch', mockRoomDb({ roomOk: false }))
    const r = await verifyRoomFirstPlace('jwt', ROOM, 'u1')
    expect(r).toEqual({ finished: false, isFirstPlace: false })
  })

  it('fetch throw ederse fail-closed', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network') }))
    const r = await verifyRoomFirstPlace('jwt', ROOM, 'u1')
    expect(r).toEqual({ finished: false, isFirstPlace: false })
  })

  it('UUID olmayan veya parametre taşıyan kimliği oda-DB\'ye hiç sormadan reddeder', async () => {
    const fetchMock = mockRoomDb({ members: [{ user_id: 'u1', score: 100 }] })
    vi.stubGlobal('fetch', fetchMock)
    for (const bad of [`${ROOM}&limit=1`, ROOM.replaceAll('-', ''), `{${ROOM}}`, 'room-1', '']) {
      expect(await verifyRoomFirstPlace('jwt', bad, 'u1')).toEqual({ finished: false, isFirstPlace: false })
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('büyük harfli yazımı kanonik küçük harfle sorgular', async () => {
    const fetchMock = mockRoomDb({ members: [{ user_id: 'u1', score: 100 }] })
    vi.stubGlobal('fetch', fetchMock)
    const r = await verifyRoomFirstPlace('jwt', ROOM.toUpperCase(), 'u1')
    expect(r).toEqual({ finished: true, isFirstPlace: true })
    const urls = fetchMock.mock.calls.map(([url]) => String(url))
    expect(urls).toHaveLength(2)
    for (const url of urls) expect(url).toContain(`eq.${ROOM}&`)
  })
})
