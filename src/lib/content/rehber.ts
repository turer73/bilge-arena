/**
 * Sinav rehberi yazilari — veri-tabanli (MDX degil, basit ve type-safe).
 *
 * FAZ A: altyapi + 2 faktuel evergreen seed yazi (sinav sistemi genel bilgisi,
 * markaya ozgu degisken iddia yok). Yeni yazi eklemek = bu diziye obje eklemek
 * (Faz B: ton/icerik kullanici karari). updated alani LITERAL string —
 * sitemap new Date() kullanmiyor, ayni desen korunur.
 */
export interface RehberArticle {
  slug: string
  title: string
  description: string
  category: string
  readingMinutes: number
  /** ISO tarih (literal — request-aninda hesaplanmaz) */
  updated: string
  /** Paragraf dizisi; '## ' ile baslayan satir alt-baslik olarak render edilir */
  body: string[]
}

export const REHBER_ARTICLES: RehberArticle[] = [
  {
    slug: 'tyt-ayt-farki',
    title: 'TYT ve AYT Arasındaki Fark Nedir?',
    description:
      'YKS iki oturumdan oluşur: TYT ve AYT. İkisinin kapsamı, amacı ve puana etkisi nasıl farklılaşır? Sade bir karşılaştırma.',
    category: 'Sınav Sistemi',
    readingMinutes: 4,
    updated: '2026-06-20',
    body: [
      'YKS (Yükseköğretim Kurumları Sınavı) iki temel oturumdan oluşur: TYT ve AYT. Bu iki sınav farklı amaçlara hizmet eder ve birlikte üniversite yerleştirme puanını belirler.',
      '## TYT — Temel Yeterlilik Testi',
      'TYT, tüm adayların girdiği ilk oturumdur. Türkçe, temel matematik, sosyal bilimler ve fen bilimlerinden temel düzeyde sorular içerir. Amacı, lise boyunca kazanılan temel becerileri ölçmektir. TYT puanı hem ön lisans tercihlerinde tek başına kullanılır hem de lisans yerleştirme puanına katkı sağlar.',
      '## AYT — Alan Yeterlilik Testi',
      'AYT, lisans programlarına yerleşmek isteyen adayların girdiği ikinci oturumdur. Sayısal, Eşit Ağırlık ve Sözel alanlarına göre matematik, fen bilimleri, edebiyat-sosyal gibi alan derslerinden daha derin sorular sorulur. Hedeflenen bölüm hangi puan türündeyse, o türe karşılık gelen testlere ağırlık verilir.',
      '## Hangisine Nasıl Çalışmalı?',
      'TYT geniş ama temel düzeydedir; konuların tamamına yayılan düzenli tekrar ve bol soru çözümü işe yarar. AYT ise alana özgü ve derindir; hedeflenen puan türündeki derslere odaklanmak daha verimlidir. İki sınav da aynı dönemde hazırlandığı için zaman planlaması kritik önemdedir.',
      'Bilge Arena beş dersi de TYT temelinden AYT düzeyine kadar kategorilere ayırır; böylece hangi oturuma hazırlanırsan hazırlan ilgili konularda pratik yapabilirsin.',
    ],
  },
  {
    slug: 'verimli-calisma-yontemleri',
    title: "YKS'ye Verimli Çalışma Yöntemleri",
    description:
      'Aralıklı tekrar, aktif hatırlama ve deneme analizi: bilimsel temelli, herkesin uygulayabileceği çalışma yöntemleri.',
    category: 'Çalışma Teknikleri',
    readingMinutes: 5,
    updated: '2026-06-20',
    body: [
      'Sınav hazırlığında harcanan süreden çok, sürenin nasıl kullanıldığı belirleyicidir. Aşağıdaki yöntemler eğitim araştırmalarında tutarlı biçimde etkili bulunmuştur ve herkes tarafından uygulanabilir.',
      '## Aralıklı Tekrar',
      'Bir konuyu tek seferde uzun süre çalışmak yerine, artan aralıklarla tekrar etmek kalıcılığı belirgin biçimde artırır. Öğrendiğin bir konuyu ertesi gün, birkaç gün sonra ve bir hafta sonra kısa kısa tekrar et. Unutma eğrisini bu şekilde kırarsın.',
      '## Aktif Hatırlama',
      'Notları tekrar tekrar okumak pasif bir yöntemdir ve yanıltıcı bir "biliyorum" hissi verir. Bunun yerine konuyu kapatıp kendine sor, soru çöz, anlatmaya çalış. Bilgiyi hafızadan geri çağırmak (aktif hatırlama), öğrenmeyi okumaktan çok daha fazla güçlendirir.',
      '## Deneme Analizi',
      'Deneme çözmenin asıl değeri, çözdükten sonraki analizdedir. Yanlış ve boş soruları kategorilere ayır: bilgi eksiği mi, dikkat hatası mı, süre yönetimi mi? En çok hangi konuda yanlış yapıyorsan çalışma planını oraya kaydır.',
      '## Zayıf Konuya Odaklan',
      'Güçlü olduğun konuları tekrar çalışmak rahatlatıcıdır ama net kazandırmaz. Net artışı çoğunlukla zayıf konulardan gelir. Bilge Arena\'nın adaptif sistemi yanlış yaptığın soruları tekrar karşına getirerek bu odaklanmayı otomatikleştirir.',
      'Son olarak: düzenlilik tek seferlik yoğun çalışmadan üstündür. Her gün ölçülü ve sürdürülebilir bir tempo, sınav gününe kadar korunabilen en sağlam stratejidir.',
    ],
  },
  {
    slug: 'lgs-nedir-nasil-hazirlanilir',
    title: 'LGS Nedir? Kimler Girer, Nasıl Hazırlanılır?',
    description:
      'LGS, 8. sınıf öğrencilerinin liselere yerleştirilmesinde kullanılan merkezi sınavdır. Kapsamı, bölümleri ve hazırlık stratejisi.',
    category: 'Sınav Sistemi',
    readingMinutes: 4,
    updated: '2026-06-20',
    body: [
      'LGS (Liselere Geçiş Sınavı), 8. sınıf öğrencilerinin fen liseleri, sosyal bilimler liseleri ve proje okulları gibi sınavla öğrenci alan liselere yerleştirilmesinde kullanılan merkezi bir sınavdır. Öğrencilerin bir kısmı bu sınavla, büyük kısmı ise adrese dayalı yerleştirmeyle lise kazanır.',
      '## Sınavın Bölümleri',
      'LGS iki bölümden oluşur: sözel ve sayısal. Sözel bölümde Türkçe, T.C. İnkılap Tarihi, din kültürü ve yabancı dil; sayısal bölümde matematik ve fen bilimleri yer alır. Sorular 8. sınıf müfredatına dayanır ve büyük ölçüde okuduğunu anlama ile akıl yürütme becerisini ölçer.',
      '## Nasıl Hazırlanılır?',
      "LGS'de ezberden çok kavrama ve yorum öne çıkar. Bu yüzden konu eksiğini kapatmak kadar bol ve nitelikli soru çözmek önemlidir. Okuduğunu anlama becerisi tüm derslere yayıldığı için düzenli okuma alışkanlığı doğrudan net kazandırır.",
      "Düzenli deneme çözmek ve her denemeyi analiz etmek, hem zaman yönetimini hem de eksik konuları görünür kılar. Bilge Arena'nın LGS etiketli soruları konu konu pratik yaparak bu hazırlığı oyunlaştırır.",
    ],
  },
  {
    slug: 'deneme-sinavi-analizi',
    title: 'Deneme Sınavı Analizi: Netten Fazlasını Görmek',
    description:
      'Deneme çözmek yetmez; asıl kazanç analizde. Yanlışları sınıflandırma, süre yönetimi ve eksik tespiti üzerine pratik bir rehber.',
    category: 'Çalışma Teknikleri',
    readingMinutes: 4,
    updated: '2026-06-20',
    body: [
      'Birçok öğrenci deneme sınavını çözüp netini not eder ve geçer. Oysa denemenin asıl değeri, sonrasında yapılan analizde gizlidir. Net yalnızca bir sonuçtur; nedenleri analizde ortaya çıkar.',
      '## Yanlışları Sınıflandır',
      'Her yanlış ve boş soruyu üç gruba ayır: bilgi eksiği, dikkat hatası ve süre yetmemesi. Bilgi eksiği konu tekrarı gerektirir; dikkat hatası soru okuma disiplinini; süre sorunu ise strateji ayarını ister. Aynı grupta tekrarlayan yanlışlar, çalışma planının asıl hedefidir.',
      '## Süre Dağılımını İncele',
      'Hangi testte ne kadar zaman harcadığını gözden geçir. Bir teste gereğinden fazla takılıp diğerine vakit kalmaması, net kaybının sık görülen sebebidir. Denemede bunu fark etmek, gerçek sınavda telafi şansı verir.',
      "Analiz ettiğin her yanlışı bir süre sonra tekrar çöz; gerçekten öğrenip öğrenmediğini ancak bu gösterir. Bilge Arena yanlış yaptığın soruları tekrar karşına getirerek bu döngüyü otomatikleştirir.",
    ],
  },
  {
    slug: 'sinav-kaygisi-ile-basa-cikma',
    title: 'Sınav Kaygısıyla Başa Çıkmanın Yolları',
    description:
      'Sınav kaygısı doğaldır ama yönetilebilir. Hazırlık, nefes ve odak ile kaygıyı performansa çevirmenin pratik yolları.',
    category: 'Motivasyon',
    readingMinutes: 4,
    updated: '2026-06-20',
    body: [
      'Sınav kaygısı neredeyse her öğrencinin yaşadığı doğal bir tepkidir. Düşük düzeyde kaygı odaklanmayı artırır; asıl sorun, kaygının performansı engelleyecek kadar büyümesidir. İyi haber şu: kaygı yönetilebilir bir duygudur.',
      '## Hazırlık En İyi Panzehirdir',
      'Kaygının büyük kısmı belirsizlikten beslenir. Düzenli çalışma ve bol deneme, sınav ortamını tanıdık hale getirir ve belirsizliği azaltır. Kendini hazır hisseden zihin daha az kaygılanır.',
      '## Nefes ve Odak',
      'Sınav anında kaygı yükseldiğinde birkaç saniye yavaş ve derin nefes almak bedeni sakinleştirir. Tüm sınavı değil yalnızca önündeki tek soruyu düşünmek, zihni şimdiye getirir ve panik döngüsünü kırar.',
      'Uyku, beslenme ve mola ihmal edilmemelidir; yorgun bir zihin hem daha kaygılı hem daha hatalıdır. Hedef kaygıyı tümüyle yok etmek değil, onu yönetilebilir bir seviyede tutmaktır.',
    ],
  },
  {
    slug: 'hiz-ve-dogruluk-dengesi',
    title: 'Soru Çözerken Hız ve Doğruluk Dengesi',
    description:
      'Sınavda ne aşırı hız ne aşırı titizlik kazandırır. Doğru tempoyu bulmak ve takılan soruyu bırakmayı öğrenmek üzerine.',
    category: 'Çalışma Teknikleri',
    readingMinutes: 3,
    updated: '2026-06-20',
    body: [
      'Sınav, sınırlı sürede en yüksek neti çıkarma yarışıdır. Çok hızlı gidip dikkat hataları yapmak da her soruya aşırı titizlenip süreyi bitirmek de net kaybettirir. Aranan şey sürdürülebilir bir tempodur.',
      '## Takılan Soruyu Bırak',
      'Bir soruda makul süreyi aştıysan işaretleyip geç. Kolay soruları toplamadan zor soruda zaman harcamak, garanti netleri riske atar. Tur sonunda kalan süreyle işaretlediklerine dönersin.',
      '## Tempoyu Pratikle Bul',
      'Doğru hız teoriyle değil, bol soru ve deneme çözerek oturur. Zamanla hangi soru tipinde ne kadar sürede karar verdiğini tanırsın. Zamanlı modlar bu içgüdüyü geliştirmenin en hızlı yoludur.',
      "Bilge Arena'nın Blitz ve Klasik gibi zamanlı modları, baskı altında karar verme pratiğini oyunlaştırarak bu dengeyi kurmana yardımcı olur.",
    ],
  },
]

export function getArticle(slug: string): RehberArticle | undefined {
  return REHBER_ARTICLES.find((a) => a.slug === slug)
}

export const REHBER_SLUGS = REHBER_ARTICLES.map((a) => a.slug)
