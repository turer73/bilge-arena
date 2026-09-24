import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const m = vi.hoisted(() => ({
  createClient: vi.fn(),
  check: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  order: vi.fn(),
}))

vi.mock('@supabase/supabase-js', () => ({ createClient: m.createClient }))
vi.mock('@/lib/utils/rate-limit', () => ({
  createRateLimiter: () => ({ check: m.check }),
}))

import { GET } from '../route'

const request = () => new NextRequest('http://localhost:3141/api/backgrounds')

describe('GET /api/backgrounds', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', '')
    m.check.mockResolvedValue({ success: true })
    m.createClient.mockReturnValue({ from: m.from })
    m.from.mockReturnValue({ select: m.select })
    m.select.mockReturnValue({ eq: m.eq })
    m.eq.mockReturnValue({ order: m.order })
    m.order.mockResolvedValue({ data: [], error: null })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('yerelde yapılandırma yoksa video kataloğunu kullanılamaz olarak bildirir', async () => {
    const response = await GET(request())
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ backgrounds: [], unavailable: true })
    expect(response.headers.get('Cache-Control')).toContain('no-store')
    expect(m.createClient).not.toHaveBeenCalled()
  })

  it('üretimde yapılandırma yoksa boş katalogu başarı gibi sunmaz', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const response = await GET(request())
    expect(response.status).toBe(503)
    expect(m.createClient).not.toHaveBeenCalled()
  })

  it('yalnız yayınlanmış kayıtları genel anahtarla okur', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://public-example.supabase.co')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'public-test-key')
    const rows = [{ id: 'bg-1', slug: 'orman', is_published: true }]
    m.order.mockResolvedValue({ data: rows, error: null })

    const response = await GET(request())

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ backgrounds: rows })
    expect(m.createClient).toHaveBeenCalledWith(
      'https://public-example.supabase.co',
      'public-test-key',
      { auth: { autoRefreshToken: false, persistSession: false } },
    )
    expect(m.from).toHaveBeenCalledWith('background_assets')
    expect(m.eq).toHaveBeenCalledWith('is_published', true)
    expect(m.order).toHaveBeenCalledWith('created_at', { ascending: false })
  })

  it('veritabanı hatasını başarı gibi göstermez', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://public-example.supabase.co')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'public-test-key')
    vi.spyOn(console, 'error').mockImplementation(() => {})
    m.order.mockResolvedValue({ data: null, error: { message: 'network failure' } })

    const response = await GET(request())
    expect(response.status).toBe(500)
  })

  it('publishable key varsa eski anon key yerine onu kullanır', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://public-example.supabase.co')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'publishable-test-key')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'legacy-test-key')

    const response = await GET(request())

    expect(response.status).toBe(200)
    expect(m.createClient).toHaveBeenCalledWith(
      'https://public-example.supabase.co',
      'publishable-test-key',
      { auth: { autoRefreshToken: false, persistSession: false } },
    )
  })
})
