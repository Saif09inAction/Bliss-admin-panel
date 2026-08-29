"use client";

import { useState } from "react";
import { Filter, Search } from "lucide-react";

export default function AdminSearchWithDateFilter({
  search,
  onSearchChange,
  dateFrom = "",
  dateTo = "",
  onDateFromChange,
  onDateToChange,
  placeholder = "Search…",
  showDateFilter = true,
  dateFilterMode = "range",
}: {
  search: string;
  onSearchChange: (v: string) => void;
  dateFrom?: string;
  dateTo?: string;
  onDateFromChange?: (v: string) => void;
  onDateToChange?: (v: string) => void;
  placeholder?: string;
  showDateFilter?: boolean;
  dateFilterMode?: "range" | "single";
}) {
  const [filterOpen, setFilterOpen] = useState(false);
  const hasDateFilter = !!(dateFrom || dateTo);
  const canFilter =
    showDateFilter &&
    onDateFromChange &&
    (dateFilterMode === "single" || onDateToChange);

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Search
            size={16}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-faint)]"
          />
          <input
            className="search-input !pl-10"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={placeholder}
            type="search"
          />
        </div>
        {canFilter && (
          <button
            type="button"
            className={`btn btn-secondary shrink-0 gap-1.5 ${
              hasDateFilter || filterOpen ? "!border-jade !text-jade-deep" : ""
            }`}
            onClick={() => setFilterOpen((open) => !open)}
            aria-expanded={filterOpen}
          >
            <Filter size={16} />
            <span className="hidden sm:inline">Filter</span>
            {hasDateFilter && (
              <span className="h-1.5 w-1.5 rounded-full bg-jade" aria-hidden />
            )}
          </button>
        )}
      </div>

      {canFilter && filterOpen && (
        <div className="flex flex-wrap items-end gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-mist)]/40 p-3">
          <div>
            <label className="label !mb-1 !text-[10px]">
              {dateFilterMode === "single" ? "Date" : "From"}
            </label>
            <input
              type="date"
              className="input !w-auto !py-2"
              value={dateFrom}
              max={dateFilterMode === "range" ? dateTo || undefined : undefined}
              onChange={(e) => onDateFromChange!(e.target.value)}
            />
          </div>
          {dateFilterMode === "range" && (
            <div>
              <label className="label !mb-1 !text-[10px]">To</label>
              <input
                type="date"
                className="input !w-auto !py-2"
                value={dateTo}
                min={dateFrom || undefined}
                onChange={(e) => onDateToChange!(e.target.value)}
              />
            </div>
          )}
          {hasDateFilter && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                onDateFromChange!("");
                if (dateFilterMode === "range") onDateToChange!("");
              }}
            >
              Clear dates
            </button>
          )}
        </div>
      )}
    </div>
  );
}
