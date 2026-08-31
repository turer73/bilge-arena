import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.client'
import {
  filterTytSocialQuestionIds,
  getVerifiedAttemptDurationSec,
  issueVerifiedAttempt,
  issueVerifiedExamAttempt,
  issueVerifiedTytSocialOfficialSection,
  readVerifiedAttemptQuestionSnapshots,
} from '../verified-attempts'

const ATTEMPT_ID = '10000000-0000-4000-8000-000000000001'
const QUESTION_ONE = '20000000-0000-4000-8000-000000000001'
const QUESTION_TWO = '20000000-0000-4000-8000-000000000002'
const NOW = '2026-08-08T09:00:00.000Z'
const FUTURE = '2026-08-08T10:00:00.000Z'

const rpc = vi.fn()
const admin = { rpc } as unknown as SupabaseClient<Database>
const HASH = 'a'.repeat(64)

function normalSnapshotItem(
  questionId: string,
  position: number,
  game: 'matematik' | 'sosyal' = 'matematik',
) {
  return {
    position,
    questionId,
    revisionId: `50000000-0000-4000-8000-${String(position).padStart(12, '0')}`,
    contentSha256: HASH,
    content: { question: `${position}. soru`, options: ['A', 'B'], answer: 1, solution: 'Gizli çözüm' },
    correctOption: 1,
    metadata: {
      game,
      category: game === 'sosyal' ? 'tarih' : 'cebir',
      difficulty: 2,
      ...(game === 'sosyal' ? { examRef: 'TYT' } : {}),
      basePoints: 20,
    },
  }
}

function validInput(questionIds = [QUESTION_ONE]) {
  return {
    userId: '30000000-0000-4000-8000-000000000001',
    game: 'matematik' as const,
    mode: 'practice' as const,
    questionIds,
  }
}

