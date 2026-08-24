import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'

const mocks = vi.hoisted(() => ({ pathname: '/hakkinda' }))
vi.mock('next/navigation', () => ({ usePathname: () => mocks.pathname }))
vi.mock('next/script', () => ({ default: () => null }))
vi.mock('../google-analytics', () => ({ GoogleAnalytics: () => null }))

import {
  isSensitiveNavigationTarget,
  installSensitiveNavigationBoundary,
  PrivacySafeThirdPartyScripts,
} from '../privacy-safe-third-party-scripts'

describe('privacy-safe third-party document boundary', () => {
  afterEach(() => {
    cleanup()
    mocks.pathname = '/hakkinda'
    delete document.documentElement.dataset.publicTelemetryDocument
    vi.restoreAllMocks()
  })

  it('classifies sensitive navigation targets before history mutation', () => {
    expect(isSensitiveNavigationTarget('/admin/kurumlar')).toBe(true)
    expect(isSensitiveNavigationTarget('/api/institution/workspace')).toBe(true)
    expect(isSensitiveNavigationTarget('/hakkinda')).toBe(false)
  })

  it('replaces SPA history navigation to a sensitive workspace with a document navigation', () => {
    const hardNavigate = vi.fn()
    const originalPushState = window.history.pushState
    const restore = installSensitiveNavigationBoundary(hardNavigate)

    window.history.pushState({}, '', '/arena/kurum')

    expect(hardNavigate).toHaveBeenCalledWith('/arena/kurum')
    expect(window.location.pathname).not.toBe('/arena/kurum')
    restore()
    expect(window.history.pushState).toBe(originalPushState)
  })

  it('marks public documents so an unexpected sensitive render can force a reload', () => {
    render(<PrivacySafeThirdPartyScripts />)
    expect(document.documentElement.dataset.publicTelemetryDocument).toBe('true')
  })
})
