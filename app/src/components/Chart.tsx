import { useEffect, useId, useRef, useState } from "react";

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(320);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setWidth(Math.max(180, Math.round(el.getBoundingClientRect().width)));
    update();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", update);
      return () => window.removeEventListener("resize", update);
    }
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, width };
}

function smoothPath(pts: number[][]) {
  if (!pts.length) return "";
  if (pts.length === 1) return `M ${pts[0][0]} ${pts[0][1]}`;
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const mx = (x0 + x1) / 2;
    d += ` C ${mx} ${y0} ${mx} ${y1} ${x1} ${y1}`;
  }
  return d;
}

export function Sparkline({
  values,
  width = 74,
  height = 30,
  stroke,
  fill = true,
}: {
  values: number[];
  width?: number;
  height?: number;
  stroke?: string;
  fill?: boolean;
}) {
  if (values.length < 2) return <div className="spark" aria-hidden="true" />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pad = 2;
  const pts = values.map((v, i) => [
    (i / (values.length - 1)) * width,
    height - pad - ((v - min) / span) * (height - pad * 2),
  ]);
  const up = values[values.length - 1] >= values[0];
  const color = stroke || (up ? "var(--green)" : "var(--red)");
  const id = useId().replace(/:/g, "");
  const d = smoothPath(pts);
  return (
    <svg className="spark" viewBox={`0 0 ${width} ${height}`} width={width} height={height} aria-hidden="true">
      <defs>
        <linearGradient id={`sp${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.34" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {fill && <path d={`${d} L ${width} ${height} L 0 ${height} Z`} fill={`url(#sp${id})`} />}
      <path d={d} fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

export interface SeriesPoint {
  x: number;
  y: number;
  label?: string;
  tip?: string;
}

export interface ChartBand {
  value: number;
  color?: string;
  label?: string;
  dashed?: boolean;
  width?: number;
}

export function SeriesChart({
  points,
  height = 156,
  color = "var(--green)",
  fill = true,
  bands = [],
  xTicks = [],
  yFmt = (n: number) => n.toFixed(2),
  showLast = true,
  minSpan,
}: {
  points: SeriesPoint[];
  height?: number;
  color?: string;
  fill?: boolean;
  bands?: ChartBand[];
  xTicks?: { x: number; label: string }[];
  yFmt?: (n: number) => string;
  showLast?: boolean;
  minSpan?: number;
}) {
  const { ref, width } = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const id = useId().replace(/:/g, "");

  const padL = 4;
  const padR = 46;
  const padT = 12;
  const padB = xTicks.length ? 20 : 8;
  const w = width;
  const innerW = Math.max(20, w - padL - padR);
  const innerH = Math.max(30, height - padT - padB);

  if (!points.length) {
    return <div className="empty" style={{ padding: "18px 10px" }}>No chart data.</div>;
  }

  const xs = points.map((p) => p.x);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  let y0 = Math.min(...points.map((p) => p.y), ...bands.map((b) => b.value));
  let y1 = Math.max(...points.map((p) => p.y), ...bands.map((b) => b.value));
  if (minSpan && y1 - y0 < minSpan) {
    const mid = (y1 + y0) / 2;
    y0 = mid - minSpan / 2;
    y1 = mid + minSpan / 2;
  }
  const span = y1 - y0 || Math.max(0.01, Math.abs(y1) * 0.01);
  y0 -= span * 0.08;
  y1 += span * 0.08;

  const px = (x: number) => padL + ((x - x0) / (x1 - x0 || 1)) * innerW;
  const py = (y: number) => padT + (1 - (y - y0) / (y1 - y0 || 1)) * innerH;
  const pts = points.map((p) => [px(p.x), py(p.y)]);
  const d = smoothPath(pts);
  const last = points[points.length - 1];
  const grid = [0, 0.5, 1].map((f) => y1 - (y1 - y0) * f);

  // Nudge overlapping level labels apart so entry/prev-close/OR never collide.
  const bandLabels: { y: number; text: string; color: string }[] = [];
  for (const b of bands) {
    if (!b.label) continue;
    let y = Math.max(9, Math.min(height - padB - 2, py(b.value) - 4));
    while (bandLabels.some((l) => Math.abs(l.y - y) < 11)) y += 11;
    if (y > height - padB - 2) y = Math.max(9, y - 22);
    bandLabels.push({ y, text: b.label, color: b.color || "rgba(238,242,255,0.5)" });
  }

  const onMove = (clientX: number) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const rel = clientX - rect.left;
    let best = 0;
    let bestD = Infinity;
    points.forEach((p, i) => {
      const dist = Math.abs(px(p.x) - rel);
      if (dist < bestD) {
        bestD = dist;
        best = i;
      }
    });
    setHover(best);
  };

  const hp = hover !== null ? points[hover] : null;

  return (
    <div className="chart-wrap" ref={ref} style={{ height }}>
      <svg
        width={w}
        height={height}
        role="img"
        aria-label="price chart"
        onPointerMove={(e) => onMove(e.clientX)}
        onPointerDown={(e) => onMove(e.clientX)}
        onPointerLeave={() => setHover(null)}
        style={{ display: "block" }}
      >
        <defs>
          <linearGradient id={`ar${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.28" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>

        {grid.map((g, i) => (
          <g key={i}>
            <line x1={padL} x2={w - padR + 22} y1={py(g)} y2={py(g)} stroke="rgba(255,255,255,0.055)" strokeWidth="1" />
            <text
              x={w - 2}
              y={py(g) + 3.5}
              fill="rgba(238,242,255,0.34)"
              fontSize="9.5"
              fontFamily="var(--mono)"
              textAnchor="end"
            >
              {yFmt(g)}
            </text>
          </g>
        ))}

        {bands.map((b, i) => (
          <g key={`b${i}`}>
            <line
              x1={padL}
              x2={w - padR + 22}
              y1={py(b.value)}
              y2={py(b.value)}
              stroke={b.color || "rgba(255,255,255,0.3)"}
              strokeWidth={b.width || 1}
              strokeDasharray={b.dashed === false ? undefined : "4 4"}
              opacity="0.85"
            />
          </g>
        ))}

        {bandLabels.map((l, i) => (
          <text key={`bl${i}`} x={padL + 2} y={l.y} fill={l.color} fontSize="9" fontWeight="600" letterSpacing="0.04em">
            {l.text}
          </text>
        ))}

        {fill && (
          <path
            d={`${d} L ${px(last.x)} ${height - padB} L ${px(points[0].x)} ${height - padB} Z`}
            fill={`url(#ar${id})`}
          />
        )}
        <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

        {showLast && (
          <>
            <circle cx={px(last.x)} cy={py(last.y)} r="6" fill={color} opacity="0.18" />
            <circle cx={px(last.x)} cy={py(last.y)} r="2.8" fill={color} stroke="rgba(5,7,13,0.9)" strokeWidth="1.4" />
          </>
        )}

        {xTicks.map((t, i) => (
          <text
            key={i}
            x={Math.min(w - padR - 2, Math.max(padL + 2, px(t.x)))}
            y={height - 4}
            fill="rgba(238,242,255,0.34)"
            fontSize="9.5"
            textAnchor={i === 0 ? "start" : i === xTicks.length - 1 ? "end" : "middle"}
            fontFamily="var(--mono)"
          >
            {t.label}
          </text>
        ))}

        {hp && (
          <g>
            <line
              x1={px(hp.x)}
              x2={px(hp.x)}
              y1={padT}
              y2={height - padB}
              stroke="rgba(255,255,255,0.22)"
              strokeWidth="1"
              strokeDasharray="3 3"
            />
            <circle cx={px(hp.x)} cy={py(hp.y)} r="3.4" fill={color} stroke="#05070d" strokeWidth="1.6" />
          </g>
        )}
      </svg>

      {hp && (
        <div
          className="chart-tip"
          style={{ left: Math.min(w - 62, Math.max(62, px(hp.x))) }}
        >
          {hp.tip || hp.label || yFmt(hp.y)}
        </div>
      )}
    </div>
  );
}

export function FanChart({
  bands,
  paths = [],
  times = [],
  entry,
  stop,
  target,
  height = 230,
}: {
  bands: number[][];
  paths?: number[][];
  times?: number[];
  entry: number;
  stop: number;
  target: number;
  height?: number;
}) {
  const { ref, width } = useWidth<HTMLDivElement>();
  const id = useId().replace(/:/g, "");
  const padL = 4;
  const padR = 48;
  const padT = 12;
  const padB = 20;
  const w = width;
  const innerW = Math.max(20, w - padL - padR);
  const innerH = Math.max(40, height - padT - padB);

  const all = bands.flat().concat([entry, stop, target]);
  let y0 = Math.min(...all);
  let y1 = Math.max(...all);
  const pad = (y1 - y0) * 0.08 || entry * 0.005;
  y0 -= pad;
  y1 += pad;

  const n = bands.length;
  const px = (i: number) => padL + (n <= 1 ? 0 : (i / (n - 1)) * innerW);
  const py = (v: number) => padT + (1 - (v - y0) / (y1 - y0 || 1)) * innerH;

  const bandPath = (lo: number, hi: number) => {
    if (!n) return "";
    const up = bands.map((b, i) => `${i === 0 ? "M" : "L"} ${px(i)} ${py(b[hi])}`).join(" ");
    const down = bands
      .map((b, i) => ({ i, v: b[lo] }))
      .reverse()
      .map((p) => `L ${px(p.i)} ${py(p.v)}`)
      .join(" ");
    return `${up} ${down} Z`;
  };

  const median = bands.map((b, i) => [px(i), py(b[2])]);

  const lines: { value: number; color: string; label: string }[] = [
    { value: target, color: "var(--green)", label: "target" },
    { value: entry, color: "rgba(238,242,255,0.55)", label: "entry" },
    { value: stop, color: "var(--red)", label: "stop" },
  ];

  return (
    <div className="chart-wrap" ref={ref} style={{ height }}>
      <svg width={w} height={height} role="img" aria-label="replay fan chart" style={{ display: "block" }}>
        <defs>
          <linearGradient id={`fan${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#4ade9b" stopOpacity="0.2" />
            <stop offset="50%" stopColor="#8fb3ff" stopOpacity="0.12" />
            <stop offset="100%" stopColor="#f4526a" stopOpacity="0.16" />
          </linearGradient>
        </defs>

        {[0, 0.25, 0.5, 0.75, 1].map((f, i) => {
          const v = y1 - (y1 - y0) * f;
          return (
            <g key={i}>
              <line x1={padL} x2={w - padR + 18} y1={py(v)} y2={py(v)} stroke="rgba(255,255,255,0.05)" />
              <text
                x={w - 2}
                y={py(v) + 3.5}
                fill="rgba(238,242,255,0.32)"
                fontSize="9.5"
                fontFamily="var(--mono)"
                textAnchor="end"
              >
                {v.toFixed(1)}
              </text>
            </g>
          );
        })}

        {n > 1 && (
          <>
            <path d={bandPath(0, 4)} fill={`url(#fan${id})`} />
            <path d={bandPath(1, 3)} fill="rgba(143,179,255,0.13)" />
          </>
        )}

        {paths.map((p, i) => (
          <path
            key={i}
            d={p.map((v, j) => `${j === 0 ? "M" : "L"} ${px(j)} ${py(v)}`).join(" ")}
            fill="none"
            stroke="rgba(238,242,255,0.11)"
            strokeWidth="0.8"
          />
        ))}

        {n > 1 && <path d={smoothPath(median)} fill="none" stroke="#c7d5ff" strokeWidth="1.6" opacity="0.85" />}

        {lines.map((l, i) => (
          <g key={i}>
            <line
              x1={padL}
              x2={w - padR + 18}
              y1={py(l.value)}
              y2={py(l.value)}
              stroke={l.color}
              strokeWidth="1.1"
              strokeDasharray="5 4"
            />
            <text
              x={padL + 3}
              y={Math.max(9, py(l.value) - 4)}
              fill={l.color}
              fontSize="9"
              fontWeight="600"
              letterSpacing="0.04em"
            >
              {l.label} {l.value.toFixed(2)}
            </text>
          </g>
        ))}

        {times.length > 1 &&
          [0, Math.floor(times.length / 2), times.length - 1].map((idx, i) => (
            <text
              key={i}
              x={Math.min(w - padR - 2, Math.max(padL + 2, px(idx)))}
              y={height - 4}
              fill="rgba(238,242,255,0.34)"
              fontSize="9.5"
              textAnchor={i === 0 ? "start" : i === 2 ? "end" : "middle"}
              fontFamily="var(--mono)"
            >
              {`${String(Math.floor(times[idx] / 60) % 24).padStart(2, "0")}:${String(times[idx] % 60).padStart(2, "0")}`}
            </text>
          ))}
      </svg>
    </div>
  );
}

export function HistogramChart({
  hist,
  entry,
  height = 92,
}: {
  hist: { lo: number; hi: number; bins: number[] };
  entry?: number;
  height?: number;
}) {
  const { ref, width } = useWidth<HTMLDivElement>();
  const max = Math.max(1, ...hist.bins);
  const bw = width / Math.max(1, hist.bins.length);
  const entryX =
    entry !== undefined && hist.hi > hist.lo ? ((entry - hist.lo) / (hist.hi - hist.lo)) * width : null;
  return (
    <div ref={ref} style={{ width: "100%" }}>
      <svg width={width} height={height} role="img" aria-label="distribution of closing prices">
        {hist.bins.map((v, i) => {
          const h = (v / max) * (height - 16);
          const x = i * bw;
          const mid = hist.lo + ((i + 0.5) / hist.bins.length) * (hist.hi - hist.lo);
          const above = entry === undefined ? true : mid >= entry;
          return (
            <rect
              key={i}
              x={x + 0.8}
              y={height - h - 12}
              width={Math.max(1.5, bw - 1.6)}
              height={Math.max(1, h)}
              rx="1.6"
              fill={above ? "rgba(74,222,155,0.62)" : "rgba(244,82,106,0.55)"}
            />
          );
        })}
        {entryX !== null && (
          <line x1={entryX} x2={entryX} y1={2} y2={height - 12} stroke="rgba(238,242,255,0.7)" strokeDasharray="3 3" />
        )}
        <line x1="0" x2={width} y1={height - 12} y2={height - 12} stroke="rgba(255,255,255,0.14)" />
        <text x="0" y={height - 2} fill="rgba(238,242,255,0.34)" fontSize="9" fontFamily="var(--mono)">
          ₹{hist.lo.toFixed(2)}
        </text>
        <text x={width} y={height - 2} fill="rgba(238,242,255,0.34)" fontSize="9" textAnchor="end" fontFamily="var(--mono)">
          ₹{hist.hi.toFixed(2)}
        </text>
      </svg>
    </div>
  );
}
