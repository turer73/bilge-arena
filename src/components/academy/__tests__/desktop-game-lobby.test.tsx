import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DesktopGameLobby } from '../desktop-game-lobby'
import type { LobbyProps } from '@/components/game/lobby'
import { getModesForContext } from '@/lib/constants/modes'

vi.mock('@/components/layout/theme-toggle', () => ({ ThemeToggle: () => null }))
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(window.location.search) }))
vi.mock('@/components/game/sound-toggle', () => ({ SoundToggle: () => <button>Ses</button> }))
vi.mock('@/components/ads/ad-banner', () => ({ AdBanner: () => null }))
vi.mock('@/components/premium/quiz-limit-banner', () => ({ QuizLimitBanner: () => null }))

const makeProps = (): LobbyProps => ({
  game: 'matematik', selectedMode: 'classic', onSelectMode: vi.fn(), onStart: vi.fn(),
  selectedCategory: null, onSelectCategory: vi.fn(), selectedDifficulty: null,
  onSelectDifficulty: vi.fn(), selectedExamRef: 'TYT', onSelectExamRef: vi.fn(),
})
beforeEach(() => { localStorage.clear(); vi.stubEnv('NEXT_PUBLIC_TYT_SOCIAL_V2_ENABLED','true') })
afterEach(() => { vi.unstubAllEnvs(); window.history.replaceState(null, '', '/') })

