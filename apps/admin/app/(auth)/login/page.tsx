import { redirect } from 'next/navigation';

import { AdminSetupCard } from '@/components/AdminSetupCard';
import { getAdminIdentity } from '@/lib/admin-auth';
import { getAdminRequiredEnvKeys } from '@/lib/env';
import { getError, getNotice } from '@/lib/format';

import { loginAction } from './actions';

export const dynamic = 'force-dynamic';

interface LoginPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function getReasonLabel(reason: string | string[] | undefined): string | null {
  if (reason === 'forbidden') {
    return 'Your account is authenticated but does not have EveryBible admin access.';
  }

  if (reason === 'auth') {
    return 'Sign in to continue to the internal EveryBible admin.';
  }

  return null;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const missingKeys = getAdminRequiredEnvKeys();
  if (missingKeys.length > 0) {
    return <AdminSetupCard missingKeys={missingKeys} />;
  }

  const adminIdentity = await getAdminIdentity();
  if (adminIdentity) {
    redirect('/');
  }

  const resolvedSearchParams = await searchParams;
  const notice = getNotice(resolvedSearchParams);
  const error = getError(resolvedSearchParams);
  const reason = getReasonLabel(resolvedSearchParams.reason);

  return (
    <main className="auth-page">
      <section className="auth-card">
        <p className="eyebrow">EveryBible Admin</p>
        <h1>Manage content, support, distribution, and reporting in one secure place.</h1>
        <p className="lede">
          Sign in with your EveryBible admin account to reach the dashboards, location reporting,
          and operational tools that support the app and website.
        </p>

        {notice ? <p className="notice notice--success">{notice}</p> : null}
        {reason ? <p className="notice notice--warning">{reason}</p> : null}
        {error ? <p className="notice notice--danger">{error}</p> : null}

        <form className="auth-form" action={loginAction}>
          <label>
            Email
            <input name="email" type="email" placeholder="hello@everybible.app" required />
          </label>

          <label>
            Password
            <input name="password" type="password" placeholder="••••••••" required />
          </label>

          <button type="submit" className="button button--primary">
            Sign in
          </button>
        </form>
      </section>
    </main>
  );
}
