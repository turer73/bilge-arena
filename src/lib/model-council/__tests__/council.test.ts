import { describe, expect, it, vi } from 'vitest'
import { ProviderHttpError, type LlmRawResponse } from '@/lib/llm/transport-core'
import {
  DEFAULT_COUNCIL_CONFIG,
  clampContext,
  councilExecutionIdentity,
  runCouncil,
  type CouncilConfig,
  type CouncilParticipant,
} from '../council'
import type { ConversationalProvider, ConversationRequest } from '../transport'
import type { CouncilTopic, Stance } from '../types'

const topic: CouncilTopic = {
  title: 'Rate limit tasarimi',
  brief: 'Chat API icin kota katmanini secin.',
  context: null,
  successCriteria: ['Upstash yoksa calismali'],
}

interface ScriptedTurn {
  stance: Stance
  position?: string
  blocking?: boolean
  openQuestions?: string[]
}

/**
 * Her cagrida sonraki senaryo adimini donduren saglayici. Gordugu sistem ve
 * kullanici prompt'larini kaydeder — tutanagin gercekten aktigini dogrulamak icin.
 */
function scriptedProvider(
  id: string,
  script: Array<ScriptedTurn | Error>,
  capabilities = { jsonMode: true, temperature: true },
): ConversationalProvider & { seen: ConversationRequest[] } {
  let i = 0
  const p = {
    id: `${id}:model`,
    modelId: `${id}-model`,
    capabilities,
    minIntervalMs: 0,
    seen: [] as ConversationRequest[],
    async call(req: ConversationRequest): Promise<LlmRawResponse> {
      p.seen.push(req)
      const step = script[Math.min(i++, script.length - 1)]
      if (step instanceof Error) throw step
      return {
        text: JSON.stringify({
          reasoning: `${id} dusundu`,
          stance: step.stance,
          position: step.position ?? `${id} pozisyonu`,
          respondsTo: [],
          openQuestions: step.openQuestions ?? [],
          blocking: step.blocking ?? false,
        }),
        finishReason: 'STOP',
        inputTokens: 10,
        outputTokens: 4,
      }
    },
  }
  return p
}

function participant(id: string, provider: ConversationalProvider): CouncilParticipant {
  return { id, displayName: id.toUpperCase(), role: `${id} rolu`, provider }
}

const fixedDeps = {
  now: () => new Date('2026-08-29T00:00:00.000Z'),
  newRunId: () => 'run-1',
  sleep: async () => {},
}

const cfg = (over: Partial<CouncilConfig> = {}): CouncilConfig => ({
  ...DEFAULT_COUNCIL_CONFIG,
  maxRounds: 2,
  ...over,
})

describe('tartisma gercekten akiyor', () => {
  it('sonraki katilimci oncekinin turunu GORUR', async () => {
    const codex = scriptedProvider('codex', [{ stance: 'propose', position: 'ZOD ile dogrula' }])
    const claude = scriptedProvider('claude', [{ stance: 'agree' }])

    await runCouncil(
      topic,
      [participant('codex', codex), participant('claude', claude)],
      cfg({ maxRounds: 1 }),
      fixedDeps,
    )

    // Codex ilk konustu: tutanak bostu.
    expect(codex.seen[0].turns[0].content).toContain('ilk soz sende')
    // Claude ikinci konustu: Codex'in pozisyonunu ve kimligini gordu.
    expect(claude.seen[0].turns[0].content).toContain('[r1-codex]')
    expect(claude.seen[0].turns[0].content).toContain('ZOD ile dogrula')
  })

  it('katilimci kendi mesajini (SEN) olarak gorur, digerininkini gormez', async () => {
    const codex = scriptedProvider('codex', [{ stance: 'propose' }, { stance: 'agree' }])
    const claude = scriptedProvider('claude', [{ stance: 'agree' }, { stance: 'agree' }])

    await runCouncil(
      topic,
      [participant('codex', codex), participant('claude', claude)],
      cfg({ maxRounds: 2, stopWhenConverged: false }),
      fixedDeps,
    )

    const codexRound2 = codex.seen[1].turns[0].content
    expect(codexRound2).toContain('CODEX (SEN)')
    expect(codexRound2).not.toContain('CLAUDE (SEN)')
  })

  it('sira her turda doner', async () => {
    const order: string[] = []
    const track = (id: string) => {
      const p = scriptedProvider(id, [{ stance: 'refine' }])
      const orig = p.call.bind(p)
      p.call = async (req, signal) => {
        order.push(id)
        return orig(req, signal)
      }
      return p
    }

    await runCouncil(
      topic,
      [participant('a', track('a')), participant('b', track('b')), participant('c', track('c'))],
      cfg({ maxRounds: 2, stopWhenConverged: false }),
      fixedDeps,
    )

    expect(order).toEqual(['a', 'b', 'c', 'b', 'c', 'a'])
  })
})

