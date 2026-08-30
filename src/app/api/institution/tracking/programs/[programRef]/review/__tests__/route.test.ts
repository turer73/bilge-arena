import {beforeEach,describe,expect,it,vi} from 'vitest'
const mocks=vi.hoisted(()=>({tracking:vi.fn(),program:vi.fn(),context:vi.fn(),service:vi.fn(),cookieRpc:vi.fn(),rpc:vi.fn()}))
vi.mock('@/lib/institution-tracking/server-security',()=>({isInstitutionTrackingEnabled:mocks.tracking,isInstitutionStudyProgramEnabled:mocks.program}))
vi.mock('@/lib/institution-pilot/route-context',()=>({requireInstitutionPilotRouteContext:mocks.context}))
vi.mock('@/lib/supabase/service-role',()=>({createServiceRoleClient:mocks.service}))
vi.mock('@/lib/teacher-classroom/rate-limits',()=>({teacherClassroomWriteLimiter:{kind:'write'}}))
import {GET,POST} from '../route'
const USER_ID='11111111-1111-4111-8111-111111111111',PROGRAM_REF='b'.repeat(32),REQUEST_ID='33333333-3333-4333-8333-333333333333'
const evidence={modelVersion:'institution-program-review-v1',baselineWindowStart:'2026-07-20T00:00:00.000Z',baselineWindowEnd:'2026-08-03T00:00:00.000Z',currentWindowStart:'2026-08-03T00:00:00.000Z',currentWindowEnd:'2026-08-17T00:00:00.000Z',targetedOutcomeCount:4,assessedOutcomeCount:3,improvedOutcomeCount:2,declinedOutcomeCount:0,insufficientOutcomeCount:1,systemSuggestion:'effective'}
const routeContext={params:Promise.resolve({programRef:PROGRAM_REF})}
beforeEach(()=>{vi.clearAllMocks();mocks.tracking.mockReturnValue(true);mocks.program.mockReturnValue(true);mocks.context.mockResolvedValue({ok:true,userId:USER_ID,admin:{rpc:mocks.cookieRpc}});mocks.service.mockReturnValue({rpc:mocks.rpc})})
describe('institution program review route',()=>{
  it('previews only server-computed evidence',async()=>{mocks.rpc.mockResolvedValue({data:evidence,error:null});const response=await GET(new Request('http://localhost'),routeContext);expect(response.status).toBe(200);expect(mocks.rpc).toHaveBeenCalledWith('preview_institution_study_program_review',{p_user_id:USER_ID,p_program_ref:PROGRAM_REF})})
  it('stores an idempotent teacher decision',async()=>{mocks.rpc.mockResolvedValue({data:{reviewRef:'c'.repeat(32),teacherResult:'partial',systemSuggestion:'effective',evidence,note:null,reviewedAt:'2026-08-18T10:00:00.000Z',replayed:false},error:null});const response=await POST(new Request('http://localhost',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({teacherResult:'partial',note:null,requestId:REQUEST_ID})}),routeContext);expect(response.status).toBe(200);expect(mocks.rpc).toHaveBeenCalledWith('review_institution_study_program',{p_user_id:USER_ID,p_program_ref:PROGRAM_REF,p_teacher_result:'partial',p_note:null,p_request_id:REQUEST_ID})})
  it('never delegates server-only RPCs to the authenticated client',async()=>{mocks.rpc.mockResolvedValue({data:evidence,error:null});expect((await GET(new Request('http://localhost'),routeContext)).status).toBe(200);expect(mocks.cookieRpc).not.toHaveBeenCalled()})
  it('fails closed when the server-only client is unavailable',async()=>{mocks.service.mockImplementationOnce(()=>{throw new Error('missing service key')});expect((await GET(new Request('http://localhost'),routeContext)).status).toBe(503);expect(mocks.rpc).not.toHaveBeenCalled()})
})
