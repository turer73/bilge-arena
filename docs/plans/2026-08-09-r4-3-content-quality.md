# R4.3 — İçerik Güveni ve Sonuç Düzeltme Sistemi

**Tarih:** 2026-08-09
**Kapsam:** Soru revizyon geçmişi, kazanım/kaynak/lisans kanıtı, hazırlayan–kontrol eden ayrımı, iki bağımsız öğretmen onayı, kullanıcı itirazı/SLA, revizyon-temelli psikometri ve kanıtlı yanlış anahtar sonrası sonuç düzeltme katmanı
**Durum:** Yerel uygulama ve kabul tamamlandı; Sol kapanış onayını verdi. Migration 106, API/UI akışları, disposable PostgreSQL paketi, exact Node 22 production build, tam uygulama/DB testleri, type-check, ESLint, migration lint, diff-check, masaüstü/mobil gerçek bileşen QA'sı ve bağımsız Terra yeniden incelemesi geçti. Tarayıcı kabulü gerçek üretim bileşenlerinin sabit yerel verili vitriniyle yapıldı; korumalı admin rotasının `/giris` yönlendirmesi ayrıca iki tarayıcı oturumunda doğrulandı, ancak yetkili kullanıcı + canlı DB ile uçtan uca tarayıcı akışı bu yerel kapanışın kanıtı değildir. Commit/PR, canlı migration, içerik rollout'u veya deploy yapılmadı.

## Güvenlik ve tarihsel doğruluk sınırı

Mevcut tarihsel `session_answers` kayıtları yalnız `question_id` taşır. Sorunun o anda hangi içerik/doğru-cevap revizyonuyla sunulduğunu kanıtlamaz. Bu nedenle:

- pre-106 cevaplar otomatik yeniden notlanmaz; yalnız `manual_required` etki sayısına girer;
- yeni verified attempt her soru için immutable revizyon, içerik hash'i, sunulan içerik ve doğru seçenek snapshot'ı taşır;
- düzeltme `game_sessions`, `session_answers.is_correct`, `reward_ledger`, XP, coin, rozet, görev, lig, FSRS veya mastery satırını yerinde değiştirmez;
- kullanıcıya gösterilen düzeltilmiş sonuç append-only correction ledger üzerinden türetilir;
- ödül geri alma veya geçmiş ekonomi telafisi bu dilimin dışındadır ve ayrı ürün/onay kararı gerektirir.

Bu sınır, “otomatik düzeltme”yi yalnız kanıtlanabilir sonuçlarda idempotent bir skor override'ı olarak tanımlar. Belirsiz geçmişi tahmin ederek değiştirmek yasaktır.

## Pilot ve rollout kapıları

- `CONTENT_GOVERNANCE_ENABLED=false`: yeni hazırlama/inceleme/yayın/itiraz/düzeltme API'leri fail-closed `503`.
- `NEXT_PUBLIC_CONTENT_APPEALS_ENABLED=false`: öğrenci itiraz durumu/düzeltme bildirimi yüzeyleri gizli.
- Migration `content_governance_runtime.enforce_direct_mutation=false` uyumluluk modunda açılır; bu sırada eski uygulama yazma yolları çalışmaya devam eder.
- Uygulama governance modunda smoke edilince yalnız `content.enforcement.manage` yetkili RPC ile DB guard açılır; kabul ve pilot sırasında değer `true` olmalıdır.
- Flag açılmadan önce reviewer rolleri, kaynak/lisans kataloğu, SLA sahibi ve destek prosedürü atanır.

## Roller ve izinler

Yeni permission anahtarları:

- `content.prepare`
- `content.review.stage1`
- `content.review.stage2`
- `content.publish`
- `content.appeals.manage`
- `content.corrections.apply`
- `content.psychometrics.refresh`
- `content.enforcement.manage`

Stage 1 konu/doğruluk kontrolüdür. Stage 2 pedagojik ölçme, kazanım ve lisans kontrolüdür. Hazırlayan iki aşamada da reviewer olamaz; stage 1 ve stage 2 reviewer aynı kullanıcı olamaz. Yayın yalnız iki `approved` kararından sonra yapılır. Stage 2 reviewer, ayrıca `content.publish` iznine sahipse yayını atomik olarak tamamlayabilir.

Super admin tüm izinleri alır; editor yalnız `content.prepare`, moderator yalnız `content.appeals.manage` alır. `content.enforcement.manage` yalnız operasyonel super admin rolündedir. Stage reviewer rolleri ayrı atanır. Kullanıcı kendine rol/izin veremez.

