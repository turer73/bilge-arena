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
      <Navbar />
      <main className="pt-[var(--navbar-h)]">
        <NewHomeDemo />
      </main>
      <Footer />
    </>
  )
}
