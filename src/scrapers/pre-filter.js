// Tunable pre-filter values. Bump PREFILTER_VERSION whenever any rule below changes so
// stored verdicts (jobs.prefilter_version) can be recognized as stale and reclassified.
export const PREFILTER_VERSION = 2;
export const MAX_MIN_YEARS_REJECT = 10;
const YEARS_EXPERIENCE_WINDOW = 60;
const DENIED_SENIORITY_TITLE = /\b(?:principal|distinguished|fellow|head of|director|vp|vice[\s-]+president|chief|engineering\s+manager|manager\s*,\s*engineering)\b/i;
const OPTIONAL_YEARS_SENTENCE = /\b(?:preferred|bonus|plus|nice[\s-]to[\s-]have)\b/i;
const YEARS_MENTION = /(?<![\d.$])(\d{1,2})\s*(?:\+|(?:-|–|—|to)\s*\d{1,2}\s*\+?)?\s*(?:years?|yrs?)\b/gi;

const DENIED_TITLE = /\b(?:sales|account exec(?:utive)?s?|account managers?|customer success|customer support|business development|marketing|recruit(?:er|ing|ment)|talent acquisition|human resources|finance|financial|accountant|accounting|legal|counsel|data engineers?|data scientists?|devops|sre|site reliability|cloud infrastructure|infrastructure|backend|back[- ]end|ios|android|mobile|qa|quality assurance|security|executive assistant|administrative|payroll|procurement)\b/i;
const ALLOWED_TITLE = /\b(?:front[- ]?end|full[- ]?stack|software (?:development )?engineer|sde|ui engineer|web engineer|ai (?:agents? )?engineer|applied ai engineer|ai application engineer|application engineer\s*[,/]\s*ai|(?:ai\s+)?agent(?:ic|s)?\s+engineer|ai product engineer|engineer\s*[-,]\s*(?:applied ai|ai agents?)|harness engineer|forward deployed engineer)\b/i;
const AMBIGUOUS_ML_ENGINEER = /\b(?:machine learning|ml)\s+engineer\b/i;
const ALLOWED_COUNTRY = /\b(?:india|singapore|united arab emirates|uae|u\.a\.e\.?|netherlands|united kingdom|uk|u\.k\.?|great britain|england|scotland|wales|northern ireland)\b/i;
const ALLOWED_CITY = /\b(?:bangalore|bengaluru|noida|gurgaon|gurugram|mumbai|pune|hyderabad|chennai|delhi|kolkata|ahmedabad|kochi|coimbatore|jaipur|indore|chandigarh|thiruvananthapuram|dubai|abu dhabi|sharjah|amsterdam|rotterdam|utrecht|eindhoven|london|manchester|edinburgh|belfast|bristol|glasgow)\b/i;
const OTHER_COUNTRY = /\b(?:united states|usa|u\.s\.?|us|canada|australia|new zealand|germany|france|spain|italy|ireland|poland|portugal|sweden|norway|denmark|finland|switzerland|austria|belgium|israel|china|japan|korea|taiwan|brazil|mexico|argentina|philippines|indonesia|malaysia|thailand|vietnam|pakistan|bangladesh|nigeria|south africa|ontario|california|texas|new york)\b/i;

/**
 * Classify a title and report why a title was denied.
 * @param {string} [title] Job title.
 * @returns {{classification: 'allow'|'deny'|'ambiguous', reason: string|null}} Verdict; reason is set only for deny.
 */
export function classifyTitleWithReason(title = '') {
  const text = String(title ?? '');
  if (DENIED_SENIORITY_TITLE.test(text)) return { classification: 'deny', reason: 'seniority_title' };
  if (DENIED_TITLE.test(text)) return { classification: 'deny', reason: 'denied_title' };
  if (AMBIGUOUS_ML_ENGINEER.test(text)) return { classification: 'ambiguous', reason: null };
  return { classification: ALLOWED_TITLE.test(text) ? 'allow' : 'ambiguous', reason: null };
}

/** Classify titles in code; ambiguous titles still need the existing relevance scorer. */
export function classifyTitle(title = '') {
  return classifyTitleWithReason(title).classification;
}

