'use client'

import { useCallback } from 'react'
import { useChatStore } from '@/stores/chat-store'
import { ChatMessages } from './chat-messages'
import { ChatInput } from './chat-input'

export function ChatWidget() {
  const { messages, isOpen, isLoading, questionContext, toggleOpen, addMessage, updateLastAssistant, setLoading } = useChatStore()

  const handleSend = useCallback(async (text: string) => {
    addMessage('user', text)
    setLoading(true)

    // Placeholder assistant mesaji ekle
    addMessage('assistant', '')

    try {
      const apiMessages = [
        ...messages.map((m) => ({ role: m.role, content: m.content })),
        { role: 'user' as const, content: text },
      ]

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages, questionContext }),
      })

      if (!res.ok) {
        let errorMsg = 'Üzgünüm, bir hata oluştu. Lütfen tekrar deneyin.'
        if (res.status === 401) {
          errorMsg = 'Bu özelliği kullanmak için giriş yapmanız gerekiyor. 🔑'
        } else if (res.status === 429) {
          errorMsg = 'Çok fazla mesaj gönderdiniz. Biraz bekleyip tekrar deneyin. ⏳'
        } else {
          try {
            const errBody = await res.json()
            errorMsg = errBody.error || errorMsg
          } catch { /* JSON parse hatasi — varsayilan mesaji kullan */ }
        }
        updateLastAssistant(errorMsg)
        setLoading(false)
        return
      }

      // Streaming text response okuma
      const reader = res.body?.getReader()
      const decoder = new TextDecoder()
      let fullText = ''

      if (reader) {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          const chunk = decoder.decode(value, { stream: true })
          fullText += chunk
          updateLastAssistant(fullText)
        }
      }

      if (!fullText) {
        updateLastAssistant('Cevap alınamadı. Lütfen tekrar deneyin.')
      }
    } catch {
      updateLastAssistant('Bağlantı hatası. İnternet bağlantınızı kontrol edin.')
    } finally {
      setLoading(false)
    }
  }, [messages, questionContext, addMessage, updateLastAssistant, setLoading])

  return (
    <>
      {/* FAB butonu */}
      <button
        onClick={toggleOpen}
        className={`fixed bottom-4 right-3 sm:bottom-5 sm:right-5 z-50 flex h-11 w-11 sm:h-12 sm:w-12 items-center justify-center rounded-full shadow-lg transition-all hover:scale-110 ${
          isOpen
            ? 'bg-[var(--surface)] text-[var(--text-sub)] border border-[var(--border)]'
            : 'bg-[var(--focus)] text-white'
        }`}
        aria-label={isOpen ? 'Chat kapat' : 'Bilge Asistan'}
      >
        {isOpen ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        ) : (
          <span className="text-xl">🦉</span>
        )}
      </button>

      {/* Chat paneli */}
      {isOpen && (
        <div className="fixed bottom-20 right-2 sm:right-5 z-50 flex h-[calc(100dvh-120px)] max-h-[460px] w-[calc(100vw-16px)] sm:w-[340px] flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg)] shadow-2xl animate-fadeUp">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface)] px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">🦉</span>
              <div>
                <div className="text-xs font-bold">Bilge Asistan</div>
                <div className="text-[9px] text-[var(--growth)]">Cevrimici</div>
              </div>
            </div>
            <button
              onClick={() => useChatStore.getState().clearMessages()}
              className="rounded-lg px-2 py-1 text-[10px] text-[var(--text-sub)] transition-colors hover:bg-[var(--card)] hover:text-[var(--text)]"
              title="Sohbeti temizle"
            >
              🗑️
            </button>
          </div>

          {/* Mesajlar */}
          <ChatMessages messages={messages} isLoading={isLoading} onQuickAction={handleSend} />

          {/* Input */}
          <ChatInput onSend={handleSend} disabled={isLoading} />
        </div>
      )}
    </>
  )
}
