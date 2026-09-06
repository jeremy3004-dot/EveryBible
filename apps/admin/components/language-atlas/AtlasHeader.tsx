'use client';

import Link from 'next/link';
import type { KeyboardEvent } from 'react';
import { ThemeToggle } from '@/components/ThemeToggle';
import { adminNavigation } from '@/lib/admin-navigation';
import { formatCount, KIND_LABELS, scriptureStatus } from '@/lib/language-atlas/model';
import { scriptureVisualCategory } from '@/lib/language-atlas/presentation';
import type { AtlasRecord } from '@/lib/language-atlas/types';

function SearchIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <circle cx="10.8" cy="10.8" r="6.6" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="m16 16 4.1 4.1"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path
        d="M5 7h14M5 12h14M5 17h14"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

interface Props {
  query: string;
  resultCount: number;
  results: AtlasRecord[];
  popoverOpen: boolean;
  activeResult: number;
  onQuery: (query: string) => void;
  onOpen: () => void;
  onClose: () => void;
  onActiveResult: (index: number) => void;
  onSelect: (id: string) => void;
  onViewAll: () => void;
}

export function AtlasHeader(props: Props) {
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      props.onClose();
      return;
    }
    if (!props.popoverOpen || !props.results.length) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      props.onActiveResult((props.activeResult + 1) % props.results.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      props.onActiveResult(
        props.activeResult < 0
          ? props.results.length - 1
          : (props.activeResult - 1 + props.results.length) % props.results.length
      );
    } else if (
      event.key === 'Enter' &&
      props.activeResult >= 0 &&
      props.activeResult < props.results.length
    ) {
      event.preventDefault();
      props.onSelect(props.results[props.activeResult].id);
    }
  };

  return (
    <header className="la-appbar">
      <div className="la-brand-area">
        <details className="la-admin-menu">
          <summary aria-label="Open admin navigation">
            <MenuIcon />
            <span>Admin</span>
          </summary>
          <nav aria-label="Admin navigation">
            {adminNavigation.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={item.href === '/languages' ? 'page' : undefined}
              >
                <span>{item.label}</span>
                <small>{item.description}</small>
              </Link>
            ))}
          </nav>
        </details>
        <Link className="la-brand" href="/" aria-label="EveryBible Admin home">
          <span className="la-brand-mark">EB</span>
          <span>EveryBible</span>
        </Link>
      </div>

      <div className="la-search-wrap">
        <label className="la-search">
          <span className="la-sr-only">Search language names, aliases or identifiers</span>
          <SearchIcon />
          <input
            type="search"
            value={props.query}
            onChange={(event) => props.onQuery(event.target.value)}
            onFocus={props.onOpen}
            onKeyDown={handleKeyDown}
            placeholder="Search languages, dialects or people groups"
            autoComplete="off"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={props.popoverOpen && Boolean(props.query)}
            aria-controls="atlas-search-results"
            aria-activedescendant={
              props.popoverOpen &&
              props.activeResult >= 0 &&
              props.activeResult < props.results.length
                ? `atlas-search-result-${props.activeResult}`
                : undefined
            }
          />
          {props.query && (
            <button
              type="button"
              aria-label="Clear search"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => props.onQuery('')}
            >
              ×
            </button>
          )}
        </label>
        {props.popoverOpen && props.query && (
          <div className="la-search-popover">
            <div className="la-search-options" id="atlas-search-results" role="listbox">
              {props.results.map((record, index) => (
                <button
                  type="button"
                  role="option"
                  aria-selected={props.activeResult === index}
                  id={`atlas-search-result-${index}`}
                  key={record.id}
                  onMouseEnter={() => props.onActiveResult(index)}
                  onClick={() => props.onSelect(record.id)}
                >
                  <i
                    className={`la-dot la-dot--${scriptureVisualCategory(scriptureStatus(record))}`}
                  />
                  <span>
                    <strong>{record.name}</strong>
                    <small>
                      {KIND_LABELS[record.kind]} ·{' '}
                      {record.iso6393 ?? record.rolvCode ?? record.glottocode ?? record.id}
                    </small>
                  </span>
                </button>
              ))}
              {!props.results.length && <p>No records match “{props.query}”.</p>}
            </div>
            <button className="la-view-all" type="button" onClick={props.onViewAll}>
              View all {formatCount(props.resultCount)} results <span aria-hidden="true">→</span>
            </button>
          </div>
        )}
      </div>
      <div className="la-theme-area">
        <ThemeToggle />
      </div>
    </header>
  );
}
