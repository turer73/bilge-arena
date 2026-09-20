import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { Calculator, BookOpenText } from 'lucide-react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DesktopStudyHome, type DesktopStudyHomeProps } from '../desktop-study-home'
import { BilgePersonalization } from '../bilge-personalization'
import { BILGE_CHARACTER_KEY, setBilgeCharacter } from '@/lib/bilge/use-bilge-character'
import type { TodayPlanFocusView } from '@/components/study/today-plan-focus'

vi.mock('@/components/study/today-plan-focus', () => ({ TodayPlanFocus: ({render: renderView}: {render: (view: TodayPlanFocusView) => React.ReactNode}) => renderView({
  plan: {
    planDate:'2026-09-14',game:'matematik',examRef:'TYT',completedIds:[],items:[],
    attemptId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',expiresAt:'2099-01-01T00:00:00.000Z',
    questions:[{id:'q1',game:'matematik',category:'sayilar',subcategory:null,topic:null,difficulty:1,level_tag:null,base_points:10,content:{question:'Örnek soru',options:['A','B']}}],
  }, loading:false,
  content:<div data-testid="actual-daily-plan">Gerçek plan bileşeni</div>,
}) }))
vi.mock('@/components/layout/theme-toggle', () => ({ ThemeToggle: ({ variant }: { variant?: string }) => variant === 'sync-only' ? null : <button>Tema</button> }))

const math = { id: 'matematik' as const, label: 'Matematik', icon: Calculator, description: 'Temel kavramlardan problemlere ilerle' }
const props: DesktopStudyHomeProps = {
  mode: 'live', subjects: [math, { id: 'turkce', label: 'Türkçe', icon: BookOpenText, description: 'Anlamı keşfet' }],
  subject: math, onSubjectChange: vi.fn(), examOptions: [{value:'TYT',label:'TYT'},{value:'AYT-SAY',label:'AYT Sayısal'}],
  selectedExamRef: 'TYT', examRef: 'TYT', onExamChange: vi.fn(), game: 'matematik',
  steps: [{key:'sayilar',label:'Sayılar',href:'/arena/matematik?category=sayilar',index:0,done:false,current:true,locked:false}],
  primaryHref: '/arena/matematik?category=sayilar', currentLabel: 'Sayılar', pathComplete: false, progressStatus: 'ready',
  dailyGoal: {current:2,target:10}, displayName:'Bilgin', avatarUrl:'/my-avatar.svg', userId:'student', currentStreak:3,
  classroomEnabled:false, institutionEnabled:false, communityQualityEnabled:false,
}

beforeEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
  setBilgeCharacter('female')
  window.dispatchEvent(new StorageEvent('storage', {key: null}))
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {configurable:true,value:function(this:HTMLDialogElement){this.setAttribute('open','')}})
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {configurable:true,value:function(this:HTMLDialogElement){this.removeAttribute('open')}})
})

