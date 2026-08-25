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

  it('disables provisioning controls when the dedicated switch is off', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({
      institutions: [],
      provisioning: { invitationFreePilotEnabled: false },
    })))

    render(<AdminInstitutionsPage />)

    expect(await screen.findByText(/ücretsiz pilot oluşturma şu anda kapalı/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ücretsiz pilot kapalı' })).toBeDisabled()
    expect(screen.getByLabelText(/Kurum adı/i)).toBeDisabled()
    expect(screen.getByLabelText(/İlk kurum yöneticisi/i)).toBeDisabled()
  })
})
