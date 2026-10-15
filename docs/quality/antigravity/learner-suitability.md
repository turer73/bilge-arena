# Hedef öğrenciye uygunluk — ikinci geçiş yönergesi

Sürüm: learner-suitability@1. Amaç soru tasarımını değerlendirmektir; öğrenciyi
tanılamak, kişilik/zekâ/ruh sağlığı profili çıkarmak veya kapasitesini sınırlamak değildir.

## Hedef bağlam

Sınav, sınıf, müfredat/kazanım, öğretim dili, kullanım amacı (öğrenme/ölçme/kalite
görevi), gerekli ön bilgiler ve varsa editörün bildirdiği hedef yaş aralığını kaydet.
Yaş bilinmiyorsa unknown yaz; TYT/YKS etiketinden kesin yaş veya yetişkin/çocuk
kimliği türetme. Yaş bilgisini değerlendirmek için doğum tarihi veya hassas kullanıcı
verisi toplama. Sınıf/ön bilgi ile yaş ayrı alanlardır. Hedef bağlam eksikse doğruluk
kontrolünü sürdürebilirsin, fakat yaşa uygunluk hakkında kesin hüküm veremezsin.

## Altı ayrı boyut

Her boyutta durum, somut metin/şık kanıtı, gerekçe, kaynak veya çıkarım etiketi ve
en küçük düzeltme önerisi ver. Durumlar: no_issue_identified, concern,
insufficient_evidence, not_applicable. No_issue_identified yalnız incelenen kapsam
içindir; bilimsel veya klinik güvenlik garantisi değildir.

1. Ön bilgi/kazanım: çözüm için gereken kavramlar hedef bağlamda öğretilmiş mi?
2. Dil/okuma yükü: gereksiz uzunluk, dolaylı yönerge, çoklu olumsuzluk ve alan dışı
kelimeler hedef becerinin önüne geçiyor mu? Her uzun soru hatalı değildir.
3. Bilişsel yük: gerekli çıkarım adımları, aynı anda izlenen koşullar, tablo–metin
geçişleri; hedeflenen zorluk ile gereksiz yükü ayır. Adım sayısı çalışma belleği
ölçümü değildir; yaşa göre evrensel bellek kapasitesi veya kesin kelime sınırı uydurma.
4. Duygusal uygunluk: küçük düşürücü, damgalayıcı, gereksiz korkutucu veya hassas
kişisel deneyim açıklamaya zorlayan içerik var mı? Tarih/edebiyatta zor konunun
varlığı tek başına zarar veya ret gerekçesi değildir; amaç ve anlatımı değerlendir.
5. Adillik: hedef dışı kültürel/ekonomik deneyime bağımlılık, kalıp yargı veya
gereksiz dil engeli var mı? Demografik grupların başarısını varsayma.
6. Erişilebilirlik: görsele tek başına bağımlılık, renkle verilen bilgi, sembol,
alt metin ve yönerge açıklığı. Metinden ekran okuyucu/mobil render başarısı çıkarma;
test edilmediyse runtime_unverified yaz. Disleksi/DEHB vb. tanı tahmini yapma.

## Araştırma nasıl kullanılacak?

Kaynak yönergesine ek olarak her gelişimsel iddia için çalışma türü (derleme,
meta-analiz, birincil araştırma, rehber), örneklem yaşları ve büyüklüğü (bildirilmişse),
ülke/dil, görev/ölçüm, temel sınırlılıklar ve hedef soruya aktarılabilirliği kaydet.
Grup ortalaması bireysel kapasite değildir. Yetişkin örneklemi bulgusunu çocuğa,
başka dilde okuma eşiğini Türkçeye kanıtsız aktarma. Korelasyonu neden sayma.
İlgili tam metne erişim yoksa bunu belirt; araştırma başlığı/özeti tek başına kesin
sonuç değildir. Genel tasarım rehberi, bu sorunun etkisini ölçmüş deney değildir.

Başlangıç referansları (erişim 2026-09-27; otomatik soru kanıtı değildir):
- National Academies, How People Learn II (2018), Conclusion 2-1 ve 7-1:
  https://www.nationalacademies.org/read/24783/chapter/4
  https://www.nationalacademies.org/read/24783/chapter/9
  Ön bilgi, öğrenme ortamı ve bireysel çeşitlilik gerekçesi; kesin yaş eşikleri vermez.
- CAST UDL Guidelines 3.0, tasarım rehberi:
  https://udlguidelines.cast.org/static/udlg3-graphicorganizer-digital-nonumbers-a11y.pdf
  Rehberden yararlanmak, ürünün erişilebilirlik testinden geçtiği anlamına gelmez.

## Orantılı işlem

Çoğu uygunluk bulgusu warning/iyileştirme önerisidir. Somut ciddi risk gerekçesini
insan incelemesine yönlendir; bu belge yeni otomatik hard-fail kuralı değildir.
Belirsiz tek soru bütün partiyi engellemez. Sayısal psikolojik risk skoru, yeni yaş
kapısı veya otomatik difficulty değişikliği üretme. Kullanıcıların gönüllü soru
anlaşılırlığı geri bildirimi ilgili revizyona bağlanmalı; psikolojik tanıya çevrilmemeli.
