import { render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'

vi.mock('@/components/institution-tracking/institution-tracking-dashboard', () => ({
  InstitutionTrackingDashboard: (props: unknown) => (
    <output data-testid="dashboard-props">{JSON.stringify(props)}</output>
  ),
}))

import InstitutionClassroomPage from '../page'

const CLASSROOM_ID = '22222222-2222-4222-8222-222222222222'
const MEMBER_REF = 'a'.repeat(32)

it('preserves a valid exact scope and opaque student reference for the classroom dashboard', async () => {
  render(await InstitutionClassroomPage({
    params: Promise.resolve({ classroomId: CLASSROOM_ID }),
    searchParams: Promise.resolve({ ogrenci: MEMBER_REF, game: 'wordquest', exam_ref: 'YDT' }),
  }))

  expect(screen.getByTestId('dashboard-props')).toHaveTextContent(JSON.stringify({
    initialClassroomId: CLASSROOM_ID,
    initialMemberRef: MEMBER_REF,
    initialScope: { game: 'wordquest', displayExamRef: 'YDT' },
  }))
})

it('drops invalid scope and student query values instead of forwarding them', async () => {
  render(await InstitutionClassroomPage({
    params: Promise.resolve({ classroomId: CLASSROOM_ID }),
    searchParams: Promise.resolve({
      ogrenci: 'not-an-opaque-member-ref', game: 'fen', exam_ref: ['TYT', 'YDT'],
    }),
  }))

  expect(screen.getByTestId('dashboard-props')).toHaveTextContent(JSON.stringify({ initialClassroomId: CLASSROOM_ID }))
})