describe('sonuc turetme', () => {
  it('herkes anlasinca converged', async () => {
    const run = await runCouncil(
      topic,
      [
        participant('codex', scriptedProvider('codex', [{ stance: 'agree' }])),
        participant('claude', scriptedProvider('claude', [{ stance: 'agree' }])),
      ],
      cfg({ maxRounds: 1 }),
      fixedDeps,
    )
    expect(run.outcome.kind).toBe('converged')
    expect(run.transcript.messages).toHaveLength(2)
    expect(run.inputTokens).toBe(20)
    expect(run.outputTokens).toBe(8)
  })

  it('uzlasinca kalan turlar HARCANMAZ', async () => {
    const codex = scriptedProvider('codex', [{ stance: 'agree' }])
    const claude = scriptedProvider('claude', [{ stance: 'agree' }])

    const run = await runCouncil(
      topic,
      [participant('codex', codex), participant('claude', claude)],
      cfg({ maxRounds: 5, stopWhenConverged: true }),
      fixedDeps,
    )

    expect(run.roundsRun).toBe(1)
    expect(run.totalCalls).toBe(2)
    expect(codex.seen).toHaveLength(1)
  })

  it('stopWhenConverged kapaliyken tum turlar kosar', async () => {
    const run = await runCouncil(
      topic,
      [
        participant('codex', scriptedProvider('codex', [{ stance: 'agree' }])),
        participant('claude', scriptedProvider('claude', [{ stance: 'agree' }])),
      ],
      cfg({ maxRounds: 3, stopWhenConverged: false }),
      fixedDeps,
    )
    expect(run.roundsRun).toBe(3)
    expect(run.totalCalls).toBe(6)
  })

  it('itiraz suruyorsa split ve tur tavaninda durur', async () => {
    const run = await runCouncil(
      topic,
      [
        participant('codex', scriptedProvider('codex', [{ stance: 'propose' }, { stance: 'agree' }])),
        participant('claude', scriptedProvider('claude', [{ stance: 'disagree' }, { stance: 'disagree' }])),
      ],
      cfg({ maxRounds: 2 }),
      fixedDeps,
    )
    expect(run.outcome.kind).toBe('split')
    expect(run.roundsRun).toBe(2)
  })
})

describe('ariza yonetimi', () => {
  it('basarisiz tur tutanaga POZISYON olarak girmez, kayda gecer', async () => {
    const failures: string[] = []
    const run = await runCouncil(
      topic,
      [
        participant('codex', scriptedProvider('codex', [new ProviderHttpError(401, 'unauthorized')])),
        participant('claude', scriptedProvider('claude', [{ stance: 'agree' }])),
      ],
      cfg({ maxRounds: 1 }),
      { ...fixedDeps, onFailure: (id, round, m) => failures.push(`${id}@${round}:${m}`) },
    )

    expect(run.transcript.messages.map((m) => m.participantId)).toEqual(['claude'])
    expect(run.transcript.failures).toHaveLength(1)
    expect(run.transcript.failures[0].error.kind).toBe('transport')
    expect(failures[0]).toContain('codex@1')
    // Tek konusan varken "uzlasildi" DENMEZ.
    expect(run.outcome.kind).toBe('inconclusive')
  })

  it('bir tur basarisiz olsa da sonraki turda ayni katilimci yeniden denenir', async () => {
    const codex = scriptedProvider('codex', [new ProviderHttpError(500, 'boom'), { stance: 'agree' }])
    const run = await runCouncil(
      topic,
      [participant('codex', codex), participant('claude', scriptedProvider('claude', [{ stance: 'agree' }]))],
      cfg({ maxRounds: 2, maxAttempts: 1 }),
      fixedDeps,
    )
    expect(run.transcript.failures).toHaveLength(1)
    expect(run.outcome.kind).toBe('converged')
  })
})

