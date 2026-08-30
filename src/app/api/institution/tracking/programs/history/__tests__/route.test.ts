import {beforeEach,describe,expect,it,vi} from 'vitest'
const mocks=vi.hoisted(()=>({tracking:vi.fn(),program:vi.fn(),context:vi.fn(),service:vi.fn(),cookieRpc:vi.fn(),rpc:vi.fn()}))
vi.mock('@/lib/institution-tracking/server-security',()=>({isInstitutionTrackingEnabled:mocks.tracking,isInstitutionStudyProgramEnabled:mocks.program}))
vi.mock('@/lib/institution-pilot/route-context',()=>({requireInstitutionPilotRouteContext:mocks.context}))
vi.mock('@/lib/supabase/service-role',()=>({createServiceRoleClient:mocks.service}))
import {GET} from '../route'
const USER_ID='11111111-1111-4111-8111-111111111111',CLASSROOM_ID='22222222-2222-4222-8222-222222222222',MEMBER_REF='a'.repeat(32)
const scope={game:'matematik',examRef:'TYT',questionExamRef:'TYT',taxonomyVersion:'ba-tyt-math-v1',scopePolicyVersion:'institution-scope-v1'}
const request=(extra='')=>new Request(`http://localhost/api/institution/tracking/programs/history?classroomId=${CLASSROOM_ID}&memberRef=${MEMBER_REF}&game=matematik&exam_ref=TYT${extra}`)
beforeEach(()=>{vi.clearAllMocks();mocks.tracking.mockReturnValue(true);mocks.program.mockReturnValue(true);mocks.context.mockResolvedValue({ok:true,userId:USER_ID,admin:{rpc:mocks.cookieRpc}});mocks.service.mockReturnValue({rpc:mocks.rpc});mocks.rpc.mockResolvedValue({data:{scope,programs:[]},error:null})})
describe('institution program history route',()=>{
  it('reads one assigned opaque student and exact released subject scope',async()=>{
    const response=await GET(request())
    expect(response.status).toBe(200)
    expect(mocks.rpc).toHaveBeenCalledWith('get_institution_student_program_history_v2',{
      p_user_id:USER_ID,p_classroom_id:CLASSROOM_ID,p_member_ref:MEMBER_REF,
      p_game:'matematik',p_display_exam_ref:'TYT',
    })
    expect(mocks.cookieRpc).not.toHaveBeenCalled()
    expect(await response.json()).toEqual({scope,programs:[]})
  })
  it('keeps only the legacy Math scope available during app-first rollout',async()=>{
    mocks.rpc.mockResolvedValueOnce({data:null,error:{code:'PGRST202'}})
      .mockResolvedValueOnce({data:{programs:[]},error:null})
    const response=await GET(request())
    expect(response.status).toBe(200)
    expect(mocks.rpc).toHaveBeenNthCalledWith(2,'get_institution_student_program_history',{
      p_user_id:USER_ID,p_classroom_id:CLASSROOM_ID,p_member_ref:MEMBER_REF,
    })
    mocks.rpc.mockReset()
    mocks.rpc.mockResolvedValueOnce({data:null,error:{code:'PGRST202'}})
    expect((await GET(new Request(`http://localhost/api/institution/tracking/programs/history?classroomId=${CLASSROOM_ID}&memberRef=${MEMBER_REF}&game=fen&exam_ref=TYT`))).status).toBe(500)
  })
  it('fails closed for a mismatched database scope',async()=>{
    mocks.rpc.mockResolvedValueOnce({data:{scope:{...scope,game:'fen',taxonomyVersion:'ba-tyt-science-v1'},programs:[]},error:null})
    expect((await GET(request())).status).toBe(500)
  })
  it('fails closed while either program gate is disabled',async()=>{mocks.program.mockReturnValue(false);const response=await GET(new Request('http://localhost/api/institution/tracking/programs/history'));expect(response.status).toBe(503);expect(mocks.context).not.toHaveBeenCalled()})
  it('fails closed when the server-only client is unavailable',async()=>{mocks.service.mockImplementationOnce(()=>{throw new Error('missing service key')});expect((await GET(request())).status).toBe(503);expect(mocks.rpc).not.toHaveBeenCalled()})
})
