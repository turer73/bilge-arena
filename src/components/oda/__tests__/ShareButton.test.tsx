/**
 * Bilge Arena Oda: ShareButton component tests
 * Sprint 2C Task 8 (Replay & Share)
 */

import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ShareButton } from '../ShareButton'

describe('ShareButton', () => {
  beforeEach(() => {
    // Native share fallback test icin navigator.share undefined
    Object.defineProperty(global, 'navigator', {
      value: {
        clipboard: {
          writeText: vi.fn().mockResolvedValue(undefined),
        },
      },
      writable: true,
      configurable: true,
    })
  })

  test('1) Initial render: Paylaş butonu gorulur', () => {
    render(<ShareButton url="https://example.com/oda/ABC123" text="Test" />)
    const btn = screen.getByRole('button', { name: /Paylaş/i })
    expect(btn).toBeInTheDocument()
  })

  test('2) Click sonrasi 4 secenek: clipboard, WhatsApp, Telegram, Twitter', () => {
    render(<ShareButton url="https://example.com/oda/ABC123" text="Bilge Arena" />)
    fireEvent.click(screen.getByRole('button', { name: /Paylaş/i }))
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

  test('5) Twitter link: twitter.com/intent/tweet', () => {
    render(<ShareButton url="https://x.com/o/ABC" text="Tweet" />)
    fireEvent.click(screen.getByRole('button', { name: /Paylaş/i }))
    const tw = screen.getByTestId('share-twitter')
    const href = tw.getAttribute('href')!
    expect(href).toMatch(/^https:\/\/twitter\.com\/intent\/tweet/)
    expect(href).toContain('text=' + encodeURIComponent('Tweet'))
  })

  test('6) Clipboard click: clipboard.writeText cagrilir, "Kopyalandı" gosterir', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(global.navigator, 'clipboard', {
      value: { writeText },
      writable: true,
      configurable: true,
    })
    render(<ShareButton url="https://x.com/o/ABC" text="Hi" />)
    fireEvent.click(screen.getByRole('button', { name: /Paylaş/i }))
    const copyBtn = screen.getByTestId('share-clipboard')
    fireEvent.click(copyBtn)
    expect(writeText).toHaveBeenCalledWith('Hi\nhttps://x.com/o/ABC')
    // setTimeout 2sn sonra reset, async cesidi
    await new Promise((r) => setTimeout(r, 0))
    expect(screen.getByTestId('share-clipboard').textContent).toMatch(/Kopyalandı/i)
  })

  test('7) Native share API varsa o kullanilir (mobile fallback)', async () => {
    const shareFn = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(global, 'navigator', {
      value: {
        share: shareFn,
        clipboard: { writeText: vi.fn() },
      },
      writable: true,
      configurable: true,
    })
    render(<ShareButton url="https://x.com/o/ABC" text="Native" />)
    fireEvent.click(screen.getByRole('button', { name: /Paylaş/i }))
    await new Promise((r) => setTimeout(r, 0))
    expect(shareFn).toHaveBeenCalledWith({
      title: 'Bilge Arena',
      text: 'Native',
      url: 'https://x.com/o/ABC',
    })
  })
})
