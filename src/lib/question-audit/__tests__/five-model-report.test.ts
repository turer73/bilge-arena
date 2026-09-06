import { describe, expect, it } from 'vitest'
import { PROMPT_VERSION } from '../prompts'
import { buildFiveModelReport, type FiveModelRunRow } from '../five-model-report'

const q = '11111111-1111-4111-8111-111111111111'
const r = '22222222-2222-4222-8222-222222222222'
const hash = 'a'.repeat(64)
const subject = { questionId: q, revisionId: r, contentSha256: hash, policyVersion: 'question-quality@2', revisionStatus: 'draft', questionText: '2+2?', options: ['1', '2', '3', '4'], markedAnswerIndex: 3 }
const identities = [
  ['deepseek:deepseek-chat', 'deepseek-chat'], ['gemini:gemini-2.5-flash-lite', 'gemini-2.5-flash-lite'], ['openai:gpt-5.6-terra', 'gpt-5.6-terra'], ['openai:gpt-5.6-luna', 'gpt-5.6-luna'], ['openai:gpt-5.6-sol', 'gpt-5.6-sol'],
] as const
function row(n: number, over: Partial<FiveModelRunRow> = {}): FiveModelRunRow {
  return { question_id: q, revision_id: r, content_sha256: hash, agent: 'blind_solver', sample_index: 0, provider_id: identities[n]![0], model_id: identities[n]![1], prompt_version: PROMPT_VERSION.blindSolver, policy_version: 'question-quality@2', generation_config: { blindSamples: 1 }, generation_config_sha256: 'b'.repeat(64), run_id: '33333333-3333-4333-8333-333333333333', status: 'ok', parsed_output: { reasoning: 'Kısa çözüm', predictedAnswerIndex: 3, computedValue: null }, input_snapshot: { questionId: q, revisionId: r, contentSha256: hash, questionText: subject.questionText, options: subject.options, markedAnswerIndex: subject.markedAnswerIndex }, executed_at: '2026-09-06T10:00:00.000Z', ...over }
}

describe('buildFiveModelReport', () => {
  it('beş güvenilir, güncel, kanonik kör çözücü sonucunu gözlemsel uzlaşma yapar', () => {
    const report = buildFiveModelReport(subject, identities.map((_, n) => row(n)))
    expect(report).toMatchObject({ completedModels: 5, agreement: 'unanimous', matchesKey: true, requiredModels: 5 })
    expect(JSON.stringify(report)).not.toContain('input_snapshot')
  })
  it('daha yeni başarısız giriş eski başarıya düşmez', () => {
    const rows = identities.map((_, n) => row(n))
    rows[0] = row(0, { status: 'failed', parsed_output: null, executed_at: '2026-09-06T11:00:00.000Z' })
    const report = buildFiveModelReport(subject, rows)
    expect(report.models[0]).toMatchObject({ status: 'failed', answerIndex: null })
    expect(report.agreement).toBe('incomplete')
  })
  it('aynı örnek veya aynı anda farklı kimlik fail-closed conflict olur', () => {
    const report = buildFiveModelReport(subject, [row(0), row(0), ...identities.slice(1).map((_, n) => row(n + 1))])
    expect(report.models[0]!.status).toBe('conflict')
  })
  it('sınırlı okuma hiçbir zaman tamamlanmış uzlaşma değildir', () => {
    const report = buildFiveModelReport(subject, identities.map((_, n) => row(n)), true)
    expect(report).toMatchObject({ capped: true, agreement: 'incomplete', matchesKey: null })
  })
  it('şık dışı null cevap, hesaplanan değerle tamamlanır ama anahtarı doğrulamaz', () => {
    const rows = identities.map((_, n) => row(n, { parsed_output: { reasoning: 'Şıklarda yok', predictedAnswerIndex: null, computedValue: '-1' } }))
    const report = buildFiveModelReport(subject, rows)
    expect(report).toMatchObject({ completedModels: 5, agreement: 'unanimous', matchesKey: false })
    expect(report.warnings.join(' ')).toContain('şık')
  })
  it('başka rol, politika veya snapshot bağlamı kanıt sayılmaz', () => {
    const rows = identities.map((_, n) => row(n))
    rows[0] = row(0, { agent: 'solution_verifier' })
    rows[1] = row(1, { input_snapshot: { questionId: q, revisionId: r, contentSha256: hash, options: ['x', 'y'] } })
    const report = buildFiveModelReport(subject, rows)
    expect(report.models[0]!.status).toBe('missing')
    expect(report.models[1]!.status).toBe('invalid')
  })
  it('run/config kimliği karışmış veya örnek aralığı eksik kohortu conflict yapar', () => {
    const rows = identities.map((_, n) => row(n))
    rows[0] = row(0, { generation_config: { blindSamples: 2 } })
    const mixed = buildFiveModelReport(subject, rows)
    expect(mixed.models[0]!.status).toBe('conflict')
    const holes = identities.map((_, n) => row(n, { generation_config: { blindSamples: 2 } }))
    const report = buildFiveModelReport(subject, holes)
    expect(report.models[0]!.status).toBe('conflict')
  })
  it('farklı null computedValue uzlaşmaz; bozuk zaman ve metadata fail-closed olur', () => {
    const rows = identities.map((_, n) => row(n, { parsed_output: { reasoning: 'Şıklarda yok', predictedAnswerIndex: null, computedValue: String(n) } }))
    expect(buildFiveModelReport(subject, rows).agreement).toBe('disagreement')
    rows[0] = row(0, { executed_at: null })
    expect(buildFiveModelReport(subject, rows).models[0]!.status).toBe('invalid')
    rows[0] = row(0, { question_id: '44444444-4444-4444-8444-444444444444' })
    expect(buildFiveModelReport(subject, rows).models[0]!.status).toBe('missing')
  })
  it('aynı modelin çoklu null örneğinde değer çelişkisi conflict olur', () => {
    const first = row(0, { generation_config: { blindSamples: 2 }, parsed_output: { reasoning: 'Yok', predictedAnswerIndex: null, computedValue: '-1' } })
    const second = row(0, { generation_config: { blindSamples: 2 }, sample_index: 1, parsed_output: { reasoning: 'Yok', predictedAnswerIndex: null, computedValue: '-2' } })
    const report = buildFiveModelReport(subject, [first, second])
    expect(report.models[0]!.status).toBe('conflict')
  })
})
