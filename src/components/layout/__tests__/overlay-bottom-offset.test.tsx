import { beforeEach, afterEach, describe, expect, test, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { useBottomNavOffset } from '../overlay-bottom-offset'

function Probe() {
  return <output data-testid="offset">{useBottomNavOffset()}</output>
}

beforeEach(() => {
  class MockResizeObserver {
    observe() {}
    disconnect() {}
  }
  vi.stubGlobal('ResizeObserver', MockResizeObserver)
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callback(0); return 1 })
  vi.stubGlobal('cancelAnimationFrame', () => {})
  vi.spyOn(window, 'getComputedStyle').mockImplementation((element) => ({
    display: (element as HTMLElement).style.display || 'block',
    visibility: 'visible',
    opacity: '1',
  }) as CSSStyleDeclaration)
})

afterEach(() => {
  cleanup()
  document.querySelectorAll('[data-bottom-nav]').forEach((node) => node.remove())
  vi.unstubAllGlobals()
})

describe('useBottomNavOffset', () => {
  test('visible bottom nav returns measured height', () => {
    const nav = document.createElement('nav')
    nav.dataset.bottomNav = ''
    document.body.append(nav)
    vi.spyOn(nav, 'getBoundingClientRect').mockReturnValue({ width: 390, height: 88 } as DOMRect)
    render(<Probe />)
    expect(screen.getByTestId('offset')).toHaveTextContent('88')
  })

  test('display:none nav returns zero', () => {
    const nav = document.createElement('nav')
    nav.dataset.bottomNav = ''
    nav.style.display = 'none'
    document.body.append(nav)
    vi.spyOn(nav, 'getBoundingClientRect').mockReturnValue({ width: 390, height: 88 } as DOMRect)
    render(<Probe />)
    expect(screen.getByTestId('offset')).toHaveTextContent('0')
  })
})
