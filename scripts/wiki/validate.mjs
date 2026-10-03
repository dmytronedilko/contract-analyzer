#!/usr/bin/env node
// Validates docs/wiki, the source of the GitHub Wiki, before it is published.
// Plain Node, no dependencies: `node scripts/wiki/validate.mjs`. Exits non-zero on any problem.
//
// Checks:
// - page file names are unique (case-insensitively) and use only [A-Za-z0-9-] (plus _Sidebar);
//   the only subdirectory is images/; _Footer.md is generated at publish time, never committed;
// - Home exists, and every page is listed in _Sidebar;
// - internal links point to existing pages and existing heading anchors, never to *.md files;
// - images exist;
// - the only {{...}} placeholder is {{repo}}.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const WIKI = fileURLToPath(new URL('../../docs/wiki/', import.meta.url));
const SPECIAL_PAGES = new Set(['_Sidebar']);
const problems = [];
const problem = (file, message) => problems.push(`${file}: ${message}`);

// Page inventory -----------------------------------------------------------------------------

const pages = new Map(); // page name -> markdown
const seen = new Map(); // lower-case name -> original
for (const entry of readdirSync(WIKI)) {
  const path = join(WIKI, entry);
  if (statSync(path).isDirectory()) {
    if (entry !== 'images') problem(entry, 'only an images/ subdirectory is allowed');
    continue;
  }
  if (!entry.endsWith('.md')) {
    problem(entry, 'only Markdown pages belong here; put images in images/');
    continue;
  }
  const name = entry.slice(0, -'.md'.length);
  if (name === '_Footer') {
    problem(entry, '_Footer is generated when publishing; do not commit it');
    continue;
  }
  if (!SPECIAL_PAGES.has(name) && !/^[A-Za-z0-9-]+$/.test(name)) {
    problem(entry, 'page names may only contain A-Z, a-z, 0-9 and -');
  }
  const key = name.toLowerCase();
  if (seen.has(key)) problem(entry, `page name clashes with ${seen.get(key)}.md`);
  seen.set(key, name);
  pages.set(name, readFileSync(path, 'utf8'));
}

if (!pages.has('Home')) problem('Home.md', 'the wiki needs a Home page');
if (!pages.has('_Sidebar')) problem('_Sidebar.md', 'the wiki needs a _Sidebar');

// Markdown helpers ---------------------------------------------------------------------------

/** The page's text outside fenced code blocks, line by line (code lines become empty). */
function proseLines(markdown) {
  let fence = null;
  return markdown.split('\n').map((line) => {
    const marker = /^\s*(`{3,}|~{3,})/.exec(line)?.[1];
    if (fence) {
      if (marker && marker[0] === fence[0] && marker.length >= fence.length) fence = null;
      return '';
    }
    if (marker) {
      fence = marker;
      return '';
    }
    return line;
  });
}

/** Removes inline code spans, whose content is literal. */
const withoutInlineCode = (line) => line.replaceAll(/(`+)[^`]*?\1/g, '');

/** GitHub's heading anchors (github-slugger), with -1, -2... for repeated headings. */
function anchorsOf(markdown) {
  const anchors = new Set();
  const counts = new Map();
  for (const line of proseLines(markdown)) {
    const heading = /^#{1,6}\s+(.+?)\s*#*\s*$/.exec(line)?.[1];
    if (!heading) continue;
    const text = heading
      .replaceAll(/!?\[([^\]]*)\]\([^)]*\)/g, '$1') // links and images keep their text
      .replaceAll(/<[^>]+>/g, '') // inline HTML
      .replaceAll(/[*_`~]/g, (char) => (char === '_' ? '_' : ''));
    const base = text
      .toLowerCase()
      .replaceAll(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, '')
      .replaceAll(' ', '-');
    const count = counts.get(base) ?? 0;
    counts.set(base, count + 1);
    anchors.add(count === 0 ? base : `${base}-${count}`);
  }
  return anchors;
}

const anchors = new Map([...pages].map(([name, markdown]) => [name, anchorsOf(markdown)]));

/** Inline links and images: [text](target) and ![alt](target), outside code. */
function linksOf(markdown) {
  const links = [];
  proseLines(markdown).forEach((line, index) => {
    for (const match of withoutInlineCode(line).matchAll(
      /(!?)\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g,
    )) {
      links.push({ image: match[1] === '!', target: match[2], line: index + 1 });
    }
  });
  return links;
}

// Checks -------------------------------------------------------------------------------------

const EXTERNAL = /^(https?:|mailto:|tel:|\{\{repo\}\})/i;

for (const [name, markdown] of pages) {
  const file = `${name}.md`;

  for (const placeholder of markdown.matchAll(/\{\{\s*([^}]*?)\s*\}\}/g)) {
    if (placeholder[1] !== 'repo') problem(file, `unknown placeholder {{${placeholder[1]}}}`);
  }

  for (const { image, target, line } of linksOf(markdown)) {
    const where = `${file}:${line}`;
    if (EXTERNAL.test(target)) continue;
    if (image) {
      if (!target.startsWith('images/') || !existsSync(join(WIKI, target))) {
        problems.push(`${where}: image ${target} not found in docs/wiki/images/`);
      }
      continue;
    }
    const [path, anchor] = target.split('#', 2);
    if (/\.md$/i.test(path)) {
      problems.push(`${where}: link to ${target}: link pages by name, without .md`);
      continue;
    }
    const page = path === '' ? name : decodeURIComponent(path);
    if (!pages.has(page)) {
      problems.push(`${where}: link to missing page ${page}`);
      continue;
    }
    if (anchor !== undefined && !anchors.get(page).has(decodeURIComponent(anchor).toLowerCase())) {
      problems.push(`${where}: no heading for #${anchor} on ${page}`);
    }
  }
}

const sidebar = pages.get('_Sidebar') ?? '';
const listed = new Set(linksOf(sidebar).map(({ target }) => target.split('#')[0]));
for (const name of pages.keys()) {
  if (!SPECIAL_PAGES.has(name) && !listed.has(name)) {
    problem('_Sidebar.md', `page ${name} is not listed`);
  }
}

// Report -------------------------------------------------------------------------------------

const where = relative(process.cwd(), WIKI) || '.';
if (problems.length) {
  console.error(`docs/wiki has ${problems.length} problem(s):`);
  for (const message of problems) console.error(`  - ${message}`);
  process.exitCode = 1;
} else {
  console.log(`${where}: ${pages.size} pages OK`);
}