describe('Wide game preparation', () => {
  it('places the optional daily-plan shortcut below the main start action, not in the header', () => {
    const { container, rerender } = render(<DesktopGameLobby {...makeProps()} dailyPlanAction={<button>Günlük planın</button>} />)
    const summary = screen.getByRole('complementary', { name: 'Tur özeti' })
    const shortcut = within(summary).getByRole('button', { name: 'Günlük planın' })
    const start = within(summary).getByRole('button', { name: 'Başlat · 10 soru' })
    expect(start.compareDocumentPosition(shortcut) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(within(container.querySelector('header')!).queryByRole('button', { name: 'Günlük planın' })).not.toBeInTheDocument()
    rerender(<DesktopGameLobby {...makeProps()} />)
    expect(screen.queryByRole('button', { name: 'Günlük planın' })).not.toBeInTheDocument()
  })
  it('has one start action, a summary and no mobile or XP level panel', () => {
    const props = makeProps()
    const {container}=render(<DesktopGameLobby {...props} />)
    expect(screen.getByRole('heading',{level:1,name:'Matematik turunu kur'})).toBeInTheDocument()
    expect(screen.getAllByRole('button',{name:'Başlat · 10 soru'})).toHaveLength(1)
    fireEvent.click(screen.getByRole('button',{name:'Başlat · 10 soru'}))
    expect(props.onStart).toHaveBeenCalledOnce()
    expect(screen.queryByText('Turun hazır!')).not.toBeInTheDocument()
    expect(container.querySelector('[data-mobile-lobby-flow]')).toBeNull()
    expect(screen.getByRole('link',{name:'Oyunlara dön'})).toHaveAttribute('href','/arena')
  })
  it('places the selected Bilge guide in the preparation header instead of below the tour summary', () => {
    const {container}=render(<DesktopGameLobby {...makeProps()} />)
    const header=container.querySelector('header')
    const summary=container.querySelector('aside')
    expect(header).not.toBeNull()
    expect(summary).not.toBeNull()
    expect(within(header as HTMLElement).getByRole('img',{name:'Kadın Bilge'})).toBeInTheDocument()
    expect(within(header as HTMLElement).getByText(/İşlemleri dikkatle kur/)).toBeInTheDocument()
    expect(summary?.querySelector('[data-lobby-guide]')).toBeNull()
  })
  it('adapts Bilge expression and guidance to the selected mode and subject', () => {
    const props={...makeProps(),game:'sosyal' as const,selectedMode:'classic'}
    const {rerender}=render(<DesktopGameLobby {...props} />)
    const guide=screen.getByText('BİLGE YANINDA').closest('[data-lobby-guide]') as HTMLElement
    expect(within(guide).getByText(/Zamanı, yeri ve nedeni/)).toBeInTheDocument()
    expect(within(guide).getByRole('img',{name:'Kadın Bilge'}).getAttribute('src')).toContain('/kararli.png')
    rerender(<DesktopGameLobby {...props} selectedMode="boss" />)
    expect(within(guide).getByText(/Zor sorular seni bekliyor/)).toBeInTheDocument()
    expect(within(guide).getByRole('img',{name:'Kadın Bilge'}).getAttribute('src')).toContain('/hafif-kizgin.png')
  })
  it('uses context mode objects and preserves a selected secondary mode while collapsed', () => {
    const props=makeProps()
    const {rerender}=render(<DesktopGameLobby {...props} />)
    const modes=screen.getByRole('group',{name:'Oyun biçimi'})
    expect(within(modes).getAllByRole('button')).toHaveLength(3)
    fireEvent.click(within(modes).getByRole('button',{name:/Pratik/}))
    expect(props.onSelectMode).toHaveBeenCalledWith(getModesForContext('matematik','TYT',true).find(m=>m.id==='practice'))
    fireEvent.click(screen.getByRole('button',{name:'Blitz, Maraton ve Boss'}))
    expect(within(modes).getAllByRole('button')).toHaveLength(6)
    rerender(<DesktopGameLobby {...props} selectedMode="boss" />)
    fireEvent.click(screen.getByRole('button',{name:'Daha az mod göster'}))
    expect(within(modes).getByRole('button',{name:/Boss/})).toHaveAttribute('aria-pressed','true')
    expect(within(modes).getAllByRole('button')).toHaveLength(4)
  })
  it('renders primary scenes and all six decorative mode scenes when expanded', () => {
    const {container}=render(<DesktopGameLobby {...makeProps()} />)
    const artCards=[...container.querySelectorAll<HTMLElement>('[data-mode-art]')]
    expect(artCards.map(card=>card.dataset.modeArt)).toEqual(['classic','deneme','practice'])
    expect(artCards.every(card=>card.querySelector('img')?.getAttribute('alt')==='')).toBe(true)
    expect(artCards.every(card=>card.querySelector('img')?.getAttribute('sizes')?.includes('calc((100vw - 382px) / 3)'))).toBe(true)
    expect(screen.getByRole('button',{name:/Klasik, 10 soru/})).toBeInTheDocument()
    expect(screen.getByRole('button',{name:/Deneme Sınavı, 40 soru/})).toBeInTheDocument()
    expect(screen.getByRole('button',{name:/Pratik, 10 soru/})).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button',{name:'Blitz, Maraton ve Boss'}))
    const expandedArtCards=[...container.querySelectorAll<HTMLElement>('[data-mode-art]')]
    expect(expandedArtCards.map(card=>card.dataset.modeArt)).toEqual(['classic','blitz','marathon','boss','deneme','practice'])
    expect(expandedArtCards.every(card=>card.querySelector('img')?.getAttribute('alt')==='')).toBe(true)
    expect(screen.getByRole('button',{name:/Blitz, 5 soru/})).toBeInTheDocument()
    expect(screen.getByRole('button',{name:/Maraton, 20 soru/})).toBeInTheDocument()
    expect(screen.getByRole('button',{name:/Boss, 5 soru/})).toBeInTheDocument()
  })
  it('forwards scope, topic and difficulty through existing callbacks', () => {
    const props=makeProps()
    render(<DesktopGameLobby {...props} />)
    fireEvent.change(screen.getByLabelText('Sınav kapsamı'),{target:{value:'LGS'}})
    fireEvent.change(screen.getByLabelText('Konu'),{target:{value:'problemler'}})
    fireEvent.change(screen.getByLabelText('Zorluk'),{target:{value:'3'}})
    expect(props.onSelectExamRef).toHaveBeenCalledWith('LGS')
    expect(props.onSelectCategory).toHaveBeenCalledWith('problemler')
    expect(props.onSelectDifficulty).toHaveBeenCalledWith(3)
    fireEvent.change(screen.getByLabelText('Zorluk'),{target:{value:'0'}})
    expect(props.onSelectDifficulty).toHaveBeenLastCalledWith(null)
  })
  it('keeps scope-specific categories and blocks an obsolete topic without silently starting', () => {
    const props={...makeProps(),game:'turkce' as const,selectedCategory:'edebiyat'}
    render(<DesktopGameLobby {...props} />)
    expect(within(screen.getByLabelText('Konu')).queryByRole('option',{name:'Edebiyat'})).not.toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Önceki konu bu sınavda yok')
    expect(screen.getByRole('button',{name:'Başlat · 10 soru'})).toBeDisabled()
  })
  it('does not introduce an exam filter into WordQuest', () => {
    render(<DesktopGameLobby {...makeProps()} game="wordquest" selectedExamRef={null} />)
    expect(screen.queryByLabelText('Sınav kapsamı')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Konu')).toBeInTheDocument()
  })
  it('updates an entry URL with the new scope and drops an out-of-scope topic without dropping unrelated params', () => {
    window.history.replaceState(null,'','/arena/turkce?exam_ref=AYT-SOZ&category=edebiyat&source=practice#settings')
    const props={...makeProps(),game:'turkce' as const,selectedExamRef:'AYT-SOZ',selectedCategory:'edebiyat'}
    render(<DesktopGameLobby {...props} />)
    fireEvent.change(screen.getByLabelText('Sınav kapsamı'),{target:{value:'TYT'}})
    const url=new URL(window.location.href)
    expect(url.searchParams.get('exam_ref')).toBe('TYT')
    expect(url.searchParams.has('category')).toBe(false)
    expect(url.searchParams.get('source')).toBe('practice')
    expect(url.hash).toBe('#settings')
    expect(props.onSelectExamRef).toHaveBeenCalledWith('TYT')
  })
  it('updates an entry category query when the user chooses another topic', () => {
    window.history.replaceState(null,'','/arena/matematik?exam_ref=TYT&category=sayilar')
    const props={...makeProps(),selectedCategory:'sayilar'}
    render(<DesktopGameLobby {...props} />)
    fireEvent.change(screen.getByLabelText('Konu'),{target:{value:'problemler'}})
    expect(new URL(window.location.href).searchParams.get('category')).toBe('problemler')
    expect(props.onSelectCategory).toHaveBeenCalledWith('problemler')
  })
  it('keeps TYT Social scope mandatory and exact-section settings locked', () => {
    render(<DesktopGameLobby {...makeProps()} game="sosyal" selectedExamRef={null} selectedMode="deneme" />)
    expect(screen.getByLabelText('Sınav kapsamı')).toHaveValue('TYT')
    expect(within(screen.getByLabelText('Sınav kapsamı')).queryByRole('option',{name:'Tüm sınavlar'})).not.toBeInTheDocument()
    expect(screen.getByLabelText('Konu')).toBeDisabled()
    expect(screen.getByLabelText('Zorluk')).toBeDisabled()
    expect(screen.getByText('20 soruluk TYT Sosyal bölümü')).toBeInTheDocument()
    expect(screen.getByRole('button',{name:'Başlat · 20 soru'})).toBeInTheDocument()
  })
  it('lets an explicit UI mode choice leave a practice entry preference without losing its source context', () => {
    window.history.replaceState(null,'','/arena/matematik?exam_ref=TYT&mode=practice&source=program')
    const props={...makeProps(),selectedMode:'practice'}
    const {rerender}=render(<DesktopGameLobby {...props} />)
    fireEvent.click(within(screen.getByRole('group',{name:'Oyun biçimi'})).getByRole('button',{name:/Klasik/}))
    const url=new URL(window.location.href)
    expect(url.searchParams.has('mode')).toBe(false)
    expect(url.searchParams.get('source')).toBe('program')
    expect(props.onSelectMode).not.toHaveBeenCalled()
    rerender(<DesktopGameLobby {...props} />)
    expect(props.onSelectMode).toHaveBeenCalledWith(expect.objectContaining({id:'classic'}))
  })
  it('keeps legacy Social mode count when its rollout is disabled', () => {
    vi.stubEnv('NEXT_PUBLIC_TYT_SOCIAL_V2_ENABLED','false')
    render(<DesktopGameLobby {...makeProps()} game="sosyal" selectedMode="deneme" />)
    expect(screen.getByRole('button',{name:'Başlat · 40 soru'})).toBeInTheDocument()
    expect(screen.getByLabelText('Konu')).toBeEnabled()
  })
  it('explains the real single-question guest preview instead of promising a full round', () => {
    const props=makeProps()
    render(<DesktopGameLobby {...props} quizLimit={{canPlay:true,isGuest:true,isPremium:false,remaining:0}} />)
    expect(screen.getByText(/Giriş yapmadan 1 soruyu/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button',{name:'Önizlemeyi başlat · 1 soru'}))
    expect(props.onStart).toHaveBeenCalledOnce()
    const summary=screen.getByRole('complementary',{name:'Tur özeti'})
    expect(within(summary).queryByText('10')).not.toBeInTheDocument()
  })
  it('policy blocking takes precedence over a provided sign-in link and start handler', () => {
    const props=makeProps()
    render(<DesktopGameLobby {...props} startBlocked startBlockedLabel="Cevaplama düzenini seç" startHref="/giris?next=%2Farena%2Fsosyal" />)
    const button=screen.getByRole('button',{name:'Cevaplama düzenini seç'})
    expect(button).toBeDisabled();fireEvent.click(button)
    expect(props.onStart).not.toHaveBeenCalled()
    expect(screen.queryByRole('link',{name:'Giriş yaparak başla'})).not.toBeInTheDocument()
  })
  it('preserves the caller-provided secure login destination', () => {
    render(<DesktopGameLobby {...makeProps()} startHref="/giris?redirect=%2Farena%2Fsosyal%3Fexam_ref%3DTYT" startLabel="Giriş yaparak başla" />)
    expect(screen.getByRole('link',{name:'Giriş yaparak başla'})).toHaveAttribute('href','/giris?redirect=%2Farena%2Fsosyal%3Fexam_ref%3DTYT')
  })
  it('routes exhausted quota to the existing limit callback, never the start callback', () => {
    const props=makeProps(),onLimitReached=vi.fn()
    const {rerender}=render(<DesktopGameLobby {...props} onLimitReached={onLimitReached} quizLimit={{canPlay:false,isGuest:false,isPremium:false,remaining:0}} />)
    fireEvent.click(screen.getByRole('button',{name:/Limit doldu/}))
    expect(onLimitReached).toHaveBeenCalledOnce();expect(props.onStart).not.toHaveBeenCalled()
    rerender(<DesktopGameLobby {...props} quizLimit={{canPlay:false,isGuest:false,isPremium:false,remaining:0}} />)
    expect(screen.getByRole('button',{name:/Limit doldu/})).toBeDisabled()
  })
  it('retains errors and one secondary personalized-mock slot', () => {
    const {container}=render(<DesktopGameLobby {...makeProps()} loadError="Sorular yüklenemedi" personalizedMockCard={<button>Akıllı deneme</button>} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Sorular yüklenemedi')
    expect(container.querySelectorAll('[data-personalized-mock-slot]')).toHaveLength(1)
    expect(container.querySelector('details')).not.toHaveAttribute('open')
  })
})
