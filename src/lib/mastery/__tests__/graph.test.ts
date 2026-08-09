import { describe, expect, it } from 'vitest'
import { buildPublicCurriculumGraph, type CurriculumNodeInput } from '../graph'

const NODES: CurriculumNodeInput[] = [
  { id: 'course-id', code: 'MAT-TYT', nodeType: 'course', title: 'TYT Matematik', parentId: null, sortOrder: 0 },
  { id: 'unit-b', code: 'U-B', nodeType: 'unit', title: 'Geometri', parentId: 'course-id', sortOrder: 20 },
  { id: 'unit-a', code: 'U-A', nodeType: 'unit', title: 'Sayılar', parentId: 'course-id', sortOrder: 10 },
  { id: 'topic-a', code: 'T-A', nodeType: 'topic', title: 'Temel sayılar', parentId: 'unit-a', sortOrder: 10 },
  { id: 'leaf-a', code: 'L-A', nodeType: 'outcome', title: 'İşlem becerisi', parentId: 'topic-a', sortOrder: 10 },
  { id: 'topic-b', code: 'T-B', nodeType: 'topic', title: 'Üçgenler', parentId: 'unit-b', sortOrder: 10 },
  { id: 'leaf-b', code: 'L-B', nodeType: 'outcome', title: 'Üçgen becerisi', parentId: 'topic-b', sortOrder: 10 },
]

describe('buildPublicCurriculumGraph', () => {
  it('strict satırları sıralı ve UUID-free ağaca çevirir', () => {
    const graph = buildPublicCurriculumGraph(NODES, [
      { code: 'MAT-SAY-01', nodeId: 'leaf-a' },
      { code: 'MAT-GEO-01', nodeId: 'leaf-b' },
    ])

    expect(graph?.children.map((node) => node.code)).toEqual(['U-A', 'U-B'])
    expect(graph?.children[0].children[0].children[0]).toMatchObject({
      code: 'L-A',
      nodeType: 'outcome',
      outcomeCode: 'MAT-SAY-01',
    })
    expect(JSON.stringify(graph)).not.toContain('course-id')
    expect(JSON.stringify(graph)).not.toContain('leaf-a')
  })

  it('yanlış parent seviyesi veya erişilemeyen node için fail closed olur', () => {
    expect(buildPublicCurriculumGraph([
      ...NODES,
      { id: 'bad', code: 'BAD', nodeType: 'outcome', title: 'Bad', parentId: 'course-id', sortOrder: 99 },
    ], [
      { code: 'MAT-SAY-01', nodeId: 'leaf-a' },
      { code: 'MAT-GEO-01', nodeId: 'leaf-b' },
      { code: 'BAD', nodeId: 'bad' },
    ])).toBeNull()
  })

  it('outcome leaf eşlemesi eksik, fazla veya tekrarlıysa fail closed olur', () => {
    expect(buildPublicCurriculumGraph(NODES, [
      { code: 'MAT-SAY-01', nodeId: 'leaf-a' },
    ])).toBeNull()
    expect(buildPublicCurriculumGraph(NODES, [
      { code: 'MAT-SAY-01', nodeId: 'leaf-a' },
      { code: 'MAT-SAY-X', nodeId: 'leaf-a' },
      { code: 'MAT-GEO-01', nodeId: 'leaf-b' },
    ])).toBeNull()
  })

  it('birden fazla course kökünü reddeder', () => {
    expect(buildPublicCurriculumGraph([
      ...NODES,
      { id: 'course-2', code: 'MAT-2', nodeType: 'course', title: 'Başka', parentId: null, sortOrder: 1 },
    ], [
      { code: 'MAT-SAY-01', nodeId: 'leaf-a' },
      { code: 'MAT-GEO-01', nodeId: 'leaf-b' },
    ])).toBeNull()
  })
})
