import type { Metadata } from 'next'
import { Footer } from '@/components/layout/footer'
import { Navbar } from '@/components/layout/navbar'
import { NewHomeDemo } from './new-home-demo'

export const metadata: Metadata = {
  title: 'Yeni ana sayfa demosu',
  description: 'Bilge Arena öğrenme döngüsü ve kurumsal altyapı ana sayfa demosu.',
  robots: { index: false, follow: false },
}

export default function NewHomeDemoPage() {
  return (
    <>
      <a
        href="#demo-main"
        className="sr-only fixed left-4 top-4 z-[100] rounded-lg bg-[var(--focus)] px-4 py-3 font-bold text-white focus:not-sr-only"
      >
        Ana içeriğe geç
      </a>
      <Navbar />
      <main id="demo-main" className="pt-[var(--navbar-h)]">
        <NewHomeDemo />
      </main>
      <Footer />
    </>
  )
}
