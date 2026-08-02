'use client'

import { useEffect, useRef } from 'react'
import type { PublicQuestion } from '@/lib/utils/question-public'
import { getOptionLetter } from '@/lib/utils/question'
import { stripRichText } from '@/lib/utils/rich-text'
import { LikeButton } from '@/components/social/like-button'
import { useChatStore } from '@/stores/chat-store'

interface ExplanationPanelProps {
  question: PublicQuestion
  selectedOption: number
  isCorrect: boolean
  correctOption: number
  solution: string | null
  isLastQuestion: boolean
  onNext: () => void
  onOpenComments?: () => void
  onOpenReport?: () => void
}

export function ExplanationPanel({
  question,
  selectedOption: _selectedOption,
  isCorrect,
  correctOption,
  solution,
  isLastQuestion,
  onNext,
  onOpenComments,
  onOpenReport,
}: ExplanationPanelProps) {
  const correctAnswer = correctOption
  const correctText = correctAnswer >= 0 ? question.content.options[correctAnswer] : null

  // Panel soru kartinin USTUNDE render olur; alt siklara tiklayan kullanicinin
  // viewport'u asagida kalabilir — mount'ta paneli gorunur yap (jsdom guard'li)
  const rootRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    rootRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' })
  }, [])

  const handleTopicExplain = async () => {
    const topic = question.subcategory || question.category
    const opts = question.content.options
      .map((o, i) => `${'ABCDE'[i]}) ${o}`)
      .join('\n')
    const qText = stripRichText(question.content.question || question.content.sentence)
    // Öncül bloğu (passage) varsa soru metninin önüne ekle — asistan ifadeleri görsün (<u> AI'ya gitmesin)
    const body = question.content.passage ? `${stripRichText(question.content.passage)}\n\n${qText}` : qText
    const answerContext = correctText
      ? `${getOptionLetter(correctAnswer)}) ${correctText}`
      : 'Sunucudan alınamadı'
    const ctx = `[${question.game.toUpperCase()} - ${question.category}${question.subcategory ? ' / ' + question.subcategory : ''}]\n\nSoru: ${body}\n\n${opts}\n\nDoğru cevap: ${answerContext}${solution ? '\nÇözüm: ' + solution : ''}`

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
      ref={rootRef}
      className="animate-fadeUp rounded-xl border-[1.5px] p-4 md:p-5"
      style={{
        // Opak taban (transparent DEĞİL) — video zeminde panel saydam kalıp
        // açıklama metnini okunmaz yapıyordu; tinti card-bg ile karıştır.
        background: isCorrect
          ? 'color-mix(in srgb, var(--growth) 12%, var(--card-bg))'
          : 'color-mix(in srgb, var(--urgency) 10%, var(--card-bg))',
        borderColor: isCorrect
          ? 'color-mix(in srgb, var(--growth) 33%, transparent)'
          : 'color-mix(in srgb, var(--urgency) 27%, transparent)',
      }}
    >
      {/* Sonuc mesaji */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="mb-2 text-base font-bold leading-6"
        style={{ color: isCorrect ? 'var(--growth-text)' : 'var(--urgency-text)' }}
      >
        {isCorrect
          ? '✓ Doğru! Mükemmel 🎉'
          : correctText
            ? `✗ Yanlış. Doğru: ${getOptionLetter(correctAnswer)}) ${correctText}`
            : '⏱ Süre doldu. Doğru cevap şu anda alınamadı.'}
      </div>

      {/* Aciklama */}
      {solution && (
        <div className="mb-4 text-[15px] leading-7 text-[var(--text-sub)]">
          📌 {solution}
        </div>
      )}

      {/* Alt bar: butonlar + sosyal ikonlar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={onNext}
          className="min-h-11 w-full rounded-xl bg-[var(--focus)] px-5 py-2.5 text-sm font-bold tracking-wide text-white transition-colors hover:bg-[var(--focus-light)] sm:w-auto"
        >
          {isLastQuestion ? 'Sonucu Gor →' : 'Sonraki Soru →'}
        </button>

        {/* Aksiyon ikonları */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Konu Anlatımı — belirgin buton */}
          <button
            type="button"
            onClick={handleTopicExplain}
            className="flex min-h-11 items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition-all hover:scale-[1.02] active:scale-95"
            style={{
              borderColor: 'color-mix(in srgb, var(--wisdom) 35%, transparent)',
              background: 'color-mix(in srgb, var(--wisdom) 10%, transparent)',
              color: 'var(--wisdom-text)',
            }}
            title="Bu konunun anlatımını Bilge Asistan'dan iste"
          >
            <span className="text-sm">📖</span>
            Konu Anlatımı
          </button>

          <LikeButton initialCount={0} size="sm" />

          {onOpenComments && (
            <button
              type="button"
              onClick={onOpenComments}
              className="flex min-h-11 min-w-11 items-center justify-center rounded-xl text-[var(--text-sub)] transition-colors hover:bg-[var(--card)] hover:text-[var(--focus-text)]"
              aria-label="Yorumlar"
            >
              <span className="text-xs">💬</span>
            </button>
          )}

          {onOpenReport && (
            <button
              type="button"
              onClick={onOpenReport}
              className="flex min-h-11 min-w-11 items-center justify-center rounded-xl text-[var(--text-sub)] transition-colors hover:bg-[var(--card)] hover:text-[var(--reward-text)]"
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
