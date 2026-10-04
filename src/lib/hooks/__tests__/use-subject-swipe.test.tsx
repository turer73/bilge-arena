import { useState } from 'react'
import { createEvent, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import { useSubjectSwipe } from '../use-subject-swipe'

function Harness({
  subjects = ['math', 'turkish', 'english'],
  initial = 'math',
  disabled = false,
  modal = false,
  onChange = () => {},
}: { subjects?: string[]; initial?: string; disabled?: boolean; modal?: boolean; onChange?: (value: string) => void }) {
  const [selected, setSelected] = useState(initial)
  const swipe = useSubjectSwipe({ subjects, selectedSubject: selected, disabled, onSubjectChange: (next) => {
    setSelected(next)
    onChange(next)
  } })
  return <main {...swipe}>
    <h1>{selected}</h1>
    <p data-testid="content">Lesson content</p>
    <button onClick={() => setSelected('english')}>Choose English</button>
    <a href="/lesson">Start lesson</a>
    <input aria-label="Answer" />
    <div data-subject-swipe-ignore><span>Scrollable tabs</span></div>
    {modal && <section role="dialog" aria-modal="true"><p>Plan details</p></section>}
  </main>
}

const point = (x: number, y: number, identifier = 1) => ({ clientX: x, clientY: y, identifier })
function swipe(target: Element, from = point(280, 200), to = point(100, 205), duration = 200) {
  const start = createEvent.touchStart(target, { touches: [from] })
  Object.defineProperty(start, 'timeStamp', { value: 1000 })
  fireEvent(target, start)
  fireEvent.touchMove(target, { touches: [to] })
  const end = createEvent.touchEnd(target, { touches: [], changedTouches: [to] })
  Object.defineProperty(end, 'timeStamp', { value: 1000 + duration })
  fireEvent(target, end)
}

describe('useSubjectSwipe', () => {
  test('left and right select one adjacent available subject without wrapping', () => {
    const onChange = vi.fn()
    render(<Harness subjects={['math', 'english']} onChange={onChange} />)
    const content = screen.getByTestId('content')
    swipe(content)
    expect(screen.getByRole('heading')).toHaveTextContent('english')
    swipe(content)
    expect(onChange).toHaveBeenCalledTimes(1)
    swipe(content, point(100, 200), point(280, 200))
    expect(screen.getByRole('heading')).toHaveTextContent('math')
    swipe(content, point(100, 200), point(280, 200))
    expect(onChange).toHaveBeenCalledTimes(2)
  })

  test.each([
    ['tap', point(279, 200), 200],
    ['short drag', point(240, 205), 200],
    ['diagonal drag', point(180, 280), 200],
    ['vertical scroll', point(275, 380), 200],
    ['long press', point(100, 205), 1000],
  ])('%s does not change subject', (_name, end, duration) => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    swipe(screen.getByTestId('content'), point(280, 200), end, duration)
    expect(onChange).not.toHaveBeenCalled()
  })

  test('vertical scrolling stays locked even if the finger later moves horizontally', () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    const content = screen.getByTestId('content')
    fireEvent.touchStart(content, { touches: [point(280, 200)] })
    fireEvent.touchMove(content, { touches: [point(278, 230)] })
    fireEvent.touchEnd(content, { touches: [], changedTouches: [point(100, 235)] })
    expect(onChange).not.toHaveBeenCalled()
  })

  test('controls and horizontally scrollable tabs keep their own interactions', () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    for (const target of [screen.getByRole('button'), screen.getByRole('link'), screen.getByRole('textbox'), screen.getByText('Scrollable tabs')]) swipe(target)
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByRole('heading')).toHaveTextContent('english')
  })

  test('system edge gestures are ignored', () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    const content = screen.getByTestId('content')
    swipe(content, point(10, 200), point(180, 200))
    swipe(content, point(window.innerWidth - 10, 200), point(100, 200))
    expect(onChange).not.toHaveBeenCalled()
  })

  test.each(['multitouch', 'cancel'] as const)('%s cancels an in-progress gesture', (kind) => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    const content = screen.getByTestId('content')
    fireEvent.touchStart(content, { touches: [point(280, 200)] })
    if (kind === 'multitouch') fireEvent.touchStart(content, { touches: [point(280, 200), point(240, 200, 2)] })
    else fireEvent.touchCancel(content)
    fireEvent.touchEnd(content, { touches: [], changedTouches: [point(100, 205)] })
    expect(onChange).not.toHaveBeenCalled()
  })

  test('a modal blocks both its contents and the background', () => {
    const onChange = vi.fn()
    render(<Harness modal onChange={onChange} />)
    swipe(screen.getByText('Plan details'))
    swipe(screen.getByTestId('content'))
    expect(onChange).not.toHaveBeenCalled()
  })

  test('a selection changed through another control cancels an old gesture', () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    const content = screen.getByTestId('content')
    fireEvent.touchStart(content, { touches: [point(280, 200)] })
    fireEvent.click(screen.getByRole('button'))
    fireEvent.touchEnd(content, { touches: [], changedTouches: [point(100, 205)] })
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('heading')).toHaveTextContent('english')
  })

  test('disabled surfaces do not navigate or cancel native touch events', () => {
    const onChange = vi.fn()
    render(<Harness disabled onChange={onChange} />)
    const content = screen.getByTestId('content')
    swipe(content)
    const move = createEvent.touchMove(content, { touches: [point(100, 205)], cancelable: true })
    fireEvent(content, move)
    expect(move.defaultPrevented).toBe(false)
    expect(onChange).not.toHaveBeenCalled()
  })
})
