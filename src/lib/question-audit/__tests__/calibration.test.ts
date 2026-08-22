import { describe, expect, it } from 'vitest'
import { runCalibration } from '../calibration'
import { DEFAULT_AUDIT_CONFIG, type AuditProviders } from '../orchestrator'
import { ProviderHttpError, type LlmProvider, type LlmRawResponse } from '../provider'
import type { AuditRun, QuestionDraft } from '../types'

function draft(id: string, opts: Partial<QuestionDraft> = {}): QuestionDraft {
  return {
    questionId: id,
    revisionId: `rev-${id}`,
    contentSha256: id.padEnd(64, 'x'),
    examRef: 'TYT',
    subject: 'Matematik',
    topic: null,
    questionText: `soru ${id}`,
    passage: null,
    options: ['A0', 'A1', 'A2', 'A3', 'A4'],
    markedAnswerIndex: 2,
    solutionText: 'sonuc A2 olur.',
    ...opts,
  }
}

function parseShown(userPrompt: string): string[] {
  const out: string[] = []
  for (const line of userPrompt.split('\n')) {
    const m = /^(\d+) \([A-H?]\): (.*)$/.exec(line)
    if (m) out[Number(m[1])] = m[2]
  }
  return out
}

/** Kor cozucu her zaman `pickText` metnini secer; ekran indeksini prompt'tan bulur. */
function makeProviders(o: {
  pickText?: string
  blindError?: Error
  verifierText?: string
}): AuditProviders {
  const mk = (role: 'blind' | 'adversarial' | 'verifier'): LlmProvider => ({
    id: `fake-${role}-${Math.random()}`,
    modelId: `fake-${role}`,
    capabilities: { responseSchema: true, propertyOrdering: true },
    minIntervalMs: 0,
    async call(req): Promise<LlmRawResponse> {
      if (role === 'blind' && o.blindError) throw o.blindError
      const shown = parseShown(req.user)
      let body: unknown
      if (role === 'blind') {
        const idx = shown.indexOf(o.pickText ?? 'A2')
        body = { reasoning: 'r', predictedAnswerIndex: idx === -1 ? null : idx, computedValue: null }
      } else if (role === 'adversarial') {
        body = { reasoning: 'r', findings: [] }
      } else {
        const idx = shown.indexOf(o.verifierText ?? 'A2')
        body = { reasoning: 'r', solutionConcludesIndex: idx === -1 ? null : idx, solutionCompleteness: 'adequate' }
      }
      return { text: JSON.stringify(body), finishReason: 'STOP', inputTokens: 10, outputTokens: 5 }
    },
  })
  return { blind: mk('blind'), adversarial: mk('adversarial'), verifier: mk('verifier') }
}

const cfg = { ...DEFAULT_AUDIT_CONFIG, maxAttempts: 1, timeoutMs: 1000 }
const categoryOf = () => 'matematik'

describe('mutabakat orani', () => {
  it('hepsi anahtarla uyusursa ratio 1', async () => {
    const drafts = ['a', 'b', 'c'].map((id) => draft(id))
    const r = await runCalibration({ drafts, categoryOf, providers: makeProviders({}), config: cfg })
    expect(r.total).toBe(3)
    expect(r.blindAgreement).toMatchObject({ agreed: 3, disagreed: 0, noConsensus: 0, ratio: 1 })
    expect(r.byVerdict.APPROVED).toBe(3)
    expect(r.disagreements).toHaveLength(0)
  })

  it('uyusmazlik hem sayilir hem listelenir (etiketli benchmark buradan dogar)', async () => {
    const drafts = ['a', 'b'].map((id) => draft(id))
    const r = await runCalibration({
      drafts,
      categoryOf,
      providers: makeProviders({ pickText: 'A4', verifierText: 'A4' }),
      config: cfg,
    })
    expect(r.blindAgreement).toMatchObject({ agreed: 0, disagreed: 2, ratio: 0 })
    expect(r.disagreements).toHaveLength(2)
    expect(r.rejected).toHaveLength(2)
    expect(r.disagreements[0].blindConsensusIndex).toBe(4)
    expect(r.disagreements[0].markedAnswerIndex).toBe(2)
    expect(r.byVerdict.REJECTED).toBe(2)
  })

  it('kategori kirilimi ayri hesaplanir', async () => {
    const drafts = [draft('a'), draft('b'), draft('c')]
    const r = await runCalibration({
      drafts,
      categoryOf: (d) => (d.questionId === 'c' ? 'fizik' : 'matematik'),
      providers: makeProviders({}),
      config: cfg,
    })
    expect(r.byCategory.matematik).toMatchObject({ n: 2, agreed: 2, ratio: 1 })
    expect(r.byCategory.fizik).toMatchObject({ n: 1, agreed: 1, ratio: 1 })
  })
})

