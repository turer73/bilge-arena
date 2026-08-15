import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StudyAssistantLauncher } from '../study-assistant-launcher'

const oldBoardUiEnabled = process.env.NEXT_PUBLIC_BILGE_TAHTA_ENABLED
const trackBilgeBoardEvent = vi.hoisted(() => vi.fn())
vi.mock('@/lib/bilge-tahta/analytics', () => ({ trackBilgeBoardEvent }))

/**
 * Regresyon koruması: PR #364 (844e6aa) launcher'a `if (!boardEnabled) return null`
 * eklemişti. Bilge Asistan'ın global FAB girişi daha önce arena-auxiliaries'ten
 * kaldırıldığı için bu satır asistanı platformda tamamen görünmez yaptı.
 * Ders çalışma hub'ındaki asistan/tahta artık bayrağa bağlı değildir; sınav ve
 * ortak çalışma için kapatılabilirlik yalnız oyun içi tahtaya aittir.
 */
describe('StudyAssistantLauncher', () => {
  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_BILGE_TAHTA_ENABLED
    trackBilgeBoardEvent.mockClear()
  })

  afterEach(() => {
    if (oldBoardUiEnabled === undefined) delete process.env.NEXT_PUBLIC_BILGE_TAHTA_ENABLED
    else process.env.NEXT_PUBLIC_BILGE_TAHTA_ENABLED = oldBoardUiEnabled
    vi.unstubAllGlobals()
  })

  test('tahta bayrağı tanımsızken bile Bilge Asistan kartı render edilir', () => {
    render(<StudyAssistantLauncher game="matematik" examRef="TYT" />)
    expect(screen.getByRole('heading', { name: 'Bilge Asistan' })).toBeInTheDocument()
  })

  test('kohort erişimi kapalı dönse de kart kaybolmaz', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ enabled: false }),
    })
    vi.stubGlobal('fetch', mockFetch)

    render(<StudyAssistantLauncher game="matematik" examRef="TYT" />)

    expect(await screen.findByRole('heading', { name: 'Bilge Asistan' })).toBeInTheDocument()
  })

  test('dört asistan eylemi de kullanıcıya sunulur', () => {
    render(<StudyAssistantLauncher game="matematik" examRef="TYT" />)
    const actions = screen.getAllByRole('button')
    expect(actions.length).toBeGreaterThanOrEqual(4)
  })
})
