import { mkdir, writeFile, rename } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const COMPANIES = [
  'BrowserStack', 'Postman', 'HackerRank', 'Whatfix', 'Arctic Wolf', 'Freshworks', 'Zoho', 'UiPath', 'Sprinklr', 'Tekion', 'Cohesity', 'Nutanix', 'SentinelOne', 'Acceldata', 'Komprise', 'Cognite', 'Docusign', 'DexCare', 'Komodo Health', 'Glean', 'Druva', 'HashiCorp', 'Zscaler', 'New Relic', 'AppDynamics', 'Cloudera', 'Rippling', 'Rubrik', 'Amplitude', 'Harness', 'Harvey', 'Snyk', 'LaunchDarkly', 'Segment', 'Temporal', 'Zamp', 'Observe.AI', 'ZoomInfo', 'Databricks', 'Confluent', 'Elastic', 'Palo Alto Networks', 'SpotDraft', 'Applied Intuition', 'Fireflies.ai', 'Branch', 'ClickPost', 'Atlassian', 'VMware', 'Canonical', 'SAP', 'PTC', 'Palantir Technologies', 'Smartworks', 'Razorpay', 'PhonePe', 'Groww', 'CRED', 'Slice', 'Juspay', 'Visa', 'Refyne', 'Skydo', 'Moniepoint Group', 'YipitData', 'Nykaa', 'Paytm', 'Zerodha', 'Upstox', 'EarnIn', 'Coinbase', 'Swiggy', 'Meesho', 'Flipkart', 'Myntra', 'Delhivery', 'Walmart', 'MakeMyTrip', 'Cleartrip', 'Blink Health', 'Instawork', 'Curefit', 'Microsoft', 'AWS', 'Prime Video', 'Uber', 'Airbnb', 'Snowflake', 'eBay', 'Adobe', 'Intuit', 'ServiceNow', 'Salesforce', 'PayPal', 'Cisco', 'Amazon', 'Google', 'Meta', 'Nvidia', 'Oracle', 'LinkedIn', 'X (Twitter)', 'GitHub', 'GitLab', 'Netflix', 'Spotify', 'JioStar', 'Goldman Sachs', 'JP Morgan Chase', 'Morgan Stanley', 'DE Shaw', 'Barclays', 'Tower Research', 'Wells Fargo', 'NatWest Group', 'Perplexity AI', 'Writer', 'Abridge', 'Decagon', 'Hebbia', 'Gamma', 'Cyera', 'Anysphere (Cursor)', 'Cognition AI', 'Poolside AI', 'Replit', 'LangChain', 'Fireworks AI', 'OpenAI', 'Anthropic', 'Google DeepMind', 'Meta AI', 'xAI', 'Mistral AI', 'DeepSeek', 'Safe Superintelligence Inc.', 'Cohere', 'Inflection AI', 'AI21 Labs', '01.AI', 'Moonshot AI', 'Zhipu AI', 'Reka AI', 'Liquid AI', 'Contextual AI', 'Runway', 'Midjourney', 'ElevenLabs', 'Stability AI', 'Black Forest Labs', 'HeyGen', 'Luma AI', 'Hugging Face', 'Scale AI', 'CoreWeave', 'Cerebras Systems', 'Groq', 'OpenRouter',
];
const VERIFY = new Set(['Segment', 'Branch', 'Slice', 'Gamma', 'Cohere', 'Groww', 'Zoom', 'Runway']);
const REPORT_URL = new URL('../../data/ats-discovery-report.json', import.meta.url);
const PLATFORMS = [
  { name: 'Greenhouse', url: (slug) => `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=false`, jobs: (body) => body?.jobs, title: (job) => job.title },
  { name: 'Lever', url: (slug) => `https://api.lever.co/v0/postings/${slug}?mode=json`, jobs: (body) => body, title: (job) => job.text },
  { name: 'SmartRecruiters', url: (slug) => `https://api.smartrecruiters.com/v1/companies/${slug}/postings`, jobs: (body) => body?.content, title: (job) => job.name },
  { name: 'Ashby', url: (slug) => `https://api.ashbyhq.com/posting-api/job-board/${slug}`, jobs: (body) => body?.jobs, title: (job) => job.title },
];

