import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const compatibilityFile = join(repositoryRoot, 'scripts', 'local-postgres-compat.sql');

/** Local Compose only: never read DATABASE_URL or connect to a hosted target. */
export function bootstrapLocalDatabase({
  environment = process.env,
  spawn = spawnSync,
  reportError = (message) => console.error(message),
  reportSuccess = (message) => console.log(message),
  readCompatibility = () => readFileSync(compatibilityFile, 'utf8'),
} = {}) {
  const fail = (message) => { reportError(message); return 1; };
  if (environment.NODE_ENV === 'production') {
    return fail('Local bootstrap is disabled in production mode. Use reviewed deployment migrations.');
  }
  const config = {
    port: environment.POSTGRES_PORT || '5432',
    database: environment.POSTGRES_DB || 'leetcode_app',
    user: environment.POSTGRES_USER || 'postgres',
    password: environment.POSTGRES_PASSWORD || 'postgres',
  };
  if (!/^\d+$/.test(config.port) || Number(config.port) < 1 || Number(config.port) > 65535) {
    return fail('POSTGRES_PORT must be a valid local PostgreSQL port.');
  }
  const run = (command, args, options = {}) => {
    try {
      return spawn(command, args, {
        cwd: repositoryRoot, env: environment, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024,
        ...options,
      });
    } catch {
      // Child output/errors may include credentials. Only fixed messages reach the terminal.
      return { status: null, error: true };
    }
  };
  const succeeded = (result) => !result.error && result.status === 0;
  const localEndpoint = (value) => typeof value === 'string'
    && (/^unix:\/\/\/[^\r\n\0?#]+$/.test(value) || /^npipe:\/\/\/\/\.\/pipe\/[^\r\n\0?#]+$/.test(value));
  const suppliedHost = environment.DOCKER_HOST?.trim();
  if (suppliedHost && !localEndpoint(suppliedHost)) {
    return fail('Local bootstrap requires a local Docker socket or named pipe. Remove remote Docker overrides and retry.');
  }
  let endpoint = suppliedHost;
  if (!endpoint || environment.DOCKER_CONTEXT?.trim()) {
    const context = environment.DOCKER_CONTEXT?.trim();
    const inspected = run('docker', ['context', 'inspect', ...(context ? [context] : [])]);
    if (!succeeded(inspected)) return fail('Could not verify a local Docker context. Start Docker and select its local context before retrying.');
    try {
      const contexts = JSON.parse(inspected.stdout);
      endpoint = Array.isArray(contexts) && contexts.length === 1 ? contexts[0]?.Endpoints?.docker?.Host : null;
    } catch { endpoint = null; }
  }
  if (!localEndpoint(endpoint)) return fail('Local bootstrap requires a local Docker socket or named pipe. Select a local Docker context and retry.');
  // Pin every Compose call to the inspected endpoint, even if another terminal
  // changes the default context. Do not inherit an overriding remote context/TLS.
  const dockerEnvironment = { ...environment };
  for (const name of ['DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_TLS_VERIFY', 'DOCKER_CERT_PATH']) delete dockerEnvironment[name];
  const compose = (args, options) => run('docker', [
    '--host', endpoint, 'compose', '--project-directory', repositoryRoot, '-f', join(repositoryRoot, 'docker-compose.yml'), ...args,
  ], { ...options, env: dockerEnvironment });
  const running = compose(['ps', '--status', 'running', '--services']);
  if (!succeeded(running) || !String(running.stdout ?? '').split(/\r?\n/).some((service) => service.trim() === 'postgres')) {
    return fail('Local PostgreSQL is not running. Start it with: pnpm db:up');
  }
  const ready = compose(['exec', '-T', 'postgres', 'pg_isready', '-U', config.user, '-d', config.database]);
  if (!succeeded(ready)) {
    return fail('Local PostgreSQL is not ready. Wait for pnpm db:status to report healthy, then retry.');
  }
  let compatibilitySql;
  try { compatibilitySql = readCompatibility(); }
  catch { return fail('Local PostgreSQL compatibility SQL is unavailable. Check scripts/local-postgres-compat.sql.'); }
  const compatible = compose([
    'exec', '-T', 'postgres', 'psql', '-X', '--no-password', '--set=ON_ERROR_STOP=on',
    '-U', config.user, '-d', config.database,
  ], { input: compatibilitySql });
  if (!succeeded(compatible)) {
    return fail('Local PostgreSQL compatibility setup failed. No migrations were started; check the local database permissions.');
  }
  const databaseUrl = `postgresql://${encodeURIComponent(config.user)}:${encodeURIComponent(config.password)}@127.0.0.1:${Number(config.port)}/${encodeURIComponent(config.database)}`;
  const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
  const migrated = run(pnpm, ['--filter', '@leetcode-app/database', 'run', 'migrate:up'], {
    env: { ...environment, POSTGRES_HOST: '127.0.0.1', DATABASE_URL: databaseUrl },
  });
  if (!succeeded(migrated)) {
    return fail('Local PostgreSQL migration failed. Existing data was not reset; review the local migration setup before retrying.');
  }
  reportSuccess('Local PostgreSQL compatibility and migrations are ready. Existing data was preserved.');
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = bootstrapLocalDatabase();
}
