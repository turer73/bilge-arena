import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { WaitlistForm } from '../waitlist-form'

// ─── Mocks ───────────────────────────────────────────────

const trackEventMock = vi.fn()
vi.mock('@/lib/utils/plausible', () => ({
  trackEvent: (...args: unknown[]) => trackEventMock(...args),
}))

// ─── Helpers ─────────────────────────────────────────────

// role-based queryler -- input ve checkbox label'lari ortak kelime icerse
// (ornegin "e-posta") getByLabelText coklu eslesir. role filtresi ayrim sagliyor.
function fillEmail(value: string) {
  const input = screen.getByRole('textbox', { name: /e-posta/i })
  fireEvent.change(input, { target: { value } })
}

function checkKvkk() {
  const checkbox = screen.getByRole('checkbox', { name: /kvkk/i })
  fireEvent.click(checkbox)
}

function clickSubmit() {
  return screen.getByRole('button', { name: /bildirim/i })
}

// ─── Tests ───────────────────────────────────────────────

describe('WaitlistForm', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    trackEventMock.mockClear()
    // default: 200 OK
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    })
    global.fetch = fetchMock as unknown as typeof fetch
  })

  it('email input + KVKK checkbox + submit butonunu render eder', () => {
    render(<WaitlistForm plan="monthly" />)
    expect(
      screen.getByRole('textbox', { name: /e-posta/i })
    ).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /kvkk/i })).toBeInTheDocument()
    expect(clickSubmit()).toBeInTheDocument()
  })

  it('submit butonu KVKK + email gecerli olana kadar disabled', () => {
    render(<WaitlistForm plan="monthly" />)
    expect(clickSubmit()).toBeDisabled()

    // Sadece email -- KVKK hala isaretsiz
    fillEmail('user@example.com')
    expect(clickSubmit()).toBeDisabled()

    // KVKK isaretlendi -- artik enabled
    checkKvkk()
    expect(clickSubmit()).not.toBeDisabled()
  })

  it('gecerli submit: /api/premium/waitlist endpointine plan + email + kvkkConsent gonderir', async () => {
    render(<WaitlistForm plan="yearly" />)
    fillEmail('user@example.com')
    checkKvkk()

    await act(async () => {
      fireEvent.click(clickSubmit())
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, opts] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/premium/waitlist')
    expect(opts.method).toBe('POST')
    const body = JSON.parse(opts.body as string)
    expect(body.email).toBe('user@example.com')
    expect(body.plan).toBe('yearly')
    expect(body.kvkkConsent).toBe(true)
  })

  it('basarili submit: tesekkur mesaji + PremiumUpsell event', async () => {
    render(<WaitlistForm plan="monthly" />)
    fillEmail('user@example.com')
    checkKvkk()

    await act(async () => {
      fireEvent.click(clickSubmit())
    })

    // Success state: form yerine tesekkur mesaji
    expect(screen.getByText(/te[sş]ekk[uü]r|listene/i)).toBeInTheDocument()
    expect(trackEventMock).toHaveBeenCalledWith(
      'PremiumUpsell',
      expect.objectContaining({
        props: expect.objectContaining({
          plan: 'monthly',
          action: 'waitlist_submit',
        }),
      })
    )
  })

  it('429 rate-limit: kullanici-dostu Turkce hata gosterir', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 429,
      json: async () => ({ ok: false, error: 'rate_limited', retryAfter: 30 }),
    })
    render(<WaitlistForm plan="monthly" />)
    fillEmail('user@example.com')
    checkKvkk()

    await act(async () => {
      fireEvent.click(clickSubmit())
    })

    expect(screen.getByText(/[cç]ok fazla|biraz bekle|sonra tekrar/i)).toBeInTheDocument()
  })

  it('400 validation: kullanici-dostu hata gosterir', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ ok: false, error: 'validation' }),
    })
    render(<WaitlistForm plan="monthly" />)
    fillEmail('user@example.com')
    checkKvkk()

    await act(async () => {
      fireEvent.click(clickSubmit())
    })

    expect(screen.getByText(/ge[cç]ersiz|kontrol et/i)).toBeInTheDocument()
  })

  it('network error: baglanti hatasi mesaji', async () => {
    fetchMock.mockRejectedValueOnce(new Error('Network down'))
    render(<WaitlistForm plan="monthly" />)
    fillEmail('user@example.com')
    checkKvkk()

    await act(async () => {
      fireEvent.click(clickSubmit())
    })

    expect(screen.getByText(/ba[gğ]lant[iı]|tekrar dene/i)).toBeInTheDocument()
  })
})
