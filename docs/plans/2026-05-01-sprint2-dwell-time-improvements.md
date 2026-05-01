# Sprint 2 — Bilge Arena Dwell Time İyileştirme Planı

> **Kaynak:** Memory id=413 (`bilge_arena_dwell_time_research`)
> **Tarih:** 2026-05-01
> **Hedef:** Avg session_duration +3dk, lobby drop %30→%15, oyun tamamlanma +%20

---

## Sprint Yapısı

| Sprint | Süre | İçerik | Beklenen Etki |
|---|---|---|---|
| **Sprint 2A — Quick Wins** | 1.5 hafta | Reveal auto-advance + Lobby widget + Public discovery | +3dk avg, lobby drop yarıya |
| **Sprint 2B — Engagement Loops** | 2 hafta | Solo mode + Daily streak + Push hook | DAU 2x, MAU 1.5x |
| **Sprint 2C — Retention** | 2 hafta | Leaderboard + Profil derinliği + Replay/Share | D7 %20+, viral K 0.05→0.15 |

---

## Sprint 2A — Quick Wins (P0)

### Task 1 — Reveal Auto-Advance (3 gün)

**Sorun:** Host "Sonraki Tur"u tıklamayı yavaş tıklıyor → her tur arası 20-40sn dead time × 10 round = 5+ dk kayıp.

**Çözüm:** Reveal state'inde 5sn countdown sonrası otomatik `advance_round` RPC tetiklensin. Server-side relay function PR2c'de zaten var (`auto_relay_function`).

**Adımlar:**
1. `RoomDetail` tipine `auto_advance_seconds: number` alanı ekle (default 5)
2. DB migration: `rooms.auto_advance_seconds INT DEFAULT 5 CHECK (BETWEEN 0 AND 30)`
3. CreateRoomForm'da slider (0-30, 0=manuel)
4. `SonucView` + `HostGameActions`: countdown timer (started from `revealed_at`)
5. Client-side veya server-side trigger karari (önerilen: server-side cron — auth.uid() yerine SECURITY DEFINER, host izni)
6. Host her zaman "Hemen Geç" override edebilir
7. Test: 3 e2e (auto trigger, host override, 0=disable)

**Riskler:**
- Server-side cron resource yiyebilir → 1 saniyede max 1 trigger throttle
- Network gecikmesi: client/server clock drift — countdown server-canonical olmalı

---

### Task 2 — Lobby Auto-Question Widget (1 hafta)

**Sorun:** Lobby'de host'un "Başlat"ı beklenirken hiçbir engagement yok.

**Çözüm:** Lobby'ye küçük "Aklında Tut" widget'ı — kategori-uygun rastgele 1 soru gösterilir, sayım/cevap yok, sadece beyin ısıtma.

**Adımlar:**
1. `LobbyPreviewQuestion.tsx` component
2. SSR'da random soru çek (`questions` tablosu, `category=room.category`, `LIMIT 1 ORDER BY RANDOM()`)
3. Sadece soru text + 4 seçenek göster, cevap saklı (anti-cheat: gerçek oyun sorusu olmasın — `where game = preview` filter veya ayrı pool)
4. "Yeni Soru" butonu (manual refresh)
5. Test: 2 smoke (render + refresh button)

**İyileştirme:** Üye giriş çıkış animasyonu + "join sound" (opt-in, audio hint).

---

### Task 3 — Public Oda Discovery (3 gün)

**Sorun:** `/oda` sekmesi sadece "kendi odaların" — boş site izlenimi, discovery yok.

**Çözüm:** `/oda` sekmesinde 2 sekme: "Odalarım" + "Aktif Odalar" (public). Public flag'i room create form'da.

