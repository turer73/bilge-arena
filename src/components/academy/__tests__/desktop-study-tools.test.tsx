import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { DesktopStudyTools } from '../desktop-study-tools'

const mocks=vi.hoisted(()=>({auth:{user:null as {id:string}|null,loading:false},mastery:vi.fn(),assistant:vi.fn(),policy:vi.fn()}))
vi.mock('@/stores/auth-store',()=>({useAuthStore:()=>mocks.auth}))
vi.mock('@/lib/hooks/use-tyt-social-exam-policy',()=>({useTytSocialExamPolicy:(props:unknown)=>{mocks.policy(props);return {status:'setup_required'}}}))
vi.mock('@/components/study/tyt-social-exam-policy-card',()=>({TytSocialExamPolicyCardView:()=> <div>TYT Sosyal cevaplama düzeni</div>}))
vi.mock('@/components/study/mastery-action-card',()=>({MasteryActionCard:(props:unknown)=>{mocks.mastery(props);return <div>Kazanım önerileri</div>}}))
vi.mock('@/components/study/institution-weekly-program-card',()=>({InstitutionWeeklyProgramCard:()=> <div>Kurum programı</div>}))
vi.mock('@/components/study/study-assistant-launcher',()=>({StudyAssistantLauncher:(props:unknown)=>{mocks.assistant(props);return <div>Bilge Asistan</div>}}))
beforeEach(()=>{
  vi.clearAllMocks();mocks.auth={user:null,loading:false}
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
