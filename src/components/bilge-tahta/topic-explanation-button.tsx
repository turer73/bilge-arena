'use client'

import { useMemo, useState } from 'react'
import { BookOpen } from 'lucide-react'
import { BilgeTahtaDialog } from './bilge-tahta-dialog'
import type { BilgeTahtaLesson } from '@/lib/bilge-tahta/contract'
import { buildTopicExplanationPrompt } from '@/lib/bilge-tahta/topic-explanation'
import { trackBilgeBoardEvent } from '@/lib/bilge-tahta/analytics'

interface TopicExplanationButtonProps {
  topic: string
  subject: string
  examRef?: string | null
  difficulty?: number | null
  questionContext: string
  surface?: 'game' | 'classroom'
  disabled?: boolean
}

export function TopicExplanationButton({
  topic,
  subject,
  examRef = null,
  difficulty = null,
  questionContext,
  surface = 'game',
  disabled = false,
}: TopicExplanationButtonProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [answer, setAnswer] = useState<string | null>(null)
  const [error, setError] = useState('')

  const lesson = useMemo<BilgeTahtaLesson | null>(() => answer ? ({
    mode: 'game',
    subjectLabel: [subject, examRef].filter(Boolean).join(' · '),
    title: topic,
    steps: [{
      id: 'deepseek-topic-explanation',
      stage: 'concept',
      title: 'Ayrıntılı konu anlatımı',
      content: answer,
      sourceLabel: 'DeepSeek destekli Bilge Asistan yanıtı',
      guardrailLabel: 'Doğrulanmış ders içeriği değildir',
    }],
  }) : null, [answer, examRef, subject, topic])

  const explain = async () => {
    if (disabled || loading) return
    setError('')
    if (answer) {
      setOpen(true)
      return
    }
    setLoading(true)
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'topic_explanation',
          messages: [{
            role: 'user',
            content: buildTopicExplanationPrompt({ topic, subject, examRef, difficulty }),
          }],
          questionContext: questionContext.slice(0, 1000),
        }),
      })
      if (!response.ok) throw new Error('topic_explanation_failed')
      const text = await response.text()
      if (!text.trim()) throw new Error('topic_explanation_empty')
      setAnswer(text)
      setOpen(true)
      trackBilgeBoardEvent('BilgeBoardOpened', {
        surface,
        entryPoint: surface === 'classroom' ? 'classroom_result' : 'game_result',
        examRef,
      })
    } catch {
      setError('Konu anlatımı şu anda hazırlanamadı. Lütfen tekrar dene.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <div className="min-w-0">
        <button
          type="button"
          onClick={() => void explain()}
          disabled={disabled || loading}
          className="flex min-h-11 items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition-all hover:scale-[1.02] active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
          style={{
            borderColor: 'color-mix(in srgb, var(--wisdom) 35%, transparent)',
            background: 'color-mix(in srgb, var(--wisdom) 10%, transparent)',
            color: 'var(--wisdom-text)',
          }}
          title="Bu konuyu ayrıntılı olarak Bilge Tahta'da öğren"
        >
          <BookOpen className="h-4 w-4 shrink-0" aria-hidden="true" />
          {loading ? 'Hazırlanıyor…' : 'Konu Anlatımı'}
        </button>
        {error && <p role="alert" className="mt-1 max-w-52 text-[10px] leading-4 text-[var(--urgency)]">{error}</p>}
      </div>
      {lesson && (
        <BilgeTahtaDialog
          open={open}
          lesson={lesson}
          animate={false}
          onOpenChange={setOpen}
          onStepViewed={(index) => trackBilgeBoardEvent('BilgeBoardStageViewed', {
            surface,
            stage: lesson.steps[index].stage,
            stepIndex: index,
          })}
          onComplete={() => trackBilgeBoardEvent('BilgeBoardCompleted', {
            surface,
            stepCount: lesson.steps.length,
          })}
        />
      )}
    </>
  )
}
