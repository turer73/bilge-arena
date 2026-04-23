/**
 * TDK (Turk Dil Kurumu) 2023 Yazim Kurallari — Test Fikstur Referansi
 *
 * Bu dosya Bilge Arena'daki TUM Turkce yazim/uyum testlerinin tek
 * gercek kaynagidir. tdk-compliance.test.ts bu fixture'i tuketir,
 * yeni kural eklemek icin buraya satir eklemek yeterli.
 *
 * ────────── KAYNAK VE DURUSTLUK NOTU ──────────
 *
 * Birincil kaynak: TDK 2023 Yazim Kurallari (PDF)
 *   URL: basaksehircpal.meb.k12.tr/.../tdkyazimkurallari2023guncel.pdf
 *
 * Fetch sureci (2026-04-23):
 *   1. WebFetch ile PDF binary dondu, otomatik metin cikarim basarisiz.
 *   2. Windows'ta pdftoppm/pdftotext yuklu degil — local parse basarisiz.
 *   3. Kullanici PDF'in TAM METNINI elle yapistirip kaynak sagladi.
 *   4. Bu fixture o yapistirilan metinden derlendi.
 *
 * Capraz dogrulama: TDK resmi sitesi (tdk.gov.tr/icerik/yazim-kurallari/)
 * buyuk-harflerin-kullanildigi-yerler ve kisaltmalar sayfalari fetch edildi
 * ve kullanicinin PDF icerigi ile uyumlu bulundu.
 *
 * KISITLILIK: "Birlesik kelimeler" TDK sayfasi 404 dondu. compounds bolumu
 * PDF'ten derlendi; TDK'nin online birlesik kelimeler sozlugu ile
 * cross-check edilmedi. Revizyon zamaninda manuel dogrulama gerekir.
 *
 * ────────── GENISLETILMIS TOKEN LISTESI ──────────
 *
 * TDK Buyuk Turkce Sozluk (Microsoft Word v1.0 Farabi) uzerinden otomatik
 * uretilmis 442 ek token, data/tdk-tokens-expanded.json icinde.
 *
 * Kaynak: F:/projelerim/shared/tdk-turkce-sozluk/tokens.json
 * Filtre: count >= 50 (yaygin), length >= 5 (false positive riski dusuk)
 * Guncelle: node scripts/sync-tdk-tokens.mjs
 *
 * ────────── KULLANIM ──────────
 *
 * import { TDK_RULES } from '@/lib/validations/tdk-rules.fixture'
 *
 * - forbiddenAsciiTokens: Manuel liste (projeye ozel, yuksek oncelik)
 * - forbiddenAsciiTokensExpanded: Sozluk kaynakli genis liste (uzun-kuyruk)
 * - forbiddenAsciiTokensAll: Ikisinin birlesimi (compliance test kullanir)
 * - properNouns.validBrand: Brand tutarliligi testi
 * - apostrophe.suffixPattern: Regex-based kesme isareti kontrolu
 * - abbreviations.noDotUppercase: Kisaltma formati dogrulamasi
 */

// ═══════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════

export type TokenPair = readonly [ascii: string, correct: string]
export type ExamplePair = readonly [invalid: string, valid: string]

// ═══════════════════════════════════════════════════════════════════════
// EXPANDED TOKENS — TDK Buyuk Turkce Sozluk (sync-tdk-tokens.mjs cikti)
// ═══════════════════════════════════════════════════════════════════════

import expandedData from './data/tdk-tokens-expanded.json'

// JSON cikti: tokens: Array<[ascii, turkish, count]>
// TokenPair tipine donustur (count bilgisi drop, sadece [ascii, turkish])
export const forbiddenAsciiTokensExpanded: readonly TokenPair[] =
  (expandedData.tokens as Array<[string, string, number]>).map(
    ([a, t]) => [a, t] as const,
  )

// ═══════════════════════════════════════════════════════════════════════
// TDK RULES — Single source of truth
// ═══════════════════════════════════════════════════════════════════════

