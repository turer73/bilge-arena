import { describe, it, expect, vi, beforeEach } from 'vitest'
import vm from 'node:vm'
import fs from 'node:fs'
import path from 'node:path'

const swPath = path.resolve(process.cwd(), 'public/sw.js')
const swCode = fs.readFileSync(swPath, 'utf-8')

type Listener = (event: Record<string, unknown>) => void

function createMockEnvironment() {
  const listeners: Record<string, Listener[]> = {}
  const caches = {
    open: vi.fn(),
    match: vi.fn(),
    keys: vi.fn(),
    delete: vi.fn(),
  }
  const cache = {
    add: vi.fn(),
    put: vi.fn(),
  }
  caches.open.mockResolvedValue(cache)
  caches.keys.mockResolvedValue([])
  caches.match.mockResolvedValue(undefined)

  const self = {
    location: { origin: 'https://bilgearena.com' },
    addEventListener: (type: string, fn: Listener) => {
      listeners[type] = listeners[type] || []
      listeners[type].push(fn)
    },
    skipWaiting: vi.fn(),
    clients: { claim: vi.fn() },
  }

  const context = {
    self,
    caches,
    fetch: vi.fn(),
    URL,
    Promise,
    console,
  }

  vm.createContext(context)
  vm.runInContext(swCode, context)

  return {
    listeners,
    caches,
    cache,
    self,
    fetch: context.fetch,
  }
}

