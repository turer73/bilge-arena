# R4.2 — Öğretmen Sınıfları ve Ödev Paneli

**Tarih:** 2026-08-09
**Kapsam:** 2–3 öğretmenlik, davet-only ve varsayılan-kapalı pilot; sınıf üyeliği, ödev, son tarih ve minimum öğrenci ilerleme agregaları
**Durum:** R4.2a–c DB, API, UI ve QA kapsamı yerelde tamamlandı ve teknik kabul kapısından geçti. Migration 105 için statik sözleşme `9/9`, disposable gerçek PostgreSQL kabulü `6/6`; tam uygulama paketi `284/284` dosya ve `2723/2723` test; tam DB paketi `158/158` çalışan test ile geçti. Exact Next.js `16.2.12` type-check/build, migration lint (`108`), ESLint (`0` hata) ve diff-check temizdir. Commit/PR, canlı migration, hukuki metin onayı, pilot ve deploy yapılmadı.

## Kaynak sınırı ve hukuki kapı

19 Temmuz araştırması bu özelliği geniş bir okul bilgi sistemi olarak değil, **2–3 öğretmenle sınıf/ödev paneli pilotu** olarak tanımlar. Veli gözetim paneli bu dilimde yoktur.

KVKK Kurulunun 18.02.2026 tarihli 2026/347 ilke kararı, kişisel veri işleme açık rızaya dayanıyorsa aydınlatma ve açık rıza metinlerinin ayrı başlıklar, ayrı metinler ve ayrı beyanlar olarak sunulmasını; aydınlatma için onay/rıza istenmemesini belirtir. Resmî kaynak: [KVKK 2026/347 duyurusu](https://www.kvkk.gov.tr/Icerik/8710/veri-sorumlulari-tarafindan-acik-riza-ve-aydinlatma-metinlerinin-ayri-ayri-duzenlenmesi-gerektigi-hakkinda-kisisel-verileri-koruma-kurulunun-18-02-2026-tarihli-ve-2026-347-sayili-ilke-kararina-iliskin-kamuoyu-duyurusu). Uzaktan eğitim platformlarında öğrenci verisinin işlenme şartları, veri güvenliği ve olası yurt dışı aktarımı ayrıca değerlendirilmelidir: [KVKK uzaktan eğitim duyurusu](https://www.kvkk.gov.tr/Icerik/6723/Uzaktan-Egitim-Platformlari-Hakkinda-Kamuoyu-Duyurusu).

Bu belge hukuki dayanak seçmez ve hukuki metin üretmez. Pilot şu kararlar verilmeden canlıya açılamaz:

- veri sorumlusunun ve her işleme amacının hukuki dayanağı;
- reşit olmayan öğrenci için geçerli beyan/temsil akışı;
- aydınlatma ve gerekiyorsa paylaşım açık-rıza metinlerinin ayrı onaylı sürümleri;
- saklama/imha süresi, yurt dışı aktarım ve veri işleyen envanteri;
- öğretmen doğrulama, destek ve kötüye kullanım prosedürü.

Teknik akış ayrı `noticeVersion` ve `sharingConsentVersion` ile iki ayrı kullanıcı eylemini kaydeder; bunun tek başına hukuki yeterlilik oluşturduğu iddia edilmez. Onaylı sürüm yapılandırması yoksa kabul endpoint'i `503` ile kapalı davranır.

## Pilot dışı

- Veli/guardian paneli, okul/kurum hiyerarşisi, toplu CSV öğrenci içe aktarma veya e-posta daveti.
- Canlı ders, mesajlaşma, kamera/ses, davranış gözetimi, konum, doğum tarihi veya T.C. kimlik numarası.
- Öğrencilerin birbirini görmesi, sınıf sıralaması veya öğretmenin ham cevap/yanlış soru ayrıntısı görmesi.
- Öğretmen tarafından serbest soru/cevap içeriği yükleme; bu R4.3 içerik güveni kapsamıdır.
- Ödevden XP, coin, seri, görev, rozet, lig, verified session, FSRS veya normal mastery üretme.

## Rollout kapıları

İki uygulama anahtarı varsayılan kapalıdır:

- `TEACHER_CLASSROOM_ENABLED=false` — tüm server API/RPC çağrı kapısı;
- `NEXT_PUBLIC_TEACHER_CLASSROOM_ENABLED=false` — öğrenci ve öğretmen UI kapısı.

Davet tokeninin canonical replay'i için service-role anahtarından ayrı, en az 32 byte bir `TEACHER_CLASSROOM_INVITE_SECRET` gerekir. Hukuki sürüm yapılandırması ve bu secret yoksa server fail-closed olur. Genel admin veya başka bir feature flag bu özelliği açamaz.

Öğretmen yetkisi mevcut RBAC üzerinden yalnız `admin.roles.manage` yetkili yönetici tarafından atanabilen `teacher_pilot` rolü / `teacher.classrooms.manage` iznidir. Normal kullanıcı kendini öğretmen yapamaz.

## Veri modeli — migration 105

Migration adı: `105_teacher_classroom_privacy.sql`.

Tüm yeni tablolar private, RLS açık ve `PUBLIC`, `anon`, `authenticated`, `service_role` doğrudan DML'ine kapalıdır. Uygulama yalnız dar `SECURITY DEFINER` RPC'leri çağırır; fonksiyonlar sabit `search_path` ve tam nitelikli tablo adları kullanır.

### Tablolar

1. `teacher_classrooms`
   - owner `teacher_id`, 2–60 karakter sınıf adı, `active|archived`, zamanlar;
   - sınıf başına en fazla 40 aktif öğrenci;
   - öğretmen yalnız kendi aktif rolü sürerken işlem yapabilir.
2. `teacher_classroom_requests`
   - `user_id + operation + request_id`, canonical payload hash ve sonuç;
   - tüm write RPC'leri için owner-bound replay; aynı request/farklı payload `22023`;
   - append-only audit, ham token veya cevap içermez.
3. `teacher_classroom_invites`
   - yalnız SHA-256 token digest, classroom, issuer, `expires_at`, `max_uses` (`1..40`), `used_count`, revoke zamanı;
   - en fazla 7 gün; ham token DB'ye veya loga girmez;
   - server tokeni `HMAC-SHA256(inviteSecret, teacherId:classroomId:requestId)` ile yeniden üretir ve yalnız issue yanıtında döndürür.
4. `teacher_classroom_memberships`
   - classroom, student, öğretmene özel rastgele `member_ref`, `active|withdrawn|removed`, kabul/bitiş zamanları;
   - aynı sınıf/öğrenci için yalnız bir aktif ilişki; tekrar katılım yeni audit çevrimi üretir;
   - aktif ilişki olmadan ödev okuma/gönderme ve öğretmen görünürlüğü yoktur.
5. `teacher_classroom_privacy_events`
   - ayrı `notice_acknowledged`, `sharing_consented`, `sharing_withdrawn`, `removed` olayları;
   - notice/consent sürümü, membership ve server zamanı; append-only;
   - metin içeriği, IP, user-agent, e-posta veya serbest metin yoktur.
6. `teacher_assignments`
   - teacher/classroom, başlık, exact game/exam/filter özeti, `published|closed|cancelled`, `available_at`, `due_at`, `1..30` soru;
   - `due_at > available_at`, en fazla 30 gün; kullanıcıya İstanbul zamanı gösterilir, DB `timestamptz` saklar.
7. `teacher_assignment_items`
   - sıralı private source question id, immutable public soru snapshot'ı ve private doğru seçenek;
   - yalnız server'ın aktif soru bankasından seçtiği, option/answer sınırları geçerli sorular;
   - aktif ödev public yanıtında cevap/çözüm/ipucu yoktur.
8. `teacher_assignment_recipients`
   - publish anındaki aktif membership/student snapshot'ı;
   - sonradan katılan öğrenci geçmiş ödevi almaz;
   - çekilen/çıkarılan öğrenci satırı audit için kalır fakat yeni erişim ve öğretmen kimlik görünürlüğü kesilir.
9. `teacher_assignment_submissions`
   - recipient, `submitted_at`, answered/correct agregaları ve canonical sonuç;
   - öğrenci başına tek final gönderim, replay-safe.
10. `teacher_assignment_submission_items`
    - private position, selected option/null ve doğruluk;
    - yalnız ilgili öğrenci final sonucunda görebilir; öğretmen RPC'si bu tabloyu hiçbir biçimde yüzeye çıkarmaz.

Otomatik retention bu migration'da uydurulmaz. Canlı pilot, onaylı saklama/imha kararı olmadan açılamaz; archive/withdraw/remove kayıtları bu arada private ve erişilemez kalır.

## RPC sözleşmesi

Tüm RPC'lerde ilk parametre server'ın auth sonucundan verdiği `p_user_id`; client başka user id seçemez.

### Öğretmen

1. `create_teacher_classroom(uuid,text,uuid)`
   - `(p_user_id,p_name,p_request_id)`;
   - teacher permission guard ve canonical replay.
2. `get_my_teacher_classrooms(uuid)`
   - `(p_user_id)`; yalnız owner öğretmenin sınıf özetlerini, aktif öğrenci ve ödev sayılarını döndürür;
   - öğrenci UUID, `memberRef`, profil veya cevap verisi içermez.
3. `issue_teacher_classroom_invite(uuid,uuid,text,timestamptz,smallint,uuid)`
   - `(p_user_id,p_classroom_id,p_token_digest,p_expires_at,p_max_uses,p_request_id)`;
   - digest exact 64 lowercase hex, owner/active class, 7 gün/40 kullanım bound.
   - DB ham tokeni/secret'ı bilmez ve ham token döndürmez; R4.2b server aynı request için HMAC tokenini yeniden üretir, digest'i RPC'ye verir ve ham tokeni yalnız HTTP issue yanıtına ekler.
4. `revoke_teacher_classroom_invite(uuid,text,uuid)`
   - `(p_user_id,p_invite_ref,p_request_id)`; dış sözleşmede yalnız 32 haneli opak `inviteRef` kullanır, yalnız owner ve idempotenttir.
5. `publish_teacher_assignment(uuid,uuid,text,jsonb,timestamptz,timestamptz,uuid)`
   - `(p_user_id,p_classroom_id,p_title,p_items,p_available_at,p_due_at,p_request_id)`;
   - `p_items` service route'un aktif soru bankasından hazırladığı exact snapshot; DB yeniden question/answer bounds ve aktiflik doğrular;
   - publish anında aktif recipient snapshot'ı kilit altında oluşturulur.
6. `get_my_teacher_classroom_overview(uuid,uuid)`
   - `(p_user_id,p_classroom_id)`; salt-okunur, owner/role guard.
7. `remove_teacher_classroom_member(uuid,uuid,text,uuid)`
   - `(p_user_id,p_classroom_id,p_member_ref,p_request_id)`; öğrenci UUID'si public sözleşmeye çıkmaz.

### Öğrenci

8. `preview_teacher_classroom_invite(uuid,text)`
   - `(p_user_id,p_token_digest)`; valid/revoked/expired/full durumunu ve yalnız sınıf adı + güvenli öğretmen alias'ını döndürür.
9. `accept_teacher_classroom_invite(uuid,text,text,text,uuid)`
   - `(p_user_id,p_token_digest,p_notice_version,p_consent_version,p_request_id)`;
   - onaylı sürümler R4.2b server config'inde exact eşleştirilir; DB yalnız bounded/nonempty sürüm biçimini audit eder. İki ayrı eylem API'de true değilse RPC çağrılmaz;
   - sınıf kapasitesi, invite kullanım sayacı ve membership aynı transaction/lock altında değişir.
10. `get_my_teacher_classroom_memberships(uuid)`
   - `(p_user_id)`; yalnız aktif owner üyeliklerini sınıf adı, güvenli öğretmen alias'ı ve katılma zamanıyla döndürür;
   - başka öğrenci, `memberRef`, profil UUID veya ödev cevabı içermez.
11. `withdraw_teacher_classroom_membership(uuid,uuid,uuid)`
   - `(p_user_id,p_classroom_id,p_request_id)`; aktif membership kapanır ve görünürlük aynı transaction'da kesilir.
12. `get_my_teacher_assignments(uuid)` ve `get_my_teacher_assignment(uuid,uuid)`
    - yalnız aktif membership ve kendi recipient satırı; başka öğrenci verisi yoktur.
13. `submit_teacher_assignment(uuid,uuid,jsonb,uuid)`
    - `(p_user_id,p_assignment_id,p_answers,p_request_id)`;
    - exact soru sayısı, iki anahtarlı `{position,selectedOption}`, duplicate/out-of-range kontrolü, active membership, availability/deadline ve final replay;
    - yalnız private submission tablolarına yazar.

## Public JSON

### Teacher overview

```text
{
  classroom: {
    id, name, status, activeStudentCount, hiddenRecipientCount, createdAt
  },
  activeStudents: [{ memberRef, alias, joinedAt }],
  assignments: [{
    id, title, status, availableAt, dueAt, questionCount,
    assignedCount, submittedCount,
    students: [{ memberRef, alias, status, answeredCount, correctCount, submittedAt }]
  }]
}
```

Yalnız halen aktif ve paylaşımı geri çekilmemiş öğrenci alias'ı görünür. Withdrawn/removed/deleted/block durumunda kimlik satırı çıkarılır; yalnız toplu `hiddenRecipientCount` artabilir. E-posta, şehir, sınıf seviyesi, profil/student UUID, soru/cevap, yanlış ayrıntısı, session/attempt/outcome, FSRS/mastery yoktur.

### Invite preview / acceptance

```text
{
  classroomName,
  teacherAlias,
  expiresAt,
  notice: { version, href },
  sharingConsent: { version, href }
}
```

```text
{
  classroom: { id, name, teacherAlias },
  membershipStatus: "active",
  joinedAt,
  replayed
}
```

Ham invite token yanıta geri yansıtılmaz. Preview/accept `Cache-Control: private, no-store`; token analytics, hata mesajı veya URL query'sine yazılmaz.

### Student assignment

```text
{
  id, title, status, availableAt, dueAt,
  classroom: { id, name, teacherAlias },
  items: [{ position, question: { game, category, topic, difficulty, content } }],
  result: null | {
    answeredCount, correctCount,
    items: [{ position, selectedOption, isCorrect, correctOption }]
  },
  reward: { xp: 0, coins: 0, socialPoints: 0 }
}
```

Aktif ödevde seçim/doğruluk/anahtar yoktur. Final sonuç yalnız ilgili öğrenciye döner. Öğretmen public sözleşmesi bu item sonuçlarını alamaz.

## HTTP API

Tüm route'lar strict Zod, auth, user/IP rate-limit, flag, private no-store ve güvenli hata eşlemesi kullanır.

- `GET|POST /api/teacher/classrooms`
  - teacher list/create; create `{ name, requestId }`.
- `GET /api/teacher/classrooms/:classroomId`
  - owner teacher overview.
- `POST /api/teacher/classrooms/:classroomId/invites`
  - `{ expiresAt, maxUses: 1..40, requestId }`; `expiresAt` gelecekte ve en fazla 168 saat olmalıdır; exact timestamp canonical replay'i korur, token/share fragment yalnız bu yanıtta döner.
- `POST /api/teacher/classrooms/:classroomId/assignments`
  - `{ title, game, examRef, category?, topic?, difficulty?, questionCount: 1..30, availableAt, dueAt, requestId }`;
  - client soru UUID veya içerik/cevap gönderemez.
- `POST /api/teacher/classrooms/:classroomId/members/:memberRef/remove`
  - `{ requestId }`.
- `POST /api/teacher/invitations/preview`
  - `{ token }`; authenticated, raw token loglanmaz.
- `POST /api/teacher/invitations/accept`
  - `{ token, noticeVersion, noticeAcknowledged: true, sharingConsentVersion, sharingConsent: true, requestId }`;
  - notice acknowledgement ve consent ayrı alan/etkileşimdir.
- `POST /api/teacher/classrooms/:classroomId/withdraw`
  - `{ requestId }`.
- `GET /api/teacher/memberships`
  - yalnız auth öğrencinin aktif sınıf üyelikleri; ayrılma eylemi ödev olmasa da erişilebilir kalır.
- `GET /api/teacher/assignments` ve `GET|POST /api/teacher/assignments/:assignmentId`
  - list/read; submit `{ requestId, answers: [{ position, selectedOption }] }`.

Durumlar: flag/config `503`, auth `401`, teacher permission `403`, owner/scope fail-closed `404`, expired/revoked invite `410`, full/duplicate/replay mismatch/deadline `409`, strict body `400`, rate `429`.

## UI ve erişilebilirlik

- `/arena/sinif`: öğrencinin aktif sınıfları, ödevleri, son tarihleri ve görünür “Paylaşımı durdur / sınıftan ayrıl” eylemi.
- `/arena/sinif/davet`: token yalnız URL fragment'ından client belleğine alınır; preview sonrası ayrı aydınlatma ve paylaşım-rızası bölümleri, önceden seçilmemiş ayrı kontroller ve açık geri çekme bilgisi.
- `/arena/sinif/odev/[assignmentId]`: native radio group + “boş bırak”, ilerleme özeti, tek final submit ve owner-only sonuç.
- `/arena/sinif/ogretmen`: teacher permission guard; sınıf oluşturma, tek-seferlik invite paylaşımı, filtre tabanlı ödev oluşturma ve minimum aggregate paneli.

Öğrenci listesi hiçbir öğrenci DOM/API'sine gelmez. Tablo mobilde semantik kart/list yapısına dönüşür; başlık/landmark/focus/error ilişkileri, klavye kullanımı, `44px` dokunma hedefleri, en az `4.5:1` normal metin kontrastı ve `390px` yatay taşmama zorunludur. Son tarih hem mutlak İstanbul tarihi hem erişilebilir metin olarak gösterilir; yalnız renkle anlatılmaz.

## Tehdit modeli

1. Rol sahteciliği veya self-promotion ile öğretmen yetkisi alma.
2. Invite token tahmini, query/referrer/log/analytics sızıntısı, expired/revoked/replay kabulü.
3. Başka classroom/assignment/memberRef üzerinden IDOR.
4. Withdrawal/remove sonrasında stale recipient/progress ile kimlik veya yeni performans görme.
5. Teacher overview parser'ından UUID, cevap, yanlış soru, FSRS/mastery veya PII sızması.
6. Publish sırasında aktif membership yarışı, 40 kişi kapasitesi ve late-join geçmiş ödev hatası.
7. Submit replay/concurrency ile çift sonuç veya reward/mastery yan etkisi.
8. Öğretmen rolü iptal edildikten sonra açık sekme/cached response ile erişim.
9. Hukuki sürüm/config yokken veya flag kapalıyken endpoint'in yanlışlıkla açılması.

## Test kapısı

### SQL statik ve disposable gerçek PostgreSQL

- teacher role yok/iptal edilmiş/başka öğretmen owner guard;
- direct table SELECT/DML ve service-role DML reddi, yalnız exact RPC execute;
- invite digest-only, canonical issue replay, mismatch, 7 gün/40 kullanım, revoke/expiry/full/concurrency;
- ayrı notice/consent audit olayları, yanlış sürüm ve withdrawal sonrası anlık visibility cutoff;
- 1/39/40/41 aktif öğrenci sınırı ve publish-membership yarışı;
- active-bank question snapshot, invalid answer/options/content fail-closed;
- recipient snapshot: late joiner geçmiş ödev almaz, removed/withdrawn submit edemez;
- exact answer set, blank, bounds, duplicate, wrong owner, deadline, concurrent replay;
- teacher JSON allowlist: öğrenci/profile UUID, e-posta, şehir, grade, soru/cevap, session/attempt/outcome, FSRS/mastery yok;
- işlem öncesi/sonrası verified attempts/sessions, review cards/logs, mastery evidence, XP/coin, quest, streak, achievement, social contribution ve reward ledger karşılaştırması değişmez.

### API/UI

- iki flag ve eksik legal/secret config fail-closed;
- auth/role/rate/no-store/strict unknown-key/UUID/memberRef/token sınırları;
- invite raw tokeninin yalnız issue yanıtında olması; URL query, analytics ve console'da olmaması;
- response runtime allowlist parser'ları ve PII/answer leakage negatif testleri;
- ayrı notice acknowledgement/consent kontrolleri, withdrawal, teacher role removal;
- öğrenci assignment loading/error/retry/submit/replay ve öğretmen aggregate ekranı;
- service worker özel sınıf/ödev navigasyonunu veya API'yi cache'lemez;
- tam type-check, hedef/tam Vitest, scoped/tam ESLint, migration lint, `node --check`, `git diff --check`;
- masaüstü/mobil/açık/koyu/klavye/screen-reader isimleri ve bağımsız Terra kapanış incelemesi.

## Yerel kabul kanıtı — 2026-08-09

- Migration 105 statik SQL sözleşmesi `9/9`, disposable gerçek PostgreSQL davranış paketi `6/6` geçti. Tüm DB paketi `22` çalışan dosya / `158` çalışan test başarılıdır; `14` dosya / `67` test yalnız harici disposable-DB ortam değişkenleri kapalı olduğu için opt-in skip'tir.
- Tam uygulama regresyonu aynı `--maxWorkers=2` koşulunda `284/284` dosya ve `2723/2723` test geçti. Bir render eski plan gösterebilen `useTodayPlan` yarışı istek-bağlamı anahtarıyla kapatıldı; oyun, kullanıcı, sınav ve kategori değişimleri gecikmeli başarısız yanıtlarla deterministik olarak doğrulandı (`12/12`).
- Exact Next.js `16.2.12` ile `tsc --noEmit` ve webpack production build geçti; `168/168` sayfa üretildi, tüm `/arena/sinif/**` ve `/api/teacher/**` rotaları build çıktısında yer aldı. SWC `16.3.0` eşleşme ve mevcut Sentry/package uyarıları build'i engellemedi.
- Tam ESLint `0` hata / `58` mevcut kapsam-dışı uyarıyla, migration lint `108` migration ile ve `git diff --check` temiz geçti.
- Gerçek build server üzerinde `/arena/sinif/davet` `200` döndü; `private,no-cache,no-store`, CDN/Cloudflare no-store, `Referrer-Policy: no-referrer` ve analytics originlerini dışlayan daha dar CSP doğrulandı. Senkron fragment bootstrap'ı HTML'de Plausible'dan önce çalıştı ve tarayıcıda hash'i DOM/hydration öncesi temizledi.
- `1280px` masaüstü ve `390×844` mobil gerçek tarayıcı kontrolünde öğrenci, ödev, davet ve öğretmen akışlarında yatay taşma görülmedi; görünür yeni kontroller en az `44px` idi. Native radio/checkbox erişilebilir adları, ayrı notice/consent, final-submit ve withdraw/remove onayları, tek-seferlik invite görünürlüğü ile teacher aggregate-only/PII'siz DOM doğrulandı. Tarayıcı sürücüsüyle gerçek Tab sırası ölçülmedi; klavye semantiği native element ve bileşen testleriyle doğrulandı.
- Terra güvenlik yeniden incelemesinde ham invite fragment'ının hydration öncesi sızma riski P1 olarak bulundu; senkron bootstrap ve özel CSP/no-store katmanıyla kapatıldı. Final salt-okunur inceleme R4.2 için kabul önerdi ve açık P0/P1 bulmadı. Önerilen P2 kanıtları kullanıcı/sınav/kategori yarış testleri ile temiz `.next/dev` başlangıcında kaldırılmış `/codex-r42-qa` rotasının gerçek HTTP `404` sonucu alınarak kapatıldı; production-header P2 açığı da yukarıdaki gerçek build-server koşusuyla kapanmıştır.

## Bounded uygulama sırası

1. **R4.2a — DB ve mahremiyet temeli:** migration 105, statik/gerçek-PG testleri, role/flag/config ve private contract parser'ları.
2. **R4.2b — API ve ödev motoru:** invite HMAC/digest, membership, server-controlled question selection, submit ve reward-isolation testleri.
3. **R4.2c — UI ve QA:** öğrenci/öğretmen sayfaları, erişilebilirlik, service worker regresyonu, tam test ve Terra incelemesi.

İlk patch 105 migration + iki DB testi + bu planla sınırlı tutuldu; API/UI yalnız gerçek PostgreSQL kapısı geçtikten sonra eklendi.

Canlı sıra: hukuki/retention/teacher-verification kararları → migration 105 → tüm flag/config kapalı deploy → ACL/no-leak smoke → yönetici tarafından 2–3 pilot teacher rolü → test hesaplarıyla invite/withdrawal/ödev smoke → server flag → küçük pilot → UI flag. Rollback önce iki flag'i kapatır ve teacher rollerini geri alır; private audit verisi onaylı saklama/imha prosedürü olmadan silinmez.
