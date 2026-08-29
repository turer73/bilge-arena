/**
 * Kurul orkestratoru — turlari sirayla kosturur, tutanagi buyutur.
 *
 * SORUMLULUK SINIRI: burasi IO yapar, KARAR VERMEZ. "Uzlasildi mi" sorusunun
 * cevabi `consensus.ts` icinde saf kalir; boylece ham tutanak saklanip kural
 * degistiginde gecmis kosular PARA HARCAMADAN yeniden puanlanabilir.
 * (`question-audit/orchestrator.ts` ayni siniri ayni gerekceyle cizer.)
 *
 * NEDEN PARALEL DEGIL: bir turda katilimcilar es zamanli cagrilirsa hicbiri
 * digerinin o turdaki sozunu goremez — elde N tane bagimsiz monolog kalir,
 * tartisma olmaz. Sirali kosmanin bedeli sure; kazanci urunun kendisi.
 */

import {
  buildCouncilSystemPrompt,
  buildCouncilTurnPrompt,
  JSON_ONLY_REMINDER,
  PROMPT_VERSION,
  type ParticipantBrief,
} from './prompts'
import { runTurn } from './run-turn'
import { DEFAULT_DERIVE_OPTIONS, deriveOutcome, type DeriveOptions } from './consensus'
import {
  DEFAULT_RENDER_OPTIONS,
  emptyTranscript,
  messageId,
  renderForParticipant,
  turnOrder,
  type RenderOptions,
} from './transcript'
import type { ConversationalProvider, ConversationTurn } from './transport'
import type {
  CouncilExecutionIdentity,
  CouncilMessage,
  CouncilRun,
  CouncilTopic,
  CouncilTranscript,
  ParticipantId,
} from './types'

export interface CouncilParticipant {
  id: ParticipantId
  displayName: string
  /** "Uygulayici", "Denetci", "Mimar" — prompt'a birebir girer. */
  role: string
  provider: ConversationalProvider
}

export interface CouncilConfig {
  maxRounds: number
  /**
   * `null` = saglayici varsayilani.
   *
   * Kurulda sicaklik DUSUK OLMAMALI: hepsi ~0 sicaklikta kosan modeller
   * birbirine cok benzer cikti uretir ve "3/3 mutabakat" dejenere bir
   * dagilimdan gelir — sahte guven. Farkli gorus istiyorsak entropi gerekli.
   * (Ayni argumanin olculmus hali: question-audit/orchestrator.ts,
   * `blindTemperature` yorumu.)
   */
  temperature: number | null
  maxOutputTokens: number
  timeoutMs: number
  maxAttempts: number
  /** Tutanak penceresi — bkz. transcript.ts RenderOptions riski. */
  render: RenderOptions
  /**
   * KOSU BASINA MUTLAK CAGRI TAVANI.
   *
   * Modeller arasi bir donguyu butcesiz baslatmak, en pahali kaza bicimidir:
   * `maxRounds * katilimci` zaten bir tavan verir ama tekrar denemeler
   * (`maxAttempts`) bunu 3 katina cikarabilir. Bu sayac gercek cagrilari
   * sayar ve asildiginda tur DENENMEZ.
   */
  maxTotalCalls: number
  /** Uzlasma saglaninca kalan turlari atla. */
  stopWhenConverged: boolean
  /** `topic.context` bu uzunlugu asarsa kirpilir ve kirpildigi SOYLENIR. */
  maxContextChars: number
}

export const DEFAULT_COUNCIL_CONFIG: CouncilConfig = {
  maxRounds: 3,
  temperature: 0.7,
  maxOutputTokens: 2048,
  timeoutMs: 90_000,
  maxAttempts: 3,
  render: DEFAULT_RENDER_OPTIONS,
  maxTotalCalls: 60,
  stopWhenConverged: true,
  maxContextChars: 24_000,
}

export interface CouncilDeps {
  /** Tur bitince cagrilir — CLI canli akis basar. */
  onMessage?: (message: CouncilMessage) => void
  onFailure?: (participantId: ParticipantId, round: number, message: string) => void
  onRoundEnd?: (round: number, transcript: CouncilTranscript) => void
  now?: () => Date
  newRunId?: () => string
  sleep?: (ms: number) => Promise<void>
}

