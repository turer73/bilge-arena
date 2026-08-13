'use client'

import dynamic from 'next/dynamic'
import { useState } from 'react'
import type { GameSlug } from '@/lib/constants/games'
import {
  STUDY_ASSISTANT_ACTIONS,
  type StudyAssistantAction,
} from '@/lib/bilge-tahta/topic-explanation'

const StudyAssistantDialog = dynamic(
  () => import('./study-assistant-dialog').then((module) => ({ default: module.StudyAssistantDialog })),
  { ssr: false },
)

export function StudyAssistantLauncher({ game, examRef }: { game: GameSlug; examRef: string | null }) {
  const [assistantOpen, setAssistantOpen] = useState(false)
  const [initialRequest, setInitialRequest] = useState<{
    id: string
    prompt: string
    mode: 'chat' | 'topic_explanation'
  } | null>(null)

  const openAssistant = (action: StudyAssistantAction) => {
    setInitialRequest({
      id: crypto.randomUUID(),
      prompt: action.prompt,
      mode: action.mode,
    })
    setAssistantOpen(true)
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
              onClick={() => openAssistant(action)}
              className="min-h-[76px] rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-left transition hover:border-[var(--focus)] hover:bg-[var(--focus)]/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"
            >
              <span className="block text-sm font-black text-[var(--text)]">{action.label}</span>
              <span className="mt-1 block text-[11px] leading-4 text-[var(--text-sub)]">{action.description}</span>
            </button>
          ))}
        </div>
      </section>

      {assistantOpen && (
        <StudyAssistantDialog
          open={assistantOpen}
          onOpenChange={setAssistantOpen}
          game={game}
          examRef={examRef}
          initialRequest={initialRequest}
        />
      )}
    </>
  )
}