/** Generate distinct compact/hyphenated slugs, including suffix-free names and aliases. */
export function generateSlugs(company) {
  const names = [company.replace(/\([^)]*\)/g, '').trim(), ...Array.from(company.matchAll(/\(([^)]+)\)/g), (match) => match[1])];
  const slugs = new Set();
  for (const name of names) {
    const normalized = name.toLowerCase().replace(/[.’']/g, '').trim();
    const stripped = normalized.replace(/(?:[\s-]+(?:inc|technologies|labs|ai|group))+$/i, '').trim();
    for (const variant of [normalized, stripped]) {
      for (const slug of [variant.replace(/[^a-z0-9]/g, ''), variant.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')]) {
        if (slug) slugs.add(slug);
      }
    }
  }
  // Single-word names naturally yield one unique candidate; do not repeat requests.
  return [...slugs];
}

async function checkBoard(platform, slug) {
  // Retry transient failures once; never treat an unavailable endpoint as an empty board.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await delay(400);
    try {
      const response = await fetch(platform.url(encodeURIComponent(slug)), { signal: AbortSignal.timeout(12000) });
      if (response.status === 404) return { status: 'no_match', http_status: 404 };
      if (response.status !== 200) {
        await response.body?.cancel();
        if (attempt === 0 && (response.status === 429 || response.status >= 500)) {
          await delay(2000);
          continue;
        }
        return { status: 'error', http_status: response.status, error: `HTTP ${response.status}` };
      }
      const body = await response.json();
      const jobs = platform.jobs(body);
      if (!Array.isArray(jobs)) return { status: 'error', http_status: 200, error: 'Expected jobs/postings array missing' };
      if (!jobs.length) return { status: 'no_match', http_status: 200 };
      return {
        status: 'match', http_status: 200, job_count: jobs.length,
        first_3_job_titles: jobs.slice(0, 3).map((job) => platform.title(job) ?? null),
        // SmartRecruiters paginates; job_count is the returned array length.
        ...(typeof body.totalFound === 'number' ? { total_jobs_reported: body.totalFound } : {}),
      };
    } catch (error) {
      if (attempt === 1) return { status: 'error', error: error.cause?.message ?? error.message };
      await delay(2000);
    }
  }
}

async function saveReport(report) {
  await mkdir(new URL('.', REPORT_URL), { recursive: true });
  const temporary = new URL(`${REPORT_URL.href}.tmp`);
  await writeFile(temporary, `${JSON.stringify(report, null, 2)}\n`);
  await rename(temporary, REPORT_URL);
}

async function main() {
  const report = {
    started_at: new Date().toISOString(), completed_at: null,
    note: 'Candidate matches require manual review. Zero matches do not prove ATS absence. job_count is the returned array length; total_jobs_reported is included for paginated SmartRecruiters responses.',
    total_companies: COMPANIES.length, results: [],
  };
  for (const company of COMPANIES) {
    const entry = { company, verify_carefully: VERIFY.has(company), candidates: generateSlugs(company), matches: [], checks: [] };
    for (const slug of entry.candidates) {
      for (const platform of PLATFORMS) {
        const result = await checkBoard(platform, slug);
        entry.checks.push({ platform: platform.name, slug, ...result });
        if (result.status === 'match') {
          const { status, http_status, ...match } = result;
          entry.matches.push({ platform: platform.name, slug, ...match });
        }
      }
    }
    entry.status = entry.checks.some((check) => check.status === 'error') ? 'incomplete' : 'complete';
    report.results.push(entry);
    await saveReport(report);
    console.log(`[ATSDiscovery] ${report.results.length}/${COMPANIES.length} ${company}: ${entry.matches.length} matches, ${entry.checks.filter((check) => check.status === 'error').length} errors`);
  }
  report.completed_at = new Date().toISOString();
  const zeroMatches = report.results.filter((entry) => entry.matches.length === 0);
  report.summary = {
    companies_with_matches: report.results.length - zeroMatches.length,
    companies_with_zero_matches: zeroMatches.length,
    zero_match_companies: zeroMatches.map((entry) => entry.company),
    fully_checked_zero_match_companies: zeroMatches.filter((entry) => entry.status === 'complete').map((entry) => entry.company),
    companies_with_check_errors: report.results.filter((entry) => entry.status === 'incomplete').map((entry) => entry.company),
  };
  await saveReport(report);
  console.log(`[ATSDiscovery] Report: ${fileURLToPath(REPORT_URL)}`);
  console.log(`[ATSDiscovery] ${JSON.stringify(report.summary, null, 2)}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await main();
  } catch (error) {
    console.error(`[ATSDiscovery] ${error.stack ?? error.message}`);
    process.exitCode = 1;
  }
}