## Migration 106 veri modeli

Migration adı: `106_question_content_governance.sql`.

Tüm yeni tablolar private, RLS açık ve `PUBLIC`, `anon`, `authenticated`, `service_role` doğrudan DML'ine kapalıdır. Yazma yalnız service-role çağrılı, sabit `pg_catalog` search path kullanan SECURITY DEFINER RPC'lerle yapılır.

### 0. `content_governance_runtime`

- tek satırlı, private rollout durumu;
- direct question insert/content/activation guard'ını atomik açıp kapatır;
- migration varsayılanı güvenli geçiş için `false`, pilot kabul durumu `true`;
- değişim yalnız ayrı enforcement izni, canonical request replay ve audit zamanı ile yapılır.

### 1. `content_governance_requests`

- `(user_id, operation, request_id)` primary identity;
- canonical payload SHA-256 ve canonical sonuç;
- owner-bound replay; aynı request/farklı payload `22023`;
- ham soru, doğru cevap, itiraz metni veya PII tutmaz.

### 2. `question_content_revisions`

- `question_id`, monoton `revision_no`, `base_revision_id`;
- explicit game/category/subcategory/topic/difficulty/level/exam/boss metadata;
- tam private `content`, `content_sha256`;
- `legacy_import|create|edit|correct_answer|retire` change kind ve 1–500 karakter özet;
- `draft|stage1_approved|stage2_approved|published|rejected|superseded` durum;
- hazırlayan ve zamanlar; legacy import için hazırlayan `NULL` olabilir;
- içerik ve metadata immutable; yalnız RPC ile kontrollü durum geçişi.

`questions.published_revision_id` yalnız published revision'a işaret eder. Migration mevcut her soru için `legacy_import` revision 1 üretir ve pointer'ı doldurur.

### 3. `question_revision_outcomes`

- revision + active curriculum outcome + weight + primary;
- 1–5 mapping, weight `0 < w <= 1`, tam olarak bir primary;
- yayın anında immutable `question_outcomes` görünümü aynı transaction'da güncellenir.

### 4. `question_revision_sources`

- source kind: `original|licensed|public_domain|user_generated|official_exam`;
- bounded source title/URL, license code/URL, attribution ve private provenance ref;
- `original` dışında yayın için exact allowlist lisans ve gerekli attribution zorunlu;
- kaynak/lisans/provenance public soru payload'ına, analytics'e veya cache'e çıkmaz.

### 5. `question_revision_approvals`

- revision, stage `1|2`, reviewer, `approved|rejected`, bounded rationale ve server time;
- `(revision_id, stage)` unique ve append-only;
- self-review, aynı reviewer'ın iki stage'i, stage2-before-stage1 ve rejected publish DB'de reddedilir.

### 6. `question_appeals` ve `question_appeal_events`

- owner, question, opsiyonel owner'a ait `session_answer_id`, snapshot revision;
- katalog reason ve en fazla 1000 karakter açıklama;
- `submitted|acknowledged|investigating|resolved|rejected|withdrawn` durum;
- acknowledgment son tarihi `submitted_at + 48 saat`, çözüm son tarihi `submitted_at + 14 gün`;
- event tablosu append-only; public mesaj ve private internal note ayrıdır;
- kullanıcı yalnız kendi redakte durumunu görür; reviewer kimliği/internal note/başka kullanıcı yoktur.

Mevcut pending `error_reports`, mümkünse session snapshot olmadan `legacy_import` itirazı olarak taşınır; otomatik düzeltme uygunluğu kazanmaz.

### 7. `verified_attempt_question_revisions`

- attempt + question + position;
- published revision id, content hash, tam private content snapshot, correct option snapshot;
- issue anında tek transaction'da oluşturulur;
- attempt API'si yalnız server'a private snapshot döndürür; TypeScript public-contract parser cevap/çözüm alanlarını client'a göndermeden önce çıkarır.

`session_answers.question_revision_id` nullable eklenir. Yeni verified completion, submitted correctness/count değerlerini snapshot'a karşı DB'de yeniden doğrular ve session answer'ı revision'a bağlar.

### 8. `question_error_incidents`

- hatalı published revision, onu düzelten iki aşamalı published revision;
- katalog error type: `wrong_key|ambiguous|invalid_content|outcome_mismatch`;
- yalnız `wrong_key` ve tekil seçenek snapshot'ı otomatik yeniden notlamaya uygundur;
- impact özeti `eligible`, `changed`, `manual_required` olarak tutulur;
- incident ve karar append-only; kapatma/supersede olayı ayrı eventtir.