describe('butce tavani', () => {
  it('tavan dolunca tur DENENMEZ ve gerekce kayda gecer', async () => {
    const codex = scriptedProvider('codex', [{ stance: 'refine' }])
    const claude = scriptedProvider('claude', [{ stance: 'refine' }])

    const run = await runCouncil(
      topic,
      [participant('codex', codex), participant('claude', claude)],
      cfg({ maxRounds: 4, maxTotalCalls: 3, stopWhenConverged: false }),
      fixedDeps,
    )

    expect(run.totalCalls).toBe(3)
    expect(codex.seen.length + claude.seen.length).toBe(3)
    const budgetFailures = run.transcript.failures.filter((f) => f.error.kind === 'budget')
    expect(budgetFailures.length).toBeGreaterThan(0)
    expect(budgetFailures[0].error.message).toContain('cagri tavani')
  })

  /**
   * REGRESYON (Vercel review botu, PR #459): sayac tur basina 1 artiyordu,
   * oysa `maxAttempts` yuzunden bir tur birden fazla GERCEK cagri harciyor.
   * Tavan boylece gercek kullanimin ~1/maxAttempts'ini sinirliyordu.
   */
  it('tekrar denemeler butceden DUSER — tavan tur degil cagri sayar', async () => {
    // Her tur ilk iki denemede patlar, ucuncude tutar: tur basina 3 cagri.
    const flaky = (id: string) =>
      scriptedProvider(id, [
        new ProviderHttpError(503, 'down'),
        new ProviderHttpError(503, 'down'),
        { stance: 'agree' },
      ])
    const codex = flaky('codex')
    const claude = flaky('claude')

    const run = await runCouncil(
      topic,
      [participant('codex', codex), participant('claude', claude)],
      cfg({ maxRounds: 3, maxAttempts: 3, maxTotalCalls: 4, stopWhenConverged: false }),
      fixedDeps,
    )

    // Tavan 4: gercek cagri sayisi 4'u ASMAZ. (Eski hal: 2 tur x 3 deneme = 6.)
    expect(run.totalCalls).toBe(4)
    expect(codex.seen.length + claude.seen.length).toBe(4)
  })

  it('telemetri turun kac gercek cagri harcadigini tasir', async () => {
    const codex = scriptedProvider('codex', [new ProviderHttpError(503, 'down'), { stance: 'agree' }])
    const run = await runCouncil(
      topic,
      [participant('codex', codex)],
      cfg({ maxRounds: 1, maxAttempts: 3 }),
      fixedDeps,
    )
    expect(run.transcript.messages[0].telemetry.attempts).toBe(2)
    expect(run.totalCalls).toBe(2)
  })
})

describe('saglayici yetenegine gore istek sekillenir', () => {
  it('temperature kabul etmeyen saglayiciya null gecilir', async () => {
    const anthropicLike = scriptedProvider('claude', [{ stance: 'agree' }], {
      jsonMode: false,
      temperature: false,
    })
    const openaiLike = scriptedProvider('codex', [{ stance: 'agree' }])

    await runCouncil(
      topic,
      [participant('claude', anthropicLike), participant('codex', openaiLike)],
      cfg({ maxRounds: 1, temperature: 0.7 }),
      fixedDeps,
    )

    expect(anthropicLike.seen[0].temperature).toBeNull()
    expect(openaiLike.seen[0].temperature).toBe(0.7)
  })

  it('JSON modu olmayan saglayiciya cerceve hatirlatmasi eklenir', async () => {
    const noJson = scriptedProvider('claude', [{ stance: 'agree' }], { jsonMode: false, temperature: false })
    const withJson = scriptedProvider('codex', [{ stance: 'agree' }])

    await runCouncil(
      topic,
      [participant('claude', noJson), participant('codex', withJson)],
      cfg({ maxRounds: 1 }),
      fixedDeps,
    )

    expect(noJson.seen[0].system).toContain('Ilk karakter "{"')
    expect(withJson.seen[0].system).not.toContain('Ilk karakter "{"')
  })
})

