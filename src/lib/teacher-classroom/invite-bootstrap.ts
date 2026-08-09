export const TEACHER_INVITE_SESSION_KEY = 'bilge-arena:teacher-invite-token'

/**
 * Runs synchronously in <head>, before every third-party script tag.
 * The URL fragment never reaches the server, so this first-party bootstrap
 * stages a valid token only long enough for the invitation client to consume it.
 */
export const TEACHER_INVITE_BOOTSTRAP_SCRIPT = `;(() => {
  if (!/^\\/arena\\/sinif\\/davet\\/?$/.test(window.location.pathname)) return;
  const storageKey = ${JSON.stringify(TEACHER_INVITE_SESSION_KEY)};
  try {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const token = params.get('token');
    window.sessionStorage.removeItem(storageKey);
    if (token && /^[A-Za-z0-9_-]{43}$/.test(token)) {
      window.sessionStorage.setItem(storageKey, token);
      window.setTimeout(() => window.sessionStorage.removeItem(storageKey), 60000);
    }
  } catch {}
  try {
    window.history.replaceState({}, '', window.location.pathname + window.location.search);
  } catch {}
})();`
