import { describe, expect, it } from 'vitest'

import { getModeByIdForContext, getModesForContext } from '../modes'

describe('context-aware quiz modes', () => {
  it('models TYT Social deneme as the exact 20-question section', () => {
    const mode = getModeByIdForContext('deneme', 'sosyal', 'TYT')

    expect(mode).toMatchObject({
      id: 'deneme',
      questionCount: 20,
      description: '20 soruluk TYT Sosyal bölümü',
    })
  })

  it('does not change other games or Social outside TYT', () => {
    expect(getModeByIdForContext('deneme', 'matematik', 'TYT').questionCount).toBe(40)
    expect(getModeByIdForContext('deneme', 'sosyal', 'AYT-SOZ').questionCount).toBe(40)
    expect(getModesForContext('sosyal', 'TYT')).toHaveLength(6)
  })
})
