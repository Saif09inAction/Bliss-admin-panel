"use client";

export default function PageToolbar({
  children,
  title,
  actions,
}: {
  children?: React.ReactNode;
  title?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="page-toolbar">
      <div className="min-w-0 flex-1">
        {title && <h2 className="font-display text-base font-bold sm:text-lg">{title}</h2>}
        {children}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
