import DOMPurify from 'dompurify';

/** Tags and attributes the description view allows; everything else (script, style, iframe, event handlers, javascript: URLs) is dropped. */
export const ALLOWED_TAGS = ['p', 'br', 'ul', 'ol', 'li', 'strong', 'b', 'em', 'i', 'u', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'a', 'span', 'div', 'blockquote', 'code', 'pre', 'hr'];
export const ALLOWED_ATTR = ['href'];

const escapeHtml = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Sanitize ATS HTML for display. Fails closed: where DOMPurify has no DOM to work with, the text is escaped instead of passed through.
 * @param {string} html - Untrusted HTML.
 * @returns {string} Safe HTML (links open in a new tab with rel=noopener noreferrer).
 */
export function sanitizeHtml(html) {
  const input = String(html ?? '');
  if (!DOMPurify.isSupported) return escapeHtml(input);
  const clean = DOMPurify.sanitize(input, { ALLOWED_TAGS, ALLOWED_ATTR, ALLOW_DATA_ATTR: false, ALLOWED_URI_REGEXP: /^(?:https?:|mailto:)/i });
  return clean.replace(/<a\b/gi, '<a target="_blank" rel="noopener noreferrer"');
}
