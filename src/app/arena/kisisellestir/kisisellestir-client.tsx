'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useAuthStore } from '@/stores/auth-store'
import { getLevelFromXP } from '@/lib/constants/levels'
import {
  PROFILE_FRAMES,
  FRAME_STORAGE_KEY,
  FRAME_RARITY_COLOR,
} from '@/lib/constants/profile-frames'
import { BACKGROUND_STORAGE_KEY, ZEMIN_STORAGE_KEY } from '@/lib/constants/profile-backgrounds'
import {
  CSS_STORE_ITEMS,
  rowToStoreItem,
  availableResolutions,
  RESOLUTION_LABELS,
  RESOLUTION_ORDER,
  BACKGROUND_RESOLUTION_KEY,
  PUBLISHED_BACKGROUNDS_ENDPOINT,
  type StoreBackgroundItem,
  type BackgroundAssetRow,
  type VideoResolution,
} from '@/lib/constants/video-backgrounds'
import {
  PROFILE_NAMEPLATES,
  NAMEPLATE_RARITY_LABEL,
} from '@/lib/constants/profile-nameplates'
import { resolveOwnedSelection } from '@/lib/utils/owned-selection'
import { isStaff } from '@/lib/utils/is-staff'
import { Nameplate } from '@/components/profile/nameplate'
import { FrameDot } from '@/components/profile/profile-frame-ring'
import { CosmeticBadgeShelf } from '@/components/profile/cosmetic-badge-shelf'
import { toast } from '@/stores/toast-store'
import {
  AVATAR_DECORATIONS,
  DECORATION_RARITY_LABEL,
  isDecorationFree,
} from '@/lib/constants/avatar-decorations'
import { AVATAR_GROUPS, avatarMinLevel } from '@/lib/constants/avatars'
import { StudioPreview } from './studio-preview'
import { useCosmeticPurchase, type CosmeticCategory } from '@/lib/hooks/use-cosmetic-purchase'
import { CosmeticPurchaseDialog } from '@/components/profile/cosmetic-purchase-dialog'

type Area = 'avatar' | 'zemin' | 'kart' | 'panel' | 'cerceve' | 'rozet' | 'sus'

const AREAS: { id: Area; label: string; icon: string; hint: string }[] = [
  { id: 'avatar', label: 'Avatar', icon: '🧑', hint: 'Profil fotoğrafın — maskot karakterler + hazır set' },
  { id: 'zemin', label: 'Zemin', icon: '🌅', hint: 'Tüm sayfaların arka planı' },
  { id: 'kart', label: 'Profil Kartı', icon: '🪪', hint: 'Profil başlık kartının arkası' },
  { id: 'panel', label: 'İsim Paneli', icon: '🏷️', hint: 'İsmin arkasındaki panel — sıralamada da görünür' },
  { id: 'cerceve', label: 'Çerçeve', icon: '🖼️', hint: 'Avatar çerçeven' },
  { id: 'sus', label: 'Süs', icon: '🪽', hint: 'Avatarın etrafındaki süs (kanat, taç, yıldız…)' },
  { id: 'rozet', label: 'Rozet', icon: '🏅', hint: 'Profilinde sergilenen rozetler' },
]

/**
 * Kişiselleştirme Stüdyosu — sahip olunan kozmetiklerin tek yerden, canlı
 * önizlemeyle uygulandığı sayfa (Discord profil-düzenleme tarzı). Mağaza SATIN
 * ALMA içindir; burası DÜZENLEME. Her alan ayrı seçilir:
 *  - Zemin (ZEMIN_STORAGE_KEY) ve Kart (BACKGROUND_STORAGE_KEY) AYRI — zemin
 *    artık otomatik değil, kullanıcı bilinçle seçer.
 *  - İsim paneli DB'de (selected_nameplate) — başkalarına görünür.
 *  - Çerçeve localStorage (FRAME_STORAGE_KEY).
 *  - Rozetler: sahip olunan = sergilenir (satın-alma mağazada).
 * Sahiplik guard'ı her alanda: personel (RBAC rolü) tümünü ücretsiz kullanır.
 */
