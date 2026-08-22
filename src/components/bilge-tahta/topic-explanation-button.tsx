'use client'

import { useMemo, useState } from 'react'
import { BookOpen } from 'lucide-react'
import { BilgeTahtaDialog } from './bilge-tahta-dialog'
import type { BilgeTahtaLesson } from '@/lib/bilge-tahta/contract'
import { buildTopicExplanationPrompt } from '@/lib/bilge-tahta/topic-explanation'
import { trackBilgeBoardEvent } from '@/lib/bilge-tahta/analytics'
import { canUseHelper, useAssistancePolicy } from '@/lib/assistance-policy/client'

interface TopicExplanationButtonProps {
  topic: string
  subject: string
  examRef?: string | null
  difficulty?: number | null
  questionContext: string
  surface?: 'game' | 'classroom'
  appearance?: 'default' | 'learning'
  disabled?: boolean
}

export function TopicExplanationButton({
  topic,
  subject,
  examRef = null,
  difficulty = null,
  questionContext,
  surface = 'game',
  appearance = 'default',
  disabled = false,
}: TopicExplanationButtonProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [answer, setAnswer] = useState<string | null>(null)
  const [error, setError] = useState('')
  // Sinav modu bu dugmenin iki cagri noktasini da (oyun ici aciklama paneli
  // ve ogrenci odev ekrani) kapsasin diye kontrol bilesenin icinde.
  const assistance = useAssistancePolicy()

  const lesson = useMemo<BilgeTahtaLesson>(() => ({
    mode: 'game',
    subjectLabel: [subject, examRef].filter(Boolean).join(' · '),
    title: topic,
    steps: [{
      id: loading ? 'deepseek-topic-loading' : error ? 'deepseek-topic-error' : 'deepseek-topic-explanation',
      stage: 'concept',
      title: loading ? 'Konu anlatımı hazırlanıyor' : 'Ayrıntılı konu anlatımı',
      content: loading
        ? 'Sorunun konusu belirlendi. Bilge Asistan ayrıntılı anlatımı tahtaya hazırlıyor…'
        : error || answer || 'Konu anlatımını başlatmak için düğmeye dokun.',
      ...(answer ? {
        sourceLabel: 'Oyun içi Bilge Asistan yanıtı',
        guardrailLabel: 'Doğrulanmış ders içeriği değildir',
      } : {}),
    }],
  }), [answer, error, examRef, loading, subject, topic])

  const explain = async () => {
    if (disabled || loading) return
    setError('')
    setOpen(true)
    trackBilgeBoardEvent('BilgeBoardOpened', {
      surface,
      entryPoint: surface === 'classroom' ? 'classroom_result' : 'game_result',
      examRef,
    })
    if (answer) {
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
    } catch {
      setError('Konu anlatımı şu anda hazırlanamadı. Tahtayı kapatıp lütfen tekrar dene.')
    } finally {
      setLoading(false)
    }
  }

  // Sinav suresince tahta girisi hic cizilmez.
  if (!canUseHelper(assistance, 'board')) return null

  return (
    <>
      <div className="min-w-0">
        <button
          type="button"
          onClick={() => void explain()}
          disabled={disabled || loading}
          className={`flex min-h-11 items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition-all hover:scale-[1.02] active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 ${
            appearance === 'learning'
              ? 'border-[var(--wisdom-border)] bg-[var(--wisdom-bg)] text-[var(--wisdom-text)] shadow-[0_3px_0_var(--wisdom-border)]'
              : ''
          }`}
          style={appearance === 'default' ? {
            borderColor: 'color-mix(in srgb, var(--wisdom) 35%, transparent)',
            background: 'color-mix(in srgb, var(--wisdom) 10%, transparent)',
            color: 'var(--wisdom-text)',
          } : undefined}
          title="Bu konuyu ayrıntılı olarak Bilge Tahta'da öğren"
        >
          <BookOpen className="h-4 w-4 shrink-0" aria-hidden="true" />
          {loading ? 'Hazırlanıyor…' : 'Konu Anlatımı'}
        </button>
        {error && <p role="alert" className="mt-1 max-w-52 text-[10px] leading-4 text-[var(--urgency)]">{error}</p>}
      </div>
      <BilgeTahtaDialog
        open={open}
        busy={loading}
        lesson={lesson}
        animate={false}
        onOpenChange={setOpen}
        onStepViewed={(index) => {
          if (!answer) return
          trackBilgeBoardEvent('BilgeBoardStageViewed', {
            surface,
            stage: lesson.steps[index].stage,
            stepIndex: index,
          })
        }}
        onComplete={() => trackBilgeBoardEvent('BilgeBoardCompleted', {
          surface,
          stepCount: lesson.steps.length,
        })}
      />
    </>
  )
}