### 9. `question_result_corrections`

- incident + session_answer unique;
- eski/yeni correctness, `score_delta -1|1`, revision kanıtları ve apply time;
- yalnız post-106 snapshotlı, completed verified session için üretilir;
- retry ikinci correction üretmez;
- kullanıcı read RPC'si yalnız session tarihi, generic neden, skor delta ve düzeltme zamanını döndürür; seçilen seçenek/doğru anahtar/başka kullanıcı yoktur.

### 10. `question_revision_psychometrics`

- revision + immutable materialization window/hash;
- verified completed snapshotlardan `n`, `correct_n`, `p_correct`, güven aralığı ve rest-score point-biserial discrimination;
- `n < 30` veya sıfır varyansta discrimination `NULL`;
- paper pack, teacher assignment, raw/unverified session ve kullanıcı kimliği dahil edilmez.

## RPC sözleşmesi

Tüm RPC'lerde `p_user_id` server auth sonucudur; client başka actor seçemez.

### Hazırlama ve yayın

- `create_question_content_revision(uuid,uuid,uuid,jsonb,uuid)`
  - `(p_user_id,p_question_id,p_base_revision_id,p_payload,p_request_id)`;
  - strict payload; source/license/outcome/content guard; stale base reddi.
- `review_question_content_revision(uuid,uuid,smallint,text,text,uuid)`
  - stage/permission/actor ayrımı ve canonical replay.
- `publish_question_content_revision(uuid,uuid,uuid)`
  - iki approval + current-base lock; `questions` content/metadata/pointer/outcomes tek transaction.
- `quarantine_question_content(uuid,uuid,text,uuid)`
  - yalnız correction permission; soruyu anında pasif yapar, reason/event append eder; içeriği değiştirmez.
- `get_question_content_governance_queue(uuid,text,integer,text)` ve `get_question_content_revision(uuid,uuid)`
  - permission-scoped admin read; public payload değildir.
- `set_content_governance_enforcement(uuid,boolean,uuid)` ve `get_content_governance_enforcement(uuid)`
  - migration/app geçişi ve rollback için ayrı super-admin kapısı; doğrudan tablo yazımı yoktur.

### İtiraz ve SLA

- `submit_question_appeal(uuid,uuid,uuid,text,text,uuid)`
  - session answer verilirse owner/question eşleşmesi zorunlu; dedup/replay-safe.
- `get_my_question_appeals(uuid)`
  - owner-only redacted status.
- `resolve_question_appeal(uuid,uuid,text,text,text,uuid)`
  - manage permission; public/private not ayrımı.
- `sweep_question_appeal_sla(timestamptz)`
  - service-only, breach eventini idempotent yazar.

### Düzeltme ve psikometri

- `create_question_error_incident(uuid,uuid,uuid,uuid,text,uuid)`
- `apply_question_result_corrections(uuid,uuid,uuid)`
- `get_my_question_result_corrections(uuid)`
- `materialize_question_revision_psychometrics(uuid,uuid,timestamptz,timestamptz,uuid)`

## HTTP ve UI yüzeyi

- `POST /api/questions/report`: strict owner appeal oluşturur; cevap anahtarı veya başka appeal dönmez.
- `GET /api/questions/appeals`: owner'ın redakte itiraz durumları.
- `GET /api/questions/corrections`: owner'ın generic sonuç düzeltmeleri.
- `GET /api/admin/content-quality`: queue/detail/psychometric aggregate.
- `POST /api/admin/content-quality/revisions`: draft.
- `POST /api/admin/content-quality/revisions/:id/review`: stage decision.
- `POST /api/admin/content-quality/revisions/:id/publish`: atomic publish.
- `POST /api/admin/content-quality/questions/:id/quarantine`: emergency hide.
- `POST /api/admin/content-quality/appeals/:id/resolve`: public/private resolution.
- `POST /api/admin/content-quality/incidents`: verified error incident + impact preview.
- `POST /api/admin/content-quality/incidents/:id/apply`: append-only correction materialization.
- `GET|POST /api/admin/content-quality/enforcement`: operasyonel guard durumu/değişimi; yalnız enforcement yetkisi.

Admin `Soru Kalitesi` sayfası mobil kart/masaüstü liste olarak queue, semantic revision timeline, source/license/outcome kanıtı, stage kararları, appeal SLA ve aggregate correction impact gösterir. Raw user UUID/e-posta/seçenek/cevap göstermez. Öğrenci itiraz formu label/error ilişkili, 44px hedefli ve generic düzeltme bildirimi answer-key'sizdir.

