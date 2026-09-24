import { useMemo, useState } from 'react';
import { SegmentedControl } from '../ui/SegmentedControl';
import { JobsTable } from './JobsTable';
import { JobGroupTable } from './JobGroupTable';
import { groupByCompany, groupByScore } from '../../utils/groupJobs';

const GROUPING_OPTIONS = [
  { label: 'None', value: 'none' },
  { label: 'By Company', value: 'company' },
  { label: 'By Score', value: 'score' },
];

/**
 * Local grouping controls over the existing filtered feed; no data requests.
 * @param {Parameters<typeof JobsTable>[0]} props Existing table data and row actions.
 */
export function JobsTableView({ jobs, ...tableProps }) {
  const [grouping, setGrouping] = useState('none');
  const groups = useMemo(() => {
    if (grouping === 'company') return groupByCompany(jobs);
    if (grouping === 'score') return groupByScore(jobs);
    return [];
  }, [jobs, grouping]);
  return (
    <div className="space-y-5">
      <SegmentedControl label="Group jobs" options={GROUPING_OPTIONS} value={grouping} onChange={setGrouping} />
      {grouping === 'none' || tableProps.loading || !jobs.length ? (
        <JobsTable {...tableProps} jobs={jobs} />
      ) : (
        <div className="space-y-8">
          {groups.map((group) => (
            <JobGroupTable key={`${grouping}:${group.key}`} jobs={group.jobs} label={group.label}
              stats={group.stats} pageSize={grouping === 'company' ? 7 : 10} tableProps={tableProps} />
          ))}
        </div>
      )}
    </div>
  );
}
