const HTML_TAG = /<\/?(?:p|div|ul|ol|li|br|h[1-6]|strong|b|em|i|span|a|table|tr|td)\b[^>]*>/i;
const BULLET_CHARS = '•●▪◦·‣';
const BULLET_LINE = new RegExp(`^\\s*(?:[-*]|[${BULLET_CHARS}]|–)\\s+(.*\\S)\\s*$`);
const KNOWN_HEADINGS = ['what you\'ll do', 'what you will do', 'what you get to do in this role', 'what you\'ll bring', 'what you bring', 'what we\'re looking for', 'what we offer', 'responsibilities',
  'key responsibilities', 'requirements', 'minimum qualifications', 'preferred qualifications', 'qualifications', 'about the role', 'about the team', 'about you', 'about us', 'who you are',
  'nice to have', 'required skills', 'preferred skills', 'benefits', 'why join us', 'position summary', 'job description', 'the role', 'your role', 'the opportunity'];
const KNOWN_HEADING = new RegExp(`(?:^|(?<=[.!?:;)]\\s)|(?<=\\s))(${KNOWN_HEADINGS.map((heading) => heading.replace(/'/g, "['’]")).join('|')})\\s*:`, 'gi');
const CAPS_HEADING = /(?<![A-Za-z0-9'’-])([A-Z][A-Z&/'’-]*(?: [A-Z][A-Z&/'’-]*){1,6})(?= [A-Z][a-z])/g;
const MAX_PARAGRAPH = 450;

/**
 * Whether the stored text is HTML (descriptions are normally flat text, but ATS HTML is supported and sanitized before display).
 * @param {string|null|undefined} text
 * @returns {boolean}
 */
export function looksLikeHtml(text) {
  return HTML_TAG.test(String(text ?? ''));
}

const isHeadingLine = (line) => line.length <= 70 && (/:$/.test(line) || (/[A-Z]{3}/.test(line) && line === line.toUpperCase() && /^[A-Z0-9&/'’ ,()-]+$/.test(line)));

/** Flat one-line text has no structure to read, so add line breaks before bullets and before recognizable headings. */
function addBreaks(text) {
  return text
    .replace(new RegExp(`\\s*([${BULLET_CHARS}])\\s*`, 'g'), '\n• ')
    .replace(KNOWN_HEADING, (_match, heading) => `\n\n${heading}:\n`)
    .replace(CAPS_HEADING, (_match, heading) => `\n\n${heading}\n`);
}

/** Split an over-long paragraph at sentence boundaries so it stays readable. */
function chunkParagraph(text) {
  if (text.length <= MAX_PARAGRAPH) return [text];
  const chunks = [];
  let current = '';
  for (const sentence of text.split(/(?<=[.!?])\s+(?=[A-Z0-9"'(])/)) {
    if (current && current.length + sentence.length + 1 > MAX_PARAGRAPH) { chunks.push(current); current = sentence; } else current = current ? `${current} ${sentence}` : sentence;
  }
  if (current) chunks.push(current);
  return chunks;
}

/**
 * Turn a plain-text description into display blocks: headings (short ALL-CAPS or colon-terminated lines), bulleted lists
 * (lines starting with -, *, or bullet characters) and paragraphs. Pure; the result is rendered as React elements, never as HTML.
 * @param {string|null|undefined} text
 * @returns {Array<{type: 'heading'|'paragraph', text: string}|{type: 'list', items: string[]}>}
 */
export function formatPlainText(text) {
  const source = String(text ?? '').replace(/\r\n?/g, '\n').trim();
  if (!source) return [];
  const lines = (source.includes('\n') ? source : addBreaks(source)).split('\n').map((line) => line.trim());
  const blocks = [];
  let paragraph = [];
  const flush = () => {
    if (paragraph.length) chunkParagraph(paragraph.join(' ')).forEach((chunk) => blocks.push({ type: 'paragraph', text: chunk }));
    paragraph = [];
  };
  for (const line of lines) {
    const bullet = BULLET_LINE.exec(line);
    if (!line) flush();
    else if (bullet) {
      flush();
      const last = blocks[blocks.length - 1];
      if (last?.type === 'list') last.items.push(bullet[1]); else blocks.push({ type: 'list', items: [bullet[1]] });
    } else if (isHeadingLine(line)) {
      flush();
      blocks.push({ type: 'heading', text: line.replace(/:$/, '') });
    } else paragraph.push(line);
  }
  flush();
  return blocks;
}
