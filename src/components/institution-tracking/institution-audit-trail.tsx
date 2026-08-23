'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, History, Loader2, RefreshCw } from 'lucide-react'
import {
  institutionOperationEventsSchema,
  type InstitutionOperationEvents,
} from '@/lib/institution-pilot/server-contract'

type Event = InstitutionOperationEvents['events'][number]

const labels: Record<Event['eventType'], string> = {
  institution_provisioned: 'Kurum oluşturuldu',
  staff_added: 'Öğretmen eklendi',
  staff_removed: 'Öğretmen çıkarıldı',
  manager_teaching_changed: 'Yönetici öğretmenliği değişti',
  manager_transferred: 'Kurum yöneticiliği devredildi',
  role_created: 'Kurum rolü oluşturuldu',
  role_updated: 'Kurum rolü güncellendi',
  role_deleted: 'Kurum rolü silindi',
  role_assignment_changed: 'Rol ataması değişti',
  classroom_created: 'Sınıf oluşturuldu',
  student_joined: 'Öğrenci kuruma katıldı',
  student_withdrawn: 'Öğrenci ayrıldı',
  student_removed: 'Öğrenci sınıftan çıkarıldı',
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('tr-TR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

export function InstitutionAuditTrail() {
  const [events, setEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/institution/audit?limit=50', { cache: 'no-store' })
      const body: unknown = await response.json().catch(() => null)
      if (!response.ok) throw new Error('Kurum işlem geçmişi alınamadı')
      const parsed = institutionOperationEventsSchema.safeParse(body)
      if (!parsed.success) throw new Error('Kurum işlem geçmişi doğrulanamadı')
      setEvents(parsed.data.events)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Kurum işlem geçmişi alınamadı')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  return (
    <section className="rounded-2xl border border-white/10 bg-[var(--surface)] p-4 sm:p-5" aria-labelledby="institution-audit-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <History className="mt-0.5 h-5 w-5 shrink-0 text-[var(--primary)]" aria-hidden="true" />
          <div>
            <h2 id="institution-audit-title" className="text-lg font-black">Kurum işlem geçmişi</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--text-sub)]">
              Yönetici, personel, rol, sınıf ve öğrenci üyeliği değişiklikleri değiştirilemez kayıtlarla izlenir.
            </p>
          </div>
        </div>
        <button type="button" aria-label="İşlem geçmişini yenile" onClick={() => void load()} disabled={loading} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/15 px-3 text-xs font-bold disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" /> Yenile
        </button>
      </div>

      {error && (
        <div role="status" className="mt-4 flex items-start gap-2 rounded-xl border border-red-400/25 bg-red-400/10 p-3 text-sm font-semibold text-red-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> {error}
        </div>
      )}
      {loading && events.length === 0 ? (
        <div className="flex min-h-24 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-[var(--primary)]" aria-label="Kurum işlem geçmişi yükleniyor" />
        </div>
      ) : !error && events.length === 0 ? (
        <p className="mt-4 rounded-xl border border-white/10 bg-white/[0.025] p-3 text-sm text-[var(--text-sub)]">
          Henüz kayıtlı kurum işlemi yok.
        </p>
      ) : (
        <ol className="mt-4 grid gap-2">
          {events.map((event) => (
            <li key={event.eventRef} className="rounded-xl border border-white/10 bg-white/[0.025] px-3 py-3">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                <span className="text-sm font-black">{labels[event.eventType]}</span>
                <time dateTime={event.createdAt} className="shrink-0 text-xs text-[var(--text-sub)]">{formatDate(event.createdAt)}</time>
              </div>
              <p className="mt-1 text-xs leading-5 text-[var(--text-sub)]">
                İşlemi yapan: {event.actorAlias}
                {event.subjectAlias ? ` · İlgili kişi: ${event.subjectAlias}` : ''}
                {event.classroomName ? ` · Sınıf: ${event.classroomName}` : ''}
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
