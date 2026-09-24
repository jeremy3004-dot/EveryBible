import type { User } from '@supabase/supabase-js';
import { redirect } from 'next/navigation';
import { cache } from 'react';

import type { AdminRole } from './shared-contracts';

import { createAdminServerClient } from '@/lib/supabase/server';
import { createAdminServiceClient } from '@/lib/supabase/service';

export interface AdminIdentity {
  email: string;
  id: string;
  name: string;
  role: AdminRole;
}

interface AdminProfileRow {
  admin_role: AdminRole | null;
  display_name: string | null;
  email: string | null;
  id: string;
}

async function getAuthenticatedUser(): Promise<User | null> {
  const supabase = await createAdminServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user;
}

async function getAdminProfile(userId: string): Promise<AdminProfileRow | null> {
  const service = createAdminServiceClient();
  const { data, error } = await service
    .from('profiles')
    .select('id, email, display_name, admin_role')
    .eq('id', userId)
    .maybeSingle<AdminProfileRow>();

  if (error) {
    throw new Error(`Unable to load admin profile: ${error.message}`);
  }

  return data;
}

async function resolveAdminIdentity(user: User): Promise<AdminIdentity | null> {
  const profile = await getAdminProfile(user.id);
  if (!profile || profile.admin_role !== 'super_admin') {
    return null;
  }

  return {
    email: profile.email ?? user.email ?? 'unknown@everybible.app',
    id: profile.id,
    name: profile.display_name ?? user.email ?? 'EveryBible Admin',
    role: profile.admin_role,
  };
}

export async function getAdminIdentity(): Promise<AdminIdentity | null> {
  const user = await getAuthenticatedUser();
  return user ? resolveAdminIdentity(user) : null;
}

// A dashboard render checks the admin in the layout, often in the page, and again
// at the data boundary. React shares this promise only inside one server render
// request, so those checks cost one getUser() and one profile read; server
// actions, route handlers and code outside a render still verify on every call.
export const requireAdminIdentity = cache(
  async function requireAdminIdentity(): Promise<AdminIdentity> {
    const user = await getAuthenticatedUser();

    if (!user) {
      redirect('/login?reason=auth');
    }

    // Reuse the verified user: getUser() is a network round trip to Supabase Auth.
    const adminIdentity = await resolveAdminIdentity(user);

    if (!adminIdentity) {
      redirect('/login?reason=forbidden');
    }

    return adminIdentity;
  }
);
