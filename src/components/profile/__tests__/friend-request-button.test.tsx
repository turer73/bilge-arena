import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FriendRequestButton } from '../friend-request-button'

describe('FriendRequestButton', () => {
  beforeEach(() => vi.stubGlobal('fetch', vi.fn()))

  it('istegi bir kez gonderir ve basari durumunu kilitler', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ status: 'sent' }) } as Response)
    render(<FriendRequestButton targetId="10000000-0000-4000-8000-000000000001" />)

    fireEvent.click(screen.getByRole('button', { name: 'Arkadaş ekle' }))

    await waitFor(() => expect(screen.getByRole('button', { name: 'İstek gönderildi' })).toBeDisabled())
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledWith('/api/friends', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ friendId: '10000000-0000-4000-8000-000000000001' }),
    }))
  })

  it('sunucu hatasini kullaniciya gosterir ve yeniden denemeye izin verir', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, json: async () => ({ error: 'Zaten bekleyen bir istek var' }) } as Response)
    render(<FriendRequestButton targetId="10000000-0000-4000-8000-000000000001" />)

    fireEvent.click(screen.getByRole('button', { name: 'Arkadaş ekle' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Zaten bekleyen bir istek var')
    expect(screen.getByRole('button', { name: 'Arkadaş ekle' })).toBeEnabled()
  })
})
