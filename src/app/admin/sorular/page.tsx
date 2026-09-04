'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { GAMES, GAME_SLUGS, type GameSlug } from '@/lib/constants/games'
import { AIQuestionGenerator } from '@/components/admin/ai-question-generator'
import type { Question, Difficulty } from '@/types/database'
import { stripRichText } from '@/lib/utils/rich-text'

interface GovernanceRevisionDetail {
  revisionId: string
  changeKind?: string
  metadata: Record<string, unknown>
  content: Record<string, unknown>
  source: Record<string, unknown>
  outcomes: Array<{ outcomeId: string; weight: number; primary: boolean }>
}

type SourceKind = 'original' | 'licensed' | 'public_domain' | 'user_generated' | 'official_exam'
interface EditSource {
  kind: SourceKind
  title: string
  url: string
  licenseCode: string
  licenseUrl: string
  attribution: string
  provenanceRef: string
}

const EMPTY_SOURCE: EditSource = {
  kind: 'original', title: '', url: '', licenseCode: '', licenseUrl: '', attribution: '', provenanceRef: '',
}

function editSourceFromDetail(source: Record<string, unknown> | null | undefined): EditSource {
  const kind = source?.kind
  return {
    kind: kind === 'licensed' || kind === 'public_domain' || kind === 'user_generated' || kind === 'official_exam'
      ? kind
      : 'original',
    title: typeof source?.title === 'string' ? source.title : '',
    url: typeof source?.url === 'string' ? source.url : '',
    licenseCode: typeof source?.licenseCode === 'string' ? source.licenseCode : '',
    licenseUrl: typeof source?.licenseUrl === 'string' ? source.licenseUrl : '',
    attribution: typeof source?.attribution === 'string' ? source.attribution : '',
    provenanceRef: typeof source?.provenanceRef === 'string' ? source.provenanceRef : '',
  }
}

function sourcePayload(source: EditSource) {
  return {
    kind: source.kind,
    title: source.title.trim(),
    ...(source.url.trim() ? { url: source.url.trim() } : {}),
    licenseCode: source.licenseCode.trim(),
    ...(source.licenseUrl.trim() ? { licenseUrl: source.licenseUrl.trim() } : {}),
    ...(source.attribution.trim() ? { attribution: source.attribution.trim() } : {}),
    ...(source.provenanceRef.trim() ? { provenanceRef: source.provenanceRef.trim() } : {}),
  }
}

function isHttpsUrl(value: string) {
  if (!value.trim()) return true
  try {
    const parsed = new URL(value.trim())
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password && Boolean(parsed.hostname)
  } catch {
    return false
  }
}

function isLegacySourceDetail(detail: GovernanceRevisionDetail | null) {
  if (!detail) return false
  const provenance = typeof detail.source?.provenanceRef === 'string' ? detail.source.provenanceRef.trim() : ''
  return detail.changeKind === 'legacy_import' || /^legacy:/i.test(provenance)
}

interface OutcomeOption {
  id: string
  code: string
  title: string
  category: string
  examRef: string | null
  taxonomyVersion: string
}

