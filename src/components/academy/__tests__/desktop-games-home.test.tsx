import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DesktopGamesHome } from '../desktop-games-home'
import { useGameStore } from '@/stores/game-store'

const auth = vi.hoisted(() => ({ user:null as {id:string}|null, profile:null as {exam_type:'yks'|'lgs'}|null, loading:false }))
vi.mock('@/stores/auth-store',()=>({useAuthStore:()=>auth}))
vi.mock('@/components/layout/theme-toggle',()=>({ThemeToggle:()=>null}))

beforeEach(()=>{auth.user=null;auth.profile=null;auth.loading=false;useGameStore.setState({selectedExamRef:null});localStorage.clear()})

describe('Desktop games discovery',()=>{
  it('resets the visual touch press on release, cancelled scroll, and blur without changing navigation',()=>{
    render(<DesktopGamesHome />)
    const link=screen.getByRole('link',{name:'Matematik TYT · Turunu kur'})
    const press=()=>{
      const event=new Event('pointerdown',{bubbles:true})
      Object.defineProperty(event,'pointerType',{value:'touch'})
      fireEvent(link,event)
      expect(link).toHaveAttribute('data-pressed','true')
    }
    press();fireEvent.pointerUp(link);expect(link).not.toHaveAttribute('data-pressed')
    press();fireEvent.pointerCancel(link);expect(link).not.toHaveAttribute('data-pressed')
    press();fireEvent.blur(link);expect(link).not.toHaveAttribute('data-pressed')
    expect(link).toHaveAttribute('href','/arena/matematik?exam_ref=TYT')
  })
  it('keeps all four subject cards as accessible links with their existing exam scope',()=>{
    render(<DesktopGamesHome />)
    const subjects=screen.getByRole('region',{name:'Ders oyunları'})
    const expected=[
      {slug:'matematik',name:'Matematik',color:'#2563EB'},
      {slug:'turkce',name:'Türkçe',color:'#D97706'},
      {slug:'fen',name:'Fen Bilimleri',color:'#059669'},
      {slug:'sosyal',name:'Sosyal Bilimler',color:'#7C3AED'},
    ]
    expect(within(subjects).getAllByRole('link')).toHaveLength(4)
    for(const game of expected){
      const link=within(subjects).getByRole('link',{name:`${game.name} TYT · Turunu kur`})
      expect(link).toHaveAttribute('href',`/arena/${game.slug}?exam_ref=TYT`)
      expect(link).toHaveAttribute('data-subject',game.slug)
      expect(link.style.getPropertyValue('--subject-color')).toBe(game.color)
      const image=link.querySelector('img')
      expect(image).toHaveAttribute('src',`/academy/subjects/${game.slug}-magic-v1.png`)
      expect(image).toHaveAttribute('alt','')
      expect(image?.parentElement).toHaveAttribute('aria-hidden','true')
      expect(image).toHaveAttribute('sizes',expect.stringContaining('50vw'))
      expect(within(link).queryByRole('button')).not.toBeInTheDocument()
    }
  })
  it('keeps the subject game design available for YDT without adding out-of-scope lessons',()=>{
    useGameStore.setState({selectedExamRef:'YDT'})
    render(<DesktopGamesHome />)
    const subjects=screen.getByRole('region',{name:'Ders oyunları'})
    expect(within(subjects).getAllByRole('link')).toHaveLength(1)
    expect(within(subjects).getByRole('link',{name:'İngilizce YDT · Turunu kur'})).toHaveAttribute('href','/arena/wordquest?exam_ref=YDT')
    expect(subjects.querySelector('[data-count]')).toHaveAttribute('data-count','1')
    expect(subjects.querySelector('a img')).toHaveAttribute('src','/academy/modes/wordquest-v1.png')
  })
  it('uses the approved artwork without duplicating accessible card labels',()=>{
    render(<DesktopGamesHome />)
    const modes=screen.getByRole('region',{name:'Oyun modları'})
    const assets={tower:'tower-v1.png',conquest:'conquest-janissary-v2.png',words:'wordquest-v1.png'}
    for(const [tone,file] of Object.entries(assets)){
      const image=modes.querySelector(`article[data-tone="${tone}"] img`)
      expect(image).toHaveAttribute('src',`/academy/modes/${file}`)
      expect(image).toHaveAttribute('alt','')
      expect(image?.parentElement).toHaveAttribute('aria-hidden','true')
      expect(image).toHaveAttribute('sizes',expect.stringContaining('36vw'))
      expect(image).toHaveAttribute('sizes',expect.stringMatching(/420px$/))
    }
    expect(modes.querySelectorAll('article img')).toHaveLength(3)
    expect(within(modes).queryByText('✦')).not.toBeInTheDocument()
  })
  it('shows distinct tower, conquest and word modes, with safe guest sign-in destinations',()=>{
    render(<DesktopGamesHome />)
    expect(screen.getByRole('heading',{name:'Bugün hangi mücadele?'})).toBeInTheDocument()
    expect(screen.queryByRole('heading',{name:'Öğrenme yolun'})).not.toBeInTheDocument()
    expect(screen.queryByText(/günlük seri/)).not.toBeInTheDocument()
    expect(screen.getByRole('link',{name:'Kule Modu için giriş yap'})).toHaveAttribute('href','/giris?next=%2Farena%2Fkule')
    expect(screen.getByRole('link',{name:'Bil ve Fethet için giriş yap'})).toHaveAttribute('href','/giris?next=%2Farena%2Ffethet')
    expect(screen.getByRole('link',{name:'WordQuest modunu aç'})).toHaveAttribute('href','/arena/wordquest')
    expect(screen.getByRole('navigation',{name:'Tablet gezinmesi'})).toBeInTheDocument()
  })
  it('links signed-in players to existing modes and updates after sign-out',()=>{
    auth.user={id:'student'}
    const {rerender}=render(<DesktopGamesHome />)
    expect(screen.getByRole('link',{name:'Kule Modu modunu aç'})).toHaveAttribute('href','/arena/kule')
    expect(screen.getByRole('link',{name:'Bil ve Fethet modunu aç'})).toHaveAttribute('href','/arena/fethet')
    auth.user=null;rerender(<DesktopGamesHome />)
    expect(screen.getByRole('link',{name:'Kule Modu için giriş yap'})).toHaveAttribute('href','/giris?next=%2Farena%2Fkule')
  })
  it('does not offer a protected start while auth is loading',()=>{
    auth.loading=true;render(<DesktopGamesHome />)
    expect(screen.getAllByRole('status')).toHaveLength(2)
    expect(screen.queryByRole('link',{name:/Kule Modu/})).not.toBeInTheDocument()
  })
  it('preserves LGS subject scope while keeping the exam-independent WordQuest mode discoverable',()=>{
    auth.profile={exam_type:'lgs'};useGameStore.setState({selectedExamRef:'AYT-SAY'})
    const {rerender}=render(<DesktopGamesHome />)
    expect(screen.getByRole('heading',{name:'WordQuest'})).toBeInTheDocument()
    expect(screen.getByRole('link',{name:'WordQuest modunu aç'})).toHaveAttribute('href','/arena/wordquest')
    const modeImages=screen.getByRole('region',{name:'Oyun modları'}).querySelectorAll('article img')
    expect(modeImages).toHaveLength(3)
    for(const image of modeImages) expect(image).toHaveAttribute('sizes',expect.stringContaining('36vw'))
    expect(screen.getByRole('combobox')).toHaveValue('LGS')
    expect(within(screen.getByRole('region',{name:'Ders oyunları'})).getByRole('link',{name:/Matematik/})).toHaveAttribute('href','/arena/matematik?exam_ref=LGS')
    auth.profile={exam_type:'yks'};rerender(<DesktopGamesHome />)
    fireEvent.change(screen.getByRole('combobox'),{target:{value:'AYT-SOZ'}})
    const subjects=screen.getByRole('region',{name:'Ders oyunları'})
    expect(within(subjects).queryByRole('link',{name:/Matematik/})).not.toBeInTheDocument()
    expect(within(subjects).getByRole('link',{name:/Türkçe/})).toHaveAttribute('href','/arena/turkce?exam_ref=AYT-SOZ')
  })
})
