export const SUBJECT_GOLDEN_RULES = {
  matematik: 'MATEMATİK KURALI: Salt işlem sorma. Soruları günlük hayatla ilişkilendir, senaryo kur (yeni nesil). Şıkları tam sayı veya sade kesir ver.',
  turkce: 'TÜRKÇE KURALI: Metinler en az 40-50 kelime uzunluğunda, edebi, felsefi veya bilimsel bir dille yazılmış olmalı. Çeldirici şıklar metnin içindeki kelimeleri kullanarak öğrenciyi düşürmeli.',
  fen: 'FEN KURALI: Sadece ezber sorma. Deney kurguları, grafik yorumlama veya I, II, III öncüllü mantık soruları kurgula.',
  sosyal: 'SOSYAL KURALI: Tarihte neden-sonuç, Coğrafyada harita veya bölge özellikleri üzerinden ezber dışı mantık yürütme iste.',
  wordquest: 'İNGİLİZCE KURALI: Verilen CEFR seviyesine kesinlikle uy. Cümleler doğal İngilizce ile yazılmalı, gramer hataları veya yapay çeviri kokan ifadeler olmamalı.',
}

export const GOLDEN_EXAMPLES = {
  matematik: `ÖRNEK MATEMATİK SORUSU:
{"question": "Bir kafede satılan kahvelerin fiyatları boyutlarına göre (Küçük, Orta, Büyük) sırasıyla 3, 4 ve 5 ile orantılıdır. Bir grup arkadaş 15 bardak kahve sipariş etmiş ve toplam 630 TL ödemiştir. Gruptaki Büyük boy kahve sipariş edenlerin sayısı, Küçük boy kahve sipariş edenlerin sayısının 2 katıdır. Orta boy kahvenin fiyatının bir tam sayı olduğu bilindiğine göre, bu grup kaç tane Orta boy kahve sipariş etmiştir?", "options": ["4", "5", "6", "7", "8"], "answer": 2, "solution": "Fiyatlar: Küçük=3k, Orta=4k, Büyük=5k. Miktarlar: Küçük=x, Büyük=2x, Orta=15-3x. Toplam: 3kx + 4k(15-3x) + 10kx = 630 => k(x+60)=630. Orta boy (4k) tam sayı ise k da uygun bir değerdir. x=3 için k(63)=630 => k=10. Fiyatlar 30,40,50 tam sayı olur. Orta boy = 15-3(3) = 6 adet. Doğru cevap 6'dır."}`,
  fen: `ÖRNEK FİZİK (ÖNCÜLLÜ) SORUSU:
{"question": "Bir cismin kinetik enerjisi ile ilgili;\\nI. Cismin kütlesine bağlıdır.\\nII. Cismin hızının karesi ile orantılıdır.\\nIII. Vektörel bir büyüklüktür.\\nyargılarından hangileri doğrudur?", "options": ["Yalnız I", "Yalnız II", "I ve II", "I ve III", "I, II ve III"], "answer": 2, "solution": "Kinetik enerji Ek = 1/2*m*v^2 formülüyle hesaplanır. Kütleye (I) ve hızın karesine (II) bağlıdır. Skalerdir, vektörel değildir (III yanlış)."}`,
  turkce: `ÖRNEK TÜRKÇE (PARAGRAF) SORUSU:
{"question": "Dijitalleşmenin edebiyat üzerindeki etkisi sadece e-kitapların yaygınlaşmasıyla sınırlı kalmadı; yazar ve okur arasındaki görünmez duvarları da yıktı. Aylar süren mektuplaşmaların yerini, anlık sosyal medya etkileşimleri aldı. Ancak bu hız, edebi eleştirinin derinliğini aşındırdı. Artık bir eserin değeri, üzerine yazılmış kapsamlı incelemelerden çok, aldığı yıldız sayısı ve anlık beğenilerle ölçülüyor.\\nBu parçadan çıkarılabilecek en kapsamlı yargı aşağıdakilerden hangisidir?", "options": ["E-kitaplar basılı kitapların yerini tamamen almıştır.", "Sosyal medya, yazarların daha çok kitap satmasını sağlamaktadır.", "Dijitalleşme iletişimi hızlandırırken edebi değerlendirmelerin niteliğini düşürmüştür.", "Günümüzde edebi eserler sadece sosyal medyada tartışılmaktadır.", "Geleneksel eleştiri yöntemleri dijital çağda tamamen yok olmuştur."], "answer": 2, "solution": "Metinde dijitalleşmenin iletişimi anlık hale getirdiği ancak edebi eleştirinin derinliğini aşındırdığı vurgulanmaktadır. Bu yargı metnin iki yönünü de kapsayan en genel yargıdır."}`,
  sosyal: `ÖRNEK TARİH SORUSU:
{"question": "Osmanlı Devleti'nin kuruluş yıllarında Gaza ve Cihat anlayışıyla hareket etmesi, sınırlarını hızla batıya (Bizans yönüne) doğru genişletmesinde önemli rol oynamıştır. Ancak aynı dönemde Anadolu'daki diğer Türk beylikleriyle de zaman zaman mücadele edilmiştir.\\nBuna göre, Osmanlı Devleti'nin erken dönem politikası ile ilgili aşağıdakilerden hangisi söylenemez?", "options": ["Sınırlarını genişletmede dini motivasyon kullanılmıştır.", "Bizans'ın zayıf durumundan faydalanılmıştır.", "Anadolu'da siyasi birlik tamamen sağlanmıştır.", "Batı yönlü fetihlere öncelik verilmiştir.", "Gaza anlayışı, Türk beyliklerine karşı uygulanmamıştır."], "answer": 2, "solution": "Metinde diğer beyliklerle de mücadele edildiği belirtilmiştir ancak bu durum 'Anadolu'da siyasi birlik tamamen sağlanmıştır' anlamına gelmez. Siyasi birlik çok daha sonra sağlanmıştır."}`,
  wordquest: `ÖRNEK İNGİLİZCE SORUSU:
{"question": "The manager's approach was so ____ that everyone agreed.\\n\\nChoose the best word.", "options": ["belligerent", "conciliatory", "indifferent", "lethargic", "obsolete"], "answer": 1, "solution": "Boşluğa uzlaştırıcı anlamına gelen 'conciliatory' gelmelidir."}`,
}

