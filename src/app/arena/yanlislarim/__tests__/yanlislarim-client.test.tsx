/**
 * Bilge Arena: YanlislarimClient — "Yanlışlarım" (yanlış defteri) ekranı.
 * Misafir CTA, boş-durum (tebrik), liste render (ders bazlı gruplu, rozet),
 * filtre değişince doğru query-param ile yeniden fetch.
 */

import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const authState = vi.hoisted(() => ({
  value: { user: { id: 'u1' } as { id: string } | null, loading: false },
}))
vi.mock('@/stores/auth-store', () => ({ useAuthStore: () => authState.value }))

import YanlislarimClient from '../yanlislarim-client'

const fetchMock = vi.fn()
global.fetch = fetchMock as unknown as typeof fetch

const Q1 = 'aaaaaaaa-0000-4000-8000-000000000001'
const Q2 = 'aaaaaaaa-0000-4000-8000-000000000002'

const item = (overrides: Record<string, unknown> = {}) => ({
  questionId: Q1,
  game: 'matematik',
  category: 'sayilar',
  subcategory: null,
  difficulty: 2,
  content: { question: 'İki artı iki kaçtır?', options: ['3', '4', '5', '6'], answer: 1, solution: 'Toplama işlemi.' },
  userSelectedOption: 0,
  wrongCount: 1,
  lastWrongAt: '2026-07-10T10:00:00Z',
  status: 'acik',
  ...overrides,
})

function mockFetchOnce(body: unknown, ok = true) {
  fetchMock.mockResolvedValueOnce({ ok, json: () => Promise.resolve(body) })
}

beforeEach(() => {
  vi.clearAllMocks()
  authState.value = { user: { id: 'u1' }, loading: false }
})

describe('YanlislarimClient', () => {
  test('misafir: giriş CTA gösterilir, fetch atılmaz', () => {
    authState.value = { user: null, loading: false }
    render(<YanlislarimClient />)
    expect(screen.getByText('Giriş Yapmanız Gerekiyor')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Giriş Yap' })).toHaveAttribute('href', '/giris')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('yükleniyor: auth store loading=true iken spinner', () => {
    authState.value = { user: null, loading: true }
    const { container } = render(<YanlislarimClient />)
    expect(container.querySelector('.animate-spin')).toBeInTheDocument()
  })

  test('boş-durum: hiç yanlış yok — tebrik tonu', async () => {
    mockFetchOnce({ items: [], page: 1, limit: 20, hasMore: false })
    render(<YanlislarimClient />)
    await waitFor(() => expect(screen.getByText('Tertemiz bir sicilin var!')).toBeInTheDocument())
  })

  test('liste: ders başlığı + soru kartı + rozet render edilir', async () => {
    mockFetchOnce({ items: [item()], page: 1, limit: 20, hasMore: false })
    render(<YanlislarimClient />)
    await waitFor(() => expect(screen.getByText('İki artı iki kaçtır?')).toBeInTheDocument())
    expect(screen.getByText(/MATEMATİK/)).toBeInTheDocument()
    expect(screen.getByText('Açık')).toBeInTheDocument()
    expect(screen.getByText('Toplama işlemi.', { exact: false })).toBeInTheDocument()
  })

  test('düzeltildi durumu farklı rozetle gösterilir', async () => {
    mockFetchOnce({
      items: [item({ status: 'duzeltildi', userSelectedOption: 0 })],
      page: 1,
      limit: 20,
      hasMore: false,
    })
    render(<YanlislarimClient />)
    await waitFor(() => expect(screen.getByText('Düzeltildi')).toBeInTheDocument())
  })

  test('iki farklı ders sorusu ayrı gruplarda listelenir', async () => {
    mockFetchOnce({
      items: [item(), item({ questionId: Q2, game: 'turkce', category: 'paragraf' })],
      page: 1,
      limit: 20,
      hasMore: false,
    })
    render(<YanlislarimClient />)
    await waitFor(() => expect(screen.getByText(/MATEMATİK/)).toBeInTheDocument())
    expect(screen.getByText(/TÜRKÇE/)).toBeInTheDocument()
  })

  test('ders filtresine tıklayınca game query-param ile yeniden fetch atılır', async () => {
    mockFetchOnce({ items: [item()], page: 1, limit: 20, hasMore: false })
    render(<YanlislarimClient />)
    await waitFor(() => expect(screen.getByText('İki artı iki kaçtır?')).toBeInTheDocument())

    mockFetchOnce({ items: [], page: 1, limit: 20, hasMore: false })
    fireEvent.click(screen.getByRole('button', { name: /Türkçe/ }))

    await waitFor(() => {
      const lastCall = fetchMock.mock.calls[fetchMock.mock.calls.length - 1][0] as string
      expect(lastCall).toContain('game=turkce')
    })
  })

  test('durum filtresine tıklayınca status query-param ile yeniden fetch atılır', async () => {
    mockFetchOnce({ items: [item()], page: 1, limit: 20, hasMore: false })
    render(<YanlislarimClient />)
    await waitFor(() => expect(screen.getByText('İki artı iki kaçtır?')).toBeInTheDocument())

    mockFetchOnce({ items: [], page: 1, limit: 20, hasMore: false })
    fireEvent.click(screen.getByRole('button', { name: 'Düzeltildi' }))

    await waitFor(() => {
      const lastCall = fetchMock.mock.calls[fetchMock.mock.calls.length - 1][0] as string
      expect(lastCall).toContain('status=duzeltildi')
    })
  })

  test('hasMore=true iken "Daha Fazla Yükle" butonu sonraki sayfayı ekler', async () => {
    mockFetchOnce({ items: [item()], page: 1, limit: 20, hasMore: true })
    render(<YanlislarimClient />)
    await waitFor(() => expect(screen.getByText('İki artı iki kaçtır?')).toBeInTheDocument())

    mockFetchOnce({
      items: [item({ questionId: Q2, content: { question: 'İkinci soru?', options: ['A', 'B'], answer: 0 } })],
      page: 2,
      limit: 20,
      hasMore: false,
    })
    fireEvent.click(screen.getByRole('button', { name: 'Daha Fazla Yükle' }))

    await waitFor(() => expect(screen.getByText('İkinci soru?')).toBeInTheDocument())
    // İlk sayfanın sorusu hâlâ listede (append, replace değil)
    expect(screen.getByText('İki artı iki kaçtır?')).toBeInTheDocument()
    const lastCall = fetchMock.mock.calls[fetchMock.mock.calls.length - 1][0] as string
    expect(lastCall).toContain('page=2')
  })

  test('API hatasında hata mesajı gösterilir', async () => {
    mockFetchOnce({ error: 'fail' }, false)
    render(<YanlislarimClient />)
    await waitFor(() =>
      expect(screen.getByText(/yüklenemedi/)).toBeInTheDocument(),
    )
  })
})
