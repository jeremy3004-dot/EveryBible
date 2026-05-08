import type { ReactNode } from 'react';

interface FilterFormProps {
  children: ReactNode;
}

export function FilterForm({ children }: FilterFormProps) {
  return <form className="filter-form">{children}</form>;
}
