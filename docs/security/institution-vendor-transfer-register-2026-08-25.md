# Kurumsal alt işleyen ve yurt dışı aktarım kaydı — 2026-08-25

Bu kayıt, Bilge Arena kodunda ve üretim ortam değişkeni **adlarında** görülen
tedarikçileri kamusal sözleşme belgeleriyle eşleştirir. Şifreli ortam değişkeni
değerleri okunmadı veya bu belgeye alınmadı.

“Kamusal DPA mevcut” ifadesi, Bilge Arena hesabı adına DPA'nın imzalandığı ya da
hesap ayarının doğru yapıldığı anlamına gelmez. Ücretli kurum onboarding'i,
“hesap kanıtı bekliyor” satırları hukuk/hesap sahibi tarafından kapatılana kadar
kapalı kalır.

## Durum özeti

| Hizmet | Kod/üretim kullanımı | Kamusal sözleşme ve bölge kanıtı | Bilge Arena hesap kanıtı | Kurumsal karar |
|---|---|---|---|---|
| Supabase | Kimlik, PostgreSQL ve Storage; proje ref'i `lvnmzdowhfzmpkueurih` | [DPA](https://supabase.com/downloads/docs/Supabase%2BDPA%2B260317.pdf), [bölge rehberi](https://supabase.com/docs/guides/platform/regions) ve [HIBP/parola rehberi](https://supabase.com/docs/guides/auth/password-security) mevcut | Dashboard bu çalışma oturumunda giriş istedi; seçili proje bölgesi, imzalı DPA ve Pro-plan HIBP parola koruması doğrulanamadı | **Hesap kanıtı bekliyor.** Kimlik ve kurum verisinin ana işleyeni olarak hukuk onayı zorunlu |
| Vercel | Next.js barındırma; `vercel.json` içinde `fra1` | [DPA](https://vercel.com/legal/dpa) ve [`fra1` Frankfurt açıklaması](https://vercel.com/docs/pricing/regional-pricing/fra1) mevcut | Proje bağlantısı ve production env envanteri doğrulandı; hesapta imzalı DPA/alt işleyen bildirimi doğrulanmadı | **Teknik bölge kanıtı var, sözleşme kanıtı bekliyor** |
| Upstash / Vercel KV | Rate limit ve answer-attempt saklama; production'da her iki env ailesi mevcut | [DPA](https://upstash.com/trust/dpa.pdf) ve [uyumluluk rehberi](https://upstash.com/docs/redis/help/compliance) mevcut | Şifreli endpoint değeri okunmadı; seçili Redis bölgesi ve hesap DPA'sı doğrulanmadı | **Hesap kanıtı bekliyor.** Anahtarlar yalnız pseudonymous/teknik olmalı |
| Sentry | Hata ve güvenlik alarmı; production DSN mevcut | [GDPR/DPA rehberi](https://sentry.io/astro-assets/resources/legal/how-to-comply-with-gdpr-october-2024.pdf), [DE/US region açıklaması](https://sentry.io/changelog/data-storage-location-in-germany-is-generally-available/) ve [region API rehberi](https://docs.sentry.io/api/) mevcut | Organizasyon region'ı, DPA kabulü ve retention ayarı doğrulanmadı | **Hesap kanıtı bekliyor.** Kurum/sınıf/admin yüzeylerinde event yok; replay global kapalı kalır |
| Panola/Plausible | Self-hosted kamusal ürün analitiği | Üçüncü taraf SaaS yerine Bilge Arena'nın yönettiği altyapı | VPS veri merkezi lokasyonu, erişim sorumluları ve log saklama süresi kayıt altına alınmadı | **Operasyon kaydı bekliyor.** Kurum/sınıf/admin yüzeylerinde yasak |
| Google Analytics / AdSense | Yalnız kamusal sayfa analitiği/reklamı; production ID'leri mevcut | Bu register kurumsal veri aktarımı için bu ürünleri onaylamaz | Hassas rota filtreleri kod/test ile mevcut | **Kurumsal yüzeyde yasak** |
| Resend | İşlemsel e-posta; production API key mevcut | [DPA](https://resend.com/legal/dpa), [güvenlik/DPA erişimi](https://resend.com/security) ve [veri lokasyonu açıklaması](https://resend.com/blog/multi-region) mevcut | Hesap Documents bölümündeki imzalı DPA, gönderim bölgesi ve retention doğrulanmadı | **Hesap kanıtı bekliyor.** Davet içeriği ve alıcı verisi minimize edilir |
| Google Gemini API | Admin soru üretimi; production anahtarı mevcut | [Zero Data Retention rehberi](https://ai.google.dev/gemini-api/docs/zdr?hl=en) ve [API ek şartları](https://ai.google.dev/gemini-api/terms?authuser=00) mevcut | Hesabın ücretli/ZDR uygunluğu ve abuse-monitoring durumu doğrulanmadı | **Öğrenci/personel PII gönderimi yasak.** Hesap kanıtı olmadan kurum verisi kullanılamaz |
| DeepSeek API | Chat/koç ipucu ve kalite araçları; production anahtarı mevcut | [Privacy Policy](https://cdn.deepseek.com/policies/en-US/deepseek-privacy-policy.html) girdilerin toplanabildiğini, model geliştirmede kullanılabildiğini ve verinin Çin'de işlendiğini bildiriyor; [Open Platform şartları](https://cdn.deepseek.com/policies/en-US/deepseek-open-platform-terms-of-service.html) API kullanımını kapsıyor | Bilge Arena adına DPA, özel retention veya bölge taahhüdü bulunamadı | **Kurumsal PII ve hassas veri kesin yasak.** Hukuk ve sözleşme kanıtı olmadan kurum use-case'i açılamaz |

## Production env adı kanıtı

25 Ağustos 2026 tarihli `vercel env ls production` çıktısında aşağıdaki adlar
görüldü; değerler alınmadı:

- `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`
- `KV_REST_API_URL`, `KV_REST_API_TOKEN`, `REDIS_URL`
- `NEXT_PUBLIC_SENTRY_DSN`
- `RESEND_API_KEY`
- `GOOGLE_GENERATIVE_AI_API_KEY`, `DEEPSEEK_API_KEY`
- `NEXT_PUBLIC_ADSENSE_ID`

`INSTITUTION_ONBOARDING_ENABLED` production envanterinde **yoktur**. Kod yalnız
tam olarak `true` değerinde onboarding açtığından, yeni ücretli kurum kabulü
fail-closed durumdadır.

## Hesap sahibi/hukuk kapanış paketi

Her aktif işleyen için tek klasörde şu kanıtlar saklanmalıdır:

1. Yürürlükteki DPA veya sözleşme kopyası ve kabul tarihi.
2. Alt işleyen listesi için bildirim aboneliği.
3. Seçili veri/compute region ekran görüntüsü veya API çıktısı.
4. Retention, log, replay ve AI training/ZDR hesap ayarları.
5. KVKK rolü, aktarım mekanizması ve aydınlatma metni hukuk onayı.
6. Sözleşme bitiminde export/silme ve erişim iptali sorumlusu.

Bu altı kanıt tamamlanmadan bu register “tamamlandı” olarak işaretlenemez.
