'use client'

import { useId } from 'react'

export const ACADEMY_ICON_NAMES = [
  'matematik', 'turkce', 'fen', 'sosyal', 'wordquest',
  'learn', 'practice', 'arena', 'league', 'profile',
  'streak', 'gem', 'xp', 'shop', 'classroom', 'institution', 'quality', 'locked',
] as const
export type AcademyIconName = typeof ACADEMY_ICON_NAMES[number]

interface AcademyIconProps {
  name: AcademyIconName
  size?: number
  muted?: boolean
  className?: string
}

function artwork(name: AcademyIconName, blue: string, gold: string, light: string) {
  switch (name) {
    case 'matematik': return <>
      <ellipse cx="32" cy="52" rx="22" ry="5" fill="#061729" opacity=".35" stroke="none" />
      <path d="m32 7 22 14-5 25-17 11-17-11-5-25Z" fill={blue} stroke={gold} />
      <path d="m32 7-9 23 9 27 9-27Zm-22 14 13 9 18 0 13-9M15 46l8-16m18 0 8 16" fill="none" stroke={light} opacity=".85" />
      <path d="m32 7-9 23H41Z" fill={light} opacity=".25" stroke="none" />
      <circle cx="32" cy="7" r="3" fill={gold} stroke="none" /><circle cx="54" cy="21" r="3" fill={gold} stroke="none" /><circle cx="15" cy="46" r="3" fill={gold} stroke="none" />
    </>
    case 'turkce': return <>
      <path d="M16 13h28l-3 42H12l3-35Z" fill={blue} />
      <path d="M20 20h15M19 28h14M18 36h10M17 44h9" stroke={light} opacity=".8" />
      <path d="M29 43C29 24 42 8 56 7c-1 16-10 28-26 36Z" fill={gold} />
      <path d="m25 55 24-37M38 35l-1-10m6 2 7-1" stroke="#fff1c9" fill="none" />
    </>
    case 'fen': return <>
      <path d="M25 7h14v5h-3v16l15 22c3 4 0 8-5 8H18c-5 0-8-4-5-8l15-22V12h-3Z" fill={blue} />
      <path d="m21 39-8 12c-2 3 0 7 5 7h28c5 0 7-4 5-7l-8-12c-7 5-13-5-22 0Z" fill={gold} />
      <path d="M25 8h14M24 48h4m6 4h4" stroke={light} />
      <circle cx="33" cy="33" r="3" fill={light} stroke="none" /><circle cx="45" cy="16" r="3" fill={gold} stroke="none" /><circle cx="19" cy="23" r="2" fill={gold} stroke="none" />
    </>
    case 'sosyal': return <>
      <path d="M47 9A27 27 0 0 1 18 54M32 54v5m-11 0h22" fill="none" stroke={gold} strokeWidth="3.5" />
      <circle cx="30" cy="30" r="21" fill={blue} />
      <path d="m19 12 5 8 10 1 3 5-8 7-7-2-5 6-7-6m27 0 9 4-3 10-9 5-3-10Z" fill={gold} stroke="none" />
      <path d="M12 24c9-5 25-6 37-1M17 44c-1-12 6-29 16-34" fill="none" stroke={light} opacity=".7" />
    </>
    case 'wordquest': return <>
      <path d="M25 23h27a6 6 0 0 1 6 6v15a6 6 0 0 1-6 6h-4v8l-10-8H25a6 6 0 0 1-6-6V29a6 6 0 0 1 6-6Z" fill={gold} />
      <path d="M12 7h27a6 6 0 0 1 6 6v20a6 6 0 0 1-6 6H25L13 47v-8h-1a6 6 0 0 1-6-6V13a6 6 0 0 1 6-6Z" fill={blue} />
      <path d="m17 30 8-16 8 16m-13-5h10" stroke={light} strokeWidth="3.5" fill="none" />
      <path d="M44 33h8m-8 7h5" stroke="#6a451a" fill="none" />
    </>
    case 'learn': return <>
      <path d="M6 17c9-4 18-2 26 3 8-5 17-7 26-3v34c-9-3-18-2-26 3-8-5-17-6-26-3Z" fill={gold} />
      <path d="M10 10c8-3 15-1 22 4 7-5 14-7 22-4v34c-8-2-15 0-22 5-7-5-14-7-22-5Z" fill={blue} />
      <path d="M32 14v35M16 20l9 3m-9 6 9 3m14-9 9-3m-9 12 9-3" stroke={light} fill="none" />
      <path d="M42 8v12l4-3 4 1V7" fill={gold} stroke="none" />
    </>
    case 'practice': return <>
      <circle cx="29" cy="35" r="23" fill={blue} /><circle cx="29" cy="35" r="15" fill="none" stroke={gold} strokeWidth="4" />
      <circle cx="29" cy="35" r="6" fill={gold} stroke="none" />
      <path d="m29 35 20-20m-1-9 1 9 10 1-8 8-10-2-2-9Z" fill={gold} stroke={light} strokeWidth="3" />
      <path d="M12 26a19 19 0 0 1 10-9" stroke={light} fill="none" />
    </>
    case 'arena': return <>
      <path d="M20 24h24v21L32 57 20 45Z" fill={blue} />
      <path d="m11 6 10 3 28 33-7 7L10 17Zm42 0-10 3-28 33 7 7 32-32Z" fill={light} />
      <path d="m13 38 13 13m25-13L38 51M13 50l-5 6m43-6 5 6" stroke={gold} strokeWidth="5" />
      <path d="m15 13 17 19m17-19L35 29" stroke="#6cabc4" fill="none" />
    </>
    case 'league': return <>
      <path d="M16 16H6v10c0 9 8 14 18 13m24-23h10v10c0 9-8 14-18 13" fill="none" stroke={gold} strokeWidth="5" />
      <path d="M16 9h32v14c0 14-7 22-16 22s-16-8-16-22Z" fill={gold} />
      <path d="M20 13v10c0 7 2 12 5 15" fill="none" stroke="#fff0bc" strokeWidth="3" />
      <path d="m32 18 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z" fill={blue} stroke="none" />
      <path d="M29 45h6v7h9v6H20v-6h9Z" fill={blue} />
    </>
    case 'profile': return <>
      <circle cx="32" cy="32" r="26" fill={blue} stroke={gold} />
      <path d="M13 48c3-10 11-15 19-15s16 5 19 15a24 24 0 0 1-38 0Z" fill={gold} />
      <circle cx="32" cy="24" r="10" fill={light} />
      <path d="m27 40 5 5 5-5" fill="none" stroke="#fff0bc" />
      <path d="M12 25c2-6 5-10 10-13" fill="none" stroke={light} />
    </>
    case 'streak': return <>
      <path d="M36 5c2 15-9 17-7 26 5-1 7-6 9-11 6 7 14 15 14 23a20 20 0 0 1-40 0c0-12 10-18 11-26 5 5 5 8 5 8s9-10 8-20Z" fill={gold} />
      <path d="M32 32c1 8-9 11-7 18a8 8 0 0 0 15-2c0-6-7-8-8-16Z" fill={light} stroke="none" />
      <path d="M18 42c-1 6 2 11 6 13" stroke="#c97728" fill="none" />
    </>
    case 'gem': return <>
      <path d="m17 10 30 0 12 17-27 31L5 27Z" fill={blue} />
      <path d="M5 27h54M17 10l6 17 9 31 9-31 6-17M23 27l9-17 9 17" fill="none" stroke={light} />
      <path d="m17 10 6 17L5 27Zm15 0 9 17h18L47 10Z" fill={light} opacity=".24" stroke="none" />
      <path d="M50 3v7m-3-4h6" stroke={gold} />
    </>
    case 'xp': return <>
      <path d="m32 4 8 18 20 2-15 14 5 21-18-11-18 11 5-21L4 24l20-2Z" fill={gold} />
      <path d="m32 4 0 44L4 24l36-2 10 37-26-37Z" fill={light} opacity=".18" stroke="none" />
      <path d="m35 18-12 17h10l-3 13 13-20H32Z" fill={blue} stroke="none" />
    </>
    case 'shop': return <>
      <path d="M13 19h38l5 38H8Z" fill={blue} />
      <path d="M22 23V16a10 10 0 0 1 20 0v7" stroke={gold} strokeWidth="4" fill="none" />
      <path d="m32 30 4 7 8 1-6 6 1 8-7-4-7 4 1-8-6-6 8-1Z" fill={gold} stroke="none" />
      <path d="M17 26 14 48" stroke={light} />
    </>
    case 'classroom': return <>
      <path d="M15 30v17c8 8 26 8 34 0V30Z" fill={blue} />
      <path d="m32 8 29 16-29 16L3 24Z" fill={blue} stroke={gold} />
      <path d="m32 22 20 10v16" fill="none" stroke={gold} strokeWidth="3" />
      <path d="m52 44-5 11h10Z" fill={gold} stroke="none" /><path d="m12 24 20 11" stroke={light} />
    </>
    case 'institution': return <>
      <path d="m32 6 28 15H4Z" fill={gold} /><path d="M9 24h46v29H9Z" fill={blue} />
      <path d="M17 29v18m15-18v18m15-18v18" stroke={light} strokeWidth="5" />
      <path d="M5 53h54v6H5Z" fill={gold} /><circle cx="32" cy="16" r="3" fill={blue} stroke="none" />
    </>
    case 'quality': return <>
      <path d="m32 5 23 9v19c0 12-10 22-23 27C19 55 9 45 9 33V14Z" fill={blue} stroke={gold} />
      <path d="m21 32 8 8 16-18" fill="none" stroke={light} strokeWidth="5" />
      <path d="m15 19 14-5" fill="none" stroke={light} opacity=".7" />
    </>
    case 'locked': return <>
      <path d="M19 28V18a13 13 0 0 1 26 0v10" fill="none" strokeWidth="7" />
      <path d="M19 28V18a13 13 0 0 1 26 0v10" fill="none" stroke={light} strokeWidth="3.5" />
      <rect x="11" y="26" width="42" height="32" rx="8" fill={blue} stroke={gold} />
      <path d="M28 38a4 4 0 1 1 8 0c0 2-1 3-2 4v7h-4v-7c-1-1-2-2-2-4Z" fill={gold} stroke="none" />
    </>
  }
}

