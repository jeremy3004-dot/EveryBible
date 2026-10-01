'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface MobileMenuItem {
  label: string;
  href: string;
  emphasis?: boolean;
}

interface MobileMenuProps {
  items: MobileMenuItem[];
  ctaLabel: string;
  ctaHref: string;
  menuLabel: string;
  closeLabel: string;
}

const SHEET_ID = 'site-mobile-sheet';

/**
 * Compact-width navigation: Get the app + a Menu button that opens a sheet
 * listing every primary link. Closes on Escape, link click, outside tap, or
 * growing past the mobile breakpoint; focus moves into the sheet and returns
 * to the button.
 */
export function MobileMenu({ items, ctaLabel, ctaHref, menuLabel, closeLabel }: MobileMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const wasOpen = useRef(false);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (open) {
      sheetRef.current?.querySelector<HTMLElement>('a')?.focus();
    } else if (wasOpen.current) {
      buttonRef.current?.focus();
    }
    wasOpen.current = open;
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && !rootRef.current?.contains(target)) close();
    };
    const desktop = window.matchMedia('(min-width: 860px)');
    const onBreakpoint = () => {
      if (desktop.matches) close();
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    desktop.addEventListener('change', onBreakpoint);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
      desktop.removeEventListener('change', onBreakpoint);
    };
  }, [open, close]);

  return (
    <div className="site-mobile-menu" ref={rootRef}>
      <a className="site-mobile-menu__cta" href={ctaHref}>
        {ctaLabel}
      </a>
      <button
        ref={buttonRef}
        type="button"
        className="site-mobile-menu__toggle"
        aria-expanded={open}
        aria-controls={SHEET_ID}
        onClick={() => setOpen((value) => !value)}
      >
        <svg
          className="site-mobile-menu__icon"
          width="20"
          height="20"
          viewBox="0 0 20 20"
          aria-hidden="true"
          focusable="false"
        >
          {open ? <path d="M5 5l10 10M15 5L5 15" /> : <path d="M3 5.5h14M3 10h14M3 14.5h14" />}
        </svg>
        <span className="site-mobile-menu__label">{open ? closeLabel : menuLabel}</span>
      </button>

      <div
        id={SHEET_ID}
        ref={sheetRef}
        className="site-mobile-sheet"
        role="region"
        aria-label={menuLabel}
        hidden={!open}
      >
        <nav aria-label="Mobile">
          {items.map((item) => (
            <a
              key={item.href + item.label}
              href={item.href}
              className={
                item.emphasis
                  ? 'site-mobile-sheet__link site-mobile-sheet__link--give'
                  : 'site-mobile-sheet__link'
              }
              onClick={close}
            >
              {item.label}
            </a>
          ))}
        </nav>
        <a className="site-mobile-sheet__cta" href={ctaHref} onClick={close}>
          {ctaLabel}
        </a>
      </div>
    </div>
  );
}
