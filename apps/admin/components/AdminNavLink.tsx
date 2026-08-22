'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface AdminNavLinkProps {
  href: string;
  label: string;
  description: string;
}

/**
 * A row in the persistent navigation rail. The Every Language design system
 * gives the rail a selected state — a 2px blue left rule, a paper fill and 600
 * weight — which needs the current route, so this row is a client component
 * purely to mark itself with aria-current.
 */
export function AdminNavLink({ href, label, description }: AdminNavLinkProps) {
  const pathname = usePathname();
  const isCurrent = href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link href={href} className="nav-link" aria-current={isCurrent ? 'page' : undefined}>
      <span>{label}</span>
      <small>{description}</small>
    </Link>
  );
}
