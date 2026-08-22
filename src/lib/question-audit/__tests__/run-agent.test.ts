import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { ProviderHttpError, createGeminiProvider, createOpenAiCompatibleProvider, type LlmProvider, type LlmRawResponse } from '../provider'
import { blindSolverShape } from '../response-shapes'
import { runAgent } from '../run-agent'

const schema = z.object({
  reasoning: z.string().min(1),
  predictedAnswerIndex: z.number().int().min(0).max(4).nullable(),
})

const request = {
  system: 's',
  user: 'u',
  temperature: 0.7,
  maxOutputTokens: 2048,
  schema: blindSolverShape(5),
}

/** Sirayla verilen yanitlari/hatalari donduren sahte provider. */
function fakeProvider(steps: Array<LlmRawResponse | Error>): LlmProvider & { calls: number } {
  let i = 0
  const p = {
    id: `fake-${Math.random()}`,
    modelId: 'fake-model',
    capabilities: { responseSchema: true, propertyOrdering: true },
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

const good: LlmRawResponse = {
  text: JSON.stringify({ reasoning: 'cozdum', predictedAnswerIndex: 2 }),
  finishReason: 'STOP',
  inputTokens: 100,
  outputTokens: 50,
}

const noSleep = async () => {}

describe('basarili yol', () => {
  it('gecerli yaniti ok olarak doner ve telemetriyi doldurur', async () => {
    const out = await runAgent({
      provider: fakeProvider([good]),
      promptVersion: 'blind@1',
      request,
      schema,
      sleep: noSleep,
    })
    expect(out.status).toBe('ok')
    if (out.status !== 'ok') return
    expect(out.data.predictedAnswerIndex).toBe(2)
    expect(out.telemetry.modelId).toBe('fake-model')
    expect(out.telemetry.promptVersion).toBe('blind@1')
    expect(out.telemetry.inputTokens).toBe(100)
    expect(out.telemetry.outputTokens).toBe(50)
    expect(out.telemetry.finishReason).toBe('STOP')
    expect(out.raw).toContain('cozdum')
  })
})

describe('hicbir ariza icerik bulgusuna donusmez', () => {
  it('kalici HTTP hatasi -> failed(transport), tekrar denemez', async () => {
    const p = fakeProvider([new ProviderHttpError(401, 'unauthorized')])
    const out = await runAgent({ provider: p, promptVersion: 'v', request, schema, sleep: noSleep })
    expect(out.status).toBe('failed')
    if (out.status !== 'failed') return
    expect(out.error.kind).toBe('transport')
    expect(out.error.retryable).toBe(false)
    expect(p.calls).toBe(1)
  })

  it('429 tekrar denenir ve sonunda basarili olur', async () => {
    const p = fakeProvider([new ProviderHttpError(429, 'rate limit'), good])
    const out = await runAgent({ provider: p, promptVersion: 'v', request, schema, sleep: noSleep })
    expect(out.status).toBe('ok')
    expect(p.calls).toBe(2)
  })

  it('5xx maxAttempts kadar denenir sonra failed', async () => {
    const p = fakeProvider([new ProviderHttpError(503, 'unavailable')])
    const out = await runAgent({
      provider: p,
      promptVersion: 'v',
      request,
      schema,
      maxAttempts: 3,
      sleep: noSleep,
    })
    expect(out.status).toBe('failed')
    expect(p.calls).toBe(3)
  })

  it('bozuk JSON -> failed(schema)', async () => {
    const p = fakeProvider([{ text: '{ bozuk', finishReason: 'STOP', inputTokens: null, outputTokens: null }])
    const out = await runAgent({ provider: p, promptVersion: 'v', request, schema, maxAttempts: 1, sleep: noSleep })
    expect(out.status).toBe('failed')
    if (out.status !== 'failed') return
    expect(out.error.kind).toBe('schema')
  })

  it('aralik disi indeks -> failed(schema); provider semasi tip verir, ARALIK vermez', async () => {
    const p = fakeProvider([
      {
        text: JSON.stringify({ reasoning: 'r', predictedAnswerIndex: 7 }),
        finishReason: 'STOP',
        inputTokens: null,
        outputTokens: null,
      },
    ])
    const out = await runAgent({ provider: p, promptVersion: 'v', request, schema, maxAttempts: 1, sleep: noSleep })
    expect(out.status).toBe('failed')
    if (out.status !== 'failed') return
    expect(out.error.kind).toBe('schema')
    expect(out.error.message).toContain('predictedAnswerIndex')
  })

  it('MAX_TOKENS ile kesik JSON -> failed(truncated)', async () => {
    const p = fakeProvider([
      { text: '{"reasoning":"cok uzun dus', finishReason: 'MAX_TOKENS', inputTokens: 10, outputTokens: 2048 },
    ])
    const out = await runAgent({ provider: p, promptVersion: 'v', request, schema, maxAttempts: 1, sleep: noSleep })
    expect(out.status).toBe('failed')
    if (out.status !== 'failed') return
    expect(out.error.kind).toBe('truncated')
    expect(out.telemetry.outputTokens).toBe(2048)
  })

  it('SAFETY -> failed(blocked), tekrar denemez', async () => {
    const p = fakeProvider([{ text: null, finishReason: 'SAFETY', inputTokens: 10, outputTokens: 0 }])
    const out = await runAgent({ provider: p, promptVersion: 'v', request, schema, sleep: noSleep })
    expect(out.status).toBe('failed')
    if (out.status !== 'failed') return
    expect(out.error.kind).toBe('blocked')
    expect(p.calls).toBe(1)
  })

  it('timeout -> failed(timeout)', async () => {
    const p: LlmProvider = {
      id: 'slow',
      modelId: 'fake-model',
      capabilities: { responseSchema: true, propertyOrdering: true },
      minIntervalMs: 0,
      call: (_req, signal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new Error('aborted')))
        }),
    }
    const out = await runAgent({
      provider: p,
      promptVersion: 'v',
      request,
      schema,
      maxAttempts: 1,
      timeoutMs: 20,
      sleep: noSleep,
    })
    expect(out.status).toBe('failed')
    if (out.status !== 'failed') return
    expect(out.error.kind).toBe('timeout')
  })

  it('MAX_TOKENS ama cikti TAM ise sonuc kabul edilir (odenen cagri cope atilmaz)', async () => {
    const p = fakeProvider([{ ...good, finishReason: 'MAX_TOKENS' }])
    const out = await runAgent({ provider: p, promptVersion: 'v', request, schema, sleep: noSleep })
    expect(out.status).toBe('ok')
    if (out.status !== 'ok') return
    expect(out.telemetry.finishReason).toBe('MAX_TOKENS')
  })
})

