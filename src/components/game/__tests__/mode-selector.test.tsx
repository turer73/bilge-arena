import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ModeSelector } from '../mode-selector'

function ControlledSelector({ selectedMode = 'classic' }: { selectedMode?: string }) {
  const [showAll, setShowAll] = useState(false)

  return (
    <ModeSelector
      selectedMode={selectedMode}
      onSelect={vi.fn()}
      showAll={showAll}
      onShowAllChange={setShowAll}
    />
  )
}

describe('ModeSelector', () => {
  it('varsayılan görünümde üç ana modu gösterir', () => {
    render(<ControlledSelector />)

    expect(screen.getByRole('button', { name: /Klasik/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Deneme Sınavı/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Pratik/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Blitz:/ })).not.toBeInTheDocument()
  })

  it('ikincil modları kullanıcının isteğiyle açar', () => {
    render(<ControlledSelector />)

    fireEvent.click(screen.getByRole('button', { name: /Blitz, Maraton ve Boss/ }))

    expect(screen.getByRole('button', { name: /^Blitz:/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Maraton:/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Boss:/ })).toBeInTheDocument()
  })

  it('seçili ikincil modu daraltılmış görünümde kaybetmez', () => {
    render(<ControlledSelector selectedMode="boss" />)

    expect(screen.getByRole('button', { name: /^Boss:/ })).toHaveAttribute('aria-pressed', 'true')
  })

  it('mod seçimini tam QuizMode nesnesiyle bildirir', () => {
    const onSelect = vi.fn()
    render(
      <ModeSelector
        selectedMode="classic"
        onSelect={onSelect}
        showAll={false}
        onShowAllChange={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /Pratik/ }))

    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'practice' }))
  })
})
