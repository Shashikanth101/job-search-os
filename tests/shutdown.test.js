import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import Database from 'better-sqlite3';
import { setLlmClient } from '../src/llm/index.js';
import { acquireLock, releaseLock } from '../src/locks.js';
import { rankPending } from '../src/ranker/rank-pending.js';

const noSleep = async () => {};
const reply = () => ({ text: JSON.stringify({ score: 7, reason: 'fit', location: 'Bengaluru' }), usage: { input_tokens: 10, output_tokens: 5 } });

function memoryDb() {
  const db = new Database(':memory:');
  db.exec(fs.readFileSync(new URL('../src/schema.sql', import.meta.url), 'utf8'));
  return db;
}

function addJobs(db, count) {
  const insert = db.prepare("INSERT INTO jobs (job_id, title, company, location, description, apply_url, source, rank_status, prefilter_status) VALUES (?, ?, 'Acme', 'Bengaluru, India', 'React', ?, 'test', 'pending', 'passed')");
  for (let i = 0; i < count; i += 1) insert.run(`j${i}`, `Frontend Engineer ${i}`, `https://x/${i}`);
}

function deferred() {
  let open;
  const promise = new Promise((resolve) => { open = resolve; });
  return { promise, open };
}

const until = async (condition) => {
  for (let i = 0; i < 200 && !condition(); i += 1) await new Promise((resolve) => setTimeout(resolve, 5));
  assert.ok(condition(), 'condition not reached');
};

const deadPid = () => spawnSync(process.execPath, ['-e', '0']).pid;
const lockRow = (db) => db.prepare('SELECT * FROM app_locks').all();

for (const [signal, code] of [['SIGINT', 130], ['SIGTERM', 143], ['SIGHUP', 129]]) {
  test(`${signal} mid-run: in-flight call finishes, aborted call stays pending untouched, lock released, exit ${code}`, async (t) => {
    const db = memoryDb();
    addJobs(db, 6);
    const proc = new EventEmitter();
    const exits = [];
    const gate = deferred();
    let calls = 0;
    setLlmClient(async (request) => {
      calls += 1;
      if (calls === 1) {
        await gate.promise;
        return reply();
      }
      await new Promise((_, reject) => request.signal.addEventListener('abort', () => reject(new Error('socket hang up'))));
      return reply();
    });
    t.after(() => setLlmClient(null));

    const run = rankPending({ db, concurrency: 2, maxUsd: 100, sleep: noSleep, processRef: proc, exit: (c) => exits.push(c), drainMs: 40 });
    await until(() => calls === 2);
    assert.equal(lockRow(db).length, 1);
    proc.emit(signal);
    gate.open();
    const summary = await run;

    assert.equal(summary.aborted, true);
    assert.equal(summary.abortReason, `signal:${signal}`);
    assert.equal(summary.ranked, 1);
    assert.equal(summary.interrupted, 1);
    assert.equal(calls, 2, 'no new job claimed after the signal');
    assert.deepEqual(exits, [code]);
    assert.deepEqual(lockRow(db), []);
    assert.equal(proc.listenerCount(signal), 0);
    assert.deepEqual(db.prepare("SELECT rank_status, COUNT(*) AS n FROM jobs GROUP BY 1 ORDER BY 1").all(), [{ rank_status: 'pending', n: 5 }, { rank_status: 'ranked', n: 1 }]);
    assert.deepEqual(db.prepare("SELECT DISTINCT rank_attempts a, relevance_score s, rank_last_error e, rank_next_retry_at r FROM jobs WHERE rank_status = 'pending'").all(), [{ a: 0, s: null, e: null, r: null }]);
    db.close();
  });
}

