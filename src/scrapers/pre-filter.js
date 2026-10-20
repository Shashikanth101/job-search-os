// Tunable pre-filter values. Bump PREFILTER_VERSION whenever any rule below changes so
// stored verdicts (jobs.prefilter_version) can be recognized as stale and reclassified.
export const PREFILTER_VERSION = 4;
export const MAX_MIN_YEARS_REJECT = 10;
const YEARS_EXPERIENCE_WINDOW = 60;
const DENIED_SENIORITY_TITLE = /\b(?:principal|distinguished|fellow|head of|director|vp|vice[\s-]+president|chief|engineering\s+manager|manager\s*,\s*engineering)\b/i;
const OPTIONAL_YEARS_SENTENCE = /\b(?:preferred|bonus|plus|nice[\s-]to[\s-]have)\b/i;
const YEARS_MENTION = /(?<![\d.$])(\d{1,2})\s*(?:\+|(?:-|–|—|to)\s*\d{1,2}\s*\+?)?\s*(?:years?|yrs?)\b/gi;

// Non-engineering and wrong-level titles added in version 3. First match is reported as the keyword.
const NON_ENGINEERING_TITLE = /\b(?:interns?|internships?|new[\s-]grads?|graduate programs?|apprentices?|students?|ambassadors?|analysts?|product managers?|program managers?|account executives?|revenue operations|paralegals?|compliance|mainframe|network engineers?|systems operations|senior\s+manager|sr\.?\s+manager|software\s+engineering\s+manager|development\s+manager)\b/i;

const DENIED_TITLE = /\b(?:sales|account exec(?:utive)?s?|account managers?|customer success|customer support|business development|marketing|recruit(?:er|ing|ment)|talent acquisition|human resources|finance|financial|accountant|accounting|legal|counsel|data engineers?|data scientists?|devops|sre|site reliability|cloud infrastructure|infrastructure|backend|back[- ]end|ios|android|mobile|qa|quality assurance|security|executive assistant|administrative|payroll|procurement)\b/i;
const ALLOWED_TITLE = /\b(?:front[- ]?end|full[- ]?stack|software (?:development )?engineer|sde|ui engineer|web engineer|ai (?:agents? )?engineer|applied ai engineer|ai application engineer|application engineer\s*[,/]\s*ai|(?:ai\s+)?agent(?:ic|s)?\s+engineer|ai product engineer|engineer\s*[-,]\s*(?:applied ai|ai agents?)|harness engineer|forward deployed engineer)\b/i;
const AMBIGUOUS_ML_ENGINEER = /\b(?:machine learning|ml)\s+engineer\b/i;
const ALLOWED_COUNTRY = /\b(?:india|singapore|united arab emirates|uae|u\.a\.e\.?|netherlands|united kingdom|uk|u\.k\.?|great britain|england|scotland|wales|northern ireland)\b/i;
const ALLOWED_CITY = /\b(?:bangalore|bengaluru|noida|gurgaon|gurugram|mumbai|pune|hyderabad|chennai|delhi|kolkata|ahmedabad|kochi|coimbatore|jaipur|indore|chandigarh|thiruvananthapuram|dubai|abu dhabi|sharjah|amsterdam|rotterdam|utrecht|eindhoven|london|manchester|edinburgh|belfast|bristol|glasgow)\b/i;
const OTHER_COUNTRY = /\b(?:united states|usa|u\.s\.?|us|canada|australia|new zealand|germany|france|spain|italy|ireland|poland|portugal|sweden|norway|denmark|finland|switzerland|austria|belgium|israel|china|japan|korea|taiwan|brazil|mexico|argentina|philippines|indonesia|malaysia|thailand|vietnam|pakistan|bangladesh|nigeria|south africa|ontario|california|texas|new york)\b/i;

// Morgan Stanley uses "Manager"/"Senior Manager" as corporate grades for individual contributors, so these
// phrases do not reject its titles (every other rule still applies).
const GRADE_TITLE_COMPANIES = /\bmorgan\s+stanley\b/i;
const GRADE_TITLE_PHRASES = /\b(?:senior\s+manager|sr\.?\s+manager)\b/gi;

/**
 * Classify a title and report why a title was denied.
 * @param {string} [title] Job title.
 * @param {{company?: string}} [options] Company, for company-specific carve-outs.
 * @returns {{classification: 'allow'|'deny'|'ambiguous', reason: string|null, keyword?: string}} Verdict; reason is set only for deny.
 */
