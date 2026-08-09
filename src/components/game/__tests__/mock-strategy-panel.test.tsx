import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MockStrategyPanel } from '../mock-strategy-panel'

const analysis = {
  basis: 'server_receipt_approximate' as const,
  segments: [
    { key: 'opening' as const, planned: 14, answered: 14, correct: 10, averageSeconds: 32.5, unknownTiming: 0 },
    { key: 'middle' as const, planned: 13, answered: 13, correct: 8, averageSeconds: 47, unknownTiming: 1 },
    { key: 'closing' as const, planned: 13, answered: 10, correct: 6, averageSeconds: null, unknownTiming: 2 },
  ],
  unanswered: 3,
  unknownTiming: 3,
  rushedWrong: 2,
  stuck: 1,
  recommendations: ['check_fast_answers' as const, 'reserve_final_pass' as const],
}

describe('MockStrategyPanel', () => {
  it('renders the treatment surface with an explicit approximate-timing caveat', () => {
    render(<MockStrategyPanel analysis={analysis} />)

    expect(screen.getByRole('region', { name: 'Deneme stratejin' })).toBeInTheDocument()
    expect(screen.getByText(/kesin düşünme süresi değildir/i)).toBeInTheDocument()
    expect(screen.getByText('14/14')).toBeInTheDocument()
    expect(screen.getByText('Süre kanıtı yok')).toBeInTheDocument()
    expect(screen.getByText('Hızlı yanlışlarda kontrol adımı ekle')).toBeInTheDocument()
    expect(screen.getByText('Son tur için süre ayır')).toBeInTheDocument()
  })
})