/** Original small-format vectors; decorative because every control retains its text label. */
export function AcademyIcon({ name, size = 28, muted = false, className }: AcademyIconProps) {
  const id = useId()
  const blue = `url(#${id}-blue)`
  const gold = `url(#${id}-gold)`
  const light = muted ? '#cedce6' : '#e7f9ff'
  return <svg data-academy-icon={name} aria-hidden="true" focusable="false" width={size} height={size} viewBox="0 0 64 64" className={className} style={{ flexShrink: 0 }}>
    <defs>
      <linearGradient id={`${id}-blue`} x1="8" y1="6" x2="48" y2="58" gradientUnits="userSpaceOnUse">
        <stop stopColor={muted ? '#9bb8cb' : '#8de3ff'} /><stop offset=".5" stopColor={muted ? '#668ba9' : '#3897d6'} /><stop offset="1" stopColor={muted ? '#355371' : '#17519b'} />
      </linearGradient>
      <linearGradient id={`${id}-gold`} x1="12" y1="6" x2="48" y2="57" gradientUnits="userSpaceOnUse">
        <stop stopColor={muted ? '#d5cbb0' : '#fff0bd'} /><stop offset=".5" stopColor={muted ? '#a69a80' : '#efc36b'} /><stop offset="1" stopColor={muted ? '#726956' : '#b5772b'} />
      </linearGradient>
    </defs>
    <g stroke="#123452" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      {artwork(name, blue, gold, light)}
    </g>
  </svg>
}
