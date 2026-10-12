import { formatCell } from './format';

// Renders lake rows as a scrollable table for the builder console's Views tab. (The shipped app
// has its own token-styled sibling: DataTable in client/app/ui.tsx.)
// The wrapper is `min-w-0 overflow-x-auto` per the anti-overflow rule in ui.tsx — a
// wide table scrolls inside its own box and never widens the page. A faint right-edge fade hints
// there are more columns to scroll to.
export function RowsTable({
  columns,
  rows,
}: {
  columns: string[];
  rows: Record<string, unknown>[];
}) {
  return (
    <div className="relative">
      <div className="min-w-0 overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-100 text-xs text-slate-500">
            <tr>
              {columns.map((col) => (
                <th key={col} className="whitespace-nowrap px-3 py-2 font-medium">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              // Lake rows have no stable id; index is acceptable for a static rendered table.
              // biome-ignore lint/suspicious/noArrayIndexKey: rows are read-only and never reordered
              <tr key={i} className="border-t border-slate-200">
                {columns.map((col) => (
                  <td key={col} className="break-words px-3 py-2 tabular-nums text-slate-700">
                    {formatCell(row[col])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Scroll affordance: a faint fade on the right edge so wide tables read as "there's more". */}
      <div className="pointer-events-none absolute inset-y-0 right-0 w-6 rounded-r-lg bg-gradient-to-l from-white/90 to-transparent" />
    </div>
  );
}
