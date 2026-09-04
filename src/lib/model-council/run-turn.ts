/**
 * Tek tur cagrisini `TurnOutcome`'a ceviren katman.
 *
 * BU DOSYANIN TEK KURALI: buradan ASLA bir POZISYON cikmaz.
 * Ag hatasi, timeout, kesilme, guvenlik reddi, bozuk JSON, sema ihlali —
 * hepsi `status: 'failed'` doner. Bir catch blogunun "abstain" veya "agree"
 * uretmesi, tartisma sonucunu HTTP arizasindan turetmek demektir; kurul
 * raporunda en tehlikeli hata bu olurdu (`question-audit/run-agent.ts`
 * ayni kurali ayni gerekceyle tasiyor).
 */

import { ProviderHttpError, gateFor } from '@/lib/llm/transport-core'
import { turnPayloadSchema } from './schemas'
import type { ConversationalProvider, ConversationRequest } from './transport'
import type { TurnError, TurnErrorKind, TurnOutcome, TurnPayload, TurnTelemetry } from './types'

export interface RunTurnOptions {
  provider: ConversationalProvider
  promptVersion: string
  request: ConversationRequest
  maxAttempts?: number
  timeoutMs?: number
  backoffBaseMs?: number
  /** Test icin: gercek beklemeyi atla. */
  sleep?: (ms: number) => Promise<void>
  /**
   * Her GERCEK saglayici cagrisindan ONCE cagrilir; `false` donerse cagri
   * YAPILMAZ ve tur `budget` hatasiyla biter.
   *
   * NEDEN BURADA, CAGIRANDA DEGIL: tekrar denemeler bu fonksiyonun ICINDE
   * olur. Butce yalnizca `runTurn` cagrilmadan once kontrol edilseydi, tavan
   * tur sayisini sinirlardi ama gercek cagri sayisini sinirlamazdi — bir tur
   * `maxAttempts` kadar cagri harcayabildigi icin gercek kullanim tavanin
   * katlarina cikardi. Kanca burada oldugu icin tavan KESIN.
   */
  reserveCall?: () => boolean
}

const DEFAULTS = { maxAttempts: 3, timeoutMs: 90_000, backoffBaseMs: 500 }

function err(kind: TurnErrorKind, message: string, retryable: boolean): TurnError {
  return { kind, message, retryable }
}

function classifyFinish(finishReason: string | null): TurnError | null {
  if (finishReason === null || finishReason === 'STOP') return null
  if (finishReason === 'MAX_TOKENS') {
    return err('truncated', 'yanit token sinirinda kesildi', true)
  }
  // SAFETY / refusal / RECITATION — tekrar denemek ayni sonucu verir.
  return err('blocked', `saglayici yaniti engelledi: ${finishReason}`, false)
}

/**
 * JSON cikarimi.
 *
 * Sema dayatamayan saglayicilar (ozellikle JSON modu olmayan Anthropic)
 * yanitin basina "Iste degerlendirmem:" gibi bir cumle veya ```json bloku
 * koyabiliyor. Once duz `JSON.parse` denenir; basarisizsa ILK `{` ile SON `}`
 * arasi alinir.
 *
 * Bu bir "her seyi kurtar" ayristiricisi DEGIL: kurtarilan metin yine Zod'dan
 * gecer, yani gevsetilen tek sey cerceve, icerik degil.
 */
export function extractJsonObject(text: string): unknown | null {
  const trimmed = text.trim()
  try {
    return JSON.parse(trimmed)
  } catch {
    /* cerceve temizligi denenecek */
  }
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return null
  try {
    return JSON.parse(trimmed.slice(start, end + 1))
  } catch {
    return null
  }
}