test('a second signal releases the lock and exits immediately without waiting for in-flight calls', async (t) => {
  const db = memoryDb();
  addJobs(db, 2);
  const proc = new EventEmitter();
  const exits = [];
  const gate = deferred();
  let calls = 0;
  setLlmClient(async () => {
    calls += 1;
    await gate.promise;
    return reply();
  });
  t.after(() => setLlmClient(null));
  const run = rankPending({ db, concurrency: 1, maxUsd: 100, sleep: noSleep, processRef: proc, exit: (c) => exits.push(c), drainMs: 60_000 });
  await until(() => calls === 1);
  proc.emit('SIGTERM');
  assert.deepEqual(exits, [], 'first signal drains, it does not exit');
  assert.equal(lockRow(db).length, 1);
  proc.emit('SIGTERM');
  assert.deepEqual(exits, [143], 'second signal exits at once');
  assert.deepEqual(lockRow(db), [], 'lock released while the call is still in flight');
  gate.open();
  await run;
  db.close();
});

test('stale lock from a dead pid on this host is reclaimed; live pid or another host is respected', async (t) => {
  const db = memoryDb();
  const host = os.hostname();
  const insert = (pid, hostname, owner = 'ghost-run') => {
    db.prepare('DELETE FROM app_locks').run();
    db.prepare("INSERT INTO app_locks (name, owner, acquired_at, expires_at, pid, hostname) VALUES ('rank', ?, ?, '2999-01-01T00:00:00.000Z', ?, ?)").run(owner, new Date().toISOString(), pid, hostname);
  };
  const logs = [];
  const log = (message) => logs.push(message);

  const dead = deadPid();
  insert(dead, host);
  assert.equal(acquireLock(db, 'rank', 'me', 60_000, { log }), true);
  assert.deepEqual(lockRow(db).map((row) => [row.owner, row.pid]), [['me', process.pid]]);
  assert.deepEqual(logs, [`[Locks] reclaiming stale lock from dead pid ${dead}`]);

  insert(process.pid, host);
  assert.equal(acquireLock(db, 'rank', 'me', 60_000, { log }), false, 'live pid');
  insert(dead, `${host}-other-machine`);
  assert.equal(acquireLock(db, 'rank', 'me', 60_000, { log }), false, 'different hostname');
  insert(null, null);
  assert.equal(acquireLock(db, 'rank', 'me', 60_000, { log }), false, 'legacy lock without pid is only released by TTL');
  assert.equal(logs.length, 1);

  insert(dead, host);
  addJobs(db, 1);
  setLlmClient(async () => reply());
  t.after(() => setLlmClient(null));
  const result = await rankPending({ db, maxUsd: 100, sleep: noSleep, processRef: new EventEmitter(), exit() {} });
  assert.equal(result.ranked, 1, 'run proceeds after reclaiming');
  insert(process.pid, host);
  assert.equal((await rankPending({ db, maxUsd: 100, sleep: noSleep, processRef: new EventEmitter(), exit() {} })).skipped, 'locked');
  db.close();
});

test("cleanup never deletes a lock owned by another run id", async (t) => {
  const db = memoryDb();
  addJobs(db, 2);
  setLlmClient(async () => {
    db.prepare("UPDATE app_locks SET owner = 'someone-else'").run(); // simulate the lock being taken over mid-run
    return reply();
  });
  t.after(() => setLlmClient(null));
  await rankPending({ db, concurrency: 1, maxUsd: 100, sleep: noSleep, processRef: new EventEmitter(), exit() {} });
  assert.deepEqual(lockRow(db).map((row) => row.owner), ['someone-else']);
  assert.equal(releaseLock(db, 'rank', 'me'), false);
  assert.equal(lockRow(db).length, 1);
  assert.equal(releaseLock(db, 'rank', 'someone-else'), true);
  db.close();
});

test('migration 007 adds pid and hostname to app_locks idempotently', async () => {
  const { migrateRankingState } = await import('../src/migrations/005-ranking-state.js');
  const { migrateLockOwner } = await import('../src/migrations/007-lock-owner.js');
  const db = new Database(':memory:');
  db.exec('CREATE TABLE jobs (id INTEGER PRIMARY KEY, title TEXT, company TEXT)');
  migrateRankingState(db);
  migrateLockOwner(db);
  migrateLockOwner(db);
  assert.ok(['pid', 'hostname'].every((name) => db.prepare('PRAGMA table_info(app_locks)').all().some((column) => column.name === name)));
  db.close();
});
