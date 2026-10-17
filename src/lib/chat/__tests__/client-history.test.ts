import { describe, expect, it } from 'vitest'
import { CHAT_TURN_SIGNATURE_HEADER, chatApiHistory, readChatTurnSignature } from '../client-history'
import type { ChatMessage } from '@/stores/chat-store'

function message(role: ChatMessage['role'], content: string, signature?: string): ChatMessage {
  return { id: content, role, content, timestamp: 0, ...(signature ? { signature } : {}) }
}

describe('chatApiHistory', () => {
  it('imzalı asistan turlarını imzasıyla, kullanıcı turlarını olduğu gibi gönderir', () => {
    expect(chatApiHistory([
      message('user', 'Asal sayı nedir?'),
      message('assistant', 'Yalnız 1 ve kendisine bölünen sayı.', 'v1.1.sig'),
    ], 'Örnek ver')).toEqual([
      { role: 'user', content: 'Asal sayı nedir?' },
      { role: 'assistant', content: 'Yalnız 1 ve kendisine bölünen sayı.', signature: 'v1.1.sig' },
      { role: 'user', content: 'Örnek ver' },
    ])
  })

  it('imzasız asistan turlarını (hata metni, yarım yanıt) göndermez', () => {
    expect(chatApiHistory([
      message('user', 'Soru'),
      message('assistant', 'Bağlantı hatası. İnternet bağlantınızı kontrol edin.'),
      message('user', 'Tekrar'),
      message('assistant', ''),
    ], 'Son')).toEqual([
      { role: 'user', content: 'Soru' },
      { role: 'user', content: 'Tekrar' },
      { role: 'user', content: 'Son' },
    ])
  })
})

describe('readChatTurnSignature', () => {
  it('yanıt başlığındaki imzayı okur', () => {
    const response = new Response('ok', { headers: { [CHAT_TURN_SIGNATURE_HEADER]: 'v1.1.sig' } })
    expect(readChatTurnSignature(response)).toBe('v1.1.sig')
  })

  it('başlık yoksa undefined döner', () => {
    expect(readChatTurnSignature(new Response('ok'))).toBeUndefined()
  })
})
