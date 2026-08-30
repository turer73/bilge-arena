import { describe, expect, it } from 'vitest'
import {
  buildInstitutionStudentLearningAnalysis,
  institutionStudentLearningAnalysisSchema,
  withInstitutionDiagnosticSources,
} from '../student-analysis'

const base = {
  classroom: {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'TYT A Sınıfı',
  },
  student: {
    memberRef: 'a'.repeat(32),
    alias: 'Bilge Öğrenci',
    joinedAt: '2026-08-01T09:00:00.000Z',
  },
  scope: {
    game: 'matematik',
    examRef: 'TYT',
    taxonomyVersion: 'ba-tyt-math-v1',
    modelVersion: 'institution-evidence-v1',
    windowStart: '2026-08-01T09:00:00.000Z',
    windowEnd: '2026-08-13T12:00:00.000Z',
  },
  coverage: {
    supported: true,
    totalQuestions: 120,
    mappedQuestions: 120,
    percentage: 100,
  },
  outcomes: [
    {
      code: 'MAT-SAY-01',
      nodeCode: 'ba-tyt-math-v1:outcome:mat-say-01',
      path: ['TYT Matematik', 'Sayılar ve Cebir', 'Temel Kavramlar', 'Sayı Kümeleri'],
      title: 'Sayı Kümeleri',
      category: 'sayilar',
      attempts: 2,
      correctAttempts: 2,
      independentAttempts: 1,
      weightedEarned: 2,
      weightedPossible: 2,
      delayedCorrect: 0,
      difficultyWeightedEarned: 5,
      difficultyWeightedPossible: 5,
      timedAttempts: 2,
      totalTimeSec: 50,
      fastWrong: 0,
      hintedAttempts: 0,
      hintStageSum: 0,
      guessAnnotations: 0,
      carelessAnnotations: 0,
      firstEvidenceAt: '2026-08-02T10:00:00.000Z',
      lastEvidenceAt: '2026-08-02T10:02:00.000Z',
    },
    {
      code: 'MAT-SAY-02',
      nodeCode: 'ba-tyt-math-v1:outcome:mat-say-02',
      path: ['TYT Matematik', 'Sayılar ve Cebir', 'Temel Kavramlar', 'İşlem Becerisi'],
      title: 'İşlem Becerisi',
      category: 'sayilar',
      attempts: 10,
      correctAttempts: 9,
      independentAttempts: 5,
      weightedEarned: 9,
      weightedPossible: 10,
      delayedCorrect: 2,
      difficultyWeightedEarned: 28,
      difficultyWeightedPossible: 30,
      timedAttempts: 10,
      totalTimeSec: 300,
      fastWrong: 0,
      hintedAttempts: 1,
      hintStageSum: 1,
      guessAnnotations: 0,
      carelessAnnotations: 0,
      firstEvidenceAt: '2026-08-02T10:00:00.000Z',
      lastEvidenceAt: '2026-08-12T10:00:00.000Z',
    },
  ],
} as const

describe('institution student learning analysis', () => {
  it('keeps sparse perfect results insufficient instead of claiming mastery', () => {
    const result = buildInstitutionStudentLearningAnalysis(base)
    expect(result).not.toBeNull()
    expect(result!.outcomes[0].assessment).toMatchObject({
      status: 'insufficient',
      score: null,
      confidence: 'insufficient',
      evidence: { evidenceCount: 2, independentEvidenceCount: 1 },
    })
  })

  it('requires repeated independent and delayed evidence for high-confidence mastery', () => {
    const result = buildInstitutionStudentLearningAnalysis(base)
    expect(result!.outcomes[1].assessment).toMatchObject({
      status: 'mastered',
      confidence: 'high',
      evidence: {
        evidenceCount: 10,
        independentEvidenceCount: 5,
        windowStart: base.scope.windowStart,
        modelVersion: 'institution-evidence-v1',
        taxonomyVersion: 'ba-tyt-math-v1',
      },
    })
    expect(result!.summary).toEqual({
      outcomeCount: 2,
      assessedOutcomeCount: 1,
      insufficientOutcomeCount: 1,
      developingOutcomeCount: 0,
      masteredOutcomeCount: 1,
    })
    expect(institutionStudentLearningAnalysisSchema.safeParse(result).success).toBe(true)
  })

  it('rejects evidence before membership, incomplete coverage and hidden raw identifiers', () => {
    expect(buildInstitutionStudentLearningAnalysis({
      ...base,
      outcomes: [{ ...base.outcomes[0], firstEvidenceAt: '2026-07-31T10:00:00.000Z' }],
    })).toBeNull()
    expect(buildInstitutionStudentLearningAnalysis({
      ...base,
      coverage: { ...base.coverage, mappedQuestions: 119, percentage: 99 },
    })).toBeNull()
    expect(buildInstitutionStudentLearningAnalysis({
      ...base,
      outcomes: [{ ...base.outcomes[0], answerId: 'raw-answer-id' }],
    })).toBeNull()
  })

  it('accepts a registry-shaped taxonomy upgrade and propagates it into evidence', () => {
    const upgraded = {
      ...base,
      scope: { ...base.scope, taxonomyVersion: 'ba-tyt-math-v2' },
      outcomes: base.outcomes.map((outcome) => ({
        ...outcome,
        nodeCode: outcome.nodeCode.replace('ba-tyt-math-v1', 'ba-tyt-math-v2'),
      })),
    }
    const result = buildInstitutionStudentLearningAnalysis(upgraded)
    expect(result?.scope.taxonomyVersion).toBe('ba-tyt-math-v2')
    expect(result?.outcomes[0].assessment.evidence.taxonomyVersion).toBe('ba-tyt-math-v2')
    expect(buildInstitutionStudentLearningAnalysis({
      ...upgraded,
      scope: { ...upgraded.scope, taxonomyVersion: 'math-v2' },
    })).toBeNull()
  })

  it('fails closed when the separately-authorized diagnostic source response is malformed', () => {
    const merged = withInstitutionDiagnosticSources(base, { sources: [{ outcomeCode: 'MAT-SAY-01' }] })
    expect(buildInstitutionStudentLearningAnalysis(merged)).toBeNull()
    expect(buildInstitutionStudentLearningAnalysis(
      withInstitutionDiagnosticSources(base, { sources: [] }),
    )).not.toBeNull()
  })
})
