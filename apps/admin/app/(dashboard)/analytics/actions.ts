'use server';

import { createAdminServiceClient } from '@/lib/supabase/service';
import { requireAdminIdentity } from '@/lib/admin-auth';

export async function refreshEngagementStats(): Promise<void> {
  await requireAdminIdentity();
  const service = createAdminServiceClient();
  const { error } = await service.functions.invoke('aggregate-engagement', {
    body: {},
    method: 'POST',
  });

  if (error) {
    throw new Error(`Engagement refresh failed: ${error.message}`);
  }
}
