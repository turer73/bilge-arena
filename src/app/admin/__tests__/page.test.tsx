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
    if (url.startsWith('/api/admin/reports')) return Promise.resolve({ ok: true })
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

  it('does not link report-only moderators to an inaccessible governed queue', async () => {
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      if (String(input) === '/api/admin/stats') return Promise.resolve({ ok: true, json: async () => stats })
      if (String(input).startsWith('/api/admin/reports')) return Promise.resolve({ ok: false, status: 409 })
      return Promise.resolve({ ok: true, json: async () => ({ permissions: ['admin.reports.view'] }) })
    })
    render(<AdminDashboard />)
    expect(await screen.findByText('Bu panoda açılabilir iş akışı yok.')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Raporlar/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /3 bekleyen rapor/ })).not.toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Platform özeti' })).queryByText('3')).not.toBeInTheDocument()
  })

  it('shows other authorized areas while the report queue check is pending', async () => {
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      if (String(input) === '/api/admin/stats') return Promise.resolve({ ok: true, json: async () => stats })
      if (String(input).startsWith('/api/admin/reports')) return new Promise(() => {})
      return Promise.resolve({ ok: true, json: async () => ({ permissions: ['admin.reports.view', 'admin.users.view'] }) })
    })
    render(<AdminDashboard />)
    expect(await screen.findByRole('link', { name: /Kullanıcılar/ })).toHaveAttribute('href', '/admin/kullanicilar')
    expect(screen.getByRole('status')).toHaveTextContent('Rapor alanı doğrulanıyor')
    expect(screen.queryByText('Yönetim alanları yükleniyor…')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Raporlar/ })).not.toBeInTheDocument()
  })

  it('links appeal moderators to the governed report queue', async () => {
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      if (String(input) === '/api/admin/stats') return Promise.resolve({ ok: true, json: async () => stats })
      if (String(input).startsWith('/api/admin/reports')) return Promise.resolve({ ok: false, status: 409 })
      return Promise.resolve({ ok: true, json: async () => ({ permissions: ['admin.reports.view', 'content.appeals.manage'] }) })
    })
    render(<AdminDashboard />)
    expect(await screen.findByRole('link', { name: /Raporlar/ })).toHaveAttribute('href', '/admin/raporlar')
    expect(screen.getByRole('link', { name: /Soru Kalitesi/ })).toHaveAttribute('href', '/admin/soru-kalite')
    expect(screen.queryByRole('link', { name: /3 bekleyen rapor/ })).not.toBeInTheDocument()
  })

  it('keeps the report queue available to moderators when governance is disabled', async () => {
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      if (String(input) === '/api/admin/stats') return Promise.resolve({ ok: true, json: async () => stats })
      if (String(input).startsWith('/api/admin/reports')) return Promise.resolve({ ok: true })
      return Promise.resolve({ ok: true, json: async () => ({ permissions: ['admin.reports.view'] }) })
    })
    render(<AdminDashboard />)
    expect(await screen.findByRole('link', { name: /Raporlar/ })).toHaveAttribute('href', '/admin/raporlar')
    expect(screen.getByRole('link', { name: /3 bekleyen rapor/ })).toHaveAttribute('href', '/admin/raporlar')
  })

  it('does not use legacy report counts as a governed-queue alert', async () => {
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      if (String(input) === '/api/admin/stats') return Promise.resolve({ ok: true, json: async () => stats })
      if (String(input).startsWith('/api/admin/reports')) return Promise.resolve({ ok: false, status: 409 })
      return Promise.resolve({ ok: true, json: async () => ({ permissions: ['admin.dashboard.view', 'admin.questions.view', 'admin.reports.view'] }) })
    })
    render(<AdminDashboard />)
    expect(await screen.findByText('Rapor sayısı burada doğrulanamadı')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Soru Kalitesi/ })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /3 bekleyen rapor/ })).not.toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Platform özeti' })).queryByText('3')).not.toBeInTheDocument()
  })

  it('shows authorized areas omitted from the former quick links', async () => {
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      if (String(input) === '/api/admin/stats') return Promise.resolve({ ok: true, json: async () => stats })
      return Promise.resolve({ ok: true, json: async () => ({ permissions: ['admin.homepage.view'] }) })
    })
    render(<AdminDashboard />)
    expect(await screen.findByRole('link', { name: /Anasayfa/ })).toHaveAttribute('href', '/admin/anasayfa-editor')
    expect(screen.queryByText('Bu panoda açılabilir iş akışı yok.')).not.toBeInTheDocument()
  })

  it('hides question management without its data permission and submissions without question view', async () => {
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      if (String(input) === '/api/admin/stats') return Promise.resolve({ ok: true, json: async () => stats })
      return Promise.resolve({ ok: true, json: async () => ({ permissions: ['content.prepare'] }) })
    })
    render(<AdminDashboard />)
    expect(await screen.findByRole('link', { name: /Soru Kalitesi/ })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Soru yönetimi/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Gönderiler/ })).not.toBeInTheDocument()
  })

  it('does not show unauthorized workflow links if permissions are unavailable', async () => {
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      if (String(input) === '/api/admin/stats') return Promise.resolve({ ok: true, json: async () => stats })
      return Promise.reject(new Error('Permissions unavailable'))
    })
    render(<AdminDashboard />)
    await waitFor(() => expect(screen.getByText('Bu panoda açılabilir iş akışı yok.')).toBeInTheDocument())
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })
})
