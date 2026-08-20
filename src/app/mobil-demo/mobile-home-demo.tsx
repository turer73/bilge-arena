'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import {
  BookOpenText,
  Calculator,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Flame,
  FlaskConical,
  Gem,
  Globe2,
  Languages,
  Lightbulb,
  Lock,
  MessageCircle,
  Play,
  Settings,
  ShieldCheck,
  Sparkles,
  Star,
  Target,
  Trophy,
  X,
  type LucideIcon,
} from 'lucide-react'
import { BottomNav } from '@/components/layout/bottom-nav'

type SubjectId = 'matematik' | 'turkce' | 'fen' | 'sosyal' | 'ingilizce'

interface Subject {
  id: SubjectId
  label: string
  shortLabel: string
  icon: LucideIcon
  color: string
  shadow: string
  unit: string
  description: string
  topics: string[]
}

const SUBJECTS: Subject[] = [
  {
    id: 'matematik', label: 'Matematik', shortLabel: 'Mat', icon: Calculator,
    color: '#2563eb', shadow: '#1d4ed8', unit: 'TYT Matematik · Ünite 3',
    description: 'Temel kavramlardan problemlere ilerle',
    topics: ['Temel Kavramlar', 'Sayı Basamakları', 'Bölme ve Bölünebilme', 'EBOB · EKOK', 'Rasyonel Sayılar', 'Mini Ünite Sınavı'],
  },
  {
    id: 'turkce', label: 'Türkçe', shortLabel: 'Türkçe', icon: BookOpenText,
    color: '#f97316', shadow: '#ea580c', unit: 'TYT Türkçe · Ünite 2',
    description: 'Paragrafı hızla çöz, anlamı yakala',
    topics: ['Sözcükte Anlam', 'Cümlede Anlam', 'Paragrafın Yapısı', 'Ana Düşünce', 'Anlatım Teknikleri', 'Mini Ünite Sınavı'],
  },
  {
    id: 'fen', label: 'Fen Bilimleri', shortLabel: 'Fen', icon: FlaskConical,
    color: '#10b981', shadow: '#059669', unit: 'TYT Fen · Ünite 1',
    description: 'Fizik, kimya ve biyolojiyi keşfet',
    topics: ['Fizik Bilimine Giriş', 'Madde ve Özellikleri', 'Atomun Yapısı', 'Canlıların Ortak Özellikleri', 'Hücre', 'Mini Ünite Sınavı'],
  },
  {
    id: 'sosyal', label: 'Sosyal Bilimler', shortLabel: 'Sosyal', icon: Globe2,
    color: '#8b5cf6', shadow: '#7c3aed', unit: 'TYT Sosyal · Ünite 2',
    description: 'Tarih ve coğrafyada bağlantıları kur',
    topics: ['Tarih Bilimine Giriş', 'İlk Uygarlıklar', 'Harita Bilgisi', 'İklim Bilgisi', 'Felsefenin Konusu', 'Mini Ünite Sınavı'],
  },
  {
    id: 'ingilizce', label: 'İngilizce', shortLabel: 'YDT', icon: Languages,
    color: '#06b6d4', shadow: '#0891b2', unit: 'YDT İngilizce · Ünite 4',
    description: 'Kelime hazneni her gün biraz büyüt',
    topics: ['Daily Vocabulary', 'Phrasal Verbs', 'Tenses', 'Cloze Test', 'Reading Skills', 'Mini Ünite Sınavı'],
  },
]

const COACH_MESSAGES = [
  {
    eyebrow: 'Bugünkü rota',
    title: 'Hazırsın, Bilgin!',
    body: 'Bölme ve Bölünebilme için 10 soruluk kısa dersin hazır. Yaklaşık 4 dakikada tamamlayabilirsin.',
    icon: Sparkles,
    color: '#2563eb',
    tint: '#eff6ff',
  },
  {
    eyebrow: 'Mini taktik',
    title: 'Önce kuralı yakala',
    body: 'Soruyu çözmeden önce son basamaklara bak. Bölünebilme kuralları sana zaman kazandırır.',
    icon: Lightbulb,
    color: '#f59e0b',
    tint: '#fffbeb',
  },
  {
    eyebrow: 'Günlük hedef',
    title: 'Yalnızca 4 soru kaldı!',
    body: 'Bu dersi tamamladığında günlük hedefini geçip serini korumaya yaklaşacaksın.',
    icon: Target,
    color: '#16a34a',
    tint: '#f0fdf4',
  },
]

