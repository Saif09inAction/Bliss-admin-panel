"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Search, X } from "lucide-react";

export type SearchSelectOption = {
  id: string;
  label: string;
  sublabel?: string;
};

export default function SearchSelect({
  value,
  onSelect,
  options,
  placeholder = "Search…",
  emptyText = "No matches",
  disabled,
}: {
  value: string;
  onSelect: (id: string) => void;
  options: SearchSelectOption[];
  placeholder?: string;
  emptyText?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.id === value);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const filtered = options.filter(
    (o) => !query.trim() || o.label.toLowerCase().includes(query.trim().toLowerCase())
  );

  return (
    <div className="relative" ref={rootRef}>
      <div className="relative">
        <Search
          size={14}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-faint)]"
        />
        <input
          className="input !pl-8 !pr-8"
          value={open ? query : selected?.label || ""}
          placeholder={placeholder}
          disabled={disabled}
          onFocus={() => {
            setOpen(true);
            setQuery("");
          }}
          onChange={(e) => setQuery(e.target.value)}
        />
        {selected && !open ? (
          <button
            type="button"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-faint)] hover:text-danger"
            onClick={(e) => {
              e.stopPropagation();
              onSelect("");
            }}
            aria-label="Clear selection"
          >
            <X size={14} />
          </button>
        ) : (
          <ChevronDown
            size={14}
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-faint)]"
          />
        )}
      </div>
      {open && (
        <div className="absolute z-30 mt-1.5 max-h-56 w-full overflow-y-auto rounded-xl border border-[var(--border)] bg-white p-1.5 shadow-lift">
          {filtered.length === 0 ? (
            <p className="px-3 py-2.5 text-sm text-[var(--text-muted)]">{emptyText}</p>
          ) : (
            filtered.map((o) => (
              <button
                key={o.id}
                type="button"
                className={`flex w-full flex-col items-start rounded-lg px-3 py-2 text-left text-sm hover:bg-[var(--surface-mist)] ${
                  o.id === value ? "bg-jade-soft text-jade-deep" : ""
                }`}
                onClick={() => {
                  onSelect(o.id);
                  setOpen(false);
                  setQuery("");
                }}
              >
                <span className="font-medium">{o.label}</span>
                {o.sublabel && <span className="text-xs text-[var(--text-muted)]">{o.sublabel}</span>}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
