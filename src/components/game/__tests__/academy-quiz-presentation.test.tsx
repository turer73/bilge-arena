import { describe, expect, test, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { OptionButton } from '../option-button'

describe('Academy option presentation', () => {
  test('görsel durum seçimi mevcut tek cevap işleyicisine iletir', () => {
    const answer = vi.fn()
    const { rerender } = render(<OptionButton index={0} text="12" state="idle" onClick={answer} />)
    fireEvent.click(screen.getByRole('button', { name: 'A seçeneği: 12' }))
    expect(answer).toHaveBeenCalledOnce()
    rerender(<OptionButton index={0} text="12" state="correct" onClick={answer} />)
    const button = screen.getByRole('button', { name: 'A seçeneği: 12 Doğru cevap.' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('data-quiz-option', 'correct')
    fireEvent.click(button)
    expect(answer).toHaveBeenCalledOnce()
  })

  test.each(['wrong', 'dim', 'selected'] as const)('%s durumunda şık yeniden cevaplanamaz', (state) => {
    const answer = vi.fn()
    render(<OptionButton index={1} text="Uzun seçenek metni" state={state} onClick={answer} />)
    const button = screen.getByRole('button')
    expect(button).toHaveAttribute('data-quiz-option', state)
    fireEvent.click(button)
    expect(answer).not.toHaveBeenCalled()
    expect(screen.getByText('Uzun seçenek metni')).toBeVisible()
  })
})
