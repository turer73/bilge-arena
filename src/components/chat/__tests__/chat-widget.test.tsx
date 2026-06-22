/**
 * ChatWidget kapat butonu — Ensra raporu (2026-06-21): "Bilge Asistan ekranindan
 * cikilmiyor, kitliyor". Panel header'inda kapat (X) yoktu; tek-kapatma ayri FAB
 * mobilde panel arkasinda erisilemez kaliyordu. Header'a belirgin X eklendi.
 */

import { describe, test, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ChatWidget } from '../chat-widget'
import { useChatStore } from '@/stores/chat-store'

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
