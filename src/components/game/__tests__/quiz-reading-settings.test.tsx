import { StrictMode } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QuizReadingSettings } from '../quiz-reading-settings'

beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value: function(this: HTMLDialogElement) { this.setAttribute('open', '') },
  })
})

describe('QuizReadingSettings', () => {
  it('notifies the timer on open, dismiss and unmount', () => {
    const onOpenChange = vi.fn()
    const { unmount } = render(<StrictMode><QuizReadingSettings fontSize="normal" onChange={vi.fn()}
      onOpenChange={onOpenChange} timerBehavior="paused" /></StrictMode>)
    fireEvent.click(screen.getByRole('button', { name: 'Yazı boyutu ve ses ayarları' }))
    expect(onOpenChange).toHaveBeenLastCalledWith(true)
    expect(screen.getByText(/soru süresi duraklatılır/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Pencereyi kapat' }))
    expect(onOpenChange).toHaveBeenLastCalledWith(false)
    fireEvent.click(screen.getByRole('button', { name: 'Yazı boyutu ve ses ayarları' }))
    unmount()
    expect(onOpenChange).toHaveBeenLastCalledWith(false)
  })

  it('clearly explains that exam time continues', () => {
    render(<QuizReadingSettings fontSize="normal" onChange={vi.fn()} timerBehavior="continues" showSound={false} />)
    fireEvent.click(screen.getByRole('button', { name: 'Yazı boyutu ayarları' }))
    expect(screen.getByText(/Sınav süresi bu pencere açıkken de devam eder/)).toBeInTheDocument()
    expect(screen.queryByText(/soru süresi duraklatılır/)).not.toBeInTheDocument()
  })
})
