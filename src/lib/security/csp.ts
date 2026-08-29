const SENSITIVE_CSP_HEADER = 'Content-Security-Policy'

export { SENSITIVE_CSP_HEADER }

/**
 * Per-request nonce for private application documents.
 *
 * The UUID comes from the runtime CSPRNG. Encoding it keeps the value within
 * CSP's nonce grammar without relying on Node-only Buffer APIs in Proxy.
 */
export function createCspNonce(randomValue = crypto.randomUUID()): string {
  return btoa(randomValue)
}

/**
 * Admin, institution, classroom and account-security documents never load
 * advertising or analytics. Their script policy can therefore be nonce-only.
 * Inline style attributes remain temporarily allowed because React animation
 * components emit them; inline <style> elements still require the nonce.
 */
export function buildSensitiveDocumentCsp(
  nonce: string,
  { development = false }: { development?: boolean } = {},
): string {
  const scriptSources = [
    "'self'",
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
    ...(development ? ["'unsafe-eval'"] : []),
  ]

  return [
    "default-src 'self'",
    `script-src ${scriptSources.join(' ')}`,
    "script-src-attr 'none'",
    `style-src-elem 'self' 'nonce-${nonce}' https://fonts.googleapis.com`,
    "style-src-attr 'unsafe-inline'",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob: https://*.googleusercontent.com https://*.supabase.co",
    "media-src 'self' blob: data: https://*.supabase.co",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co wss://ws-dev.bilgearena.com https://ws-dev.bilgearena.com https://*.ingest.de.sentry.io",
    "frame-src 'self'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ')
}
