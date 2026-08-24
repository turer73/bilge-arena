'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, KeyRound, Loader2, ShieldCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { mfaLoginPath } from '@/lib/auth/aal2'

type Setup = {
  factorId: string
  qrCode?: string
  secret?: string
  verified: boolean
}

export function MfaSecurityClient({ returnPath }: { returnPath: string }) {
  const router = useRouter()
  const [setup, setSetup] = useState<Setup | null>(null)
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [isAal2, setIsAal2] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    let active = true
    const load = async () => {
      const supabase = createClient()
      const [userResult, aalResult, factorsResult] = await Promise.all([
        supabase.auth.getUser(),
        supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
        supabase.auth.mfa.listFactors(),
      ])
      if (!active) return
      if (!userResult.data.user) {
        router.replace(mfaLoginPath(returnPath))
        return
      }
      if (aalResult.error || factorsResult.error) {
        setError('Doğrulama durumu yüklenemedi. Sayfayı yenileyip tekrar deneyin.')
        setLoading(false)
        return
      }
      setIsAal2(aalResult.data?.currentLevel === 'aal2')
      const verified = factorsResult.data?.totp.find((factor) => factor.status === 'verified')
      const unfinished = factorsResult.data?.all.find(
        (factor) => factor.factor_type === 'totp' && factor.status === 'unverified',
      )
      if (verified) {
        setSetup({ factorId: verified.id, verified: true })
      } else if (unfinished) {
        setSetup({ factorId: unfinished.id, verified: false })
        setNotice('Daha önce başlatılmış bir kurulum bulundu. Kodunuz yoksa kurulumu sıfırlayıp yeni QR kodu oluşturun.')
      }
      setLoading(false)
    }
    void load()
    return () => { active = false }
  }, [router])

  const enroll = async () => {
    setSubmitting(true)
    setError('')
    setNotice('')
    const { data, error: enrollError } = await createClient().auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: 'Bilge Arena yönetici/personel doğrulaması',
    })
    if (enrollError) setError(enrollError.message)
    else setSetup({
      factorId: data.id,
      qrCode: data.totp.qr_code,
      secret: data.totp.secret,
      verified: false,
    })
    setSubmitting(false)
  }

  const resetUnfinishedEnrollment = async () => {
    if (!setup || setup.verified) return
    setSubmitting(true)
    setError('')
    const { error: unenrollError } = await createClient().auth.mfa.unenroll({
      factorId: setup.factorId,
    })
    if (unenrollError) {
      setError('Yarım kalan kurulum sıfırlanamadı. Oturumu kapatıp tekrar giriş yapın.')
    } else {
      setSetup(null)
      setCode('')
      setNotice('Eski kurulum sıfırlandı. Şimdi yeni bir QR kodu oluşturabilirsiniz.')
    }
    setSubmitting(false)
  }

  const verify = async () => {
    if (!setup || !/^\d{6}$/.test(code)) {
      setError('Doğrulama uygulamasındaki 6 haneli kodu girin.')
      return
    }
    setSubmitting(true)
    setError('')
    setNotice('')
    const { error: verifyError } = await createClient().auth.mfa.challengeAndVerify({
      factorId: setup.factorId,
      code,
    })
    if (verifyError) {
      setError('Kod doğrulanamadı. Yeni kodu deneyin.')
      setSubmitting(false)
      return
    }
    setIsAal2(true)
    setSubmitting(false)
    router.replace(returnPath)
    router.refresh()
  }

  if (loading) {
    return <main className="grid min-h-screen place-items-center"><Loader2 className="h-8 w-8 animate-spin" aria-label="Yükleniyor" /></main>
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl items-center px-4 py-10">
      <section className="w-full rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-xl sm:p-8">
        <div className="mb-6 flex items-center gap-3">
          <span className="rounded-2xl bg-blue-500/15 p-3 text-blue-400"><ShieldCheck className="h-7 w-7" /></span>
          <div>
            <h1 className="text-2xl font-bold">İki adımlı doğrulama</h1>
            <p className="mt-1 text-sm text-[var(--text-muted)]">Yönetici ve kurum personeli işlemleri için zorunludur.</p>
          </div>
        </div>

        <ol className="mb-6 list-decimal space-y-2 pl-5 text-sm leading-6 text-[var(--text-muted)]">
          <li>Google Authenticator veya Microsoft Authenticator uygulamasını açın.</li>
          <li>QR kodunu tarayın; ardından uygulamadaki 6 haneli kodu girin.</li>
          <li>Doğrulama bitince güvenli biçimde yönetim paneline dönersiniz.</li>
        </ol>

        {isAal2 ? (
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-300">
            <div className="flex items-center gap-2 font-semibold"><CheckCircle2 className="h-5 w-5" /> Bu oturum AAL2 ile doğrulandı.</div>
            <button type="button" onClick={() => router.replace(returnPath)} className="mt-4 rounded-xl bg-emerald-500 px-4 py-2 font-semibold text-slate-950">Devam et</button>
          </div>
        ) : !setup ? (
          <div>
            <p className="text-sm leading-6 text-[var(--text-muted)]">Google Authenticator, Microsoft Authenticator veya uyumlu bir TOTP uygulaması kullanabilirsiniz.</p>
            <button type="button" disabled={submitting} onClick={enroll} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white disabled:opacity-60">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />} Doğrulamayı kur
            </button>
          </div>
        ) : (
          <div className="space-y-5">
            {!setup.verified && setup.qrCode && (
              <div className="rounded-2xl bg-white p-4 text-center">
                {/* Supabase tarafindan uretilen, yalniz bu faktor kaydina ait data URI. */}
                <img src={setup.qrCode} alt="TOTP kurulum QR kodu" className="mx-auto h-52 w-52" />
                {setup.secret && <p className="mt-3 break-all font-mono text-xs text-slate-700">{setup.secret}</p>}
              </div>
            )}
            {!setup.verified && !setup.qrCode && (
              <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm leading-6 text-amber-200">
                Önceki kurulumun QR kodu güvenlik nedeniyle tekrar gösterilemez. Doğrulama uygulamanızda bu kayıt yoksa kurulumu sıfırlayın.
                <button type="button" disabled={submitting} onClick={resetUnfinishedEnrollment} className="mt-3 block rounded-xl border border-amber-400/40 px-4 py-2 font-semibold disabled:opacity-60">
                  Yarım kalan kurulumu sıfırla
                </button>
              </div>
            )}
            <label className="block text-sm font-medium">
              6 haneli doğrulama kodu
              <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))} className="mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-4 py-3 text-lg tracking-[0.35em]" />
            </label>
            <button type="button" disabled={submitting || code.length !== 6} onClick={verify} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white disabled:opacity-60">
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />} Doğrula ve devam et
            </button>
          </div>
        )}

        {notice && <p role="status" className="mt-4 rounded-xl border border-blue-500/30 bg-blue-500/10 p-3 text-sm text-blue-200">{notice}</p>}
        {error && <p role="alert" className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{error}</p>}
      </section>
    </main>
  )
}
