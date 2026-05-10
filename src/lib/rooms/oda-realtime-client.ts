'use client'

import { RealtimeClient } from '@supabase/supabase-js'

const WS_URL = 'wss://ws-dev.bilgearena.com/socket'

export async function createOdaRealtimeClient(): Promise<RealtimeClient | null> {
  try {
    const res = await fetch('/api/realtime/token')
    if (!res.ok) {
      console.error('[OdaRealtime] token fetch failed', res.status, await res.text().catch(() => ''))
      return null
    }
    const body = (await res.json()) as { token?: string; error?: string }
    if (!body.token) {
      console.error('[OdaRealtime] token missing in response', body)
      return null
    }

    const client = new RealtimeClient(WS_URL, {
      params: { apikey: body.token, vsn: '1.0.0' },
    })
    client.setAuth(body.token)
    client.connect()

    return client
  } catch (err) {
    console.error('[OdaRealtime] unexpected error', err)
    return null
  }
}
