/**
 * Katilimci kayit defteri — env'den roster kurar.
 *
 * SAF TUTULDU: `process.env`i kendisi OKUMAZ, disaridan bir kayit alir.
 * Boylece "anahtar yoksa ne olur", "model kimligi nasil secilir", "bilinmeyen
 * katilimci nasil reddedilir" sorulari gercek anahtar olmadan test edilebilir.
 *
 * YENI MODEL EKLEME: `REGISTRY`ye bir satir. Tasima zaten `transport.ts`'de;
 * OpenAI-uyumlu bir endpoint icin genelde yeni kod GEREKMEZ.
 */

import {
  createAnthropicProvider,
  createCodexProvider,
  createDeepSeekProvider,
  createGeminiConversationProvider,
  type ConversationalProvider,
} from './transport'
import type { CouncilParticipant } from './council'

export type EnvRecord = Record<string, string | undefined>

export interface RegistryEntry {
  displayName: string
  /** Prompt'a birebir giren rol tanimi. */
  defaultRole: string
  /** Sirayla denenir; ilk dolu olan kullanilir. */
  apiKeyEnv: readonly string[]
  modelEnv: string
  defaultModelId: string
  baseUrlEnv?: string
  build: (args: {
    apiKey: string
    modelId: string
    baseUrl?: string
    minIntervalMs: number
  }) => ConversationalProvider
}

/**
 * ROLLER BILEREK FARKLI. Ayni role sahip iki model ayni acidan bakar ve
 * tartisma "iki kez ayni cevap"a doner; farkli rol, farkli kusur yakalar.
 * Rol `COUNCIL_ROLE_<ID>` ile ezilebilir.
 */
export const REGISTRY: Record<string, RegistryEntry> = {
  codex: {
    displayName: 'Codex',
    defaultRole: 'Denetci — uygulanabilirligi ve kenar durumlari sorgular, somut kusur arar',
    apiKeyEnv: ['OPENAI_API_KEY', 'CODEX_API_KEY'],
    modelEnv: 'CODEX_MODEL_ID',
    // BASLANGIC DEGERI, GARANTI DEGIL: hangi codex/gpt kimliginin bir hesaba
    // acik oldugu hesaptan hesaba degisir. Hesabin sundugu kimlikle
    // CODEX_MODEL_ID uzerinden degistirin (404/400 alirsaniz ilk bakilacak yer).
    defaultModelId: 'gpt-5.1-codex',
    baseUrlEnv: 'OPENAI_BASE_URL',
    build: ({ apiKey, modelId, baseUrl, minIntervalMs }) =>
      createCodexProvider({ apiKey, modelId, baseUrl, minIntervalMs }),
  },
  claude: {
    displayName: 'Claude',
    defaultRole: 'Mimar — cozumu kurar, gerekceyi ve tasarim odununu acik yazar',
    apiKeyEnv: ['ANTHROPIC_API_KEY'],
    modelEnv: 'COUNCIL_CLAUDE_MODEL_ID',
    defaultModelId: 'claude-opus-5',
    baseUrlEnv: 'ANTHROPIC_BASE_URL',
    build: ({ apiKey, modelId, baseUrl, minIntervalMs }) =>
      createAnthropicProvider({ apiKey, modelId, baseUrl, minIntervalMs }),
  },
  gemini: {
    displayName: 'Gemini',
    defaultRole: 'Ikinci gorus — varsayimlari ve atlanan secenekleri isaret eder',
    apiKeyEnv: ['GEMINI_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY'],
    modelEnv: 'COUNCIL_GEMINI_MODEL_ID',
    defaultModelId: 'gemini-2.5-pro',
    build: ({ apiKey, modelId, baseUrl, minIntervalMs }) =>
      createGeminiConversationProvider({ apiKey, modelId, baseUrl, minIntervalMs }),
  },
  deepseek: {
    displayName: 'DeepSeek',
    defaultRole: 'Ucuz hakem — ozetler ve iki taraf arasindaki gercek farki isaret eder',
    apiKeyEnv: ['DEEPSEEK_API_KEY'],
    modelEnv: 'COUNCIL_DEEPSEEK_MODEL_ID',
    defaultModelId: 'deepseek-v4-flash',
    baseUrlEnv: 'DEEPSEEK_BASE_URL',
    build: ({ apiKey, modelId, baseUrl, minIntervalMs }) =>
      createDeepSeekProvider({ apiKey, modelId, baseUrl, minIntervalMs }),
  },
}

export const KNOWN_PARTICIPANTS = Object.keys(REGISTRY)

/** `--participants codex,claude` -> ['codex','claude']; tekrarlar atilir. */
export function parseParticipantSpec(spec: string): string[] {
  return [...new Set(spec.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean))]
}

export interface ResolveResult {
  participants: CouncilParticipant[]
  /** Kimligi bilinen ama anahtari olmayanlar — sessizce dusurulmez, raporlanir. */
  missingKeys: Array<{ id: string; tried: readonly string[] }>
}

/**
 * Roster kurar.
 *
 * ANAHTARSIZ KATILIMCI SESSIZCE DUSURULMEZ: `missingKeys`e yazilir. Sessiz
 * dusurme en sinsi ariza — kullanici "Codex ve Claude tartisti" sanir, oysa
 * Codex hic cagrilmamis ve rapordaki "uzlasma" tek modelin monologudur.
 * Cagiran taraf (CLI) bunu ekrana basar ve gerekirse durur.
 *
 * BILINMEYEN KIMLIK HATA: yazim hatasi (`codx`) sessizce yok sayilirsa kurul
 * eksik kosar ve kimse fark etmez.
 */
export function resolveParticipants(
  ids: readonly string[],
  env: EnvRecord,
  overrides: { minIntervalMs?: number } = {},
): ResolveResult {
  // `Number('abc')` NaN doner; NaN bir hiz kapisina sizarsa `Math.max` sessizce
  // NaN uretir ve bekleme tamamen kaybolur — acikca 0'a dusuruluyor.
  const envInterval = Number(env.COUNCIL_MIN_INTERVAL_MS ?? 0)
  const minIntervalMs = overrides.minIntervalMs ?? (Number.isFinite(envInterval) ? envInterval : 0)
  const participants: CouncilParticipant[] = []
  const missingKeys: ResolveResult['missingKeys'] = []

  for (const id of ids) {
    const entry = REGISTRY[id]
    if (!entry) {
      throw new Error(
        `Bilinmeyen katilimci: "${id}". Taninanlar: ${KNOWN_PARTICIPANTS.join(', ')}`,
      )
    }

    const apiKey = entry.apiKeyEnv.map((k) => env[k]).find((v) => typeof v === 'string' && v.length > 0)
    if (!apiKey) {
      missingKeys.push({ id, tried: entry.apiKeyEnv })
      continue
    }

    const baseUrl = entry.baseUrlEnv ? env[entry.baseUrlEnv] || undefined : undefined
    participants.push({
      id,
      displayName: entry.displayName,
      role: env[`COUNCIL_ROLE_${id.toUpperCase()}`] || entry.defaultRole,
      provider: entry.build({
        apiKey,
        modelId: env[entry.modelEnv] || entry.defaultModelId,
        baseUrl,
        minIntervalMs,
      }),
    })
  }

  return { participants, missingKeys }
}
