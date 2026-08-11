import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetFirstQuestionAttempt } = vi.hoisted(() => ({
  mockGetFirstQuestionAttempt: vi.fn(),
}))

vi.mock('@/lib/questions/attempt-store', () => ({
  getFirstQuestionAttempt: mockGetFirstQuestionAttempt,
}))

import {
  ACTIVATION_REWARD_COOKIE,
  activationActorKey,
  claimActivationReward,
  createActivationRewardToken,
  readActivationRewardCookie,
  verifyActivationRewardToken,
} from '../server-reward'

const QUESTION_IDS = [
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000003',
]

describe('activation reward ticket', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.ACTIVATION_REWARD_SECRET = 'test-activation-secret-with-at-least-32-characters'
  })

  it('signs, verifies and reads the HttpOnly-cookie value without trusting payload edits', () => {
    const token = createActivationRewardToken(QUESTION_IDS)
    const parsed = verifyActivationRewardToken(token)

    expect(parsed?.questionIds).toEqual(QUESTION_IDS)
    expect(readActivationRewardCookie(`foo=1; ${ACTIVATION_REWARD_COOKIE}=${encodeURIComponent(token!)}; bar=2`))
      .toBe(token)
    expect(verifyActivationRewardToken(`${token}tampered`)).toBeNull()
  })

  it('rejects duplicate or non-UUID issued question sets', () => {
    expect(createActivationRewardToken([QUESTION_IDS[0], QUESTION_IDS[0]])).toBeNull()
    expect(createActivationRewardToken(['not-a-uuid'])).toBeNull()
  })

  it('recomputes correctness from first server attempts and sends only the bounded total to the atomic RPC', async () => {
    const token = createActivationRewardToken(QUESTION_IDS)!
    const parsed = verifyActivationRewardToken(token)!
    mockGetFirstQuestionAttempt
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(0)

    const inQuery = vi.fn(async () => ({
      data: [
        { id: QUESTION_IDS[0], content: { options: ['a', 'b', 'c'], answer: 2 } },
        { id: QUESTION_IDS[1], content: { options: ['a', 'b', 'c'], answer: 0 } },
        { id: QUESTION_IDS[2], content: { options: ['a', 'b', 'c'], correct: 0 } },
      ],
      error: null,
    }))
    const rpc = vi.fn(async () => ({
      data: { xpAwarded: 100, alreadyProcessed: false },
      error: null,
    }))
    const admin = {
      from: vi.fn(() => ({ select: vi.fn(() => ({ in: inQuery })) })),
      rpc,
    }

    await expect(claimActivationReward(admin as never, 'user-1', token)).resolves.toEqual({
      xpAwarded: 100,
      alreadyProcessed: false,
    })
    expect(mockGetFirstQuestionAttempt).toHaveBeenNthCalledWith(
      1,
      activationActorKey(parsed.sessionId),
      QUESTION_IDS[0],
    )
    expect(rpc).toHaveBeenCalledWith('claim_activation_reward', {
      p_user_id: 'user-1',
      p_claim_id: parsed.sessionId,
      p_amount: 100,
    })
  })

  it('does not claim an incomplete three-question ticket', async () => {
    const token = createActivationRewardToken(QUESTION_IDS)!
    mockGetFirstQuestionAttempt
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(0)
    const admin = { from: vi.fn(), rpc: vi.fn() }

    await expect(claimActivationReward(admin as never, 'user-1', token)).resolves.toBeNull()
    expect(admin.from).not.toHaveBeenCalled()
    expect(admin.rpc).not.toHaveBeenCalled()
  })
})
