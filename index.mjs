/**
 * Vercel AI Gateway smoke test
 * Kullanim: node --env-file=.env.local index.mjs
 *
 * OIDC token .env.local'den otomatik okunur (vc env pull ile cekilmeli).
 * Model: google/gemini-2.5-pro (bilge-arena'nin uretici modeli)
 */
import { streamText, gateway } from 'ai'

const model = gateway('google/gemini-2.5-pro')

console.log('Model:', model.modelId)
console.log('Provider:', model.provider)
console.log('OIDC token mevcut:', !!process.env.VERCEL_OIDC_TOKEN, '\n')

const result = streamText({
  model,
  prompt: 'Türk öğrencilere YKS hazırlığını 2 cümlede anlat.',
  maxTokens: 200,
})

process.stdout.write('Yanit: ')
for await (const chunk of result.textStream) {
  process.stdout.write(chunk)
}
console.log('\n\nTamamlandi.')
