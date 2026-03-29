import type { Metadata } from 'next'
import FriendsClient from './friends-client'

export const metadata: Metadata = {
  title: 'Arkadaslar',
}

export default function FriendsPage() {
  return <FriendsClient />
}
