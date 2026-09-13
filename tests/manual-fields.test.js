import assert from 'node:assert/strict';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { build } from '../frontend/node_modules/esbuild/lib/main.js';
import { renderToStaticMarkup } from '../frontend/node_modules/react-dom/server.node.js';

test('manual fields default correctly and Other reveals required country entry', async () => {
  let selected = 'India';
  globalThis.__manualLocationState = () => [selected, (value) => { selected = value; }];
  try {
    const result = await build({
      entryPoints: ['frontend/src/components/applications/ManualJobFields.jsx'],
      bundle: true, write: false, format: 'esm', platform: 'node', jsx: 'automatic',
      plugins: [{ name: 'test-react-state', setup(builder) {
        builder.onResolve({ filter: /^react$/ }, () => ({ path: 'state', namespace: 'test' }));
        builder.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: 'export const useState = () => globalThis.__manualLocationState();' }));
        builder.onResolve({ filter: /^react\/jsx-runtime$/ }, () => ({ path: pathToFileURL(`${process.cwd()}/frontend/node_modules/react/jsx-runtime.js`).href, external: true }));
      } }],
    });
    const { ManualJobFields } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
    const tree = ManualJobFields();
    const html = renderToStaticMarkup(tree);
    assert.match(html, /<option value="full-time" selected="">Full-time/);
    assert.match(html, /<option value="India" selected="">India/);
    for (const value of ['full-time', 'part-time', 'contract', 'internship', 'Bengaluru', 'Noida', 'Gurugram', 'Mumbai', 'Pune', 'Hyderabad', 'Chennai', 'India', 'Other']) {
      assert.ok(html.includes(`value="${value}"`), value);
    }
    tree.props.children[1].props.children[1].props.onChange({ target: { value: 'Other' } });
    const updated = ManualJobFields();
    assert.equal(updated.props.children[2].props.name, 'country');
    assert.equal(updated.props.children[2].props.required, true);
    assert.ok(renderToStaticMarkup(updated).includes('name="country"'));
  } finally {
    delete globalThis.__manualLocationState;
  }
});
