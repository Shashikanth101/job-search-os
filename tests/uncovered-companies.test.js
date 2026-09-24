import assert from 'node:assert/strict';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { build } from '../frontend/node_modules/esbuild/lib/main.js';
import { renderToStaticMarkup } from '../frontend/node_modules/react-dom/server.node.js';
import { createApp } from '../src/app.js';
import uncoveredCompanies from '../src/config/uncovered-companies.js';

test('uncovered-companies API returns the configured array as-is', () => {
  const app = createApp({});
  const layer = app._router.stack.find((entry) => entry.route?.path === '/api/uncovered-companies');
  assert.ok(layer, 'uncovered companies route is registered');
  let response;
  layer.route.stack[0].handle({}, { json(value) { response = value; return this; } });
  assert.strictEqual(response, uncoveredCompanies);
  assert.deepEqual(response, []);
});

test('uncovered companies render as Google career search links in a new tab', async () => {
  const result = await build({
    entryPoints: ['frontend/src/components/applications/UncoveredCompaniesSection.jsx'],
    bundle: true, write: false, format: 'esm', platform: 'node', jsx: 'automatic',
    plugins: [{ name: 'react-runtime', setup(builder) {
      builder.onResolve({ filter: /^react\/jsx-runtime$/ }, () => ({ path: pathToFileURL(`${process.cwd()}/frontend/node_modules/react/jsx-runtime.js`).href, external: true }));
    } }],
  });
  const { UncoveredCompaniesSection } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
  const companies = ['Whatfix', 'Hugging Face', 'X (Twitter)'];
  const html = renderToStaticMarkup(UncoveredCompaniesSection({ companies }));
  for (const company of companies) {
    const expectedUrl = `https://www.google.com/search?q=${encodeURIComponent(company)}+careers`;
    assert.match(html, new RegExp(`href="${expectedUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`));
  }
  assert.equal((html.match(/target="_blank"/g) ?? []).length, companies.length);
  assert.match(html, /Other Companies/);
});
