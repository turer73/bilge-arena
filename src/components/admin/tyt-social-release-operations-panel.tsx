'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  ExamRole,
  ExamRoleOperations,
  ExamRoleWorkflowState,
} from '@/app/api/admin/content-quality/tyt-social/exam-role/contracts'

type OperationItem = ExamRoleOperations['items'][number]

const workflowLabels: Record<ExamRoleWorkflowState, string> = {
  source_prepare: 'Kaynak kanıtı eksik',
  content_stage1: 'İçerik 1. inceleme bekliyor',
  content_stage2: 'İçerik 2. inceleme bekliyor',
  content_publish: 'İçerik yayını bekliyor',
  role_prepare: 'Sınav rolü seçilmeli',
  role_stage1: 'Rol 1. inceleme bekliyor',
  role_stage2: 'Rol 2. inceleme bekliyor',
  ready: 'İnsan incelemeleri tamam',
  schema_drift: 'Şema/veri sapması',
}

const roleLabels: Record<ExamRole, string> = {
  common_history: 'Ortak Tarih',
  common_geography: 'Ortak Coğrafya',
  common_philosophy: 'Ortak Felsefe',
  standard_religion: 'Din Kültürü',
  alternate_philosophy: 'İlave Felsefe',
}

const stateOptions = Object.entries(workflowLabels) as Array<[ExamRoleWorkflowState, string]>
const releaseConfirmation = 'TYT SOSYAL YAYINLA'

function isGovernedReleaseAllowed(
  readiness: ExamRoleOperations['readiness'] | null | undefined,
) {
  return Boolean(
    readiness
    && readiness.scopeStatus === 'validating'
    && !readiness.diagnosticEnabled
    && readiness.activeQuestionCount > 0
    && readiness.sourceReady
    && readiness.candidatePolicyReady
    && readiness.masteryReaderReady
    && readiness.officialSectionComposerReady
    && readiness.mappingReady
    && readiness.reviewReady,
  )
}

