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

    const cbs = (client as unknown as {
      stateChangeCallbacks: {
        open: Array<() => void>
        close: Array<(e: unknown) => void>
        error: Array<(e: unknown) => void>
      }
    }).stateChangeCallbacks
    cbs.open.push(() => console.info('[OdaRealtime] OPEN', WS_URL))
    cbs.close.push((e) => console.warn('[OdaRealtime] CLOSE', e))
    cbs.error.push((e) => console.error('[OdaRealtime] ERROR', e))

    client.connect()
    console.info('[OdaRealtime] connecting to', WS_URL, 'tokenLen=', body.token.length, 'endpointURL=', client.endpointURL())

    setTimeout(() => {
      const conn = (client as unknown as { conn?: { readyState?: number } }).conn
      console.info(
        '[OdaRealtime] +3s state=',
        client.connectionState(),
        'isConnected=',
        client.isConnected(),
        'wsReadyState=',
        conn?.readyState,
      )
    }, 3000)

    return client
  } catch (err) {
    console.error('[OdaRealtime] unexpected error', err)
    return null
  }
}