export async function runTurn(opts: RunTurnOptions): Promise<TurnOutcome> {
  const maxAttempts = opts.maxAttempts ?? DEFAULTS.maxAttempts
  const timeoutMs = opts.timeoutMs ?? DEFAULTS.timeoutMs
  const backoffBaseMs = opts.backoffBaseMs ?? DEFAULTS.backoffBaseMs
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))

  const startedAt = Date.now()
  let lastError: TurnError = err('transport', 'hic deneme yapilmadi', false)
  let lastRaw: string | null = null
  let lastFinish: string | null = null
  let lastInput: number | null = null
  let lastOutput: number | null = null
  /** Yapilan GERCEK saglayici cagrisi sayisi — butce muhasebesinin dayanagi. */
  let attempts = 0

  const telemetry = (): TurnTelemetry => ({
    providerId: opts.provider.id,
    modelId: opts.provider.modelId,
    promptVersion: opts.promptVersion,
    latencyMs: Date.now() - startedAt,
    inputTokens: lastInput,
    outputTokens: lastOutput,
    finishReason: lastFinish,
    attempts,
  })

  /**
   * Tek deneme. ASLA firlatmaz ve asla `continue` etmez — tek cikis noktasi
   * olmasi onemli: `continue` yollari dongu sonundaki retryable kontrolunu
   * atlar ve kalici hatalar (401, SAFETY) bosuna 3 kez denenirdi.
   */
  const attemptOnce = async (): Promise<
    { ok: true; data: TurnPayload; raw: string } | { ok: false; error: TurnError }
  > => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const raw = await opts.provider.call(opts.request, controller.signal)
      lastFinish = raw.finishReason
      lastInput = raw.inputTokens
      lastOutput = raw.outputTokens
      lastRaw = raw.text

      if (raw.text === null || raw.text.trim() === '') {
        return {
          ok: false,
          error: classifyFinish(raw.finishReason) ?? err('blocked', 'saglayici bos yanit dondu', true),
        }
      }

      const parsed = extractJsonObject(raw.text)
      if (parsed === null) {
        return {
          ok: false,
          error: classifyFinish(raw.finishReason) ?? err('schema', 'yanit gecerli JSON degil', true),
        }
      }

      const result = turnPayloadSchema.safeParse(parsed)
      if (!result.success) {
        const detail = result.error.issues
          .slice(0, 3)
          .map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`)
          .join(' | ')
        return {
          ok: false,
          error: classifyFinish(raw.finishReason) ?? err('schema', `sema dogrulamasi basarisiz — ${detail}`, true),
        }
      }

      // Ayristi ve dogrulandi. finishReason anormal olsa bile veri tam;
      // telemetriye yazilir, turu dusurmez — odenen cagriyi cope atmayiz.
      return { ok: true, data: result.data, raw: raw.text }
    } catch (e) {
      if (e instanceof ProviderHttpError) return { ok: false, error: err('transport', e.message, e.retryable) }
      if (controller.signal.aborted) {
        return { ok: false, error: err('timeout', `${timeoutMs}ms icinde yanit gelmedi`, true) }
      }
      return { ok: false, error: err('transport', e instanceof Error ? e.message : String(e), true) }
    } finally {
      clearTimeout(timer)
    }
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // Butce once sorulur: tavan dolduysa ne backoff beklenir ne hiz kapisina
    // girilir. Ilk denemede reddedilirse tur hic cagri harcamadan biter.
    if (opts.reserveCall && !opts.reserveCall()) {
      lastError = err('budget', 'kosu cagri tavani doldu', false)
      break
    }

    if (attempt > 1) {
      await sleep(backoffBaseMs * 2 ** (attempt - 2))
    }
    await gateFor(opts.provider.id).wait(opts.provider.minIntervalMs)

    attempts++
    const result = await attemptOnce()
    if (result.ok) return { status: 'ok', data: result.data, telemetry: telemetry(), raw: result.raw }

    lastError = result.error
    if (!lastError.retryable) break
  }

  return { status: 'failed', error: lastError, telemetry: telemetry(), raw: lastRaw }
}