export default function AdminQuestionsPage() {
  const [questions, setQuestions] = useState<Question[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [filterGame, setFilterGame] = useState<GameSlug | 'all'>('all')
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('all')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')

  // Edit modal state
  const [editQ, setEditQ] = useState<Question | null>(null)
  const [editContent, setEditContent] = useState({ question: '', options: ['', '', '', ''], answer: 0, solution: '' })
  const [editDifficulty, setEditDifficulty] = useState<Difficulty>(2)
  const [editCategory, setEditCategory] = useState('')
  const [saving, setSaving] = useState(false)
  const [governanceDetail, setGovernanceDetail] = useState<GovernanceRevisionDetail | null>(null)
  const [editSource, setEditSource] = useState<EditSource>(EMPTY_SOURCE)
  const [sourceRightsAcknowledged, setSourceRightsAcknowledged] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [editOutcomeOptions, setEditOutcomeOptions] = useState<OutcomeOption[]>([])
  const [editOutcomeId, setEditOutcomeId] = useState('')
  const [outcomesLoading, setOutcomesLoading] = useState(false)
  const [outcomeCatalogState, setOutcomeCatalogState] = useState<'idle' | 'loading' | 'ready' | 'failed'>('idle')
  const editRequestRef = useRef<AbortController | null>(null)
  const [notice, setNotice] = useState('')

  const fetchQuestions = useCallback(async () => {
    setLoading(true)
    try {
      // admin_view=1 admin projeksiyonunu (pasif sorular + cevap anahtari) acikca
      // ister. Parametresiz cagrilar oyun yuzeyi sayilir ve bilet alir (#1530).
      const params = new URLSearchParams({ page: String(page), limit: '20', admin_view: '1' })
      if (filterGame !== 'all') params.set('game', filterGame)
      if (filterActive === 'active') params.set('active', 'true')
      if (filterActive === 'inactive') params.set('active', 'false')
      if (search.length >= 2) params.set('search', search)

      const res = await fetch(`/api/questions?${params}`)
      if (!res.ok) throw new Error('Sorular yuklenemedi')
      const data = await res.json()
      setQuestions(data.questions ?? [])
      setTotal(data.total ?? 0)
    } catch (err) {
      console.error('Soru yukleme hatasi:', err)
    } finally {
      setLoading(false)
    }
  }, [page, filterGame, filterActive, search])

  // Debounce arama — 500ms bekle
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput)
      setPage(1)
    }, 500)
    return () => clearTimeout(timer)
  }, [searchInput])

  useEffect(() => {
    const timer = window.setTimeout(() => void fetchQuestions(), 0)
    return () => window.clearTimeout(timer)
  }, [fetchQuestions])

  // Legacy yayin revizyonlarinin cogunda outcomes=[] olabilir. Kategoriye ve,
  // varsa, sinav kapsamına uyan aktif leaf'leri getirip editorden acik bir
  // akademik secim isteriz; kategori adindan sessiz otomatik backfill yapmayiz.
  useEffect(() => {
    if (!editQ || !governanceDetail || !editCategory.trim()) {
      setEditOutcomeOptions([])
      setOutcomesLoading(false)
      setOutcomeCatalogState('idle')
      return
    }

    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      setOutcomesLoading(true)
      setOutcomeCatalogState('loading')
      const game = typeof governanceDetail.metadata.game === 'string'
        ? governanceDetail.metadata.game
        : editQ.game
      const examRef = typeof governanceDetail.metadata.examRef === 'string'
        ? governanceDetail.metadata.examRef
        : null
      const params = new URLSearchParams({ game, category: editCategory.trim() })
      if (examRef) params.set('examRef', examRef)

      try {
        const response = await fetch(`/api/admin/content-quality/outcomes?${params}`, {
          cache: 'no-store', signal: controller.signal,
        })
        if (!response.ok) throw new Error('outcomes_unavailable')
        const body = await response.json()
        const options = (body.outcomes ?? []) as OutcomeOption[]
        setEditOutcomeOptions(options)
        setEditOutcomeId((current) => options.some((option) => option.id === current) ? current : '')
        setOutcomeCatalogState('ready')
      } catch {
        if (!controller.signal.aborted) {
          setEditOutcomeOptions([])
          setEditOutcomeId('')
          setNotice('Bu kapsam için kazanım kataloğu alınamadı; taslak oluşturulmadı.')
          setOutcomeCatalogState('failed')
        }
      } finally {
        if (!controller.signal.aborted) setOutcomesLoading(false)
      }
    }, 250)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [editQ, governanceDetail, editCategory])

  // Server-side arama — client filtreye gerek yok
  const filtered = questions

  const toggleActive = async (id: string) => {
    const question = questions.find((q) => q.id === id)
    if (!question) return

    setNotice('')
    try {
      if (question.is_active) {
        const quarantine = await fetch(`/api/admin/content-quality/questions/${id}/quarantine`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: 'Soru yönetimi ekranından acil görünürlük kapatma', requestId: crypto.randomUUID() }),
        })
        if (quarantine.ok) {
          setQuestions((prev) => prev.map((item) => item.id === id ? { ...item, is_active: false } : item))
          setNotice('Soru karantinaya alındı.')
          return
        }
        const body = await quarantine.json().catch(() => ({}))
        throw new Error(quarantine.status === 503
          ? 'Karantina hizmeti geçici olarak kullanılamıyor; soru güvenli biçimde değiştirilmedi.'
          : (body.error ?? 'Soru karantinaya alınamadı'))
      }
      setNotice('Pasif soru yalnız iki aşamalı onaylı revizyon yayınlanarak etkinleştirilebilir.')
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : 'Durum güncellenemedi')
    }
  }

  const openEdit = async (q: Question) => {
    editRequestRef.current?.abort()
    const controller = new AbortController()
    editRequestRef.current = controller
    setNotice('')
    setGovernanceDetail(null)
    setEditSource(EMPTY_SOURCE)
    setSourceRightsAcknowledged(false)
    setEditOutcomeOptions([])
    setEditOutcomeId('')
    setOutcomeCatalogState('idle')
    setEditQ(q)
    setEditContent({
      question: q.content.question || q.content.sentence || '',
      options: [...q.content.options],
      answer: q.content.answer ?? (q.content as unknown as { correct?: number }).correct ?? 0,
      solution: q.content.solution || '',
    })
    setEditDifficulty(q.difficulty)
    setEditCategory(q.category)
    setDetailLoading(true)
    try {
      const response = await fetch(`/api/admin/content-quality?questionId=${encodeURIComponent(q.id)}`, {
        cache: 'no-store', signal: controller.signal,
      })
      if (controller.signal.aborted || editRequestRef.current !== controller) return
      if (response.ok) {
        const data = await response.json()
        if (controller.signal.aborted || editRequestRef.current !== controller) return
        const detail = (data.revision ?? null) as GovernanceRevisionDetail | null
        if (!detail) {
          setEditQ(null)
          setNotice('Yayın revizyonu bulunamadı; soru güvenli biçimde değiştirilmedi.')
          return
        }
        setOutcomesLoading(true)
        setGovernanceDetail(detail)
        setEditSource(editSourceFromDetail(detail.source))
        // Legacy provenance can only be upgraded through an explicit human
        // rights/source attestation.  The checkbox is intentionally reset on
        // every open, so an earlier question cannot carry approval forward.
        setSourceRightsAcknowledged(false)
        setEditOutcomeId(detail?.outcomes.find((outcome) => outcome.primary)?.outcomeId ?? '')
      } else {
        setEditQ(null)
        setNotice(response.status === 503
          ? 'İçerik yönetişimi geçici olarak kullanılamıyor; soru güvenli biçimde değiştirilmedi.'
          : 'Yayın revizyonu alınamadı; düzenleme taslağı oluşturulamaz.')
      }
    } catch {
      if (controller.signal.aborted) return
      setEditQ(null)
      setNotice('Yayın revizyonu alınamadı; soru güvenli biçimde değiştirilmedi.')
    } finally {
      if (editRequestRef.current === controller) {
        editRequestRef.current = null
        setDetailLoading(false)
      }
    }
  }

  const saveEdit = async () => {
    if (!editQ) return
    if (!governanceDetail) {
      setNotice('Yayın revizyonu alınmadan düzenleme taslağı oluşturulamaz.')
      return
    }
    const nextCategory = editCategory.trim()
    if (!nextCategory) {
      setNotice('Kategori boş bırakılamaz.')
      return
    }
    const selectedOutcome = editOutcomeOptions.find((outcome) => outcome.id === editOutcomeId)
    const source = sourcePayload(editSource)
    const isTytSocial = governanceDetail.metadata.game === 'sosyal'
      && String(governanceDetail.metadata.examRef ?? '').toUpperCase() === 'TYT'
    const legacyUpgrade = isLegacySourceDetail(governanceDetail)
    if (!source.title || !source.licenseCode) {
      setNotice('Kaynak başlığı ve lisans kodu zorunludur.')
      return
    }
    if (!isHttpsUrl(editSource.url) || !isHttpsUrl(editSource.licenseUrl)) {
      setNotice('Kaynak ve lisans URL adresleri https:// ile başlamalıdır.')
      return
    }
    if (legacyUpgrade && !sourceRightsAcknowledged) {
      setNotice('Legacy kaynak için “kaynak ve kullanım hakkını doğruladım” onayı zorunludur.')
      return
    }
    if (isTytSocial && (!source.provenanceRef || /^legacy:/i.test(source.provenanceRef))) {
      setNotice('TYT Sosyal sorularında legacy olmayan provenanceRef zorunludur.')
      return
    }
    if (outcomeCatalogState !== 'ready') {
      setNotice('Kazanım kataloğu doğrulanmadan taslak oluşturulamaz.')
      return
    }
    if (editOutcomeOptions.length > 0 && !selectedOutcome) {
      setNotice('Taslak için kapsamla eşleşen birincil kazanımı seçin.')
      return
    }
    setSaving(true)
    try {
      const updates = {
        content: {
          question: editContent.question,
          options: editContent.options,
          answer: editContent.answer,
          solution: editContent.solution || undefined,
        },
        difficulty: editDifficulty,
        category: nextCategory,
      }
      const preserved = Object.fromEntries(
        ['explanation', 'hint', 'sentence', 'passage', 'context', 'type']
          .filter((key) => governanceDetail?.content[key] !== undefined)
          .map((key) => [key, governanceDetail!.content[key]]),
      )
      // Detail responses deliberately include reviewer-facing catalog evidence
      // (code/title/path/scopeValid). The write contract is narrower: never
      // reflect those enriched fields back into the governance RPC payload.
      const existingOutcomes = governanceDetail.outcomes.map(({ outcomeId, weight, primary }) => ({
        outcomeId, weight, primary,
      }))
      const priorExamRef = typeof governanceDetail.metadata.examRef === 'string'
        ? governanceDetail.metadata.examRef
        : null
      const priorCategory = typeof governanceDetail.metadata.category === 'string'
        ? governanceDetail.metadata.category
        : editQ.category
      const nextExamRef = selectedOutcome ? selectedOutcome.examRef : priorExamRef
      const scopeChanged = priorCategory !== nextCategory
        || priorExamRef !== nextExamRef
      const scopeChangeSummary = [
        priorCategory !== nextCategory ? `Kategori: ${priorCategory} -> ${nextCategory}` : null,
        priorExamRef !== nextExamRef ? `Sınav kapsamı: ${priorExamRef ?? 'genel'} -> ${nextExamRef ?? 'genel'}` : null,
      ].filter(Boolean).join('; ')
      const selectedExisting = existingOutcomes.find((outcome) => outcome.outcomeId === editOutcomeId)

      // The compact question editor cannot safely reconstruct a multi-outcome
      // evidence set after an academic scope change. Preserve/promote within
      // the existing set, but fail closed instead of silently deleting
      // secondary mappings.
      if (existingOutcomes.length > 1 && (scopeChanged || !selectedExisting)) {
        setNotice('Bu soruda birden fazla kazanım var. Bu basit editör kapsamı veya kazanım kümesini güvenle değiştiremez; mevcut eşlemeler korunarak taslak oluşturulmadı.')
        return
      }

      const revisionOutcomes = !scopeChanged && selectedExisting
        ? existingOutcomes.map((outcome) => ({
            ...outcome,
            primary: outcome.outcomeId === selectedExisting.outcomeId,
          }))
        : selectedOutcome
          ? [{ outcomeId: selectedOutcome.id, weight: 1, primary: true }]
          : []
      const res = await fetch('/api/admin/content-quality/revisions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questionId: editQ.id,
          baseRevisionId: governanceDetail.revisionId,
          requestId: crypto.randomUUID(),
          payload: {
            content: { ...preserved, ...updates.content },
            metadata: {
              ...governanceDetail.metadata,
              category: nextCategory,
              difficulty: editDifficulty,
              ...(selectedOutcome ? { examRef: selectedOutcome.examRef } : {}),
            },
            outcomes: revisionOutcomes,
            source,
            changeKind: 'edit',
            summary: [
              scopeChanged
                ? `Soru yönetimi ekranından içerik düzenleme taslağı oluşturuldu. ${scopeChangeSummary}.`
                : 'Soru yönetimi ekranından içerik düzenleme taslağı oluşturuldu.',
              legacyUpgrade ? 'Kaynak ve kullanım hakkı insan tarafından doğrulandı.' : null,
            ].filter(Boolean).join(' '),
          },
        }),
      })
      if (res.ok) {
        setNotice(revisionOutcomes.length === 0
          ? 'Düzenleme taslağı güvenle kaydedildi; kazanım eşlemesi yapılana kadar 2. aşama ve yayın kapalı.'
          : 'Düzenleme taslağı oluşturuldu; yayın için iki bağımsız onay bekliyor.')
        setEditQ(null)
      } else {
        const body = await res.json().catch(() => ({}))
        setNotice(body.error ?? 'Düzenleme kaydedilemedi.')
      }
    } catch (err) {
      console.error('Soru kaydetme hatasi:', err)
    } finally {
      setSaving(false)
    }
  }

  const difficultyLabel = (d: Difficulty) => {
    const labels: Record<number, string> = { 1: 'Kolay', 2: 'Orta', 3: 'Zor', 4: 'Cok Zor', 5: 'Uzman' }
    return labels[d] || String(d)
  }

  const difficultyColor = (d: Difficulty) => {
    const colors: Record<number, string> = { 1: 'var(--growth)', 2: 'var(--focus)', 3: 'var(--reward)', 4: 'var(--urgency)', 5: '#DC2626' }
    return colors[d] || 'var(--text-sub)'
  }

  const totalPages = Math.ceil(total / 20)

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Soru Yonetimi</h1>
          {/* `total` filtreli sonuc sayisidir (search_questions total_count),
              bankanin tamami degil. "kayitli" etiketi filtre aciktayken
              yaniltiyordu: "Pasif" secildiginde 4409 soruluk bankada "64 soru
              kayitli" yaziyordu. */}
          <p className="text-sm text-[var(--text-sub)]">
            {filterGame === 'all' && filterActive === 'all' && !search
              ? `${total} soru kayitli`
              : `Filtreye uyan: ${total} soru`}
          </p>
        </div>
      </div>

      {/* AI Soru Uretici */}
      <AIQuestionGenerator onGenerated={() => {
        setFilterActive('inactive')
        setPage(1)
        // State guncellendikten sonra fetch tetiklenecek (useEffect dependency)
        // Ek olarak 500ms sonra tekrar fetch yap (race condition onlemi)
        setTimeout(() => fetchQuestions(), 500)
      }} />

      {notice && <p role="status" className="mb-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs text-[var(--text-sub)]">{notice}</p>}

      {/* Filtreler */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Soru ara..."
          className="w-64 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs focus:border-[var(--focus)] focus:outline-none"
        />

        <select
          value={filterGame}
          onChange={(e) => { setFilterGame(e.target.value as GameSlug | 'all'); setPage(1) }}
          className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs focus:border-[var(--focus)] focus:outline-none"
        >
          <option value="all">Tum Oyunlar</option>
          {GAME_SLUGS.map((slug) => (
            <option key={slug} value={slug}>{GAMES[slug].name}</option>
          ))}
        </select>

        <select
          value={filterActive}
          onChange={(e) => { setFilterActive(e.target.value as 'all' | 'active' | 'inactive'); setPage(1) }}
          className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs focus:border-[var(--focus)] focus:outline-none"
        >
          <option value="all">Tum Durum</option>
          <option value="active">Aktif</option>
          <option value="inactive">Pasif</option>
        </select>

        <span className="text-xs text-[var(--text-sub)]">{filtered.length} sonuc</span>
      </div>

      {/* Tablo */}
      <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card-bg)]">
        {loading ? (
          <div className="flex flex-col gap-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-[var(--border)]" />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-xs">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--surface)]">
                <th className="px-4 py-3 font-bold text-[var(--text-sub)]">Soru</th>
                <th className="px-3 py-3 font-bold text-[var(--text-sub)]">Oyun</th>
                <th className="px-3 py-3 font-bold text-[var(--text-sub)]">Zorluk</th>
                <th className="px-3 py-3 font-bold text-[var(--text-sub)] text-right">Oynanma</th>
                <th className="px-3 py-3 font-bold text-[var(--text-sub)] text-right">Basari</th>
                <th className="px-3 py-3 font-bold text-[var(--text-sub)] text-center">Durum</th>
                <th className="px-2 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((q) => (
                <tr key={q.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface)] transition-colors">
                  <td className="max-w-[300px] truncate px-4 py-3">
                    <div className="font-medium">{stripRichText(q.content.question)}</div>
                    <div className="mt-0.5 text-[10px] text-[var(--text-sub)]">
                      {q.category}{q.subcategory ? ` / ${q.subcategory}` : ''}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    {GAMES[q.game] && (
                      <span
                        className="rounded-md px-2 py-0.5 text-[10px] font-bold"
                        style={{
                          backgroundColor: `color-mix(in srgb, ${GAMES[q.game].colorHex} 12%, transparent)`,
                          color: GAMES[q.game].colorHex,
                        }}
                      >
                        {GAMES[q.game].name}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <span className="font-bold" style={{ color: difficultyColor(q.difficulty) }}>
                      {difficultyLabel(q.difficulty)}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right font-mono">{q.times_answered}</td>
                  <td className="px-3 py-3 text-right">
                    {(() => {
                      const pct = q.times_answered > 0 ? Math.round((q.times_correct / q.times_answered) * 100) : 0
                      return (
                        <span
                          className="font-bold"
                          style={{ color: pct >= 60 ? 'var(--growth)' : pct >= 40 ? 'var(--reward)' : 'var(--urgency)' }}
                        >
                          %{pct}
                        </span>
                      )
                    })()}
                  </td>
                  <td className="px-3 py-3 text-center">
                    <button
                      onClick={() => toggleActive(q.id)}
                      className={`min-h-11 rounded-full px-3 py-1 text-[10px] font-bold transition-colors ${
                        q.is_active
                          ? 'bg-[var(--growth-bg)] text-[var(--growth)]'
                          : 'bg-[var(--surface)] text-[var(--text-sub)]'
                      }`}
                    >
                      {q.is_active ? 'Aktif' : 'Pasif'}
                    </button>
                  </td>
                  <td className="px-2 py-3">
                    <button
                      onClick={() => void openEdit(q)}
                      className="min-h-11 rounded-lg px-2 py-1 text-[10px] font-bold text-[var(--focus)] transition-colors hover:bg-[var(--focus-bg)]"
                    >
                      Duzenle
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="py-12 text-center text-sm text-[var(--text-sub)]">
            Sonuc bulunamadi
          </div>
        )}
      </div>

      {/* Sayfalama */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-bold transition-colors hover:bg-[var(--surface)] disabled:opacity-40"
          >
            ← Onceki
          </button>
          <span className="text-xs text-[var(--text-sub)]">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-bold transition-colors hover:bg-[var(--surface)] disabled:opacity-40"
          >
            Sonraki →
          </button>
        </div>
      )}

      {/* Edit Modal */}
      {editQ && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold">Soru Duzenle</h2>
              <button onClick={() => setEditQ(null)} className="text-lg text-[var(--text-sub)] hover:text-[var(--text)]">
                ✕
              </button>
            </div>

            {/* Soru metni */}
            <label className="mb-1 block text-[11px] font-bold text-[var(--text-sub)]">Soru</label>
            <textarea
              value={editContent.question}
              onChange={(e) => setEditContent(c => ({ ...c, question: e.target.value }))}
              rows={3}
              className="mb-3 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs focus:border-[var(--focus)] focus:outline-none"
            />

            {/* Secenekler */}
            <label className="mb-1 block text-[11px] font-bold text-[var(--text-sub)]">Secenekler</label>
            {editContent.options.map((opt, i) => (
              <div key={i} className="mb-1.5 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEditContent(c => ({ ...c, answer: i }))}
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                    editContent.answer === i
                      ? 'bg-[var(--growth)] text-white'
                      : 'border border-[var(--border)] text-[var(--text-sub)]'
                  }`}
                  title={editContent.answer === i ? 'Doğru cevap' : 'Doğru olarak işaretle'}
                >
                  {'ABCDE'[i]}
                </button>
                <input
                  value={opt}
                  onChange={(e) => {
                    const newOpts = [...editContent.options]
                    newOpts[i] = e.target.value
                    setEditContent(c => ({ ...c, options: newOpts }))
                  }}
                  className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs focus:border-[var(--focus)] focus:outline-none"
                />
              </div>
            ))}

            {/* Cozum */}
            <label className="mb-1 mt-3 block text-[11px] font-bold text-[var(--text-sub)]">Cozum (opsiyonel)</label>
            <textarea
              value={editContent.solution}
              onChange={(e) => setEditContent(c => ({ ...c, solution: e.target.value }))}
              rows={2}
              className="mb-3 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs focus:border-[var(--focus)] focus:outline-none"
            />

            {/* Zorluk + Kategori */}
            <div className="mb-4 flex gap-3">
              <div className="flex-1">
                <label className="mb-1 block text-[11px] font-bold text-[var(--text-sub)]">Zorluk</label>
                <select
                  value={editDifficulty}
                  onChange={(e) => setEditDifficulty(Number(e.target.value) as Difficulty)}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs focus:border-[var(--focus)] focus:outline-none"
                >
                  {[1, 2, 3, 4, 5].map(d => (
                    <option key={d} value={d}>{difficultyLabel(d as Difficulty)} ({d})</option>
                  ))}
                </select>
              </div>
              <div className="flex-1">
                <label htmlFor="edit-category" className="mb-1 block text-[11px] font-bold text-[var(--text-sub)]">Kategori</label>
                <input
                  id="edit-category"
                  value={editCategory}
                  onChange={(e) => { setEditCategory(e.target.value); setEditOutcomeId('') }}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs focus:border-[var(--focus)] focus:outline-none"
                />
              </div>
            </div>

            {governanceDetail && (
              <div className="mb-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
                <h3 className="mb-2 text-[11px] font-bold text-[var(--text-sub)]">Kaynak ve kullanım hakkı</h3>
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="text-[10px] font-bold text-[var(--text-sub)]">
                    Kaynak türü
                    <select
                      aria-label="Kaynak türü"
                      value={editSource.kind}
                      onChange={(event) => {
                        setEditSource((current) => ({ ...current, kind: event.target.value as SourceKind }))
                        setSourceRightsAcknowledged(false)
                      }}
                      className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs font-normal focus:border-[var(--focus)] focus:outline-none"
                    >
                      <option value="original">Özgün içerik</option>
                      <option value="licensed">Lisanslı</option>
                      <option value="public_domain">Kamu malı</option>
                      <option value="user_generated">Kullanıcı üretimi</option>
                      <option value="official_exam">Resmî sınav</option>
                    </select>
                  </label>
                  <label className="text-[10px] font-bold text-[var(--text-sub)]">
                    Kaynak başlığı
                    <input aria-label="Kaynak başlığı" value={editSource.title} onChange={(event) => { setEditSource((current) => ({ ...current, title: event.target.value })); setSourceRightsAcknowledged(false) }} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs font-normal focus:border-[var(--focus)] focus:outline-none" />
                  </label>
                  <label className="text-[10px] font-bold text-[var(--text-sub)]">
                    Kaynak URL (https)
                    <input aria-label="Kaynak URL" type="url" value={editSource.url} onChange={(event) => { setEditSource((current) => ({ ...current, url: event.target.value })); setSourceRightsAcknowledged(false) }} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs font-normal focus:border-[var(--focus)] focus:outline-none" />
                  </label>
                  <label className="text-[10px] font-bold text-[var(--text-sub)]">
                    Lisans kodu
                    <input aria-label="Lisans kodu" value={editSource.licenseCode} onChange={(event) => { setEditSource((current) => ({ ...current, licenseCode: event.target.value })); setSourceRightsAcknowledged(false) }} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs font-normal focus:border-[var(--focus)] focus:outline-none" />
                  </label>
                  <label className="text-[10px] font-bold text-[var(--text-sub)]">
                    Lisans URL (https)
                    <input aria-label="Lisans URL" type="url" value={editSource.licenseUrl} onChange={(event) => { setEditSource((current) => ({ ...current, licenseUrl: event.target.value })); setSourceRightsAcknowledged(false) }} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs font-normal focus:border-[var(--focus)] focus:outline-none" />
                  </label>
                  <label className="text-[10px] font-bold text-[var(--text-sub)]">
                    Provenance referansı
                    <input aria-label="Provenance referansı" value={editSource.provenanceRef} onChange={(event) => { setEditSource((current) => ({ ...current, provenanceRef: event.target.value })); setSourceRightsAcknowledged(false) }} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs font-normal focus:border-[var(--focus)] focus:outline-none" />
                  </label>
                </div>
                <label className="mt-2 block text-[10px] font-bold text-[var(--text-sub)]">
                  Atıf
                  <textarea aria-label="Atıf" rows={2} value={editSource.attribution} onChange={(event) => { setEditSource((current) => ({ ...current, attribution: event.target.value })); setSourceRightsAcknowledged(false) }} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs font-normal focus:border-[var(--focus)] focus:outline-none" />
                </label>
                {isLegacySourceDetail(governanceDetail) && (
                  <label className="mt-3 flex items-start gap-2 rounded-md border border-[var(--reward-border)] bg-[var(--reward-bg)] p-2 text-[10px] font-bold text-[var(--text)]">
                    <input
                      type="checkbox"
                      checked={sourceRightsAcknowledged}
                      onChange={(event) => setSourceRightsAcknowledged(event.target.checked)}
                      className="mt-0.5 h-4 w-4 shrink-0"
                    />
                    <span>Kaynak ve kullanım hakkını doğruladım. Bu onay kaynak alanlarından biri değiştiğinde sıfırlanır.</span>
                  </label>
                )}
                {governanceDetail.metadata.game === 'sosyal'
                  && String(governanceDetail.metadata.examRef ?? '').toUpperCase() === 'TYT' && (
                  <p className="mt-2 text-[10px] text-[var(--text-sub)]">TYT Sosyal kapsamı için legacy olmayan bir provenance referansı zorunludur.</p>
                )}
              </div>
            )}

            {governanceDetail && (
              <div className="mb-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
                <label className="mb-1 block text-[11px] font-bold text-[var(--text-sub)]" htmlFor="edit-primary-outcome">
                  Birincil kazanım
                </label>
                <select
                  id="edit-primary-outcome"
                  value={editOutcomeId}
                  onChange={(event) => setEditOutcomeId(event.target.value)}
                  disabled={outcomesLoading}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs focus:border-[var(--focus)] focus:outline-none disabled:opacity-60"
                >
                  <option value="">Kazanımı doğrulayarak seçin</option>
                  {editOutcomeOptions.map((outcome) => (
                    <option key={outcome.id} value={outcome.id}>
                      {outcome.code} — {outcome.title} ({outcome.examRef ?? 'genel'})
                    </option>
                  ))}
                </select>
                {outcomesLoading ? (
                  <p className="mt-1 text-[10px] text-[var(--text-sub)]">Kapsam doğrulanıyor…</p>
                ) : outcomeCatalogState === 'failed' ? (
                  <p className="mt-1 text-[10px] text-[var(--urgency)]">
                    Katalog doğrulanamadı; güvenlik gereği taslak oluşturulamaz.
                  </p>
                ) : editOutcomeOptions.length === 0 ? (
                  <p className="mt-1 text-[10px] text-[var(--urgency)]">
                    Bu kapsam için aktif kazanım yok. Düzeltme taslak olarak saklanabilir; kazanım eklenene kadar 2. aşama ve yayın kapalı kalır.
                  </p>
                ) : (
                  <p className="mt-1 text-[10px] text-[var(--text-sub)]">
                    Seçim insan onayıdır; kategori adı kazanım kanıtı olarak otomatik atanmaz.
                  </p>
                )}
                {(() => {
                  const selected = editOutcomeOptions.find((outcome) => outcome.id === editOutcomeId)
                  const priorExam = typeof governanceDetail.metadata.examRef === 'string'
                    ? governanceDetail.metadata.examRef
                    : null
                  const priorCategory = typeof governanceDetail.metadata.category === 'string'
                    ? governanceDetail.metadata.category
                    : editQ.category
                  const nextCategory = editCategory.trim()
                  const changes = [
                    priorCategory !== nextCategory ? `kategori ${priorCategory} → ${nextCategory}` : null,
                    selected && selected.examRef !== priorExam ? `sınav ${priorExam ?? 'genel'} → ${selected.examRef ?? 'genel'}` : null,
                  ].filter(Boolean)
                  return changes.length > 0 ? (
                    <p role="status" className="mt-2 rounded-md border border-[var(--reward-border)] bg-[var(--reward-bg)] p-2 text-[10px] font-bold">
                      Kapsam değişikliği: {changes.join('; ')}. Bu değişiklik revizyon özetinde bağımsız inceleyiciye gösterilecek.
                    </p>
                  ) : null
                })()}
              </div>
            )}

            {/* Butonlar */}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setEditQ(null)}
                className="rounded-lg border border-[var(--border)] px-4 py-2 text-xs font-bold text-[var(--text-sub)] transition-colors hover:bg-[var(--surface)]"
              >
                Iptal
              </button>
              <button
                onClick={saveEdit}
                disabled={saving || detailLoading || outcomesLoading || (!!governanceDetail && outcomeCatalogState !== 'ready') || !editContent.question.trim() || (!!governanceDetail && editOutcomeOptions.length > 0 && !editOutcomeOptions.some((outcome) => outcome.id === editOutcomeId))}
                className="rounded-lg bg-[var(--focus)] px-4 py-2 text-xs font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {saving ? 'Kaydediliyor...' : detailLoading ? 'Revizyon okunuyor…' : governanceDetail && outcomeCatalogState === 'ready' && editOutcomeOptions.length === 0 ? 'Kazanım Bekleyen Taslağı Kaydet' : governanceDetail ? 'Taslak Oluştur' : 'Kaydet'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
