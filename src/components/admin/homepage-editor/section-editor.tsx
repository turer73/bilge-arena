'use client'

import { useHomepageEditorStore } from '@/stores/homepage-editor-store'
import type { HomepageSection } from '@/types/database'
import { useCallback } from 'react'

/* ─── Ortak input bileşenleri ─────────────────────────── */

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="block text-xs font-semibold text-[var(--text-sub)] uppercase tracking-wide mb-1">{children}</label>
}

function TextInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 text-sm rounded-xl border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] placeholder:text-[var(--text-sub)]/50 focus:outline-none focus:border-[var(--focus-border)] focus:ring-1 focus:ring-[var(--focus-border)] transition-all"
      />
    </div>
  )
}

function TextArea({
  label,
  value,
  onChange,
  rows = 3,
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  rows?: number
  placeholder?: string
}) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        className="w-full px-3 py-2 text-sm rounded-xl border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] placeholder:text-[var(--text-sub)]/50 focus:outline-none focus:border-[var(--focus-border)] focus:ring-1 focus:ring-[var(--focus-border)] transition-all resize-y"
      />
    </div>
  )
}

function SectionGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-3 p-4 rounded-xl border border-[var(--border)] bg-[var(--bg)]">
      <legend className="font-display text-sm font-bold text-[var(--text)] px-2">{title}</legend>
      {children}
    </fieldset>
  )
}

/* ─── Bölüm Editörleri ────────────────────────────────── */

function HeroEditor({ config, update }: EditorProps) {
  const c = config as Record<string, unknown>
  const heading = (c.heading as string[]) || ['', '', '']
  const ctaPrimary = (c.cta_primary as Record<string, string>) || { text: '', href: '' }
  const ctaSecondary = (c.cta_secondary as Record<string, string>) || { text: '', href: '' }
  const miniStats = (c.mini_stats as string[]) || ['', '', '']
  const floatCards = (c.float_cards as Array<{ val: string; label: string }>) || [
    { val: '', label: '' },
    { val: '', label: '' },
    { val: '', label: '' },
    { val: '', label: '' },
  ]

  return (
    <div className="space-y-4">
      <TextInput label="Rozet Metni" value={(c.badge as string) || ''} onChange={(v) => update({ ...c, badge: v })} />
      <SectionGroup title="Başlık (3 satır)">
        {heading.map((line: string, i: number) => (
          <TextInput
            key={i}
            label={`Satır ${i + 1}`}
            value={line}
            onChange={(v) => {
              const next = [...heading]
              next[i] = v
              update({ ...c, heading: next })
            }}
          />
        ))}
      </SectionGroup>
      <TextArea label="Alt Başlık" value={(c.subheading as string) || ''} onChange={(v) => update({ ...c, subheading: v })} />
      <TextInput label="Logo URL" value={(c.logo_url as string) || ''} onChange={(v) => update({ ...c, logo_url: v })} />
      <SectionGroup title="Birincil CTA">
        <TextInput label="Buton Metni" value={ctaPrimary.text} onChange={(v) => update({ ...c, cta_primary: { ...ctaPrimary, text: v } })} />
        <TextInput label="Bağlantı" value={ctaPrimary.href} onChange={(v) => update({ ...c, cta_primary: { ...ctaPrimary, href: v } })} />
      </SectionGroup>
      <SectionGroup title="İkincil CTA">
        <TextInput label="Buton Metni" value={ctaSecondary.text} onChange={(v) => update({ ...c, cta_secondary: { ...ctaSecondary, text: v } })} />
        <TextInput label="Bağlantı" value={ctaSecondary.href} onChange={(v) => update({ ...c, cta_secondary: { ...ctaSecondary, href: v } })} />
      </SectionGroup>
      <SectionGroup title="Mini İstatistikler (3 adet)">
        {miniStats.map((stat: string, i: number) => (
          <TextInput
            key={i}
            label={`İstatistik ${i + 1}`}
            value={stat}
            onChange={(v) => {
              const next = [...miniStats]
              next[i] = v
              update({ ...c, mini_stats: next })
            }}
          />
        ))}
      </SectionGroup>
      <SectionGroup title="Kayan Kartlar (4 adet)">
        {floatCards.map((card: { val: string; label: string }, i: number) => (
          <div key={i} className="grid grid-cols-2 gap-2">
            <TextInput
              label={`Kart ${i + 1} — Değer`}
              value={card.val}
              onChange={(v) => {
                const next = [...floatCards]
                next[i] = { ...next[i], val: v }
                update({ ...c, float_cards: next })
              }}
            />
            <TextInput
              label={`Kart ${i + 1} — Etiket`}
              value={card.label}
              onChange={(v) => {
                const next = [...floatCards]
                next[i] = { ...next[i], label: v }
                update({ ...c, float_cards: next })
              }}
            />
          </div>
        ))}
      </SectionGroup>
    </div>
  )
}

