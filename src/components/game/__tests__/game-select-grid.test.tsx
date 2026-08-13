import { describe, expect, test, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { GAME_LIST, GAMES } from '@/lib/constants/games'
import { GameSelectGrid, gameCardGridSpan, visibleExamTags } from '../game-select-grid'

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>{children}</a>
  ),
}))

describe('GameSelectGrid', () => {
  test('beş dersi doğru rotalar ve dengeli 3+2 masaüstü yerleşimiyle gösterir', () => {
    render(<GameSelectGrid games={GAME_LIST} />)

    expect(screen.getByRole('link', { name: 'Matematiğe başla — Matematik oyun konsolunu aç' }))
      .toHaveAttribute('href', '/arena/matematik')
    expect(screen.getByRole('link', { name: 'İngilizceye başla — İngilizce oyun konsolunu aç' }))
      .toHaveAttribute('href', '/arena/wordquest')

    expect(screen.getByTestId('game-card-matematik')).toHaveClass('lg:col-span-2')
    expect(screen.getByTestId('game-card-matematik')).toHaveClass('flex-col')
    expect(screen.getByTestId('game-card-sosyal')).toHaveClass('lg:col-span-3')
    expect(screen.getByTestId('game-card-wordquest')).toHaveClass('lg:col-span-3')
  })

  test('profil sınav türüne yalnızca ilgili sınav etiketlerini gösterir', () => {
    const { rerender } = render(<GameSelectGrid games={[GAMES.matematik]} examType="lgs" />)
    const lgsTags = within(screen.getByTestId('matematik-exam-tags'))
    expect(lgsTags.getByText('LGS')).toBeInTheDocument()
    expect(lgsTags.queryByText('TYT')).not.toBeInTheDocument()

    rerender(<GameSelectGrid games={[GAMES.matematik]} examType="yks" />)
    const yksTags = within(screen.getByTestId('matematik-exam-tags'))
    expect(yksTags.getByText('TYT')).toBeInTheDocument()
    expect(yksTags.getByText('AYT-SAY')).toBeInTheDocument()
    expect(yksTags.queryByText('LGS')).not.toBeInTheDocument()
  })

  test('konu kalabalığını ilk üç başlık ve kalan konu sayısıyla özetler', () => {
    render(<GameSelectGrid games={[GAMES.matematik]} />)
    const topics = within(screen.getByLabelText('Matematik konuları'))

    expect(topics.getByText('Sayılar')).toBeInTheDocument()
    expect(topics.getByText('Problemler')).toBeInTheDocument()
    expect(topics.getByText('Geometri')).toBeInTheDocument()
    expect(topics.getByText('+3 konu')).toBeInTheDocument()
    expect(topics.queryByText('Denklemler')).not.toBeInTheDocument()
  })

  test('dört dersli LGS görünümünü 2x2 masaüstü düzenine böler', () => {
    expect([0, 1, 2, 3].map((index) => gameCardGridSpan(4, index)))
      .toEqual(['lg:col-span-3', 'lg:col-span-3', 'lg:col-span-3', 'lg:col-span-3'])
  })

  test('etiket yardımcısı bilinmeyen profilde mevcut seçenekleri korur', () => {
    expect(visibleExamTags(['TYT', 'LGS'], null)).toEqual(['TYT', 'LGS'])
  })
})
