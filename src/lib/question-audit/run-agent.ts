/**
 * Tek ajan cagrisini `AgentOutcome`'a ceviren katman.
 *
 * BU DOSYANIN TEK KURALI: buradan ASLA bir icerik bulgusu cikmaz.
 * Ag hatasi, timeout, truncation, safety-block, bozuk JSON, sema ihlali —
 * hepsi `status: 'failed'` doner. Onceki taslakta her ajanin catch blogu
 * uydurma bir kusur uretiyordu (`AMBIGUOUS_WORDING`, `INCOMPLETE_SOLUTION`);
 * olculen %54 provider hata oraniyla bu, veritabanindaki en yaygin "kusur"un
 * saf gurultu olmasi demekti — ve enum'u standartlastirmanin tek gerekcesi
 * olan analizi basmadan zehirlerdi.
 */

import type { ZodType } from 'zod'
import { ProviderHttpError, gateFor, type LlmProvider, type LlmRequest } from './provider'
import type { AgentError, AgentOutcome, AgentTelemetry } from './types'

export interface RunAgentOptions<T> {
  provider: LlmProvider
  promptVersion: string
  request: LlmRequest
  schema: ZodType<T>
  /** Toplam deneme sayisi (ilk deneme dahil). */
  maxAttempts?: number
  timeoutMs?: number
  backoffBaseMs?: number
  /** Test icin: gercek beklemeyi atla. */
  sleep?: (ms: number) => Promise<void>
}

const DEFAULTS = { maxAttempts: 3, timeoutMs: 60_000, backoffBaseMs: 500 }

function err(kind: AgentError['kind'], message: string, retryable: boolean): AgentError {
  return { kind, message, retryable }
}

/** finishReason'i siniflandirir. null/STOP normal kabul edilir. */
function classifyFinish(finishReason: string | null): AgentError | null {
  if (finishReason === null || finishReason === 'STOP') return null
  if (finishReason === 'MAX_TOKENS') {
    // Yeniden denemeye deger: CoT uzun reasoning uretti, tekrar daha kisa olabilir.
    return err('truncated', 'yanit maxOutputTokens sinirinda kesildi', true)
  }
  // SAFETY / RECITATION / OTHER — tekrar denemek ayni sonucu verir.
  return err('blocked', `provider yaniti engelledi: ${finishReason}`, false)
}

export async function runAgent<T>(opts: RunAgentOptions<T>): Promise<AgentOutcome<T>> {
  const maxAttempts = opts.maxAttempts ?? DEFAULTS.maxAttempts
  const timeoutMs = opts.timeoutMs ?? DEFAULTS.timeoutMs
  const backoffBaseMs = opts.backoffBaseMs ?? DEFAULTS.backoffBaseMs
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))

  const startedAt = Date.now()
  let lastError: AgentError = err('transport', 'hic deneme yapilmadi', false)
  let lastRaw: string | null = null
  let lastFinish: string | null = null
  let lastInput: number | null = null
  let lastOutput: number | null = null

  const telemetry = (): AgentTelemetry => ({
    providerId: opts.provider.id,
    modelId: opts.provider.modelId,
    promptVersion: opts.promptVersion,
    latencyMs: Date.now() - startedAt,
    inputTokens: lastInput,
    outputTokens: lastOutput,
    finishReason: lastFinish,
  })

  /**
   * Tek deneme. Basariliysa veriyi, degilse hatayi doner — ASLA firlatmaz ve
   * asla `continue` etmez. Tek cikis noktasi olmasi onemli: onceki halde
   * `continue` yollari dongu sonundaki retryable kontrolunu atliyordu, yani
   * SAFETY gibi kalici hatalar bosuna 3 kez deneniyordu (testin yakaladigi bug).
   */
  const attemptOnce = async (): Promise<{ ok: true; data: T; raw: string } | { ok: false; error: AgentError }> => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const raw = await opts.provider.call(opts.request as LlmRequest, controller.signal)
      lastFinish = raw.finishReason
      lastInput = raw.inputTokens
      lastOutput = raw.outputTokens
      lastRaw = raw.text

      if (raw.text === null || raw.text.trim() === '') {
        // Bos yanit genelde safety-block veya bos candidate.
        return { ok: false, error: classifyFinish(raw.finishReason) ?? err('blocked', 'provider bos yanit dondu', true) }
      }

      // Once ayristirmayi dene: MAX_TOKENS gelse bile cikti tam ve gecerliyse
      // odenen cagriyi cope atmanin anlami yok.
      let parsed: unknown
      try {
        parsed = JSON.parse(raw.text)
      } catch {
        return { ok: false, error: classifyFinish(raw.finishReason) ?? err('schema', 'yanit gecerli JSON degil', true) }
      }

      const result = opts.schema.safeParse(parsed)
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
      // telemetriye yazilir, karari bozmaz.
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
    if (attempt > 1) {
      // Ussel backoff — 429/5xx'te ayni pencereye geri dalmamak icin.
      await sleep(backoffBaseMs * 2 ** (attempt - 2))
    }
    await gateFor(opts.provider.id).wait(opts.provider.minIntervalMs)

    const result = await attemptOnce()
    if (result.ok) return { status: 'ok', data: result.data, telemetry: telemetry(), raw: result.raw }

    lastError = result.error
    if (!lastError.retryable) break
  }

  return { status: 'failed', error: lastError, telemetry: telemetry(), raw: lastRaw }
}
