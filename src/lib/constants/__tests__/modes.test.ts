import { describe, expect, it } from 'vitest'

import { getModeByIdForContext, getModesForContext } from '../modes'

describe('context-aware quiz modes', () => {
  it('models TYT Social deneme as the exact 20-question section', () => {
    const mode = getModeByIdForContext('deneme', 'sosyal', 'TYT', true)

    expect(mode).toMatchObject({
      id: 'deneme',
      questionCount: 20,
      description: '20 soruluk TYT Sosyal bölümü',
    })
  })

  it('does not change other games or Social outside TYT', () => {
    expect(getModeByIdForContext('deneme', 'matematik', 'TYT').questionCount).toBe(40)
    expect(getModeByIdForContext('deneme', 'sosyal', 'AYT-SOZ').questionCount).toBe(40)
    expect(getModesForContext('sosyal', 'TYT', true)).toHaveLength(6)
  })

  it('keeps Social legacy modes when the learner rollout is disabled', () => {
    expect(getModeByIdForContext('deneme', 'sosyal', 'TYT').questionCount).toBe(40)
    expect(getModesForContext('sosyal', 'TYT')).toHaveLength(6)
  })
})
