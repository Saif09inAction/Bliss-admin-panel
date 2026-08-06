"use client";

import { useCallback, useMemo, useState } from "react";

/** Checkbox multi-select helper for admin list pages. */
export function useSelection(visibleIds: string[]) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  const visibleSet = useMemo(() => new Set(visibleIds), [visibleIds]);

  const selectedVisibleCount = useMemo(() => {
    let n = 0;
    selected.forEach((id) => {
      if (visibleSet.has(id)) n += 1;
    });
    return n;
  }, [selected, visibleSet]);

  const allVisibleSelected =
    visibleIds.length > 0 && selectedVisibleCount === visibleIds.length;

  const someVisibleSelected = selectedVisibleCount > 0 && !allVisibleSelected;

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAllVisible = useCallback(() => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (visibleIds.length > 0 && visibleIds.every((id) => next.has(id))) {
        visibleIds.forEach((id) => next.delete(id));
      } else {
        visibleIds.forEach((id) => next.add(id));
      }
      return next;
    });
  }, [visibleIds]);

  const clear = useCallback(() => setSelected(new Set()), []);

  const isSelected = useCallback((id: string) => selected.has(id), [selected]);

  const selectedIds = useMemo(() => Array.from(selected), [selected]);

  return {
    selected,
    selectedIds,
    selectedCount: selected.size,
    selectedVisibleCount,
    allVisibleSelected,
    someVisibleSelected,
    toggle,
    toggleAllVisible,
    clear,
    isSelected,
    setSelected,
  };
}
