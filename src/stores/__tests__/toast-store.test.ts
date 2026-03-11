import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useToastStore, toast } from '../toast-store'

describe('toast-store', () => {
  beforeEach(() => {
    // Store'u temizle
    useToastStore.setState({ toasts: [] })
    vi.useFakeTimers()
  })

  it('addToast yeni toast eklemeli', () => {
    useToastStore.getState().addToast({
      type: 'success',
      title: 'Test basarili',
    })

    const { toasts } = useToastStore.getState()
    expect(toasts).toHaveLength(1)
    expect(toasts[0].title).toBe('Test basarili')
    expect(toasts[0].type).toBe('success')
    expect(toasts[0].id).toBeTruthy()
  })

  it('birden fazla toast eklenebilmeli', () => {
    useToastStore.getState().addToast({ type: 'success', title: 'Birinci' })
    useToastStore.getState().addToast({ type: 'error', title: 'Ikinci' })
    useToastStore.getState().addToast({ type: 'info', title: 'Ucuncu' })

    expect(useToastStore.getState().toasts).toHaveLength(3)
  })

  it('removeToast belirtilen toast\'i kaldirmali', () => {
    useToastStore.getState().addToast({ type: 'success', title: 'Kaldir' })
    const id = useToastStore.getState().toasts[0].id
    useToastStore.getState().removeToast(id)

    expect(useToastStore.getState().toasts).toHaveLength(0)
  })

  it('toast 4 saniye sonra otomatik kaldirilmali', () => {
    useToastStore.getState().addToast({ type: 'success', title: 'Auto-remove' })
    expect(useToastStore.getState().toasts).toHaveLength(1)

    vi.advanceTimersByTime(4000)
    expect(useToastStore.getState().toasts).toHaveLength(0)
  })

  it('ozel duration desteklenmeli', () => {
    useToastStore.getState().addToast({
      type: 'badge',
      title: 'Uzun toast',
      duration: 8000,
    })
    expect(useToastStore.getState().toasts).toHaveLength(1)

    vi.advanceTimersByTime(4000)
    expect(useToastStore.getState().toasts).toHaveLength(1) // hala burada

    vi.advanceTimersByTime(4000)
    expect(useToastStore.getState().toasts).toHaveLength(0) // simdi gitti
  })
})

describe('toast helper fonksiyonlari', () => {
  beforeEach(() => {
    useToastStore.setState({ toasts: [] })
    vi.useFakeTimers()
  })

  it('toast.success dogru type ile toast eklemeli', () => {
    toast.success('Basarili!', 'Detay')
    const t = useToastStore.getState().toasts[0]
    expect(t.type).toBe('success')
    expect(t.title).toBe('Basarili!')
    expect(t.description).toBe('Detay')
    expect(t.icon).toBe('✅')
  })

  it('toast.error dogru type ile toast eklemeli', () => {
    toast.error('Hata!')
    const t = useToastStore.getState().toasts[0]
    expect(t.type).toBe('error')
    expect(t.icon).toBe('❌')
  })

  it('toast.badge rozet bilgisi icermeli', () => {
    toast.badge('Ilk Adim', '🎮', 50)
    const t = useToastStore.getState().toasts[0]
    expect(t.type).toBe('badge')
    expect(t.title).toBe('Yeni Rozet!')
    expect(t.description).toContain('🎮')
    expect(t.description).toContain('Ilk Adim')
    expect(t.description).toContain('+50 XP')
    expect(t.duration).toBe(5000)
  })

  it('toast.quest gorev ismini icermeli', () => {
    toast.quest('3 oyun oyna')
    const t = useToastStore.getState().toasts[0]
    expect(t.type).toBe('quest')
    expect(t.title).toBe('Gorev Tamamlandi!')
    expect(t.description).toBe('3 oyun oyna')
  })

  it('toast.streak sayiya gore mesaj degistirmeli', () => {
    toast.streak(3)
    let t = useToastStore.getState().toasts[0]
    expect(t.title).toBe('3 Seri!')
    expect(t.description).toBe('Devam et!')

    toast.streak(7)
    t = useToastStore.getState().toasts[1]
    expect(t.description).toBe('Ates ustunde!')

    toast.streak(15)
    t = useToastStore.getState().toasts[2]
    expect(t.description).toBe('Durdurulamaz!')
  })
})
