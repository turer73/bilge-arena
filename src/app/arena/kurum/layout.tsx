import { connection } from 'next/server'

export default async function InstitutionLayout({ children }: { children: React.ReactNode }) {
  await connection()
  return children
}
