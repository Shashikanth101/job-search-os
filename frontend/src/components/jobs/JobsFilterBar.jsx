import { ArchetypeSelect } from './ArchetypeSelect';

const LOCATION_LABELS = { india: 'India', remote: 'Remote', other: 'Other', unknown: 'Unknown' };
const GROUPS = [['none', 'None'], ['company', 'Company'], ['score', 'Score']];

function Filter({ label, value, onChange, options, format = (option) => option, allLabel = 'All' }) {
  return (
    <label className="min-w-0">
      <span className="label">{label}</span>
      <select className="field" value={value} onChange={(event) => onChange(event.target.value)}>
        {allLabel !== null && <option value="">{allLabel}</option>}
        {options.map((option) => <option key={option} value={option}>{format(option)}</option>)}
      </select>
    </label>
  );
}

/**
 * One compact row of list controls: min score, archetype multi-select, location group, company, search, group by.
 * @param {object} props
 * @param {{minScore: number, archetypes: string[]|null, locationGroup: string, company: string, q: string}} props.values - Current filters (archetypes null = all).
 * @param {'none'|'company'|'score'} props.groupBy
 * @param {(patch: object) => void} props.onChange - Partial filter patch.
 * @param {(groupBy: string) => void} props.onGroupByChange
 * @param {{companies: string[], locationGroups: string[]}} props.options - Choices from /api/review/filters.
 * @param {{value: string, count: number}[]} props.archetypeOptions - Archetypes present in this view.
 * @param {import('react').RefObject<HTMLInputElement>} props.searchRef - Focused by the "/" shortcut.
 */
export function JobsFilterBar({ values, groupBy, onChange, onGroupByChange, options, archetypeOptions, searchRef }) {
  return (
    <section aria-label="Filters" className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-[5rem_8rem_repeat(2,minmax(0,1fr))_minmax(0,1.4fr)_7rem]">
      <Filter label="Min score" value={String(values.minScore)} onChange={(value) => onChange({ minScore: Number(value) })} options={['10', '9', '8', '7', '6', '5', '3', '1']} allLabel={null} />
      <ArchetypeSelect options={archetypeOptions} selected={values.archetypes} onChange={(archetypes) => onChange({ archetypes })} />
      <Filter label="Location" value={values.locationGroup} onChange={(locationGroup) => onChange({ locationGroup })} options={options.locationGroups} format={(group) => LOCATION_LABELS[group] ?? group} />
      <Filter label="Company" value={values.company} onChange={(company) => onChange({ company })} options={options.companies} />
      <label className="col-span-2 min-w-0 sm:col-span-1">
        <span className="label">Search <kbd className="font-normal">/</kbd></span>
        <input ref={searchRef} className="field" type="search" defaultValue={values.q} placeholder="title, company, reason"
          onKeyDown={(event) => { if (event.key === 'Enter') onChange({ q: event.currentTarget.value.trim() }); if (event.key === 'Escape') event.currentTarget.blur(); }}
          onBlur={(event) => { if (event.currentTarget.value.trim() !== values.q) onChange({ q: event.currentTarget.value.trim() }); }} />
      </label>
      <Filter label="Group by" value={groupBy} onChange={onGroupByChange} options={GROUPS.map(([value]) => value)} format={(value) => GROUPS.find(([id]) => id === value)[1]} allLabel={null} />
    </section>
  );
}
