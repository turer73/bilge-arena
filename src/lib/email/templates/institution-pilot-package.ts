import { escapeHtml } from '@/lib/utils/security'

interface Params {
  institutionName: string
  managerName: string
  packageName: string
  documentUrl: string
}

export function institutionPilotPackageEmail(params: Params) {
  const institution = escapeHtml(params.institutionName)
  const manager = escapeHtml(params.managerName)
  const packageName = escapeHtml(params.packageName)
  const documentUrl = escapeHtml(params.documentUrl)
  return {
    subject: params.institutionName.trim().slice(0, 80) + ' Bilge Arena kurum paketi',
    html: '<!doctype html><html lang="tr"><body style="font-family:Arial,sans-serif;color:#111827">'
      + '<h1>Bilge Arena kurum pilot paketi</h1><p>Merhaba ' + manager + ',</p>'
      + '<p><strong>' + institution + '</strong> için <strong>' + packageName + '</strong> bilgilendirme paketi hazırlanmıştır.</p>'
      + '<p>Belgede Bilge Arena\'nın sağlayacakları, kurumdan beklenenler, pilot şartları ve onay alanları bulunur.</p>'
      + '<p><a href="' + documentUrl + '">PDF belgesini aç</a></p>'
      + '<p>Bu e-posta kurum oluşturma işleminin zorunlu bilgilendirme kaydıdır. PDF ayrıca e-posta ekinde gönderilmiştir.</p>'
      + '</body></html>',
  }
}
