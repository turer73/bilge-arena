import type { GameSlug } from '@/lib/constants/games'

/** Konu sayfalarinda kullanilan emoji — marketing sayfa estetigiyle tutarli. */
export const SUBJECT_EMOJI: Record<GameSlug, string> = {
  matematik: '🧮',
  turkce: '📖',
  fen: '🔬',
  sosyal: '🌍',
  wordquest: '🌐',
}

export interface SubjectContent {
  /** SEO alt-baslik */
  tagline: string
  /** Giris paragraf(lar)i — faktuel, evergreen */
  intro: string
  /** Calisma onerisi */
  studyTip: string
  /** SEO anahtar kelimeler (metadata.keywords) */
  keywords: string[]
}

/**
 * Ders bazli SEO/icerik metni. Tamami faktuel ve evergreen (sinav sistemi
 * genel bilgisi) — markaya ozgu iddia veya degiskenlik gosterebilecek kesin
 * sayi icermez. games.ts'teki kategori/examTags verisiyle birlikte render edilir.
 */
export const SUBJECT_CONTENT: Record<GameSlug, SubjectContent> = {
  matematik: {
    tagline: 'TYT ve AYT Matematik konuları, kategorileri ve ücretsiz soru pratiği',
    intro:
      'Matematik, TYT ve AYT-Sayısal\'ın en belirleyici dersidir; net farkı doğrudan sıralamaya yansır. Bilge Arena Matematik konsolu sayılar, problemler, geometri, denklemler, fonksiyonlar ve olasılık kategorilerini kapsar — TYT temelinden AYT türev-integral düzeyine kadar.',
    studyTip:
      'Matematikte ezber değil düzenli soru çözme işe yarar. Her kategoriyi ayrı ayrı çalış, yanlışlarını tekrar et. Bilge Arena\'nın adaptif zorluk sistemi zayıf olduğun konuları otomatik olarak tekrar karşına getirir.',
    keywords: ['tyt matematik', 'ayt matematik', 'matematik soru', 'geometri', 'türev integral'],
  },
  turkce: {
    tagline: 'TYT Türkçe ve AYT Edebiyat: paragraf, dil bilgisi, anlam bilgisi',
    intro:
      'Türkçe, TYT\'nin en yüksek soru sayılı testlerinden biridir ve paragraf soruları sınav süresini en çok belirleyen bölümdür. Konsol; paragraf, dil bilgisi, sözcük ve anlam bilgisi, yazım kuralları ve edebiyat kategorilerini içerir.',
    studyTip:
      'Paragrafta hız ve doğruluk yalnızca pratikle gelir; her gün birkaç paragraf çöz. Dil bilgisi ve yazım kurallarında ise kural tekrarı ile bol soru çözümünü birlikte yürütmek en verimlisidir.',
    keywords: ['tyt türkçe', 'paragraf soruları', 'dil bilgisi', 'ayt edebiyat'],
  },
  fen: {
    tagline: 'TYT Fen ve AYT Sayısal: Fizik, Kimya, Biyoloji konuları',
    intro:
      'Fen Bilimleri konsolu fizik, kimya ve biyolojiyi TYT temel düzeyinden AYT-Sayısal derinliğine taşır. Üç bilim dalı da kavram anlama ile soru çözme dengesini birlikte ister.',
    studyTip:
      'Fizikte formül-mantık ilişkisini kur, kimyada periyodik sistem ve tepkimeleri düzenli tekrarla, biyolojide konu bütünlüğünü koru. Her konu bittiğinde karışık soru çözerek pekiştir.',
    keywords: ['tyt fen', 'ayt fizik', 'kimya soru', 'biyoloji'],
  },
  sosyal: {
    tagline: 'TYT Sosyal ve AYT Sözel: Tarih, Coğrafya, Felsefe',
    intro:
      'Sosyal Bilimler konsolu tarih, coğrafya, felsefe ve sosyolojiyi kapsar. TYT\'de net yükseltmek için verimli, AYT-Sözel için belirleyici bir alandır.',
    studyTip:
      'Tarihte kronoloji ve neden-sonuç ilişkisi, coğrafyada harita yorumu, felsefede akım-düşünür eşleştirmesi anahtardır. Düzenli aralıklı tekrar unutmayı belirgin biçimde azaltır.',
    keywords: ['tyt sosyal', 'tarih soruları', 'coğrafya', 'felsefe'],
  },
  wordquest: {
    tagline: 'YDT İngilizce: Vocabulary, Grammar ve Reading hazırlık',
    intro:
      'WordQuest konsolu YDT İngilizce için vocabulary, grammar, cloze test, dialogue, restatement, sentence completion ve phrasal verbs kategorilerini içerir. Kelime, yapı ve okuma üçlüsünü birlikte geliştirir.',
    studyTip:
      'Her gün düzenli kelime tekrarı (aralıklı tekrar) ile bol cloze ve restatement sorusu YDT\'de fark yaratır. Okuma hızını paragraf sorularıyla kademeli olarak artır.',
    keywords: ['ydt ingilizce', 'ingilizce vocabulary', 'grammar', 'cloze test'],
  },
}
