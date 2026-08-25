import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { describe, expect, it, vi } from 'vitest'
import {
  TEACHER_INVITE_BOOTSTRAP_SCRIPT,
  TEACHER_INVITE_SESSION_KEY,
} from '../invite-bootstrap'

function runBootstrap(hash: string) {
  const stored = new Map<string, string>()
  const timers: Array<() => void> = []
  const location = {
    pathname: '/arena/sinif/davet',
    search: '?from=teacher',
    hash,
  }
  const replaceState = vi.fn((_state: unknown, _title: string, nextUrl: string) => {
    location.hash = ''
    expect(nextUrl).toBe('/arena/sinif/davet?from=teacher')
  })
  const window = {
    location,
    history: { replaceState },
    sessionStorage: {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => stored.set(key, value),
      removeItem: (key: string) => stored.delete(key),
    },
    setTimeout: (callback: () => void) => {
      timers.push(callback)
      return 1
    },
  }

  vm.runInNewContext(TEACHER_INVITE_BOOTSTRAP_SCRIPT, { window, URLSearchParams })
  return { location, replaceState, stored, timers }
}

describe('teacher invitation head bootstrap', () => {
  it('stages a valid fragment, scrubs it synchronously, and expires the staged token', () => {
    const token = 'a'.repeat(43)
    const result = runBootstrap(`#token=${token}`)

    expect(result.stored.get(TEACHER_INVITE_SESSION_KEY)).toBe(token)
    expect(result.location.hash).toBe('')
    expect(result.replaceState).toHaveBeenCalledTimes(1)
    expect(result.timers).toHaveLength(1)
    result.timers[0]!()
    expect(result.stored.has(TEACHER_INVITE_SESSION_KEY)).toBe(false)
  })

  it('scrubs an invalid fragment without staging it', () => {
    const result = runBootstrap('#token=too-short&email=private@example.com')

    expect(result.stored.has(TEACHER_INVITE_SESSION_KEY)).toBe(false)
    expect(result.location.hash).toBe('')
  })

  it('keeps the bootstrap before Plausible and applies the analytics-free private CSP last', () => {
    const root = process.cwd()
    const layout = fs.readFileSync(path.join(root, 'src/app/layout.tsx'), 'utf8')
    const thirdPartyScripts = fs.readFileSync(
      path.join(root, 'src/components/analytics/privacy-safe-third-party-scripts.tsx'),
      'utf8',
    )
    const config = fs.readFileSync(path.join(root, 'next.config.mjs'), 'utf8')
    const bootstrapIndex = layout.indexOf('id="teacher-invite-bootstrap"')
    const thirdPartyMountIndex = layout.indexOf('<PrivacySafeThirdPartyScripts />')
    const globalHeadersIndex = config.indexOf("source: '/(.*)'")
    const privateHeadersIndex = config.indexOf("source: '/arena/sinif/:path*'")
    // Blok sinirini BIR SONRAKI `source:` kaydinda kes. Onceden '// Statik asset'
    // isaretine kadar dilimleniyordu; araya baska bir kural blogu (ornegin admin
    // CSP'si) girdiginde onun icerigi de bu bloga sayiliyor ve asagidaki
    // "analitik/reklam gecmesin" iddiasi yanlis yere bakiyordu.
    const nextSourceIndex = config.indexOf('source:', privateHeadersIndex + 1)
    const privateBlockEnd = nextSourceIndex > -1
      ? nextSourceIndex
      : config.indexOf('// Statik asset', privateHeadersIndex)
    const privateBlock = config.slice(privateHeadersIndex, privateBlockEnd)

    expect(bootstrapIndex).toBeGreaterThan(-1)
    expect(bootstrapIndex).toBeLessThan(thirdPartyMountIndex)
    expect(thirdPartyScripts).toContain('https://analytics.panola.app/js/script.js')
    expect(thirdPartyScripts).toContain('isSensitiveWorkspacePath(pathname)')
    expect(privateHeadersIndex).toBeGreaterThan(globalHeadersIndex)
    expect(privateBlock).toContain("script-src 'self' 'unsafe-inline'")
    expect(privateBlock).not.toContain("'unsafe-eval'")
    expect(privateBlock).not.toMatch(/analytics\.panola|googletagmanager|googlesyndication|sentry/i)
    expect(privateBlock).toContain("{ key: 'Referrer-Policy', value: 'no-referrer' }")
  })

  /**
   * Guvenlik denetimi 2026-08-25 (B6): 'unsafe-eval' global public blokta
   * AdSense gerekcesiyle duruyor. Reklamsiz kurum, sinif ve admin document
   * boundary'lerinde daha dar politika artik enforcing olmalidir.
   */
  it('enforces the eval-free policy on ad-free sensitive surfaces', () => {
    const config = fs.readFileSync(path.join(process.cwd(), 'next.config.mjs'), 'utf8')

    const adminIndex = config.indexOf("source: '/admin/:path*'", config.indexOf("source: '/(.*)'"))
    const adminBlockEnd = config.indexOf('source:', adminIndex + 1)
    const adminBlock = config.slice(adminIndex, adminBlockEnd > -1 ? adminBlockEnd : undefined)

    expect(adminIndex).toBeGreaterThan(-1)
    expect(adminBlock).toContain("key: 'Content-Security-Policy'")
    expect(adminBlock).not.toContain("Content-Security-Policy-Report-Only")
    expect(adminBlock).not.toContain("'unsafe-eval'")
    expect(adminBlock).not.toMatch(/googlesyndication|googletagmanager|plausible/i)
    expect(adminBlock).not.toContain('report-uri')

    const adminCacheIndex = config.indexOf("source: '/admin/:path*'")
    const adminCacheBlock = config.slice(adminCacheIndex, config.indexOf('source:', adminCacheIndex + 1))
    expect(adminCacheBlock).toContain("{ key: 'Referrer-Policy', value: 'no-referrer' }")

    const sinifIndex = config.indexOf("source: '/arena/sinif/:path*'")
    const sinifBlock = config.slice(sinifIndex, config.indexOf('source:', sinifIndex + 1))
    expect(sinifBlock).toContain("key: 'Content-Security-Policy'")
    expect(sinifBlock).not.toContain("Content-Security-Policy-Report-Only")
    expect(sinifBlock).not.toContain("'unsafe-eval'")
    expect(sinifBlock).not.toContain('report-uri')

    const kurumIndex = config.indexOf("source: '/arena/kurum/:path*'")
    const kurumBlock = config.slice(kurumIndex, config.indexOf('source:', kurumIndex + 1))
    expect(kurumIndex).toBeGreaterThan(-1)
    expect(kurumBlock).toContain("key: 'Content-Security-Policy'")
    expect(kurumBlock).not.toContain("Content-Security-Policy-Report-Only")
    expect(kurumBlock).not.toContain("'unsafe-eval'")
    expect(kurumBlock).not.toMatch(/googlesyndication|googletagmanager|plausible/i)
    expect(kurumBlock).not.toContain('report-uri')

    const accountSecurityIndex = config.indexOf("source: '/hesap/guvenlik/:path*'")
    const accountSecurityBlock = config.slice(
      accountSecurityIndex,
      config.indexOf('source:', accountSecurityIndex + 1),
    )
    expect(accountSecurityIndex).toBeGreaterThan(-1)
    expect(accountSecurityBlock).toContain("key: 'Content-Security-Policy'")
    expect(accountSecurityBlock).not.toContain("'unsafe-eval'")
    expect(accountSecurityBlock).not.toMatch(/googlesyndication|googletagmanager|plausible|report-uri/i)
  })
})
