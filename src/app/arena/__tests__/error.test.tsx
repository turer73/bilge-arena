import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

const captureException = vi.hoisted(() => vi.fn())
vi.mock('@sentry/nextjs', () => ({ captureException }))
vi.mock('@/components/privacy/document-boundary-link', () => ({
  DocumentBoundaryLink: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}))

import ArenaError from '../error'
import AdminError from '../../admin/error'

// Oyun ve admin yüzeylerindeki hatalar kullanıcıya gösterilip Sentry'ye hiç
// ulaşmıyordu (derin inceleme 4.3); kök error.tsx ile aynı bildirim.
describe('segment error boundaries', () => {
  it('reports the arena error to Sentry and still shows the recovery screen', () => {
    const error = Object.assign(new Error('render failed'), { digest: 'abc123' })
    render(<ArenaError error={error} reset={() => undefined} />)
    expect(captureException).toHaveBeenCalledWith(error)
    expect(screen.getByText('Hata kodu: abc123')).toBeInTheDocument()
  })

  it('reports the admin error to Sentry', () => {
    const error = new Error('admin render failed')
    render(<AdminError error={error} reset={() => undefined} />)
    expect(captureException).toHaveBeenCalledWith(error)
  })
})
