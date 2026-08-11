'use client'

import { useCallback } from 'react'
import { useChatStore } from '@/stores/chat-store'
import { ChatMessages } from '@/components/chat/chat-messages'
import { ChatInput } from '@/components/chat/chat-input'

interface StudyAssistantProps {
  /** CalismaClient kendi responsive kabuğunu çizdiğinde yalnız chat gövdesini render eder. */
  embedded?: boolean
}

export function StudyAssistant({ embedded = false }: StudyAssistantProps) {
  const {
    messages,
    isLoading,
    questionContext,
    addMessage,
    updateLastAssistant,
    setLoading,
  } = useChatStore()

  const handleSend = useCallback(async (text: string) => {
    addMessage('user', text)
    setLoading(true)
    addMessage('assistant', '')

    try {
      const apiMessages = [
        ...messages.map((message) => ({ role: message.role, content: message.content })),
        { role: 'user' as const, content: text },
      ]

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages, questionContext }),
      })

      if (!response.ok) {
        let errorMessage = 'Üzgünüm, bir hata oluştu. Lütfen tekrar dene.'
        if (response.status === 401) {
          errorMessage = 'Bu özelliği kullanmak için giriş yapman gerekiyor. 🔑'
        } else if (response.status === 429) {
          errorMessage = 'Çok fazla mesaj gönderdin. Biraz bekleyip tekrar dene. ⏳'
        } else {
          try {
            const errorBody = await response.json()
            errorMessage = errorBody.error || errorMessage
          } catch {
            // JSON olmayan hata cevabında güvenli varsayılan metni kullan.
          }
        }
        updateLastAssistant(errorMessage)
        setLoading(false)
        return
      }

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()
      let fullText = ''

      if (reader) {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          fullText += decoder.decode(value, { stream: true })
          updateLastAssistant(fullText)
        }
      }

      if (!fullText) updateLastAssistant('Cevap alınamadı. Lütfen tekrar dene.')
    } catch {
      updateLastAssistant('Bağlantı hatası. İnternet bağlantını kontrol et.')
    } finally {
      setLoading(false)
    }
  }, [messages, questionContext, addMessage, updateLastAssistant, setLoading])

  const body = (
    <div className="flex h-[320px] flex-col md:h-[340px]">
      <ChatMessages messages={messages} isLoading={isLoading} onQuickAction={handleSend} />
      <ChatInput onSend={handleSend} disabled={isLoading} />
    </div>
  )

  if (embedded) return body

  return (
    <section className="animate-fadeUp overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card-bg)]">
      <div className="flex min-h-14 items-center gap-2 border-b border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-3">
        <span className="text-xl" aria-hidden="true">🦉</span>
        <h2 className="text-xs font-extrabold tracking-wide text-[var(--text)]">BİLGE ASİSTAN</h2>
      </div>
      {body}
    </section>
  )
}
