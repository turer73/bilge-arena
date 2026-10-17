import { FEATURES, FREE_DAILY_LIMIT } from '@/lib/constants/premium'

/**
 * Sitenin sık sorulan soruları — tek kaynak. /nasil-calisir tam listeyi,
 * ana sayfa HOME_FAQ alt kümesini gösterir; ikisi de FAQPage JSON-LD üretir.
 *
 * Search Console'da yapay zekâ özellikli aramalarda "güvenilir mi",
 * "herhangi bir ücreti var mı" gibi sorular görüldü (2026-10). Yanıtlar
 * yalnız koddan doğrulanmış olguları söyler; ücret yanıtı premium bayraklarından
 * türetilir ki limit ya da reklam açılıp kapandığında metin eskimesin.
 */
export interface FaqItem {
  q: string
  a: string
}

function pricingAnswer(): string {
  const usage = FEATURES.QUIZ_LIMIT
    ? `Ücretsiz kullanımda günde ${FREE_DAILY_LIMIT} quiz çözebilirsin.`
    : 'Şu an günlük soru limiti yoktur.'
  const ads = FEATURES.ADS ? ' Ücretsiz deneyim reklamlarla desteklenir.' : ''
  return `Evet. Kayıt olmak ve soru çözmek ücretsizdir. ${usage} Premium planlar henüz satışta değil; ileride eklenecek ek özelliklerin kapsamı Premium sayfasında duyurulur.${ads}`
}

export const SITE_FAQ: FaqItem[] = [
  {
    q: 'Bilge Arena nedir?',
    a: 'Bilge Arena; TYT, AYT, LGS ve YDT kapsamında soru pratiğini oyun öğeleriyle destekleyen web tabanlı bir alıştırma platformudur. Resmî sınav kurumu veya okulun yerine geçen bir eğitim kurumu değildir.',
  },
  {
    q: 'Bilge Arena ücretsiz mi?',
    a: pricingAnswer(),
  },
  {
    q: 'Bilge Arena güvenilir mi, verilerim güvende mi?',
    a: 'Giriş yalnız Google hesabınla yapılır; Bilge Arena senden ayrı bir şifre istemez ve şifre saklamaz. Çerez kullanmayan anonim ziyaret sayımı dışında Google Analytics ve reklam çerezleri yalnız çerez tercihlerinde izin verirsen yüklenir. Profil sayfandaki “Hesap ve veri yönetimi” bölümünden hesabını kalıcı silme sürecini başlatabilirsin. Kişisel verilerin nasıl işlendiği KVKK aydınlatma metninde ve gizlilik politikasında anlatılır.',
  },
  {
    q: 'Üye olmadan soru çözebilir miyim?',
    a: 'Evet. Misafir olarak kısa bir önizleme yapabilirsin. İlerlemenin, seri ve sonuçlarının kalıcı olarak saklanması için Google hesabınla giriş yapman gerekir.',
  },
  {
    q: 'Hangi dersler ve sınavlar var?',
    a: 'Matematik, Türkçe, Fen Bilimleri ve Sosyal Bilimler alanlarında TYT, AYT ve LGS kapsamları; İngilizce alanında YDT odaklı içerikler bulunur. Her dersin kapsadığı sınavlar kendi sayfasında gösterilir.',
  },
  {
    q: 'Yanlış veya eksik bir soru görürsem ne yapabilirim?',
    a: 'Soru deneyimindeki hata bildirimi kanalını kullanabilirsin. Bildirimde sorunu açıkça belirtmen, içeriğin incelenmesini kolaylaştırır.',
  },
  {
    q: 'Bilge Arena başarı garantisi verir mi?',
    a: 'Hayır. Bilge Arena düzenli soru pratiğine yardımcı bir araçtır; sınav sonucu veya puan garantisi vermez. Çalışma planını okul, öğretmen ve güvenilir resmî kaynaklarla birlikte yürütmelisin.',
  },
]

const HOME_FAQ_QUESTIONS = [
  'Bilge Arena nedir?',
  'Bilge Arena ücretsiz mi?',
  'Bilge Arena güvenilir mi, verilerim güvende mi?',
  'Hangi dersler ve sınavlar var?',
  'Üye olmadan soru çözebilir miyim?',
]

/** Ana sayfadaki kısa liste: ücret ve güven soruları başta. */
export const HOME_FAQ: FaqItem[] = HOME_FAQ_QUESTIONS.map((q) => {
  const item = SITE_FAQ.find((faq) => faq.q === q)
  if (!item) throw new Error(`HOME_FAQ: SITE_FAQ'ta olmayan soru: ${q}`)
  return item
})

/** FAQPage JSON-LD düğümü (@graph içine ya da tek başına konabilir). */
export function faqPageJsonLd(items: FaqItem[], id: string) {
  return {
    '@type': 'FAQPage',
    '@id': id,
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
  }
}
