'use client';

import { useEffect, useState } from 'react';

import {
  ADMIN_THEME_STORAGE_KEY,
  applyAdminTheme,
  normalizeAdminTheme,
  persistAdminTheme,
  type AdminThemeMode,
} from '@/lib/theme';

function MoonIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20">
      <path
        d="M13.5 3.25a6.8 6.8 0 1 0 3.25 9.2A7.3 7.3 0 0 1 13.5 3.25Z"
        fill="currentColor"
      />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20">
      <path
        d="M10 4.1a1.1 1.1 0 0 1 1.1 1.1v.6a1.1 1.1 0 1 1-2.2 0v-.6A1.1 1.1 0 0 1 10 4.1Zm0 10a1.1 1.1 0 0 1 1.1 1.1v.6a1.1 1.1 0 1 1-2.2 0v-.6A1.1 1.1 0 0 1 10 14.1ZM4.1 10a1.1 1.1 0 0 1 1.1-1.1h.6a1.1 1.1 0 1 1 0 2.2h-.6A1.1 1.1 0 0 1 4.1 10Zm10 0a1.1 1.1 0 0 1 1.1-1.1h.6a1.1 1.1 0 1 1 0 2.2h-.6A1.1 1.1 0 0 1 14.1 10ZM6.18 6.18a1.1 1.1 0 0 1 1.56 0l.42.42a1.1 1.1 0 1 1-1.56 1.56l-.42-.42a1.1 1.1 0 0 1 0-1.56Zm5.66 5.66a1.1 1.1 0 0 1 1.56 0l.42.42a1.1 1.1 0 1 1-1.56 1.56l-.42-.42a1.1 1.1 0 0 1 0-1.56ZM13.82 6.18a1.1 1.1 0 0 1 0 1.56l-.42.42a1.1 1.1 0 1 1-1.56-1.56l.42-.42a1.1 1.1 0 0 1 1.56 0ZM8.16 11.84a1.1 1.1 0 0 1 0 1.56l-.42.42a1.1 1.1 0 1 1-1.56-1.56l.42-.42a1.1 1.1 0 0 1 1.56 0ZM10 6.6a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 0 0 0-6.8Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<AdminThemeMode>(() => {
    if (typeof document === 'undefined') {
      return 'light';
    }

    return normalizeAdminTheme(document.documentElement.dataset.theme);
  });

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== ADMIN_THEME_STORAGE_KEY) {
        return;
      }

      const nextTheme = normalizeAdminTheme(event.newValue);
      applyAdminTheme(nextTheme);
      setTheme(nextTheme);
    };

    window.addEventListener('storage', handleStorage);

    return () => {
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  const updateTheme = (nextTheme: AdminThemeMode) => {
    applyAdminTheme(nextTheme);
    persistAdminTheme(nextTheme);
    setTheme(nextTheme);
  };

  return (
    <div className="theme-toggle" role="group" aria-label="Theme mode" suppressHydrationWarning>
      <button
        type="button"
        className={`theme-toggle__button ${theme === 'dark' ? 'theme-toggle__button--active' : ''}`}
        aria-pressed={theme === 'dark'}
        onClick={() => updateTheme('dark')}
      >
        <MoonIcon />
        <span>Dark</span>
      </button>
      <button
        type="button"
        className={`theme-toggle__button ${theme === 'light' ? 'theme-toggle__button--active' : ''}`}
        aria-pressed={theme === 'light'}
        onClick={() => updateTheme('light')}
      >
        <SunIcon />
        <span>Light</span>
      </button>
    </div>
  );
}
