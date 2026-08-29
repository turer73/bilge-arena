import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import IletisimPage from '../page'

describe('iletişim sayfası kurumsal kapsamı', () => {
  test('bireysel ücretsiz başlangıç ile davetli kurum canary’sini ayırır', () => {
    render(<IletisimPage />)

    expect(screen.getByText(/bireysel öğrenci başlangıcı ücretsizdir/i)).toBeVisible()
    expect(screen.getByText(/erişim otomatik açılmaz/i)).toBeVisible()
    expect(document.getElementById('kurumsal-pilot')).toBeInTheDocument()
  })
})
