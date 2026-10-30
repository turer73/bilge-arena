# TYT için revizyona bağlı kalite politikası

TYT matematik, Türkçe, fen ve sosyal soruları `question-quality@5` ile denetlendiğinde mevcut global `question-quality@2` yayın kapısı bu sonucu kullanamıyor. Migration231, yalnız tam revizyon ve gerçek denetim kaydına bağlanmış `@5` sonucunu kullanmaya izin verir. Global politika ve yayın zorunluluğu değişmez. Migration soru içeriğini, aktifliği veya yayın durumunu değiştirmez; kaynak ve insan incelemesi yerine geçmez.

## Bağlantı koşulları

Mevcut `question_validation_revision_policies` tablosu, owner tarafından eklenen ve güncellenemeyen makbuzları tutar. Yeni TYT bağlantısı aşağıdakilerin tamamını gerektirir:

- TYT ve dört izinli oyundan biri; gerçek denetim ve karar politikası `question-quality@5`.
- Tam soru/revizyon/içerik hash'i, run kimliği, benchmark/evidence/code makbuzları ve yürürlükteki zorunlu `@2` politikası.
- Üç kör çözücü, karşıt denetçi ve çözüm doğrulayıcıdan oluşan beş tam ham kayıt; eşleşen konfigürasyon, model, sağlayıcı, prompt kimliği ve gerçek `APPROVED` kararı. Yerel JSON raporunun bulunması DB kararı oluşturmaz.
- Yeni `revision_metadata_sha256`: oyun, sınav, kategori, alt kategori, konu, zorluk, seviye ve boss alanlarının DB tarafından hesaplanan hash'i. TYT için boş/yanlış hash kabul edilmez. Bu alanlardan biri değişirse bağlantı tekrar kullanılamaz.
- Kaynak kabulü, güncel kaynak fingerprint'i, kazanım sınırı, yetki ve yayın incelemeleri mevcut kapılardan geçmeye devam eder. Metadata hash'i bunların yerine geçmez.

Yalnız yeni helper fonksiyonu eklenir; `PUBLIC`, `anon`, `authenticated` ve `service_role` için çalıştırma izni kapalıdır. Bağlantı tablosunun RLS ve append-only sınırları korunur. Mevcut LGS fen `audit@4→decision@5` ve LGS Türkçe `@5→@5` eşleşmeleri korunur; eski LGS makbuzlarına metadata hash'i doldurulmaz.

## Global geçiş neden yapılmıyor?

23 Ekim salt-okuma ölçümünde güncel aktif yayımlı revizyonlar arasında52 adet tam `APPROVED@2` eşleşmesi vardı:27 sosyal ve25 matematik. Global `@5` geçişi bu gelecekteki yayın uygunluklarını değiştirebilir. Bu, mevcut soruların kendiliğinden yayından kalkacağı anlamına gelmez. Bu migration yalnız ayrı bağlantısı bulunan revizyona uygulanır. TYT için bir `@5` deneme kararı varsa eksik/geçersiz bağlantı eski `@2` kararıyla geçilemez.

## Doğrulama

`SOURCE_REVIEW_PG_BIN` ile gerçek, boş ve yerel PostgreSQL16 kümelerinde altı kapsam çalıştırılır: LGS fen/Türkçe ve TYT fen/Türkçe/matematik/sosyal. CI `source-review-native` takımına yeni test dosyası bağlıdır; eksik veya atlanmış CI dosyası kabul edilmez. Kaynak/actor/RBAC seam'leri fixture'dır; bu test tam migration zinciri veya canlı yayın kanıtı değildir.

Testler gerçek publisher, kalite trigger'ı ve kaynak uygunluğu fonksiyonlarını kullanır. Bozuk/eksik ham kayıtlar, farklı model/prompt/konfigürasyon, eski içerik, yanlış metadata, oyun/sınav değişimi, eksik kaynak, sonradan değişen karar, izinler, yeniden çalıştırma ve eşzamanlı karar değişimi reddedilir. Rollback mevcut makbuzları silmeden TYT bağlantısını kapatmalı, LGS bağlantısını korumalıdır.

## Yayın sırası ve geri alma

1. Tam PR commit'i için yerel testler ve gerekli CI yeşil olmalı.
2. Ayrı canlı şema onayı alınmalı; bu doküman uygulama onayı değildir.
3. Önce güncel runtime, fonksiyon tanımları/ACL ve mevcut bağlantı makbuzları salt-okuma kaydedilmeli.
4. Migration231 uygulanmalı; runtime'ın aynı kaldığı, eski LGS makbuzlarının byte içeriğinin korunması ve helper ACL doğrulanmalı.
5. Bir soru bağlantısı eklemek ayrıca tam benchmark ve kaynak/inceleme kabulünü gerektirir. Bu migration onayı soru yayını sayılmaz.

Geri alma SQL'i `docs/quality/revision-bound-tyt-policy-rollback.sql` dosyasındadır. Üç eski fonksiyonu geri yükler. Ek nullable kolon ve append-only makbuzlar korunur. TYT için var olan `@5` bağlantısı uygun eşleşme olmaktan çıkar ve yayın kapısı kapanır; eski `@2` kararına kaçış olmaz. Yeni metadata helper'ının özel ACL'si korunur. Geri alma, zaten yayımlanmış soru içeriğini geri yüklemez.

Migration önce Supabase CLI `migration new revision_bound_tyt_quality_policy` ile üretildi. Bu deponun dosya sırası kuralı nedeniyle oluşturulan dosya önce `229_revision_bound_tyt_quality_policy.sql` olarak taşındı. 230 canlıya 30 Ekim 2026'da bu dosyadan önce uygulandığı için dosya `231_revision_bound_tyt_quality_policy.sql` olarak yeniden adlandırıldı; manifestte `pending` durumundadır. Migration lint veya sıralama istisnası eklenmedi.