export const QUALITY_RULES = `

ZORUNLU KALİTE KURALLARI (İHLAL ETME):
1. ŞIK UZUNLUK DENGESİ: Tüm seçenekler BENZER uzunlukta olmalı. Doğru cevap diğerlerinden belirgin biçimde UZUN/DETAYLI OLMAMALI; çeldiriciler de doğru cevap kadar dolu, makul ve inandırıcı yazılmalı. Aksi halde öğrenci içeriği bilmeden sadece "en uzun şıkkı" seçerek doğruyu bulabilir.
2. ÇÖZÜMDE ŞIK HARFİ YASAK: "solution" alanında ŞIK HARFİ (A/B/C/D/E) veya "X seçeneği", "X şıkkı", "doğru cevap X" gibi harfe dayalı ifade KULLANMA. Şıklar kullanıcıya KARIŞIK sırayla gösterildiğinden harf referansı yanlış görünür. Doğru cevabı ve neden doğru/yanlış olduğunu yalnızca İÇERİKLE (kavram/değer) açıkla.
3. NUMARALI İFADE KURALI: "I, II, III" şeklindeki öncüllü sorularda, öncüllerin (I. ..., II. ..., III. ...) TAMAMINI 'question' alanının (gövdenin) içine yazmalısın. Öncülleri asla seçeneklere ('options' alanına) bölme. Seçenekler her zaman standart, kısa eşleşmeler ("Yalnız I", "I ve II", "I, II ve III" vb.) olmalıdır.

ÖRNEK FİZİK ÖNCÜLLÜ SORU YAPISI (FEW-SHOT):
{"question": "Bir cismin kinetik enerjisi ile ilgili;\\nI. Cismin kütlesine bağlıdır.\\nII. Cismin hızının karesi ile orantılıdır.\\nIII. Vektörel bir büyüklüktür.\\nyargılarından hangileri doğrudur?", "options": ["Yalnız I", "Yalnız II", "I ve II", "I ve III", "I, II ve III"], "answer": 2, "solution": "Kinetik enerji Ek = 1/2*m*v^2 formülüyle hesaplanır. Formülden görüleceği üzere kütleye (I doğru) ve hızın karesine (II doğru) bağlıdır. Enerji skaler bir büyüklüktür, vektörel değildir (III yanlış). Dolayısıyla I ve II doğrudur."}`

