'use client';

import { useEffect } from 'react';

/** Scroll distance (px) past which the overlay header gets a solid surface. */
export const HEADER_SCROLL_THRESHOLD = 8;

export function isHeaderScrolled(scrollY: number): boolean {
  return scrollY > HEADER_SCROLL_THRESHOLD;
}

/**
 * Mirrors scroll position onto the enclosing header as `data-scrolled`, so the
 * transparent homepage header turns solid once content passes under it. Kept
 * separate so `SiteHeader` stays a server component.
 */
export function HeaderScrollState() {
  useEffect(() => {
    const header = document.querySelector<HTMLElement>('header.site-header');
    if (!header) return undefined;

    const sync = () => {
      if (isHeaderScrolled(window.scrollY)) header.setAttribute('data-scrolled', 'true');
      else header.removeAttribute('data-scrolled');
    };
    sync();
    window.addEventListener('scroll', sync, { passive: true });
    return () => window.removeEventListener('scroll', sync);
  }, []);

  return null;
}
