import { describe, test, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { StudyAssistant } from '../study-assistant'
import { useChatStore } from '@/stores/chat-store'

describe('StudyAssistant', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn()
    useChatStore.getState().clearMessages()
    useChatStore.getState().setQuestionContext(null)
  })

  test('bağımsız kullanımda başlık ve karşılama metni render edilir', () => {
    render(<StudyAssistant />)
    expect(screen.getByRole('heading', { name: 'BİLGE ASİSTAN' })).toBeInTheDocument()
    expect(screen.getByText(/Soru çözümü, konu anlatımı/)).toBeInTheDocument()
  })

  test('embedded kullanımda dış kabuğu tekrar çizmez', () => {
    render(<StudyAssistant embedded />)
    expect(screen.queryByRole('heading', { name: 'BİLGE ASİSTAN' })).not.toBeInTheDocument()
    expect(screen.getByText(/Soru çözümü, konu anlatımı/)).toBeInTheDocument()
  })

  test('mesaj gönderilince /api/chat çağrılır ve akış store’a yazılır', async () => {
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
    fireEvent.change(screen.getByPlaceholderText('Sorunuzu yazin...'), { target: { value: 'Asal sayı nedir?' } })
    fireEvent.click(screen.getByLabelText('Gonder'))

    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith('/api/chat', expect.objectContaining({ method: 'POST' })))
    await waitFor(() => {
      expect(useChatStore.getState().messages.some((message) => (
        message.role === 'assistant' && message.content === 'Merhaba!'
      ))).toBe(true)
    })

    vi.unstubAllGlobals()
  })
})
