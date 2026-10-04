/**
 * Tags the current manifest version and pushes the tag; .github/workflows/release.yml
 * then builds the zips and publishes the GitHub Release.
 * Run: node scripts/release.mjs [--dry-run]
 */
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { version, changelogFor } from './package.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dryRun = process.argv.includes('--dry-run');
const tag = `v${version}`;

const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const fail = (msg) => {
  console.error(`Release aborted: ${msg}`);
  process.exit(1);
};

if (git('status', '--porcelain')) fail('working tree has uncommitted changes');
const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
if (branch !== 'main') fail(`on branch "${branch}", releases are cut from main`);
if (git('tag', '--list', tag)) fail(`tag ${tag} already exists; bump the version in both manifests`);
if (!changelogFor(version)) fail(`README.md has no "### ${version}" changelog entry`);

execFileSync('node', ['scripts/package.mjs'], { cwd: root, stdio: 'inherit' });

const steps = [
  ['tag', '-a', tag, '-m', tag],
  ['push', 'origin', tag],
];
for (const args of steps) {
  if (dryRun) console.log(`[dry run] git ${args.join(' ')}`);
  else execFileSync('git', args, { cwd: root, stdio: 'inherit' });
}

const remote = git('remote', 'get-url', 'origin')
  .replace(/^git@github\.com:/, 'https://github.com/')
  .replace(/\.git$/, '');
console.log(`${dryRun ? '[dry run] would push' : 'Pushed'} ${tag}. Watch the release build at ${remote}/actions`);
