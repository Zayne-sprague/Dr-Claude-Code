import { useState, useEffect, useCallback } from "react";

export interface HashRoute {
  page: "experiments" | "viz";
  tab: string;
  segments: string[];
  params: URLSearchParams;
}

const ROUTE_CHANGE = "routechange";
const STORAGE_KEY = "agg-viz-route";

/** Read the saved route hash from localStorage (fallback when hash is empty, e.g. in an iframe). */
function getSavedHash(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

/** Persist the current hash to localStorage so iframe reloads restore state. */
function saveHash(hash: string) {
  try {
    localStorage.setItem(STORAGE_KEY, hash);
  } catch {
    // localStorage unavailable — ignore
  }
}

/** Get the effective hash: prefer URL hash, fall back to localStorage. */
function effectiveHash(): string {
  const hash = window.location.hash;
  if (hash && hash !== "#" && hash !== "#/") return hash;
  return getSavedHash();
}

export function parseHash(hash?: string): HashRoute {
  const raw = (hash ?? effectiveHash()).replace(/^#\/?/, "");
  if (!raw) {
    return { page: "experiments", tab: "", segments: [], params: new URLSearchParams() };
  }

  const qIdx = raw.indexOf("?");
  const pathPart = qIdx >= 0 ? raw.slice(0, qIdx) : raw;
  const params = new URLSearchParams(qIdx >= 0 ? raw.slice(qIdx + 1) : "");
  const parts = pathPart.split("/").filter(Boolean);

  if (parts[0] === "viz") {
    return { page: "viz", tab: parts[1] || "model", segments: parts.slice(2), params };
  }

  // "experiments" or anything else defaults to experiments
  const segments = parts[0] === "experiments" ? parts.slice(1) : parts;
  return { page: "experiments", tab: "", segments, params };
}

function buildHash(route: HashRoute): string {
  const parts: string[] = [route.page === "viz" ? "viz" : "experiments"];
  if (route.page === "viz" && route.tab) parts.push(route.tab);
  if (route.segments.length) parts.push(...route.segments);
  let hash = "#/" + parts.join("/");
  const qs = route.params.toString();
  if (qs) hash += "?" + qs;
  return hash;
}

function applyRoute(hash: string, push: boolean) {
  saveHash(hash);
  if (window.location.hash === hash) return;
  if (push) {
    window.history.pushState(null, "", hash);
  } else {
    window.history.replaceState(null, "", hash);
  }
  window.dispatchEvent(new Event(ROUTE_CHANGE));
}

/** Navigate to a new route (creates browser history entry). */
export function navigateTo(update: Partial<HashRoute>) {
  const current = parseHash();
  const pageChanged = update.page !== undefined && update.page !== current.page;
  const tabChanged = update.tab !== undefined && update.tab !== current.tab;

  const merged: HashRoute = {
    page: update.page ?? current.page,
    tab: update.tab ?? (pageChanged ? (update.page === "viz" ? "model" : "") : current.tab),
    segments: update.segments ?? ((pageChanged || tabChanged) ? [] : current.segments),
    params: update.params ?? ((pageChanged || tabChanged) ? new URLSearchParams() : current.params),
  };
  applyRoute(buildHash(merged), true);
}

/** Replace current route (no history entry). Use for frequent state changes like indices. */
export function replaceRoute(update: Partial<HashRoute>) {
  const current = parseHash();
  const merged: HashRoute = {
    page: update.page ?? current.page,
    tab: update.tab ?? current.tab,
    segments: update.segments ?? current.segments,
    params: update.params ?? current.params,
  };
  applyRoute(buildHash(merged), false);
}

/** Build a shareable direct URL for the current route (bypasses HF iframe). */
export function getShareableUrl(): string {
  const hash = effectiveHash();
  // Use the app's direct origin (works for both .hf.space and localhost)
  return `${window.location.origin}${window.location.pathname}${hash}`;
}

/** Hook that re-renders on hash route changes. */
export function useHashRoute(): HashRoute {
  const [route, setRoute] = useState<HashRoute>(parseHash);

  useEffect(() => {
    const handler = () => setRoute(parseHash());
    window.addEventListener(ROUTE_CHANGE, handler);
    window.addEventListener("popstate", handler);
    window.addEventListener("hashchange", handler);
    return () => {
      window.removeEventListener(ROUTE_CHANGE, handler);
      window.removeEventListener("popstate", handler);
      window.removeEventListener("hashchange", handler);
    };
  }, []);

  // On mount, if URL hash is empty but localStorage has a saved route, apply it
  useEffect(() => {
    const urlHash = window.location.hash;
    if (!urlHash || urlHash === "#" || urlHash === "#/") {
      const saved = getSavedHash();
      if (saved) {
        window.history.replaceState(null, "", saved);
        setRoute(parseHash(saved));
      }
    }
  }, []);

  return route;
}

/** Hook for the copy-link button. Returns a callback that copies the shareable URL. */
export function useCopyLink() {
  const [copied, setCopied] = useState(false);

  const copyLink = useCallback(async () => {
    const url = getShareableUrl();
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: prompt user
      window.prompt("Copy this link:", url);
    }
  }, []);

  return { copyLink, copied };
}
