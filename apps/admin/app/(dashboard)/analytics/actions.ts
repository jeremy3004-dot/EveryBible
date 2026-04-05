'use server';

import { createAdminServiceClient } from '@/lib/supabase/service';

export async function refreshEngagementStats(): Promise<void> {
  const service = createAdminServiceClient();
  const { error } = await service.functions.invoke('aggregate-engagement', {
    body: {},
    method: 'POST',
  });

  if (error) {
    throw new Error(`Engagement refresh failed: ${error.message}`);
  }
}
