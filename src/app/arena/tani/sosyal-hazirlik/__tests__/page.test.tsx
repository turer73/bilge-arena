import { expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ connection: vi.fn() }))
vi.mock('next/server', () => ({ connection: mocks.connection }))
vi.mock('../preparation-client', () => ({ default: () => null }))
import Page from '../page'
it('waits for a request before rendering the nonce-protected document', async () => {
  let release: () => void = () => {}
  mocks.connection.mockImplementation(() => new Promise<void>(resolve => { release = resolve }))
  let rendered = false
  const result = Page().then(page => { rendered = true; return page })
  await Promise.resolve()
  expect(mocks.connection).toHaveBeenCalledOnce()
  expect(rendered).toBe(false)
  release()
  expect(await result).toBeTruthy()
})
