import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ReadingPlan } from '../../../services/plans/types';
import {
  buildSearchablePlans,
  createPlanSearchIndex,
  filterCatalogPlans,
} from './planCatalogSearchModel';

/**
 * The Find plans search: the query, and the catalog narrowed to it. The index is
 * rebuilt only when the catalog or the interface language changes, not per keystroke.
 */
export function usePlanCatalogSearch(allPlans: ReadingPlan[]) {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');

  const searchablePlans = useMemo(() => buildSearchablePlans(allPlans, t), [allPlans, t]);
  const searchIndex = useMemo(() => createPlanSearchIndex(searchablePlans), [searchablePlans]);
  const filteredPlans = useMemo(
    () => filterCatalogPlans(allPlans, searchablePlans, searchIndex, searchQuery),
    [allPlans, searchIndex, searchQuery, searchablePlans]
  );

  return { searchQuery, setSearchQuery, filteredPlans };
}
