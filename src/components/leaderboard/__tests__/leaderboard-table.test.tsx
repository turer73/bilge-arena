/**
 * Bilge Arena: LeaderboardTable — mobil-responsive sıralama listesi
 * (Sabit 4-sütun grid uzun isimleri sariyordu; mobilde 3 sütun + isim truncate,
 *  seviye isim altinda. sm+ 4 sütun.)
 */

import { describe, test, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

// next/image -> düz <img> (vitest loader sorunlarini onle)
vi.mock('next/image', () => ({
  default: ({ src, alt, ...props }: { src: string; alt: string }) => <img src={src} alt={alt} {...props} />,
}))

import { LeaderboardTable } from '../leaderboard-table'

const ENTRIES = [
  { rank: 1, user_id: 'a', name: 'zeynep_yks_cok_uzun_bir_kullanici_adi', avatar: '🦉', xp: 9820, level: 'Savaşçı', isCurrentUser: false, decorations: ['kanat'] },
  { rank: 2, user_id: 'b', name: 'Sen', avatar: 'https://cdn.x/a.png', xp: 2340, level: 'Çırak', isCurrentUser: true },
  { rank: 3, user_id: 'c', name: 'efe', avatar: '🦅', xp: 1500, level: 'Çırak', isCurrentUser: false },
]

describe('LeaderboardTable', () => {
  test('oyuncular + madalya + mevcut kullanici (Sen) render eder', () => {
    render(<LeaderboardTable entries={ENTRIES} />)
    expect(screen.getByText('zeynep_yks_cok_uzun_bir_kullanici_adi')).toBeInTheDocument()
    expect(screen.getByText('🥇')).toBeInTheDocument() // rank 1 madalya
    expect(screen.getByText('(Sen)')).toBeInTheDocument() // mevcut kullanici
  })

  test('uzun isim truncate ile kesilir (sarmaz)', () => {
    render(<LeaderboardTable entries={ENTRIES} />)
    const nameEl = screen.getByText('zeynep_yks_cok_uzun_bir_kullanici_adi')
    expect(nameEl.className).toContain('truncate')
  })

  test('seviye gösterilir (mobil isim-altı + sm+ sütun = DOM\'da 2 kez)', () => {
    render(<LeaderboardTable entries={ENTRIES} />)
    // "Savaşçı" hem mobil (isim altı, sm:hidden) hem sm+ sütununda DOM'da var
    expect(screen.getAllByText('Savaşçı').length).toBeGreaterThanOrEqual(2)
  })

  test('http avatar <img>, emoji avatar metin', () => {
    render(<LeaderboardTable entries={ENTRIES} />)
    expect(document.querySelector('img[src="https://cdn.x/a.png"]')).not.toBeNull()
    expect(screen.getByText('🦉')).toBeInTheDocument()
  })

  test('yerel-yol avatar (preset svg / mascot webp) <img> render eder — metin sızıntısı yok (Ensar 06-16)', () => {
    const local = [
      { rank: 1, user_id: 'p', name: 'Angel', avatar: '/avatars/preset/thumbs-3.svg', xp: 100, level: 'Acemi', isCurrentUser: false },
      { rank: 2, user_id: 'q', name: 'Mert', avatar: '/avatars/mascot/chan-avatar-3d-smile.webp', xp: 90, level: 'Acemi', isCurrentUser: false },
    ]
    render(<LeaderboardTable entries={local} />)
    // Yerel yollar <img src> olarak render edilmeli — eskiden else dalına düşüp
    // "/avatars/preset/thumbs-3.svg" METİN olarak basılıyordu (bug).
    expect(document.querySelector('img[src="/avatars/preset/thumbs-3.svg"]')).not.toBeNull()
    expect(document.querySelector('img[src="/avatars/mascot/chan-avatar-3d-smile.webp"]')).not.toBeNull()
    expect(screen.queryByText('/avatars/preset/thumbs-3.svg')).not.toBeInTheDocument()
  })

  test('seçili süs(ler) avatar etrafında render eder (DB selected_avatar_decorations)', () => {
    render(<LeaderboardTable entries={ENTRIES} />)
    // rank 1 kanat takılı → SVG tüy-kanat overlay; süssüz satırlarda yok
    expect(document.querySelector('svg')).not.toBeNull()
  })
})
