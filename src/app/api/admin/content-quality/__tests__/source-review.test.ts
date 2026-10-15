import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SourceComparison } from '@/lib/question-audit/source-comparison'
const mocks = vi.hoisted(() => ({ context: vi.fn(), rpc: vi.fn() }))
vi.mock('@/lib/content-governance/route-context', () => ({ requireContentGovernanceContext: mocks.context, contentRpc: mocks.rpc }))
import { GET, POST } from '../revisions/[revisionId]/source-review/route'

const USER='11111111-1111-4111-8111-111111111111'
const REV='22222222-2222-4222-8222-222222222222'
const Q='33333333-3333-4333-8333-333333333333'
const REQUEST='44444444-4444-4444-8444-444444444444'
const params={params:Promise.resolve({revisionId:REV})}
function fixture(): SourceComparison {
  return {format:'source-comparison@1',questionId:Q,revisionId:REV,contentSha256:'a'.repeat(64),
    sources:[0,1].map(i=>({id:'s'+i,title:'TEST FIXTURE',institutionOrAuthor:'Fixture '+i,editionOrDate:'2026',language:'tr',kind:i===0?'official_curriculum':'textbook',url:'https://example.org/book'+i,workId:'w'+i,independenceGroup:'g'+i,independenceRationale:'Fixture',access:'inspected_section',locator:'Section 1',accessedAt:'2026-10-01T00:00:00Z',retrievalRef:'fixture:'+i,retrievedTextSha256:String(i+1).repeat(64),license:{code:'UNKNOWN',url:null,checked:false,usage:'reference_only'}})),
    claims:['stem','solution','curriculum','option0','option1','option2','option3'].map(target=>({id:target,target:target.startsWith('option')?'option':target as 'stem'|'solution'|'curriculum',optionIndex:target.startsWith('option')?Number(target.at(-1)):null,statement:'Fixture',reasoningSummary:'Fixture',evidence:[0,1].map(i=>({sourceId:'s'+i,relation:'supports',locator:'Section',scopeMatch:true,scopeNote:'Fixture',explanation:'Fixture'}))})),
    optionChecks:[0,1,2,3].map(index=>({index,assessment:index===2?'supported':'excluded',claimIds:['option'+index],explanation:'Fixture'})),
    examComparison:{status:'not_found',sourceIds:[],reference:null,comparison:'Fixture',optionOrderChecked:false,answerKeyTransfer:false},terminology:[],limitations:['TEST ONLY']}
}
const snapshot = () => ({revisionId:REV,accepted:false,readyToPublish:false,draft:{id:Q,game:'matematik',category:'Temel',topic:null,exam_ref:'LGS',content:{question:'2+3 kaçtır?',options:['3','4','5','6'],answer:2,solution:'2+3=5'},published_revision_id:REV,content_sha256:'a'.repeat(64)}})
const request = (body: unknown) => new Request('https://example.org/source-review',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
const body = () => ({report:fixture(),rationale:'Kaynaklar ve tüm seçenekler incelendi',requestId:REQUEST})
const aiBody = () => ({...body(),acceptanceMode:'ai_assisted_owner',preparation:{
  version:'ai-preparation-declaration@1',agent:'TEST AI',evidenceRef:'fixture:preparation',evidenceSha256:'9'.repeat(64),
  revisionEvidenceFingerprint:'8'.repeat(64),acknowledgesNonIndependentReview:true,acceptsResponsibility:true,
}})
beforeEach(()=>{
  vi.clearAllMocks()
  mocks.context.mockResolvedValue({ok:true,userId:USER,admin:{}})
  mocks.rpc.mockImplementation((_admin, name)=>Promise.resolve(name==='get_question_revision_source_review'
    ?{data:snapshot(),error:null}:{data:{revisionId:REV,status:'stage1_approved',replayed:false,privateNote:'PRIVATE'},error:null}))
})
describe('source-comparison single acceptance route',()=>{
  it('uses a distinct AI-owner RPC, authenticated actor and explicit declaration',async()=>{
    mocks.rpc.mockImplementation((_admin,name)=>Promise.resolve(name==='get_question_revision_source_review'?{data:snapshot(),error:null}:{data:{revisionId:REV,status:'stage1_approved',acceptanceMode:'ai_assisted_owner',replayed:false},error:null}))
    const response=await POST(request(aiBody()),params)
    expect(response.status).toBe(200)
    expect(mocks.rpc.mock.calls[1][1]).toBe('accept_question_revision_ai_source_review')
    expect(mocks.rpc.mock.calls[1][2]).toMatchObject({p_user_id:USER,p_preparation:aiBody().preparation})
    expect((await response.json()).acceptanceMode).toBe('ai_assisted_owner')
  })
  it.each(['preparation','acceptanceMode'])('does not infer AI mode with missing %s',async field=>{
    const input:Record<string,unknown>=aiBody();delete input[field]
    expect((await POST(request(input),params)).status).toBe(400)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it.each(['acceptsResponsibility','acknowledgesNonIndependentReview'])('requires affirmative %s acknowledgement',async field=>{
    const input=aiBody();Object.assign(input.preparation,{[field]:false})
    expect((await POST(request(input),params)).status).toBe(400)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it('does not fall back when owner permission is denied',async()=>{
    mocks.rpc.mockImplementation((_admin,name)=>Promise.resolve(name==='get_question_revision_source_review'?{data:snapshot(),error:null}:{data:null,error:{code:'42501'}}))
    expect((await POST(request(aiBody()),params)).status).toBe(403)
    expect(mocks.rpc.mock.calls.some(c=>c[1]==='accept_question_revision_source_review')).toBe(false)
  })
  it('rejects actor injection and mismatched mode in an AI result',async()=>{
    expect((await POST(request({...aiBody(),userId:Q}),params)).status).toBe(400)
    expect((await POST(request(aiBody()),params)).status).toBe(500)
  })
  it('exposes mode and capability but no private evidence or actor in status',async()=>{
    mocks.rpc.mockResolvedValue({data:{...snapshot(),acceptanceMode:'ai_assisted_owner',canAcceptAiPrepared:true,evidenceFingerprint:'8'.repeat(64),preparation:aiBody().preparation,actorId:USER},error:null})
    const response=await GET(new Request('https://example.org'),params)
    expect(await response.json()).toEqual({revisionId:REV,accepted:false,readyToPublish:false,acceptanceMode:'ai_assisted_owner',canAcceptAiPrepared:true,evidenceFingerprint:'8'.repeat(64)})
  })
  it('passes strict v2 declarations to authoritative RPC, never treating local coverage as acceptance',async()=>{
    const input=body()
    input.report={...input.report,format:'source-comparison@2',curriculumBinding:{examRef:'LGS',examYear:2026,mappings:[{
      claimId:'curriculum',outcomeId:USER,canonicalId:'fixture@2018:grade8:LGS:8.2.2',programKey:'fixture',programEdition:'2018',grade:8,officialCode:'8.2.2',programSourceId:'s0',programPageTextSha256:'1'.repeat(64),examScopeSourceId:'s0',examScopeLocator:'Table 1',
    }]}}
    input.report.claims.find(c=>c.id==='curriculum')!.evidence.splice(1)
    mocks.rpc.mockImplementation((_admin,name)=>Promise.resolve(name==='get_question_revision_source_review'?{data:snapshot(),error:null}:{data:null,error:{code:'22023'}}))
    const response=await POST(request(input),params)
    expect(response.status).toBe(409)
    expect(mocks.rpc.mock.calls[1][2].p_report.format).toBe('source-comparison@2')
  })
  it('rejects v2 null bindings before acceptance',async()=>{
    const input=body(); input.report={...input.report,format:'source-comparison@2',curriculumBinding:null}
    const response=await POST(request(input),params)
    expect(response.status).toBe(409)
    expect((await response.json()).issues).toContain('CURRICULUM_BINDING_REQUIRED')
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
  })
  it.each([401,403,503])('applies the %s gate before parsing or RPC',async status=>{
    mocks.context.mockResolvedValue({ok:false,response:new Response(null,{status})})
    expect((await POST(request({invalid:true}),params)).status).toBe(status)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it('binds the real actor, requires review permission and strips private results',async()=>{
    const response=await POST(request(body()),params)
    expect(response.status).toBe(200)
    expect(mocks.context.mock.calls[0][2]).toBe('content.review.stage1')
    expect(mocks.rpc.mock.calls[1][1]).toBe('accept_question_revision_source_review')
    expect(mocks.rpc.mock.calls[1][2]).toMatchObject({p_user_id:USER,p_revision_id:REV,p_request_id:REQUEST})
    expect(await response.json()).toEqual({revisionId:REV,status:'stage1_approved',replayed:false,warnings:['LICENSE_UNVERIFIED:s0','LICENSE_UNVERIFIED:s1','EXAM_COMPARISON:not_found']})
    expect(response.headers.get('cache-control')).toContain('no-store')
  })
  it('rejects client-supplied actor or approval flags',async()=>{
    expect((await POST(request({...body(),userId:USER,approved:true}),params)).status).toBe(400)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it.each(['questionId','revisionId','contentSha256'] as const)('rejects changed %s without accepting',async key=>{
    const input=body(); input.report[key]=key==='contentSha256'?'b'.repeat(64):USER
    expect((await POST(request(input),params)).status).toBe(409)
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
  })
  it.each(['missing-option','contradiction','same-work','missing-curriculum'])('blocks %s',async kind=>{
    const input=body()
    if(kind==='missing-option') input.report.optionChecks.pop()
    if(kind==='contradiction') input.report.claims[0].evidence[0].relation='contradicts'
    if(kind==='same-work') input.report.sources[1].workId=input.report.sources[0].workId
    if(kind==='missing-curriculum') input.report.sources[0].kind='university_material'
    expect((await POST(request(input),params)).status).toBe(409)
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
  })
  it('checks trusted question structure and exam option count before approval',async()=>{
    const data=snapshot(); data.draft.exam_ref='TYT'
    mocks.rpc.mockResolvedValue({data,error:null})
    expect((await POST(request(body()),params)).status).toBe(409)
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
  })
  it('does not trust a malformed or wrong-revision server snapshot',async()=>{
    const data=snapshot(); data.draft.published_revision_id=Q
    mocks.rpc.mockResolvedValue({data,error:null})
    expect((await POST(request(body()),params)).status).toBe(500)
  })
  it('bounds the actual request even without Content-Length',async()=>{
    const response=await POST(new Request('https://example.org',{method:'POST',body:' '.repeat(1_048_577)}),params)
    expect(response.status).toBe(413); expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it('rejects bad JSON without attempting repair',async()=>{
    expect((await POST(new Request('https://example.org',{method:'POST',body:'{bad'}),params)).status).toBe(400)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it('keeps the status response minimal and private',async()=>{
    const response=await GET(new Request('https://example.org'),params)
    expect(await response.json()).toEqual({revisionId:REV,accepted:false,readyToPublish:false})
    expect(response.headers.get('cache-control')).toContain('no-store')
  })
  it('fails closed on wrong status identity and permission error',async()=>{
    mocks.rpc.mockResolvedValueOnce({data:{...snapshot(),revisionId:Q},error:null})
    expect((await GET(new Request('https://example.org'),params)).status).toBe(500)
    mocks.rpc.mockResolvedValueOnce({data:null,error:{code:'42501'}})
    expect((await GET(new Request('https://example.org'),params)).status).toBe(403)
  })
})
