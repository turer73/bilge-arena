import type { Metadata } from 'next'
import { MobileHomeDemo } from './mobile-home-demo'

// Prototip -> gercek kod kopru demosu. Arama motorlarina kapali.
export const metadata: Metadata = {
  title: 'Mobil Anasayfa — Demo',
  robots: { index: false, follow: false },
}

export default function MobilDemoPage() {
  return <MobileHomeDemo />
}
