/**
 * Web Audio API ile programatik ses efektleri.
 * Harici dosya gerektirmez — sıfır KB ek yük.
 *
 * Kullanım:
 *   import { playSound } from '@/lib/utils/sounds'
 *   playSound('correct')
 */

let audioCtx: AudioContext | null = null

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!audioCtx) {
    try {
      audioCtx = new AudioContext()
    } catch {
      return null
    }
  }
  return audioCtx
}

// Ses tercihini localStorage'dan oku
function isMuted(): boolean {
  if (typeof window === 'undefined') return true
  return localStorage.getItem('bilge-sound') === 'off'
}

export function toggleSound(): boolean {
  const next = isMuted() ? 'on' : 'off'
  localStorage.setItem('bilge-sound', next)
  return next === 'on'
}

export function getSoundEnabled(): boolean {
  return !isMuted()
}

// ─── Temel ses üretici ───

function playTone(
  frequency: number,
  duration: number,
  type: OscillatorType = 'sine',
  volume = 0.15,
) {
  if (isMuted()) return
  const ctx = getCtx()
  if (!ctx) return

  const osc = ctx.createOscillator()
  const gain = ctx.createGain()

  osc.type = type
  osc.frequency.setValueAtTime(frequency, ctx.currentTime)
  gain.gain.setValueAtTime(volume, ctx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration)

  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start(ctx.currentTime)
  osc.stop(ctx.currentTime + duration)
}

function playSequence(
  notes: Array<{ freq: number; start: number; dur: number; type?: OscillatorType; vol?: number }>,
) {
  if (isMuted()) return
  const ctx = getCtx()
  if (!ctx) return

  for (const n of notes) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = n.type || 'sine'
    osc.frequency.setValueAtTime(n.freq, ctx.currentTime + n.start)
    gain.gain.setValueAtTime(n.vol ?? 0.12, ctx.currentTime + n.start)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + n.start + n.dur)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(ctx.currentTime + n.start)
    osc.stop(ctx.currentTime + n.start + n.dur)
  }
}

// ─── Ses efektleri ───

export type SoundEffect =
  | 'correct'
  | 'wrong'
  | 'streak'
  | 'life_lost'
  | 'game_over'
  | 'level_up'
  | 'badge'
  | 'xp'
  | 'click'
  | 'countdown'

export function playSound(effect: SoundEffect) {
  switch (effect) {
    case 'correct':
      // Yukarı çıkan iki nota — neşeli
      playSequence([
        { freq: 523, start: 0, dur: 0.12, type: 'triangle' },     // C5
        { freq: 659, start: 0.08, dur: 0.18, type: 'triangle' },  // E5
      ])
      break

    case 'wrong':
      // Aşağı inen iki nota — hüzünlü
      playSequence([
        { freq: 311, start: 0, dur: 0.15, type: 'sawtooth', vol: 0.08 },    // Eb4
        { freq: 233, start: 0.1, dur: 0.25, type: 'sawtooth', vol: 0.06 },  // Bb3
      ])
      break

    case 'streak':
      // Yükselen üçlü — heyecan verici
      playSequence([
        { freq: 523, start: 0, dur: 0.1, type: 'triangle' },     // C5
        { freq: 659, start: 0.08, dur: 0.1, type: 'triangle' },  // E5
        { freq: 784, start: 0.16, dur: 0.2, type: 'triangle' },  // G5
      ])
      break

    case 'life_lost':
      // Kırılma hissi — düşük ton + buzz
      playSequence([
        { freq: 200, start: 0, dur: 0.3, type: 'sawtooth', vol: 0.1 },
        { freq: 150, start: 0.15, dur: 0.4, type: 'square', vol: 0.05 },
      ])
      break

    case 'game_over':
      // Dramatik düşüş
      playSequence([
        { freq: 392, start: 0, dur: 0.2, type: 'triangle', vol: 0.15 },    // G4
        { freq: 330, start: 0.15, dur: 0.2, type: 'triangle', vol: 0.12 }, // E4
        { freq: 262, start: 0.3, dur: 0.2, type: 'triangle', vol: 0.1 },   // C4
        { freq: 196, start: 0.45, dur: 0.5, type: 'sawtooth', vol: 0.08 }, // G3
      ])
      break

    case 'level_up':
      // Zafer fanfarı — yükselen dört nota
      playSequence([
        { freq: 523, start: 0, dur: 0.15, type: 'triangle', vol: 0.15 },    // C5
        { freq: 659, start: 0.12, dur: 0.15, type: 'triangle', vol: 0.15 }, // E5
        { freq: 784, start: 0.24, dur: 0.15, type: 'triangle', vol: 0.15 }, // G5
        { freq: 1047, start: 0.36, dur: 0.35, type: 'triangle', vol: 0.18 },// C6
      ])
      break

    case 'badge':
      // Büyülü pırıltı
      playSequence([
        { freq: 880, start: 0, dur: 0.1, type: 'sine', vol: 0.1 },
        { freq: 1109, start: 0.08, dur: 0.1, type: 'sine', vol: 0.1 },
        { freq: 1319, start: 0.16, dur: 0.2, type: 'sine', vol: 0.12 },
        { freq: 1760, start: 0.28, dur: 0.3, type: 'sine', vol: 0.08 },
      ])
      break

    case 'xp':
      // Kısa coin sesi
      playTone(1200, 0.08, 'sine', 0.08)
      break

    case 'click':
      // Hafif tık
      playTone(800, 0.04, 'sine', 0.05)
      break

    case 'countdown':
      // Tik-tak uyarı
      playTone(440, 0.06, 'square', 0.06)
      break
  }
}
