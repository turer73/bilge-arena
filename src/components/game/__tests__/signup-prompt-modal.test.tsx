import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { SignupPromptModal } from '../signup-prompt-modal'

const signInWithGoogleMock = vi.fn()
const signInWithMagicLinkMock = vi.fn()
const trackEventMock = vi.fn()

vi.mock('@/lib/hooks/use-auth', () => ({
  useAuth: () => ({
    signInWithGoogle: signInWithGoogleMock,
    signInWithMagicLink: signInWithMagicLinkMock,
    user: null,
    profile: null,
    loading: false,
    signOut: vi.fn(),
  }),
}))

vi.mock('@/lib/utils/plausible', () => ({
  trackEvent: (...args: unknown[]) => trackEventMock(...args),
}))

describe('SignupPromptModal', () => {
  beforeEach(() => {
    signInWithGoogleMock.mockClear()
    signInWithMagicLinkMock.mockClear()
    trackEventMock.mockClear()
  })

  it('open=false iken render etmez', () => {
    render(<SignupPromptModal level={1} open={false} onDismiss={vi.fn()} onExitToLobby={vi.fn()} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('Level 1: soft CTA basligini gosterir', () => {
    render(<SignupPromptModal level={1} open={true} onDismiss={vi.fn()} onExitToLobby={vi.fn()} />)
    expect(screen.getByText('Skorunu Kaydet!')).toBeInTheDocument()
    expect(screen.getByText('Google ile Devam Et')).toBeInTheDocument()
    expect(screen.getByText('Belki sonra')).toBeInTheDocument()
  })

  it('Level 2: medium urgency basligini gosterir', () => {
    render(<SignupPromptModal level={2} open={true} onDismiss={vi.fn()} onExitToLobby={vi.fn()} />)
    expect(screen.getByText(/Streak'in Yakinda Kaybolacak/)).toBeInTheDocument()
    expect(screen.getByText('Google ile Kaydet')).toBeInTheDocument()
  })

  it('Level 3: hard wall basligini gosterir, X butonu YOK', () => {
    render(<SignupPromptModal level={3} open={true} onDismiss={vi.fn()} onExitToLobby={vi.fn()} />)
    expect(screen.getByText('Son Sans!')).toBeInTheDocument()
    expect(screen.getByText('Lobiye Don')).toBeInTheDocument()
    expect(screen.queryByLabelText('Kapat')).not.toBeInTheDocument()
  })

  it('Level 1 ve 2: X butonu vardir', () => {
    const { unmount } = render(<SignupPromptModal level={1} open={true} onDismiss={vi.fn()} onExitToLobby={vi.fn()} />)
    expect(screen.getByLabelText('Kapat')).toBeInTheDocument()
    unmount()
    render(<SignupPromptModal level={2} open={true} onDismiss={vi.fn()} onExitToLobby={vi.fn()} />)
    expect(screen.getByLabelText('Kapat')).toBeInTheDocument()
  })

  it('acilirken PromptShown event fire olur', () => {
    render(<SignupPromptModal level={1} open={true} onDismiss={vi.fn()} onExitToLobby={vi.fn()} />)
    expect(trackEventMock).toHaveBeenCalledWith('PromptShown', { props: { level: 1 } })
  })

  it('Primary CTA: signup event + signInWithGoogle cagrilir', async () => {
    render(<SignupPromptModal level={2} open={true} onDismiss={vi.fn()} onExitToLobby={vi.fn()} />)
    fireEvent.click(screen.getByText('Google ile Kaydet'))
    expect(trackEventMock).toHaveBeenCalledWith('PromptCtaClicked', { props: { level: 2, outcome: 'signup' } })
    expect(signInWithGoogleMock).toHaveBeenCalled()
  })

  it('Level 1 secondary button: onDismiss cagrilir, dismissed event fire', () => {
    const onDismiss = vi.fn()
    render(<SignupPromptModal level={1} open={true} onDismiss={onDismiss} onExitToLobby={vi.fn()} />)
    fireEvent.click(screen.getByText('Belki sonra'))
    expect(onDismiss).toHaveBeenCalled()
    expect(trackEventMock).toHaveBeenCalledWith('PromptDismissed', { props: { level: 1, method: 'button' } })
  })

  it('Level 3 secondary button: onExitToLobby cagrilir (dismiss DEGIL)', () => {
    const onDismiss = vi.fn()
    const onExitToLobby = vi.fn()
    render(<SignupPromptModal level={3} open={true} onDismiss={onDismiss} onExitToLobby={onExitToLobby} />)
    fireEvent.click(screen.getByText('Lobiye Don'))
    expect(onExitToLobby).toHaveBeenCalled()
    expect(onDismiss).not.toHaveBeenCalled()
    expect(trackEventMock).toHaveBeenCalledWith('PromptCtaClicked', { props: { level: 3, outcome: 'exit_lobby' } })
  })

  it('Level 1 ESC tusu: onDismiss cagrilir', () => {
    const onDismiss = vi.fn()
    render(<SignupPromptModal level={1} open={true} onDismiss={onDismiss} onExitToLobby={vi.fn()} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onDismiss).toHaveBeenCalled()
    expect(trackEventMock).toHaveBeenCalledWith('PromptDismissed', { props: { level: 1, method: 'esc' } })
  })

  it('Level 3 ESC tusu: HIC BIR SEY yapmaz (hard wall)', () => {
    const onDismiss = vi.fn()
    const onExitToLobby = vi.fn()
    render(<SignupPromptModal level={3} open={true} onDismiss={onDismiss} onExitToLobby={onExitToLobby} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onDismiss).not.toHaveBeenCalled()
    expect(onExitToLobby).not.toHaveBeenCalled()
  })

  it('role=dialog + aria-modal set edilmis (a11y)', () => {
    render(<SignupPromptModal level={1} open={true} onDismiss={vi.fn()} onExitToLobby={vi.fn()} />)
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAttribute('aria-labelledby', 'prompt-modal-title')
  })

  // --- Gun 3: Magic link akisi (Opsiyon Z progressive disclosure) ---

  describe('Magic link akisi', () => {
    it('ilk render: email input GIZLI, "Email ile giris" linki gorunur', () => {
      render(<SignupPromptModal level={1} open={true} onDismiss={vi.fn()} onExitToLobby={vi.fn()} />)
      expect(screen.queryByLabelText('Email adresin')).not.toBeInTheDocument()
      expect(screen.getByText(/Email ile giris yap/)).toBeInTheDocument()
    })

    it('"Email ile giris" tiklaninca MagicLinkRevealed event fire + input acilir', () => {
      render(<SignupPromptModal level={1} open={true} onDismiss={vi.fn()} onExitToLobby={vi.fn()} />)
      fireEvent.click(screen.getByText(/Email ile giris yap/))
      expect(trackEventMock).toHaveBeenCalledWith('MagicLinkRevealed', { props: { level: 1 } })
      expect(screen.getByLabelText('Email adresin')).toBeInTheDocument()
      expect(screen.getByText('Giris Linki Gonder')).toBeInTheDocument()
    })

    it('gecersiz email submit: validation hatasi goster, signInWithMagicLink CAGRILMAZ', async () => {
      render(<SignupPromptModal level={1} open={true} onDismiss={vi.fn()} onExitToLobby={vi.fn()} />)
      fireEvent.click(screen.getByText(/Email ile giris yap/))
      const input = screen.getByLabelText('Email adresin') as HTMLInputElement
      fireEvent.change(input, { target: { value: 'bozuk' } })
      fireEvent.click(screen.getByText('Giris Linki Gonder'))
      // Validation error beklenir (asenkron degil, senkron)
      expect(await screen.findByText(/Geçerli bir e-posta/)).toBeInTheDocument()
      expect(signInWithMagicLinkMock).not.toHaveBeenCalled()
    })

    it('gecerli email submit: MagicLinkRequested + signInWithMagicLink cagrilir', async () => {
      signInWithMagicLinkMock.mockResolvedValue({ ok: true })
      render(<SignupPromptModal level={1} open={true} onDismiss={vi.fn()} onExitToLobby={vi.fn()} />)
      fireEvent.click(screen.getByText(/Email ile giris yap/))
      const input = screen.getByLabelText('Email adresin')
      fireEvent.change(input, { target: { value: 'test@example.com' } })
      await act(async () => {
        fireEvent.click(screen.getByText('Giris Linki Gonder'))
      })
      expect(trackEventMock).toHaveBeenCalledWith('MagicLinkRequested', { props: { level: 1 } })
      expect(signInWithMagicLinkMock).toHaveBeenCalledWith('test@example.com')
    })

    it('basarili gonderim: MagicLinkSent event + success UI', async () => {
      signInWithMagicLinkMock.mockResolvedValue({ ok: true })
      render(<SignupPromptModal level={1} open={true} onDismiss={vi.fn()} onExitToLobby={vi.fn()} />)
      fireEvent.click(screen.getByText(/Email ile giris yap/))
      fireEvent.change(screen.getByLabelText('Email adresin'), { target: { value: 'test@example.com' } })
      await act(async () => {
        fireEvent.click(screen.getByText('Giris Linki Gonder'))
      })
      expect(trackEventMock).toHaveBeenCalledWith('MagicLinkSent', { props: { level: 1 } })
      expect(screen.getByText(/Email gonderildi/)).toBeInTheDocument()
      expect(screen.getByText('test@example.com')).toBeInTheDocument()
    })

    it('basarisiz gonderim: MagicLinkFailed event + error UI + retry butonu', async () => {
      signInWithMagicLinkMock.mockResolvedValue({ ok: false, error: 'SMTP down' })
      render(<SignupPromptModal level={1} open={true} onDismiss={vi.fn()} onExitToLobby={vi.fn()} />)
      fireEvent.click(screen.getByText(/Email ile giris yap/))
      fireEvent.change(screen.getByLabelText('Email adresin'), { target: { value: 'test@example.com' } })
      await act(async () => {
        fireEvent.click(screen.getByText('Giris Linki Gonder'))
      })
      expect(trackEventMock).toHaveBeenCalledWith(
        'MagicLinkFailed',
        expect.objectContaining({ props: expect.objectContaining({ level: 1 }) }),
      )
      expect(screen.getByText('Tekrar dene')).toBeInTheDocument()
    })

    it('rate limit hatasi kullanici-dostu Turkce mesaj cevirir', async () => {
      signInWithMagicLinkMock.mockResolvedValue({ ok: false, error: 'Email rate limit exceeded' })
      render(<SignupPromptModal level={1} open={true} onDismiss={vi.fn()} onExitToLobby={vi.fn()} />)
      fireEvent.click(screen.getByText(/Email ile giris yap/))
      fireEvent.change(screen.getByLabelText('Email adresin'), { target: { value: 'test@example.com' } })
      await act(async () => {
        fireEvent.click(screen.getByText('Giris Linki Gonder'))
      })
      expect(screen.getByText(/Çok fazla istek/)).toBeInTheDocument()
    })

    it('Level 3 hard wall: magic link yine gorunur (alternatif primary action)', () => {
      render(<SignupPromptModal level={3} open={true} onDismiss={vi.fn()} onExitToLobby={vi.fn()} />)
      expect(screen.getByText(/Email ile giris yap/)).toBeInTheDocument()
    })
  })
})
