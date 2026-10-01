import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const installerCode = readFileSync(join(root, 'installer', 'dist', 'plugin.js'), 'utf8');
const viewCode = readFileSync(join(root, 'dist', 'plugin.min.js'), 'utf8');
const context = { AppPlugin: class {}, crypto: webcrypto, TextEncoder };
runInNewContext(`${installerCode}\nglobalThis.ScheduleInstaller = Plugin;`, context);
const Plugin = context.ScheduleInstaller;
const emptyCode = 'class Plugin extends CollectionPlugin {\n  onLoad() {\n    // Put your custom code here...\n  }\n}';

function harness(code = emptyCode, config = { fields: [{ id: 'title', type: 'text' }], views: [{ id: 'LIST', type: 'list', label: 'List' }] }) {
  let savedCode = code;
  let savedConfig = structuredClone(config);
  let writes = 0;
  const api = {
    getName: () => 'Example',
    isJournalPlugin: () => false,
    getExistingCodeAndConfig: () => ({ code: savedCode, json: structuredClone(savedConfig) }),
    savePlugin: async (next, nextCode) => { writes++; savedConfig = structuredClone(next); savedCode = nextCode; return true; },
    saveConfiguration: async (next) => { writes++; savedConfig = structuredClone(next); return true; }
  };
  const plugin = new Plugin();
  plugin.data = { getPluginByGuid: () => api };
  plugin._inFlight = new Set();
  return { plugin, api, get writes() { return writes; }, get code() { return savedCode; }, get config() { return savedConfig; } };
}

test('installs only when selected and preserves original fields and views', async () => {
  const h = harness();
  assert.equal((await h.plugin.status(h.api)).state, 'available');
  assert.equal(h.writes, 0);
  const result = await h.plugin.install('example-guid');
  assert.equal(result.state, 'installed');
  assert.equal(h.writes, 1);
  assert.equal(h.code, viewCode);
  assert.deepEqual(h.config.fields.map((field) => field.id), ['title', 'start', 'end']);
  assert.deepEqual(h.config.views.map((view) => view.id), ['LIST', 'VTHYMERDAYWEEK']);
  assert.deepEqual(h.config.custom.dayWeek, { startField: 'start', endField: 'end', defaultMinutes: 60 });
  assert.equal((await h.plugin.status(h.api)).state, 'installed');
  assert.equal((await h.plugin.install('example-guid')).state, 'installed');
  assert.equal(h.writes, 1);
});

test('does not replace unrelated Collection code or claim a foreign Schedule view', async () => {
  const other = harness('class Plugin extends CollectionPlugin { onLoad() {} }');
  assert.match((await other.plugin.status(other.api)).detail, /merge required/);
  assert.equal((await other.plugin.install('example-guid')).state, 'unavailable');
  assert.equal(other.writes, 0);

  const foreignView = harness('other code', {
    fields: [{ id: 'start', type: 'datetime' }, { id: 'end', type: 'datetime' }],
    views: [{ id: 'VTHYMERDAYWEEK', type: 'custom', label: 'Schedule' }],
    custom: { dayWeek: { startField: 'start', endField: 'end' } }
  });
  assert.equal((await foreignView.plugin.status(foreignView.api)).state, 'unavailable');
  assert.equal(foreignView.writes, 0);
});

test('restores a removed Schedule view without rewriting recognized code or date fields', async () => {
  const h = harness(viewCode, {
    fields: [
      { id: 'title', type: 'text' },
      { id: 'start', type: 'datetime', many: false, read_only: false },
      { id: 'end', type: 'datetime', many: false, read_only: false }
    ],
    views: [{ id: 'LIST', type: 'list', label: 'List' }],
    custom: { dayWeek: { startField: 'start', endField: 'end', defaultMinutes: 60 } }
  });
  assert.equal((await h.plugin.status(h.api)).state, 'available');
  assert.equal((await h.plugin.install('example-guid')).state, 'installed');
  assert.equal(h.code, viewCode);
  assert.equal(h.config.fields.length, 3);
  assert.equal(h.config.views.length, 2);
});

test('rejects a successful save response when readback did not change', async () => {
  const h = harness();
  h.api.savePlugin = async () => true;
  const result = await h.plugin.install('example-guid');
  assert.equal(result.state, 'error');
  assert.match(result.detail, /readback did not match/);
});
