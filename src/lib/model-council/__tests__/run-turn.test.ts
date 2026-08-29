import { describe, expect, it } from 'vitest'
import { ProviderHttpError, type LlmRawResponse } from '@/lib/llm/transport-core'
import { extractJsonObject, runTurn } from '../run-turn'
import type { ConversationalProvider } from '../transport'

const request = {
  system: 's',
  turns: [{ role: 'user' as const, content: 'u' }],
  temperature: 0.7,
  maxOutputTokens: 1024,
}

const noSleep = async () => {}

/** Sirayla verilen yanitlari/hatalari donduren sahte saglayici. */
function fakeProvider(steps: Array<LlmRawResponse | Error>): ConversationalProvider & { calls: number } {
  let i = 0
  const p = {
    id: `fake-${Math.random()}`,
    modelId: 'fake-model',
    capabilities: { jsonMode: true, temperature: true },
    minIntervalMs: 0,
    calls: 0,
    async call(): Promise<LlmRawResponse> {
      p.calls++
      const step = steps[Math.min(i++, steps.length - 1)]
      if (step instanceof Error) throw step
      return step
    },
  }
  return p
}

const validPayload = {
  reasoning: 'once dusundum',
  stance: 'refine',
  position: 'migration geri alinabilir olmali',
  respondsTo: ['r1-claude'],
  openQuestions: ['rollback testi var mi?'],
  blocking: false,
}

const good: LlmRawResponse = {
  text: JSON.stringify(validPayload),
  finishReason: 'STOP',
  inputTokens: 100,
  outputTokens: 50,
}

describe('basarili yol', () => {
  it('gecerli turu ok doner ve telemetriyi doldurur', async () => {
    const out = await runTurn({
      provider: fakeProvider([good]),
      promptVersion: 'council-turn@1',
      request,
      sleep: noSleep,
    })
    expect(out.status).toBe('ok')
    if (out.status !== 'ok') return
    expect(out.data.stance).toBe('refine')
    expect(out.data.respondsTo).toEqual(['r1-claude'])
    expect(out.telemetry.modelId).toBe('fake-model')
    expect(out.telemetry.promptVersion).toBe('council-turn@1')
    expect(out.telemetry.inputTokens).toBe(100)
  })

  it('opsiyonel alanlar eksikse varsayilanlar dolar', async () => {
    const minimal = { reasoning: 'r', stance: 'agree', position: 'tamam' }
    const out = await runTurn({
      provider: fakeProvider([{ ...good, text: JSON.stringify(minimal) }]),
      promptVersion: 'v',
      request,
      sleep: noSleep,
    })
    expect(out.status).toBe('ok')
    if (out.status !== 'ok') return
    expect(out.data.respondsTo).toEqual([])
    expect(out.data.openQuestions).toEqual([])
    expect(out.data.blocking).toBe(false)
  })
})

describe('hicbir ariza POZISYONA donusmez', () => {
  it('kalici HTTP hatasi -> failed(transport), tekrar denemez', async () => {
    const p = fakeProvider([new ProviderHttpError(401, 'unauthorized')])
    const out = await runTurn({ provider: p, promptVersion: 'v', request, sleep: noSleep })
    expect(out.status).toBe('failed')
    if (out.status !== 'failed') return
    expect(out.error.kind).toBe('transport')
    expect(p.calls).toBe(1)
  })

  it('gecici HTTP hatasindan sonra basarili deneme kabul edilir', async () => {
    const p = fakeProvider([new ProviderHttpError(429, 'rate limit'), good])
    const out = await runTurn({ provider: p, promptVersion: 'v', request, sleep: noSleep })
    expect(out.status).toBe('ok')
    expect(p.calls).toBe(2)
  })

  it('guvenlik reddi tekrar denenmez', async () => {
    const p = fakeProvider([{ text: null, finishReason: 'SAFETY', inputTokens: null, outputTokens: null }])
    const out = await runTurn({ provider: p, promptVersion: 'v', request, sleep: noSleep })
    expect(out.status).toBe('failed')
    if (out.status !== 'failed') return
    expect(out.error.kind).toBe('blocked')
    expect(out.error.retryable).toBe(false)
    expect(p.calls).toBe(1)
  })

  it('bozuk JSON -> failed(schema), pozisyon uydurmaz', async () => {
    const p = fakeProvider([{ ...good, text: 'bu JSON degil' }])
    const out = await runTurn({ provider: p, promptVersion: 'v', request, maxAttempts: 2, sleep: noSleep })
    expect(out.status).toBe('failed')
    if (out.status !== 'failed') return
    expect(out.error.kind).toBe('schema')
    expect(out.raw).toBe('bu JSON degil')
  })

  it('gecersiz stance degeri semada takilir — sessizce kabul edilmez', async () => {
    const p = fakeProvider([{ ...good, text: JSON.stringify({ ...validPayload, stance: 'belki' }) }])
    const out = await runTurn({ provider: p, promptVersion: 'v', request, maxAttempts: 1, sleep: noSleep })
    expect(out.status).toBe('failed')
    if (out.status !== 'failed') return
    expect(out.error.kind).toBe('schema')
    expect(out.error.message).toContain('stance')
  })

  it('MAX_TOKENS ama JSON tam ise odenen cagri cope atilmaz', async () => {
    const p = fakeProvider([{ ...good, finishReason: 'MAX_TOKENS' }])
    const out = await runTurn({ provider: p, promptVersion: 'v', request, sleep: noSleep })
    expect(out.status).toBe('ok')
    if (out.status !== 'ok') return
    expect(out.telemetry.finishReason).toBe('MAX_TOKENS')
  })

  it('MAX_TOKENS ve JSON kesikse truncated olarak siniflanir', async () => {
    const p = fakeProvider([{ ...good, text: '{"reasoning":"yar', finishReason: 'MAX_TOKENS' }])
    const out = await runTurn({ provider: p, promptVersion: 'v', request, maxAttempts: 1, sleep: noSleep })
    expect(out.status).toBe('failed')
    if (out.status !== 'failed') return
    expect(out.error.kind).toBe('truncated')
  })

  it('deneme tavani asilinca son hata doner', async () => {
    const p = fakeProvider([new ProviderHttpError(503, 'down')])
    const out = await runTurn({ provider: p, promptVersion: 'v', request, maxAttempts: 3, sleep: noSleep })
    expect(out.status).toBe('failed')
    expect(p.calls).toBe(3)
  })
})

describe('extractJsonObject', () => {
  it('duz JSON ayristirir', () => {
    expect(extractJsonObject('{"a":1}')).toEqual({ a: 1 })
  })

  it('JSON modu olmayan saglayicinin cerceve metnini kurtarir', () => {
    expect(extractJsonObject('Iste degerlendirmem:\n```json\n{"a":1}\n```')).toEqual({ a: 1 })
  })

  it('bas ve son bosluklar sorun degil', () => {
    expect(extractJsonObject('  \n {"a": [1,2]} \n ')).toEqual({ a: [1, 2] })
  })

  it('kurtarilamayan metinde null doner — uydurmaz', () => {
    expect(extractJsonObject('hicbir sey yok')).toBeNull()
    expect(extractJsonObject('{ kesik')).toBeNull()
  })
})
