import type { HomeCopy } from '../../lib/home-copy';

/** The homepage headline, set over the globe. */
export function AtlasHero({
  copy,
  hidden,
  onExplore,
}: {
  copy: HomeCopy;
  hidden: boolean;
  onExplore: () => void;
}) {
  const { hero } = copy;
  return (
    <div className="pa-steps" aria-hidden={hidden || undefined} inert={hidden}>
      <div className="pa-step pa-step--hero">
        <div className="pa-hero">
          <p className="pa-eyebrow">
            <span /> {hero.eyebrow}
          </p>
          <h1>
            {hero.titleLine1}
            <br />
            <em>{hero.titleLine2}</em>
          </h1>
          <p className="pa-hero-lede">{hero.lede}</p>
          <div className="pa-hero-actions">
            <a className="pa-button pa-button--primary" href="/download">
              {hero.primaryCta}
            </a>
            <button type="button" className="pa-button pa-button--quiet" onClick={onExplore}>
              {hero.exploreCta}
              <span className="pa-arrow" aria-hidden="true">
                →
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
