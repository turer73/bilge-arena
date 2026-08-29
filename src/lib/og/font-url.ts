const PRODUCTION_ORIGIN = 'https://bilgearena.com'
const FONT_PATH = '/fonts/Inter-Bold.woff'

function isVercelDeploymentHost(host: string): boolean {
  return /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*\.vercel\.app$/i.test(host)
}

export function getInterBoldUrl(): string {
  const deploymentHost = process.env.VERCEL_URL?.trim().toLowerCase()
  if (deploymentHost && isVercelDeploymentHost(deploymentHost)) {
    return `https://${deploymentHost}${FONT_PATH}`
  }

  const configuredSite = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  if (configuredSite) {
    try {
      const url = new URL(configuredSite)
      const productionHost = url.hostname === 'bilgearena.com' || url.hostname === 'www.bilgearena.com'
      const localDevelopment = process.env.NODE_ENV !== 'production'
        && url.protocol === 'http:'
        && (url.hostname === 'localhost' || url.hostname === '127.0.0.1')
      if ((url.protocol === 'https:' && productionHost) || localDevelopment) {
        return new URL(FONT_PATH, url.origin).toString()
      }
    } catch {
      // Invalid or untrusted configuration falls back to the canonical asset.
    }
  }

  return `${PRODUCTION_ORIGIN}${FONT_PATH}`
}
