import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const script = vi.hoisted(() => vi.fn(() => null))
vi.mock('next/script', () => ({ default: script }))

import { GoogleAnalytics } from '../google-analytics'

describe('GoogleAnalytics loading', () => {
  it('initializes consent defaults without loading Google Analytics before consent', () => {
    render(<GoogleAnalytics enabled={false} />)
    expect(script).not.toHaveBeenCalledWith(
      expect.objectContaining({ src: expect.stringContaining('googletagmanager.com/gtag/js'), strategy: 'afterInteractive' }),
      undefined,
    )
    expect(script).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'ga-init', strategy: 'afterInteractive' }),
      undefined,
    )
  })

  it('loads the analytics library only after an analytics grant', () => {
    render(<GoogleAnalytics enabled />)
    expect(script).toHaveBeenCalledWith(
      expect.objectContaining({ src: expect.stringContaining('googletagmanager.com/gtag/js'), strategy: 'lazyOnload' }),
      undefined,
    )
  })
})
