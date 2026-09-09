import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LIVSPACE_BULLETS, PROJECT_BULLETS, SKILLS_FIXED, STARTUS_BULLETS } from '../../assets/bullet-pool.js';
import { resumeChat } from '../llm/index.js';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const WORK_EXPERIENCE_PATH = path.join(PROJECT_ROOT, 'assets', 'previous_work_experience.md');
const TEMPLATE_PATH = path.join(PROJECT_ROOT, 'assets', 'resume_template.tex');
const RESUMES_PATH = path.join(PROJECT_ROOT, 'resumes');

const BULLET_POOL_CONTEXT = [
  'LIVSPACE BULLETS:',
  ...LIVSPACE_BULLETS.map(({ id, text }) => `${id}: ${text}`),
  'STARTUS BULLETS:',
  ...STARTUS_BULLETS.map(({ id, text }) => `${id}: ${text}`),
  'PROJECT BULLETS:',
  ...PROJECT_BULLETS.map(({ id, text }) => `${id}: ${text}`),
].join('\n');

const SYSTEM_PROMPT = `You are a resume tailoring assistant for Shashikanth, a Senior Frontend Engineer with 5+ years experience. Given a job description, select approved bullet IDs from the bullet pool below to best match the role.

Return ONLY valid JSON with this exact structure:
{ "summary": "Senior Frontend Engineer specializing in React, Next.js, Micro-Frontends and AI Systems", "livspace_bullet_ids": ["L1", "L4", "L2"], "startus_bullet_ids": ["S1", "S2"], "project_bullet_ids": ["P1", "P2", "P3"] }

STRICT RULES:
- Never use em dashes in bullet text or in the middle of sentences. The summary may use one em dash as the separator after the title.
- Never abbreviate LMS, IMS, VMS, OMS. Use full names or "multiple internal systems".
- Use "1M+ user base" for Livspace platform scale. Never "10K+ daily active users". Never use the word "monthly".
- Always preserve these exact metrics: 1M+ user base, 250+ Cr, 99.9% uptime, 3K-4K consignments, 5K-6K products, 4x velocity, 20+ APIs, 70%, 25%, 30%.
- For frontend-focused, product, or consumer-facing roles, select exactly 8 Livspace bullets and exactly 3 StartUs bullets. Prefer S_CORE1, S_CORE2, and S_CORE3 as the 3 StartUs bullets in this mode.
- For full-stack, B2B SaaS, or platform engineering roles, select exactly 7 Livspace bullets and exactly 4 StartUs bullets. Use individual S1-S6 bullets in this mode.
- Always select exactly 4 project bullets, ordered by relevance.
- Return a single role-specific summary in this exact format: '[Seniority] [Title] — [2-3 key technologies or domains]'. Maximum 10 words. No metrics.
- Only include L9 if the job description mentions mobile, React Native, or cross-platform.
- Select IDs only from the bullet pool, and return selected IDs in relevance order.
- For AI/agentic roles, emphasise the hackathon project heavily in project_bullet_ids.
- The work experience context is: {{WORK_EXPERIENCE_CONTENT}}

{{BULLET_POOL_CONTEXT}}`;

function sanitizeSegment(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function sanitizeForLatex(text) {
  return String(text).replace(/[%&$#]/g, (character) => `\\${character}`);
}

function formatBullets(bullets = []) {
  return bullets.map((bullet) => `\\resumeItem{${bullet}}`).join('\n');
}

function getSelectedBulletTexts(ids = [], pool) {
  return ids
    .map((id) => pool.find((bullet) => bullet.id === id)?.text)
    .filter(Boolean);
}

/**
 * Generates a tailored LaTeX resume for a job.
 * @param {{jobTitle: string, company: string, jobDescription: string, jobId: string|number}} input Job details used for tailoring and output naming.
 * @returns {Promise<string>} Absolute path to the generated LaTeX file.
 */
export async function generateResume({ jobTitle, company, jobDescription, jobId }) {
  if (!jobTitle || !company || !jobDescription || jobId === undefined || jobId === null || jobId === '') {
    throw new Error('jobTitle, company, jobDescription, and jobId are required.');
  }

  const [workExperience, template] = await Promise.all([
    fs.readFile(WORK_EXPERIENCE_PATH, 'utf8'),
    fs.readFile(TEMPLATE_PATH, 'utf8'),
  ]);
  const systemPrompt = SYSTEM_PROMPT
    .replace('{{WORK_EXPERIENCE_CONTENT}}', workExperience)
    .replace('{{BULLET_POOL_CONTEXT}}', BULLET_POOL_CONTEXT);
  const response = await resumeChat(systemPrompt, `Tailor this resume for the following job description:\n\n${jobDescription}`);
  const cleanedResponse = response.replace(/```json|```/gi, '').trim();
  console.log(`[Resume Debug] Raw LLM response: ${cleanedResponse.slice(0, 500)}`);
  console.log(`[Resume Debug] Response length: ${cleanedResponse.length}`);
  const parsed = JSON.parse(cleanedResponse);
  const livspaceBullets = getSelectedBulletTexts(parsed.livspace_bullet_ids, LIVSPACE_BULLETS);
  const startusBullets = getSelectedBulletTexts(parsed.startus_bullet_ids, STARTUS_BULLETS);
  const projectBullets = getSelectedBulletTexts(parsed.project_bullet_ids, PROJECT_BULLETS);

  const replacements = {
    '{{SUMMARY}}': `{${sanitizeForLatex(parsed.summary)}}`,
    '{{SKILLS_AI_AGENTIC}}': sanitizeForLatex(SKILLS_FIXED.ai_agentic),
    '{{SKILLS_FRONTEND}}': sanitizeForLatex(SKILLS_FIXED.frontend),
    '{{SKILLS_STATE_DATA}}': sanitizeForLatex(SKILLS_FIXED.state_and_data),
    '{{SKILLS_ARCHITECTURE}}': sanitizeForLatex(SKILLS_FIXED.architecture),
    '{{SKILLS_BACKEND_TOOLING}}': sanitizeForLatex(SKILLS_FIXED.backend_and_tooling),
    '{{LIVSPACE_BULLETS}}': formatBullets(livspaceBullets),
    '{{STARTUS_BULLETS}}': formatBullets(startusBullets),
    '{{PROJECT_BULLETS}}': formatBullets(projectBullets),
  };
  const filledTemplate = Object.entries(replacements).reduce(
    (result, [placeholder, value]) => result.replaceAll(placeholder, value ?? ''),
    template,
  );

  const outputDirectory = path.join(
    RESUMES_PATH,
    sanitizeSegment(company),
    `${sanitizeSegment(jobTitle)}--${sanitizeSegment(jobId)}`,
  );
  await fs.mkdir(outputDirectory, { recursive: true });
  const texFilePath = path.join(outputDirectory, 'resume.tex');
  await fs.writeFile(texFilePath, filledTemplate, 'utf8');
  return texFilePath;
}
