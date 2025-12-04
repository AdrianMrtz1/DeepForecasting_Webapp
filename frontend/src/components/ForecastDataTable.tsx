import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { flexRender, getCoreRowModel, getSortedRowModel, useReactTable } from "@tanstack/react-table";
import type { ColumnDef, SortingState } from "@tanstack/react-table";

type IntervalBounds = Record<number, { lower: number | null; upper: number | null }>;

type Row = {
  timestamp: string;
  forecast: number | null;
  bounds?: IntervalBounds;
};

interface Props {
  data: Row[];
  intervals: number[];
}

const container = {
  show: { transition: { staggerChildren: 0.03 } },
};

const item = {
  hidden: { opacity: 0, y: 5 },
  show: { opacity: 1, y: 0, transition: { ease: [0.25, 1, 0.5, 1], duration: 0.4 } },
};

export function ForecastDataTable({ data, intervals }: Props) {
  const intervalColumns = useMemo<ColumnDef<Row>[]>(
    () =>
      intervals.flatMap((level) => [
        {
          id: `lower-${level}`,
          header: `Lower ${level}%`,
          accessorFn: (row) => row.bounds?.[level]?.lower ?? null,
          cell: ({ getValue }) => formatNumber(getValue<number | null>()),
        },
        {
          id: `upper-${level}`,
          header: `Upper ${level}%`,
          accessorFn: (row) => row.bounds?.[level]?.upper ?? null,
          cell: ({ getValue }) => formatNumber(getValue<number | null>()),
        },
      ]),
    [intervals],
  );

  const columns = useMemo<ColumnDef<Row>[]>(
    () => [
      { accessorKey: "timestamp", header: "Timestamp" },
      {
        accessorKey: "forecast",
        header: "Forecast",
        cell: ({ getValue }) => formatNumber(getValue<number | null>()),
      },
      ...intervalColumns,
    ],
    [intervalColumns],
  );

  const [sorting, setSorting] = useState<SortingState>([{ id: "timestamp", desc: false }]);
  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="overflow-hidden rounded-xl border border-[#c0b2a3] bg-[var(--kaito-surface)]">
      <div className="max-h-80 overflow-auto">
        <table className="w-full text-sm text-[#333]">
          <thead className="sticky top-0 bg-[#e6e4dd] shadow-sm shadow-black/5">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((header) => (
                  <th
                    key={header.id}
                    className="cursor-pointer select-none px-3 py-2 text-left font-semibold"
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    <div className="flex items-center gap-1">
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      <span className="text-xs text-[#6a655b]">
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
          <motion.tbody variants={container} initial="hidden" animate="show">
            {table.getRowModel().rows.map((row) => (
              <motion.tr variants={item} key={row.id} className="border-t border-[#d5cbbf]">
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-3 py-2">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </motion.tr>
            ))}
          </motion.tbody>
        </table>
      </div>
    </div>
  );
}

const formatNumber = (value: number | null | undefined) => {
  if (value === null || value === undefined || Number.isNaN(value)) return "N/A";
  return Number(value).toLocaleString(undefined, { maximumFractionDigits: 4 });
};