**Adımlar:**
1. DB migration: `rooms.is_public BOOLEAN DEFAULT FALSE` (host opt-in)
2. `chk_rooms_public_lobby_only`: is_public TRUE iken sadece state='lobby'
3. CreateRoomForm: "Herkese açık" checkbox
4. `fetchPublicRooms()` server-fetch: `state=eq.lobby&is_public=eq.true&order=created_at.desc&limit=20`
5. `<PublicRoomList />` component + kategori filter
6. RLS policy: public rooms herkes SELECT edebilir (lobby state'inde)
7. Test: 3 (RLS public visible, RLS state filter, kategori filter)

**Önemli:** is_public=true odalar için max_players limiti zorlanmalı, troll önlemi.

---

## Sprint 2B — Engagement Loops (P1)

### Task 4 — Solo Mode (2 hafta)

**Sorun:** Yeni gelen kullanıcı arkadaşı yokken oynayacak şey bulamıyor.

**Çözüm:** "Hızlı Oyun" butonu → bot rakiplerle 10 sorulu solo oda.

**Adımlar:**
1. Bot user concept (DB'de `users.is_bot BOOLEAN`, varsayılan 5 bot profili)
2. `quick_play_room()` RPC: 1 user + 3 bot member, lobby skip, direct active
3. Bot answer logic: zorluk + rastgele 60-80% doğruluk + response_ms 5-15sn random
4. Single-player UI farkı yok — GameView aynı, sadece members[3] bot
5. Test: 2 (bot creation, bot answer timing)

**Pazarlama:** "Beklemeden hemen oyna" anasayfa CTA.

---

### Task 5 — Daily Streak + Push Hook (1 hafta)

**Sorun:** Kullanıcı 1 oturum oynayıp gidiyor, dönmüyor.

**Çözüm:** Streak sistemi + push notification.

**Adımlar:**
1. DB: `user_streaks (user_id, current_streak, longest_streak, last_played_at)`
2. Cron (daily 03:00): `update_streaks()` — son 24sa içinde oynamayan = streak reset
3. UI: Profil sayfası "Streak: 3 gün" badge + bonus puan tablosu
4. Push notification (web push — service worker zaten var):
   - Streak +1 olduğunda "Streak'in: 5 gün, harika!"
   - 18:00 reminder: "Bugün oyun oynamadın, streak sürdür"
5. Test: 4 (streak +1, reset, longest update, push opt-in/out)

**Önlemler:** Push frekansı günde max 1 (excessive notif churn riski memory id=research'ten).

---

## Sprint 2C — Retention (P2)

### Task 6 — Leaderboard (1 hafta)

**Sorun:** Skor anlık, takip yok, motivasyon kaybı.

**Çözüm:** 3 tab: "Bu Hafta", "Bu Ay", "Tüm Zamanlar". Kategori bazlı filter.

**Adımlar:**
1. Materialized view: `leaderboard_weekly` (refresh daily cron)
2. `/liderlik` sayfa — server component, top 100
3. Profile pic + nickname + score + win count
4. RLS: herkes SELECT
5. Test: 2 (refresh trigger, top 10 doğruluk)

---

### Task 7 — Profil Derinliği (1 hafta)

**Sorun:** Profil sayfası boş, geçmiş oyun yok.

**Çözüm:** Profil'de win/loss, favori kategori, rozet, son 10 oyun.

**Adımlar:**
1. `fetchUserStats(userId)` — agregeli istatistikler
2. `<ProfileStats />` + `<RecentGames />`
3. Rozet sistemi (10 oyun = bronz, 100 = gümüş, 1000 = altın)
4. Test: 3 (stats, son oyunlar, rozet hesabı)

---

### Task 8 — Replay & Share (4 gün)

**Sorun:** Oyun bitince viral akış yok, organik growth zayıf.

**Çözüm:** GameCompleted'da "Sonucu Paylaş" + "Bu odayla yeniden oyna".

**Adımlar:**
1. OG image dynamic route: `/api/og/result/[room_id]` — kart resmi (skor, kategori, tarih)
2. ShareButton (clipboard + Twitter/Telegram/WhatsApp deep link)
3. Replay: clone room settings + new code + redirect lobby
4. Test: 2 (OG generation, replay clone)

---

## Ölçüm Çerçevesi

### PostHog Setup

**Custom Events (gönderilecek):**
- `lobby_dwell_seconds` (number) — lobby'de geçirilen süre, `pageleave` anında
- `game_round_engagement` (number) — soruya cevap verme süresi, `submit_answer` öncesi
- `room_completed` (props: round_count, duration_seconds, was_solo)
- `streak_changed` (props: old, new, action: 'increment' | 'reset')
- `share_clicked` (props: target: 'twitter' | 'telegram' | 'clipboard')

**Cohort'lar:**
- "Solo player" — sadece bot odalarında oynayan
- "Multiplayer regular" — son 7gün ≥3 oyun
- "Lurker" — son 30gün 0 oyun ama session_duration >0

**Funnel:**
1. `$pageview` /oda → `room_joined` veya `room_created`
2. `room_started` → `submit_answer` ≥1 kez
3. `room_completed` → `share_clicked` veya `replay_clicked`

### Acceptance Criteria

| Sprint | KPI | Hedef | Doğrulama |
|---|---|---|---|
| 2A sonu | Avg session_duration | +3dk (4dk → 7dk) | PostHog cohort, A/B before/after |
| 2A sonu | Lobby drop % | %15 (önceden %30) | Funnel adım analizi |
| 2A sonu | Round completion rate | +%20 | `room_completed` / `room_started` |
| 2B sonu | DAU | 2x | PostHog dashboard |
| 2B sonu | D7 retention | %20+ | Cohort retention chart |
| 2C sonu | Viral K-faktör | 0.15 | Share→signup attribution |

---

## Risk Listesi

| Risk | Olasılık | Etki | Mitigasyon |
|---|---|---|---|
| Auto-advance server cron kaynak yer | Orta | Orta | Throttle + monitoring, gerekirse client-fallback |
| Public oda spam/troll | Orta | Yüksek | max_players limit + report button + auto-cancel idle |
| Bot mode soğuk hisettirir | Düşük | Düşük | Bot isimleri varied, tepki gecikmeleri humanize |
| Push notif spam algısı | Yüksek | Yüksek | Günde max 1, opt-in onboarding net |
| Leaderboard performans | Düşük | Orta | Materialized view + Redis cache (Sprint 2D) |
| Streak FOMO sağlıksız | Düşük | Orta | "Tatil modu" toggle, hafta sonu pause |

---

## Out-of-Scope (Sprint 3+)

- Realtime broadcast (typing/ready) — gerekli değil, deeper engagement gerekmiyor
- Playwright multi-tab e2e — manual testing yeterli MVP
- Audio/sound design profesyonel — placeholder ses dosyaları yeterli
- AI question generation kalitesi tuning — ayrı sprint
- Premium features (ads-free, custom themes) — monetization sprintleri ayri

---

## Bağımlılıklar (Sprint 1'den miras)

- ✅ Server Action pattern (PR4a-PR4e-5) — yeni Server Action'lar bu kalıbı reuse
- ✅ Realtime channel (setupRoomChannel) — yeni listener'lar `onRoundChange` veya yeni callback
- ✅ RoomState reducer — yeni event'ler reducer'a eklenir
- ✅ TDD discipline — her task minimum 2-3 test

## Memory Referansları

- id=413 `bilge_arena_dwell_time_research` (kaynak araştırma)
- id=410 `stack_pr_base_merge_trap` (PR workflow uyarı)
- id=411 `bilge_arena_oda_server_action_kalibi` (kalıp reuse)
- id=336 `bilge_arena_oda_bolum3_realtime` (mimari blueprint)

---

**Toplam Sprint 2 iş:** ~5-6 hafta, 8 task, 24+ test, 3 DB migration, 2 cron job, 5 yeni component.
