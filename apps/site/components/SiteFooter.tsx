import { footerColumns } from '../lib/site-content';

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