// 2026 YKS gerçek-sınav (ÖSYM) STİL-REFERANSI. Burada BİREBİR SORU YOK — yalnız
// ÖSYM'nin genel soru-kökü kalıpları + biçim-istatistikleri (jenerik, telif-güvenli).
// Amaç: üreticinin gerçek-sınav zorluğu/formatını yakalaması.
// turkce/sosyal/wordquest kaynağı: data/soru-bankasi/_ref-2026/ (215 soru, telifli-repo-dışı).
// matematik/fen kaynağı: data/soru-bankasi/cikmis-katalog/ (149 soru, vision-okuma ile
// çıkarılmış TYT 2024-2026 kitapçıkları, database/analyze-catalog-style.py ile ölçüldü).
export const REF_2026_STYLE = {
  turkce:
    '2026 YKS-STİLİ (TYT Türkçe + AYT Edebiyat gözlemi): Soruların ~%80\'i PARAGRAF-tabanlıdır (40-90 kelime metin + tek soru). Tipik soru-kökleri: "...anlatılmak istenen aşağıdakilerden hangisidir?", "...altı çizili sözle anlatılmak istenen...", "boş bırakılan yerlere sırasıyla aşağıdakilerden hangisi getirilmelidir?", "...bu parçadan aşağıdakilerin hangisi çıkarılamaz?". Şıklar tam-cümle/uzun (~85 karakter). Doğru cevap A-E arasında DENGELİ dağıtılmalı (belirli harfe yığma yok).',
  sosyal:
    '2026 YKS-STİLİ (TYT Sosyal + AYT Sosyal-2 gözlemi): ~%90 metin/çıkarım-tabanlı. Ezber değil YORUM sorulur. Tipik kökler: "...ilgili aşağıdakilerden hangisine ulaşılabilir?", "...hangisi söylenemez?", "...aşağıdaki çıkarımlardan hangisi yapılabilir?" (olumsuz-kök yaygın). I/II/III öncüllü + "Yalnız I / I ve II / I, II ve III" kombinasyon-şıklı sorular ~%15-20. Şıklar kısa-orta (~45 karakter). Cevap A-E dengeli.',
  wordquest:
    '2026 YDT-İngilizce STİLİ gözlemi: SEÇİLEN alıştırma-tipine/kategoriye SADIK KAL (vocabulary=tek-kelime veya kısa şık; grammar/cümle-tamamlama=daha uzun tam-ifade şık). Doğru cevap dağılımında belirli harfe (özellikle son şık) yığma OLMAMALI — 2026\'da E-şık belirgin az işaretlenmişti; sen dengeli dağıt. Doğal, deyimsel İngilizce; yapay-çeviri kokusu olmasın.',
  matematik:
    '2026 TYT-Matematik STİLİ (149-soru analizi, mat: 95/120 metne-ifade-edilebilir, %79): Soruların %71\'i "Buna göre..." bağlacıyla kurulur, %51\'i sayısal-sonuç ister ("...kaçtır?"); "hangisi doğrudur/olabilir" tipi %8, olumsuz-kök ("hangisi yanlıştır") %5, I/II/III öncüllü yalnızca %4 — matematikte öncül nadir, fende yaygındır. Senaryo/kişi-adı kullanımı %39 (günlük-hayat kurgusu YENİ-NESİL formatın imzası ama zorunlu değil, saf-işlem sorusu da meşru), tablo/çizelge atfı %8. Şıklar KISA ve sade (ortalama 4 karakter — tam-sayı, sade-kesir veya kök/üstel-form, örn "1/6", "8"); uzun-cümle şık YOK. Cevap dağılımı A-E DENGELİ (16/22/19/20/18) — belirli harfe yığma yapma. Formülleri düz-metin/Unicode yaz (√, ², ×, a/b); GÖRSEL-şekil/çizim gerektiren soru KURMA (platform metin-tabanlı; kitapçıklarda da soruların %21\'i şekil-bağımlıydı ve bu yüzden katalog-dışı bırakıldı — o oranın tam tersi hedeflensin, şekilsiz çözülebilir kur).',
  fen:
    '2026 TYT-Fen STİLİ (149-soru analizi, fen: 54/60 metne-ifade-edilebilir, %90): Soruların %59\'u "hangisi doğrudur/olabilir" tipi ve %39\'u I/II/III öncüllü mantık sorusu (çoğunlukla birleşirler), %17\'si olumsuz-kök ("hangisi yanlıştır/olamaz"); sayısal-sonuç isteyen soru nadir (%2) — fen matematik gibi işlem değil, SÖZEL-ANALİZ ağırlıklı. SEÇİLEN alt-alana (fizik/kimya/biyoloji) SADIK KAL — kategori-dışı konuya kayma. Şıklar orta-uzun (ortalama 20 karakter, azami ~117 — ama öncüllü sorularda kombinasyon-şıklar "Yalnız I", "I ve II" gibi KISA kalmalı). Cevap dağılımı A-E DENGELİ (12/9/11/14/8) — belirli harfe yığma yapma. Sembol/formül Unicode yaz; saf-geometri/devre/şekil gerektiren soru KURMA (platform metin-tabanlı; kitapçıklarda da soruların %10\'u şekil-bağımlıydı ve bu yüzden katalog-dışı bırakıldı).',
}

