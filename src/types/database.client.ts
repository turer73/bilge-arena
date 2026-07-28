import type { Database as GeneratedDatabase } from './database.generated'

type PublicSchema = GeneratedDatabase['public']
type GeneratedFunctions = PublicSchema['Functions']
type CompleteGameSession = GeneratedFunctions['complete_game_session']

/**
 * Supabase CLI function arguments cannot express PostgreSQL parameter nullability.
 * Migration 081 intentionally accepts NULL category/difficulty and persists them as
 * optional session filters, so keep that verified SQL contract as a narrow override.
 */
type CompleteGameSessionArgs = Omit<
  CompleteGameSession['Args'],
  'p_category' | 'p_filter_difficulty'
> & {
  p_category: string | null
  p_filter_difficulty: number | null
}

export type Database = Omit<GeneratedDatabase, 'public'> & {
  public: Omit<PublicSchema, 'Functions'> & {
    Functions: Omit<GeneratedFunctions, 'complete_game_session'> & {
      complete_game_session: Omit<CompleteGameSession, 'Args'> & {
        Args: CompleteGameSessionArgs
      }
    }
  }
}
