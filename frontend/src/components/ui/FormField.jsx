const DEFAULT_INPUT_CLASSNAME = 'mt-2 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 font-normal outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20';
const DEFAULT_TEXTAREA_CLASSNAME = 'mt-2 min-h-32 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-normal outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20';

/**
 * Labeled form control — an input or a textarea.
 * @param {object} props
 * @param {string} props.label
 * @param {string} props.name
 * @param {'text'|'url'|'datetime-local'|'textarea'} [props.type='text']
 * @param {boolean} [props.required]
 * @param {string} [props.defaultValue]
 * @param {string} [props.placeholder]
 * @param {string} [props.labelClassName] - Extra classes on the wrapping <label> (e.g. 'sm:col-span-2').
 * @param {string} [props.fieldClassName] - Overrides the default input/textarea classes when a caller needs different styling.
 */
export function FormField({
  label,
  name,
  type = 'text',
  required,
  defaultValue,
  placeholder,
  labelClassName = '',
  fieldClassName,
}) {
  const resolvedFieldClassName = fieldClassName ?? (type === 'textarea' ? DEFAULT_TEXTAREA_CLASSNAME : DEFAULT_INPUT_CLASSNAME);

  return (
    <label className={`text-sm font-semibold text-slate-700 ${labelClassName}`.trim()}>
      {label}
      {type === 'textarea' ? (
        <textarea className={resolvedFieldClassName} name={name} required={required} defaultValue={defaultValue} placeholder={placeholder} />
      ) : (
        <input className={resolvedFieldClassName} type={type} name={name} required={required} defaultValue={defaultValue} placeholder={placeholder} />
      )}
    </label>
  );
}