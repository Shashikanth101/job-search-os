/** Character cap for trimmed descriptions (production sends the first DESCRIPTION_CHARS = 1500 untrimmed). */
export const TRIM_MAX_CHARS = 1200;
const MIN_KEEP_RATIO = 0.25;
const MIN_KEEP_CHARS = 200;

// Sentences that are boilerplate wherever they appear: EEO / legal / process notices and benefits.
const EEO_SENTENCE = /equal (?:employment )?opportunity|affirmative action|does not discriminate|without regard to (?:race|color)|protected (?:veteran|class)|reasonable (?:accommodation|adjustment)s?|e-?verify|background (?:check|screen)|privacy (?:notice|policy)|recruitment (?:scam|fraud)|candidates['’] ai usage|use of ai in (?:our )?(?:application|hiring)|applicants with disabilit/i;
const BENEFITS_SENTENCE = /(?:competitive|comprehensive|generous) (?:compensation|salary|benefits|pay)|health(?:care)? insurance|medical, dental|401\(?k\)?|parental leave|paid (?:time off|vacation|holidays?)|stock options|equity (?:donation|grants?|package)|wellness|free (?:meals|lunch)|relocation (?:assistance|support)|pay range|salary range|base salary|total rewards|annual bonus/i;
// A sentence that opens a boilerplate section; everything up to the next role-related heading is dropped.
const BOILERPLATE_HEADER = /^(?:about (?:us|the company|our company)\b|about (?!the |this |you|your |our team|us\b)[A-Z][\w&.'’-]*\b|company overview|who we are|our (?:mission|story|values)|why join (?:us|[a-z]+)|life at|benefits|perks|what we offer|what['’]?s in it for you|compensation|pay transparency|equal (?:opportunity|employment)|diversity|accommodations?|privacy|how to apply)\b/i;
// A sentence that opens a role-related section and ends boilerplate skipping.
const KEEP_HEADER = /^(?:what you['’]?ll (?:do|be doing|bring|need)|responsibilit|requirements?|qualifications?|minimum qualifications|preferred qualifications|who you are|you will|your role|the role|about the (?:role|job|position|team)|key responsibilities|skills|experience|tech(?:nical)? stack|what we['’]?re looking for|day[- ]to[- ]day)/i;

function splitUnits(text) {
  const paragraphs = text.split(/\n+/).map((part) => part.trim()).filter(Boolean);
  return paragraphs.flatMap((paragraph) => (paragraph.length > 300 ? paragraph.split(/(?<=[.!?])\s+(?=[A-Z0-9"'(])/) : [paragraph]));
}

function capAtBoundary(text, maxChars) {
  if (text.length <= maxChars) return text;
  const slice = text.slice(0, maxChars);
  const boundary = Math.max(slice.lastIndexOf('. '), slice.lastIndexOf('; '), slice.lastIndexOf(' '));
  return (boundary >= maxChars * 0.8 ? slice.slice(0, boundary) : slice).trim();
}

/**
 * Remove EEO, benefits and company-boilerplate content from a job description, then cap its length.
 * Never over-trims: when almost nothing would remain, the original text is capped instead.
 * @param {string|null|undefined} description Full stored job description.
 * @param {number} [maxChars] Output cap.
 * @returns {string} Trimmed description (empty string for empty input).
 */
export function trimDescription(description, maxChars = TRIM_MAX_CHARS) {
  const original = String(description ?? '').replace(/[ \t\r\f\v]+/g, ' ').trim();
  if (!original) return '';
  const kept = [];
  let skipping = false;
  for (const unit of splitUnits(original)) {
    if (KEEP_HEADER.test(unit)) skipping = false;
    else if (BOILERPLATE_HEADER.test(unit)) skipping = true;
    if (skipping || EEO_SENTENCE.test(unit) || BENEFITS_SENTENCE.test(unit)) continue;
    kept.push(unit);
  }
  const trimmed = kept.join(' ').replace(/\s+/g, ' ').trim();
  const usable = trimmed.length >= Math.min(MIN_KEEP_CHARS, original.length) && trimmed.length >= original.length * MIN_KEEP_RATIO;
  return capAtBoundary(usable ? trimmed : original, maxChars);
}
