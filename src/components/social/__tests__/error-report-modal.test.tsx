import { beforeEach, describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

import { ErrorReportModal } from '../error-report-modal'
import { ERROR_REPORT_COIN_REWARD } from '@/lib/constants/rewards'

// P1 fix (Codex PR#242): modal eskiden onSubmit'i await ETMEDEN hemen "gönderildi"
// gösteriyordu → guest (401) sahte başarı görüp raporu sessizce kaybediyordu.
describe('ErrorReportModal — P1 sahte-başarı düzeltmesi', () => {
  beforeEach(() => vi.unstubAllEnvs())
  it('uses an accessible dialog, labelled controls and 44px action targets', () => {
    render(<ErrorReportModal questionId="q1" isOpen onClose={() => {}} />)
    expect(screen.getByRole('dialog', { name: 'Hata Bildir' })).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByLabelText('ACIKLAMA (OPSIYONEL)')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Hata bildirimini kapat' })).toHaveClass('h-11')
    expect(screen.getByRole('button', { name: 'Gonder' })).toHaveClass('min-h-11')
  })
  it('onSubmit {ok:false} dönerse HATA gösterir, sahte başarı YOK', async () => {
    const onSubmit = vi.fn().mockResolvedValue({ ok: false, error: 'Rapor göndermek için giriş yapmalısın.' })
    render(<ErrorReportModal questionId="q1" isOpen onClose={() => {}} onSubmit={onSubmit} />)

    fireEvent.click(screen.getByText('Yanlis cevap')) // tip seç → Gonder aktifleşir
    fireEvent.click(screen.getByText('Gonder'))

    await waitFor(() => expect(screen.getByText('Rapor göndermek için giriş yapmalısın.')).toBeTruthy())
    expect(screen.queryByText('Bildirimin bize ulaştı!')).toBeNull() // sahte başarı YOK
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('onSubmit {ok:true} dönerse başarı gösterir', async () => {
    const onSubmit = vi.fn().mockResolvedValue({ ok: true, rewardEligible: false })
    render(<ErrorReportModal questionId="q1" isOpen onClose={() => {}} onSubmit={onSubmit} />)

    fireEvent.click(screen.getByText('Yanlis cevap'))
    fireEvent.click(screen.getByText('Gonder'))

    await waitFor(() => expect(screen.getByText('Bildirimin bize ulaştı!')).toBeTruthy())
  })

  it('governance itirazında uygulanmayan altın ödülünü vaat etmez', async () => {
    const onSubmit = vi.fn().mockResolvedValue({ ok: true, rewardEligible: false })
    render(<ErrorReportModal questionId="q1" isOpen onClose={() => {}} onSubmit={onSubmit} />)
    expect(screen.getByText(/sorunun gördüğün revizyonuyla/)).toBeInTheDocument()
    fireEvent.click(screen.getByText('Yanlis cevap'))
    fireEvent.click(screen.getByText('Gonder'))
    await waitFor(() => expect(screen.getByText(/revizyon kanıtıyla/)).toBeInTheDocument())
    expect(document.body.textContent).not.toContain(`${ERROR_REPORT_COIN_REWARD} altın`)
  })

  it('legacy yol ödüle uygunluk döndürürse ödülü yalnız başarıdan sonra gösterir', async () => {
    const onSubmit = vi.fn().mockResolvedValue({ ok: true, rewardEligible: true })
    render(<ErrorReportModal questionId="q1" isOpen onClose={() => {}} onSubmit={onSubmit} />)
    expect(document.body.textContent).not.toContain(`${ERROR_REPORT_COIN_REWARD} altın`)
    fireEvent.click(screen.getByText('Yanlis cevap'))
    fireEvent.click(screen.getByText('Gonder'))
    await waitFor(() => expect(screen.getByText(new RegExp(`${ERROR_REPORT_COIN_REWARD} altın`))).toBeInTheDocument())
  })
})
