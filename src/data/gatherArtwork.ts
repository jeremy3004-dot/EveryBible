/**
 * Auto-generated Gather artwork registry.
 *
 * Generated from scripts/gather-svg/*.svg by scripts/generate_gather_artwork_svgs.py.
 * Each artwork's SVG markup is its own JSON module in ./gatherArtworkSvg, loaded the
 * first time it is drawn, so importing this registry loads no artwork.
 */

const GATHER_ARTWORK_LOADERS: Readonly<Record<string, () => string>> = {
  'foundation-1': () => require('./gatherArtworkSvg/foundation-1.json') as string,
  'foundation-2': () => require('./gatherArtworkSvg/foundation-2.json') as string,
  'foundation-3': () => require('./gatherArtworkSvg/foundation-3.json') as string,
  'foundation-4': () => require('./gatherArtworkSvg/foundation-4.json') as string,
  'foundation-5': () => require('./gatherArtworkSvg/foundation-5.json') as string,
  'foundation-6': () => require('./gatherArtworkSvg/foundation-6.json') as string,
  'foundation-7': () => require('./gatherArtworkSvg/foundation-7.json') as string,
  'category-inner-life': () => require('./gatherArtworkSvg/category-inner-life.json') as string,
  'category-challenge': () => require('./gatherArtworkSvg/category-challenge.json') as string,
  'category-money': () => require('./gatherArtworkSvg/category-money.json') as string,
  'category-people': () => require('./gatherArtworkSvg/category-people.json') as string,
  'category-knowing-god': () => require('./gatherArtworkSvg/category-knowing-god.json') as string,
  'topic-courage': () => require('./gatherArtworkSvg/topic-courage.json') as string,
  'topic-faith': () => require('./gatherArtworkSvg/topic-faith.json') as string,
  'topic-hope': () => require('./gatherArtworkSvg/topic-hope.json') as string,
  'topic-justice': () => require('./gatherArtworkSvg/topic-justice.json') as string,
  'topic-love': () => require('./gatherArtworkSvg/topic-love.json') as string,
  'topic-obedience': () => require('./gatherArtworkSvg/topic-obedience.json') as string,
  'topic-anger': () => require('./gatherArtworkSvg/topic-anger.json') as string,
  'topic-crisis': () => require('./gatherArtworkSvg/topic-crisis.json') as string,
  'topic-grief': () => require('./gatherArtworkSvg/topic-grief.json') as string,
  'topic-hurt': () => require('./gatherArtworkSvg/topic-hurt.json') as string,
  'topic-known-and-loved': () => require('./gatherArtworkSvg/topic-known-and-loved.json') as string,
  'topic-stress': () => require('./gatherArtworkSvg/topic-stress.json') as string,
  'topic-reconciliation': () => require('./gatherArtworkSvg/topic-reconciliation.json') as string,
  'topic-money-and-god': () => require('./gatherArtworkSvg/topic-money-and-god.json') as string,
  'topic-money-advice': () => require('./gatherArtworkSvg/topic-money-advice.json') as string,
  'topic-giving': () => require('./gatherArtworkSvg/topic-giving.json') as string,
  'topic-marketplace': () => require('./gatherArtworkSvg/topic-marketplace.json') as string,
  'topic-marriage': () => require('./gatherArtworkSvg/topic-marriage.json') as string,
  'topic-men': () => require('./gatherArtworkSvg/topic-men.json') as string,
  'topic-parenting': () => require('./gatherArtworkSvg/topic-parenting.json') as string,
  'topic-singles': () => require('./gatherArtworkSvg/topic-singles.json') as string,
  'topic-women': () => require('./gatherArtworkSvg/topic-women.json') as string,
  'topic-youth': () => require('./gatherArtworkSvg/topic-youth.json') as string,
  'topic-character-of-god': () =>
    require('./gatherArtworkSvg/topic-character-of-god.json') as string,
  'topic-promises-of-god': () => require('./gatherArtworkSvg/topic-promises-of-god.json') as string,
  'topic-names-of-god': () => require('./gatherArtworkSvg/topic-names-of-god.json') as string,
};

const loadedGatherArtwork = new Map<string, string>();

export function hasGatherArtwork(key: string): boolean {
  return Object.prototype.hasOwnProperty.call(GATHER_ARTWORK_LOADERS, key);
}

export function getGatherArtworkXml(key: string): string | undefined {
  if (!hasGatherArtwork(key)) {
    return undefined;
  }
  let xml = loadedGatherArtwork.get(key);
  if (xml === undefined) {
    xml = GATHER_ARTWORK_LOADERS[key]();
    loadedGatherArtwork.set(key, xml);
  }
  return xml;
}
