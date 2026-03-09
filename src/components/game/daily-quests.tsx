'use client'

import type { UserDailyQuest } from '@/types/database'

// Eski (mock) format — quiz-engine sidebar'da kullanılıyor
interface SimpleQuest {
  label: string
  done: number
  total: number
  color: string
}

interface DailyQuestsProps {
  quests?: SimpleQuest[]
  userQuests?: UserDailyQuest[]
  onClaimXP?: (questId: string) => void
}

const QUEST_COLORS: Record<string, string> = {
  play_sessions: 'var(--focus)',
  correct_answers: 'var(--growth)',
  streak_maintain: 'var(--reward)',
  accuracy: 'var(--focus-light)',
  specific_game: 'var(--growth)',
}

export function DailyQuests({ quests, userQuests, onClaimXP }: DailyQuestsProps) {
  // Gerçek veritabanı görevleri varsa onları göster
  const items = userQuests
    ? userQuests.map((uq) => ({
        id: uq.id,
        label: uq.quest?.title ?? 'Görev',
        icon: uq.quest?.icon ?? '📋',
        done: uq.current_value,
        total: uq.quest?.target_value ?? 1,
        color: QUEST_COLORS[uq.quest?.quest_type ?? ''] ?? 'var(--focus)',
        isCompleted: uq.is_completed,
        xpClaimed: uq.xp_claimed,
        xpReward: uq.quest?.xp_reward ?? 50,
      }))
    : (quests ?? []).map((q, i) => ({
        id: String(i),
        label: q.label,
        icon: '',
        done: q.done,
        total: q.total,
        color: q.color,
        isCompleted: q.done >= q.total,
        xpClaimed: false,
        xpReward: 0,
      }))

  const completedCount = items.filter((q) => q.isCompleted).length

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card-bg)]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2">
        <span className="text-[9px] font-extrabold tracking-[0.18em] text-[var(--text-sub)]">
          GÜNLÜK GÖREV
        </span>
        <span className="text-[10px] font-bold text-[var(--reward)]">
          {completedCount}/{items.length} ✓
        </span>
      </div>

      {/* Quest items */}
      {items.map((quest, i) => {
        const pct = Math.min((quest.done / quest.total) * 100, 100)

        return (
          <div
            key={quest.id}
            className="px-3 py-2"
            style={{ borderBottom: i < items.length - 1 ? '1px solid var(--border)' : undefined }}
          >
            <div className="mb-1 flex items-center justify-between">
              <span
                className="text-[11px]"
                style={{
                  color: quest.isCompleted ? quest.color : 'var(--text-sub)',
                  fontWeight: quest.isCompleted ? 600 : 400,
                }}
              >
                {quest.icon ? `${quest.icon} ` : ''}
                {quest.isCompleted ? '✓ ' : ''}
                {quest.label}
              </span>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-bold" style={{ color: quest.color }}>
                  {Math.min(quest.done, quest.total)}/{quest.total}
                </span>
                {quest.isCompleted && !quest.xpClaimed && quest.xpReward > 0 && onClaimXP && (
                  <button
                    onClick={() => onClaimXP(quest.id)}
                    className="rounded-md bg-[var(--reward)] px-1.5 py-0.5 text-[9px] font-bold text-black transition-all hover:scale-105"
                  >
                    +{quest.xpReward} XP
                  </button>
                )}
                {quest.xpClaimed && (
                  <span className="text-[9px] text-[var(--reward)]">✓ XP</span>
                )}
              </div>
            </div>
            <div className="h-1 overflow-hidden rounded-full bg-[var(--border)]">
              <div
                className="h-full rounded-full transition-[width] duration-600"
                style={{
                  width: `${pct}%`,
                  background: quest.color,
                  boxShadow: quest.isCompleted ? `0 0 6px color-mix(in srgb, ${quest.color} 53%, transparent)` : undefined,
                }}
              />
            </div>
          </div>
        )
      })}

      {items.length === 0 && (
        <div className="px-3 py-4 text-center text-[11px] text-[var(--text-sub)]">
          Görevler yükleniyor...
        </div>
      )}
    </div>
  )
}
