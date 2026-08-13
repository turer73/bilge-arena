import { afterEach, describe, test, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import CalismaClient from '../calisma-client'
import { useAuthStore } from '@/stores/auth-store'
import { useGameStore } from '@/stores/game-store'

const useBilgeTahtaEnabled = vi.hoisted(() => vi.fn(() => true))
const trackBilgeBoardEvent = vi.hoisted(() => vi.fn())

vi.mock('@/lib/bilge-tahta/client', () => ({ useBilgeTahtaEnabled }))
vi.mock('@/lib/bilge-tahta/analytics', () => ({ trackBilgeBoardEvent }))

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: vi.fn(),
}))
vi.mock('@/components/study/today-plan-focus', () => ({
  TodayPlanFocus: () => <div data-testid="today-plan-focus" />,
}))
vi.mock('@/components/study/mastery-action-card', () => ({
  MasteryActionCard: () => <div data-testid="mastery-action-card" />,
}))

const mockedUseAuthStore = vi.mocked(useAuthStore)

describe('CalismaClient', () => {
  beforeEach(() => {
    mockedUseAuthStore.mockReset()
    useGameStore.setState({
      selectedGame: null,
      selectedMode: 'classic',
      selectedCategory: null,
      selectedDifficulty: null,
      selectedExamRef: null,
    })
    useBilgeTahtaEnabled.mockReturnValue(true)
    trackBilgeBoardEvent.mockClear()
  })

  afterEach(() => vi.unstubAllGlobals())

  test('loading durumunda erişilebilir yükleme durumu gösterir', () => {
    mockedUseAuthStore.mockReturnValue({ user: null, profile: null, loading: true } as never)
    render(<CalismaClient />)
    expect(screen.getByRole('status')).toHaveTextContent('Yükleniyor')
  })

  test('giriş yoksa kişisel hub yerine giriş CTA gösterir', () => {
    mockedUseAuthStore.mockReturnValue({ user: null, profile: null, loading: false } as never)
    render(<CalismaClient />)
    expect(screen.getByText('Giriş Yapman Gerekiyor')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Giriş Yap' })).toHaveAttribute('href', '/giris')
    expect(screen.queryByTestId('today-plan-focus')).not.toBeInTheDocument()
  })

  test('YKS kullanıcısında görünür ders/sınav bağlamı ve tek plan odağı render edilir', () => {
    mockedUseAuthStore.mockReturnValue({
      user: { id: 'u1' },
      profile: { exam_type: 'yks' },
      loading: false,
    } as never)
    render(<CalismaClient />)

    expect(screen.getByRole('heading', { name: 'Bugün neyi ilerletelim?' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Matematik/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'TYT' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('button', { name: 'LGS' })).not.toBeInTheDocument()
    expect(screen.getByTestId('today-plan-focus')).toBeInTheDocument()
    expect(screen.getByTestId('mastery-action-card')).toBeInTheDocument()
  })

  test('LGS profilinde stale TYT/WordQuest seçimini güvenli bağlama düşürür', () => {
    useGameStore.setState({ selectedGame: 'wordquest', selectedExamRef: 'TYT' })
    mockedUseAuthStore.mockReturnValue({
      user: { id: 'u1' },
      profile: { exam_type: 'lgs' },
      loading: false,
    } as never)
    render(<CalismaClient />)

    expect(screen.queryByRole('button', { name: /İngilizce/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Matematik/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'LGS' })).toHaveAttribute('aria-pressed', 'true')
  })

  test('ders değişimi stale kategori temizler ve geçerli sınavı korur', () => {
    useGameStore.setState({ selectedCategory: 'problemler', selectedExamRef: 'TYT' })
    mockedUseAuthStore.mockReturnValue({
      user: { id: 'u1' },
      profile: { exam_type: 'yks' },
      loading: false,
    } as never)
    render(<CalismaClient />)

    fireEvent.click(screen.getByRole('button', { name: /Türkçe/ }))
    expect(useGameStore.getState().selectedGame).toBe('turkce')
    expect(useGameStore.getState().selectedExamRef).toBe('TYT')
    expect(useGameStore.getState().selectedCategory).toBeNull()
  })

  test('dört eylem düğmesi Ders Çalış tahta modunu doğrudan açar', () => {
    const fetchMock = vi.fn(() => new Promise<Response>(() => undefined))
    vi.stubGlobal('fetch', fetchMock)
    mockedUseAuthStore.mockReturnValue({
      user: { id: 'u1' },
      profile: { exam_type: 'yks' },
      loading: false,
    } as never)
    render(<CalismaClient />)

    expect(screen.getAllByRole('button', { name: /Bu soruyu çöz|Konu anlat|Örnek soru sor|Çalışma önerisi/ })).toHaveLength(4)
    fireEvent.change(screen.getByLabelText('Hangi konu veya soruda yardım istiyorsun?'), {
      target: { value: 'İkinci dereceden denklemler' },
    })
    const button = screen.getByRole('button', { name: 'Konu anlat' })
    fireEvent.click(button)
    expect(screen.getByRole('dialog', { name: 'Konu anlat' })).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByText(/Bilge Asistan tahtayı hazırlıyor/)).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith('/api/chat', expect.objectContaining({
      body: expect.stringContaining('"mode":"topic_explanation"'),
    }))
    expect(fetchMock).toHaveBeenCalledWith('/api/chat', expect.objectContaining({
      body: expect.stringContaining('Konu veya soru: İkinci dereceden denklemler'),
    }))
  })

  test('somut çalışma hedefi yoksa istek göndermez ve alanı odağa alır', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    mockedUseAuthStore.mockReturnValue({
      user: { id: 'u1' },
      profile: { exam_type: 'yks' },
      loading: false,
    } as never)
    render(<CalismaClient />)

    fireEvent.click(screen.getByRole('button', { name: 'Bu soruyu çöz' }))
    expect(screen.getByRole('alert')).toHaveTextContent(/Önce çalışmak istediğin konuyu veya soruyu yaz/)
    expect(screen.getByLabelText('Hangi konu veya soruda yardım istiyorsun?')).toHaveFocus()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  test('Bilge Tahta erişimi yoksa doğrudan tahta başlatıcısını göstermez', () => {
    useBilgeTahtaEnabled.mockReturnValue(false)
    mockedUseAuthStore.mockReturnValue({
      user: { id: 'u1' },
      profile: { exam_type: 'yks' },
      loading: false,
    } as never)
    render(<CalismaClient />)

    expect(screen.queryByRole('heading', { name: 'Bilge Asistan' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Konu anlat' })).not.toBeInTheDocument()
  })

  test('hata adımı kapatılırken tamamlanma analitiği yazmaz', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Yanıt hazırlanamadı.' }),
    }))
    mockedUseAuthStore.mockReturnValue({
      user: { id: 'u1' },
      profile: { exam_type: 'yks' },
      loading: false,
    } as never)
    render(<CalismaClient />)
    fireEvent.change(screen.getByLabelText('Hangi konu veya soruda yardım istiyorsun?'), {
      target: { value: 'Asal sayılar' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Konu anlat' }))

    expect(await screen.findByText('Yanıt hazırlanamadı.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Tamamla' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(trackBilgeBoardEvent).not.toHaveBeenCalledWith('BilgeBoardCompleted', expect.anything())
  })
})
