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

const STATIC_CACHE_VERSION = 'v3'
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

// ── Push bildirimleri ─────────────────────────────────────────────────────
// Sunucu (src/lib/utils/push.ts) { title, body, icon, data: { url } } gönderir.
// userVisibleOnly aboneliğinde her push görünür bir bildirim göstermek
// zorundadır; göstermezsek tarayıcı genel bir bildirim gösterip izni geri
// alabilir. Bu yüzden bozuk ya da boş yükte de varsayılan bildirim gösterilir.
const DEFAULT_NOTIFICATION_URL = '/arena'
const DEFAULT_NOTIFICATION = {
  title: 'Bilge Arena',
  body: 'Bugünkü çalışman seni bekliyor.',
  icon: '/icon-192.png',
}

// Yalnız aynı origin içindeki yollar açılır; dış adres, protokol-göreli
// adres ya da javascript: hiçbir koşulda açılmaz.
function sameOriginPath(value, fallback) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return fallback
  try {
    const url = new URL(value, self.location.origin)
    if (url.origin !== self.location.origin) return fallback
    return url.pathname + url.search + url.hash
  } catch {
    return fallback
  }
}

function boundedText(value, maxLength, fallback) {
  if (typeof value !== 'string') return fallback
  const text = value.trim()
  return text ? text.slice(0, maxLength) : fallback
}

function readPushPayload(event) {
  let data = null
  try {
    data = event.data ? event.data.json() : null
  } catch {
    data = null
  }
  if (!data || typeof data !== 'object') data = {}
  return {
    title: boundedText(data.title, 80, DEFAULT_NOTIFICATION.title),
    body: boundedText(data.body, 240, DEFAULT_NOTIFICATION.body),
    icon: sameOriginPath(data.icon, DEFAULT_NOTIFICATION.icon),
    url: sameOriginPath(data.data && data.data.url, DEFAULT_NOTIFICATION_URL),
  }
}

self.addEventListener('push', (event) => {
  const payload = readPushPayload(event)
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: payload.icon,
      badge: '/favicon-32.png',
      // Aynı türden hatırlatmalar üst üste birikmesin, yenisi eskisinin yerini alsın.
      tag: 'bilge-arena-reminder',
      data: { url: payload.url },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = sameOriginPath(
    event.notification.data && event.notification.data.url,
    DEFAULT_NOTIFICATION_URL,
  )
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((windows) => {
        // Hedef zaten açıksa o sekmeye geç; değilse yeni sekme aç.
        const existing = windows.find((client) => {
          try {
            const url = new URL(client.url)
            return url.origin === self.location.origin && url.pathname + url.search + url.hash === target
          } catch {
            return false
          }
        })
        if (existing && typeof existing.focus === 'function') return existing.focus()
        return self.clients.openWindow(target)
      }),
  )
})
