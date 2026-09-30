import type { ReactNode } from "react";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useTableFits } from "@/hooks/use-table-fits";
import { cn } from "@/lib/utils";

export type FitColumn<T> = {
  key: string;
  /** Column header, and the field label when rows are stacked as cards. */
  label: string;
  /** Header content when it differs from the label (defaults to the label). */
  header?: ReactNode;
  cell: (row: T) => ReactNode;
  align?: "right";
  /** Stacked layout: shown as the card's heading instead of a labelled field. */
  title?: boolean;
  /** Stacked layout: spans the full card width, without a label (for actions and links). */
  wide?: boolean;
};

/**
 * A table when it fits its container, otherwise one card per row with the same columns as labelled fields, so no
 * width and no content ever needs horizontal scrolling (see useTableFits).
 */
export function FitTable<T>({
  columns,
  rows,
  rowKey,
}: {
  columns: FitColumn<T>[];
  rows: readonly T[];
  rowKey: (row: T) => string;
}) {
  const layout = useTableFits();
  const title = columns.find((c) => c.title);
  const fields = columns.filter((c) => !c.title);

  return (
    <div ref={layout.ref}>
      {layout.fits ? (
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((c) => (
                <TableHead key={c.key} className={cn(c.align === "right" && "text-right")}>
                  {c.header ?? c.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={rowKey(row)}>
                {columns.map((c) => (
                  <TableCell key={c.key} className={cn(c.align === "right" && "text-right")}>
                    {c.cell(row)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <ul className="divide-y">
          {rows.map((row) => (
            <li key={rowKey(row)} className="flex flex-col gap-2 px-3 py-3">
              {title && <div className="min-w-0">{title.cell(row)}</div>}
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                {fields.map((c) =>
                  c.wide ? (
                    <div key={c.key} className="col-span-2 min-w-0">
                      <dt className="sr-only">{c.label}</dt>
                      <dd>{c.cell(row)}</dd>
                    </div>
                  ) : (
                    <div key={c.key} className="min-w-0">
                      <dt className="text-muted-foreground text-xs">{c.label}</dt>
                      <dd className="break-words">{c.cell(row)}</dd>
                    </div>
                  ),
                )}
              </dl>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
