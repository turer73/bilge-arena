import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  fetchPaperPack,
  isPaperModeUiEnabled,
  paperPackCreateHref,
} from '../client'

const oldFlag = process.env.NEXT_PUBLIC_PAPER_MODE_ENABLED

describe('paper mode client boundary', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    delete process.env.NEXT_PUBLIC_PAPER_MODE_ENABLED
  })

  afterAll(() => {
    if (oldFlag === undefined) delete process.env.NEXT_PUBLIC_PAPER_MODE_ENABLED
    else process.env.NEXT_PUBLIC_PAPER_MODE_ENABLED = oldFlag
  })

  it('fails closed and builds only the create route parameters', () => {
    expect(isPaperModeUiEnabled()).toBe(false)
    process.env.NEXT_PUBLIC_PAPER_MODE_ENABLED = 'true'
    expect(isPaperModeUiEnabled()).toBe(true)
    expect(paperPackCreateHref('matematik', 'AYT-SAY')).toBe(
      '/arena/kagit?game=matematik&examRef=AYT-SAY',
    )
  })

  it('uses no-store plus abort and rejects a non-contract response', async () => {
    const controller = new AbortController()
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json({ packId: 'client-must-not-trust-this' }),
    )
    await expect(fetchPaperPack(
      '11111111-2222-4333-8444-555555555555',
      controller.signal,
    )).rejects.toThrow('paper_pack_contract_invalid')
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/study/paper-packs/11111111-2222-4333-8444-555555555555',
      { cache: 'no-store', signal: controller.signal },
    )
  })
})
