import { describe, it, expect } from 'vitest'
import { composePlan } from '../compose-plan'

function ids(prefix: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => `${prefix}${i}`)
}

describe('composePlan', () => {
  it('tum kovalar dolu iken 6 due + 4 weak + 5 new sirasiyla 15 benzersiz id doner', () => {
    const dueIds = ids('due', 6)
    const weakIds = ids('weak', 4)
    const newIds = ids('new', 5)

    const plan = composePlan({ dueIds, weakIds, newIds, size: 15 })

    expect(plan).toHaveLength(15)
    expect(new Set(plan).size).toBe(15)
    expect(plan.slice(0, 6)).toEqual(dueIds)
    expect(plan.slice(6, 10)).toEqual(weakIds)
    expect(plan.slice(10, 15)).toEqual(newIds)
  })

  it('due havuzu kisa kalirsa (3/6) acik "new"e devrolur, plan yine 15', () => {
    const dueIds = ids('due', 3) // 3 eksik
    const weakIds = ids('weak', 4)
    const newIds = ids('new', 20) // bol yeni havuz

    const plan = composePlan({ dueIds, weakIds, newIds, size: 15 })

    expect(plan).toHaveLength(15)
    expect(new Set(plan).size).toBe(15)
    // due+weak = 7, kalan 8 slot new'den doldurulmali
    expect(plan.filter((id) => id.startsWith('new')).length).toBe(8)
  })

  it('weak havuzu tamamen bossa acik slotlar "new"e devrolur', () => {
    const dueIds = ids('due', 6)
    const weakIds: string[] = []
    const newIds = ids('new', 20)

    const plan = composePlan({ dueIds, weakIds, newIds, size: 15 })

    expect(plan).toHaveLength(15)
    expect(plan.filter((id) => id.startsWith('new')).length).toBe(9)
  })

  it('havuzlar toplamda size kadar bile degilse, plan HEDEFTEN AZ doner (asla tekrar etmez)', () => {
    const dueIds = ids('due', 2)
    const weakIds = ids('weak', 1)
    const newIds = ids('new', 3)

    const plan = composePlan({ dueIds, weakIds, newIds, size: 15 })

    expect(plan).toHaveLength(6) // 2+1+3, havuz tukendi
    expect(new Set(plan).size).toBe(6)
  })

  it('kovalar arasi ve kendi icinde CAKISAN id lerde tekrar etmez (dedup)', () => {
    const dueIds = ['q1', 'q2', 'q2', 'q3']
    const weakIds = ['q3', 'q4'] // q3 due'da zaten var
    const newIds = ['q4', 'q5', 'q6', 'q7', 'q8', 'q9'] // q4 weak'te zaten var

    const plan = composePlan({ dueIds, weakIds, newIds, size: 8 })

    expect(new Set(plan).size).toBe(plan.length)
    expect(plan).not.toContain(undefined)
  })

  it('hicbir havuz yoksa bos liste doner', () => {
    const plan = composePlan({ dueIds: [], weakIds: [], newIds: [], size: 15 })
    expect(plan).toEqual([])
  })

  it('size havuzlarin toplamindan kucukse fazlaligi kirpar', () => {
    const dueIds = ids('due', 10)
    const weakIds = ids('weak', 10)
    const newIds = ids('new', 10)

    const plan = composePlan({ dueIds, weakIds, newIds, size: 5 })

    expect(plan).toHaveLength(5)
    expect(new Set(plan).size).toBe(5)
  })
})
