import { beforeEach, describe, expect, test, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { DiagnosticExplainerDialog } from '../diagnostic-explainer-dialog'
import { useAdaptiveDiagnostic } from '@/lib/hooks/use-adaptive-diagnostic'

vi.mock('@/lib/hooks/use-adaptive-diagnostic', () => ({ useAdaptiveDiagnostic: vi.fn() }))

const mockedUseAdaptiveDiagnostic = vi.mocked(useAdaptiveDiagnostic)

function diagnosticResult(overrides: Record<string, unknown> = {}) {
  return {
    response: {
      supported: true,
      game: 'matematik',
      examRef: 'TYT',
      policy: { version: 'adaptive-diagnostic-v3', questionCount: 10, outcomeCount: 6, maxPerOutcome: 2 },
      session: null,
      summary: null,
    },
    session: null,
    summary: null,
    supported: true,
    loading: false,
    submitting: false,
    error: null,
    refresh: vi.fn(),
    start: vi.fn(),
    answer: vi.fn(),
    ...overrides,
  }
}

describe('DiagnosticExplainerDialog', () => {
  beforeEach(() => {
    mockedUseAdaptiveDiagnostic.mockReset()
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
      configurable: true,
      value: function showModal(this: HTMLDialogElement) { this.setAttribute('open', '') },
    })
    Object.defineProperty(HTMLDialogElement.prototype, 'close', {
      configurable: true,
      value: function close(this: HTMLDialogElement) { this.removeAttribute('open') },
    })
  })

  test('yayınlanan policy soru sayısını ve çalışma-planı sınırını açıklar', () => {
    mockedUseAdaptiveDiagnostic.mockReturnValue(diagnosticResult() as never)

    render(<DiagnosticExplainerDialog game="matematik" examRef="TYT" userId="student" onClose={vi.fn()} />)

    expect(screen.getByText('10 uyarlanabilir soru · yaklaşık 8 dakika')).toBeInTheDocument()
    expect(screen.getByText('6 kazanım alanı')).toBeInTheDocument()
    expect(screen.getByText(/doğrulanmış pratiklerin sonraki günlük planlarını kişiselleştirir/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ölçüm ekranına geç' })).toHaveAttribute(
      'href',
      '/arena/tani?game=matematik&exam_ref=TYT',
    )
  })

  test('misafire sabit soru sayısı vaat etmeden giriş dönüşünü korur', () => {
    mockedUseAdaptiveDiagnostic.mockReturnValue(diagnosticResult({ response: null, supported: false }) as never)

    render(<DiagnosticExplainerDialog game="fen" examRef="TYT" onClose={vi.fn()} />)

    expect(screen.getByText('Kısa ve uyarlanabilir başlangıç taraması')).toBeInTheDocument()
    expect(screen.queryByText(/10 uyarlanabilir soru/)).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Giriş yap ve ölçümü aç' })).toHaveAttribute(
      'href',
      '/giris?next=%2Farena%2Ftani%3Fgame%3Dfen%26exam_ref%3DTYT',
    )
  })

  test('kapsam isteği başarısız olursa yeniden deneme sunar', () => {
    const refresh = vi.fn()
    mockedUseAdaptiveDiagnostic.mockReturnValue(diagnosticResult({
      response: null,
      supported: false,
      error: 'load',
      refresh,
    }) as never)

    render(<DiagnosticExplainerDialog game="matematik" examRef="TYT" userId="student" onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Tekrar dene' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Ölçüm bilgisi şu anda alınamadı.')
    expect(refresh).toHaveBeenCalledTimes(1)
  })
})
