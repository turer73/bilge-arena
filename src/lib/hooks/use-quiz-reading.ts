'use client'

import { useSyncExternalStore } from 'react'

export const QUIZ_FONT_STORAGE_KEY = 'bilge-quiz-font-size'
export const QUIZ_FONT_SCALES = { small: 0.88, normal: 1, large: 1.12 } as const
export type QuizFontSize = keyof typeof QUIZ_FONT_SCALES
const CHANGE_EVENT = 'bilge-quiz-reading-change'
let sessionPreference: QuizFontSize = 'normal'

function isFontSize(value: string | null): value is QuizFontSize {
  return value === 'small' || value === 'normal' || value === 'large'
}

function getSnapshot(): QuizFontSize {
  try {
    const value = window.localStorage.getItem(QUIZ_FONT_STORAGE_KEY)
    return value === null ? sessionPreference : isFontSize(value) ? value : 'normal'
  } catch {
    // Reading remains usable when browser storage is unavailable.
    return sessionPreference
  }
}

function subscribe(listener: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== QUIZ_FONT_STORAGE_KEY) return
    sessionPreference = isFontSize(event.newValue) ? event.newValue : 'normal'
    listener()
  }
  window.addEventListener('storage', onStorage)
  window.addEventListener(CHANGE_EVENT, listener)
  return () => {
    window.removeEventListener('storage', onStorage)
    window.removeEventListener(CHANGE_EVENT, listener)
  }
}

export function setQuizFontSize(value: QuizFontSize) {
  sessionPreference = value
  try {
    window.localStorage.setItem(QUIZ_FONT_STORAGE_KEY, value)
  } catch {
    // Keep the preference for this session even if it cannot be persisted.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

const serverSnapshot = (): QuizFontSize => 'normal'

export function useQuizReading() {
  const fontSize = useSyncExternalStore(subscribe, getSnapshot, serverSnapshot)
  return { fontSize, fontScale: QUIZ_FONT_SCALES[fontSize], setFontSize: setQuizFontSize }
}
