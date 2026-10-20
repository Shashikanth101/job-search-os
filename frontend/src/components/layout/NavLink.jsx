/**
 * Real <a href> link that navigates with history.pushState on a plain left click; modified clicks (new tab, etc.) and
 * hard refreshes use the browser's normal behavior.
 * @param {object} props
 * @param {string} props.href - Target path.
 * @param {boolean} props.active - Whether this link is the current page.
 * @param {(to: string) => void} props.navigate - pushState navigation from usePathname.
 * @param {number|string|null} [props.count] - Optional count badge.
 * @param {import('react').ReactNode} props.children
 */
export function NavLink({ href, active, navigate, count = null, children }) {
  function onClick(event) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate(href);
  }
  return (
    <a
      href={href}
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`flex shrink-0 items-center justify-between gap-3 rounded-ui px-3 py-1.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-accent ${active ? 'bg-accent-soft font-semibold text-accent-strong' : 'text-slate-600 hover:bg-slate-100'}`}
    >
      <span>{children}</span>
      {count != null ? <span className={`text-xs tabular-nums ${active ? 'text-accent-strong' : 'text-slate-400'}`}>{count}</span> : null}
    </a>
  );
}