export function buildSubjectPromptAppendix(game) {
  const subjectRule = SUBJECT_GOLDEN_RULES[game] ? `\n\nALTIN KURAL: ${SUBJECT_GOLDEN_RULES[game]}` : ''
  const goldenExample = GOLDEN_EXAMPLES[game] ? `\n\nALTIN ÖRNEK:\n${GOLDEN_EXAMPLES[game]}` : ''
  const ref2026 = REF_2026_STYLE[game] ? `\n\n${REF_2026_STYLE[game]}` : ''
  return `${subjectRule}${goldenExample}${ref2026}`
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function parseExpandedTdkTokenPairs(expandedData) {
  return (expandedData?.tokens || []).map(([ascii, correct]) => [ascii, correct])
}

export function parseFixtureTdkTokenPairs(fixtureText) {
  const marker = 'forbiddenAsciiTokens: ['
  const start = String(fixtureText || '').indexOf(marker)
  const end = start >= 0 ? String(fixtureText).indexOf('\n    ],', start) : -1
  const manualBlock = start >= 0 && end > start ? String(fixtureText).slice(start, end) : ''
  return [...manualBlock.matchAll(/\[\s*'([^']+)'\s*,\s*'([^']+)'\s*\]/g)]
    .map((match) => [match[1], match[2]])
}

export function normalizeTdkTokenPairs(tokenPairs = []) {
  return [...new Map(
    tokenPairs
      .filter(([ascii, correct]) => ascii && correct && ascii !== correct)
      .map(([ascii, correct]) => [String(ascii).toLowerCase(), String(correct)])
  ).entries()]
}

export function createTdkGuard(tokenPairs = []) {
  const normalizedPairs = normalizeTdkTokenPairs(tokenPairs)
  const tokenMap = new Map(normalizedPairs)
  const tokenRegex = normalizedPairs.length > 0
    ? new RegExp(`\\b(${normalizedPairs.map(([ascii]) => escapeRegExp(ascii)).join('|')})\\b`, 'gi')
    : null

  return {
    findViolations(text) {
      if (!tokenRegex) return []

      const violations = new Set()
      tokenRegex.lastIndex = 0
      for (const match of String(text || '').matchAll(tokenRegex)) {
        const ascii = match[1].toLowerCase()
        const correct = tokenMap.get(ascii)
        if (correct) violations.add(`${ascii}->${correct}`)
      }
      return [...violations]
    },
  }
}

export function findQuestionTdkViolations(game, data, tdkGuard) {
  if (!tdkGuard) return []
  const text = game === 'wordquest'
    ? data.solution
    : `${data.question || ''} ${(data.options || []).join(' ')} ${data.solution || ''}`
  return tdkGuard.findViolations(text)
}

const FORBIDDEN_OPTION_TEXT = new Set([
  'hiçbiri',
  'hepsi',
  'yukarıdakilerden hiçbiri',
  'yukarıdakilerin hepsi',
])

// Codex #261: 'HİÇBİRİ' (Türkçe büyük-İ) veya 'Hiçbiri.' (noktalama) catch-all'ları
// düz toLowerCase + trim ile set-anahtarına dönmez (dotted-i + punctuation) → kaçar.
// Türkçe-güvenli lower (İ/I→i/ı) + noktalama-strip ile normalize et.
export function normalizeOptionText(option) {
  return String(option)
    .replace(/İ/g, 'i').replace(/I/g, 'ı')
    .toLowerCase()
    .replace(/[.,!?;:]/g, '')
    .trim()
}

// Roma etiketi hem '.' hem ')' liste-işaretiyle gelebilir (I. veya I))
const romanNumeralPrefixRe = /^\s*(?:I|II|III|IV|V|VI|VII|VIII|IX|X)[.)]\s+(.+)$/i
const premiseAnswerOptionRe = /^\s*(?:Yalnız\s+)?(?:I|II|III|IV|V|VI|VII|VIII|IX|X)(?:\s*(?:,|ve)\s*(?:I|II|III|IV|V|VI|VII|VIII|IX|X))*\s*$/i

