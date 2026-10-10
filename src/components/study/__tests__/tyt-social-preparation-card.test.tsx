import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { TytSocialPreparationCard } from '../tyt-social-preparation-card'
const context = { available: true, policyVersion: 'tyt-social-2027-v1', examYear: 2027, variant: null, resume: null,
  candidateQuestionCount: 20, bookletQuestionCount: 25, officialExamCertification: false, wholeCurriculumMeasurement: false }
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
it('shows preparation only after the exact server context is ready', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(context))))
  render(<TytSocialPreparationCard userId="one" fallback={<p>Kapalı</p>} />)
  expect(await screen.findByRole('link', { name: 'Hazırlık turunu aç' })).toHaveAttribute('href', '/arena/tani/sosyal-hazirlik')
  expect(screen.getByText(/resmî sınav onayı/)).toBeInTheDocument()
})
it('ignores old-account response after the user changes', async () => {
  let late: (r: Response) => void = () => {}
  vi.stubGlobal('fetch', vi.fn().mockImplementationOnce(() => new Promise<Response>(r => { late = r })).mockResolvedValue(new Response(JSON.stringify({ available: false }))))
  const view = render(<TytSocialPreparationCard userId="one" fallback={<p>Kapalı</p>} />)
  view.rerender(<TytSocialPreparationCard userId="two" fallback={<p>Kapalı</p>} />)
  await act(async () => late(new Response(JSON.stringify(context))))
  expect(screen.getByText('Kapalı')).toBeInTheDocument(); expect(screen.queryByRole('link')).not.toBeInTheDocument()
})
