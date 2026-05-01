/**
 * Bilge Arena Oda: route smoke tests
 * Sprint 1 PR4i — auth guard + redirect smoke
 *
 * Anonymous user için tüm /oda* sayfalar /giris'e redirect olmalı (auth-guarded).
 *
 * Multi-tab game flow e2e (host create + 2 player join + start + answer + reveal
 * + advance) Sprint 3'te eklenecek — gerçek Supabase auth + bilge-arena PostgREST
 * + Realtime WebSocket'ı mock'lamak veya test backend kullanmak gerekir.
 * Skeleton aşağıda commented out (TODO).
 */

import { test, expect } from '@playwright/test'

test.describe('Oda routes — auth guard', () => {
  test('/oda anonim -> /giris redirect', async ({ page }) => {
    await page.goto('/oda')
    await expect(page).toHaveURL(/\/giris/)
  })

  test('/oda/kod anonim -> /giris redirect', async ({ page }) => {
    await page.goto('/oda/kod')
    await expect(page).toHaveURL(/\/giris/)
  })

  test('/oda/yeni anonim -> /giris redirect', async ({ page }) => {
    await page.goto('/oda/yeni')
    await expect(page).toHaveURL(/\/giris/)
  })

  test('/oda/[kod] anonim -> /giris redirect', async ({ page }) => {
    await page.goto('/oda/BLZGE2')
    await expect(page).toHaveURL(/\/giris/)
    // NOT: page.tsx `redirect=/oda/${code}` query param ekliyor ama
    // (player) layout veya middleware redirect query'i `/oda`'a sadelestirebilir.
    // Test burada sadece /giris'e gidisi dogruluyor — query param tasimasi
    // implementation detayi (Sprint 3 e2e auth flow'da zenginlestirilebilir).
  })
})

/**
 * TODO Sprint 3: Multi-tab game flow e2e
 *
 * test.describe('Oda multi-tab game flow', () => {
 *   test('host creates room, 2 players join, full game cycle', async ({ browser }) => {
 *     // Need: 3 browser contexts (host + 2 players), each with valid auth cookie
 *     // Mock: Supabase auth callback with test JWT
 *     // Mock: bilge-arena PostgREST endpoints (test user accounts)
 *     // Mock: Supabase Realtime WebSocket OR use test channel
 *     //
 *     // Flow:
 *     // 1. Host context: create room via /oda/yeni form -> redirect /oda/[code]
 *     // 2. Player1 + Player2 contexts: join via /oda/kod form
 *     // 3. Host: click "Oyunu Başlat" -> state=active broadcast
 *     // 4. Players: click options -> typing broadcast visible to others
 *     // 5. Host: click "Cevabı Göster" -> state=reveal, SonucView renders
 *     // 6. Host: click "Sonraki Tura Geç" -> next round
 *     // 7. Final round -> state=completed -> GameCompleted scoreboard
 *     //
 *     // Verifications:
 *     // - presence dot updates when player joins/leaves
 *     // - typing indicator appears on other tabs when one selects
 *     // - answers_count badge increments on each submit
 *     // - my_answer indicator shows correct answer post-reveal
 *     // - scoreboard medal UI on completion
 *   })
 *
 *   test('reconnect REST resync (memory id=335)', async ({ page, context }) => {
 *     // Disconnect WebSocket via context.setOffline(true)
 *     // Wait for isStale=true UI banner
 *     // setOffline(false) -> reconnect -> HYDRATE dispatch -> isStale=false
 *   })
 * })
 */