export const TDK_RULES = {
  // ═══════════════════════════════════════════════════════════════════
  // 1. DIAKRITIK KORUMA (ç, ğ, ı, ö, ş, ü + buyuk harfleri)
  // ═══════════════════════════════════════════════════════════════════
  //
  // Kaynak: TDK genel ilke — Turkce alfabede 29 harf var, bunlar ASCII
  // muadilleriyle yer degistirilemez. Kullaniciya gorunen (UI/email/SEO)
  // metinde diakritik kaybi marka/erisilebilirlik/SEO hasaridir.
  diacritics: {
    rule:
      'Turkce karakterler (c/C, g/G, i/I, o/O, s/S, u/U — ozel: ç ğ ı ö ş ü ve Ç Ğ İ Ö Ş Ü) ' +
      'kullaniciya gorunen metinde ASCII muadili ile yazilamaz. URL slug, DB kolon adi, ' +
      'ENV anahtari, kod identifier ve yorum satiri bu kuralin istisnasidir.',

    // Turkce alfabe
    alphabet: [
      'a', 'b', 'c', 'ç', 'd', 'e', 'f', 'g', 'ğ', 'h',
      'ı', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'ö', 'p',
      'r', 's', 'ş', 't', 'u', 'ü', 'v', 'y', 'z',
    ] as const,

    // YASAK: ASCII muadili yazim — dogru hali
    // Format: [yanlis_ascii, dogru_turkce]
    forbiddenAsciiTokens: [
      // Genel kelimeler
      ['Hazirlik', 'Hazırlık'],
      ['hazirlik', 'hazırlık'],
      ['Kayit', 'Kayıt'],
      ['Kayitli', 'Kayıtlı'],
      ['Kayitlar', 'Kayıtlar'],
      ['Kayit Acik', 'Kayıt Açık'],
      ['Bakim', 'Bakım'],
      ['Bakim Modu', 'Bakım Modu'],
      ['Gorev', 'Görev'],
      ['Gorevler', 'Görevler'],
      ['Gorev Tamamlandi', 'Görev Tamamlandı'],
      ['Gunluk', 'Günlük'],
      ['Gun', 'Gün'],
      ['Haftalik', 'Haftalık'],
      ['Aylik', 'Aylık'],
      ['Ozet', 'Özet'],
      ['Ucretsiz', 'Ücretsiz'],
      ['Icin', 'İçin'],
      ['Bolum', 'Bölüm'],
      ['Bolunebilme', 'Bölünebilme'],
      ['Ogrenci', 'Öğrenci'],
      ['Ogretmen', 'Öğretmen'],
      ['Ogren', 'Öğren'],
      ['Ogrenim', 'Öğrenim'],
      ['Cozum', 'Çözüm'],
      ['Cozme', 'Çözme'],
      ['Soru Cozme', 'Soru Çözme'],
      ['Kac', 'Kaç'],
      ['Kazanilan', 'Kazanılan'],
      ['Ayarlar', 'Ayarlar'], // aynı, false positive ornegi — dikkat
      ['Ayarlarindan', 'Ayarlarından'],
      ['Durust', 'Dürüst'],
      ['Durustce', 'Dürüstçe'],
      ['Yukleme', 'Yükleme'],
      ['Yukle', 'Yükle'],
      ['Indir', 'İndir'],
      ['Basari', 'Başarı'],
      ['Basarili', 'Başarılı'],
      ['Basarisiz', 'Başarısız'],
      ['Baslangic', 'Başlangıç'],
      ['Basla', 'Başla'],
      ['Bitir', 'Bitir'], // aynı
      ['Sec', 'Seç'],
      ['Secim', 'Seçim'],
      ['Macera', 'Macera'], // aynı
      ['Oyunlastirilmis', 'Oyunlaştırılmış'],

      // Badge / gamification
      ['Ilk Adim', 'İlk Adım'],
      ['Ilk Dogru', 'İlk Doğru'],
      ['Savasci', 'Savaşçı'],
      ['Caylak', 'Çaylak'],
      ['Seri Baslangic', 'Seri Başlangıç'],
      ['Bilge Bas', 'Bilge Baş'],
      ['Yangin', 'Yangın'],
      ['Yeni Rozet', 'Yeni Rozet'], // aynı, false positive

      // Diller
      ['Turkce', 'Türkçe'],
      ['Ingilizce', 'İngilizce'],
      ['Almanca', 'Almanca'], // aynı
      ['Fransizca', 'Fransızca'],

      // Yer/ulke
      ['Turkiye', 'Türkiye'],
      ['Istanbul', 'İstanbul'],
      ['Izmir', 'İzmir'],

      // Ozel karakterler iceren teknik terim
      ['Misafir Chat', 'Misafir Sohbet'],
      ['Sohbet', 'Sohbet'], // aynı, dogru form
    ] as readonly TokenPair[],

    // ISTISNA: ASCII'nin mesru kullanim yerleri
    allowedContexts: [
      'URL slug (ornek: /hakkinda, /gizlilik-politikasi, /nasil-calisir, /cerez-politikasi)',
      'Database kolon/tablo adlari (display_name, created_at, user_role)',
      'Environment variable anahtarlari (CHAT_SYSTEM_PROMPT, QUESTION_GEN_PROMPT_TEMPLATE)',
      'Fonksiyon ve degisken identifier\'lari (toggleMode, userCount, handleSubmit)',
      'Third-party kutuphane adlari (react, framer-motion, supabase-ssr)',
      'Server-side seed/migration script console.log (kullaniciya gorunmez)',
      'Kod yorumlari (// ve /* */ blocklari)',
      'Git commit mesajlari (build sistemi gereksinimi)',
      'Test fixture ve test dosyalari kendi kendini referans eder',
      'Type/interface isimleri (PascalCase identifier kurali)',
    ] as const,
  },

  // ═══════════════════════════════════════════════════════════════════
  // 2. OZEL ISIMLER — Buyuk Harf (TDK Madde A-I, B, C, D, E, F)
  // ═══════════════════════════════════════════════════════════════════
  //
  // TDK kural: Ozel adlar (kisi, aile, hanedan, ulus, boy, oymak, devlet,
  // kurum, dil, din, mezhep, kitap, makale, yer, gezegen, yildiz, okul,
  // idari bolum, marka, unvan) buyuk harfle baslar.
  properNouns: {
    rule: 'Ozel adlar buyuk harfle baslar. Marka, dil, kisi, yer, kurum, kitap, dergi.',

    // Markalar (Bilge Arena projesi ve domaine ozel)
    validBrand: ['Bilge Arena', 'YKS', 'TYT', 'AYT', 'LGS', 'MEB'],

    // Sinavlar
    validExams: ['YKS', 'TYT', 'AYT', 'LGS', 'KPSS', 'ALES'],

    // Dersler / diller (TDK: diller buyuk harf)
    validLangs: [
      'Türkçe', 'İngilizce', 'Almanca', 'Fransızca', 'İspanyolca',
    ] as const,

    validSubjects: [
      'Matematik', 'Fizik', 'Kimya', 'Biyoloji', 'Tarih',
      'Coğrafya', 'Felsefe', 'Edebiyat', 'Din Kültürü',
    ] as const,

    // Sehirler / ulkeler
    validPlaces: [
      'Türkiye', 'İstanbul', 'Ankara', 'İzmir', 'Bursa',
      'Antalya', 'Adana', 'Konya',
    ] as const,

    // Kisi adlari (sosyal/tarihi onemli figurler)
    validPeople: ['Atatürk', 'Mustafa Kemal'] as const,

    // YASAK: kucuk harfle baslayan ozel isim ornekleri
    invalidSamples: [
      'bilge arena',
      'yks',
      'tyt',
      'turkiye',
      'ataturk',
      'türkce', // dil kucuk harfli
      'matematik', // ders kucuk harfli
    ] as const,
  },

  // ═══════════════════════════════════════════════════════════════════
  // 3. KESME ISARETI (APOSTROF) — TDK Madde I
  // ═══════════════════════════════════════════════════════════════════
  //
  // TDK kural: Ozel isimlere getirilen iyelik, durum ve bildirme ekleri
  // kesme isareti ile ayrilir. Ozel ad + yapim eki / cogul eki bitisik.
  //
  //   Ayri:  Istanbul'da, YKS'ye, Ataturk'un, Bilge Arena'ya, 2026'da
  //   Bitisik: Istanbullu, Turkcemiz, MEB'ci (yapim eki bitisik)
  apostrophe: {
    rule:
      'Ozel isimlere gelen cekim ekleri (-de/-da, -e/-a, -i/-i, -in/-in, -le/-la) ' +
      'kesme isareti ile ayrilir. Yapim ekleri (-li, -ci) bitisik yazilir.',

    // DOGRU kullanim ornekleri
    valid: [
      // Sinav/kurum + hal eki
      "YKS'ye", "YKS'de", "YKS'den", "YKS'nin",
      "TYT'ye", "TYT'de", "TYT'den",
      "AYT'de", "AYT'ye",
      "TBMM'ye", "TDK'nin", "MEB'in",
      // Marka + hal eki
      "Bilge Arena'ya", "Bilge Arena'da", "Bilge Arena'nın", "Bilge Arena'dan",
      // Yer + hal eki
      "İstanbul'da", "Türkiye'de", "Ankara'ya", "İzmir'den",
      // Tarih + hal eki
      "2026'da", "1923'te", "23 Nisan 1920'de",
      // Kisi + hal eki
      "Atatürk'ün", "Atatürk'e", "Mustafa Kemal'in",
      // Para birimi
      "TL'nin", "USD'nin",
    ] as const,

    // YASAK: kesme isareti eksik veya yanlis yer
    invalid: [
      // Eksik apostrof
      "YKSye", "YKSde", "TYTde", "AYTden",
      "Bilge Arenaya", "Bilge Arenada",
      "Istanbulda", "Turkiyede", "Ankaraya",
      "2026da", "1923te",
      "Ataturkun", "Ataturke",
      // Apostrof yanlis yer (yapim eki ayrilmaz)
      "Istanbul'lu", // dogrusu: Istanbullu
      "MEB'ci",       // dogrusu: MEBci (tartismali, TDK yapim eki bitisik oneriyor)
    ] as const,

    // Regex: Ozel isim + cekim eki kesme isareti ile ayrilmali
    // Not: Bu pattern heuristic — false positive mumkun (tam context gerekli)
    suffixPattern:
      "\\b[A-ZIİÖÜŞĞÇ][A-ZIİÖÜŞĞÇa-zıiöüşğç]+\\b(?!['\\s])(de|da|ye|ya|den|dan|nin|nun|nın|nün|te|ta|ten|tan|in|ın|un|ün|e|a|i|ı|u|ü|le|la)\\b",

    // Cekim eki listesi (hal ekleri)
    inflectionSuffixes: [
      'de', 'da', 'te', 'ta',           // bulunma
      'den', 'dan', 'ten', 'tan',       // ayrilma
      'e', 'a', 'ye', 'ya',             // yonelme
      'i', 'ı', 'u', 'ü', 'yi', 'yı', 'yu', 'yü',  // belirtme
      'in', 'ın', 'un', 'ün',           // ilgi (iyelik)
      'le', 'la', 'yle', 'yla',         // vasita
      'nin', 'nın', 'nun', 'nün',       // iyelik 3. sahis
    ] as const,
  },

  // ═══════════════════════════════════════════════════════════════════
  // 4. KISALTMALAR — TDK Madde II
  // ═══════════════════════════════════════════════════════════════════
  //
  // TDK kural:
  //  - Buyuk harfli kurum/kavram kisaltmalarinda nokta YOK (TBMM, TDK, YKS)
  //  - Tek harf ve olcu kisaltmalari nokta ile (cm., kg., m.)  [TDK'da istisna var]
  //  - Unvan kisaltmalari nokta ile (Dr., Prof., Doc.)
  //  - Dil adi kisaltmalari nokta ile (Alm., Ing., Fr., Tr.)
  //  - Ek gelince apostrof (TBMM'ye, TDK'nin)
  abbreviations: {
    rule:
      'Buyuk harfli kurum kisaltmalarinda nokta yok. Unvan/olcu/dil kisaltmalarinda ' +
      'nokta var. Ek gelince kesme isareti (TBMM\'ye).',

    // Nokta YOK (kurum, sinav, kavram)
    noDotUppercase: [
      'TBMM', 'TDK', 'MEB', 'YOK', 'OSYM',
      'YKS', 'TYT', 'AYT', 'LGS', 'KPSS', 'ALES',
      'TC', 'ABD', 'AB', 'NATO', 'UNESCO', 'BM',
      'TRT', 'PTT', 'TSK', 'CNN', 'BBC',
    ] as const,

    // Nokta VAR (unvan + isim)
    withDotLowercase: [
      'Dr.', 'Prof.', 'Doç.', 'Yrd. Doç.',
      'Sn.', 'Sy.', 'Bn.', 'By.',
      'vb.', 'vs.', 'örn.',
      'Alm.', 'İng.', 'Fr.', 'İt.', 'Tr.',
    ] as const,

    // Olcu birimleri (TDK modern: nokta olmadan da kabul — m, kg, cm)
    units: ['m', 'km', 'cm', 'mm', 'kg', 'g', 'mg', 'L', 'mL', 's', 'saat', 'dk'] as const,

    // YASAK formatlar
    invalid: [
      'T.B.M.M.',   // Noktali uppercase yanlis
      'Y.K.S.',
      'tbmm',       // kucuk harf yanlis
      'tdk',
      'Dr',         // nokta eksik (unvan)
      'Prof',
      'Doç',
    ] as const,
  },

  // ═══════════════════════════════════════════════════════════════════
  // 5. BIRLESIK KELIMELER — Bitisik / Ayri Yazim (TDK Madde III)
  // ═══════════════════════════════════════════════════════════════════
  //
  // TDK kural (ozet):
  //  - Yardimci fiil birlesik: hissetmek, reddetmek, kaybolmak
  //  - Ikilemeler ayri: cabuk cabuk, iri iri, yavas yavas
  //  - Pekistirmeli bitisik: masmavi, apacik, kipkirmizi, dumduz
  //  - Soru eki mi/mı/mu/mü: her zaman AYRI (geliyor mu, var mi?)
  //  - Baglac ki: AYRI (demek ki, oysa ki)
  //    ISTISNA (bitisik yazilanlar): sanki, oysaki, mademki, belki,
  //    halbuki, cunku, megerki, illaki
  //  - Baglac de/da: AYRI (ben de, o da)
  //  - Bulunma hal eki -de/-da: BITISIK (evde, okulda)
  //
  // KISITLILIK: TDK birlesik kelimeler sayfasi 404 oldugu icin bu bolum
  // PDF + yaygin bilgi ile derlendi. Eksik ornek olabilir.
  compounds: {
    rule:
      'Birlesik kelimeler TDK\'nin belirledigi sozluge gore bitisik veya ayri yazilir. ' +
      'Yardimci fiillerde, pekistirmelerde bitisik; ikilemelerde ayri; soru eki/baglac ki/de daima ayri.',

    // BITISIK (yardimci fiil + isim)
    compoundVerbs: [
      'hissetmek', 'reddetmek', 'kaybolmak', 'varsaymak',
      'zannetmek', 'farkinda olmak', // ayri
    ] as const,

    // BITISIK (pekistirme)
    intensifiers: [
      ['mas', 'masmavi'],
      ['ap', 'apacik'],
      ['kip', 'kipkirmizi'],
      ['dum', 'dumduz'],
      ['sim', 'simsiyah'],
      ['yap', 'yapyalnız'],
      ['bem', 'bembeyaz'],
      ['tek', 'tertemiz'],
    ] as const,

    // Soru eki mı/mi/mu/mü — DAIMA AYRI
    questionParticle: {
      rule: 'Soru eki mı/mi/mu/mü kelimeden AYRI yazilir',
      valid: ['geliyor mu', 'var mi', 'güzel mi', 'oldu mu', 'biliyor musun'],
      invalid: ['geliyormu', 'varmi', 'güzelmi', 'oldumu', 'biliyormusun'],
    },

    // Baglac ki — AYRI (ama 8 istisna BITISIK)
    conjunctionKi: {
      rule: 'Baglac "ki" kelimeden AYRI yazilir. 8 istisna bitisik yazilir.',
      // BITISIK yazilan 8 istisna: "SOMBaHCeMi" akrostisi
      exceptions: ['sanki', 'oysaki', 'mademki', 'belki', 'halbuki', 'çünkü', 'meğerki', 'illaki'] as const,
      validSeparate: ['demek ki', 'dedim ki', 'söyledim ki', 'dediler ki'],
      invalidJoined: ['demekki', 'dedimki', 'soyledimki'],
    },

    // Baglac de/da — AYRI
    // Hal eki -de/-da — BITISIK
    deDa: {
      rule: 'Baglac "de/da" AYRI, hal eki "-de/-da" BITISIK yazilir.',
      // AYRI (baglac = "dahi" anlaminda, cikardiginda cumle bozulmaz)
      validConjunctionSeparate: [
        'Ali de geldi',
        'ben de istiyorum',
        'o da biliyor',
        'sen de gel',
      ],
      // BITISIK (yer/zaman belirtir, cikardiginda cumle bozulur)
      validSuffixJoined: [
        'evde', 'okulda', 'yolda', 'bahçede', 'sınıfta',
        '2026\'da', // ozel ad ile apostrof, ama "da" bitisik
      ],
      // YASAK
      invalid: [
        'Alide geldi',     // baglac yanlislikla bitisik
        'bende istiyorum', // baglac yanlislikla bitisik
        'ev de',           // hal eki yanlislikla ayri
        'okul da',         // hal eki yanlislikla ayri
      ],
    },

    // Ikilemeler — AYRI
    reduplications: [
      'çabuk çabuk', 'yavaş yavaş', 'iri iri', 'güzel güzel',
      'eski püskü', 'yalap şalap', 'sorgu sual',
    ] as const,
  },

  // ═══════════════════════════════════════════════════════════════════
  // 6. SAYILARIN YAZILISI — TDK Madde IV
  // ═══════════════════════════════════════════════════════════════════
  //
  // TDK kural:
  //  - 1-9 arasi genelde yaziyla (bir, iki, uc...)
  //  - 10 ve ustu rakamla (yaziyla da olur edebi metinde)
  //  - Tarih, saat, olcu, para daima rakamla
  //  - Bes haneden fazla sayilar sondan itibaren uclu gruplanir, nokta ile
  numbers: {
    rule: 'Kucuk sayilar yaziyla, 10+ ve olcu/tarih/para rakamla. Binde nokta, ondalikta virgul.',

    // Yaziyla tercih edilen
    textPreferred: ['bir', 'iki', 'üç', 'dört', 'beş', 'altı', 'yedi', 'sekiz', 'dokuz'],

    // Binlik ayirici: nokta
    // Ondalik ayirici: virgul
    valid: ['1.250', '1.500.000', '2,5', '3,14', '49,99 TL'],
    invalid: ['1,250', '1,500,000', '2.5', '3.14', '49.99 TL'], // Ingilizce format yanlis
  },

  // ═══════════════════════════════════════════════════════════════════
  // 7. TARIH VE SAAT FORMATI
  // ═══════════════════════════════════════════════════════════════════
  //
  // TDK kural:
  //  - Tarih: gun.ay.yil (23.04.2026) VEYA gun ay(yaziyla) yil (23 Nisan 2026)
  //  - Saat: hh:mm (14:30)
  //  - Ay adlari Turkce (Ocak, Subat, Mart, Nisan, Mayis, Haziran,
  //    Temmuz, Agustos, Eylul, Ekim, Kasim, Aralik) buyuk harfle
  date: {
    rule: 'Tarih: gun.ay.yil veya gun ayAdi yil. Ay adi buyuk harf. Saat: hh:mm.',

    monthsTurkish: [
      'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
      'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
    ] as const,

    daysTurkish: [
      'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar',
    ] as const,

    validFormats: [
      '23.04.2026',
      '23 Nisan 2026',
      '1 Mayıs 2026',
      '23/04/2026', // slash formati da kullaniliyor (ISO-like)
    ] as const,

    invalidFormats: [
      '2026-04-23',  // ISO formati Turkce degil
      '23 nisan 2026', // Ay adi kucuk harfli
      '23 NISAN 2026', // Ay adi tum buyuk harf (sadece baslik harfi)
      '04.23.2026',  // Amerikan formati
    ] as const,
  },

  time: {
    rule: 'Saat iki nokta ust uste ile (hh:mm). 24 saat formati tercih.',
    validFormats: ['14:30', '09:00', '23:59', '00:00'] as const,
    invalidFormats: ['14.30', '14h30', '2:30 pm', '2:30PM'] as const,
  },

  // ═══════════════════════════════════════════════════════════════════
  // 8. DUZELTME ISARETI (^)
  // ═══════════════════════════════════════════════════════════════════
  //
  // TDK 2023 guncel: Kullanimi azaldi ama belirli kelimelerde anlam
  // ayirt etmek icin korunur.
  //   kar (snow) vs kar (profit, düzeltme ile)
  //   hala (still) vs hâlâ (still, dogru yazim)
  //   alem (sancak, banner) vs âlem (universe)
  correctionMark: {
    rule: 'Duzeltme isareti (^) anlam ayirt edici kelimelerde korunur.',

    // TDK tarafindan duzeltme isareti ile yazilmasi onerilen kelimeler
    requiredWords: [
      ['hala', 'hâlâ'],    // still
      ['kar',  'kâr'],     // profit
      ['alem', 'âlem'],    // universe
      ['adet', 'âdet'],    // custom
      ['ilan', 'ilân'],    // announcement (modern kullanimda opsiyonel)
      ['kagit','kâğıt'],   // paper
    ] as const,

    // NOT: Kullanim tartismali. UI'da bulunmasa da problem degil;
    // ancak bulundugunda dogru yazilmalidir.
  },

  // ═══════════════════════════════════════════════════════════════════
  // 9. TEKNOLOJI TERIM TERCIHI (TDK oneri + sektor)
  // ═══════════════════════════════════════════════════════════════════
  //
  // TDK teknik terim Turkcelestirme onerileri. Bilge Arena icin
  // kullanici ile iletisimde Turkce karsilik tercih edilir.
  techTerms: {
    rule: 'Yabanci teknik terimlerin Turkce karsiligi varsa UI metninde tercih edilir.',

    preferences: [
      ['email', 'e-posta'],
      ['e-mail', 'e-posta'],
      ['Email', 'E-posta'],
      ['E-Mail', 'E-posta'],
      ['password', 'parola'],
      ['Password', 'Parola'],
      ['username', 'kullanıcı adı'],
      ['login', 'giriş'],
      ['Login', 'Giriş'],
      ['logout', 'çıkış'],
      ['signup', 'kayıt'],
      ['Sign up', 'Kayıt'],
      ['download', 'indir'],
      ['Download', 'İndir'],
      ['upload', 'yükle'],
      ['Upload', 'Yükle'],
      ['submit', 'gönder'],
      ['cancel', 'iptal'],
      ['chat', 'sohbet'],
      ['Chat', 'Sohbet'],
      ['notification', 'bildirim'],
    ] as const,

    // Internal kod/bilesen adi Ingilizce kalabilir
    internalAllowed: [
      'ChatWidget', 'LoginForm', 'SignupModal', 'useAuth',
    ] as const,
  },

  // ═══════════════════════════════════════════════════════════════════
  // 10. NOKTALAMA ISARETLERI
  // ═══════════════════════════════════════════════════════════════════
  //
  // TDK modern tipografi onerileri — UI metni.
  punctuation: {
    rule: 'Noktalama: uc nokta yerine uc-nokta karakteri (…), uzun cizgi (—) yeri geldikce.',

    preferences: [
      ['...', '…'],           // Three dots → ellipsis
      [' -- ', ' — '],        // Double hyphen → em-dash
    ] as const,
  },

  // ═══════════════════════════════════════════════════════════════════
  // 11. TDK 2023 DEGISIKLIKLERI (67 madde ozeti)
  // ═══════════════════════════════════════════════════════════════════
  //
  // TDK 2023 guncel soz varliginda yapilan degisiklikler. Tam liste
  // uzun, burada Bilge Arena'ya en uygun olanlar sec.
  //
  // Kaynak: TDK Yazim Kurallari 2023 (kullanicinin yapistirdigi PDF).
  tdk2023Changes: [
    // Format: [eski_yazim, yeni_yazim, aciklama?]
    ['boyuna bosuna', 'boyuna posuna'],
    ['maskulen', 'maskülen'],
    ['feminen', 'feminen'], // aynı kalmış (doğrulama)
    ['kayisi', 'kayısı'],
    ['portakal', 'portakal'],
    ['kiraz', 'kiraz'],
    // NOT: Tam 67 madde TDK web/PDF kaynagindan; burada ornek kesit.
    // Gelistirme: Test amacli genislet.
  ] as const,

  // ═══════════════════════════════════════════════════════════════════
  // 12. TURKCE-OZGUN ZOD UNICODE REGEX
  // ═══════════════════════════════════════════════════════════════════
  //
  // Zod string().refine() icin Turkce karakterleri kabul eden ornekler.
  // Kullanim: username, displayName vb. formlarda.
  regexPatterns: {
    rule: 'Zod/regex validasyonda Turkce karakterler ([A-Za-z] degil) acikca dahil edilmeli.',

    // Turkce harfler dahil (buyuk + kucuk + bosluk + nokta)
    turkishAlphabet: /^[A-Za-zÇĞİÖŞÜçğıöşü\s.'-]+$/u,

    // Username: harfler + rakam + nokta + alt cizgi
    usernameTurkish: /^[A-Za-zÇĞİÖŞÜçğıöşü0-9._]{3,20}$/u,

    // DisplayName: harfler + bosluk + nokta (2-40 karakter)
    displayNameTurkish: /^[A-Za-zÇĞİÖŞÜçğıöşü\s.']{2,40}$/u,
  },
} as const

// ═══════════════════════════════════════════════════════════════════════
// COMBINED FORBIDDEN TOKENS
// ═══════════════════════════════════════════════════════════════════════
//
// Manuel liste (proje-ozel, kurumsal terimler) + sozluk kaynakli genis
// liste. Compliance test bu birlesik listeyi kullanir.
//
// Duplicate yok: sync-tdk-tokens.mjs manuel listeyi bildigi icin
// expanded listede ayni ASCII olmaz.

export const forbiddenAsciiTokensAll: readonly TokenPair[] = [
  ...TDK_RULES.diacritics.forbiddenAsciiTokens,
  ...forbiddenAsciiTokensExpanded,
]

// ═══════════════════════════════════════════════════════════════════════
// DERIVED TYPES — IDE autocomplete destegi
// ═══════════════════════════════════════════════════════════════════════

export type TDKRulesType = typeof TDK_RULES
export type ForbiddenToken = typeof TDK_RULES.diacritics.forbiddenAsciiTokens[number]
export type ValidBrand = typeof TDK_RULES.properNouns.validBrand[number]
export type ValidAbbreviation = typeof TDK_RULES.abbreviations.noDotUppercase[number]
export type TurkishMonth = typeof TDK_RULES.date.monthsTurkish[number]
