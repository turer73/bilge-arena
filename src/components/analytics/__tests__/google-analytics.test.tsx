import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const script = vi.hoisted(() => vi.fn(() => null))
vi.mock('next/script', () => ({ default: script }))

import { GoogleAnalytics } from '../google-analytics'

describe('GoogleAnalytics loading', () => {
  it('initializes consent and analytics after hydration before early interactions', () => {
    render(<GoogleAnalytics />)
    expect(script).toHaveBeenCalledWith(
      expect.objectContaining({ src: expect.stringContaining('googletagmanager.com/gtag/js'), strategy: 'afterInteractive' }),
      undefined,
    )
    expect(script).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'ga-init', strategy: 'afterInteractive' }),
      undefined,
    )
  })
})
