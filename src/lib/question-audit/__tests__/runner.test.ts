import { describe, expect, it, vi } from 'vitest'
import { callsPerQuestion, main, parseArgs } from '../runner'
import type { QuestionRow } from '../question-source'
import type { QuestionDraft } from '../types'

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
})
