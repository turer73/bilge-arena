import type { Metadata } from 'next'
import SocialPilotClient from './social-pilot-client'

export const metadata: Metadata = {
  title: 'Sosyal başlangıç keşfi',
  description: 'Dört alanda kısa başlangıç taramasıyla ilk çalışma yönünü bul.',
  robots: { index: false, follow: true },
}
export default function SocialPilotPage() { return <SocialPilotClient /> }
