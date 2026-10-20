export const REVIEW_STATUSES = ['new', 'saved', 'applying', 'applied', 'skipped'];

/**
 * "scraped N days ago" label from the first-seen age in whole days.
 * @param {number|null|undefined} days
 * @returns {string}
 */
export function scrapedLabel(days) {
  if (days == null) return 'scraped recently';
  if (days <= 0) return 'scraped today';
  return `scraped ${days} ${days === 1 ? 'day' : 'days'} ago`;
}

/**
 * Short age label for a list row ("today", "1 day ago", "N days ago").
 * @param {number|null|undefined} days
 * @returns {string}
 */
export function daysAgoLabel(days) {
  if (days == null) return '';
  if (days <= 0) return 'today';
  return `${days} ${days === 1 ? 'day' : 'days'} ago`;
}

/**
 * "Last refresh: N days ago" text for the review header.
 * @param {{lastRefreshAt: string|null, daysAgo: number|null}|null} refresh
 * @returns {string}
 */
export function refreshLabel(refresh) {
  if (!refresh) return 'Last refresh: loading...';
  if (refresh.lastRefreshAt == null) return 'Last refresh: unknown (no completed cycle recorded)';
  if (refresh.daysAgo <= 0) return 'Last refresh: today';
  return `Last refresh: ${refresh.daysAgo} ${refresh.daysAgo === 1 ? 'day' : 'days'} ago`;
}

export const STATUS_STYLES = {
  new: 'bg-slate-100 text-slate-700 ring-slate-300',
  saved: 'bg-indigo-50 text-indigo-700 ring-indigo-300',
  applying: 'bg-amber-50 text-amber-800 ring-amber-300',
  applied: 'bg-emerald-50 text-emerald-800 ring-emerald-300',
  skipped: 'bg-slate-50 text-slate-400 ring-slate-200',
  closed: 'bg-slate-50 text-slate-400 ring-slate-200',
};
