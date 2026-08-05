/**
 * Bilge Arena: chan-tts — Web Speech TTS sarmalayıcısı.
 * Destek tespiti, mute saygısı, emoji temizliği, TR ses seçimi, cancel.
 */

import { describe, test, expect, vi, beforeEach } from 'vitest'

const soundState = vi.hoisted(() => ({ enabled: true }))
vi.mock('@/lib/utils/sounds', () => ({ getSoundEnabled: () => soundState.enabled }))

// Varsayılan bos map: bu dosyadaki mevcut testler speechSynthesis yolunu hedefliyor,
// statik-ses onceligi ayri bir describe blogunda test edilir.
const audioMapState = vi.hoisted(() => ({ map: {} as Record<string, string> }))
vi.mock('@/lib/constants/chan-audio-map', () => ({
  get CHAN_AUDIO_MAP() { return audioMapState.map },
}))

import { isTtsSupported, speakChanLine, stopChanSpeech } from '../chan-tts'

interface FakeVoice {
  lang: string
  name: string
  localService?: boolean
}

const synth = {
  cancel: vi.fn(),
  speak: vi.fn(),
  getVoices: vi.fn((): FakeVoice[] => [
    { lang: 'en-US', name: 'EnVoice' },
    { lang: 'tr-TR', name: 'TrVoice' },
  ]),
}

class FakeUtterance {
  text: string
  lang = ''
  rate = 1
  pitch = 1
  voice: unknown = null
  constructor(text: string) { this.text = text }
}

beforeEach(() => {
  vi.clearAllMocks()
  soundState.enabled = true
  ;(globalThis as Record<string, unknown>).speechSynthesis = synth
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true })
  ;(globalThis as Record<string, unknown>).SpeechSynthesisUtterance = FakeUtterance
})

describe('chan-tts', () => {
  test('speechSynthesis varsa destekli', () => {
    expect(isTtsSupported()).toBe(true)
  })

  test('konuşur: önce cancel, TR ses + lang/rate/pitch set', () => {
    const ok = speakChanLine('Merhaba! Hadi şu soruya bakalım.')
    expect(ok).toBe(true)
    expect(synth.cancel).toHaveBeenCalled()
    const utt = synth.speak.mock.calls[0][0] as FakeUtterance
    expect(utt.lang).toBe('tr-TR')
    expect(utt.voice).toMatchObject({ name: 'TrVoice' })
    expect(utt.rate).toBeGreaterThan(1)
  })

  test('emoji temizlenir', () => {
    speakChanLine('Evet, cevap C! 🎉')
    const utt = synth.speak.mock.calls[0][0] as FakeUtterance
    expect(utt.text).toBe('Evet, cevap C!')
  })

  test('TR sesler içinde YEREL olan tercih edilir (Codex P2: localService)', () => {
    synth.getVoices.mockReturnValue([
      { lang: 'tr-TR', name: 'TrRemote', localService: false },
      { lang: 'tr-TR', name: 'TrLocal', localService: true },
    ])
    speakChanLine('Merhaba')
    const utt = synth.speak.mock.calls[0][0] as FakeUtterance
    expect(utt.voice).toMatchObject({ name: 'TrLocal' })
  })

  test('yerel TR yoksa uzak TR sese düşer (best-effort)', () => {
    synth.getVoices.mockReturnValue([
      { lang: 'tr-TR', name: 'TrRemote', localService: false },
    ])
    speakChanLine('Merhaba')
    const utt = synth.speak.mock.calls[0][0] as FakeUtterance
    expect(utt.voice).toMatchObject({ name: 'TrRemote' })
  })

  test('global ses kapalıysa konuşmaz', () => {
    soundState.enabled = false
    expect(speakChanLine('Merhaba')).toBe(false)
    expect(synth.speak).not.toHaveBeenCalled()
  })

  test('salt-emoji metin: konuşma tetiklenmez', () => {
    expect(speakChanLine('🎉 🔥')).toBe(false)
    expect(synth.speak).not.toHaveBeenCalled()
  })

  test('stopChanSpeech: cancel çağrılır', () => {
    stopChanSpeech()
    expect(synth.cancel).toHaveBeenCalled()
  })
})

describe('chan-tts: statik ses önceliği (CHAN_AUDIO_MAP)', () => {
  class FakeAudioOk {
    src: string
    constructor(src: string) { this.src = src }
    play() { return Promise.resolve() }
    pause() {}
  }
  class FakeAudioFail {
    src: string
    constructor(src: string) { this.src = src }
    play() { return Promise.reject(new Error('playback failed')) }
    pause() {}
  }

  beforeEach(() => {
    audioMapState.map = { 'Merhaba! Hadi şu soruya bakalım.': 'abc123' }
    Object.defineProperty(globalThis, 'Audio', { value: FakeAudioOk, configurable: true })
    Object.defineProperty(window, 'Audio', { value: FakeAudioOk, configurable: true })
  })

  test('map eşleşirse statik MP3 (doğru path) çalınır, speechSynthesis çağrılmaz', () => {
    const ok = speakChanLine('Merhaba! Hadi şu soruya bakalım.')
    expect(ok).toBe(true)
    expect(synth.speak).not.toHaveBeenCalled()
  })

  test('map eşleşmezse (dinamik ipucu metni) doğrudan speechSynthesis kullanılır', () => {
    speakChanLine('Bu bir Gemini ipucu metni, manifestte yok.')
    expect(synth.speak).toHaveBeenCalled()
  })

  test('statik oynatma reddedilirse speechSynthesis fallback devreye girer', async () => {
    Object.defineProperty(globalThis, 'Audio', { value: FakeAudioFail, configurable: true })
    Object.defineProperty(window, 'Audio', { value: FakeAudioFail, configurable: true })
    speakChanLine('Merhaba! Hadi şu soruya bakalım.')
    await vi.waitFor(() => expect(synth.speak).toHaveBeenCalled())
  })
})