describe('gemini provider — istek govdesi', () => {
  it('responseSchema ve propertyOrdering govdeye girer', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          candidates: [{ finishReason: 'STOP', content: { parts: [{ text: good.text }] } }],
          usageMetadata: { promptTokenCount: 11, candidatesTokenCount: 22 },
        }),
        { status: 200 },
      ),
    ) as unknown as typeof fetch

    const provider = createGeminiProvider({ apiKey: 'k', modelId: 'gemini-2.5-flash-lite', fetchImpl })
    const res = await provider.call(request, new AbortController().signal)

    expect(res.inputTokens).toBe(11)
    expect(res.outputTokens).toBe(22)

    const body = JSON.parse((vi.mocked(fetchImpl).mock.calls[0][1] as RequestInit).body as string)
    expect(body.generationConfig.responseMimeType).toBe('application/json')
    expect(body.generationConfig.responseSchema.propertyOrdering[0]).toBe('reasoning')
    expect(body.generationConfig.maxOutputTokens).toBe(2048)
  })

  it('HTTP hatasi ProviderHttpError firlatir ve retryable dogru siniflanir', async () => {
    const fetchImpl = vi.fn(async () => new Response('nope', { status: 429 })) as unknown as typeof fetch
    const provider = createGeminiProvider({ apiKey: 'k', modelId: 'm', fetchImpl })
    await expect(provider.call(request, new AbortController().signal)).rejects.toMatchObject({
      status: 429,
      retryable: true,
    })
  })
})

