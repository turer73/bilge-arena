/**
 * Bilge Arena: SubmitQuestionClient — UGC gönderim formu.
 * Misafir CTA, başarılı gönderim akışı, API hatası, şık ekle/çıkar,
 * ders değişiminde kategori sıfırlama.
 */

import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const authState = vi.hoisted(() => ({ value: { user: { id: 'u1' } as { id: string } | null } }))
vi.mock('@/stores/auth-store', () => ({ useAuthStore: () => authState.value }))

import { SubmitQuestionClient } from '../submit-client'

const fetchMock = vi.fn()
global.fetch = fetchMock as unknown as typeof fetch

function fillValidForm() {
  fireEvent.change(screen.getByPlaceholderText('Soruyu buraya yaz…'), {
    target: { value: 'Bir sayının %20 fazlası 60 ise bu sayı kaçtır?' },
  })
  ;['40', '50', '48', '52'].forEach((v, i) => {
    fireEvent.change(screen.getByPlaceholderText(`${String.fromCharCode(65 + i)} şıkkı`), {
      target: { value: v },
    })
  })
  fireEvent.click(screen.getByRole('radio', { name: 'Doğru cevap B' }))
}

beforeEach(() => {
  vi.clearAllMocks()
  authState.value = { user: { id: 'u1' } }
  fetchMock.mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ status: 'pending', id: 'sub-1' }),
  })
})

describe('SubmitQuestionClient', () => {
  test('misafir: form yerine giriş CTA', () => {
    authState.value = { user: null }
    render(<SubmitQuestionClient />)
    expect(screen.getByText(/giriş yapman gerekiyor/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Giriş Yap' })).toHaveAttribute(
      'href',
      '/giris?redirect=/arena/soru-gonder',
    )
    expect(screen.queryByPlaceholderText('Soruyu buraya yaz…')).not.toBeInTheDocument()
  })

  test('başarılı gönderim: POST body doğru + teşekkür ekranı + yeni-soru reset', async () => {
    render(<SubmitQuestionClient />)
    fillValidForm()
    fireEvent.click(screen.getByRole('button', { name: 'Moderasyona Gönder' }))

    await waitFor(() => expect(screen.getByText(/moderasyon kuyruğuna alındı/)).toBeInTheDocument())
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body).toMatchObject({ game: 'matematik', answer: 1, options: ['40', '50', '48', '52'] })

    fireEvent.click(screen.getByRole('button', { name: 'Yeni Soru Gönder' }))
    expect(screen.getByPlaceholderText('Soruyu buraya yaz…')).toHaveValue('')
  })

  test('API hatası: mesaj gösterilir, form kaybolmaz', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: 'Şıklar birbirinden farklı olmalı' }),
    })
    render(<SubmitQuestionClient />)
    fillValidForm()
    fireEvent.click(screen.getByRole('button', { name: 'Moderasyona Gönder' }))

    await waitFor(() =>
      expect(screen.getByText('Şıklar birbirinden farklı olmalı')).toBeInTheDocument(),
    )
    expect(screen.getByPlaceholderText('Soruyu buraya yaz…')).toBeInTheDocument()
  })

  test('5. şık ekle/kaldır; kaldırınca answer=4 sıfırlanır', () => {
    render(<SubmitQuestionClient />)
    fireEvent.click(screen.getByRole('button', { name: '+ 5. şık ekle' }))
    expect(screen.getByPlaceholderText('E şıkkı')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('radio', { name: 'Doğru cevap E' }))
    fireEvent.click(screen.getByRole('button', { name: '− 5. şıkkı kaldır' }))
    expect(screen.queryByPlaceholderText('E şıkkı')).not.toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Doğru cevap A' })).toBeChecked()
  })

  test('ders değişince kategori o dersin ilk kategorisine döner', () => {
    render(<SubmitQuestionClient />)
    const dersSelect = screen.getAllByRole('combobox')[0]
    const konuSelect = screen.getAllByRole('combobox')[1]
    fireEvent.change(dersSelect, { target: { value: 'turkce' } })
    expect((konuSelect as HTMLSelectElement).value).toBe('paragraf')
  })

  test('bağlantı hatası: kullanıcı dostu mesaj', async () => {
    fetchMock.mockRejectedValue(new Error('ağ'))
    render(<SubmitQuestionClient />)
    fillValidForm()
    fireEvent.click(screen.getByRole('button', { name: 'Moderasyona Gönder' }))
    await waitFor(() => expect(screen.getByText(/Bağlantı hatası/)).toBeInTheDocument())
  })
})
