'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { BilgeTahtaDialog } from '@/components/bilge-tahta'
import type { BilgeTahtaLesson, BilgeTahtaStage } from '@/lib/bilge-tahta/contract'
import { trackBilgeBoardEvent } from '@/lib/bilge-tahta/analytics'
import type { GameSlug } from '@/lib/constants/games'
import { GAMES } from '@/lib/constants/games'
import {
  STUDY_ASSISTANT_ACTIONS,
  type StudyAssistantAction,
} from '@/lib/bilge-tahta/topic-explanation'

type BoardStatus = 'idle' | 'loading' | 'ready' | 'error'

const ACTION_STAGE: Record<StudyAssistantAction['id'], BilgeTahtaStage> = {
  solve: 'worked-example',
  topic: 'concept',
  example: 'practice',
  plan: 'practice',
}

export function StudyAssistantLauncher({ game, examRef }: { game: GameSlug; examRef: string | null }) {
  const [boardOpen, setBoardOpen] = useState(false)
  const [activeAction, setActiveAction] = useState<StudyAssistantAction | null>(null)
  const [status, setStatus] = useState<BoardStatus>('idle')
  const [content, setContent] = useState('')
  const requestRef = useRef<AbortController | null>(null)

  useEffect(() => () => requestRef.current?.abort(), [])

  const lesson = useMemo<BilgeTahtaLesson | null>(() => {
    if (!activeAction) return null
    const loading = status === 'loading'
    return {
      mode: 'study',
      subjectLabel: ['Ders Çalış', GAMES[game].name, examRef].filter(Boolean).join(' · '),
      title: activeAction.label,
      steps: [{
        id: `study-${activeAction.id}-${status}`,
        stage: ACTION_STAGE[activeAction.id],
        title: loading ? 'Bilge Asistan hazırlıyor' : activeAction.label,
        content: loading
          ? 'İsteğin alındı. Bilge Asistan çalışma bağlamına özel anlatımı hazırlıyor…'
          : content,
        ...(status === 'ready' ? {
          sourceLabel: 'Ders Çalış Bilge Asistan yanıtı',
          guardrailLabel: 'Doğrulanmış ders içeriği değildir',
        } : {}),
      }],
    }
  }, [activeAction, content, examRef, game, status])

  const openBoard = async (action: StudyAssistantAction) => {
    requestRef.current?.abort()
    const controller = new AbortController()
    requestRef.current = controller
    setActiveAction(action)
    setContent('')
    setStatus('loading')
    setBoardOpen(true)
    trackBilgeBoardEvent('BilgeBoardOpened', {
      surface: 'study',
      game,
      entryPoint: 'study_assistant',
      examRef,
    })

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          mode: action.mode,
          messages: [{ role: 'user', content: action.prompt }],
          questionContext: [
            'Yüzey: Ders Çalış',
            `Ders: ${GAMES[game].name}`,
            examRef ? `Sınav: ${examRef}` : null,
            `İstenen yardım: ${action.label}`,
          ].filter(Boolean).join('\n'),
        }),
      })
      if (!response.ok) {
        let message = 'Bilge Asistan şu anda yanıt veremiyor. Lütfen tahtayı kapatıp tekrar dene.'
        try {
          const payload: unknown = await response.json()
          if (payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string') {
            message = payload.error
          }
        } catch {
          // JSON olmayan hata yanıtında güvenli varsayılan metin kullanılır.
        }
        throw new Error(message)
      }
      const answer = await response.text()
      if (!answer.trim()) throw new Error('Bilge Asistan boş bir yanıt verdi. Lütfen tekrar dene.')
      if (requestRef.current !== controller) return
      setContent(answer)
      setStatus('ready')
    } catch (error) {
      if (controller.signal.aborted || requestRef.current !== controller) return
      setContent(error instanceof Error ? error.message : 'Bağlantı hatası oluştu. Lütfen tekrar dene.')
      setStatus('error')
    }
  }

  const handleBoardOpenChange = (open: boolean) => {
    setBoardOpen(open)
    if (!open && status === 'loading') requestRef.current?.abort()
  }

  return (
    <>
      <section
        aria-labelledby="study-assistant-title"
        className="animate-fadeUp overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card-bg)] shadow-sm"
        style={{ animationDelay: '0.4s', animationFillMode: 'both' }}
      >
        <div className="flex min-h-14 items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="text-xl" aria-hidden="true">🦉</span>
            <div className="min-w-0">
              <h2 id="study-assistant-title" className="text-xs font-extrabold tracking-wide text-[var(--text)]">
                Bilge Asistan
              </h2>
              <p className="truncate text-[10px] text-[var(--text-sub)]">Takıldığın yerde ayrıntılı yardım al</p>
            </div>
          </div>
          <span className="rounded-full bg-[var(--focus)]/10 px-2 py-1 text-[10px] font-bold text-[var(--focus-text)]">
            Hazır
          </span>
        </div>

        <div className="grid grid-cols-1 gap-2 p-3 min-[360px]:grid-cols-2 sm:p-4">
          {STUDY_ASSISTANT_ACTIONS.map((action) => (
            <button
              key={action.id}
              type="button"
              aria-label={action.label}
              onClick={() => void openBoard(action)}
              className="min-h-[76px] rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-left transition hover:border-[var(--focus)] hover:bg-[var(--focus)]/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"
            >
              <span className="block text-sm font-black text-[var(--text)]">{action.label}</span>
              <span className="mt-1 block text-[11px] leading-4 text-[var(--text-sub)]">{action.description}</span>
            </button>
          ))}
        </div>
      </section>

      {lesson && (
        <BilgeTahtaDialog
          open={boardOpen}
          busy={status === 'loading'}
          lesson={lesson}
          animate={status === 'ready'}
          onOpenChange={handleBoardOpenChange}
          onStepViewed={(index) => {
            if (status !== 'ready') return
            trackBilgeBoardEvent('BilgeBoardStageViewed', {
              surface: 'study',
              game,
              stage: lesson.steps[index].stage,
              stepIndex: index,
            })
          }}
          onComplete={() => trackBilgeBoardEvent('BilgeBoardCompleted', {
            surface: 'study',
            game,
            stepCount: lesson.steps.length,
          })}
        />
      )}
    </>
  )
}
