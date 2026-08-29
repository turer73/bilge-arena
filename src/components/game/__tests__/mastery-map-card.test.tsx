import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MasteryMapCard } from '../mastery-map-card'
import type { MasteryOutcome } from '@/lib/hooks/use-mastery-map'

const outcome: MasteryOutcome = {
  code: 'MAT-SAY-01',
  nodeCode: 'ba-tyt-math-v1:outcome:sayilar',
  path: ['TYT Matematik', 'Sayılar ve Cebir', 'Sayılar', 'Sayılar ve işlem'],
  title: 'Sayılar ve işlem becerisi (pilot)',
  description: 'Pilot',
  game: 'matematik',
  category: 'sayilar',
  examRef: 'TYT',
  attempts: 5,
  correctAttempts: 4,
  weightedEarned: 4,
  weightedPossible: 5,
  delayedCorrect: 1,
  accuracy: 80,
  rawAccuracy: 80,
  difficultyAccuracy: 82,
  averageTimeSec: 11.5,
  fastWrongRate: 0,
  hintRate: 20,
  averageHintStage: 1,
  guessRisk: 0,
  carelessRisk: 0,
  evidenceCompleteness: 100,
  score: 84,
  status: 'mastered',
  modelVersion: 'evidence-v2',
  components: { accuracy: 45, delayedRetrieval: 20, independence: 14, selfRegulation: 5 },
  lastAnsweredAt: '2026-07-22T08:00:00Z',
}

describe('MasteryMapCard', () => {
  it('bos ve yuklenen durumda sessizce gizlenir', () => {
    const { container, rerender } = render(<MasteryMapCard outcomes={[]} discovery={null} diagnosticAvailable={false} loading={false} />)
    expect(container).toBeEmptyDOMElement()
    rerender(<MasteryMapCard outcomes={[outcome]} discovery={null} diagnosticAvailable loading />)
    expect(container).toBeEmptyDOMElement()
  })

  it('ham kaniti, durumu ve pilot uyarisi birlikte gosterir', () => {
    render(<MasteryMapCard outcomes={[outcome]} discovery={null} diagnosticAvailable loading={false} />)
    expect(screen.getByText('Ustalaştın')).toBeInTheDocument()
    expect(screen.getByText('%84')).toBeInTheDocument()
    expect(screen.getByText('4/5 doğru')).toBeInTheDocument()
    expect(screen.getByText('1 gecikmeli doğru')).toBeInTheDocument()
    expect(screen.getByText(/resmî kazanım sınıflandırması değildir/i)).toBeInTheDocument()
  })

  it('az kanitta dogruluk yerine kanit sayisini gosterir', () => {
    render(<MasteryMapCard outcomes={[{
      ...outcome,
      attempts: 2,
      correctAttempts: 2,
      delayedCorrect: 0,
      accuracy: 100,
      rawAccuracy: 100,
      difficultyAccuracy: 100,
      evidenceCompleteness: 40,
      score: 100,
      status: 'insufficient',
    }]} discovery={null} diagnosticAvailable loading={false} />)
    expect(screen.getByText('2/3 kanıt')).toBeInTheDocument()
    expect(screen.queryByText('%100')).not.toBeInTheDocument()
  })

  it('ilk günde sahte skor yerine keşif seviyesini ve tanılama aksiyonunu gösterir', () => {
    render(<MasteryMapCard
      outcomes={[{ ...outcome, attempts: 0, correctAttempts: 0, delayedCorrect: 0, status: 'insufficient' }]}
      discovery={{ level: 1, stage: 'estimate', diagnosticCompleted: false, evidenceCollected: 0, evidenceTarget: 3, readyOutcomes: 0, totalOutcomes: 1, journeyPercentage: 0 }}
      diagnosticAvailable
      loading={false}
    />)
    expect(screen.getByText('KEŞİF SEVİYESİ 1/3')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /keşif turunu başlat/i })).toHaveAttribute(
      'href',
      '/arena/tani?game=matematik&exam_ref=TYT',
    )
    expect(screen.queryByText('%84')).not.toBeInTheDocument()
  })

  it('tanilama desteklenmeyen derste matematik turu yerine kapsamli pratige yonlendirir', () => {
    render(<MasteryMapCard
      outcomes={[{
        ...outcome,
        game: 'turkce',
        category: 'paragraf',
        examRef: 'TYT',
        attempts: 0,
        correctAttempts: 0,
        delayedCorrect: 0,
        status: 'insufficient',
      }]}
      discovery={{ level: 1, stage: 'estimate', diagnosticCompleted: false, evidenceCollected: 0, evidenceTarget: 3, readyOutcomes: 0, totalOutcomes: 1, journeyPercentage: 0 }}
      diagnosticAvailable={false}
      loading={false}
    />)
    expect(screen.getByText(/pratik kanıtlarınla başlangıç rotanı/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /keşif pratiğine geç/i })).toHaveAttribute(
      'href',
      '/arena/turkce?category=paragraf&exam_ref=TYT',
    )
    expect(screen.queryByRole('link', { name: /8 dakikalık/i })).not.toBeInTheDocument()
  })
})
