import { describe, expect, it } from 'vitest'
import { DEFAULT_AUDIT_CONFIG, executeAudit, auditQuestion, type AuditProviders } from '../orchestrator'
import { ProviderHttpError, type LlmProvider, type LlmRawResponse } from '../provider'
import type { QuestionDraft } from '../types'

function draft(overrides: Partial<QuestionDraft> = {}): QuestionDraft {
  return {
    questionId: 'q1',
    revisionId: 'r1',
    contentSha256: 'f'.repeat(64),
    examRef: 'TYT',
    subject: 'Matematik',
    topic: 'Turev',
    questionText: "f(x)=x^2 icin f'(3) kactir?",
    passage: null,
    options: ['3', '5', '6', '9', '12'],
    markedAnswerIndex: 2, // "6"
    solutionText: "f'(x)=2x oldugundan f'(3)=6.",
    ...overrides,
  }
}

/** Prompt'taki "N (X): metin" satirlarindan ekranda gosterilen sik listesini cikarir. */
function parseShownOptions(userPrompt: string): string[] {
  const payload = JSON.parse(userPrompt.split('\n')[1]) as { options: Array<{ index: number; text: string }> }
  return payload.options.sort((a, b) => a.index - b.index).map((option) => option.text)
}

interface FakeOptions {
  /** Kor cozucu bu METNI secer; ekrandaki indeksini prompt'tan bulur. */
  picksText?: string
  /** Hicbir sikla eslesmedigini bildirir. */
  picksNull?: boolean
  findings?: unknown[]
  concludesText?: string | null
  completeness?: 'adequate' | 'terse'
  error?: Error
}

function fakeProvider(id: string, opts: FakeOptions = {}) {
  const seenPrompts: string[] = []
  const provider: LlmProvider = {
    id: `fake-${id}-${Math.random()}`,
    modelId: `fake-${id}`,
    capabilities: { responseSchema: true, propertyOrdering: true },
    minIntervalMs: 0,
    async call(req): Promise<LlmRawResponse> {
      if (opts.error) throw opts.error
      seenPrompts.push(req.user)
      const shown = parseShownOptions(req.user)

      let body: unknown
      if (id === 'blind') {
        const idx = opts.picksNull
          ? null
          : shown.indexOf(opts.picksText ?? '')
        body = {
          reasoning: 'cozdum',
          predictedAnswerIndex: idx === -1 ? null : idx,
          computedValue: opts.picksText ?? null,
        }
      } else if (id === 'adversarial') {
        body = { reasoning: 'denedim', findings: opts.findings ?? [] }
      } else {
        const idx = opts.concludesText === null ? null : shown.indexOf(opts.concludesText ?? '')
        body = {
          reasoning: 'takip ettim',
          solutionConcludesIndex: idx === -1 ? null : idx,
          solutionCompleteness: opts.completeness ?? 'adequate',
        }
      }
      return { text: JSON.stringify(body), finishReason: 'STOP', inputTokens: 100, outputTokens: 60 }
    },
  }
  return { provider, seenPrompts }
}

function providers(o: {
  blind?: FakeOptions
  adversarial?: FakeOptions
  verifier?: FakeOptions
} = {}): AuditProviders & { blindPrompts: string[] } {
  const b = fakeProvider('blind', o.blind ?? { picksText: '6' })
  const a = fakeProvider('adversarial', o.adversarial ?? {})
  const v = fakeProvider('verifier', o.verifier ?? { concludesText: '6' })
  return { blind: b.provider, adversarial: a.provider, verifier: v.provider, blindPrompts: b.seenPrompts }
}

const fastConfig = { ...DEFAULT_AUDIT_CONFIG, maxAttempts: 1, timeoutMs: 1000 }

/**
 * EN KRITIK TEST.
 * Kor cozucuye siklar PERMUTE gosteriliyor; model EKRAN indeksi donuyor.
 * Orkestrator bunu kanonige cevirmezse her kalibrasyon sayisi sessizce bozulur —
 * mutabakat orani rastgele gorunur ve dogru sorular WRONG_KEY sanilir.
 */
describe('permutasyon gidis-donusu', () => {
  it('ekran indeksi kanonige cevrilir; dogru metni secen model markedAnswerIndex ile uyusur', async () => {
    const p = providers({ blind: { picksText: '6' } })
    const run = await executeAudit(draft(), p, fastConfig)

    expect(run.blind).toHaveLength(3)
    for (const b of run.blind) {
      expect(b.status).toBe('ok')
      if (b.status !== 'ok') continue
      expect(b.data.predictedAnswerIndex).toBe(2) // kanonik "6"
    }
  })

  it('siklar gercekten permute ediliyor (kimlik siralamasi degil)', async () => {
    const p = providers()
    await executeAudit(draft(), p, fastConfig)
    const shown = p.blindPrompts.map((x) => parseShownOptions(x).join(','))
    // Uc ornekten en az biri kanonik siradan farkli olmali
    expect(shown.some((s) => s !== '3,5,6,9,12')).toBe(true)
  })

  it('ayni soru ayni permutasyonlari uretir (contentSha256 seed) — kosu yeniden kurulabilir', async () => {
    const first = providers()
    const second = providers()
    await executeAudit(draft(), first, fastConfig)
    await executeAudit(draft(), second, fastConfig)
    expect(first.blindPrompts.map(parseShownOptions)).toEqual(second.blindPrompts.map(parseShownOptions))
  })

  it('farkli soru farkli permutasyon alir', async () => {
    const a = providers()
    const b = providers()
    await executeAudit(draft(), a, fastConfig)
    await executeAudit(draft({ contentSha256: '0'.repeat(64) }), b, fastConfig)
    expect(a.blindPrompts.map(parseShownOptions)).not.toEqual(b.blindPrompts.map(parseShownOptions))
  })
})