Mevcut `/api/questions PATCH` artık content/metadata/activation mutasyonu yapmaz. UI edit eylemi revision draft oluşturur; aktif/pasif değişim publish/quarantine akışındadır. UGC ve AI üretimi inactive draft olarak governance kuyruğuna girer; tek admin onayıyla yayınlanamaz.

## Kabul kapısı

### Disposable gerçek PostgreSQL

- private ACL/RLS ve exact RPC execute matrisi;
- legacy backfill/pointer/hash ve direct content UPDATE reddi;
- strict source/license/outcome/content allowlist;
- self-review, aynı reviewer, stage sırası, stale base ve concurrent publish;
- UGC/AI yolunun iki stage'i atlayamaması;
- appeal owner/IDOR/redaction/replay ve 48h/14g SLA sweep;
- revision A ile issued attempt; B yayınlansa bile A snapshot'ıyla DB grading;
- wrong-key incident correction retry/idempotency ve reward/mastery/FSRS/league değişmezliği;
- pre-106 session `manual_required`;
- `n=29` discrimination NULL, `n>=30` deterministic metric; unverified/paper/teacher dışlama.

### API/UI

- flag/config/auth/permission/rate/no-store ve strict unknown-key testleri;
- public question/grade/study payloadlarında answer, private source/license, reviewer ve appeal PII sızıntısı yok;
- stale revision/concurrent stage/publish güvenli hata eşlemesi;
- owner-only appeals/corrections ve generic notification copy;
- desktop/mobile/open/dark, semantic timeline, focus/error, 44px ve yatay taşmama;
- exact type-check, targeted/full Vitest, full DB, production build, migration lint, diff-check ve Terra kapanış incelemesi.

### 2026-08-09 yerel kapanış kanıtı

- Exact Node `22.23.2` ve Next.js `16.2.12` ile production build geçti; derleme, TypeScript ve `176/176` statik üretim adımı tamamlandı.
- Tam uygulama paketi `290/290` dosya ve `2758/2758` test geçti. R4.3 hedefli son uygulama paketi `3/3` dosya ve `54/54`; SQL statik paketi `9/9` geçti.
- Tam DB paketi `23` çalışan dosya/`167` test geçti; harici DB değişkeni isteyen `15` dosya/`71` test opt-in skip kaldı. R4.3 disposable PostgreSQL paketi `4/4` geçti.
- Exact Node 22 type-check temizdir. Tam ESLint `0` hata ve mevcut geniş kapsamlı `24` uyarıyla; değişen R4.3 dosyalarının scoped lint'i `0` hata/uyarıyla geçti. Migration lint `109` migration taradı; diff-check temizdir.
- `1280×720` açık tema ve `390×844` koyu tema gerçek tarayıcı kontrolünde üretim `ContentGovernancePanel` ve `ContentAppealsPanel` bileşenleri sabit yerel veriyle açıldı. Ayrıntı, kanıt, psikometri, SLA ve karar formları semantik adlarla doğrulandı; yatay taşma yoktur ve iki görünümdeki `16` görünür ürün kontrolünün tamamı en az `44px` yüksekliğindedir. Ürün kaynaklı konsol hatası yoktur; yalnız localhost analitiğinin beklenen yok sayma uyarısı görülmüştür.
- Terra son yeniden incelemesinde açık P0/P1 bulmadı ve kabul önerdi. Önceki üç P1 — revision replay kimliği, eşzamanlı canonical replay ve legacy report governance bypass — kapatıldı.

## Rollout ve rollback

Canlı sıra: migration 106 (DB enforcement `false`) → ACL/backfill/snapshot smoke → app deploy tüm flag'ler kapalı → reviewer ve enforcement rol atamaları → `CONTENT_GOVERNANCE_ENABLED=true` app deploy → draft/stage/publish, appeal/SLA ve verified snapshot test hesabı smoke → DB enforcement `true` → direct-write red testi → küçük içerik pilotu → öğrenci UI flag.

Rollback önce DB enforcement'ı yetkili RPC ile `false` yapar, sonra iki uygulama flag'ini kapatır. Böylece eski yazma yolları tekrar çalışırken yarım rollout oluşmaz. Yeni revision/approval/appeal/correction kayıtları audit kanıtıdır ve silinmez. `questions.published_revision_id` geri çevrilecekse yalnız daha önce published ve iki-stage approved revision'a atomik republish yapılır; ham content elle restore edilmez.
