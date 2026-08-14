import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { InstitutionSyntheticDemo } from '../institution-synthetic-demo'

describe('InstitutionSyntheticDemo', () => {
  it.each([320, 375, 390])(
    'keeps the four-student no-write demo usable at %ipx',
    async (width) => {
      Object.defineProperty(window, 'innerWidth', {
        configurable: true,
        value: width,
      })
      const user = userEvent.setup()
      const { container } = render(<InstitutionSyntheticDemo />)

      expect(screen.getAllByText('Sede Dilara Ürer')).toHaveLength(2)
      expect(screen.getByRole('complementary')).toHaveClass('min-w-0')
      expect(container.querySelector('main')).toHaveClass('min-w-0')
      expect(
        screen.getByText(
          /Gerçek hesap, öğrenci verisi veya production yazması kullanılmaz/
        )
      ).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: 'Takip aç' }))
      await user.click(screen.getByRole('button', { name: 'Program hazırla' }))
      await user.click(screen.getByRole('button', { name: 'Rapor oluştur' }))

      expect(
        screen.getByText('✓ Öğrenme desteği takibi açıldı.')
      ).toBeInTheDocument()
      expect(
        screen.getByText('✓ Öğretmen onaylı haftalık program hazırlandı.')
      ).toBeInTheDocument()
      expect(
        screen.getByText('✓ Kimlik-minimal durum raporu snapshotı hazırlandı.')
      ).toBeInTheDocument()
      expect(container.textContent).not.toMatch(/[0-9a-f]{32}/)
    }
  )
})
