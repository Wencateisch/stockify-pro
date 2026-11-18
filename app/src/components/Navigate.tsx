import { navigate } from "../router";

export function Navigate({
  to,
  label,
  variant = "primary",
}: {
  to: string;
  label: string;
  variant?: "primary" | "ghost";
}) {
  return (
    <button type="button" className={`btn ${variant === "primary" ? "primary" : "ghost"}`} onClick={() => navigate(to)}>
      {label}
    </button>
  );
}
