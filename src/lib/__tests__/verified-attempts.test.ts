import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.client'
import {
  filterTytSocialQuestionIds,
  getVerifiedAttemptDurationSec,
  issueVerifiedAttempt,
  issueVerifiedExamAttempt,
  issueVerifiedTytSocialOfficialSection,
  readTytSocialLearningSnapshot,
  readVerifiedAttemptQuestionSnapshots,
} from '../verified-attempts'

const ATTEMPT_ID = '10000000-0000-4000-8000-000000000001'
const QUESTION_ONE = '20000000-0000-4000-8000-000000000001'
const QUESTION_TWO = '20000000-0000-4000-8000-000000000002'
const NOW = '2026-08-08T09:00:00.000Z'
const FUTURE = '2026-08-08T10:00:00.000Z'
const SOCIAL_EVENT_ID = '70000000-0000-4000-8000-000000000001'
const SOCIAL_EPOCH = {
  policyVersion: 'tyt-social-2026-v1',
  selectionEventId: SOCIAL_EVENT_ID,
}

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

function activeSocialLearningSnapshot(allowedQuestionIds: string[], states: unknown[] = []) {
  return {
    context: {
      status: 'active',
      available: true,
      reason: null,
      policyVersion: SOCIAL_EPOCH.policyVersion,
      taxonomyVersion: 'ba-tyt-sosyal-v1',
      variant: 'questions_16_20',
      selectionEventId: SOCIAL_EPOCH.selectionEventId,
      selectionEffectiveAt: '2026-08-08T08:00:00.000Z',
      allowedCategories: ['cografya', 'din_kulturu', 'felsefe', 'sosyoloji', 'tarih'],
      rebuildRequired: false,
      legacyAggregateUsed: false,
    },
    states,
    allowedQuestionIds,
  }
}

function inactiveSocialLearningSnapshot() {
  return {
    context: {
      status: 'setup_required', available: false, reason: 'selection-required',
      policyVersion: SOCIAL_EPOCH.policyVersion, taxonomyVersion: 'ba-tyt-sosyal-v1',
      variant: null, selectionEventId: null, selectionEffectiveAt: null,
      allowedCategories: [], rebuildRequired: false, legacyAggregateUsed: false,
    },
    states: [], allowedQuestionIds: [],
  }
}

function socialMasteryState() {
  return {
    outcome_id: '80000000-0000-4000-8000-000000000001',
    attempts: 2, correct_attempts: 1, weighted_earned: '1.5', weighted_possible: '3',
    delayed_correct: 0, v2_attempts: 2,
    difficulty_weighted_earned: '1.5', difficulty_weighted_possible: '3',
    timed_attempts: 2, total_time_sec: '45', fast_wrong: 0,
    hinted_attempts: 0, hint_stage_sum: '0', guess_annotations: 0,
    careless_annotations: 0, verified_evidence_days: 1, last_answered_at: NOW,
  }
}

