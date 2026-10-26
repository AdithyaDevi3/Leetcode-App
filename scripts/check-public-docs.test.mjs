import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { checkPublicDocumentation, PUBLIC_DOCUMENTATION } from './check-public-docs.mjs';

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'method-public-docs-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', ['-C', directory, ...args], { encoding: 'utf8' });
  const write = (name, content = '# Guide\n') => {
    mkdirSync(dirname(join(directory, name)), { recursive: true });
    writeFileSync(join(directory, name), content);
  };
  git('init', '--quiet');
  write('.gitignore', '.local-docs/\ndocumentation/\nAGENTS.md\n');
  for (const name of PUBLIC_DOCUMENTATION) write(name);
  git('add', '.');
  return { directory, git, write };
}

test('ignored local planning files do not enter the tracked public set', (t) => {
  const { directory, git, write } = fixture(t);
  write('.local-docs/roadmap.md', '# Private plan\n');
  write('documentation/notes.md', '# Local notes\n');
  git('add', '.');
  assert.deepEqual(checkPublicDocumentation(directory).errors, []);
});

test('forced tracked private files and unapproved guides are rejected', (t) => {
  const { directory, git, write } = fixture(t);
  const forbidden = ['.local-docs/roadmap.md', 'documentation/notes.md', 'AGENTS.md', 'docs/PRIVATE.RST', 'internal-design.pdf', 'demo.pptx'];
  for (const name of forbidden) { write(name); git('add', '--force', name); }
  const { errors } = checkPublicDocumentation(directory);
  for (const name of forbidden) assert.ok(errors.some((error) => error.includes(name)), name);
});

test('an unapproved component README cannot expand the documentation surface', (t) => {
  const { directory, git, write } = fixture(t);
  write('packages/example/README.md');
  git('add', 'packages/example/README.md');
  assert.ok(checkPublicDocumentation(directory).errors.some((error) => error.includes('packages/example/README.md')));
});

test('public links to existing but untracked private documents are rejected', (t) => {
  const { directory, write } = fixture(t);
  write('.local-docs/roadmap.md');
  write('README.md', '# Method\n[Plan](.local-docs/roadmap.md)\n');
  assert.ok(checkPublicDocumentation(directory).errors.some((error) => error.includes('not a tracked file')));
});

test('tracked directory links and real anchors pass while missing anchors fail', (t) => {
  const { directory, git, write } = fixture(t);
  write('packages/example/source.ts', 'export {};\n');
  git('add', 'packages/example/source.ts');
  write('docs/ARCHITECTURE.md', '# Architecture\n## Trust boundaries\n');
  write('README.md', '[Code](packages/example)\n[Boundary](docs/ARCHITECTURE.md#trust-boundaries)\n');
  assert.deepEqual(checkPublicDocumentation(directory).errors, []);
  write('README.md', '[Missing](docs/ARCHITECTURE.md#unknown)\n');
  assert.ok(checkPublicDocumentation(directory).errors.some((error) => error.includes('Missing section anchor')));
});

test('missing required guides and links outside the repository fail', (t) => {
  const { directory, git, write } = fixture(t);
  git('rm', '--cached', 'docs/USAGE.md');
  write('README.md', '[Outside](../private.md)\n');
  const { errors } = checkPublicDocumentation(directory);
  assert.ok(errors.some((error) => error.includes('Required public guide is missing')));
  assert.ok(errors.some((error) => error.includes('leaves the repository')));
});