describe('verified attempts helper', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(NOW))
    rpc.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('uses server-authoritative durations for every mode family', () => {
    expect(getVerifiedAttemptDurationSec('matematik', 'practice')).toBe(7200)
    expect(getVerifiedAttemptDurationSec('matematik', 'deneme')).toBe(3000)
    expect(getVerifiedAttemptDurationSec('matematik', 'classic')).toBe(600)
    expect(getVerifiedAttemptDurationSec('matematik', 'blitz')).toBe(375)
  })

  it('deduplicates question IDs stably and calls the exact issuance RPC', async () => {
    rpc.mockResolvedValue({
      data: {
        attemptId: ATTEMPT_ID,
        expiresAt: FUTURE,
        snapshot: { items: [normalSnapshotItem(QUESTION_ONE, 1), normalSnapshotItem(QUESTION_TWO, 2)] },
      },
      error: null,
    })

    const result = await issueVerifiedAttempt(
      admin,
      validInput([QUESTION_ONE, QUESTION_TWO, QUESTION_ONE]),
    )

    expect(rpc).toHaveBeenCalledWith('issue_verified_attempt', {
      p_user_id: '30000000-0000-4000-8000-000000000001',
      p_game: 'matematik',
      p_mode: 'practice',
      p_question_ids: [QUESTION_ONE, QUESTION_TWO],
      p_duration_sec: 7200,
    })
    expect(result).toEqual({ attemptId: ATTEMPT_ID, expiresAt: FUTURE })
    expect(result.questionSnapshots).toHaveLength(2)
    expect(result.questionSnapshots[0].content.answer).toBe(1)
    expect({ ...result }).not.toHaveProperty('questionSnapshots')
    expect(JSON.stringify(result)).not.toContain('Gizli çözüm')
  })

  it('routes TYT Social practice and frozen daily-plan attempts to the policy-aware RPCs', async () => {
    rpc.mockResolvedValue({
      data: {
        attemptId: ATTEMPT_ID,
        expiresAt: FUTURE,
        policyVersion: 'tyt-social-2026-v1',
        variant: 'questions_16_20',
        artifactKind: 'practice',
        replayed: false,
        snapshot: { items: [normalSnapshotItem(QUESTION_ONE, 1, 'sosyal')] },
      },
      error: null,
    })
    const requestId = '40000000-0000-4000-8000-000000000001'

    await issueVerifiedAttempt(admin, {
      userId: '30000000-0000-4000-8000-000000000001',
      game: 'sosyal',
      mode: 'practice',
      questionIds: [QUESTION_ONE],
      examRef: 'TYT',
      requestId,
    })

    expect(rpc).toHaveBeenLastCalledWith('issue_verified_tyt_social_attempt', {
      p_user_id: '30000000-0000-4000-8000-000000000001',
      p_mode: 'practice',
      p_question_ids: [QUESTION_ONE],
      p_duration_sec: 7200,
      p_request_id: requestId,
    })

    rpc.mockClear()
    await issueVerifiedAttempt(admin, {
      userId: '30000000-0000-4000-8000-000000000001',
      game: 'sosyal',
      mode: 'practice',
      questionIds: [QUESTION_ONE],
      examRef: 'TYT',
      sourcePlanId: '60000000-0000-4000-8000-000000000001',
      requestId,
    })
    expect(rpc).toHaveBeenLastCalledWith('issue_verified_tyt_social_plan_attempt', {
      p_user_id: '30000000-0000-4000-8000-000000000001',
      p_plan_id: '60000000-0000-4000-8000-000000000001',
      p_mode: 'practice',
      p_duration_sec: 7200,
      p_request_id: requestId,
    })
  })

  it('does not let the generic issuer mint a TYT Social official section', async () => {
    await expect(issueVerifiedAttempt(admin, {
      userId: '30000000-0000-4000-8000-000000000001',
      game: 'sosyal',
      mode: 'deneme',
      questionIds: [QUESTION_ONE],
      examRef: 'TYT',
      requestId: '40000000-0000-4000-8000-000000000001',
    })).rejects.toThrow('verified_attempt_issue_failed')
    expect(rpc).not.toHaveBeenCalled()
  })

  it('issues an exact official TYT Social section only through the composer', async () => {
    const items = Array.from({ length: 20 }, (_, index) => normalSnapshotItem(
      `20000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      index + 1,
      'sosyal',
    ))
    rpc.mockResolvedValue({
      data: {
        attemptId: ATTEMPT_ID,
        expiresAt: FUTURE,
        policyVersion: 'tyt-social-2026-v1',
        variant: 'questions_16_20',
        artifactKind: 'official_section',
        snapshot: { items },
        replayed: false,
        composerVersion: 'tyt-social-official-section-v1',
      },
      error: null,
    })
    const requestId = '40000000-0000-4000-8000-000000000001'

    const result = await issueVerifiedTytSocialOfficialSection(admin, {
      userId: '30000000-0000-4000-8000-000000000001',
      requestId,
    })

    expect(rpc).toHaveBeenCalledWith(
      'compose_and_issue_verified_tyt_social_section_attempt',
      {
        p_user_id: '30000000-0000-4000-8000-000000000001',
        p_duration_sec: 1800,
        p_request_id: requestId,
      },
    )
    expect(result).toEqual({ attemptId: ATTEMPT_ID, expiresAt: FUTURE })
    expect(result.questionSnapshots).toHaveLength(20)
    expect({ ...result }).not.toHaveProperty('questionSnapshots')
    expect(JSON.stringify(result)).not.toContain('questions_16_20')
  })

  it.each([
    ['P0002', 'TYT Social policy selection required', 'tyt_social_section_setup_required'],
    ['P0002', 'private branch detail', 'tyt_social_section_unavailable'],
    ['22023', 'TYT Social official-section replay payload differs', 'tyt_social_section_conflict'],
    ['22023', 'invalid TYT Social official-section composition request', 'tyt_social_section_unavailable'],
    ['23505', 'private unique detail', 'tyt_social_section_unavailable'],
    ['42501', 'private permission detail', 'tyt_social_section_unavailable'],
    ['55000', 'private branch detail', 'tyt_social_section_unavailable'],
    ['23514', 'private branch detail', 'tyt_social_section_unavailable'],
    ['PGRST202', 'private branch detail', 'tyt_social_section_unavailable'],
    ['XX999', 'private branch detail', 'tyt_social_section_issue_failed'],
  ])('maps official section SQLSTATE %s without leaking DB detail', async (code, message, expected) => {
    rpc.mockResolvedValue({ data: null, error: { code, message } })
    await expect(issueVerifiedTytSocialOfficialSection(admin, {
      userId: '30000000-0000-4000-8000-000000000001',
      requestId: '40000000-0000-4000-8000-000000000001',
    })).rejects.toThrow(expected)
  })

  it('validates the service-only TYT Social candidate filter response', async () => {
    rpc.mockResolvedValue({
      data: {
        policyVersion: 'tyt-social-2026-v1',
        allowedQuestionIds: [QUESTION_TWO, QUESTION_ONE],
      },
      error: null,
    })

    await expect(filterTytSocialQuestionIds(
      admin,
      '30000000-0000-4000-8000-000000000001',
      [QUESTION_ONE, QUESTION_TWO],
    )).resolves.toEqual([QUESTION_TWO, QUESTION_ONE])
    expect(rpc).toHaveBeenCalledWith('filter_tyt_social_question_candidates', {
      p_user_id: '30000000-0000-4000-8000-000000000001',
      p_question_ids: [QUESTION_ONE, QUESTION_TWO],
    })

    rpc.mockResolvedValue({
      data: { policyVersion: 'tyt-social-2026-v1', allowedQuestionIds: [QUESTION_ONE, QUESTION_ONE] },
      error: null,
    })
    await expect(filterTytSocialQuestionIds(
      admin,
      '30000000-0000-4000-8000-000000000001',
      [QUESTION_ONE],
    )).rejects.toThrow('tyt_social_candidate_filter_failed')
  })

  it('issues an atomic verified exam with ordered source provenance', async () => {
    const items = Array.from({ length: 40 }, (_, index) => ({
      questionId: `20000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      sourceBucket: index === 0 ? 'wrong' as const : 'coverage' as const,
    }))
    rpc.mockResolvedValue({
      data: {
        attemptId: ATTEMPT_ID,
        expiresAt: FUTURE,
        plannedDurationSec: 2700,
        status: 'issued',
        replayed: false,
        snapshot: {
          items: items.map((item, index) => ({
            ...normalSnapshotItem(item.questionId, index + 1),
            position: index,
            sourceBucket: item.sourceBucket,
          })),
        },
      },
      error: null,
    })
    const result = await issueVerifiedExamAttempt(admin, {
      userId: '30000000-0000-4000-8000-000000000001',
      game: 'matematik',
      examRef: 'TYT',
      blueprintVersion: 'personalized-mock-v1',
      items,
      plannedDurationSec: 2700,
      requestId: '40000000-0000-4000-8000-000000000001',
    })

    expect(rpc).toHaveBeenCalledWith('issue_verified_exam_attempt', expect.objectContaining({
      p_user_id: '30000000-0000-4000-8000-000000000001',
      p_game: 'matematik',
      p_exam_ref: 'TYT',
      p_blueprint_version: 'personalized-mock-v1',
      p_duration_sec: 3000,
      p_planned_duration_sec: 2700,
      p_request_id: '40000000-0000-4000-8000-000000000001',
    }))
    const rpcItems = rpc.mock.calls[0][1].p_items
    expect(rpcItems).toHaveLength(40)
    expect(rpcItems[0]).toEqual({
      position: 0,
      questionId: items[0].questionId,
      sourceBucket: 'wrong',
    })
    expect(result).toEqual({
      attemptId: ATTEMPT_ID,
      expiresAt: FUTURE,
      strategyEligible: true,
      blueprintVersion: 'personalized-mock-v1',
    })
    expect(result.questionSnapshots).toHaveLength(40)
    expect({ ...result }).not.toHaveProperty('questionSnapshots')
  })

  it('routes a TYT Social smart mock to the policy-aware exam issuer', async () => {
    const items = Array.from({ length: 40 }, (_, index) => ({
      questionId: `20000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      sourceBucket: 'coverage' as const,
    }))
    rpc.mockResolvedValue({
      data: {
        attemptId: ATTEMPT_ID,
        expiresAt: FUTURE,
        plannedDurationSec: 1500,
        status: 'issued',
        replayed: false,
        snapshot: {
          items: items.map((item, index) => ({
            ...normalSnapshotItem(item.questionId, index + 1, 'sosyal'),
            position: index,
            sourceBucket: item.sourceBucket,
          })),
        },
      },
      error: null,
    })

    await issueVerifiedExamAttempt(admin, {
      userId: '30000000-0000-4000-8000-000000000001',
      game: 'sosyal',
      examRef: 'TYT',
      blueprintVersion: 'personalized-mock-v1',
      items,
      plannedDurationSec: 1500,
      requestId: '40000000-0000-4000-8000-000000000001',
    })

    expect(rpc).toHaveBeenCalledWith(
      'issue_verified_tyt_social_exam_attempt',
      expect.objectContaining({
        p_user_id: '30000000-0000-4000-8000-000000000001',
        p_blueprint_version: 'personalized-mock-v1',
        p_duration_sec: 1800,
        p_planned_duration_sec: 1500,
      }),
    )
  })

  it('rejects duplicate exam items and a planned duration outside the verified TTL', async () => {
    const base = {
      userId: '30000000-0000-4000-8000-000000000001',
      game: 'matematik' as const,
      examRef: 'TYT',
      blueprintVersion: 'personalized-mock-v1',
      requestId: '40000000-0000-4000-8000-000000000001',
    }
    const items = Array.from({ length: 40 }, (_, index) => ({
      questionId: `20000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      sourceBucket: 'coverage' as const,
    }))
    await expect(issueVerifiedExamAttempt(admin, {
      ...base,
      items: [...items.slice(0, 39), { ...items[0] }],
      plannedDurationSec: 2700,
    })).rejects.toThrow('verified_exam_attempt_issue_failed')
    await expect(issueVerifiedExamAttempt(admin, {
      ...base,
      items,
      plannedDurationSec: 3000,
    })).rejects.toThrow('verified_exam_attempt_issue_failed')
    expect(rpc).not.toHaveBeenCalled()
  })

  it('rejects empty and over-limit sets before calling the RPC', async () => {
    await expect(issueVerifiedAttempt(admin, validInput([])))
      .rejects.toThrow('verified_attempt_issue_failed')
    await expect(issueVerifiedAttempt(
      admin,
      validInput(Array.from({ length: 101 }, (_, index) => `question-${index}`)),
    )).rejects.toThrow('verified_attempt_issue_failed')
    expect(rpc).not.toHaveBeenCalled()
  })

  it('normalizes a returned RPC error', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'XX000', message: 'secret' } })
    await expect(issueVerifiedAttempt(admin, validInput()))
      .rejects.toThrow('verified_attempt_issue_failed')
  })

  it('normalizes a rejected RPC promise', async () => {
    rpc.mockRejectedValue(new Error('network detail'))
    await expect(issueVerifiedAttempt(admin, validInput()))
      .rejects.toThrow('verified_attempt_issue_failed')
  })

  it.each([
    ['null payload', null],
    ['malformed payload', { unexpected: true }],
    ['invalid UUID', { attemptId: 'not-a-uuid', expiresAt: FUTURE }],
    ['invalid datetime', { attemptId: ATTEMPT_ID, expiresAt: 'not-a-date' }],
  ])('rejects %s', async (_label, data) => {
    rpc.mockResolvedValue({ data, error: null })
    await expect(issueVerifiedAttempt(admin, validInput()))
      .rejects.toThrow('verified_attempt_issue_failed')
  })

  it('rejects an already-expired ticket', async () => {
    rpc.mockResolvedValue({
      data: { attemptId: ATTEMPT_ID, expiresAt: '2026-08-08T08:59:59.000Z' },
      error: null,
    })
    await expect(issueVerifiedAttempt(admin, validInput()))
      .rejects.toThrow('verified_attempt_issue_failed')
  })

  it('reads owner snapshots with the explicit active/replay policy', async () => {
    rpc.mockResolvedValue({
      data: { items: [normalSnapshotItem(QUESTION_ONE, 1)] },
      error: null,
    })
    const snapshots = await readVerifiedAttemptQuestionSnapshots(admin, {
      attemptId: ATTEMPT_ID,
      userId: '30000000-0000-4000-8000-000000000001',
      requireActive: false,
    })
    expect(snapshots).toHaveLength(1)
    expect(rpc).toHaveBeenCalledWith('get_verified_attempt_question_snapshots', {
      p_attempt_id: ATTEMPT_ID,
      p_user_id: '30000000-0000-4000-8000-000000000001',
      p_require_active: false,
    })
  })

  it('normalizes owner, missing and inactive snapshot reads without leaking DB detail', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'private detail' } })
    await expect(readVerifiedAttemptQuestionSnapshots(admin, {
      attemptId: ATTEMPT_ID,
      userId: '30000000-0000-4000-8000-000000000001',
    })).rejects.toThrow('verified_attempt_snapshot_denied')
  })

  // PGRST202 = RPC sema onbelleginde yok (migration sonrasi reload edilmemis).
  // Yetki reddi degil altyapi kusuru: 403'e esleseydi ogrenciye "denemen
  // gecersiz" derdik. Ayri sinif + kod, cagiranin 503 dondurmesini saglar.
  it.each(['PGRST202', 'PGRST301', '57P03', '53300', '40001', '57014'])(
    'altyapi kodu %s icin yetki reddinden ayri sinif firlatir',
    async (code) => {
      rpc.mockResolvedValue({ data: null, error: { code, message: 'private detail' } })
      await expect(readVerifiedAttemptQuestionSnapshots(admin, {
        attemptId: ATTEMPT_ID,
        userId: '30000000-0000-4000-8000-000000000001',
      })).rejects.toThrow('verified_attempt_snapshot_unavailable')
    },
  )

  it('altyapi hatasinda kodu teshis icin cause olarak tasir, mesaji sizdirmaz', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'private detail' } })
    // Mesaj koda birebir esit: DB detayinin sizmadigini da kanitlar.
    await expect(readVerifiedAttemptQuestionSnapshots(admin, {
      attemptId: ATTEMPT_ID,
      userId: '30000000-0000-4000-8000-000000000001',
    })).rejects.toMatchObject({
      message: 'verified_attempt_snapshot_unavailable',
      cause: 'PGRST202',
    })
  })

  it('bilinmeyen kodu genel okuma hatasi olarak birakir', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'XX999', message: 'private detail' } })
    await expect(readVerifiedAttemptQuestionSnapshots(admin, {
      attemptId: ATTEMPT_ID,
      userId: '30000000-0000-4000-8000-000000000001',
    })).rejects.toThrow('verified_attempt_snapshot_read_failed')
  })

  // Regresyon: supabase-js'in rpc gövdesi this.url/this.headers/this.fetch okur.
  // Metodu bağlamadan çıkarmak üretimde TypeError firlatiyordu; istek hiç
  // gönderilmediği için hata sessizce 500'e dönüşüyordu. Düz vi.fn() mock'u bu
  // sinifi yakalayamaz, bu yüzden burada this'e bağımlı gerçekçi bir istemci var.
  it('calls rpc bound to the client so a this-dependent implementation works', async () => {
    const boundClient = {
      url: 'https://example.supabase.co/rest/v1',
      rpc(this: { url?: string } | undefined, name: string, args: Record<string, unknown>) {
        // this yoksa burasi TypeError firlatir - tam olarak uretimdeki davranis.
        if (typeof this?.url !== 'string') throw new TypeError('rpc called without a bound client')
        return Promise.resolve({
          data: { items: [normalSnapshotItem(QUESTION_ONE, 1)] },
          error: null,
          calledWith: [name, args],
        })
      },
    } as unknown as SupabaseClient<Database>

    const snapshots = await readVerifiedAttemptQuestionSnapshots(boundClient, {
      attemptId: ATTEMPT_ID,
      userId: '30000000-0000-4000-8000-000000000001',
    })
    expect(snapshots).toHaveLength(1)
  })
})
