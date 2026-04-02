'use server';

import { redirect } from 'next/navigation';

import { createAdminServerClient } from '@/lib/supabase/server';

export async function loginAction(formData: FormData) {
  const email = formData.get('email');
  const password = formData.get('password');

  if (typeof email !== 'string' || typeof password !== 'string') {
    redirect('/login?error=Missing credentials');
  }

  const supabase = await createAdminServerClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }

  redirect('/analytics');
}

export async function signOutAction() {
  const supabase = await createAdminServerClient();
  await supabase.auth.signOut();
  redirect('/login?notice=Signed out successfully');
}
