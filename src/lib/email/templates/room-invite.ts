/**
 * Oda davet email template.
 *
 * Host bir oyuncuyu email ile odaya davet eder. Email iceriginde:
 *   - Davet edenin display_name'i
 *   - 6-haneli oda kodu (buyuk + okunabilir)
 *   - Direkt katilim linki (https://bilgearena.com/oda/kod?code=ABC123)
 *   - Oyun bilgisi (matematik/turkce/...)
 *   - 24 saatlik gecerlilik notu
 *
 * HTML template'i `docs/email-templates/invite-user.html` paterninden adapt.
 */

import { escapeHtml } from '@/lib/utils/security'

interface RoomInviteParams {
  hostName: string
  roomCode: string
  game?: string
  baseUrl?: string
}

const GAME_LABELS: Record<string, string> = {
  matematik: 'Matematik',
  turkce: 'Türkçe',
  fen: 'Fen Bilimleri',
  sosyal: 'Sosyal Bilimler',
  wordquest: 'İngilizce',
}

export function roomInviteEmail({
  hostName,
  roomCode,
  game,
  baseUrl = 'https://bilgearena.com',
}: RoomInviteParams): { subject: string; html: string } {
  // Codex P2 PR #90 fix: subject plain-text, HTML-escape kullanma —
  // 'Ali & Veli' raw kalmali, 'Ali &amp; Veli' entity gozukmemeli inbox'ta.
  // HTML body icin ayri escape edilir (safeName).
  const safeName = escapeHtml(hostName)
  const safeCode = escapeHtml(roomCode)
  const gameLabel = game ? GAME_LABELS[game] || escapeHtml(game) : ''
  const joinUrl = `${baseUrl}/oda/kod?code=${encodeURIComponent(roomCode)}`

  // Subject: raw hostName (HTML escape yok). Trim to safe length.
  const trimmedName = hostName.trim().slice(0, 60)
  const subject = `${trimmedName} seni Bilge Arena'da bir odaya davet etti`

  const html = `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#f4f6f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f6f9;padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
          <tr>
            <td style="background:linear-gradient(135deg,#2563EB 0%,#1d4ed8 100%);padding:32px 32px 28px;text-align:center;">
              <div style="font-size:28px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">BILGE ARENA</div>
              <div style="font-size:12px;color:rgba(255,255,255,0.7);margin-top:4px;letter-spacing:1px;">YKS HAZIRLIK</div>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <h1 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#111827;">Odaya Davet Edildin!</h1>
              <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#6b7280;">
                <strong>${safeName}</strong>, seni Bilge Arena'da çoklu oyuncu odasına davet etti${gameLabel ? ` (${gameLabel})` : ''}. Aynı sorulari aynı anda çözün, en hızlı doğru cevap kazansın!
              </p>

              <div style="background-color:#f4f6f9;border:1px solid #e5e7eb;border-radius:12px;padding:20px;margin-bottom:24px;text-align:center;">
                <div style="font-size:11px;font-weight:700;letter-spacing:1.2px;color:#6b7280;margin-bottom:6px;">ODA KODU</div>
                <div style="font-size:28px;font-weight:800;letter-spacing:6px;color:#2563EB;font-family:'Courier New',monospace;">${safeCode}</div>
              </div>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${joinUrl}" target="_blank" style="display:inline-block;background-color:#2563EB;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;padding:14px 36px;border-radius:10px;">
                      Odaya Katıl
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:24px 0 0;font-size:12px;line-height:1.5;color:#9ca3af;">
                Bu davet 24 saat içinde geçerlidir. Bağlantı çalışmazsa <a href="${baseUrl}/oda/kod" style="color:#2563EB;">${baseUrl.replace('https://', '')}/oda/kod</a> adresine gidip yukarıdaki kodu gir.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px;border-top:1px solid #f3f4f6;text-align:center;">
              <p style="margin:0;font-size:11px;color:#9ca3af;">
                &copy; 2026 Bilge Arena &middot; <a href="${baseUrl}" style="color:#2563EB;text-decoration:none;">bilgearena.com</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

  return { subject, html }
}
