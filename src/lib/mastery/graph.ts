export const CURRICULUM_NODE_TYPES = ['course', 'unit', 'topic', 'outcome'] as const
export type CurriculumNodeType = (typeof CURRICULUM_NODE_TYPES)[number]

export interface CurriculumNodeInput {
  id: string
  code: string
  nodeType: CurriculumNodeType
  title: string
  parentId: string | null
  sortOrder: number
}

export interface CurriculumOutcomeNodeInput {
  code: string
  nodeId: string
}

export interface PublicCurriculumNode {
  code: string
  title: string
  nodeType: CurriculumNodeType
  outcomeCode?: string
  children: PublicCurriculumNode[]
}

const EXPECTED_PARENT: Record<CurriculumNodeType, CurriculumNodeType | null> = {
  course: null,
  unit: 'course',
  topic: 'unit',
  outcome: 'topic',
}

/** Strict DB rows to a UUID-free public tree. Invalid/orphan input fails closed. */
export function buildPublicCurriculumGraph(
  nodes: CurriculumNodeInput[],
  outcomes: CurriculumOutcomeNodeInput[],
): PublicCurriculumNode | null {
  if (nodes.length === 0) return null
  const byId = new Map<string, CurriculumNodeInput>()
  const seenCodes = new Set<string>()
  for (const node of nodes) {
    if (!node.id || !node.code || !node.title || byId.has(node.id) || seenCodes.has(node.code)) return null
    if (!CURRICULUM_NODE_TYPES.includes(node.nodeType)) return null
    byId.set(node.id, node)
    seenCodes.add(node.code)
  }

  const courseNodes = nodes.filter((node) => node.nodeType === 'course')
  if (courseNodes.length !== 1 || courseNodes[0].parentId !== null) return null

  const outcomeByNode = new Map<string, string>()
  for (const outcome of outcomes) {
    if (!outcome.code || outcomeByNode.has(outcome.nodeId)) return null
    const node = byId.get(outcome.nodeId)
    if (!node || node.nodeType !== 'outcome') return null
    outcomeByNode.set(outcome.nodeId, outcome.code)
  }

  const childrenByParent = new Map<string, CurriculumNodeInput[]>()
  for (const node of nodes) {
    const expectedParent = EXPECTED_PARENT[node.nodeType]
    if (expectedParent === null) continue
    if (!node.parentId) return null
    const parent = byId.get(node.parentId)
    if (!parent || parent.nodeType !== expectedParent) return null
    const siblings = childrenByParent.get(parent.id) ?? []
    siblings.push(node)
    childrenByParent.set(parent.id, siblings)
  }

  if (nodes.some((node) => node.nodeType === 'outcome' && !outcomeByNode.has(node.id))) return null
  if (outcomes.length !== nodes.filter((node) => node.nodeType === 'outcome').length) return null

  function build(node: CurriculumNodeInput): PublicCurriculumNode {
    const children = [...(childrenByParent.get(node.id) ?? [])]
      .sort((left, right) => left.sortOrder - right.sortOrder || left.code.localeCompare(right.code))
      .map(build)
    return {
      code: node.code,
      title: node.title,
      nodeType: node.nodeType,
      ...(node.nodeType === 'outcome' ? { outcomeCode: outcomeByNode.get(node.id) } : {}),
      children,
    }
  }

  const graph = build(courseNodes[0])
  let reachable = 0
  const count = (node: PublicCurriculumNode) => {
    reachable += 1
    node.children.forEach(count)
  }
  count(graph)
  return reachable === nodes.length ? graph : null
}

export function indexPublicCurriculumLeaves(graph: PublicCurriculumNode): Map<string, {
  nodeCode: string
  path: string[]
  order: number
}> {
  const leaves = new Map<string, { nodeCode: string; path: string[]; order: number }>()
  let order = 0
  const visit = (node: PublicCurriculumNode, path: string[]) => {
    const nextPath = [...path, node.title]
    if (node.nodeType === 'outcome' && node.outcomeCode) {
      leaves.set(node.outcomeCode, { nodeCode: node.code, path: nextPath, order: order++ })
    }
    node.children.forEach((child) => visit(child, nextPath))
  }
  visit(graph, [])
  return leaves
}
