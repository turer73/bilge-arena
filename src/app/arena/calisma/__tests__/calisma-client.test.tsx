import { afterEach, describe, test, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import CalismaClient from '../calisma-client'
import { useAuthStore } from '@/stores/auth-store'
import { useGameStore } from '@/stores/game-store'

const useBilgeTahtaEnabled = vi.hoisted(() => vi.fn(() => true))
const trackBilgeBoardEvent = vi.hoisted(() => vi.fn())
const todayPlanFocusProps = vi.hoisted(() => vi.fn())
const masteryActionCardProps = vi.hoisted(() => vi.fn())

vi.mock('@/lib/bilge-tahta/client', () => ({ useBilgeTahtaEnabled }))
vi.mock('@/lib/bilge-tahta/analytics', () => ({ trackBilgeBoardEvent }))

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: vi.fn(),
}))
vi.mock('@/components/study/today-plan-focus', () => ({
  TodayPlanFocus: (props: unknown) => {
    todayPlanFocusProps(props)
    return <div data-testid="today-plan-focus" />
  },
}))
vi.mock('@/components/study/mastery-action-card', () => ({
  MasteryActionCard: (props: unknown) => {
    masteryActionCardProps(props)
    return <div data-testid="mastery-action-card" />
  },
}))
vi.mock('@/components/study/institution-weekly-program-card', () => ({
  InstitutionWeeklyProgramCard: () => <div data-testid="institution-weekly-program" />,
}))

const mockedUseAuthStore = vi.mocked(useAuthStore)

