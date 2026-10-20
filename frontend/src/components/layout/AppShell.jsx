import { JOB_ROUTES, MANUAL_ROUTE, OPS_ROUTE, OUTREACH_ROUTE } from '../../utils/routes';
import { KeyboardLegend } from './KeyboardLegend';
import { NavLink } from './NavLink';

/**
 * App shell: a left sidebar (a horizontal strip on narrow screens) around every page.
 * @param {object} props
 * @param {string} props.pathname - Current URL path.
 * @param {(to: string) => void} props.navigate - pushState navigation from usePathname.
 * @param {Record<string, number>|null} props.counts - Counts from /api/review/counts keyed by `countKey`, or null when unavailable (a dash is shown, never a false 0).
 * @param {import('react').ReactNode} props.children - The current page.
 */
export function AppShell({ pathname, navigate, counts, children }) {
  const active = (route) => pathname.replace(/\/+$/, '') === route.path;
  const link = (route) => <NavLink key={route.id} href={route.path} active={active(route)} navigate={navigate} count={route.countKey ? (counts ? counts[route.countKey] ?? 0 : '–') : null}>{route.label}</NavLink>;
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 md:flex">
      <aside className="border-b border-slate-200 bg-white md:sticky md:top-0 md:flex md:h-screen md:w-56 md:shrink-0 md:flex-col md:border-b-0 md:border-r">
        <p className="hidden px-4 py-4 text-xs font-bold uppercase tracking-[0.2em] text-accent md:block">Job Search OS</p>
        <nav aria-label="Main" className="flex gap-1 overflow-x-auto p-2 md:flex-1 md:flex-col md:overflow-visible">
          {JOB_ROUTES.map(link)}
          <span className="mx-2 hidden border-t border-slate-200 md:my-2 md:block" aria-hidden="true" />
          {link(MANUAL_ROUTE)}
          {link(OUTREACH_ROUTE)}
          <span className="md:mt-auto" />
          {link(OPS_ROUTE)}
        </nav>
        <div className="pb-3"><KeyboardLegend /></div>
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
