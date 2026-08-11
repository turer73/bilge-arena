import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, waitFor } from '@testing-library/react'

const mocks = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
  playSound: vi.fn(),
  trackEvent: vi.fn(),
}))

vi.mock('@/stores/toast-store', () => ({
  toast: { success: mocks.toastSuccess },
}))
vi.mock('@/lib/utils/sounds', () => ({ playSound: mocks.playSound }))
vi.mock('@/lib/utils/plausible', () => ({ trackEvent: mocks.trackEvent }))
vi.mock('@/lib/experiments/activation', () => ({
  ACTIVATION_EXPERIMENT: 'homepage-first-value-v1',
  ACTIVATION_RESULT_STORAGE_KEY: 'ba-activation-last-result',
  getActivationExposure: () => 'micro',
}))

import { ActivationRewardNotice } from '../activation-reward-notice'

describe('ActivationRewardNotice', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    sessionStorage.clear()
    window.history.replaceState({}, '', '/arena/turkce?activationXp=100')
  })

  afterEach(() => vi.unstubAllGlobals())

  it('ödülü bir kez gösterir, ölçer ve URL içindeki geçici parametreyi temizler', async () => {
    render(<ActivationRewardNotice />)

    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith(
      'İlk turun kaydedildi: +100 XP',
      'Hazırsın; şimdi serini başlat!',
    ))
    expect(mocks.playSound).toHaveBeenCalledWith('xp')
    expect(mocks.trackEvent).toHaveBeenCalledWith('ActivationRewardClaimed', {
      props: expect.objectContaining({ variant: 'micro', xp: 100 }),
    })
    expect(window.location.search).toBe('')
  })

  it('geçersiz veya aşırı XP parametresini göstermez', async () => {
    window.history.replaceState({}, '', '/arena/turkce?activationXp=125')
    render(<ActivationRewardNotice />)

    await Promise.resolve()
    expect(mocks.toastSuccess).not.toHaveBeenCalled()
    expect(window.location.search).toBe('')
  })

  it('callback geçici olarak başarısızsa saklanan sonucu idempotent API ile yeniden dener', async () => {
    window.history.replaceState({}, '', '/arena/turkce')
    localStorage.setItem('ba-activation-last-result', JSON.stringify({
      correct: 2,
      total: 3,
      completedAt: new Date().toISOString(),
    }))
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      xpAwarded: 100,
      alreadyProcessed: false,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    render(<ActivationRewardNotice />)

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/activation/reward', {
      method: 'POST',
    }))
    await waitFor(() => expect(mocks.toastSuccess).toHaveBeenCalledWith(
      'İlk turun kaydedildi: +100 XP',
      'Hazırsın; şimdi serini başlat!',
    ))
    expect(localStorage.getItem('ba-activation-last-result')).toBeNull()
  })
})
