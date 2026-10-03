// Turns the single-file Vite build into a page fragment for a claude.ai Artifact,
// which supplies its own doctype, <head> skeleton, charset and viewport meta.
import { readFileSync, writeFileSync } from 'node:fs';

const html = readFileSync('dist/index.html', 'utf8');
const title = html.match(/<title>[\s\S]*?<\/title>/)?.[0] ?? '';

const fragment = html
  .replace(title, '')
  .replace(/<!doctype html>/i, '')
  .replace(/<\/?(html|head|body)\b[^>]*>/gi, '')
  .replace(/<meta\s+(charset|name="viewport")[^>]*>/gi, '')
  .trim();

// The title goes first: the Artifact viewer only scans the first 8 KB for it.
writeFileSync('dist/artifact.html', `${title}\n${fragment}\n`);
console.log(`dist/artifact.html written (${(fragment.length / 1024).toFixed(1)} KB)`);
