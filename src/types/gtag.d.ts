/* Google Analytics gtag global tip tanimlari */
interface Window {
  gtag: (...args: unknown[]) => void
  dataLayer: unknown[]
}
