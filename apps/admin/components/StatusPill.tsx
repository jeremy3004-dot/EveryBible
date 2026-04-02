interface StatusPillProps {
  children: string;
  tone?: 'default' | 'success' | 'warning' | 'danger';
}

export function StatusPill({ children, tone = 'default' }: StatusPillProps) {
  const className =
    tone === 'success'
      ? 'pill pill--success'
      : tone === 'warning'
        ? 'pill pill--warning'
        : tone === 'danger'
          ? 'pill pill--danger'
          : 'pill';

  return <span className={className}>{children}</span>;
}
