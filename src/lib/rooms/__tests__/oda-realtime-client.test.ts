import { describe, it, expect, vi, beforeEach } from 'vitest'

type ClientOptions = {
  params: { apikey: string; vsn: string }
  accessToken: () => Promise<string>
}

const mocks = vi.hoisted(() => ({
  instances: [] as Array<{ url: string; options: ClientOptions; connect: ReturnType<typeof vi.fn> }>,
}))

vi.mock('@supabase/supabase-js', () => ({
  RealtimeClient: class {
    connect = vi.fn()
    constructor(url: string, options: ClientOptions) {
      mocks.instances.push({ url, options, connect: this.connect })
    }
  },
}))

import { createOdaRealtimeClient, REALTIME_TOKEN_REFRESH_MARGIN_MS } from '../oda-realtime-client'

const T0 = 1_800_000_000_000
const TTL = 10 * 60_000

describe('createOdaRealtimeClient', () => {
  beforeEach(() => {
    mocks.instances.length = 0
  })

  it('token alinamazsa istemci kurulmaz', async () => {
    const client = await createOdaRealtimeClient({ fetchToken: async () => null })
    expect(client).toBeNull()
    expect(mocks.instances).toHaveLength(0)
  })

  it('ilk token apikey olarak baglanir; pencere disinda yeniden istenmez', async () => {
    const fetchToken = vi.fn().mockResolvedValue({ token: 't1', expiresAtMs: T0 + TTL })
    let now = T0
    await createOdaRealtimeClient({ fetchToken, now: () => now, wsUrl: 'wss://x/socket' })

    const [inst] = mocks.instances
    expect(inst.url).toBe('wss://x/socket')
    expect(inst.options.params.apikey).toBe('t1')
    expect(inst.connect).toHaveBeenCalledOnce()

    now = T0 + TTL - REALTIME_TOKEN_REFRESH_MARGIN_MS - 1
    expect(await inst.options.accessToken()).toBe('t1')
    expect(fetchToken).toHaveBeenCalledTimes(1)
  })

  it('bitime 2 dakikadan az kalinca yeniler, reconnect apikey de guncellenir', async () => {
    const fetchToken = vi.fn()
      .mockResolvedValueOnce({ token: 't1', expiresAtMs: T0 + TTL })
      .mockResolvedValueOnce({ token: 't2', expiresAtMs: T0 + 2 * TTL })
    let now = T0
    await createOdaRealtimeClient({ fetchToken, now: () => now })
    const [inst] = mocks.instances

    now = T0 + TTL - REALTIME_TOKEN_REFRESH_MARGIN_MS + 1
    // Ayni heartbeat turunda iki cagri tek istek uretmeli.
    const [a, b] = await Promise.all([inst.options.accessToken(), inst.options.accessToken()])
    expect([a, b]).toEqual(['t2', 't2'])
    expect(fetchToken).toHaveBeenCalledTimes(2)
    expect(inst.options.params.apikey).toBe('t2')

    expect(await inst.options.accessToken()).toBe('t2')
    expect(fetchToken).toHaveBeenCalledTimes(2)
  })

  it('yenileme basarisizsa eldeki token korunur, sonraki heartbeat yeniden dener', async () => {
    const fetchToken = vi.fn()
      .mockResolvedValueOnce({ token: 't1', expiresAtMs: T0 + TTL })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ token: 't3', expiresAtMs: T0 + 2 * TTL })
    const now = T0 + TTL - 1000
    await createOdaRealtimeClient({ fetchToken, now: () => now })
    const [inst] = mocks.instances

    expect(await inst.options.accessToken()).toBe('t1')
    expect(inst.options.params.apikey).toBe('t1')
    expect(await inst.options.accessToken()).toBe('t3')
    expect(inst.options.params.apikey).toBe('t3')
  })
})
