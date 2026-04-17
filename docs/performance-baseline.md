# Performance Baseline

**Tarih:** 2026-04-17
**Next.js:** 16.2.3 (Turbopack)
**Commit:** 31479a6+

## Bundle Size (production build)

En buyuk 5 chunk:
- 272 KB — ana app chunk
- 228 KB — framework chunk (React, Next)
- 204 KB — vendor bundle
- 136 KB — shared utils
- 112 KB — async chunks (x2)

**Not:** Chunk isimleri build-bazli hash'ler. Dynamic import'lar ayri chunk'lara bolundu (CookieBanner, OnboardingOverlay = framer-motion, QuizEngine, EditorLayout, HowItWorks, LeaderboardPreview, CTA).

## Yaplandirma

### next.config.mjs
- `optimizePackageImports`: `lucide-react`, `framer-motion`, `zustand`
- `compress: true` (gzip/brotli)
- Image formats: AVIF + WebP
- Device sizes: 640, 750, 828, 1080, 1200, 1920, 2048, 3840
- Cache-Control: `public, max-age=31536000, immutable` (static assets)
- Bundle analyzer: `ANALYZE=true npm run build`

### Image Optimization
- Tum gorseller `next/image` kullaniyor (logo.tsx dahil — Apr 2026 fix)
- User avatar'lari Supabase'den cekiliyor — AVIF donusumu otomatik

### Loading Strategy
- 11 route-level `loading.tsx` (Suspense boundaries)
- 17 dynamic() import — heavy components lazy loaded
- `priority` prop ana logo icin (LCP iyilestirmesi)

## N+1 Fix'leri
- `/api/cron/weekly-digest`: 150 query → 3 query (batch Promise.all)
- `/api/challenges/[id]/submit`: question lookup batch
- `/api/sessions`: topic progress batch RPC

## Database
- 6 composite index (profiles, friendships, challenges, questions)
- Soft delete query filtreleri (`is('deleted_at', null)`)

## CSP + Security Headers
- CSP enforce mode (Apr 2026)
- HSTS: `max-age=63072000; includeSubDomains; preload`
- Permissions-Policy: kamera/mikrofon/odeme disabled

## Sentry Performance
- TracesSampleRate: 0.1 (production)
- ReplaysSessionSampleRate: 0.01
- ProfilesSampleRate: 0.1

## Monitoring Hedefleri (gelecek)

| Metrik | Hedef | Mevcut |
|--------|-------|--------|
| LCP | < 2.5s | olcum bekleniyor (Sentry) |
| CLS | < 0.1 | olcum bekleniyor |
| FID/INP | < 200ms | olcum bekleniyor |
| TTFB | < 600ms | olcum bekleniyor |
| JS bundle (first load) | < 300KB | 272KB max chunk |

## CI Kontrolleri
- `pre-push` hook: `npm run build && npm run test`
- `pre-commit` hook: `npm run lint && npm run type-check`
- Vercel deployment: otomatik preview

## Yenileme Stratejisi
Bu baseline 3 ayda bir guncellenmeli. Major dependency bump sonrasi da kontrol edilmeli.
