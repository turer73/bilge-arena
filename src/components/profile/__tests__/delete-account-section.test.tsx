import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ACCOUNT_DELETION_CONFIRMATION } from '@/lib/account-deletion'
import { DeleteAccountSection } from '../delete-account-section'

const auth = vi.hoisted(() => ({ currentUserId: 'user-1', signOut: vi.fn() }))
vi.mock('@/stores/auth-store', () => ({
  useAuthStore: { getState: () => ({ user: { id: auth.currentUserId }, signOut: auth.signOut }) },
}))

const fetchMock = vi.fn()
const closed = { erasure: { complete: false, profile: 'closed', authIdentity: 'scrubbed' } }

function respond(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }) }
function openDialog() {
  fireEvent.click(screen.getByRole('button', { name: 'Hesabımı kalıcı sil' }))
  return screen.getByRole('dialog')
}
function confirm() {
  fireEvent.click(screen.getByRole('checkbox'))
  fireEvent.change(screen.getByRole('textbox'), { target: { value: ACCOUNT_DELETION_CONFIRMATION } })
}
function deleteButton() { return screen.getByRole('button', { name: 'Evet, hesabımı kalıcı sil' }) }

describe('DeleteAccountSection', () => {
  beforeEach(() => {
    auth.currentUserId = 'user-1'
    auth.signOut.mockReset()
    fetchMock.mockReset().mockResolvedValue(respond(closed))
    vi.stubGlobal('fetch', fetchMock)
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
      configurable: true, value: function (this: HTMLDialogElement) { this.open = true },
    })
  })
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

  it('never deletes on the first click and defaults focus to keeping the account', () => {
    render(<DeleteAccountSection userId="user-1" />)
    const dialog = openDialog()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(deleteButton()).toBeDisabled()
    expect(within(dialog).getByRole('button', { name: 'Silme penceresini kapat' })).toHaveFocus()
    expect(dialog).toHaveTextContent('tüm kopyaların aynı anda yok edildiği anlamına gelmez')
  })

  it('requires both the exact text and the acknowledgement', () => {
    render(<DeleteAccountSection userId="user-1" />)
    openDialog()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: ACCOUNT_DELETION_CONFIRMATION } })
    expect(deleteButton()).toBeDisabled()
    fireEvent.click(screen.getByRole('checkbox'))
    expect(deleteButton()).toBeEnabled()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'SIL' } })
    expect(deleteButton()).toBeDisabled()
    fireEvent.click(deleteButton())
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('does not submit when Enter is pressed in the confirmation field', () => {
    render(<DeleteAccountSection userId="user-1" />)
    openDialog(); confirm()
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter', code: 'Enter' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('resets confirmation on cancel and restores trigger focus, including StrictMode', () => {
    render(<StrictMode><DeleteAccountSection userId="user-1" /></StrictMode>)
    const trigger = screen.getByRole('button', { name: 'Hesabımı kalıcı sil' })
    trigger.focus()
    openDialog(); confirm()
    fireEvent.click(screen.getByRole('button', { name: 'Vazgeç, hesabımı koru' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
    openDialog()
    expect(screen.getByRole('textbox')).toHaveValue('')
    expect(screen.getByRole('checkbox')).not.toBeChecked()
    expect(deleteButton()).toBeDisabled()
  })

  it('allows Escape before confirmation without performing a deletion', () => {
    render(<DeleteAccountSection userId="user-1" />)
    const dialog = openDialog()
    fireEvent(dialog, new Event('cancel', { cancelable: true }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('keeps forward and backward Tab navigation inside the confirmation dialog', () => {
    render(<DeleteAccountSection userId="user-1" />)
    openDialog()
    const cancel = screen.getByRole('button', { name: 'Vazgeç, hesabımı koru' })
    const close = screen.getByRole('button', { name: 'Silme penceresini kapat' })
    cancel.focus()
    fireEvent.keyDown(cancel, { key: 'Tab' })
    expect(close).toHaveFocus()
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true })
    expect(cancel).toHaveFocus()
  })

  it('sends the guarded payload once and reports partial data-erasure truthfully', async () => {
    render(<DeleteAccountSection userId="user-1" />)
    openDialog(); confirm(); fireEvent.click(deleteButton())
    const heading = await screen.findByRole('heading', { name: 'Hesabın kapatıldı' })
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith('/api/account/delete', expect.objectContaining({
      method: 'POST', credentials: 'same-origin', cache: 'no-store',
      body: JSON.stringify({ confirmation: ACCOUNT_DELETION_CONFIRMATION, acknowledged: true, expectedUserId: 'user-1' }),
    }))
    expect(screen.getByRole('status')).toHaveTextContent('tüm verilerinin silinmesi henüz tamamlanmış değildir')
    // Odak basliga pasif efektte tasinir; findBy basligi commit aninda bulur, efekt sonraki
    // zamanlayici turunda kosar. Surec >=1 ms bekletilirse (yuk) RTL'nin setTimeout(0)
    // bosaltmasi efektten once doner ve odak body'de gorunur. Beklenen sinyal odagin kendisi.
    await waitFor(() => expect(heading).toHaveFocus())
    expect(screen.getByRole('link', { name: 'iletisim@bilgearena.com' })).toHaveAttribute('href', 'mailto:iletisim@bilgearena.com')
    expect(screen.getByRole('link', { name: 'Giriş sayfasına dön' })).toHaveAttribute('href', '/giris?deleted=1')
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('clears only the closed account from local state on the full-navigation link', async () => {
    render(<DeleteAccountSection userId="user-1" />)
    openDialog(); confirm(); fireEvent.click(deleteButton())
    const link = await screen.findByRole('link', { name: 'Giriş sayfasına dön' })
    // Suppress jsdom navigation, not the component's click handler.
    link.addEventListener('click', event => event.preventDefault())
    fireEvent.click(link)
    expect(auth.signOut).toHaveBeenCalledOnce()
    auth.currentUserId = 'user-2'
    fireEvent.click(link)
    expect(auth.signOut).toHaveBeenCalledOnce()
  })

  it('blocks double clicks and Escape during an in-flight destructive request', async () => {
    let resolve!: (response: Response) => void
    fetchMock.mockReturnValue(new Promise<Response>(done => { resolve = done }))
    render(<DeleteAccountSection userId="user-1" />)
    const dialog = openDialog(); confirm()
    const button = deleteButton()
    fireEvent.click(button); fireEvent.click(button)
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(screen.getByRole('textbox')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Vazgeç, hesabımı koru' })).toBeDisabled()
    fireEvent(dialog, new Event('cancel', { cancelable: true }))
    expect(dialog).toBeInTheDocument()
    await act(async () => { resolve(respond(closed)) })
    expect(screen.getByRole('heading', { name: 'Hesabın kapatıldı' })).toBeInTheDocument()
  })

  it('rejects a switched account before the request starts', () => {
    render(<DeleteAccountSection userId="user-1" />)
    openDialog(); confirm()
    auth.currentUserId = 'user-2'
    fireEvent.click(deleteButton())
    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('hesap değişti')
  })

  it('ignores a late old-account response and never clears a new account', async () => {
    let resolve!: (response: Response) => void
    fetchMock.mockReturnValue(new Promise<Response>(done => { resolve = done }))
    const view = render(<DeleteAccountSection key="user-1" userId="user-1" />)
    openDialog(); confirm(); fireEvent.click(deleteButton())
    auth.currentUserId = 'user-2'
    view.rerender(<DeleteAccountSection key="user-2" userId="user-2" />)
    await act(async () => { resolve(respond(closed)) })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(auth.signOut).not.toHaveBeenCalled()
    openDialog()
    expect(deleteButton()).toBeDisabled()
  })

  it('shows a closed-but-not-cleaned result when cleanup fails', async () => {
    fetchMock.mockResolvedValue(respond({ erasure: { profile: 'closed', authIdentity: 'pending', complete: false } }, 503))
    render(<DeleteAccountSection userId="user-1" />)
    openDialog(); confirm(); fireEvent.click(deleteButton())
    await screen.findByRole('heading', { name: 'Hesabın kapatıldı' })
    expect(screen.getByRole('status')).toHaveTextContent('temizliği tamamlanamadı')
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it.each([401, 409, 429, 400])('shows a useful error without claiming deletion on HTTP %s', async status => {
    fetchMock.mockResolvedValue(respond({ error: 'server detail' }, status))
    render(<DeleteAccountSection userId="user-1" />)
    openDialog(); confirm(); fireEvent.click(deleteButton())
    await screen.findByRole('alert')
    expect(screen.queryByRole('heading', { name: 'Hesabın kapatıldı' })).not.toBeInTheDocument()
    expect(screen.getByRole('textbox')).toBeInTheDocument()
    expect(auth.signOut).not.toHaveBeenCalled()
  })

  it.each(['network', 'server', 'invalid_success'])('does not equate an ambiguous %s result to no mutation', async kind => {
    if (kind === 'network') fetchMock.mockRejectedValue(new Error('offline'))
    else fetchMock.mockResolvedValue(respond({}, kind === 'server' ? 500 : 200))
    render(<DeleteAccountSection userId="user-1" />)
    openDialog(); confirm(); fireEvent.click(deleteButton())
    await screen.findByRole('heading', { name: 'İşlem sonucu doğrulanamadı' })
    expect(screen.getByRole('status')).toHaveTextContent('Hesabın kapanmış olabilir')
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(auth.signOut).not.toHaveBeenCalled()
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())
  })

  it('bounds a stalled request and treats a timeout as uncertain, not as no deletion', async () => {
    vi.useFakeTimers()
    fetchMock.mockImplementation((_url, options: RequestInit) => new Promise((_resolve, reject) => {
      options.signal?.addEventListener('abort', () => reject(new Error('timeout')), { once: true })
    }))
    render(<DeleteAccountSection userId="user-1" />)
    openDialog(); confirm(); fireEvent.click(deleteButton())
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000) })
    expect(screen.getByRole('heading', { name: 'İşlem sonucu doğrulanamadı' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Profilime dön' })).toBeEnabled()
    expect(fetchMock).toHaveBeenCalledOnce()
  })
})
