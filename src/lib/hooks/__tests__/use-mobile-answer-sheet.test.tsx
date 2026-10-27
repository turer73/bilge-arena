import { afterEach, describe, expect, test, vi } from 'vitest'
import { render } from '@testing-library/react'
import { useRef } from 'react'
import { useMobileAnswerSheet } from '../use-mobile-answer-sheet'

function setWide(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation(() => ({
    matches,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia
}

function Sheet({ active = true }: { active?: boolean }) {
  const sheetRef = useRef<HTMLDivElement>(null)
  const nextRef = useRef<HTMLButtonElement>(null)
  useMobileAnswerSheet(sheetRef, nextRef, active)
  return (
    <div data-answer-sheet-host data-testid="host">
      <div data-answer-sheet-scroll data-testid="scroller">
        <button data-answer-marked data-testid="marked">B</button>
        {active && <div ref={sheetRef} data-testid="sheet"><button ref={nextRef}>Devam</button></div>}
      </div>
    </div>
  )
}

const rects = new Map<string, Partial<DOMRect>>()
afterEach(() => { vi.restoreAllMocks(); rects.clear() })
function mockRects() {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function(this: HTMLElement) {
    return (rects.get(this.dataset.testid ?? '') ?? { top: 0, bottom: 0, height: 0 }) as DOMRect
  })
}

describe('useMobileAnswerSheet', () => {
  test('mobilde: kabuğa panel yüksekliğini yazar, işaretli öğeyi kaydırma kabında panelin üstüne alır, odağı verir', () => {
    setWide(false)
    rects.set('sheet', { top: 500, height: 300, bottom: 800 })
    rects.set('marked', { top: 520, bottom: 580 })
    mockRects()
    const scrollBy = vi.fn()
    HTMLElement.prototype.scrollBy = scrollBy as unknown as HTMLElement['scrollBy']
    const windowScroll = vi.fn()
    window.scrollBy = windowScroll as unknown as typeof window.scrollBy
    const { getByTestId, getByRole, unmount } = render(<Sheet />)
    expect(getByTestId('host').style.getPropertyValue('--quiz-sheet-h')).toBe('300px')
    expect(scrollBy).toHaveBeenCalledWith({ top: 92, behavior: 'smooth' })
    expect(windowScroll).not.toHaveBeenCalled()
    expect(getByRole('button', { name: 'Devam' })).toHaveFocus()
    const host = getByTestId('host')
    unmount()
    expect(host.style.getPropertyValue('--quiz-sheet-h')).toBe('')
  })

  test('işaretli öğe zaten panelin üstündeyse kaydırmaz', () => {
    setWide(false)
    rects.set('sheet', { top: 500, height: 300, bottom: 800 })
    rects.set('marked', { top: 300, bottom: 360 })
    mockRects()
    const scrollBy = vi.fn()
    HTMLElement.prototype.scrollBy = scrollBy as unknown as HTMLElement['scrollBy']
    render(<Sheet />)
    expect(scrollBy).not.toHaveBeenCalled()
  })

  test('geniş ekranda paneli akışta görünür kaydırır, yükseklik yazmaz ve odağı taşımaz', () => {
    setWide(true)
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    const { getByTestId, getByRole } = render(<Sheet />)
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'nearest' })
    expect(getByTestId('host').style.getPropertyValue('--quiz-sheet-h')).toBe('')
    expect(getByRole('button', { name: 'Devam' })).not.toHaveFocus()
  })

  test('etkin değilken hiçbir şey yapmaz', () => {
    setWide(false)
    const { getByTestId } = render(<Sheet active={false} />)
    expect(getByTestId('host').style.getPropertyValue('--quiz-sheet-h')).toBe('')
  })
})
