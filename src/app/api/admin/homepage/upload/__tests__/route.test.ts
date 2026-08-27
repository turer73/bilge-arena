import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  checkPermission: vi.fn(),
  rateLimit: vi.fn(),
  upload: vi.fn(),
  getPublicUrl: vi.fn(),
  storageFrom: vi.fn(),
  createServiceRoleClient: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ source: 'caller-session' }),
}))

vi.mock('@/lib/supabase/admin', () => ({
  checkPermission: mocks.checkPermission,
}))

vi.mock('@/lib/utils/admin-rate-limit', () => ({
  checkAdminMutationRl: mocks.rateLimit,
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: mocks.createServiceRoleClient,
}))

import { POST } from '../route'

function pngRequest() {
  const form = new FormData()
  form.append(
    'file',
    new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], {
      type: 'image/png',
    }),
    'logo.png',
  )
  return { formData: async () => form } as unknown as NextRequest
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.checkPermission.mockResolvedValue({ id: 'admin-1' })
  mocks.rateLimit.mockResolvedValue(null)
  mocks.upload.mockResolvedValue({ error: null })
  mocks.getPublicUrl.mockReturnValue({ data: { publicUrl: 'https://cdn.example/logo.png' } })
  mocks.storageFrom.mockReturnValue({
    upload: mocks.upload,
    getPublicUrl: mocks.getPublicUrl,
  })
  mocks.createServiceRoleClient.mockReturnValue({
    storage: { from: mocks.storageFrom },
  })
})

describe('POST /api/admin/homepage/upload', () => {
  it('rejects callers without the homepage edit permission', async () => {
    mocks.checkPermission.mockResolvedValue(null)

    const response = await POST(pngRequest())

    expect(response.status).toBe(403)
    expect(mocks.createServiceRoleClient).not.toHaveBeenCalled()
  })

  it('binds authorization to the caller and uploads through service role', async () => {
    const response = await POST(pngRequest())

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ url: 'https://cdn.example/logo.png' })
    expect(mocks.checkPermission).toHaveBeenCalledWith(
      { source: 'caller-session' },
      'admin.homepage.edit',
    )
    expect(mocks.createServiceRoleClient).toHaveBeenCalledOnce()
    expect(mocks.storageFrom).toHaveBeenCalledWith('homepage-assets')
    expect(mocks.upload).toHaveBeenCalledWith(
      expect.stringMatching(/^logos\/\d+-logo\.png\.png$/),
      expect.any(ArrayBuffer),
      { contentType: 'image/png', upsert: false },
    )
  })
})
