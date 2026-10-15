import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { ProgressChart } from '../progress-chart'

describe('ProgressChart', () => {
  test('başlanmamış dersi kompakt bir durum satırı olarak gösterir', () => {
    const { container } = render(<ProgressChart game="turkce" categories={[]} />)

    expect(screen.getByText('Henüz başlanmadı')).toBeInTheDocument()
    expect(container.firstElementChild).toHaveClass('p-3')
    expect(container.firstElementChild).not.toHaveClass('p-4')
  })

  test('verisi olan derste konu ilerleme çubuklarını korur', () => {
    const { container } = render(
      <ProgressChart
        game="matematik"
        totalAnswered={20}
        accuracy={75}
        categories={[{ category: 'Sayılar', percentage: 80 }]}
      />,
    )

    expect(screen.getByText('20 soru')).toBeInTheDocument()
    expect(screen.getByText('Sayılar')).toBeInTheDocument()
    expect(screen.getByText('%80')).toBeInTheDocument()
    expect(container.firstElementChild).toHaveClass('p-4')
  })
})
