import { ToggleSwitch } from '../ui/ToggleSwitch';
import { SegmentedControl } from '../ui/SegmentedControl';

const LOCATION_OPTIONS = [
  { label: 'India Only', value: true },
  { label: 'All Locations', value: false },
];

/**
 * Job feed filter controls: company, application status, min score, new-only, location.
 * @param {object} props
 * @param {string} props.company
 * @param {string[]} props.companies
 * @param {(company: string) => void} props.onCompanyChange
 * @param {string} props.applicationStatus
 * @param {string[]} props.applicationStatuses
 * @param {(status: string) => void} props.onApplicationStatusChange
 * @param {number} props.minScore
 * @param {(score: number) => void} props.onMinScoreChange
 * @param {boolean} props.newOnly
 * @param {(newOnly: boolean) => void} props.onNewOnlyChange
 * @param {boolean} props.indiaOnly
 * @param {(indiaOnly: boolean) => void} props.onIndiaOnlyChange
 */
export function JobFilters({
  company,
  companies,
  onCompanyChange,
  applicationStatus,
  applicationStatuses,
  onApplicationStatusChange,
  minScore,
  onMinScoreChange,
  newOnly,
  onNewOnlyChange,
  indiaOnly,
  onIndiaOnlyChange,
}) {
  return (
    <section className="mb-8 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5" aria-label="Job filters">
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1.4fr_auto_auto] lg:items-end">
        <label className="block">
          <span className="mb-2 block text-sm font-semibold text-slate-700">Company</span>
          <select
            className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
            value={company}
            onChange={(event) => onCompanyChange(event.target.value)}
          >
            <option>All</option>
            {companies.map((companyName) => <option key={companyName}>{companyName}</option>)}
          </select>
        </label>

        <label className="block">
          <span className="mb-2 block text-sm font-semibold text-slate-700">Application status</span>
          <select
            className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
            value={applicationStatus}
            onChange={(event) => onApplicationStatusChange(event.target.value)}
          >
            <option>All</option>
            <option>untracked</option>
            {applicationStatuses.map((status) => <option key={status}>{status}</option>)}
          </select>
        </label>

        <label className="block">
          <span className="mb-2 flex items-center justify-between text-sm font-semibold text-slate-700">
            Minimum score
            <span className="rounded-md bg-indigo-50 px-2 py-0.5 text-indigo-700">{minScore}</span>
          </span>
          <input
            className="h-11 w-full cursor-pointer accent-indigo-600"
            type="range"
            min="1"
            max="10"
            value={minScore}
            onChange={(event) => onMinScoreChange(Number(event.target.value))}
          />
        </label>

        <ToggleSwitch label="New only" checked={newOnly} onChange={onNewOnlyChange} />

        <SegmentedControl label="Location" options={LOCATION_OPTIONS} value={indiaOnly} onChange={onIndiaOnlyChange} />
      </div>
    </section>
  );
}