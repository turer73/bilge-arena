import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import AdminDashboard from '../page'

const fetchMock = vi.fn()
global.fetch = fetchMock as unknown as typeof fetch

const stats = {
  totalUsers: 1250,
  totalQuestions: 850,
  totalSessions: 300,
  totalAnswers: 4200,
  pendingReports: 3,
}

beforeEach(() => {
  fetchMock.mockReset()
  fetchMock.mockImplementation((input: RequestInfo | URL) => {
    const url = String(input)
    if (url === '/api/admin/stats') return Promise.resolve({ ok: true, json: async () => stats })
    if (url === '/api/admin/me/permissions') return Promise.resolve({
      ok: true,
      json: async () => ({ permissions: ['admin.dashboard.view', 'admin.questions.view', 'admin.reports.view'] }),
    })
    return Promise.reject(new Error('Unexpected URL'))
  })
})

describe('AdminDashboard', () => {
  it('shows real counts once and groups authorized workflow cards', async () => {
    render(<AdminDashboard />)
    const overview = screen.getByRole('region', { name: 'Platform özeti' })
    expect(await within(overview).findByText('1.250')).toBeInTheDocument()
    expect(within(overview).getByText('4.200')).toBeInTheDocument()
    expect(within(overview).getByText('3')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Soru yönetimi/ })).toHaveAttribute('href', '/admin/sorular')
    expect(screen.getByRole('link', { name: /Soru Kalitesi/ })).toHaveAttribute('href', '/admin/soru-kalite')
    expect(screen.getByRole('link', { name: /Raporlar/ })).toHaveAttribute('href', '/admin/raporlar')
    expect(screen.getByRole('link', { name: /3 bekleyen rapor/ })).toHaveAttribute('href', '/admin/raporlar')
    expect(screen.queryByRole('link', { name: /Kurumlar/ })).not.toBeInTheDocument()
  })

  it('does not present fake zeros when the count request fails', async () => {
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      if (String(input) === '/api/admin/stats') return Promise.resolve({ ok: false })
      return Promise.resolve({ ok: true, json: async () => ({ permissions: [] }) })
    })
    render(<AdminDashboard />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Sayılar şu anda alınamıyor')
    const overview = screen.getByRole('region', { name: 'Platform özeti' })
    expect(within(overview).getAllByText('—')).toHaveLength(5)
    expect(screen.queryByRole('link', { name: /bekleyen rapor/ })).not.toBeInTheDocument()
  })

  it('does not show unauthorized workflow links if permissions are unavailable', async () => {
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      if (String(input) === '/api/admin/stats') return Promise.resolve({ ok: true, json: async () => stats })
      return Promise.reject(new Error('Permissions unavailable'))
    })
    render(<AdminDashboard />)
    await waitFor(() => expect(screen.getByText('Erişilebilir yönetim alanı bulunamadı.')).toBeInTheDocument())
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })
})
