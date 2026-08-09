/**
 * Bilge Arena Service Worker — Manual implementation
 *
 * @ducanh2912/next-pwa Next 16 ile uyumsuzdu (sw.js dispatcher uretmedi,
 * workbox/swe-worker fragments uretti, /sw.js HTML fallback ile broken PWA).
 * Manual vanilla SW API: build_id-bagimsiz, deterministic, deploy time
 * generate gerekmez.
 *
 * Strateji:
 *   - Network-first: HTML pages (offline fallback /offline route)
 *   - Cache-first: static assets (Next.js chunks, fonts, images)
 *   - Skip: API routes (always fresh), cross-origin (analytics)
 *
 * Cache versioning: STATIC_CACHE_VERSION manuel bump on schema change.
 * Eski cache'ler activate sirasinda temizlenir.
 */

const STATIC_CACHE_VERSION = 'v2'
const STATIC_CACHE = `bilge-arena-static-${STATIC_CACHE_VERSION}`
const RUNTIME_CACHE = `bilge-arena-runtime-${STATIC_CACHE_VERSION}`

const STATIC_ASSETS = [
  '/manifest.json',
  '/favicon.ico',
  '/favicon-16.png',
  '/favicon-32.png',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
  '/offline',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) =>
        // addAll fail-safe: bireysel asset 404 ise diğerleri yine cache'lenir
        Promise.allSettled(STATIC_ASSETS.map((url) => cache.add(url))),
      )
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (k) =>
                k.startsWith('bilge-arena-') &&
                k !== STATIC_CACHE &&
                k !== RUNTIME_CACHE,
            )
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event

  // Sadece GET (POST/PUT/DELETE cache'lenmez)
  if (request.method !== 'GET') return

  const url = new URL(request.url)

  // Cross-origin (analytics, AdSense, fonts) — cache'leme, browser default
  if (url.origin !== self.location.origin) return

  // API ve Next.js data — always fresh, cache yok
  if (url.pathname.startsWith('/api/')) return
  if (url.pathname.startsWith('/_next/data/')) return

  // Owner-only kağıt/PDF ekranları hiçbir zaman runtime/static cache'e girmez.
  // Çevrimdışı artefakt yalnız kullanıcının kaydettiği PDF veya basılı sayfadır.
  if (url.pathname === '/arena/kagit' || url.pathname.startsWith('/arena/kagit/')) {
    event.respondWith(fetch(request).catch(() => caches.match('/offline')))
    return
  }

  // Öğretmen sınıfları üye/ödev verisi içerir; özel sayfaları asla cache'e alma.
  if (url.pathname === '/arena/sinif' || url.pathname.startsWith('/arena/sinif/')) {
    event.respondWith(fetch(request).catch(() => caches.match('/offline')))
    return
  }

  // Network-first: HTML navigation + offline fallback
  const isHTMLRequest =
    request.mode === 'navigate' ||
    request.headers.get('accept')?.includes('text/html')

  if (isHTMLRequest) {
    event.respondWith(
      fetch(request)
        .catch(() => caches.match('/offline')),
    )
    return
  }

  // Cache-first: static assets (Next.js chunks, images, fonts)
  const isStaticAsset =
    url.pathname.startsWith('/_next/static/') ||
    /\.(?:js|css|woff2?|ttf|eot|png|jpg|jpeg|svg|webp|avif|gif|ico)$/i.test(
      url.pathname,
    )

  if (isStaticAsset) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached
        return fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone()
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, clone))
          }
          return response
        })
      }),
    )
  }
})
