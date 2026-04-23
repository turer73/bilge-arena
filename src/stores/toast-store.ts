import { create } from 'zustand'
import { playSound } from '@/lib/utils/sounds'

export type ToastType = 'success' | 'error' | 'info' | 'badge' | 'quest' | 'streak' | 'level_up'

export interface Toast {
  id: string
  type: ToastType
  title: string
  description?: string
  icon?: string
  duration?: number // ms — varsayilan 4000
}

interface ToastState {
  toasts: Toast[]
  addToast: (toast: Omit<Toast, 'id'>) => void
  removeToast: (id: string) => void
}

let counter = 0

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  addToast: (toast) => {
    const id = `toast-${++counter}-${Date.now()}`
    set((state) => ({
      toasts: [...state.toasts, { ...toast, id }],
    }))

    // Otomatik kaldır
    const duration = toast.duration ?? 4000
    setTimeout(() => {
      set((state) => ({
        toasts: state.toasts.filter((t) => t.id !== id),
      }))
    }, duration)
  },
  removeToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),
}))

// Yardimci fonksiyonlar — import etmeden kullanilabilir
export const toast = {
  success: (title: string, description?: string) =>
    useToastStore.getState().addToast({ type: 'success', title, description, icon: '✅' }),
  error: (title: string, description?: string) =>
    useToastStore.getState().addToast({ type: 'error', title, description, icon: '❌' }),
  info: (title: string, description?: string) =>
    useToastStore.getState().addToast({ type: 'info', title, description, icon: 'ℹ️' }),
  badge: (badgeName: string, badgeIcon: string, xp?: number) => {
    playSound('badge')
    useToastStore.getState().addToast({
      type: 'badge',
      title: 'Yeni Rozet!',
      description: `${badgeIcon} ${badgeName}${xp ? ` · +${xp} XP` : ''}`,
      icon: '🏅',
      duration: 5000,
    })
  },
  quest: (questTitle: string) => {
    playSound('xp')
    useToastStore.getState().addToast({
      type: 'quest',
      title: 'Görev Tamamlandı!',
      description: questTitle,
      icon: '📋',
      duration: 5000,
    })
  },
  streak: (count: number) =>
    useToastStore.getState().addToast({
      type: 'streak',
      title: `${count} Seri!`,
      description: count >= 10 ? 'Durdurulamaz!' : count >= 5 ? 'Ateş üstünde!' : 'Devam et!',
      icon: '🔥',
      duration: 3000,
    }),
  levelUp: (levelName: string, levelBadge: string) => {
    playSound('level_up')
    useToastStore.getState().addToast({
      type: 'level_up',
      title: '🎉 Seviye Atladın!',
      description: `${levelBadge} ${levelName} seviyesine ulaştın!`,
      icon: '⬆️',
      duration: 6000,
    })
  },
}
