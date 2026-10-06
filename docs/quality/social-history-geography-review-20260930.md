# Sosyal pilot: tarih/coğrafya kaynak incelemesi — 2026-09-30

## Kapsam ve teslim

Eski v3 pilotun `items` seçiminden **6 tarih + 6 coğrafya = 12/12 soru** incelendi. Güncel yerel dışa aktarımdaki 12 kök, 60 seçenek, işaretli anahtarlar ve 12 çözümün tamamı okundu; temsili soru/şık örneklemesi yapılmadı. Eski seçim ile güncel dışa aktarımın 12 kimlik–revizyon–hash üçlüsü eşleşiyor. Eski paket mevcut olduğundan seçim/hold fallback'i çalıştırılmadı; hold adayları eklenmedi.

Yeni kaynak task paketi `secure/social-pilot-reviewed-20260930/manifest.json`, run `ff2a7e7a-ab36-45d1-8bef-e1fa29199393`: 24 task girdisinin manifest karması salt okunur hesapla doğrulandı; bu incelemenin 12 üçlüsü yeni task girdileriyle de eşleşiyor. **Diğer 12 soru bu teslimde incelenmiş değildir.** Build/test/PG sonucu kaynak iddialarının doğruluğuna aktarılmadı.

Kamuya açık belge soru kökü, seçenek metni, işaretli cevap harfi veya çözümün tamamını yayımlamaz. Her soru için A–E'nin gerçek okuması, ayrı değerlendirmesi ve iddia/kaynak bağlantısı ignored `secure/social-review-history-geography.json` içindeki `reviews[questionId].perOptionReadings` ve `responses[questionId].optionChecks` bölümündedir. Toplam seçenek değerlendirmesi: 9 destekli, 41 elenmiş, 10 belirsiz. “Destekli” alt iddia, raporun/yayının onayı değildir.

Özel JSON, **12 gerçek `source-comparison@1` response nesnesi** içerir; main bunları yeni taskId eşlemesiyle `response.json` gövdelerine bağlayabilir. Task paketine yazılmadı. Kaynak erişim referansları ve gerçek kısa pasajların SHA-256 karmaları ayrı özel erişim kayıtlarında bulunur. Her eserden tek kez en fazla 18 kelimelik erişim izi tutuldu; karma analistin uydurduğu açıklamadan değil gerçekten alınan kesintisiz pasajdan hesaplandı. Bu kısa karma bütün kaynağı veya bütün iddia desteğini kriptografik olarak ispatlamaz; tam destek için aşağıdaki locator geçerlidir.

Erişimler 2026-09-30 oturumunda yapıldı. MGM/TKİ tarayıcı erişimi başarısız olduğunda **PDF becerisiyle** doğrudan bellek-içi PDF okumasına geçildi; fiziksel sayfa, gerçek pasaj ve PDF byte karması kaydedildi. ÇŞİDB planı erişilemediği için destek yapılmadı. Açık erişim ticari kopyalama yetkisi sayılmadı; doğrulanmayan lisanslar özel raporda açık tutuldu. Öğrenci yaş/kapsam notları incelemeci yargısıdır; güncel TYT kohortu, ÖSYM kitapçık eşleşmesi veya psikometrik kalibrasyon onayı değildir.

## Soru bazlı bulgular

### 01 — 047b296d-e962-4a7a-bbcd-e4b06dce343c (tarih)

Revizyon: `3c6ba9dc-d661-4416-bca3-3f4a1b298bfd`
İçerik SHA-256: `4b7b50defc31249f05bb8adad64ecfe4af0d4a0dbc38554a40adc31d69d63b8f`
İnceleme başlığı: Tanzimat kronolojisi.

Kaynaklar ve kesin locator:

