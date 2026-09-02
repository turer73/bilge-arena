import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TytSocialReleaseOperationsPanel } from '../tyt-social-release-operations-panel'

const fetchMock = vi.fn()
global.fetch = fetchMock as unknown as typeof fetch

const QUESTION = '11111111-1111-4111-8111-111111111111'
const REVISION = '22222222-2222-4222-8222-222222222222'

function operations(overrides: Record<string, unknown> = {}) {
  return {
    items: [{
      questionId: QUESTION, revisionId: REVISION, publishedRevisionId: REVISION,
      revisionStatus: 'published', revisionCreatedAt: '2026-09-01T12:00:00.000Z',
      category: 'felsefe', difficulty: 2, workflowState: 'role_prepare',
      sourcePolicyReady: true, sourceKind: 'official_exam', sourceTitle: 'Resmî kitapçık',
      licenseCode: 'OSYM-REFERENCE', provenanceReady: true, outcomeCount: 1,
      allowedRoles: ['common_philosophy', 'alternate_philosophy'], candidateId: null,
      proposedRole: null, candidateStatus: null, examRole: null,
    }],
    nextCursor: null,
    readiness: {
      policyVersion: 'tyt-social-2026-v1', scopeStatus: 'validating', diagnosticEnabled: false,
      activeQuestionCount: 10, sourceApprovedQuestionCount: 1, sourceUnapprovedQuestionCount: 9,
      sourceEvidenceSha256: 'a'.repeat(64), sourceReady: false,
      assignedQuestionCount: 0, unassignedQuestionCount: 10, invalidRoleCount: 0,
      invalidApprovalProvenanceCount: 0,
      roleCounts: { common_history: 0, common_geography: 0, common_philosophy: 0, standard_religion: 0, alternate_philosophy: 0 },
      candidatePolicyReady: false, masteryReaderReady: true, officialSectionComposerReady: true,
      mappingTotal: 10, mappingMapped: 10, mappingUnmapped: 0, mappingScopeMismatch: 0,
      mappingNodeOrphan: 0, mappingOutcomeOrphan: 0, mappingPrimaryMismatch: 0,
      mappingEmptyOutcome: 0, mappingReady: true, immutableSourceEvidenceRecorded: false,
      reviewReady: false, releaseReady: false,
      ...overrides,
    },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('crypto', { randomUUID: vi.fn(() => '33333333-3333-4333-8333-333333333333') })
  fetchMock.mockImplementation((input: RequestInfo | URL) => {
    if (String(input).startsWith('/api/admin/content-quality/tyt-social/exam-role?')) {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(operations()) })
    }
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ replayed: false }) })
  })
})

describe('TytSocialReleaseOperationsPanel', () => {
  it('shows honest readiness and requires an explicit non-default role choice', async () => {
    render(<TytSocialReleaseOperationsPanel />)
    const evidence = await screen.findByLabelText('TYT Sosyal yayın kanıtı')
    expect(evidence).toHaveTextContent('Kaynak + içerik onayı1/10 · eksik')
    expect(evidence).toHaveTextContent('KapsamKapalı / doğrulanıyor · eksik')

    fireEvent.click(screen.getByRole('button', { name: 'İncele' }))
    const radios = screen.getAllByRole('radio') as HTMLInputElement[]
    expect(radios.every((radio) => !radio.checked)).toBe(true)
    expect(screen.getByRole('button', { name: 'Rol adayını kaydet' })).toBeDisabled()
  })

  it('binds an explicit human role proposal to one idempotency key', async () => {
    render(<TytSocialReleaseOperationsPanel />)
    fireEvent.click(await screen.findByRole('button', { name: 'İncele' }))
    fireEvent.click(screen.getByRole('radio', { name: 'İlave Felsefe' }))
    fireEvent.change(screen.getByLabelText('İnsan inceleme gerekçesi'), {
      target: { value: 'Kitapçık konumu ve içerik kapsamı insan tarafından doğrulandı.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Rol adayını kaydet' }))

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([url, init]) =>
        String(url).endsWith('/exam-role/prepare') && init?.method === 'POST')
      expect(call).toBeDefined()
      const init = call?.[1] as RequestInit
      const body = JSON.parse(init.body as string)
      expect(body).toMatchObject({
        revisionId: REVISION,
        examRole: 'alternate_philosophy',
        requestId: '33333333-3333-4333-8333-333333333333',
      })
      expect((init.headers as Record<string, string>)['X-Idempotency-Key']).toBe(body.requestId)
      expect(JSON.stringify(body)).not.toMatch(/userId|reviewerId|policyReason/)
    })
  })

  it('keeps final release disabled until all proofs and exact typed confirmation exist', async () => {
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      if (String(input).startsWith('/api/admin/content-quality/tyt-social/exam-role?')) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(operations({
          sourceApprovedQuestionCount: 10, sourceUnapprovedQuestionCount: 0, sourceReady: true,
          assignedQuestionCount: 10, unassignedQuestionCount: 0, candidatePolicyReady: true,
          reviewReady: true,
        })) })
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ replayed: false }) })
    })
    render(<TytSocialReleaseOperationsPanel />)
    const release = await screen.findByRole('button', { name: 'TYT Sosyal kapsamını yayınla' })
    expect(release).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Onay metni'), { target: { value: 'TYT SOSYAL YAYINLA' } })
    expect(release).toBeEnabled()
    fireEvent.click(release)

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([url, init]) =>
        String(url).endsWith('/tyt-social/release') && init?.method === 'POST')
      expect(call).toBeDefined()
      const init = call?.[1] as RequestInit
      const body = JSON.parse(init.body as string)
      expect(body).toMatchObject({
        expectedSourceEvidenceSha256: 'a'.repeat(64), expectedActiveQuestionCount: 10,
      })
      expect((init.headers as Record<string, string>)['X-Idempotency-Key']).toBe(body.requestId)
    })
  })

  it('keeps final release disabled when a runtime capability is unavailable', async () => {
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      if (String(input).startsWith('/api/admin/content-quality/tyt-social/exam-role?')) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(operations({
          sourceApprovedQuestionCount: 10, sourceUnapprovedQuestionCount: 0, sourceReady: true,
          assignedQuestionCount: 10, unassignedQuestionCount: 0, candidatePolicyReady: true,
          officialSectionComposerReady: false, reviewReady: true,
        })) })
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ replayed: false }) })
    })

    render(<TytSocialReleaseOperationsPanel />)
    const release = await screen.findByRole('button', { name: 'TYT Sosyal kapsamını yayınla' })
    expect(screen.getByLabelText('Onay metni')).toBeDisabled()
    expect(release).toBeDisabled()
  })

  it('reports a closed governance feature without offering mutations', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 503, json: () => Promise.resolve({}) })
    render(<TytSocialReleaseOperationsPanel />)
    expect(await screen.findByText(/İçerik yönetişimi kapalı/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'TYT Sosyal kapsamını yayınla' })).not.toBeInTheDocument()
  })
})
