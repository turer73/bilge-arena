'use client'

import type { Question } from '@/types/database'

const DB_NAME = 'bilge-arena-cache'
const DB_VERSION = 1
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
export async function cacheQuestions(questions: Question[]): Promise<void> {
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

/** Cache'den soru cek (oyun + opsiyonel kategori/zorluk filtresi) */
export async function getCachedQuestions(options: {
  game: string
  category?: string | null
  difficulty?: number | null
  limit?: number
}): Promise<Question[]> {
  const { game, category, difficulty, limit = 10 } = options

  try {
    const db = await openDB()
    const tx = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const index = store.index('game')

    const questions = await new Promise<Question[]>((resolve, reject) => {
      const request = index.getAll(game)
      request.onsuccess = () => resolve(request.result as Question[])
      request.onerror = () => reject(request.error)
    })

    db.close()

    let filtered = questions.filter(q => q.is_active)
    if (category) filtered = filtered.filter(q => q.category === category)
    if (difficulty) filtered = filtered.filter(q => q.difficulty === difficulty)

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
