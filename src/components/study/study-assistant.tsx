'use client'

import { useCallback } from 'react'
import { useChatStore } from '@/stores/chat-store'
import { ChatMessages } from '@/components/chat/chat-messages'
import { ChatInput } from '@/components/chat/chat-input'

/**
 * Bilge Asistan — ders çalışma hub'ında INLINE (artık global floating FAB
 * değil, bkz. arena-auxiliaries.tsx). handleSend mantığı chat-widget.tsx'ten
 * uyarlanmıştır (aynı store/endpoint, farklı kabuk — FAB/fixed-panel yok,
 * kart içinde sabit-yükseklik mesaj alanı).
 *
 * Bu bileşen calisma-client.tsx'te next/dynamic({ssr:false}) ile lazy-load
 * edilir — ağır AI-chat bundle'ı initial page load'dan çıkar.
 */
export function StudyAssistant() {
  const { messages, isLoading, questionContext, addMessage, updateLastAssistant, setLoading } = useChatStore()

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
    <div className="animate-fadeUp overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card-bg)]" style={{ animationDelay: '0.4s', animationFillMode: 'both' }}>
      <div className="flex items-center gap-2 border-b border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2">
        <span className="text-base">🦉</span>
        <span className="text-[9px] font-extrabold tracking-[0.18em] text-[var(--text-sub)]">
          BİLGE ASİSTAN
        </span>
      </div>

      <div className="flex h-[360px] flex-col">
        <ChatMessages messages={messages} isLoading={isLoading} onQuickAction={handleSend} />
        <ChatInput onSend={handleSend} disabled={isLoading} />
      </div>
    </div>
  )
}
