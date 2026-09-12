/**
 * Two-or-more-option pill toggle group.
 * @param {object} props
 * @param {string} props.label
 * @param {{ label: string, value: any }[]} props.options
 * @param {any} props.value
 * @param {(value: any) => void} props.onChange
 */
export function SegmentedControl({ label, options, value, onChange }) {
  return (
    <div role="group" aria-label={label}>
      <span className="mb-2 block text-sm font-semibold text-slate-700">{label}</span>
      <div className="inline-flex rounded-full bg-slate-100 p-1">
        {options.map((option) => (
          <button
            key={option.label}
            type="button"
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
            className={`min-h-11 rounded-full px-3 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 ${value === option.value ? 'bg-indigo-600 text-white' : 'text-slate-700 hover:bg-slate-200'}`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}