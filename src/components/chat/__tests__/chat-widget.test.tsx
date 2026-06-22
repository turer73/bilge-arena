/**
 * ChatWidget kapat butonu — Ensra raporu (2026-06-21): "Bilge Asistan ekranindan
 * cikilmiyor, kitliyor". Panel header'inda kapat (X) yoktu; tek-kapatma ayri FAB
 * mobilde panel arkasinda erisilemez kaliyordu. Header'a belirgin X eklendi.
 */

import { describe, test, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ChatWidget } from '../chat-widget'
import { useChatStore } from '@/stores/chat-store'

describe('ChatWidget kapat (X)', () => {
  beforeEach(() => {
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
})
