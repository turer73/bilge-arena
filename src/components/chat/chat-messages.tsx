'use client'

import { useEffect, useRef } from 'react'
import type { ChatMessage } from '@/stores/chat-store'
import { useChatStore } from '@/stores/chat-store'

interface ChatMessagesProps {
  messages: ChatMessage[]
  isLoading: boolean
  onQuickAction?: (message: string) => void
}

const QUICK_ACTIONS = [
  { label: 'Bu soruyu çöz', prompt: 'Bu soruyu adım adım çözer misin? Çözümü detaylı açıkla.' },
  { label: 'Konu anlat', prompt: 'Bu sorunun konusunu kısa ve net bir şekilde anlatır mısın? Günlük hayattan örnek ver.' },
  { label: 'Örnek soru sor', prompt: 'Bu konuyla ilgili bana benzer bir örnek soru sorabilir misin?' },
  { label: 'Çalışma önerisi', prompt: 'Bu konu için etkili çalışma stratejisi önerir misin? Hangi konulara öncelik vermeliyim?' },
]

export function ChatMessages({ messages, isLoading, onQuickAction }: ChatMessagesProps) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const questionContext = useChatStore((s) => s.questionContext)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 text-center">
        <div className="text-3xl">🦉</div>
        <div className="text-sm font-bold">Bilge Asistan</div>

        {questionContext ? (
          <div className="w-full rounded-lg border border-[var(--focus-border)] bg-[var(--focus-bg)] px-3 py-2 text-left">
            <div className="mb-1 text-[9px] font-bold text-[var(--focus)]">📌 Aktif Soru</div>
            <div className="text-[10px] leading-relaxed text-[var(--text-sub)] line-clamp-3">
              {questionContext.split('\n').find((l) => l.startsWith('Soru:'))?.replace('Soru: ', '') || questionContext.substring(0, 100)}
            </div>
          </div>
        ) : (
          <div className="text-[11px] leading-relaxed text-[var(--text-sub)]">
            Merhaba! Soru çözümü, konu anlatımı veya çalışma önerileri için buradayım.
          </div>
        )}
        <div className="flex flex-wrap justify-center gap-1.5">
          {QUICK_ACTIONS.map((action) => (
            <button
              key={action.label}
              onClick={() => onQuickAction?.(action.prompt)}
              disabled={isLoading}
              className="rounded-full border border-[var(--border)] px-2.5 py-1 text-[10px] text-[var(--text-sub)] transition-all hover:border-[var(--focus-border)] hover:bg-[var(--focus-bg)] hover:text-[var(--focus)] active:scale-95 disabled:opacity-40"
            >
              {action.label}
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-3 py-3">
      {messages.map((msg) => (
        <div
          key={msg.id}
          className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
        >
          <div
            className={`max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed ${
              msg.role === 'user'
                ? 'bg-[var(--focus)] text-white'
                : 'bg-[var(--card)] text-[var(--text)]'
            }`}
          >
            {msg.role === 'assistant' && (
              <div className="mb-1 text-[9px] font-bold text-[var(--text-sub)]">🦉 Bilge</div>
            )}
            <div className="whitespace-pre-wrap">{msg.content}</div>
          </div>
        </div>
      ))}

      {/* Loading indicator */}
      {isLoading && (
        <div className="flex justify-start">
          <div className="rounded-xl bg-[var(--card)] px-3 py-2">
            <div className="mb-1 text-[9px] font-bold text-[var(--text-sub)]">🦉 Bilge</div>
            <div className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--text-sub)]" style={{ animationDelay: '0ms' }} />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--text-sub)]" style={{ animationDelay: '150ms' }} />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--text-sub)]" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  )
}
