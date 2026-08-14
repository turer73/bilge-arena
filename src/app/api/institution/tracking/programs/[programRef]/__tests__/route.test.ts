import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ tracking: vi.fn(), program: vi.fn(), context: vi.fn(), rpc: vi.fn() }))
vi.mock('@/lib/institution-tracking/server-security', () => ({ isInstitutionTrackingEnabled: mocks.tracking, isInstitutionStudyProgramEnabled: mocks.program }))
vi.mock('@/lib/institution-pilot/route-context', () => ({ requireInstitutionPilotRouteContext: mocks.context }))
import { PATCH } from '../route'

const USER_ID='11111111-1111-4111-8111-111111111111', REF='a'.repeat(32), REQUEST='22222222-2222-4222-8222-222222222222'
const item={ position:1,scheduledDate:'2026-08-17',taskType:'diagnostic',title:'Temel kavramlar durum tespiti',reasonCode:'diagnostic_gap',outcomeCode:'MAT-01',durationMinutes:20,targetQuestionCount:10 }
const result={ programRef:REF,status:'draft',weekStart:'2026-08-17',dailyMinuteLimit:45,modelVersion:'institution-program-v1',itemCount:1,createdAt:'2026-08-14T00:00:00.000Z',reviewedAt:null,publishedAt:null,replayed:false }
function request(body:unknown){return new Request(`http://localhost/api/institution/tracking/programs/${REF}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify(body)})}
beforeEach(()=>{vi.clearAllMocks();mocks.tracking.mockReturnValue(true);mocks.program.mockReturnValue(true);mocks.context.mockResolvedValue({ok:true,userId:USER_ID,admin:{rpc:mocks.rpc}});mocks.rpc.mockResolvedValue({data:result,error:null})})

describe('institution study program update route',()=>{
  it('updates one validated unpublished draft with an idempotency request',async()=>{
    const response=await PATCH(request({weekStart:'2026-08-17',dailyMinuteLimit:45,items:[item],requestId:REQUEST}),{params:Promise.resolve({programRef:REF})})
    expect(response.status).toBe(200);expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(mocks.rpc).toHaveBeenCalledWith('update_institution_study_program_draft',{p_user_id:USER_ID,p_program_ref:REF,p_week_start:'2026-08-17',p_daily_minute_limit:45,p_items:[item],p_request_id:REQUEST})
  })
  it('rejects an empty draft, invalid ref and ownership denial',async()=>{
    expect((await PATCH(request({weekStart:'2026-08-17',dailyMinuteLimit:45,items:[],requestId:REQUEST}),{params:Promise.resolve({programRef:REF})})).status).toBe(400)
    expect((await PATCH(request({weekStart:'2026-08-17',dailyMinuteLimit:45,items:[item],requestId:REQUEST}),{params:Promise.resolve({programRef:'invalid'})})).status).toBe(400)
    mocks.rpc.mockResolvedValueOnce({data:null,error:{code:'42501',message:'private'}})
    const denied=await PATCH(request({weekStart:'2026-08-17',dailyMinuteLimit:45,items:[item],requestId:REQUEST}),{params:Promise.resolve({programRef:REF})})
    expect(denied.status).toBe(403);expect(JSON.stringify(await denied.json())).not.toContain('private')
  })
})
