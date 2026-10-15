import { afterEach, describe, expect, it, vi } from 'vitest'
import { SENTRY_PRIVACY_OPTIONS } from '../sentry-options'

const { initMock, sendMock } = vi.hoisted(() => ({ initMock: vi.fn(), sendMock: vi.fn(async () => ({})) }))

vi.mock('@sentry/nextjs', () => ({
  init: initMock, captureRouterTransitionStart: vi.fn(),
  browserTracingIntegration: (options: object) => ({ name: 'BrowserTracing', ...options }),
  makeFetchTransport: () => ({ send: sendMock, flush: vi.fn(async () => true) }),
}))

type InitOptions = {
  transport?: (options: object) => { send: (envelope: unknown) => Promise<unknown> }
  replaysSessionSampleRate?: number
  replaysOnErrorSampleRate?: number
  beforeSend?: (event: { request?: { url?: string; headers?: Record<string, string> } }) => unknown
  integrations?: (defaults: { name: string }[]) => { name: string; shouldCreateSpanForRequest?: (url: string) => boolean }[]
  beforeBreadcrumb?: (breadcrumb: { data?: Record<string, string> }) => unknown
  dataCollection?: unknown
  traceLifecycle?: string
  beforeSendTransaction?: (event: { request?: { url?: string }; spans?: { description?: string; data?: Record<string, unknown> }[] }) => unknown
}

const CONFIGS = {
  client: () => import('../../../instrumentation-client'),
  server: () => import('../../../../sentry.server.config'),
  edge: () => import('../../../../sentry.edge.config'),
} as const

async function loadInitOptions(name: keyof typeof CONFIGS): Promise<InitOptions> {
  vi.resetModules()
  initMock.mockClear()
  await CONFIGS[name]()
  expect(initMock).toHaveBeenCalledTimes(1)
  return initMock.mock.calls[0][0] as InitOptions
}

describe('Sentry gizlilik tabani', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('hassas belge uzerinde client report dahil tum zarflari transportta durdurur', async () => {
    const options = await loadInitOptions('client')
    const transport = options.transport!({})
    vi.stubGlobal('window', { location: { pathname: '/arena' } })
    const envelope = [{}, [[{ type: 'client_report' }, {}]]]
    await transport.send(envelope)
    expect(sendMock).toHaveBeenCalledOnce()
    vi.stubGlobal('window', { location: { pathname: '/admin' } })
    await transport.send(envelope)
    expect(sendMock).toHaveBeenCalledOnce()
  })

  it('session zarflarini ve hassas API spanlarini engeller', async () => {
    const options = await loadInitOptions('client')
    const integrations = options.integrations!([{ name: 'BrowserSession' }, { name: 'BrowserTracing' }, { name: 'GlobalHandlers' }])
    expect(integrations.map(i => i.name)).toEqual(['GlobalHandlers', 'BrowserTracing'])
    const allow = integrations.find(i => i.name === 'BrowserTracing')!.shouldCreateSpanForRequest!
    vi.stubGlobal('window', { location: { pathname: '/arena' } })
    expect(allow('/api/institution/workspace')).toBe(false)
    expect(allow('/api/public')).toBe(true)
    for (const span of [
      { description: 'GET /api/institution/workspace' },
      { data: { 'url.full': 'https://bilgearena.com/api/teacher/classes' } },
      { data: { 'http.url': '/api/admin/questions' } },
    ]) expect(options.beforeSendTransaction!({ request: { url: '/arena' }, spans: [span] })).toBeNull()
    expect(options.beforeBreadcrumb!({ data: { url: '/api/institution/workspace' } })).toBeNull()
    expect(options.beforeBreadcrumb!({ data: { from: '/admin', to: '/arena' } })).toBeNull()
    vi.stubGlobal('window', { location: { pathname: '/arena/sinif' } })
    expect(allow('/api/public')).toBe(false)
    expect(options.beforeBreadcrumb!({})).toBeNull()
  })

  it('client girisi replayi kapali tutar ve router hookunu aktarir', async () => {
    const options = await loadInitOptions('client')
    expect(options.replaysSessionSampleRate).toBe(0)
    expect(options.replaysOnErrorSampleRate).toBe(0)
    const entry = await CONFIGS.client()
    const sdk = await import('@sentry/nextjs')
    expect(entry.onRouterTransitionStart).toBe(sdk.captureRouterTransitionStart)
  })

  it('client hassas sayfalarda hata ve transaction gondermez', async () => {
    const options = await loadInitOptions('client')
    const event = { request: { url: 'https://bilgearena.com/arena' } }
    vi.stubGlobal('window', { location: { pathname: '/admin/kurumlar' } })
    expect(options.beforeSend?.(event)).toBeNull()
    expect(options.beforeSendTransaction?.(event)).toBeNull()
    vi.stubGlobal('window', { location: { pathname: '/arena' } })
    const privateEvent = { request: { url: 'https://bilgearena.com/api/teacher/classes' } }
    expect(options.beforeSend?.(privateEvent)).toBeNull()
    expect(options.beforeSendTransaction?.(privateEvent)).toBeNull()
    expect(options.beforeSend?.(event)).toBe(event)
    expect(options.beforeSendTransaction?.(event)).toBe(event)
    expect(options.beforeSend?.({ request: { headers: { 'User-Agent': 'HeadlessChrome' } } })).toBeNull()
  })
  it('v10 sendDefaultPii kapali davranisini acikca tanimlar', () => {
    const dc = SENTRY_PRIVACY_OPTIONS.dataCollection
    expect(dc.userInfo).toBe(false)
    expect(dc.cookies).toBe(false)
    expect(dc.httpBodies).toEqual([])
    expect(dc.databaseQueryData).toBe(false)
    expect(dc.queues).toBe(false)
    expect(dc.genAI).toEqual({ inputs: false, outputs: false })
    expect(dc.graphQL).toEqual({ document: false, variables: false })
    expect(dc.httpHeaders.request.deny).toContain('-ip')
    expect(dc.urlQueryParams.deny).toContain('-user')
  })

  it('beforeSendTransaction calissin diye static trace lifecycle kullanir', () => {
    expect(SENTRY_PRIVACY_OPTIONS.traceLifecycle).toBe('static')
  })

  it.each(Object.keys(CONFIGS) as (keyof typeof CONFIGS)[])(
    '%s config gizlilik tabanini Sentry.init\'e gecirir',
    async (name) => {
      const options = await loadInitOptions(name)
      expect(options.dataCollection).toEqual(SENTRY_PRIVACY_OPTIONS.dataCollection)
      expect(options.traceLifecycle).toBe('static')
      expect(options.beforeSendTransaction).toEqual(expect.any(Function))
    },
  )

  it.each(['server', 'edge'] as const)(
    '%s config hassas rota transaction\'ini dusurur',
    async (name) => {
      const { beforeSendTransaction } = await loadInitOptions(name)
      const sensitive = { request: { url: 'https://bilgearena.com/api/admin/institutions' } }
      const ordinary = { request: { url: 'https://bilgearena.com/arena' } }
      expect(beforeSendTransaction?.(sensitive)).toBeNull()
      expect(beforeSendTransaction?.(ordinary)).toBe(ordinary)
    },
  )
})
