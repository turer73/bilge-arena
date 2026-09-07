/**
 * Cok turlu (konusma bicimli) LLM tasima katmani.
 *
 * NEDEN `question-audit/provider.ts` YETMEDI: oradaki `LlmRequest` tek atislik
 * — `system` + `user`. Tartisma, gecmis turlarin model tarafindan ASISTAN turu
 * olarak gorulmesini gerektirir; katilimcinin kendi onceki sozu `assistant`,
 * digerlerinin sozu `user` olarak gider. Bu ayrimi tek `user` string'ine
 * duzlestirmek, modelin "hangisi benim gorusumdu" bilgisini kaybettirir ve
 * modeller kendi pozisyonlarini baskasina atfetmeye baslar (olculmus bir
 * basarisizlik modu degil, ama ucuz bir onlem).
 *
 * SDK YOK, HAM FETCH: repo'nun mevcut karari (database/llm-client.mjs 6
 * saglayici, question-audit/provider.ts 2 saglayici). Tek bir saglayici icin
 * resmi SDK eklemek, ayni `ConversationalProvider` arayuzunun ardinda birinde
 * SDK digerlerinde fetch olan tutarsiz bir katman yaratirdi; ayrica burada
 * ozellikle SAGLAYICI-NOTR olmak gerekiyor (urunun tamami bu).
 */

import { ProviderHttpError, type LlmRawResponse } from '@/lib/llm/transport-core'

export interface ConversationTurn {
  role: 'user' | 'assistant'
  content: string
}

export interface ConversationRequest {
  system: string
  /** En eskiden yeniye. Ilk eleman `user` olmalidir (Anthropic sarti). */
  turns: ConversationTurn[]
  /**
   * `null` = parametreyi HIC gonderme.
   *
   * Bu bir stil tercihi degil: guncel Anthropic modelleri (`claude-opus-5`,
   * `claude-sonnet-5`) `temperature` gonderildiginde 400 doner. Ayni sey yeni
   * OpenAI akil-yurutme modelleri icin de gecerli. Sifir gondermekle
   * gondermemek ayni sey olmadigi icin `null` ayri bir deger.
   */
  temperature: number | null
  maxOutputTokens: number
}

export interface ConversationalCapabilities {
  /** API duzeyinde "yalnizca gecerli JSON" modu var mi? */
  jsonMode: boolean
  /** `temperature` kabul ediyor mu? (guncel Opus/Sonnet: hayir) */
  temperature: boolean
}

export interface ConversationalProvider {
  readonly id: string
  readonly modelId: string
  readonly capabilities: ConversationalCapabilities
  /** Ardisik iki cagri arasi minimum bekleme; kapi `gateFor(id)` ile paylasilir. */
  readonly minIntervalMs: number
  call(req: ConversationRequest, signal: AbortSignal): Promise<LlmRawResponse>
}

/** Provider fabrikalarinin ortak secenekleri. */
interface BaseOptions {
  apiKey: string
  modelId: string
  minIntervalMs?: number
  /** Test icin enjekte edilebilir. */
  fetchImpl?: typeof fetch
  baseUrl?: string
}

// ── OpenAI-uyumlu (Codex/GPT, DeepSeek, yerel proxy'ler) ───────────────────

export interface OpenAiChatOptions extends BaseOptions {
  providerName?: string
  /**
   * OpenAI'nin yeni modelleri `max_tokens` REDDEDER, `max_completion_tokens`
   * bekler; DeepSeek ve eski OpenAI-uyumlu endpoint'ler tam tersine
   * `max_completion_tokens` bilmez. Tek bayrakla ayrilmasi gerekiyor —
   * varsayilan bir tahmin, dogru degeri saglayici on-ayari verir.
   */
  tokenParam?: 'max_tokens' | 'max_completion_tokens'
  supportsTemperature?: boolean
  jsonMode?: boolean
  /** Ek istek basliklari (or. OpenRouter/kurum proxy'leri). */
  extraHeaders?: Record<string, string>
}

