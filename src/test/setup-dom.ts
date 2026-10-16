import { afterEach } from 'vitest'

// DOM eslestiricileri ve React DOM temizligi yalniz DOM ortaminda yuklenir (jsdom projesi
// ya da `@vitest-environment jsdom` yorumlu .ts dosyasi). Node ortaminda RTL ve jest-dom'u
// her dosyada yuklemek gereksiz maliyet. Iki ortamin ortak mock'lari setup-mocks.tsx'te.
if (typeof document !== 'undefined') {
  await import('@testing-library/jest-dom/vitest')
  const { cleanup } = await import('@testing-library/react')

  // Her test sonrası React DOM temizliği
  afterEach(() => {
    cleanup()
  })
}
