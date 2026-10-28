import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { OptionButton } from '../option-button'

describe('OptionButton submission lock', () => {
  it('announces a busy selected option without changing its accessible answer text', () => {
    render(<OptionButton index={0} text="Birinci seçenek" state="selected" onClick={vi.fn()} disabled pending />)
    expect(screen.getByRole('button', { name: /Birinci seçenek.*Seçildi/ })).toHaveAttribute('aria-busy', 'true')
  })
  it('keeps the option readable but prevents interaction while another answer is pending', () => {
    const onClick = vi.fn()
    render(<OptionButton index={0} text="Birinci seçenek" state="idle" onClick={onClick} disabled />)
    const option = screen.getByRole('button', { name: /Birinci seçenek/ })
    expect(option).toBeDisabled()
    expect(option).toHaveTextContent('Birinci seçenek')
    fireEvent.click(option)
    expect(onClick).not.toHaveBeenCalled()
  })
})
