import { describe, expect, it, vi } from 'vitest'

vi.mock('../game-client', () => ({ default: () => null }))

import { generateMetadata } from '../page'

describe('game page metadata', () => {
  it('describes WordQuest without limiting the game to one exam profile', async () => {
    const metadata = await generateMetadata({ params: Promise.resolve({ game: 'wordquest' }) })

    expect(metadata.title).toContain('WordQuest İngilizce Oyunu')
    expect(metadata.title).not.toContain('YDT')
    expect(metadata.description).not.toContain('YDT')
  })
})
