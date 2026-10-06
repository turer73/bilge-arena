import { connection } from 'next/server'

export default async function InstitutionNoAccessLayout({ children }: { children: React.ReactNode }) {
  await connection()
  return children
}
