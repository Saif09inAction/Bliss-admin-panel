"use client";

import { Trash2, X } from "lucide-react";

export default function BulkSelectBar({
  selectedCount,
  totalVisible,
  allVisibleSelected,
  someVisibleSelected,
  onToggleAll,
  onClear,
  onDelete,
  deleting = false,
  noun = "record",
}: {
  selectedCount: number;
  totalVisible: number;
  allVisibleSelected: boolean;
  someVisibleSelected: boolean;
  onToggleAll: () => void;
  onClear: () => void;
  onDelete: () => void;
  deleting?: boolean;
  noun?: string;
}) {
  if (selectedCount <= 0) return null;

  return (
    <div className="sticky top-2 z-20 flex flex-wrap items-center gap-3 rounded-2xl border border-danger/25 bg-red-50/95 px-3 py-2.5 shadow-sm backdrop-blur sm:px-4">
      <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-danger">
        <input
          type="checkbox"
          className="h-4 w-4 accent-[var(--jade)]"
          checked={allVisibleSelected}
          ref={(el) => {
            if (el) el.indeterminate = someVisibleSelected;
          }}
          onChange={onToggleAll}
          aria-label="Select all visible"
        />
        {selectedCount} selected
        {totalVisible > 0 ? (
          <span className="font-normal text-[var(--text-muted)]">
            · {totalVisible} shown
          </span>
        ) : null}
      </label>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <button type="button" className="btn btn-secondary btn-sm" onClick={onClear} disabled={deleting}>
          <X className="h-3.5 w-3.5" />
          Clear
        </button>
        <button
          type="button"
          className="btn btn-sm !bg-danger !text-white hover:!brightness-95"
          onClick={onDelete}
          disabled={deleting}
        >
          <Trash2 className="h-3.5 w-3.5" />
          {deleting ? "Deleting…" : `Delete ${selectedCount} ${noun}${selectedCount === 1 ? "" : "s"}`}
        </button>
      </div>
    </div>
  );
}

export function SelectCheckbox({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <input
      type="checkbox"
      className="h-4 w-4 shrink-0 accent-[var(--jade)]"
      checked={checked}
      onChange={onChange}
      onClick={(e) => e.stopPropagation()}
      aria-label={label}
    />
  );
}
