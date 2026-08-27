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

  it('keeps the bootstrap before third-party scripts and routes private pages through nonce CSP', () => {
    const root = process.cwd()
    const layout = fs.readFileSync(path.join(root, 'src/app/layout.tsx'), 'utf8')
    const thirdPartyScripts = fs.readFileSync(
      path.join(root, 'src/components/analytics/privacy-safe-third-party-scripts.tsx'),
      'utf8',
    )
    const inviteLayout = fs.readFileSync(
      path.join(root, 'src/app/arena/sinif/davet/layout.tsx'),
      'utf8',
    )
    const homepage = fs.readFileSync(path.join(root, 'src/app/page.tsx'), 'utf8')
    const config = fs.readFileSync(path.join(root, 'next.config.mjs'), 'utf8')
    const proxy = fs.readFileSync(path.join(root, 'src/proxy.ts'), 'utf8')
    const csp = fs.readFileSync(path.join(root, 'src/lib/security/csp.ts'), 'utf8')
    const childrenIndex = layout.indexOf('{children}')
    const thirdPartyMountIndex = layout.indexOf('<PrivacySafeThirdPartyScripts />')
    const privateHeadersIndex = config.indexOf("source: '/arena/sinif/:path*'")
    const nextSourceIndex = config.indexOf('source:', privateHeadersIndex + 1)
    const privateBlock = config.slice(privateHeadersIndex, nextSourceIndex)

    expect(childrenIndex).toBeGreaterThan(-1)
    expect(childrenIndex).toBeLessThan(thirdPartyMountIndex)
    expect(layout).not.toContain('id="teacher-invite-bootstrap"')
    expect(layout).not.toContain('id="activation-experiment-bootstrap"')
    expect(inviteLayout).toContain('id="teacher-invite-bootstrap"')
    expect(inviteLayout).toContain("(await headers()).get('x-nonce')")
    expect(inviteLayout).toContain('nonce={nonce}')
    expect(homepage).toContain('id="activation-experiment-bootstrap"')
    expect(homepage).toContain('type="application/ld+json"')
    expect(thirdPartyScripts).toContain('https://analytics.panola.app/js/script.js')
    expect(thirdPartyScripts).toContain('isSensitiveWorkspacePath(pathname)')
    expect(privateBlock).toContain("{ key: 'Referrer-Policy', value: 'no-referrer' }")
    expect(privateBlock).not.toContain("key: 'Content-Security-Policy'")
    expect(proxy).toContain('isSensitiveWorkspacePath(pathname)')
    expect(proxy).toContain("requestHeaders.set('x-nonce', nonce)")
    expect(csp).toContain("'strict-dynamic'")
    expect(csp).not.toMatch(/analytics\.panola|googletagmanager|googlesyndication|plausible/i)
  })

  /**
   * Public monetized pages retain the AdSense-compatible policy. Private
   * documents are dynamically rendered and receive a per-request nonce.
   */
  it('forces dynamic rendering for every private nonce boundary', () => {
    const root = process.cwd()
    const privateLayouts = [
      'src/app/admin/layout.tsx',
      'src/app/arena/sinif/layout.tsx',
      'src/app/arena/kurum/layout.tsx',
      'src/app/hesap/guvenlik/layout.tsx',
    ]

    for (const relativePath of privateLayouts) {
      const privateLayout = fs.readFileSync(path.join(root, relativePath), 'utf8')
      expect(privateLayout, relativePath).toContain("from 'next/server'")
      expect(privateLayout, relativePath).toContain('await connection()')
    }
  })
})