describe('uctan uca verdict', () => {
  it('hersey tutarliysa APPROVED', async () => {
    const { verdict } = await auditQuestion(draft(), providers(), fastConfig)
    expect(verdict.verdict).toBe('APPROVED')
    expect(verdict.blindConsensusIndex).toBe(2)
    expect(verdict.blindAgreementRatio).toBe(1)
  })

  it('model baska sikki secerse WRONG_KEY_SUSPECTED -> REJECTED', async () => {
    const { verdict } = await auditQuestion(
      draft(),
      providers({ blind: { picksText: '12' }, verifier: { concludesText: '12' } }),
      fastConfig,
    )
    expect(verdict.verdict).toBe('REJECTED')
    expect(verdict.findings.map((f) => f.code)).toContain('WRONG_KEY_SUSPECTED')
    expect(verdict.blindConsensusIndex).toBe(4)
  })

  it('hicbir sikla eslesmiyorsa NO_CORRECT_OPTION; somut degerle de NEEDS_REVIEW', async () => {
    const { verdict } = await auditQuestion(
      draft(),
      providers({ blind: { picksNull: true, picksText: '61' }, verifier: { concludesText: null } }),
      fastConfig,
    )
    expect(verdict.findings.map((f) => f.code)).toContain('NO_CORRECT_OPTION')
    expect(verdict.verdict).toBe('NEEDS_REVIEW')
  })

  // Adversarial bulgulari 200 soruluk kalibrasyon sonrasi advisory'ye alindi
  // (~%75 FP, flash-lite). Bu ajan artik tek basina reddedemez.
  it('adversarial bulgusu NEEDS_REVIEW uretir, REJECTED degil', async () => {
    const { verdict } = await auditQuestion(
      draft(),
      providers({
        adversarial: {
          findings: [{ code: 'MULTIPLE_CORRECT', evidence: 'B ve C ayni', optionIndexes: [1, 2] }],
        },
      }),
      fastConfig,
    )
    expect(verdict.verdict).toBe('NEEDS_REVIEW')
    expect(verdict.findings.map((f) => f.code)).toEqual(['MULTIPLE_CORRECT'])
  })

  it('cozum-anahtar celiskisi tek tanikla NEEDS_REVIEW uretir', async () => {
    const { verdict } = await auditQuestion(
      draft(),
      providers({ verifier: { concludesText: '12' } }),
      fastConfig,
    )
    expect(verdict.verdict).toBe('NEEDS_REVIEW')
    expect(verdict.findings.map((f) => f.code)).toContain('SOLUTION_CONTRADICTS_ANSWER')
  })

  it('kisa cozum NEEDS_REVIEW, REJECTED degil', async () => {
    const { verdict } = await auditQuestion(
      draft(),
      providers({ verifier: { concludesText: '6', completeness: 'terse' } }),
      fastConfig,
    )
    expect(verdict.verdict).toBe('NEEDS_REVIEW')
  })
})

describe('cozum denetcisi atlama', () => {
  it('cozum metni yoksa skipped ve soru ceza almaz', async () => {
    const run = await executeAudit(draft({ solutionText: null }), providers(), fastConfig)
    expect(run.verifier.status).toBe('skipped')
    const { verdict } = await auditQuestion(draft({ solutionText: '   ' }), providers(), fastConfig)
    expect(verdict.verdict).toBe('APPROVED')
  })
})

describe('kismi ariza', () => {
  it('adversarial coker ama kor cozucu sonuclari KAYBOLMAZ', async () => {
    const p = providers()
    p.adversarial = fakeProvider('adversarial', { error: new ProviderHttpError(401, 'nope') }).provider
    const run = await executeAudit(draft(), p, fastConfig)

    expect(run.adversarial.status).toBe('failed')
    expect(run.blind.filter((b) => b.status === 'ok')).toHaveLength(3)
    expect(run.verifier.status).toBe('ok')
  })

  it('tek ariza tum kosuyu INCONCLUSIVE yapar ama uydurma bulgu uretmez', async () => {
    const p = providers()
    p.verifier = fakeProvider('verifier', { error: new ProviderHttpError(500, 'boom') }).provider
    const { verdict } = await auditQuestion(draft(), p, { ...fastConfig, maxAttempts: 1 })
    expect(verdict.verdict).toBe('INCONCLUSIVE')
    expect(verdict.findings).toEqual([])
  })
})

describe('4 sikli soru', () => {
  it('LGS sorusu uctan uca calisir', async () => {
    const d = draft({ examRef: 'LGS', options: ['2', '4', '6', '8'], markedAnswerIndex: 3, solutionText: 'sonuc 8.' })
    const { run, verdict } = await auditQuestion(
      d,
      providers({ blind: { picksText: '8' }, verifier: { concludesText: '8' } }),
      fastConfig,
    )
    expect(run.optionCount).toBe(4)
    expect(verdict.verdict).toBe('APPROVED')
    expect(verdict.blindConsensusIndex).toBe(3)
  })
})
