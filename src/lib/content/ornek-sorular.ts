import type { GameSlug } from '@/lib/constants/games'

/**
 * Login'siz, indekslenebilir ORNEK sorular (AdSense low-value-content fix, Faz C).
 *
 * ONEMLI: Bunlar net-new, elle yazilmis ve dogrulanmis kucuk bir ornek settir —
 * canli soru bankasi (IP) DEGILDIR ve bankadan cekilmez. Amac: ziyaretciye/Google'a
 * gercek icerik gostermek. Istenirse bankadan curated bir free-set ile degistirilebilir.
 * correct index'ler kasitli olarak dagitildi (hep-0 anti-pattern'inden kacinmak icin).
 */
export interface SampleQuestion {
  q: string
  options: string[]
  /** dogru secenegin 0-bazli indeksi */
  correct: number
  explanation: string
}

export const SAMPLE_QUESTIONS: Partial<Record<GameSlug, SampleQuestion[]>> = {
  matematik: [
    {
      q: 'Aşağıdakilerden hangisi bir asal sayıdır?',
      options: ['1', '9', '21', '17'],
      correct: 3,
      explanation:
        '17 yalnızca 1 ve kendisine bölünür, bu yüzden asaldır. 1 asal kabul edilmez; 9 = 3×3 ve 21 = 3×7 olduğundan asal değildir.',
    },
    {
      q: 'Bir ürünün 200 TL olan fiyatına %20 zam yapılırsa yeni fiyatı kaç TL olur?',
      options: ['240', '220', '180', '260'],
      correct: 0,
      explanation: '%20 zam = 200 × 0,20 = 40 TL artış. Yeni fiyat 200 + 40 = 240 TL olur.',
    },
  ],
  turkce: [
    {
      q: 'Aşağıdaki sözcüklerden hangisinin yazımı doğrudur?',
      options: ['yalnız', 'yanlız', 'yanılz', 'yallnız'],
      correct: 0,
      explanation: "Sözcüğün doğru yazımı 'yalnız'dır; 'yanlız' yaygın bir yazım yanlışıdır.",
    },
    {
      q: "'Kara' sözcüğü aşağıdaki cümlelerin hangisinde mecaz anlamda kullanılmıştır?",
      options: [
        'Kara bulutlar gökyüzünü kapladı.',
        'Duvarı kara bir boyayla boyadı.',
        'Başına kara bir haber geldi.',
        'Kara tahtayı tebeşirle yazdı.',
      ],
      correct: 2,
      explanation:
        "'Kara haber' kötü, üzücü haber anlamında mecazdır. Diğer cümlelerde 'kara' renk anlamında, gerçek anlamıyla kullanılmıştır.",
    },
  ],
  fen: [
    {
      q: "Saf suyun deniz seviyesinde (1 atmosfer basınçta) kaynama sıcaklığı kaç °C'dir?",
      options: ['90', '100', '50', '120'],
      correct: 1,
      explanation: "Deniz seviyesinde, 1 atmosfer basınç altında saf su 100 °C'de kaynar.",
    },
    {
      q: 'Canlılarda kalıtsal bilgiyi taşıyan molekül aşağıdakilerden hangisidir?',
      options: ['Protein', 'Lipit', 'Karbonhidrat', 'DNA'],
      correct: 3,
      explanation: 'Kalıtsal bilgi DNA molekülünde kodlanır ve nesilden nesile aktarılır.',
    },
  ],
  sosyal: [
    {
      q: 'Türkiye Cumhuriyeti hangi yıl ilan edilmiştir?',
      options: ['1919', '1920', '1923', '1938'],
      correct: 2,
      explanation: 'Türkiye Cumhuriyeti 29 Ekim 1923 tarihinde ilan edilmiştir.',
    },
    {
      q: "Aşağıdaki illerden hangisi Ege Bölgesi'nde yer alır?",
      options: ['İzmir', 'Trabzon', 'Erzurum', 'Adana'],
      correct: 0,
      explanation:
        "İzmir Ege Bölgesi'ndedir. Trabzon Karadeniz, Erzurum Doğu Anadolu, Adana ise Akdeniz Bölgesi'nde yer alır.",
    },
  ],
  wordquest: [
    {
      q: 'Choose the correct option: She ___ to school every day.',
      options: ['go', 'going', 'gone', 'goes'],
      correct: 3,
      explanation:
        "Geniş zamanda üçüncü tekil şahıs (she/he/it) öznelerinde fiile -es eklenir: 'goes'.",
    },
    {
      q: "What is the antonym (opposite) of 'difficult'?",
      options: ['hard', 'heavy', 'easy', 'slow'],
      correct: 2,
      explanation: "'Difficult' (zor) sözcüğünün zıt anlamlısı 'easy' (kolay) sözcüğüdür.",
    },
  ],
}
