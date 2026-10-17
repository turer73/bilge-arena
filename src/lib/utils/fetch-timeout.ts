/**
 * Proxy her istekte Supabase Auth ve REST'e gider. Bu çağrıların zaman aşımı
 * yoktu: yukarı akış yavaşladığında istek Vercel'in 30 saniyelik sınırına
 * kadar asılı kalıyordu (2026-10 canlıda üç 30 sn zaman aşımı). Proxy'nin
 * kendi kontrolleri hata durumunda zaten kapalı tarafa düşer; zaman aşımı
 * yalnız "30 sn bekle" yerine "kısa sürede güvenli ret" demektir.
 */
export const PROXY_UPSTREAM_TIMEOUT_MS = 5_000

/** Çağıranın kendi sinyalini koruyarak her isteğe zaman aşımı ekler. */
export function withFetchTimeout(timeoutMs: number, fetchImpl: typeof fetch = fetch): typeof fetch {
  return (input, init) => {
    const timeout = AbortSignal.timeout(timeoutMs)
    const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout
    return fetchImpl(input, { ...init, signal })
  }
}
