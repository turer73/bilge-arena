import { describe, expect, it } from 'vitest'
import { DEFAULT_DERIVE_OPTIONS, deriveOutcome, hasConverged, toStanding } from '../consensus'
import { messageId } from '../transcript'
import type { CouncilFailure, CouncilMessage, CouncilTranscript, Stance } from '../types'

function msg(round: number, id: string, stance: Stance, extra: Partial<CouncilMessage['payload']> = {}): CouncilMessage {
  return {
    id: messageId(round, id),
    round,
    participantId: id,
    displayName: id,
    role: 'rol',
    payload: {
      reasoning: 'r',
      stance,
      position: `${id}@${round}`,
      respondsTo: [],
      openQuestions: [],
      blocking: false,
      ...extra,
    },
    telemetry: {
      providerId: id,
      modelId: 'm',
      promptVersion: 'council-turn@1',
      latencyMs: 1,
      inputTokens: null,
      outputTokens: null,
      finishReason: 'STOP',
      attempts: 1,
    },
    createdAt: '2026-08-29T00:00:00.000Z',
  }
}

function failure(round: number, id: string): CouncilFailure {
  return {
    id: messageId(round, id),
    round,
    participantId: id,
    error: { kind: 'transport', message: '401', retryable: false },
    telemetry: {
      providerId: id,
      modelId: 'm',
      promptVersion: 'council-turn@1',
      latencyMs: 1,
      inputTokens: null,
      outputTokens: null,
      finishReason: null,
      attempts: 1,
    },
    createdAt: '2026-08-29T00:00:00.000Z',
  }
}

function t(messages: CouncilMessage[], failures: CouncilFailure[] = []): CouncilTranscript {
  return { messages, failures }
}

const BOTH = ['codex', 'claude']

describe('ariza anlasmazlik degildir', () => {
  it('tek katilimci konustuysa uzlasma DEGIL, inconclusive', () => {
    const out = deriveOutcome(t([msg(1, 'codex', 'agree')], [failure(1, 'claude')]), BOTH)
    expect(out.kind).toBe('inconclusive')
    expect(out.rationale).toContain('claude')
    expect(out.rationale).toContain('1 basarisiz tur')
  })

  it('hic mesaj yoksa inconclusive', () => {
    expect(deriveOutcome(t([]), BOTH).kind).toBe('inconclusive')
  })

  it('ariza kapisi itiraz kapisindan ONCE calisir', () => {
    // Tek konusan disagree dese bile bu bir "split" degil: karsi taraf hic
    // konusamamis, ortada tartisma yok.
    const out = deriveOutcome(t([msg(1, 'codex', 'disagree')], [failure(1, 'claude')]), BOTH)
    expect(out.kind).toBe('inconclusive')
  })
})

describe('uzlasma', () => {
  it('konusan herkes agree ise converged', () => {
    const out = deriveOutcome(t([msg(2, 'codex', 'agree'), msg(2, 'claude', 'agree')]), BOTH)
    expect(out.kind).toBe('converged')
    expect(out.standing).toHaveLength(2)
  })

  it('acik sorular uzlasmayi ENGELLEMEZ ama rapora girer', () => {
    const out = deriveOutcome(
      t([
        msg(2, 'codex', 'agree', { openQuestions: ['load testi yapildi mi?'] }),
        msg(2, 'claude', 'agree', { openQuestions: ['load testi yapildi mi?', 'geri alma plani?'] }),
      ]),
      BOTH,
    )
    expect(out.kind).toBe('converged')
    expect(out.openQuestions).toEqual(['load testi yapildi mi?', 'geri alma plani?'])
  })

  it('cekimser payda disi — kalan herkes agree ise converged', () => {
    const out = deriveOutcome(
      t([msg(1, 'codex', 'agree'), msg(1, 'claude', 'agree'), msg(1, 'gemini', 'abstain')]),
      ['codex', 'claude', 'gemini'],
    )
    expect(out.kind).toBe('converged')
  })

  it('cekimserler payda sayilirsa uzlasma bozulur', () => {
    const out = deriveOutcome(
      t([msg(1, 'codex', 'agree'), msg(1, 'claude', 'abstain')]),
      BOTH,
      { ...DEFAULT_DERIVE_OPTIONS, countAbstainAsSpeaker: true },
    )
    expect(out.kind).toBe('unresolved')
  })
})

describe('itiraz ve blok', () => {
  it('tek disagree split yapar', () => {
    const out = deriveOutcome(t([msg(2, 'codex', 'agree'), msg(2, 'claude', 'disagree')]), BOTH)
    expect(out.kind).toBe('split')
    expect(out.rationale).toContain('claude')
  })

  it('agree ama blocking=true yine split — bayrak durusa yenik dusmez', () => {
    const out = deriveOutcome(
      t([msg(2, 'codex', 'agree'), msg(2, 'claude', 'agree', { blocking: true })]),
      BOTH,
    )
    expect(out.kind).toBe('split')
  })

  it('refine acikta kalmis is demektir: unresolved', () => {
    const out = deriveOutcome(t([msg(3, 'codex', 'agree'), msg(3, 'claude', 'refine')]), BOTH)
    expect(out.kind).toBe('unresolved')
    expect(out.rationale).toContain('claude:refine')
  })
})

describe('ayakta duran pozisyon en son turdur', () => {
  it('onceki turdaki itiraz, sonraki turdaki onaya yenilir', () => {
    const out = deriveOutcome(
      t([
        msg(1, 'codex', 'propose'),
        msg(1, 'claude', 'disagree'),
        msg(2, 'codex', 'agree'),
        msg(2, 'claude', 'agree'),
      ]),
      BOTH,
    )
    expect(out.kind).toBe('converged')
    expect(toStanding(t([msg(1, 'claude', 'disagree'), msg(2, 'claude', 'agree')]))).toEqual([
      expect.objectContaining({ participantId: 'claude', stance: 'agree', round: 2 }),
    ])
  })
})

describe('hasConverged', () => {
  it('deriveOutcome ile ayni cevabi verir', () => {
    const agreed = t([msg(1, 'codex', 'agree'), msg(1, 'claude', 'agree')])
    expect(hasConverged(agreed, BOTH)).toBe(true)
    expect(hasConverged(t([msg(1, 'codex', 'agree'), msg(1, 'claude', 'refine')]), BOTH)).toBe(false)
  })
})
