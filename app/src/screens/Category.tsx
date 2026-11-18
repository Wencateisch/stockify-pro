import { useMemo, useState } from "react";
import { useApp } from "../lib/store";
import { priceOf } from "../lib/prices";
import { sparkValues, initials } from "../lib/market";
import { industryOf, sectorOf, industriesIn, SECTOR_ORDER, SECTOR_BLURB } from "../lib/sectors";
import { navigate, symbolPath } from "../router";
import { minutesLabel, istClockStr } from "../lib/time";
import { pct, price as fmtPrice } from "../lib/format";
import { Icon } from "../components/Icons";
import { IstStamp } from "../components/IstClock";
import { Sparkline } from "../components/Chart";
import { Empty, Loading, Segmented } from "../components/UI";
import type { Instrument } from "../lib/types";

type GroupBy = "sector" | "industry";
type SortBy = "move" | "name";

interface Row {
  inst: Instrument;
  symbol: string;
  industry: string;
  sector: string;
  price: number;
  changePct: number;
  turnover: number;
  source: "snapshot" | "replay" | "live";
}

interface Group {
  key: string;
  name: string;
  sector: string;
  blurb: string;
  rows: Row[];
  industries: string[];
  avgPct: number;
  up: number;
  down: number;
  flat: number;
  turnover: number;
}

function buildGroup(key: string, sector: string, rows: Row[], industries: string[]): Group {
  let up = 0;
  let down = 0;
  let flat = 0;
  let sum = 0;
  let turnover = 0;
  for (const r of rows) {
    sum += r.changePct;
    turnover += r.turnover;
    if (r.changePct > 0.0001) up += 1;
    else if (r.changePct < -0.0001) down += 1;
    else flat += 1;
  }
  return {
    key,
    name: key,
    sector,
    blurb: SECTOR_BLURB[sector] || "",
    rows,
    industries,
    avgPct: rows.length ? sum / rows.length : 0,
    up,
    down,
    flat,
    turnover,
  };
}

function slug(key: string): string {
  return key.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
}

