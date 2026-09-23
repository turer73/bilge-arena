'use client'

import { useEffect, useState } from 'react'

/** Returns the height of a genuinely visible bottom navigation. */
export function useBottomNavOffset() {
  const [offset, setOffset] = useState(0)

  useEffect(() => {
    let frame: number | undefined
    let observedNav: HTMLElement | null = null
    let resizeObserver: ResizeObserver | undefined
    const measure = () => {
      const nav = document.querySelector<HTMLElement>('[data-bottom-nav]')
      if (nav !== observedNav) {
        resizeObserver?.disconnect()
        observedNav = nav
        if (nav) {
          resizeObserver = new ResizeObserver(scheduleMeasure)
          resizeObserver.observe(nav)
        }
      }
      if (!nav) return setOffset(0)
      const style = window.getComputedStyle(nav)
      const rect = nav.getBoundingClientRect()
      setOffset(style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0' && rect.height > 0 && rect.width > 0 ? Math.ceil(rect.height) : 0)
    }
    const scheduleMeasure = () => {
      if (frame === undefined) frame = window.requestAnimationFrame(() => { frame = undefined; measure() })
    }
    measure()
    const observer = new MutationObserver(scheduleMeasure)
    observer.observe(document.body, { subtree: true, childList: true })
    window.addEventListener('resize', measure)
    return () => {
      observer.disconnect()
      resizeObserver?.disconnect()
      window.removeEventListener('resize', measure)
      if (frame !== undefined) window.cancelAnimationFrame(frame)
    }
  }, [])
  return offset
}