export function classifyTitleWithReason(title = '', { company = '' } = {}) {
  const text = String(title ?? '');
  if (DENIED_SENIORITY_TITLE.test(text)) return { classification: 'deny', reason: 'seniority_title' };
  if (DENIED_TITLE.test(text)) return { classification: 'deny', reason: 'denied_title' };
  // "Compliance Engineer" is an engineering role: strip it before keyword matching so "compliance" does not reject it.
  let keywordText = text.replace(/\bcompliance\s+engineers?\b/gi, ' ');
  if (GRADE_TITLE_COMPANIES.test(String(company ?? ''))) keywordText = keywordText.replace(GRADE_TITLE_PHRASES, ' ');
  const nonEngineering = keywordText.match(NON_ENGINEERING_TITLE);
  if (nonEngineering) return { classification: 'deny', reason: 'non_engineering_title', keyword: nonEngineering[0].toLowerCase() };
  if (AMBIGUOUS_ML_ENGINEER.test(text)) return { classification: 'ambiguous', reason: null };
  return { classification: ALLOWED_TITLE.test(text) ? 'allow' : 'ambiguous', reason: null };
}

/** Classify titles in code; ambiguous titles still need the existing relevance scorer. */
export function classifyTitle(title = '', options = {}) {
  return classifyTitleWithReason(title, options).classification;
}

/**
 * Find the largest stated minimum years of experience in a job description.
 * A mention counts only when "experience" appears within ~60 characters, and
 * sentences marked preferred / bonus / plus / nice to have are ignored.
 * @param {string|null|undefined} description Job description text or HTML.
 * @returns {number|null} Largest minimum years, or null when none is stated or no description exists.
 */
export function extractMinYears(description) {
  let largest = null;
  for (const mention of experienceMentions(description)) {
    if (largest === null || mention.min > largest) largest = mention.min;
  }
  return largest;
}

/** Years mentions with a ranged/plus form captured: "3-5 years", "5+ years", "4 yrs". */
const YEARS_DETAIL = /(?<![\d.$])(\d{1,2})\s*(\+|(?:-|–|—|to)\s*(\d{1,2})\s*(\+)?)?\s*(?:years?|yrs?)\b/gi;
const MINIMUM_QUALIFIER = /(?:minimum|min\.?|at least)\s*(?:of\s*)?$/i;

/** Yield each qualifying "N years ... experience" mention (preferred/bonus sentences and mentions far from "experience" are skipped). */
function* experienceMentions(description) {
  if (!description || typeof description !== 'string') return;
  const text = description.replace(/<[^>]*>/g, '\n').replace(/&nbsp;|&#160;/gi, ' ');
  for (const segment of text.split(/\n+|[•●▪·]|(?<=[.!?;])\s+/)) {
    if (!segment || OPTIONAL_YEARS_SENTENCE.test(segment)) continue;
    for (const match of segment.matchAll(YEARS_DETAIL)) {
      const nearby = segment.slice(Math.max(0, match.index - YEARS_EXPERIENCE_WINDOW), match.index + match[0].length + YEARS_EXPERIENCE_WINDOW);
      if (!/experience/i.test(nearby)) continue;
      const min = Number(match[1]);
      const max = match[3] === undefined ? null : Number(match[3]);
      const plus = match[2] === '+' || match[4] === '+' || MINIMUM_QUALIFIER.test(segment.slice(Math.max(0, match.index - 20), match.index));
      yield { min, max, plus };
    }
  }
}

/**
 * Required experience for display, derived deterministically from the description (no LLM): the mention with the largest minimum.
 * @param {string|null|undefined} description Job description text or HTML.
 * @returns {{min: number, max: number|null, plus: boolean, label: string}|null} Label such as "5+ yrs", "3-5 yrs" or "4 yrs"; null when none is stated.
 */
export function extractExperience(description) {
  let best = null;
  for (const mention of experienceMentions(description)) if (best === null || mention.min > best.min) best = mention;
  if (!best) return null;
  const label = best.max !== null ? `${best.min}-${best.max}${best.plus ? '+' : ''} yrs` : `${best.min}${best.plus ? '+' : ''} yrs`;
  return { ...best, label };
}

/**
 * Evaluate title and years-of-experience rules for one job (location is checked separately).
 * Manual jobs are never rejected (manual-job ADR).
 * @param {{title?: string, description?: string, source?: string}} job Job-like record.
 * @returns {{pass: boolean, reason: string|null, keyword?: string}} Verdict with a machine-readable rejection reason (and matched keyword for keyword rules).
 */
export function evaluateJobRules(job) {
  if (job?.source === 'manual') return { pass: true, reason: null };
  const title = classifyTitleWithReason(job?.title, { company: job?.company });
  if (title.classification === 'deny') return { pass: false, reason: title.reason, ...(title.keyword && { keyword: title.keyword }) };
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
      else if (verdict.reason === 'denied_title' || verdict.reason === 'non_engineering_title') counts.denied_title += 1;
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