export function councilExecutionIdentity(
  participants: readonly CouncilParticipant[],
  config: CouncilConfig,
): CouncilExecutionIdentity {
  return {
    promptVersion: PROMPT_VERSION.councilTurn,
    participants: participants.map((p) => ({
      id: p.id,
      providerId: p.provider.id,
      modelId: p.provider.modelId,
      role: p.role,
    })),
    // Yalniz modelin ciktisini etkileyen ayarlar kimlige girer; tekrar/hiz
    // ayarlari (maxAttempts, timeoutMs) ayni ciktiyi uretir, girmez.
    config: {
      maxRounds: config.maxRounds,
      temperature: config.temperature,
      maxOutputTokens: config.maxOutputTokens,
      renderMaxMessages: config.render.maxMessages,
      maxContextChars: config.maxContextChars,
    },
  }
}

function briefOf(p: CouncilParticipant): ParticipantBrief {
  return { id: p.id, displayName: p.displayName, role: p.role }
}

/**
 * Baglami kirpar ve KIRPTIGINI SOYLER.
 *
 * Sessiz kirpma en kotu secenek: modele yarim bir dosya verilir, model
 * eksigi fark etmeden "kod dogru gorunuyor" der ve kurul yanlis bir seyde
 * uzlasir. Isaret gorunce model eksik oldugunu biliyor.
 */
export function clampContext(context: string | null, maxChars: number): string | null {
  if (context === null) return null
  if (context.length <= maxChars) return context
  const kept = context.slice(0, maxChars)
  return `${kept}\n\n[... baglamin ${context.length - maxChars} karakteri uzunluk siniri nedeniyle KIRPILDI — eksik oldugunu bilerek degerlendir ...]`
}

/**
 * Bir katilimcinin gordugu konusma.
 *
 * Tutanagi tek bir `user` turu olarak veriyoruz, katilimcinin kendi onceki
 * mesajlarini ayri `assistant` turlarina bolmuyoruz. Gerekce: tutanak
 * capraz-atifli tek bir belge (`r2-codex` gibi kimlikler mesajlar arasi
 * baglari tasiyor); rol turlarina bolununce bu belge parcalanir ve
 * saglayicilar arasinda (Anthropic'in "ilk mesaj user olmali" ve donusumlu
 * rol sarti gibi) farkli sekilde davranan bir dizi ortaya cikar. Kendi sozunu
 * ayirt etmesi icin `(SEN)` isareti kullaniliyor — bkz. transcript.ts.
 */
function buildTurns(userPrompt: string): ConversationTurn[] {
  return [{ role: 'user', content: userPrompt }]
}

