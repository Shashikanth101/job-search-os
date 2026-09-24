import test from 'node:test';
import assert from 'node:assert/strict';
import { extractCandidateTerms, findKeywordGaps, latexToVisibleText } from '../src/resume/keyword-coverage.js';

const gleanDescription = 'About you: Experience with a highly polished consumer grade React.js app. '
  + 'Passionate about open web technologies (HTML5/CSS/JS). Experienced in or desire to master one or more of: '
  + 'Progressive Web Apps (PWA), Web Extensions, Electron, Capacitor, React, Redux, Webpack. '
  + 'BA/BS in computer science. Build zero-latency, 60FPS user interfaces.';

test('finds literal Glean JD gaps while recognizing equivalent-but-not-literal technologies', () => {
  const resume = 'React, TypeScript, HTML5, CSS3, JavaScript, Redux, Webpack. Chrome Extension. Electronics & Communication.';
  const gaps = findKeywordGaps(gleanDescription, resume);

  for (const term of ['React.js', 'Progressive Web Apps', 'PWA', 'Web Extensions', 'Electron', 'Capacitor', '60FPS', 'zero-latency', 'consumer grade', 'BA/BS in computer science']) {
    assert.ok(gaps.includes(term), 'expected gap for ' + term);
  }
  for (const term of ['React', 'Redux', 'Webpack', 'HTML5']) {
    assert.ok(!gaps.includes(term), 'expected ' + term + ' to be recognized as present');
  }
});

test('extracts degree/certification-style terms and ignores terms absent from the JD', () => {
  assert.deepEqual(extractCandidateTerms('Requires AWS Certified Solutions Architect and a BS in Computer Science.'), [
    'BS in Computer Science',
    'AWS Certified Solutions Architect',
  ]);
});

test('converts generated LaTeX formatting into searchable visible text', () => {
  assert.equal(
    latexToVisibleText('\\textbf{React} and 99.9\\% uptime'),
    'React and 99.9% uptime',
  );
});
