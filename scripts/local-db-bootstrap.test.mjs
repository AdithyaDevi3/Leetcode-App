import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { parseEnv } from 'node:util';
import { bootstrapLocalDatabase } from './local-db-bootstrap.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const exampleDefaults = parseEnv(readFileSync(join(root, 'apps', 'web', '.env.example'), 'utf8'));
const compatibilitySql = readFileSync(join(root, 'scripts', 'local-postgres-compat.sql'), 'utf8');
const localHost = 'unix:///var/run/docker.sock';
const secretCanary = randomBytes(18).toString('hex');
const fakeConnection = () => {
  const url = new URL('postgresql://hosted.example.invalid/db');
  url.username = 'fixture-user';
  url.password = secretCanary;
  return url.toString();
};
function harness({ environment = {}, failAt, throwAt, readCompatibility, contextHost = localHost, contextOutput } = {}) {
  const calls = [], errors = [], messages = [];
  const status = bootstrapLocalDatabase({
    environment,
    spawn(command, args, options) {
      calls.push({ command, args, options });
      if (calls.length === throwAt) throw new Error(secretCanary);
      return calls.length === failAt
        ? { status: 2, stderr: fakeConnection(), error: new Error(secretCanary) }
        : { status: 0, stdout: args[0] === 'context' ? (contextOutput ?? JSON.stringify([{ Endpoints: { docker: { Host: contextHost } } }]))
          : args.includes('ps') ? 'postgres\n' : '', stderr: '' };
    },
    reportError: (message) => errors.push(message),
    reportSuccess: (message) => messages.push(message),
    ...(readCompatibility ? { readCompatibility } : {}),
  });
  return { status, calls, errors, messages };
}

