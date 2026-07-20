/**
 * FSRS (Free Spaced Repetition Scheduler) wrapper — konu#7 karari (Faz-2 S1).
 *
 * Kalici FSRS-state tablosu YOK (sentez S1 karari: read-time fold). Bir sorunun
 * FSRS kart-durumu (due/stability/difficulty), o soruya ait TUM session_answers
 * kayitlari kronolojik sirayla `ts-fsrs`'in scheduler'indan gecirilerek istek
 * aninda turetilir. Faz-1'in atomik/guvenilir kildigi session_answers zaten
 * tek dogruluk kaynagi oldugu icin (bkz. migration 081/082) bu fold hicbir ek
 * yazma-yoluna ihtiyac duymaz.
 *
 * Puanlama ikili (surer pozisyonu, konu#7): dogru cevap -> Rating.Good, yanlis
 * cevap -> Rating.Again. Rating.Hard/Easy KULLANILMAZ -- 4 seviyeli oz-degerlendirme
 * bu uygulamada yok (kullanici sadece dogru/yanlis cevaplar), ikili esleme FSRS
 * arastirmalarinda 4-butonlu semaya yakin kalibrasyon gosteriyor.
 *
 * enable_fuzz=false: due tarihleri deterministik kalir (snapshot-test edilebilir,
 * kullanici deneyiminde rastgele-gecikme gurultusu istenmiyor).
 */

import { fsrs, createEmptyCard, generatorParameters, Rating, type Card } from 'ts-fsrs'

export interface ReviewEvent {
  isCorrect: boolean
  answeredAt: string | Date
}

const scheduler = fsrs(generatorParameters({ enable_fuzz: false }))

/**
 * Bir sorunun TUM cevap-gecmisini (kronolojik sira ONEMLI DEGIL, burada
 * siralanir) FSRS kart-durumuna katlar. events bos ise "hic gorulmemis" bir
 * karti (due=simdi) doner -- cagiran taraf bunu genelde filtreler (aday-listesi
 * zaten en az 1 yanlis-cevap sarti ile olusturuluyor).
 */
export function foldQuestionCard(events: ReviewEvent[]): Card {
  const sorted = [...events].sort(
    (a, b) => new Date(a.answeredAt).getTime() - new Date(b.answeredAt).getTime(),
  )

  if (sorted.length === 0) {
    return createEmptyCard(new Date())
  }

  let card: Card = createEmptyCard(new Date(sorted[0].answeredAt))
  for (const event of sorted) {
    const grade = event.isCorrect ? Rating.Good : Rating.Again
    const reviewedAt = new Date(event.answeredAt)
    const { card: nextCard } = scheduler.next(card, reviewedAt, grade)
    card = nextCard
  }
  return card
}

/** Kart simdi (veya verilen `now`'da) tekrara due mu? */
export function isCardDue(card: Card, now: Date = new Date()): boolean {
  return card.due.getTime() <= now.getTime()
}
