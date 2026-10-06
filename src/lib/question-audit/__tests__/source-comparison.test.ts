import { describe, it, expect } from 'vitest'
import { buildSourceComparisonPrompt, evaluateSourceComparison, SOURCE_COMPARISON_VERSION, type SourceComparison } from '../source-comparison'
import type { QuestionDraft } from '../types'

const draft: QuestionDraft = {
  questionId: '11111111-1111-4111-8111-111111111111',
  revisionId: '22222222-2222-4222-8222-222222222222',
  contentSha256: 'a'.repeat(64), examRef:'LGS', subject:'matematik', topic:'toplama',
  questionText:'2+3 kaçtır?', passage:null, options:['3','4','5','6'], markedAnswerIndex:2, solutionText:'2+3=5.',
}
function fixture(): SourceComparison {
  return {
    format:SOURCE_COMPARISON_VERSION, questionId:draft.questionId, revisionId:draft.revisionId, contentSha256:draft.contentSha256,
    sources: [0,1].map(i => ({
      id:'s'+i,title:'TEST FIXTURE, not a real source',institutionOrAuthor:'Fixture '+i,
      editionOrDate:'2026',language:'tr',kind:i===0?'official_curriculum':'textbook',
      url:'https://example.org/book'+i,workId:'work'+i,independenceGroup:'group'+i,
      independenceRationale:'Fixture independent authors',access:'inspected_section',
      locator:'Fixture section 1',accessedAt:'2026-09-27T00:00:00Z',retrievalRef:'fixture-trace-'+i,
      retrievedTextSha256:String(i+1).repeat(64),
      license:{code:'UNKNOWN',url:null,checked:false,usage:'reference_only'},
    })),
    claims: ['stem','solution','curriculum','option0','option1','option2','option3'].map(target => ({
      id:target, target:target.startsWith('option')?'option':target as 'stem'|'solution'|'curriculum',
      optionIndex:target.startsWith('option')?Number(target.at(-1)):null,
      statement:'Fixture proposition '+target,reasoningSummary:'Fixture calculation',
      evidence:[0,1].map(i => ({sourceId:'s'+i,relation:'supports',locator:'Section 1',scopeMatch:true,scopeNote:'Fixture scope',explanation:'Fixture, not evidence'})),
    })),
    optionChecks:draft.options.map((_,index) => ({index,assessment:index===2?'supported':'excluded',claimIds:['option'+index],explanation:'Fixture'})),
    examComparison:{status:'not_found',sourceIds:[],reference:null,comparison:'No matching official exam reviewed',optionOrderChecked:false,answerKeyTransfer:false},
    terminology:[],limitations:['Fixture only'],
  }
}
describe('source comparison evidence contract', () => {
  it('reports coverage, never publication authority or real access verification', () => {
    expect(evaluateSourceComparison(draft,fixture())).toMatchObject({status:'evidence_complete',publicationAuthorized:false,candidateEvidenceOnly:true,provenance:'declared_retrieval_not_independently_verified'})
  })
  it.each(['questionId','revisionId','contentSha256'] as const)('rejects stale identity %s', key => {
    const report=fixture()
    report[key]=key==='contentSha256'?'b'.repeat(64):'33333333-3333-4333-8333-333333333333'
    expect(evaluateSourceComparison(draft,report).status).toBe('revision_mismatch')
  })
  it.each(['workId','independenceGroup','url','retrievedTextSha256'] as const)('does not count duplicate %s twice', key => {
    const report=fixture()
    if (key === 'retrievedTextSha256') report.sources[1].retrievedTextSha256=report.sources[0].retrievedTextSha256
    else report.sources[1][key]=report.sources[0][key]
    expect(evaluateSourceComparison(draft,report).status).toBe('insufficient_evidence')
  })
  it.each(['unavailable','abstract_only'] as const)('does not count %s as read section', access => {
    const report=fixture(); report.sources[1].access=access
    expect(evaluateSourceComparison(draft,report).status).toBe('insufficient_evidence')
  })
  it('requires retrieval traces and a content hash', () => {
    const report=fixture(); report.sources[1].retrievalRef=null
    expect(evaluateSourceComparison(draft,report).status).toBe('insufficient_evidence')
    report.sources[1].retrievalRef='fixture'; report.sources[1].retrievedTextSha256=null
    expect(evaluateSourceComparison(draft,report).status).toBe('insufficient_evidence')
  })
  it('does not majority-vote away a contradictory source', () => {
    const report=fixture(); report.claims[0].evidence.push({...report.claims[0].evidence[0],relation:'contradicts'})
    expect(evaluateSourceComparison(draft,report).status).toBe('conflicting_evidence')
  })
  it('requires every option and its own claim', () => {
    const report=fixture(); report.optionChecks.pop()
    expect(evaluateSourceComparison(draft,report).issues).toContain('OPTION_COVERAGE')
    const wrong=fixture(); wrong.optionChecks[0].claimIds=['stem']
    expect(evaluateSourceComparison(draft,wrong).issues).toContain('OPTION_CLAIM_MISMATCH:0')
  })
  it('rejects two supported answers even if the marked key is one', () => {
    const report=fixture(); report.optionChecks[0].assessment='supported'
    expect(evaluateSourceComparison(draft,report).status).toBe('conflicting_evidence')
  })
  it('does not let a university textbook stand in for local curriculum', () => {
    const report=fixture(); report.sources[0].kind='university_material'
    expect(evaluateSourceComparison(draft,report).issues).toContain('LOCAL_CURRICULUM_NOT_VERIFIED:curriculum')
  })
  it('requires stem, solution and curriculum coverage', () => {
    const report=fixture(); report.claims=report.claims.filter(c=>c.target==='option')
    expect(evaluateSourceComparison(draft,report).issues).toEqual(expect.arrayContaining(['MISSING_TARGET:stem','MISSING_TARGET:solution','MISSING_TARGET:curriculum']))
  })
  it('does not transfer another exam key or accept a non-exam reference', () => {
    const report=fixture(); report.examComparison={...report.examComparison,status:'compared',sourceIds:['s0'],reference:'Exam 2026 Q1',optionOrderChecked:true}
    expect(evaluateSourceComparison(draft,report).issues).toContain('EXAM_SOURCE_NOT_VERIFIED:s0')
    expect(()=>evaluateSourceComparison(draft,{...report,examComparison:{...report.examComparison,answerKeyTransfer:true}})).toThrow()
  })
  it('rejects unknown IDs and duplicate IDs', () => {
    const report=fixture(); report.claims[0].evidence[0].sourceId='unknown'
    expect(evaluateSourceComparison(draft,report).issues).toContain('UNKNOWN_SOURCE:unknown')
    report.sources.push(report.sources[0])
    expect(evaluateSourceComparison(draft,report).issues).toContain('DUPLICATE_SOURCE_ID')
  })
  it('keeps licensing uncertainty separate from reference-based content coverage', () => {
    expect(evaluateSourceComparison(draft,fixture()).warnings).toContain('LICENSE_UNVERIFIED:s0')
    const report=fixture()
    expect(()=>evaluateSourceComparison(draft,{...report,sources:[{...report.sources[0],license:{...report.sources[0].license,usage:'commercial_reuse'}}]})).toThrow()
  })
  it('builds a post-blind source prompt without changing the draft', () => {
    const prompt=buildSourceComparisonPrompt(draft)
    expect(prompt.question).toEqual(draft)
    expect(prompt.system).toContain('kör çözüm DEĞİLDİR')
    expect(prompt.responseSchema).toBeDefined()
  })
})
