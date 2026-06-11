/**
 * Bilge Chan companion replikleri (TDK diakritik uyumlu).
 * Dinamik alanlar: {harf} = doğru şık harfi.
 */
export const CHAN_LINES = {
  /** Yeni soru — selam (wave) */
  greet: [
    'Merhaba! Hadi şu soruya bakalım. 👋',
    'Selam! Bu soruyu birlikte çözelim.',
    'Hazır mısın? Başlayalım!',
  ],
  /** Yardım teklifi (idle) */
  offer: 'Bu soru hakkında yardıma ihtiyacın var galiba?',
  /** Açıklama girişi (reading) — {sol} eklenir */
  explainIntro: 'Pekâlâ o zaman, sana anlatayım…',
  /** Anlama kontrolü (idle) */
  check: 'Peki şimdi konuyu anlayabildin mi?',
  /** HAYIR — cesaretlendir (idle) */
  encourage: [
    'Tamam, sana güveniyorum! 💪',
    'Kendin dene, yapabilirsin!',
    'Olur, sen bilirsin. Başaracaksın!',
  ],
  /** Doğru cevap (victory) — {harf} */
  correct: [
    'Evet, cevap {harf}! 🎉',
    'Harika, {harf} doğru!',
    'Süper bildin! 🌟',
  ],
  /** Yanlış cevap (sad) — {harf} */
  wrong: [
    'Olmadı ama pes etme!',
    'Doğrusu {harf} idi, takılma. 💙',
    'Sorun değil, bir sonrakine!',
  ],
  /** Kolay soru esprisi (angry) */
  easyJoke: [
    'Bu kadar kolay soru mu olur ya! 😏',
    'Hadi ama, bunu uykunda bile çözersin!',
  ],
  /** solution yoksa açıklama fallback */
  noSolution: 'Bunu adım adım düşün, mantığını kur — yapabilirsin!',
} as const

/** Diziden rastgele replik seç (client runtime). */
export function pickLine(arr: readonly string[]): string {
  return arr[Math.floor(Math.random() * arr.length)]
}
