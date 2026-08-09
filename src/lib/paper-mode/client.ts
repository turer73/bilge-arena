import {
  paperPackIssueResultSchema,
  paperPackSubmitResponseSchema,
  paperPackViewSchema,
  type PaperPackIssueResult,
  type PaperPackSubmitInput,
  type PaperPackView,
} from './server-contract'

export function isPaperModeUiEnabled(): boolean {
  return process.env.NEXT_PUBLIC_PAPER_MODE_ENABLED === 'true'
}

export function paperPackCreateHref(game: string, examRef?: string | null): string {
  const params = new URLSearchParams({ game })
  if (examRef) params.set('examRef', examRef)
  return `/arena/kagit?${params.toString()}`
}

export async function issuePaperPack(input: {
  game: string
  examRef: string | null
  requestId: string
}): Promise<PaperPackIssueResult> {
  const response = await fetch('/api/study/paper-packs', {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!response.ok) throw new Error('paper_pack_issue_failed')
  const parsed = paperPackIssueResultSchema.safeParse(await response.json().catch(() => null))
  if (!parsed.success) throw new Error('paper_pack_issue_contract_invalid')
  return parsed.data
}

export async function fetchPaperPack(
  packId: string,
  signal?: AbortSignal,
): Promise<PaperPackView> {
  const response = await fetch(`/api/study/paper-packs/${packId}`, {
    cache: 'no-store',
    signal,
  })
  if (!response.ok) throw new Error('paper_pack_fetch_failed')
  const parsed = paperPackViewSchema.safeParse(await response.json().catch(() => null))
  if (!parsed.success) throw new Error('paper_pack_contract_invalid')
  return parsed.data
}

export async function submitPaperPack(
  packId: string,
  input: PaperPackSubmitInput,
  signal?: AbortSignal,
) {
  const response = await fetch(`/api/study/paper-packs/${packId}/submit`, {
    method: 'POST',
    cache: 'no-store',
    signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!response.ok) throw new Error('paper_pack_submit_failed')
  const parsed = paperPackSubmitResponseSchema.safeParse(await response.json().catch(() => null))
  if (!parsed.success) throw new Error('paper_pack_submit_contract_invalid')
  return parsed.data
}
