const KEYS = [['↑ / ↓', 'move'], ['a', 'apply'], ['s', 'save'], ['x', 'skip'], ['/', 'search']];

/** Keyboard shortcut legend shown at the bottom of the sidebar (wide screens). */
export function KeyboardLegend() {
  return (
    <dl className="hidden grid-cols-[auto_1fr] gap-x-3 gap-y-1 border-t border-slate-200 px-3 pt-3 text-xs text-slate-500 md:grid" aria-label="Keyboard shortcuts">
      {KEYS.map(([key, action]) => (
        <div key={key} className="contents">
          <dt><kbd className="rounded-ui bg-slate-100 px-1.5 py-0.5 font-mono text-slate-700">{key}</kbd></dt>
          <dd>{action}</dd>
        </div>
      ))}
    </dl>
  );
}
