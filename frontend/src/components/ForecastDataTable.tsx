import { useMemo, useState } from "react";
import { flexRender, getCoreRowModel, getSortedRowModel, useReactTable } from "@tanstack/react-table";
import type { ColumnDef, SortingState } from "@tanstack/react-table";

type Row = {
  ts: string;
  forecast: number | null;
  lower?: number | null;
  upper?: number | null;
};

export function ForecastDataTable({ data }: { data: Row[] }) {
  const columns = useMemo<ColumnDef<Row>[]>(
    () => [
      { accessorKey: "ts", header: "Timestamp" },
      {
        accessorKey: "forecast",
        header: "Forecast",
        cell: ({ getValue }) => formatNumber(getValue<number | null>()),
      },
      {
        accessorKey: "lower",
        header: "Lower",
        cell: ({ getValue }) => formatNumber(getValue<number | null>()),
      },
      {
        accessorKey: "upper",
        header: "Upper",
        cell: ({ getValue }) => formatNumber(getValue<number | null>()),
      },
    ],
    [],
  );

  const [sorting, setSorting] = useState<SortingState>([{ id: "ts", desc: false }]);
  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950">
      <div className="max-h-80 overflow-auto">
        <table className="w-full text-sm text-slate-100">
          <thead className="sticky top-0 bg-slate-900 shadow-sm shadow-slate-900/50">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((header) => (
                  <th
                    key={header.id}
                    className="px-3 py-2 text-left font-semibold cursor-pointer select-none"
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    <div className="flex items-center gap-1">
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      <span className="text-xs text-slate-400">
                        {header.column.getIsSorted() === "asc"
                          ? "^"
                          : header.column.getIsSorted() === "desc"
                            ? "v"
                            : ""}
                      </span>
                    </div>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="border-t border-slate-900">
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-3 py-2 text-slate-200">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const formatNumber = (value: number | null | undefined) => {
  if (value === null || value === undefined || Number.isNaN(value)) return "N/A";
  return Number(value).toLocaleString(undefined, { maximumFractionDigits: 4 });
};
