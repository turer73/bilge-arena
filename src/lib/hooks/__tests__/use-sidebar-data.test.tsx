import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GAMES } from '@/lib/constants/games'
import { useSidebarData } from '../use-sidebar-data'

const mockFetchTopicStrengths = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabase/sidebar-data', () => ({
  fetchTopicStrengths: mockFetchTopicStrengths,
}))

describe('useSidebarData', () => {
  beforeEach(() => {
    mockFetchTopicStrengths.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('sinav kapsami degisince onceki konu gucunu hemen temizler', async () => {
    let resolveTyt!: (topics: Array<{ label: string; percentage: number }>) => void
    mockFetchTopicStrengths
      .mockResolvedValueOnce([{ label: 'Edebiyat', percentage: 80 }])
      .mockImplementationOnce(() => new Promise((resolve) => { resolveTyt = resolve }))

    const { result, rerender } = renderHook(
      ({ examRef }) => useSidebarData({
        userId: 'user-1', game: 'turkce', gameDef: GAMES.turkce, examRef,
      }),
      { initialProps: { examRef: 'AYT-SOZ' as string | null } },
    )
    await waitFor(() => expect(result.current.topicData).toEqual([
      { label: 'Edebiyat', percentage: 80 },
    ]))

    rerender({ examRef: 'TYT' })
    expect(result.current.topicData).toEqual([])

    await act(async () => {
      resolveTyt([{ label: 'Paragraf', percentage: 60 }])
    })
    expect(result.current.topicData).toEqual([{ label: 'Paragraf', percentage: 60 }])
  })

  it('gec kalan eski kapsam yaniti yeni kapsam sonucunu ezemez', async () => {
    let resolveOld!: (topics: Array<{ label: string; percentage: number }>) => void
    mockFetchTopicStrengths
      .mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve }))
      .mockResolvedValueOnce([{ label: 'Paragraf', percentage: 65 }])

    const { result, rerender } = renderHook(
      ({ examRef }) => useSidebarData({
        userId: 'user-1', game: 'turkce', gameDef: GAMES.turkce, examRef,
      }),
      { initialProps: { examRef: 'AYT-SOZ' as string | null } },
    )
    await waitFor(() => expect(mockFetchTopicStrengths).toHaveBeenCalledTimes(1))

    rerender({ examRef: 'TYT' })
    await waitFor(() => expect(result.current.topicData).toEqual([
      { label: 'Paragraf', percentage: 65 },
    ]))

    await act(async () => {
      resolveOld([{ label: 'Edebiyat', percentage: 90 }])
    })
    expect(result.current.topicData).toEqual([{ label: 'Paragraf', percentage: 65 }])
  })
})
