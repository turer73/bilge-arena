import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }))

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: () => ({ user: { id: 'me' } }),
}))
vi.mock('@/stores/toast-store', () => ({ toast }))

import FriendsClient from '../friends-client'

const emptyFriends = {
  friends: [],
  pendingReceived: [],
  pendingSent: [],
  blocked: [],
}

describe('FriendsClient', () => {
  beforeEach(() => {
    toast.success.mockReset()
    toast.error.mockReset()
    toast.info.mockReset()
    vi.stubGlobal('fetch', vi.fn())
  })

  it('ilk yukleme hatasinda sonsuz spinner yerine yeniden deneme gosterir', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Arkadaş servisi kullanılamıyor' }),
    } as Response)

    render(<FriendsClient />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Arkadaş servisi kullanılamıyor')
    expect(screen.getByRole('button', { name: 'Tekrar dene' })).toBeInTheDocument()
  })

  it('arama sonucundan istegi cift tiklamada bir kez gonderir', async () => {
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input)
      if (url.startsWith('/api/users/search')) {
        return {
          ok: true,
          json: async () => ({ users: [{ id: 'friend-1', username: 'dost', avatar_url: null, total_xp: 0 }] }),
        } as Response
      }
      if (url === '/api/friends' && init?.method === 'POST') {
        return { ok: true, json: async () => ({ status: 'sent' }) } as Response
      }
      return { ok: true, json: async () => emptyFriends } as Response
    })

    render(<FriendsClient />)
    await screen.findByText('Henüz arkadaşın yok. Yukarıdaki arama ile kullanıcı bul!')

    fireEvent.change(screen.getByPlaceholderText('Kullanıcı ara...'), { target: { value: 'dost' } })
    const addButton = await screen.findByRole('button', { name: 'Ekle' }, { timeout: 1500 })
    fireEvent.click(addButton)
    fireEvent.click(addButton)

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Arkadaş isteği gönderildi!'))
    const postCalls = vi.mocked(fetch).mock.calls.filter(([, init]) => init?.method === 'POST')
    expect(postCalls).toHaveLength(1)
  })

  it('yalniz goruntulenebilir arama sonucunu profil baglantisi yapar', async () => {
    vi.mocked(fetch).mockImplementation(async (input) => {
      if (String(input).startsWith('/api/users/search')) {
        return {
          ok: true,
          json: async () => ({ users: [
            { id: 'private-1', username: 'kapali', avatar_url: null, total_xp: 0, profile_viewable: false },
            { id: 'public-1', username: 'acik', avatar_url: null, total_xp: 10, profile_viewable: true },
          ] }),
        } as Response
      }
      return { ok: true, json: async () => emptyFriends } as Response
    })

    render(<FriendsClient />)
    await screen.findByText('Henüz arkadaşın yok. Yukarıdaki arama ile kullanıcı bul!')
    fireEvent.change(screen.getByPlaceholderText('Kullanıcı ara...'), { target: { value: 'kullanici' } })

    expect(await screen.findByText('kapali', {}, { timeout: 1500 })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'kapali' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'acik' })).toHaveAttribute('href', '/u/acik')
  })
})
