const VARIANT_CLASSNAMES = {
  primary: 'min-h-10 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-indigo-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600',
  dark: 'min-h-11 rounded-lg bg-slate-950 px-5 py-2 text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60',
};

/**
 * Shared button primitive.
 * @param {object} props
 * @param {'primary'|'dark'} [props.variant='primary']
 * @param {'button'|'submit'} [props.type='button']
 * @param {boolean} [props.disabled]
 * @param {() => void} [props.onClick]
 * @param {import('react').ReactNode} props.children
 */
export function Button({ variant = 'primary', type = 'button', disabled, onClick, children, ...rest }) {
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={VARIANT_CLASSNAMES[variant]} {...rest}>
      {children}
    </button>
  );
}