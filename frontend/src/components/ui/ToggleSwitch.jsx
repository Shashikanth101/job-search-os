/**
 * Labeled checkbox styled as a sliding toggle.
 * @param {object} props
 * @param {string} props.label
 * @param {boolean} props.checked
 * @param {(checked: boolean) => void} props.onChange
 */
export function ToggleSwitch({ label, checked, onChange }) {
  return (
    <label className="flex h-11 cursor-pointer items-center justify-between gap-4 rounded-lg border border-slate-300 px-3">
      <span className="text-sm font-semibold text-slate-700">{label}</span>
      <input
        className="peer sr-only"
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="relative h-6 w-11 rounded-full bg-slate-300 transition peer-checked:bg-indigo-600 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-indigo-600 after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow-sm after:transition after:content-[''] peer-checked:after:translate-x-5" />
    </label>
  );
}