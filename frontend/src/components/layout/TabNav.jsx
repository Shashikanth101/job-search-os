const TABS = [
  ['jobs', 'Job feed'],
  ['outreach', 'Outreach'],
];

/**
 * Dashboard section tabs (Job feed / Outreach).
 * @param {{ activeTab: string, onChange: (tab: string) => void }} props
 */
export function TabNav({ activeTab, onChange }) {
  return (
    <nav className="mb-8 flex gap-2 border-b border-slate-200" aria-label="Dashboard sections">
      {TABS.map(([tab, label]) => (
        <button
          key={tab}
          type="button"
          role="tab"
          aria-selected={activeTab === tab}
          onClick={() => onChange(tab)}
          className={`min-h-11 border-b-2 px-4 text-sm font-bold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 ${activeTab === tab ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'}`}
        >
          {label}
        </button>
      ))}
    </nav>
  );
}