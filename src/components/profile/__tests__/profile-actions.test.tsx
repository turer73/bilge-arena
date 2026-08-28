import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import { ProfileActions } from '../profile-actions'

describe('ProfileActions', () => {
  test('dar ekrana uygun kısa eylem etiketlerini ve hedefleri gösterir', () => {
    render(<ProfileActions onEdit={() => {}} />)

    expect(screen.getByRole('link', { name: 'Yanlışlarım' })).toHaveAttribute('href', '/arena/yanlislarim')
    expect(screen.getByRole('link', { name: 'Arkadaşlar' })).toHaveAttribute('href', '/arena/arkadaslar')
    expect(screen.getByRole('link', { name: 'Mağaza' })).toHaveAttribute('href', '/arena/magaza')
    expect(screen.getByRole('link', { name: 'Stüdyo' })).toHaveAttribute('href', '/arena/kisisellestir')
    expect(screen.getByRole('button', { name: 'Düzenle' })).toBeInTheDocument()
    expect(screen.queryByText('Kişiselleştir')).not.toBeInTheDocument()
  })

  test('düzenleme eylemini tetikler', () => {
    const onEdit = vi.fn()
    render(<ProfileActions onEdit={onEdit} />)

    fireEvent.click(screen.getByRole('button', { name: 'Düzenle' }))
    expect(onEdit).toHaveBeenCalledOnce()
  })
})
