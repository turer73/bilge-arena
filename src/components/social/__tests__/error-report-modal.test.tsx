import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

import { ErrorReportModal } from '../error-report-modal'

// P1 fix (Codex PR#242): modal eskiden onSubmit'i await ETMEDEN hemen "gönderildi"
// gösteriyordu → guest (401) sahte başarı görüp raporu sessizce kaybediyordu.
describe('ErrorReportModal — P1 sahte-başarı düzeltmesi', () => {
  it('onSubmit {ok:false} dönerse HATA gösterir, sahte başarı YOK', async () => {
    const onSubmit = vi.fn().mockResolvedValue({ ok: false, error: 'Rapor göndermek için giriş yapmalısın.' })
    render(<ErrorReportModal questionId="q1" isOpen onClose={() => {}} onSubmit={onSubmit} />)

    fireEvent.click(screen.getByText('Yanlis cevap')) // tip seç → Gonder aktifleşir
    fireEvent.click(screen.getByText('Gonder'))

    await waitFor(() => expect(screen.getByText('Rapor göndermek için giriş yapmalısın.')).toBeTruthy())
    expect(screen.queryByText('Raporun gonderildi!')).toBeNull() // sahte başarı YOK
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('onSubmit {ok:true} dönerse başarı gösterir', async () => {
    const onSubmit = vi.fn().mockResolvedValue({ ok: true })
    render(<ErrorReportModal questionId="q1" isOpen onClose={() => {}} onSubmit={onSubmit} />)

    fireEvent.click(screen.getByText('Yanlis cevap'))
    fireEvent.click(screen.getByText('Gonder'))

    await waitFor(() => expect(screen.getByText('Raporun gonderildi!')).toBeTruthy())
  })
})
