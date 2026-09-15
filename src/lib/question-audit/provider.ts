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

import { ProviderHttpError, gateFor, type LlmRawResponse } from '@/lib/llm/transport-core'
import type { GeminiSchema } from './response-shapes'

/**
 * Hata tipi ve hiz kapisi `@/lib/llm/transport-core`'a tasindi: ayni saglayici
 * anahtarini `model-council` de kullaniyor ve kapi state'i PAYLASILMAK zorunda
 * (iki bagimsiz kapi = min-interval'in iki kati hizda istek). Buradan yeniden
 * disa aktarilir; `from './provider'` yazan mevcut cagri yerleri ve
 * `instanceof ProviderHttpError` kontrolleri degismeden calisir.
 */
export { ProviderHttpError, gateFor }
export type { LlmRawResponse }

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

export interface LlmProvider {
  readonly id: string
  readonly modelId: string
  readonly capabilities: ProviderCapabilities
  /** Ardisik iki cagri arasi minimum bekleme (rate-limit tavani icin). */
  readonly minIntervalMs: number
  call(req: LlmRequest, signal: AbortSignal): Promise<LlmRawResponse>
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

// ── DeepSeek (OpenAI uyumlu) ───────────────────────────────────────────────

/**
 * DeepSeek ve OpenAI-uyumlu diger endpoint'ler.
 *
 * YETENEK FARKI — SESSIZ DEGIL, BAYRAKLI:
 *   Gemini `responseSchema` ile SEMA dayatir ve `propertyOrdering` ile alan
 *   uretim sirasini sabitler. OpenAI-uyumlu `response_format: json_object`
 *   yalniz "gecerli JSON" garanti eder; SEMA UYUMU DEGIL, alan sirasi HIC.
 *
 *   Sonuclari:
 *   1. Zod (schemas.ts) burada TEK garantidir, ikinci savunma degil.
 *   2. `reasoning`'in once uretilmesi yalniz PROMPT ile saglanir (prompts.ts
 *      icindeki "ALAN SIRASI ZORUNLU" talimati). Model uymazsa CoT tersine
 *      doner (once karar, sonra gerekce) ve bu SESSIZCE olur — cikti gecerli,
 *      testler yesil, dogruluk dusuk.
 *
 *   Bu yuzden `capabilities` ikisini de false bildirir; cagri kodu farki
 *   gorebilsin.
 *
 * NEDEN SEMA YINE DE GONDERILIYOR: `LlmRequest.schema` alan adlarini ve
 * aciklamalari tasiyor; sistem prompt'una gomulu olarak modele ne beklendigini
 * anlatmakta kullanilir. Dayatma degil, tarif.
 */
export interface OpenAiCompatibleProviderOptions {
  apiKey: string
  modelId: string
  /** Varsayilan DeepSeek; baska OpenAI-uyumlu endpoint icin degistirilir. */
  baseUrl?: string
  providerName?: string
  minIntervalMs?: number
  fetchImpl?: typeof fetch
}

export function createOpenAiCompatibleProvider(opts: OpenAiCompatibleProviderOptions): LlmProvider {
  const fetchImpl = opts.fetchImpl ?? fetch
  const baseUrl = opts.baseUrl ?? 'https://api.deepseek.com'
  const name = opts.providerName ?? 'deepseek'

  return {
    id: `${name}:${opts.modelId}`,
    modelId: opts.modelId,
    capabilities: { responseSchema: false, propertyOrdering: false },
    minIntervalMs: opts.minIntervalMs ?? 0,

    async call(req, signal) {
      const res = await fetchImpl(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${opts.apiKey}` },
        signal,
        body: JSON.stringify({
          model: opts.modelId,
          messages: [
            { role: 'system', content: req.system },
            { role: 'user', content: req.user },
          ],
          temperature: req.temperature,
          max_tokens: req.maxOutputTokens,
          response_format: { type: 'json_object' },
        }),
      })

      if (!res.ok) {
        const body = await res.text().catch(() => '')
        throw new ProviderHttpError(res.status, `${name} ${res.status}: ${body.slice(0, 300)}`)
      }

      const json = (await res.json()) as {
        choices?: Array<{ message?: { content?: string }; finish_reason?: string }>
        usage?: { prompt_tokens?: number; completion_tokens?: number }
      }
      const choice = json.choices?.[0]

      // finish_reason 'length' = OpenAI uyumlu tarafta MAX_TOKENS karsiligi.
      // run-agent.ts bunu `truncated` olarak siniflandirabilsin diye ceviriyoruz;
      // aksi halde kesik JSON generic `schema` hatasi gibi gorunur ve teshis kaybolur.
      const finishReason = choice?.finish_reason === 'length' ? 'MAX_TOKENS'
        : choice?.finish_reason === 'content_filter' ? 'SAFETY'
        : choice?.finish_reason === 'stop' ? 'STOP'
        : (choice?.finish_reason ?? null)

      return {
        text: choice?.message?.content ?? null,
        finishReason,
        inputTokens: json.usage?.prompt_tokens ?? null,
        outputTokens: json.usage?.completion_tokens ?? null,
      }
    },
  }
}
