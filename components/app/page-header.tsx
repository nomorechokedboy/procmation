import type { ReactNode } from "react";

type PageHeaderProps = {
  title: string;
  actions?: ReactNode;
};

// Title row shown at the top of a page; the frame itself comes from the layout
export function PageHeader({ title, actions }: PageHeaderProps) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h1 className="font-semibold text-xl">{title}</h1>
      {actions}
    </div>
  );
}
