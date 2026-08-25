import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AdminInstitutionsPage from '../page'

const manager = {
  id: '22222222-2222-4222-8222-222222222222',
  username: 'kurum-yoneticisi',
  display_name: 'Kurum Yöneticisi',
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('admin institution free-pilot page', () => {
  it('creates only through the bounded invitation-free endpoint', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.startsWith('/api/admin/users?')) {
        return Response.json({ users: [manager] })
      }
      if (url === '/api/admin/institutions/free-pilots' && init?.method === 'POST') {
        return Response.json({ ok: true }, { status: 201 })
      }
      if (url === '/api/admin/institutions') {
        return Response.json({
          institutions: [],
          provisioning: { invitationFreePilotEnabled: true },
        })
      }
      throw new Error(`Unexpected request: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(
      '44444444-4444-4444-8444-444444444444',
    )

    render(<AdminInstitutionsPage />)
    expect(await screen.findByText('Henüz kurum oluşturulmadı.')).toBeInTheDocument()
    expect(screen.getByText(/genel kurum kaydı veya ücretli onboarding değildir/i)).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText(/Kurum adı/i), {
      target: { value: 'Bilge Küçük Dershane' },
    })
    fireEvent.change(screen.getByLabelText(/İlk kurum yöneticisi/i), {
      target: { value: 'Kurum' },
    })
    const candidate = await screen.findByRole('option', { name: /Kurum Yöneticisi/i })
    fireEvent.click(candidate)
    fireEvent.change(screen.getByLabelText(/Onay \/ pilot dosyası referansı/i), {
      target: { value: 'pilot-2026-001' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Ücretsiz pilotu oluştur' }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/admin/institutions/free-pilots',
        expect.objectContaining({ method: 'POST' }),
      )
    })
    const provisionCall = fetchMock.mock.calls.find(
      ([url, init]) => String(url) === '/api/admin/institutions/free-pilots' && init?.method === 'POST',
    )
    expect(JSON.parse(String(provisionCall?.[1]?.body))).toEqual({
      name: 'Bilge Küçük Dershane',
      managerUserId: manager.id,
      approvalReference: 'PILOT-2026-001',
      studentLimit: 30,
      staffLimit: 2,
      trialDays: 30,
      requestId: '44444444-4444-4444-8444-444444444444',
    })
    expect(fetchMock).not.toHaveBeenCalledWith(
      '/api/admin/institutions',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(await screen.findByRole('status')).toHaveTextContent(/ücretsiz pilotu oluşturuldu/i)
  })

  it('reuses the request ID for the same failed payload and rotates it when the payload changes', async () => {
    let provisionAttempts = 0
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.startsWith('/api/admin/users?')) {
        return Response.json({ users: [manager] })
      }
      if (url === '/api/admin/institutions/free-pilots' && init?.method === 'POST') {
        provisionAttempts += 1
        if (provisionAttempts < 3) {
          return Response.json({ error: 'Yanıt alınamadı; tekrar deneyin.' }, { status: 503 })
        }
        return Response.json({ institution: { name: 'Değişen Dershane' } }, { status: 201 })
      }
      if (url === '/api/admin/institutions') {
        return Response.json({
          institutions: [],
          provisioning: { invitationFreePilotEnabled: true },
        })
      }
      throw new Error(`Unexpected request: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(globalThis.crypto, 'randomUUID')
      .mockReturnValueOnce('44444444-4444-4444-8444-444444444444')
      .mockReturnValueOnce('55555555-5555-4555-8555-555555555555')

    render(<AdminInstitutionsPage />)
    expect(await screen.findByText('Henüz kurum oluşturulmadı.')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText(/Kurum adı/i), {
      target: { value: 'İlk Dershane' },
    })
    fireEvent.change(screen.getByLabelText(/İlk kurum yöneticisi/i), {
      target: { value: 'Kurum' },
    })
    fireEvent.click(await screen.findByRole('option', { name: /Kurum Yöneticisi/i }))
    fireEvent.change(screen.getByLabelText(/Onay \/ pilot dosyası referansı/i), {
      target: { value: 'PILOT-2026-RETRY' },
    })

    const submit = screen.getByRole('button', { name: 'Ücretsiz pilotu oluştur' })
    fireEvent.click(submit)
    await waitFor(() => expect(provisionAttempts).toBe(1))
    expect(await screen.findByRole('alert')).toHaveTextContent(/tekrar deneyin/i)

    fireEvent.click(submit)
    await waitFor(() => expect(provisionAttempts).toBe(2))

    fireEvent.change(screen.getByLabelText(/Kurum adı/i), {
      target: { value: 'Değişen Dershane' },
    })
    fireEvent.click(submit)
    expect(await screen.findByRole('status')).toHaveTextContent(/Değişen Dershane ücretsiz pilotu/i)

    const requestIds = fetchMock.mock.calls
      .filter(([url, init]) => String(url) === '/api/admin/institutions/free-pilots' && init?.method === 'POST')
      .map(([, init]) => JSON.parse(String(init?.body)).requestId)
    expect(requestIds).toEqual([
      '44444444-4444-4444-8444-444444444444',
      '44444444-4444-4444-8444-444444444444',
      '55555555-5555-4555-8555-555555555555',
    ])
  })

  it('disables provisioning controls when the dedicated switch is off', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({
      institutions: [],
      provisioning: { invitationFreePilotEnabled: false },
    })))

    render(<AdminInstitutionsPage />)

    expect(await screen.findByText(/ücretsiz pilot ve ücretli kurum onboarding akışları şu anda kapalı/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Kurum oluşturma kapalı' })).toBeDisabled()
    expect(screen.getByLabelText(/Kurum adı/i)).toBeDisabled()
    expect(screen.getByLabelText(/İlk kurum yöneticisi/i)).toBeDisabled()
  })

  it('shows expired free pilots as access-closed and prevents reactivation', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({
      institutions: [{
        id: '11111111-1111-4111-8111-111111111111',
        name: 'Süresi Dolan Dershane',
        status: 'pilot',
        studentLimit: 30,
        studentCount: 4,
        staffLimit: 2,
        staffCount: 1,
        classroomCount: 1,
        pilotKind: 'invitation_free',
        approvalReference: 'PILOT-2026-EXPIRED',
        reviewDueAt: '2026-01-01T00:00:00.000Z',
        manager: null,
        supportAccess: {
          active: true,
          expiresAt: '2099-01-01T00:00:00.000Z',
          reason: 'Eski destek izni',
        },
        createdAt: '2025-12-01T00:00:00.000Z',
      }],
      provisioning: { invitationFreePilotEnabled: true },
    })))

    render(<AdminInstitutionsPage />)

    expect(await screen.findByText('erişim kapalı')).toBeInTheDocument()
    expect(screen.getByText(/tenant erişimi kapalıdır/i)).toBeInTheDocument()
    expect(screen.getByText(/kurum desteği ve tenant erişimi kapalı/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Aktifleştir' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /destek görünümünü aç/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Askıya al' })).toBeInTheDocument()
  })

  it('uses the paid onboarding endpoint and only asks for name, manager and request ID', async () => {
    let paidAttempts = 0
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.startsWith('/api/admin/users?')) return Response.json({ users: [manager] })
      if (url === '/api/admin/institutions' && init?.method === 'POST') {
        paidAttempts += 1
        if (paidAttempts === 1) {
          return Response.json({ error: 'Yanıt alınamadı; tekrar deneyin.' }, { status: 503 })
        }
        return Response.json({ institution: { name: 'Ticari Dershane' } }, { status: 201 })
      }
      if (url === '/api/admin/institutions') {
        return Response.json({ institutions: [], provisioning: { invitationFreePilotEnabled: false, commercialOnboardingEnabled: true } })
      }
      throw new Error(`Unexpected request: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('66666666-6666-4666-8666-666666666666')

    render(<AdminInstitutionsPage />)
    expect(await screen.findByText('Ücretli kurum onboarding')).toBeInTheDocument()
    expect(screen.queryByLabelText(/Onay \/ pilot dosyası referansı/i)).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText(/Kurum adı/i), { target: { value: 'Ticari Dershane' } })
    fireEvent.change(screen.getByLabelText(/İlk kurum yöneticisi/i), { target: { value: 'Kurum' } })
    fireEvent.click(await screen.findByRole('option', { name: /Kurum Yöneticisi/i }))
    const submit = screen.getByRole('button', { name: 'Ücretli onboarding başlat' })
    fireEvent.click(submit)
    expect(await screen.findByRole('alert')).toHaveTextContent(/tekrar deneyin/i)
    fireEvent.click(submit)

    await waitFor(() => expect(paidAttempts).toBe(2))
    const calls = fetchMock.mock.calls.filter(([url, init]) => String(url) === '/api/admin/institutions' && init?.method === 'POST')
    const expectedBody = {
      name: 'Ticari Dershane',
      managerUserId: manager.id,
      requestId: '66666666-6666-4666-8666-666666666666',
    }
    expect(calls.map(([, init]) => JSON.parse(String(init?.body)))).toEqual([
      expectedBody,
      expectedBody,
    ])
    expect(fetchMock.mock.calls.some(([url]) => String(url) === '/api/admin/institutions/free-pilots')).toBe(false)
  })

  it('keeps paid and free retry UUID namespaces separate when both capabilities are open', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.startsWith('/api/admin/users?')) return Response.json({ users: [manager] })
      if (url === '/api/admin/institutions' && init?.method === 'POST') {
        return Response.json({ error: 'Ticari akış geçici olarak kapalı.' }, { status: 503 })
      }
      if (url === '/api/admin/institutions/free-pilots' && init?.method === 'POST') {
        return Response.json({ institution: { name: 'Canary Dershane' } }, { status: 201 })
      }
      if (url === '/api/admin/institutions') {
        return Response.json({ institutions: [], provisioning: { invitationFreePilotEnabled: true, commercialOnboardingEnabled: true } })
      }
      throw new Error(`Unexpected request: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(globalThis.crypto, 'randomUUID')
      .mockReturnValueOnce('77777777-7777-4777-8777-777777777777')
      .mockReturnValueOnce('88888888-8888-4888-8888-888888888888')

    render(<AdminInstitutionsPage />)
    expect(await screen.findByRole('radio', { name: 'Ücretli onboarding' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: 'Ücretli onboarding' }))
    fireEvent.change(screen.getByLabelText(/Kurum adı/i), { target: { value: 'Ticari Dershane' } })
    fireEvent.change(screen.getByLabelText(/İlk kurum yöneticisi/i), { target: { value: 'Kurum' } })
    fireEvent.click(await screen.findByRole('option', { name: /Kurum Yöneticisi/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Ücretli onboarding başlat' }))
    await waitFor(() => expect(fetchMock.mock.calls.filter(([url, init]) => String(url) === '/api/admin/institutions' && init?.method === 'POST')).toHaveLength(1))

    fireEvent.click(screen.getByRole('radio', { name: 'Ücretsiz pilot' }))
    fireEvent.change(screen.getByLabelText(/Onay \/ pilot dosyası referansı/i), { target: { value: 'PILOT-2026-NS-01' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ücretsiz pilotu oluştur' }))
    await waitFor(() => expect(fetchMock.mock.calls.filter(([url, init]) => String(url) === '/api/admin/institutions/free-pilots' && init?.method === 'POST')).toHaveLength(1))

    const paidBody = JSON.parse(String(fetchMock.mock.calls.find(([url, init]) => String(url) === '/api/admin/institutions' && init?.method === 'POST')?.[1]?.body))
    const freeBody = JSON.parse(String(fetchMock.mock.calls.find(([url, init]) => String(url) === '/api/admin/institutions/free-pilots' && init?.method === 'POST')?.[1]?.body))
    expect(paidBody.requestId).toBe('77777777-7777-4777-8777-777777777777')
    expect(freeBody.requestId).toBe('88888888-8888-4888-8888-888888888888')
  })
})
