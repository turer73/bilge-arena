import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { InstitutionWeeklyProgramCard } from '../institution-weekly-program-card'

const previous=process.env.NEXT_PUBLIC_INSTITUTION_TRACKING_ENABLED
const payload={asOfDate:'2026-08-14',programs:[{programRef:'a'.repeat(32),classroomName:'TYT Çok Uzun Kurum Matematik Sınıfı',teacherAlias:'Öğretmen Dilara Ürer',weekStart:'2026-08-10',dailyMinuteLimit:45,modelVersion:'institution-program-v1',publishedAt:'2026-08-10T08:00:00.000Z',items:[{position:1,scheduledDate:'2026-08-14',taskType:'diagnostic',title:'Temel kavramlar ve sayı kümeleri için ayrıntılı durum tespiti',reasonCode:'diagnostic_gap',outcomeCode:'MAT-01',durationMinutes:20,targetQuestionCount:10,status:'pending',canStart:true}]}]}
beforeEach(()=>{process.env.NEXT_PUBLIC_INSTITUTION_TRACKING_ENABLED='true';vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify(payload),{status:200})))})
afterEach(()=>{vi.unstubAllGlobals();if(previous===undefined)delete process.env.NEXT_PUBLIC_INSTITUTION_TRACKING_ENABLED;else process.env.NEXT_PUBLIC_INSTITUTION_TRACKING_ENABLED=previous})

describe('InstitutionWeeklyProgramCard',()=>{
  it.each([320,375,390])('renders the private weekly program at %ipx without internal ids',async(width)=>{
    Object.defineProperty(window,'innerWidth',{configurable:true,value:width});const{container}=render(<InstitutionWeeklyProgramCard />)
    expect(await screen.findByRole('heading',{name:'Bu haftanın öğretmen planı'})).toBeInTheDocument()
    expect(screen.getByText(payload.programs[0].classroomName)).toBeInTheDocument();expect(screen.getByText(/Öğretmen Dilara Ürer/)).toBeInTheDocument()
    expect(screen.getByText(payload.programs[0].items[0].title)).toBeInTheDocument();expect(container.textContent).not.toMatch(/studentId|teacherId|programId|membershipId/)
    expect(screen.getByRole('button',{name:'Tanılamayı başlat'})).toBeInTheDocument()
  })
  it('leaves no empty card when there is no published program',async()=>{
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({asOfDate:'2026-08-14',programs:[]}),{status:200}))
    const{container}=render(<InstitutionWeeklyProgramCard />);await vi.waitFor(()=>expect(fetch).toHaveBeenCalled());await vi.waitFor(()=>expect(container).toBeEmptyDOMElement())
  })
  it('keeps an app-first legacy card visible but fails closed for execution',async()=>{
    const legacy={...payload,programs:[{...payload.programs[0],programRef:undefined,items:[{...payload.programs[0].items[0],canStart:undefined}]}]}
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify(legacy),{status:200}))
    render(<InstitutionWeeklyProgramCard />)
    expect(await screen.findByText(payload.programs[0].items[0].title)).toBeInTheDocument()
    expect(screen.queryByRole('button',{name:'Tanılamayı başlat'})).not.toBeInTheDocument()
  })
  it('keeps personal study available and offers retry on a program error',async()=>{
    vi.mocked(fetch).mockResolvedValueOnce(new Response('error',{status:500}));const user=userEvent.setup();render(<InstitutionWeeklyProgramCard />)
    expect(await screen.findByText('Kurum programı görüntülenemedi')).toBeInTheDocument();await user.click(screen.getByRole('button',{name:/Yeniden dene/}));expect(fetch).toHaveBeenCalledTimes(2)
  })
  it('keeps the loaded plan visible when starting an item fails',async()=>{
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify(payload),{status:200}))
      .mockResolvedValueOnce(new Response(JSON.stringify({error:'failed'}),{status:409}))
    const user=userEvent.setup();render(<InstitutionWeeklyProgramCard />)
    await user.click(await screen.findByRole('button',{name:'Tanılamayı başlat'}))
    expect(await screen.findByRole('alert')).toHaveTextContent('Planın kaybolmadı')
    expect(screen.getByText(payload.programs[0].items[0].title)).toBeInTheDocument()
    expect(screen.queryByText('Kurum programı görüntülenemedi')).not.toBeInTheDocument()
  })
  it('explains that a future item opens on its scheduled date',async()=>{
    const future={...payload,programs:[{...payload.programs[0],items:[{
      ...payload.programs[0].items[0],scheduledDate:'2026-08-15',canStart:false,
    }]}]}
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify(future),{status:200}))
    render(<InstitutionWeeklyProgramCard />)
    expect(await screen.findByText('Planlanan tarihinde açılacak')).toBeInTheDocument()
  })
})
