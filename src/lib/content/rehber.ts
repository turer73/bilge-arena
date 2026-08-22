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
  /** Makaledeki zamana duyarlı bilgilerin doğrulandığı birincil kaynaklar */
  sources?: Array<{ label: string; url: string }>
}

export const REHBER_ARTICLES: RehberArticle[] = [
  {
    slug: 'tyt-ayt-farki',
    title: 'TYT ve AYT Arasındaki Fark Nedir? 2026 Karşılaştırması',
    description:
      '2026 YKS için TYT ve AYT farkları: soru dağılımı, süre, puana etkisi, puan türüne göre çözülmesi gereken testler ve örnek çalışma planı.',
    category: 'Sınav Sistemi',
    readingMinutes: 8,
    updated: '2026-08-23',
    body: [
      'YKS (Yükseköğretim Kurumları Sınavı) tek bir sınav gibi anılsa da farklı amaçları olan oturumlardan oluşur. TYT temel yeterlilikleri ve süre altında akıl yürütmeyi; AYT ise seçtiğin alandaki lise kazanımlarını daha derin biçimde ölçer. Bu nedenle “önce TYT tamamen bitsin, sonra AYT başlarım” yaklaşımı çoğu lisans adayı için risklidir: iki oturumun çalışması aynı dönemde, farklı ağırlıklarla yürütülmelidir.',
      'Bu rehberdeki tarih ve sınav yapısı bilgileri 2026 ÖSYM YKS kılavuzu ile 20–21 Haziran 2026 tarihinde uygulanan resmî soru kitapçıklarına göre güncellenmiştir. Gelecek sınav döneminde süre, kapsam veya hesaplama kuralları değişebileceğinden son sözü her zaman ilgili yılın ÖSYM kılavuzu söyler.',
      '## Hızlı Karşılaştırma',
      'TYT, 120 soruluk ve 165 dakikalık ilk oturumdur. Türkçe 40, Temel Matematik 40, Sosyal Bilimler 20 ve Fen Bilimleri 20 sorudan oluşur. AYT ise 180 dakikalık ikinci oturumdur; Türk Dili ve Edebiyatı–Sosyal Bilimler-1, Sosyal Bilimler-2, Matematik ve Fen Bilimleri testlerini içerir. Aday her AYT testini çözmek zorunda değildir; hedeflediği puan türünü oluşturan testlere odaklanır.',
      'TYT’de soru başına ortalama süre yaklaşık 82,5 saniyedir. Bu ortalama her soruya eşit süre ayırman gerektiği anlamına gelmez: kısa Türkçe ve temel işlem sorularından kazanılan zaman, uzun paragraf veya problem sorularına aktarılır. AYT’de ise alan bilgisi daha derin olduğu için yalnız hız değil, konu hâkimiyeti ve çok adımlı çözüm disiplini belirleyicidir.',
      '## TYT — Temel Yeterlilik Testi Ne Ölçer?',
      'TYT tüm adaylar için ortak başlangıç oturumudur. Sorular yalnızca bilgiyi hatırlamayı değil; okuduğunu anlama, temel matematiksel akıl yürütme, grafik ve tablo yorumlama, farklı bilgiler arasında ilişki kurma becerilerini ölçer. Özellikle Türkçe ve Temel Matematik, puan türünden bağımsız biçimde bütün adayların planında yer alır.',
      'İki yıllık ön lisans programlarında TYT puanı temel yerleştirme ölçütüdür. Dört yıllık lisans programlarında ise TYT, ilgili AYT veya YDT puanıyla birlikte değerlendirilir. Bu yüzden lisans hedefleyen bir aday için TYT “yalnızca barajı geçme oturumu” değildir; yerleştirme puanının önemli bir parçasıdır.',
      'TYT çalışmasının pratik hedefi, önce doğruluğu kurmak sonra aynı doğruluğu süre baskısı altında korumaktır. Örneğin matematikte bir konuyu yeni öğrenirken süresiz ve çözümlü çalışmak; konu oturduktan sonra 20–30 soruluk zamanlı setlere geçmek daha sağlıklıdır. Sadece hız için erken kronometre kullanmak, yanlış çözüm alışkanlığını kalıcılaştırabilir.',
      '## AYT — Alan Yeterlilik Testi Ne Ölçer?',
      'AYT, dört yıllık lisans programlarını hedefleyen adayların alan bilgisini ölçer. Sorular TYT’ye göre daha konu-özel ve çok adımlıdır. Bir formülü bilmek tek başına yetmeyebilir; hangi koşulda uygulanacağını seçmek, birden fazla kazanımı aynı soruda kullanmak ve çeldiricileri ayırmak gerekir.',
      'Sayısal puan için AYT Matematik ve Fen Bilimleri; Eşit Ağırlık için AYT Matematik ile Türk Dili ve Edebiyatı–Sosyal Bilimler-1; Sözel için Türk Dili ve Edebiyatı–Sosyal Bilimler-1 ile Sosyal Bilimler-2 testleri belirleyicidir. Dil programları içinse AYT’den ayrı uygulanan YDT kullanılır. Tercih etmeyi düşündüğün bölümün hangi puan türüyle öğrenci aldığını YÖK Atlas ve güncel tercih kılavuzundan doğrulamalısın.',
      'Somut örnek: bilgisayar mühendisliği hedefleyen bir aday TYT’nin ardından AYT Matematik ve Fen Bilimleri testlerine; hukuk hedefleyen bir aday AYT Matematik ile Türk Dili ve Edebiyatı–Sosyal Bilimler-1 testlerine ağırlık verir. Bölüm adı benzer görünse bile puan türü değişebileceği için çalışma planı bölüm varsayımına değil, resmî puan türüne dayanmalıdır.',
      '## TYT ve AYT Puana Nasıl Etki Eder?',
      'Sayısal, Eşit Ağırlık ve Sözel puan türlerinde yaygın biçimde kullanılan “TYT yüzde 40, AYT yüzde 60 etkiler” özeti, iki oturumun ağırlığını anlamak için yararlıdır; ancak kişisel puan hesabı ham netleri doğrudan 0,40 ve 0,60 ile çarpmak kadar basit değildir. ÖSYM standart puanları sınava giren kitlenin ortalama ve dağılımına göre hesaplar; Ortaöğretim Başarı Puanı da yerleştirme puanına ayrıca eklenir.',
      'Bu nedenle “bir TYT neti kaç AYT netine eşittir?” sorusunun herkes için sabit bir cevabı yoktur. En güvenli yaklaşım, netleri ayrı ayrı izlemek ve hedef programın önceki yıl başarı sırası ile puan türünü referans almaktır. Puan tahmin araçları senaryo kurmaya yardım eder ama resmî sonuç yerine geçmez.',
      'Dört yanlışın bir doğruyu götürdüğü ham puan hesabı her iki oturumda da geçerlidir. Rastgele işaretlemek yerine iki seçeneğe indirebildiğin sorularla hiçbir fikrin olmayan soruları ayırmak; deneme analizinde yanlışın bilgi, işlem, dikkat veya süre kaynaklı olduğunu kaydetmek daha yüksek getirili bir stratejidir.',
      '## TYT mi AYT mi Öncelikli Olmalı?',
      'Öncelik takvime ve mevcut netlerine göre değişir. 11. sınıfta veya hazırlığın erken döneminde alan dersleri okulda ilerlerken TYT temelini haftalık kısa oturumlarla sürdürmek dengeli bir başlangıçtır. Son sınıfta ise “TYT bitmeden AYT’ye geçmem” demek AYT’deki derin konuları son aylara sıkıştırabilir.',
      'Örnek bir haftalık dağılım: TYT netleri hedefe uzak, AYT konuları da yeni başlıyorsa çalışma süresinin yaklaşık yarısını TYT’ye, yarısını AYT’ye ayır. TYT doğruluğu ve süresi istikrara kavuştuğunda ağırlığı AYT’ye kaydır; fakat haftalık TYT denemesi ve yanlış tekrarıyla temeli koru. Bu oran bir kural değil, deneme sonuçlarına göre her iki haftada bir güncellenmesi gereken başlangıç noktasıdır.',
      '## 12 Haftalık Uygulanabilir Plan',
      '1–4. haftalarda bir TYT ve bir alan denemesiyle başlangıç seviyeni ölç. En fazla net kaybettiren üç TYT ve üç AYT konusunu belirle. Her çalışma oturumunda kısa konu tekrarı, seviyeli soru seti ve yanlışların yeniden çözümü olsun. Bu dönemde amaç soru sayısı rekoru değil, eksik haritası çıkarmaktır.',
      '5–8. haftalarda konu setlerini zamanlı mini denemelere dönüştür. Haftada en az bir tam TYT denemesi ve hedef puan türüne uygun bir AYT denemesi çöz. Her yanlış için “bilgi eksiği, yöntem seçimi, işlem, dikkat, süre” etiketlerinden birini kullan. Aynı etiket iki hafta üst üste artıyorsa çalışma biçimini değiştir.',
      '9–12. haftalarda gerçek oturum süresine yakın tam denemeleri artır. Deneme gününün ertesi oturumunu yalnız analize ayır: çözümü okumakla yetinme, soruyu kapatıp yeniden çöz. Son hafta yeni ve ağır konu yığmak yerine sık tekrarlanan hata türlerini, formül/kavram özetlerini ve uyku düzenini korumaya odaklan.',
      '## En Sık Yapılan Dört Hata',
      'Birincisi, TYT konularının “tamamen bitmesini” bekleyip AYT’yi ertelemektir. İkincisi, yalnız net toplamına bakıp yanlışın nedenini kaydetmemektir. Üçüncüsü, hedef puan türünde etkisiz testlere gereğinden fazla zaman ayırmaktır. Dördüncüsü ise her gün farklı kaynağa geçerek aynı konu üzerinde ölçülebilir ilerleme biriktirememektir.',
      'Daha sağlıklı ölçüm için her hafta test bazında doğru, yanlış, boş, harcanan süre ve tekrar eden hata türünü yaz. Bir konu için doğruluk yükseliyor ama süre düşmüyorsa zamanlı set; süre iyi ama doğruluk düşükse konu ve yöntem tekrarı gerekir. Böylece çalışma planın duyguya değil kanıta dayanır.',
      '## Kısa Cevaplar',
      'AYT’ye girmeden dört yıllık bölüm kazanılır mı? SAY, EA ve SÖZ puanıyla öğrenci alan lisans programları için ilgili AYT testlerine girmek gerekir. Yalnız TYT puanıyla çoğunlukla ön lisans programları değerlendirilir; özel yetenek ve diğer istisnalar için güncel kılavuz kontrol edilmelidir.',
      'AYT’de bütün testleri çözmek gerekir mi? Hayır. Hedef puan türünü oluşturan testler önceliklidir. Birden fazla puan türüyle tercih düşünüyorsan ilgili test kombinasyonlarını birlikte planlayabilirsin.',
      'TYT neti ne zaman sabitlenir? Netler tamamen sabitlenmez; denemenin zorluğu ve gün koşulları değişir. Tek bir sonuca değil, son dört–beş denemenin ortalamasına ve hata dağılımına bakmak daha güvenilir bir göstergedir.',
      'Bilge Arena’da Matematik, Türkçe, Fen ve Sosyal alanlarını sınav kapsamına göre filtreleyerek kısa soru setleri çözebilir; yanlışlarını tekrar ederek çalışma planındaki konu oturumlarını destekleyebilirsin. Platform resmî ÖSYM kaynağı veya puan hesaplama hizmeti değildir; sınav kuralları için güncel ÖSYM kılavuzunu esas al.',
    ],
    sources: [
      {
        label: 'ÖSYM — 2026 Yükseköğretim Kurumları Sınavı Kılavuzu',
        url: 'https://www.osym.gov.tr/2026yuksekogretim-kurumlari-sinavi-yks-kilavuzu',
      },
      {
        label: 'ÖSYM — 2026 TYT ve AYT temel soru kitapçıkları',
        url: 'https://www.osym.gov.tr/2026yks-tyt-ayt-ve-ydt-temel-soru-kitapciklari-ve-cevap-anahtarlari',
      },
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
  {
    slug: 'lgs-3-ayda-hazirlik',
    title: 'LGS\'ye 3 Ayda Nasıl Hazırlanılır?',
    description:
      'LGS\'de son 3 ayda verim almanın yolu: gerçekçi haftalık program, konu önceliklendirme, deneme analizi ve motivasyonu koruma taktikleri.',
    category: 'Çalışma Teknikleri',
    readingMinutes: 6,
    updated: '2026-07-18',
    body: [
      'Son üç ay, LGS\'de net dağılımını en çok değiştirebileceğin dönemdir — çünkü artık yeni konu öğrenmekten çok, bildiklerini nete çevirmeye odaklanılır. Bu rehber, sıfırdan başlayan değil, temeli olan ama "nasıl toparlarım?" diye soran bir öğrenci için yazıldı. Amaç, panik yapmadan, ölçülebilir bir plana bağlı kalmak.',
      '## Önce Nerede Olduğunu Ölç',
      'Plan yapmadan önce bir tam deneme çöz ve sonucu ders ders analiz et. Amaç kaç net yaptığın değil, hangi konularda yanlış/boş yaptığın. Üç ayın en değerli bilgisi budur: zamanını en çok hangi konuya ayırman gerektiğini burada görürsün. "Her şeyi tekrar edeyim" en verimsiz stratejidir; en çok net kaybettiğin 5-6 konuya yüklenmek en verimlisidir.',
      '## Konuları Önceliklendir: Yüksek Getiri Kuralı',
      'Bütün konular eşit değildir. İki soruyu birlikte sor: bu konudan LGS\'de kaç soru çıkıyor, ve bu konuda ne kadar zayıfsın? İkisi de yüksekse, o konu senin altın konundur — önce ona çalış. Örneğin Matematik\'te çarpanlar ve üslü-köklü sayılar, Türkçe\'de sözcükte-cümlede anlam ve paragraf, Fen\'de kuvvet ve basınç gibi konular hem çok soru getirir hem çok öğrenciyi zorlar. Getirisi düşük, sana kolay gelen konulara son ayı harcama.',
      '## Gerçekçi Bir Haftalık Program',
      'Aşağıdaki iskelet bir öneri; kendi okul ve etüt saatlerine göre uyarla. Anahtar ilke: her gün soru çöz, haftada en az bir kez tam deneme. Hafta içi (okul sonrası, yaklaşık 2-3 saat): 45 dakika o günün öncelikli konusundan konu tekrarı ve örnek çözüm, 60 dakika aynı konudan soru çözümü, 30 dakika önceki günün yanlışlarını yeniden çözmek. Cumartesi tam LGS denemesi (gerçek süreyle, tek oturumda). Pazar ise denemenin detaylı analizi ve hafta boyunca biriken yanlışların tekrarı — yarım gün dinlenmek de programın parçasıdır.',
      '## Deneme Analizi: Asıl Öğrenme Burada',
      'Deneme çözmek tek başına net artırmaz; analiz artırır. Her yanlış için üç etiketten birini koy: bilgi eksiği (konuyu bilmiyordum), dikkat hatası (biliyordum ama yanlış okudum veya işlem hatası yaptım), süre (zaman yetmedi, boş bıraktım). Zamanla hangi etiketin ağır bastığını görürsün. Bilgi eksiği çokaysa konuya dön; dikkat hatası çoksa soruyu yavaş ve iki kez okumayı çalış; süre sorunu varsa kolay soruları önce çözüp zoru sona bırakma stratejisini dene.',
      '## Yanlış Defteri Tut',
      'Ayrı bir deftere sadece yanlış yaptığın soruların mantığını yaz — soruyu kopyalamana gerek yok, "neyi kaçırdım" cümlesi yeter. Sınavdan önceki son hafta hiç yeni konu çalışmadan bu defteri okumak, en verimli tekrardır.',
      '## Son 2 Hafta: Koru ve Dinlen',
      'Son iki haftada yeni ve zor konulara girmek genelde zarar verir; kaygıyı artırır, özgüveni düşürür. Bu dönemde bildiklerini pekiştir, deneme temposunu koru ama uyku düzenini bozma. Sınav gecesi geç saate kadar çalışmak, ertesi gün dikkatini düşürerek kazandığından fazlasını götürür.',
      'Üç aylık planın omurgası nettir: önce bir denemeyle nerede olduğunu ölç, en çok getiri sağlayacak zayıf konulara öncelik ver, her gün soru çöz ve haftada bir tam deneme yap, ama asıl zamanı deneme analizine ve yanlış defterine ayır. Son iki haftada yeni konudan uzak dur, bildiğini pekiştir ve uykunu koru. Sınavı kazandıran, son gece değil, bu üç ayın düzenidir.',
      'Bilge Arena\'da LGS konularını derse ve zorluğa göre oyunlaştırılmış modda çözerek bu üç aylık planı bugün başlatabilirsin.',
    ],
  },
  {
    slug: 'tyt-matematik-bolunebilme-kurallari',
    title: 'TYT Matematik: Bölünebilme Kuralları (Konu Anlatımı ve Çözümlü Sorular)',
    description:
      '2, 3, 4, 5, 6, 8, 9, 10 ve 11\'e bölünebilme kurallarının tam listesi. Her kural için örnek ve TYT tarzı çözümlü sorularla adım adım anlatım.',
    category: 'Konu Anlatımı',
    readingMinutes: 7,
    updated: '2026-07-18',
    body: [
      'Bölünebilme kuralları, TYT\'de tek başına soru olarak çıkmasa bile pek çok sorunun içinde gizli bir araç olarak karşına çıkar: EBOB-EKOK, asal çarpanlar, rakam problemleri ve modüler aritmetik sorularının çoğu bu kuralları hızlı uygulamayı gerektirir. İyi haber şu — bu kuralların hepsi ezberlenebilir ve mantığı bir kez oturduğunda unutulmaz. Aşağıda her kuralı örnekle, sonunda da TYT tarzı çözümlü sorularla ele alıyoruz.',
      '## Temel Mantık',
      'Bir sayının başka bir sayıya tam bölünmesi, bölme işleminde kalanın sıfır olması demektir. Bölünebilme kuralları da bu kalanı, uzun bölme yapmadan hızlıca anlamamızı sağlayan kısayollardır.',
      '## Kural Kural Bölünebilme',
      '2 ile bölünebilme: Sayının birler basamağı çift (0, 2, 4, 6, 8) ise sayı 2\'ye tam bölünür. Örnek: 3.174 sayısının birler basamağı 4, yani çift olduğundan 2\'ye bölünür.',
      '3 ile bölünebilme: Rakamların toplamı 3\'e bölünüyorsa sayı da 3\'e bölünür. Örnek: 5.121 sayısında 5+1+2+1=9, 9 üçe bölündüğünden sayı da 3\'e bölünür.',
      '4 ile bölünebilme: Son iki basamağın oluşturduğu sayı 4\'e bölünüyorsa (ya da "00" ise) sayı 4\'e bölünür. Örnek: 7.316 sayısında son iki basamak "16", 16 dörde bölündüğünden sayı da 4\'e bölünür.',
      '5 ile bölünebilme: Birler basamağı 0 veya 5 ise sayı 5\'e bölünür. Örnek: 2.480 ve 9.135 sayılarının ikisi de 5\'e bölünür.',
      '6 ile bölünebilme: Sayı hem 2\'ye hem 3\'e bölünüyorsa 6\'ya da bölünür. Örnek: 4.128 sayısı çift olduğundan 2\'ye, rakam toplamı 4+1+2+8=15 olduğundan 3\'e bölünür, dolayısıyla 6\'ya da bölünür.',
      '8 ile bölünebilme: Son üç basamağın oluşturduğu sayı 8\'e bölünüyorsa (ya da "000" ise) sayı 8\'e bölünür. Örnek: 12.320 sayısında son üç basamak "320", 320 sekize bölündüğünden sayı da 8\'e bölünür.',
      '9 ile bölünebilme: Rakamların toplamı 9\'a bölünüyorsa sayı da 9\'a bölünür. Örnek: 6.813 sayısında 6+8+1+3=18, 18 dokuza bölündüğünden sayı da 9\'a bölünür.',
      '10 ile bölünebilme: Birler basamağı 0 ise sayı 10\'a bölünür.',
      '11 ile bölünebilme: Rakamları sağdan sola sırayla artı, eksi, artı, eksi diye işaretleyip topla. Sonuç 0 veya 11\'in katı ise sayı 11\'e bölünür. Örnek: 8.591 sayısında (1)-(9)+(5)-(8)=-11, bu 11\'in katı olduğundan sayı 11\'e bölünür.',
      '6, 12, 15 gibi bileşik sayılara bölünebilmeyi ayrı ezberlemene gerek yok. Sayıyı aralarında asal çarpanlarına ayır: 12=4×3 olduğundan, bir sayı 12\'ye bölünüyorsa hem 4\'e hem 3\'e bölünmelidir.',
      '## Çözümlü Sorular',
      'Soru 1: "3A4" üç basamaklı sayısı 3 ile tam bölünebiliyorsa, A yerine kaç farklı rakam gelebilir? Çözüm: 3 ile bölünebilme için rakamlar toplamı 3\'e bölünmeli. Rakam toplamı = 3+A+4 = 7+A. Bu toplamın 3\'e bölünmesi için 7+A değeri 9, 12 veya 15 olabilir, yani A değeri 2, 5 veya 8 olabilir. A bir rakam olduğundan (0-9) üçü de geçerlidir. Cevap: 3 farklı değer.',
      'Soru 2: Aşağıdaki sayılardan hangisi hem 4\'e hem 9\'a bölünür? A) 3.612  B) 5.148  C) 7.234  D) 8.140  E) 2.925. Çözüm: Önce 9 filtresi (rakam toplamı 9\'un katı) daha ayırt edicidir: 5.148 sayısında 5+1+4+8=18, 9\'a bölünür; 2.925 sayısında da 2+9+2+5=18, 9\'a bölünür — ama 2.925\'in son iki basamağı "25", 25÷4 tam bölünmediğinden 4\'e bölünmez, elenir. 5.148\'in son iki basamağı "48", 48÷4=12 olduğundan 4\'e de bölünür. Diğerlerini kontrol edince 4 ve 9 şartını aynı anda yalnızca 5.148 sağlar. Cevap: B) 5.148.',
      'Soru 3: "1B2B" dört basamaklı sayısı 11 ile tam bölünüyorsa B kaçtır? (B bir rakamdır.) Çözüm: Sağdan sola işaretleyelim: birler (+B), onlar (-2), yüzler (+B), binler (-1). Toplam = B-2+B-1 = 2B-3. Bu ifade 0 veya 11\'in katı olmalı. 2B-3=0 için B=1,5 çıkar, bu bir rakam olmadığından geçersizdir. 2B-3=11 için 2B=14, B=7 çıkar ve bu geçerlidir. 2B-3=-11 için 2B=-8 çıkar, bu da geçersizdir. Cevap: B=7 (sayı 1727 olur; kontrol: 7-2+7-1=11).',
      'Kısa özet: 2, 5, 10 için birler basamağına; 3, 9 için rakam toplamına; 4, 8 için son basamaklara; 11 için alternatif toplama bak. 6, 12, 15 gibi sayıları aralarında asal (birbirini bölmeyen) çarpanlarına ayırıp (12=4×3 gibi) parça parça kontrol et — düz asal çarpanlara ayırmak (12=2×2×3 gibi) yeterli değildir, çünkü 6 sayısı hem 2\'ye hem 3\'e bölünür ama 12\'ye bölünmez. Bu kuralları hızlı uygulamak, TYT\'de sana saniyeler kazandırır — ve sınavda saniyeler nettir.',
      'Bu konuyla ilgili daha fazla soru çözmek istersen, Bilge Arena\'da bölünebilme sorularını oyunlaştırılmış modda çözerek puan kazanabilirsin.',
    ],
  },
]

export function getArticle(slug: string): RehberArticle | undefined {
  return REHBER_ARTICLES.find((a) => a.slug === slug)
}

export const REHBER_SLUGS = REHBER_ARTICLES.map((a) => a.slug)
