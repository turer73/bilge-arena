import { describe, expect, it, vi } from 'vitest'
import { ProviderHttpError } from '@/lib/llm/transport-core'
import {
  createAnthropicProvider,
  createCodexProvider,
  createDeepSeekProvider,
  createGeminiConversationProvider,
  normalizeAnthropicStop,
  normalizeOpenAiFinish,
} from '../transport'

const signal = new AbortController().signal

function jsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response
}

const req = {
  system: 'sistem',
  turns: [{ role: 'user' as const, content: 'tutanak' }],
  temperature: 0.7,
  maxOutputTokens: 1024,
}

describe('Codex (OpenAI) saglayicisi', () => {
  it('max_completion_tokens gonderir ve temperature GONDERMEZ', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        choices: [{ message: { content: '{"ok":true}' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 12, completion_tokens: 7 },
      }),
    )
    const p = createCodexProvider({ apiKey: 'k', modelId: 'gpt-test', fetchImpl })

    expect(p.id).toBe('codex:gpt-test')
    expect(p.capabilities.temperature).toBe(false)

    const out = await p.call(req, signal)

    const body = JSON.parse(fetchImpl.mock.calls[0][1].body)
    expect(body.max_completion_tokens).toBe(1024)
    expect(body).not.toHaveProperty('max_tokens')
    // Yeni OpenAI akil-yurutme modelleri temperature'i reddediyor.
    expect(body).not.toHaveProperty('temperature')
    expect(body.response_format).toEqual({ type: 'json_object' })
    expect(body.messages[0]).toEqual({ role: 'system', content: 'sistem' })
    expect(out).toEqual({ text: '{"ok":true}', finishReason: 'STOP', inputTokens: 12, outputTokens: 7 })
  })

  it('baseUrl sonundaki egik cizgi cift slash uretmez', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ choices: [] }))
    const p = createCodexProvider({ apiKey: 'k', modelId: 'm', baseUrl: 'https://proxy.local/v1/', fetchImpl })
    await p.call(req, signal)
    expect(fetchImpl.mock.calls[0][0]).toBe('https://proxy.local/v1/chat/completions')
  })

  it('HTTP hatasi ProviderHttpError firlatir, retryable dogru siniflanir', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ error: 'nope' }, false, 401))
    const p = createCodexProvider({ apiKey: 'k', modelId: 'm', fetchImpl })
    await expect(p.call(req, signal)).rejects.toBeInstanceOf(ProviderHttpError)
    await expect(p.call(req, signal)).rejects.toMatchObject({ status: 401, retryable: false })
  })

  it('429 retryable', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}, false, 429))
    const p = createCodexProvider({ apiKey: 'k', modelId: 'm', fetchImpl })
    await expect(p.call(req, signal)).rejects.toMatchObject({ retryable: true })
  })

  it('temperature acikca acilirsa gonderilir', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ choices: [] }))
    const p = createCodexProvider({ apiKey: 'k', modelId: 'm', supportsTemperature: true, fetchImpl })
    await p.call(req, signal)
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body).temperature).toBe(0.7)
  })
})

describe('DeepSeek saglayicisi', () => {
  it('eski parametre adini (max_tokens) kullanir', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ choices: [] }))
    const p = createDeepSeekProvider({ apiKey: 'k', modelId: 'deepseek-v4-flash', fetchImpl })
    await p.call(req, signal)
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body)
    expect(body.max_tokens).toBe(1024)
    expect(body).not.toHaveProperty('max_completion_tokens')
    expect(body.temperature).toBe(0.7)
  })
})

describe('Anthropic saglayicisi', () => {
  it('temperature GONDERMEZ (guncel modeller 400 doner) ve dogru basliklari kullanir', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        content: [{ type: 'text', text: '{"stance":"agree"}' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 30, output_tokens: 9 },
      }),
    )
    const p = createAnthropicProvider({ apiKey: 'sk-ant', modelId: 'claude-opus-5', fetchImpl })

    expect(p.capabilities).toEqual({ jsonMode: false, temperature: false })

    const out = await p.call(req, signal)

    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('https://api.anthropic.com/v1/messages')
    expect(init.headers['x-api-key']).toBe('sk-ant')
    expect(init.headers['anthropic-version']).toBe('2023-06-01')
    const body = JSON.parse(init.body)
    expect(body).not.toHaveProperty('temperature')
    expect(body.system).toBe('sistem')
    expect(body.max_tokens).toBe(1024)
    expect(out).toEqual({ text: '{"stance":"agree"}', finishReason: 'STOP', inputTokens: 30, outputTokens: 9 })
  })

  it('yalniz text bloklarini birlestirir — thinking blogu JSON ayristirmasini bozmaz', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        content: [
          { type: 'thinking', thinking: 'ic muhakeme' },
          { type: 'text', text: '{"a":' },
          { type: 'text', text: '1}' },
        ],
        stop_reason: 'end_turn',
      }),
    )
    const p = createAnthropicProvider({ apiKey: 'k', modelId: 'claude-opus-5', fetchImpl })
    expect((await p.call(req, signal)).text).toBe('{"a":1}')
  })

  it('refusal SAFETY olarak siniflanir — sema hatasi gibi gorunmez', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ content: [{ type: 'text', text: 'olmaz' }], stop_reason: 'refusal' }),
    )
    const p = createAnthropicProvider({ apiKey: 'k', modelId: 'claude-opus-5', fetchImpl })
    expect((await p.call(req, signal)).finishReason).toBe('SAFETY')
  })

  it('bos icerik null doner (bos string degil)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ content: [], stop_reason: 'end_turn' }))
    const p = createAnthropicProvider({ apiKey: 'k', modelId: 'm', fetchImpl })
    expect((await p.call(req, signal)).text).toBeNull()
  })
})

describe('Gemini saglayicisi', () => {
  it('assistant turunu model rolune cevirir', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        candidates: [{ content: { parts: [{ text: '{}' }] }, finishReason: 'STOP' }],
        usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 2 },
      }),
    )
    const p = createGeminiConversationProvider({ apiKey: 'k', modelId: 'gemini-2.5-pro', fetchImpl })
    await p.call(
      { ...req, turns: [{ role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }] },
      signal,
    )
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body)
    expect(body.contents.map((c: { role: string }) => c.role)).toEqual(['user', 'model'])
    expect(body.systemInstruction.parts[0].text).toBe('sistem')
    expect(body.generationConfig.temperature).toBe(0.7)
  })

  it('temperature null ise parametre hic gonderilmez', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ candidates: [] }))
    const p = createGeminiConversationProvider({ apiKey: 'k', modelId: 'm', fetchImpl })
    await p.call({ ...req, temperature: null }, signal)
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body).generationConfig).not.toHaveProperty('temperature')
  })
})

describe('finishReason normalizasyonu', () => {
  it('saglayiciya ozgu sozcukler ortak sozluge cevrilir', () => {
    expect(normalizeOpenAiFinish('length')).toBe('MAX_TOKENS')
    expect(normalizeOpenAiFinish('content_filter')).toBe('SAFETY')
    expect(normalizeOpenAiFinish('stop')).toBe('STOP')
    expect(normalizeOpenAiFinish(null)).toBeNull()
    expect(normalizeOpenAiFinish('bilinmeyen')).toBe('bilinmeyen')

    expect(normalizeAnthropicStop('max_tokens')).toBe('MAX_TOKENS')
    expect(normalizeAnthropicStop('refusal')).toBe('SAFETY')
    expect(normalizeAnthropicStop('end_turn')).toBe('STOP')
    expect(normalizeAnthropicStop('stop_sequence')).toBe('STOP')
  })
})
