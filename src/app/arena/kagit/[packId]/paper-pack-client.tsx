'use client'

import { RefreshCw } from 'lucide-react'
import { usePaperPack } from '@/lib/hooks/use-paper-pack'
import { PaperPackPrintView } from '@/components/paper/paper-pack-print-view'

export function PaperPackClient({ packId }: { packId: string }) {
  const paper = usePaperPack(packId)

  if (paper.loading) {
    return <div role="status" className="mx-auto max-w-3xl px-4 py-16 text-center text-sm text-[var(--text-sub)]">Yazdırılabilir paket yükleniyor...</div>
  }

  if (paper.error || !paper.pack) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="text-xl font-black">Paket açılamadı</h1>
        <p role="alert" className="mt-2 text-sm leading-6 text-[var(--text-sub)]">Paket sana ait olmayabilir veya geçici bir bağlantı sorunu oluşmuş olabilir.</p>
        <button type="button" onClick={() => void paper.refresh()} className="btn-primary mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl px-5 text-sm font-bold">
          <RefreshCw className="h-4 w-4" aria-hidden="true" /> Yeniden dene
        </button>
      </div>
    )
  }

  return <PaperPackPrintView pack={paper.pack} />
}