function isLikelyPremiseBody(text) {
  const normalized = text.trim()
  const wordCount = normalized.split(/\s+/).filter(Boolean).length
  return wordCount >= 5 ||
    /(?:dır|dir|dur|dür|tır|tir|tur|tür|ar|er|ır|ir|ur|ür|maz|mez|malı|meli|olur|olmaz|artar|azalır|değişir|bağlıdır|orantılıdır)\.?$/i.test(normalized)
}

// Bir şık BİRDEN FAZLA roman rakamı içeriyorsa (ör. "I. neden-sonuç, II. amaç-sonuç")
// bu bir KARŞILAŞTIRMA-CEVABIDIR (geçerli YKS formatı: iki durumu tek şıkta eşleştirir),
// öncül-bölünmesi DEĞİL. Öncül-bölünmesi her şıkta TEK öncül taşır.
const multiRomanInOneOptionRe = /(?:^|\s)(?:I|II|III|IV|V|VI|VII|VIII|IX|X)[.)]\s.*\b(?:I|II|III|IV|V|VI|VII|VIII|IX|X)[.)]\s/i

export function hasSplitPremiseOptions(options) {
  // FP-koruma 1: herhangi bir şık çoklu-roman içeriyorsa = karşılaştırma-cevabı, bölünme değil
  if (options.some((option) => multiRomanInOneOptionRe.test(String(option)))) return false

  // FP-koruma 2 (Codex #261): gerçek öncül-bölünmesinde şıklar arasında en az bir
  // KOMBİNASYON-CEVABI ("Yalnız I", "I ve II") bulunur. Kombinasyon-cevabı yoksa,
  // roman-prefixli şıklar bir AD-LİSTESİDİR (ör. "I. Meşrutiyet'in ilanı ve ...") —
  // uzun tarihi-ad şıkları FP olarak reddedilmesin.
  const hasCombinationAnswer = options.some((option) => premiseAnswerOptionRe.test(String(option).trim()))
  if (!hasCombinationAnswer) return false

  const romanLabeledBodies = options
    .map((option) => String(option).match(romanNumeralPrefixRe)?.[1]?.trim())
    .filter(Boolean)

  return romanLabeledBodies.length >= 2 && romanLabeledBodies.some(isLikelyPremiseBody)
}

export function hasLongPremiseAnswerOptions(question, options) {
  const questionHasPremises = /(?:^|\n)\s*I\.\s/.test(question) && /(?:^|\n)\s*II\.\s/.test(question)
  return questionHasPremises && options.some((option) => String(option).length > 30 && !premiseAnswerOptionRe.test(String(option)))
}

export function validateGeneratedQuestionContent(data, { game, tdkGuard } = {}) {
  const optsNormalized = (data.options || []).map(normalizeOptionText)
  if (optsNormalized.some((option) => FORBIDDEN_OPTION_TEXT.has(option))) return 'Yasaklı şık içeriyor'

  const tdkViolations = findQuestionTdkViolations(game, data, tdkGuard)
  if (tdkViolations.length > 0) return `TDK ASCII ihlali: ${tdkViolations.slice(0, 3).join(', ')}`

  if (hasSplitPremiseOptions(data.options || [])) return 'Öncüller seçeneklere bölünemez'
  if (hasLongPremiseAnswerOptions(data.question || '', data.options || [])) return 'Öncüllü soruda şıklar çok uzun veya öncül gövdesi içeriyor'

  return null
}
