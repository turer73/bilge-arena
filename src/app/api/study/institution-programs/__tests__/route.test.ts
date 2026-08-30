import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks=vi.hoisted(()=>({tracking:vi.fn(),program:vi.fn(),cookie:vi.fn(),service:vi.fn(),rpc:vi.fn(),rate:vi.fn()}))
vi.mock('@/lib/institution-tracking/server-security',()=>({isInstitutionTrackingEnabled:mocks.tracking,isInstitutionStudyProgramEnabled:mocks.program}))
vi.mock('@/lib/supabase/server',()=>({createClient:mocks.cookie}))
vi.mock('@/lib/supabase/service-role',()=>({createServiceRoleClient:mocks.service}))
vi.mock('@/lib/teacher-classroom/rate-limits',()=>({teacherClassroomReadLimiter:{},checkTeacherClassroomRateLimit:mocks.rate}))
import { GET } from '../route'
const USER='11111111-1111-4111-8111-111111111111'
const data={asOfDate:'2026-08-14',programs:[{programRef:'a'.repeat(32),classroomName:'TYT A Sınıfı',teacherAlias:'Öğretmen Bir',weekStart:'2026-08-10',dailyMinuteLimit:45,modelVersion:'institution-program-v1',publishedAt:'2026-08-10T08:00:00.000Z',items:[{position:1,scheduledDate:'2026-08-14',taskType:'diagnostic',title:'Temel kavramlar durum tespiti',reasonCode:'diagnostic_gap',outcomeCode:'MAT-01',durationMinutes:20,targetQuestionCount:10,status:'pending',canStart:true}]}]}
beforeEach(()=>{vi.clearAllMocks();mocks.tracking.mockReturnValue(true);mocks.program.mockReturnValue(true);mocks.cookie.mockResolvedValue({auth:{getUser:vi.fn().mockResolvedValue({data:{user:{id:USER}}})}});mocks.service.mockReturnValue({rpc:mocks.rpc});mocks.rate.mockResolvedValue({success:true});mocks.rpc.mockResolvedValue({data,error:null})})

describe('student institution programs route',()=>{
  it('returns an empty no-store result without auth when the pilot is closed',async()=>{
    mocks.program.mockReturnValue(false);const response=await GET(new Request('http://localhost/api/study/institution-programs'))
    expect(response.status).toBe(200);expect(response.headers.get('Cache-Control')).toBe('private, no-store');expect(mocks.cookie).not.toHaveBeenCalled()
  })
  it('reads only the authenticated student current Istanbul date',async()=>{
    const response=await GET(new Request('http://localhost/api/study/institution-programs'))
    expect(response.status).toBe(200);expect(await response.json()).toEqual(data)
    expect(mocks.rpc).toHaveBeenCalledWith('get_my_institution_study_programs',{p_user_id:USER,p_as_of_date:expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/)})
    expect(JSON.stringify(await (new Response(JSON.stringify(data))).json())).not.toMatch(/programId|studentId|teacherId|membershipId|userId/)
  })
  it('rejects anonymous access and malformed private RPC data',async()=>{
    mocks.cookie.mockResolvedValueOnce({auth:{getUser:vi.fn().mockResolvedValue({data:{user:null}})}})
    expect((await GET(new Request('http://localhost/api/study/institution-programs'))).status).toBe(401)
    mocks.rpc.mockResolvedValueOnce({data:{...data,userId:USER},error:null})
    expect((await GET(new Request('http://localhost/api/study/institution-programs'))).status).toBe(500)
  })
  it('fails closed when a private RPC marks an unlaunchable item as startable',async()=>{
    const invalid={...data,programs:[{...data.programs[0],items:[{...data.programs[0].items[0],targetQuestionCount:11}]}]}
    mocks.rpc.mockResolvedValueOnce({data:invalid,error:null})
    expect((await GET(new Request('http://localhost/api/study/institution-programs'))).status).toBe(500)
  })
})
