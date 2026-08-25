/**
 * Bilge Arena: NotificationBell — okunmamış rozeti + panel + okundu akışı.
 */

import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const pushMock = vi.hoisted(() => vi.fn())
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock }) }))

import { NotificationBell } from '../notification-bell'

const fetchMock = vi.fn()
global.fetch = fetchMock as unknown as typeof fetch

const NOTIFS = [
  { id: 'n1', type: 'submission_approved', title: 'Sorun onaylandı! 🎉', body: '+50 🪙', link: '/arena/soru-gonder', is_read: false, created_at: 't' },
  { id: 'n2', type: 'submission_rejected', title: 'Değerlendirildi', body: null, link: '/arena/soru-gonder', is_read: true, created_at: 't' },
]

function listResponse(notifs = NOTIFS) {
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ notifications: notifs, unread: notifs.filter((n) => !n.is_read).length }),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  fetchMock.mockImplementation((url: string, init?: RequestInit) => {
    if (init?.method === 'POST') return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true }) })
    return listResponse()
  })
})

describe('NotificationBell', () => {
  test('mount: okunmamış rozeti (1) gösterilir', async () => {
    render(<NotificationBell />)
    await waitFor(() => expect(screen.getByText('1')).toBeInTheDocument())
  })

  test('panel açılınca bildirimler listelenir', async () => {
    render(<NotificationBell />)
    await waitFor(() => expect(screen.getByText('1')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /Bildirimler/ }))
    expect(await screen.findByText('Sorun onaylandı! 🎉')).toBeInTheDocument()
    expect(screen.getByText('+50 🪙')).toBeInTheDocument()
  })

  test('bildirime tıkla: okundu POST + link\'e yönlendir', async () => {
    render(<NotificationBell />)
    await waitFor(() => expect(screen.getByText('1')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /Bildirimler/ }))
    fireEvent.click(await screen.findByText('Sorun onaylandı! 🎉'))

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/arena/soru-gonder'))
    const readCall = fetchMock.mock.calls.find((c) => c[1]?.method === 'POST')!
    expect(JSON.parse(readCall[1].body)).toEqual({ id: 'n1' })
  })

  test('hassas bildirim hedefini RSC fetch baslamadan yeni document ile acar', async () => {
    const navigateDocument = vi.fn()
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return Promise.resolve({ ok: true })
      return listResponse([{
        ...NOTIFS[0],
        link: '/arena/sinif/odev/11111111-2222-4333-8444-555555555555',
      }])
    })
    render(<NotificationBell navigateDocument={navigateDocument} />)
    await waitFor(() => expect(screen.getByText('1')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /Bildirimler/ }))
    fireEvent.click(await screen.findByText('Sorun onaylandı! 🎉'))

    await waitFor(() => expect(navigateDocument).toHaveBeenCalledWith(
      '/arena/sinif/odev/11111111-2222-4333-8444-555555555555',
    ))
    expect(pushMock).not.toHaveBeenCalled()
  })

  test('tümünü okundu: POST {all:true} + rozet kaybolur', async () => {
    render(<NotificationBell />)
    await waitFor(() => expect(screen.getByText('1')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /Bildirimler/ }))
    fireEvent.click(await screen.findByText('Tümünü okundu işaretle'))

    await waitFor(() => expect(screen.queryByText('1')).not.toBeInTheDocument())
    const readCall = fetchMock.mock.calls.find((c) => c[1]?.method === 'POST')!
    expect(JSON.parse(readCall[1].body)).toEqual({ all: true })
  })

  test('bildirim yoksa boş mesaj, rozet yok', async () => {
    fetchMock.mockImplementation(() => listResponse([]))
    render(<NotificationBell />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: /Bildirimler/ }))
    expect(await screen.findByText(/Henüz bildirimin yok/)).toBeInTheDocument()
  })
})
