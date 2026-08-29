import { describe, test, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MasteryActionCard } from '../mastery-action-card'
import { useMasteryMap, type MasteryOutcome } from '@/lib/hooks/use-mastery-map'
import { useGameStore } from '@/stores/game-store'

const pushMock = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}))
vi.mock('@/lib/hooks/use-mastery-map', () => ({
  useMasteryMap: vi.fn(),
}))

const mockedUseMasteryMap = vi.mocked(useMasteryMap)
const fetchMasteryMock = vi.fn()

const supportedCoverage = {
  supported: true,
  diagnosticAvailable: true,
  taxonomyVersion: 'ba-tyt-math-v1',
  totalQuestions: 10,
  mappedQuestions: 10,
  percentage: 100,
}

function hookResult(overrides: Record<string, unknown> = {}) {
  return {
    response: { coverage: supportedCoverage },
    outcomes: [],
    discovery: null,
    coverage: supportedCoverage,
    loading: false,
    error: false,
    fetchMastery: fetchMasteryMock,
    ...overrides,
  }
}

function mkOutcome(overrides: Partial<MasteryOutcome> = {}): MasteryOutcome {
  return {
    code: 'MAT-SAY-01',
    nodeCode: 'ba-tyt-math-v1:outcome:sayilar',
    path: ['TYT Matematik', 'Sayılar ve Cebir', 'Sayılar', 'Sayılar ve işlem'],
    title: 'Sayılar ve işlem becerisi',
    description: null,
    game: 'matematik',
    category: 'sayilar',
    examRef: 'TYT',
    attempts: 6,
    correctAttempts: 3,
    weightedEarned: 3,
    weightedPossible: 6,
    delayedCorrect: 0,
    accuracy: 50,
    rawAccuracy: 50,
    difficultyAccuracy: 50,
    averageTimeSec: 12,
    fastWrongRate: 20,
    hintRate: 0,
    averageHintStage: null,
    guessRisk: 0,
    carelessRisk: 0,
    evidenceCompleteness: 100,
    score: 50,
    status: 'developing',
    modelVersion: 'evidence-v2',
    components: { accuracy: 28, delayedRetrieval: 0, independence: 15, selfRegulation: 7 },
    lastAnsweredAt: null,
    ...overrides,
  }
}