describe('OpenAI uyumlu provider (DeepSeek)', () => {
  const call = async (body: unknown, status = 200) => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch
    const p = createOpenAiCompatibleProvider({ apiKey: 'k', modelId: 'deepseek-chat', fetchImpl })
    return { res: await p.call(request, new AbortController().signal), fetchImpl, p }
  }

  it('sema DAYATMADIGINI bildirir — Zod tek garanti kalir', () => {
    const p = createOpenAiCompatibleProvider({ apiKey: 'k', modelId: 'deepseek-chat' })
    expect(p.capabilities).toEqual({ responseSchema: false, propertyOrdering: false })
    expect(p.id).toBe('deepseek:deepseek-chat')
  })

  it('istek govdesi OpenAI sozlesmesine uyar', async () => {
    const { fetchImpl } = await call({
      choices: [{ message: { content: good.text }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 12, completion_tokens: 34 },
    })
    const init = vi.mocked(fetchImpl).mock.calls[0][1] as RequestInit
    const body = JSON.parse(init.body as string)
    expect(body.response_format).toEqual({ type: 'json_object' })
    expect(body.messages.map((m: { role: string }) => m.role)).toEqual(['system', 'user'])
    expect(body.max_tokens).toBe(2048)
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer k')
  })

  /**
   * finish_reason 'length' -> MAX_TOKENS. Cevrilmezse kesik JSON generic
   * `schema` hatasi gibi gorunur ve truncation teshisi kaybolur.
   */
  it('finish_reason Gemini terimlerine cevrilir', async () => {
    expect((await call({ choices: [{ message: { content: '{}' }, finish_reason: 'length' }] })).res.finishReason).toBe('MAX_TOKENS')
    expect((await call({ choices: [{ message: { content: '{}' }, finish_reason: 'content_filter' }] })).res.finishReason).toBe('SAFETY')
    expect((await call({ choices: [{ message: { content: '{}' }, finish_reason: 'stop' }] })).res.finishReason).toBe('STOP')
  })

  it('kesik yanit runAgent tarafindan truncated olarak siniflanir', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: '{"reasoning":"yar' }, finish_reason: 'length' }],
    }), { status: 200 })) as unknown as typeof fetch
    const provider = createOpenAiCompatibleProvider({ apiKey: 'k', modelId: 'deepseek-chat', fetchImpl })
    const out = await runAgent({ provider, promptVersion: 'v', request, schema, maxAttempts: 1, sleep: noSleep })
    expect(out.status).toBe('failed')
    if (out.status !== 'failed') return
    expect(out.error.kind).toBe('truncated')
  })

  it('HTTP hatasi retryable siniflamasiyla firlatilir', async () => {
    const fetchImpl = vi.fn(async () => new Response('rate', { status: 429 })) as unknown as typeof fetch
    const p = createOpenAiCompatibleProvider({ apiKey: 'k', modelId: 'deepseek-chat', fetchImpl })
    await expect(p.call(request, new AbortController().signal)).rejects.toMatchObject({ status: 429, retryable: true })
  })

  it('sema dayatilmadigi icin aralik disi cikti Zod ile yakalanir', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ reasoning: 'r', predictedAnswerIndex: 9 }) }, finish_reason: 'stop' }],
    }), { status: 200 })) as unknown as typeof fetch
    const provider = createOpenAiCompatibleProvider({ apiKey: 'k', modelId: 'deepseek-chat', fetchImpl })
    const out = await runAgent({ provider, promptVersion: 'v', request, schema, maxAttempts: 1, sleep: noSleep })
    expect(out.status).toBe('failed')
    if (out.status !== 'failed') return
    expect(out.error.kind).toBe('schema')
  })
})
