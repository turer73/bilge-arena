import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import QualityMissionsClient from '../quality-missions-client'

const mission = {
  missionId: 'aaaaaaaa-0000-4000-8000-000000000001',
  questionId: 'bbbbbbbb-0000-4000-8000-000000000002',
  revisionId: 'cccccccc-0000-4000-8000-000000000003',
  expiresAt: '2026-08-25T12:00:00.000Z',
  examRef: 'YKS',
  subject: 'Matematik',
  topic: 'Fonksiyonlar',
  content: { question: '2 + 2 kaçtır?', options: ['3', '4', '5', '6'] },
}

describe('QualityMissionsClient', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'dddddddd-0000-4000-8000-000000000004') })
  })

  it('unlocks the verdict step only after the server persists the selected answer', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ mission }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: 'answer_locked' }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    render(<QualityMissionsClient />)
    fireEvent.click(await screen.findByRole('button', { name: 'B. 4' }))
    fireEvent.click(screen.getByRole('button', { name: 'Çözümümü kilitle' }))

    await screen.findByText('Sorunun kendisi akademik olarak sağlam mı?')
    const [, lockRequest] = fetchMock.mock.calls
    expect(lockRequest[1]).toEqual(expect.objectContaining({ method: 'PUT' }))
    expect(JSON.parse(lockRequest[1].body)).toEqual(expect.objectContaining({
      missionId: mission.missionId,
      selectedAnswerIndex: 1,
    }))
  })

  it('keeps the verdict step closed when the server rejects the answer lock', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ mission }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Çözüm değiştirilemez' }), { status: 409 })))

    render(<QualityMissionsClient />)
    fireEvent.click(await screen.findByRole('button', { name: 'A. 3' }))
    fireEvent.click(screen.getByRole('button', { name: 'Çözümümü kilitle' }))

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Çözüm değiştirilemez'))
    expect(screen.queryByText('Sorunun kendisi akademik olarak sağlam mı?')).not.toBeInTheDocument()
  })
})
