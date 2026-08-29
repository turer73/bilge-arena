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
vi.mock('@/components/study/institution-weekly-program-card', () => ({
  InstitutionWeeklyProgramCard: () => <div data-testid="institution-weekly-program" />,
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
    expect(screen.getByRole('status')).toHaveTextContent('Çalışma ekranın hazırlanıyor')
  })

  test('giriş yoksa kişisel hub yerine giriş CTA gösterir', () => {
    mockedUseAuthStore.mockReturnValue({ user: null, profile: null, loading: false } as never)
    render(<CalismaClient />)
    expect(screen.getByText('Giriş Yapman Gerekiyor')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Giriş Yap' })).toHaveAttribute('href', '/giris')
  })

  test('YKS kullanıcısında sade ders/sınav seçimi ve görünür devam eylemi render edilir', () => {
    mockedUseAuthStore.mockReturnValue({
      user: { id: 'u1' },
      profile: { exam_type: 'yks' },
      loading: false,
    } as never)
    render(<CalismaClient />)

    expect(document.querySelector('[data-practice-screen]')).toHaveClass('overflow-x-clip', 'min-w-0', 'touch-pan-y')
    expect(document.querySelector('[data-practice-overview]')).toHaveClass('lg:grid-cols-[minmax(0,1fr)_420px]')
    expect(document.querySelector('[data-practice-focus]')).toHaveClass('hidden', 'lg:block', 'min-h-[154px]', 'self-start')
    expect(document.querySelector('[data-practice-start]')).toHaveClass('lg:sticky')
    expect(screen.getByRole('heading', { name: 'Ne çalışmak istersin?' })).toBeInTheDocument()
    const gameGrid = document.querySelector('[data-study-game-grid]')
    expect(gameGrid).toHaveClass('grid', 'grid-cols-2', 'min-w-0', 'lg:grid-cols-2')
    expect(gameGrid).not.toHaveClass('overflow-x-auto')
    expect(document.querySelector('style')?.textContent).toContain('max-width: 1023px')
    expect(screen.getByRole('button', { name: /Matematik/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'TYT' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('button', { name: 'LGS' })).not.toBeInTheDocument()
    expect(screen.getByTestId('institution-weekly-program')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Devam et' })).toHaveAttribute('href', '/arena/matematik')
    expect(screen.queryByText("BUGÜNÜN 15'İ")).not.toBeInTheDocument()
    expect(screen.queryByText(/KEŞİF SEVİYESİ/)).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Profil sayfasını aç' })).toHaveAttribute('href', '/arena/profil')
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
    expect(screen.getByRole('link', { name: 'Devam et' })).toHaveAttribute('href', '/arena/turkce')
  })

  test('Wordquest gecisi onceki dersin sinav tercihini silmez', () => {
    useGameStore.setState({
      selectedGame: 'matematik',
      selectedCategory: 'problemler',
      selectedExamRef: 'AYT-SAY',
    })
    mockedUseAuthStore.mockReturnValue({
      user: { id: 'u1' },
      profile: { exam_type: 'yks' },
      loading: false,
    } as never)
    render(<CalismaClient />)

    fireEvent.click(screen.getByRole('button', { name: /İngilizce/ }))
    expect(useGameStore.getState()).toMatchObject({
      selectedGame: 'wordquest',
      selectedCategory: null,
      selectedExamRef: 'AYT-SAY',
    })

    fireEvent.click(screen.getByRole('button', { name: 'YDT' }))
    expect(useGameStore.getState().selectedExamRef).toBe('AYT-SAY')

    fireEvent.click(screen.getByRole('button', { name: /Matematik/ }))
    expect(useGameStore.getState()).toMatchObject({
      selectedGame: 'matematik',
      selectedExamRef: 'AYT-SAY',
    })
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

  // Bu test eskiden tersini bekliyordu: tahta erişimi yokken Bilge Asistan
  // kartının hiç çizilmemesi. Global asistan FAB'ı arena-auxiliaries'ten
  // kaldırıldığı için o davranış asistanı platformda tamamen erişilemez
  // yapıyordu. Ders çalışma hub'ındaki asistan/tahta artık bayrağa bağlı
  // değildir; sınav ve ortak çalışma için kapatılabilirlik yalnız oyun içi
  // tahtaya aittir.
  test('Bilge Tahta erişimi yokken de ders çalışma asistanı sunulur', () => {
    useBilgeTahtaEnabled.mockReturnValue(false)
    mockedUseAuthStore.mockReturnValue({
      user: { id: 'u1' },
      profile: { exam_type: 'yks' },
      loading: false,
    } as never)
    render(<CalismaClient />)

    expect(screen.getByRole('heading', { name: 'Bilge Asistan' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Konu anlat' })).toBeInTheDocument()
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
