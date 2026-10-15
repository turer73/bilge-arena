'use client'

import { useEffect, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { getCategoriesForExam, type GameSlug } from '@/lib/constants/games'
import type { QuizMode } from '@/lib/constants/modes'

interface LobbySelectionOptions {
  game: GameSlug
  selectedCategory: string | null
  onSelectCategory: (category: string | null) => void
  onSelectExamRef: (examRef: string | null) => void
  onSelectMode: (mode: QuizMode) => void
}

export function useLobbySelection({ game, selectedCategory, onSelectCategory, onSelectExamRef, onSelectMode }: LobbySelectionOptions) {
  const searchParams = useSearchParams()
  const pendingMode = useRef<QuizMode | null>(null)
  useEffect(() => {
    // Let GameClient consume the removed entry preference before applying
    // the user's explicit choice, on both mobile and desktop.
    if (!pendingMode.current || searchParams.has('mode')) return
    const nextMode = pendingMode.current
    pendingMode.current = null
    onSelectMode(nextMode)
  }, [searchParams, onSelectMode])

  const replaceSetupQuery = (updates: Record<string, string | null>) => {
    if (window.location.pathname !== `/arena/${game}`) return
    const url = new URL(window.location.href)
    for (const [key, value] of Object.entries(updates)) {
      if (value) url.searchParams.set(key, value)
      else url.searchParams.delete(key)
    }
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
  }

  const selectScope = (value: string | null) => {
    const validTopic = selectedCategory && getCategoriesForExam(game, value).includes(selectedCategory) ? selectedCategory : null
    replaceSetupQuery({ exam_ref: value, category: validTopic })
    if (selectedCategory !== validTopic) onSelectCategory(validTopic)
    onSelectExamRef(value)
  }
  const selectTopic = (value: string | null) => {
    replaceSetupQuery({ category: value })
    onSelectCategory(value)
  }
  const selectMode = (value: QuizMode) => {
    // Keep the narrow practice entry contract, including unrelated source
    // and program parameters; this does not add a generic URL mode selector.
    if (window.location.pathname === `/arena/${game}` && new URLSearchParams(window.location.search).has('mode') && value.id !== 'practice') {
      pendingMode.current = value
      replaceSetupQuery({ mode: null })
      return
    }
    pendingMode.current = null
    onSelectMode(value)
  }

  return { selectScope, selectTopic, selectMode }
}
