import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createClient } from '@/lib/supabase/server'

const CRON_SECRET = process.env.CRON_SECRET
const resendKey = process.env.RESEND_API_KEY

/**
 * GET /api/cron/weekly-digest
 * Haftalik ozet email gonderir. Vercel Cron tarafindan tetiklenir.
 * Guvenlik: CRON_SECRET header'i gerekli.
 */
export async function GET(req: Request) {
  // Cron guvenlik kontrolu
  const authHeader = req.headers.get('authorization')
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })
  }

  if (!resendKey) {
    return NextResponse.json({ error: 'RESEND_API_KEY ayarlanmamis' }, { status: 500 })
  }

  const resend = new Resend(resendKey)
  const supabase = await createClient()

  // Son 7 gunde aktif kullanicilari bul
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const { data: activeUsers } = await supabase
    .from('game_sessions')
    .select('user_id')
    .gte('created_at', oneWeekAgo)
    .eq('status', 'completed')

  if (!activeUsers || activeUsers.length === 0) {
    return NextResponse.json({ sent: 0, message: 'Aktif kullanici yok' })
  }

  // Benzersiz user_id'ler
  const userIds = Array.from(new Set(activeUsers.map(u => u.user_id)))

  // Kullanici profilleri ve email'leri
  const { data: users } = await supabase.auth.admin.listUsers()
  const emailMap = new Map<string, string>()
  users?.users?.forEach(u => {
    if (u.email) emailMap.set(u.id, u.email)
  })

  let sentCount = 0

  for (const userId of userIds.slice(0, 50)) { // Max 50 email/cron
    const email = emailMap.get(userId)
    if (!email) continue

    // Kullanici haftalik istatistikleri
    const { data: profile } = await supabase
      .from('profiles')
      .select('display_name, total_xp, current_streak')
      .eq('id', userId)
      .single()

    const { count: sessionsThisWeek } = await supabase
      .from('game_sessions')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'completed')
      .gte('created_at', oneWeekAgo)

    const { data: xpThisWeek } = await supabase
      .from('xp_log')
      .select('xp_amount')
      .eq('user_id', userId)
      .gte('created_at', oneWeekAgo)

    const weeklyXP = xpThisWeek?.reduce((sum, row) => sum + (row.xp_amount || 0), 0) || 0
    const name = profile?.display_name || 'Arenaci'

    try {
      await resend.emails.send({
        from: 'Bilge Arena <bildirim@bilgearena.com>',
        to: email,
        subject: `${name}, bu hafta ${weeklyXP} XP kazandin!`,
        html: buildDigestHTML({
          name,
          weeklyXP,
          totalXP: profile?.total_xp || 0,
          streak: profile?.current_streak || 0,
          sessions: sessionsThisWeek || 0,
        }),
      })
      sentCount++
    } catch (err) {
      console.error(`[Digest] ${email} gonderilemedi:`, err)
    }
  }

  return NextResponse.json({ sent: sentCount })
}

function buildDigestHTML(data: {
  name: string
  weeklyXP: number
  totalXP: number
  streak: number
  sessions: number
}) {
  return `
<!DOCTYPE html>
<html lang="tr">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#080C14;font-family:system-ui,sans-serif;">
  <div style="max-width:480px;margin:0 auto;padding:32px 20px;">
    <div style="text-align:center;margin-bottom:24px;">
      <h1 style="color:#2563EB;font-size:24px;margin:0;">Bilge Arena</h1>
      <p style="color:#8892A4;font-size:13px;margin:4px 0 0;">Haftalik Ozet</p>
    </div>
    <div style="background:#0F1420;border-radius:12px;padding:24px;border:1px solid #1E2433;">
      <p style="color:#E8ECF4;font-size:16px;margin:0 0 16px;">
        Merhaba <strong>${data.name}</strong>! Bu hafta neler yaptın:
      </p>
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="padding:8px 0;color:#8892A4;font-size:13px;">Kazanilan XP</td>
          <td style="padding:8px 0;color:#FFB800;font-size:16px;font-weight:bold;text-align:right;">+${data.weeklyXP} XP</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#8892A4;font-size:13px;">Oynanan Oyun</td>
          <td style="padding:8px 0;color:#E8ECF4;font-size:16px;font-weight:bold;text-align:right;">${data.sessions}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#8892A4;font-size:13px;">Mevcut Seri</td>
          <td style="padding:8px 0;color:#FF6B35;font-size:16px;font-weight:bold;text-align:right;">${data.streak} gun 🔥</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#8892A4;font-size:13px;">Toplam XP</td>
          <td style="padding:8px 0;color:#E8ECF4;font-size:16px;font-weight:bold;text-align:right;">${data.totalXP.toLocaleString()}</td>
        </tr>
      </table>
    </div>
    <div style="text-align:center;margin-top:24px;">
      <a href="https://www.bilgearena.com/arena" style="display:inline-block;background:#2563EB;color:white;padding:12px 32px;border-radius:8px;font-weight:600;text-decoration:none;font-size:14px;">
        Arena'ya Don
      </a>
    </div>
    <p style="text-align:center;color:#565E6C;font-size:11px;margin-top:32px;">
      Bu emaili almak istemiyorsan profil ayarlarindan kapatabilirsin.
    </p>
  </div>
</body>
</html>`
}
