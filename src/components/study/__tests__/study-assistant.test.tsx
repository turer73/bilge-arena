/**
 * StudyAssistant — ders çalışma hub'ındaki inline Bilge Asistan (Faz 2).
 * chat-widget.test.tsx paritesi: temel render + gönderim akışı smoke testi.
 */

import { describe, test, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { StudyAssistant } from '../study-assistant'
import { useChatStore } from '@/stores/chat-store'

describe('StudyAssistant', () => {
  beforeEach(() => {
    // jsdom scrollIntoView desteklemez (ChatMessages mesaj-render'da cagiriyor)
    Element.prototype.scrollIntoView = vi.fn()
    useChatStore.getState().clearMessages()
    useChatStore.getState().setQuestionContext(null)
  })

  test('boş durumda başlık + karşılama metni render edilir (FAB/fixed-panel yok)', () => {
    render(<StudyAssistant />)
    expect(screen.getByText('BİLGE ASİSTAN')).toBeInTheDocument()
    expect(screen.getByText(/Soru çözümü, konu anlatımı/)).toBeInTheDocument()
  })

  test('mesaj gönderilince /api/chat çağrılır ve yanıt akışı store\'a yazılır', async () => {
    const encoder = new TextEncoder()
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      body: {
        getReader: () => {
          let sent = false
          return {
            read: async () => {
              if (sent) return { done: true, value: undefined }
              sent = true
              return { done: false, value: encoder.encode('Merhaba!') }
            },
          }
        },
      },
    })
    vi.stubGlobal('fetch', mockFetch)

    render(<StudyAssistant />)
    const textarea = screen.getByPlaceholderText('Sorunuzu yazin...')
    fireEvent.change(textarea, { target: { value: 'Asal sayı nedir?' } })
    fireEvent.click(screen.getByLabelText('Gonder'))

    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith('/api/chat', expect.objectContaining({
      method: 'POST',
    })))
    await waitFor(() => {
      expect(useChatStore.getState().messages.some((m) => m.role === 'assistant' && m.content === 'Merhaba!')).toBe(true)
    })

    vi.unstubAllGlobals()
  })
})