describe('MasteryActionCard', () => {
  beforeEach(() => {
    pushMock.mockClear()
    fetchMasteryMock.mockClear()
    mockedUseMasteryMap.mockReset()
    useGameStore.setState({
      selectedGame: null,
      selectedMode: 'classic',
      selectedCategory: null,
      selectedDifficulty: null,
      selectedExamRef: null,
    })
  })

  test('loading sirasinda render etmez', () => {
    mockedUseMasteryMap.mockReturnValue(hookResult({ loading: true }) as never)
    const { container } = render(<MasteryActionCard game="matematik" userId="u1" />)
    expect(container.innerHTML).toBe('')
  })

  test('release edilmemis kapsamda sessizce kaybolmak yerine hazirlaniyor durumunu gosterir', () => {
    const coverage = {
      supported: false, diagnosticAvailable: false, taxonomyVersion: null,
      totalQuestions: 0, mappedQuestions: 0, percentage: 0,
    }
    mockedUseMasteryMap.mockReturnValue(hookResult({
      response: { coverage }, coverage,
    }) as never)
    render(<MasteryActionCard game="turkce" userId="u1" examRef="TYT" />)
    expect(screen.getByText('KEŞİF SEVİYESİ HAZIRLANIYOR')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Serbest pratikle devam et' })).toHaveAttribute('href', '/arena/turkce')
  })

  test('yukleme hatasinda tekrar deneme sunar', () => {
    mockedUseMasteryMap.mockReturnValue(hookResult({ response: null, error: true }) as never)
    render(<MasteryActionCard game="fen" userId="u1" examRef="TYT" />)
    fireEvent.click(screen.getByRole('button', { name: 'Tekrar Dene' }))
    expect(fetchMasteryMock).toHaveBeenCalledTimes(1)
  })

  test('tüm kazanımlar mastered ise güçlü durumunu gösterir', () => {
    mockedUseMasteryMap.mockReturnValue(hookResult({
      outcomes: [mkOutcome({ status: 'mastered', accuracy: 92, score: 92 })],
    }) as never)
    render(<MasteryActionCard game="matematik" userId="u1" />)
    expect(screen.getByText('GÜÇLÜ')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  test('güvenilir developing kazanımı insufficient kanıttan önce next-best seçer', () => {
    mockedUseMasteryMap.mockReturnValue(hookResult({
      outcomes: [
        mkOutcome({ code: 'KANIT', title: 'Yeni konu', status: 'insufficient', attempts: 2, evidenceCompleteness: 66 }),
        mkOutcome({ code: 'GELISEN', title: 'Gelişen konu', status: 'developing', score: 32 }),
      ],
    }) as never)
    render(<MasteryActionCard game="matematik" userId="u1" />)

    expect(screen.getByText('Gelişen konu')).toBeInTheDocument()
    expect(screen.getByText('GELİŞİYOR')).toBeInTheDocument()
    expect(screen.queryByText('Yeni konu')).not.toBeInTheDocument()
  })

  test('yalnız insufficient varsa zayıf demeden kanıt toplama aksiyonu verir', () => {
    mockedUseMasteryMap.mockReturnValue(hookResult({
      outcomes: [mkOutcome({ status: 'insufficient', attempts: 1, evidenceCompleteness: 34 })],
    }) as never)
    render(<MasteryActionCard game="matematik" userId="u1" examRef="TYT" />)

    expect(screen.getByText('KANIT TOPLA')).toBeInTheDocument()
    expect(screen.queryByText(/zayıf/i)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Kanıt İçin Pratik Yap' }))

    const state = useGameStore.getState()
    expect(state.selectedGame).toBe('matematik')
    expect(state.selectedCategory).toBe('sayilar')
    expect(state.selectedExamRef).toBe('TYT')
    expect(state.selectedMode).toBe('practice')
    expect(pushMock).toHaveBeenCalledWith('/arena/matematik')
  })

  test('ilk kullanımda skor yerine keşif turuna yönlendirir', () => {
    mockedUseMasteryMap.mockReturnValue(hookResult({
      outcomes: [mkOutcome({ status: 'insufficient', attempts: 0, score: 0 })],
      discovery: {
        level: 1, stage: 'estimate', diagnosticCompleted: false,
        evidenceCollected: 0, evidenceTarget: 3, readyOutcomes: 0,
        totalOutcomes: 1, journeyPercentage: 0,
      },
    }) as never)
    render(<MasteryActionCard game="matematik" userId="u1" examRef="TYT" />)

    expect(screen.getByText('KEŞİF SEVİYESİ 1/3')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Keşif Turunu Başlat' })).toHaveAttribute(
      'href',
      '/arena/tani?game=matematik&exam_ref=TYT',
    )
    expect(screen.queryByText(/zayıf/i)).not.toBeInTheDocument()
  })

  test('tanilamasi olmayan released derste dogrudan kanit pratigine baslar', () => {
    const fenCoverage = {
      ...supportedCoverage,
      diagnosticAvailable: false,
      taxonomyVersion: 'ba-tyt-fen-v1',
    }
    mockedUseMasteryMap.mockReturnValue(hookResult({
      response: { coverage: fenCoverage },
      coverage: fenCoverage,
      outcomes: [mkOutcome({
        code: 'FEN-FIZ-01', game: 'fen', category: 'fizik', examRef: 'TYT',
        title: 'Fiziksel akıl yürütme', status: 'insufficient', attempts: 0, score: 0,
      })],
      discovery: {
        level: 1, stage: 'estimate', diagnosticCompleted: false,
        evidenceCollected: 0, evidenceTarget: 3, readyOutcomes: 0,
        totalOutcomes: 1, journeyPercentage: 0,
      },
    }) as never)
    render(<MasteryActionCard game="fen" userId="u1" examRef="TYT" />)

    fireEvent.click(screen.getByRole('button', { name: 'Keşif Pratiğini Başlat' }))
    expect(useGameStore.getState()).toMatchObject({
      selectedGame: 'fen', selectedCategory: 'fizik', selectedExamRef: 'TYT', selectedMode: 'practice',
    })
    expect(pushMock).toHaveBeenCalledWith('/arena/fen')
    expect(screen.queryByRole('link', { name: 'Keşif Turunu Başlat' })).not.toBeInTheDocument()
  })

  test('Wordquest mastery YDT etiketini soru filtresine tasimaz', () => {
    useGameStore.setState({ selectedExamRef: 'TYT' })
    const ydtCoverage = {
      ...supportedCoverage,
      diagnosticAvailable: false,
      taxonomyVersion: 'ba-ydt-eng-v1',
    }
    mockedUseMasteryMap.mockReturnValue(hookResult({
      response: { coverage: ydtCoverage },
      coverage: ydtCoverage,
      outcomes: [mkOutcome({
        code: 'ENG-VOC-01', game: 'wordquest', category: 'vocabulary', examRef: 'YDT',
        title: 'Kelime bilgisi', status: 'insufficient', attempts: 0, score: 0,
      })],
    }) as never)
    render(<MasteryActionCard game="wordquest" userId="u1" />)

    fireEvent.click(screen.getByRole('button', { name: 'Kanıt İçin Pratik Yap' }))
    expect(useGameStore.getState()).toMatchObject({
      selectedGame: 'wordquest', selectedCategory: 'vocabulary', selectedExamRef: 'TYT', selectedMode: 'practice',
    })
    expect(pushMock).toHaveBeenCalledWith('/arena/wordquest')
  })

  test('kanıt evresinde en az denenmiş kazanımı sıraya alır', () => {
    mockedUseMasteryMap.mockReturnValue(hookResult({
      outcomes: [
        mkOutcome({ code: 'IKI', title: 'İki kez denendi', status: 'insufficient', attempts: 2 }),
        mkOutcome({ code: 'SIFIR', title: 'Henüz denenmedi', status: 'insufficient', attempts: 0 }),
      ],
      discovery: {
        level: 2, stage: 'evidence', diagnosticCompleted: true,
        evidenceCollected: 2, evidenceTarget: 6, readyOutcomes: 0,
        totalOutcomes: 2, journeyPercentage: 50,
      },
    }) as never)
    render(<MasteryActionCard game="matematik" userId="u1" examRef="TYT" />)

    expect(screen.getByText('KEŞİF SEVİYESİ 2/3')).toBeInTheDocument()
    expect(screen.getByText('Henüz denenmedi')).toBeInTheDocument()
    expect(screen.queryByText('İki kez denendi')).not.toBeInTheDocument()
  })
})
