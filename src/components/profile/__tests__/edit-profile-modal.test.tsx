/**
 * Bilge Arena: EditProfileModal — serbest foto yükleme KALDIRILDI (güvenlik:
 * cinsel-içerik/CSAM riski). Bu test: file-input olmadığını (regresyon guard),
 * avatar kaldırma (DELETE) ve profil kaydetme (PATCH) akışını doğrular.
 */

import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const auth = vi.hoisted(() => ({
  value: { profile: null as Record<string, unknown> | null },
}))
vi.mock('@/stores/auth-store', () => ({ useAuthStore: () => auth.value }))

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }))
vi.mock('@/stores/toast-store', () => ({ toast: toastMock }))

const refreshMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/hooks/use-auth', () => ({ refreshProfile: refreshMock }))

import { EditProfileModal } from '../edit-profile-modal'

const fetchMock = vi.fn()
global.fetch = fetchMock as unknown as typeof fetch

beforeEach(() => {
  vi.clearAllMocks()
  auth.value.profile = {
    username: 'arenaci',
    display_name: 'Arenacı',
    avatar_url: null,
    city: '',
    grade: '',
    exam_type: '',
  }
  fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true }) })
})

describe('EditProfileModal', () => {
  test('kapalıyken hiçbir şey render etmez', () => {
    const { container } = render(<EditProfileModal open={false} onClose={vi.fn()} />)
    expect(container.firstChild).toBeNull()
  })

  test('GÜVENLİK: serbest foto yükleme yok — file input bulunmaz + Hazır Avatar butonu var', () => {
    render(<EditProfileModal open onClose={vi.fn()} />)
    expect(screen.getByText('Profili Düzenle')).toBeInTheDocument()
    expect(document.querySelector('input[type="file"]')).toBeNull()
    expect(screen.getByRole('button', { name: /Hazır Avatar/ })).toBeInTheDocument()
  })

  test('hazır avatar galerisi: aç → preset seç → POST /api/profile/avatar/preset', async () => {
    render(<EditProfileModal open onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /Hazır Avatar/ }))
    const presetBtns = screen.getAllByRole('button', { name: /Piksel avatar/ })
    expect(presetBtns.length).toBeGreaterThan(0)
    fireEvent.click(presetBtns[0])
    await waitFor(() =>
      expect(fetchMock.mock.calls.find((c) => c[0] === '/api/profile/avatar/preset')).toBeTruthy(),
    )
    expect(refreshMock).toHaveBeenCalled()
  })

  test('galeride Bilge Chan maskot bölümü + 6 avatar görünür', () => {
    render(<EditProfileModal open onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /Hazır Avatar/ }))
    expect(screen.getByText('Bilge Chan')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /Bilge Chan avatar/ }).length).toBe(6)
  })

  test('avatar varsa "Kaldır" → DELETE /api/profile/avatar', async () => {
    auth.value.profile = { ...(auth.value.profile as Record<string, unknown>), avatar_url: 'https://x/a.png' }
    render(<EditProfileModal open onClose={vi.fn()} />)
    fireEvent.click(screen.getByText('Kaldır'))
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/profile/avatar', { method: 'DELETE' }),
    )
    expect(refreshMock).toHaveBeenCalled()
  })

  test('avatar yoksa Kaldır butonu görünmez (baş-harf fallback)', () => {
    render(<EditProfileModal open onClose={vi.fn()} />)
    expect(screen.queryByText('Kaldır')).not.toBeInTheDocument()
  })

  test('Kaydet → PATCH /api/profile + onClose', async () => {
    const onClose = vi.fn()
    render(<EditProfileModal open onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    const patchCall = fetchMock.mock.calls.find((c) => c[0] === '/api/profile')!
    expect(patchCall[1].method).toBe('PATCH')
    expect(JSON.parse(patchCall[1].body).username).toBe('arenaci')
  })

  test('kısa isim → PATCH atılmaz, hata toast', () => {
    auth.value.profile = { ...(auth.value.profile as Record<string, unknown>), username: 'a' }
    render(<EditProfileModal open onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }))
    expect(toastMock.error).toHaveBeenCalled()
    expect(fetchMock.mock.calls.find((c) => c[0] === '/api/profile')).toBeUndefined()
  })
})