export function createOpenAiChatProvider(opts: OpenAiChatOptions): ConversationalProvider {
  const fetchImpl = opts.fetchImpl ?? fetch
  const baseUrl = (opts.baseUrl ?? 'https://api.openai.com/v1').replace(/\/+$/, '')
  const name = opts.providerName ?? 'openai'
  const tokenParam = opts.tokenParam ?? 'max_completion_tokens'
  const supportsTemperature = opts.supportsTemperature ?? true
  const jsonMode = opts.jsonMode ?? true

  return {
    id: `${name}:${opts.modelId}`,
    modelId: opts.modelId,
    capabilities: { jsonMode, temperature: supportsTemperature },
    minIntervalMs: opts.minIntervalMs ?? 0,

    async call(req, signal) {
      const body: Record<string, unknown> = {
        model: opts.modelId,
        messages: [
          { role: 'system', content: req.system },
          ...req.turns.map((t) => ({ role: t.role, content: t.content })),
        ],
        [tokenParam]: req.maxOutputTokens,
      }
      if (jsonMode) body.response_format = { type: 'json_object' }
      if (supportsTemperature && req.temperature !== null) body.temperature = req.temperature

      const res = await fetchImpl(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${opts.apiKey}`,
          ...opts.extraHeaders,
        },
        signal,
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new ProviderHttpError(res.status, `${name} ${res.status}: ${text.slice(0, 300)}`)
      }

      const json = (await res.json()) as {
        choices?: Array<{ message?: { content?: string | null }; finish_reason?: string }>
        usage?: { prompt_tokens?: number; completion_tokens?: number }
      }
      const choice = json.choices?.[0]

      return {
        text: choice?.message?.content ?? null,
        finishReason: normalizeOpenAiFinish(choice?.finish_reason ?? null),
        inputTokens: json.usage?.prompt_tokens ?? null,
        outputTokens: json.usage?.completion_tokens ?? null,
      }
    },
  }
}

/**
 * `run-turn.ts` finishReason'i tek bir sozlukle siniflar; her saglayicinin
 * kendi sozcugunu oraya tasimak siniflandirmayi saglayici-bagimli yapardi.
 */
export function normalizeOpenAiFinish(reason: string | null): string | null {
  if (reason === 'length') return 'MAX_TOKENS'
  if (reason === 'content_filter') return 'SAFETY'
  if (reason === 'stop') return 'STOP'
  return reason
}

/**
 * Codex — OpenAI hesabi uzerinden konusan katilimci.
 *
 * MODEL KIMLIGI ZORUNLU OLARAK YAPILANDIRILABILIR: hangi codex/gpt modelinin
 * bir hesaba acik oldugu hesaptan hesaba degisir. Varsayilan bir baslangic
 * degeridir, garanti degil — hesabin sundugu kimlikle `CODEX_MODEL_ID`
 * uzerinden degistirilir (bkz. participants.ts).
 *
 * `max_completion_tokens` + `temperature` KAPALI: OpenAI'nin akil-yurutme
 * hattindaki modeller `max_tokens`i ve 1 disi `temperature`i reddediyor.
 * Sicaklik gerekiyorsa `supportsTemperature: true` ile acilir.
 */
export function createCodexProvider(opts: BaseOptions & { supportsTemperature?: boolean }): ConversationalProvider {
  return createOpenAiChatProvider({
    ...opts,
    providerName: 'codex',
    baseUrl: opts.baseUrl ?? 'https://api.openai.com/v1',
    tokenParam: 'max_completion_tokens',
    supportsTemperature: opts.supportsTemperature ?? false,
  })
}

/** DeepSeek: OpenAI-uyumlu ama eski parametre adlarini kullanir. */
export function createDeepSeekProvider(opts: BaseOptions): ConversationalProvider {
  return createOpenAiChatProvider({
    ...opts,
    providerName: 'deepseek',
    baseUrl: opts.baseUrl ?? 'https://api.deepseek.com',
    tokenParam: 'max_tokens',
    supportsTemperature: true,
  })
}

// ── Anthropic (Claude) ─────────────────────────────────────────────────────

/**
 * Anthropic Messages API.
 *
 * UC TUZAK, UCU DE BURADA KAPALI:
 *
 * 1. `temperature` guncel modellerde (opus-5, sonnet-5) 400 verir. Bu yuzden
 *    `capabilities.temperature = false` ve parametre HIC gonderilmez.
 *
 * 2. JSON MODU YOK. Anthropic'te OpenAI'nin `response_format: json_object`
 *    karsiligi bu cagri bicimi icinde yok; "yalnizca JSON" YALNIZ prompt ile
 *    istenir ve Zod (schemas.ts) TEK garantidir. `capabilities.jsonMode=false`
 *    bunu cagri koduna GORUNUR yapar — sessiz varsayim degil.
 *
 * 3. `stop_reason: 'refusal'` HTTP 200 ile gelir. Yakalanmazsa bos/kisa metin
 *    "sema hatasi" gibi gorunur ve teshis kaybolur; SAFETY'ye cevriliyor.
 */
export function createAnthropicProvider(opts: BaseOptions): ConversationalProvider {
  const fetchImpl = opts.fetchImpl ?? fetch
  const baseUrl = (opts.baseUrl ?? 'https://api.anthropic.com/v1').replace(/\/+$/, '')

  return {
    id: `anthropic:${opts.modelId}`,
    modelId: opts.modelId,
    capabilities: { jsonMode: false, temperature: false },
    minIntervalMs: opts.minIntervalMs ?? 0,

    async call(req, signal) {
      const res = await fetchImpl(`${baseUrl}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': opts.apiKey,
          'anthropic-version': '2023-06-01',
        },
        signal,
        body: JSON.stringify({
          model: opts.modelId,
          max_tokens: req.maxOutputTokens,
          system: req.system,
          messages: req.turns.map((t) => ({ role: t.role, content: t.content })),
        }),
      })

      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new ProviderHttpError(res.status, `anthropic ${res.status}: ${text.slice(0, 300)}`)
      }

      const json = (await res.json()) as {
        content?: Array<{ type?: string; text?: string }>
        stop_reason?: string
        usage?: { input_tokens?: number; output_tokens?: number }
      }

      // Yalniz `text` bloklari birlestirilir; `thinking` bloklari yanit govdesi
      // degildir ve JSON ayristirmasini bozar.
      const text = (json.content ?? [])
        .filter((b) => b.type === 'text' && typeof b.text === 'string')
        .map((b) => b.text as string)
        .join('')

      return {
        text: text === '' ? null : text,
        finishReason: normalizeAnthropicStop(json.stop_reason ?? null),
        inputTokens: json.usage?.input_tokens ?? null,
        outputTokens: json.usage?.output_tokens ?? null,
      }
    },
  }
}

