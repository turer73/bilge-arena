import { describe, expect, it } from 'vitest'
import {
  DEFAULT_RENDER_OPTIONS,
  emptyTranscript,
  latestByParticipant,
  messageId,
  renderForParticipant,
  turnOrder,
  uniqueStrings,
} from '../transcript'
import type { CouncilMessage, CouncilTranscript, Stance } from '../types'

function msg(
  round: number,
  participantId: string,
  overrides: Partial<CouncilMessage['payload']> = {},
): CouncilMessage {
  return {
    id: messageId(round, participantId),
    round,
    participantId,
    displayName: participantId === 'codex' ? 'Codex' : 'Claude',
    role: 'test-rol',
    payload: {
      reasoning: 'gerekce',
      stance: 'propose' as Stance,
      position: `${participantId} pozisyonu tur ${round}`,
      respondsTo: [],
      openQuestions: [],
      blocking: false,
      ...overrides,
    },
    telemetry: {
      providerId: `${participantId}:m`,
      modelId: 'm',
      promptVersion: 'council-turn@1',
      latencyMs: 1,
      inputTokens: 10,
      outputTokens: 5,
      finishReason: 'STOP',
    },
    createdAt: '2026-08-29T00:00:00.000Z',
  }
}

function transcriptOf(...messages: CouncilMessage[]): CouncilTranscript {
  return { messages, failures: [] }
}

describe('messageId', () => {
  it('deterministik: ayni tur+katilimci ayni kimlik', () => {
    expect(messageId(2, 'codex')).toBe('r2-codex')
    expect(messageId(2, 'codex')).toBe(messageId(2, 'codex'))
  })
})

describe('turnOrder', () => {
  const p = ['codex', 'claude', 'gemini']

  it('1. turda roster sirasi korunur', () => {
    expect(turnOrder(p, 1)).toEqual(['codex', 'claude', 'gemini'])
  })

  it('her turda bir kaydirir — son soz avantaji dolasir', () => {
    expect(turnOrder(p, 2)).toEqual(['claude', 'gemini', 'codex'])
    expect(turnOrder(p, 3)).toEqual(['gemini', 'codex', 'claude'])
  })

  it('katilimci sayisini asan turda basa doner', () => {
    expect(turnOrder(p, 4)).toEqual(turnOrder(p, 1))
  })

  it('bos roster patlamaz', () => {
    expect(turnOrder([], 3)).toEqual([])
  })

  it('kaydirma eleman kaybetmez', () => {
    for (let round = 1; round <= 8; round++) {
      expect([...turnOrder(p, round)].sort()).toEqual([...p].sort())
    }
  })
})

describe('renderForParticipant', () => {
  it('bos tutanakta ilk sozun sende oldugunu soyler', () => {
    expect(renderForParticipant(emptyTranscript(), 'codex')).toContain('ilk soz sende')
  })

  it('okuyanin kendi mesajini (SEN) ile isaretler, digerini isaretlemez', () => {
    const t = transcriptOf(msg(1, 'codex'), msg(1, 'claude'))
    const view = renderForParticipant(t, 'codex')
    expect(view).toContain('Codex (SEN)')
    expect(view).toContain('[r1-claude] Claude')
    expect(view).not.toContain('Claude (SEN)')
  })

  it('durus, atif ve acik sorulari gosterir', () => {
    const t = transcriptOf(
      msg(2, 'claude', {
        stance: 'disagree',
        respondsTo: ['r1-codex'],
        openQuestions: ['migration geri alinabilir mi?'],
        blocking: true,
      }),
    )
    const view = renderForParticipant(t, 'codex')
    expect(view).toContain('DURUS: disagree')
    expect(view).toContain('(BLOKLAYICI)')
    expect(view).toContain('YANIT: r1-codex')
    expect(view).toContain('migration geri alinabilir mi?')
  })

  it('pencere asilinca EN ESKILER duser ve kirpma isareti konur', () => {
    const many = Array.from({ length: 10 }, (_, i) => msg(i + 1, 'codex'))
    const view = renderForParticipant(transcriptOf(...many), 'claude', { maxMessages: 3 })
    expect(view).toContain('7 eski mesaj tutanaktan kisaltildi')
    expect(view).toContain('r10-codex')
    expect(view).not.toContain('[r1-codex]')
  })

  it('pencere yeterliyse kirpma isareti KONMAZ', () => {
    const t = transcriptOf(msg(1, 'codex'), msg(1, 'claude'))
    expect(renderForParticipant(t, 'codex', DEFAULT_RENDER_OPTIONS)).not.toContain('kisaltildi')
  })
})

describe('latestByParticipant', () => {
  it('her katilimcinin EN SON mesajini verir', () => {
    const t = transcriptOf(
      msg(1, 'codex', { position: 'eski' }),
      msg(1, 'claude'),
      msg(2, 'codex', { position: 'yeni' }),
    )
    const latest = latestByParticipant(t)
    expect(latest.size).toBe(2)
    expect(latest.get('codex')?.payload.position).toBe('yeni')
  })
})

describe('uniqueStrings', () => {
  it('tekrarlari atar, sirayi korur, bosluklari kirpar', () => {
    expect(uniqueStrings(['b', ' a ', 'b', '', '   ', 'a'])).toEqual(['b', 'a'])
  })
})