describe('Desktop academy integration', () => {
  it.each(['demo', 'live'] as const)('links to the existing personalization studio below Bilge instead of a header theme picker in %s mode', (mode) => {
    render(<DesktopStudyHome {...props} mode={mode} />)
    expect(screen.queryByRole('button', {name:'Tema'})).not.toBeInTheDocument()
    const sidebar = screen.getByRole('complementary', {name:'Bilge ve çalışma araçları'})
    const link = within(sidebar).getByRole('link', {name:/Kişiselleştir/})
    expect(link).toHaveAttribute('href', '/arena/kisisellestir')
    const coach = within(sidebar).getByRole('heading', {name:'Birlikte ilerleyelim.'}).closest('section')!
    expect(coach.nextElementSibling).toBe(link)
  })

  it('hides the profile shortcut for guests and follows sign-in and sign-out without stale avatars', () => {
    const { rerender } = render(<DesktopStudyHome {...props} userId={null} displayName="Arenacı" />)
    expect(screen.queryByRole('link', {name:/profilini aç/})).not.toBeInTheDocument()
    expect(screen.getByRole('combobox', {name:'Sınav kapsamı'})).toBeInTheDocument()
    rerender(<DesktopStudyHome {...props} />)
    const profile = screen.getByRole('link', {name:'Bilgin profilini aç'})
    expect(profile).toHaveAttribute('href', '/arena/profil')
    expect(profile.querySelector('img')).toHaveAttribute('src', '/my-avatar.svg')
    rerender(<DesktopStudyHome {...props} avatarUrl={null} />)
    expect(screen.getByRole('link', {name:'Bilgin profilini aç'})).toHaveTextContent('B')
    rerender(<DesktopStudyHome {...props} userId={null} />)
    expect(screen.queryByRole('link', {name:/profilini aç/})).not.toBeInTheDocument()
  })

  it('retains the explicitly labeled sample avatar in demo mode without a real account', () => {
    render(<DesktopStudyHome {...props} mode="demo" userId={null} />)
    expect(screen.getByText(/Tasarım önizlemesi · Örnek veriler/)).toBeInTheDocument()
    expect(screen.getByRole('link', {name:'Bilgin profilini aç'})).toHaveAttribute('href', '/arena/profil')
  })

  it.each(['demo', 'live'] as const)('places practice and mistakes once in the sidebar before the store in %s mode', (mode) => {
    const { rerender } = render(<DesktopStudyHome {...props} mode={mode} />)
    const sidebar = screen.getByRole('complementary', {name:'Bilge ve çalışma araçları'})
    const tools = within(sidebar).getByRole('navigation', {name:'Diğer alanlar'})
    const links = within(tools).getAllByRole('link')
    expect(links.map(link => link.getAttribute('href'))).toEqual(['/arena/matematik', '/arena/yanlislarim', '/arena/magaza'])
    expect(links[0]).toHaveTextContent('Pratik yap')
    expect(links[0]).toHaveTextContent('Bilgini sorularla pekiştir')
    expect(links[1]).toHaveTextContent('Yanlışlarıma dön')
    expect(links[1]).toHaveTextContent('Takıldığın yeri birlikte bulalım')
    expect(screen.getAllByRole('link', {name:/Pratik yap/})).toHaveLength(1)
    expect(screen.getAllByRole('link', {name:/Yanlışlarıma dön/})).toHaveLength(1)
    const mainColumn = screen.getByRole('region', {name:'Matematik öğrenme yolu'}).parentElement!
    expect(within(mainColumn).queryByRole('link', {name:/Pratik yap|Yanlışlarıma dön/})).not.toBeInTheDocument()
    rerender(<DesktopStudyHome {...props} mode={mode} game="turkce" />)
    expect(screen.getByRole('link', {name:/Pratik yap/})).toHaveAttribute('href', '/arena/turkce')
  })

  it('keeps the actual topic href, exam and subject controls; plan starts closed', () => {
    render(<DesktopStudyHome {...props} />)
    expect(screen.getByRole('link',{name:'Derse devam et'})).toHaveAttribute('href',props.primaryHref)
    expect(screen.queryByTestId('actual-daily-plan')).not.toBeInTheDocument()
    const summary = screen.getByRole('heading', {name:'Dengeli planın hazır'})
    const learningPath = screen.getByRole('heading', {name:'Matematik Yolu'})
    expect(summary.compareDocumentPosition(learningPath) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getAllByRole('button', {name:'Planı incele'})).toHaveLength(1)
    fireEvent.click(screen.getByRole('button',{name:'Türkçe'}))
    expect(props.onSubjectChange).toHaveBeenCalledWith('turkce')
    fireEvent.change(screen.getByRole('combobox',{name:'Sınav kapsamı'}),{target:{value:'AYT-SAY'}})
    expect(props.onExamChange).toHaveBeenCalledWith('AYT-SAY')
    fireEvent.click(screen.getByRole('button',{name:'Planı incele'}))
    expect(screen.getByTestId('actual-daily-plan')).toBeInTheDocument()
  })

  it('never presents unavailable data as zero/completed progress', () => {
    render(<DesktopStudyHome {...props} progressStatus="unavailable" />)
    expect(screen.getByRole('status')).toHaveTextContent('İlerlemene şu an ulaşılamıyor')
    expect(screen.queryByText('konu tamamlandı')).not.toBeInTheDocument()
    expect(screen.queryByRole('link',{name:'Derse devam et'})).not.toBeInTheDocument()
    expect(screen.getByRole('link',{name:'Konulara git'})).toHaveAttribute('href',props.primaryHref)
  })

  it('syncs the guide and 12-expression gallery without mutating appearance/profile preferences', () => {
    localStorage.setItem('bilge-theme','orman')
    localStorage.setItem('bilge-arena-zemin-v1','sis-vadisi')
    localStorage.setItem('bilge-arena-profile-background-v1','profile-value')
    const {unmount}=render(<><DesktopStudyHome {...props} /><BilgePersonalization /></>)
    expect(screen.queryByRole('combobox',{name:'Rehberin'})).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button',{name:'Karakter ve ifadeler'}))
    fireEvent.click(screen.getByRole('radio',{name:'Erkek Bilge'}))
    expect(screen.getByAltText('Erkek Bilge, akademi rehberin')).toHaveAttribute('src','/academy/bilge/male/portrait.png')
    expect(localStorage.getItem(BILGE_CHARACTER_KEY)).toBe('male')
    const dialog=screen.getByRole('dialog')
    expect(within(dialog).getByRole('radio',{name:'Erkek Bilge'})).toBeChecked()
    fireEvent.click(within(dialog).getByRole('button',{name:'Utangaç'}))
    expect(screen.getByAltText('Erkek Bilge — Utangaç')).toHaveAttribute('src','/academy/bilge/male/utangac.png')
    for (const [key,value] of [['bilge-theme','orman'],['bilge-arena-zemin-v1','sis-vadisi'],['bilge-arena-profile-background-v1','profile-value']]) expect(localStorage.getItem(key)).toBe(value)
    expect(screen.getByRole('link',{name:'Bilgin profilini aç'}).querySelector('img')).toHaveAttribute('src','/my-avatar.svg')
    unmount()
    render(<DesktopStudyHome {...props} />)
    expect(screen.getByAltText('Erkek Bilge, akademi rehberin')).toBeInTheDocument()
    act(() => {localStorage.setItem(BILGE_CHARACTER_KEY,'female');window.dispatchEvent(new StorageEvent('storage',{key:BILGE_CHARACTER_KEY}))})
    expect(screen.getByAltText('Kadın Bilge, akademi rehberin')).toBeInTheDocument()
  })

  it('keeps guide selection usable when storage fails', () => {
    render(<BilgePersonalization />)
    vi.spyOn(Storage.prototype,'setItem').mockImplementation(() => {throw new Error('blocked')})
    fireEvent.click(screen.getByRole('button',{name:'Karakter ve ifadeler'}))
    fireEvent.click(screen.getByRole('radio',{name:'Erkek Bilge'}))
    expect(screen.getByRole('radio',{name:'Erkek Bilge'})).toBeChecked()
    expect(screen.getByRole('status')).toHaveTextContent('bu sayfada geçerli')
  })

  it('prioritizes immediate study for guests without a fake streak or an extra plan dialog', () => {
    render(<DesktopStudyHome {...props} userId={null} progressStatus="guest" dailyGoal={null} />)
    expect(screen.queryByText(/günlük seri/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name:'Planı incele' })).not.toBeInTheDocument()
    const hero=screen.getByRole('heading',{name:'Matematik Yolu'})
    const plan=screen.getByRole('heading',{name:'Kendi çalışma planını oluştur'})
    expect(hero.compareDocumentPosition(plan) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByRole('link',{name:'Konulara git'})).toHaveAttribute('href',props.primaryHref)
    expect(screen.getByRole('link',{name:'Giriş yap'})).toHaveAttribute('href','/giris?next=%2Farena%2Fcalisma')
  })

  it('keeps the existing study tools available below the overview', () => {
    render(<DesktopStudyHome {...props} studyTools={<div data-testid="retained-tools">Kazanım ve çalışma araçları</div>} />)
    expect(screen.getByTestId('retained-tools')).toBeInTheDocument()
  })

  it('does not fetch a real daily plan in demo or expose unavailable institution tools', () => {
    render(<DesktopStudyHome {...props} mode="demo" />)
    expect(screen.queryByRole('link',{name:'Kurum paneli'})).not.toBeInTheDocument()
    expect(screen.queryByRole('link',{name:'Sınıflarım'})).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button',{name:'Planı incele'}))
    expect(screen.queryByTestId('actual-daily-plan')).not.toBeInTheDocument()
    expect(within(screen.getByRole('dialog')).getByText(/gerçek bir günlük plan oluşturulmaz/)).toBeInTheDocument()
  })
})
