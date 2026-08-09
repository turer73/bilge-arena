import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PaperPackPrintView } from '../paper-pack-print-view'
import { PaperScratchpad } from '../paper-scratchpad'
import type { PaperPackView } from '@/lib/paper-mode/server-contract'

const mocks = vi.hoisted(() => ({
  toCanvas: vi.fn((_canvas: HTMLCanvasElement, _text: string) => Promise.resolve()),
}))
vi.mock('qrcode', () => ({ default: { toCanvas: mocks.toCanvas } }))
vi.mock('next/link', () => ({ default: ({ href, children, ...props }: React.ComponentProps<'a'>) => <a href={String(href)} {...props}>{children}</a> }))

const pack: PaperPackView = {
  packId: '11111111-2222-4333-8444-555555555555',
  status: 'active',
  createdAt: '2026-08-09T10:00:00.000+00:00',
  expiresAt: '2026-08-16T10:00:00.000+00:00',
  submittedAt: null,
  plan: { game: 'matematik', planDate: '2026-08-09', examRef: 'TYT' },
  items: [{
    position: 1,
    question: {
      id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      game: 'matematik',
      category: 'Temel Matematik',
      topic: 'Sayılar',
      difficulty: 2,
      content: { question: '2 + 2 kaçtır?', options: ['3', '4', '5'] },
    },
    selectedOption: null,
    isCorrect: null,
    correctOption: null,
  }],
  summary: null,
  mastery: { source: 'paper', weight: 0.5 },
  reward: { xp: 0, coins: 0, socialPoints: 0 },
  privacy: { ownerOnly: true, privateCacheDisabled: true },
}

describe('paper print and local scratchpad', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    document.body.classList.remove('paper-print-page')
    vi.restoreAllMocks()
  })

  it('renders questions, optical form, local QR URL, and print action without answer leakage', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined)
    const { unmount } = render(<PaperPackPrintView pack={pack} />)
    expect(screen.getByRole('heading', { name: 'Kağıt çalışma paketi' })).toBeInTheDocument()
    expect(screen.getByText('2 + 2 kaçtır?')).toBeInTheDocument()
    expect(screen.getByRole('table', { name: /optik cevap formu/i })).toBeInTheDocument()
    expect(screen.queryByText(/^Cevap:/)).not.toBeInTheDocument()
    expect(document.body).toHaveClass('paper-print-page')
    await waitFor(() => expect(mocks.toCanvas).toHaveBeenCalled())
    expect(mocks.toCanvas.mock.calls[0][1]).toBe(
      `http://localhost:3000/arena/kagit/${pack.packId}/cevap`,
    )
    fireEvent.click(screen.getByRole('button', { name: /Yazdır \/ PDF kaydet/i }))
    expect(print).toHaveBeenCalledTimes(1)
    unmount()
    expect(document.body).not.toHaveClass('paper-print-page')
  })

  it('draws and clears only the in-memory canvas', () => {
    const context = {
      scale: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      clearRect: vi.fn(),
      lineCap: '',
      lineJoin: '',
      lineWidth: 0,
      strokeStyle: '',
    }
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D)
    render(<PaperScratchpad />)
    const canvas = screen.getByRole('img', { name: /yerel karalama alanı/i })
    fireEvent.pointerDown(canvas, { pointerId: 1, pointerType: 'mouse', button: 0, clientX: 10, clientY: 10 })
    fireEvent.pointerMove(canvas, { pointerId: 1, pointerType: 'mouse', clientX: 30, clientY: 30 })
    fireEvent.pointerUp(canvas, { pointerId: 1, pointerType: 'mouse' })
    expect(context.stroke).toHaveBeenCalled()

    const clear = screen.getByRole('button', { name: 'Temizle' })
    expect(clear).toBeEnabled()
    fireEvent.click(clear)
    expect(context.clearRect).toHaveBeenCalled()
    expect(clear).toBeDisabled()
  })
})
