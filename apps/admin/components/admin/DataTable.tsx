import type { ReactNode } from 'react';

export interface DataTableColumn {
  key: string;
  header: ReactNode;
}

interface DataTableProps {
  columns: DataTableColumn[];
  children: ReactNode;
}

export function DataTable({ columns, children }: DataTableProps) {
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key}>{column.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
