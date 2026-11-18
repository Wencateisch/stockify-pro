import { BrandMark, Icon, type IconName } from "./Icons";
import { navigate, type Route } from "../router";
import { useApp } from "../lib/store";

const ITEMS: { path: string; label: string; icon: IconName; match: string[] }[] = [
  { path: "/", label: "Desk", icon: "desk", match: ["desk"] },
  { path: "/scan", label: "Scan", icon: "radar", match: ["scan", "symbol", "tm"] },
  { path: "/journal", label: "Journal", icon: "journal", match: ["journal"] },
  { path: "/alerts", label: "Alerts", icon: "bell", match: ["alerts"] },
  { path: "/settings", label: "Settings", icon: "sliders", match: ["settings"] },
];

function activeFor(route: Route): string {
  for (const item of ITEMS) if (item.match.includes(route.name)) return item.path;
  return "/";
}

export function Rail({ route }: { route: Route }) {
  const active = activeFor(route);
  const positions = useApp((s) => s.positions.length);
  return (
    <aside className="rail glass" aria-label="Primary">
      <div className="brand">
        <BrandMark size={36} />
        <div className="col" style={{ gap: 0 }}>
          <span className="brand-name">Stockify Pro</span>
          <span className="brand-sub">NSE Day Trader</span>
        </div>
      </div>

      <div className="hstack-scroll" style={{ gap: 8, padding: "0 4px 12px", overflowX: "visible" }}>
        <span className="pill green" style={{ height: 22 }}>
          <span className="live-dot" />
          Paper
        </span>
        <span className="pill" style={{ height: 22 }}>
          {positions} open
        </span>
      </div>

      {ITEMS.map((item) => (
        <button
          key={item.path}
          type="button"
          className={`rail-link ${active === item.path ? "on" : ""}`}
          onClick={() => navigate(item.path)}
        >
          <span className="rail-ico">
            <Icon name={item.icon} size={20} />
          </span>
          <span className="grow">{item.label}</span>
          {item.path === "/journal" && positions > 0 && <span className="pill green">{positions}</span>}
        </button>
      ))}

      <div className="rail-foot">
        Real NSE snapshots. Every order is paper.
        <br />
        Education and tooling, not financial advice.
      </div>
    </aside>
  );
}

export function TabBar({ route }: { route: Route }) {
  const active = activeFor(route);
  const positions = useApp((s) => s.positions.length);
  return (
    <nav className="tabbar" aria-label="Primary">
      {ITEMS.map((item) => {
        const on = active === item.path;
        return (
          <button
            key={item.path}
            type="button"
            className={`tab ${on ? "on" : ""}`}
            onClick={() => navigate(item.path)}
            aria-current={on ? "page" : undefined}
          >
            {item.path === "/journal" && positions > 0 && <span className="tab-dot" />}
            <Icon name={item.icon} size={21} />
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