export async function runCouncil(
  topic: CouncilTopic,
  participants: readonly CouncilParticipant[],
  config: CouncilConfig = DEFAULT_COUNCIL_CONFIG,
  deps: CouncilDeps = {},
  deriveOptions: DeriveOptions = DEFAULT_DERIVE_OPTIONS,
): Promise<CouncilRun> {
  if (participants.length === 0) {
    throw new Error('Kurul bos: en az bir katilimci gerekli')
  }
  const duplicate = participants.find((p, i) => participants.findIndex((q) => q.id === p.id) !== i)
  if (duplicate) {
    // Ayni kimlikten iki katilimci mesaj kimliklerini cakistirir (`r1-codex`
    // iki kez) ve `latestByParticipant` birini sessizce yutar.
    throw new Error(`Katilimci kimligi tekrarli: ${duplicate.id}`)
  }

  const now = deps.now ?? (() => new Date())
  const runId = (deps.newRunId ?? (() => globalThis.crypto.randomUUID()))()
  const startedAt = now().toISOString()

  const clampedTopic: CouncilTopic = { ...topic, context: clampContext(topic.context, config.maxContextChars) }
  const transcript = emptyTranscript()
  const expectedIds = participants.map((p) => p.id)

  let totalCalls = 0
  let inputTokens = 0
  let outputTokens = 0
  let roundsRun = 0

  for (let round = 1; round <= config.maxRounds; round++) {
    roundsRun = round

    for (const participant of turnOrder(participants, round)) {
      if (totalCalls >= config.maxTotalCalls) {
        // Butce doldu: bu tur DENENMEZ. Kayda gecer ki rapor "neden 2 turda
        // durdu" sorusunu cevaplayabilsin.
        transcript.failures.push({
          id: messageId(round, participant.id),
          round,
          participantId: participant.id,
          error: {
            kind: 'budget',
            message: `kosu cagri tavani asildi (${config.maxTotalCalls})`,
            retryable: false,
          },
          telemetry: {
            providerId: participant.provider.id,
            modelId: participant.provider.modelId,
            promptVersion: PROMPT_VERSION.councilTurn,
            latencyMs: 0,
            inputTokens: null,
            outputTokens: null,
            finishReason: null,
          },
          createdAt: now().toISOString(),
        })
        deps.onFailure?.(participant.id, round, `butce tavani (${config.maxTotalCalls} cagri) doldu`)
        continue
      }

      const others = participants.filter((p) => p.id !== participant.id).map(briefOf)
      const system =
        buildCouncilSystemPrompt(briefOf(participant), others, clampedTopic) +
        // Yetenek farki telafisi: JSON modu olmayan saglayiciya cerceve
        // kurali prompt'ta tekrarlanir (tek garanti yine Zod).
        (participant.provider.capabilities.jsonMode ? '' : JSON_ONLY_REMINDER)

      const userPrompt = buildCouncilTurnPrompt({
        round,
        maxRounds: config.maxRounds,
        renderedTranscript: renderForParticipant(transcript, participant.id, config.render),
        topicContext: clampedTopic.context,
      })

      totalCalls++
      const outcome = await runTurn({
        provider: participant.provider,
        promptVersion: PROMPT_VERSION.councilTurn,
        request: {
          system,
          turns: buildTurns(userPrompt),
          // Saglayici sicaklik kabul etmiyorsa (guncel Anthropic modelleri)
          // parametre HIC gonderilmez — gonderilirse istek 400 doner.
          temperature: participant.provider.capabilities.temperature ? config.temperature : null,
          maxOutputTokens: config.maxOutputTokens,
        },
        timeoutMs: config.timeoutMs,
        maxAttempts: config.maxAttempts,
        sleep: deps.sleep,
      })

      inputTokens += outcome.telemetry.inputTokens ?? 0
      outputTokens += outcome.telemetry.outputTokens ?? 0

      if (outcome.status === 'failed') {
        transcript.failures.push({
          id: messageId(round, participant.id),
          round,
          participantId: participant.id,
          error: outcome.error,
          telemetry: outcome.telemetry,
          createdAt: now().toISOString(),
        })
        deps.onFailure?.(participant.id, round, `${outcome.error.kind}: ${outcome.error.message}`)
        continue
      }

      const message: CouncilMessage = {
        id: messageId(round, participant.id),
        round,
        participantId: participant.id,
        displayName: participant.displayName,
        role: participant.role,
        payload: outcome.data,
        telemetry: outcome.telemetry,
        createdAt: now().toISOString(),
      }
      transcript.messages.push(message)
      deps.onMessage?.(message)
    }

    deps.onRoundEnd?.(round, transcript)

    if (config.stopWhenConverged && round < config.maxRounds) {
      // Erken durus, tur tavaninda durustan FARKLI raporlanir: `roundsRun`
      // kalan turlarin bosuna harcanmadigini gosterir.
      if (deriveOutcome(transcript, expectedIds, deriveOptions).kind === 'converged') break
    }
  }

  return {
    runId,
    topic: clampedTopic,
    execution: councilExecutionIdentity(participants, config),
    transcript,
    outcome: deriveOutcome(transcript, expectedIds, deriveOptions),
    roundsRun,
    totalCalls,
    inputTokens,
    outputTokens,
    startedAt,
    finishedAt: now().toISOString(),
  }
}
