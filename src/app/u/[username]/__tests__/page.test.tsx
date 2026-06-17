import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'

const { mockRpc, mockNotFound } = vi.hoisted(() => ({
  mockRpc: vi.fn(),
  mockNotFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: () => ({ rpc: mockRpc }),
}))
vi.mock('next/navigation', () => ({ notFound: mockNotFound }))

import PublicProfilePage from '../page'

const SAFE_PROFILE = {
  id: 'x',
  username: 'ali',
  avatar_url: null,
  level: 2,
  level_name: 'Cirak',
  total_xp: 1500,
  current_streak: 3,
  longest_streak: 5,
  total_questions: 100,
  correct_answers: 80,
  selected_nameplate: null,
  selected_avatar_decorations: null,
  created_at: '2026-01-01T00:00:00Z',
}

describe('PublicProfilePage /u/[username]', () => {
  beforeEach(() => vi.clearAllMocks())

  it('discoverable kullanici icin profili render eder (username + dogruluk)', async () => {
    mockRpc.mockResolvedValue({ data: [SAFE_PROFILE] })
    const jsx = await PublicProfilePage({ params: Promise.resolve({ username: 'ali' }) })
    const { container } = render(jsx)
    expect(container.textContent).toContain('ali')
    expect(container.textContent).toContain('%80') // 80/100
    expect(container.textContent).toContain('1.500') // tr-TR XP
    // PII sizmamali (display_name RPC'de yok zaten)
    expect(container.textContent).not.toContain('@')
  })

  it('profil yok / discoverable degil -> notFound', async () => {
    mockRpc.mockResolvedValue({ data: [] })
    await expect(
      PublicProfilePage({ params: Promise.resolve({ username: 'gizli' }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND')
    expect(mockNotFound).toHaveBeenCalled()
  })
})
