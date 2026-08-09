import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PaperPackAnswerView } from '../paper-pack-answer-view'
import { usePaperPack } from '@/lib/hooks/use-paper-pack'
import type { PaperPackView } from '@/lib/paper-mode/server-contract'

vi.mock('@/lib/hooks/use-paper-pack', () => ({ usePaperPack: vi.fn() }))
vi.mock('next/link', () => ({ default: ({ href, children, ...props }: React.ComponentProps<'a'>) => <a href={String(href)} {...props}>{children}</a> }))
vi.mock('../paper-scratchpad', () => ({ PaperScratchpad: () => <div data-testid="scratchpad">local scratchpad</div> }))

const usePaperPackMock = vi.mocked(usePaperPack)
const submit = vi.fn()
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
      category: null,
      topic: 'Sayılar',
      difficulty: 2,
      content: { question: '2 + 2 kaçtır?', options: ['3', '4'] },
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

describe('PaperPackAnswerView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    submit.mockResolvedValue(true)
    usePaperPackMock.mockReturnValue({
      pack,
      loading: false,
      submitting: false,
      error: null,
      refresh: vi.fn(),
      submit,
    })
  })

  it('uses native radio groups, includes blank, and submits every position', async () => {
    render(<PaperPackAnswerView packId={pack.packId} />)
    expect(screen.getByRole('radio', { name: /Boş bırak/i })).toBeChecked()
    fireEvent.click(screen.getByRole('radio', { name: /B\. 4/i }))
    expect(screen.getByText(/1\/1/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Cevapları notlandır/i }))
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1))
    expect(submit.mock.calls[0][0]).toEqual({
      requestId: expect.any(String),
      answers: [{ position: 1, selectedOption: 1 }],
    })
    expect(screen.getByTestId('scratchpad')).toBeInTheDocument()
  })

  it('renders canonical submitted grading and removes mutation controls', () => {
    usePaperPackMock.mockReturnValue({
      pack: {
        ...pack,
        status: 'submitted',
        submittedAt: '2026-08-09T11:00:00.000+00:00',
        items: [{ ...pack.items[0], selectedOption: 0, isCorrect: false, correctOption: 1 }],
        summary: { answeredCount: 1, correctCount: 0, scorePercent: 0 },
      },
      loading: false,
      submitting: false,
      error: null,
      refresh: vi.fn(),
      submit,
    })
    render(<PaperPackAnswerView packId={pack.packId} />)
    expect(screen.getByText(/Yanlış · Doğru cevap B/)).toBeInTheDocument()
    expect(screen.getByText('%0')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /notlandır/i })).not.toBeInTheDocument()
    expect(screen.queryByTestId('scratchpad')).not.toBeInTheDocument()
  })
})