function StatsEditor({ config, update }: EditorProps) {
  const c = config as Record<string, unknown>
  const items = (c.items as Array<{ val: string; label: string }>) || [
    { val: '', label: '' },
    { val: '', label: '' },
    { val: '', label: '' },
    { val: '', label: '' },
  ]

  return (
    <SectionGroup title="İstatistik Öğeleri (4 adet)">
      {items.map((item: { val: string; label: string }, i: number) => (
        <div key={i} className="grid grid-cols-2 gap-2">
          <TextInput
            label={`Değer ${i + 1}`}
            value={item.val}
            onChange={(v) => {
              const next = [...items]
              next[i] = { ...next[i], val: v }
              update({ ...c, items: next })
            }}
          />
          <TextInput
            label={`Etiket ${i + 1}`}
            value={item.label}
            onChange={(v) => {
              const next = [...items]
              next[i] = { ...next[i], label: v }
              update({ ...c, items: next })
            }}
          />
        </div>
      ))}
    </SectionGroup>
  )
}

const GAME_KEYS = ['matematik', 'turkce', 'fen', 'sosyal', 'wordquest'] as const

function GamesEditor({ config, update }: EditorProps) {
  const c = config as Record<string, unknown>
  const games = (c.games as Array<{ name: string; desc: string; count: string }>) ||
    GAME_KEYS.map(() => ({ name: '', desc: '', count: '' }))

  return (
    <div className="space-y-4">
      <TextInput label="Başlık" value={(c.title as string) || ''} onChange={(v) => update({ ...c, title: v })} />
      <TextInput label="Alt Başlık" value={(c.subtitle as string) || ''} onChange={(v) => update({ ...c, subtitle: v })} />
      <SectionGroup title="Oyunlar">
        {games.map((game: { name: string; desc: string; count: string }, i: number) => (
          <div key={i} className="space-y-2 p-3 rounded-lg bg-[var(--surface)] border border-[var(--border)]">
            <p className="text-xs font-bold text-[var(--focus)] uppercase">{GAME_KEYS[i]}</p>
            <TextInput label="Ad" value={game.name} onChange={(v) => {
              const next = [...games]; next[i] = { ...next[i], name: v }; update({ ...c, games: next })
            }} />
            <TextInput label="Açıklama" value={game.desc} onChange={(v) => {
              const next = [...games]; next[i] = { ...next[i], desc: v }; update({ ...c, games: next })
            }} />
            <TextInput label="Soru Sayısı" value={game.count} onChange={(v) => {
              const next = [...games]; next[i] = { ...next[i], count: v }; update({ ...c, games: next })
            }} />
          </div>
        ))}
      </SectionGroup>
    </div>
  )
}

function HowItWorksEditor({ config, update }: EditorProps) {
  const c = config as Record<string, unknown>
  const steps = (c.steps as Array<{ title: string; description: string }>) || [
    { title: '', description: '' },
    { title: '', description: '' },
    { title: '', description: '' },
    { title: '', description: '' },
  ]

  return (
    <SectionGroup title="Adımlar (4 adet)">
      {steps.map((step: { title: string; description: string }, i: number) => (
        <div key={i} className="space-y-2 p-3 rounded-lg bg-[var(--surface)] border border-[var(--border)]">
          <p className="text-xs font-bold text-[var(--focus)]">Adım {i + 1}</p>
          <TextInput label="Başlık" value={step.title} onChange={(v) => {
            const next = [...steps]; next[i] = { ...next[i], title: v }; update({ ...c, steps: next })
          }} />
          <TextArea label="Açıklama" value={step.description} onChange={(v) => {
            const next = [...steps]; next[i] = { ...next[i], description: v }; update({ ...c, steps: next })
          }} rows={2} />
        </div>
      ))}
    </SectionGroup>
  )
}

