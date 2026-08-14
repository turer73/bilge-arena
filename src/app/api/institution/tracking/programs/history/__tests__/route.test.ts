import {beforeEach,describe,expect,it,vi} from 'vitest'
const mocks=vi.hoisted(()=>({tracking:vi.fn(),program:vi.fn(),context:vi.fn(),rpc:vi.fn()}))
vi.mock('@/lib/institution-tracking/server-security',()=>({isInstitutionTrackingEnabled:mocks.tracking,isInstitutionStudyProgramEnabled:mocks.program}))
vi.mock('@/lib/institution-pilot/route-context',()=>({requireInstitutionPilotRouteContext:mocks.context}))
import {GET} from '../route'
const USER_ID='11111111-1111-4111-8111-111111111111',CLASSROOM_ID='22222222-2222-4222-8222-222222222222',MEMBER_REF='a'.repeat(32)
beforeEach(()=>{vi.clearAllMocks();mocks.tracking.mockReturnValue(true);mocks.program.mockReturnValue(true);mocks.context.mockResolvedValue({ok:true,userId:USER_ID,admin:{rpc:mocks.rpc}});mocks.rpc.mockResolvedValue({data:{programs:[]},error:null})})
describe('institution program history route',()=>{
  it('reads one assigned opaque student scope',async()=>{
    const response=await GET(new Request(`http://localhost/api/institution/tracking/programs/history?classroomId=${CLASSROOM_ID}&memberRef=${MEMBER_REF}`))
    expect(response.status).toBe(200)
    expect(mocks.rpc).toHaveBeenCalledWith('get_institution_student_program_history',{p_user_id:USER_ID,p_classroom_id:CLASSROOM_ID,p_member_ref:MEMBER_REF})
  })
  it('fails closed while either program gate is disabled',async()=>{mocks.program.mockReturnValue(false);const response=await GET(new Request('http://localhost/api/institution/tracking/programs/history'));expect(response.status).toBe(503);expect(mocks.context).not.toHaveBeenCalled()})
})
