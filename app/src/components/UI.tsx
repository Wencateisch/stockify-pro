import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icons";

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`field ${className || ""}`}>
      <label>{label}</label>
      {children}
      {hint && <span className="tiny muted" style={{ lineHeight: 1.4 }}>{hint}</span>}
    </div>
  );
}

function cleanNum(n: number): string {
  if (!Number.isFinite(n)) return "";
  // Kill binary float noise so a ₹2,187.2 plan never renders 2187.2000000000003.
  return String(Number(n.toFixed(4)));
}

export function NumInput({
  value,
  onChange,
  prefix,
  suffix,
  min = 0,
  step = 1,
  placeholder,
  inputMode = "decimal",
}: {
  value: number;
  onChange: (n: number) => void;
  prefix?: string;
  suffix?: string;
  min?: number;
  step?: number;
  placeholder?: string;
  inputMode?: "decimal" | "numeric";
}) {
  const [text, setText] = useState(() => (Number.isFinite(value) ? cleanNum(value) : ""));
  useEffect(() => {
    const parsed = parseFloat(text);
    if (!Number.isFinite(parsed) || Math.abs(parsed - value) > 1e-9) {
      setText(Number.isFinite(value) && value !== 0 ? cleanNum(value) : value === 0 && text !== "" ? "0" : "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const handle = (raw: string) => {
    setText(raw);
    const n = parseFloat(raw);
    if (Number.isFinite(n)) onChange(Math.max(min, n));
    else if (raw === "") onChange(min);
  };

  return (
    <div className="input-affix">
      {prefix && <span>{prefix}</span>}
      <input
        className="input"
        inputMode={inputMode}
        type="text"
        value={text}
        placeholder={placeholder}
        step={step}
        onChange={(e) => handle(e.target.value)}
        onBlur={() => {
          const n = parseFloat(text);
          if (text === "" || !Number.isFinite(n)) setText(cleanNum(min));
          else setText(cleanNum(n));
        }}
        style={suffix ? { paddingRight: 34 } : undefined}
      />
      {suffix && (
        <span style={{ left: "auto", right: 12, color: "var(--ink-3)", position: "absolute", top: "50%", transform: "translateY(-50%)", fontSize: 11 }}>
          {suffix}
        </span>
      )}
    </div>
  );
}

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  ariaLabel?: string;
}) {
  return (
    <div className="segmented" role="tablist" aria-label={ariaLabel}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          role="tab"
          aria-selected={o.value === value}
          className={o.value === value ? "on" : ""}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function SwitchRow({
  title,
  sub,
  on,
  onToggle,
}: {
  title: string;
  sub?: string;
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="row between" style={{ padding: "10px 0", gap: 16 }}>
      <div className="col grow">
        <span className="small strong">{title}</span>
        {sub && <span className="tiny muted">{sub}</span>}
      </div>
      <button
        type="button"
        className={`switch ${on ? "on" : ""}`}
        aria-pressed={on}
        aria-label={title}
        onClick={onToggle}
      />
    </div>
  );
}

export function KV({ k, v, tone }: { k: ReactNode; v: ReactNode; tone?: "up" | "down" | "muted" }) {
  return (
    <div className="kv">
      <span className="k">{k}</span>
      <span className={`v ${tone === "up" ? "up" : tone === "down" ? "down" : ""}`}>{v}</span>
    </div>
  );
}

export function Stat({
  k,
  v,
  tone,
  sub,
}: {
  k: string;
  v: ReactNode;
  tone?: "up" | "down" | "amber" | "blue";
  sub?: string;
}) {
  const color = tone === "up" ? "var(--green)" : tone === "down" ? "var(--red)" : tone === "amber" ? "var(--amber)" : tone === "blue" ? "var(--blue)" : "var(--ink)";
  return (
    <div className="glass flat card tight">
      <div className="metric-k">{k}</div>
      <div className="metric-v" style={{ color }}>{v}</div>
      {sub && <div className="tiny muted" style={{ marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

export function IconBtn({
  name,
  label,
  onClick,
  active,
  small,
  disabled,
}: {
  name: IconName;
  label: string;
  onClick: () => void;
  active?: boolean;
  small?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={`icon-btn ${small ? "small" : ""} ${active ? "active" : ""}`}
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
    >
      <Icon name={name} size={small ? 16 : 19} />
    </button>
  );
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="empty" style={{ display: "grid", placeItems: "center", gap: 12 }}>
      <div className="spinner" />
      <span>{label}</span>
    </div>
  );
}

export function Empty({
  icon = "radar",
  title,
  children,
  action,
}: {
  icon?: IconName;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div
        style={{
          width: 46,
          height: 46,
          margin: "0 auto 10px",
          borderRadius: 14,
          display: "grid",
          placeItems: "center",
          background: "rgba(255,255,255,0.05)",
          border: "1px solid rgba(255,255,255,0.08)",
          color: "var(--ink-3)",
        }}
      >
        <Icon name={icon} size={22} />
      </div>
      <strong>{title}</strong>
      {children}
      {action && <div style={{ marginTop: 14 }}>{action}</div>}
    </div>
  );
}