function CtaEditor({ config, update }: EditorProps) {
  const c = config as Record<string, unknown>
  const trustItems = (c.trust_items as string[]) || ['', '', '']

  return (
    <div className="space-y-4">
      <TextInput label="Etiket" value={(c.label as string) || ''} onChange={(v) => update({ ...c, label: v })} />
      <TextInput label="Başlık" value={(c.heading as string) || ''} onChange={(v) => update({ ...c, heading: v })} />
      <TextArea label="Alt Başlık" value={(c.subheading as string) || ''} onChange={(v) => update({ ...c, subheading: v })} />
      <TextInput label="Buton Metni" value={(c.button_text as string) || ''} onChange={(v) => update({ ...c, button_text: v })} />
      <SectionGroup title="Güven Öğeleri (3 adet)">
        {trustItems.map((item: string, i: number) => (
          <TextInput
            key={i}
            label={`Öğe ${i + 1}`}
            value={item}
            onChange={(v) => {
              const next = [...trustItems]
              next[i] = v
              update({ ...c, trust_items: next })
            }}
          />
        ))}
      </SectionGroup>
    </div>
  )
}

function LeaderboardEditor({ config, update }: EditorProps) {
  const c = config as Record<string, unknown>
  return (
    <div className="space-y-4">
      <TextInput label="Bölüm Başlığı" value={(c.title as string) || ''} onChange={(v) => update({ ...c, title: v })} />
      <TextArea label="Açıklama" value={(c.description as string) || ''} onChange={(v) => update({ ...c, description: v })} />
      <TextInput label="Buton Metni" value={(c.button_text as string) || ''} onChange={(v) => update({ ...c, button_text: v })} />
    </div>
  )
}

function FooterEditor({ config, update }: EditorProps) {
  const c = config as Record<string, unknown>
  return (
    <div className="space-y-4">
      <TextArea label="Marka Açıklaması" value={(c.brand_description as string) || ''} onChange={(v) => update({ ...c, brand_description: v })} />
      <TextInput label="Telif Metni" value={(c.copyright as string) || ''} onChange={(v) => update({ ...c, copyright: v })} />
    </div>
  )
}

/* ─── Editor mapping ──────────────────────────────────── */

interface EditorProps {
  config: Record<string, unknown>
  update: (config: Record<string, unknown>) => void
}

const EDITORS: Record<HomepageSection, React.ComponentType<EditorProps>> = {
  hero: HeroEditor,
  stats: StatsEditor,
  games: GamesEditor,
  how_it_works: HowItWorksEditor,
  cta: CtaEditor,
  leaderboard: LeaderboardEditor,
  footer: FooterEditor,
}

const SECTION_TITLES: Record<HomepageSection, string> = {
  hero: 'Hero Bölümü',
  stats: 'İstatistikler',
  games: 'Oyunlar',
  how_it_works: 'Nasıl Çalışır',
  cta: 'Harekete Geç',
  leaderboard: 'Sıralama',
  footer: 'Alt Bilgi',
}

export function SectionEditor() {
  const activeSection = useHomepageEditorStore((s) => s.activeSection)
  const sections = useHomepageEditorStore((s) => s.sections)
  const updateSectionConfig = useHomepageEditorStore((s) => s.updateSectionConfig)

  const sectionData = (sections || {})[activeSection]
  const config = (sectionData?.config || {}) as Record<string, unknown>

  const handleUpdate = useCallback(
    (newConfig: Record<string, unknown>) => {
      updateSectionConfig(activeSection, newConfig)
    },
    [activeSection, updateSectionConfig]
  )

  const Editor = EDITORS[activeSection]

  return (
    <div className="space-y-4">
      <h3 className="font-display text-lg font-bold text-[var(--text)]">
        {SECTION_TITLES[activeSection]}
      </h3>
      <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1 scrollbar-thin">
        <Editor config={config} update={handleUpdate} />
      </div>
    </div>
  )
}
