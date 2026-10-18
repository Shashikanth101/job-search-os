/** Return the numeric score currently displayed by JobRow, or null for unscored jobs. */
export function getDisplayedScore(job) {
  if (job.relevance_score == null || job.relevance_score === '') return null;
  const score = Number(job.relevance_score);
  return Number.isFinite(score) ? score : null;
}

/** Count funnel statuses across an entire group, before pagination. */
export function getGroupStats(jobs) {
  return jobs.reduce((stats, job) => {
    const status = job.status || 'not_applied';
    if (status === 'applied' || status === 'in_process') stats.applied += 1;
    else if (status === 'not_applied') stats.pending += 1;
    else if (status === 'closed') stats.closed += 1;
    return stats;
  }, { applied: 0, pending: 0, closed: 0 });
}

function collectGroups(jobs, getKey) {
  const groups = new Map();
  for (const job of jobs) {
    const key = getKey(job);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(job);
  }
  return [...groups].map(([key, members]) => ({ key, jobs: members, stats: getGroupStats(members) }));
}

/** Group without mutating input; order companies by descending average displayed score. */
export function groupByCompany(jobs) {
  return collectGroups(jobs, (job) => job.company || 'Unknown company')
    .map((group) => {
      const scores = group.jobs.map(getDisplayedScore).filter((score) => score !== null);
      return { ...group, label: group.key, averageScore: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null };
    })
    .sort((a, b) => (b.averageScore ?? -1) - (a.averageScore ?? -1) || a.label.localeCompare(b.label));
}

/** Group by displayed score, highest first; missing scores follow score zero. */
export function groupByScore(jobs) {
  return collectGroups(jobs, getDisplayedScore)
    .map((group) => ({ ...group, label: group.key === null ? 'Not ranked yet' : `Score: ${group.key}` }))
    .sort((a, b) => (b.key ?? -1) - (a.key ?? -1));
}
