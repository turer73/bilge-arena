import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'

const mocks = vi.hoisted(() => ({
  pathname: '/hakkinda',
  script: vi.fn(() => null),
  googleAnalytics: vi.fn(() => null),
}))
vi.mock('next/navigation', () => ({ usePathname: () => mocks.pathname }))
vi.mock('next/script', () => ({ default: mocks.script }))
vi.mock('../google-analytics', () => ({ GoogleAnalytics: mocks.googleAnalytics }))

import {
  crossesSensitiveDocumentBoundary,
  isSensitiveNavigationTarget,
  installSensitiveNavigationBoundary,
  PrivacySafeThirdPartyScripts,
} from '../privacy-safe-third-party-scripts'

describe('privacy-safe third-party document boundary', () => {
  afterEach(() => {
    cleanup()
    mocks.pathname = '/hakkinda'
    mocks.script.mockClear()
    mocks.googleAnalytics.mockClear()
    delete document.documentElement.dataset.telemetryDocumentBoundary
    vi.restoreAllMocks()
  })

  it('classifies sensitive navigation targets before history mutation', () => {
    expect(isSensitiveNavigationTarget('/admin/kurumlar')).toBe(true)
    expect(isSensitiveNavigationTarget('/api/institution/workspace')).toBe(true)
    expect(isSensitiveNavigationTarget('/hakkinda')).toBe(false)
  })

  it('treats both public-to-sensitive and sensitive-to-public moves as document boundaries', () => {
    expect(crossesSensitiveDocumentBoundary('/admin/kurumlar', false)).toBe(true)
    expect(crossesSensitiveDocumentBoundary('/hakkinda', true)).toBe(true)
    expect(crossesSensitiveDocumentBoundary('/arena/sinif/abc', true)).toBe(false)
    expect(crossesSensitiveDocumentBoundary('/hakkinda', false)).toBe(false)
    expect(crossesSensitiveDocumentBoundary(null, true)).toBe(false)
  })

  it('does not turn external or executable schemes into hard navigations', () => {
    expect(crossesSensitiveDocumentBoundary('javascript:alert(1)', true)).toBe(false)
    expect(crossesSensitiveDocumentBoundary('data:text/html,<h1>x</h1>', true)).toBe(false)
    expect(crossesSensitiveDocumentBoundary('https://example.com/admin', false)).toBe(false)
  })

  it('keeps query and hash navigation within the current document boundary', () => {
    expect(crossesSensitiveDocumentBoundary('/arena/kurum?tab=roller#uye', true)).toBe(false)
    expect(crossesSensitiveDocumentBoundary('/hakkinda?ref=arena#basla', false)).toBe(false)
  })

  it('replaces SPA history navigation to a sensitive workspace with a document navigation', () => {
    const hardNavigate = vi.fn()
    const originalPushState = window.history.pushState
    const restore = installSensitiveNavigationBoundary({ assignDocument: hardNavigate })

    window.history.pushState({}, '', '/arena/kurum')

    expect(hardNavigate).toHaveBeenCalledWith('/arena/kurum')
    expect(window.location.pathname).not.toBe('/arena/kurum')
    restore()
    expect(window.history.pushState).toBe(originalPushState)
  })

  it('replaces SPA history navigation from a sensitive workspace to a public page', () => {
    const hardNavigate = vi.fn()
    const originalPushState = window.history.pushState
    const restore = installSensitiveNavigationBoundary({
      assignDocument: hardNavigate,
      currentSensitive: true,
    })

    window.history.pushState({}, '', '/hakkinda')

    expect(hardNavigate).toHaveBeenCalledWith('/hakkinda')
    expect(window.location.pathname).not.toBe('/hakkinda')
    restore()
    expect(window.history.pushState).toBe(originalPushState)
  })

  it('replaces sensitive-to-public replaceState before mutating the URL', () => {
    const hardReplace = vi.fn()
    const hardAssign = vi.fn()
    const originalReplaceState = window.history.replaceState
    const restore = installSensitiveNavigationBoundary({
      assignDocument: hardAssign,
      replaceDocument: hardReplace,
      currentSensitive: true,
    })

    window.history.replaceState({}, '', '/arena')

    expect(hardReplace).toHaveBeenCalledWith('/arena')
    expect(hardAssign).not.toHaveBeenCalled()
    restore()
    expect(window.history.replaceState).toBe(originalReplaceState)
  })

  it('reloads a legacy cross-boundary browser-history entry on popstate', () => {
    const originalReplaceState = window.history.replaceState
    const hardReload = vi.fn()
    const restore = installSensitiveNavigationBoundary({
      assignDocument: vi.fn(),
      currentSensitive: false,
      reloadDocument: hardReload,
    })
    const laterTelemetryListener = vi.fn()
    window.addEventListener('popstate', laterTelemetryListener)

    originalReplaceState.call(window.history, {}, '', '/arena/kurum')
    window.dispatchEvent(new PopStateEvent('popstate'))

    expect(hardReload).toHaveBeenCalledOnce()
    expect(laterTelemetryListener).not.toHaveBeenCalled()
    window.removeEventListener('popstate', laterTelemetryListener)
    restore()
    originalReplaceState.call(window.history, {}, '', '/')
  })

  it('marks a direct sensitive document and never mounts third-party scripts', () => {
    mocks.pathname = '/arena/kurum'

    render(<PrivacySafeThirdPartyScripts />)

    expect(document.documentElement.dataset.telemetryDocumentBoundary).toBe('sensitive')
    expect(mocks.script).not.toHaveBeenCalled()
    expect(mocks.googleAnalytics).not.toHaveBeenCalled()
  })

  it('reloads a boundary mismatch before mounting public telemetry', () => {
    const reloadDocument = vi.fn()
    document.documentElement.dataset.telemetryDocumentBoundary = 'sensitive'
    mocks.pathname = '/hakkinda'

    render(<PrivacySafeThirdPartyScripts reloadDocument={reloadDocument} />)

    expect(reloadDocument).toHaveBeenCalledOnce()
    expect(mocks.script).not.toHaveBeenCalled()
    expect(mocks.googleAnalytics).not.toHaveBeenCalled()
  })

  it('marks public documents so an unexpected sensitive render can force a reload', () => {
    render(<PrivacySafeThirdPartyScripts />)
    expect(document.documentElement.dataset.telemetryDocumentBoundary).toBe('public')
  })
})
