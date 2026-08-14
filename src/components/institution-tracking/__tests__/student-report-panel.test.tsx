import {render,screen} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {beforeEach,describe,expect,it,vi} from 'vitest'
const mocks=vi.hoisted(()=>({fetch:vi.fn(),create:vi.fn()}))
vi.mock('@/lib/institution-tracking/client',()=>({fetchInstitutionStudentReports:mocks.fetch,createInstitutionStudentReport:mocks.create}))
import {StudentReportPanel} from '../student-report-panel'
const CLASSROOM_ID='22222222-2222-4222-8222-222222222222',MEMBER_REF='a'.repeat(32),REPORT_REF='b'.repeat(32)
const snapshot={modelVersion:'institution-student-report-v1',generatedAt:'2026-08-14T10:00:00.000Z',periodStart:'2026-08-01T10:00:00.000Z',periodEnd:'2026-08-14T10:00:00.000Z',institutionName:'Bilge Pilot Kursu',classroomName:'TYT A Sınıfı',teacherAlias:'Öğretmen Bir',studentAlias:'Öğrenci Bir',scope:{game:'matematik',examRef:'TYT',taxonomyVersion:'ba-tyt-math-v1'},summary:{outcomeCount:1,assessedOutcomeCount:1,insufficientOutcomeCount:0,developingOutcomeCount:1,masteredOutcomeCount:0},outcomes:[{title:'Temel Kavramlar',path:['TYT Matematik','Sayılar','Temel','Kavram'],status:'developing',score:62,confidence:'medium',evidenceCount:8,independentEvidenceCount:4,lastEvidenceAt:'2026-08-13T10:00:00.000Z'}]}
beforeEach(()=>{vi.clearAllMocks();mocks.fetch.mockResolvedValue({reports:[]});mocks.create.mockResolvedValue({reportRef:REPORT_REF,snapshot,createdAt:'2026-08-14T10:01:00.000Z',replayed:false})})
describe('StudentReportPanel',()=>{
  it.each([320,375,390])('creates and prints a private A4 snapshot at %ipx',async(width)=>{Object.defineProperty(window,'innerWidth',{configurable:true,value:width});const print=vi.spyOn(window,'print').mockImplementation(()=>{expect(document.body).toHaveClass('institution-report-print-page')});const user=userEvent.setup();const{container}=render(<StudentReportPanel classroomId={CLASSROOM_ID} memberRef={MEMBER_REF}/>);await user.click(screen.getByRole('button',{name:'Rapor oluştur'}));expect(await screen.findByText('Öğrenci Durum Raporu')).toBeInTheDocument();await user.click(screen.getByRole('button',{name:'Yazdır / PDF'}));expect(print).toHaveBeenCalledOnce();expect(document.body).not.toHaveClass('institution-report-print-page');expect(container.textContent).not.toContain(CLASSROOM_ID);expect(container.textContent).not.toContain(MEMBER_REF);expect(container.textContent).not.toContain(REPORT_REF)})
})
