import type { ChatMessage } from '@/stores/chat-store'

/** Sunucunun her başarılı asistan yanıtıyla döndüğü tur imzası. */
export const CHAT_TURN_SIGNATURE_HEADER = 'X-Chat-Turn-Signature'

export type ChatApiMessage =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; signature: string }

/**
 * `/api/chat` geçmişi: kullanıcı turları ve yalnız sunucunun imzaladığı asistan
 * turları. Hata metinleri ve yarım kalan yanıtlar imzasız olduğu için gönderilmez;
 * sunucu da imzasız asistan turunu zaten düşürür.
 */
export function chatApiHistory(messages: ChatMessage[], nextUserText: string): ChatApiMessage[] {
  return [
    ...messages.flatMap((message): ChatApiMessage[] => {
      if (message.role === 'user') return [{ role: 'user', content: message.content }]
      return message.signature
        ? [{ role: 'assistant', content: message.content, signature: message.signature }]
        : []
    }),
    { role: 'user', content: nextUserText },
  ]
}

export function readChatTurnSignature(response: Response): string | undefined {
  return response.headers?.get(CHAT_TURN_SIGNATURE_HEADER) ?? undefined
}
