import { cache } from 'react';

import { requireAdminIdentity } from '@/lib/admin-auth';
import { createAdminServiceClient } from '@/lib/supabase/service';

/**
 * The service-role client for data loaders, handed out only after the caller is confirmed as
 * an admin. A loader that uses it stays safe even if a future page forgets its own guard.
 * React shares the check within one server render, never across requests.
 */
export const getAuthorizedAdminServiceClient = cache(async () => {
  await requireAdminIdentity();
  return createAdminServiceClient();
});
