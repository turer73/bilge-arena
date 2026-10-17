// @vitest-environment jsdom
// .ts testleri varsayilan olarak node ortaminda kosar; bu dosya window, localStorage ve history ile calisir.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { trackEvent } from '../plausible'

describe('trackEvent sensitive workspace policy', () => {
  const plausible = vi.fn()

  beforeEach(() => {
    plausible.mockClear()
    window.plausible = (...args: unknown[]) => plausible(...args)
    localStorage.clear()
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

  it('betik yüklenmeden gelen kamusal olayı Plausible kuyruğuna alır', () => {
    window.history.replaceState({}, '', '/hakkinda')
    delete window.plausible
    trackEvent('MarketingCtaClicked')
    expect((Reflect.get(window, 'plausible') as { q?: unknown[][] }).q)
      .toEqual([['MarketingCtaClicked', undefined]])
  })

  it('cerez izni olmadan da kamusal olayi gonderir (Plausible cerezsiz, izne tabi degil)', () => {
    window.history.replaceState({}, '', '/hakkinda')
    localStorage.removeItem('bilge-arena-cookie-consent')
    trackEvent('MarketingCtaClicked')
    expect(plausible).toHaveBeenCalledWith('MarketingCtaClicked', undefined)
  })

  it('analitik izni acikca reddedilse de hassas alan disinda olayi gonderir', () => {
    window.history.replaceState({}, '', '/hakkinda')
    localStorage.setItem('bilge-arena-cookie-consent', JSON.stringify({
      essential: true, analytics: false, ads: false, version: 2, date: new Date().toISOString(),
    }))
    trackEvent('GuestQuizComplete')
    expect(plausible).toHaveBeenCalledWith('GuestQuizComplete', undefined)
  })
})
