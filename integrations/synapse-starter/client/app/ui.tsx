import type { ReactNode } from 'react';
import { formatCell } from '../format';

// Visual primitives for the SHIPPED app, styled exclusively by the tokens in ./theme.css
// (bg-card, text-ink, rounded-card, p-card, …). Deliberately separate from client/ui.tsx —
// that file is the builder console's fixed styling and never follows the app's theme.
//
// RTL: everything here uses logical properties (text-start, end-0, rounded-e-*) so the layout
// flips cleanly when <html> carries dir="rtl".

export function AppCard({ children }: { children: ReactNode }) {
  return <div className="rounded-card border border-line bg-card p-card shadow-sm">{children}</div>;
}

export function AppEmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-control border border-dashed border-line px-4 py-10 text-center text-body text-ink-muted">
      {children}
    </div>
  );
}

// Renders lake rows as a scrollable table — the app-side, token-styled sibling of the console's
// RowsTable. The wrapper is `min-w-0 overflow-x-auto` (see the anti-overflow rule in
// client/ui.tsx): a wide table scrolls inside its own box and never widens the page. A faint
// inline-end fade hints there are more columns to scroll to.
export function DataTable({
  columns,
  rows,
}: {
  columns: string[];
  rows: Record<string, unknown>[];
}) {
  return (
    <div className="relative">
      <div className="min-w-0 overflow-x-auto rounded-control border border-line">
        <table className="w-full text-start text-body">
          <thead className="bg-surface text-caption text-ink-muted">
            <tr>
              {columns.map((col) => (
                <th key={col} className="whitespace-nowrap px-3 py-2 text-start font-medium">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              // Lake rows have no stable id; index is acceptable for a static rendered table.
              // biome-ignore lint/suspicious/noArrayIndexKey: rows are read-only and never reordered
              <tr key={i} className="border-t border-line">
                {columns.map((col) => (
                  <td key={col} className="break-words px-3 py-2 tabular-nums text-ink">
                    {formatCell(row[col])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Scroll affordance: a faint fade on the inline-end edge so wide tables read as "there's
          more". The gradient direction follows dir via the rtl: variant. */}
      <div className="pointer-events-none absolute inset-y-0 end-0 w-6 rounded-e-control bg-gradient-to-l from-card/90 to-transparent rtl:bg-gradient-to-r" />
    </div>
  );
}