- [Tanzimat](https://islamansiklopedisi.org.tr/tanzimat) — Ali Akyıldız / TDV İSAM; 2011. **Locator:** Gülhane töreni paragrafı, Hariciye Nâzırı Mustafa Reşid Paşa ile başlayan bölüm; çevrimiçi L109. Tören tarihi ve Abdülmecid'in törene katılımı birlikte belirtilir.
- [FRUS 1876, Maynard to Fish, document 310](https://history.state.gov/historicaldocuments/frus1876/d319) — US Department of State / Horace Maynard; 10 Ağustos 1876. **Locator:** FRUS 1876, yayımlanmış belge No.310; p.580 civarı, L33; Législation Ottoman 2, part 7 atfı. Diplomatik yazı 1839 ve 1856 fermanlarını ayrı tarihlerle kaydeder.
- [Tarih 11, ünite 4 ders materyali](https://ogmmateryal.eba.gov.tr/panel/upload/files/u5w0eiyqqeg.pdf) — MEB OGM; PDF'de baskı tarihi bu incelemede belirlenmedi. **Locator:** PDF fiziksel s.19/P18 Tanzimat Fermanı; fiziksel s.2/P1 ünite 4 kazanım listesi. Tarih 11 ünitesinde fermanlar ve anayasal değişim işlenir; anlatımdaki yakınlık nedeniyle TDV'den bağımsız ikinci tarih tanığı sayılmadı.
- [T.C. İnkılap Tarihi ve Atatürkçülük 12, ünite 2](https://tymm.meb.gov.tr/tc-inkilap-tarihi-ve-ataturkculuk-dersi-2/unite/11) — MEB Türkiye Yüzyılı Maarif Modeli; Güncelleme 25 Ağustos 2026. **Locator:** İTA.12.2.1, Öğrenme-Öğretme Uygulamaları, L138–140. Program siyasi inkılapların neden-sonuç incelemesini ister; tek tarih ezberi çıktının bütününü ölçmez.

**Kaynak bağımlılığı:** TDV sentezi ile daha eski ABD diplomatik kaydı iki farklı zincir. MEB tören anlatımı TDV'ye yakın olduğundan üçüncü bağımsız tanık sayılmadı.

**Şık incelemesi:** 5/5 seçenek ayrı ayrı okundu; 1 destekli, 4 elenmiş, 0 belirsiz. Sıralı A–E değerlendirmeleri ve her çeldiriciye özel gerekçeler özel JSON'un bu questionId kaydındadır; kamu belgesinde cevap harfi/metni açılmadı.

**Çözüm:** Tarih ve hükümdar bağlamı destekli. Belge adının standartlaştırılması ve neden-sonuçla zenginleştirme yararlı; salt tarih ezberi kapsamın tamamı değildir.

**Kapsam/yaş sınırı:** Tarih 11 modernleşme; TYMM İTA.12.2.1'de öncül süreç. Lise/15–18 yaş için uygun; güncel TYT kazanım-kohort eşleşmesi ve güçlük kalibrasyonu doğrulanmadı.

**Açık belirsizlik:** Hükümdar ve adlandırma ayrıntıları için ikinci bağımsız zincir tarih iddiası kadar güçlü değil.

**Önerilen değişiklik:** Olayı okuyan görevliyle hükümdarı ayıran kısa bağlam ekle; doğrulanmış tarihi koru.

### 02 — 06627231-3eac-4f99-b078-68c8207e08d6 (tarih)

Revizyon: `ae2f674e-7757-405c-95f5-00a15ebcf32b`
İçerik SHA-256: `74f750cd19e63a506fa1a90c13d13f966f3712e59015b3f7a2774ff3a6bb6c2c`
İnceleme başlığı: Saltanatın kaldırılması kronolojisi.

Kaynaklar ve kesin locator:

- [Siyasal Devrimler](https://atam.gov.tr/siyasal-devrimler/) — Atatürk Araştırma Merkezi; 27 Haziran 2023. **Locator:** Saltanat/cumhuriyet/halifelik kronolojisi paragrafı; L156. Saltanatın kaldırılması, cumhuriyet ve halifelik değişiklikleri farklı tarihlerdir.
- [Atatürk'ün 1 Mart 1923 açış konuşması](https://cdn.tbmm.gov.tr/TbmmWeb/tarihce/ataturk_konusma/1d4yy.htm) — TBMM / Mustafa Kemal; Konuşma 1 Mart 1923; MM Tutanak D.1 C.28 s.2; günümüz Türkçesi aktarımı. **Locator:** Efendiler, Zorlayıcı olayların... paragrafı; L144–146. Dönemin Meclis konuşması karar tarihini ve saltanata karşı niteliğini açıkça anlatır.
- [T.C. İnkılap Tarihi ve Atatürkçülük 12, ünite 2](https://tymm.meb.gov.tr/tc-inkilap-tarihi-ve-ataturkculuk-dersi-2/unite/11) — MEB Türkiye Yüzyılı Maarif Modeli; Güncelleme 25 Ağustos 2026. **Locator:** İTA.12.2.1, Öğrenme-Öğretme Uygulamaları, L138–140. Program siyasi inkılapların neden-sonuç incelemesini ister; tek tarih ezberi çıktının bütününü ölçmez.

**Kaynak bağımlılığı:** ATAM sentezi ve TBMM'nin döneme ait konuşma aktarımı ayrı eser zincirleridir; aynı devlet çatısı altında olmaları ayrı belge niteliklerini ortadan kaldırmaz. Özgün karar faksimilesi incelenmedi.

**Şık incelemesi:** 5/5 seçenek ayrı ayrı okundu; 1 destekli, 4 elenmiş, 0 belirsiz. Sıralı A–E değerlendirmeleri ve her çeldiriciye özel gerekçeler özel JSON'un bu questionId kaydındadır; kamu belgesinde cevap harfi/metni açılmadı.

**Çözüm:** Tarih ve karar organı doğrulandı; cumhuriyet/halifelik olaylarını ayıran kısa gerekçe öğretici olur.

**Kapsam/yaş sınırı:** İnkılap Tarihi lise/12. sınıf. Yaklaşık 16–18 yaş için tarihsel bağlamla uygun. 2026 program sayfasının mevcut TYT aday kohortuna uygulanması ayrıca kontrol edilmeli.

**Açık belirsizlik:** TBMM kaydı modern Türkçe konuşma aktarımıdır, kararın özgün sayfa görüntüsü değildir; program için bağımsız ikinci eşleşme yok.

**Önerilen değişiklik:** Saltanat, cumhuriyet ve halifeliği ayrı siyasi değişiklikler olarak kısa açıklamayla ayır.

### 03 — 04dfa65d-a677-4a43-a695-29c4ccbf56ad (tarih)

Revizyon: `a2ef58c2-5c47-48bf-be38-804b7b3dd61c`
İçerik SHA-256: `5df4f683511fbcc9d0d72a44bbf98aed57a038e29130ca00d0b202ad132eecae`
İnceleme başlığı: Selçuklu eğitim kurumları.

Kaynaklar ve kesin locator:

- [Nizâmiye Medresesi](https://islamansiklopedisi.org.tr/nizamiye-medresesi) — Abdülkerim Özaydın / TDV İSAM; 2007. **Locator:** Madde tanımı ve kuruluş paragrafları L69, L94–98. Kurucu himayesi, sultanların onayı ve kurum ağının sonradan sürmesi ayrılır; ilk medreseler oldukları iddiası reddedilir.
- [NEẒĀM-AL-MOLK](https://www.iranicaonline.org/articles/nezam-al-molk/) — Neguin Yavari / Encyclopaedia Iranica; 15 Eylül 2015; güncelleme 14 Mayıs 2018. **Locator:** Açılış tanımı L32, vezirlik L43; medrese himayesi bölümü L70–82. Vezirliğini ve medrese kuruculuğunu destekleyen ayrı bilimsel sentezdir; tüm özgün kronikler bağımsız değildir.
- [Tarih 9, Kavram Öğretimi, Nizamiye Medreseleri](https://ogmmateryal.eba.gov.tr/panel/upload/etkilesimli/kitap/kavram_calismalari/9y/tarih/files/basic-html/page291.html) — MEB OGM; Baskı tarihi incelenen HTML yaprağında belirlenmedi. **Locator:** Basılı s.288, HTML yaprağı 291; ünite 6.5, tanım L50–59. Lise Selçuklu eğitim kurumları kapsamına yerleştirir; TDV'ye çok yakın metin üçüncü bağımsız tanık sayılmadı.
- [Tuğrul Bey](https://islamansiklopedisi.org.tr/tugrul-bey) — Faruk Sümer / TDV İSAM; 2012. **Locator:** Madde tanımı L69; ölüm tarihi L124. Sultan kimliği ve 1063'te ölümü, sonraki Nizâmiye himayesiyle karıştırılmamalıdır.
- [Sencer](https://islamansiklopedisi.org.tr/sencer) — Abdülkerim Özaydın / TDV İSAM; 2009. **Locator:** Madde tanımı L69; Sancar ad varyantı L94. Hükümdar kimliği, doğumu ve ad varyantı kayıtlıdır; kurucu vezir ile aynı kişi değildir.

**Kaynak bağımlılığı:** Özaydın ve Yavari iki ayrı bilimsel sentezdir ancak İbnü'l-Cevzî/İbnü'l-Esîr gibi kronikleri paylaşır. MEB'nin yakın metni ek bağımsız zincir sayılmadı.

**Şık incelemesi:** 5/5 seçenek ayrı ayrı okundu; 1 destekli, 3 elenmiş, 1 belirsiz. Sıralı A–E değerlendirmeleri ve her çeldiriciye özel gerekçeler özel JSON'un bu questionId kaydındadır; kamu belgesinde cevap harfi/metni açılmadı.

**Çözüm:** Kurucu-hâmi çekirdeği destekli; sultan onayı ve ağın devamını tek kişinin bütün şubeleri kurması şeklinde genişletme. İlk medrese/ilk diploma gibi ek üstünlük iddiaları aktarılamaz.

**Kapsam/yaş sınırı:** Tarih 9 ünite 6.5, lise/14–18 yaş. Tek kişi ezberi kurum-toplum etkisini ölçmez; güçlük etiketi kalibre edilmiş değil.

**Açık belirsizlik:** Bir çeldiricinin kimliği belirsiz; biyografik detayların her biri iki bağımsız kaynakla tamamlanmış değil.

**Önerilen değişiklik:** Kimliği belirsiz çeldiriciyi açıkça tanımlı kişiyle değiştir; Nizâmülmülk yazımını standartlaştır; kurucu ve sultan rollerini ayır.

### 04 — 07085e94-be8c-4234-a3da-4b9cc77f5503 (tarih)

Revizyon: `58695d70-6f33-41a5-98c1-cc6a55f1e005`
İçerik SHA-256: `7c7d45e0ffd5f14bdb3cc6a71105bae7a92db3f35fae856c139423b9ecb9b82c`
İnceleme başlığı: Rönesansın coğrafi çerçevesi.

Kaynaklar ve kesin locator:

- [Early modern Europe: an introduction, 6.5 Knowledge and ideas](https://www.open.edu/openlearn/history-the-arts/early-modern-europe-introduction/content-section-6.5) — The Open University / OpenLearn; Sayfada sürüm tarihi bu incelemede belirlenmedi. **Locator:** New ideas altbaşlığı, ilk üç paragraf L172–176. İtalya merkezli yeniden keşif ve XIV–XV. yüzyıl hümanizmi anlatılır; dönem tek gün/yıl ile başlatılmaz.
- [Tarih 11, ünite 2, Rönesans ve Reform](https://ogmmateryal.eba.gov.tr/panel/upload/etkilesimli/kitap/tarih/11/unite2/files/basic-html/page7.html) — MEB OGM; Baskı tarihi incelenen yaprakta belirlenmedi. **Locator:** Basılı s.53; HTML yaprağı 7, ilk paragraf ve yayılma paragrafı L22–38. Coğrafi merkez sabit; bu materyal başlangıcı XV. yüzyıl sonu olarak çerçeveler, XIV. yüzyıl öncü çalışmaları ayrıca belirtir.
- [Sanat Tarihi 12, Avrupa Sanatı](https://ogmmateryal.eba.gov.tr/panel/upload/etkilesimli/kitap/sanattarihi/sec/unite1/files/basic-html/page134.html) — MEB OGM; Baskı tarihi incelenen yaprakta belirlenmedi. **Locator:** HTML yaprağı 134, 4. ünite Avrupa Sanatı, L22–24. Sanat tarihi çerçevesi XIV. yüzyıl sonunu kullanır; Tarih 11 dönem sınırıyla aynı değildir.

**Kaynak bağımlılığı:** OU ve MEB iki öğretim zinciridir. MEB Tarih ile MEB Sanat Tarihi aynı kurumsal zincir; farklı ders anlatımı üçüncü bağımsız tanık değildir.

**Şık incelemesi:** 5/5 seçenek ayrı ayrı okundu; 1 destekli, 4 elenmiş, 0 belirsiz. Sıralı A–E değerlendirmeleri ve her çeldiriciye özel gerekçeler özel JSON'un bu questionId kaydındadır; kamu belgesinde cevap harfi/metni açılmadı.

**Çözüm:** Coğrafi çekirdek destekli; çözümün dönem sınırı ders çerçevesine bağlı. MEB içinde XIV sonu ve XV sonu ifadeleri ayrışıyor; bu, coğrafi anahtarın yanlış olduğunu kanıtlamaz.

**Kapsam/yaş sınırı:** Tarih 11/Avrupa değişimi; sanat tarihi 12 seçmeli alternatif çerçeve. Lise/15–18 yaş; ortaçağ şehirleri ile bugünkü devlet haritası ayrılmalı.

**Açık belirsizlik:** Başlangıç dönemi bir tarih yazımı/ders çerçevesi sorunudur; tek yüzyıl için evrensel onay yok.

**Önerilen değişiklik:** Ülke yerine tarihsel coğrafya/İtalyan şehirleri ifadesini kullan; çözümde dönemlendirme çerçevesini belirt veya gerekli olmayan kesin yüzyılı kaldır.

### 05 — 0242f1e1-cb58-4d5e-88d2-a7384151aa5a (tarih)

Revizyon: `3b5a8ff9-8625-4d69-a38f-8df93c0358e4`
İçerik SHA-256: `034b71f54594badfc5f79ff9effb4c38fc2d646b059c527d7efb490e92d5d317`
İnceleme başlığı: Islahat ve barış diplomasisi.

Kaynaklar ve kesin locator:

- [Islahat Fermanı](https://islamansiklopedisi.org.tr/islahat-fermani) — Ufuk Gülsoy / TDV İSAM; 1999. **Locator:** İlan ve Paris Kongresi paragrafları L101–110; 18 Şubat / 25 Şubat / 30 Mart sıralaması. Fermanın ilanı Paris Kongresi ve barış antlaşmasından önce gelir; müttefik elçilerin diplomatik müdahalesi anlatılır.
- [FRUS 1887, Bayard to Straus, No.7 instruction](https://history.state.gov/historicaldocuments/frus1887/d687) — US Department of State / Thomas F. Bayard; 20 Nisan 1887. **Locator:** Basılı p.1099; Paris Antlaşması md.IX aktarımı ve sonraki paragraf L82–87. Diplomatik belge antlaşmanın Mart tarihini ve önceden ilan edilmiş fermanın Şubat tarihini birlikte kaydeder.
- [Islahat Fermanı](https://turkmaarifansiklopedisi.org.tr/islahat-fermani) — Selçuk Akşin Somel / Türk Maarif Ansiklopedisi; 18 Aralık 2022. **Locator:** İlk içerik paragrafı L139; kaynakça Gülsoy DİA XIX 185–190, L183. Savaşın bitimi bağlamını diplomatik konferans öncesiyle birlikte kullanır; Gülsoy'a doğrudan atıf nedeniyle üçüncü bağımsız zincir sayılmadı.
- [Balkan Savaşı](https://islamansiklopedisi.org.tr/balkan-savasi) — Cevdet Küçük / TDV İSAM; 1992. **Locator:** Madde tanımı L69; basılı c.5 s.23–25. Balkan savaşlarının tarih aralığı, 1856 ilanından sonraya düşer.
- [Millî Mücadele Dönemi, Birinci Dünya Savaşı ve Osmanlı Devleti](https://ata.msb.gov.tr/Sayfa/SayfaGoster/milli-mucadele-donemi) — T.C. Millî Savunma Bakanlığı; Sürüm tarihi sayfada belirlenmedi. **Locator:** Birinci Dünya Savaşı ve Osmanlı Devleti altbaşlığı, L81–89. Dünya savaşının tarih aralığı ve Osmanlı'nın katılımı daha sonraki döneme aittir.
- [Tarih 11, ünite 4 ders materyali](https://ogmmateryal.eba.gov.tr/panel/upload/files/u5w0eiyqqeg.pdf) — MEB OGM; PDF'de baskı tarihi bu incelemede belirlenmedi. **Locator:** PDF fiziksel s.19/P18 Tanzimat Fermanı; fiziksel s.2/P1 ünite 4 kazanım listesi. Tarih 11 ünitesinde fermanlar ve anayasal değişim işlenir; anlatımdaki yakınlık nedeniyle TDV'den bağımsız ikinci tarih tanığı sayılmadı.

**Kaynak bağımlılığı:** Gülsoy ile eski FRUS antlaşma aktarımı iki belge/sentez zinciri. Somel kaynakçada Gülsoy DİA maddesine açıkça dayanır; ayrı URL üçüncü bağımsız kanıt değildir.

**Şık incelemesi:** 5/5 seçenek ayrı ayrı okundu; 0 destekli, 3 elenmiş, 2 belirsiz. Sıralı A–E değerlendirmeleri ve her çeldiriciye özel gerekçeler özel JSON'un bu questionId kaydındadır; kamu belgesinde cevap harfi/metni açılmadı.

**Çözüm:** Yıl ve dış diplomasi bağlamı destekli; hukuki bitiş sonrası izlenimi veren sıra sözcüğü değişmeli. Fiilî çatışmaların sonu farklı anlamlandırılabilir; kaynakların geniş kullanımını saklamadan kaydettim.

**Kapsam/yaş sınırı:** Tarih 11 modernleşme, lise/15–18 yaş. Ayrıntılı diplomatik hukuk ezberi yerine kısa tarih şeridi/bağlam verilmesi uygun.

**Açık belirsizlik:** Fiilî/hukuki savaş sonu ayrımı ve tarihsiz savaş çeldiricisi açık. Baskı iddiasında Somel-Gülsoy bağımlılığı nedeniyle iki bağımsız zincir eksik.

**Önerilen değişiklik:** İlanı Paris barış görüşmelerine hazırlık ve müttefik diplomasisi bağlamında sor; belirsiz savaş çeldiricisine yıl ver.

### 06 — 0a252698-7cac-425f-a52f-83ca057e2188 (tarih)

Revizyon: `f6d9f69c-1fa3-45fa-a40e-7e2f031f2d9a`
İçerik SHA-256: `ae5ef16dbd946000524e8d1624281b69771e32a0863266d7cf3287a97e55e1b4`
İnceleme başlığı: Westphalia ve egemenlik yorumu.

Kaynaklar ve kesin locator:

- [Tarih 11 Kavram Öğretimi, Geleneksel Devletten Modern Devlete](https://ogmmateryal.eba.gov.tr/panel/upload/etkilesimli/kitap/kavram_calismalari/11/tarih/files/basic-html/page10.html) — MEB OGM; Baskı tarihi incelenen yaprakta belirlenmedi; Leo Gross'un 300. yıl değerlendirmesine atıf. **Locator:** Basılı s.7; HTML yaprağı 10, L29–45. Modern devlet anlatımı ile XV–XVI. yüzyıl öncülleri birlikte bulunur; ulus-devletin bir anda doğduğu hükmü değildir.
- [Sovereignty, International Relations, and the Westphalian Myth](https://library.fes.de/libalt/journals/swetsfulltext/10676369.pdf) — Andreas Osiander / International Organization 55(2); 2001, pp.251–287; DOI 10.1162/00208180151140577. **Locator:** Basılı s.270/P19; s.272–273/P21–22; Landeshoheit ve ittifak sınırlaması. Egemen devlet sisteminin kuruluşu anlatımına doğrudan karşı çıkar; Alman imparatorluk kurumları ve sınırlı bölgesel yetkiyi ayırır.
- [Peace Treaty between Holy Roman Emperor and King of France](https://avalon.law.yale.edu/17th_century/westphal.asp) — Yale Law School / Avalon Project; 24 Ekim 1648 antlaşmasının İngilizce aktarımı; aktarım sürüm tarihi belirlenmedi. **Locator:** Başlık/başlangıç; md.LXIV–LXV, L227–232; yalnız Münster kolu. İttifak kurma hakkı imparator ve imparatorluk karşıtı olmama koşuluyla tanınır; sınırsız ve evrensel devlet egemenliği yazılı değildir.
- [Sovereignty](https://plato.stanford.edu/entries/sovereignty/) — Daniel Philpott / Stanford Encyclopedia of Philosophy; Revizyon 17 Eylül 2024. **Locator:** §1 egemenlik/ulus ayrımı; §2 Rise of the Sovereign State, L63–67. Uzun dönem dönüşümü ve tarih yazımı tartışmasını belirtir; modern devlet ile ulus-devlet eşanlamlı değildir.
- [The Crusades (1095–1291)](https://www.metmuseum.org/essays/the-crusades-1095-1291) — Metropolitan Museum of Art, Department of Medieval Art and The Cloisters; Ekim 2001; revizyon Şubat 2014. **Locator:** Son iki tarih paragrafı, L173–174. Latin Haçlı krallıkları döneminin bitişi daha erkendir; sonraki haçlı çağrılarının varlığını da belirtir.
- [The Rise and Fall of the Slave Trade](https://www.open.edu/openlearn/history-the-arts/history/the-rise-and-fall-the-slave-trade) — Will Hardy / The Open University; Güncelleme 1 Mart 2019. **Locator:** The Rise of the Atlantic Slave Trade, L91–94. 1648'den önce Avrupa kolonileri ve XVI. yüzyıl emek ticareti vardır; evrensel ilk sömürge tarihi iddiası yapılmaz.
- [World History Volume 2, §6.1 European Colonization in the Americas](https://openstax.org/books/world-history-volume-2/pages/6-1-european-colonization-in-the-americas) — Rice University / OpenStax; Baskı yılı/sürüm incelenen bölümde doğrulanmadı. **Locator:** Spain's Encomienda System L34–48; English Settlements L83–95. XVI. yüzyıl İspanyol kolonileri ve 1587/1607 İngiliz yerleşimleri karşı örnek sağlar.

**Kaynak bağımlılığı:** MEB/Gross öğretim geleneği, Osiander hakemli eleştirisi, Yale antlaşma aktarımı ve Philpott sentezi dört ayrı eser. Aynı antlaşma nesnesi ortak, MEB'nin alıntıladığı Gross özgün makalesi okunmuş sayılmadı; yeni iki kolonizasyon kaynağı yalnız ayrı çeldirici elemesini destekler.

**Şık incelemesi:** 5/5 seçenek ayrı ayrı okundu; 0 destekli, 2 elenmiş, 3 belirsiz. Sıralı A–E değerlendirmeleri ve her çeldiriciye özel gerekçeler özel JSON'un bu questionId kaydındadır; kamu belgesinde cevap harfi/metni açılmadı.

**Çözüm:** Kesin doğuş anlatımı revize edilmeli. Osiander güçlü karşı görüşü ile Philpott'un kısmi pekişme yorumu aynı sonuç değildir; çoğunluk oyu ile antlaşma metninin sınırları aşılmadı.

**Kapsam/yaş sınırı:** Tarih 11 kavram materyali; lise/15–18 yaş. Uluslararası ilişkiler tarih yazımı tartışması bağlamsız tek şık ezberinden daha karmaşık; uzmanlık seviyesindeki yorum köke koşul olarak konmalı.

**Açık belirsizlik:** Anahtarın literal ifadesi tartışmalı; iki başka çeldirici için doğrudan eleme kanıtı tamamlanmadı. Dört farklı eser dört bağımsız birincil olay tanığı değildir.

**Önerilen değişiklik:** Klasik ders anlatımına göre yorum sorulduğunu belirt veya antlaşmanın somut hak/ittifak hükümlerine dön; modern devlet ile ulus-devleti ayır; çözümde bir anda doğuş ifadesini kaldır.

### 07 — 001ac68f-847e-4e91-afb3-60c752ac9c71 (cografya)

Revizyon: `39be3bad-30b9-4006-af81-6ff8085c3cfd`
İçerik SHA-256: `7c02e4bc339e54a34ecedfbb1a9e4dbb0e2737f6014258ab87f7617ad21ecaa9`
İnceleme başlığı: Harita ölçeği ve boyut denetimi.

Kaynaklar ve kesin locator:

- [Coğrafya 9, Harita Bilgisi](https://ogmmateryal.eba.gov.tr/panel/upload/etkilesimli/kitap/cografya/9/usak/unite1/bolum345/files/basic-html/page25.html) — MEB OGM; Baskı tarihi incelenen yaprakta belirlenmedi. **Locator:** Basılı s.71; HTML yaprağı 25, ölçek tanımı/şema ve birim dönüşümü L32–67. Kesir ölçeğinde aynı birimler kullanılır; santimetre-kilometre dönüşümüyle hesap denetlenebilir.
- [The Nature of Geographic Information, Chapter 2, §4 Map and Photo Scale](https://courses.ems.psu.edu/natureofgeoinfo/node/1674) — David DiBiase ve katkıcılar / Penn State; Sayfada sürüm tarihi belirlenmedi. **Locator:** §4, L19–24 oran/representative fraction; L31–35 harita ve hava fotoğrafı ayrımı. Oran aynı uzunluk birimleri arasında tanımlanır; hava fotoğrafındaki değişken ölçek koşulu harita sorusuna taşınmaz.

**Kaynak bağımlılığı:** MEB ve Penn State ayrı yazar/öğretim zincirleri; aynı evrensel oran kuralının hesapla uygulanması.

**Şık incelemesi:** 5/5 seçenek ayrı ayrı okundu; 1 destekli, 4 elenmiş, 0 belirsiz. Sıralı A–E değerlendirmeleri ve her çeldiriciye özel gerekçeler özel JSON'un bu questionId kaydındadır; kamu belgesinde cevap harfi/metni açılmadı.

**Çözüm:** Sayısal hesap ve bütün çeldiricilerin birim/faktör denetimi tamamlandı. Uzunluk oranı alan ölçeği değildir.

**Kapsam/yaş sınırı:** Coğrafya 9, lise/14–18 yaş ve temel orantı/birim dönüşümü. Düzlem/harita uzaklığı; yürüyüş yolu veya eğimli arazi mesafesi değildir.

**Açık belirsizlik:** Matematik çekirdeğinde açık belirsizlik yok; güncel TYT program-kohort eşleşmesi ve psikometrik güçlük ayrıca doğrulanmadı.

**Önerilen değişiklik:** Çözümde santimetre-kilometre dönüşümünü açık yaz; ölçülen harita uzaklığını arazi yol uzunluğuna genelleme.

### 08 — 012b4b35-0eb2-4c7e-9011-99bcd1df2fc7 (cografya)

Revizyon: `3e2e602e-db43-43b9-9864-efd534b03a7b`
İçerik SHA-256: `caeb51fa1f245c799caf79e8e35acb40e9b17b8babf39141b4a614e6d576dac0`
İnceleme başlığı: Kömür envanteri ve sınıflandırma.

Kaynaklar ve kesin locator:

- [Kömür, Bilgi Merkezi / Tabii Kaynaklar](https://enerji.gov.tr/bilgimerkezi-tabiikaynaklar-komur) — T.C. Enerji ve Tabii Kaynaklar Bakanlığı; Güncelleme 30 Haziran 2026; 2025 üretim/tüketim verileri. **Locator:** Türkiye kaynakları paragrafı L156, üretim L182, tüketim L199. Linyit ve asfaltit toplamı taşkömüründen büyük; bu sayı salt linyit rezervi değil kömür kaynağıdır.
- [Kömür Sektör Raporu 2023](https://webim.tki.gov.tr/file/b536fb25-9a0b-4c41-84b0-4ed37a1a51f2?download=) — Türkiye Kömür İşletmeleri; Rapor adı 2023; ilgili metinde MTA 2024 güncellemesi. **Locator:** Basılı s.55–56, PDF fiziksel s.69–70, kaynak/rezerv uyarısı ve Şekil 43. Kaynakların tümünün rezerv olmadığı açık; Şekil 43 linyit, asfaltit ve taşkömürünü ayrı gösterir.
- [Coal explained, Types of coal](https://www.eia.gov/energyexplained/coal/) — US Energy Information Administration; Güncelleme 24 Ekim 2023; incelenen örnekler 2022 ABD üretimi. **Locator:** Types of coal, L293–311. Dört kömür rankı ayrılır; ABD örnekleri Türkiye rezerv sıralamasının kanıtı olamaz.
- [Coğrafya 11, Beşerî Sistemler / Madenler](https://ogmmateryal.eba.gov.tr/panel/upload/etkilesimli/kitap/cografya/11/unite2/bolum2/files/basic-html/page62.html) — MEB OGM; İlgili sayfa 2017 üretim verisi kullanır; baskı tarihi belirlenmedi. **Locator:** Basılı s.138, HTML yaprağı 62, L22–41; petrol/gaz L42–72. Başlıca çıkarım yerleri ve ekonomik kullanım anlatılır; tarihli üretim/işletilebilirlik verisi güncel rezerv sayısı değildir.

**Kaynak bağımlılığı:** ETKB ve TKİ aynı MTA/TTK/TKİ ulusal veri zinciri: iki URL iki bağımsız rezerv ölçümü değildir. EIA bağımsız sınıflandırma kaynağıdır, Türkiye miktar sıralamasının ikinci kanıtı değildir; MEB'nin ulusal veriden bağımsız ölçümü gösterilmedi.

**Şık incelemesi:** 5/5 seçenek ayrı ayrı okundu; 0 destekli, 1 elenmiş, 4 belirsiz. Sıralı A–E değerlendirmeleri ve her çeldiriciye özel gerekçeler özel JSON'un bu questionId kaydındadır; kamu belgesinde cevap harfi/metni açılmadı.

**Çözüm:** Yatak örnekleri kısmen destekli; kaynak/rezerv ayrımı, ayrı ranklar, mutlak yer ifadesi ve kendine yeterlilik genellemesi revizyon gerektirir.

**Kapsam/yaş sınırı:** Coğrafya 11 ekonomik kaynaklar. Lise/15–18 yaş için miktar/kalite ayrımıyla uygun; TYT 9–10 kapsamı varsayılamaz.

**Açık belirsizlik:** Saf linyit, asfaltit toplamı değildir; rapor başlığı 2023 olsa da ilgili veri MTA 2024 güncellemesini içerir. Ayrı antrasit/alt bitümlü ekonomik rezerv tablosu ve bağımsız ikinci ulusal envanter bulunmadı.

**Önerilen değişiklik:** Yıl ve ölçüt belirt; kaynak büyüklüğünü ekonomik rezerv diye adlandırma; asfaltiti ayrı tut; kendine yeterlilik ve sadece ifadelerini destek olmadan kaldır.

### 09 — 037513bd-aea9-4818-ba56-2c565f0996a4 (cografya)

Revizyon: `8be87223-a9c4-4b08-9e52-ade7e5496976`
İçerik SHA-256: `744d83773933144fbb9f606cceb4f48bf10f229017dc9c2833b37f7ebff9ed5c`
İnceleme başlığı: Göl özellikleri ve değişken su alanı.

Kaynaklar ve kesin locator:

- [Disappearing Lake Tuz](https://science.nasa.gov/earth/earth-observatory/disappearing-lake-tuz-149211/) — NASA Earth Observatory; 16 Aralık 2021. **Locator:** Göl tanımı ve Landsat zaman serisi açıklaması L268–274; 1985–2016 Ağustos karşılaştırması. İç Anadolu'daki kapalı tuzlu gölün su yüzeyi küçülmesini anlatır; tarihsel büyüklük sırası bugünkü sürekli su alanı değildir.
- [Aksaray Kültür Envanteri, İlçeler / Tuz Gölü](https://aksaray.ktb.gov.tr/Eklenti/7712,ilcelertoplupdf.pdf?0=) — Aksaray İl Kültür ve Turizm Müdürlüğü; 2009 envanteri; bazı idari bilgiler eski. **Locator:** Basılı/PDF fiziksel s.42–43 (P41–42); Tuz Gölü paragrafı L818–841. Sığlık ve tuz üretimini destekler; Niğde ifadesi idari tarihte eski bilgiye işaret eder, bütün sayfa güncel kabul edilemez.
- [Coğrafi Konum, Tuz Gölü paragrafı](https://konya.ktb.gov.tr/TR-370533/cografi-konum.html) — Konya İl Kültür ve Turizm Müdürlüğü; Sürüm tarihi sayfada belirlenmedi. **Locator:** Tuz Gölü paragrafı L121. Derinlik sayısı Aksaray'dakinden farklı; yer/mevsim/ortalama-maksimum ölçütü eşleşmeden doğrudan çelişki denemez.
- [Tuz Gölü ÖÇKB Yönetim Planı 2024–2028](https://webdosya.csb.gov.tr/db/tabiat/icerikler/tuz-golu-ockb-yonetim-plani-20250205122543.pdf) — Çevre, Şehircilik ve İklim Değişikliği Bakanlığı; Dosya yolu tarih etiketi 5 Şubat 2025. **Locator:** İlgili fiziksel sayfa doğrulanamadı. Tarayıcı ve doğrudan erişim başarısız; içerik destek sayılmadı. İçerik okunmadı; olumlu destek ve metin karması yok.

**Kaynak bağımlılığı:** NASA/Landsat-Aydın–Kandemir zaman serisi ile KTB coğrafya anlatısı iki farklı zincir. Aksaray ve Konya aynı KTB grubu; birbirinin ikinci bağımsız hidrolojik ölçümü değildir.

**Şık incelemesi:** 5/5 seçenek ayrı ayrı okundu; 1 destekli, 4 elenmiş, 0 belirsiz. Sıralı A–E değerlendirmeleri ve her çeldiriciye özel gerekçeler özel JSON'un bu questionId kaydındadır; kamu belgesinde cevap harfi/metni açılmadı.

**Çözüm:** Bölge/tuzluluk ve tuz üretimi destekli; sığlık envanterde açık. Derinlik sayıları farklı fakat aynı yer/mevsim/ortalama-maksimum ölçütü doğrulanmadığı için doğrudan çelişki/yanlışlık hükmü kurulmadı. Büyüklük sırası güncel su yüzeyiyle özdeşleştirilmemeli.

**Kapsam/yaş sınırı:** Lise doğal sistemler/Türkiye fiziki coğrafyası; 14–18 yaş için uygun nitel karşılaştırma. Güncel kazanım kodu bu kaynaklarla doğrulanmadı; göl kimyası soda/tuz ayrımı ek veri gerektirir.

**Açık belirsizlik:** ÇŞİDB 2024–2028 yönetim planı hem tarayıcı hem doğrudan TLS erişiminde okunamadı. Eski Aksaray envanterinde Niğde idari ifadesi var; sayfa bütünü güncel sayılamaz.

**Önerilen değişiklik:** Büyüklük ifadesine tarih ve göl çanağı/su alanı ölçütü ekle veya gereksiz sıralamayı kaldır. Nitel sığlık için güncel uzman hidrometri doğrulaması iste; çelişik metre sayısını ekleme.

### 10 — 03fe7fa3-0a45-4d73-bce5-c0bebf9d1272 (cografya)

Revizyon: `cb5128cf-1e71-47b6-8b9a-f628476be856`
İçerik SHA-256: `ec200d257a1b6430887543569179ac6b756509263ca4e608d302cb546626e0d3`
İnceleme başlığı: Yağışın dönem ve mekân ölçeği.

Kaynaklar ve kesin locator:

- [2025 Yılı Alansal Yağış Değerlendirmesi](https://www.mgm.gov.tr/FILES/arastirma/yagis-degerlendirme/2025yagisdegerlendirmesi.pdf) — Meteoroloji Genel Müdürlüğü; 2025 değerlendirmesi; normal dönem 1991–2020. **Locator:** PDF fiziksel/basılı s.9, Tablo 2, Normal (1991–2020) sütunu; 2025 sütunundan ayrı. Bölge ortalamaları yalnız normal dönem sütunundan kıyaslandı; istasyon maksimumu ile bölge ortalaması ayrıldı.
- [Resmî İklim İstatistikleri, Rize](https://www.mgm.gov.tr/veridegerlendirme/il-ve-ilceler-istatistik.aspx?m=RIZE) — Meteoroloji Genel Müdürlüğü; Ölçüm periyodu 1927–2025. **Locator:** Aylık Toplam Yağış Miktarı Ortalaması (mm), L149–157. Aylık ortalamaların toplamı eşik iddiasını destekler; tüm il alanı ortalaması ve 81 il sırası kanıtlanmış değildir.
- [Coğrafya 9 Telafi, Yağış](https://ogmmateryal.eba.gov.tr/panel/upload/etkilesimli/kitap/elazig-telafi/cografya/files/basic-html/page37.html) — MEB OGM; Baskı tarihi incelenen HTML yaprağında belirlenmedi. **Locator:** HTML yaprağı 37, Yağış L25–35. Kıyıya paralel dağlar/nemli hava ve yağış farkları açıklanır; yaklaşık şehir verilerinin özgün ölçüm bağımsızlığı gösterilmez.

**Kaynak bağımlılığı:** MGM bölge PDF'si ile Rize tablosu tek kurum/veri zinciridir. MEB ayrı oluşum açıklaması sağlar; sayısal sıralama için bağımsız ikinci ölçüm değildir.

**Şık incelemesi:** 5/5 seçenek ayrı ayrı okundu; 1 destekli, 4 elenmiş, 0 belirsiz. Sıralı A–E değerlendirmeleri ve her çeldiriciye özel gerekçeler özel JSON'un bu questionId kaydındadır; kamu belgesinde cevap harfi/metni açılmadı.

**Çözüm:** Bölgesel normal tablosu doğrulandı; Rize istasyon eşiği hesaplandı. İstasyon, il alanı, kıyı kuşağı ve bölge ortalaması farklı ölçektir; tüm iller sırası ayrı veri ister.

**Kapsam/yaş sınırı:** Coğrafya 9 iklim/yağış; lise/14–18 yaş. Dönemli tablo okumayla uygun, coğrafi bölgeyi tek il veya kıyı kesimine indirgememe koşulu gerekli.

**Açık belirsizlik:** Sayısal sıralama için yalnız bir bağımsız MGM veri zinciri bulundu. İstasyon periyodu 1927–2025, bölge normali 1991–2020; aynı dönem gibi birleştirilemez.

**Önerilen değişiklik:** Köke uzun dönem ortalama ve normal dönem ekle; çözümde il/istasyon ve bölge ortalamasını ayır; kanıtlanmamış tüm-il birinciliği cümlesini kaldır veya alansal tablo ekle.

### 11 — 009b1d85-a2b7-481c-93b8-b12a98fdacde (cografya)

Revizyon: `e821eacd-bad8-41a6-8438-9db22ef1ef0f`
İçerik SHA-256: `cc9fb21daf114432f7b9cd47119e98523c82ae8f89e384d9acc46ec8338c0890`
İnceleme başlığı: Türkiye uç noktası ve il sınırı.

Kaynaklar ve kesin locator:

- [Coğrafya, Iğdır Ovası / Dil Ucu](https://igdir.ktb.gov.tr/TR-55671/cografya.html) — Iğdır İl Kültür ve Turizm Müdürlüğü; Sürüm tarihi belirlenmedi; koordinat metni tipografik '440 48'. **Locator:** Dil Ovası (Dil Ucu) son paragrafı L67. İl/dilucu tanımı desteklidir; koordinat kaynakta tipografik aktarılmış, jeodezik datum bilgisi yok.
- [Sınır hattındaki meralar besicilikte değerlendiriliyor](https://www.tarimtv.gov.tr/tr/video-detay/sinir-hattindaki-meralar-besicilikte-degerlendiriliyor-17506) — Tarım TV / TİGEM Iğdır İşletmesi Müdürü Yusuf Yılmaz; 20 Haziran 2023. **Locator:** Yusuf Yılmaz'ın Dilucu açıklaması, metin L80. İşletme yöneticisinin yerel alan tanıklığı Dilucu'yu doğrular; videonun tamamı izlenmiş veya sınır ölçümü yapılmış değildir.
- [Coğrafya 9, Türkiye'nin Coğrafi Konumu](https://ogmmateryal.eba.gov.tr/panel/upload/etkilesimli/kitap/cografya/9/usak/unite1/bolum345/files/basic-html/page13.html) — MEB OGM; Baskı tarihi incelenen yaprakta belirlenmedi. **Locator:** Basılı s.59, HTML yaprağı 13, mutlak konum L30–32. Lise mutlak konum kapsamını doğrular; yuvarlak boylam aralığı ayrıntılı uç nokta koordinatının ikinci ölçümü değildir.

**Kaynak bağımlılığı:** KTB bölgesel coğrafya metni ile TİGEM yöneticisinin Tarım TV saha açıklaması ayrı anlatı zincirleri; ikinci bağımsız hassas koordinat ölçümü sayılmaz.

**Şık incelemesi:** 5/5 seçenek ayrı ayrı okundu; 1 destekli, 4 elenmiş, 0 belirsiz. Sıralı A–E değerlendirmeleri ve her çeldiriciye özel gerekçeler özel JSON'un bu questionId kaydındadır; kamu belgesinde cevap harfi/metni açılmadı.

**Çözüm:** İl ve Dilucu aidiyeti doğrulandı; derece-dakika ayrıntısı tek resmi anlatıya bağlı, datum/hassasiyet belirtilmedi.

**Kapsam/yaş sınırı:** Coğrafya 9 mutlak konum, lise/14–18 yaş. Harita okuma hedefi uygun; derece-dakika ezberini 'zor' diye etiketlemek kalibrasyon değildir.

**Açık belirsizlik:** İki kurum anlatısı jeodezik sınır taraması değildir; kesin koordinat için HGM/sınır veri sürümü ayrıca gereklidir.

**Önerilen değişiklik:** Çözümü noktanın adı ve il aidiyetiyle sınırla veya koordinatı yaklaşık ve datumlu kaynakla ver; harita okuma bağlamı ekle.

### 12 — 09a2539c-2a23-45f8-ba40-46e9f11afc90 (cografya)

Revizyon: `47e420db-a154-4898-b885-8bcfb9b4c60e`
İçerik SHA-256: `07d949dcc8f917ee5124a27ba0625709514841a6abfc1c270a9aa1e4477743a2`
İnceleme başlığı: Delta oluşumu ve süreç ayrımı.

Kaynaklar ve kesin locator:

- [Defterim Coğrafya 10, Akarsu Biriktirme Şekilleri](https://ogmmateryal.eba.gov.tr/panel/upload/etkilesimli/kitap/defterim/10/cografya/files/basic-html/page37.html) — MEB OGM; Baskı tarihi yaprakta belirlenmedi. **Locator:** Basılı s.35, HTML yaprağı 37, delta tanımı L22–25. Oluşumu akarsu alüvyonunun uygun kıyı koşullarında birikmesiyle tanımlar.
- [Coğrafya 10, ünite 1, Deltalar](https://ogmmateryal.eba.gov.tr/panel/upload/etkilesimli/kitap/cografya/10/unite1/files/basic-html/page50.html) — MEB OGM; Baskı tarihi yaprakta belirlenmedi. **Locator:** Basılı s.60, HTML yaprağı 50, L64–73; gelgit ve Türkiye örnekleri. Türk delta örneklerinin akarsu eşleşmelerini ve kıyı koşullarını belirtir; aynı MEB zincirindeki ikinci kitap bağımsız ikinci süreç tanığı değildir.
- [Sediment diagram, from source to sink](https://www.usgs.gov/media/images/sediment-diagram-source-sink) — USGS Pacific Coastal and Marine Science Center / Skagit Climate Science Consortium; Sayfanın özgün yayım tarihi belirlenmedi; bağlantılı çalışma 15 Aralık 2020. **Locator:** Detailed Description, Source/Transport/Sink metni L13; Sources/Usage L14–16. Bağımsız havzada taşınan sedimentin deltada birikmesini gösterir; Türk ova adlarını kanıtlamaz.

**Kaynak bağımlılığı:** MEB tanımı ile USGS/Skagit sediment anlatısı bağımsız süreç zincirleridir. İki MEB kitap yaprağı aynı öğretim grubu; Türk örnekleri için iki bağımsız kaynak sayılmaz.

**Şık incelemesi:** 5/5 seçenek ayrı ayrı okundu; 1 destekli, 4 elenmiş, 0 belirsiz. Sıralı A–E değerlendirmeleri ve her çeldiriciye özel gerekçeler özel JSON'un bu questionId kaydındadır; kamu belgesinde cevap harfi/metni açılmadı.

**Çözüm:** Genel mekanizma iki zincirde destekli; üç Türkiye örneği ayrı ayrı MEB'de okundu, USGS'nin Skagit örneği bunların ikinci coğrafi kanıtı değildir.

**Kapsam/yaş sınırı:** Coğrafya 10 dış kuvvetler/yer şekilleri, lise/14–18 yaş. Aşındırma-taşınma-birikme ayrımı uygun; delta bütün ağızlarda otomatik oluşmaz.

**Açık belirsizlik:** Türk örneklerinin ikinci bağımsız yerel jeomorfoloji kaynağı yok; kıyı koşulları eksik bırakılırsa aşırı genelleme riski var.

**Önerilen değişiklik:** Alüvyonun dalga/akıntıyla uzaklaştırılmayıp birikebildiği uygun kıyı koşulunu kısa ekle; tüm deltaların yalnız tek dış etkene kapalı olduğu izlenimini verme.

## Sonuç ve açık kalan işler

Araştırma okuma kapsamı **12 soru / 60 seçenek / 12 çözüm** olarak tamamlandı; kaynak iddialarının tamamı veya 24 soruluk pilotun tamamı onaylanmadı. Somut öncelikler: barış-ilan sırasının yeniden yazımı, egemenlik/ulus-devlet genellemesinin sınırlandırılması, kömür kaynak–rezerv/rank ayrımı, göl alanının tarihlendirilmesi, yağışın normal dönem ve mekân ölçeğinin belirtilmesi. Kimliği belirsiz çeldirici ve tek zincirli çözüm ayrıntıları özel raporda iddia bazında açık kaldı.

Müfredat için ders materyali ile yürürlükteki kazanım/kohort ayrıldı. Her iddia için iki bağımsız grup yokken `evidence_complete` ilan edilmedi. Diğer kategorilerin 12 sorusu ve bunların makine kaynak kapısı main'in ayrı teslimleriyle birleşmeden toplam 24 için tamlık iddiası yapılamaz.

Çalışma yalnız bu kamu raporu ve izin verilen ignored özel JSON'a yazı içerir; kod, DB, manifest/task girdileri ve commit değişmedi. Şema doğrulama sonuçları özel JSON'un `validation` bölümünde, bağlam/kanıt eksiklikleri response nesnelerinin `limitations` ve `unverified` kayıtlarındadır.

### Son doğrulama — 2026-10-01

`source-comparison@1` şemasında 12/12 response geçerli; eksik 0, geçersiz 0. Son `evaluateSourceComparison` sonucu: **4 conflicting_evidence, 8 insufficient_evidence, 0 evidence_complete**. 60/60 özgün seçenek metni güvenli dışa aktarımla eşleşti; 12 revizyon/karma ve yeni task eşleşmesi ile 24 manifest girdi karması doğrulandı. 45 erişim kaydının 44'ünde gerçek kısa pasaj karması var; erişilemeyen 1 kayıtta boş karma destek sayılmadı. Tüm dolu pasaj karmaları yeniden hesaplanıp doğrulandı; eser başına en fazla 18 kelime.

Kesin karşı kaynak/çerçeve uyuşmazlığı, eksik bağımsız destek ve belirsiz seçenek ayrı kayıtlandı. Tuz Gölü'ndeki farklı derinlik sayıları aynı yer/mevsim/ortalama-maksimum ölçütünde doğrulanamadığından kesin çelişki sayılmadı. Kömür kaydının adapter çelişki statüsü, doğrulanmış ters rezerv sıralaması değil, destekli tek seçeneğin kanıtlanamamasıdır. Rönesans kaydı da farklı dönem çerçeveleridir; coğrafi çekirdeğin yanlışlığı değildir.

Main'in daha önce kopyaladığı 5 çelişkili / 7 yetersiz sürüm son anlamsal ayrımı içermez; birleşik toplam güncel `responses` yeniden bağlanınca hesaplanmalı. Yayın yetkisi verilmedi. Kapsam bu teslimin tarih/coğrafya 12 sorusudur; diğer 12'nin ayrı araştırması hakkında sonuç verilmez.
