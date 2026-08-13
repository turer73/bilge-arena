import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../study-assistant', () => ({
  StudyAssistant: () => (
    <div>
      <button type="button">İlk içerik düğmesi</button>
      <button type="button">Son içerik düğmesi</button>
    </div>
  ),
}))

import { StudyAssistantDialog } from '../study-assistant-dialog'

describe('StudyAssistantDialog', () => {
  it('locks scrolling, traps focus, closes on Escape and returns focus', async () => {
    const onOpenChange = vi.fn()
    const opener = document.createElement('button')
    opener.textContent = 'Asistanı açan düğme'
    document.body.appendChild(opener)
    opener.focus()

    const { unmount } = render(
      <StudyAssistantDialog
        open
        onOpenChange={onOpenChange}
        game="matematik"
        examRef="TYT"
        initialRequest={null}
      />,
    )

    const dialog = screen.getByRole('dialog', { name: 'Bilge Asistan' })
    const close = screen.getByRole('button', { name: "Bilge Asistan'ı kapat" })
    await waitFor(() => expect(close).toHaveFocus())
    expect(document.body.style.overflow).toBe('hidden')

    close.focus()
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(screen.getByRole('button', { name: 'Son içerik düğmesi' })).toHaveFocus()
    expect(dialog).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onOpenChange).toHaveBeenCalledWith(false)
    unmount()
    expect(document.body.style.overflow).toBe('')
    expect(opener).toHaveFocus()
    opener.remove()
  })
})
