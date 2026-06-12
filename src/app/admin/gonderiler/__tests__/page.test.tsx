/**
 * Bilge Arena: /admin/gonderiler — UGC moderasyon kuyruğu sayfası.
 * Liste render, onay (listeden düşer), red (prompt + listeden düşer),
 * boş kuyruk, hata durumu.
 */

import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

import SubmissionsPage from '../page'

const SUB = {
  id: 'sub-1',
  game: 'matematik',
  category: 'problemler',
  difficulty: 3,
  content: { question: 'Faiz sorusu?', options: ['a', 'b', 'c', 'd'], answer: 1, solution: 'Çünkü.' },
  status: 'pending',
  created_at: '2026-06-12T10:00:00Z',
  profiles: { username: 'ali', display_name: 'Ali' },
}

const fetchMock = vi.fn()
global.fetch = fetchMock as unknown as typeof fetch

beforeEach(() => {
  vi.clearAllMocks()
  fetchMock.mockImplementation((url: string, init?: RequestInit) => {
    if (init?.method === 'PATCH') {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ status: 'approved' }) })
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ submissions: [SUB] }) })
  })
})

describe('SubmissionsPage', () => {
  test('kuyruk render: soru + doğru şık işareti + gönderen', async () => {
    render(<SubmissionsPage />)
    await waitFor(() => expect(screen.getByText('Faiz sorusu?')).toBeInTheDocument())
    expect(screen.getByText(/b\) b ✓/i)).toBeInTheDocument()
    expect(screen.getByText(/Ali/)).toBeInTheDocument()
    expect(screen.getByText(/📌 Çünkü\./)).toBeInTheDocument()
  })

  test('onayla: PATCH approve + kart listeden düşer', async () => {
    render(<SubmissionsPage />)
    await waitFor(() => expect(screen.getByText('Faiz sorusu?')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /Onayla/ }))

    await waitFor(() => expect(screen.queryByText('Faiz sorusu?')).not.toBeInTheDocument())
    const patchCall = fetchMock.mock.calls.find((c) => c[1]?.method === 'PATCH')!
    expect(patchCall[0]).toBe('/api/admin/submissions/sub-1')
    expect(JSON.parse(patchCall[1].body)).toMatchObject({ action: 'approve' })
  })

  test('reddet: gerekçe prompt edilir ve PATCH body\'ye girer', async () => {
    vi.spyOn(window, 'prompt').mockReturnValue('Telifli')
    render(<SubmissionsPage />)
    await waitFor(() => expect(screen.getByText('Faiz sorusu?')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Reddet' }))

    await waitFor(() => expect(screen.queryByText('Faiz sorusu?')).not.toBeInTheDocument())
    const patchCall = fetchMock.mock.calls.find((c) => c[1]?.method === 'PATCH')!
    expect(JSON.parse(patchCall[1].body)).toMatchObject({ action: 'reject', note: 'Telifli' })
  })

  test('boş kuyruk mesajı', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve({ submissions: [] }) })
    render(<SubmissionsPage />)
    await waitFor(() => expect(screen.getByText(/Bekleyen gönderim yok/)).toBeInTheDocument())
  })

  test('PATCH hatası: kart kalır + hata mesajı', async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === 'PATCH') {
        return Promise.resolve({ ok: false, json: () => Promise.resolve({ error: 'Gönderim bulunamadı veya zaten değerlendirilmiş' }) })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ submissions: [SUB] }) })
    })
    render(<SubmissionsPage />)
    await waitFor(() => expect(screen.getByText('Faiz sorusu?')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /Onayla/ }))

    await waitFor(() =>
      expect(screen.getByText(/zaten değerlendirilmiş/)).toBeInTheDocument(),
    )
    expect(screen.getByText('Faiz sorusu?')).toBeInTheDocument()
  })
})