export function normalizeAnthropicStop(reason: string | null): string | null {
  if (reason === 'max_tokens') return 'MAX_TOKENS'
  if (reason === 'refusal') return 'SAFETY'
  if (reason === 'end_turn' || reason === 'stop_sequence') return 'STOP'
  return reason
}

// ── Gemini ─────────────────────────────────────────────────────────────────

/**
 * Gemini'de asistan turunun rolu `model`; `assistant` gonderilirse istek
 * reddedilir. Sistem talimati ayri alanda (`systemInstruction`).
 */
export function createGeminiConversationProvider(opts: BaseOptions): ConversationalProvider {
  const fetchImpl = opts.fetchImpl ?? fetch
  const baseUrl = (opts.baseUrl ?? 'https://generativelanguage.googleapis.com/v1beta/models').replace(/\/+$/, '')

  return {
    id: `gemini:${opts.modelId}`,
    modelId: opts.modelId,
    capabilities: { jsonMode: true, temperature: true },
    minIntervalMs: opts.minIntervalMs ?? 0,

    async call(req, signal) {
      const generationConfig: Record<string, unknown> = {
        maxOutputTokens: req.maxOutputTokens,
        responseMimeType: 'application/json',
      }
      if (req.temperature !== null) generationConfig.temperature = req.temperature

      const res = await fetchImpl(
        `${baseUrl}/${encodeURIComponent(opts.modelId)}:generateContent?key=${encodeURIComponent(opts.apiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal,
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: req.system }] },
            contents: req.turns.map((t) => ({
              role: t.role === 'assistant' ? 'model' : 'user',
              parts: [{ text: t.content }],
            })),
            generationConfig,
          }),
        },
      )

      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new ProviderHttpError(res.status, `gemini ${res.status}: ${text.slice(0, 300)}`)
      }

      const json = (await res.json()) as {
        candidates?: Array<{ finishReason?: string; content?: { parts?: Array<{ text?: string }> } }>
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
