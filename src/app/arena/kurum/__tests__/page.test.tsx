import { render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'

vi.mock('@/components/institution-tracking/institution-tracking-dashboard', () => ({
  InstitutionTrackingDashboard: ({ initialScope }: { initialScope?: unknown }) => (
    <output data-testid="dashboard-props">{JSON.stringify({ initialScope })}</output>
  ),
}))

import InstitutionTrackingPage from '../page'

it('passes only an allowlisted exact institution scope into the dashboard', async () => {
  render(await InstitutionTrackingPage({
    searchParams: Promise.resolve({ game: 'fen', exam_ref: 'TYT' }),
  }))

  expect(screen.getByTestId('dashboard-props')).toHaveTextContent(
    JSON.stringify({ initialScope: { game: 'fen', displayExamRef: 'TYT' } }),
  )
})

it('fails safe for normalized, partial, and repeated scope queries', async () => {
  for (const searchParams of [
    { game: 'FEN', exam_ref: 'TYT' },
    { game: 'fen' },
    { game: ['fen', 'matematik'], exam_ref: 'TYT' },
  ]) {
    const view = render(await InstitutionTrackingPage({ searchParams: Promise.resolve(searchParams) }))
    expect(screen.getByTestId('dashboard-props')).toHaveTextContent(JSON.stringify({}))
    view.unmount()
  }
})
