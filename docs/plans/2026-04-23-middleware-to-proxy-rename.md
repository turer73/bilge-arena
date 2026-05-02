# Middleware to Proxy Rename (PR-B) Implementation Plan

> **STATUS: COMPLETED (2026-04-23).** `src/proxy.ts` master'da mevcut, plan
> uygulandi. Tarihsel referans + Next 16 conversion rationale icin saklaniyor.

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** `src/middleware.ts` dosyasini Next.js 16 konvansiyonuna uygun olarak `src/proxy.ts` haline getirmek; auth flow, admin RBAC guard ve cache-control davranisinda sifir regresyon.

**Architecture:** Salt rename. Iki dosyada degisiklik: (1) `src/middleware.ts` -> `src/proxy.ts` dosya tasimasi + `export async function middleware` -> `export async function proxy`, (2) `src/lib/supabase/server.ts:24` icindeki yorum guncelle. Auth mantigi, matcher config, Supabase SSR cookie handler'lari AYNEN korunur. Hicbir davranis degisikligi yok.

**Tech Stack:** Next.js 16.2.3, @supabase/ssr 0.8.0, TypeScript 5.6, Vitest 4, Playwright e2e.

---

## Context and Baseline

### Current State (baseline)
- Branch: `master` HEAD `e977b56`, Vercel "Ready"
- `src/middleware.ts` — 93 satir, 3 sorumluluk:
  1. `/api/health/ping` auth bypass (Uptime Kuma)
  2. Supabase session refresh via `auth.getUser()` (her istek)
  3. `/admin` RBAC guard (session + service-key fallback) + no-store cache headers
- Next.js 16.2.3 yuklu, `middleware.ts` kullanimi **deprecated** (calisir ama uyari verir)
- Acik PR'lar: #15 (tdk-cleanup), #16 (codex-review-security) — master'da degil, bu PR onlarla cakismaz

### Why Now
Next.js 16'da `proxy.ts` yeni konvansiyon. Deprecation uyarisi temizlenir, gelecek major surumde breaking change riski ortadan kalkar. Codemod mevcut (`@next/codemod middleware-to-proxy`), 2-dosya-scope icin elle rename tercih ediliyor (diff review basit).

### Scope
- **In scope:** 2 dosya (src/middleware.ts rename, src/lib/supabase/server.ts:24 yorum), 1 yeni e2e test dosyasi.
- **Out of scope:** Auth logic refactor, matcher config iyilestirme, RBAC caching, middleware performance optimization. Bunlar ayri PR'lar.

### Decision: Manual Rename (codemod degil)
Codemod 2-dosya scope icin overkill. Manuel `git mv` + tek Edit diff'i temiz tutar, Codex review'i kolaylasir.

### Non-regression Contract
Degisiklik sonrasi sunlar AYNEN calismalı:
1. `/api/health/ping` -> 200 (auth bypass)
2. `/admin` yetkisiz -> 302 `/giris`
3. `/admin` yetkili -> 200 + `Cache-Control: no-store`
4. `/arena` -> oturum cookie'leri refresh oluyor
5. Login/logout flow bozulmuyor
6. Service key fallback (RLS empty -> REST API) hala calisiyor

---

### Task 1: Create branch and verify baseline

**Files:** None (branch operations only)

**Step 1: Create branch from master**

```bash
cd F:/projelerim/bilge-arena
git fetch origin master
git checkout -b chore/middleware-to-proxy origin/master
git status
```

Expected: `On branch chore/middleware-to-proxy`, clean tree.

**Step 2: Verify baseline builds clean**

Run: `npm run lint && npm run type-check`

Expected: Both pass (warnings OK, 0 errors).

**Step 3: No commit** — baseline verification only.

---

### Task 2: Rename middleware file to proxy

**Files:**
- Rename: `src/middleware.ts` → `src/proxy.ts`
- Modify: `src/proxy.ts` (export function rename)

**Step 1: Git move (preserves file history)**

```bash
git mv src/middleware.ts src/proxy.ts
git status
```

Expected: `renamed: src/middleware.ts -> src/proxy.ts`

**Step 2: Rename exported function**

Edit `src/proxy.ts` line 7:

```diff
- export async function middleware(request: NextRequest) {
+ export async function proxy(request: NextRequest) {
```

No other changes. `config.matcher` stays identical.

**Step 3: Run type-check**

Run: `npm run type-check`

Expected: PASS. If Next.js complains about export name, stop and investigate — proxy export name is the critical contract.

**Step 4: Commit**

