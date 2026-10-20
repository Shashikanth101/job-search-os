import test from 'node:test';
import assert from 'node:assert/strict';
import { formatPlainText, looksLikeHtml } from '../frontend/src/utils/formatDescription.js';
import { ALLOWED_ATTR, ALLOWED_TAGS, sanitizeHtml } from '../frontend/src/utils/sanitizeHtml.js';

test('looksLikeHtml only fires on real markup', () => {
  assert.equal(looksLikeHtml('<p>Hello</p>'), true);
  assert.equal(looksLikeHtml('Line one<br>Line two'), true);
  assert.equal(looksLikeHtml('Use a < b and c > d in TypeScript generics Array<string>'), false);
  assert.equal(looksLikeHtml(''), false);
  assert.equal(looksLikeHtml(null), false);
});

test('plain text with lines: bullets become lists, short ALL-CAPS and colon lines become headings, other lines paragraphs', () => {
  const blocks = formatPlainText('ABOUT THE ROLE\nYou will build React apps.\nSecond line of the same paragraph.\n\nRequirements:\n- 5+ years of experience\n* TypeScript\n• Node.js\n\nWe offer great benefits.');
  assert.deepEqual(blocks, [
    { type: 'heading', text: 'ABOUT THE ROLE' },
    { type: 'paragraph', text: 'You will build React apps. Second line of the same paragraph.' },
    { type: 'heading', text: 'Requirements' },
    { type: 'list', items: ['5+ years of experience', 'TypeScript', 'Node.js'] },
    { type: 'paragraph', text: 'We offer great benefits.' },
  ]);
  assert.deepEqual(formatPlainText(''), []);
  assert.deepEqual(formatPlainText(null), []);
});

test('flat one-line text (how scrapers store descriptions) is split at bullets and recognizable headings', () => {
  const blocks = formatPlainText('ABOUT THE TEAM OpenAI helps customers adopt AI. What you get to do in this role: Design, build and ship features Requirements: • 5+ years of experience • Strong TypeScript Benefits: Health cover.');
  assert.deepEqual(blocks.map((block) => block.type), ['heading', 'paragraph', 'heading', 'paragraph', 'heading', 'list', 'heading', 'paragraph']);
  assert.equal(blocks[0].text, 'ABOUT THE TEAM');
  assert.equal(blocks[2].text, 'What you get to do in this role');
  assert.deepEqual(blocks[5].items, ['5+ years of experience', 'Strong TypeScript']);
});

test('long unstructured paragraphs are chunked at sentence boundaries and no text is lost', () => {
  const sentence = 'This sentence is about forty characters.';
  const text = Array.from({ length: 30 }, () => sentence).join(' ');
  const blocks = formatPlainText(text);
  assert.ok(blocks.length > 1 && blocks.every((block) => block.type === 'paragraph' && block.text.length <= 450));
  assert.equal(blocks.map((block) => block.text).join(' '), text);
});

test('text is never turned into markup: plain-text blocks keep angle brackets as text', () => {
  const blocks = formatPlainText('Use <script>alert(1)</script> carefully');
  assert.deepEqual(blocks, [{ type: 'paragraph', text: 'Use <script>alert(1)</script> carefully' }]);
});

test('sanitizeHtml fails closed without a DOM and its allow-list has no script, style, iframe or handler attributes', () => {
  const dirty = '<p onclick="x()">Hi</p><script>alert(1)</script><img src=x onerror=alert(1)>';
  const out = sanitizeHtml(dirty);
  assert.ok(!out.includes('<'), 'no live markup survives: every < is escaped');
  assert.ok(out.includes('&lt;script&gt;'), 'escaped, not removed silently, when there is no DOM');
  for (const tag of ['script', 'style', 'iframe', 'object', 'embed', 'img', 'form', 'input']) assert.ok(!ALLOWED_TAGS.includes(tag), tag);
  assert.deepEqual(ALLOWED_ATTR, ['href']);
});
