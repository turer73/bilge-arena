/**
 * Bilge Arena: StoreBudgetStrip — mağaza giriş vitrini.
 *
 * Sorunun ölçülmüş hali: bakiyesi en ucuz ürüne yeten 10 kullanıcı vardı ve
 * toplam 1 satın alma yapılmıştı; "şu an ne alabilirim" sorusu ancak beş sekme
 * tek tek gezilerek cevaplanabiliyordu. Testler şeridin bu soruyu doğru
 * cevapladığını ve yanlış ürün önermediğini kilitliyor.
 */

import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const auth = vi.hoisted(() => ({
  value: {
    user: { id: 'u1' } as { id: string } | null,
    profile: { coin_balance: 100 } as Record<string, unknown> | null,
  },
}))
vi.mock('@/stores/auth-store', () => ({ useAuthStore: () => auth.value }))

import { StoreBudgetStrip } from '../store-budget-strip'

const fetchMock = vi.fn()
global.fetch = fetchMock as unknown as typeof fetch

beforeEach(() => {
  vi.clearAllMocks()
  auth.value.user = { id: 'u1' }
  auth.value.profile = { coin_balance: 100 }
  // Rozet ucu: bos liste (kod sabitleri tek basina yeterli)
  fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve({ badges: [] }) })
})

describe('StoreBudgetStrip', () => {
  test('bakiyeyle alinabilecek urun sayisini gosterir', async () => {
    render(<StoreBudgetStrip onJump={vi.fn()} />)
    // 100 altin: cerceve 30/60 + avatar susu ucuzlari alinabilir
    await waitFor(() => {
      expect(screen.getByText(/100 altınınla \d+ ürün alabilirsin/)).toBeInTheDocument()
    })
  })

  test('yalnizca bakiyeye SIGAN urunleri listeler', async () => {
    render(<StoreBudgetStrip onJump={vi.fn()} />)
    await waitFor(() => expect(screen.getByText(/ürün alabilirsin/)).toBeInTheDocument())
    // Efsanevi Aura 250 — 100 altina sigmaz, listede olmamali
    expect(screen.queryByText('Efsanevi Aura')).not.toBeInTheDocument()
    // Alev Cemberi 30 — sigar
    expect(screen.getByText('Alev Çemberi')).toBeInTheDocument()
  })

  test('urune tiklayinca ilgili sekmeye atlar', async () => {
    const onJump = vi.fn()
    render(<StoreBudgetStrip onJump={onJump} />)
    await waitFor(() => expect(screen.getByText('Alev Çemberi')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Alev Çemberi').closest('button')!)
    expect(onJump).toHaveBeenCalledWith('cerceve')
  })

  test('bakiye hicbir urune yetmiyorsa en ucuza ne kadar kaldigini yazar', async () => {
    auth.value.profile = { coin_balance: 10 }
    render(<StoreBudgetStrip onJump={vi.fn()} />)
    // En ucuz urun 30 (Alev Cemberi) → 20 altin daha
    await waitFor(() => {
      expect(screen.getByText(/20 altın daha/)).toBeInTheDocument()
    })
    expect(screen.queryByText(/ürün alabilirsin/)).not.toBeInTheDocument()
  })

  test('misafirde hic render olmaz', () => {
    auth.value.user = null
    auth.value.profile = null
    const { container } = render(<StoreBudgetStrip onJump={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })

  test('rozet ucu hata verse bile serit kod sabitleriyle calisir', async () => {
    fetchMock.mockRejectedValue(new Error('ag hatasi'))
    render(<StoreBudgetStrip onJump={vi.fn()} />)
    await waitFor(() => {
      expect(screen.getByText(/ürün alabilirsin/)).toBeInTheDocument()
    })
  })
})
