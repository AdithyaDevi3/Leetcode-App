import { cpSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const standaloneRoot = join(appRoot, '.next', 'standalone', 'apps', 'web');

cpSync(join(appRoot, 'public'), join(standaloneRoot, 'public'), { recursive: true, force: true });
cpSync(join(appRoot, '.next', 'static'), join(standaloneRoot, '.next', 'static'), {
  recursive: true,
  force: true,
});

process.env.PORT ??= '3100';
process.env.HOSTNAME ??= '127.0.0.1';

await import(pathToFileURL(join(standaloneRoot, 'server.js')).href);
