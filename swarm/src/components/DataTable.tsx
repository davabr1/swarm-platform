"use client";

import type { ReactNode } from "react";

export interface Column<T> {
  key: string;
  header: string;
  width?: string;
  align?: "left" | "right";
  render: (row: T) => ReactNode;
  className?: string;
}

interface DataTableProps<T> {
  rows: T[];
  columns: Column<T>[];
  onRowClick?: (row: T) => void;
  rowKey: (row: T) => string;
  empty?: ReactNode;
  expandedKey?: string | null;
  expandedContent?: (row: T) => ReactNode;
  dense?: boolean;
}

export default function DataTable<T>({
  rows,
  columns,
  onRowClick,
  rowKey,
  empty,
  expandedKey = null,
  expandedContent,
  dense = false,
}: DataTableProps<T>) {
  if (rows.length === 0) {
    return (
      <div className="border border-border bg-surface py-16 text-center text-muted text-sm">
        {empty ?? "no rows"}
      </div>
    );
  }

  const pad = dense ? "py-2 px-3" : "py-3 px-4";

  return (
    <div className="border border-border bg-surface">
      {/* Header */}
      <div
        className="grid items-center text-[10px] uppercase tracking-widest text-dim border-b border-border bg-surface-1"
        style={{ gridTemplateColumns: columns.map((c) => c.width ?? "minmax(0,1fr)").join(" ") }}
      >
        {columns.map((c) => (
          <div
            key={c.key}
            className={`${pad} ${c.align === "right" ? "text-right" : "text-left"} ${c.className ?? ""}`}
          >
            {c.header}
          </div>
        ))}
      </div>

      {/* Rows */}
      {rows.map((row) => {
        const key = rowKey(row);
        const expanded = expandedKey === key;
        return (
          <div key={key}>
            <div
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={`grid items-center border-b border-border last:border-b-0 text-sm transition-none ${
                onRowClick
                  ? "cursor-pointer hover:bg-amber hover:text-background [&_*]:hover:!text-background"
                  : ""
              }`}
              style={{ gridTemplateColumns: columns.map((c) => c.width ?? "minmax(0,1fr)").join(" ") }}
            >
              {columns.map((c) => (
                <div
                  key={c.key}
                  className={`${pad} ${c.align === "right" ? "text-right" : "text-left"} ${c.className ?? ""} min-w-0`}
                >
                  {c.render(row)}
                </div>
              ))}
            </div>
            {expanded && expandedContent && (
              <div className="border-b border-border bg-surface-1 p-4 animate-fade-up">
                {expandedContent(row)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
