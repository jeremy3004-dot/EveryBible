'use server';

import { revalidateTag } from 'next/cache';

import { ANALYTICS_OVERVIEW_CACHE_TAG } from '@/lib/admin-data';
import { createAdminServiceClient } from '@/lib/supabase/service';
import { requireAdminIdentity } from '@/lib/admin-auth';

export async function refreshEngagementStats(): Promise<void> {
  await requireAdminIdentity();
  const service = createAdminServiceClient();
  try {
    const { error } = await service.functions.invoke('aggregate-engagement', {
      body: {},
      method: 'POST',
    });

    if (error) {
      throw new Error(`Engagement refresh failed: ${error.message}`);
    }
  } finally {
    // "Refresh stats" must show live numbers even when the engagement job fails:
    // drop the short-lived overview cache so the following router.refresh() reads
    // the database.
    revalidateTag(ANALYTICS_OVERVIEW_CACHE_TAG);
  }
}
