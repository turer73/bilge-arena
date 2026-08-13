import { afterEach, describe, test, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { StudyAssistant } from '../study-assistant'
import { useChatStore } from '@/stores/chat-store'

const oldBoardUiEnabled = process.env.NEXT_PUBLIC_BILGE_TAHTA_ENABLED
const trackBilgeBoardEvent = vi.hoisted(() => vi.fn())
vi.mock('@/lib/bilge-tahta/analytics', () => ({ trackBilgeBoardEvent }))

describe('StudyAssistant', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_BILGE_TAHTA_ENABLED = 'true'
    Element.prototype.scrollIntoView = vi.fn()
    useChatStore.getState().clearMessages()
    useChatStore.getState().setQuestionContext(null)
    trackBilgeBoardEvent.mockClear()
  })

  afterEach(() => {
    if (oldBoardUiEnabled === undefined) delete process.env.NEXT_PUBLIC_BILGE_TAHTA_ENABLED
    else process.env.NEXT_PUBLIC_BILGE_TAHTA_ENABLED = oldBoardUiEnabled
    vi.unstubAllGlobals()
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
    expect(screen.getByLabelText('Gonder')).toHaveAttribute('type', 'button')
  })

  test('konu anlatımı penceresindeki takip mesajları ayrıntılı modu korur', async () => {
    const encoder = new TextEncoder()
    const streamedResponse = (text: string) => ({
      ok: true,
      body: {
        getReader: () => {
          let sent = false
          return {
            read: async () => {
              if (sent) return { done: true, value: undefined }
              sent = true
              return { done: false, value: encoder.encode(text) }
            },
          }
        },
      },
    })
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(streamedResponse('Hangi konuyu anlatayım?'))
      .mockResolvedValueOnce(streamedResponse('Ayrıntılı mini ders'))
    vi.stubGlobal('fetch', mockFetch)

    render(<StudyAssistant initialRequest={{
      id: 'topic-request-1',
      prompt: 'Konu anlat',
      mode: 'topic_explanation',
    }} />)

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(useChatStore.getState().isLoading).toBe(false))
    fireEvent.change(screen.getByPlaceholderText('Sorunuzu yazin...'), {
      target: { value: 'Birinci dereceden denklemler' },
    })
    fireEvent.click(screen.getByLabelText('Gonder'))

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2))
    const requestBodies = mockFetch.mock.calls.map(([, init]) => JSON.parse(String(init.body)))
    expect(requestBodies).toEqual([
      expect.objectContaining({ mode: 'topic_explanation' }),
      expect.objectContaining({ mode: 'topic_explanation' }),
    ])
  })

  test('başarılı yanıtı seçili ders ve sınav bağlamıyla Bilge Tahta’da açar', async () => {
    const encoder = new TextEncoder()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      body: {
        getReader: () => {
          let sent = false
          return {
            read: async () => {
              if (sent) return { done: true, value: undefined }
              sent = true
              return { done: false, value: encoder.encode('Asal sayılar yalnız 1 ve kendisine bölünür.') }
            },
          }
        },
      },
    }))

    render(<StudyAssistant game="matematik" examRef="TYT" />)
    fireEvent.change(screen.getByPlaceholderText('Sorunuzu yazin...'), { target: { value: 'Asal sayı nedir?' } })
    fireEvent.click(screen.getByLabelText('Gonder'))
    const openButton = await screen.findByRole('button', { name: /Tahtada anlat/ })
    fireEvent.click(openButton)

    const dialog = screen.getByRole('dialog', { name: 'Asal sayı nedir?' })
    expect(within(dialog).getByText('Matematik · TYT')).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Yazıyı hemen göster' }))
    expect(within(dialog).getByTestId('bilge-tahta-text')).toHaveTextContent(/Asal sayılar/)
    expect(within(dialog).getByText(/Kaynak: Bilge Asistan yanıtı/)).toBeInTheDocument()
    expect(within(dialog).getByText('Doğrulanmış ders içeriği değildir')).toBeInTheDocument()
    expect(trackBilgeBoardEvent).toHaveBeenCalledWith('BilgeBoardOpened', {
      surface: 'study', game: 'matematik', entryPoint: 'study_assistant', examRef: 'TYT',
    })
    expect(trackBilgeBoardEvent).toHaveBeenCalledWith('BilgeBoardStageViewed', {
      surface: 'study', game: 'matematik', stage: 'concept', stepIndex: 0,
    })

    fireEvent.click(within(dialog).getByRole('button', { name: 'Ders Çalış’a dön' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText('Asal sayılar yalnız 1 ve kendisine bölünür.')).toBeInTheDocument()
  })

  test('rate-limit yanıtını konu anlatımı gibi tahtaya taşımaz', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ error: 'Biraz bekle.' }),
    }))
    render(<StudyAssistant game="matematik" examRef="TYT" />)
    fireEvent.change(screen.getByPlaceholderText('Sorunuzu yazin...'), { target: { value: 'Konu anlat' } })
    fireEvent.click(screen.getByLabelText('Gonder'))
    expect(await screen.findByText(/Çok fazla mesaj gönderdin/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Tahtada anlat/ })).not.toBeInTheDocument()
  })

  test('Bilge Tahta kill switch kapalıysa başarılı yanıtta bile tetikleyici göstermez', async () => {
    process.env.NEXT_PUBLIC_BILGE_TAHTA_ENABLED = 'false'
    const encoder = new TextEncoder()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      body: { getReader: () => ({
        read: vi.fn()
          .mockResolvedValueOnce({ done: false, value: encoder.encode('Yanıt') })
          .mockResolvedValueOnce({ done: true, value: undefined }),
      }) },
    }))
    render(<StudyAssistant />)
    fireEvent.change(screen.getByPlaceholderText('Sorunuzu yazin...'), { target: { value: 'Konu anlat' } })
    fireEvent.click(screen.getByLabelText('Gonder'))
    await waitFor(() => expect(useChatStore.getState().isLoading).toBe(false))
    expect(screen.queryByRole('button', { name: /Tahtada anlat/ })).not.toBeInTheDocument()
  })
})
