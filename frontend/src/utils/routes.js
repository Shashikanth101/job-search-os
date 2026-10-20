/** Sidebar structure. `status` / `origin` are the list filters the route applies; `countKey` is the key in /api/review/counts. */
export const JOB_ROUTES = [
  { id: 'inbox', label: 'Inbox', path: '/inbox', status: 'new', countKey: 'new' },
  { id: 'saved', label: 'Saved', path: '/saved', status: 'saved', countKey: 'saved' },
  { id: 'applying', label: 'Applying', path: '/applying', status: 'applying', countKey: 'applying' },
  { id: 'applied', label: 'Applied', path: '/applied', status: 'applied', countKey: 'applied' },
  { id: 'skipped', label: 'Skipped', path: '/skipped', status: 'skipped', countKey: 'skipped' },
  { id: 'all', label: 'All jobs', path: '/all', status: '', countKey: 'all' },
];
export const MANUAL_ROUTE = { id: 'manual', label: 'Manual', path: '/manual', status: '', origin: 'manual', countKey: 'manual' };
export const OUTREACH_ROUTE = { id: 'outreach', label: 'Outreach', path: '/outreach' };
export const OPS_ROUTE = { id: 'ops', label: 'Ops', path: '/ops' };

// Old URLs keep working by redirecting to their new home.
const REDIRECTS = { '/': '/inbox', '/review': '/inbox', '/review/manual': '/manual' };

/**
 * Resolve a URL path to a page (trailing slashes ignored).
 * @param {string} pathname
 * @returns {{page: 'jobs', route: object}|{page: 'outreach'|'ops'|'notfound'}|{page: 'redirect', to: string}}
 */
export function resolveRoute(pathname) {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (REDIRECTS[path]) return { page: 'redirect', to: REDIRECTS[path] };
  const jobRoute = [...JOB_ROUTES, MANUAL_ROUTE].find((route) => route.path === path);
  if (jobRoute) return { page: 'jobs', route: jobRoute };
  if (path === OUTREACH_ROUTE.path) return { page: 'outreach' };
  if (path === OPS_ROUTE.path) return { page: 'ops' };
  return { page: 'notfound' };
}

/** Browser tab title per page or job route id. */
export const PAGE_TITLES = { outreach: 'Outreach', ops: 'Ops', notfound: 'Not found', redirect: 'Job Search OS' };
