// Light is the default for bright-room demos; the original dark design is opt-in.
export const THEME_KEY = 'crimemap-theme';
export function normalizeTheme(value) {
  return value === 'dark' ? 'dark' : 'light';
}
export function readTheme(storage = typeof window === 'undefined' ? null : window.localStorage) {
  try { return normalizeTheme(storage?.getItem(THEME_KEY)); }
  catch { return 'light'; } // Blocked storage must not prevent login.
}
export function applyTheme(theme, root = document.documentElement, storage = window.localStorage) {
  const next = normalizeTheme(theme);
  root.dataset.theme = next;
  root.style.colorScheme = next;
  root.ownerDocument?.querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', next === 'light' ? '#f1f5fb' : '#0a1220');
  try { storage?.setItem(THEME_KEY, next); } catch { /* private browsing */ }
  return next;
}
