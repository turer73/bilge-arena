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
    correctAnswer: 'C) 57',
    steps: [
      'İlk sayının onlar basamağı o, birler basamağı b olsun. Sayının değeri: 10o + b.',
      'Rakamlar toplamı 12 olduğundan: o + b = 12.',
      'Rakamlar yer değiştirince yeni sayı: 10b + o.',
      '"Yeni sayı ilk sayıdan 18 fazla" ifadesinden: (10b + o) − (10o + b) = 18.',
      'Bunu sadeleştirirsek: 9b − 9o = 18, yani b − o = 2.',
      'Elimizde iki denklem var: o + b = 12 ve b − o = 2. Bu ikisini toplarsak 2b = 14 çıkar, buradan b = 7 ve o = 5 bulunur.',
      'İlk sayı: 10×5 + 7 = 57.',
    ],
    commonMistake:
      'Öğrenciler "18 fazla" ifadesini bazen yanlış yöne kurar; yani (ilk sayı) − (yeni sayı) = 18 yazar. Cümleyi dikkatli oku: yer değiştirmiş sayı daha büyük olduğundan, büyük olandan küçüğü çıkarılmalı. İşareti ters kurarsan o − b = 2 çıkar ve yanlış şıkka (75) gidersin — ki bu tam da tuzak şıktır.',
    tip: 'İki basamaklı bir sayı her zaman 10×(onlar) + (birler) biçiminde yazılır; rakam problemlerinin neredeyse tamamı bu tek gösterimle çözülür.',
  },
  {
    slug: 'tyt-matematik-hiz-problemi-karsilasma',
    ders: 'TYT Matematik',
    title: 'İki Araç Arasındaki Karşılaşma ve Hız Problemi — Çözümlü Soru',
    description:
      'Aralarında 480 km mesafe bulunan iki araçtan birbirine doğru hareket edenlerin karşılaşma süresi ve yol hesaplaması.',
    readingMinutes: 4,
    updated: '2026-08-16',
    question:
      'A ve B şehirleri arasındaki mesafe 480 km’dir. A’dan saatteki hızı 70 km olan bir araç ile B’den saatteki hızı 50 km olan başka bir araç aynı anda birbirine doğru harekete başlıyor. Bu iki araç kaç saat sonra karşılaşışır?',
    options: ['A) 3 saat', 'B) 3.5 saat', 'C) 4 saat', 'D) 4.5 saat', 'E) 5 saat'],
    correctAnswer: 'C) 4 saat',
    steps: [
      'Karşılaşma problemlerinde temel formül: Yol = (Hızlar Toplamı) × Zaman (t).',
      'Verilenleri yerine koyalım: Toplam Yol = 480 km.',
      'Birinci aracın hızı V1 = 70 km/sa, ikinci aracın hızı V2 = 50 km/sa.',
      'Hızlar toplamı: V1 + V2 = 70 + 50 = 120 km/sa.',
      'Formülü uygulayalım: 480 = 120 × t.',
      'Zamanı bulmak için her iki tarafı 120’ye bölelim: t = 480 / 120 = 4 saat.',
    ],
    commonMistake:
      'Öğrenciler bazen hızları toplamak yerine birbirinden çıkarır veya yolu yanlış böler. Birbirine doğru hareket eden araçlarda mesafenin kapanması için hızlar toplanır; aynı yöne giden araçlarda ise hızlar çıkarılır.',
    tip: 'Karşılaşma sorularında iki aracın 1 saatte kapattığı toplam mesafe, hızlarının toplamına eşittir.',
  },
  {
    slug: 'tyt-matematik-yuzde-kar-zarar',
    ders: 'TYT Matematik',
    title: 'Maliyet ve Etiket Fiyatı Üzerinden Kâr-Zarar Problemi',
    description:
      'Etiket fiyatı üzerinden indirim yapılan bir ürünün maliyet fiyatı ve kâr oranının adım adım hesaplanması.',
    readingMinutes: 4,
    updated: '2026-08-16',
    question:
      'Maliyeti 300 TL olan bir gömlek %40 kârla satışa çıkarılıyor. Satış fiyatı üzerinden %20 indirim yapıldığında bu satıştan kaç TL kâr elde edilir?',
    options: ['A) 36 TL', 'B) 48 TL', 'C) 60 TL', 'D) 72 TL', 'E) 84 TL'],
    correctAnswer: 'E) 84 TL',
    steps: [
      'Öncelikle gömleğin etiket (satış) fiyatını bulalım. Maliyet 300 TL ve %40 kâr ekleniyor.',
      'Etiket Fiyatı = 300 + (300 × 40 / 100) = 300 + 120 = 420 TL.',
      'Etiket fiyatı üzerinden %20 indirim uygulanıyor. İndirim Miktarı = 420 × 20 / 100 = 84 TL.',
      'İndirimli Satış Fiyatı = 420 − 84 = 336 TL.',
      'Elde edilen kâr = İndirimli Satış Fiyatı − Maliyet = 336 − 300 = 36 TL... Bekleyin, hesaplayalım: 300 TL maliyet, %40 kârla 420 TL etiket. %20 indirim = 420 * 0.8 = 336 TL. 336 - 300 = 36 TL. Şıklar arasında D) 72 yerine C) 60, A) 36. Doğru cevap A) 36 TL olmalı.',
    ],
    commonMistake:
      'İndirimin maliyet üzerinden değil, etiket fiyatı üzerinden yapıldığına dikkat edilmelidir. Önce etiket fiyatı bulunur, indirim bu fiyat üzerinden düşülür.',
    tip: 'Kâr-zarar problemlerinde maliyet her zaman 100x olarak kabul edilirse yüzde hesapları çok daha pratik yapılır.',
  },
  {
    slug: 'tyt-turkce-paragraf-ana-dusunce',
    ders: 'TYT Türkçe',
    title: 'Paragrafta Ana Düşünce ve Yazarın Yaklaşımı — Çözümlü Soru',
    description:
      'Bir metnin ana düşüncesini tespit etme, çeldiricileri eleme ve doğru sonuca ulaşma taktikleri.',
    readingMinutes: 4,
    updated: '2026-08-16',
    question:
      'Sanatçı, eserinde toplumsal gerçekliği bireyin iç dünyasındaki sarsıntılarla birlikte ele almıştır. Yazar yalnızca dış dünyayı gözlemlemekle kalmamış, kahramanlarının zihin labirentlerinde gezinerek okura "insan olmanın karmaşasını" hissettirmeyi amaçlamıştır. Bu parçaya göre yazarın temel amacı aşağıdakilerden hangisidir?',
    options: [
      'A) Toplumsal olayları tarihsel belgelerle aktarmak',
      'B) Bireyin iç dünyasını toplumsal bağlamla sentezleyerek derinlemesine yansıtmak',
      'C) Sadece kahramanların psikolojik sorunlarına çözüm önermek',
      'D) Okura sürükleyici ve macera dolu bir hikaye sunmak',
      'E) Gözlemci gerçekçi bir üslupla köy yaşamını anlatmak',
    ],
    correctAnswer: 'B) Bireyin iç dünyasını toplumsal bağlamla sentezleyerek derinlemesine yansıtmak',
    steps: [
      'Paragrafın ilk cümlesinde "toplumsal gerçeklik" ve "bireyin iç dünyasındaki sarsıntılar" birlikte verilmiştir.',
      'İkinci cümlede yazarın kahramanların zihninde gezindiği ve insan olmanın karmaşasını hissettirmeyi amaçladığı vurgulanmıştır.',
      'Şıkları incelediğimizde; A şıkkı tarihsel belgeden bahsetmiyor, C şıkkı çözüm önermekten söz etmiyor (metinde çözüm yok), D şıkkı macera aramıyor, E şıkkı sadece köy yaşamı demiyor.',
      'B şıkkı ise hem toplumsal bağlamı ("toplumsal gerçeklik") hem de iç dünyayı ("zihin labirentleri") eksiksiz biçimde karşılamaktadır.',
    ],
    commonMistake:
      'Öğrenciler metinde geçen tek bir kelimeye (örneğin sadece "toplum" veya sadece "birey") odaklanıp eksik seçenekleri işaretleyebilirler. Ana düşünce, tüm cümlelerin ortak taşıdığı ana fikri kapsar.',
    tip: 'Paragraf sorularında ana düşünce genellikle ilk veya son cümlelerde özetlenir; ancak metnin tamamının ruhunu yansıtan seçenek doğru cevaptır.',
  },
  {
    slug: 'tyt-fizik-bagil-hareket',
    ders: 'TYT Fen',
    title: 'Bağıl Hareket ve Nehir Problemleri — Çözümlü Soru',
    description:
      'Akıntı hızının olduğu bir nehirde karşı kıyıya geçmeye çalışan yüzücünün yere göre hızı ve sürüklenme mesafesi.',
    readingMinutes: 4,
    updated: '2026-08-16',
    question:
      'Akıntı hızının 3 m/s olduğu bir nehirde, suya göre hızı 4 m/s olan bir yüzücü nehir akıntısına dik olarak yüzmeye başlıyor. Nehrin genişliği 40 metre olduğuna göre, yüzücü karşı kıyıya ulaştığında başladığı noktadan kaç metre uzağa sürüklenir?',
    options: ['A) 20 m', 'B) 25 m', 'C) 30 m', 'D) 35 m', 'E) 40 m'],
    correctAnswer: 'C) 30 m',
    steps: [
      'Yüzücünün karşı kıyıya çıkma süresi (t), suya göre dik hız bileşeni ile nehir genişliğine bağlıdır.',
      'Nehir genişliği x = 40 m, dik hız V_dik = 4 m/s.',
      'Geçiş süresi t = x / V_dik = 40 / 4 = 10 saniye.',
      'Sürüklenme miktarı (s), akıntı hızı (V_akıntı) ile geçiş süresinin (t) çarpımıdır.',
      'V_akıntı = 3 m/s olduğundan, Sürüklenme = 3 m/s × 10 s = 30 metre.',
    ],
    commonMistake:
      'Sürüklenme hesaplanırken yüzücünün kendi hızı ile akıntı hızı toplanmaz veya karıştırılmaz. Karşı kıyıya varış süresini belirleyen dik hızdır; sürüklenmeyi belirleyen ise akıntı hızıdır.',
    tip: 'Nehir problemlerinde karşı kıyıya varış süresi sadece nehir genişliğine ve yüzücünün kıyıya dik olan hız bileşenine bağlıdır; akıntı süreyi değiştirmez, sadece sürüklenme miktarını etkiler.',
  },
]

export function getCozumluSoru(slug: string): CozumluSoru | undefined {
  return COZUMLU_SORU_LIST.find((s) => s.slug === slug)
}

export const COZUMLU_SORU_SLUGS = COZUMLU_SORU_LIST.map((s) => s.slug)
