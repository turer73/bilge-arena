import { describe, expect, it, vi } from 'vitest'
import { SENTRY_PRIVACY_OPTIONS } from '../sentry-options'

const { initMock } = vi.hoisted(() => ({ initMock: vi.fn() }))

vi.mock('@sentry/nextjs', () => ({ init: initMock }))

type InitOptions = {
  dataCollection?: unknown
  traceLifecycle?: string
  beforeSendTransaction?: (event: { request?: { url?: string } }) => unknown
}

const CONFIGS = {
  client: () => import('../../../../sentry.client.config'),
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
