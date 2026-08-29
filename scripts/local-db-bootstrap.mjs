import { spawnSync } from 'node:child_process';

const read = (name, fallback) => process.env[name] || fallback;
const config = {
  host: '127.0.0.1',
  port: read('POSTGRES_PORT', '5432'),
  database: read('POSTGRES_DB', 'leetcode_app'),
  user: read('POSTGRES_USER', 'postgres'),
  password: read('POSTGRES_PASSWORD', 'postgres'),
};

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, { encoding: 'utf8', ...options });
  if (result.error) {
    throw result.error;
  }
  return result;
};

const compose = (args, options) => run('docker', ['compose', ...args], options);
const running = compose(['ps', '--status', 'running', '--services'], { stdio: 'pipe' });

if (running.status !== 0 || !running.stdout.split(/\r?\n/).includes('postgres')) {
  console.error('Local PostgreSQL is not running. Start it with: pnpm db:up');
  process.exit(1);
}

const ready = compose(['exec', '-T', 'postgres', 'pg_isready', '-U', config.user, '-d', config.database], { stdio: 'inherit' });
if (ready.status !== 0) {
  console.error('Local PostgreSQL is not ready yet. Wait for `pnpm db:status` to report healthy, then retry.');
  process.exit(1);
}

const password = encodeURIComponent(config.password);
const databaseUrl = `postgresql://${encodeURIComponent(config.user)}:${password}@${config.host}:${config.port}/${encodeURIComponent(config.database)}`;
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const migrate = run(pnpm, ['--filter', '@leetcode-app/database', 'run', 'migrate:up'], {
  stdio: 'inherit',
  env: { ...process.env, DATABASE_URL: databaseUrl },
});

process.exit(migrate.status ?? 1);
