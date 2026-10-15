import { afterEach, describe, expect, it, vi } from 'vitest'
import { callsPerQuestion, main, parseArgs } from '../runner'
import type { QuestionRow } from '../question-source'
import type { QuestionDraft } from '../types'
import { DEFAULT_PROMOTION_POLICY } from '../benchmark'
import { auditExecutionIdentity, DEFAULT_AUDIT_CONFIG } from '../orchestrator'
import { createGeminiProvider } from '../provider'

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

function row(id: string, overrides: Partial<QuestionRow> = {}): QuestionRow {
  return {
    id,
    game: 'matematik',
    category: 'turev',
    exam_ref: 'TYT',
    content: { question: `soru ${id}`, options: ['1', '2', '3', '4', '5'], answer: 2, solution: 'cozum' },
    ...overrides,
  }
}

describe('parseArgs', () => {
  it('varsayilanlar guvenli: confirm KAPALI', () => {
    const a = parseArgs([])
    expect(a.confirm).toBe(false)
    expect(a.limit).toBe(25)
    expect(a.blindSamples).toBe(3)
    expect(a.provider).toBe('gemini')
  })

  it('--provider deepseek secilebilir, bilinmeyen deger gemini olur', () => {
    expect(parseArgs(['--provider', 'deepseek']).provider).toBe('deepseek')
    expect(parseArgs(['--provider', 'bilinmeyen']).provider).toBe('gemini')
  })

  it('bayraklari okur', () => {
    const a = parseArgs(['--limit', '100', '--category', 'fizik', '--samples', '5', '--concurrency', '8', '--revision-id', 'r1', '--governance-ready', '--gold-labels', 'gold.json', '--confirm'])
    expect(a).toMatchObject({ limit: 100, category: 'fizik', blindSamples: 5, concurrency: 8, revisionId: 'r1', governanceReady: true, goldLabelsPath: 'gold.json', confirm: true })
  })
  it('requires an explicit cohort path', () => {
    expect(parseArgs(['--target-scope', 'scope.json']).targetScopePath).toBe('scope.json')
    expect(() => parseArgs(['--target-scope'])).toThrow('--target-scope')
    expect(() => parseArgs(['--target-scope', '--confirm'])).toThrow('--target-scope')
    expect(() => parseArgs(['--target-scope', 'scope.json', '--limit', '1'])).toThrow('--limit')
  })
})

describe('callsPerQuestion', () => {
  const d = (solution: string | null): QuestionDraft => ({
    questionId: 'x',
    revisionId: 'x',
    contentSha256: 'x',
    examRef: 'TYT',
    subject: 's',
    topic: null,
    questionText: 'q',
    passage: null,
    options: ['1', '2', '3', '4', '5'],
    markedAnswerIndex: 0,
    solutionText: solution,
  })

  it('cozumu olan soru +1 cagri; olmayan denetciyi atlar', () => {
    // 2 soru x (3 kor + 1 adversarial) = 8, + cozumu olan 1 soru icin verifier
    expect(callsPerQuestion([d('var'), d(null)], 3)).toBe(9)
  })

  it('ornek sayisi dogrudan carpar', () => {
    expect(callsPerQuestion([d('var')], 1)).toBe(3)
    expect(callsPerQuestion([d('var')], 5)).toBe(7)
  })
})

/**
 * PARA GUVENLIGI.
 * --confirm olmadan tek bir LLM cagrisi bile yapilmamali. 1890 soruluk bir
 * kosuyu yanlislikla baslatmak kolay olmamali.
 */
describe('dry-run kapisi', () => {
  it('--confirm yoksa null doner, rapor yazilmaz', async () => {
    const lines: string[] = []
    const writeReport = vi.fn()
    const result = await main([], {
      fetchRows: async () => [row('a'), row('b')],
      log: (l) => lines.push(l),
      writeReport,
    })
    expect(result).toBeNull()
    expect(writeReport).not.toHaveBeenCalled()
    expect(lines.join('\n')).toContain('DRY-RUN')
  })

  it('planı ve cagri sayisini basar', async () => {
    const lines: string[] = []
    await main(['--samples', '2'], {
      fetchRows: async () => [row('a'), row('b'), row('c')],
      log: (l) => lines.push(l),
    })
    const out = lines.join('\n')
    // 3 soru x (2 kor + 1 adv) + 3 verifier = 12
    expect(out).toContain('Toplam LLM cagrisi : 12')
    expect(out).toContain('Deterministik kapi : 3 gecti, 0 denetlenemez')
  })

  it('deterministik kapida elenen satirlar cagri sayisina GIRMEZ', async () => {
    const lines: string[] = []
    await main(['--samples', '1'], {
      fetchRows: async () => [
        row('ok'),
        row('bad', { content: { question: 'x', options: ['1', '2', '3', '4', '5'], answer: 99 } }),
      ],
      log: (l) => lines.push(l),
    })
    const out = lines.join('\n')
    expect(out).toContain('1 gecti, 1 denetlenemez')
    expect(out).toContain('answer_out_of_range')
    expect(out).toContain('Toplam LLM cagrisi : 3') // 1 soru x (1 kor + 1 adv) + 1 verifier
  })

  it('rate gate verildiginde sure tahmini basilir', async () => {
    const lines: string[] = []
    await main(['--min-interval', '1600', '--samples', '3'], {
      fetchRows: async () => Array.from({ length: 10 }, (_, i) => row(`q${i}`)),
      log: (l) => lines.push(l),
    })
    // 10 x (3+1) + 10 = 50 cagri x 1600ms = 80s = ~1.3 dk
    expect(lines.join('\n')).toMatch(/tahmini sure ~1\.3 dk/)
  })
})