```bash
git add src/proxy.ts src/middleware.ts
git commit -m "chore(next16): rename middleware.ts to proxy.ts

Next.js 16'da middleware.ts deprecated, proxy.ts yeni konvansiyon.
- git mv src/middleware.ts src/proxy.ts (history korundu)
- export async function middleware -> proxy
- matcher config ve auth logic aynen korundu"
```

---

### Task 3: Update comment in server.ts

**Files:**
- Modify: `src/lib/supabase/server.ts:24`

**Step 1: Update the comment**

Current line 24:
```typescript
// Server Component'te set yapilamiyor — middleware halleder
```

Change to:
```typescript
// Server Component'te set yapilamiyor — proxy halleder
```

**Step 2: Verify no other middleware references exist**

Run: `grep -rn "middleware" src/ --include="*.ts" --include="*.tsx"`

Expected: Only `proxy.ts` file shows up (no `middleware` references in src/ anymore).

**Step 3: Commit**

```bash
git add src/lib/supabase/server.ts
git commit -m "chore(next16): update server.ts comment to reference proxy

Yeni proxy.ts konvansiyonuna uygun olarak yorum guncellendi."
```

---

### Task 4: Add admin guard smoke test

**Context:** `e2e/` dizininde auth/admin flow testi yok. Rename sirasinda regresyon yakalayabilmek icin minimum 1 smoke test gerek. Learning mode: sen 2 test case'i dolduracaksin, ben iskeleti + 1 ornegi kuruyorum.

**Why this matters:** Test stratejisinde kritik karar — "hangi davranislari kilitleyecegiz?" sorusu. Proxy rename sessiz regresyon (redirect yerine 200, cache header eksik, vb.) yaratabilir; bu testler o sessizligi bozar.

**Files:**
- Create: `e2e/proxy-admin-guard.spec.ts`

**Step 1: Create test file with scaffolding + 1 example**

Create `e2e/proxy-admin-guard.spec.ts`:

```typescript
import { test, expect } from '@playwright/test'

// PR-B (middleware.ts -> proxy.ts) icin auth boundary smoke testleri.
// Rename sonrasi sessiz regresyon yakalamak icin minimum set.

test.describe('proxy auth boundary', () => {

  test('unauthenticated user on /admin redirects to /giris', async ({ page }) => {
    await page.goto('/admin', { waitUntil: 'networkidle' })
    await expect(page).toHaveURL(/\/giris/)
  })

  // TODO (user contribution): Test that /api/health/ping bypasses proxy (returns 200
  // without any auth cookie). This guards the Uptime Kuma integration.
  // Hint: use page.request.get() and assert status === 200.
  test.fixme('health endpoint bypasses proxy auth', async ({ request }) => {
    // placeholder — implement me
  })

  // TODO (user contribution): Test that /admin response (even redirected) carries
  // the Cloudflare no-store cache headers. This prevents edge caching of admin pages.
  // Hint: set maxRedirects:0, read res.headers()['cache-control'].
  test.fixme('admin response carries no-store cache headers', async ({ request }) => {
    // placeholder — implement me
  })
})
```

**Step 2: USER CONTRIBUTION — Implement the two `test.fixme` cases**

**Request to user:** Iki `test.fixme` test case'ini implement et (5-8 satir her biri).

