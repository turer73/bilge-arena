'use client'

import { useCallback, useMemo, useState } from 'react'
import { useChatStore } from '@/stores/chat-store'
import { ChatMessages } from '@/components/chat/chat-messages'
import { ChatInput } from '@/components/chat/chat-input'
import { BilgeTahtaDialog } from '@/components/bilge-tahta'
import { useBilgeTahtaEnabled } from '@/lib/bilge-tahta/client'
import type { BilgeTahtaLesson } from '@/lib/bilge-tahta/contract'
import { GAMES, type GameSlug } from '@/lib/constants/games'
import { trackBilgeBoardEvent } from '@/lib/bilge-tahta/analytics'

interface StudyAssistantProps {
  /** CalismaClient kendi responsive kabuğunu çizdiğinde yalnız chat gövdesini render eder. */
  embedded?: boolean
  game?: GameSlug
  examRef?: string | null
}

function boardTopic(prompt: string, questionContext: string | null): string {
  const contextTopic = questionContext
    ?.split('\n')
    .find((line) => /^(Konu|Topic):/i.test(line))
    ?.replace(/^[^:]+:\s*/, '')
    .trim()
  const value = contextTopic || prompt.trim() || 'Konu anlatımı'
  return value.length > 120 ? `${value.slice(0, 117)}…` : value
}

export function StudyAssistant({ embedded = false, game, examRef = null }: StudyAssistantProps) {
  const [boardOpen, setBoardOpen] = useState(false)
  const [boardAnswer, setBoardAnswer] = useState<{ topic: string; content: string } | null>(null)
  const {
    messages,
    isLoading,
    questionContext,
    addMessage,
    updateLastAssistant,
    setLoading,
  } = useChatStore()
  const boardEnabled = useBilgeTahtaEnabled()

  const boardLesson = useMemo<BilgeTahtaLesson | null>(() => {
    if (!boardAnswer) return null
    return {
      mode: 'study',
      subjectLabel: [game ? GAMES[game].name : 'Ders Çalış', examRef].filter(Boolean).join(' · '),
      title: boardAnswer.topic,
      steps: [{
        id: 'assistant-explanation',
        stage: 'concept',
        title: 'Bilge Asistan anlatımı',
        content: boardAnswer.content,
        sourceLabel: 'Bilge Asistan yanıtı',
        guardrailLabel: 'Doğrulanmış ders içeriği değildir',
      }],
    }
  }, [boardAnswer, examRef, game])

  const handleSend = useCallback(async (text: string) => {
    setBoardOpen(false)
    setBoardAnswer(null)
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
      else setBoardAnswer({ topic: boardTopic(text, questionContext), content: fullText })
    } catch {
      updateLastAssistant('Bağlantı hatası. İnternet bağlantını kontrol et.')
    } finally {
      setLoading(false)
    }
  }, [messages, questionContext, addMessage, updateLastAssistant, setLoading])

  const handleBoardOpen = () => {
    trackBilgeBoardEvent('BilgeBoardOpened', {
      surface: 'study',
      ...(game ? { game } : {}),
      entryPoint: 'study_assistant',
      examRef,
    })
    setBoardOpen(true)
  }

  const body = (
    <div className="flex h-[320px] flex-col md:h-[340px]">
      <ChatMessages messages={messages} isLoading={isLoading} onQuickAction={handleSend} />
      {boardEnabled && boardLesson && !isLoading && (
        <div className="border-t border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2">
          <button
            type="button"
            onClick={handleBoardOpen}
            className="min-h-11 w-full rounded-xl bg-emerald-700 px-4 py-2 text-xs font-extrabold text-white transition hover:bg-emerald-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
          >
            🧑‍🏫 Tahtada anlat
          </button>
        </div>
      )}
      <ChatInput onSend={handleSend} disabled={isLoading} />
      {boardLesson && (
        <BilgeTahtaDialog
          open={boardOpen}
          lesson={boardLesson}
          onOpenChange={setBoardOpen}
          onStepViewed={(index) => trackBilgeBoardEvent('BilgeBoardStageViewed', {
            surface: 'study',
            ...(game ? { game } : {}),
            stage: boardLesson.steps[index].stage,
            stepIndex: index,
          })}
          onComplete={() => trackBilgeBoardEvent('BilgeBoardCompleted', {
            surface: 'study',
            ...(game ? { game } : {}),
            stepCount: boardLesson.steps.length,
          })}
        />
      )}
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
