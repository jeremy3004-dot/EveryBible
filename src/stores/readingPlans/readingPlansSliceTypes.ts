import type { StoreApi } from 'zustand/vanilla';

import type { ReadingPlansStoreState } from '../../services/plans/types';

export type ReadingPlansSet = StoreApi<ReadingPlansStoreState>['setState'];
export type ReadingPlansGet = StoreApi<ReadingPlansStoreState>['getState'];

/**
 * One slice of the single reading-plans store. Every slice is spread into the same `persist`
 * creator, so `set`/`get` see the whole state.
 */
export type ReadingPlansSliceCreator<Slice extends Partial<ReadingPlansStoreState>> = (
  set: ReadingPlansSet,
  get: ReadingPlansGet
) => Slice;
