import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createHmac } from 'crypto'

function b64url(s: string | Buffer): string {
  return (typeof s === 'string' ? Buffer.from(s) : s)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function signHs256(payload: Record<string, unknown>, secret: string): string {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = b64url(JSON.stringify(payload))
  const sig = createHmac('sha256', secret).update(`${header}.${body}`).digest()
  return `${header}.${body}.${b64url(sig)}`
}

const JWT_SECRET = process.env.BILGE_ARENA_REALTIME_JWT_SECRET ?? ''

export async function GET() {
  if (!JWT_SECRET) {
    return NextResponse.json({ error: 'Realtime not configured' }, { status: 503 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = Math.floor(Date.now() / 1000)
  const token = signHs256(
    { role: 'authenticated', sub: user.id, iat: now, exp: now + 3600 },
    JWT_SECRET,
  )

  return NextResponse.json({ token }, {
    headers: { 'Cache-Control': 'private, max-age=3300' },
  })
}
