"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.id === value);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
      setQuery("");
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  // Dropdown is rendered in a portal (positioned via fixed coords) so it can
  // never get clipped by an ancestor with `overflow: hidden` (e.g. `.surface`/`.card`).
  useEffect(() => {
    if (!open) return;
    function updateRect() {
      const el = inputRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setRect({ top: r.bottom + 6, left: r.left, width: r.width });
    }
    updateRect();
    window.addEventListener("scroll", updateRect, true);
    window.addEventListener("resize", updateRect);
    return () => {
      window.removeEventListener("scroll", updateRect, true);
      window.removeEventListener("resize", updateRect);
    };
  }, [open]);

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
          ref={inputRef}
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
      {open &&
        rect &&
        mounted &&
        createPortal(
          <div
            ref={menuRef}
            className="fixed z-[9999] max-h-56 overflow-y-auto rounded-xl border border-[var(--border)] bg-white p-1.5 shadow-lift"
            style={{ top: rect.top, left: rect.left, width: rect.width }}
          >
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
          </div>,
          document.body
        )}
    </div>
  );
}
