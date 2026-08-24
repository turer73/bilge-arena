import { beforeEach, describe, expect, it, vi } from 'vitest'
import { trackEvent } from '../plausible'

describe('trackEvent sensitive workspace policy', () => {
  const plausible = vi.fn()

  beforeEach(() => {
    plausible.mockClear()
    window.plausible = (...args: unknown[]) => plausible(...args)
  })

  it('kurum calisma alaninda event gondermez', () => {
    window.history.replaceState({}, '', '/arena/kurum')
    trackEvent('MarketingCtaClicked')
    expect(plausible).not.toHaveBeenCalled()
  })

  it('kamusal sayfada event gonderir', () => {
    window.history.replaceState({}, '', '/hakkinda')
    trackEvent('MarketingCtaClicked')
    expect(plausible).toHaveBeenCalledWith('MarketingCtaClicked', undefined)
  })
})
