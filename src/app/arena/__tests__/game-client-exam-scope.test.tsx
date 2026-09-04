import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

const routeState = vi.hoisted(() => ({ game: 'wordquest' }))
const searchState = vi.hoisted(() => ({ query: '' }))
const routerReplace = vi.hoisted(() => vi.fn())
const authState = vi.hoisted(() => ({
  profile: null as { exam_type: string | null } | null,
  loading: false,
}))
const gameState = vi.hoisted(() => ({
  selectedExamRef: 'TYT' as string | null,
  selectedMode: 'classic',
  setExamRef: vi.fn(),
  setMode: vi.fn(),
  setCategory: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useParams: () => ({ game: routeState.game }),
  useRouter: () => ({ replace: routerReplace }),
  useSearchParams: () => new URLSearchParams(searchState.query),
}))
vi.mock('@/stores/auth-store', () => ({ useAuthStore: () => authState }))
vi.mock('@/stores/game-store', () => ({
  useGameStore: (selector: (state: typeof gameState) => unknown) => selector(gameState),
}))
vi.mock('next/dynamic', () => ({
  default: () => ({ game }: { game: string }) => (
    <input data-testid="quiz-engine" defaultValue={game} />
  ),
}))

import GameClient from '../[game]/game-client'

describe('GameClient exam scope', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_TYT_SOCIAL_V2_ENABLED', 'false')
    routeState.game = 'wordquest'
    searchState.query = ''
    authState.profile = null
    authState.loading = false
    gameState.selectedExamRef = 'TYT'
    gameState.selectedMode = 'classic'
    gameState.setExamRef.mockReset()
    gameState.setMode.mockReset()
    gameState.setCategory.mockReset()
    routerReplace.mockReset()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it.each(['TYT', 'LGS'] as const)(
    'legacy profilde onceki dersin %s tercihini Wordquest rotasinda korur',
    async (examRef) => {
      gameState.selectedExamRef = examRef
      render(<GameClient />)

      await waitFor(() => expect(gameState.setExamRef).not.toHaveBeenCalled())
      expect(gameState.selectedExamRef).toBe(examRef)
      expect(routerReplace).not.toHaveBeenCalled()
    },
  )

  it('Wordquest tercihi zaten null ise gereksiz store yazimi yapmaz', async () => {
    gameState.selectedExamRef = null
    render(<GameClient />)

    await waitFor(() => expect(gameState.setExamRef).not.toHaveBeenCalled())
  })

  it('legacy profilde gecerli Matematik filtresini korur', async () => {
    routeState.game = 'matematik'
    render(<GameClient />)

    await waitFor(() => expect(gameState.setExamRef).not.toHaveBeenCalled())
  })

  it('URL exam_ref degerini oyun kapsaminda normalize edip store a uygular', async () => {
    routeState.game = 'matematik'
    searchState.query = 'exam_ref=ayt-ea'
    gameState.selectedExamRef = 'TYT'

    render(<GameClient />)

    await waitFor(() => expect(gameState.setExamRef).toHaveBeenCalledWith('AYT-EA'))
  })

  it('kategori query sini URL deki sinav baglamiyla ayni renderda dogrular', async () => {
    routeState.game = 'turkce'
    searchState.query = 'exam_ref=ayt-soz&category=edebiyat'
    gameState.selectedExamRef = 'TYT'

    render(<GameClient />)

    await waitFor(() => expect(gameState.setExamRef).toHaveBeenCalledWith('AYT-SOZ'))
    expect(gameState.setCategory).toHaveBeenCalledWith('edebiyat')
  })

  it('gecersiz URL exam_ref degerini kullanmaz ve profil defaultuna duser', async () => {
    routeState.game = 'fen'
    searchState.query = 'exam_ref=bilinmeyen'
    authState.profile = { exam_type: 'lgs' }
    gameState.selectedExamRef = 'AYT-EA'

    render(<GameClient />)

    await waitFor(() => expect(gameState.setExamRef).toHaveBeenCalledWith('LGS'))
    expect(gameState.setExamRef).not.toHaveBeenCalledWith('BILINMEYEN')
  })

  it('learner rollout kapalıyken LGS Social rotası profili TYTye zorlamaz', async () => {
    routeState.game = 'sosyal'
    authState.profile = { exam_type: 'lgs' }
    gameState.selectedExamRef = null

    render(<GameClient />)

    await waitFor(() => expect(gameState.setExamRef).toHaveBeenCalledWith('LGS'))
    expect(gameState.setExamRef).not.toHaveBeenCalledWith('TYT')
  })

  it('learner rollout açıkken bile LGS profili TYT yerine LGS varsayılanını korur', async () => {
    vi.stubEnv('NEXT_PUBLIC_TYT_SOCIAL_V2_ENABLED', 'true')
    routeState.game = 'sosyal'
    authState.profile = { exam_type: 'lgs' }
    gameState.selectedExamRef = null

    render(<GameClient />)

    await waitFor(() => expect(gameState.setExamRef).toHaveBeenCalledWith('LGS'))
    expect(gameState.setExamRef).not.toHaveBeenCalledWith('TYT')
  })

  it('profil yüklenmeden TYT fallback yazmaz ve sonradan gelen LGS kapsamını korur', async () => {
    vi.stubEnv('NEXT_PUBLIC_TYT_SOCIAL_V2_ENABLED', 'true')
    routeState.game = 'sosyal'
    authState.loading = true
    gameState.selectedExamRef = null

    const { rerender } = render(<GameClient />)
    await waitFor(() => expect(gameState.setExamRef).not.toHaveBeenCalled())

    authState.profile = { exam_type: 'lgs' }
    authState.loading = false
    rerender(<GameClient />)

    await waitFor(() => expect(gameState.setExamRef).toHaveBeenCalledWith('LGS'))
    expect(gameState.setExamRef).not.toHaveBeenCalledWith('TYT')
  })

  it('kurum practice mode query sini dar allowlist ile store a uygular', async () => {
    routeState.game = 'matematik'
    searchState.query = 'exam_ref=TYT&category=sayilar&mode=PRACTICE'

    render(<GameClient />)

    await waitFor(() => expect(gameState.setMode).toHaveBeenCalledWith('practice'))
  })

  it('allowlist disindaki mode query sini store a yazmaz', async () => {
    routeState.game = 'matematik'
    searchState.query = 'exam_ref=TYT&mode=deneme'

    render(<GameClient />)

    await waitFor(() => expect(gameState.setMode).not.toHaveBeenCalled())
  })

  it('ders rotası değişince quiz engine kapsamını yeniden mount eder', () => {
    routeState.game = 'matematik'
    const { rerender } = render(<GameClient />)
    const previousEngine = screen.getByTestId('quiz-engine')
    fireEvent.change(previousEngine, { target: { value: 'eski-aktif-oyun' } })

    routeState.game = 'turkce'
    rerender(<GameClient />)

    const nextEngine = screen.getByTestId('quiz-engine')
    expect(nextEngine).not.toBe(previousEngine)
    expect(nextEngine).toHaveValue('turkce')
  })
})
