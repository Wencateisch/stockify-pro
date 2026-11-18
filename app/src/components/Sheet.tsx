import { useEffect } from "react";
import type { ReactNode } from "react";
import { Icon } from "./Icons";

export function Sheet({
  open,
  onClose,
  title,
  sub,
  children,
  actions,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  sub?: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div className="backdrop" onClick={onClose} aria-hidden="true" />
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet-grab" />
        <div className="sheet-head">
          <div>
            <h2 className="sheet-title">{title}</h2>
            {sub && <div className="sheet-sub">{sub}</div>}
          </div>
          <button type="button" className="icon-btn small" onClick={onClose} aria-label="Close">
            <Icon name="close" size={16} />
          </button>
        </div>
        {children}
        {actions && <div className="sheet-actions">{actions}</div>}
      </div>
    </>
  );
}
