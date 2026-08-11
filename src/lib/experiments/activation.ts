export const ACTIVATION_EXPERIMENT = 'home_first_value_v1'
export const ACTIVATION_VARIANT_STORAGE_KEY = 'ba-activation-v1'
export const ACTIVATION_RESULT_STORAGE_KEY = 'ba-activation-last-result'
export const ACTIVATION_EXPERIMENT_ENABLED =
  process.env.NEXT_PUBLIC_ACTIVATION_EXPERIMENT_ENABLED === 'true'
const ACTIVATION_EXPOSURE_SESSION_KEY = 'ba-activation-exposure-v1'

export type ActivationVariant = 'control' | 'micro'

/**
 * Ana sayfa A/B varyantini ilk boyamadan once sabitler.
 *
 * Sunucu sayfasini dinamiklestirmemek icin atama first-party localStorage'da
 * tutulur. `?activation=control|micro` yalniz QA oturumu icin gecici override'dir;
 * kalici atamayi degistirmez.
 */
export const ACTIVATION_EXPERIMENT_BOOTSTRAP_SCRIPT = `
(function () {
  var fallback = 'control';
  try {
    var enabled = ${JSON.stringify(ACTIVATION_EXPERIMENT_ENABLED)};
    if (!enabled) {
      document.documentElement.dataset.activationVariant = fallback;
      return;
    }
    var override = new URLSearchParams(window.location.search).get('activation');
    var stored = window.localStorage.getItem('${ACTIVATION_VARIANT_STORAGE_KEY}');
    var validStored = stored === 'control' || stored === 'micro';
    var validOverride = override === 'control' || override === 'micro';
    var variant = validOverride
      ? override
      : validStored
        ? stored
        : (Math.random() < 0.5 ? 'control' : 'micro');

    if (!validOverride && !validStored) {
      window.localStorage.setItem('${ACTIVATION_VARIANT_STORAGE_KEY}', variant);
    }
    document.documentElement.dataset.activationVariant = variant;
  } catch (_) {
    document.documentElement.dataset.activationVariant = fallback;
  }
})();`

export function getActivationVariant(): ActivationVariant {
  if (typeof document === 'undefined') return 'control'
  return document.documentElement.dataset.activationVariant === 'micro' ? 'micro' : 'control'
}

export function markActivationExposure(variant: ActivationVariant): void {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(ACTIVATION_EXPOSURE_SESSION_KEY, variant)
  } catch {}
}

export function getActivationExposure(): ActivationVariant | null {
  if (typeof window === 'undefined') return null
  try {
    const value = window.sessionStorage.getItem(ACTIVATION_EXPOSURE_SESSION_KEY)
    return value === 'control' || value === 'micro' ? value : null
  } catch {
    return null
  }
}
