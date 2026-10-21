/**
 * Tutanak islemleri — SAF. Bu dosyada IO yok, tarih/rastgelelik yok.
 *
 * Tartismanin butun "birbirini gorme" davranisi burada belirlenir:
 * `renderForParticipant` bir katilimcinin sirasi geldiginde NE OKUDUGUNU
 * tanimlar. Buradaki bir hata modele yanlis dunya gosterir ve hicbir HTTP
 * hatasi vermeden tartismayi bozar — bu yuzden saf ve testli.
 */

import type { CouncilMessage, CouncilTranscript, ParticipantId } from './types'

/**
 * Mesaj kimligi: `r{tur}-{katilimci}`.
 *
 * Deterministik olmasi sart — modeller birbirine bu kimlikle atif yapiyor
 * (`respondsTo`). Rastgele kimlikle her kosuda atiflar degisir, kayit
 * karsilastirilamaz hale gelirdi.
 */
export function messageId(round: number, participantId: ParticipantId): string {
  return `r${round}-${participantId}`
}

export function emptyTranscript(): CouncilTranscript {
  return { messages: [], failures: [] }
}

/**
 * Tur sirasi her turda BIR KAYDIRILIR.
 *
 * Sirali turlarda son konusan, digerlerinin hepsini okumus olur: hem bilgi
 * avantaji hem de "son soz" agirligi. Sabit sirada bu avantaj hep ayni
 * katilimciya gider ve uzlasma o modele dogru kayar. Kaydirma bunu turlar
 * boyunca esitler.
 *
 * `round` 1-tabanlidir; 1. turda sira roster sirasidir.
 */
export function turnOrder<T>(participants: readonly T[], round: number): T[] {
  if (participants.length === 0) return []
  const shift = (round - 1) % participants.length
  return [...participants.slice(shift), ...participants.slice(0, shift)]
}

export interface RenderOptions {
  /**
   * Tutanaktan gosterilecek en fazla mesaj. Asilirsa EN ESKILER dusurulur ve
   * yerine bir kirpma isareti konur.
   *
   * RISK ACIKCA YAZILIYOR: dusen mesajlarda kapanmis bir tartisma varsa,
   * onu gormeyen katilimci ayni noktayi yeniden acabilir. Alternatif (hepsini
   * gondermek) uzun kosularda baglam tavanina carpar ve tur MAX_TOKENS'ta
   * kesilir — yani secim "biraz tekrar" ile "kosunun olmesi" arasinda.
   */
  maxMessages: number
}

export const DEFAULT_RENDER_OPTIONS: RenderOptions = { maxMessages: 40 }

/**
 * Tutanagi, sirasi gelen katilimcinin gozunden metne cevirir.
 *
 * Katilimcinin kendi mesajlari `(SEN)` ile isaretlenir. Bu isaret olmadan
 * model kendi onceki pozisyonunu baskasina atfedip kendi kendine itiraz
 * edebiliyor — ucuz ve etkili bir onlem.
 */
export function renderForParticipant(
  transcript: CouncilTranscript,
  viewerId: ParticipantId,
  options: RenderOptions = DEFAULT_RENDER_OPTIONS,
): string {
  const all = transcript.messages
  if (all.length === 0) return '(Tutanak bos — ilk soz sende.)'

  const shown = all.slice(-Math.max(1, options.maxMessages))
  const dropped = all.length - shown.length

  const blocks = shown.map((m) => renderMessage(m, m.participantId === viewerId))
  if (dropped > 0) {
    blocks.unshift(`[... ${dropped} eski mesaj tutanaktan kisaltildi ...]`)
  }
  return blocks.join('\n\n')
}

function renderMessage(m: CouncilMessage, isSelf: boolean): string {
  const who = isSelf ? `${m.displayName} (SEN)` : m.displayName
  const lines = [
    `[${m.id}] ${who} — rol: ${m.role} — tur ${m.round} — DURUS: ${m.payload.stance}${m.payload.blocking ? ' (BLOKLAYICI)' : ''}`,
    `POZISYON: ${m.payload.position}`,
  ]
  if (m.payload.respondsTo.length > 0) {
    lines.push(`YANIT: ${m.payload.respondsTo.join(', ')}`)
  }
  if (m.payload.openQuestions.length > 0) {
    lines.push(`ACIK SORULAR: ${m.payload.openQuestions.map((q) => `- ${q}`).join('\n')}`)
  }
  return lines.join('\n')
}

/**
 * Katilimcinin ayakta duran (en son) mesaji.
 *
 * "En son" tur numarasina gore degil DIZI SIRASINA gore: ayni turda birden
 * fazla giris olmasi beklenmez, ama olursa sonuncusu gecerlidir ve tur
 * numarasina bakan bir uygulama bunu sessizce kaybederdi.
 */
export function latestByParticipant(transcript: CouncilTranscript): Map<ParticipantId, CouncilMessage> {
  const out = new Map<ParticipantId, CouncilMessage>()
  for (const m of transcript.messages) out.set(m.participantId, m)
  return out
}

/** Tekrarsiz, sirasi korunmus birlestirme (Set yazimi siralamayi bozmaz). */
export function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values.map((v) => v.trim()).filter((v) => v.length > 0))]
}
