import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useTopicProgress } from '../use-topic-progress'

// matematik kanonik kategorileri:
// sayilar, problemler, geometri, denklemler, fonksiyonlar, olasilik
function mockTopics(topics: unknown[]) {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true,
    json: async () => ({ topics, game: 'matematik' }),
  })))
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('useTopicProgress', () => {
  it('kullanici yoksa istek atmaz, yol bos kalir', () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const { result } = renderHook(() => useTopicProgress('matematik', null))

    expect(fetchSpy).not.toHaveBeenCalled()
    expect(result.current.topics).toHaveLength(6)
    expect(result.current.completedCount).toBe(0)
    expect(result.current.currentIndex).toBe(0)
    expect(result.current.hasProgress).toBe(false)
  })

  it('kanonik mufredati gercek ilerlemeyle birlestirir', async () => {
    mockTopics([
      { label: 'Sayılar', percentage: 90, category: 'sayilar', total: 12 },
      { label: 'Problemler', percentage: 75, category: 'problemler', total: 8 },
      { label: 'Geometri', percentage: 40, category: 'geometri', total: 10 },
    ])
    const { result } = renderHook(() => useTopicProgress('matematik', 'user-1', 'TYT'))

    await waitFor(() => expect(result.current.hasProgress).toBe(true))
    // API yalniz denenen kategorileri doner; yol yine de TAM mufredati gosterir
    expect(result.current.topics.map((topic) => topic.category)).toEqual([
      'sayilar', 'problemler', 'geometri', 'denklemler', 'fonksiyonlar', 'olasilik',
    ])
    expect(result.current.completedCount).toBe(2)
    // ilk tamamlanmamis konu = geometri (index 2)
    expect(result.current.currentIndex).toBe(2)
    expect(result.current.topics[5]).toMatchObject({ percentage: 0, answered: 0, completed: false })
  })

  it('yuzde yuksek olsa da orneklem yetersizse tamamlanmis saymaz', async () => {
    mockTopics([{ label: 'Sayılar', percentage: 100, category: 'sayilar', total: 2 }])
    const { result } = renderHook(() => useTopicProgress('matematik', 'user-1', 'TYT'))

    await waitFor(() => expect(result.current.hasProgress).toBe(true))
    expect(result.current.topics[0].completed).toBe(false)
    expect(result.current.currentIndex).toBe(0)
  })

  it('istek basarisizsa yol cizilmeye devam eder', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    const { result } = renderHook(() => useTopicProgress('matematik', 'user-1', 'TYT'))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.topics).toHaveLength(6)
    expect(result.current.hasProgress).toBe(false)
  })

  it('tum konular bittiyse siradaki adim kalmaz', async () => {
    mockTopics(['sayilar', 'problemler', 'geometri', 'denklemler', 'fonksiyonlar', 'olasilik'].map((category) => ({
      label: category, percentage: 95, category, total: 20,
    })))
    const { result } = renderHook(() => useTopicProgress('matematik', 'user-1', 'TYT'))

    await waitFor(() => expect(result.current.completedCount).toBe(6))
    expect(result.current.currentIndex).toBe(-1)
  })

  it('sinav kapsamını API istegine ekler', async () => {
    mockTopics([])
    renderHook(() => useTopicProgress('matematik', 'user-1', 'AYT-SAY'))
    await waitFor(() => expect(fetch).toHaveBeenCalled())
    expect(fetch).toHaveBeenCalledWith(
      '/api/profile/topic-strengths?game=matematik&exam_ref=AYT-SAY',
      expect.any(Object),
    )
  })
})
