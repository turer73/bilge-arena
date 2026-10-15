import { connection } from 'next/server'
import type { Metadata } from 'next'
import MeasurementClient from './measurement-client'

export const metadata: Metadata = { title: 'Gönüllü ölçüm turu', robots: { index: false, follow: false } }
export default async function Page() {
  await connection()
  return <MeasurementClient />
}