export function CategoryScreen() {
  const market = useApp((s) => s.market);
  const loading = useApp((s) => s.marketLoading);
  const error = useApp((s) => s.marketError);
  const load = useApp((s) => s.loadMarketData);
  const mode = useApp((s) => s.settings.mode);
  const replay = useApp((s) => s.replay);
  const liveQuotes = useApp((s) => s.liveQuotes);

  const [groupBy, setGroupBy] = useState<GroupBy>("sector");
  const [sortBy, setSortBy] = useState<SortBy>("move");
  const [q, setQ] = useState("");
  const [closed, setClosed] = useState<Set<string>>(() => new Set());

  const rows = useMemo<Row[]>(() => {
    if (!market) return [];
    return market.symbols.map((inst) => {
      const p = priceOf(inst, market, mode, replay, liveQuotes);
      return {
        inst,
        symbol: inst.symbol,
        industry: industryOf(inst.symbol),
        sector: sectorOf(inst.symbol),
        price: p.price,
        changePct: p.changePct,
        turnover: p.price * (p.volume || 0),
        source: p.source,
      };
    });
  }, [market, mode, replay, liveQuotes]);

  const liveCount = rows.filter((r) => r.source === "live").length;

  const quoteAsOf = useMemo(() => {
    let t = 0;
    for (const q of Object.values(liveQuotes)) if ((q.asOf || 0) > t) t = q.asOf || 0;
    return t;
  }, [liveQuotes]);
  const stampTs = mode === "live" && quoteAsOf ? quoteAsOf : Date.parse(market?.generatedAt || "") || 0;

  const groups = useMemo<Group[]>(() => {
    if (groupBy === "sector") {
      const bySector = new Map<string, Row[]>();
      for (const row of rows) {
        const list = bySector.get(row.sector) || [];
        list.push(row);
        bySector.set(row.sector, list);
      }
      const order = SECTOR_ORDER.filter((s) => bySector.has(s));
      const extra = [...bySector.keys()].filter((s) => !order.includes(s)).sort();
      return [...order, ...extra].map((sector) => {
        const members = bySector.get(sector) || [];
        return buildGroup(sector, sector, members, industriesIn(sector, members.map((r) => r.symbol)));
      });
    }
    const byIndustry = new Map<string, Row[]>();
    for (const row of rows) {
      const list = byIndustry.get(row.industry) || [];
      list.push(row);
      byIndustry.set(row.industry, list);
    }
    // Follow the sector order so peer industries stay next to each other.
    return [...byIndustry.entries()]
      .sort((a, b) => {
        const sa = SECTOR_ORDER.indexOf(sectorOf(a[1][0].symbol));
        const sb = SECTOR_ORDER.indexOf(sectorOf(b[1][0].symbol));
        if (sa !== sb) return (sa < 0 ? 99 : sa) - (sb < 0 ? 99 : sb);
        return a[0].localeCompare(b[0]);
      })
      .map(([industry, members]) => {
        const sector = members[0].sector;
        return buildGroup(industry, sector, members, [industry]);
      });
  }, [rows, groupBy]);

  const ranked = useMemo(() => {
    return [...groups].sort((a, b) => b.avgPct - a.avgPct);
  }, [groups]);
  const strongest = ranked[0] || null;
  const weakest = ranked.length > 1 ? ranked[ranked.length - 1] : null;

  const needle = q.trim().toUpperCase();

  const visible = useMemo(() => {
    const matches = (g: Group, r: Row) =>
      !needle ||
      r.symbol.includes(needle) ||
      r.inst.name.toUpperCase().includes(needle) ||
      r.industry.toUpperCase().includes(needle) ||
      r.sector.toUpperCase().includes(needle);

    const list = groups
      .map((g) => {
        const groupHit =
          !!needle &&
          (g.name.toUpperCase().includes(needle) || g.sector.toUpperCase().includes(needle));
        const rowsHit = g.rows.filter((r) => groupHit || matches(g, r));
        return { group: g, rows: rowsHit };
      })
      .filter((x) => x.rows.length > 0)
      // Rebuild each group from what is actually shown, so a search never leaves
      // a header claiming four names while two rows are on screen.
      .map(({ group, rows }) => {
        const sorted = [...rows].sort((a, b) => b.changePct - a.changePct);
        const industries =
          groupBy === "sector" ? industriesIn(group.sector, sorted.map((r) => r.symbol)) : [group.name];
        return buildGroup(group.key, group.sector, sorted, industries);
      });

    if (sortBy === "name") list.sort((a, b) => a.name.localeCompare(b.name));
    else list.sort((a, b) => Math.abs(b.avgPct) - Math.abs(a.avgPct));

    return list;
  }, [groups, groupBy, needle, sortBy]);

  const visibleTotal = visible.reduce((a, g) => a + g.rows.length, 0);
  const upGroups = groups.filter((g) => g.avgPct > 0.0001).length;
  const downGroups = groups.filter((g) => g.avgPct < -0.0001).length;

  const toggle = (key: string) => {
    setClosed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const jumpTo = (key: string) => {
    setClosed((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
    window.requestAnimationFrame(() => {
      document.getElementById(`cat-${slug(key)}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  if (!market) {
    return (
      <div className="page">
        <div className="page-head">
          <div>
            <h1 className="page-title">Categories</h1>
            <div className="page-sub">Every Nifty 50 name grouped by industry.</div>
          </div>
        </div>
        <div className="glass card">
          {loading ? (
            <Loading label="Reading 50 symbols and their industries" />
          ) : (
            <Empty
              icon="layers"
              title="The snapshot did not load"
              action={
                <button type="button" className="btn primary" onClick={() => void load()}>
                  Try again
                </button>
              }
            >
              {error || "The bundled market snapshot is missing."}
            </Empty>
          )}
        </div>
      </div>
    );
  }

  const sourcePill = replay
    ? `Replay · ${minutesLabel(replay.minutes)}`
    : mode === "live"
      ? liveCount
        ? `Live · ${liveCount}/${rows.length}`
        : "Live · connecting"
      : `Snapshot · ${market.session.date}`;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Categories</h1>
          <div className="page-sub">
            {rows.length} names in {groups.length} {groupBy === "sector" ? "sectors" : "industries"} ·{" "}
            {upGroups} up / {downGroups} down · equal-weight
          </div>
          {replay ? (
            <div className="tiny muted" style={{ marginTop: 4 }}>
              Replay clock {minutesLabel(replay.minutes)} IST · live wall clock with seconds above
            </div>
          ) : (
            !!stampTs && (
              <div className="tiny muted" style={{ marginTop: 4 }}>
                <IstStamp ts={stampTs} label={mode === "live" ? "Quotes as of" : "Snapshot taken"} />
              </div>
            )
          )}
        </div>
        <span className={`pill ${mode === "live" && !replay ? "green" : ""}`}>{sourcePill}</span>
      </div>

      <Segmented
        ariaLabel="Group stocks by"
        value={groupBy}
        onChange={(v) => {
          setGroupBy(v);
          setClosed(new Set());
        }}
        options={[
          { value: "sector", label: "Sectors" },
          { value: "industry", label: "Industries" },
        ]}
      />

      {strongest && weakest && (
        <div className="cat-leaders">
          <button type="button" className="glass flat cat-leader press" onClick={() => jumpTo(strongest.key)}>
            <span className="metric-k">Strongest {groupBy}</span>
            <span className="cat-leader-name">
              {strongest.name} <span className="up num">{pct(strongest.avgPct)}</span>
            </span>
            <span className="tiny muted">
              {strongest.up} of {strongest.rows.length} advancing
            </span>
          </button>
          <button type="button" className="glass flat cat-leader press" onClick={() => jumpTo(weakest.key)}>
            <span className="metric-k">Weakest {groupBy}</span>
            <span className="cat-leader-name">
              {weakest.name} <span className="down num">{pct(weakest.avgPct)}</span>
            </span>
            <span className="tiny muted">
              {weakest.down} of {weakest.rows.length} declining
            </span>
          </button>
        </div>
      )}

      <div className="row" style={{ gap: 8, alignItems: "center" }}>
        <div className="input-affix grow">
          <span style={{ display: "grid", placeItems: "center", top: 0, height: 42, transform: "none" }}>
            <Icon name="search" size={15} />
          </span>
          <input
            className="input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search stock, industry or sector"
            autoComplete="off"
            spellCheck={false}
            style={{ paddingLeft: 32 }}
            aria-label="Search categories"
          />
        </div>
        <button
          type="button"
          className="chip"
          onClick={() => setSortBy(sortBy === "move" ? "name" : "move")}
          aria-label={`Sort by ${sortBy === "move" ? "name" : "biggest move"}`}
        >
          <Icon name="chart" size={13} /> {sortBy === "move" ? "Biggest move" : "A–Z"}
        </button>
      </div>

      {!visible.length && (
        <div className="glass card">
          <Empty icon="search" title="Nothing in that category">
            No Nifty 50 name matches “{q.trim()}”. Try a symbol, an industry (retail, banks) or a sector.
          </Empty>
        </div>
      )}

      {visible.map((g) => {
        const open = !closed.has(g.key);
        const total = Math.max(1, g.rows.length);
        const upW = (g.up / total) * 100;
        const flatW = (g.flat / total) * 100;
        const downW = (g.down / total) * 100;
        const color = g.avgPct > 0.0001 ? "var(--green)" : g.avgPct < -0.0001 ? "var(--red)" : "var(--ink-2)";
        return (
          <section key={g.key} id={`cat-${slug(g.key)}`} className="glass card cat-group">
            <button
              type="button"
              className="cat-head"
              aria-expanded={open}
              onClick={() => toggle(g.key)}
            >
              <div className="grow col" style={{ gap: 6, minWidth: 0 }}>
                <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                  <span className="cat-name">{g.name}</span>
                  <span className="tiny muted">
                    {g.rows.length} {g.rows.length === 1 ? "name" : "names"}
                    {groupBy === "sector" && g.industries.length > 1
                      ? ` · ${g.industries.length} industries`
                      : ""}
                    {groupBy === "industry" ? ` · ${g.sector}` : ""}
                  </span>
                </div>
                <div className="cat-bar" aria-hidden="true">
                  <i className="up" style={{ width: `${upW}%` }} />
                  <i className="flat" style={{ width: `${flatW}%` }} />
                  <i className="down" style={{ width: `${downW}%` }} />
                </div>
                <span className="tiny muted cat-note">
                  {groupBy === "sector" ? `${g.blurb} · ` : ""}turnover ≈ ₹
                  {(g.turnover / 1e7).toLocaleString("en-IN", { maximumFractionDigits: 0 })} Cr
                </span>
              </div>
              <div className="col right" style={{ gap: 3, flex: "none" }}>
                <span className="cat-pct num" style={{ color }}>
                  {pct(g.avgPct)}
                </span>
                <span className="tiny muted">
                  {g.up}↑ {g.down}↓{g.flat ? ` ${g.flat}=` : ""}
                </span>
              </div>
              <Icon name="chevron" size={16} className={`cat-chev ${open ? "open" : ""}`} />
            </button>

            {open && (
              <div className="cat-rows">
                {g.rows.map((r) => {
                  const up = r.changePct >= 0;
                  const rowAsOf = mode === "live" && !replay ? liveQuotes[r.symbol]?.asOf || 0 : 0;
                  return (
                    <button
                      key={r.symbol}
                      type="button"
                      className="list-row press cat-row"
                      onClick={() => navigate(symbolPath(r.symbol))}
                    >
                      <div className="sym-badge">{initials(r.symbol)}</div>
                      <div className="col grow" style={{ gap: 2, minWidth: 0 }}>
                        <span className="sym-name">{r.symbol}</span>
                        <span className="sym-meta">
                          {r.inst.name}
                          {groupBy === "sector" ? ` · ${r.industry}` : ""}
                        </span>
                      </div>
                      <Sparkline values={sparkValues(r.inst)} width={52} height={24} />
                      <div className="col right" style={{ gap: 2, flex: "none" }}>
                        <span className="num strong">₹{fmtPrice(r.price)}</span>
                        <span className={`tiny ${up ? "up" : "down"}`}>{pct(r.changePct)}</span>
                        {!!rowAsOf && <span className="tiny muted mono" style={{ fontSize: 9.5 }}>{istClockStr(rowAsOf)}</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}

      <p className="tiny muted" style={{ lineHeight: 1.6, padding: "0 4px" }}>
        {needle
          ? `${visibleTotal} matching ${visibleTotal === 1 ? "name" : "names"}. `
          : ""}
        Every Nifty 50 stock is in exactly one industry, and each industry sits in one sector. Group moves are the
        equal-weight average of their members, not an index.{" "}
        {mode === "live" && !replay
          ? liveCount === rows.length
            ? "Prices are live from the public NSE feed."
            : `Live quotes loaded for ${liveCount} of ${rows.length} names; the rest show the snapshot.`
          : replay
            ? "Prices follow the replay clock."
            : `Prices are from the bundled snapshot of ${market.session.date}.`}
      </p>
    </div>
  );
}
