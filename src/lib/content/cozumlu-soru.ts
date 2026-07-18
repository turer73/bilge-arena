/**
 * Cozumlu soru sayfalari — veri-tabanli (rehber.ts ile ayni desen: MDX degil,
 * basit ve type-safe). Sorunun kendisini koymak tek basina "ince icerik"tir;
 * ozgun deger adim-adim cozum + sik-yapilan-hata + konu-ipucu bolumlerinden gelir
 * (AdSense low-value-content fix — bkz sitemap.ts konuPages benzer amac).
 *
 * Yeni sayfa eklemek = bu diziye obje eklemek.
 */
export interface CozumluSoru {
  slug: string
  ders: string
  title: string
  description: string
  readingMinutes: number
  /** ISO tarih (literal — request-aninda hesaplanmaz, rehber.ts ile ayni desen) */
  updated: string
  question: string
  options: string[]
  correctAnswer: string
  /** Adim adim cozum; her adim ayri paragraf olarak render edilir */
  steps: string[]
  commonMistake: string
  tip: string
  tipLinkHref?: string
  tipLinkLabel?: string
}

export const COZUMLU_SORU_LIST: CozumluSoru[] = [
  {
    slug: 'tyt-matematik-iki-basamakli-sayi-rakamlari',
    ders: 'TYT Matematik',
    title: 'İki Basamaklı Sayının Rakamları — Çözümlü Soru',
    description:
      'Rakamları toplamı 12 olan iki basamaklı bir sayı probleminin adım adım çözümü, sık yapılan hata ve konu ipucuyla.',
    readingMinutes: 3,
    updated: '2026-07-18',
    question:
      'Rakamları toplamı 12 olan iki basamaklı bir sayının, rakamları yer değiştirdiğinde elde edilen sayı, ilk sayıdan 18 fazladır. Buna göre ilk sayı kaçtır?',
    options: ['A) 39', 'B) 48', 'C) 57', 'D) 66', 'E) 75'],
    correctAnswer: 'E) 75',
    steps: [
      'İlk sayının onlar basamağı o, birler basamağı b olsun. Sayının değeri: 10o + b.',
      'Rakamlar toplamı 12 olduğundan: o + b = 12.',
      'Rakamlar yer değiştirince yeni sayı: 10b + o.',
      '"Yeni sayı ilk sayıdan 18 fazla" ifadesinden: (10b + o) − (10o + b) = 18.',
      'Bunu sadeleştirirsek: 9b − 9o = 18, yani b − o = 2.',
      'Elimizde iki denklem var: o + b = 12 ve b − o = 2. Bu ikisini toplarsak 2b = 14 çıkar, buradan b = 5 ve o = 7 bulunur.',
      'İlk sayı: 10×7 + 5 = 75.',
    ],
    commonMistake:
      'Öğrenciler "18 fazla" ifadesini bazen yanlış yöne kurar; yani (ilk sayı) − (yeni sayı) = 18 yazar. Cümleyi dikkatli oku: yer değiştirmiş sayı daha büyük olduğundan, büyük olandan küçüğü çıkarılmalı. İşareti ters kurarsan b − o = −2 çıkar ve yanlış şıkka (57) gidersin — ki bu tam da tuzak şıktır.',
    tip: 'İki basamaklı bir sayı her zaman 10×(onlar) + (birler) biçiminde yazılır; rakam problemlerinin neredeyse tamamı bu tek gösterimle çözülür.',
  },
]

export function getCozumluSoru(slug: string): CozumluSoru | undefined {
  return COZUMLU_SORU_LIST.find((s) => s.slug === slug)
}

export const COZUMLU_SORU_SLUGS = COZUMLU_SORU_LIST.map((s) => s.slug)
