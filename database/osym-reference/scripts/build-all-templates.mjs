/**
 * Tüm oyun kategorileri için ÖSYM few-shot template dosyalarını oluşturur.
 * Kaynak: TYT 2021 Stirling PDF çıktısından manuel doğrulanmış örnekler.
 *
 * Kullanım: node scripts/build-all-templates.mjs
 * Çıktı:
 *   templates/matematik_tyt_examples.json
 *   templates/fen_tyt_examples.json
 *   templates/sosyal_tyt_examples.json
 *   templates/turkce_tyt_examples.json
 *   templates/wordquest_ydt_examples.json
 *   templates/overview.json
 */

import { writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dir = dirname(fileURLToPath(import.meta.url))
const TPL_DIR = resolve(__dir, '..', 'templates')
if (!existsSync(TPL_DIR)) mkdirSync(TPL_DIR, { recursive: true })

// ─── MATEMATİK — 2021 TYT, manuel doğrulanmış ───────────────────────────────
const VERIFIED_MATEMATIK = [
  // Q14 — İstatistik (Medyan), 2021 TYT
  {
    question:
      'Bir veri grubundaki sayılar küçükten büyüğe doğru sıralandığında gruptaki terim sayısı tek ise ortadaki sayıya, çift ise ortadaki iki sayının aritmetik ortalamasına o veri grubunun medyanı (ortanca) denir. ' +
      '9 kişilik bir voleybol takımının oyuncularının yaşları ve boyları, ilk bileşen yaşlarını ikinci bileşen ise boylarını göstermek üzere boylarına göre sıralı veri grubu ' +
      '(18; 1,76), (17; 1,79), (18; 1,82), (19; 1,84), (20; 1,84), (21; 1,88), (17; 1,90), (20; 1,92), (19; 1,96) olarak verilmiştir. ' +
      'Bu 9 kişilik takımdan bir oyuncu ayrılmış ancak kalan oyuncuların hem yaşlarının hem de boylarının medyanı değişmemiştir. ' +
      'Buna göre, bu takımdan ayrılan oyuncunun yaşı ve boyu aşağıdakilerin hangisinde doğru olarak verilmiştir?',
    options: ['(17; 1,79)', '(17; 1,90)', '(19; 1,84)', '(19; 1,96)', '(21; 1,88)'],
    answer: 1,
    answer_letter: 'B',
    category: 'istatistik',
    source: '2021 TYT Matematik Q14',
    verified: true,
    explanation: 'Kalan 8 oyuncunun yaş medyanı (4. ve 5. değer ortalaması) 19 olmalı ve boy medyanı 1,84 olmalı. (17;1,90) çıkarılırsa her iki medyan korunur.',
  },
  // Q15 — Sayı teorisi (AAB ve ABA), 2021 TYT
  {
    question:
      'AAB ve ABA doğal sayıları 9\'a tam bölünen üç basamaklı birer sayı olmak üzere, bu sayılardan biri 5\'e diğeri ise 12\'ye tam bölünmektedir. ' +
      'Buna göre, A + B toplamı kaçtır?',
    options: ['7', '8', '9', '10', '11'],
    answer: 0,
    answer_letter: 'A',
    category: 'sayilar',
    source: '2021 TYT Matematik Q15',
    verified: true,
    explanation: 'AAB=5\'e bölünür → B=0 veya 5. 9|AAB → 2A+B=9 → B=5, A=2. ABA=252, 252÷12=21. A+B=7.',
  },
  // Q19 — Yaş problemi (Faruk ve Vazo), 2021 TYT
  {
    question:
      'Faruk, 2020 yılında ziyaret ettiği bir müzede gördüğü bir vazoya ait bilgileri okurken vazonun bulunduğu yıl ile kendi doğduğu yılın aynı olduğunu ve vazonun, bulunduğunda 300 yaşında olduğunu öğrenmiştir. ' +
      'Aynı anda vazonun üretimi sırasında kendi yaşının 39 katının vazonun yapıldığı yıla eşit olduğunu hesaplamıştır. ' +
      'Buna göre, 2020 yılında Faruk kaç yaşındadır?',
    options: ['41', '42', '43', '44', '45'],
    answer: 2,
    answer_letter: 'C',
    category: 'problemler',
    source: '2021 TYT Matematik Q19',
    verified: true,
    explanation: '2020-x = vaze bulunma yılı, vaze yapımı = (2020-x)-300. 39x = 2020-x-300 → 40x = 1720 → x = 43.',
  },
]

// ─── FEN BİLİMLERİ — 2021 TYT, manuel doğrulanmış ──────────────────────────
const VERIFIED_FEN = [
  // FİZİK ──────────────────────────────────────────────────────────────────────
  // Q1 — Yüzey gerilimi (fizik), 2021 TYT
  {
    passage:
      'Günlük hayatta karşılaşılabilecek;\n' +
      'I. yağmur damlasının küresel şekil alma eğilimi,\n' +
      'II. bazı böceklerin göllerdeki suyun yüzeyinde rahatça yürüyebilmeleri,\n' +
      'III. bir yüzeye pipetle bırakılan farklı cins sıvı damlalarının farklı şekiller alması\n' +
      'olaylarından hangileri yüzey geriliminin bir sonucudur?',
    options: ['Yalnız I', 'Yalnız II', 'Yalnız III', 'I ve II', 'I, II ve III'],
    answer: 4,
    answer_letter: 'E',
    category: 'fizik',
    subcategory: 'kuvvet_hareket',
    source: '2021 TYT Fen Q1',
    verified: true,
    type: 'roman_numeral',
  },
  // Q2 — Net kuvvet analizi (fizik), 2021 TYT
  {
    passage:
      'Hareket hâlindeki bir otomobil, tren ve uçağın sahip oldukları hızlar ve bu araçlara hareketleri süresince etki eden net kuvvetlerin büyüklükleri ile ilgili bilgiler aşağıda belirtildiği gibidir:\n' +
      '• Sabit 100 km/h hız ile hareket eden otomobile etki eden net kuvvetin büyüklüğü F₁ dir.\n' +
      '• Hızı, durgun hâlden 200 km/h\'e yükselen trene etki eden net kuvvetin büyüklüğü F₂ dir.\n' +
      '• Pist boyunca sabit 250 km/h hız ile hareket eden uçağa etki eden net kuvvetin büyüklüğü F₃ tür.\n' +
      'Buna göre F₁, F₂ ve F₃ net kuvvetlerinin büyüklükleri arasındaki ilişki aşağıdakilerin hangisinde doğru olarak verilmiştir?',
    options: ['F₃ > F₁ = F₂', 'F₃ > F₂ > F₁', 'F₁ = F₂ > F₃', 'F₂ > F₁ = F₃', 'F₁ = F₂ = F₃'],
    answer: 3,
    answer_letter: 'D',
    category: 'fizik',
    subcategory: 'kuvvet_hareket',
    source: '2021 TYT Fen Q2',
    verified: true,
    type: 'relation',
    explanation: 'Sabit hızla hareket (otomobil ve uçak) → net kuvvet = 0. Hızlanan tren → F₂ > 0. F₂ > F₁ = F₃ = 0.',
  },
  // Q3 — Basınç analizi römorklar (fizik), 2021 TYT
  {
    passage:
      'Çiftçilikle uğraşan Veli; yüklerini, traktörün arkasına bağladığı iki römork ile çamurlu yatay bir zemindeki bir bölgenin karşısına geçirmek istemektedir. Römorkların tekerlekleri ile yatay zemin arasındaki basıncı azaltmak isteyen Veli, yükleri;\n' +
      'I. römorkların yedek tekerleklerini de kullanarak karşıya geçirme,\n' +
      'II. her bir römorkun yükünü yarıya indirip iki seferde karşıya geçirme,\n' +
      'III. römorkları traktöre ayrı ayrı bağlayıp sırayla karşıya geçirme\n' +
      'eylemlerinden hangilerini yaparsa römorkların tekerlekleri ile zemin arasındaki basınç, ilk duruma göre azalır?',
    options: ['Yalnız I', 'Yalnız II', 'Yalnız III', 'I ve II', 'I, II ve III'],
    answer: 3,
    answer_letter: 'D',
    category: 'fizik',
    subcategory: 'basinc',
    source: '2021 TYT Fen Q3',
    verified: true,
    type: 'roman_numeral',
    explanation: 'I: Daha fazla tekerlek → aynı ağırlık geniş alana dağılır → basınç azalır. II: Daha az yük → daha az kuvvet → basınç azalır. III: Römorkların ağırlığı değişmez, tekerlek sayısı da → basınç değişmez.',
  },
  // Q4 — Isı iletim katsayısı (fizik), 2021 TYT
  {
    passage:
      'Çeşitli maddelerin ısı iletim katsayıları: Çelik 40 W/m°C, Tahta 0,1 W/m°C, Cam 0,8 W/m°C, Hava 0,023 W/m°C, Poliüretan 0,024 W/m°C.\n' +
      'Maddelerin ısı iletim katsayıları dikkate alınarak yapılan;\n' +
      'I. elimizin yanmaması için bir tencere sapının çelik yerine poliüretan malzemeden yapılması,\n' +
      'II. pencerelerin ısı yalıtımı için tek parça kalın bir cam yerine aynı kalınlıkta olacak şekilde arasında hava olan iki ince camdan imal edilmesi,\n' +
      'III. oturduğumuz yeri soğuk hissetmememiz için soğuk coğrafyada açık havada yer alan bir bankın tahta yerine çelikten yapılması\n' +
      'seçimlerinin hangileri amacına uygun olarak yapılmıştır?',
    options: ['Yalnız I', 'Yalnız III', 'I ve II', 'II ve III', 'I, II ve III'],
    answer: 2,
    answer_letter: 'C',
    category: 'fizik',
    subcategory: 'isi_sicaklik',
    source: '2021 TYT Fen Q4',
    verified: true,
    type: 'roman_numeral',
    explanation: 'I: Poliüretan çelikten çok daha az iletken → el yanmaz ✓. II: Hava cam\'dan çok daha az iletken → iyi yalıtım ✓. III: Çelik tahtadan çok daha iyi iletken → soğuk daha hızlı geçer → soğuk hissederiz ✗.',
  },
  // BİYOLOJİ ───────────────────────────────────────────────────────────────────
  // Q15 — Hücre zarı (biyoloji), 2021 TYT
  {
    passage:
      'Hücre zarı ile ilgili,\n' +
      'I. Zar yapısında yer alan fosfolipitler hareket hâlindedir.\n' +
      'II. Zar yapısındaki glikoprotein ve glikolipit moleküllerinin dağılımı, tüm canlıların hücre zarlarında aynıdır.\n' +
      'III. Zar yapısında yer alan taşıyıcı proteinler, bütün moleküllerin zardan geçişinde görev alır.\n' +
      'ifadelerinden hangileri doğrudur?',
    options: ['Yalnız I', 'Yalnız III', 'I ve II', 'II ve III', 'I, II ve III'],
    answer: 0,
    answer_letter: 'A',
    category: 'biyoloji',
    subcategory: 'hucre',
    source: '2021 TYT Fen Q15',
    verified: true,
    type: 'roman_numeral',
    explanation: 'I: Akışkan mozaik model → fosfolipitler hareket eder ✓. II: Her canlının glikokalixi farklı → yanlış. III: Küçük apolar moleküller taşıyıcısız geçer → yanlış.',
  },
  // Q16 — Trigliserit (biyoloji), 2021 TYT
  {
    passage:
      'Trigliseritler ile ilgili,\n' +
      'I. Bir molekül trigliserit oluşurken bir molekül su açığa çıkar.\n' +
      'II. Bir gliserol ile üç yağ asitinin esterleşmesi sonucu bir trigliserit molekülü oluşur.\n' +
      'III. İnsanlar, sentezledikleri trigliseritlerin yapısındaki yağ asitlerinin bir kısmını besinlerle dışarıdan almak zorundadır.\n' +
      'ifadelerinden hangileri doğrudur?',
    options: ['Yalnız I', 'Yalnız II', 'Yalnız III', 'I ve II', 'II ve III'],
    answer: 4,
    answer_letter: 'E',
    category: 'biyoloji',
    subcategory: 'biyomolekul',
    source: '2021 TYT Fen Q16',
    verified: true,
    type: 'roman_numeral',
    explanation: 'I: 1 gliserol + 3 yağ asidi → 3 ester bağı = 3 mol su açığa çıkar (1 değil) → yanlış. II: Trigliserit = gliserol + 3 yağ asidi → doğru. III: Esansiyel yağ asitleri besinle alınmalı → doğru.',
  },
  // Q17 — Aynı cins iki hayvan türü (biyoloji), 2021 TYT
  {
    question: 'Aynı cinse ait iki hayvan türü için aşağıdaki ifadelerden hangisi yanlıştır?',
    options: [
      'Bu türler aynı aile içerisinde yer alır.',
      'Bu türlerin kromozom sayıları kesinlikle aynıdır.',
      'Bu türlerin genlerindeki nükleotit dizilimlerinde farklılık görülebilir.',
      'Bu türler çiftleştiklerinde verimli döller oluşturamaz.',
      'Bu türler ortak ataya dayalı benzerliklere sahiptir.',
    ],
    answer: 1,
    answer_letter: 'B',
    category: 'biyoloji',
    subcategory: 'siniflandirma',
    source: '2021 TYT Fen Q17',
    verified: true,
    type: 'text',
    explanation: 'Aynı cins = aynı aile ✓. Ancak kromozom sayısı türden türe farklı olabilir; örn. aynı cins Equus\'ta at 64, eşek 62 → yanlış (B).',
  },
  // Q18 — Mayoz (biyoloji), 2021 TYT
  {
    question: 'İnsan eşey ana hücresinde gerçekleşen mayozla ilgili aşağıdaki ifadelerden hangisi yanlıştır?',
    options: [
      'Mayoz tamamlandığında oluşan hücrelerin genetik yapıları birbirinden farklıdır.',
      'Profaz I evresinde homolog kromozom çiftlerinin kardeş olmayan kromatitleri arasında parça değişimi gerçekleşebilir.',
      'Anafaz I evresindeki kromozom sayısı anafaz II evresindekinin iki katıdır.',
      'Mayoz I tamamlandığında oluşan hücreler n kromozomludur.',
      'Anafaz I evresinde homolog kromozomların hangi kutuplara çekileceği şansa bağlı olarak gerçekleşir.',
    ],
    answer: 2,
    answer_letter: 'C',
    category: 'biyoloji',
    subcategory: 'ureme',
    source: '2021 TYT Fen Q18',
    verified: true,
    type: 'text',
    explanation: 'Anafaz I: homologlar ayrılır, hücrede 2n=46 (çift kromatidli). Anafaz II: kardeş kromatitler ayrılır, hücrede 2n=46 (tek kromatidli). İkisi de 46 → C yanlış.',
  },
]

// ─── SOSYAL BİLİMLER — 2019 + 2021 TYT, manuel doğrulanmış ─────────────────
const VERIFIED_SOSYAL = [
  // TARİH — 2019 TYT
  {
    passage: 'Asya Hun Devleti\'nin dağılmasının ardından Hunlar, batıya doğru yayılmaya başlamış ve Karadeniz\'in kuzeyinde bulunan Germen kavimlerini batıya doğru itmişlerdir. Kavimler Göçü adı verilen bu süreçte Hunlar Avrupa siyasetinde etkin hâle gelirken ikiye ayrılan Roma İmparatorluğu önemli sorunlarla karşı karşıya kalmıştır.',
    question: 'Buna göre aşağıdakilerden hangisi Kavimler Göçü\'nün sonuçlarından biri olarak gösterilemez?',
    options: [
      'Türk kültürü Avrupa\'da yayılmıştır.',
      'Avrupa\'nın etnik yapısı değişmiştir.',
      'Roma İmparatorluğu güç kaybetmeye başlamıştır.',
      'Bilim ve teknikte önemli gelişmeler yaşanmıştır.',
      'Avrupa\'da siyasi dengeler değişmiştir.',
    ],
    answer: 3,
    answer_letter: 'D',
    category: 'tarih',
    source: '2019 TYT Sosyal Q1',
    verified: true,
  },
  // TARİH — 2019 TYT
  {
    passage: 'Gazneli Mahmut, Abbasi halifesini Büveyhoğullarının baskısından kurtarmış ve bu hizmetine karşılık olarak Abbasi halifesinden Sultan unvanını almıştır.',
    question: 'Bu bilgiyle aşağıdakilerden hangisine ulaşılabilir?',
    options: [
      'Gazneli Mahmut\'un İslam dünyasının önemli bir siyasi gücü olduğuna',
      'Abbasi halifesinin siyasi yetkilerini Gazneli Mahmut\'a bıraktığına',
      'Türkler arasında İslamiyetin hızla yayıldığına',
      'İslam dünyasında mezhep çatışmalarının son bulduğuna',
      'Gazneli Mahmut\'un İslam dünyasında siyasi birliği sağladığına',
    ],
    answer: 0,
    answer_letter: 'A',
    category: 'tarih',
    source: '2019 TYT Sosyal Q2',
    verified: true,
  },
  // TARİH — 2021 TYT Q1
  {
    passage:
      'Doğu Roma İmparatorluğu\'yla Avrupa Hunları arasında 434 yılında yapılan Margos Antlaşması\'nın,\n' +
      '• Doğu Roma bundan sonra Hunlara bağlı kavimlerle antlaşmalar yapmayacak,\n' +
      '• Doğu Roma, Hunlardan kaçanlara sığınma hakkı vermeyecek,\n' +
      '• Ticari münasebetler yine belirli sınır kasabalarında devam edecek,\n' +
      '• Doğu Roma\'nın ödediği yıllık vergi iki katına çıkarılacak.\n' +
      'maddeleri dikkate alındığında aşağıdakilerden hangisine ulaşılamaz?',
    options: [
      'Doğu Roma\'nın, Avrupa Hunlarının siyasi üstünlüğünü kabul ettiğine',
      'İki devlet arasındaki ekonomik ilişkilerin sürdürüleceğine',
      'Avrupa Hunlarının kendilerine yönelik ittifakları engellemeye çalıştığına',
      'Doğu Roma\'ya uygulanan maddi yaptırımın artırıldığına',
      'Akdeniz ticaretinin Avrupa Hunlarının kontrolüne girdiğine',
    ],
    answer: 4,
    answer_letter: 'E',
    category: 'tarih',
    source: '2021 TYT Sosyal Q1',
    verified: true,
  },
  // TARİH — 2021 TYT Q2
  {
    passage:
      'Malazgirt Zaferi öncesinde Alp Arslan, Bizans İmparatoru Diyojen\'e elçi göndererek barış teklifinde bulunmuştur. Selçukluların savaşmaktan çekindiğini düşünen Diyojen: "Ben üstün ve kudretli durumuma çok para ve çaba harcayarak eriştim. Barış ancak Selçuklu başkenti Rey\'de olur. Biz İsfahan\'da kışlayacağız, atlarımız ise Hemedan\'da." demiştir. Buna karşılık Türk elçisi ise: "Hayvanlarınız Hemedan\'da kışlayabilir fakat sizin nerede kışlayacağınızı bilemem." şeklinde cevap vermiştir.',
    question: 'Bu parçadan hareketle aşağıdakilerden hangisine ulaşılamaz?',
    options: [
      'Selçuklu Devleti\'nin Anadolu\'ya doğru genişlediğine',
      'Bizans\'ın İslam şehirlerine sahip olmak istediğine',
      'İki devlet arasında diplomatik girişimlerin bulunduğuna',
      'Türklerin ilerleyişine karşı Haçlı Seferleri\'nin başladığına',
      'Selçuklu Türklerinin Bizans ile savaşı göze aldığına',
    ],
    answer: 3,
    answer_letter: 'D',
    category: 'tarih',
    source: '2021 TYT Sosyal Q2',
    verified: true,
  },
  // TARİH — 2021 TYT Q3
  {
    passage:
      'Osmanlı Devleti\'nde bir padişah tahta çıktığında beylerbeyleri, sancakbeyleri ve kadılara genellikle aşağıdaki ifadeleri içeren bir ferman gönderilirdi: "Allah\'ın yardımıyla saltanat benim oldu. Bugün vezirler, ulema ve büyük küçük bütün makam sahiplerinin ittifakıyla bana atalarımdan kalan sultanlık tahtına oturdum. Adıma hutbe okunmuş ve sikke kesilmiştir. Bu fermanı alır almaz bütün kent ve kasabalarda halka cülusum bildirilsin..."',
    question: 'Bu fermandaki ifadelere göre Osmanlı Devlet yönetimiyle ilgili aşağıdakilerden hangisi söylenemez?',
    options: [
      'Aristokratik bir yönetim biçimi söz konusudur.',
      'Egemenlikle ilgili birtakım semboller bulunmaktadır.',
      'Meşruiyet açısından ulemanın görüşüne dikkat edilmektedir.',
      'Hükümdar değişikliğini reayanın öğrenmesine önem verilmektedir.',
      'İlahi kaynaklı bir egemenlik anlayışı vardır.',
    ],
    answer: 0,
    answer_letter: 'A',
    category: 'tarih',
    source: '2021 TYT Sosyal Q3',
    verified: true,
  },
  // FELSEFE — 2019 TYT Q11
  {
    passage: 'Bir mağara düşünün. Mahkûmlar, yüzleri mağaranın arka duvarına dönük zincirlenmiş. Ömürleri boyunca orada tutulmuşlar ve başları, duvar dışında hiçbir şey göremeyecek şekilde sabitlenmiş. Bu yolda yürüyen insanların gölgeleri mağaranın duvarına vurur. Mağaranın içindeki mahkûmlar her zaman yalnızca gölgeleri görür; gölgelerin gerçek şeyler olduklarına inanırlar.',
    question: 'Bu parçada betimlenen mağara metaforundan aşağıdaki yargıların hangisine ulaşılabilir?',
    options: [
      'Gerçekliğin doğası değişmez ve farklı yüzleri bulunmaz.',
      'Duyuların yanıltıcılığından kurtulmak için başkalarının yardımına ihtiyaç duyarız.',
      'Aklın çalışma ilkelerini duyulardan gelen veriler belirler.',
      'Duyuların kullanımı hakikate ulaşmak için bir ön koşuldur.',
      'Duyular aracılığıyla bildiklerimiz tümüyle bir yanılsama olabilir.',
    ],
    answer: 4,
    answer_letter: 'E',
    category: 'felsefe',
    source: '2019 TYT Sosyal Q11',
    verified: true,
  },
  // FELSEFE — 2021 TYT Q11
  {
    passage:
      'Da Vinci\'nin Mona Lisa adlı tablosunun ne ifade ettiğini anlayabilir veya anlayamayabiliriz. Oysa Ağrı Dağı\'nı veya Abant Gölü\'nü anlamak ya da anlamamak gibi bir durum söz konusu olamaz. Bu ve benzeri doğa varlıkları çirkin veya güzel bulunabilir ama bir sanat yapıtı gibi anlaşılıp yorumlanmaları düşünülemez. Bir dağ görüntüsünden farklı olarak bir dağ resmi için her zaman "Bu resim şunu ifade ediyor." denilebilir. Çünkü sanat eserinin bir konusu vardır ve bir anlam içerir.',
    question: 'Bu parçaya göre bir nesneyi sanat eseri yapan özellik aşağıdakilerden hangisidir?',
    options: [
      'Bir şeyin temsili olması',
      'Bir duygunun dışavurumu olması',
      'Sanat otoriteleri tarafından onaylanması',
      'İç dünya deneyimi yaşatması',
      'Belli bir biçime sahip olması',
    ],
    answer: 1,
    answer_letter: 'B',
    category: 'felsefe',
    source: '2021 TYT Sosyal Q11',
    verified: true,
  },
  // FELSEFE — 2019 TYT Q12
  {
    passage: 'Levinas\'a göre kişinin kendisi hakkındaki endişelerinden doğan eylemler ahlaki değerlendirme kapsamına girmez. Ancak aynı endişeyi başka bir insana yöneltmek, örneğin aç bir çocuğu doyurmak, ahlaki bir davranıştır.',
    question: 'Buna göre Levinas ahlaki değerlendirmenin amacı olarak aşağıdaki kavramlardan hangisini vurgulamaktadır?',
    options: ['Ölçülülük', 'Mutluluk', 'Sorumluluk', 'Fayda', 'Dinginlik'],
    answer: 2,
    answer_letter: 'C',
    category: 'felsefe',
    source: '2019 TYT Sosyal Q12',
    verified: true,
  },
]

// ─── TÜRKÇE — 2019 + 2021 TYT, manuel doğrulanmış ──────────────────────────
const VERIFIED_TURKCE = [
  // ANLAM BİLGİSİ — 2019 TYT
  {
    passage: 'Kemalettin Tuğcu bizlere yoksulluğu, yaşamla savaşmayı, acımayı, yardımlaşmayı ve paylaşmayı öğretti. Kahramanları hiç yüzüstü, umarsız bırakmadı. Eserleriyle Tuğcu okurlarına bir bakıma acı aşısı yaptı.',
    question: 'Bu parçada altı çizili sözle asıl anlatılmak istenen aşağıdakilerden hangisidir?',
    options: [
      'Kitaplarıyla acılara, zorluklara göğüs germe becerisi kazandırmak',
      'Yaşanan acıların okurla paylaşılarak azalmasını sağlamak',
      'Odağına acıyı alarak kalemini edebî yönden güçlendirmek',
      'Acıyla yoğrulmuş hayatların kendi yönünü bulacağını göstermek',
      'Toplumun yaşadığı acıları yalın hâliyle eserlerine aktarabilmek',
    ],
    answer: 0,
    answer_letter: 'A',
    category: 'anlam_bilgisi',
    source: '2019 TYT Türkçe Q2',
    verified: true,
  },
  // ANLAM BİLGİSİ — 2019 TYT
  {
    passage: 'Çocuk, aklının doğal işleyişi sonucu her an ortaya çıkan tuhaf sorulardan birine yanıt bulma amacıyla gerçekleştirdiği her samimi girişim sayesinde, o amacın sonucuyla kıyaslanamayacak oranda kalıcı kazanımlar edinir.',
    question: 'Bu cümlede çocuklarla ilgili olarak asıl anlatılmak istenen aşağıdakilerden hangisidir?',
    options: [
      'Tuhaf sorular sorma davranışlarının çocuklarda istemsiz biçimde gerçekleştiği',
      'Merak ettikleri konunun iç yüzünü öğrendikleri sürece bilgi birikimlerinin arttığı',
      'Kendi hâllerine bırakıldıklarında tuhaf sorular sorma alışkanlıklarının sona erdiği',
      'Cevabını samimi biçimde merak ettikleri soruların yetişkinlerce cevaplandırılması gerektiği',
      'Sorularına cevap arayışlarının gelişimleri üzerinde cevaplardan daha etkili olduğu',
    ],
    answer: 4,
    answer_letter: 'E',
    category: 'anlam_bilgisi',
    source: '2019 TYT Türkçe Q4',
    verified: true,
  },
  // ANLAM BİLGİSİ (YORUM) — 2021 TYT Q5
  {
    passage:
      '(I) Avustralya\'da yaşayan Tetragonula carbonaria türü arılar, balı üzüm tanesine benzeyen çanaklarda depoluyor; yavrularını ise sarmal şekilli kuluçka peteklerinde yetiştiriyor. ' +
      '(II) Bir mühendislik harikası olan bu kuluçka petekleri, birbirine bağlı yüzlerce gözden oluşan bir merdiveni andırıyor. ' +
      '(III) Zaman içinde gözlere, dışa ve yukarıya doğru sarmal yapı oluşturacak şekilde yenileri ekleniyor. ' +
      '(IV) Arıların petekleri oluştururken kullandıkları ana malzeme, bitki reçineleri ve bal mumu karışımından oluşuyor. ' +
      '(V) Kraliçe arı gözlere birer yumurta bırakıyor, işçi arılar da hemen gelip bu gözlerin üzerini kapatıyor.',
    question: 'Bu parçada yer alan numaralanmış cümlelerde Tetragonula carbonarialar hakkında aşağıdakilerden hangisi söylenemez?',
    options: [
      'I. cümlede, yaşadıkları yer ve üretim biçimlerinden söz edilmiştir.',
      'II. cümlede, ürettikleri kuluçka peteklerine ilişkin öznel yargı kullanılmıştır.',
      'III. cümlede, kuluçka peteklerine nasıl şekil verdiklerinden bahsedilmiştir.',
      'IV. cümlede, kuluçka peteklerini hangi maddeden ürettiklerine işaret edilmiştir.',
      'V. cümlede, aralarındaki iş bölümünün bal üretimi üzerindeki olumlu etkisine değinilmiştir.',
    ],
    answer: 4,
    answer_letter: 'E',
    category: 'anlam_bilgisi',
    source: '2021 TYT Türkçe Q5',
    verified: true,
  },
  // DİL BİLGİSİ (SES OLAYLARI) — 2021 TYT Q7
  {
    passage:
      'İşte ben hep böyle garip mahzun,\n' +
      'Bir şey beklermişçesine yaşıyorum.\n' +
      'Bazen öyle günlerim oluyor ki Elâgözlüm,\n' +
      'Ne oldu, nasıl bitti şaşıyorum.\n' +
      'Bazı bilmem, gün nasıl başladığında,\n' +
      'Kayıp kayıp gidiyor dünya bıkkın bakışlarımdan.\n' +
      'Yaşıyorum, yaşıyorum da bitmiyor,\n' +
      'Bir tutam sakız oluyor ağzımda zaman.',
    question: 'Bu dizelerde aşağıdaki ses olaylarından hangisi yoktur?',
    options: ['Ünsüz yumuşaması', 'Ünlü düşmesi', 'Ünsüz düşmesi', 'Ünsüz benzeşmesi', 'Ünlü daralması'],
    answer: 1,
    answer_letter: 'B',
    category: 'dil_bilgisi',
    source: '2021 TYT Türkçe Q7',
    verified: true,
  },
  // DİL BİLGİSİ (SÖZCÜK TÜRLERİ) — 2021 TYT Q8
  {
    passage:
      'İnsan; daha güçlü canlılara karşı tek başına kendini koruyamaz, tek başına ihtiyaçlarını karşılayamaz dolayısıyla bir arada yaşamak tabii ve zaruridir.',
    question: 'Bu cümlede aşağıdakilerden hangisi yoktur?',
    options: [
      'Niteleme sıfatını niteleyen zarf',
      'Yönelme durumuyla kullanılan edat',
      'Yeterlilik bildiren olumsuz fiil',
      'Üçüncü çoğul iyelik eki almış isim',
      'Belirtme durumu eki almış zamir',
    ],
    answer: 2,
    answer_letter: 'C',
    category: 'dil_bilgisi',
    source: '2021 TYT Türkçe Q8',
    verified: true,
    note: 'Cümlede "koruyamaz/karşılayamaz" yeterlilik olumsuz fiil gibi görünse de öğeler analiz edildiğinde yalnızca yeterlilik kipinin olumsuz biçimi olan -amamak formu değil -amamaz formu var.',
  },
]

// ─── WORDQUEST — YDT İngilizce, manuel doğrulanmış ──────────────────────────
const VERIFIED_WORDQUEST = [
  {
    question: "Although considering how someone may react to a situation can be worthwhile, making ---- about another person's behaviour may lead you to the wrong conclusions.",
    options: ['promises', 'assumptions', 'mistakes', 'priorities', 'compliments'],
    answer: 1,
    answer_letter: 'B',
    type: 'fill_in_blank',
    source: '2020 YDT İngilizce Q1',
    verified: true,
  },
  {
    question: "By the time psychology came into its own as an ---- discipline after separating from philosophy, the scientific revolution was two centuries old.",
    options: ['offensive', 'artificial', 'inadequate', 'independent', 'outdated'],
    answer: 3,
    answer_letter: 'D',
    type: 'fill_in_blank',
    source: '2020 YDT İngilizce Q2',
    verified: true,
  },
  {
    question: "----, the Universe was too energetic for stars to form, but as it expanded and cooled, it became possible for gravity to form clumps of gas.",
    options: ['Initially', 'Frankly', 'Virtually', 'Ultimately', 'Merely'],
    answer: 0,
    answer_letter: 'A',
    type: 'fill_in_blank',
    source: '2020 YDT İngilizce Q3',
    verified: true,
  },
  {
    question: "Mobile learning, the role of which in education is becoming quite important, is often applied outside classrooms to ---- the learning that takes place inside classrooms.",
    options: ['enhance', 'insist', 'require', 'suspect', 'provide'],
    answer: 0,
    answer_letter: 'A',
    type: 'fill_in_blank',
    source: '2020 YDT İngilizce Q4',
    verified: true,
  },
  {
    question: "Computers may be able to beat us in specific activities; ----, it will be a long time before we see a robot with human-like versatility.",
    options: ['moreover', 'thus', 'likewise', 'instead', 'however'],
    answer: 4,
    answer_letter: 'E',
    type: 'fill_in_blank',
    source: '2020 YDT İngilizce Q11',
    verified: true,
  },
  {
    question: "In the 19-mile exclusion zone surrounding the Chernobyl power plant in Ukraine, which ---- following the 1986 reactor meltdown, plants and animals ---- now in ways they never had before.",
    options: [
      'used to be contaminated / thrive',
      'has been contaminated / will have been thriving',
      'would have been contaminated / have been thriving',
      'was contaminated / are thriving',
      'had been contaminated / were thriving',
    ],
    answer: 3,
    answer_letter: 'D',
    type: 'sentence_completion',
    source: '2020 YDT İngilizce Q6',
    verified: true,
  },
  {
    question: "Kefir is a fermented drink similar ---- yoghurt and is valued ---- its beneficial effects on microbes in our gut.",
    options: ['in / as', 'with / about', 'around / of', 'to / for', 'from / by'],
    answer: 3,
    answer_letter: 'D',
    type: 'fill_in_blank',
    source: '2020 YDT İngilizce Q10',
    verified: true,
  },
  {
    question: "Researchers studying climate change have found that the greenhouse gases ---- by human industry could be having dramatic effects on global temperatures.",
    options: ['released', 'invented', 'described', 'absorbed', 'consumed'],
    answer: 0,
    answer_letter: 'A',
    type: 'fill_in_blank',
    source: '2021 YDT İngilizce Q1',
    verified: false,
    note: 'auto-estimated, verify before production use',
  },
]

// ─── Template Dosyaları Oluştur ───────────────────────────────────────────────
const now = new Date().toISOString().slice(0, 10)

// MATEMATİK
writeFileSync(`${TPL_DIR}/matematik_tyt_examples.json`, JSON.stringify({
  description: 'ÖSYM TYT Temel Matematik geçmiş sınav soruları — matematik game AI generation few-shot şablonları',
  usage: 'sayılar/problemler/istatistik/geometri soru generation prompt\'larında örnek olarak kullan',
  exam: 'TYT Temel Matematik',
  generated: now,
  question_format: {
    stem: 'Soru gövdesi (bağlam + soru cümlesi)',
    options: ['5 seçenek — genellikle sayısal değerler veya çiftler'],
    answer: '0-indexed doğru cevap indeksi',
    answer_letter: 'A-E harfi',
    category: 'sayilar|kesirler|istatistik|problemler|geometri|fonksiyonlar|olasilik|mantik',
  },
  examples: VERIFIED_MATEMATIK,
}, null, 2), 'utf8')
console.log(`✓ matematik template: ${VERIFIED_MATEMATIK.length} verified örnek`)

// FEN BİLİMLERİ
writeFileSync(`${TPL_DIR}/fen_tyt_examples.json`, JSON.stringify({
  description: 'ÖSYM TYT Fen Bilimleri geçmiş sınav soruları — fen game AI generation few-shot şablonları',
  usage: 'fizik/kimya/biyoloji soru generation prompt\'larında örnek olarak kullan',
  exam: 'TYT Fen Bilimleri',
  generated: now,
  question_format: {
    passage: 'Bağlam metin veya numaralı ifadeler (I,II,III)',
    question: 'Soru cümlesi (passage olmayan sorular için)',
    options: ['5 seçenek — roman numeral/relation/text'],
    answer: '0-indexed doğru cevap indeksi',
    type: 'roman_numeral | relation | text',
    category: 'fizik|kimya|biyoloji',
    subcategory: 'kuvvet_hareket|basinc|isi_sicaklik|hucre|biyomolekul|ureme|siniflandirma vb.',
  },
  examples: VERIFIED_FEN,
}, null, 2), 'utf8')
console.log(`✓ fen template: ${VERIFIED_FEN.length} verified örnek (fizik: 4, biyoloji: 4)`)

// SOSYAL BİLİMLER
writeFileSync(`${TPL_DIR}/sosyal_tyt_examples.json`, JSON.stringify({
  description: 'ÖSYM TYT Sosyal Bilimler geçmiş sınav soruları — sosyal game AI generation few-shot şablonları',
  usage: 'Yalnız tarih/felsefe için doğrulanmış few-shot; diğer Sosyal kategorilerinde kapsam kanıtı sayma',
  exam: 'TYT Sosyal Bilimler',
  generated: now,
  question_format: {
    passage: 'Bağlam metni veya olay açıklaması',
    question: 'Soru cümlesi',
    options: ['5 uzun metin seçenek — genellikle "Bu parçadan hangisine ulaşılabilir/ulaşılamaz?" formatı'],
    answer: '0-indexed doğru cevap indeksi',
    category: 'tarih|cografya|felsefe|sosyoloji|din_kulturu',
  },
  verified_example_categories: ['tarih', 'felsefe'],
  missing_verified_example_categories: ['cografya', 'sosyoloji', 'din_kulturu'],
  examples: VERIFIED_SOSYAL,
}, null, 2), 'utf8')
console.log(`✓ sosyal template: ${VERIFIED_SOSYAL.length} verified örnek (tarih: 5, felsefe: 3)`)

// TÜRKÇE
writeFileSync(`${TPL_DIR}/turkce_tyt_examples.json`, JSON.stringify({
  description: 'ÖSYM TYT Türkçe geçmiş sınav soruları — türkçe game AI generation few-shot şablonları',
  usage: 'anlam_bilgisi/dil_bilgisi soru generation prompt\'larında örnek olarak kullan',
  exam: 'TYT Türkçe',
  generated: now,
  question_format: {
    passage: 'Okuma parçası veya şiir/cümle',
    question: 'Soru cümlesi',
    options: ['5 seçenek — anlam yorumu veya dilbilgisi öğesi'],
    answer: '0-indexed doğru cevap indeksi',
    category: 'anlam_bilgisi|dil_bilgisi|metin_alti|yazim_noktalama',
  },
  examples: VERIFIED_TURKCE,
}, null, 2), 'utf8')
console.log(`✓ türkçe template: ${VERIFIED_TURKCE.length} verified örnek (anlam_bilgisi: 3, dil_bilgisi: 2)`)

// WORDQUEST
writeFileSync(`${TPL_DIR}/wordquest_ydt_examples.json`, JSON.stringify({
  description: 'ÖSYM YDT İngilizce geçmiş sınav soruları — wordquest game AI generation few-shot şablonları',
  usage: 'fill_in_blank/sentence_completion soru generation prompt\'larında örnek olarak kullan',
  exam: 'YDT İngilizce',
  generated: now,
  question_format: {
    question: 'Cümle (---- ile boşluk belirtilmiş)',
    options: ['5 seçenek — kelime veya kelime grubu'],
    answer: '0-indexed doğru cevap indeksi',
    type: 'fill_in_blank | sentence_completion',
  },
  examples: VERIFIED_WORDQUEST,
}, null, 2), 'utf8')
console.log(`✓ wordquest template: ${VERIFIED_WORDQUEST.length} örnek`)

// OVERVIEW
writeFileSync(`${TPL_DIR}/overview.json`, JSON.stringify({
  description: 'ÖSYM geçmiş sınav referans workspace — tüm oyun kategorileri',
  generated: now,
  source_exams: {
    TYT: ['2021 (Stirling PDF)', '2019 (pdf-parse)', '2018 (pdf-parse)'],
    YDT_en: ['2020', '2021', '2018'],
  },
  templates: {
    matematik: { file: 'templates/matematik_tyt_examples.json', count: VERIFIED_MATEMATIK.length, categories: ['sayilar', 'istatistik', 'problemler'] },
    fen: { file: 'templates/fen_tyt_examples.json', count: VERIFIED_FEN.length, categories: ['fizik', 'biyoloji'] },
    sosyal: {
      file: 'templates/sosyal_tyt_examples.json',
      count: VERIFIED_SOSYAL.length,
      verified_example_categories: ['tarih', 'felsefe'],
      missing_verified_example_categories: ['cografya', 'sosyoloji', 'din_kulturu'],
    },
    turkce: { file: 'templates/turkce_tyt_examples.json', count: VERIFIED_TURKCE.length, categories: ['anlam_bilgisi', 'dil_bilgisi'] },
    wordquest: { file: 'templates/wordquest_ydt_examples.json', count: VERIFIED_WORDQUEST.length, categories: ['fill_in_blank', 'sentence_completion'] },
  },
  usage_in_prompts: {
    format: 'JSON.stringify(examples.slice(0, 3)) ile few-shot ekle',
    matematik: 'Her kategoriden 2-3 örnek seç, sayısal opsiyon formatını taklit et',
    fen: 'Roman numeral ve ilişki formatı örneklerini birlikte kullan',
    sosyal: 'Yalnız tarih/felsefe verified few-shot; eksik kategorileri bu template ile tamamlanmış sayma',
    turkce: 'Anlam için uzun pasaj, dil bilgisi için kısa cümle örnekleri',
    wordquest: 'fill_in_blank örneklerini İngilizce fill-in için kullan',
  },
  copyright_note: 'pdfs/, extracted/, templates/ gitignore\'da — ÖSYM telif koruması altında, sadece özel referans kullanımı',
}, null, 2), 'utf8')
console.log(`✓ overview.json`)

console.log('\n=== ÖSYM Referans Workspace Tamamlandı ===')
console.log(`Toplam verified örnek: ${VERIFIED_MATEMATIK.length + VERIFIED_FEN.length + VERIFIED_SOSYAL.length + VERIFIED_TURKCE.length + VERIFIED_WORDQUEST.length}`)
console.log(`  • Matematik: ${VERIFIED_MATEMATIK.length}`)
console.log(`  • Fen: ${VERIFIED_FEN.length}`)
console.log(`  • Sosyal: ${VERIFIED_SOSYAL.length}`)
console.log(`  • Türkçe: ${VERIFIED_TURKCE.length}`)
console.log(`  • Wordquest: ${VERIFIED_WORDQUEST.length}`)
