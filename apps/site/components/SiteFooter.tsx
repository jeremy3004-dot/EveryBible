import Image from 'next/image';

import { footerColumns } from '../lib/site-content';
import { EVERY_LANGUAGE_URL } from '../lib/site-links';

/**
 * Shared marketing footer. Used by the homepage and every static page.
 */
export function SiteFooter() {
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
              <Image
                src="/everylanguage/wordmark-blue.png"
                alt="Every Language"
                width={878}
                height={242}
              />
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

        <div className="site-footer__bottom">
          <p className="site-footer__meta">A digital ministry. Free to use, free to share.</p>
          <div className="site-footer__legal">
            <a href="/privacy">Privacy</a>
            <a href="/terms">Terms</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
