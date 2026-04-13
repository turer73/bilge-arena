import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

// Her test sonrası React DOM temizliği
afterEach(() => {
  cleanup()
})

// ---------- Global Mock'lar ----------

// next/navigation mock
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}))

// next/image mock — basit <img> olarak render et
vi.mock('next/image', () => ({
  // eslint-disable-next-line jsx-a11y/alt-text
  default: (props: Record<string, unknown>) => {
    const { fill, priority, ...rest } = props
    return <img alt="" {...rest} />
  },
}))

// framer-motion mock — animasyonsuz render
vi.mock('framer-motion', async () => {
  const React = await import('react')
  const actual = await vi.importActual<typeof import('framer-motion')>('framer-motion')
  return {
    ...actual,
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
    motion: new Proxy(
      {},
      {
        get: (_target, prop: string) => {
          // motion.div, motion.span, vb. → normal HTML element
          return ({ children, ...props }: Record<string, unknown>) => {
            const safeProps = Object.fromEntries(
              Object.entries(props).filter(
                ([key]) =>
                  !['initial', 'animate', 'exit', 'transition', 'variants', 'whileHover', 'whileTap', 'whileInView', 'layout', 'layoutId'].includes(key)
              )
            )
            return React.createElement(prop, safeProps, children as React.ReactNode)
          }
        },
      }
    ),
  }
})

// Supabase client mock
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn().mockReturnThis(),
      returns: vi.fn().mockReturnThis(),
    })),
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
  }),
}))
