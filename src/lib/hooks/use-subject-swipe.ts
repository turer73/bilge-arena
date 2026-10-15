'use client'

import { useRef, type TouchEvent } from 'react'

interface SubjectSwipeOptions<T extends string> {
  subjects: readonly T[]
  selectedSubject: T
  onSubjectChange: (subject: T) => void
  disabled?: boolean
}

interface Gesture<T> {
  identifier: number
  x: number
  y: number
  startedAt: number
  subject: T
}

const IGNORED_TARGETS = 'a, button, input, textarea, select, label, [contenteditable]:not([contenteditable="false"]), [role="button"], [role="slider"], [role="dialog"], [inert], [data-subject-swipe-ignore]'

/** Optional touch shortcut; existing subject buttons remain the primary controls. */
export function useSubjectSwipe<T extends string>({
  subjects,
  selectedSubject,
  onSubjectChange,
  disabled = false,
}: SubjectSwipeOptions<T>) {
  const gesture = useRef<Gesture<T> | null>(null)

  const modalOpen = (element: HTMLElement) => Boolean(
    element.ownerDocument.querySelector('[role="dialog"][aria-modal="true"], dialog[open]'),
  )

  return {
    onTouchStart(event: TouchEvent<HTMLElement>) {
      gesture.current = null
      if (disabled || subjects.length < 2 || event.touches.length !== 1 || modalOpen(event.currentTarget)) return
      if (!(event.target instanceof Element) || event.target.closest(IGNORED_TARGETS)) return

      const touch = event.touches[0]
      const viewportWidth = event.currentTarget.ownerDocument.defaultView?.innerWidth ?? 0
      // Leave the system/browser's back and forward edge gestures alone.
      if (touch.clientX < 24 || touch.clientX > viewportWidth - 24) return

      gesture.current = {
        identifier: touch.identifier,
        x: touch.clientX,
        y: touch.clientY,
        startedAt: event.timeStamp,
        subject: selectedSubject,
      }
    },
    onTouchMove(event: TouchEvent<HTMLElement>) {
      const start = gesture.current
      if (!start) return
      const touch = Array.from(event.touches).find((item) => item.identifier === start.identifier)
      if (event.touches.length !== 1 || !touch) {
        gesture.current = null
        return
      }

      const x = Math.abs(touch.clientX - start.x)
      const y = Math.abs(touch.clientY - start.y)
      // Once the user starts scrolling vertically, never turn it into a subject change.
      if (y > 12 && y >= x) gesture.current = null
    },
    onTouchEnd(event: TouchEvent<HTMLElement>) {
      const start = gesture.current
      gesture.current = null
      if (!start || disabled || start.subject !== selectedSubject || event.touches.length > 0 || modalOpen(event.currentTarget)) return

      const touch = Array.from(event.changedTouches).find((item) => item.identifier === start.identifier)
      if (!touch || event.timeStamp - start.startedAt > 800) return
      const x = touch.clientX - start.x
      const y = touch.clientY - start.y
      if (Math.abs(x) < 64 || Math.abs(x) < Math.abs(y) * 1.5) return

      const index = subjects.indexOf(selectedSubject)
      if (index < 0) return
      const next = subjects[index + (x < 0 ? 1 : -1)]
      if (next !== undefined) onSubjectChange(next)
    },
    onTouchCancel() {
      gesture.current = null
    },
  }
}
