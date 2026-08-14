import { render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'

vi.mock('@/components/institution-tracking/institution-role-manager', () => ({
  InstitutionRoleManager: () => <div>Kurum rol yöneticisi</div>,
}))

import InstitutionRolesPage from '../page'

it('mounts the institution-owned role manager surface', () => {
  render(<InstitutionRolesPage />)
  expect(screen.getByText('Kurum rol yöneticisi')).toBeInTheDocument()
})
