/**
 * Bilge Arena Oda: ShareButton component tests
 * Sprint 2C Task 8 (Replay & Share) + Codex review fix
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { ShareButton } from '../ShareButton'

const setNavigator = (overrides: Partial<Navigator>) => {
  Object.defineProperty(global, 'navigator', {
    value: {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
      ...overrides,
    },
    writable: true,
    configurable: true,
  })
}

describe('ShareButton', () => {
  beforeEach(() => {
    // Default: native share YOK (mobile fallback test edilebilsin)
    setNavigator({})
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test('1) Initial render: Paylaş butonu + aria-haspopup + aria-expanded=false', () => {
    render(<ShareButton url="https://example.com/oda/ABC123" text="Test" />)
    const btn = screen.getByRole('button', { name: /Paylaş/i })
    expect(btn).toBeInTheDocument()
    expect(btn.getAttribute('aria-haspopup')).toBe('menu')
    expect(btn.getAttribute('aria-expanded')).toBe('false')
  })

  test('2) Click sonrasi 4 secenek + aria-expanded=true', () => {
    render(<ShareButton url="https://example.com/oda/ABC123" text="Bilge Arena" />)
    const btn = screen.getByRole('button', { name: /Paylaş/i })
    fireEvent.click(btn)
    expect(btn.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByTestId('share-clipboard')).toBeInTheDocument()
    expect(screen.getByTestId('share-whatsapp')).toBeInTheDocument()
    expect(screen.getByTestId('share-telegram')).toBeInTheDocument()
    expect(screen.getByTestId('share-twitter')).toBeInTheDocument()
  })

  test('3) WhatsApp link: wa.me URL with encoded text + url', () => {
    render(<ShareButton url="https://x.com/o/ABC" text="Test+Mesaj" />)
    fireEvent.click(screen.getByRole('button', { name: /Paylaş/i }))
    const wa = screen.getByTestId('share-whatsapp')
    const href = wa.getAttribute('href')!
    expect(href).toMatch(/^https:\/\/wa\.me\/\?text=/)
    expect(href).toContain(encodeURIComponent('Test+Mesaj'))
    expect(href).toContain(encodeURIComponent('https://x.com/o/ABC'))
  })

  test('4) Telegram link: t.me/share/url with encoded url + text', () => {
    render(<ShareButton url="https://x.com/o/ABC" text="Test" />)
    fireEvent.click(screen.getByRole('button', { name: /Paylaş/i }))
    const tg = screen.getByTestId('share-telegram')
    const href = tg.getAttribute('href')!
    expect(href).toMatch(/^https:\/\/t\.me\/share\/url/)
    expect(href).toContain('url=' + encodeURIComponent('https://x.com/o/ABC'))
    expect(href).toContain('text=' + encodeURIComponent('Test'))
  })

  test('5) X (Codex P3 #9): x.com/intent/post (twitter.com degil)', () => {
    render(<ShareButton url="https://x.com/o/ABC" text="Tweet" />)
    fireEvent.click(screen.getByRole('button', { name: /Paylaş/i }))
    const tw = screen.getByTestId('share-twitter')
    const href = tw.getAttribute('href')!
    expect(href).toMatch(/^https:\/\/x\.com\/intent\/post/)
    expect(href).not.toMatch(/twitter\.com/)
    expect(href).toContain('text=' + encodeURIComponent('Tweet'))
  })

  test('6) Clipboard click: clipboard.writeText cagrilir', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    setNavigator({ clipboard: { writeText } as unknown as Clipboard })
    render(<ShareButton url="https://x.com/o/ABC" text="Hi" />)
    fireEvent.click(screen.getByRole('button', { name: /Paylaş/i }))
    await act(async () => {
      fireEvent.click(screen.getByTestId('share-clipboard'))
    })
    expect(writeText).toHaveBeenCalledWith('Hi\nhttps://x.com/o/ABC')
    expect(screen.getByTestId('share-clipboard').textContent).toMatch(/Kopyalandı/i)
  })

  test('7) Codex P3 #3: Clipboard fail -> error alert', async () => {
    const writeText = vi
      .fn()
      .mockRejectedValue(new Error('Permission denied'))
    setNavigator({ clipboard: { writeText } as unknown as Clipboard })
    render(<ShareButton url="https://x.com/o/ABC" text="Hi" />)
    fireEvent.click(screen.getByRole('button', { name: /Paylaş/i }))
    await act(async () => {
      fireEvent.click(screen.getByTestId('share-clipboard'))
    })
    // Sessiz fail degil, role=alert ile feedback
    expect(screen.getByRole('alert').textContent).toMatch(/Kopyalanamadı/i)
  })

  test('8) Codex P3 #2: WhatsApp click sonrasi menu kapanir', () => {
    render(<ShareButton url="https://x.com/o/ABC" text="Hi" />)
    const btn = screen.getByRole('button', { name: /Paylaş/i })
    fireEvent.click(btn)
    expect(btn.getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(screen.getByTestId('share-whatsapp'))
    expect(btn.getAttribute('aria-expanded')).toBe('false')
  })

  test('9) Codex P3 #2: Esc tusu menuyu kapatir', () => {
    render(<ShareButton url="https://x.com/o/ABC" text="Hi" />)
    const btn = screen.getByRole('button', { name: /Paylaş/i })
    fireEvent.click(btn)
    expect(btn.getAttribute('aria-expanded')).toBe('true')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(btn.getAttribute('aria-expanded')).toBe('false')
  })

  test('10) Codex P3 #2: Outside click menuyu kapatir', () => {
    render(
      <div>
        <ShareButton url="https://x.com/o/ABC" text="Hi" />
        <button data-testid="outside">outside</button>
      </div>,
    )
    const btn = screen.getByRole('button', { name: /Paylaş/i })
    fireEvent.click(btn)
    expect(btn.getAttribute('aria-expanded')).toBe('true')
    fireEvent.mouseDown(screen.getByTestId('outside'))
    expect(btn.getAttribute('aria-expanded')).toBe('false')
  })

  test('11) Native share API varsa o kullanilir (success path)', async () => {
    const shareFn = vi.fn().mockResolvedValue(undefined)
    setNavigator({
      share: shareFn,
      clipboard: { writeText: vi.fn() } as unknown as Clipboard,
    })
    render(<ShareButton url="https://x.com/o/ABC" text="Native" />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Paylaş/i }))
    })
    expect(shareFn).toHaveBeenCalledWith({
      title: 'Bilge Arena',
      text: 'Native',
      url: 'https://x.com/o/ABC',
    })
  })

  test('12) Codex P3 #2: Native share iptal -> menu acilir', async () => {
    const shareFn = vi.fn().mockRejectedValue(new Error('AbortError'))
    setNavigator({
      share: shareFn,
      clipboard: { writeText: vi.fn() } as unknown as Clipboard,
    })
    render(<ShareButton url="https://x.com/o/ABC" text="Native" />)
    const btn = screen.getByRole('button', { name: /Paylaş/i })
    await act(async () => {
      fireEvent.click(btn)
    })
    // Native iptal edildi, menu fallback acilmis
    expect(btn.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByTestId('share-whatsapp')).toBeInTheDocument()
  })
})
