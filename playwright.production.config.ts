import { defineConfig } from '@playwright/test'
import baseConfig from './playwright.config'

const port = Number(process.env.E2E_PROD_PORT ?? 3200)
// Dağıtılmış bir ortamı (ör. Vercel preview) ölçmek için yerel sunucu yerine
// E2E_PROD_BASE_URL verilebilir.
const externalBaseURL = process.env.E2E_PROD_BASE_URL
const baseURL = externalBaseURL ?? `http://localhost:${port}`

// Üretim paketine karşı koşan kapılar (*.prod.spec.ts). Önce `npm run build`.
export default defineConfig({
  ...baseConfig,
  testIgnore: undefined,
  testMatch: /.*\.prod\.spec\.ts$/,
  use: { ...baseConfig.use, baseURL },
  webServer: externalBaseURL
    ? undefined
    : {
        command: `npm run start -- -p ${port}`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
})
