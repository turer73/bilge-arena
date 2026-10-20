import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks=vi.hoisted(()=>({context:vi.fn(),rpc:vi.fn()}))
vi.mock('@/lib/content-governance/route-context',()=>({requireContentGovernanceContext:mocks.context,contentRpc:mocks.rpc}))
import { GET,POST } from '../revisions/[revisionId]/retirement-review/route'
const user='11111111-1111-4111-8111-111111111111',revision='22222222-2222-4222-8222-222222222222',question='33333333-3333-4333-8333-333333333333'
const params={params:Promise.resolve({revisionId:revision})}
const status=()=>({revisionId:revision,accepted:false,canAccept:true,readyToPublish:false,acceptanceMode:null,evidenceFingerprint:'a'.repeat(64)})
const body=()=>({acceptanceMode:'ai_assisted_owner_retirement',requestId:'44444444-4444-4444-8444-444444444444',rationale:'Kaldırma gerekçesi incelendi',
 evidence:{version:'retirement-evidence@1',questionId:question,revisionId:revision,contentSha256:'b'.repeat(64),baseRevisionId:user,reason:'invalid_content',evidenceRef:'fixture:only',evidenceSha256:'c'.repeat(64),survivor:null},
 preparation:{version:'ai-preparation-declaration@1',agent:'Fixture AI',evidenceRef:'fixture:only',evidenceSha256:'c'.repeat(64),revisionEvidenceFingerprint:'a'.repeat(64),acknowledgesNonIndependentReview:true,acceptsResponsibility:true}})
const request=(input:unknown)=>new Request('https://example.org/retirement-review',{method:'POST',body:JSON.stringify(input)})
beforeEach(()=>{vi.clearAllMocks();mocks.context.mockResolvedValue({ok:true,userId:user,admin:{}});mocks.rpc.mockImplementation((_admin,name)=>Promise.resolve({data:name==='get_question_revision_retirement_review'?status():{questionId:question,revisionId:revision,status:'stage1_approved',acceptanceMode:'ai_assisted_owner_retirement',replayed:false},error:null}))})
describe('explicit owner retirement acceptance',()=>{
 it('uses the authenticated actor and a dedicated RPC; never publishes',async()=>{
  const response=await POST(request(body()),params);expect(response.status).toBe(200)
  expect(mocks.context.mock.calls[0][2]).toBe('content.review.stage1')
  expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith({},'accept_question_revision_retirement_review',expect.objectContaining({p_user_id:user,p_revision_id:revision,p_evidence:body().evidence,p_preparation:body().preparation}))
  expect((await response.json()).acceptanceMode).toBe('ai_assisted_owner_retirement')
  expect(response.headers.get('cache-control')).toContain('no-store')
 })
 it.each([401,403,503])('enforces %s before body/RPC',async code=>{mocks.context.mockResolvedValue({ok:false,response:new Response(null,{status:code})});expect((await POST(request(body()),params)).status).toBe(code);expect(mocks.rpc).not.toHaveBeenCalled()})
 it.each(['userId','approved','stage'])('rejects injected %s',async field=>{expect((await POST(request({...body(),[field]:user}),params)).status).toBe(400);expect(mocks.rpc).not.toHaveBeenCalled()})
 it.each(['acceptsResponsibility','acknowledgesNonIndependentReview'])('requires explicit %s',async field=>{const input=body();Object.assign(input.preparation,{[field]:false});expect((await POST(request(input),params)).status).toBe(400)})
 it('rejects a different revision or package binding',async()=>{const input=body();input.evidence.revisionId=user;expect((await POST(request(input),params)).status).toBe(400);input.evidence.revisionId=revision;input.preparation.evidenceSha256='d'.repeat(64);expect((await POST(request(input),params)).status).toBe(400);expect(mocks.rpc).not.toHaveBeenCalled()})
 it('requires a distinct pinned survivor only for duplicate reason',async()=>{const input=body();input.evidence.reason='duplicate';expect((await POST(request(input),params)).status).toBe(400);Object.assign(input.evidence,{survivor:{questionId:question,publishedRevisionId:user,contentSha256:'f'.repeat(64)}});expect((await POST(request(input),params)).status).toBe(400)})
 it('bounds actual streamed bytes even without Content-Length',async()=>{const r=new Request('https://example.org',{method:'POST',body:' '.repeat(65_537)});expect((await POST(r,params)).status).toBe(413);expect(mocks.rpc).not.toHaveBeenCalled()})
 it('does not fall back on RPC refusal and verifies returned mode',async()=>{mocks.rpc.mockResolvedValue({data:null,error:{code:'42501'}});expect((await POST(request(body()),params)).status).toBe(403);expect(mocks.rpc).toHaveBeenCalledTimes(1);mocks.rpc.mockResolvedValue({data:{questionId:question,revisionId:revision,status:'stage1_approved',acceptanceMode:'separate_reviewer',replayed:false},error:null});expect((await POST(request(body()),params)).status).toBe(500)})
 it('projects GET without evidence/actor and refuses mismatched revisions',async()=>{mocks.rpc.mockResolvedValue({data:{...status(),evidence:{secret:true},reviewerId:user},error:null});expect(await (await GET(new Request('https://example.org'),params)).json()).toEqual(status());mocks.rpc.mockResolvedValue({data:{...status(),revisionId:user},error:null});expect((await GET(new Request('https://example.org'),params)).status).toBe(500)})
})
