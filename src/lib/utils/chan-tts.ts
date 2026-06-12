'use client'

import { getSoundEnabled } from '@/lib/utils/sounds'

/**
 * Bilge Chan TTS — Web Speech API ile companion repliklerini seslendirir.
 *
 * Bilinçli tercihler:
 * - Tarayıcı yerleşik speechSynthesis: sıfır maliyet, ek bağımlılık yok.
 *   YEREL ses tercih edilir (localService) — Codex P2: bazı tarayıcı/OS
 *   kombinasyonlarında yalnızca UZAK ses servisi bulunur; o durumda metin
 *   tarayıcının ses sağlayıcısına gider (mutlak "cihaz dışına çıkmaz"
 *   garantisi YOK, best-effort). Faz-3'te build-time statik MP3'e geçilirse
 *   bu modül tek değişim noktası.
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

  // Türkçe sesler içinde YEREL olani tercih et (gizlilik: metin cihazda kalsin);
  // yerel TR yoksa uzak TR'ye dus (yukaridaki best-effort notu)
  const trVoices = synth.getVoices().filter(v => v.lang.toLowerCase().startsWith('tr'))
  const trVoice = trVoices.find(v => v.localService) ?? trVoices[0]
  if (trVoice) utterance.voice = trVoice

  synth.speak(utterance)
  return true
}

/** Aktif konuşmayı durdur (soru değişimi/unmount temizliği). */
export function stopChanSpeech(): void {
  if (isTtsSupported()) window.speechSynthesis.cancel()
}
