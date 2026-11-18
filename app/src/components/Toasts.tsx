import { useApp } from "../lib/store";
import { Icon, type IconName } from "./Icons";

const ICONS: Record<string, IconName> = {
  info: "info",
  green: "check",
  red: "alert",
  amber: "bell",
};

export function Toasts() {
  const toasts = useApp((s) => s.toasts);
  const dismiss = useApp((s) => s.dismissToast);
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`} onClick={() => dismiss(t.id)} role="status">
          <span className="toast-icon" style={{ color: `var(--${t.kind === "info" ? "blue" : t.kind})` }}>
            <Icon name={ICONS[t.kind] || "info"} size={17} />
          </span>
          <span className="grow">{t.message}</span>
        </div>
      ))}
    </div>
  );
}
