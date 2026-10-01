/* eslint-disable @next/next/no-img-element -- staticImageProps gives next/image's
   optimized srcset without its client component (see lib/static-image.ts). */
import {
  HOME_LOCALE_CODES,
  HOME_LOCALE_NATIVE_NAMES,
  hreflangFor,
  homePathFor,
  type HomeLocaleCodeOrEn,
} from '../lib/home-locale-meta';
import { footerColumns } from '../lib/site-content';
import { EVERY_LANGUAGE_URL } from '../lib/site-links';
import { staticImageProps } from '../lib/static-image';

const everyLanguageWordmark = staticImageProps('/everylanguage/wordmark-blue.png', 878, 242, {
  sizes: '104px',
});

const SWITCHER_CODES: readonly HomeLocaleCodeOrEn[] = ['en', ...HOME_LOCALE_CODES];

/**
 * Shared marketing footer. Used by the homepage and every static page. Pass
 * `localeCode` on a homepage to add the language switcher: a disclosure of all
 * 21 homepages by native name.
 */
export function SiteFooter({
  localeCode,
  languageLabel = 'Language',
  languageLocale = 'en',
  languageDir = 'ltr',
}: {
  localeCode?: HomeLocaleCodeOrEn;
  /** `copy.footer.languageLabel` of the page's language. */
  languageLabel?: string;
  /** `copy.locale` and `copy.dir`, so the label is read and laid out in its own language. */
  languageLocale?: string;
  languageDir?: 'ltr' | 'rtl';
} = {}) {
  return (
    <footer className="site-footer" aria-label="Site footer">
      <div className="wrap site-footer__inner">
        <div className="site-footer__top">
          <div className="site-footer__brand">
            <h2>EveryBible</h2>
            <p>
              Encouraging and equipping every person to seek intimacy with God every day in their
              own language.
            </p>

            {/* Parent-organisation lockup. The logo is a verified kit asset —
                never redraw, recolor, outline, stretch or shadow the mark, and
                always set explicit width and height. */}
            <a
              className="site-footer__parent"
              href={EVERY_LANGUAGE_URL}
              target="_blank"
              rel="noreferrer"
            >
              An
              <img {...everyLanguageWordmark} alt="Every Language" />
              project
            </a>
          </div>

          <div className="site-footer__columns">
            {footerColumns.map((column) => (
              <div key={column.title} className="site-footer__column">
                <h3>{column.title}</h3>
                <ul>
                  {column.links.map((link) => (
                    <li key={link.label}>
                      <a href={link.href}>{link.label}</a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {localeCode ? (
          <nav
            className="site-footer__languages"
            aria-label={languageLabel}
            lang={languageLocale}
            dir={languageDir}
          >
            <details>
              <summary>
                {languageLabel}:{' '}
                <span lang={hreflangFor(localeCode)}>{HOME_LOCALE_NATIVE_NAMES[localeCode]}</span>
              </summary>
              <ul>
                {SWITCHER_CODES.map((code) => (
                  <li key={code}>
                    <a
                      href={homePathFor(code)}
                      hrefLang={hreflangFor(code)}
                      lang={hreflangFor(code)}
                      aria-current={code === localeCode ? 'page' : undefined}
                    >
                      {HOME_LOCALE_NATIVE_NAMES[code]}
                    </a>
                  </li>
                ))}
              </ul>
            </details>
          </nav>
        ) : null}

        <div className="site-footer__bottom">
          <p className="site-footer__meta">A digital ministry. Free to use, free to share.</p>
          <div className="site-footer__legal">
            <a className="site-footer__support" href="/support">
              App support
            </a>
            <a href="/privacy">Privacy</a>
            <a href="/terms">Terms</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