describe('CalismaClient', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_TYT_SOCIAL_V2_ENABLED', 'true')
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
    todayPlanFocusProps.mockClear()
    masteryActionCardProps.mockClear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

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
    expect(screen.getByRole('heading', { name: 'Matematik · TYT' })).toBeInTheDocument()
    const changeSelection = screen.getByRole('button', { name: 'Değiştir' })
    expect(changeSelection).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('group', { name: 'Ders seçimi' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Matematik turunu hazırla' })).toHaveAttribute('href', '/arena/matematik?exam_ref=TYT')
    fireEvent.click(changeSelection)
    expect(screen.getByRole('button', { name: 'Tamam' })).toHaveAttribute('aria-expanded', 'true')
    const gameGrid = document.querySelector('[data-study-game-grid]')
    expect(gameGrid).toHaveClass('grid', 'grid-cols-2', 'min-w-0', 'lg:grid-cols-2')
    expect(gameGrid).not.toHaveClass('overflow-x-auto')
    expect(document.querySelector('style')?.textContent).toContain('max-width: 1023px')
    expect(screen.getByRole('button', { name: /Matematik/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'TYT' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('button', { name: 'LGS' })).not.toBeInTheDocument()
    expect(screen.getByTestId('institution-weekly-program')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Matematik turunu hazırla' })).toHaveAttribute('href', '/arena/matematik?exam_ref=TYT')
    expect(screen.getByTestId('today-plan-focus')).toBeInTheDocument()
    expect(screen.getByTestId('mastery-action-card')).toBeInTheDocument()
    expect(document.querySelector('[data-practice-progress]')).toHaveClass('lg:col-start-1', 'lg:row-start-2')
    expect(screen.getByRole('link', { name: 'Profil sayfasını aç' })).toHaveAttribute('href', '/arena/profil')
  })

  test('yatay kaydırma mevcut ders geçişini kullanır ve dikey kaydırma dersi değiştirmez', () => {
    useGameStore.setState({ selectedGame: 'matematik', selectedCategory: 'problemler', selectedExamRef: 'TYT' })
    mockedUseAuthStore.mockReturnValue({ user: { id: 'u1' }, profile: { exam_type: 'yks' }, loading: false } as never)
    render(<CalismaClient />)
    const heading = screen.getByRole('heading', { name: 'Matematik · TYT' })
    fireEvent.touchStart(heading, { touches: [{ identifier: 1, clientX: 280, clientY: 130 }] })
    fireEvent.touchEnd(heading, { touches: [], changedTouches: [{ identifier: 1, clientX: 100, clientY: 134 }] })
    expect(useGameStore.getState().selectedGame).toBe('turkce')
    expect(useGameStore.getState().selectedCategory).toBeNull()
    expect(screen.getByRole('link', { name: 'Türkçe turunu hazırla' })).toHaveAttribute('href', '/arena/turkce?exam_ref=TYT')
    expect(screen.getByRole('button', { name: 'Değiştir' })).toHaveAttribute('aria-expanded', 'false')
    const nextHeading = screen.getByRole('heading', { name: 'Türkçe · TYT' })
    fireEvent.touchStart(nextHeading, { touches: [{ identifier: 1, clientX: 200, clientY: 130 }] })
    fireEvent.touchMove(nextHeading, { touches: [{ identifier: 1, clientX: 205, clientY: 220 }] })
    fireEvent.touchEnd(nextHeading, { touches: [], changedTouches: [{ identifier: 1, clientX: 205, clientY: 260 }] })
    expect(useGameStore.getState().selectedGame).toBe('turkce')
  })

  test('LGS kaydırma İngilizceye geçerken sınav tercihini saklar ve sınırda durur', () => {
    useGameStore.setState({ selectedGame: 'sosyal', selectedExamRef: 'LGS' })
    mockedUseAuthStore.mockReturnValue({ user: { id: 'u1' }, profile: { exam_type: 'lgs' }, loading: false } as never)
    render(<CalismaClient />)
    const swipeHeading = (from: number, to: number) => {
      const heading = screen.getByRole('heading', { level: 2, name: / · / })
      fireEvent.touchStart(heading, { touches: [{ identifier: 1, clientX: from, clientY: 130 }] })
      fireEvent.touchEnd(heading, { touches: [], changedTouches: [{ identifier: 1, clientX: to, clientY: 133 }] })
    }
    swipeHeading(280, 100)
    expect(screen.getByRole('link', { name: 'İngilizce turunu hazırla' })).toHaveAttribute('href', '/arena/wordquest')
    expect(useGameStore.getState().selectedExamRef).toBe('LGS')
    swipeHeading(280, 100)
    expect(useGameStore.getState().selectedGame).toBe('wordquest')
    swipeHeading(100, 280)
    expect(screen.getByRole('link', { name: 'Sosyal Bilimler turunu hazırla' })).toHaveAttribute('href', '/arena/sosyal?exam_ref=LGS')
  })

  test('LGS profilinde WordQuest görünür kalır ve sınavdan bağımsız açılır', () => {
    useGameStore.setState({ selectedGame: 'wordquest', selectedExamRef: 'TYT' })
    mockedUseAuthStore.mockReturnValue({
      user: { id: 'u1' },
      profile: { exam_type: 'lgs' },
      loading: false,
    } as never)
    render(<CalismaClient />)

    expect(screen.getByRole('heading', { name: 'İngilizce · Serbest' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Değiştir' }))
    expect(screen.getByRole('button', { name: /İngilizce/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('button', { name: 'LGS' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'YDT' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'İngilizce turunu hazırla' })).toHaveAttribute('href', '/arena/wordquest')
    expect(todayPlanFocusProps).toHaveBeenLastCalledWith(expect.objectContaining({ game: 'wordquest', examRef: null }))
    expect(masteryActionCardProps).toHaveBeenLastCalledWith(expect.objectContaining({ game: 'wordquest', examRef: null }))
  })

  test('TYT Sosyal setup_required iken çalışma devam eylemini fail-closed kapatır', async () => {
    useGameStore.setState({ selectedGame: 'sosyal', selectedExamRef: 'TYT' })
    mockedUseAuthStore.mockReturnValue({
      user: { id: 'u1' },
      profile: { exam_type: 'yks' },
      loading: false,
    } as never)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 'setup_required',
        policyVersion: 'tyt-social-2026-v1',
        rulesSha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        appliesTo: 'new_artifacts_only',
      }),
    }))

    render(<CalismaClient />)
    await waitFor(() => expect(screen.getByText('TYT Sosyal cevaplama düzeni')).toBeInTheDocument())
    expect(screen.queryByRole('link', { name: /turunu hazırla/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'TYT Sosyal seçimi gerekli' })).toBeDisabled()
    expect(masteryActionCardProps).toHaveBeenLastCalledWith(expect.objectContaining({
      game: 'sosyal', userId: undefined, examRef: 'TYT', policyEpoch: null,
    }))
  })

  test('ders değişimi stale kategori temizler ve geçerli sınavı korur', () => {
    useGameStore.setState({ selectedCategory: 'problemler', selectedExamRef: 'TYT' })
    mockedUseAuthStore.mockReturnValue({
      user: { id: 'u1' },
      profile: { exam_type: 'yks' },
      loading: false,
    } as never)
    render(<CalismaClient />)

    fireEvent.click(screen.getByRole('button', { name: 'Değiştir' }))
    fireEvent.click(screen.getByRole('button', { name: /Türkçe/ }))
    expect(useGameStore.getState().selectedGame).toBe('turkce')
    expect(useGameStore.getState().selectedExamRef).toBe('TYT')
    expect(useGameStore.getState().selectedCategory).toBeNull()
    expect(screen.getByRole('link', { name: 'Türkçe turunu hazırla' })).toHaveAttribute('href', '/arena/turkce?exam_ref=TYT')
    fireEvent.click(screen.getByRole('button', { name: 'Tamam' }))
    expect(screen.getByRole('heading', { name: 'Türkçe · TYT' })).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Ders seçimi' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Değiştir' }))
    expect(screen.getByRole('button', { name: 'Türkçe' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.keyDown(screen.getByRole('button', { name: 'Türkçe' }), { key: 'Escape' })
    expect(screen.getByRole('button', { name: 'Değiştir' })).toHaveFocus()
    expect(screen.queryByRole('group', { name: 'Ders seçimi' })).not.toBeInTheDocument()
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

    fireEvent.click(screen.getByRole('button', { name: 'Değiştir' }))
    fireEvent.click(screen.getByRole('button', { name: /İngilizce/ }))
    expect(useGameStore.getState()).toMatchObject({
      selectedGame: 'wordquest',
      selectedCategory: null,
      selectedExamRef: 'AYT-SAY',
    })
    expect(todayPlanFocusProps).toHaveBeenLastCalledWith(expect.objectContaining({
      game: 'wordquest',
      examRef: null,
    }))
    expect(masteryActionCardProps).toHaveBeenLastCalledWith(expect.objectContaining({
      game: 'wordquest',
      examRef: null,
    }))
    expect(screen.queryByRole('button', { name: 'YDT' })).not.toBeInTheDocument()

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