describe('insan-altin terfi kapisi', () => {
  it('yetkili karar yazimini promotion evidence olmadan LLM oncesi durdurur', async () => {
    const persistDecision = vi.fn()
    await expect(main(['--confirm'], {
      fetchRows: async () => [row('a')],
      persistDecision,
      log: () => undefined,
    })).rejects.toThrow('terfi kaniti')
    expect(persistDecision).not.toHaveBeenCalled()
  })

  const questionId = '11111111-1111-4111-8111-111111111111'
  const revisionId = '22222222-2222-4222-8222-222222222222'
  const contentSha256 = 'a'.repeat(64), controlSetSha256 = 'b'.repeat(64)
  const target = () => row(questionId, {
    game: 'turkce', category: 'paragraf', exam_ref: 'LGS', published_revision_id: revisionId,
    content_sha256: contentSha256,
    content: { question: 'Bir paragraf sorusu?', options: ['bir', 'iki', 'uc', 'dort'], answer: 0, solution: 'Gerekce.' },
  })
  function evidence() {
    for (const role of ['BLIND_SOLVER', 'ADVERSARIAL', 'VERIFIER']) vi.stubEnv(`${role}_MODEL_ID`, 'test')
    const provider = createGeminiProvider({ apiKey: '', modelId: 'test' })
    const identity = auditExecutionIdentity({ blind: provider, adversarial: provider, verifier: provider }, DEFAULT_AUDIT_CONFIG)
    return {
      subject: { ...identity, config: identity.generationConfig },
      benchmark: { promotion: { passed: true, policy: DEFAULT_PROMOTION_POLICY } },
      scope: { schemaVersion: 'promotion-scope@1', kind: 'bounded_cohort', game: 'turkce', examRef: 'LGS',
        controlSetSha256, targets: [{ questionId, revisionId, contentSha256 }] },
    }
  }
  it.each(['legacy', 'fen', 'exam', 'extra', 'revision', 'hash', 'duplicate', 'controls', 'failed-extra', 'missing-extra', 'invalid-options'])(
    'rejects %s before provider, cache, raw writes or decisions', async failure => {
      const proof = evidence()
      let rows = [target()]
      if (failure === 'fen') proof.scope.game = 'fen'
      if (failure === 'exam') proof.scope.examRef = 'TYT'
      if (failure === 'extra') rows.push(target())
      if (failure === 'revision') rows[0].published_revision_id = '33333333-3333-4333-8333-333333333333'
      if (failure === 'hash') rows[0].content_sha256 = 'c'.repeat(64)
      if (failure === 'duplicate') { rows = [target(), target()]; proof.scope.targets.push(proof.scope.targets[0]) }
      if (failure === 'invalid-options') rows[0].content!.options = ['a', 'b', 'c', 'd', 'e']
      const submitted: Record<string, unknown> = { ...proof }
      if (failure === 'legacy') delete submitted.scope
      if (failure === 'failed-extra') submitted.extraReleaseConditionsPassed = false
      if (failure === 'missing-extra') submitted.boundedScope = { releaseConditions: ['missing'] }
      const fetch = vi.fn(() => { throw new Error('UNEXPECTED NETWORK') })
      vi.stubGlobal('fetch', fetch)
      const persistDecision = vi.fn(), persistRun = vi.fn(), loadCachedRun = vi.fn()
      await expect(main(['--confirm', '--provider', 'gemini', '--model', 'test'], {
        fetchRows: async () => rows, promotionEvidence: submitted,
        controlSetSha256: failure === 'controls' ? 'c'.repeat(64) : controlSetSha256,
        persistDecision, persistRun, loadCachedRun, log: () => undefined,
      })).rejects.toThrow()
      for (const spy of [fetch, persistDecision, persistRun, loadCachedRun]) expect(spy).not.toHaveBeenCalled()
    },
  )
  it('a valid scope reaches cache lookup; no model call is needed for this test', async () => {
    const proof = evidence(), cache = vi.fn(async () => { throw new Error('CACHE_REACHED') })
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch)
    const persistDecision = vi.fn()
    await expect(main(['--confirm', '--provider', 'gemini', '--model', 'test'], {
      fetchRows: async () => [target()], promotionEvidence: proof, controlSetSha256,
      persistDecision, loadCachedRun: cache, log: () => undefined,
    })).rejects.toThrow('CACHE_REACHED')
    expect(cache).toHaveBeenCalledOnce(); expect(fetch).not.toHaveBeenCalled(); expect(persistDecision).not.toHaveBeenCalled()
  })
})
