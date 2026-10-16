import { describe, expect, it } from 'vitest'
import {
  KNOWN_PARTICIPANTS,
  parseParticipantSpec,
  REGISTRY,
  resolveParticipants,
} from '../participants'

describe('parseParticipantSpec', () => {
  it('virgulle ayirir, bosluk ve buyuk harf tolere eder', () => {
    expect(parseParticipantSpec(' Codex , claude ')).toEqual(['codex', 'claude'])
  })

  it('tekrarlari atar — ayni kimlik iki kez kurula giremez', () => {
    expect(parseParticipantSpec('codex,codex,claude')).toEqual(['codex', 'claude'])
  })

  it('bos girdide bos dizi', () => {
    expect(parseParticipantSpec('')).toEqual([])
    expect(parseParticipantSpec(' , ,')).toEqual([])
  })
})

describe('resolveParticipants', () => {
  it('Codex OPENAI_API_KEY ile kurulur', () => {
    const { participants, missingKeys } = resolveParticipants(['codex'], { OPENAI_API_KEY: 'sk-test' })
    expect(missingKeys).toEqual([])
    expect(participants).toHaveLength(1)
    expect(participants[0].id).toBe('codex')
    expect(participants[0].displayName).toBe('Codex')
    expect(participants[0].provider.id).toBe(`codex:${REGISTRY.codex.defaultModelId}`)
  })

  it('CODEX_API_KEY yedek anahtar olarak calisir', () => {
    const { participants } = resolveParticipants(['codex'], { CODEX_API_KEY: 'sk-alt' })
    expect(participants).toHaveLength(1)
  })

  it('CODEX_MODEL_ID varsayilani ezer', () => {
    const { participants } = resolveParticipants(['codex'], {
      OPENAI_API_KEY: 'k',
      CODEX_MODEL_ID: 'ozel-codex',
    })
    expect(participants[0].provider.modelId).toBe('ozel-codex')
    expect(participants[0].provider.id).toBe('codex:ozel-codex')
  })

  it('anahtarsiz katilimci SESSIZCE DUSMEZ, missingKeys ile raporlanir', () => {
    const { participants, missingKeys } = resolveParticipants(['codex', 'claude'], {
      ANTHROPIC_API_KEY: 'sk-ant',
    })
    expect(participants.map((p) => p.id)).toEqual(['claude'])
    expect(missingKeys).toEqual([{ id: 'codex', tried: ['OPENAI_API_KEY', 'CODEX_API_KEY'] }])
  })

  it('bos string anahtar sayilmaz', () => {
    const { missingKeys } = resolveParticipants(['codex'], { OPENAI_API_KEY: '' })
    expect(missingKeys).toHaveLength(1)
  })

  it('bilinmeyen kimlik HATA — yazim hatasi sessizce yutulmaz', () => {
    expect(() => resolveParticipants(['codx'], { OPENAI_API_KEY: 'k' })).toThrow(/Bilinmeyen katilimci: "codx"/)
    expect(() => resolveParticipants(['codx'], {})).toThrow(new RegExp(KNOWN_PARTICIPANTS.join(', ')))
  })

  it('Gemini iki anahtar adini da kabul eder', () => {
    expect(resolveParticipants(['gemini'], { GEMINI_API_KEY: 'a' }).participants).toHaveLength(1)
    expect(resolveParticipants(['gemini'], { GOOGLE_GENERATIVE_AI_API_KEY: 'b' }).participants).toHaveLength(1)
  })

  it('rol env ile ezilebilir', () => {
    const { participants } = resolveParticipants(['codex'], {
      OPENAI_API_KEY: 'k',
      COUNCIL_ROLE_CODEX: 'Guvenlik denetcisi',
    })
    expect(participants[0].role).toBe('Guvenlik denetcisi')
  })

  it('COUNCIL_MIN_INTERVAL_MS tum katilimcilara uygulanir', () => {
    const { participants } = resolveParticipants(['codex', 'claude'], {
      OPENAI_API_KEY: 'k',
      ANTHROPIC_API_KEY: 'k2',
      COUNCIL_MIN_INTERVAL_MS: '1500',
    })
    expect(participants.map((p) => p.provider.minIntervalMs)).toEqual([1500, 1500])
  })

  it('gecersiz min-interval degeri 0 kabul edilir (NaN sizmaz)', () => {
    const { participants } = resolveParticipants(['codex'], {
      OPENAI_API_KEY: 'k',
      COUNCIL_MIN_INTERVAL_MS: 'abc',
    })
    expect(participants[0].provider.minIntervalMs).toBe(0)
  })

  it('acik override env degerini ezer', () => {
    const { participants } = resolveParticipants(
      ['codex'],
      { OPENAI_API_KEY: 'k', COUNCIL_MIN_INTERVAL_MS: '100' },
      { minIntervalMs: 900 },
    )
    expect(participants[0].provider.minIntervalMs).toBe(900)
  })

  it('kayittaki her katilimci kurulabilir', () => {
    const env = {
      OPENAI_API_KEY: 'k',
      ANTHROPIC_API_KEY: 'k',
      GEMINI_API_KEY: 'k',
      DEEPSEEK_API_KEY: 'k',
    }
    const { participants, missingKeys } = resolveParticipants(KNOWN_PARTICIPANTS, env)
    expect(missingKeys).toEqual([])
    expect(participants).toHaveLength(KNOWN_PARTICIPANTS.length)
    // Roller bilerek farkli: ayni rol iki modelde ayni acidan bakar.
    expect(new Set(participants.map((p) => p.role)).size).toBe(participants.length)
  })
})
