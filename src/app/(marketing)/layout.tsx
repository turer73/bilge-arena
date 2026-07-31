import { Navbar } from '@/components/layout/navbar'
import { Footer } from '@/components/layout/footer'

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      <Navbar />
      <main className="min-h-screen pt-[calc(var(--navbar-h)+0.5rem)]">{children}</main>
      <Footer />
    </>
  )
}