export function KisisellestirClient() {
  const { user, profile, setProfile, loading } = useAuthStore()
  const [area, setArea] = useState<Area>('avatar')

  const [cardBgId, setCardBgId] = useState('none')
  const [zeminId, setZeminId] = useState('none')
  const [frameId, setFrameId] = useState('none')
  const [decorationIds, setDecorationIds] = useState<string[]>([])
  const [resolution, setResolution] = useState<VideoResolution>('k2')
  const [videoItems, setVideoItems] = useState<StoreBackgroundItem[]>([])
  const [reducedMotion, setReducedMotion] = useState(false)
  const [npBusy, setNpBusy] = useState(false)
  const [decoBusy, setDecoBusy] = useState(false)
  const [avatarBusy, setAvatarBusy] = useState(false)

  // localStorage seçimlerini yükle (kart / zemin / çerçeve / çözünürlük)
  useEffect(() => {
    try {
      const card = localStorage.getItem(BACKGROUND_STORAGE_KEY)
      if (card) setCardBgId(card)
      const zem = localStorage.getItem(ZEMIN_STORAGE_KEY)
      if (zem) setZeminId(zem)
      const frm = localStorage.getItem(FRAME_STORAGE_KEY)
      if (frm && PROFILE_FRAMES.some((f) => f.id === frm)) setFrameId(frm)
      const res = localStorage.getItem(BACKGROUND_RESOLUTION_KEY)
      if (res === 'hd' || res === 'k2' || res === 'k4') setResolution(res)
    } catch {}
  }, [])

  // Süs seçimi artık DB'de (selected_avatar_decorations) — başkalarına görünür.
  // Profil yüklenince/değişince state'i senkronize et.
  useEffect(() => {
    setDecorationIds(profile?.selected_avatar_decorations ?? [])
  }, [profile?.selected_avatar_decorations])

  // prefers-reduced-motion → video yerine poster
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReducedMotion(mq.matches)
    const onChange = (e: MediaQueryListEvent) => setReducedMotion(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  // Yayındaki video temaları çek (mağaza/profil ile aynı kaynak)
  useEffect(() => {
    let active = true
    fetch(PUBLISHED_BACKGROUNDS_ENDPOINT)
      .then((r) => (r.ok ? r.json() : { backgrounds: [] }))
      .then((data: { backgrounds: BackgroundAssetRow[] }) => {
        if (active) setVideoItems((data.backgrounds ?? []).map(rowToStoreItem))
      })
      .catch((e) => console.warn('[kisisellestir] video arka plan yukleme hatasi:', e))
    return () => {
      active = false
    }
  }, [])

  const staff = isStaff(profile)

  // ── Sahiplik kümeleri + sahip olunan kozmetik listeleri ──
  const bgCatalog = useMemo<StoreBackgroundItem[]>(
    () => [...CSS_STORE_ITEMS, ...videoItems],
    [videoItems],
  )
  const bgOwnedIds = useMemo(
    () => (staff ? bgCatalog.map((b) => b.id) : profile?.owned_backgrounds ?? []),
    [staff, bgCatalog, profile?.owned_backgrounds],
  )
  // Katalog ARTIK FILTRELENMIYOR (2026-08-16, İP-3a). Önceden yalnız sahip
  // olunanlar listeleniyordu; kullanıcı neyi alabileceğini ve bir ürüne ne kadar
  // kaldığını hiçbir ekranda göremiyordu. Ölçülen sonuç: bakiyesi en ucuz ürüne
  // yeten 10 kullanıcı vardı ve toplam 1 satın alma yapılmıştı.
  // Süs alanı bu deseni zaten uyguluyordu; diğer alanlar ona hizalandı.
  const balance = profile?.coin_balance ?? 0
  const isBgOwned = (b: StoreBackgroundItem) =>
    b.coinCost === undefined || bgOwnedIds.includes(b.id)

  // İP-3b: kilitli ama bakiyesi yeten ürün YERİNDE alınır — mağazaya gidip
  // geri dönmek bağlamı koparıyordu. Bakiye yetmiyorsa satın alma açılmaz,
  // etiket "🔒 🪙N daha" olarak kalır ve mağaza CTA'sı yönlendirir.
  const { purchase, busyId } = useCosmeticPurchase()
  const [buyTarget, setBuyTarget] = useState<{
    category: CosmeticCategory
    id: string
    name: string
    cost: number
    onOwned: (id: string) => void
  } | null>(null)

  /** Satın alınabilir mi (kilitli + fiyatı var + bakiye yetiyor). */
  const canBuy = (cost: number | undefined) => cost !== undefined && balance >= cost

  async function confirmPurchase() {
    if (!buyTarget) return
    const ok = await purchase({
      category: buyTarget.category,
      itemId: buyTarget.id,
      itemName: buyTarget.name,
    })
    if (ok) buyTarget.onOwned(buyTarget.id) // satın alındı → otomatik uygula
    setBuyTarget(null)
  }

  const frameOwnedIds = staff
    ? PROFILE_FRAMES.map((f) => f.id)
    : profile?.owned_frames?.length
      ? profile.owned_frames
      : ['none', 'mavi']
  const isFrameOwned = (f: { id: string; coinCost?: number }) =>
    f.coinCost === undefined || frameOwnedIds.includes(f.id)

  const npOwnedIds = staff
    ? PROFILE_NAMEPLATES.map((n) => n.id)
    : profile?.owned_nameplates ?? ['none']
  const isNameplateOwned = (n: { id: string; coinCost?: number }) =>
    n.coinCost === undefined || npOwnedIds.includes(n.id)

  // Süs sahipliği: personel hepsini, diğerleri owned + ücretsiz. Sahipsiz ücretli
  // süs takılamaz (kilitli kart → Mağaza). isDecorationFree zaten ücretsizi açar.
  const decoOwnedSet = useMemo(
    () =>
      staff
        ? new Set(AVATAR_DECORATIONS.map((d) => d.id))
        : new Set(profile?.owned_avatar_decorations ?? []),
    [staff, profile?.owned_avatar_decorations],
  )
  const canWearDeco = (id: string) => isDecorationFree(id) || decoOwnedSet.has(id)

  // ── Önizleme için çözülmüş (guard'lı) seçimler ──
  const zeminItem = resolveOwnedSelection(zeminId, bgOwnedIds, bgCatalog)
  const cardItem = resolveOwnedSelection(cardBgId, bgOwnedIds, bgCatalog)
  const activeFrame = resolveOwnedSelection(frameId, frameOwnedIds, PROFILE_FRAMES)
  const nameplateId = profile?.selected_nameplate ?? 'none'

  // Aktif alanın seçili arka planı video mu? (çözünürlük seçici için)
  const areaActiveBg = area === 'zemin' ? zeminItem : cardItem
  const showResolution =
    (area === 'zemin' || area === 'kart') &&
    areaActiveBg.kind === 'video' &&
    availableResolutions(areaActiveBg.variants).length > 1

  // ── Uygulayıcılar ──
  function applyCardBg(id: string) {
    setCardBgId(id)
    try {
      localStorage.setItem(BACKGROUND_STORAGE_KEY, id)
      localStorage.setItem(BACKGROUND_RESOLUTION_KEY, resolution)
      window.dispatchEvent(new Event('bg-changed'))
    } catch {}
  }
  function applyZemin(id: string) {
    setZeminId(id)
    try {
      localStorage.setItem(ZEMIN_STORAGE_KEY, id)
      localStorage.setItem(BACKGROUND_RESOLUTION_KEY, resolution)
      window.dispatchEvent(new Event('zemin-changed'))
    } catch {}
  }
  function applyFrame(id: string) {
    setFrameId(id)
    try {
      localStorage.setItem(FRAME_STORAGE_KEY, id)
    } catch {}
  }
  // Süs seçimini DB'ye yaz (optimistic; hata olursa geri al). selected_avatar_
  // decorations sıralama/profilde başkalarına görünür → localStorage değil.
  async function persistDecorations(next: string[]) {
    if (!profile || decoBusy) return
    const prev = decorationIds
    setDecorationIds(next)
    setDecoBusy(true)
    try {
      const res = await fetch('/api/profile/avatar-decorations/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decorationIds: next }),
      })
      const data = await res.json()
      if (!res.ok) {
        setDecorationIds(prev)
        toast.error('Uygulanamadı', data.error ?? 'Bir şeyler ters gitti')
        return
      }
      setProfile({ ...profile, selected_avatar_decorations: next })
    } catch {
      setDecorationIds(prev)
      toast.error('Bağlantı hatası', 'Tekrar dene')
    } finally {
      setDecoBusy(false)
    }
  }
  function toggleDecoration(id: string) {
    if (!canWearDeco(id)) return
    persistDecorations(
      decorationIds.includes(id) ? decorationIds.filter((x) => x !== id) : [...decorationIds, id],
    )
  }
  function clearDecorations() {
    persistDecorations([])
  }
  function applyResolution(res: VideoResolution) {
    setResolution(res)
    try {
      localStorage.setItem(BACKGROUND_RESOLUTION_KEY, res)
      window.dispatchEvent(new Event('bg-changed'))
      window.dispatchEvent(new Event('zemin-changed'))
    } catch {}
  }
  async function applyNameplate(id: string) {
    if (!profile || npBusy) return
    setNpBusy(true)
    try {
      const res = await fetch('/api/profile/nameplates/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nameplateId: id }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error('Uygulanamadı', data.error ?? 'Bir şeyler ters gitti')
        return
      }
      // EN GÜNCEL profili oku (Codex PR#243 avatar-clobber dersi). Satın alma
      // hemen öncesinde bakiyeyi ve sahiplik dizisini güncellemiş olabilir;
      // closure'daki eski `profile` yazılırsa o güncelleme ezilir.
      const latest = useAuthStore.getState().profile ?? profile
      setProfile({ ...latest, selected_nameplate: id })
      toast.success('İsim paneli uygulandı', 'Sıralama ve profilinde görünecek ✨')
    } catch {
      toast.error('Bağlantı hatası', 'Tekrar dene')
    } finally {
      setNpBusy(false)
    }
  }

  // Avatar seçimi — sunucu yalnız BİLİNEN preset-id'yi kabul eder (rastgele URL
  // enjeksiyonu yok) ve avatar_url'i statik path'e set eder; dönen değerle
  // profili güncelle → canlı önizleme anında yenilenir. Seviye kilidi sunucuda.
  async function applyAvatar(presetId: string) {
    if (!profile || avatarBusy) return
    setAvatarBusy(true)
    try {
      const res = await fetch('/api/profile/avatar/preset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ presetId }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        toast.error('Uygulanamadı', data?.error ?? 'Avatar seçilemedi')
        return
      }
      // P2 fix (Codex PR#243): closure'daki bayat `profile` yerine EN GUNCEL store
      // profilini oku + yalniz avatar_url'i merge et. Avatar POST donerken eszamanli
      // nameplate/sus kaydi yapilmissa onu ezme (stale-spread clobber'i onler).
      const latest = useAuthStore.getState().profile
      if (latest) {
        setProfile({ ...latest, avatar_url: data?.avatar_url ?? latest.avatar_url })
      }
      toast.success('Avatar uygulandı ✨')
    } catch {
      toast.error('Bağlantı hatası', 'Tekrar dene')
    } finally {
      setAvatarBusy(false)
    }
  }

  // ── Yükleniyor / giriş kontrolü ──
  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-[var(--border)] border-t-[var(--focus)]" />
      </div>
    )
  }
  if (!user || !profile) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <div className="mb-4 text-5xl">🎨</div>
        <h1 className="mb-2 text-xl font-bold">Giriş Yapmanız Gerekiyor</h1>
        <p className="mb-6 text-sm text-[var(--text-sub)]">
          Profilini kişiselleştirmek için giriş yap.
        </p>
        <Link
          href="/giris?redirect=/arena/kisisellestir"
          className="btn-primary inline-block rounded-[10px] px-8 py-3 font-display text-sm font-bold tracking-wider"
        >
          Giriş Yap
        </Link>
      </div>
    )
  }

  const level = getLevelFromXP(profile.total_xp ?? 0)
  const displayName = profile.username || profile.display_name || 'Arenacı'
  const activeAreaDef = AREAS.find((a) => a.id === area)!

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:py-8">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-black text-[var(--text)]">🎨 Kişiselleştirme Stüdyosu</h1>
          <p className="mt-1 text-sm text-[var(--text-sub)]">
            Sahip olduğun kozmetikleri profiline uygula. Yeni kozmetikler için{' '}
            <Link href="/arena/magaza" className="font-bold text-[var(--focus)] hover:underline">
              Mağaza
            </Link>
            &apos;ya uğra.
          </p>
        </div>
        <Link
          href="/arena/profil"
          className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-bold text-[var(--text-sub)] transition-colors hover:border-[var(--focus)] hover:text-[var(--focus)]"
        >
          ← Profilim
        </Link>
      </div>

      <div className="grid gap-5 md:grid-cols-[minmax(280px,360px)_1fr]">
        {/* Canlı önizleme — masaüstünde yapışkan */}
        <div className="md:sticky md:top-20 md:self-start">
          <StudioPreview
            zemin={zeminItem}
            card={cardItem}
            frame={activeFrame}
            nameplateId={nameplateId}
            resolution={resolution}
            reducedMotion={reducedMotion}
            displayName={displayName}
            avatarUrl={profile.avatar_url ?? null}
            levelBadge={level.badge}
            levelName={level.name}
            totalXp={profile.total_xp ?? 0}
            decorationIds={decorationIds}
          />
        </div>

        {/* Alan seçimi + ilgili kozmetik grid'i */}
        <div>
          {/* Alan sekmeleri */}
          <div className="flex flex-wrap gap-2">
            {AREAS.map((a) => (
              <button
                key={a.id}
                onClick={() => setArea(a.id)}
                aria-pressed={area === a.id}
                className={`rounded-xl border px-3 py-1.5 text-xs font-bold transition-all ${
                  area === a.id
                    ? 'border-[var(--focus)] bg-[var(--focus-bg)] text-[var(--focus)]'
                    : 'border-[var(--border)] bg-[var(--card-bg)] text-[var(--text-sub)] hover:border-[var(--focus-border)]'
                }`}
              >
                {a.icon} {a.label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-[var(--text-muted)]">{activeAreaDef.hint}</p>

          {/* Çözünürlük seçici (video arka plan seçiliyse) */}
          {showResolution && (
            <div className="mt-3 flex items-center gap-2">
              <span className="text-[11px] font-bold text-[var(--text-sub)]">Kalite:</span>
              {RESOLUTION_ORDER.filter((r) => availableResolutions(areaActiveBg.variants).includes(r)).map((r) => (
                <button
                  key={r}
                  onClick={() => applyResolution(r)}
                  className={`rounded-md border px-2 py-1 text-[10px] font-bold transition-colors ${
                    resolution === r
                      ? 'border-[var(--focus)] bg-[var(--focus-bg)] text-[var(--focus)]'
                      : 'border-[var(--border)] text-[var(--text-sub)] hover:border-[var(--focus-border)]'
                  }`}
                >
                  {RESOLUTION_LABELS[r]}
                </button>
              ))}
            </div>
          )}

          {/* Alan içeriği */}
          <div className="mt-4">
            {area === 'avatar' && (
              <div className="flex flex-col gap-3">
                <p className="text-[10px] text-[var(--text-muted)]">
                  Maskot karakterler + küratörlü hazır set. Bazı avatarlar seviye ile açılır 🔒
                </p>
                {AVATAR_GROUPS.map((group) => (
                  <div key={group.label}>
                    <p className="mb-1.5 text-[9px] font-extrabold uppercase tracking-widest text-[var(--text-muted)]">
                      {group.label}
                    </p>
                    <div className="grid grid-cols-5 gap-2 sm:grid-cols-8">
                      {group.items.map((a, i) => {
                        const need = avatarMinLevel(a.id)
                        const locked = !staff && level.level < need
                        const selected = profile.avatar_url === a.path
                        // P2 (Codex PR#243): aria-label'a grup-ici sira ekle — 6 buton
                        // da "Bilge Chan avatar" idi, SR/ses-kontrol ayirt edemiyordu.
                        const a11yLabel = `${a.label} avatar ${i + 1}`
                        return (
                          <button
                            key={a.id}
                            onClick={() => applyAvatar(a.id)}
                            disabled={avatarBusy || locked}
                            aria-pressed={selected}
                            title={locked ? `Seviye ${need} gerekli` : a.label}
                            aria-label={a11yLabel}
                            className={`relative rounded-full p-0.5 transition-all hover:ring-2 hover:ring-[var(--focus)] ${
                              selected ? 'ring-2 ring-[var(--focus)]' : ''
                            } ${locked ? 'opacity-50' : ''}`}
                          >
                            <img
                              src={a.path}
                              alt=""
                              className="h-12 w-12 rounded-full bg-[var(--card-bg)] object-cover"
                            />
                            {locked && (
                              <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/45 text-[9px] font-bold text-white">
                                🔒{need}
                              </span>
                            )}
                            {selected && !locked && (
                              <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--focus)] text-[8px] text-white">
                                ✓
                              </span>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {(area === 'zemin' || area === 'kart') && (
              <BackgroundGrid
                items={bgCatalog}
                selectedId={area === 'zemin' ? zeminId : cardBgId}
                noneLabel={area === 'zemin' ? 'Zemin Yok' : 'Sade'}
                onSelect={area === 'zemin' ? applyZemin : applyCardBg}
                isOwned={isBgOwned}
                balance={balance}
                onBuy={(b) =>
                  setBuyTarget({
                    category: 'background',
                    id: b.id,
                    name: b.name,
                    cost: b.coinCost ?? 0,
                    onOwned: area === 'zemin' ? applyZemin : applyCardBg,
                  })
                }
                canBuy={canBuy}
                busy={busyId !== null}
              />
            )}

            {area === 'panel' && (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {PROFILE_NAMEPLATES.map((np) => {
                  const owned = isNameplateOwned(np)
                  return (
                    <button
                      key={np.id}
                      onClick={() => {
                        if (owned) return applyNameplate(np.id)
                        if (canBuy(np.coinCost)) {
                          setBuyTarget({
                            category: 'nameplate',
                            id: np.id,
                            name: np.name,
                            cost: np.coinCost ?? 0,
                            onOwned: applyNameplate,
                          })
                        }
                      }}
                      disabled={npBusy || busyId !== null || (!owned && !canBuy(np.coinCost))}
                      aria-pressed={nameplateId === np.id}
                      title={owned ? undefined : canBuy(np.coinCost) ? 'Satın al' : 'Mağazadan satın al'}
                      className={`flex flex-col gap-2 rounded-xl border-2 p-3 text-left transition-all hover:-translate-y-0.5 disabled:hover:translate-y-0 ${
                        nameplateId === np.id ? 'border-[var(--focus)] shadow-lg' : 'border-[var(--border)]'
                      } bg-[var(--card-bg)] ${owned ? '' : 'opacity-60'}`}
                    >
                      <div className="flex min-h-[28px] items-center">
                        <Nameplate nameplateId={np.id} className="text-xs font-bold">
                          {displayName}
                        </Nameplate>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="truncate text-[11px] font-bold text-[var(--text)]">{np.name}</span>
                        <span className="shrink-0 text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                          {nameplateId === np.id
                            ? '✓ Aktif'
                            : owned
                              ? NAMEPLATE_RARITY_LABEL[np.rarity]
                              : lockLabel(np.coinCost ?? 0, balance)}
                        </span>
                      </div>
                    </button>
                  )
                })}
                <StoreCta />
              </div>
            )}

            {area === 'cerceve' && (
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
                {PROFILE_FRAMES.map((frm) => {
                  const owned = isFrameOwned(frm)
                  return (
                    <div key={frm.id} className="flex flex-col items-center gap-1.5">
                      <FrameDot
                        frame={frm}
                        active={frameId === frm.id}
                        onClick={() => owned && applyFrame(frm.id)}
                        className={owned ? '' : 'opacity-50'}
                      />
                      <span
                        className="text-center text-[8px] font-bold leading-none"
                        style={{ color: FRAME_RARITY_COLOR[frm.rarity] }}
                      >
                        {frm.id === 'none' ? 'Yok' : frm.name}
                      </span>
                      {!owned && (
                        canBuy(frm.coinCost) ? (
                          <button
                            onClick={() =>
                              setBuyTarget({
                                category: 'frame',
                                id: frm.id,
                                name: frm.name,
                                cost: frm.coinCost ?? 0,
                                onOwned: applyFrame,
                              })
                            }
                            disabled={busyId !== null}
                            className="text-center text-[8px] font-bold leading-none text-[var(--reward)] hover:underline disabled:opacity-50"
                          >
                            {lockLabel(frm.coinCost ?? 0, balance)}
                          </button>
                        ) : (
                          <Link
                            href="/arena/magaza"
                            className="text-center text-[8px] font-bold leading-none text-[var(--reward)] hover:underline"
                          >
                            {lockLabel(frm.coinCost ?? 0, balance)}
                          </Link>
                        )
                      )}
                    </div>
                  )
                })}
                <StoreCta />
              </div>
            )}

            {area === 'sus' && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] text-[var(--text-muted)]">Birden fazla süs takabilirsin ✨</p>
                  {decorationIds.length > 0 && (
                    <button
                      onClick={clearDecorations}
                      disabled={decoBusy}
                      className="text-[10px] font-bold text-[var(--urgency)] hover:underline disabled:opacity-50"
                    >
                      Temizle ({decorationIds.length})
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {AVATAR_DECORATIONS.map((d) => {
                    const active = decorationIds.includes(d.id)
                    const wearable = canWearDeco(d.id)
                    return (
                      <button
                        key={d.id}
                        onClick={() => toggleDecoration(d.id)}
                        disabled={decoBusy || !wearable}
                        aria-pressed={active}
                        title={wearable ? undefined : 'Mağazadan satın al'}
                        className={`flex items-center gap-2 rounded-xl border-2 p-3 text-left transition-all hover:-translate-y-0.5 disabled:hover:translate-y-0 ${
                          active ? 'border-[var(--focus)] shadow-lg' : 'border-[var(--border)]'
                        } bg-[var(--card-bg)] ${!wearable ? 'opacity-60' : ''}`}
                      >
                        <span className="text-xl">{d.icon}</span>
                        <span className="min-w-0">
                          <span className="block truncate text-[11px] font-bold text-[var(--text)]">{d.name}</span>
                          <span className="block text-[9px] text-[var(--text-muted)]">
                            {active
                              ? '✓ Takılı'
                              : wearable
                                ? DECORATION_RARITY_LABEL[d.rarity]
                                : `🔒 🪙${d.coinCost}`}
                          </span>
                        </span>
                      </button>
                    )
                  })}
                  <StoreCta />
                </div>
              </div>
            )}

            {area === 'rozet' && (
              <div className="flex flex-col gap-3">
                <p className="rounded-xl border border-[var(--border)] bg-[var(--card-bg)] p-3 text-xs text-[var(--text-sub)]">
                  Sahip olduğun rozetler profilinde otomatik sergilenir. Yeni rozetleri Mağaza&apos;dan al.
                </p>
                <CosmeticBadgeShelf
                  ownedSlugs={profile.owned_cosmetic_badges ?? []}
                  allOwned={staff}
                />
                <StoreCta />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Yerinde satın alma onayı — kilitli ama bakiyesi yeten ürüne tıklanınca */}
      <CosmeticPurchaseDialog
        open={buyTarget !== null}
        itemName={buyTarget?.name ?? ''}
        cost={buyTarget?.cost ?? 0}
        balance={balance}
        busy={busyId !== null}
        onCancel={() => setBuyTarget(null)}
        onConfirm={confirmPurchase}
      />
    </div>
  )
}

/* ── Arka plan grid'i (zemin + kart ortak) ── */
function BackgroundGrid({
  items,
  selectedId,
  noneLabel,
  onSelect,
  isOwned,
  balance,
  onBuy,
  canBuy,
  busy,
}: {
  items: StoreBackgroundItem[]
  selectedId: string
  noneLabel: string
  onSelect: (id: string) => void
  /** Sahip olunmayanlar da listelenir; kilitli görünür ve seçilemez. */
  isOwned: (b: StoreBackgroundItem) => boolean
  balance: number
  /** Kilitli + bakiyesi yeten ürüne tıklanınca satın alma onayını açar. */
  onBuy: (b: StoreBackgroundItem) => void
  canBuy: (cost: number | undefined) => boolean
  busy: boolean
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {items.map((b) => {
        const selected = selectedId === b.id
        const owned = isOwned(b)
        return (
          <button
            key={b.id}
            onClick={() => {
              if (owned) return onSelect(b.id)
              if (canBuy(b.coinCost)) onBuy(b)
            }}
            disabled={busy || (!owned && !canBuy(b.coinCost))}
            aria-pressed={selected}
            aria-label={b.id === 'none' ? noneLabel : b.name}
            title={owned ? undefined : canBuy(b.coinCost) ? 'Satın al' : 'Mağazadan satın al'}
            className={`group flex flex-col gap-2 rounded-xl border-2 p-2 text-left transition-all hover:-translate-y-0.5 disabled:hover:translate-y-0 ${
              selected ? 'border-[var(--focus)] shadow-lg' : 'border-[var(--border)]'
            } bg-[var(--card-bg)] ${owned ? '' : 'opacity-60'}`}
          >
            <div className="relative h-16 w-full overflow-hidden rounded-lg">
              {b.id === 'none' ? (
                <div className="grid h-full place-items-center bg-[var(--bg-secondary)] text-[10px] font-bold text-[var(--text-muted)]">
                  {noneLabel}
                </div>
              ) : b.kind === 'video' ? (
                b.posterUrl ? (
                  <img src={b.posterUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="grid h-full place-items-center bg-[var(--surface)] text-lg">🎬</div>
                )
              ) : (
                <div className={`h-full w-full ${b.animClass ?? ''}`} style={{ background: b.css }} />
              )}
              {b.kind === 'video' && (
                <span className="absolute right-1 top-1 rounded bg-black/55 px-1 text-[8px] font-bold text-white">
                  VIDEO
                </span>
              )}
            </div>
            <div className="flex items-center justify-between">
              <span className="truncate text-[11px] font-bold text-[var(--text)]">
                {b.id === 'none' ? noneLabel : b.name}
              </span>
              {selected ? (
                <span className="shrink-0 text-[10px] font-bold text-[var(--growth)]">✓</span>
              ) : !owned ? (
                <span className="shrink-0 text-[9px] font-bold text-[var(--reward)]">
                  {lockLabel(b.coinCost ?? 0, balance)}
                </span>
              ) : null}
            </div>
          </button>
        )
      })}
      <StoreCta />
    </div>
  )
}

/**
 * Kilitli ürün etiketi — üç durumun üçüncüsü.
 *
 * Bakiye yetiyorsa fiyatı, yetmiyorsa NE KADAR EKSİK olduğunu yazar. İkincisi
 * bu değişikliğin çekirdeği: kullanıcı bugüne kadar bir ürüne ne kadar uzakta
 * olduğunu hiçbir ekranda göremiyordu.
 */
function lockLabel(coinCost: number, balance: number): string {
  const missing = coinCost - balance
  return missing > 0 ? `🔒 🪙${missing} daha` : `🔓 🪙${coinCost}`
}

/* ── Mağaza yönlendirme kartı ── */
function StoreCta() {
  return (
    <Link
      href="/arena/magaza"
      className="flex min-h-[40px] flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-[var(--border)] p-3 text-center text-[var(--text-sub)] transition-colors hover:border-[var(--focus)] hover:text-[var(--focus)]"
    >
      <span className="text-lg">🛍️</span>
      <span className="text-[10px] font-bold">Mağazada daha fazlası</span>
    </Link>
  )
}
