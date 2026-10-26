#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PUBLIC_DOCUMENTATION = Object.freeze([
  'README.md',
  'CONTRIBUTING.md',
  'SECURITY.md',
  'docs/USAGE.md',
  'docs/ARCHITECTURE.md',
  'docs/CONVENTIONS.md',
  'docs/PERSONAL_USE.md',
  '.github/PULL_REQUEST_TEMPLATE.md',
  '.github/ISSUE_TEMPLATE/bug_report.md',
  '.github/ISSUE_TEMPLATE/feature_request.md',
]);

const approved = new Set(PUBLIC_DOCUMENTATION);
const privateDirectories = new Set([
  '.local-docs', 'documentation', 'plans', 'prompts', 'skills',
  '.agents', '.codex', '.claude', '.codex-ppt-build', 'artifacts',
]);
const isDocumentation = (name) => /\.(md|mdx|markdown|rst|adoc|pdf|docx?|pptx?|odt|odp|rtf|tex)$/i.test(name);

function headingAnchors(content) {
  const anchors = new Set();
  const counts = new Map();
  let fence = null;
  for (const line of content.split('\n')) {
    const marker = line.match(/^\s*(`{3,}|~{3,})/)?.[1];
    if (marker) {
      if (!fence) fence = marker[0];
      else if (marker[0] === fence) fence = null;
      continue;
    }
    if (fence) continue;
    const title = line.match(/^#{1,6}\s+(.+?)(?:\s+#+)?\s*$/)?.[1];
    if (!title) continue;
    const slug = title.toLowerCase().replace(/[^\p{L}\p{N}_\-\s]/gu, '').replace(/\s/g, '-');
    const count = counts.get(slug) ?? 0;
    anchors.add(count ? `${slug}-${count}` : slug);
    counts.set(slug, count + 1);
  }
  return anchors;
}

export function checkPublicDocumentation(repository = process.cwd()) {
  const files = execFileSync('git', ['ls-files', '-z'], { cwd: repository, encoding: 'utf8' })
    .split('\0').filter(Boolean);
  const tracked = new Set(files);
  const errors = [];
  for (const name of files) {
    const root = name.split('/')[0].toLowerCase();
    const basename = posix.basename(name).toLowerCase();
    if (privateDirectories.has(root) || /^(agents?|claude|skill)\.md$/.test(basename)) {
      errors.push(`Local-only material is tracked: ${name}`);
    } else if ((isDocumentation(name) || name.startsWith('docs/')) && !approved.has(name)) {
      errors.push(`Documentation is outside the public allowlist: ${name}`);
    }
  }

  const documents = PUBLIC_DOCUMENTATION.filter((name) => tracked.has(name));
  for (const name of PUBLIC_DOCUMENTATION.filter((name) => !name.startsWith('.github/'))) {
    if (!tracked.has(name)) errors.push(`Required public guide is missing: ${name}`);
  }

  for (const name of documents) {
    let content;
    try { content = readFileSync(resolve(repository, name), 'utf8'); }
    catch { errors.push(`Tracked public guide is missing from the working tree: ${name}`); continue; }
    for (const match of content.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
      const target = match[1].replace(/^<|>$/g, '');
      if (/^[a-z][a-z\d+.-]*:/i.test(target) || target.startsWith('//')) continue;
      const [rawPath, fragment] = target.split('#');
      let destination;
      try {
        destination = rawPath ? posix.normalize(posix.join(posix.dirname(name), decodeURIComponent(rawPath))) : name;
      } catch { errors.push(`Invalid local link in ${name}: ${target}`); continue; }
      if (destination === '..' || destination.startsWith('../') || posix.isAbsolute(destination)) {
        errors.push(`Local link leaves the repository in ${name}: ${target}`);
      } else if (!tracked.has(destination) && !files.some((file) => file.startsWith(`${destination}/`))) {
        errors.push(`Local link is not a tracked file or directory in ${name}: ${target}`);
      } else if (fragment && isDocumentation(destination) && tracked.has(destination)) {
        try {
          const anchors = headingAnchors(readFileSync(resolve(repository, destination), 'utf8'));
          if (!anchors.has(decodeURIComponent(fragment))) errors.push(`Missing section anchor in ${name}: ${target}`);
        } catch { errors.push(`Cannot read local link target in ${name}: ${target}`); }
      }
    }
  }
  return { documents, errors };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = checkPublicDocumentation();
    if (result.errors.length) {
      process.stderr.write(`${result.errors.join('\n')}\n`);
      process.exitCode = 1;
    } else {
      process.stdout.write(`Public documentation boundary and local links passed (${result.documents.length} approved files).\n`);
    }
  } catch (error) {
    process.stderr.write(`Unable to check public documentation: ${error.message}\n`);
    process.exitCode = 1;
  }
}
