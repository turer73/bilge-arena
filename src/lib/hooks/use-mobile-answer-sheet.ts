'use client'

import { useEffect, type RefObject } from 'react'
import { useWideStudy } from '@/lib/hooks/use-wide-study'

/** Panel yuksekligini alan kabuk; ilk eslesen ata kullanilir. */
const HOST = '[data-answer-sheet-host], [data-responsive-quiz-shell]'
/** Cevaptan sonra gorunur kalmasi gereken siklar (secilen ve dogru). */
const MARKED = '[data-quiz-option="correct"], [data-quiz-option="wrong"], [data-answer-marked]'

/**
 * Mobilde (<768px) cevap sonucu ekranin altina sabit bir panel olur (CSS:
 * academy-quiz.module.css / answer-sheet.module.css). Bu hook paneli calistirir:
 * - panelin olculen yuksekligini kabuga `--quiz-sheet-h` olarak yazar; kabuk o
 *   kadar alt bosluk alir ki son sik panelin arkasinda kalmasin,
 * - secilen ve dogru siklardan alttakini panelin ustune kaydirir,
 * - odagi ilerleme dugmesine verir.
 * Genis ekranda panel akista durur; yalniz gorunur kaydirilir (eski davranis).
 * Kabuk kendi icinde kayiyorsa (ornek: tam ekran pencere) `data-answer-sheet-scroll`
 * isaretli ata kaydirilir, yoksa pencere.
 */
export function useMobileAnswerSheet(
  sheetRef: RefObject<HTMLElement | null>,
  focusRef?: RefObject<HTMLElement | null>,
  active = true,
) {
  const wide = useWideStudy()
  useEffect(() => {
    const sheet = sheetRef.current
    if (!active || !sheet) return
    if (wide) {
      sheet.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' })
      return
    }
    const host = sheet.closest<HTMLElement>(HOST)
    const revealFocus = () => {
      const focused = document.activeElement
      if (!(focused instanceof HTMLElement) || !sheet.contains(focused) || sheet.clientHeight <= 0) return
      const bounds = focused.getBoundingClientRect()
      const sheetTop = sheet.getBoundingClientRect().top
      // Shared entrance transforms cancel out; scroll only the panel so the
      // learner's question position stays intact when text makes it taller.
      const above = bounds.top - sheetTop - 12
      const below = bounds.bottom - sheetTop - sheet.clientHeight + 12
      if (above < 0) sheet.scrollTop += above
      else if (below > 0) sheet.scrollTop += below
    }
    const publishHeight = () => {
      host?.style.setProperty('--quiz-sheet-h', `${Math.ceil(sheet.getBoundingClientRect().height)}px`)
      revealFocus()
    }
    publishHeight()
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(publishHeight) : null
    observer?.observe(sheet)
    const marked = host?.querySelectorAll<HTMLElement>(MARKED)
    const lowest = marked?.length ? marked[marked.length - 1] : null
    if (lowest) {
      // Panel asagidan kayarak acilir (translateY); getBoundingClientRect animasyonun
      // ilk karesini olcer. Sabit panelin yerlesik ustu: gorunum alani yuksekligi
      // eksi panel yuksekligi (offsetHeight transform'dan etkilenmez).
      const viewportHeight = document.documentElement.clientHeight || window.innerHeight
      const settledTop = Math.min(sheet.getBoundingClientRect().top, viewportHeight - sheet.offsetHeight)
      const overlap = lowest.getBoundingClientRect().bottom + 12 - settledTop
      if (overlap > 0) {
        const scroller = sheet.closest<HTMLElement>('[data-answer-sheet-scroll]')
        if (scroller) scroller.scrollBy?.({ top: overlap, behavior: 'smooth' })
        else window.scrollBy?.({ top: overlap, behavior: 'smooth' })
      }
    }
    focusRef?.current?.focus({ preventScroll: true })
    revealFocus()
    return () => {
      observer?.disconnect()
      host?.style.removeProperty('--quiz-sheet-h')
    }
  }, [wide, active, sheetRef, focusRef])
  return wide
}
