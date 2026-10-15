import { create } from 'zustand'
import type { Profile } from '@/types/database'
import type { User } from '@supabase/supabase-js'

/** Yerel alan degisikligi: yalniz verilen alanlar. */
export type ProfilePatch = Partial<Profile>

/**
 * Profil yazimlari icin sira kapisi.
 *
 * Profil store'a birden cok async kaynaktan yazilir: oturum acilisindaki
 * yukleme (sync/GET), refreshProfile (oturum kaydi, gunluk giris, profil
 * duzenleme sonrasi) ve bilesenlerin yerel alan yazimlari (tema, kozmetik,
 * gorunurluk). Cevaplar sirasiz gelebildigi icin daha once baslamis bir
 * istegin eski profili, daha yeni bir sonucu (ornegin gunluk giris sonrasi
 * XP) ya da kullanicinin az once yaptigi degisikligi ezebiliyordu.
 *
 * Kurallar (her istek BASLARKEN bilet alir):
 * - Istek basladiktan sonra daha yeni bir istegin cevabi uygulandiysa ya da
 *   profil sifirlandiysa (cikis, hesap degisimi) cevap tamamen atilir.
 * - Istek basladiktan sonra yapilan yerel yamalar (patchProfile) cevabin
 *   uzerine yeniden uygulanir: cevabin taze alanlari (orn. XP) kalir,
 *   kullanicinin degistirdigi alanlar (orn. tema) geri alinmaz. Yalniz
 *   yamada acikca verilen alanlar korunur; eski bir profil kopyasindan
 *   gelen diger alanlar asla korunmaz.
 *
 * Bilinen sinir: bilet istemcinin istegi baslattigi ani olcer, sunucunun
 * okuma anini degil. Yamadan once baslamis ama sunucuda yamadan SONRA
 * degisen bir alani okumus bir cevapta (orn. satin alma ile gunluk giris
 * odulu ayni anda coin yazarsa) yamanin degeri kazanir; bir sonraki profil
 * yuklemesi duzeltir. Kesin cozum sunucu tarafinda surum alani ister.
 */
export function createProfileWriteGate() {
  let lastTicket = 0
  let lastRemote = 0 // son uygulanan uzak cevabin bileti
  let lastReset = 0 // son sifirlamanin bileti
  let patches: Array<{ ticket: number; ownerId: string; patch: ProfilePatch }> = []

  return {
    /** Uzak istek baslarken cagrilir; donen bilet resolve'a verilir. */
    begin: () => ++lastTicket,

    /** Cikis / hesap degisimi: ondan once baslamis istekler tamamen atilir. */
    markReset: () => {
      lastReset = ++lastTicket
      patches = []
    },

    /** Yerel yama: ondan once baslamis isteklerin cevabina yeniden uygulanir. */
    markPatch: (ownerId: string, patch: ProfilePatch) => {
      patches.push({ ticket: ++lastTicket, ownerId, patch })
    },

    /**
     * Uzak cevabi degerlendirir: store'a yazilacak profil ya da (cevap
     * eskimisse) null doner.
     */
    resolve: (ticket: number, fetched: Profile): Profile | null => {
      if (ticket < lastReset || ticket < lastRemote) return null
      lastRemote = ticket
      // Bundan sonra kabul edilecek her cevabin bileti > ticket olacak.
      patches = patches.filter((entry) => entry.ticket > ticket)
      return patches.reduce<Profile>(
        (merged, entry) => (entry.ownerId === fetched.id ? { ...merged, ...entry.patch } : merged),
        fetched,
      )
    },
  }
}

/**
 * Store'un profil yazim eylemleri: kapiyi state okuma/yazma fonksiyonlarina
 * baglar. Gercek store ve testlerdeki sahte store ayni baglamayi kullanir.
 */
export function createProfileWriter(
  read: () => { userId: string | null; profile: Profile | null },
  writeProfile: (profile: Profile | null) => void,
) {
  const gate = createProfileWriteGate()
  return {
    setProfile: (profile: Profile | null) => {
      const { profile: prev } = read()
      if (!profile || !prev || prev.id !== profile.id) gate.markReset()
      writeProfile(profile)
    },
    patchProfile: (patch: ProfilePatch) => {
      const { userId, profile } = read()
      const ownerId = profile?.id ?? userId
      if (!ownerId) return
      gate.markPatch(ownerId, patch)
      // Profil henuz yuklenmediyse yama bekler; ilk cevaba uygulanir.
      if (profile) writeProfile({ ...profile, ...patch })
    },
    beginProfileFetch: () => gate.begin(),
    applyFetchedProfile: (ticket: number, profile: Profile) => {
      const next = gate.resolve(ticket, profile)
      if (!next) return false
      writeProfile(next)
      return true
    },
    /** Profil yazmadan sifirlama isaretler (signOut kendi set'ini yapar). */
    markReset: () => gate.markReset(),
  }
}

interface AuthState {
  user: User | null
  profile: Profile | null
  loading: boolean
  setUser: (user: User | null) => void
  /**
   * Profilin tamamini degistirir. null ya da baska hesap bir sifirlamadir.
   * Alan degisiklikleri icin patchProfile kullan: eski bir profil kopyasini
   * yaymak, araya giren taze degerleri (XP, coin) ezer.
   */
  setProfile: (profile: Profile | null) => void
  /** Guncel profile alan yamasi; ucustaki eski cevaplar bu alanlari geri alamaz. */
  patchProfile: (patch: ProfilePatch) => void
  /** Profil istegi baslarken bilet al (bkz. createProfileWriteGate). */
  beginProfileFetch: () => number
  /** Istek cevabini kapidan gecirip uygular; uygulandiysa true. */
  applyFetchedProfile: (ticket: number, profile: Profile) => boolean
  setLoading: (loading: boolean) => void
  signOut: () => void
}

export const useAuthStore = create<AuthState>((set, get) => {
  const profileWriter = createProfileWriter(
    () => ({ userId: get().user?.id ?? null, profile: get().profile }),
    (profile) => set({ profile }),
  )
  return {
    user: null,
    profile: null,
    loading: true,
    setUser: (user) => set({ user }),
    setProfile: profileWriter.setProfile,
    patchProfile: profileWriter.patchProfile,
    beginProfileFetch: profileWriter.beginProfileFetch,
    applyFetchedProfile: profileWriter.applyFetchedProfile,
    setLoading: (loading) => set({ loading }),
    signOut: () => {
      profileWriter.markReset()
      set({ user: null, profile: null })
    },
  }
})
