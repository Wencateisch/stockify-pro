import { useEffect, useState } from "react";

export type Route =
  | { name: "desk" }
  | { name: "category" }
  | { name: "scan" }
  | { name: "symbol"; symbol: string }
  | { name: "tm"; symbol: string }
  | { name: "journal" }
  | { name: "alerts" }
  | { name: "settings" }
  | { name: "notfound"; path: string };

export interface ParsedHash {
  path: string;
  query: URLSearchParams;
}

function readHash(): ParsedHash {
  const raw = window.location.hash.replace(/^#/, "") || "/";
  const qIndex = raw.indexOf("?");
  const path = qIndex >= 0 ? raw.slice(0, qIndex) : raw;
  const query = new URLSearchParams(qIndex >= 0 ? raw.slice(qIndex + 1) : "");
  return { path: path || "/", query };
}

export function parseRoute(path: string): Route {
  const parts = path.split("/").filter(Boolean).map(decodeURIComponent);
  if (!parts.length) return { name: "desk" };
  const [head, tail] = parts;
  if (head === "scan") return { name: "scan" };
  if (head === "category" || head === "categories") return { name: "category" };
  if (head === "journal") return { name: "journal" };
  if (head === "alerts") return { name: "alerts" };
  if (head === "settings") return { name: "settings" };
  if (head === "s" && tail) return { name: "symbol", symbol: tail.toUpperCase() };
  if (head === "tm" && tail) return { name: "tm", symbol: tail.toUpperCase() };
  return { name: "notfound", path };
}

export function useRoute(): Route & { query: URLSearchParams; path: string } {
  const [state, setState] = useState(readHash);
  useEffect(() => {
    const onChange = () => setState(readHash());
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return { ...parseRoute(state.path), query: state.query, path: state.path };
}

export function navigate(path: string, opts: { replace?: boolean } = {}) {
  const target = `#${path.startsWith("/") ? path : `/${path}`}`;
  if (window.location.hash === target) {
    window.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }
  if (opts.replace) {
    window.history.replaceState(null, "", target);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  } else {
    window.location.hash = target;
  }
  window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "auto" }));
}

export function symbolPath(symbol: string): string {
  return `/s/${encodeURIComponent(symbol)}`;
}

export function tmPath(symbol: string): string {
  return `/tm/${encodeURIComponent(symbol)}`;
}
