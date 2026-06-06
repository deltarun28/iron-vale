// Resolve a file in the public/ directory to a URL that respects the deploy
// base path. In dev the base is "/"; in the GitHub Pages build it is
// "/iron-vale/". Vite exposes the active base as import.meta.env.BASE_URL
// (always ending in a slash), but it does NOT rewrite absolute "/foo.png"
// strings inside JS/TS — so any public asset referenced from code must go
// through this helper instead of a hardcoded leading-slash path.
export function asset(path: string): string {
  return import.meta.env.BASE_URL + path.replace(/^\//, "");
}