/**
 * Bu, mevcut hattin en buyuk kusurunun raporda GORUNUR olmasini garanti eder.
 * Onceki denetim raporlari %54 hata orani ile "0 bulgu" yaziyordu ve iki sayi
 * ayni ekranda degildi; okuyan "banka temiz" saniyordu.
 */
describe('hat guvenilirligi rapora yazilir', () => {
  it('ariza orani ve hata tipleri ayri alanda toplanir', async () => {
    const drafts = ['a', 'b'].map((id) => draft(id))
    const r = await runCalibration({
      drafts,
      categoryOf,
      providers: makeProviders({ blindError: new ProviderHttpError(503, 'down') }),
      config: cfg,
    })
    // 3 kor ornek x 2 soru = 6 basarisiz cagri; adversarial+verifier basarili
    expect(r.reliability.failedCalls).toBe(6)
    expect(r.reliability.totalCalls).toBe(10)
    expect(r.reliability.failureRate).toBeCloseTo(0.6)
    expect(r.reliability.byErrorKind.transport).toBe(6)
    // Kor cozucu comunce mutabakat ORANI hesaplanamaz — sifir DEGIL, null.
    expect(r.blindAgreement.ratio).toBeNull()
    expect(r.byVerdict.INCONCLUSIVE).toBe(2)
  })
})

/**
 * Ilk 50'lik pilotta REJECTED=1 sayildi ama hicbir listede gorunmedi:
 * red kor uyusmazligindan degil adversarial blocking bulgusundan geliyordu.
 * Raporun en onemli kalemi kayipti.
 */
describe('tek ajan celiskisi insan incelemesine gider', () => {
  it('cozum-anahtar celiskisi tek basina yayini durdurmaz', async () => {
    // Kor cozucu A2'yi (isaretli) secer; cozum denetcisi A4'e vardigini bildirir.
    const p = makeProviders({ pickText: 'A2', verifierText: 'A4' })
    const r = await runCalibration({ drafts: [draft('a')], categoryOf, providers: p, config: cfg })
    expect(r.byVerdict.NEEDS_REVIEW).toBe(1)
    expect(r.disagreements).toHaveLength(0) // kor cozucu anahtarla UYUSTU
    expect(r.rejected).toHaveLength(0)
    expect(r.needsReview[0].findings.map((f) => f.code)).toContain('SOLUTION_CONTRADICTS_ANSWER')
    // Kanit metni adjudikasyon icin ZORUNLU
    expect(r.needsReview[0].findings[0].evidence).toContain('idx')
  })
})

describe('cozum metni olmayan soru', () => {
  it('atlanan denetci toplam cagri sayisina girmez ve soru ceza almaz', async () => {
    const r = await runCalibration({
      drafts: [draft('a', { solutionText: null })],
      categoryOf,
      providers: makeProviders({}),
      config: cfg,
    })
    expect(r.reliability.totalCalls).toBe(4) // 3 kor + 1 adversarial; atlanan denetci sayilmaz
    expect(r.byVerdict.APPROVED).toBe(1)
  })
})

