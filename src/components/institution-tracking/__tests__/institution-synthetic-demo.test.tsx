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

      expect(
        screen.getByText(
          /Gerçek hesap, öğrenci verisi veya production yazması kullanılmaz/
        )
      ).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Bugünkü akademik görünüm' })).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Öğretmen takip göstergeleri' })).toBeInTheDocument()
      expect(screen.getByText('Henüz değerlendirilemez')).toBeInTheDocument()
      expect(screen.getByText(/En az 8 uygun öğrenci ve .* haftalık karşılaştırmalı kanıt gerekir/)).toBeInTheDocument()
      expect(screen.queryByText('Sede Dilara Ürer')).not.toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: /Sınıf çalışma alanına git/i }))
      expect(screen.getAllByText('Sede Dilara Ürer')).toHaveLength(2)
      expect(screen.getByRole('complementary')).toHaveClass('min-w-0')
      expect(container.querySelector('main')).toHaveClass('min-w-0')
      expect(screen.getByRole('button', { name: 'Kurum genel bakışına dön' })).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: 'Takip aç' }))
      await user.click(screen.getByRole('button', { name: 'Taslak oluştur' }))
      expect(screen.getByText('İnceleme bekliyor')).toBeInTheDocument()
      expect(screen.getByText(/kontrol edilmeden öğrenciye açılmaz/i)).toBeInTheDocument()
      expect(screen.queryByText(/yayın onayı tamamlandı/i)).not.toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Taslağı inceledim' }))
      expect(screen.getByText('İncelendi · yayınlanmadı')).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Yayınla' }))
      await user.click(screen.getByRole('button', { name: 'Rapor oluştur' }))

      expect(
        screen.getByText('✓ Öğrenme desteği takibi açıldı.')
      ).toBeInTheDocument()
      expect(
        screen.getByText('✓ Öğretmen incelemesi ve yayın onayı tamamlandı.')
      ).toBeInTheDocument()
      expect(
        screen.getByText('✓ Kimlik-minimal durum raporu snapshotı hazırlandı.')
      ).toBeInTheDocument()
      expect(container.textContent).not.toMatch(/[0-9a-f]{32}/)
    }
  )
})
