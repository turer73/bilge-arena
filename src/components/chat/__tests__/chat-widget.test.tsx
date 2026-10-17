/**
 * ChatWidget kapat butonu — Ensra raporu (2026-06-21): "Bilge Asistan ekranindan
 * cikilmiyor, kitliyor". Panel header'inda kapat (X) yoktu; tek-kapatma ayri FAB
 * mobilde panel arkasinda erisilemez kaliyordu. Header'a belirgin X eklendi.
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ChatWidget } from '../chat-widget'
import { useChatStore } from '@/stores/chat-store'
import { CHAT_TURN_SIGNATURE_HEADER } from '@/lib/chat/client-history'

describe('ChatWidget kapat (X)', () => {
  beforeEach(() => {
    // jsdom scrollIntoView desteklemez (ChatMessages mesaj-render'da cagiriyor)
    Element.prototype.scrollIntoView = vi.fn()
    useChatStore.getState().clearMessages()
    useChatStore.getState().setOpen(false)
  })

  test('panel acikken header X butonu paneli kapatir', () => {
    useChatStore.getState().setOpen(true)
    render(<ChatWidget />)

    // header'daki belirgin kapat (X) butonu — benzersiz (FAB'in "Chat kapat"
    // label'indan + ChatMessages bos-durum "Bilge Asistan" basligindan ayri)
    const closeBtn = screen.getByLabelText('Bilge Asistan\'ı kapat')
    expect(closeBtn).toBeTruthy()
    fireEvent.click(closeBtn)

    // store kapandi + panel (ve icindeki kapat butonu) DOM'dan kalkti
    expect(useChatStore.getState().isOpen).toBe(false)
    expect(screen.queryByLabelText('Bilge Asistan\'ı kapat')).toBeNull()
  })

  test('kapat butonu sohbeti temizle (cop) butonundan AYRI bir kontroldur', () => {
    useChatStore.getState().setOpen(true)
    render(<ChatWidget />)
    // iki ayri kontrol: temizle (title) + kapat (aria-label)
    expect(screen.getByTitle('Sohbeti temizle')).toBeTruthy()
    expect(screen.getByLabelText('Bilge Asistan\'ı kapat')).toBeTruthy()
  })

  test('cop butonu sohbeti temizler (kapatmaz)', () => {
    useChatStore.getState().setOpen(true)
    useChatStore.getState().addMessage('user', 'merhaba')
    render(<ChatWidget />)
    expect(useChatStore.getState().messages.length).toBeGreaterThan(0)
    fireEvent.click(screen.getByTitle('Sohbeti temizle'))
    expect(useChatStore.getState().messages.length).toBe(0)  // temizlendi
    expect(useChatStore.getState().isOpen).toBe(true)  // panel acik kaldi (temizle != kapat)
  })
})

describe('ChatWidget gecmis ve kisisel bilgi uyarisi', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn()
    useChatStore.getState().clearMessages()
    useChatStore.getState().setOpen(true)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  test('mesaj kutusunun altinda kisisel bilgi uyarisi gorunur ve kutuya baglidir', () => {
    render(<ChatWidget />)
    const notice = screen.getByText(/Kişisel bilgilerini .* yazma\./)
    expect(screen.getByPlaceholderText('Sorunuzu yazin...')).toHaveAttribute('aria-describedby', notice.id)
  })

  test('sunucunun imzasi saklanir ve sonraki istekte asistan turuyla geri gider; hata metni gitmez', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(new Response('Asal sayi 1 ve kendisine bolunur.', {
        headers: { [CHAT_TURN_SIGNATURE_HEADER]: 'v1.1.imza' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'AI servisi su anda yanit veremiyor.' }), { status: 502 }))
      .mockResolvedValueOnce(new Response('Ornek: 7.'))
    vi.stubGlobal('fetch', mockFetch)
    render(<ChatWidget />)

    const send = async (text: string, calls: number) => {
      fireEvent.change(screen.getByPlaceholderText('Sorunuzu yazin...'), { target: { value: text } })
      fireEvent.click(screen.getByLabelText('Gonder'))
      await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(calls))
      await waitFor(() => expect(useChatStore.getState().isLoading).toBe(false))
    }
    await send('Asal sayi nedir?', 1)
    await send('Tekrar anlat', 2)
    await send('Ornek ver', 3)

    const lastBody = JSON.parse(String((mockFetch.mock.calls[2] as [string, RequestInit])[1].body))
    expect(lastBody).not.toHaveProperty('questionContext')
    expect(lastBody.messages).toEqual([
      { role: 'user', content: 'Asal sayi nedir?' },
      { role: 'assistant', content: 'Asal sayi 1 ve kendisine bolunur.', signature: 'v1.1.imza' },
      { role: 'user', content: 'Tekrar anlat' },
      { role: 'user', content: 'Ornek ver' },
    ])
  })
})
