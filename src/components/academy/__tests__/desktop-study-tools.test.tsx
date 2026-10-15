import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { DesktopStudyTools } from '../desktop-study-tools'
import { StudyTytSocialPolicyContext } from '@/components/study/tyt-social-policy-context'
import type { TytSocialExamPolicyState } from '@/lib/hooks/use-tyt-social-exam-policy'

const mocks=vi.hoisted(()=>({socialEnabled:false,auth:{user:null as {id:string}|null,loading:false},mastery:vi.fn(),assistant:vi.fn(),policy:vi.fn()}))
vi.mock('@/lib/feature-flags/tyt-social-v2-client',()=>({isTytSocialV2ClientEnabled:()=>mocks.socialEnabled}))
vi.mock('@/stores/auth-store',()=>({useAuthStore:()=>mocks.auth}))
vi.mock('@/lib/hooks/use-tyt-social-exam-policy',()=>({useTytSocialExamPolicy:(props:unknown)=>{mocks.policy(props);return {status:'setup_required'}}}))
vi.mock('@/components/study/tyt-social-exam-policy-card',()=>({TytSocialExamPolicyCardView:()=> <div>TYT Sosyal cevaplama düzeni</div>}))
vi.mock('@/components/study/mastery-action-card',()=>({MasteryActionCard:(props:unknown)=>{mocks.mastery(props);return <div>Kazanım önerileri</div>}}))
vi.mock('@/components/study/institution-weekly-program-card',()=>({InstitutionWeeklyProgramCard:()=> <div>Kurum programı</div>}))
vi.mock('@/components/study/study-assistant-launcher',()=>({StudyAssistantLauncher:(props:unknown)=>{mocks.assistant(props);return <div>Bilge Asistan</div>}}))
beforeEach(()=>{
  vi.clearAllMocks();mocks.auth={user:null,loading:false};mocks.socialEnabled=false
  Object.defineProperty(HTMLDialogElement.prototype,'showModal',{configurable:true,value:function(this:HTMLDialogElement){this.setAttribute('open','')}})
  Object.defineProperty(HTMLDialogElement.prototype,'close',{configurable:true,value:function(this:HTMLDialogElement){this.removeAttribute('open')}})
})
it('does not mount personalized tools for a guest',()=>{
  render(<DesktopStudyTools game="matematik" examRef="TYT" />)
  for(const heading of ['Kazanımı çalış','Bilge Asistan','Çalışma programı','Seviyeni ölç']) expect(screen.getByRole('heading',{name:heading})).toBeInTheDocument()
  expect(screen.getByRole('button',{name:/Seviyeni ölç/})).toBeInTheDocument()
  expect(screen.getByText('TYT · Matematik')).toBeInTheDocument()
  expect(screen.getByRole('link',{name:/Giriş yap ve planını aç/})).toHaveAttribute('href','/giris?next=%2Farena%2Fcalisma')
  expect(mocks.mastery).not.toHaveBeenCalled();expect(mocks.assistant).not.toHaveBeenCalled()
})
it('explains the guest diagnostic before asking for sign-in',()=>{
  render(<DesktopStudyTools game="matematik" examRef="TYT" />)
  fireEvent.click(screen.getByRole('button',{name:/Seviyeni ölç/}))
  expect(screen.getByRole('dialog',{name:'Seviyeni ölç'})).toBeInTheDocument()
  expect(screen.getByRole('link',{name:'Giriş yap ve ölçümü aç'})).toHaveAttribute(
    'href','/giris?next=%2Farena%2Ftani%3Fgame%3Dmatematik%26exam_ref%3DTYT',
  )
})
it('preserves mastery, policy, institution and assistant tools in the selected context',()=>{
  mocks.auth.user={id:'student'}
  const {rerender}=render(<DesktopStudyTools game="sosyal" examRef="TYT" />)
  for(const text of ['Kazanım önerileri','Kurum programı','Bilge Asistan']) expect(screen.getByText(text)).toBeInTheDocument()
  // The shared policy is owned by the study home and passed to the daily plan, not duplicated here.
  expect(mocks.policy).not.toHaveBeenCalled()
  expect(mocks.mastery).toHaveBeenLastCalledWith({game:'sosyal',examRef:'TYT',userId:'student',diagnosticPresentation:'explained'})
  rerender(<DesktopStudyTools game="fen" examRef="AYT-SAY" />)
  expect(mocks.assistant).toHaveBeenLastCalledWith({game:'fen',examRef:'AYT-SAY'})
})
it('keeps WordQuest user-facing context neutral while scoping mastery diagnostics to YDT',()=>{
  mocks.auth.user={id:'student'}
  render(<DesktopStudyTools game="wordquest" examRef={null} diagnosticExamRef="YDT" />)
  expect(screen.getByText('Serbest · İngilizce')).toBeInTheDocument()
  expect(mocks.mastery).toHaveBeenLastCalledWith({
    game:'wordquest',examRef:'YDT',userId:'student',diagnosticPresentation:'explained',
  })
  expect(mocks.assistant).toHaveBeenLastCalledWith({game:'wordquest',examRef:null})
})

const activePolicy: TytSocialExamPolicyState = {
  eligible:true,status:'active',loading:false,saving:false,error:null,
  policyVersion:'v1',selectionEffectiveAt:'2026-10-13T00:00:00Z',
  variantCode:'questions_16_20',selectionEpoch:'epoch-A',saveSelection:vi.fn(),retry:vi.fn(),
}
const sharedTools = (policy:TytSocialExamPolicyState, userId='student') => (
  <StudyTytSocialPolicyContext.Provider value={{game:'sosyal',examRef:'TYT',userId,policy}}>
    <DesktopStudyTools game="sosyal" examRef="TYT" />
  </StudyTytSocialPolicyContext.Provider>
)
it('shares the home policy epoch without a second policy request, including A-B-A',()=>{
  mocks.auth.user={id:'student'};mocks.socialEnabled=true
  const {rerender}=render(sharedTools(activePolicy))
  for(const epoch of ['epoch-A','epoch-B','epoch-A2']) {
    rerender(sharedTools({...activePolicy,selectionEpoch:epoch}))
    expect(mocks.mastery).toHaveBeenLastCalledWith(expect.objectContaining({userId:'student',policyEpoch:epoch}))
  }
  expect(mocks.policy).not.toHaveBeenCalled()
})
it.each([
  {saving:true}, {loading:true}, {status:'error' as const},
  {status:'setup_required' as const}, {selectionEpoch:null},
])('withholds the learning user for unsettled shared policy %j',patch=>{
  mocks.auth.user={id:'student'};mocks.socialEnabled=true
  render(sharedTools({...activePolicy,...patch}))
  expect(mocks.mastery).toHaveBeenLastCalledWith(expect.objectContaining({userId:undefined}))
  expect(screen.getByText('Kurum programı')).toBeInTheDocument()
})
it('does not use a policy owned by another user',()=>{
  mocks.auth.user={id:'student'};mocks.socialEnabled=true
  render(sharedTools(activePolicy,'previous-user'))
  expect(mocks.mastery).toHaveBeenLastCalledWith(expect.objectContaining({userId:undefined,policyEpoch:null}))
})
it('fails closed for enabled official Social without the shared provider',()=>{
  mocks.auth.user={id:'student'};mocks.socialEnabled=true
  render(<DesktopStudyTools game="sosyal" examRef="TYT" />)
  expect(mocks.mastery).toHaveBeenLastCalledWith(expect.objectContaining({userId:undefined,policyEpoch:null}))
})
