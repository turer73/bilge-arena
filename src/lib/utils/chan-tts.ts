'use client'

import { getSoundEnabled } from '@/lib/utils/sounds'

/**
 * Bilge Chan TTS — Web Speech API ile companion repliklerini seslendirir.
 *
 * Bilinçli tercihler:
 * - Tarayıcı yerleşik speechSynthesis: sıfır maliyet, sıfır network, KVKK-temiz
 *   (metin cihaz dışına çıkmaz). Kalite cihaza göre değişir — Faz-3'te sunucu
 *   TTS'e geçilirse bu modül tek değişim noktası.
 * - Global ses tercihi (SoundToggle / bilge-sound) kapalıysa konuşmaz.
 * - Desteklenmeyen tarayıcıda sessizce no-op (buton zaten render edilmez).
 */

export function isTtsSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

/** Önceki konuşmayı iptal edip metni Türkçe seslendirir. */
export function speakChanLine(text: string): boolean {
  if (!isTtsSupported() || !getSoundEnabled()) return false
  const cleaned = text.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '').trim()
  if (!cleaned) return false

  const synth = window.speechSynthesis
  synth.cancel()

  const utterance = new SpeechSynthesisUtterance(cleaned)
  utterance.lang = 'tr-TR'
  utterance.rate = 1.05
  utterance.pitch = 1.15 // genç karakter tonu

  // Türkçe ses varsa onu seç (yoksa tarayıcı lang'e göre düşer)
  const trVoice = synth.getVoices().find(v => v.lang.toLowerCase().startsWith('tr'))
  if (trVoice) utterance.voice = trVoice

  synth.speak(utterance)
  return true
}

/** Aktif konuşmayı durdur (soru değişimi/unmount temizliği). */
export function stopChanSpeech(): void {
  if (isTtsSupported()) window.speechSynthesis.cancel()
}
