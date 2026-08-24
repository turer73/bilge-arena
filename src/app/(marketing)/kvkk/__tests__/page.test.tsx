import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import KVKKPage from '../page'

describe('/kvkk', () => {
  it('16 Mayis calismasini yetkilendirilmis ic pentest olarak siniflandirir', () => {
    render(<KVKKPage />)

    expect(
      screen.getByText(/yetkilendirilmiş ekip tarafından yürütülen kontrollü bir iç/u)
    ).toBeInTheDocument()
    expect(screen.getByText(/yetkisiz üçüncü kişiler tarafından elde edildiğine/u)).toBeInTheDocument()
    expect(screen.getByText(/dış veri ihlali olarak sınıflandırılmamıştır/u)).toBeInTheDocument()
    expect(
      screen.queryByText(/üçüncü bir şahıs tarafından izinsiz okundu/u)
    ).not.toBeInTheDocument()
  })

  it('Kurul ve ilgili kisi bildirim surelerini ayri ifade eder', () => {
    render(<KVKKPage />)

    expect(screen.getByText(/Kurulu'na en geç 72 saat içinde/u)).toBeInTheDocument()
    expect(screen.getByText(/ilgili kişilere makul olan en kısa süre içinde/u)).toBeInTheDocument()
  })
})
