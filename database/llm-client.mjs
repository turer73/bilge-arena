/**
 * Model-agnostic LLM client.
 *
 * Desteklenen provider'lar:
 *   - gemini         : Google Gemini API
 *   - deepseek       : DeepSeek API (OpenAI-compatible)
 *   - opencode-zen   : OpenCode Zen (ücretsiz DeepSeek V4 Flash Free dahil)
 *   - nim            : NVIDIA NIM API (OpenAI-compatible, ücretsiz 40 rpm rate-limit)
 *   - ollama         : Lokal Ollama (linux-ai-server)
 *   - go-proxy       : Özel Go proxy endpoint
 *
 * Env:
 *   LLM_PROVIDER=gemini|deepseek|opencode-zen|nim|ollama|go-proxy  (default: gemini)
 *
 *   GEMINI_API_KEY                 (Gemini için)
 *   GEMINI_MODEL                   (default: gemini-2.5-pro)
 *
 *   DEEPSEEK_API_KEY               (DeepSeek için)
 *   DEEPSEEK_MODEL                 (default: deepseek-v4-flash)
 *
 *   OPENCODE_ZEN_API_KEY           (OpenCode Zen için)
 *   OPENCODE_ZEN_MODEL             (default: deepseek-v4-flash-free)
 *
 *   NVIDIA_API_KEY                 (NIM için; Windows User env var, plain-text yazma)
 *   NIM_MODEL                      (default: deepseek-ai/deepseek-v4-pro)
 *
 *   OLLAMA_URL                     (default: http://100.84.251.49:11434)
 *   OLLAMA_MODEL                   (default: qwen2.5:7b)
 *
 *   GO_PROXY_URL                   (Go proxy endpoint)
 *   GO_PROXY_API_KEY               (opsiyonel auth)
 *   GO_PROXY_MODEL                 (default: qwen3.7)
 */

function getProviderName() {
  return (process.env.LLM_PROVIDER || 'gemini').toLowerCase()
}

// Codex#266-P2: OpenAI-uyumlu provider'lar json_object modunda diziyi bir wrapper
// obje içine sarabilir ({"questions":[...]} / {"sorular":[...]}). Eski hali JSON.parse
// başarılı olunca o objeyi DÖNDÜRÜYORDU → downstream (array bekleyen üretim/judge) bozulur.
// Artık: array ise direkt; wrapper obje ise tek array-değerli alanı çıkar; ikisi de değilse
// metin içinden [...] regex-fallback.
function _unwrapArray(v) {
  if (Array.isArray(v)) return v
  if (v && typeof v === 'object') {
    const arrKey = Object.keys(v).find((k) => Array.isArray(v[k]))
    if (arrKey) return v[arrKey]
  }
  return null
}

function parseJsonArray(text) {
  if (!text) return null
  try {
    const arr = _unwrapArray(JSON.parse(text))
    if (arr) return arr
  } catch { /* fall through */ }
  const m = text.match(/\[[\s\S]*\]/)
  if (m) {
    try { return JSON.parse(m[0].replace(/,\s*([}\]])/g, '$1')) } catch { /* fall through */ }
  }
  return null
}

async function callGemini({ system, user, model }) {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY
  if (!key) throw new Error('GEMINI_API_KEY yok')
  const m = model || process.env.GEMINI_MODEL || 'gemini-2.5-pro'
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-goog-api-key': key },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: system }] },
      contents: [{ parts: [{ text: user }] }],
      generationConfig: { temperature: 0.8, maxOutputTokens: 8192, responseMimeType: 'application/json' },
    }),
  })
  const json = await res.json().catch(() => null)
  if (!res.ok || !json) throw new Error(`Gemini HTTP ${res.status}: ${JSON.stringify(json)?.slice(0, 200)}`)
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error('Gemini boş yanıt')
  return parseJsonArray(text)
}

async function callDeepSeek({ system, user, model }) {
  const key = process.env.DEEPSEEK_API_KEY
  if (!key) throw new Error('DEEPSEEK_API_KEY yok')
  const m = model || process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash'
  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
    body: JSON.stringify({
      model: m,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user + '\n\nÇıktı SADECE JSON dizisi, markdown wrapping YOK.' },
      ],
      temperature: 0.8,
      max_tokens: 8192,
      response_format: { type: 'json_object' },
    }),
  })
  const json = await res.json().catch(() => null)
  if (!res.ok || !json) throw new Error(`DeepSeek HTTP ${res.status}: ${JSON.stringify(json)?.slice(0, 200)}`)
  if (json.error) throw new Error(`DeepSeek: ${JSON.stringify(json.error)?.slice(0, 200)}`)
  const text = json.choices?.[0]?.message?.content
  if (!text) throw new Error('DeepSeek boş yanıt')
  return parseJsonArray(text)
}

async function callOllama({ system, user, model }) {
  // Codex#266-P2: default localhost — eski hard-coded Tailscale adresi (100.84.x.x), OLLAMA_URL
  // verilmezse ağ-dışı fail eder ya da prompt'ları ortam-spesifik bir host'a gönderirdi.
  // Klipper'ın Ollama'sı için: OLLAMA_URL=http://100.84.251.49:11434
  const baseUrl = process.env.OLLAMA_URL || 'http://localhost:11434'
  const m = model || process.env.OLLAMA_MODEL || 'qwen2.5:7b'
  const res = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: m,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user + '\n\nÇıktı SADECE JSON dizisi, markdown wrapping YOK.' },
      ],
      stream: false,
      format: 'json',
      options: { temperature: 0.8 },
    }),
  })
  const json = await res.json().catch(() => null)
  if (!res.ok || !json) throw new Error(`Ollama HTTP ${res.status}: ${JSON.stringify(json)?.slice(0, 200)}`)
  const text = json.message?.content
  if (!text) throw new Error('Ollama boş yanıt')
  return parseJsonArray(text)
}

