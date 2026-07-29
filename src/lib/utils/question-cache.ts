'use client'

import type { PublicQuestion } from '@/lib/utils/question-public'

const DB_NAME = 'bilge-arena-cache'
// v2 cevap anahtarı/çözüm taşıyan eski cache girdilerini zorunlu temizler.
const DB_VERSION = 2
const STORE_NAME = 'questions'
const META_STORE = 'cache_meta'
const CACHE_TTL = 24 * 60 * 60 * 1000 // 24 saat

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' })
        store.createIndex('game', 'game', { unique: false })
        store.createIndex('game_category', ['game', 'category'], { unique: false })
      } else {
        request.transaction?.objectStore(STORE_NAME).clear()
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: 'key' })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

/** Sorulari IndexedDB'ye kaydet */
export async function cacheQuestions(questions: PublicQuestion[]): Promise<void> {
  try {
    const db = await openDB()
    const tx = db.transaction([STORE_NAME, META_STORE], 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const metaStore = tx.objectStore(META_STORE)

    for (const q of questions) {
      store.put(q)
    }

    // Oyun bazli cache zamani kaydet
    const games = Array.from(new Set(questions.map(q => q.game)))
    for (const game of games) {
      metaStore.put({ key: `cached_at_${game}`, value: Date.now() })
    }

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  } catch (err) {
    console.warn('[QuestionCache] Kayit hatasi:', err)
  }
}

/**
 * Cache girdilerinden oynanabilir olanlari sec (saf, test edilebilir).
 *
 * is_active artik API yanitlarinda yok (toPublicQuestion whitelist) —
 * undefined=aktif say; alan sadece eski tam-satir cache girdilerinde var
 * ve false ise (deaktive edilmis soru) elenmeye devam eder (Codex P2).
 */
export function filterPlayableCached(
  questions: Array<PublicQuestion & { is_active?: boolean }>,
  category?: string | null,
  difficulty?: number | null,
): PublicQuestion[] {
  let filtered = questions.filter(q => q.is_active !== false)
  if (category) filtered = filtered.filter(q => q.category === category)
  if (difficulty) filtered = filtered.filter(q => q.difficulty === difficulty)
  return filtered
}

/** Cache'den soru cek (oyun + opsiyonel kategori/zorluk filtresi) */
export async function getCachedQuestions(options: {
  game: string
  category?: string | null
  difficulty?: number | null
  limit?: number
}): Promise<PublicQuestion[]> {
  const { game, category, difficulty, limit = 10 } = options

  try {
    const db = await openDB()
    const tx = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const index = store.index('game')

    const questions = await new Promise<Array<PublicQuestion & { is_active?: boolean }>>((resolve, reject) => {
      const request = index.getAll(game)
      request.onsuccess = () => resolve(request.result as Array<PublicQuestion & { is_active?: boolean }>)
      request.onerror = () => reject(request.error)
    })

    db.close()

    const filtered = filterPlayableCached(questions, category, difficulty)

    // Fisher-Yates shuffle
    for (let i = filtered.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[filtered[i], filtered[j]] = [filtered[j], filtered[i]]
    }

    return filtered.slice(0, limit)
  } catch (err) {
    console.warn('[QuestionCache] Okuma hatasi:', err)
    return []
  }
}

/** Belirli bir oyunun cache'i gecerli mi kontrol et */
export async function isCacheValid(game: string): Promise<boolean> {
  try {
    const db = await openDB()
    const tx = db.transaction(META_STORE, 'readonly')
    const store = tx.objectStore(META_STORE)

    const result = await new Promise<{ key: string; value: number } | undefined>((resolve, reject) => {
      const request = store.get(`cached_at_${game}`)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })

    db.close()

    if (!result) return false
    return Date.now() - result.value < CACHE_TTL
  } catch {
    return false
  }
}

/** Tum cache'i temizle */
export async function clearQuestionCache(): Promise<void> {
  try {
    const db = await openDB()
    const tx = db.transaction([STORE_NAME, META_STORE], 'readwrite')
    tx.objectStore(STORE_NAME).clear()
    tx.objectStore(META_STORE).clear()
    await new Promise<void>((resolve) => { tx.oncomplete = () => resolve() })
    db.close()
  } catch (err) {
    console.warn('[QuestionCache] Temizleme hatasi:', err)
  }
}
