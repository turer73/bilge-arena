import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import HakimiyetClient from '../hakimiyet-client'
import { useMasteryMap } from '@/lib/hooks/use-mastery-map'
import { useGameStore } from '@/stores/game-store'

const pushMock = vi.fn()
const authState = vi.hoisted(() => ({
  user: null as null | { id: string },
  profile: null as null | { exam_type: string },
  loading: false,
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => new URLSearchParams('game=matematik&exam_ref=TYT'),
}))
vi.mock('@/stores/auth-store', () => ({ useAuthStore: () => authState }))
vi.mock('@/lib/hooks/use-mastery-map', () => ({ useMasteryMap: vi.fn() }))
vi.mock('@/components/study/mastery-graph', () => ({
  MasteryGraph: ({ onPractice }: { onPractice: (outcome: unknown) => void }) => (
    <button onClick={() => onPractice({ game: 'matematik', category: 'sayilar', examRef: 'TYT' })}>
      Grafikten çalış
    </button>
  ),
}))

const mockedUseMasteryMap = vi.mocked(useMasteryMap)

describe('HakimiyetClient', () => {
  beforeEach(() => {
    pushMock.mockClear()
    authState.user = null
    authState.profile = null
    authState.loading = false
    mockedUseMasteryMap.mockReset()
    mockedUseMasteryMap.mockReturnValue({
      response: null,
      discovery: null,
      graph: null,
      outcomes: [],
      coverage: { supported: false, diagnosticAvailable: false, taxonomyVersion: null, totalQuestions: 0, mappedQuestions: 0, percentage: 0 },
      loading: false,
      error: false,
      fetchMastery: vi.fn(),
    })
  })

  it('giris yoksa ozel haritayi gostermeyip giris CTA sunar', () => {
    render(<HakimiyetClient />)
    expect(screen.getByText(/Giriş Yapmanız Gerekiyor/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Giriş Yap' })).toHaveAttribute('href', '/giris')
  })

  it('exact query scope ile hooku cagirir ve leaf pratigi filtreleri kurar', () => {
    authState.user = { id: 'u1' }
    mockedUseMasteryMap.mockReturnValue({
      response: { game: 'matematik' } as never,
      discovery: null,
      graph: { code: 'course' } as never,
      outcomes: [],
      coverage: { supported: true, diagnosticAvailable: true, taxonomyVersion: 'ba-tyt-math-v1', totalQuestions: 1, mappedQuestions: 1, percentage: 100 },
      loading: false,
      error: false,
      fetchMastery: vi.fn(),
    })

    render(<HakimiyetClient />)
    expect(mockedUseMasteryMap).toHaveBeenCalledWith('matematik', 'u1', 'TYT')
    fireEvent.click(screen.getByRole('button', { name: 'Grafikten çalış' }))

    const state = useGameStore.getState()
    expect(state.selectedGame).toBe('matematik')
    expect(state.selectedCategory).toBe('sayilar')
    expect(state.selectedExamRef).toBe('TYT')
    expect(state.selectedMode).toBe('practice')
    expect(pushMock).toHaveBeenCalledWith('/arena/matematik')
  })

  it('API haritasi yoksa sahte bos grafik yerine yukleme hatasi gosterir', () => {
    authState.user = { id: 'u1' }
    render(<HakimiyetClient />)
    expect(screen.getByText(/şu an yüklenemedi/i)).toBeInTheDocument()
  })
})
