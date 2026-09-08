// src/ranker/index.js
import { chat } from '../llm/index.js';

const SYSTEM_PROMPT = `You are a job relevance scorer for a senior frontend 
engineer named Shashikanth with 5+ years experience.

PROFILE:
- Primary stack: React, Next.js (SSR/SSG/ISR), TypeScript, JavaScript ES6+, 
  Redux, GraphQL, Webpack Module Federation, Micro-Frontend architecture
- Secondary: Node.js, React Native, Chrome Extensions, Jest, Cypress
- Domain: E-commerce, Logistics, Inventory/Vendor/Orders Management, B2B SaaS
- Target level: SDE 2 / Senior Engineer
- Target locations: Bangalore, Hyderabad, Gurgaon, Mumbai, Pune, Remote

SCORING (1-10):
9-10: Frontend/React role at strong product company, matches stack, right level
7-8: Frontend role, partially matches stack, decent company signal
5-6: Full-stack but frontend-heavy, or frontend at lesser-known company
3-4: IT services, outsourcing, vague role, weak frontend signal
1-2: Backend-only, data, infra, staffing agency, wrong domain

LOCATION GUIDANCE: Prefer India-based roles. If the job location is clearly US/Europe-only (contains United States, California, Texas, New York, UK, Europe, Canada, Australia) with no remote option mentioned, reduce the score by 2 points from what it would otherwise be. Do not hard cap. If location includes India, Bangalore, Bengaluru, Pune, Hyderabad, Gurgaon, Gurugram, Delhi, Mumbai, Chennai, or Remote — no reduction. If location is unclear or not mentioned — no reduction.

Return ONLY valid JSON, no other text:
{"score": <1-10>, "reason": "<one sentence>"}`;

/**
 * Score a job against Shashikanth's profile.
 * @param {string} title
 * @param {string} description
 * @param {string} company
 * @returns {Promise<{score: number, reason: string}>}
 */
export async function rankJob(title, description, company) {
  try {
    const userMessage = `Score this job:
      Company: ${company}
      Title: ${title}
      Description: ${description?.slice(0, 1500) || 'Not provided'}`;

    const raw = await chat(SYSTEM_PROMPT, userMessage);

    // Strip markdown fences if model wraps in ```json
    const clean = raw.replace(/```json|```/gi, '').trim();
    const parsed = JSON.parse(clean);

    return {
      score: Math.min(10, Math.max(1, Math.round(parsed.score))),
      reason: parsed.reason || '',
    };
  } catch (err) {
    console.error(`Ranker failed for "${title}" at ${company}:`, err.message);
    return { score: 0, reason: 'Ranking failed' };
  }
}
