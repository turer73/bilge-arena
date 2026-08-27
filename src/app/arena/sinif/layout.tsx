import { connection } from 'next/server'

export default async function ClassroomLayout({ children }: { children: React.ReactNode }) {
  await connection()
  return children
}
