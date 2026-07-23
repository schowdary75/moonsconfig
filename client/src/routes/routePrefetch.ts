// Warms heavy lazy-loaded route chunks *before* the user clicks, so navigation
// to them feels instant instead of stalling while the chunk downloads/compiles.
//
// These specifiers must stay byte-identical to the ones in legacyRouteManifest.ts
// so Vite/Rollup resolves them to the same chunk (a prefetch then a real import
// share one network request + one module instance).
const IMPORTERS: Record<string, () => Promise<unknown>> = {
  '/quotes': () => import('./_authenticated/quotes/index'),
  '/route-map': () => import('./_authenticated/route-map'),
  '/ppm/visual-ai': () => import('./_authenticated/ppm/visual-ai'),
  '/command-center': () => import('./_authenticated/command-center'),
  '/mission-control': () => import('./_authenticated/mission-control'),
};

// Routes worth warming as soon as the app is idle, even without a hover — these
// are the biggest chunks and the ones users reported as slow to open.
const IDLE_WARM: string[] = ['/quotes', '/route-map'];

const warmed = new Set<string>();

/** Fire-and-forget prefetch of a route chunk. Safe to call repeatedly. */
export function prefetchRoute(href?: string): void {
  if (!href) return;
  const importer = IMPORTERS[href];
  if (!importer || warmed.has(href)) return;
  warmed.add(href);
  // Failure is non-fatal: the chunk will simply load on click instead.
  importer().catch(() => warmed.delete(href));
}

/** Prefetch the heaviest routes once the main thread is idle after first paint. */
export function prefetchHeavyRoutesWhenIdle(): void {
  const run = () => IDLE_WARM.forEach(prefetchRoute);
  const ric = (window as any).requestIdleCallback;
  if (typeof ric === 'function') ric(run, { timeout: 4000 });
  else setTimeout(run, 1500);
}
