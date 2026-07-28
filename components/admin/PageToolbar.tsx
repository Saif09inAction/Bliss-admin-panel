"use client";

interface Props {
  /** Optional meta text (counts, filters summary) */
  meta?: React.ReactNode;
  /** Action buttons on the right */
  actions?: React.ReactNode;
}

/** Compact page header — title lives in the top app bar */
export default function PageToolbar({ meta, actions }: Props) {
  if (!meta && !actions) return null;
  return (
    <div className="page-toolbar">
      {meta && <div className="page-toolbar-meta">{meta}</div>}
      {actions && <div className="page-toolbar-actions">{actions}</div>}
    </div>
  );
}
