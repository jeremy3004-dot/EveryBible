export type AdminThemeMode = 'dark' | 'light';

export const ADMIN_THEME_STORAGE_KEY = 'everybible-admin-theme';

export function normalizeAdminTheme(value: string | null | undefined): AdminThemeMode {
  return value === 'dark' ? 'dark' : 'light';
}

export function getAdminThemeScript(): string {
  return `(function(){try{var key=${JSON.stringify(ADMIN_THEME_STORAGE_KEY)};var theme=localStorage.getItem(key)==='dark'?'dark':'light';var root=document.documentElement;root.dataset.theme=theme;root.style.colorScheme=theme;}catch(error){var root=document.documentElement;root.dataset.theme='light';root.style.colorScheme='light';}})();`;
}

export function applyAdminTheme(theme: AdminThemeMode): void {
  if (typeof document === 'undefined') {
    return;
  }

  const normalized = normalizeAdminTheme(theme);
  const root = document.documentElement;
  root.dataset.theme = normalized;
  root.style.colorScheme = normalized;
}

export function persistAdminTheme(theme: AdminThemeMode): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(ADMIN_THEME_STORAGE_KEY, normalizeAdminTheme(theme));
  } catch {
    // Ignore storage failures and keep the current in-memory theme.
  }
}
