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
    localStorage.setItem('bilge-arena-cookie-consent', JSON.stringify({
      essential: true, analytics: true, ads: false, version: 2, date: new Date().toISOString(),
    }))
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

  it('izinsiz olaylari sonradan gonderilecek bir kuyruga koymaz', () => {
    window.history.replaceState({}, '', '/hakkinda')
    localStorage.removeItem('bilge-arena-cookie-consent')
    delete window.plausible

    trackEvent('MarketingCtaClicked')
    expect(window.plausible).toBeUndefined()

    localStorage.setItem('bilge-arena-cookie-consent', JSON.stringify({
      essential: true, analytics: true, ads: false, version: 2, date: new Date().toISOString(),
    }))
    trackEvent('GuestQuizComplete')
    expect((Reflect.get(window, 'plausible') as { q?: unknown[][] }).q)
      .toEqual([['GuestQuizComplete', undefined]])
  })
})