describe('Service Worker Navigation Safety', () => {
  let env: ReturnType<typeof createMockEnvironment>

  beforeEach(() => {
    env = createMockEnvironment()
  })

  it('does not cache successful /arena navigation', async () => {
    const request = {
      method: 'GET',
      mode: 'navigate',
      url: 'https://bilgearena.com/arena',
      headers: { get: () => 'text/html' },
    }
    const response = { ok: true, clone: vi.fn() }
    env.fetch.mockResolvedValue(response)

    const fetchHandler = env.listeners['fetch'][0]
    const respondWith = vi.fn()
    fetchHandler({ request, respondWith })

    const resolved = await respondWith.mock.calls[0][0]
    expect(resolved).toBe(response)
    expect(env.fetch).toHaveBeenCalledWith(request)
    expect(env.cache.put).not.toHaveBeenCalled()
  })

  it('falls back to /offline on failed /arena navigation', async () => {
    const request = {
      method: 'GET',
      mode: 'navigate',
      url: 'https://bilgearena.com/arena',
      headers: { get: () => 'text/html' },
    }
    env.fetch.mockRejectedValue(new Error('offline'))
    const offlineResponse = { ok: true }
    env.caches.match.mockResolvedValue(offlineResponse)

    const fetchHandler = env.listeners['fetch'][0]
    const respondWith = vi.fn()
    fetchHandler({ request, respondWith })

    const resolved = await respondWith.mock.calls[0][0]
    expect(resolved).toBe(offlineResponse)
    expect(env.caches.match).toHaveBeenCalledWith('/offline')
    expect(env.caches.match).not.toHaveBeenCalledWith(request)
  })

  it('keeps owner-only paper pages network-only and never caches the private request', async () => {
    const request = {
      method: 'GET',
      mode: 'navigate',
      url: 'https://bilgearena.com/arena/kagit/11111111-2222-4333-8444-555555555555',
      headers: { get: () => 'text/html' },
    }
    const response = { ok: true, clone: vi.fn() }
    env.fetch.mockResolvedValue(response)

    const fetchHandler = env.listeners['fetch'][0]
    const respondWith = vi.fn()
    fetchHandler({ request, respondWith })

    expect(await respondWith.mock.calls[0][0]).toBe(response)
    expect(env.fetch).toHaveBeenCalledWith(request)
    expect(env.caches.match).not.toHaveBeenCalledWith(request)
    expect(env.caches.open).not.toHaveBeenCalled()
    expect(env.cache.put).not.toHaveBeenCalled()
  })

  it('keeps private classroom pages network-only and never caches the private request', async () => {
    const request = {
      method: 'GET',
      mode: 'navigate',
      url: 'https://bilgearena.com/arena/sinif/odev/11111111-2222-4333-8444-555555555555',
      headers: { get: () => 'text/html' },
    }
    const response = { ok: true, clone: vi.fn() }
    env.fetch.mockResolvedValue(response)

    const fetchHandler = env.listeners['fetch'][0]
    const respondWith = vi.fn()
    fetchHandler({ request, respondWith })

    expect(await respondWith.mock.calls[0][0]).toBe(response)
    expect(env.fetch).toHaveBeenCalledWith(request)
    expect(env.caches.match).not.toHaveBeenCalledWith(request)
    expect(env.caches.open).not.toHaveBeenCalled()
    expect(env.cache.put).not.toHaveBeenCalled()
  })

  it('serves a cached static asset without fetching', async () => {
    const request = {
      method: 'GET',
      mode: 'no-cors',
      url: 'https://bilgearena.com/_next/static/chunks/app.js',
      headers: { get: () => 'application/javascript' },
    }
    const cachedResponse = { ok: true }
    env.caches.match.mockResolvedValue(cachedResponse)

    const fetchHandler = env.listeners['fetch'][0]
    const respondWith = vi.fn()
    fetchHandler({ request, respondWith })

    expect(await respondWith.mock.calls[0][0]).toBe(cachedResponse)
    expect(env.fetch).not.toHaveBeenCalled()
    expect(env.cache.put).not.toHaveBeenCalled()
  })

  it('fetches and caches a static asset on cache miss', async () => {
    const request = {
      method: 'GET',
      mode: 'no-cors',
      url: 'https://bilgearena.com/_next/static/chunks/app.js',
      headers: { get: () => 'application/javascript' },
    }
    const response = { ok: true, clone: () => response }
    env.caches.match.mockResolvedValue(undefined)
    env.fetch.mockResolvedValue(response)

    const fetchHandler = env.listeners['fetch'][0]
    const respondWith = vi.fn()
    fetchHandler({ request, respondWith })

    await respondWith.mock.calls[0][0]
    expect(env.fetch).toHaveBeenCalledWith(request)
    expect(env.cache.put).toHaveBeenCalledWith(request, response)
  })

  it('opens v2 cache on install and deletes old v1 caches on activate', async () => {
    let installPromise: Promise<unknown> | undefined
    env.listeners['install'][0]({
      waitUntil: (promise: Promise<unknown>) => {
        installPromise = promise
      },
    })
    if (!installPromise) throw new Error('install waitUntil was not called')
    await installPromise

    expect(env.caches.open).toHaveBeenCalledWith('bilge-arena-static-v2')

    env.caches.keys.mockResolvedValue([
      'bilge-arena-static-v1',
      'bilge-arena-runtime-v1',
      'bilge-arena-static-v2',
      'bilge-arena-runtime-v2',
    ])

    let activatePromise: Promise<unknown> | undefined
    env.listeners['activate'][0]({
      waitUntil: (promise: Promise<unknown>) => {
        activatePromise = promise
      },
    })
    if (!activatePromise) throw new Error('activate waitUntil was not called')
    await activatePromise

    expect(env.caches.delete).toHaveBeenCalledWith('bilge-arena-static-v1')
    expect(env.caches.delete).toHaveBeenCalledWith('bilge-arena-runtime-v1')
    expect(env.caches.delete).not.toHaveBeenCalledWith('bilge-arena-static-v2')
    expect(env.caches.delete).not.toHaveBeenCalledWith('bilge-arena-runtime-v2')
  })

  it.each([
    ['API guard', 'GET', 'https://bilgearena.com/api/users', 'navigate', 'text/html'],
    ['teacher API guard', 'GET', 'https://bilgearena.com/api/teacher/classrooms', 'navigate', 'application/json'],
    ['origin guard', 'GET', 'https://external.example/_next/static/chunks/app.js', 'no-cors', 'application/javascript'],
    ['method guard', 'POST', 'https://bilgearena.com/arena', 'navigate', 'text/html'],
  ])('bypasses service worker for %s', async (_name, method, url, mode, accept) => {
    const request = {
      method,
      mode,
      url,
      headers: { get: () => accept },
    }
    const fetchHandler = env.listeners['fetch'][0]
    const respondWith = vi.fn()

    fetchHandler({ request, respondWith })

    expect(respondWith).not.toHaveBeenCalled()
    expect(env.fetch).not.toHaveBeenCalled()
    expect(env.caches.match).not.toHaveBeenCalled()
    expect(env.caches.open).not.toHaveBeenCalled()
  })
})