export function TytSocialReleaseOperationsPanel() {
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [operations, setOperations] = useState<ExamRoleOperations | null>(null)
  const [filter, setFilter] = useState<ExamRoleWorkflowState | ''>('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [selected, setSelected] = useState<OperationItem | null>(null)
  const [role, setRole] = useState<ExamRole | ''>('')
  const [rationale, setRationale] = useState('')
  const [releaseText, setReleaseText] = useState('')
  const requestRef = useRef<AbortController | null>(null)

  const load = useCallback(async (cursor?: string | null) => {
    requestRef.current?.abort()
    const controller = new AbortController()
    requestRef.current = controller
    setLoading(true)
    setError('')
    try {
      const query = new URLSearchParams({ limit: '25' })
      if (filter) query.set('state', filter)
      if (cursor) query.set('cursor', cursor)
      const response = await fetch(
        `/api/admin/content-quality/tyt-social/exam-role?${query}`,
        { cache: 'no-store', signal: controller.signal },
      )
      if (controller.signal.aborted || requestRef.current !== controller) return
      if (response.status === 503) {
        setEnabled(false)
        setOperations(null)
        return
      }
      setEnabled(true)
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error ?? 'TYT Sosyal operasyon kuyruğu alınamadı')
      setOperations(body as ExamRoleOperations)
      if (!cursor) setSelected(null)
    } catch (cause) {
      if (controller.signal.aborted || requestRef.current !== controller) return
      setError(cause instanceof Error ? cause.message : 'TYT Sosyal operasyon kuyruğu alınamadı')
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null
        setLoading(false)
      }
    }
  }, [filter])

  useEffect(() => {
    const timer = window.setTimeout(() => void load(null), 0)
    return () => {
      window.clearTimeout(timer)
      requestRef.current?.abort()
    }
  }, [load])

  const choose = (item: OperationItem) => {
    setSelected(item)
    setRole('')
    setRationale('')
    setError('')
    setNotice('')
  }

  const mutate = async (path: string, payload: Record<string, unknown>) => {
    const requestId = crypto.randomUUID()
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const response = await fetch(path, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Idempotency-Key': requestId,
        },
        body: JSON.stringify({ ...payload, requestId }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error ?? 'İşlem tamamlanamadı')
      setNotice('İşlem kaydedildi; kuyruk yeniden doğrulandı.')
      setSelected(null)
      setRole('')
      setRationale('')
      await load(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'İşlem tamamlanamadı')
    } finally {
      setBusy(false)
    }
  }

  const prepareRole = async () => {
    if (!selected?.revisionId || !role || !selected.allowedRoles.includes(role)) return
    await mutate('/api/admin/content-quality/tyt-social/exam-role/prepare', {
      revisionId: selected.revisionId,
      examRole: role,
      rationale: rationale.trim(),
    })
  }

  const reviewRole = async (decision: 'approved' | 'rejected') => {
    if (!selected?.candidateId) return
    const stage = selected.workflowState === 'role_stage2' ? 2 : 1
    await mutate('/api/admin/content-quality/tyt-social/exam-role/review', {
      candidateId: selected.candidateId,
      stage,
      decision,
      rationale: rationale.trim(),
    })
  }

  const releaseScope = async () => {
    const readiness = operations?.readiness
    if (!readiness || !isGovernedReleaseAllowed(readiness) || releaseText !== releaseConfirmation) return
    await mutate('/api/admin/content-quality/tyt-social/release', {
      expectedSourceEvidenceSha256: readiness.sourceEvidenceSha256,
      expectedActiveQuestionCount: readiness.activeQuestionCount,
    })
    setReleaseText('')
  }

  if (enabled === false) {
    return (
      <section className="mb-6 rounded-xl border border-[var(--border)] bg-[var(--card-bg)] p-4">
        <h2 className="font-bold">TYT Sosyal V2 yayın operasyonları</h2>
        <p className="mt-2 text-xs text-[var(--text-sub)]">
          İçerik yönetişimi kapalı. Bu panel hiçbir soruyu, onayı veya kapsamı kendiliğinden açmaz.
        </p>
      </section>
    )
  }

  const readiness = operations?.readiness
  const releaseAllowed = isGovernedReleaseAllowed(readiness)

  return (
    <section className="mb-6 rounded-xl border border-[var(--border)] bg-[var(--card-bg)] p-4" aria-labelledby="tyt-social-operations-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="tyt-social-operations-title" className="font-bold">TYT Sosyal V2 yayın operasyonları</h2>
          <p className="mt-1 max-w-3xl text-xs text-[var(--text-sub)]">
            Bu panel içerik veya onay üretmez. Her soru; güncel kaynak kanıtı, kazanım eşlemesi,
            iki bağımsız içerik incelemesi ve iki bağımsız sınav-rolü incelemesiyle ilerler.
            Tüm kanıtlar tamamlanana kadar Keşif kapsamı kapalı kalır.
          </p>
        </div>
        <button
          type="button"
          disabled={loading || busy}
          onClick={() => void load(null)}
          className="min-h-11 rounded-lg border border-[var(--border)] px-3 text-xs font-bold disabled:opacity-50"
        >
          Yeniden doğrula
        </button>
      </div>

      {readiness && (
        <div className="mt-4 grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-4" aria-label="TYT Sosyal yayın kanıtı">
          <Evidence label="Kaynak + içerik onayı" value={`${readiness.sourceApprovedQuestionCount}/${readiness.activeQuestionCount}`} ready={readiness.sourceReady} />
          <Evidence label="Sınav rolü" value={`${readiness.assignedQuestionCount}/${readiness.activeQuestionCount}`} ready={readiness.candidatePolicyReady} />
          <Evidence label="Kazanım eşlemesi" value={`${readiness.mappingMapped}/${readiness.mappingTotal}`} ready={readiness.mappingReady} />
          <Evidence label="Kapsam" value={readiness.releaseReady ? 'Yayında' : 'Kapalı / doğrulanıyor'} ready={readiness.releaseReady} />
        </div>
      )}

      <div aria-live="polite" className="mt-3">
        {error && <p role="alert" className="rounded-lg border border-[var(--urgency-border)] bg-[var(--urgency-bg)] px-3 py-2 text-xs text-[var(--urgency)]">{error}</p>}
        {notice && <p className="rounded-lg border border-[var(--growth-border)] bg-[var(--growth-bg)] px-3 py-2 text-xs text-[var(--growth)]">{notice}</p>}
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-2">
        <label className="text-xs font-bold">İş adımı
          <select
            value={filter}
            onChange={(event) => setFilter(event.target.value as ExamRoleWorkflowState | '')}
            className="ml-2 min-h-11 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3"
          >
            <option value="">Tümü</option>
            {stateOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <span className="text-xs text-[var(--text-sub)]">Bu sayfada {operations?.items.length ?? 0} kayıt</span>
      </div>

      <div className="mt-3 overflow-x-auto rounded-lg border border-[var(--border)]">
        {loading ? (
          <p className="p-4 text-xs text-[var(--text-sub)]">Yayın kanıtı yükleniyor…</p>
        ) : operations?.items.length ? (
          <table className="w-full min-w-[760px] text-left text-xs">
            <thead className="bg-[var(--surface)] text-[var(--text-sub)]">
              <tr><th className="px-3 py-2">Soru / revizyon</th><th className="px-3 py-2">Alan</th><th className="px-3 py-2">Kaynak</th><th className="px-3 py-2">Durum</th><th className="px-3 py-2">İşlem</th></tr>
            </thead>
            <tbody>
              {operations.items.map((item) => (
                <tr key={item.questionId} className="border-t border-[var(--border)]">
                  <td className="px-3 py-2 font-mono text-[11px]">{item.questionId}<br />{item.revisionId ?? 'revizyon yok'}</td>
                  <td className="px-3 py-2">{item.category} · zorluk {item.difficulty}<br />{item.outcomeCount} kazanım</td>
                  <td className="px-3 py-2">{item.sourceTitle ?? 'Kaynak yok'}<br /><span className="text-[var(--text-sub)]">{item.licenseCode ?? 'lisans yok'}</span></td>
                  <td className="px-3 py-2">{workflowLabels[item.workflowState]}</td>
                  <td className="px-3 py-2">
                    <button type="button" onClick={() => choose(item)} className="min-h-11 rounded-lg border border-[var(--focus)] px-3 font-bold text-[var(--focus)]">İncele</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="p-4 text-xs text-[var(--text-sub)]">Bu filtrede kayıt yok.</p>
        )}
      </div>

      {operations?.nextCursor && (
        <button type="button" disabled={loading || busy} onClick={() => void load(operations.nextCursor)} className="mt-3 min-h-11 rounded-lg border border-[var(--border)] px-3 text-xs font-bold disabled:opacity-50">Sonraki 25 kayıt</button>
      )}

      {selected && (
        <div className="mt-4 rounded-lg border border-[var(--focus)] p-4" aria-label="Seçili TYT Sosyal operasyonu">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-bold">{workflowLabels[selected.workflowState]}</p>
              <p className="mt-1 font-mono text-[11px] text-[var(--text-sub)]">{selected.revisionId ?? selected.questionId}</p>
            </div>
            <button type="button" onClick={() => setSelected(null)} className="min-h-11 rounded-lg border border-[var(--border)] px-3 text-xs font-bold">Kapat</button>
          </div>

          {['source_prepare', 'content_stage1', 'content_stage2', 'content_publish'].includes(selected.workflowState) && (
            <p className="mt-3 text-xs text-[var(--text-sub)]">
              Kaynak, kullanım hakkı, kazanım ve içerik incelemesi üstteki İçerik Yönetişimi kuyruğunda
              bu revizyon için tamamlanmalı. Bu panel eksik insan kararını otomatik doldurmaz.
            </p>
          )}
          {selected.workflowState === 'schema_drift' && <p role="alert" className="mt-3 text-xs text-[var(--urgency)]">Beklenmeyen kategori veya revizyon bağlantısı var. Veri düzeltilmeden işlem kapalıdır.</p>}
          {selected.workflowState === 'ready' && <p className="mt-3 text-xs text-[var(--growth)]">Onaylı rol: {selected.examRole ? roleLabels[selected.examRole] : 'kanıt alınamadı'}</p>}

          {selected.workflowState === 'role_prepare' && (
            <fieldset className="mt-3 space-y-2">
              <legend className="text-xs font-bold">Sınav rolünü insan incelemesiyle seçin</legend>
              {selected.allowedRoles.length === 0 && <p role="alert" className="text-xs text-[var(--urgency)]">Bu kategori için güvenli rol sözleşmesi yok.</p>}
              {selected.allowedRoles.map((allowedRole) => (
                <label key={allowedRole} className="flex min-h-11 items-center gap-2 rounded-lg border border-[var(--border)] px-3 text-xs">
                  <input type="radio" name={`exam-role-${selected.questionId}`} value={allowedRole} checked={role === allowedRole} onChange={() => setRole(allowedRole)} />
                  {roleLabels[allowedRole]}
                </label>
              ))}
            </fieldset>
          )}

          {['role_prepare', 'role_stage1', 'role_stage2'].includes(selected.workflowState) && (
            <label className="mt-3 block text-xs font-bold">İnsan inceleme gerekçesi
              <textarea value={rationale} onChange={(event) => setRationale(event.target.value)} maxLength={1000} rows={3} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 font-normal" placeholder="En az 10 karakter; yalnız içerik/rol kanıtını yazın." />
            </label>
          )}
          {selected.workflowState === 'role_prepare' && (
            <button type="button" disabled={busy || !role || rationale.trim().length < 10} onClick={() => void prepareRole()} className="mt-3 min-h-11 rounded-lg bg-[var(--focus)] px-4 text-xs font-bold text-white disabled:opacity-50">Rol adayını kaydet</button>
          )}
          {['role_stage1', 'role_stage2'].includes(selected.workflowState) && (
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" disabled={busy || rationale.trim().length < 10} onClick={() => void reviewRole('approved')} className="min-h-11 rounded-lg bg-[var(--growth)] px-4 text-xs font-bold text-white disabled:opacity-50">Bağımsız onayı kaydet</button>
              <button type="button" disabled={busy || rationale.trim().length < 10} onClick={() => void reviewRole('rejected')} className="min-h-11 rounded-lg border border-[var(--urgency)] px-4 text-xs font-bold text-[var(--urgency)] disabled:opacity-50">Reddet</button>
            </div>
          )}
        </div>
      )}

      {readiness && !readiness.releaseReady && (
        <div className="mt-4 rounded-lg border border-[var(--urgency-border)] bg-[var(--urgency-bg)] p-4">
          <p className="text-xs font-bold">Son yayın kapısı</p>
          <p className="mt-1 text-xs text-[var(--text-sub)]">
            Düğme ancak bütün insan ve teknik kontrolleri aynı anda temiz olduğunda açılır.
            Bu işlem tarihsel ustalık kanıtını geriye dönük üretmez.
          </p>
          <label className="mt-3 block text-xs font-bold">Onay metni
            <input value={releaseText} onChange={(event) => setReleaseText(event.target.value)} disabled={!releaseAllowed || busy} className="mt-1 min-h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 font-normal disabled:opacity-50" placeholder={releaseConfirmation} />
          </label>
          <button type="button" disabled={!releaseAllowed || busy || releaseText !== releaseConfirmation} onClick={() => void releaseScope()} className="mt-3 min-h-11 rounded-lg bg-[var(--urgency)] px-4 text-xs font-bold text-white disabled:opacity-50">TYT Sosyal kapsamını yayınla</button>
        </div>
      )}
    </section>
  )
}

function Evidence({ label, value, ready }: { label: string; value: string; ready: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${ready ? 'border-[var(--growth-border)] bg-[var(--growth-bg)]' : 'border-[var(--border)] bg-[var(--surface)]'}`}>
      <p className="font-bold">{label}</p>
      <p className={ready ? 'mt-1 text-[var(--growth)]' : 'mt-1 text-[var(--text-sub)]'}>{value} · {ready ? 'temiz' : 'eksik'}</p>
    </div>
  )
}