describe('kosu mekanigi', () => {
  it('tam saklanmis kosuyu ucretli cagri yapmadan yeniden puanlar', async () => {
    const providers = makeProviders({})
    let stored: AuditRun | null = null
    await runCalibration({
      drafts: [draft('cache')], categoryOf, providers, config: cfg,
      onRun: (run) => { stored = run },
    })
    let persistedAgain = false
    let decisions = 0
    const replay = await runCalibration({
      drafts: [draft('cache')], categoryOf, providers, config: cfg,
      loadRun: async () => stored,
      onRun: () => { persistedAgain = true },
      onDecision: () => { decisions++ },
    })
    expect(replay.cache).toEqual({ hits: 1, misses: 0 })
    expect(replay.cost).toEqual({ inputTokens: 0, outputTokens: 0, totalLatencyMs: 0 })
    expect(replay.promptVersions).toEqual({
      blind: 'blind-solver@1', adversarial: 'adversarial@2', verifier: 'solution-verifier@2',
    })
    expect(persistedAgain).toBe(false)
    expect(decisions).toBe(1)
  })

  it('Postgres JSONB anahtar sirasi degisse de ayni snapshot cache hit olur', async () => {
    const providers = makeProviders({})
    let stored: AuditRun | null = null
    const source = draft('jsonb-order')
    await runCalibration({
      drafts: [source], categoryOf, providers, config: cfg,
      onRun: (run) => { stored = run },
    })
    const reordered = Object.fromEntries(
      Object.entries(stored!.inputSnapshot).reverse(),
    ) as QuestionDraft
    const replay = await runCalibration({
      drafts: [draft('jsonb-order')], categoryOf, providers, config: cfg,
      loadRun: async () => ({ ...stored!, inputSnapshot: reordered }),
    })
    expect(replay.cache).toEqual({ hits: 1, misses: 0 })
    expect(replay.cost.inputTokens).toBe(0)
  })

  it('cache snapshot icerigi gercekten degismisse kosuyu durdurur', async () => {
    const source = draft('cache-tamper')
    const providers = makeProviders({})
    let stored: AuditRun | null = null
    await runCalibration({ drafts: [source], categoryOf, providers, config: cfg, onRun: (run) => { stored = run } })
    const tampered = { ...stored!, inputSnapshot: { ...stored!.inputSnapshot, questionText: 'degistirildi' } }
    await expect(runCalibration({
      drafts: [draft('cache-tamper')], categoryOf, providers, config: cfg,
      loadRun: async () => tampered,
    })).rejects.toThrow('onbellek butunluk hatasi')
  })

  it('es zamanlilik sinirina ragmen TUM sorular islenir ve sira korunur', async () => {
    const drafts = Array.from({ length: 9 }, (_, i) => draft(`q${i}`))
    const seen: string[] = []
    const r = await runCalibration({
      drafts,
      categoryOf,
      providers: makeProviders({}),
      config: cfg,
      concurrency: 3,
      onItem: (it) => void seen.push(it.questionId),
    })
    expect(r.total).toBe(9)
    expect(seen.sort()).toEqual(drafts.map((d) => d.questionId).sort())
  })

  it('onProgress her soru icin bir kez cagrilir', async () => {
    const drafts = ['a', 'b', 'c'].map((id) => draft(id))
    let calls = 0
    let lastDone = 0
    await runCalibration({
      drafts,
      categoryOf,
      providers: makeProviders({}),
      config: cfg,
      concurrency: 1,
      onProgress: (done, total) => {
        calls++
        lastDone = done
        expect(total).toBe(3)
      },
    })
    expect(calls).toBe(3)
    expect(lastDone).toBe(3)
  })

  it('token ve gecikme toplamlari birikir', async () => {
    const r = await runCalibration({
      drafts: [draft('a')],
      categoryOf,
      providers: makeProviders({}),
      config: cfg,
    })
    expect(r.cost.inputTokens).toBe(50) // 5 cagri x 10
    expect(r.cost.outputTokens).toBe(25)
  })
})
