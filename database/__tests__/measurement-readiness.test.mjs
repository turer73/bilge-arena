import { describe, expect, it } from 'vitest'
import { measurementReadinessSql } from '../measurement-readiness.mjs'
describe('measurement readiness audit',()=>{
 it('uses current source authority and excludes draft status from live counts',()=>{
  const sql=measurementReadinessSql()
  expect(sql).toContain('question_revision_single_review_ready(q.published_revision_id)')
  expect(sql).toContain('q.is_active')
  expect(sql).toContain('four_option_draft')
 })
 it('cannot mutate or manufacture calibration and needs no new table',()=>{
  const sql=measurementReadinessSql()
  expect(sql).toContain('REPEATABLE READ READ ONLY')
  expect(sql).toContain("'calibrated',false")
  expect(sql).not.toMatch(/\b(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER)\b/i)
  expect(sql).not.toContain('measurement_sessions')
 })
})
