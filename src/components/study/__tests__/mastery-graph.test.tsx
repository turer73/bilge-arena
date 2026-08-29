import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MasteryGraph } from '../mastery-graph'
import type { MasteryOutcomePublic } from '@/lib/mastery/public-contract'

const graph = {
  code: 'MAT-TYT', title: 'TYT Matematik', nodeType: 'course' as const, children: [{
    code: 'U1', title: 'Sayılar ve Cebir', nodeType: 'unit' as const, children: [{
      code: 'T1', title: 'Sayılar', nodeType: 'topic' as const, children: [{
        code: 'L1', title: 'Sayılar ve işlem becerisi', nodeType: 'outcome' as const,
        outcomeCode: 'MAT-SAY-01', children: [],
      }],
    }],
  }],
}

const outcome: MasteryOutcomePublic = {
  code: 'MAT-SAY-01', nodeCode: 'L1', path: ['TYT Matematik', 'Sayılar ve Cebir', 'Sayılar', 'Sayılar ve işlem becerisi'],
  title: 'Sayılar ve işlem becerisi', description: null, game: 'matematik', category: 'sayilar', examRef: 'TYT',
  attempts: 5, correctAttempts: 3, weightedEarned: 3, weightedPossible: 5, delayedCorrect: 1,
  verifiedEvidenceDays: 3,
  accuracy: 60, rawAccuracy: 60, difficultyAccuracy: 58, averageTimeSec: 31.2,
  fastWrongRate: 20, hintRate: 20, averageHintStage: 1, guessRisk: 0, carelessRisk: 20,
  evidenceCompleteness: 100, score: 68, status: 'developing', modelVersion: 'evidence-v2',
  components: { accuracy: 33, delayedRetrieval: 20, independence: 13, selfRegulation: 8 },
  lastAnsweredAt: null,
}

describe('MasteryGraph', () => {
  it('hiyerarşiyi ve açıklanabilir kanıtları gösterir', () => {
    render(<MasteryGraph
      graph={graph}
      coverage={{ supported: true, diagnosticAvailable: true, taxonomyVersion: 'ba-tyt-math-v1', totalQuestions: 120, mappedQuestions: 120, percentage: 100 }}
      discovery={null}
      outcomes={[outcome]}
    />)

    expect(screen.getByRole('heading', { name: 'TYT Matematik' })).toBeInTheDocument()
    expect(screen.getByText('Sayılar ve Cebir')).toBeInTheDocument()
    expect(screen.getByText('Zorluk doğruluğu %58')).toBeInTheDocument()
    expect(screen.getByText('Gecikmeli doğru 1')).toBeInTheDocument()
    expect(screen.getByText('Aktif soru bankası eşlemesi: %100')).toBeInTheDocument()
    expect(screen.getByText(/resmî müfredat kodu değildir/i)).toBeInTheDocument()
  })

  it('gelişen leaf için pratik CTA sonucunu döndürür', () => {
    const onPractice = vi.fn()
    render(<MasteryGraph
      graph={graph}
      coverage={{ supported: true, diagnosticAvailable: true, taxonomyVersion: 'ba-tyt-math-v1', totalQuestions: 120, mappedQuestions: 120, percentage: 100 }}
      discovery={null}
      outcomes={[outcome]}
      onPractice={onPractice}
    />)

    fireEvent.click(screen.getByRole('button', { name: 'Bu kazanımı çalış' }))
    expect(onPractice).toHaveBeenCalledWith(outcome)
  })

  it('desteklenmeyen kapsamı sahte yüzde göstermeden açıklar', () => {
    render(<MasteryGraph
      graph={null}
      coverage={{ supported: false, diagnosticAvailable: false, taxonomyVersion: null, totalQuestions: 0, mappedQuestions: 0, percentage: 0 }}
      discovery={null}
      outcomes={[]}
    />)

    expect(screen.getByText(/haritası hazırlanıyor/i)).toBeInTheDocument()
    expect(screen.queryByText(/%0 kapsam/)).not.toBeInTheDocument()
  })

  it('yetersiz kanıtta sıfır metrikleri başarı sonucu gibi göstermez', () => {
    render(<MasteryGraph
      graph={graph}
      coverage={{ supported: true, diagnosticAvailable: true, taxonomyVersion: 'ba-tyt-math-v1', totalQuestions: 120, mappedQuestions: 120, percentage: 100 }}
      discovery={{ level: 2, stage: 'evidence', diagnosticCompleted: true, evidenceCollected: 1, evidenceTarget: 3, readyOutcomes: 0, totalOutcomes: 1, journeyPercentage: 50 }}
      outcomes={[{ ...outcome, attempts: 1, correctAttempts: 0, verifiedEvidenceDays: 1, evidenceCompleteness: 33, status: 'insufficient', difficultyAccuracy: 0, fastWrongRate: 0 }]}
    />)

    expect(screen.getByText(/Hüküm yok: 1\/3 farklı gün kanıtı/i)).toBeInTheDocument()
    expect(screen.queryByText('Zorluk doğruluğu %0')).not.toBeInTheDocument()
    expect(screen.getByText('KEŞİF SEVİYESİ 2/3')).toBeInTheDocument()
    expect(screen.getAllByText(/1\/3 farklı gün kanıtı/i)).toHaveLength(2)
    expect(screen.getByText(/aynı gün içindeki birden fazla doğrulanmış cevap.*tek gün sayılır/i)).toBeInTheDocument()
  })

  it('tanilama olmayan kapsamda eksik tanilama iddiasi yerine pratik kanitini aciklar', () => {
    render(<MasteryGraph
      graph={graph}
      coverage={{ supported: true, diagnosticAvailable: false, taxonomyVersion: 'ba-tyt-turkce-v1', totalQuestions: 120, mappedQuestions: 120, percentage: 100 }}
      discovery={{ level: 1, stage: 'estimate', diagnosticCompleted: false, evidenceCollected: 0, evidenceTarget: 3, readyOutcomes: 0, totalOutcomes: 1, journeyPercentage: 0 }}
      outcomes={[{ ...outcome, game: 'turkce', category: 'paragraf', attempts: 0, correctAttempts: 0, verifiedEvidenceDays: 0, status: 'insufficient' }]}
    />)

    expect(screen.getByText(/başlangıç seviyesi pratik kanıtlarıyla oluşuyor/i)).toBeInTheDocument()
    expect(screen.queryByText(/tanılaması henüz tamamlanmadı/i)).not.toBeInTheDocument()
  })
})
