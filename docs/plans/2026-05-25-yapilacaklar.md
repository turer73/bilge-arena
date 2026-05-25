# Bilge Arena — Yapılacaklar Listesi (2026-05-25)

**Bağlam:** 2026-05-16 olayı **authorized insider pentest** olarak reclassify edildi (commit `cecbb64` / PR #164) — dış ifşa değil, KVKK dış bildirim yükümlülüğü yok. Madde 9 sprint kapandı (#146-#164). Son commit 2026-05-18 (`be6860e` iletisim sayfasi). 0 açık PR, 0 açık issue. Bu liste **kapanmamış teknik işleri** topluyor — kriz değil normal sprint backlog.

---

## P0 — Güvenlik kapanışı

- [ ] **Migration 049 final lockdown apply** — `database/migrations/049_authenticated_lockdown_DRAFT.sql` hâlâ DRAFT (ROLLBACK ile sarılı). Ön koşullar:
  - `src/app/page.tsx` landing ISR `questions.count(*)` → service-role'a geç
  - `src/lib/supabase/admin.ts` admin RBAC (`user_roles`, `role_permissions`) → service-role'a geç
  - `src/proxy.ts:70` middleware admin RBAC → service-role'a geç
  - `src/app/api/admin/**`, `api/badges/`, `api/cron/**` → audit
  - Prod smoke test: login + quiz + leaderboard + profil + admin + duello + yorum
  - Runbook: `docs/runbooks/2026-05-17-madde9-final-lockdown.md`
  - Apply: son satırdaki `ROLLBACK;` → `COMMIT;`

- [x] ~~**Service-role env var refactor**~~ — Yapıldı (2026-05-25 teknik borç oturumu). `SUPABASE_SERVICE_KEY` öncelikli, `SUPABASE_SERVICE_ROLE_KEY` fallback. `service-role.ts:4`, `proxy.ts:70` güncellendi. JWT secret rotation artık deploy'ı kırmadan yapılabilir (Supabase Dashboard aksiyonu kullanıcıda).

## P1 — Bilinen açıklar

- [ ] **Duello cheat fix (H-150-2)** — `content.answer` client'a sızıyor. Server-side oyun state'i; cevap doğrulama API'de, client'a sadece doğru/yanlış dönsün. Ayrı sprint olarak işaretliydi.

- [ ] **N1+N2 VPS log avı** — Saldırı vektörü kesin değil (en olası service-role JWT sızıntısı). Klipper sandbox SSH onayı bekliyor, VPS log'larında saldırgan IP/UA/timeline aranacak.

## P2 — Operasyonel sıkılaştırma

- [ ] **Cloudflare Turnstile captcha** — Supabase Dashboard → Auth → Bot and Abuse Protection. Site key + secret oluşturulup girilecek (`bilgearena.com`). Google OAuth dışı tüm signup/login için zorunlu olur.

- [ ] **Supabase Auth rate limit** — Dashboard → Auth → Rate Limits:
  - `Token verifications`: 30/hr/IP (default 360)
  - `Sign ups and sign ins`: 30/hr/IP (default 60)

- [ ] **Disposable email blocklist genişlet** — Migration 048 sadece 87 domain seed ediyor. `github.com/disposable-email-domains/disposable-email-domains` 3000+ liste. Periyodik sync veya Cloudflare Worker validate.

- [ ] **Honeypot dış-IP alert pipeline** — Sentinel profili (`__honeypot_sentinel_001__`) mevcut (mig 051-054). Saatlik cron + Supabase Logs query → dış IP'den çekilirse Sentry alert eklenmedi.

## P3 — KVKK (gündem DIŞI — reclassify sonrası)

~~KVKK md. 12/5 dış bildirim yükümlülüğü~~ — yok. 2026-05-18 reclassify: pentest authorized insider tarafından, dış 3. şahıs ifşası gerçekleşmedi. Avukat brief'i (`docs/security/2026-05-17-kvkk-avukat-brief.md`) ve eski "165 kullanıcı bildirim" planı tarihsel kayıt; aksiyon gerektirmiyor. PR #164 mesajında dokümante.

## P4 — Sonraki sprint adayları (acil değil)

- [ ] **Madde 9 kalan tablo audit** — Sprint S.9.4 (planda 2 gün): comments, friendships, achievements, daily_quests, topic_progress, question_history, referrals, challenges, push_subscriptions, notifications, chat_messages vb. `.from()` kullanımları taranıp proxy'lendi mi?

- [ ] **Realtime stratejisi** — Oda sistemi Supabase Realtime direct connection kullanıyor. Authenticated REVOKE sonrası realtime kanalları RLS'e bağımlı; channel-level auth review.

- [ ] **AdSense uyumluluk son adımlar** — `be6860e` iletişim + footer eklendi. Privacy/cookies dokümanları taze (#159) ama AdSense başvurusu/onayı durumu kayıtsız.

---

## Yapıldı (bağlam — son 1 hafta)

- ✅ #146-#150 Madde 9 browser→API proxy (use-auth, questions, profile-stats, comments, duello)
- ✅ #151-#154, mig 050-054 honeypot sistem (sentinel + integrity + search RPC filter + NULL drift)
- ✅ #155-#159, #162, #164 KVKK doc seti + privacy/cookies + içerik testi reclassify
- ✅ #160-#161 CSRF allowlist + Vercel team suffix fix
- ✅ #163 honeypot NULL drift + username reserve hardening
- ✅ V2 sign-all-users-out tamamlandı (#158)
- ✅ Disposable email block mig 048 apply'li (87 domain)

## Yapıldı (2026-05-25 teknik borç oturumu)

- ✅ **Service-role env var fallback** — `service-role.ts:4`, `proxy.ts:70` (rotation deploy-safe)
- ✅ **3 unused-vars** — `grant-stats/route.ts:25` import sil, premium waitlist test `_mockFrom`, profile test `_cols`
- ✅ **3 @deprecated type aliases** — `database.ts:476-484` `Achievement`/`UserAchievement`/`LeaderboardEntry` silindi (grep: 0 reference)
- ✅ **Onboarding debug console.log** — `onboarding-overlay.tsx:43-46` temizlendi
- ✅ **react-hooks/exhaustive-deps** — `HostGameActions.tsx:141` `mode` deps'e eklendi (gerçek bug: mode geçişinde stale)
- ✅ **react-hooks/purity** — `burst-particles.tsx` `useMemo+Math.random` → `useState(() => ...)` initializer pattern (React 19 uyumlu)
- ✅ **Migration 017 collision dokümantasyonu** — `docs/runbooks/2026-05-25-migration-017-collision.md`
- ✅ **Sonuç:** ESLint 16→11 warning (kalan 11 = `set-state-in-effect`, team tarafından `warn` olarak downgrade edilmiş, CI bloklamıyor). TypeScript 0 hata. Vitest 1599/1599 yeşil.

## Beklemede (kullanıcı kararı)

- 🟡 **npm audit fix** — 4 moderate advisory (brace-expansion, postcss-via-next, uuid-via-svix, ws). `--force` gerektirmeyen kısım güvenli ama unattended dep bump için onay lazım.
- 🟡 **@supabase/ssr 0.8 → 0.10** — auth-critical minor bump, changelog incelemesi + auth flow regression test gerektirir; ayrı oturum.
- 🟡 **Mig 049 apply** — yukarıdaki ön koşul refactor önce.

---

## Notlar

- Bu liste `docs/plans/2026-05-17-security-incident-followup.md` + memory `project-bilge-arena-saldiri-2026-05-16` + git log son hafta çapraz okumasından çıktı.
- Bilge English (`bilge-arena-en`) ayrı proje, sürer ile aktif (BILGE-EN-* paketleri). Bu dosya **TR YKS** Bilge Arena.
