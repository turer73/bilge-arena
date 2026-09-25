import { describe, expect, it } from 'vitest'
import type { Database } from '@/types/database.client'
import type { Database as GeneratedDatabase, Json } from '@/types/database.generated'

type ClientFunctions = Database['public']['Functions']
type GeneratedFunctions = GeneratedDatabase['public']['Functions']

type Equal<Left, Right> =
  (<T>() => T extends Left ? 1 : 2) extends
  (<T>() => T extends Right ? 1 : 2) ? true : false

type InheritedSocialRpc =
  | 'filter_tyt_social_question_candidates'
  | 'resolve_tyt_social_mastery_read_context'
  | 'issue_verified_tyt_social_attempt'
  | 'issue_verified_tyt_social_plan_attempt'
  | 'compose_and_issue_verified_tyt_social_section_attempt'
  | 'create_tyt_social_daily_plan_v2'
  | 'set_my_tyt_social_exam_policy'
  | 'issue_verified_tyt_social_exam_attempt'

// These values are checked by tsc; Vitest also keeps the contract in the suite.
const inheritedContracts: {
  [Name in InheritedSocialRpc]: Equal<ClientFunctions[Name], GeneratedFunctions[Name]>
} = {
  filter_tyt_social_question_candidates: true,
  resolve_tyt_social_mastery_read_context: true,
  issue_verified_tyt_social_attempt: true,
  issue_verified_tyt_social_plan_attempt: true,
  compose_and_issue_verified_tyt_social_section_attempt: true,
  create_tyt_social_daily_plan_v2: true,
  set_my_tyt_social_exam_policy: true,
  issue_verified_tyt_social_exam_attempt: true,
}

type SelectionArgs = ClientFunctions['set_my_tyt_social_exam_policy']['Args']
const selectionContract: {
  noticeIsString: Equal<SelectionArgs['p_notice_version'], string>
  noticeRequired: Omit<SelectionArgs, 'p_notice_version'> extends SelectionArgs ? false : true
} = { noticeIsString: true, noticeRequired: true }

type PolicyReadArgs = ClientFunctions['get_my_tyt_social_exam_policy']['Args']
type MasteryRow = ClientFunctions['read_tyt_social_mastery_outcome_state']['Returns'][number]
type GeneratedMasteryRow = GeneratedFunctions['read_tyt_social_mastery_outcome_state']['Returns'][number]

const emptyPolicyReadArgs: PolicyReadArgs = {}
const overrideContracts: {
  noExtraArgs: { p_user_id: string } extends PolicyReadArgs ? false : true
  emptyArgsDomain: Equal<PolicyReadArgs, Record<string, never>>
  nullableTimestamp: Equal<MasteryRow['last_answered_at'], string | null>
  remainingStateFields: Equal<
    Omit<MasteryRow, 'last_answered_at'>,
    Omit<GeneratedMasteryRow, 'last_answered_at'>
  >
} = {
  noExtraArgs: true,
  emptyArgsDomain: true,
  nullableTimestamp: true,
  remainingStateFields: true,
}

type EpochWriterRpc =
  | 'create_tyt_social_daily_plan_for_epoch'
  | 'issue_verified_tyt_social_attempt_for_epoch'
  | 'issue_verified_tyt_social_exam_attempt_for_epoch'
type EpochRpc = 'read_tyt_social_learning_snapshot' | EpochWriterRpc
type ReaderArgs = ClientFunctions['read_tyt_social_learning_snapshot']['Args']
const readerArgsWithoutCandidates: ReaderArgs = { p_user_id: 'user-id' }
const readerArgsWithCandidates: ReaderArgs = { p_user_id: 'user-id', p_question_ids: ['question-id'] }
const readerContract: Equal<ReaderArgs, { p_user_id: string; p_question_ids?: string[] }> = true

const writerContracts: {
  [Name in EpochWriterRpc]: {
    epochFields: Equal<ClientFunctions[Name]['Args']['p_expected_policy_version'], string>
      & Equal<ClientFunctions[Name]['Args']['p_expected_selection_event_id'], string>
    policyRequired: Omit<ClientFunctions[Name]['Args'], 'p_expected_policy_version'> extends
      ClientFunctions[Name]['Args'] ? false : true
    selectionRequired: Omit<ClientFunctions[Name]['Args'], 'p_expected_selection_event_id'> extends
      ClientFunctions[Name]['Args'] ? false : true
  }
} = {
  create_tyt_social_daily_plan_for_epoch: {
    epochFields: true, policyRequired: true, selectionRequired: true,
  },
  issue_verified_tyt_social_attempt_for_epoch: {
    epochFields: true, policyRequired: true, selectionRequired: true,
  },
  issue_verified_tyt_social_exam_attempt_for_epoch: {
    epochFields: true, policyRequired: true, selectionRequired: true,
  },
}

const epochReturnContracts: {
  [Name in EpochRpc]: Equal<ClientFunctions[Name]['Returns'], Json>
} = {
  read_tyt_social_learning_snapshot: true,
  create_tyt_social_daily_plan_for_epoch: true,
  issue_verified_tyt_social_attempt_for_epoch: true,
  issue_verified_tyt_social_exam_attempt_for_epoch: true,
}

// Release checkpoint: migration 212 is local-only. Revisit this assertion only
// after an authoritative production schema refresh includes its RPCs.
const epochIsOverlayOnly: Extract<EpochRpc, keyof GeneratedFunctions> extends never ? true : false = true

describe('database client TYT Social contract', () => {
  it('inherits all eight released RPC signatures, including the required notice version', () => {
    expect(Object.values(inheritedContracts)).toEqual(Array(8).fill(true))
    expect(selectionContract).toEqual({ noticeIsString: true, noticeRequired: true })
  })

  it('replaces generated never arguments and preserves the nullable mastery timestamp', () => {
    expect(emptyPolicyReadArgs).toEqual({})
    expect(Object.values(overrideContracts)).toEqual(Array(4).fill(true))
  })

  it('keeps candidate IDs optional only on the combined learning reader', () => {
    expect(readerContract).toBe(true)
    expect(readerArgsWithoutCandidates).not.toHaveProperty('p_question_ids')
    expect(readerArgsWithCandidates.p_question_ids).toEqual(['question-id'])
  })

  it('requires both epoch fields on every writer and keeps four local RPCs outside generated types', () => {
    for (const contract of Object.values(writerContracts)) {
      expect(contract).toEqual({ epochFields: true, policyRequired: true, selectionRequired: true })
    }
    expect(Object.values(epochReturnContracts)).toEqual(Array(4).fill(true))
    expect(epochIsOverlayOnly).toBe(true)
  })
})
