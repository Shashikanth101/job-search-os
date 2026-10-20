import { useEffect, useRef } from 'react';

/**
 * Checkbox dropdown for archetypes. Only archetypes that exist in the current view are listed; all are selected by default.
 * @param {object} props
 * @param {{value: string, count: number}[]} props.options - Archetypes present in the view (from /api/review/facets).
 * @param {string[]|null} props.selected - Selected archetypes, or null meaning all (the same selection filters the list and the sidebar counts).
 * @param {(selected: string[]|null) => void} props.onChange - Receives null when every archetype is selected (or the last one is unchecked).
 */
export function ArchetypeSelect({ options, selected, onChange }) {
  const ref = useRef(null);
  const effective = selected?.length ? selected : null;
  useEffect(() => {
    const close = (event) => { if (ref.current?.open && !ref.current.contains(event.target)) ref.current.open = false; };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  function toggle(value) {
    const current = effective ?? options.map((option) => option.value);
    const next = current.includes(value) ? current.filter((entry) => entry !== value) : [...current, value];
    onChange(next.length === 0 || options.every((option) => next.includes(option.value)) ? null : next);
  }

  const summary = effective ? `${effective.length} selected` : 'All';
  return (
    <div className="min-w-0">
      <span className="label">Archetype</span>
      <details ref={ref} className="relative">
        <summary className="field flex cursor-pointer list-none items-center justify-between" aria-label={`Archetype filter: ${summary}`}>
          <span className="truncate">{summary}</span><span aria-hidden="true" className="text-slate-400">▾</span>
        </summary>
        <div className="absolute z-20 mt-1 min-w-full rounded-ui border border-slate-200 bg-white p-2 shadow-lg">
          {options.length === 0 ? <p className="px-1 text-xs text-slate-500">No archetypes in this view.</p> : (
            <>
              <button type="button" className="mb-1 px-1 text-xs font-semibold text-accent" onClick={() => onChange(null)}>Select all</button>
              {options.map((option) => (
                <label key={option.value} className="flex cursor-pointer items-center gap-2 px-1 py-0.5 text-sm text-slate-700">
                  <input type="checkbox" checked={!effective || effective.includes(option.value)} onChange={() => toggle(option.value)} />
                  <span className="flex-1">{option.value}</span><span className="text-xs text-slate-400">{option.count}</span>
                </label>
              ))}
            </>
          )}
        </div>
      </details>
    </div>
  );
}
