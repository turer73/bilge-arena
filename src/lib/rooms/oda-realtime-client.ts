'use client'

import { RealtimeClient } from '@supabase/supabase-js'

const WS_URL = 'wss://ws-dev.bilgearena.com/socket'

export async function createOdaRealtimeClient(): Promise<RealtimeClient | null> {
  try {
    const res = await fetch('/api/realtime/token')
    if (!res.ok) return null
    const { token } = (await res.json()) as { token: string }

    const client = new RealtimeClient(WS_URL, {
      params: { apikey: token, vsn: '1.0.0' },
    })
    client.setAuth(token)
    client.connect()
    return client
  } catch {
    return null
  }
}