describe('local database bootstrap safety', () => {
  it('prepares only the checked-in Compose PostgreSQL before applying migrations to loopback', () => {
    const result = harness({ environment: { DATABASE_URL: fakeConnection(), POSTGRES_HOST: 'hosted.example.invalid' } });
    assert.equal(result.status, 0);
    assert.equal(result.calls.length, 5);
    const [inspection, running, ready, compatible, migration] = result.calls;
    assert.deepEqual(inspection.args, ['context', 'inspect']);
    for (const call of [running, ready, compatible]) {
      assert.equal(call.command, 'docker');
      assert.deepEqual(call.args.slice(0, 7), ['--host', localHost, 'compose', '--project-directory', root, '-f', join(root, 'docker-compose.yml')]);
      assert.equal(call.options.cwd, root);
      assert.equal(call.options.stdio, undefined);
    }
    assert.deepEqual(running.args.slice(7), ['ps', '--status', 'running', '--services']);
    assert.deepEqual(ready.args.slice(7), ['exec', '-T', 'postgres', 'pg_isready', '-U', 'postgres', '-d', 'leetcode_app']);
    assert.deepEqual(compatible.args.slice(7), ['exec', '-T', 'postgres', 'psql', '-X', '--no-password', '--set=ON_ERROR_STOP=on', '-U', 'postgres', '-d', 'leetcode_app']);
    assert.equal(compatible.options.input, compatibilitySql);
    assert.deepEqual(migration.args, ['--filter', '@leetcode-app/database', 'run', 'migrate:up']);
    const target = new URL(migration.options.env.DATABASE_URL);
    assert.equal(target.hostname, '127.0.0.1');
    assert.equal(target.port, '5432');
    assert.equal(target.pathname, '/leetcode_app');
    assert.equal(target.username, exampleDefaults.POSTGRES_USER);
    assert.equal(target.password, exampleDefaults.POSTGRES_PASSWORD);
    assert.equal(migration.options.env.POSTGRES_HOST, '127.0.0.1');
    assert.deepEqual(result.errors, []);
    assert.equal(result.messages.length, 1);
    assert.ok(!result.messages.join().includes(secretCanary));
    assert.doesNotMatch(result.messages.join(), /hosted\.example/);
  });

  it('preserves custom local database settings and correctly encodes credentials', () => {
    const testPassword = secretCanary.concat('@/:');
    const result = harness({ environment: { POSTGRES_PORT: '15432', POSTGRES_DB: 'local db', POSTGRES_USER: 'local user', POSTGRES_PASSWORD: testPassword } });
    assert.equal(result.status, 0);
    const target = new URL(result.calls[4].options.env.DATABASE_URL);
    assert.equal(target.hostname, '127.0.0.1');
    assert.equal(target.port, '15432');
    assert.equal(decodeURIComponent(target.pathname), '/local db');
    assert.equal(decodeURIComponent(target.username), 'local user');
    assert.equal(decodeURIComponent(target.password), testPassword);
    const reported = [...result.errors, ...result.messages].join();
    assert.ok(!reported.includes(testPassword) && !reported.includes(encodeURIComponent(testPassword)));
  });

  for (const [stage, failure] of [[1, /Could not verify/], [2, /not running/], [3, /not ready/], [4, /No migrations were started/], [5, /migration failed/]]) {
    it(`stops safely at failed stage ${stage} without printing child credentials`, () => {
      const result = harness({ failAt: stage });
      assert.equal(result.status, 1);
      assert.equal(result.calls.length, stage);
      assert.match(result.errors[0], failure);
      assert.deepEqual(result.messages, []);
      assert.ok(!result.errors.join().includes(secretCanary));
      assert.doesNotMatch(result.errors.join(), /postgresql:\/\//);
    });
  }

  it('handles an unavailable Docker executable without exposing its error', () => {
    const result = harness({ throwAt: 1 });
    assert.equal(result.status, 1);
    assert.equal(result.calls.length, 1);
    assert.match(result.errors[0], /Could not verify/);
    assert.ok(!result.errors.join().includes(secretCanary));
  });

  it('does not start compatibility or migrations if the SQL asset cannot be read', () => {
    const result = harness({ readCompatibility: () => { throw new Error(secretCanary); } });
    assert.equal(result.status, 1);
    assert.equal(result.calls.length, 3);
    assert.match(result.errors[0], /compatibility SQL is unavailable/);
    assert.ok(!result.errors.join().includes(secretCanary));
  });

  it('rejects network Docker overrides before any command, including when a context is also selected', () => {
    for (const host of ['ssh://remote.example', 'tcp://127.0.0.1:2375', 'tcp://remote.example:2376', 'npipe:////remote/pipe/docker_engine']) {
      const result = harness({ environment: { DOCKER_HOST: host, DOCKER_CONTEXT: 'desktop-linux' } });
      assert.equal(result.status, 1); assert.equal(result.calls.length, 0);
      assert.doesNotMatch(result.errors.join(), /remote\.example|2375|2376/);
    }
  });

  it('rejects an active or selected remote context and malformed context metadata before Compose', () => {
    for (const options of [{ contextHost: 'ssh://remote.example' }, { environment: { DOCKER_CONTEXT: 'remote' }, contextHost: 'tcp://remote.example:2376' },
      { contextOutput: 'not-json' }, { contextOutput: '[]' }, { contextOutput: '[{}]' }]) {
      const result = harness(options);
      assert.equal(result.status, 1); assert.equal(result.calls.length, 1);
      assert.deepEqual(result.calls[0].args.slice(0, 2), ['context', 'inspect']);
    }
  });

  it('pins a selected local Desktop context and removes inherited Docker overrides from Compose', () => {
    const result = harness({ environment: { DOCKER_CONTEXT: 'desktop-linux', DOCKER_HOST: localHost, DOCKER_TLS_VERIFY: '1', DOCKER_CERT_PATH: '/private-test-cert' } });
    assert.equal(result.status, 0);
    assert.deepEqual(result.calls[0].args, ['context', 'inspect', 'desktop-linux']);
    for (const call of result.calls.filter(call => call.args.includes('compose'))) {
      assert.deepEqual(call.args.slice(0, 2), ['--host', localHost]);
      for (const name of ['DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_TLS_VERIFY', 'DOCKER_CERT_PATH']) assert.equal(call.options.env[name], undefined);
    }
  });

  it('accepts explicit local rootless sockets and local Windows named pipes without remote context lookup', () => {
    for (const host of ['unix:///run/user/1000/docker.sock', 'npipe:////./pipe/docker_engine']) {
      const result = harness({ environment: { DOCKER_HOST: host } });
      assert.equal(result.status, 0); assert.equal(result.calls.length, 4);
      assert.deepEqual(result.calls[0].args.slice(0, 2), ['--host', host]);
    }
  });

  it('refuses production mode and invalid ports before running a child command', () => {
    for (const environment of [{ NODE_ENV: 'production' }, { POSTGRES_PORT: '0' }, { POSTGRES_PORT: '65536' }, { POSTGRES_PORT: '5432/not-local' }]) {
      const result = harness({ environment });
      assert.equal(result.status, 1);
      assert.equal(result.calls.length, 0);
      assert.equal(result.errors.length, 1);
    }
  });

  it('leaves the copied example in local guest mode with no active hosted connection', () => {
    const example = readFileSync(join(root, 'apps', 'web', '.env.example'), 'utf8');
    assert.match(example, /^NEXT_PUBLIC_SUPABASE_URL=$/m);
    assert.match(example, /^NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$/m);
    assert.doesNotMatch(example, /^DATABASE_URL=/m);
    assert.match(example, /^CODE_EXECUTION_ENABLED=false$/m);
    assert.match(example, /^EVALUATION_AI_ENABLED=false$/m);
  });
});
