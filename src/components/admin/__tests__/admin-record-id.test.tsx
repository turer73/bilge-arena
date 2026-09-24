import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AdminRecordId, shortAdminId } from '../admin-record-id'

describe('AdminRecordId', () => {
  it('uzun kimliği kısaltır ve tam değerini kopyalar', async () => {
    const id = '11111111-1111-4111-8111-111111111111'
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })

    expect(shortAdminId(id)).toBe('11111111…1111')
    const view = render(<AdminRecordId label="Soru" id={id} />)
    expect(screen.getByTitle(id)).toHaveTextContent('11111111…1111')
    fireEvent.click(screen.getByRole('button', { name: 'Soru kimliğini kopyala' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(id))
    expect(screen.getByText('Kopyalandı')).toBeInTheDocument()
    view.rerender(<AdminRecordId label="Soru" id="22222222-2222-4222-8222-222222222222" />)
    expect(screen.getByRole('button', { name: 'Soru kimliğini kopyala' })).toHaveTextContent('Kopyala')
  })
})
