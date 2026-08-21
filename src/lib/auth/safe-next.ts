export function safeAuthNext(raw: string | null | undefined, fallback = '/arena'): string {
  return typeof raw === 'string'
    && raw.startsWith('/')
    && !raw.startsWith('//')
    && !raw.includes('\\')
    ? raw
    : fallback
}
