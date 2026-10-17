import { describe, it, expect, vi, beforeEach } from 'vitest'
import vm from 'node:vm'
import fs from 'node:fs'
import path from 'node:path'

// Derin inceleme 2026-10-15 aksiyon 11: sw.js'te push ve notificationclick
// dinleyicisi yoktu; hatırlatma cron'unun gönderdiği push görünmüyordu.
const swCode = fs.readFileSync(path.resolve(process.cwd(), 'public/sw.js'), 'utf-8')

type Listener = (event: Record<string, unknown>) => void

function createEnvironment(windows: Array<{ url: string; focus: ReturnType<typeof vi.fn> }> = []) {
  const listeners: Record<string, Listener[]> = {}
  const showNotification = vi.fn(async () => undefined)
  const openWindow = vi.fn(async () => null)
  const matchAll = vi.fn(async () => windows)
  const self = {
    location: { origin: 'https://bilgearena.com' },
    addEventListener: (type: string, fn: Listener) => {
      listeners[type] = listeners[type] || []
      listeners[type].push(fn)
    },
    skipWaiting: vi.fn(),
    registration: { showNotification },
    clients: { claim: vi.fn(), matchAll, openWindow },
  }
  const context = { self, caches: {}, fetch: vi.fn(), URL, Promise, console }
  vm.createContext(context)
  vm.runInContext(swCode, context)
  return { listeners, showNotification, openWindow, matchAll }
}

async function dispatch(listener: Listener, event: Record<string, unknown>) {
  let pending: Promise<unknown> | undefined
  listener({ ...event, waitUntil: (promise: Promise<unknown>) => { pending = promise } })
  expect(pending).toBeDefined()
  await pending
}

const pushEvent = (data: unknown) => ({
  data: data === undefined ? null : {
    json: () => {
      if (typeof data === 'string') return JSON.parse(data)
      return data
    },
  },
})

describe('service worker push notifications', () => {
  let env: ReturnType<typeof createEnvironment>

  beforeEach(() => {
    env = createEnvironment()
  })

  it('shows the reminder the server sends', async () => {
    await dispatch(env.listeners.push[0], pushEvent({
      title: 'Bilge Arena',
      body: '3 gunluk serini kaybetme! Bugun de bir oyun oyna.',
      icon: '/icon-192.png',
      data: { url: '/arena' },
    }))
    expect(env.showNotification).toHaveBeenCalledWith('Bilge Arena', expect.objectContaining({
      body: '3 gunluk serini kaybetme! Bugun de bir oyun oyna.',
      icon: '/icon-192.png',
      tag: 'bilge-arena-reminder',
      data: { url: '/arena' },
    }))
  })

  it.each([
    ['no payload', undefined],
    ['invalid JSON', '{not json'],
    ['a non-object payload', 42],
    ['empty strings', { title: '  ', body: '' }],
  ])('still shows a visible default notification for %s', async (_label, data) => {
    await dispatch(env.listeners.push[0], pushEvent(data))
    expect(env.showNotification).toHaveBeenCalledWith('Bilge Arena', expect.objectContaining({
      body: 'Bugünkü çalışman seni bekliyor.',
      data: { url: '/arena' },
    }))
  })

  it.each([
    'https://evil.example/phish',
    '//evil.example/phish',
    'javascript:alert(1)',
    'arena',
  ])('never carries a foreign or non-path target (%s)', async (url) => {
    await dispatch(env.listeners.push[0], pushEvent({ title: 'x', body: 'y', icon: url, data: { url } }))
    expect(env.showNotification).toHaveBeenCalledWith('x', expect.objectContaining({
      icon: '/icon-192.png',
      data: { url: '/arena' },
    }))
  })

  it('bounds the title and body length', async () => {
    await dispatch(env.listeners.push[0], pushEvent({ title: 'a'.repeat(200), body: 'b'.repeat(500) }))
    const [title, options] = env.showNotification.mock.calls[0] as unknown as [string, { body: string }]
    expect(title).toHaveLength(80)
    expect(options.body).toHaveLength(240)
  })
})

describe('service worker notification click', () => {
  const click = (url: unknown) => {
    const close = vi.fn()
    return { close, event: { notification: { close, data: { url } } } }
  }

  it('opens the notification target in a new window when none is open', async () => {
    const env = createEnvironment()
    const { close, event } = click('/arena/calisma')
    await dispatch(env.listeners.notificationclick[0], event)
    expect(close).toHaveBeenCalled()
    expect(env.openWindow).toHaveBeenCalledWith('/arena/calisma')
  })

  it('focuses an already open tab on the same page instead of opening another', async () => {
    const focus = vi.fn(async () => undefined)
    const env = createEnvironment([
      { url: 'https://bilgearena.com/', focus: vi.fn() },
      { url: 'https://bilgearena.com/arena', focus },
    ])
    await dispatch(env.listeners.notificationclick[0], click('/arena').event)
    expect(focus).toHaveBeenCalled()
    expect(env.openWindow).not.toHaveBeenCalled()
  })

  it('falls back to /arena for a foreign target', async () => {
    const env = createEnvironment()
    await dispatch(env.listeners.notificationclick[0], click('https://evil.example/').event)
    expect(env.openWindow).toHaveBeenCalledWith('/arena')
  })
})
