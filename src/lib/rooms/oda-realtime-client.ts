'use client'

import { RealtimeClient } from '@supabase/supabase-js'

const WS_URL = 'wss://ws-dev.bilgearena.com/socket'

/**
 * Token bitmesine bu kadar kala yenisi alinir. realtime-js accessToken
 * callback'ini her heartbeat'te (~25 sn) cagirir; o aralikta onbellekteki
 * token doner, istek yalniz yenileme penceresinde atilir.
 */
export const REALTIME_TOKEN_REFRESH_MARGIN_MS = 2 * 60_000

export type OdaRealtimeToken = { token: string; expiresAtMs: number }

export async function fetchOdaRealtimeToken(): Promise<OdaRealtimeToken | null> {
  const res = await fetch('/api/realtime/token', { cache: 'no-store' })
  if (!res.ok) {
    console.error('[OdaRealtime] token fetch failed', res.status, await res.text().catch(() => ''))
    return null
  }
  const body = (await res.json()) as { token?: string; expires_at?: number; error?: string }
  if (!body.token || typeof body.expires_at !== 'number') {
    console.error('[OdaRealtime] token missing in response', { error: body.error })
    return null
  }
  return { token: body.token, expiresAtMs: body.expires_at * 1000 }
}

type CreateOptions = {
  wsUrl?: string
  fetchToken?: () => Promise<OdaRealtimeToken | null>
  now?: () => number
}

export async function createOdaRealtimeClient(
  options: CreateOptions = {},
): Promise<RealtimeClient | null> {
  const fetchToken = options.fetchToken ?? fetchOdaRealtimeToken
  const now = options.now ?? Date.now
  try {
    const first = await fetchToken()
    if (!first) return null
    let current = first

    // Soket yeniden baglanirken URL'deki apikey dogrulanir. realtime-js bu
    // nesneyi referansla tutar; yenilenen token'i buraya da yaziyoruz ki
    // ilk token'in suresi dolduktan sonraki reconnect reddedilmesin.
    const params = { apikey: current.token, vsn: '1.0.0' }
    let refreshing: Promise<void> | null = null

    const accessToken = async (): Promise<string> => {
      if (current.expiresAtMs - now() > REALTIME_TOKEN_REFRESH_MARGIN_MS) {
        return current.token
      }
      refreshing ??= fetchToken()
        .then((next) => {
          if (next) {
            current = next
            params.apikey = next.token
          }
        })
        .catch((err) => {
          console.error('[OdaRealtime] token refresh failed', err)
        })
        .finally(() => {
          refreshing = null
        })
      await refreshing
      return current.token
    }

    const client = new RealtimeClient(options.wsUrl ?? WS_URL, { params, accessToken })
    client.connect()

    return client
  } catch (err) {
    console.error('[OdaRealtime] unexpected error', err)
    return null
  }
}
