/**
 * Tartisma sonucunun turetilmesi — SAF.
 *
 * BU DOSYANIN TEK KURALI: sonuc MODELE SORULMAZ, tutanaktan HESAPLANIR.
 * "Anlastiniz mi?" diye sorulan bir modeller-kurulu her zaman "evet" der;
 * bu, `question-audit`'te olculmus sycophancy tuzaginin birebir ayni hali
 * (bkz. question-audit/types.ts, madde 2). Model yalniz KENDI durusunu beyan
 * eder; sayimi kod yapar.
 *
 * Saf olmasinin ikinci getirisi: bir kosu kaydedilip esik/kural degistiginde
 * TEK KURUS harcamadan yeniden puanlanabilir.
 */

import { latestByParticipant, uniqueStrings } from './transcript'
import type {
  CouncilOutcome,
  CouncilOutcomeKind,
  CouncilTranscript,
  ParticipantId,
  StandingPosition,
} from './types'

export interface DeriveOptions {
  /**
   * Bir sonucun ANLAMLI sayilmasi icin gereken en az konusan katilimci.
   *
   * 2 olmasinin gerekcesi: tek katilimcinin kendi kendisiyle "uzlasmasi"
   * tartisma degildir. Digerleri 401/timeout aldiysa ortada bir mutabakat
   * yok, bir ARIZA var — ve bunlar farkli sonuclar (`inconclusive`).
   */
  minSpeakers: number
  /** Cekimser katilimcilar paydaya girer mi? Varsayilan: hayir. */
  countAbstainAsSpeaker: boolean
}

export const DEFAULT_DERIVE_OPTIONS: DeriveOptions = {
  minSpeakers: 2,
  countAbstainAsSpeaker: false,
}

export function toStanding(transcript: CouncilTranscript): StandingPosition[] {
  return [...latestByParticipant(transcript).values()].map((m) => ({
    participantId: m.participantId,
    displayName: m.displayName,
    messageId: m.id,
    round: m.round,
    stance: m.payload.stance,
    position: m.payload.position,
    blocking: m.payload.blocking,
  }))
}

/**
 * Erken durma testi: bu turdan sonra devam etmenin bir getirisi var mi?
 *
 * `council.ts` bunu her tur sonunda sorar. Uzlasilmissa turlari sonuna kadar
 * kosturmak yalnizca para yakar — ve modellerin kapanmis bir konuyu yeniden
 * acma riskini artirir.
 */
export function hasConverged(
  transcript: CouncilTranscript,
  expectedParticipants: readonly ParticipantId[],
  options: DeriveOptions = DEFAULT_DERIVE_OPTIONS,
): boolean {
  return deriveOutcome(transcript, expectedParticipants, options).kind === 'converged'
}

export function deriveOutcome(
  transcript: CouncilTranscript,
  expectedParticipants: readonly ParticipantId[],
  options: DeriveOptions = DEFAULT_DERIVE_OPTIONS,
): CouncilOutcome {
  const standing = toStanding(transcript)
  const openQuestions = uniqueStrings(
    [...latestByParticipant(transcript).values()].flatMap((m) => m.payload.openQuestions),
  )

  const speaking = options.countAbstainAsSpeaker
    ? standing
    : standing.filter((s) => s.stance !== 'abstain')

  const finish = (kind: CouncilOutcomeKind, rationale: string): CouncilOutcome => ({
    kind,
    standing,
    openQuestions,
    rationale,
  })

  // ── Once ariza kapisi ────────────────────────────────────────────────────
  // Bir HTTP hatasi ASLA bir anlasmazliga donusmez. Bu kontrol digerlerinden
  // ONCE gelmeli: aksi halde tek konusan katilimcinin `agree`si "uzlasildi"
  // olarak raporlanirdi ve rapor, sessizce arizali bir hatti basari gibi
  // gosterirdi.
  if (speaking.length < options.minSpeakers) {
    const missing = expectedParticipants.filter(
      (id) => !standing.some((s) => s.participantId === id),
    )
    return finish(
      'inconclusive',
      `yalnizca ${speaking.length} katilimci pozisyon bildirdi (en az ${options.minSpeakers} gerekli)` +
        (missing.length > 0 ? `; konusamayan: ${missing.join(', ')}` : '') +
        `; ${transcript.failures.length} basarisiz tur`,
    )
  }

  const blockers = speaking.filter((s) => s.blocking)
  const dissent = speaking.filter((s) => s.stance === 'disagree')

  if (dissent.length > 0 || blockers.length > 0) {
    const names = uniqueStrings([...dissent, ...blockers].map((s) => s.displayName))
    return finish(
      'split',
      `${names.join(', ')} itiraz/blok bildirdi — ortak bir sonuc yok`,
    )
  }

  const pending = speaking.filter((s) => s.stance !== 'agree')
  if (pending.length > 0) {
    const names = pending.map((s) => `${s.displayName}:${s.stance}`)
    return finish(
      'unresolved',
      `tur tavanina gelindi, hala kapanmamis durus var (${names.join(', ')})`,
    )
  }

  return finish(
    'converged',
    `${speaking.length} katilimcinin tamami mutabik${openQuestions.length > 0 ? `, ${openQuestions.length} acik soru rapora dusuldu` : ''}`,
  )
}
