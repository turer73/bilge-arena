'use client'

import type { Question } from '@/types/database'
import { getOptionLetter, getCorrectIndex } from '@/lib/utils/question'
import { LikeButton } from '@/components/social/like-button'
import { useChatStore } from '@/stores/chat-store'

interface ExplanationPanelProps {
  question: Question
  selectedOption: number
  isCorrect: boolean
  isLastQuestion: boolean
  onNext: () => void
  onOpenComments?: () => void
  onOpenReport?: () => void
}

export function ExplanationPanel({
  question,
  selectedOption,
  isCorrect,
  isLastQuestion,
  onNext,
  onOpenComments,
  onOpenReport,
}: ExplanationPanelProps) {
  const correctAnswer = getCorrectIndex(question.content)
  const correctText = question.content.options[correctAnswer]

  const handleTopicExplain = async () => {
    const topic = question.subcategory || question.category
    const opts = question.content.options
      .map((o, i) => `${'ABCDE'[i]}) ${o}`)
      .join('\n')
    const qText = question.content.question || question.content.sentence || ''
    const ctx = `[${question.game.toUpperCase()} - ${question.category}${question.subcategory ? ' / ' + question.subcategory : ''}]\n\nSoru: ${qText}\n\n${opts}\n\nDoğru cevap: ${getOptionLetter(correctAnswer)}) ${correctText}${question.content.solution ? '\nÇözüm: ' + question.content.solution : ''}`

    const userMsg = `"${topic}" konusunu kısaca anlat. Bu soruyla ilgili temel kavramları ve formülleri özetle.`

    const store = useChatStore.getState()
    store.setQuestionContext(ctx)
    store.clearMessages()
    store.addMessage('user', userMsg)
    store.addMessage('assistant', '')
    store.setLoading(true)
    store.setOpen(true)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: userMsg }],
          questionContext: ctx,
        }),
      })

      if (!res.ok) {
        useChatStore.getState().updateLastAssistant('Bir hata oluştu. Lütfen tekrar deneyin.')
        useChatStore.getState().setLoading(false)
        return
      }

      const reader = res.body?.getReader()
      const decoder = new TextDecoder()
      let fullText = ''
      if (reader) {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          fullText += decoder.decode(value, { stream: true })
          useChatStore.getState().updateLastAssistant(fullText)
        }
      }
      if (!fullText) {
        useChatStore.getState().updateLastAssistant('Cevap alınamadı.')
      }
    } catch {
      useChatStore.getState().updateLastAssistant('Bağlantı hatası.')
    } finally {
      useChatStore.getState().setLoading(false)
    }
  }

  return (
    <div
      className="animate-fadeUp rounded-xl border-[1.5px] px-[18px] py-[14px]"
      style={{
        background: isCorrect
          ? 'color-mix(in srgb, var(--growth) 12%, transparent)'
          : 'color-mix(in srgb, var(--urgency) 10%, transparent)',
        borderColor: isCorrect
          ? 'color-mix(in srgb, var(--growth) 33%, transparent)'
          : 'color-mix(in srgb, var(--urgency) 27%, transparent)',
      }}
    >
      {/* Sonuc mesaji */}
      <div
        className="mb-1.5 text-[13px] font-bold"
        style={{ color: isCorrect ? 'var(--growth)' : 'var(--urgency)' }}
      >
        {isCorrect
          ? '✓ Dogru! Mukemmel 🎉'
          : `✗ Yanlis. Dogru: ${getOptionLetter(correctAnswer)}) ${correctText}`}
      </div>

      {/* Aciklama */}
      {question.content.solution && (
        <div className="mb-2.5 text-xs leading-relaxed text-[var(--text-sub)]">
          📌 {question.content.solution}
        </div>
      )}

      {/* Alt bar: butonlar + sosyal ikonlar */}
      <div className="flex items-center justify-between">
        <button
          onClick={onNext}
          className="rounded-lg bg-[var(--focus)] px-[18px] py-2 text-xs font-bold tracking-wider text-white transition-colors hover:bg-[var(--focus-light)]"
        >
          {isLastQuestion ? 'Sonucu Gor →' : 'Sonraki Soru →'}
        </button>

        {/* Aksiyon ikonları */}
        <div className="flex items-center gap-1.5">
          {/* Konu Anlatımı — belirgin buton */}
          <button
            onClick={handleTopicExplain}
            className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-all hover:scale-[1.03] active:scale-95"
            style={{
              borderColor: 'color-mix(in srgb, var(--wisdom) 35%, transparent)',
              background: 'color-mix(in srgb, var(--wisdom) 10%, transparent)',
              color: 'var(--wisdom)',
            }}
            title="Bu konunun anlatımını Bilge Asistan'dan iste"
          >
            <span className="text-sm">📖</span>
            Konu Anlatımı
          </button>

          <LikeButton initialCount={0} size="sm" />

          {onOpenComments && (
            <button
              onClick={onOpenComments}
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-[var(--text-sub)] transition-colors hover:bg-[var(--card)] hover:text-[var(--focus)]"
              aria-label="Yorumlar"
            >
              <span className="text-xs">💬</span>
            </button>
          )}

          {onOpenReport && (
            <button
              onClick={onOpenReport}
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-[var(--text-sub)] transition-colors hover:bg-[var(--card)] hover:text-[var(--reward)]"
              aria-label="Hata bildir"
            >
              <span className="text-xs">🐛</span>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
