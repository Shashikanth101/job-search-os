const TECHNICAL_TERMS = [
  'React.js', 'React Native', 'React', 'TypeScript', 'JavaScript', 'HTML5', 'CSS3',
  'Progressive Web Apps', 'PWA', 'Web Extensions', 'Electron', 'Capacitor',
  'Redux', 'Webpack', 'GraphQL', 'REST APIs', 'Node.js', 'PostgreSQL',
  'Next.js', 'Angular', 'Play framework', 'jQuery', 'Microsoft Teams', 'Zoom',
  'ServiceNow', 'Zendesk', 'GitHub', 'GitLab', '60FPS', 'zero-latency',
  'consumer grade',
];

function normalizeText(value) {
  return String(value ?? '').toLocaleLowerCase().replace(/\s+/g, ' ').trim();
}

function containsLiteralTerm(text, term) {
  const normalizedTerm = normalizeText(term);
  const isWordCharacter = (character) => Boolean(character && /[\p{L}\p{N}]/u.test(character));
  let index = text.indexOf(normalizedTerm);
  while (index !== -1) {
    const before = text[index - 1];
    const after = text[index + normalizedTerm.length];
    if (!isWordCharacter(before) && !isWordCharacter(after)) return true;
    index = text.indexOf(normalizedTerm, index + 1);
  }
  return false;
}

function getDegreeAndCertificationTerms(description) {
  const terms = [];
  const patterns = [
    /\b(?:BA\/BS|BA|BS|B\.A\.|B\.S\.|Bachelor(?:'s)?)(?:\s+(?:of|in)\s+[A-Za-z& ]{2,50})?(?![A-Za-z0-9])/gi,
    /\b(?:AWS|Azure|Google Cloud|Cisco|PMP|CISSP)\s+(?:Certified\s+)?(?:Solutions Architect|Professional|Associate|Certification)\b/gi,
  ];
  for (const pattern of patterns) {
    terms.push(...(description.match(pattern) ?? []));
  }
  return terms;
}

/**
 * Finds a practical set of technology and qualification terms explicitly named in a job description.
 * @param {string} description Job description text.
 * @returns {string[]} Candidate terms in source order, deduplicated case-insensitively.
 */
export function extractCandidateTerms(description) {
  const source = String(description ?? '');
  const lowerSource = normalizeText(source);
  const terms = TECHNICAL_TERMS.filter((term) => lowerSource.includes(normalizeText(term)));
  terms.push(...getDegreeAndCertificationTerms(source));

  const unique = new Map();
  for (const term of terms) {
    const key = normalizeText(term);
    if (!unique.has(key)) unique.set(key, term);
  }
  return [...unique.values()];
}

/**
 * Returns candidate job terms that do not occur literally in generated resume text.
 * @param {string} description Job description text.
 * @param {string} resumeText Filled resume content, including skills and selected bullets.
 * @returns {string[]} Missing terms, case-insensitive and whitespace-normalized.
 */
export function findKeywordGaps(description, resumeText) {
  const resume = normalizeText(resumeText);
  return extractCandidateTerms(description).filter((term) => !containsLiteralTerm(resume, term));
}

/**
 * Converts common LaTeX text markup into searchable visible text.
 * @param {string} latex Filled LaTeX source.
 * @returns {string} Plain text suitable for literal keyword matching.
 */
export function latexToVisibleText(latex) {
  return String(latex ?? '')
    .replace(/(?<!\\)%[^\n]*/g, ' ')
    .replace(/\\(?:textbf|textit|underline|emph|small|large|Huge)\s*\{([^{}]*)\}/g, '$1')
    .replace(/\\href\s*\{[^{}]*\}\s*\{([^{}]*)\}/g, '$1')
    .replace(/\\[A-Za-z]+\*?(?:\[[^\]]*\])?/g, ' ')
    .replace(/\\([%&#_$])/g, '$1')
    .replace(/[{}]/g, ' ')
    .replace(/\\\\(?:\[[^\]]*\])?/g, ' ')
    .replace(/--/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
