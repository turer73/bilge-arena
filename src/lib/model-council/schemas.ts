/**
 * Tur govdesinin dogrulama semasi.
 *
 * NEDEN TEK GARANTI BURASI: katilimcilarin yarisi sema dayatamayan
 * saglayicilar. Anthropic'te JSON modu yok (yalniz prompt), OpenAI-uyumlu
 * `json_object` "gecerli JSON" der ama SEMA UYUMU demez. Yani hicbir
 * saglayici `stance` alaninin gecerli bir enum degeri oldugunu garanti
 * etmiyor — bu dosya ediyor.
 *
 * KIRPMA DEGIL, RED: bir tur semaya uymuyorsa `run-turn.ts` onu `failed`
 * sayar ve tartismaya SOKMAZ. Yarim ayristirilmis bir turu "abstain" gibi
 * kabul etmek, sessizce bir katilimciyi susturup uzlasma sayimini kaydirirdi.
 */

import { z } from 'zod'
import type { Stance } from './types'

const STANCES = ['propose', 'agree', 'refine', 'disagree', 'abstain'] as const satisfies readonly Stance[]

/**
 * Uzunluk tavanlari kotu niyet icin degil, KAZA icin: kacak bir model tum
 * baglami `position` alanina kopyalarsa sonraki turun prompt'u sisip
 * MAX_TOKENS'a carpar ve tartisma orta yerde olur.
 */
export const turnPayloadSchema = z.object({
  reasoning: z.string().min(1).max(8000),
  stance: z.enum(STANCES),
  position: z.string().min(1).max(4000),
  // Model alani hic uretmezse tartisma yine ilerlemeli: atif ZORUNLU degil.
  respondsTo: z.array(z.string().min(1).max(64)).max(24).default([]),
  openQuestions: z.array(z.string().min(1).max(1000)).max(12).default([]),
  blocking: z.boolean().default(false),
})

export type TurnPayloadParsed = z.infer<typeof turnPayloadSchema>
