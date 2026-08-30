import {render,screen,waitFor} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {beforeEach,describe,expect,it,vi} from 'vitest'

const mocks=vi.hoisted(()=>({history:vi.fn(),preview:vi.fn(),review:vi.fn()}))
vi.mock('@/lib/institution-tracking/client',()=>({
  fetchInstitutionStudentProgramHistory:mocks.history,
  previewInstitutionStudyProgramReview:mocks.preview,
  reviewInstitutionStudyProgram:mocks.review,
}))

import {ProgramReviewPanel} from '../program-review-panel'

const CLASSROOM_ID='22222222-2222-4222-8222-222222222222'
const MEMBER_REF='a'.repeat(32)
const PROGRAM_REF='b'.repeat(32)
const scope={game:'matematik',examRef:'TYT',questionExamRef:'TYT',taxonomyVersion:'ba-tyt-math-v1',scopePolicyVersion:'institution-scope-v1'} as const
const evidence={modelVersion:'institution-program-review-v1',baselineWindowStart:'2026-07-20T00:00:00.000Z',baselineWindowEnd:'2026-08-03T00:00:00.000Z',currentWindowStart:'2026-08-03T00:00:00.000Z',currentWindowEnd:'2026-08-17T00:00:00.000Z',targetedOutcomeCount:4,assessedOutcomeCount:3,improvedOutcomeCount:2,declinedOutcomeCount:0,insufficientOutcomeCount:1,systemSuggestion:'effective'}

beforeEach(()=>{
  vi.clearAllMocks()
  mocks.history.mockResolvedValue({scope,programs:[{programRef:PROGRAM_REF,scope,status:'published',weekStart:'2026-08-03',itemCount:4,publishedAt:'2026-08-02T09:00:00.000Z',reviewEligible:true,review:null}]})
  mocks.preview.mockResolvedValue(evidence)
  mocks.review.mockResolvedValue({reviewRef:'c'.repeat(32),teacherResult:'partial',systemSuggestion:'effective',evidence,note:'Gelişim var, kalıcılık tekrarına devam.',reviewedAt:'2026-08-18T10:00:00.000Z',replayed:false})
})

describe('ProgramReviewPanel',()=>{
  it.each([320,375,390])('previews evidence and stores the teacher decision at %ipx',async(width)=>{
    Object.defineProperty(window,'innerWidth',{configurable:true,value:width})
    const user=userEvent.setup()
    const {container}=render(<ProgramReviewPanel classroomId={CLASSROOM_ID} memberRef={MEMBER_REF} game="matematik" examRef="TYT"/>)
    await waitFor(()=>expect(mocks.history).toHaveBeenCalledWith(CLASSROOM_ID,MEMBER_REF,'matematik','TYT',expect.any(AbortSignal)))
    await user.click(await screen.findByRole('button',{name:'Kanıtı incele'}))
    expect(await screen.findByText(/Sistem gözlemi:/)).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Öğretmen değerlendirmesi'),'partial')
    await user.type(screen.getByLabelText('Kısa not (isteğe bağlı)'),'Gelişim var, kalıcılık tekrarına devam.')
    await user.click(screen.getByRole('button',{name:'Değerlendirmeyi kaydet'}))
    expect(mocks.review).toHaveBeenCalledWith(PROGRAM_REF,{teacherResult:'partial',note:'Gelişim var, kalıcılık tekrarına devam.'})
    expect(await screen.findByText('Kısmi olumlu değişim gözlendi')).toBeInTheDocument()
    expect(container.textContent).not.toContain(PROGRAM_REF)
    expect(container.textContent).not.toContain(CLASSROOM_ID)
  })
})
