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
  /** Uzun H1'den farklı, arama sonucu için kısa ve marka tekrarsız başlık */
  seoTitle?: string
  description: string
  category: string
  readingMinutes: number
  /** ISO tarih (literal — request-aninda hesaplanmaz) */
  updated: string
  /** Paragraf dizisi; '## ' ile baslayan satir alt-baslik olarak render edilir */
  body: string[]
  /** Makaledeki zamana duyarlı bilgilerin doğrulandığı birincil kaynaklar */
  sources?: Array<{ label: string; url: string }>
  /** Kaynak kutusunda makaleye özel yöntem/güncellik açıklaması */
  sourceNote?: string
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
    slug: 'bilge-arena-ogrenme-sistemi',
    title: 'Bir Soru Sitesinden Öğrenme Sistemine: Bilge Arena’nın Bilimsel ve Teknik Mimarisi',
    seoTitle: 'Adaptif Öğrenme ve Soru Kalitesi | Bilge Arena',
    description:
      'Bilge Arena’nın soru üretimi, kalite güvencesi, adaptif tanılama, kazanım modeli ve kurumsal öğrenme takibini tek sistemde nasıl birleştirdiğini inceleyin.',
    category: 'Öğrenme Bilimi',
    readingMinutes: 18,
    updated: '2026-08-23',
    body: [
      'Bilge Arena ilk bakışta öğrencinin ders seçip soru çözdüğü oyunlaştırılmış bir web platformu gibi görülebilir. Fakat bugün ürünün asıl değeri ekrandaki soru sayısından değil, sorunun üretiminden yayın kararına; öğrencinin ilk cevabından gecikmeli tekrarına; bireysel kanıttan öğretmen müdahalesine kadar uzanan ölçülebilir bir öğrenme döngüsü kurmasından gelir. Bu nedenle Bilge Arena’yı yalnız “soru sitesi” olarak tanımlamak, bir laboratuvarı içindeki mikroskoplardan ibaret saymaya benzer: görünen araç doğrudur, fakat sistemin amacı ve karar mekanizması eksik kalır.',
      'Bu yazı Bilge Arena’nın mevcut teknik sözleşmelerini, ürün ilkelerini ve bilimsel dayanaklarını birlikte açıklıyor. Buradaki “bilimsel” sözcüğü başarı garantisi veya öğrenciyi tek bir puanla kesin biçimde tanıma iddiası değildir. Tam tersine; ölçümün belirsizliğini göstermek, az veride hüküm vermemek, modelleri insan-altın verisiyle sınamak, müdahaleyi izlenebilir kılmak ve yeni kanıt geldiğinde önceki kararı güncelleyebilmek demektir.',
      '## Temel tez: Öğrenme, kapalı bir kanıt döngüsüdür',
      'Geleneksel soru uygulamalarında akış çoğu zaman “soruyu göster, doğruyu söyle, puanı artır” çizgisinde biter. Bilge Arena’nın hedef mimarisi ise yedi bağlantılı aşamadan oluşur: ölçülmek istenen kazanımı tanımla; bu kazanıma uygun soruyu üret veya seç; sorunun kalitesini doğrula; öğrencinin cevabını güvenli biçimde değerlendir; kanıt miktarı ve güven düzeyiyle öğrenci durumunu güncelle; bir sonraki uygun çalışmayı öner; gecikmeli sonuçlarla önerinin işe yarayıp yaramadığını yeniden ölç.',
      'Bu döngüde hiçbir katman tek başına “öğrenci öğrendi” diyemez. Bir doğru cevap yalnız bir gözlemdir. Aynı kazanımda farklı zorluklarda, farklı zamanlarda ve mümkün olduğunca bağımsız biçimde oluşan cevaplar birlikte anlam kazanır. Benzer şekilde yüksek soru çözme sayısı, doğruluk ve kalıcılık yoksa gelişme kanıtı değildir; görev tamamlama da hedef kazanımdaki değişimden ayrı izlenmelidir.',
      '## 1. Soru üretimi: Hızlı üretmek değil, izlenebilir bir madde yaşam döngüsü kurmak',
      'Yapay zekâ soru üretiminde ölçek sağlar: farklı ders, konu, sınav kapsamı ve zorluk düzeyleri için taslaklar oluşturabilir. Ancak dilsel olarak düzgün görünen bir soru; yanlış cevap anahtarı, çözüm–cevap çelişkisi, birden fazla doğru seçenek, kazanım dışı içerik, zayıf çeldirici veya telif riski taşıyabilir. Bu nedenle Bilge Arena’da üretim, yayınla eş anlamlı değildir. Yapay zekâ bir taslak üreticisidir; yayın otoritesi değildir.',
      'Her soru yalnız metin ve seçeneklerden ibaret görülmez. Sınav kapsamı, ders, konu, kazanım, zorluk, kaynak, üretim kimliği ve içerik revizyonu gibi metadata ile birlikte ele alınır. Bu bağ, “bu soru güzel mi?” gibi öznel bir soruyu daha denetlenebilir alt sorulara ayırır: Hangi öğrenme çıktısını ölçüyor? Öğrenciden beklenen bilişsel işlem ne? Çözüm doğru seçeneği gerçekten kanıtlıyor mu? Zorluk etiketi saha verisiyle uyuşuyor mu? İçerik değiştiğinde eski kalite kararı hâlâ geçerli mi?',
      'İlk kapı deterministik kontrollerdir. Boş soru, yetersiz seçenek, geçersiz cevap indeksi, tekrar eden seçenek, bozuk şema ve temel içerik tutarsızlıkları modele gönderilmeden reddedilir. Bu yaklaşım hem maliyeti düşürür hem de yapısal bir hatayı olasılıksal bir modele “yorumlatma” riskini azaltır. Üretken model yalnız gerçekten anlamsal inceleme gerektiren aşamada devreye girer.',
      '## 2. Soru kalitesi: Tek model yargısı yerine katmanlı güvence',
      'Bilge Arena’nın soru kalite yaklaşımı tek bir yapay zekâya “bu soru doğru mu?” diye sormaz. Kör çözücü, çeldirici ve belirsizlik arayan karşıt inceleyici, çözüm–cevap tutarlılığı denetçisi ve deterministik kurallar farklı hata türleri için ayrı kanıt üretir. Seçenek sırası kör çözücüye göre değiştirilerek kayıtlı cevabın modele istemeden ipucu vermesi engellenir. Nihai otomatik verdict, serbest model metni değil, sürümlü kurallarla çalışan saf bir karar fonksiyonudur.',
      'Bununla birlikte birden fazla modelin aynı sonuca varması, o modellerin doğru olduğu anlamına gelmez. Aynı veri veya benzer eğitim dağılımı ortak yanlılık üretebilir. Bu yüzden otomatik kalite hattının üretime terfi etmesi için held-out insan-altın benchmark gerekir. Etiket, soru kimliğiyle birlikte içeriğin SHA-256 özetine bağlanır; soru değiştiğinde eski etiket yeni revizyona taşınamaz. En az iki bağımsız uzman uzlaşmalı, ayrışmada üçüncü bir uzman adjudikasyon yapmalıdır.',
      'Kalibrasyon yalnız genel doğrulukla değerlendirilmez. Kusurlu ve temiz soruları dengeli ölçmek için confusion matrix, dengeli doğruluk, yanlış-pozitif ve yanlış-negatif oranları, kapsam, transport hatası ve yüzde 95 Wilson sınırları birlikte kullanılır. Küçük veya sentetik bir örneklem yüksek skor üretse bile terfi kanıtı sayılmaz. Böylece “model birkaç örnekte iyi çalıştı” ile “bu politika yayın kapısında kullanılabilir” birbirinden ayrılır.',
      'Otomatik onay da nihai yayın değildir. Yönetimli içerik akışı taslak, bağımsız insan incelemeleri, yayın ve gerektiğinde karantina aşamalarını ayırır. Kullanıcı hata bildirimi, itiraz, cevap dağılımı, süre, ilk maruziyet ve revizyon psikometrisi üretim sonrası yeni kanıt sağlar. Sorun görüldüğünde içerik sessizce değiştirilmek yerine karantinaya alınır; düzeltme yeni revizyon olarak aynı güvence hattından geçer. Bu, hata olmayacağı vaadi değil; hatanın izlenebilir ve düzeltilebilir olacağı taahhüdüdür.',
      '## 3. Öğrenci seviyesi: Tek sayı değil, kazanım bazlı ve belirsizliği görünen bir model',
      'Bir öğrenciyi “orta seviye” diye etiketlemek kolay ama pedagojik olarak çoğu zaman yetersizdir. Aynı öğrenci problem çözmede güçlü, fonksiyonlarda gelişiyor, temel cebirsel işlemlerde ise desteğe ihtiyaç duyuyor olabilir. Bilge Arena bu nedenle analiz birimini genel puandan Ders → Ünite → Konu → Kazanım hiyerarşisine indirir. Amaç öğrenciyi sınıflandırmak değil, bir sonraki öğrenme kararını daha anlamlı kılmaktır.',
      'Her kazanım için yalnız ham doğruluk değil; kanıt sayısı, bağımsız cevaplar, soru zorluğu, gecikmeli doğru cevap, süre, hızlı yanlış, ipucu kullanımı ve öğrencinin kendi belirttiği tahmin/dikkatsizlik sinyalleri değerlendirilebilir. Bu bileşenler tek bir “zeka” veya “yetenek” puanı üretmek için kullanılmaz. Sistem, gözlenen çalışma davranışından sınırlı bir öğrenme durumu çıkarır ve gözlem kapsamını sonuçla birlikte taşır.',
      'Kanıt yetersizse en doğru sonuç “veri yetersiz”dir. Bilge Arena’nın kurumsal analiz sözleşmelerinde bir kazanım hakkında karar verebilmek için asgari kanıt ve bağımsızlık koşulları aranır; düşük güvende güçlü görünen sonuç bile daha temkinli banda çekilebilir. Güven seviyesi durum etiketinden ayrı gösterilir. Böylece 90 puanlık tek gözlem ile farklı günlere yayılan çoklu kanıtın aynı kesinlikte sunulması önlenir.',
      '## 4. Adaptif tanılama: Açıklanabilir bir başlangıç tahmini',
      'Kısa adaptif tanılama, öğrencinin bütün akademik seviyesini ölçen yüksek riskli bir sınav değildir. İlk dar kapsam TYT Matematik kazanımlarını en fazla on soruda örnekleyen, her kazanımı en az bir kez yoklamaya çalışan açıklanabilir bir durum tespitidir. İlk hedef zorluk orta seviyeden başlar; doğru cevapta bir kademe yükselir, yanlış cevapta bir kademe düşer. Sonraki soru, hedef zorluğa en yakın ve daha önce gösterilmemiş uygun sorular arasından seçilir.',
      'Bu politika iki önemli güvenlik sınırı taşır. Birincisi, soru havuzu bütün hedef kazanımları karşılamıyorsa sistem eksik tanılamayı başarı gibi göstermez. İkincisi, sonuç normal çalışma kanıtından ayrı tutulur ve düşük güvenli başlangıç tahmini olarak sunulur. Öğrenci daha sonra çalıştıkça gerçek öğrenme kanıtı bu ilk tahmini günceller.',
      'Bilge Arena bu aşamada tam ölçekli Item Response Theory veya Computerized Adaptive Testing kullandığını iddia etmez. IRT/CAT için kalibre edilmiş geniş madde havuzu, parametre kararlılığı, maruziyet kontrolü, ölçek eşitleme ve yeterli örneklem gerekir. Mevcut yaklaşım kural tabanlı, dar kapsamlı ve açıklanabilirdir. İleride psikometrik olgunluk oluşursa daha gelişmiş modeller ancak mevcut güvence katmanlarıyla birlikte değerlendirilebilir.',
      '## 5. Bir sonraki soruyu düzenlemek: Zayıfı cezalandırmak değil, üretken güçlük kurmak',
      'Kişiselleştirme yalnız “yanlış yaptı, daha kolay soru ver” değildir. Çok kolay içerik yanıltıcı akıcılık yaratabilir; sürekli zor içerik ise öğrenciyi çalışmadan uzaklaştırabilir. Hedef, öğrencinin mevcut kanıtına yakın ama düşünme gerektiren üretken bir güçlük düzeyi kurmaktır. Adaptif tanılamada zorluk bir kademe değişirken, normal pratikte kazanım durumu, geçmiş yanlışlar ve zamanı gelen tekrarlar bir sonraki oturumun bileşimini etkileyebilir.',
      'Yanlış soruların yeniden gösterimi de rastgele değildir. Aralıklı tekrar katmanı, soru bazında hatırlanabilirlik ve tekrar geçmişini kullanarak öğrencinin ne zaman yeniden karşılaşması gerektiğine dair bir takvim oluşturur. Buradaki amaç öğrenciyi aynı soruya boğmak değil, unutmanın başlamasıyla geri çağırma çabasını verimli bir aralıkta buluşturmaktır.',
      '## 6. Öğrenme bilimi: Soru çözmek hem ölçüm hem öğrenme olayıdır',
      'Aktif hatırlama araştırmaları, bilgiyi bellekten geri çağırmanın yalnız ölçüm olmadığını; sonraki hatırlamayı güçlendirebilen bir öğrenme etkinliği olduğunu gösterir. Sınıf çalışmalarını birleştiren geniş meta-analizler de kısa sınav ve geri çağırma uygulamalarının, koşullara bağlı olmakla birlikte, akademik başarı üzerinde anlamlı bir ortalama etki üretebildiğini raporlar. Bu nedenle Bilge Arena’da soru, öğrenciyi yargılayan son nokta değil; öğrenme döngüsünün aktif bir parçasıdır.',
      'Aralıklı çalışma için de benzer bir ilke geçerlidir. Yüzlerce deneyin nicel sentezi, tekrarlar arasındaki uygun boşluğun hedeflenen hatırlama süresiyle birlikte düşünülmesi gerektiğini gösterir. “Her öğrenci için tek ideal aralık” yoktur. Bilge Arena’nın tekrar planlaması bu nedenle sabit takvim yerine cevap geçmişinden türeyen soru bazlı bir durum kullanır; yine de algoritmik tarih, öğretmenin pedagojik kararı veya öğrencinin gerçek yaşam koşulları üzerinde mutlak otorite değildir.',
      'Düzeltici geri bildirim öğrenme değerini artırır; fakat yalnız doğru seçeneği göstermek çoğu zaman yeterli değildir. Çözümün hangi kavramı kullandığını, çeldiricinin neden yanlış olduğunu ve öğrencinin hata türünü görünür kılmak gerekir. Bilgi eksiği, yöntem seçimi, işlem, dikkat, süre ve tahmin gibi farklı nedenler aynı “yanlış” sonucunun altında saklanabilir. Bu ayrım, bir sonraki müdahaleyi daha isabetli hale getirir.',
      'Oyunlaştırma ise pedagojinin yerine geçmez. XP, seri, lig ve rozetler öğrencinin başlama eşiğini küçültebilir ve ilerlemeyi görünür kılabilir; fakat doğru öğrenme göstergesi değildir. Ürün sağlığı metrikleri ile kazanım kanıtı bu yüzden ayrılmalıdır. Bir öğrencinin platforma dönmesi değerlidir, ancak dönüşün hedef kazanımda gelişme yaratıp yaratmadığı ayrıca ölçülmelidir.',
      '## 7. Kurumsal öğrenme takip sistemi: Liste değil, müdahale altyapısı',
      'Bilge Arena Kurumsal’ın amacı bir dershane ERP’si, muhasebe yazılımı veya yoklama sistemi olmak değildir. Ürünün özgün rolü öğrenci bağlılığı ve akademik çalışma takibi katmanı olmaktır: öğrencinin hangi kazanımda ne kadar ve ne güvenilirlikte kanıt ürettiğini göstermek, öğretmenin uygun çalışma programını hazırlamasını kolaylaştırmak ve müdahalenin sonucunu izlemek.',
      'Öğretmen görünümü ham bir doğru–yanlış tablosundan daha fazlasını sunabilir: değerlendirilebilir kazanım sayısı, destek gereken alanlar, gecikmeli öğrenme kanıtı, ipucu bağımlılığı, hızlı yanlış oranı, son çalışma zamanı ve güven seviyesi. Sınıf görünümünde en az belirli sayıda öğrencide ortaklaşan zayıf kazanımlar öne çıkar; küçük gruplar veya yetersiz kanıt kesin oranlarla teşhir edilmez.',
      'Bu verinin eyleme dönüşmesi için çalışma programı ayrı bir yönetişim akışına sahiptir. Sistem kanıta dayalı bir taslak önerebilir; öğretmen düzenler, gerekçeyi görür, onaylar ve yayınlar. Öğrenci yalnız yayınlanmış programı görür. Program sonrasında yalnız görevlerin tamamlanması değil, hedef kazanımdaki yeni kanıt ve değişim değerlendirilir. Böylece “ödev verildi” ile “öğrenme gelişti” ayrılır.',
      'Kurum yöneticisi de öğretmeni öğrencilerin ham ortalamasına göre sıralamamalıdır. Sınıfın başlangıç düzeyi, örneklem büyüklüğü ve veri kapsamı hesaba katılmadan yapılan sıralama adaletsizdir. Bilge Arena’nın açıklanabilir gösterge yaklaşımı öğrenci gelişimi, takip disiplini, program yönetimi, zamanında müdahale ve veri güvenilirliğini ayrı boyutlarda ele alır; yeterli gözlem yoksa gösterge “veri yetersiz” kalır.',
      '## 8. Ölçüm güvenilirliği: Sonuç kadar payda, pencere ve sürüm de önemlidir',
      'Bir eğitim metriği yalnız yüzde değildir. “Öğrencilerin yüzde 70’i gelişti” diyebilmek için paydanın kimlerden oluştuğu, hangi zaman penceresinin kullanıldığı, kaç öğrencinin yetersiz kanıt nedeniyle dışarıda kaldığı, gelişmenin hangi başlangıca göre hesaplandığı ve model sürümü bilinmelidir. Bilge Arena bu nedenle sonuçlarla birlikte numerator, denominator, zaman aralığı, kapsam ve model kimliği taşımayı hedefler.',
      'Küçük örneklemlerde nokta tahmini yanıltıcıdır. Wilson güven aralıkları ve asgari grup büyüklükleri hem soru psikometrisinde hem kurum raporlarında sahte kesinliği azaltır. Aktivasyon, D1/D7/D30 geri dönüş ve haftalık aktif öğrenci gibi ürün metrikleri ise akademik ustalıkla karıştırılmaz. Bir özelliğin geri dönüşle ilişkili olması, öğrenmeye neden olduğunu kanıtlamaz; nedensel iddia için önceden tanımlanmış ve etik kontrollü deney gerekir.',
      '## 9. Gizlilik, adalet ve insan otoritesi',
      'Öğrenme analitiği öğrencinin yararına güçlü bir araç olabilir; aynı veri yanlış yorumlandığında gözetim ve etiketleme mekanizmasına dönüşebilir. Bu nedenle veri minimizasyonu teknik bir ayrıntı değil, ürün tasarımıdır. Öğretmen ve kurum API’lerine ham cevap anahtarı, öğrencinin seçtiği seçenek, gereksiz kimlik bilgileri veya serbest yapay zekâ istemleri taşınmamalıdır. Tenant ve rol sınırları başka kurum veya sınıf verisine erişimi engellemelidir.',
      'Bilge Arena psikolojik değerlendirme, zekâ puanı, sağlık çıkarımı veya öğrencinin gelecekteki başarısına ilişkin kesin hüküm üretmez. Yapay zekâ öğrenci ya da öğretmen hakkında tek başına yüksek etkili karar vermez. Demografik gruplara göre adalet analizi yapılacaksa hukuki amaç, veri minimizasyonu, yeterli örneklem ve eğitimli insan incelemesi gerekir; veri yokluğunda sistem “adil” sonucu çıkaramaz.',
      'Öğrencinin kendi kanıtını ve gerekçeyi görebilmesi önemlidir. Açıklanabilirlik, yalnız algoritmanın teknik formülünü yayımlamak değildir; “Bu kazanım neden gelişiyor görünüyor?”, “Neden tekrar önerildi?”, “Hangi veri eksik?” ve “Bu karara nasıl itiraz edilir?” sorularına kullanıcı düzeyinde cevap verebilmektir. İnsan müdahalesi, düzeltme ve veri paylaşımını durdurma yolları bu nedenle sistemin parçasıdır.',
      '## 10. Bilge Arena’yı farklılaştıran teknik ilke: Fail-closed öğrenme altyapısı',
      'Eğitim sistemlerinde eksik veri çoğu zaman görünmez biçimde varsayılan değere dönüşür. Bilge Arena’nın güvenli sözleşmeleri bunun tersini hedefler: kapsam eksikse tanılama başlamaz; kanıt yetersizse ustalık kararı çıkmaz; kalite politikasının sürümü uyuşmuyorsa soru yayınlanmaz; kurum yetkisi doğrulanmıyorsa veri dönmez; model yanıtı şemaya uymuyorsa güvenli geri dönüş kullanılır. Yani sistem belirsizliği başarı gibi göstermemelidir.',
      'Sürümlendirme ve denetim izi bu ilkenin tamamlayıcısıdır. Soru revizyonu, kalite politikası, kazanım taksonomisi, öğrenci durum modeli ve kurum metriği değiştiğinde eski sonuçların hangi kurala göre üretildiği korunur. Yeni model geçmiş seriyi sessizce yeniden yazmaz. Bu yaklaşım, ürün büyüdükçe “neden böyle karar verdi?” sorusuna geriye dönük cevap verebilmenin temelidir.',
      '## 11. Bundan sonra hangi bilimsel olgunluk katmanları gerekir?',
      'Birinci ihtiyaç, soru bankasında dönemler arası parametre sürüklenmesini ve maruziyeti izlemektir. Bir soru zamanla ezberlenebilir, müfredat değişebilir veya farklı kullanıcı gruplarında beklenmedik davranabilir. Zorluk, ayırıcılık, seçenek dağılımı ve cevap süresi sabit kabul edilmemeli; yeterli örneklemde pencere bazlı karşılaştırılmalıdır.',
      'İkinci ihtiyaç, kapsam büyüdükçe geçerlik argümanını güçlendirmektir. Her ders ve soru tipi için “hangi kanıt hangi öğrenme iddiasını destekler?” sorusu açıkça belgelenmeli; erişilebilirlik ve adalet uzman incelemesinin parçası olmalıdır. QTI gibi birlikte çalışabilirlik standartları, gerçek kurum entegrasyonu ihtiyacı doğduğunda conformance testleriyle ele alınabilir.',
      'Üçüncü ihtiyaç, önerilerin etkisini kontrollü biçimde ölçmektir. Adaptif seçim, tekrar zamanlaması veya öğretmen program önerisi kullanan öğrencilerde gözlenen gelişme doğrudan algoritmaya atfedilemez; başlangıç farkları ve bağlılık yanlılığı vardır. Önceden kayıtlı hipotezler, etik deney tasarımı, yeterli örneklem ve etki büyüklüğü–belirsizlik raporu olmadan “sistem başarıyı artırdı” denmemelidir.',
      'Dördüncü ihtiyaç, insan yönetişimini ürün ölçeğiyle birlikte büyütmektir. Alan uzmanları, ölçme-değerlendirme uzmanları, öğretmenler, erişilebilirlik uzmanları, güvenlik ve veri koruma sorumluları aynı yaşam döngüsünde rol almalıdır. İyi bir eğitim yapay zekâsı insanı denklemden çıkaran değil, uzman kararının kanıtını ve etkisini daha görünür kılan sistemdir.',
      '## Sonuç: Bilge Arena’nın ürünü soru değil, güvenilir bir sonraki adımdır',
      'Bilge Arena’nın dönüşümü daha fazla özellik eklemekten ibaret değildir. Asıl değişim, soruyu bir içerik kartı olmaktan çıkarıp ölçüm ve öğrenme kanıtına; cevabı puandan çıkarıp güncellenebilir öğrenci modeline; kurum panelini listeden çıkarıp açıklanabilir müdahale döngüsüne dönüştürmektir.',
      'Bu vizyonda yapay zekâ üretimi hızlandırır ama yayın kararını tek başına vermez. Adaptasyon öğrenciyi etiketlemez, bir sonraki uygun güçlüğü seçmeye çalışır. Kurumsal analitik gözetim üretmez, öğretmenin nerede ve neden destek vermesi gerektiğini görünür kılar. Bilimsel yaklaşım da büyük sözler söylemek değil; her iddiayı ölçülebilir kanıta, belirsizliğe, insan denetimine ve düzeltilebilir bir sürece bağlamaktır.',
      'Bilge Arena böylece basit bir soru sitesinden; öğrenci, öğretmen ve kurum için aynı temel soruya cevap arayan bir öğrenme altyapısına dönüşür: Elimizdeki kanıtla bugün ne biliyoruz, neyi henüz bilmiyoruz ve öğrenmeyi ilerletmek için sıradaki en güvenilir adım nedir?',
    ],
    sourceNote:
      'Bu inceleme, Bilge Arena’nın mevcut ürün ve kod sözleşmeleri ile aşağıdaki akademik ve kurumsal kaynaklar birlikte değerlendirilerek hazırlanmıştır. Kaynaklar tasarım ilkelerine dayanak sağlar; platformun her öğrenci için başarı garantisi verdiği anlamına gelmez.',
    sources: [
      {
        label: 'Cepeda ve diğerleri — Aralıklı çalışmanın 317 deneylik nicel sentezi (PubMed)',
        url: 'https://pubmed.ncbi.nlm.nih.gov/16719566/',
      },
      {
        label: 'Yang ve diğerleri — Sınıfta test etkisi, 48.478 öğrenci ve 222 çalışma (PubMed)',
        url: 'https://pubmed.ncbi.nlm.nih.gov/33683913/',
      },
      {
        label: 'McDermott — Aktif geri çağırmanın öğrenmedeki rolü (PubMed)',
        url: 'https://pubmed.ncbi.nlm.nih.gov/33006925/',
      },
      {
        label: 'Corbett ve Anderson — Knowledge Tracing araştırma kaydı (Carnegie Mellon University)',
        url: 'https://pact.cs.cmu.edu/corbett/corbettpubs.htm',
      },
      {
        label: 'ETS — Evidence-Centered Design in Assessment Development',
        url: 'https://www.ets.org/research/policy_research_reports/publications/chapter/2012/jogv.html',
      },
      {
        label: 'ETS — Bilgisayar tabanlı ve adaptif testler için pratik ilkeler',
        url: 'https://www.ets.org/Media/Research/pdf/CBT-2011.pdf',
      },
      {
        label: 'OECD — PISA ölçme ve uygulama araçları',
        url: 'https://www.oecd.org/en/about/programmes/pisa/pisa-survey-implementation-tools.html',
      },
      {
        label: '1EdTech — Question and Test Interoperability (QTI) standardı',
        url: 'https://www.1edtech.org/standards/qti/index',
      },
      {
        label: 'UNESCO IITE — Çevrim içi öğrenmede kişisel veri ve gizlilik rehberi',
        url: 'https://iite.unesco.org/publications/personal-data-and-privacy-protection-in-online-learning/',
      },
      {
        label: 'KVKK — Uzaktan eğitim platformlarında kişisel veri duyurusu',
        url: 'https://www.kvkk.gov.tr/Icerik/6723/Uzaktan-Egitim-Platformlari-Hakkinda-Kamuoyu-Duyurusu',
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
