/**
 * LLM tasima katmaninin ORTAK cekirdegi: HTTP hata tipi + saglayici basina
 * global hiz kapisi.
 *
 * NEDEN AYRI DOSYA — TIDILIK DEGIL, DOGRULUK:
 *   `question-audit` (soru denetimi) ve `model-council` (modeller arasi
 *   tartisma) AYNI saglayici anahtarlarini kullanir. Her modul kendi
 *   `RateGate`ini tutsaydi, iki kapi ayni gercek kotayi bagimsiz sayardi ve
 *   ayni anda kosan iki alt sistem, min-interval'in IKI KATI hizda istek
 *   gonderirdi. Kapi state'inin tek yerde olmasi bir stil tercihi degil,
 *   429'a girmemenin sarti.
 *
 * `question-audit/provider.ts` bu iki sembolu yeniden disa aktarir; oradaki
 * mevcut import'lar (`from './provider'`) degismeden calisir ve `instanceof
 * ProviderHttpError` kimligi korunur (yeniden export ayni sinifi tasir).
 */

/** Saglayici uygulamalarinin ortak ham yanit bicimi. */
export interface LlmRawResponse {
  text: string | null
  finishReason: string | null
  inputTokens: number | null
  outputTokens: number | null
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
export class RateGate {
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

/**
 * Saglayici kimligi basina TEK kapi. Anahtar `providerId` oldugu icin ayni
 * modeli ayni endpoint uzerinden cagiran her cagirici — hangi ozellik olursa
 * olsun — ayni siraya girer.
 */
export function gateFor(providerId: string): RateGate {
  let g = gates.get(providerId)
  if (!g) {
    g = new RateGate()
    gates.set(providerId, g)
  }
  return g
}