describe('sozlesme ihlalleri erken yakalanir', () => {
  it('bos roster reddedilir', async () => {
    await expect(runCouncil(topic, [], cfg(), fixedDeps)).rejects.toThrow('Kurul bos')
  })

  it('tekrarli kimlik reddedilir — mesaj kimlikleri cakisirdi', async () => {
    const p = participant('codex', scriptedProvider('codex', [{ stance: 'agree' }]))
    await expect(runCouncil(topic, [p, p], cfg(), fixedDeps)).rejects.toThrow('tekrarli')
  })
})

describe('clampContext', () => {
  it('sinir altinda dokunmaz', () => {
    expect(clampContext('kisa', 100)).toBe('kisa')
    expect(clampContext(null, 100)).toBeNull()
  })

  it('kirparken KIRPTIGINI SOYLER — sessiz kirpma yok', () => {
    const out = clampContext('x'.repeat(100), 10)
    expect(out).toContain('KIRPILDI')
    expect(out).toContain('90 karakteri')
  })

  it('kirpilan baglam prompt icine isaretiyle girer', async () => {
    const codex = scriptedProvider('codex', [{ stance: 'agree' }])
    await runCouncil(
      { ...topic, context: 'y'.repeat(50) },
      [participant('codex', codex)],
      cfg({ maxRounds: 1, maxContextChars: 10 }),
      fixedDeps,
    )
    expect(codex.seen[0].turns[0].content).toContain('KIRPILDI')
  })
})

describe('kosu kimligi', () => {
  it('katilimci ve cikti-etkileyen ayarlari damgalar, tekrar ayarlarini damgalamaz', () => {
    const identity = councilExecutionIdentity(
      [participant('codex', scriptedProvider('codex', [{ stance: 'agree' }]))],
      cfg({ maxAttempts: 9, timeoutMs: 1 }),
    )
    expect(identity.promptVersion).toBe('council-turn@1')
    expect(identity.participants[0]).toEqual({
      id: 'codex',
      providerId: 'codex:model',
      modelId: 'codex-model',
      role: 'codex rolu',
    })
    expect(identity.config).not.toHaveProperty('maxAttempts')
    expect(identity.config).not.toHaveProperty('timeoutMs')
  })
})

describe('canli akis', () => {
  it('her tur icin onMessage, her tur sonunda onRoundEnd cagrilir', async () => {
    const seen: string[] = []
    const rounds: number[] = []
    await runCouncil(
      topic,
      [
        participant('codex', scriptedProvider('codex', [{ stance: 'refine' }])),
        participant('claude', scriptedProvider('claude', [{ stance: 'refine' }])),
      ],
      cfg({ maxRounds: 2, stopWhenConverged: false }),
      {
        ...fixedDeps,
        onMessage: (m) => seen.push(m.id),
        onRoundEnd: (r) => rounds.push(r),
      },
    )
    expect(seen).toEqual(['r1-codex', 'r1-claude', 'r2-claude', 'r2-codex'])
    expect(rounds).toEqual([1, 2])
  })
})

describe('runId', () => {
  it('deps verilmezse gercek UUID uretilir', async () => {
    const spy = vi.spyOn(globalThis.crypto, 'randomUUID')
    const run = await runCouncil(
      topic,
      [participant('codex', scriptedProvider('codex', [{ stance: 'agree' }]))],
      cfg({ maxRounds: 1 }),
      { sleep: async () => {} },
    )
    expect(spy).toHaveBeenCalled()
    expect(run.runId).toMatch(/^[0-9a-f-]{36}$/)
    spy.mockRestore()
  })
})
