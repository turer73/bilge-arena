/**
 * LLM transport — provider-agnostik arayuz + Gemini uygulamasi.
 *
 * SDK YOK, ham fetch: repo zaten boyle yapiyor (database/llm-client.mjs, 6
 * provider) ve yeni bir bagimlilik eklemeden ayni yetenegi aliyoruz. Ayrica
 * `@google/generative-ai` (eski) ile `@google/genai` (yeni) API yuzeyleri
 * farkli; ham fetch ikisinin de surum oynakligindan bagimsiz.
 *
 * YETENEK BAYRAKLARI: Gemini sema dayatabilir ve alan sirasini sabitleyebilir;
 * DeepSeek/OpenAI-uyumlu provider'lar `json_object` ile yalniz "gecerli JSON"
 * garanti eder. Ayni cagri kodunun iki durumda da dogru calismasi icin fark
 * kodda gorunur olmali — sessiz varsayim degil.
 */

import type { GeminiSchema } from './response-shapes'

export interface ProviderCapabilities {
  /** Yanit semasini API duzeyinde dayatabiliyor mu? */
  responseSchema: boolean
  /** Alan uretim sirasini sabitleyebiliyor mu? (CoT icin kritik) */
  propertyOrdering: boolean
}

export interface LlmRequest {
  system: string
  user: string
  temperature: number
  maxOutputTokens: number
  /** Provider destekliyorsa dayatilir; desteklemiyorsa yok sayilir (Zod yakalar). */
  schema: GeminiSchema
}

export interface LlmRawResponse {
  text: string | null
  finishReason: string | null
  inputTokens: number | null
  outputTokens: number | null
}

export interface LlmProvider {
  readonly id: string
  readonly modelId: string
  readonly capabilities: ProviderCapabilities
  /** Ardisik iki cagri arasi minimum bekleme (rate-limit tavani icin). */
  readonly minIntervalMs: number
  call(req: LlmRequest, signal: AbortSignal): Promise<LlmRawResponse>
}

export class ProviderHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'ProviderHttpError'
  }
  /** 429 ve 5xx gecici; 4xx (401/400) tekrar denemekle duzelmez. */
  get retryable(): boolean {
    return this.status === 429 || this.status >= 500
  }
}

/**
 * Global slot rezervasyonu.
 *
 * database/llm-client.mjs'deki NIM kapisinin ayni fikri: her cagri bir sonraki
 * slotu ileri iter, boylece es zamanli worker'lar min-interval'e serilestirilir.
 * Onemli sonuc: rate-limitli bir provider'da `Promise.all` ile uc ajani paralel
 * cagirmak HIZ KAZANDIRMAZ — kapi onlari zaten siraya dizer. Paralellik burada
 * bir mimari sabit degil, provider'a bagli bir optimizasyondur.
 */
class RateGate {
  private nextSlot = 0
  async wait(minIntervalMs: number): Promise<void> {
    if (minIntervalMs <= 0) return
    const now = Date.now()
    const slot = Math.max(now, this.nextSlot + minIntervalMs)
    this.nextSlot = slot
    const delay = slot - now
    if (delay > 0) await new Promise((r) => setTimeout(r, delay))
  }
}

const gates = new Map<string, RateGate>()
export function gateFor(providerId: string): RateGate {
  let g = gates.get(providerId)
  if (!g) {
    g = new RateGate()
    gates.set(providerId, g)
  }
  return g
}

// ── Gemini ─────────────────────────────────────────────────────────────────

export interface GeminiProviderOptions {
  apiKey: string
  modelId: string
  minIntervalMs?: number
  /** Test icin enjekte edilebilir. */
  fetchImpl?: typeof fetch
  baseUrl?: string
}

export function createGeminiProvider(opts: GeminiProviderOptions): LlmProvider {
  const fetchImpl = opts.fetchImpl ?? fetch
  const baseUrl = opts.baseUrl ?? 'https://generativelanguage.googleapis.com/v1beta/models'

  return {
    id: `gemini:${opts.modelId}`,
    modelId: opts.modelId,
    capabilities: { responseSchema: true, propertyOrdering: true },
    minIntervalMs: opts.minIntervalMs ?? 0,

    async call(req, signal) {
      const res = await fetchImpl(
        `${baseUrl}/${encodeURIComponent(opts.modelId)}:generateContent?key=${encodeURIComponent(opts.apiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal,
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: req.system }] },
            contents: [{ role: 'user', parts: [{ text: req.user }] }],
            generationConfig: {
              temperature: req.temperature,
              maxOutputTokens: req.maxOutputTokens,
              responseMimeType: 'application/json',
              responseSchema: req.schema,
            },
          }),
        },
      )

      if (!res.ok) {
        const body = await res.text().catch(() => '')
        throw new ProviderHttpError(res.status, `gemini ${res.status}: ${body.slice(0, 300)}`)
      }

      const json = (await res.json()) as {
        candidates?: Array<{
          finishReason?: string
          content?: { parts?: Array<{ text?: string }> }
        }>
        usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number }
      }

      const candidate = json.candidates?.[0]
      return {
        text: candidate?.content?.parts?.[0]?.text ?? null,
        finishReason: candidate?.finishReason ?? null,
        inputTokens: json.usageMetadata?.promptTokenCount ?? null,
        outputTokens: json.usageMetadata?.candidatesTokenCount ?? null,
      }
    },
  }
}
