import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DesktopDailyPlan } from '../desktop-daily-plan'

const { push, fetchMock } = vi.hoisted(() => ({push:vi.fn(),fetchMock:vi.fn()}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

const props = {mode:'live' as const,game:'matematik' as const,examRef:'TYT',userId:'student'}
const plan = (total=15, completed=0) => ({
  game:'matematik', examRef:'TYT', planDate:'2026-09-14',
  questions:Array.from({length:total},(_,i) => ({id:`q${i}`})),
  completedIds:Array.from({length:completed},(_,i) => `q${i}`),
  items:Array.from({length:total},(_,i) => ({questionId:`q${i}`,position:i,slotType:'due',sourceType:'question',sourceLabel:'Tekrar',completed:i<completed})),
  attemptId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',expiresAt:'2099-01-01T00:00:00.000Z',
})

beforeEach(() => {
  push.mockReset()
  fetchMock.mockReset().mockResolvedValue({ok:true,json:async()=>plan()})
  vi.stubGlobal('fetch',fetchMock)
  Object.defineProperty(HTMLDialogElement.prototype,'showModal',{configurable:true,value:function(this:HTMLDialogElement){this.setAttribute('open','')}})
  Object.defineProperty(HTMLDialogElement.prototype,'close',{configurable:true,value:function(this:HTMLDialogElement){this.removeAttribute('open')}})
})
afterEach(() => {vi.unstubAllGlobals();vi.restoreAllMocks()})

describe('Desktop daily plan summary', () => {
  it('labels demo progress and shows explanation without requesting or starting a real plan', () => {
    render(<DesktopDailyPlan {...props} mode="demo" />)
    expect(screen.getByText('Sana özel günlük plan · Örnek')).toBeInTheDocument()
    const ring = screen.getByRole('progressbar',{name:'Günlük plan ilerlemesi'})
    expect(ring).toHaveAttribute('aria-valuenow','0')
    expect(ring).toHaveAttribute('aria-valuemin','0')
    expect(ring).toHaveAttribute('aria-valuemax','15')
    expect(ring.getAttribute('style')).toContain('var(--app-accent) 0%')
    const counter = screen.getByRole('group',{name:'Tamamlanan günlük plan soruları'})
    expect(counter).toHaveTextContent('0 / 15')
    expect(screen.getAllByText('0 / 15')).toHaveLength(1)
    expect(counter).toContainElement(ring)
    expect(screen.getAllByRole('progressbar')).toHaveLength(1)
    expect(counter.closest('section')?.querySelector('progress')).toBeNull()
    const trophy = counter.closest('section')?.querySelector('img')
    expect(trophy).toHaveAttribute('src','/academy/daily-plan-trophy-v1.png')
    expect(trophy).toHaveAttribute('alt','')
    expect(trophy?.parentElement).toHaveAttribute('aria-hidden','true')
    expect(trophy?.parentElement?.querySelector('svg')).toBeNull()
    fireEvent.click(screen.getByRole('button',{name:'Planı incele'}))
    expect(screen.getByRole('dialog')).toHaveTextContent('gerçek bir günlük plan oluşturulmaz')
    expect(screen.getByText('5 tekrar')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
  })

  it('does not fabricate progress or request plans for guests', () => {
    render(<DesktopDailyPlan {...props} userId={null} />)
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    expect(screen.queryByText('Dengeli planın hazır')).not.toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('shares one fetched plan between summary and modal, then uses the established start route', async () => {
    render(<DesktopDailyPlan {...props} />)
    expect(screen.getByRole('heading',{name:'Günlük planın yükleniyor…'})).toBeInTheDocument()
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    await screen.findByRole('heading',{name:'Dengeli planın hazır'})
    expect(fetchMock).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button',{name:'Planı incele'}))
    await screen.findByRole('button',{name:'Planı Başlat · 15 Soru'})
    expect(fetchMock).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button',{name:'Pencereyi kapat'}))
    fireEvent.click(screen.getByRole('button',{name:'Planı incele'}))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button',{name:'Planı Başlat · 15 Soru'}))
    expect(push).toHaveBeenCalledWith('/arena/matematik?start=today-plan&exam_ref=TYT')
  })

  it('shrinks completed plans and counts only questions belonging to this plan', async () => {
    fetchMock.mockResolvedValue({ok:true,json:async()=>({...plan(12,12),completedIds:[...plan(12,12).completedIds,'unrelated']})})
    render(<DesktopDailyPlan {...props} />)
    const title=await screen.findByRole('heading',{name:'Bugünkü planını tamamladın'})
    expect(title.closest('section')).toHaveAttribute('data-complete','true')
    expect(screen.getByRole('group',{name:'Tamamlanan günlük plan soruları'})).toHaveTextContent('12 / 12')
    const ring = screen.getByRole('progressbar',{name:'Günlük plan ilerlemesi'})
    expect(ring).toHaveAttribute('aria-valuenow','12')
    expect(ring).toHaveAttribute('aria-valuemax','12')
    expect(ring.getAttribute('style')).toContain('var(--app-accent) 100%')
    expect(title.closest('section')?.querySelector('progress')).toBeNull()
    const trophy = title.closest('section')?.querySelector('img')
    expect(trophy).toHaveAttribute('src','/academy/daily-plan-trophy-v1.png')
    expect(trophy).toHaveAttribute('sizes','56px')
    expect(trophy?.parentElement?.querySelector('svg')).not.toBeNull()
  })

  it('shows partial progress only in the ring with matching accessible values', async () => {
    fetchMock.mockResolvedValue({ok:true,json:async()=>plan(15,6)})
    render(<DesktopDailyPlan {...props} />)
    await screen.findByRole('heading',{name:'Planına kaldığın yerden devam et'})
    const ring = screen.getByRole('progressbar',{name:'Günlük plan ilerlemesi'})
    expect(ring).toHaveTextContent('6 / 15')
    expect(ring).toHaveAttribute('aria-valuenow','6')
    expect(ring).toHaveAttribute('aria-valuemax','15')
    expect(ring).toHaveAttribute('aria-valuetext','15 sorudan 6 tamamlandı')
    expect(ring.getAttribute('style')).toContain('var(--app-accent) 40%')
    expect(screen.getAllByRole('progressbar')).toHaveLength(1)
    expect(ring.closest('section')?.querySelector('progress')).toBeNull()
  })

  it('does not show zero or ready when the plan is unavailable', async () => {
    fetchMock.mockResolvedValue({ok:false,status:503})
    render(<DesktopDailyPlan {...props} />)
    await screen.findByRole('heading',{name:'Planına şu an ulaşılamıyor'})
    expect(screen.queryByText('Dengeli planın hazır')).not.toBeInTheDocument()
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button',{name:'Planı incele'}))
    expect(screen.getByRole('button',{name:'Planı yeniden dene'})).toBeInTheDocument()
  })

  it('hides the old summary immediately when the exam context changes', async () => {
    const {rerender}=render(<DesktopDailyPlan {...props} />)
    await screen.findByRole('heading',{name:'Dengeli planın hazır'})
    fetchMock.mockImplementation(() => new Promise(() => {}))
    rerender(<DesktopDailyPlan {...props} examRef="AYT-SAY" />)
    expect(screen.queryByText('Dengeli planın hazır')).not.toBeInTheDocument()
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    await act(async () => {})
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
  })
})
