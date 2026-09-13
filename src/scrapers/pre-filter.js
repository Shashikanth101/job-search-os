const DENIED_TITLE = /\b(?:sales|account exec(?:utive)?s?|account managers?|customer success|customer support|business development|marketing|recruit(?:er|ing|ment)|talent acquisition|human resources|finance|financial|accountant|accounting|legal|counsel|data engineers?|data scientists?|devops|sre|site reliability|cloud infrastructure|infrastructure|backend|back[- ]end|ios|android|mobile|qa|quality assurance|security|executive assistant|administrative|payroll|procurement)\b/i;
const ALLOWED_TITLE = /\b(?:front[- ]?end|full[- ]?stack|software (?:development )?engineer|sde|ui engineer|web engineer|ai (?:agents? )?engineer|applied ai engineer|ai application engineer|application engineer\s*[,/]\s*ai|(?:ai\s+)?agent(?:ic|s)?\s+engineer|ai product engineer|engineer\s*[-,]\s*(?:applied ai|ai agents?)|harness engineer|forward deployed engineer)\b/i;
const AMBIGUOUS_ML_ENGINEER = /\b(?:machine learning|ml)\s+engineer\b/i;
const ALLOWED_COUNTRY = /\b(?:india|singapore|united arab emirates|uae|u\.a\.e\.?|netherlands|united kingdom|uk|u\.k\.?|great britain|england|scotland|wales|northern ireland)\b/i;
const ALLOWED_CITY = /\b(?:bangalore|bengaluru|noida|gurgaon|gurugram|mumbai|pune|hyderabad|chennai|delhi|kolkata|ahmedabad|kochi|coimbatore|jaipur|indore|chandigarh|thiruvananthapuram|dubai|abu dhabi|sharjah|amsterdam|rotterdam|utrecht|eindhoven|london|manchester|edinburgh|belfast|bristol|glasgow)\b/i;
const OTHER_COUNTRY = /\b(?:united states|usa|u\.s\.?|us|canada|australia|new zealand|germany|france|spain|italy|ireland|poland|portugal|sweden|norway|denmark|finland|switzerland|austria|belgium|israel|china|japan|korea|taiwan|brazil|mexico|argentina|philippines|indonesia|malaysia|thailand|vietnam|pakistan|bangladesh|nigeria|south africa|ontario|california|texas|new york)\b/i;

/** Classify titles in code; ambiguous titles still need the existing relevance scorer. */
export function classifyTitle(title = '') {
  if (DENIED_TITLE.test(title)) return 'deny';
  if (AMBIGUOUS_ML_ENGINEER.test(title)) return 'ambiguous';
  return ALLOWED_TITLE.test(title) ? 'allow' : 'ambiguous';
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
  const counts = { fetched: jobs.length, denied_title: 0, denied_location: 0, allowed_title: 0, ambiguous_title: 0 };
  const accepted = jobs.filter((job) => {
    const classification = classifyTitle(job.title);
    if (classification === 'deny') {
      counts.denied_title += 1;
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