function Resource({ icon: Icon, value, color, label }: {
  icon: LucideIcon
  value: string | number
  color: string
  label: string
}) {
  return (
    <div aria-label={`${label}: ${value}`} className="flex min-h-11 items-center gap-1 text-sm font-black" style={{ color }}>
      <Icon aria-hidden="true" size={20} fill="currentColor" strokeWidth={2.7} />
      <span className="tabular-nums">{value}</span>
    </div>
  )
}

function PathStep({ index, topic, subject }: { index: number; topic: string; subject: Subject }) {
  const done = index < 2
  const current = index === 2
  const exam = index === 5
  const locked = index > 2
  const Icon = done ? Check : current ? Star : exam ? Trophy : locked ? Lock : BookOpenText
  const column = [1, 2, 2, 1, 1, 2][index]
  const row = Math.floor(index / 2) + 1

  return (
    <Link
      href={`/arena/${subject.id === 'ingilizce' ? 'wordquest' : subject.id}`}
      aria-label={`${topic} dersini aç`}
      className="group relative z-10 flex min-h-16 items-center gap-2 rounded-[18px] border-2 bg-white p-2 outline-none transition-transform active:translate-y-1 focus-visible:ring-4 focus-visible:ring-[#93c5fd]"
      style={{
        gridColumn: column,
        gridRow: row,
        borderColor: current ? subject.color : '#e5e7eb',
        background: current ? `${subject.color}0d` : '#fff',
        boxShadow: `0 4px 0 ${current ? subject.shadow : '#dfe3e7'}`,
      }}
    >
      <span
        className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] text-white"
        style={{ background: locked ? '#cbd0d6' : subject.color }}
      >
        <Icon aria-hidden="true" size={21} fill={current || exam ? 'currentColor' : 'none'} strokeWidth={3} />
        {done && <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-[#22c55e]"><Check size={10} strokeWidth={4} /></span>}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[9px] font-black uppercase tracking-[0.08em]" style={{ color: current ? subject.color : done ? '#22a45d' : '#9aa1a9' }}>
          {current ? 'Sıradaki' : done ? 'Tamamlandı' : exam ? 'Ünite sonu' : `${index + 1}. ders`}
        </span>
        <span className={`mt-0.5 block text-[11px] font-extrabold leading-[13px] ${locked ? 'text-[#7f8790]' : 'text-[#4b5157]'}`}>{topic}</span>
      </span>
    </Link>
  )
}

export function MobileHomeDemo() {
  const [subjectId, setSubjectId] = useState<SubjectId>('matematik')
  const [coachOpen, setCoachOpen] = useState(true)
  const [coachMessage, setCoachMessage] = useState(0)
  const subject = useMemo(() => SUBJECTS.find((item) => item.id === subjectId) ?? SUBJECTS[0], [subjectId])
  const gameHref = `/arena/${subject.id === 'ingilizce' ? 'wordquest' : subject.id}`
  const message = COACH_MESSAGES[coachMessage]
  const MessageIcon = message.icon
  const bubbleRadius = '30px 30px 30px 16px'

  useEffect(() => {
    if (!coachOpen) return

    const previousOverflow = document.body.style.overflow
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setCoachOpen(false)
    }

    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', closeOnEscape)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [coachOpen])

  const openCoach = () => {
    setCoachMessage(0)
    setCoachOpen(true)
  }

  return (
    <div className="min-h-[100dvh] bg-[#f7f8fa] pb-28 text-[#45494e] md:mx-auto md:max-w-[440px] md:border-x md:border-[#e5e7eb]">
      <style>{`html { scrollbar-width: none; } html::-webkit-scrollbar { display: none; } nextjs-portal { display: none !important; }`}</style>
      <header className="sticky top-0 z-30 border-b-2 border-[#eceff2] bg-white/95 backdrop-blur-xl">
        <div className="flex h-14 items-center justify-between px-3">
          <button aria-label="Sınav türünü değiştir" className="flex min-h-11 items-center gap-1 rounded-xl text-[#64748b]">
            <ShieldCheck size={24} fill="#dbeafe" className="text-[#2563eb]" strokeWidth={2.5} />
            <span className="text-xs font-black">TYT</span>
            <ChevronDown size={14} strokeWidth={3} />
          </button>
          <div className="flex items-center gap-4">
            <Resource icon={Flame} value={12} color="#f97316" label="Günlük seri" />
            <Resource icon={Gem} value="480" color="#06b6d4" label="Bilge puanı" />
            <Resource icon={Sparkles} value="2.3K" color="#8b5cf6" label="Toplam XP" />
          </div>
          <button aria-label="Ayarlar" className="flex h-11 w-9 items-center justify-center rounded-xl text-[#9aa1a9] active:bg-[#eef1f4]"><Settings size={20} strokeWidth={2.5} /></button>
        </div>
      </header>

      <main>
        <section aria-label="Ders seçimi" className="border-b-2 border-[#eceff2] bg-white px-3 py-2.5">
          <div className="scrollbar-none flex snap-x gap-2 overflow-x-auto pb-1">
            {SUBJECTS.map((item) => {
              const Icon = item.icon
              const active = item.id === subject.id
              return (
                <button
                  key={item.id}
                  onClick={() => setSubjectId(item.id)}
                  aria-pressed={active}
                  className="flex min-h-11 shrink-0 snap-start items-center gap-1.5 rounded-2xl border-2 px-3 text-xs font-extrabold active:scale-95"
                  style={{
                    color: active ? item.color : '#777f87', borderColor: active ? item.color : '#e5e7eb',
                    background: active ? `${item.color}10` : '#fff', boxShadow: active ? `0 3px 0 ${item.color}35` : '0 3px 0 #e5e7eb',
                  }}
                >
                  <Icon size={18} strokeWidth={2.7} />{item.shortLabel}
                </button>
              )
            })}
          </div>
        </section>

        <section className="px-4 pt-4">
          <div className="relative overflow-hidden rounded-[22px] p-4 text-white" style={{ background: `linear-gradient(135deg, ${subject.color}, ${subject.shadow})`, boxShadow: `0 6px 0 ${subject.shadow}` }}>
            <div className="pointer-events-none absolute -right-8 -top-14 h-32 w-32 rounded-full border-[22px] border-white/10" />
            <div className="relative flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.15em] text-white/75">{subject.unit}</p>
                <h1 className="mt-1 text-lg font-black leading-tight">{subject.label} Yolu</h1>
                <p className="mt-1 truncate text-[11px] font-semibold text-white/80">{subject.description}</p>
              </div>
              <span className="shrink-0 rounded-xl bg-black/15 px-2.5 py-1.5 text-xs font-black">2 / 6</span>
            </div>
            <div className="relative mt-3 h-2.5 overflow-hidden rounded-full bg-black/15 p-[2px]"><div className="h-full w-[38%] rounded-full bg-white" /></div>
          </div>
        </section>

        <section className="px-4 pt-4" aria-labelledby="continue-title">
          <div className="relative min-h-[180px] overflow-hidden rounded-[24px] border-2 border-[#e3e7eb] bg-white p-4 shadow-[0_6px_0_#e3e7eb]">
            <div className="relative z-10 max-w-[64%]">
              <div className="text-[10px] font-black uppercase tracking-[0.15em]" style={{ color: subject.color }}>Bugünkü ders</div>
              <h2 id="continue-title" className="mt-1 text-lg font-black leading-6 text-[#3f4449]">{subject.topics[2]}</h2>
              <div className="mt-2 flex items-center gap-3 text-[11px] font-bold text-[#7d858d]">
                <span className="flex items-center gap-1"><BookOpenText size={14} />10 soru</span>
                <span className="flex items-center gap-1"><Clock3 size={14} />4 dk</span>
              </div>
              <Link href={gameHref} className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl text-sm font-black text-white active:translate-y-1" style={{ background: subject.color, boxShadow: `0 5px 0 ${subject.shadow}` }}>
                <Play size={17} fill="currentColor" /> DEVAM ET
              </Link>
            </div>
            <button onClick={openCoach} className="absolute right-3 top-3 z-10 flex min-h-8 items-center gap-1 rounded-xl border-2 border-[#e5e7eb] bg-white px-2 py-1 text-[10px] font-extrabold text-[#5d646b] shadow-[0_3px_0_#e5e7eb] active:translate-y-0.5" aria-label="Bilge Chan mesajlarını aç">
              <MessageCircle size={13} fill="#dbeafe" className="text-[#2563eb]" /> Hazırsın!
            </button>
            <button onClick={openCoach} className="absolute -bottom-10 -right-1 h-[160px] w-[116px]" aria-label="Bilge Chan koç penceresini aç">
              <Image src="/chan/chan-wave.webp" alt="" width={140} height={192} priority className="h-auto w-[112px] drop-shadow-[0_7px_8px_rgba(31,41,55,.14)]" />
            </button>
          </div>
        </section>

        <section aria-label={`${subject.label} öğrenme yolu`} className="relative mx-4 mt-4 rounded-[22px] border-2 border-[#e5e7eb] bg-[#f9fafb] p-2.5 shadow-[0_5px_0_#e5e7eb]">
          <div className="mb-2 flex items-center justify-between">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.15em]" style={{ color: subject.color }}>Ünite planı</div>
              <h2 className="text-[15px] font-black">Öğrenme yolu</h2>
            </div>
            <div className="rounded-xl bg-white px-2.5 py-1.5 text-[10px] font-black text-[#69717a] shadow-[0_2px_0_#dfe3e7]">2 / 6</div>
          </div>
          <div className="relative grid grid-cols-2 grid-rows-3 gap-x-8 gap-y-1.5">
            <svg aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
              <path d="M25 16.5 H75 V50 H25 V83.5 H75" fill="none" stroke="#cfd5db" strokeWidth="1.8" strokeDasharray="2.5 2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {subject.topics.map((topic, index) => <PathStep key={`${subject.id}-${topic}`} index={index} topic={topic} subject={subject} />)}
          </div>
        </section>

        <section className="mx-4 mb-7 rounded-[22px] border-2 border-[#e5e7eb] bg-white p-4 shadow-[0_5px_0_#e5e7eb]">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#fff7ed] text-[#f97316]"><Flame size={24} fill="currentColor" strokeWidth={2.6} /></div>
            <div className="min-w-0 flex-1">
              <div className="flex justify-between text-xs font-black"><span>Günlük hedef</span><span className="text-[#f97316]">6 / 10 soru</span></div>
              <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-[#edf0f2] p-[2px]"><div className="h-full w-3/5 rounded-full bg-[#f97316]" /></div>
            </div>
          </div>
        </section>
      </main>

      <BottomNav activeOverride="learn" appearance="learning" />

      {coachOpen && (
        <div
          className="fixed inset-y-0 left-1/2 z-[150] flex w-full max-w-[440px] -translate-x-1/2 items-center bg-[#0f172a]/45 px-3 py-16 backdrop-blur-[2px]"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setCoachOpen(false)
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="coach-dialog-title"
            aria-describedby="coach-dialog-description"
            className="relative min-h-[400px] w-full"
          >
            <div className="absolute bottom-0 -left-1 z-20 w-[126px]">
              <div className="absolute left-1 top-1 rotate-[-2deg] rounded-lg border-2 border-white bg-[#2563eb] px-2 py-1 text-[9px] font-black uppercase tracking-[0.08em] text-white shadow-[0_4px_12px_rgba(37,99,235,.28)]">Bilge Chan</div>
              <Image src="/chan/chan-wave.webp" alt="Bilge Arena öğrenme koçu Chan" width={150} height={206} className="mt-7 h-auto w-[126px] drop-shadow-[0_10px_10px_rgba(15,23,42,.22)]" />
            </div>

            <div className="absolute right-0 top-7 z-10 w-[calc(100%-64px)] max-w-[306px]">
              <div
                className="relative z-10 min-h-[302px] border-2 border-[#334155] bg-white px-5 pb-4 pt-5 text-[#1f2937]"
                style={{ borderRadius: bubbleRadius, boxShadow: '6px 8px 0 rgba(15,23,42,.16), 0 18px 42px rgba(15,23,42,.20)' }}
              >
                <span aria-hidden="true" className="absolute -left-[34px] bottom-[112px] h-10 w-10 bg-[#334155]" style={{ clipPath: 'polygon(100% 0, 100% 100%, 0 52%)' }} />
                <span aria-hidden="true" className="absolute -left-[27px] bottom-[118px] h-7 w-8 bg-white" style={{ clipPath: 'polygon(100% 0, 100% 100%, 0 52%)' }} />

                <button
                  type="button"
                  onClick={() => setCoachOpen(false)}
                  aria-label="Koç penceresini kapat"
                  className="absolute right-3 top-3 z-20 flex h-10 w-10 items-center justify-center rounded-full border-2 border-[#d7dee6] bg-white text-[#64748b] shadow-[0_3px_0_#d7dee6] active:translate-y-0.5 active:shadow-none"
                >
                  <X size={19} strokeWidth={3} />
                </button>

                <div className="mb-3 flex items-center gap-2 pr-10">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl" style={{ color: message.color, background: message.tint }}>
                    <MessageIcon size={20} strokeWidth={2.8} />
                  </span>
                  <span className="text-[10px] font-black uppercase tracking-[0.13em]" style={{ color: message.color }}>{message.eyebrow}</span>
                </div>

                <h2 id="coach-dialog-title" className="max-w-[220px] text-xl font-black leading-7 tracking-[-0.02em]">{message.title}</h2>
                <p id="coach-dialog-description" className="mt-2 text-[12px] font-semibold leading-[19px] text-[#64707b]">{message.body}</p>

                <div className="mt-4 flex items-center justify-between gap-2 border-t-2 border-[#edf0f3] pt-4">
                  <button
                    type="button"
                    onClick={() => setCoachMessage((current) => Math.max(0, current - 1))}
                    disabled={coachMessage === 0}
                    className="flex min-h-10 items-center gap-0.5 rounded-xl px-2 text-[11px] font-black text-[#66717b] active:bg-[#f1f5f9] disabled:opacity-30"
                  >
                    <ChevronLeft size={16} strokeWidth={3.5} /> Geri
                  </button>

                  <div aria-label={`${coachMessage + 1}. mesaj, toplam ${COACH_MESSAGES.length}`} className="flex gap-1.5">
                    {COACH_MESSAGES.map((item, index) => (
                      <button
                        key={item.title}
                        type="button"
                        onClick={() => setCoachMessage(index)}
                        aria-label={`${index + 1}. koç mesajını göster`}
                        aria-current={coachMessage === index ? 'step' : undefined}
                        className="h-2.5 rounded-full transition-all"
                        style={{ width: coachMessage === index ? 24 : 10, background: coachMessage === index ? message.color : '#cbd5e1' }}
                      />
                    ))}
                  </div>

                  {coachMessage < COACH_MESSAGES.length - 1 ? (
                    <button
                      type="button"
                      onClick={() => setCoachMessage((current) => Math.min(COACH_MESSAGES.length - 1, current + 1))}
                      className="flex min-h-10 items-center gap-0.5 rounded-xl bg-[#2563eb] px-3 text-[11px] font-black text-white shadow-[0_4px_0_#1d4ed8] active:translate-y-0.5 active:shadow-none"
                    >
                      İleri <ChevronRight size={16} strokeWidth={3.5} />
                    </button>
                  ) : (
                    <Link
                      href={gameHref}
                      onClick={() => setCoachOpen(false)}
                      className="flex min-h-10 items-center gap-1 rounded-xl bg-[#22c55e] px-3 text-[10px] font-black text-white shadow-[0_4px_0_#15803d] active:translate-y-0.5 active:shadow-none"
                    >
                      Başla <Play size={14} fill="currentColor" />
                    </Link>
                  )}
                </div>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
