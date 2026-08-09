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
    const config = fs.readFileSync(path.join(root, 'next.config.mjs'), 'utf8')
    const bootstrapIndex = layout.indexOf('id="teacher-invite-bootstrap"')
    const plausibleIndex = layout.indexOf('src="https://analytics.panola.app/js/script.js"')
    const globalHeadersIndex = config.indexOf("source: '/(.*)'")
    const privateHeadersIndex = config.indexOf("source: '/arena/sinif/:path*'")
    const privateBlockEnd = config.indexOf('// Statik asset', privateHeadersIndex)
    const privateBlock = config.slice(privateHeadersIndex, privateBlockEnd)

    expect(bootstrapIndex).toBeGreaterThan(-1)
    expect(bootstrapIndex).toBeLessThan(plausibleIndex)
    expect(privateHeadersIndex).toBeGreaterThan(globalHeadersIndex)
    expect(privateBlock).toContain("script-src 'self' 'unsafe-inline' 'unsafe-eval'")
    expect(privateBlock).not.toMatch(/analytics\.panola|googletagmanager|googlesyndication|sentry/i)
    expect(privateBlock).toContain("{ key: 'Referrer-Policy', value: 'no-referrer' }")
  })
})
