'use client'

import { getSoundEnabled } from '@/lib/utils/sounds'
import { CHAN_AUDIO_MAP } from '@/lib/constants/chan-audio-map'

/**
 * Bilge Chan TTS — sabit replikler için önceden üretilmiş FreyaTTS MP3'ü
 * (bkz. CHAN_AUDIO_MAP), dinamik metinler (Gemini ipucu/çözüm) için tarayıcı
 * speechSynthesis fallback'i.
 *
 * Bilinçli tercihler:
 * - Statik MP3 varsa ONA öncelik: sabit tutarlı ses, sıfır çalışma-zamanı maliyeti.
 * - speechSynthesis fallback (dinamik metin veya statik yüklenemezse): YEREL ses
 *   tercih edilir (localService) — Codex P2: bazı tarayıcı/OS kombinasyonlarında
 *   yalnızca UZAK ses servisi bulunur; o durumda metin tarayıcının ses sağlayıcısına
 *   gider (mutlak "cihaz dışına çıkmaz" garantisi YOK, best-effort).
 * - Global ses tercihi (SoundToggle / bilge-sound) kapalıysa konuşmaz.
 * - Desteklenmeyen tarayıcıda sessizce no-op (buton zaten render edilmez).
 */

let currentAudio: HTMLAudioElement | null = null

export function isTtsSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

function cleanLine(text: string): string {
  return text.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '').trim()
}

function speakWithSynthesis(cleaned: string): void {
  const synth = window.speechSynthesis
  synth.cancel()

  const utterance = new SpeechSynthesisUtterance(cleaned)
  utterance.lang = 'tr-TR'
  utterance.rate = 1.05
  utterance.pitch = 1.15 // genç karakter tonu

  // Türkçe sesler içinde YEREL olani tercih et (gizlilik: metin cihazda kalsin);
  // yerel TR yoksa uzak TR'ye dus (yukaridaki best-effort notu)
  const trVoices = synth.getVoices().filter(v => v.lang.toLowerCase().startsWith('tr'))
  const trVoice = trVoices.find(v => v.localService) ?? trVoices[0]
  if (trVoice) utterance.voice = trVoice

  synth.speak(utterance)
}

/** Önceki konuşmayı/oynatmayı iptal edip metni seslendirir (statik MP3 öncelikli). */
export function speakChanLine(text: string): boolean {
  if (!isTtsSupported() || !getSoundEnabled()) return false
  const cleaned = cleanLine(text)
  if (!cleaned) return false

  stopChanSpeech()

  const audioKey = CHAN_AUDIO_MAP[cleaned]
  if (audioKey) {
    const audio = new Audio(`/audio/chan/${audioKey}.mp3`)
    currentAudio = audio
    audio.play().catch(() => {
      // Statik dosya oynatılamadı (ağ/format) — tarayıcı sesine düş.
      if (currentAudio === audio) currentAudio = null
      speakWithSynthesis(cleaned)
    })
    return true
  }

  speakWithSynthesis(cleaned)
  return true
}

/** Aktif konuşmayı/oynatmayı durdur (soru değişimi/unmount temizliği). */
export function stopChanSpeech(): void {
  if (currentAudio) {
    currentAudio.pause()
    currentAudio = null
  }
  if (isTtsSupported()) window.speechSynthesis.cancel()
}
