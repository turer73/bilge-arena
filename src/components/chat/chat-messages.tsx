'use client'

import { useEffect, useRef } from 'react'
import type { ChatMessage } from '@/stores/chat-store'

interface ChatMessagesProps {
  messages: ChatMessage[]
  isLoading: boolean
}

export function ChatMessages({ messages, isLoading }: ChatMessagesProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 text-center">
        <div className="text-3xl">🦉</div>
        <div className="text-sm font-bold">Bilge Asistan</div>
        <div className="text-[11px] leading-relaxed text-[var(--text-sub)]">
          Merhaba! Soru cozumu, konu anlatimi veya calisma onerileri icin buradayim.
        </div>
        <div className="flex flex-wrap justify-center gap-1.5">
          {['Bu soruyu coz', 'Konu anlat', 'Ornek soru sor', 'Calisma onerisi'].map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-[var(--border)] px-2.5 py-1 text-[10px] text-[var(--text-sub)]"
            >
              {tag}
            </span>
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