function socialIssuance(
  kind: 'practice' | 'exam',
  tytSocialEpoch?: typeof SOCIAL_EPOCH,
  game: 'sosyal' | 'matematik' = 'sosyal',
) {
  const items = Array.from({ length: kind === 'exam' ? 40 : 1 }, (_, index) => ({
    questionId: `20000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    sourceBucket: 'coverage' as const,
  }))
  const input = {
    ...validInput(items.map(item => item.questionId)),
    game, examRef: 'TYT', requestId: '40000000-0000-4000-8000-000000000001',
    tytSocialEpoch,
  }
  const response = {
    attemptId: ATTEMPT_ID,
    expiresAt: FUTURE,
    ...(kind === 'exam' ? { plannedDurationSec: 1500, status: 'issued', replayed: false } : {}),
    snapshot: {
      items: items.map((item, index) => ({
        ...normalSnapshotItem(item.questionId, index + 1, game),
        ...(kind === 'exam' ? { position: index, sourceBucket: item.sourceBucket } : {}),
      })),
    },
  }
  return {
    questionIds: input.questionIds,
    writer: kind === 'exam'
      ? 'issue_verified_tyt_social_exam_attempt_for_epoch'
      : 'issue_verified_tyt_social_attempt_for_epoch',
    failure: kind === 'exam' ? 'verified_exam_attempt_issue_failed' : 'verified_attempt_issue_failed',
    response,
    issue: () => kind === 'exam'
      ? issueVerifiedExamAttempt(admin, {
        ...input, items, blueprintVersion: 'personalized-mock-v1', plannedDurationSec: 1500,
      })
      : issueVerifiedAttempt(admin, input),
  }
}

describe('verified attempts helper', () => {
  beforeEach(() => {
    vi.stubEnv('TYT_SOCIAL_V2_LEARNER_ENABLED', 'true')
    vi.stubEnv('NEXT_PUBLIC_TYT_SOCIAL_V2_ENABLED', 'true')
    vi.useFakeTimers()
    vi.setSystemTime(new Date(NOW))
    rpc.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
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
      tytSocialEpoch: SOCIAL_EPOCH,
    })

    expect(rpc).toHaveBeenLastCalledWith('issue_verified_tyt_social_attempt_for_epoch', {
      p_user_id: '30000000-0000-4000-8000-000000000001',
      p_mode: 'practice',
      p_question_ids: [QUESTION_ONE],
      p_duration_sec: 7200,
      p_request_id: requestId,
      p_expected_policy_version: SOCIAL_EPOCH.policyVersion,
      p_expected_selection_event_id: SOCIAL_EPOCH.selectionEventId,
    })
    expect(rpc).toHaveBeenCalledTimes(1)

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
    expect(rpc).toHaveBeenCalledTimes(1)
  })

  it('falls back to the generic issuer while the learner rollout is disabled', async () => {
    vi.stubEnv('TYT_SOCIAL_V2_LEARNER_ENABLED', 'false')
    vi.stubEnv('NEXT_PUBLIC_TYT_SOCIAL_V2_ENABLED', 'false')
    rpc.mockResolvedValue({
      data: {
        attemptId: ATTEMPT_ID,
        expiresAt: FUTURE,
        snapshot: { items: [normalSnapshotItem(QUESTION_ONE, 1, 'sosyal')] },
      },
      error: null,
    })

    await issueVerifiedAttempt(admin, {
      userId: '30000000-0000-4000-8000-000000000001',
      game: 'sosyal',
      mode: 'practice',
      questionIds: [QUESTION_ONE],
      examRef: 'TYT',
    })

    expect(rpc).toHaveBeenCalledWith('issue_verified_attempt', expect.objectContaining({
      p_game: 'sosyal',
      p_mode: 'practice',
    }))
    expect(rpc).not.toHaveBeenCalledWith('issue_verified_tyt_social_attempt', expect.anything())
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
    expect(rpc).toHaveBeenCalledTimes(1)
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
    ['40001', 'TYT Social selection epoch changed', 'tyt_social_section_unavailable'],
    ['XX999', 'private branch detail', 'tyt_social_section_issue_failed'],
  ])('maps official section SQLSTATE %s without leaking DB detail', async (code, message, expected) => {
    rpc.mockResolvedValue({ data: null, error: { code, message } })
    await expect(issueVerifiedTytSocialOfficialSection(admin, {
      userId: '30000000-0000-4000-8000-000000000001',
      requestId: '40000000-0000-4000-8000-000000000001',
    })).rejects.toThrow(expected)
  })

  it('validates the service-only TYT Social combined learning snapshot', async () => {
    rpc.mockResolvedValue({
      data: activeSocialLearningSnapshot([QUESTION_TWO, QUESTION_ONE]),
      error: null,
    })

    await expect(filterTytSocialQuestionIds(
      admin,
      '30000000-0000-4000-8000-000000000001',
      [QUESTION_ONE, QUESTION_TWO],
    )).resolves.toEqual([QUESTION_TWO, QUESTION_ONE])
    expect(rpc).toHaveBeenCalledWith('read_tyt_social_learning_snapshot', {
      p_user_id: '30000000-0000-4000-8000-000000000001',
      p_question_ids: [QUESTION_ONE, QUESTION_TWO],
    })

    rpc.mockResolvedValue({
      data: activeSocialLearningSnapshot([QUESTION_ONE, QUESTION_ONE]),
      error: null,
    })
    await expect(filterTytSocialQuestionIds(
      admin,
      '30000000-0000-4000-8000-000000000001',
      [QUESTION_ONE],
    )).rejects.toThrow('tyt_social_candidate_filter_failed')
  })

  it('keeps an inactive learning snapshot empty and explicit', async () => {
    rpc.mockResolvedValue({
      data: inactiveSocialLearningSnapshot(),
      error: null,
    })
    await expect(readTytSocialLearningSnapshot(
      admin,
      '30000000-0000-4000-8000-000000000001',
      [QUESTION_ONE],
    )).resolves.toEqual({
      status: 'setup_required', context: null, states: [], allowedQuestionIds: [],
    })
  })

  it.each([
    ['no evidence', []],
    ['scoped evidence', [socialMasteryState()]],
  ])('accepts active empty eligibility with %s while retaining the exact epoch', async (_label, states) => {
    rpc.mockResolvedValue({ data: activeSocialLearningSnapshot([], states), error: null })

    await expect(readTytSocialLearningSnapshot(
      admin, validInput().userId, [QUESTION_ONE, QUESTION_ONE],
    )).resolves.toMatchObject({
      status: 'active', context: SOCIAL_EPOCH, states, allowedQuestionIds: [],
    })
    expect(rpc).toHaveBeenCalledExactlyOnceWith('read_tyt_social_learning_snapshot', {
      p_user_id: validInput().userId, p_question_ids: [QUESTION_ONE],
    })
  })

  it.each([
    ['missing payload', null],
    ['unknown envelope key', { ...activeSocialLearningSnapshot([]), unexpected: true }],
    ['unknown context key', {
      ...activeSocialLearningSnapshot([]),
      context: { ...activeSocialLearningSnapshot([]).context, unexpected: true },
    }],
    ['malformed active context with empty data', {
      ...activeSocialLearningSnapshot([]),
      context: { ...activeSocialLearningSnapshot([]).context, selectionEventId: null },
    }],
    ['malformed inactive context with empty data', {
      ...inactiveSocialLearningSnapshot(),
      context: { ...inactiveSocialLearningSnapshot().context, variant: 'questions_16_20' },
    }],
    ['inactive context with contradictory availability', {
      ...inactiveSocialLearningSnapshot(),
      context: { ...inactiveSocialLearningSnapshot().context, available: true },
    }],
    ['inactive context with evidence', {
      ...inactiveSocialLearningSnapshot(), states: [socialMasteryState()],
    }],
    ['inactive context with candidates', {
      ...inactiveSocialLearningSnapshot(), allowedQuestionIds: [QUESTION_ONE],
    }],
    ['duplicate candidate IDs', activeSocialLearningSnapshot([QUESTION_ONE, QUESTION_ONE])],
    ['candidate outside the requested IDs', activeSocialLearningSnapshot([QUESTION_TWO])],
    ['duplicate outcome states', activeSocialLearningSnapshot([], [socialMasteryState(), socialMasteryState()])],
    ['invalid outcome UUID', activeSocialLearningSnapshot([], [{ ...socialMasteryState(), outcome_id: 'invalid' }])],
    ['incomplete state', activeSocialLearningSnapshot([], [{ outcome_id: socialMasteryState().outcome_id }])],
    ['invalid state metric', activeSocialLearningSnapshot([], [{ ...socialMasteryState(), attempts: -1 }])],
    ['unknown state key', activeSocialLearningSnapshot([], [{ ...socialMasteryState(), unexpected: true }])],
  ])('fails closed for %s in the combined learning snapshot', async (_label, data) => {
    rpc.mockResolvedValue({ data, error: null })
    await expect(readTytSocialLearningSnapshot(admin, validInput().userId, [QUESTION_ONE]))
      .rejects.toMatchObject({ message: 'tyt_social_learning_snapshot_failed' })
    expect(rpc).toHaveBeenCalledTimes(1)
  })

  it.each(['PGRST202', '40001'])('normalizes combined-reader error %s without another RPC', async (code) => {
    rpc.mockResolvedValue({ data: null, error: { code, message: 'TYT Social selection epoch changed' } })
    await expect(readTytSocialLearningSnapshot(admin, validInput().userId, [QUESTION_ONE]))
      .rejects.toMatchObject({ message: 'tyt_social_learning_snapshot_failed' })
    expect(rpc).toHaveBeenCalledExactlyOnceWith('read_tyt_social_learning_snapshot', {
      p_user_id: validInput().userId, p_question_ids: [QUESTION_ONE],
    })
  })

  it('normalizes a rejected combined-reader promise', async () => {
    rpc.mockRejectedValue(new Error('private transport detail'))
    await expect(readTytSocialLearningSnapshot(admin, validInput().userId, [QUESTION_ONE]))
      .rejects.toMatchObject({ message: 'tyt_social_learning_snapshot_failed' })
  })

  describe.each(['practice', 'exam'] as const)('TYT Social %s epoch issuance', (kind) => {
    it('reads one combined snapshot and binds the following write to its event UUID', async () => {
      const issuance = socialIssuance(kind)
      const selected = activeSocialLearningSnapshot(issuance.questionIds)
      selected.context.selectionEventId = '70000000-0000-4000-8000-000000000002'
      rpc.mockResolvedValueOnce({ data: selected, error: null })
        .mockResolvedValueOnce({ data: issuance.response, error: null })

      await expect(issuance.issue()).resolves.toMatchObject({ attemptId: ATTEMPT_ID })
      expect(rpc).toHaveBeenCalledTimes(2)
      expect(rpc).toHaveBeenNthCalledWith(1, 'read_tyt_social_learning_snapshot', {
        p_user_id: validInput().userId, p_question_ids: issuance.questionIds,
      })
      expect(rpc).toHaveBeenNthCalledWith(2, issuance.writer, expect.objectContaining({
        p_expected_policy_version: selected.context.policyVersion,
        p_expected_selection_event_id: selected.context.selectionEventId,
      }))
    })

    it('preserves a supplied event through an ABA selection change and returns the epoch conflict', async () => {
      const issuance = socialIssuance(kind, SOCIAL_EPOCH)
      // A -> B -> A has the same variant but a new event. Re-reading it would
      // incorrectly authorize questions selected using the original A event.
      rpc.mockImplementation(async (name: string) => name === issuance.writer
        ? { data: null, error: { code: '40001', message: 'TYT Social selection epoch changed' } }
        : {
          data: {
            ...activeSocialLearningSnapshot(issuance.questionIds),
            context: {
              ...activeSocialLearningSnapshot([]).context,
              selectionEventId: '70000000-0000-4000-8000-000000000003',
            },
          },
          error: null,
        })

      await expect(issuance.issue()).rejects.toMatchObject({ message: 'tyt_social_selection_epoch_changed' })
      expect(rpc).toHaveBeenCalledExactlyOnceWith(issuance.writer, expect.objectContaining({
        p_expected_policy_version: SOCIAL_EPOCH.policyVersion,
        p_expected_selection_event_id: SOCIAL_EPOCH.selectionEventId,
      }))
      expect(rpc.mock.calls[0][1]).not.toHaveProperty('p_expected_variant')
    })

    it('fails closed when the combined reader is missing without trying a legacy issuer', async () => {
      const issuance = socialIssuance(kind)
      rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'private missing RPC detail' } })
      await expect(issuance.issue()).rejects.toMatchObject({ message: issuance.failure })
      expect(rpc).toHaveBeenCalledExactlyOnceWith('read_tyt_social_learning_snapshot', {
        p_user_id: validInput().userId, p_question_ids: issuance.questionIds,
      })
    })

    it('does not write when an active snapshot rejects the requested candidates', async () => {
      const issuance = socialIssuance(kind)
      rpc.mockResolvedValue({ data: activeSocialLearningSnapshot([]), error: null })
      await expect(issuance.issue()).rejects.toMatchObject({ message: issuance.failure })
      expect(rpc).toHaveBeenCalledTimes(1)
    })

    it.each([
      ['40001', 'could not serialize access due to concurrent update'],
      ['40001', 'TYT Social selection epoch changed: private detail'],
      ['P0001', 'TYT Social selection epoch changed'],
    ])('keeps unrelated SQLSTATE/message %s / %s generic', async (code, message) => {
      const issuance = socialIssuance(kind, SOCIAL_EPOCH)
      rpc.mockResolvedValue({ data: null, error: { code, message } })
      await expect(issuance.issue()).rejects.toMatchObject({ message: issuance.failure })
      expect(rpc).toHaveBeenCalledTimes(1)
    })

    it('does not classify a generic issuer serialization failure as an epoch conflict', async () => {
      const issuance = socialIssuance(kind, SOCIAL_EPOCH, 'matematik')
      rpc.mockResolvedValue({ data: null, error: { code: '40001', message: 'TYT Social selection epoch changed' } })
      await expect(issuance.issue()).rejects.toMatchObject({ message: issuance.failure })
      expect(rpc.mock.calls.map(call => call[0])).toEqual([
        kind === 'exam' ? 'issue_verified_exam_attempt' : 'issue_verified_attempt',
      ])
    })

    it('normalizes a rejected epoch-writer promise', async () => {
      const issuance = socialIssuance(kind, SOCIAL_EPOCH)
      rpc.mockRejectedValue(new Error('private transport detail'))
      await expect(issuance.issue()).rejects.toMatchObject({ message: issuance.failure })
    })
  })

  it('keeps frozen-plan serialization failures generic without reading the current epoch', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '40001', message: 'TYT Social selection epoch changed' } })
    await expect(issueVerifiedAttempt(admin, {
      ...validInput(), game: 'sosyal', examRef: 'TYT', tytSocialEpoch: SOCIAL_EPOCH,
      sourcePlanId: '60000000-0000-4000-8000-000000000001',
    })).rejects.toMatchObject({ message: 'verified_attempt_issue_failed' })
    expect(rpc.mock.calls.map(call => call[0])).toEqual(['issue_verified_tyt_social_plan_attempt'])
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
      tytSocialEpoch: SOCIAL_EPOCH,
    })

    expect(rpc).toHaveBeenCalledWith(
      'issue_verified_tyt_social_exam_attempt_for_epoch',
      expect.objectContaining({
        p_user_id: '30000000-0000-4000-8000-000000000001',
        p_blueprint_version: 'personalized-mock-v1',
        p_duration_sec: 1800,
        p_planned_duration_sec: 1500,
        p_expected_policy_version: SOCIAL_EPOCH.policyVersion,
        p_expected_selection_event_id: SOCIAL_EPOCH.selectionEventId,
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
