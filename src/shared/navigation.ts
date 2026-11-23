export type BoardRoute =
  | { kind: "home"; pathname: string }
  | { kind: "archive"; pathname: string }
  | { kind: "new"; pathname: string }
  | { kind: "note"; noteId: string; pathname: string };

const listeners = new Set<() => void>();
let bound = false;

export function parseBoardRoute(pathname: string): BoardRoute {
  const clean = pathname.replace(/\/+$/, "") || "/";
  if (clean === "/archive") {
    return { kind: "archive", pathname: "/archive" };
  }
  if (clean === "/note/new") {
    return { kind: "new", pathname: "/note/new" };
  }
  const match = /^\/note\/([^/]+)$/.exec(clean);
  if (match) {
    return {
      kind: "note",
      noteId: decodeURIComponent(match[1]),
      pathname: clean,
    };
  }
  return { kind: "home", pathname: "/" };
}

let currentRoute: BoardRoute =
  typeof window !== "undefined"
    ? parseBoardRoute(window.location.pathname)
    : { kind: "home", pathname: "/" };

function notify() {
  const next = parseBoardRoute(window.location.pathname);
  if (
    next.pathname === currentRoute.pathname &&
    next.kind === currentRoute.kind
  ) {
    return;
  }
  currentRoute = next;
  for (const listener of [...listeners]) listener();
}

function ensureBound() {
  if (bound || typeof window === "undefined") return;
  bound = true;
  window.addEventListener("popstate", notify);
}

export function getBoardRoute(): BoardRoute {
  ensureBound();
  return currentRoute;
}

export function subscribeBoardRoute(listener: () => void) {
  ensureBound();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function navigateBoard(
  pathname: string,
  { replace = false }: { replace?: boolean } = {},
) {
  if (typeof window === "undefined") return;
  ensureBound();
  const normalized = parseBoardRoute(pathname).pathname;
  const target = `${normalized}${window.location.search}`;
  if (
    normalized === currentRoute.pathname &&
    window.location.pathname === normalized
  ) {
    return;
  }
  if (replace) window.history.replaceState(null, "", target);
  else window.history.pushState(null, "", target);
  notify();
}
