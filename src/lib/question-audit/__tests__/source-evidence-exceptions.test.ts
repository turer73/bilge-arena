import { describe, it, expect } from 'vitest'
import { evaluateSourceComparison, type SourceComparison } from '../source-comparison'
import { MGM_REGIONS, type SourceEvidenceException } from '../source-evidence-exceptions'
import type { QuestionDraft } from '../types'

// All data here are artificial. These fixtures are NOT source receipts.
function fixture(kind:'dataset'|'chronology'='dataset') {
  const draft:QuestionDraft={questionId:'11111111-1111-4111-8111-111111111111',revisionId:'22222222-2222-4222-8222-222222222222',
    contentSha256:'a'.repeat(64),examRef:'TYT',subject:kind==='dataset'?'cografya':'tarih',topic:null,
    questionText:'TEST ONLY',options:[...MGM_REGIONS.slice(0,5)],markedAnswerIndex:0,solutionText:'TEST ONLY',passage:null}
  const report:Extract<SourceComparison,{format:'source-comparison@2'}>={format:'source-comparison@2',questionId:draft.questionId,revisionId:draft.revisionId,contentSha256:draft.contentSha256,
    sources:['program','primary','secondary','contrary'].map((id,i)=>({id,title:'TEST ONLY',institutionOrAuthor:'Fixture',editionOrDate:'Fixture',language:'tr',kind:i===0?'official_curriculum':'reference',
      url:['https://example.org/program','https://www.mgm.gov.tr/fixture','https://example.org/secondary','https://example.org/contrary'][i],
      workId:id,independenceGroup:id,independenceRationale:'Fixture independent works',access:'inspected_section',locator:'TEST ONLY',accessedAt:'2026-10-09T00:00:00Z',retrievalRef:'fixture:'+id,retrievedTextSha256:String(i+1).repeat(64),license:{code:'UNKNOWN',url:null,checked:false,usage:'reference_only'}})),
    claims:['stem','solution','curriculum',...draft.options.map((_,i)=>'o'+i)].map(id=>({id,target:id.startsWith('o')?'option':id as 'stem'|'solution'|'curriculum',optionIndex:id.startsWith('o')?Number(id.slice(1)):null,
      statement:'Fixture proposition',reasoningSummary:'Fixture inference',evidence:(id==='curriculum'?['program']:kind==='dataset'?['primary']:['primary','secondary']).map(sourceId=>({sourceId,relation:'supports',locator:'TEST ONLY',scopeMatch:true,scopeNote:'TEST ONLY',explanation:'Fixture inference'}))})),
    optionChecks:draft.options.map((_,index)=>({index,assessment:index===0?'supported':'excluded',claimIds:['o'+index],explanation:'Fixture'})),
    examComparison:{status:'not_found',sourceIds:[],reference:null,comparison:'Fixture',optionOrderChecked:false,answerKeyTransfer:false},terminology:[],limitations:['Fixture only'],
    curriculumBinding:{examRef:'TYT',examYear:2027,mappings:[{claimId:'curriculum',outcomeId:'33333333-3333-4333-8333-333333333333',canonicalId:'fixture@2018:grade9:TYT:9.1',programKey:'fixture',programEdition:'2018',grade:9,officialCode:'9.1',programSourceId:'program',programPageTextSha256:'1'.repeat(64),examScopeSourceId:'program',examScopeLocator:'Fixture only'}]},
  }
  const doc:SourceEvidenceException={version:'source-evidence-exception@1',reportSnapshot:null,revisionEvidenceFingerprint:'b'.repeat(64),rationale:'TEST ONLY explicit owner rationale',basis:{kind:'mgm_regional_normal_maximum@1',sourceId:'primary',claimIds:report.claims.filter(c=>c.target!=='curriculum').map(c=>c.id),periodStart:1991,periodEnd:2020,statistic:'annual_areal_precipitation_mean',unit:'tenths_mm',values:MGM_REGIONS.map((region,i)=>({region,value:7000-i*100}))}}
  if(kind==='chronology'){
    report.sources[1].url='https://history.state.gov/fixture'
    report.sources[2].url='https://api.parliament.uk/fixture'
    report.claims[1].evidence.push({sourceId:'contrary',relation:'contradicts',locator:'Fixture',scopeMatch:true,scopeNote:'Fixture',explanation:'Fixture contradiction'})
    doc.basis={kind:'dated_record_order@1',claimIds:['solution'],contradictingSourceIds:['contrary'],calendar:'gregorian',earlier:{name:'First fixture event',date:'1856-02-18',sourceIds:['primary']},later:{name:'Second fixture event',date:'1856-02-25',sourceIds:['secondary']},conclusion:'earlier_precedes_later'}
  }
  doc.reportSnapshot=structuredClone(report)
  return {draft,report,doc}
}
describe('bounded source evidence exceptions',()=>{
  it('binds exact raw report including whitespace without modifying the stored document',()=>{
    const {draft,report,doc}=fixture();report.claims[0].reasoningSummary+=' '
    doc.reportSnapshot=structuredClone(report)
    expect(evaluateSourceComparison(draft,report,doc).status).toBe('evidence_complete')
    report.claims[0].reasoningSummary=report.claims[0].reasoningSummary.trim()
    expect(evaluateSourceComparison(draft,report,doc).issues).toContain('EXCEPTION_REPORT_DRIFT')
  })
  it('can bind the same chronology to both stem and solution but not unrelated claims',()=>{
    const {draft,report,doc}=fixture('chronology')
    if(doc.basis.kind!=='dated_record_order@1')throw Error('fixture')
    report.claims[0].evidence.push(structuredClone(report.claims[1].evidence[2]))
    doc.reportSnapshot=structuredClone(report)
    expect(evaluateSourceComparison(draft,report,doc).conflicts).toContain('SOURCE_CONTRADICTION:stem')
    doc.basis.claimIds.push('stem')
    expect(evaluateSourceComparison(draft,report,doc).status).toBe('evidence_complete')
    doc.basis.claimIds.push('solution')
    expect(evaluateSourceComparison(draft,report,doc).status).not.toBe('evidence_complete')
  })
  it('only permits the exact inspected court annex on the public mirror',()=>{
    const {draft,report,doc}=fixture('chronology')
    report.sources[2].url='https://icj-web.leman.un-icc.cloud/sites/default/files/permanent-court-of-international-justice/serie_B/B_14/05_Commission_europeenne_du_Danube_Annexe.pdf'
    doc.reportSnapshot=structuredClone(report)
    expect(evaluateSourceComparison(draft,report,doc).status).toBe('evidence_complete')
    report.sources[2].url+='-not-the-record';doc.reportSnapshot=structuredClone(report)
    expect(evaluateSourceComparison(draft,report,doc).status).not.toBe('evidence_complete')
  })
  it.each(['dataset','chronology'] as const)('requires explicit %s sidecar and never authorizes publication',kind=>{
    const {draft,report,doc}=fixture(kind)
    expect(evaluateSourceComparison(draft,report).status).not.toBe('evidence_complete')
    const before=structuredClone(report),result=evaluateSourceComparison(draft,report,doc)
    expect(result).toMatchObject({status:'evidence_complete',candidateEvidenceOnly:true,publicationAuthorized:false})
    expect(result.warnings).toContain('EXCEPTION_OWNER_ACCEPTANCE_REQUIRES_DATABASE_CHECK')
    expect(report).toEqual(before)
  })
  it.each(['null','extra','fingerprint','scope','year','snapshot','revision','source-hash','source-url','source-unread','primary-url','tie','wrong-key','missing-region','duplicate-region','unknown-region','negative-value','decimal-value','period','unit','duplicate-claim','curriculum-claim','unknown-claim','unrelated-claim','contradiction','duplicate-option'])('rejects dataset %s',mutation=>{
    const {draft,report,doc}=fixture(),basis=doc.basis
    if(basis.kind!=='mgm_regional_normal_maximum@1')throw Error('fixture')
    let input:unknown=doc
    if(mutation==='null')input=null
    if(mutation==='extra')input={...doc,accepted:true}
    if(mutation==='fingerprint')doc.revisionEvidenceFingerprint='invalid'
    if(mutation==='scope')draft.examRef='LGS'
    if(mutation==='year')report.curriculumBinding!.examYear=2028
    if(mutation==='snapshot')doc.reportSnapshot={}
    if(mutation==='revision')draft.revisionId='44444444-4444-4444-8444-444444444444'
    if(mutation==='source-hash')report.sources[1].retrievedTextSha256='e'.repeat(64)
    if(mutation==='source-url')report.sources[1].url+='changed'
    if(mutation==='source-unread'){report.sources[1].access='abstract_only';doc.reportSnapshot=structuredClone(report)}
    if(mutation==='primary-url'){report.sources[1].url='https://www.mgm.gov.tr.evil.invalid/x';doc.reportSnapshot=structuredClone(report)}
    if(mutation==='tie')basis.values[1].value=basis.values[0].value
    if(mutation==='wrong-key')draft.markedAnswerIndex=1
    if(mutation==='missing-region')basis.values.pop()
    if(mutation==='duplicate-region')basis.values[1].region=basis.values[0].region
    if(mutation==='unknown-region')input={...doc,basis:{...basis,values:[{region:'Other',value:9000},...basis.values.slice(1)]}}
    if(mutation==='negative-value')basis.values[0].value=-1
    if(mutation==='decimal-value')basis.values[0].value=7000.1
    if(mutation==='period')input={...doc,basis:{...basis,periodEnd:2021}}
    if(mutation==='unit')input={...doc,basis:{...basis,unit:'inches'}}
    if(mutation==='duplicate-claim')basis.claimIds.push('stem')
    if(mutation==='curriculum-claim')basis.claimIds.push('curriculum')
    if(mutation==='unknown-claim')basis.claimIds.push('not-there')
    if(mutation==='unrelated-claim'){report.claims[0].evidence[0].sourceId='secondary';doc.reportSnapshot=structuredClone(report)}
    if(mutation==='contradiction'){report.claims[0].evidence[0].relation='contradicts';doc.reportSnapshot=structuredClone(report)}
    if(mutation==='duplicate-option')draft.options[1]=draft.options[0]
    expect(evaluateSourceComparison(draft,report,input).status).not.toBe('evidence_complete')
  })
  it.each(['reversed','equal','invalid-date','non-gregorian','unread-contrary','unretained-contrary','wrong-claim','nonarchive','mirror','support-missing','other-conflict','one-support','curriculum'])('rejects chronology %s',mutation=>{
    const {draft,report,doc}=fixture('chronology'),b=doc.basis
    if(b.kind!=='dated_record_order@1')throw Error('fixture')
    let input:unknown=doc
    if(mutation==='reversed')b.earlier.date='1856-03-01'
    if(mutation==='equal')b.earlier.date=b.later.date
    if(mutation==='invalid-date')b.later.date='1856-02-31'
    if(mutation==='non-gregorian')input={...doc,basis:{...b,calendar:'julian'}}
    if(mutation==='unread-contrary')report.sources[3].access='abstract_only'
    if(mutation==='unretained-contrary')report.claims[1].evidence.pop()
    if(mutation==='wrong-claim')b.claimIds=['stem']
    if(mutation==='nonarchive')report.sources[2].url='https://example.org/archive'
    if(mutation==='mirror')b.later.sourceIds=['primary']
    if(mutation==='support-missing')report.claims[1].evidence[1].scopeMatch=false
    if(mutation==='other-conflict')report.claims[0].evidence[1].relation='contradicts'
    if(mutation==='one-support')report.sources[2].independenceGroup=report.sources[1].independenceGroup
    if(mutation==='curriculum')b.claimIds=['curriculum']
    doc.reportSnapshot=structuredClone(report)
    expect(evaluateSourceComparison(draft,report,input).status).not.toBe('evidence_complete')
  })
  it('does not use a dataset exception to waive unlisted content claims',()=>{
    const {draft,report,doc}=fixture();if(doc.basis.kind!=='mgm_regional_normal_maximum@1')throw Error('fixture')
    doc.basis.claimIds=doc.basis.claimIds.filter(x=>x!=='solution')
    expect(evaluateSourceComparison(draft,report,doc).issues).toContain('INSUFFICIENT_INDEPENDENT_EVIDENCE:solution')
  })
})
