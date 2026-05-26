// Next.js 16.2.6'da next/dist/compiled/@next/font/dist/google/index.d.ts
// otomatik uretilmiyor; standalone tsc icin eksik Google Font exportlarini bildiriyoruz.
// next build kendi plugin'i ile dogru cozuyor, bu sadece `tsc --noEmit` icindir.
declare module 'next/dist/compiled/@next/font/dist/google' {
  import type { NextFontWithVariable } from 'next/dist/compiled/@next/font/dist/types'

  type GoogleFontOptions = {
    weight?: string | string[]
    style?: string | string[]
    subsets?: string[]
    display?: 'auto' | 'block' | 'swap' | 'fallback' | 'optional'
    variable?: string
    preload?: boolean
    fallback?: string[]
    adjustFontFallback?: boolean | string
  }

  type GoogleFontFn = (options: GoogleFontOptions) => NextFontWithVariable

  export const Cinzel: GoogleFontFn
  export const DM_Sans: GoogleFontFn
  export const Inter: GoogleFontFn
  export const Roboto: GoogleFontFn
  export const Open_Sans: GoogleFontFn
  export const Lato: GoogleFontFn
  export const Poppins: GoogleFontFn
  export const Montserrat: GoogleFontFn
  export const Source_Code_Pro: GoogleFontFn
  export const Nunito: GoogleFontFn
  export const Raleway: GoogleFontFn
  export const Playfair_Display: GoogleFontFn
  export const Merriweather: GoogleFontFn
  export const Ubuntu: GoogleFontFn
  export const Oswald: GoogleFontFn
}