**Guidance:**
- **Health endpoint test:** `/api/health/ping` URL'sine auth cookie OLMADAN istek at, status 200 ve basarili body bekle. Bu test `proxy.ts:9-11` bypass mantigini kilitler.
- **Cache header test:** `/admin`'e istek at, redirect takip etme (`maxRedirects: 0, failOnStatusCode: false`). Response status 302 olacak. Ama Not: Next.js redirect response'larinda custom cache-header'lar siklikla dusebilir — bu test basarisiz olursa, asil header'lari yetkili oturumla test etmek gerekir (ki bu e2e'yi karmasiklastirir). **Karar sende:** redirect senaryosu mu test edelim, yoksa skip edip yetkili session kuran daha agir bir test mi yazalım?

**Tradeoff:**
- Basit redirect test: hizli, ama cache header'larin yetkili yol uzerinde ne yaptigini test etmiyor
- Authenticated test: gercekci, ama Playwright'ta Supabase auth setup extrasi gerekir

**Step 3: Run the test locally**

Run: `npm run test:e2e -- proxy-admin-guard`

Expected: 1 pass + 2 fixme (until you implement them), then all 3 pass.

**Step 4: Commit**

```bash
git add e2e/proxy-admin-guard.spec.ts
git commit -m "test(e2e): add proxy auth boundary smoke tests

PR-B rename regresyonu icin minimum e2e coverage:
- /admin yetkisiz -> /giris redirect
- /api/health/ping bypass (user contribution)
- /admin no-store cache headers (user contribution)"
```

---

### Task 5: Build + type-check + lint verification

**Files:** None (verification only)

**Step 1: Run all three checks**

```bash
npm run lint
npm run type-check
npm run build
```

Expected:
- `lint`: 0 errors (34 warnings known baseline — OK)
- `type-check`: 0 errors
- `build`: succeeds, `/admin` appears as "Middleware" or "Proxy" entry in route summary

**Step 2: Inspect build output**

Build output end'inde Middleware/Proxy satirini kontrol et:

```
λ  /admin                                    (deps)
...
ƒ  Middleware                               93 B
```

Next.js 16 bu etikeri "Middleware" veya "Proxy" yazabilir — dokumanlara gore yeni konvansiyon "Proxy". Hic cikmiyorsa matcher config'in farkinda degil, proxy.ts dosya adi veya export adi hatali demektir; Task 2'ye geri don.

**Step 3: No commit** — verification only.

---

### Task 6: Local dev server smoke test

**Files:** None (manual verification)

**Step 1: Start dev server**

Run: `npm run dev`

Wait until: `✓ Ready in X.Xs` + `Local: http://localhost:3000`

**Step 2: Smoke test matrix**

Bir browser sekmesinde (cookie temiz / incognito):

| URL | Expected | Why |
|-----|----------|-----|
| `http://localhost:3000/api/health/ping` | 200, health JSON | Auth bypass dogrulama |
| `http://localhost:3000/admin` | Redirect to `/giris` | Yetkisiz guard |
| `http://localhost:3000/arena` | 200, arena page | Normal rota calisiyor |
| `http://localhost:3000/` | 200, landing | Session refresh sessizce calisiyor |

**Step 3: Authenticated test (admin hesabi)**

1. `/giris` sayfasindan admin hesabi ile login ol
2. `/admin`'e git -> 200 + admin dashboard gorunmeli
3. DevTools Network tab'inde `/admin` response headers:
   - `cache-control: private, no-cache, no-store, must-revalidate` ✓
   - `cdn-cache-control: no-store` ✓
   - `cloudflare-cdn-cache-control: no-store` ✓
4. Logout -> cookie'ler silindi mi, `/admin` yine redirect ediyor mu?

**Step 4: Stop dev server**

`Ctrl+C` ile kapat.

**Step 5: No commit** — verification only. Eger testlerden biri basarisiz: task 2-3'e don, auth flow'u debug et.

---

### Task 7: Push + open PR

**Files:** None (git operations)

**Step 1: Push branch**

```bash
git push -u origin chore/middleware-to-proxy
```

**Step 2: Open PR**

```bash
gh pr create --base master --title "chore(next16): rename middleware.ts to proxy.ts" --body "$(cat <<'EOF'
## Summary
- Next.js 16 konvansiyonuna uyum: src/middleware.ts -> src/proxy.ts
- export async function middleware -> proxy
- server.ts:24 yorum guncellemesi
- e2e/proxy-admin-guard.spec.ts (3 smoke test)

## Non-regression
Auth flow, admin RBAC guard, cache-control, matcher config AYNEN korundu. Salt rename.

## Test plan
- [x] npm run lint — 0 error
- [x] npm run type-check — 0 error
- [x] npm run build — proxy route olustu
- [x] npm run test:e2e -- proxy-admin-guard — 3/3 pass
- [x] Lokal smoke: /api/health/ping 200, /admin yetkisiz -> /giris, /admin yetkili -> 200 + no-store
- [ ] Vercel preview smoke (Task 8)

## Scope
- In: rename file + export + 1 yorum + e2e smoke
- Out: auth refactor, matcher config, performance

EOF
)"
```

**Step 3: Note the PR number** — ornek `#17`. Sonraki task'larda referans olacak.

---

### Task 8: Vercel preview smoke test

**Files:** None (remote verification)

**Step 1: Vercel preview URL'sini al**

```bash
gh pr view <PR_NUMBER> --json statusCheckRollup | grep -i vercel
```

Veya PR sayfasinda Vercel bot'unun yorumuna bak.

**Step 2: Preview'da smoke test tekrarla**

Task 6 matris'ini preview URL uzerinde tekrarla:
- `<preview-url>/api/health/ping` -> 200
- `<preview-url>/admin` yetkisiz -> 302 `/giris`
- `<preview-url>/admin` yetkili -> 200 + no-store headers

**Step 3: Eger preview'da hata varsa**
- Sentry'ye yeni error geldi mi? `gh api` ile Sentry issue'lari kontrol
- `vercel logs` veya Vercel dashboard'da build log'u
- Lokal calisip preview'da calismayan durum: env var eksikligi, edge runtime fark, CF CDN cache layer

**Step 4: PR yorumu olarak preview sonuclarini yaz**

```bash
gh pr comment <PR_NUMBER> --body "Vercel preview smoke test: PASS (4/4). Auth guard, cache headers, health bypass calisiyor."
```

---

### Task 9: Review bekle + Klipper memory kaydi

**Files:** Klipper memory API (curl)

**Step 1: Klipper memory session kaydi**

```bash
curl -s -X POST \
  -H "X-Memory-Key: n7lfjr7aqpe_wWm7VqihgI_fafGNK9ltEYmnBGUPsvg" \
  -H "Content-Type: application/json" \
  -d '{"device_name":"windows-masaustu","platform":"win32","summary":"PR-B acildi: middleware.ts -> proxy.ts, Next16 konvansiyon, PR #<NUM>"}' \
  http://100.113.153.62:8420/api/v1/memory/sessions
```

**Step 2: Task log kaydi**

```bash
curl -s -X POST \
  -H "X-Memory-Key: n7lfjr7aqpe_wWm7VqihgI_fafGNK9ltEYmnBGUPsvg" \
  -H "Content-Type: application/json" \
  -d '{"project":"bilge-arena","task":"PR-B middleware to proxy rename","status":"pending","description":"PR acildi review bekliyor, preview smoke gecti"}' \
  http://100.113.153.62:8420/api/v1/memory/tasks
```

**Step 3: Review'a onay gelene kadar merge YAPMA**

User'in Codex review veya onayini bekle. PR #15 ve #16 ile ayni queue'ya girer — review siraya tabi.

**Step 4: Merge sonrasi (ayri oturumda)**
- `git checkout master && git pull origin master`
- `chore/middleware-to-proxy` branch'ini sil
- Klipper memory session kapat

---

## Verification Checklist (kopyala PR body'sine)

- [ ] `npm run lint` 0 error
- [ ] `npm run type-check` 0 error
- [ ] `npm run build` basarili, proxy route gorunuyor
- [ ] `npm run test:e2e -- proxy-admin-guard` 3/3 pass
- [ ] Lokal: /api/health/ping 200
- [ ] Lokal: /admin yetkisiz -> /giris redirect
- [ ] Lokal: /admin yetkili -> 200 + 3 cache header
- [ ] Lokal: /arena yetkisiz -> 200 (normal load, cookie refresh)
- [ ] Preview: ayni 4 senaryo pass
- [ ] Sentry'de yeni error yok
- [ ] PR body doldurulmus, smoke sonuclari notlanmis

---

## Rollback Plan

Eger preview'da veya merge sonrasi prod'da regresyon varsa:

**Hemen rollback (revert PR):**
```bash
git revert <merge-commit-sha>
git push origin master
```

**Hotfix (fix forward):**
- Eski middleware.ts'i git history'den geri getir: `git checkout <pre-rename-sha> -- src/middleware.ts`
- proxy.ts'i sil, export'u geri al
- Bu 5 dakikalik islem, history kaybi yok (git mv kullanildigi icin)

**Sentry alarm esigi:** Rename sonrasi 10 dakika icinde yeni fetch failed / auth error artarsa rollback.

---

## Dikkat Notlari (durust)

1. **Codemod yerine manuel rename** tercih edildi (diff basit, 2 dosya). Buyuk projede tersi mantikli.
2. **E2E testlerde authenticated admin test EKSIK** — Supabase session mock'u olmadigi icin. Manuel smoke test gerekli.
3. **proxy.ts ile middleware.ts ayni anda var olamaz** — Next.js 16 ikisini birden gorurse hangisini kullanacagi belirsiz, build uyarisi gelebilir. Git mv sonrasi eski dosya disappear olur, sorun yok.
4. **Cloudflare edge cache katmani** middleware/proxy cikisini by-passlayabilir eger header'lar prod'da propagate olmuyorsa. Preview'da header'lari `curl -I` ile dogrula.
5. **server.ts'deki yorum guncellemesi kritik degil** ama tutarlilik icin yapiliyor — merge edilmezse proxy calisir ama yorumda eski adı kalir.