/**
 * Find the largest stated minimum years of experience in a job description.
 * A mention counts only when "experience" appears within ~60 characters, and
 * sentences marked preferred / bonus / plus / nice to have are ignored.
 * @param {string|null|undefined} description Job description text or HTML.
 * @returns {number|null} Largest minimum years, or null when none is stated or no description exists.
 */
export function extractMinYears(description) {
  if (!description || typeof description !== 'string') return null;
  const text = description.replace(/<[^>]*>/g, '\n').replace(/&nbsp;|&#160;/gi, ' ');
  let largest = null;
  for (const segment of text.split(/\n+|[•●▪·]|(?<=[.!?;])\s+/)) {
    if (!segment || OPTIONAL_YEARS_SENTENCE.test(segment)) continue;
    for (const match of segment.matchAll(YEARS_MENTION)) {
      const nearby = segment.slice(Math.max(0, match.index - YEARS_EXPERIENCE_WINDOW), match.index + match[0].length + YEARS_EXPERIENCE_WINDOW);
      if (!/experience/i.test(nearby)) continue;
      const years = Number(match[1]);
      if (largest === null || years > largest) largest = years;
    }
  }
  return largest;
}

/**
 * Evaluate title and years-of-experience rules for one job (location is checked separately).
 * Manual jobs are never rejected (manual-job ADR).
 * @param {{title?: string, description?: string, source?: string}} job Job-like record.
 * @returns {{pass: boolean, reason: string|null}} Verdict with a machine-readable rejection reason.
 */
export function evaluateJobRules(job) {
  if (job?.source === 'manual') return { pass: true, reason: null };
  const title = classifyTitleWithReason(job?.title);
  if (title.classification === 'deny') return { pass: false, reason: title.reason };
  const years = extractMinYears(job?.description);
  if (years !== null && years >= MAX_MIN_YEARS_REJECT) return { pass: false, reason: `years_required_${years}` };
  return { pass: true, reason: null };
}

/** Enforce ADR 0004/0005 location eligibility using ATS location metadata, never description text. */
export function isLocationEligible(location, hiresRemoteInIndia = false) {
  const text = String(location ?? '').replace(/\bnew south wales\b/gi, '').trim();
  if (!text) return false;
  if (ALLOWED_COUNTRY.test(text)) return true;
  if (OTHER_COUNTRY.test(text)) return false;
  if (ALLOWED_CITY.test(text)) return true;
  return hiresRemoteInIndia && /^(?:remote|remote\s*[-–,:]?\s*(?:anywhere|worldwide|global)|(?:anywhere|worldwide|global)\s*[-–,:]?\s*remote)$/i.test(text);
}

/** Expand structured ATS country codes to country names without guessing from free text. */
export function countryName(code) {
  if (!code) return '';
  if (!/^[a-z]{2}$/i.test(code)) return String(code);
  return new Intl.DisplayNames(['en'], { type: 'region' }).of(code.toUpperCase());
}

/** Filter normalized postings before BaseScraper ranks or saves them, with auditable rejection counts. */
export function preFilterJobs(jobs, { company, source, hiresRemoteInIndia = false }) {
  const counts = { fetched: jobs.length, denied_title: 0, denied_seniority: 0, denied_years: 0, denied_location: 0, allowed_title: 0, ambiguous_title: 0 };
  const accepted = jobs.filter((job) => {
    const classification = classifyTitle(job.title);
    const verdict = evaluateJobRules(job);
    if (!verdict.pass) {
      if (verdict.reason === 'seniority_title') counts.denied_seniority += 1;
      else if (verdict.reason === 'denied_title') counts.denied_title += 1;
      else counts.denied_years += 1;
      return false;
    }
    if (!isLocationEligible(job.location, hiresRemoteInIndia)) {
      counts.denied_location += 1;
      return false;
    }
    counts[classification === 'allow' ? 'allowed_title' : 'ambiguous_title'] += 1;
    return true;
  });
  console.log(`[PreFilter] ${source} (${company}): ${JSON.stringify({ ...counts, accepted: accepted.length })}`);
  return accepted;
}
