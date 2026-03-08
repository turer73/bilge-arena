import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowRight } from 'lucide-react'

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8 text-center">
      <div className="font-display text-8xl font-black text-[var(--focus)]">404</div>
      <h1 className="font-display text-2xl font-bold">Sayfa Bulunamadi</h1>
      <p className="max-w-md text-[var(--text-sub)]">
        Aradigin sayfa mevcut degil veya tasindi. Arena&apos;ya donup maceraya devam edebilirsin.
      </p>
      <Link href="/">
        <Button variant="primary" size="md">
          Ana Sayfaya Don
          <ArrowRight size={16} />
        </Button>
      </Link>
    </main>
  )
}
