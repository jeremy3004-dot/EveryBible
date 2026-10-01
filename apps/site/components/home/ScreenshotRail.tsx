'use client';

/* eslint-disable @next/next/no-img-element -- the screenshots are pre-sized WebP
   posters in public/, so a plain <img> with srcSet is all that is needed. */
import { useCallback, useEffect, useRef, useState } from 'react';

import type { HomeCopy } from '../../lib/home-copy';

const SHOT_NAMES = [
  '01-begin',
  '02-light-dark',
  '03-plans',
  '04-highlight',
  '05-gather',
  '06-language',
  '07-listen',
] as const;

const SHOT_SIZE = { width: 440, height: 956 } as const;

function Chevron({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d={direction === 'left' ? 'm15 5-7 7 7 7' : 'm9 5 7 7-7 7'} />
    </svg>
  );
}

/**
 * The live App Store screenshots in a scroll-snap rail. Touch swipes it
 * natively; the previous/next buttons (shown on wider screens) move one card.
 */
export function ScreenshotRail({ copy }: { copy: HomeCopy['app'] }) {
  const railRef = useRef<HTMLUListElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  const update = useCallback(() => {
    const rail = railRef.current;
    if (!rail) return;
    // In RTL scrollLeft is 0 at the start and runs negative toward the end, so
    // the distance travelled is its absolute value either way.
    const travelled = Math.abs(rail.scrollLeft);
    setAtStart(travelled <= 1);
    setAtEnd(travelled + rail.clientWidth >= rail.scrollWidth - 1);
  }, []);

  useEffect(() => {
    update();
    const rail = railRef.current;
    if (!rail || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(update);
    observer.observe(rail);
    return () => observer.disconnect();
  }, [update]);

  const scrollByCard = (direction: -1 | 1) => {
    const rail = railRef.current;
    const card = rail?.firstElementChild as HTMLElement | null;
    if (!rail || !card) return;
    const gap = parseFloat(getComputedStyle(rail).columnGap) || 0;
    // scrollBy is physical: "next" is leftward in RTL.
    const inline = getComputedStyle(rail).direction === 'rtl' ? -1 : 1;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    rail.scrollBy({
      left: direction * inline * (card.offsetWidth + gap),
      behavior: reduced ? 'auto' : 'smooth',
    });
  };

  return (
    <div className="home-rail">
      <ul
        className="home-rail__track"
        ref={railRef}
        onScroll={update}
        role="group"
        aria-label={copy.rail.label}
      >
        {SHOT_NAMES.map((name, index) => (
          <li className="home-rail__card" key={name}>
            <img
              src={`/everybible/store/${name}-440.webp`}
              srcSet={`/everybible/store/${name}-440.webp 440w, /everybible/store/${name}-880.webp 880w`}
              sizes="(min-width: 760px) 260px, 62vw"
              width={SHOT_SIZE.width}
              height={SHOT_SIZE.height}
              alt={copy.shots[index]?.alt ?? ''}
              loading={index < 2 ? undefined : 'lazy'}
              decoding={index < 2 ? undefined : 'async'}
            />
          </li>
        ))}
      </ul>
      <div className="home-rail__controls">
        <button
          type="button"
          className="home-rail__button"
          onClick={() => scrollByCard(-1)}
          disabled={atStart}
          aria-label={copy.rail.previous}
        >
          <Chevron direction="left" />
        </button>
        <button
          type="button"
          className="home-rail__button"
          onClick={() => scrollByCard(1)}
          disabled={atEnd}
          aria-label={copy.rail.next}
        >
          <Chevron direction="right" />
        </button>
      </div>
    </div>
  );
}
