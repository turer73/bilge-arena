# Bilge Arena — Güvenlik Sertleştirme Tasarım Dokümanı

**Tarih:** 2026-04-07
**Kapsam:** 11 güvenlik açığı — Kritik, Yüksek, Orta, Düşük
**Yaklaşım:** 3 commit, öncelik sırasıyla

---

## Commit 1: Kritik + Yüksek (4 fix)

### 1.1 Git history'de secret kontrolü
- `git log -p --all -S "SUPABASE_SERVICE_ROLE_KEY"` ile kontrol
- Eğer varsa: BFG Repo-Cleaner veya `git filter-branch` ile temizle
- .env.local'ın gitignore'da olduğunu doğrula

### 1.2 Service role audit logging
- `service-role.ts`'e wrapper fonksiyon ekle
- Her service role çağrısında admin_id, action, IP logla
- `createAuditedServiceRoleClient(adminId, action)` pattern

### 1.3 LIKE query wildcard escape
- Yeni utility: `escapeForLike(input)` — `%` ve `_` escape eder
- Etkilenen dosyalar:
  - `api/admin/users/route.ts` (GET — search)
  - `api/users/search/route.ts` (GET — search)
  - `api/admin/roles/[id]/route.ts` (varsa)

### 1.4 Email validation güçlendirme
- `api/admin/users/route.ts` POST — Zod email schema kullan
- Max 254 karakter, RFC uyumlu

---

## Commit 2: Orta (5 fix)

### 2.1 Admin endpoint rate limiting
- Mevcut `rate-limit.ts` utility'sini admin route'lara ekle
- Etkilenen: POST /api/admin/users, GET /api/admin/users, tüm admin CRUD

### 2.2 CRON_SECRET zorunlu yap
- `api/cron/weekly-digest/route.ts` — CRON_SECRET yoksa throw
- Opsiyonel kontrolü zorunlu yap

### 2.3 Email template HTML escape
- `api/cron/weekly-digest/route.ts` — display_name'i escape et
- `escapeHtml()` utility fonksiyonu

### 2.4 AI soru üretimi validasyonu
- `api/admin/generate-questions/route.ts` — Zod schema
- answer: 0-4 arası, options: tam 5 eleman, string length limitleri

### 2.5 Dosya yükleme magic bytes kontrolü
- `api/admin/homepage/upload/route.ts` — PNG magic bytes doğrulama
- Client MIME type'a güvenme, buffer header kontrol et

---

## Commit 3: Düşük (2 fix)

### 3.1 Public endpoint cache headers
- GET /api/questions — Cache-Control: public, max-age=300
- GET /api/homepage/content — Cache-Control: public, max-age=300

### 3.2 Admin log zenginleştirme
- IP adresi (x-forwarded-for veya request header)
- User-agent
- Tüm admin route'larda tutarlı log formatı

---

## Doğrulama
- Her commit sonrası: `npx vitest run` + `npx next lint` + `npx tsc --noEmit`
- Final: Tüm 11 fix'in çalıştığını doğrula