async function callOpenCodeZen({ system, user, model }) {
  const key = process.env.OPENCODE_ZEN_API_KEY
  if (!key) throw new Error('OPENCODE_ZEN_API_KEY yok')
  const m = model || process.env.OPENCODE_ZEN_MODEL || 'deepseek-v4-flash-free'
  const res = await fetch('https://opencode.ai/zen/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
    body: JSON.stringify({
      model: m,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user + '\n\nÇıktı SADECE JSON dizisi, markdown wrapping YOK.' },
      ],
      temperature: 0.8,
      max_tokens: 8192,
      response_format: { type: 'json_object' },
    }),
  })
  const json = await res.json().catch(() => null)
  if (!res.ok || !json) throw new Error(`OpenCodeZen HTTP ${res.status}: ${JSON.stringify(json)?.slice(0, 200)}`)
  if (json.error) throw new Error(`OpenCodeZen: ${JSON.stringify(json.error)?.slice(0, 200)}`)
  const text = json.choices?.[0]?.message?.content
  if (!text) throw new Error('OpenCodeZen boş yanıt')
  return parseJsonArray(text)
}

async function callNim({ system, user, model }) {
  const key = process.env.NVIDIA_API_KEY
  if (!key) throw new Error('NVIDIA_API_KEY yok')
  const m = model || process.env.NIM_MODEL || 'deepseek-ai/deepseek-v4-pro'
  const res = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
    body: JSON.stringify({
      model: m,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user + '\n\nÇıktı SADECE JSON dizisi, markdown wrapping YOK.' },
      ],
      temperature: 0.8,
      max_tokens: 8192,
    }),
  })
  const json = await res.json().catch(() => null)
  if (!res.ok || !json) throw new Error(`NIM HTTP ${res.status}: ${JSON.stringify(json)?.slice(0, 200)}`)
  if (json.error) throw new Error(`NIM: ${JSON.stringify(json.error)?.slice(0, 200)}`)
  const text = json.choices?.[0]?.message?.content
  if (!text) throw new Error('NIM boş yanıt')
  return parseJsonArray(text)
}

async function callGoProxy({ system, user, model }) {
  const baseUrl = process.env.GO_PROXY_URL
  if (!baseUrl) throw new Error('GO_PROXY_URL yok')
  const apiKey = process.env.GO_PROXY_API_KEY
  const m = model || process.env.GO_PROXY_MODEL || 'qwen3.7'
  const headers = { 'Content-Type': 'application/json' }
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`

  const res = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: m,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user + '\n\nÇıktı SADECE JSON dizisi, markdown wrapping YOK.' },
      ],
      temperature: 0.8,
      max_tokens: 8192,
      response_format: { type: 'json_object' },
    }),
  })
  const json = await res.json().catch(() => null)
  if (!res.ok || !json) throw new Error(`GoProxy HTTP ${res.status}: ${JSON.stringify(json)?.slice(0, 200)}`)
  if (json.error) throw new Error(`GoProxy: ${JSON.stringify(json.error)?.slice(0, 200)}`)
  const text = json.choices?.[0]?.message?.content
  if (!text) throw new Error('GoProxy boş yanıt')
  return parseJsonArray(text)
}

// Test/regresyon için export (Codex#266-P2 wrapper-unwrap kilidi)
export { parseJsonArray }

export async function callLLM(prompt, options = {}) {
  const provider = getProviderName()
  switch (provider) {
    case 'deepseek': return callDeepSeek({ ...prompt, ...options })
    case 'opencode-zen': return callOpenCodeZen({ ...prompt, ...options })
    case 'nim': return callNim({ ...prompt, ...options })
    case 'ollama': return callOllama({ ...prompt, ...options })
    case 'go-proxy': return callGoProxy({ ...prompt, ...options })
    default: return callGemini({ ...prompt, ...options })
  }
}

export function getProvider() { return getProviderName() }

export function getKeyStatus() {
  const provider = getProviderName()
  switch (provider) {
    case 'deepseek': {
      const k = process.env.DEEPSEEK_API_KEY
      return { provider: 'deepseek', hasKey: !!k, keyLen: k?.length ?? 0 }
    }
    case 'opencode-zen': {
      const k = process.env.OPENCODE_ZEN_API_KEY
      return { provider: 'opencode-zen', hasKey: !!k, keyLen: k?.length ?? 0, model: process.env.OPENCODE_ZEN_MODEL || 'deepseek-v4-flash-free' }
    }
    case 'nim': {
      const k = process.env.NVIDIA_API_KEY
      return { provider: 'nim', hasKey: !!k, keyLen: k?.length ?? 0, model: process.env.NIM_MODEL || 'deepseek-ai/deepseek-v4-pro' }
    }
    case 'ollama': {
      const url = process.env.OLLAMA_URL || 'http://100.84.251.49:11434'
      return { provider: 'ollama', hasKey: true, url, model: process.env.OLLAMA_MODEL || 'qwen2.5:7b' }
    }
    case 'go-proxy': {
      const url = process.env.GO_PROXY_URL
      return { provider: 'go-proxy', hasKey: !!url, url, model: process.env.GO_PROXY_MODEL || 'qwen3.7' }
    }
    default: {
      const k = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY
      return { provider: 'gemini', hasKey: !!k, keyLen: k?.length ?? 0 }
    }
  }
}
