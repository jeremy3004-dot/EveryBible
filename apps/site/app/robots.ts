import type { MetadataRoute } from 'next';

import { buildRobots } from '../lib/site-metadata';

export default function robots(): MetadataRoute.Robots {
  return buildRobots();
}
