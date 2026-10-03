import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { ENV_VARIABLES } from './config/env.schema.js';
import { COUNTERS, SPANS, SUMMARIES } from './observability/telemetry-names.js';

/** A wiki page from docs/wiki, which is published as the GitHub Wiki. */
function wikiPage(name: string): string {
  return readFileSync(new URL(`../../../docs/wiki/${name}.md`, import.meta.url), 'utf8');
}

/** Names must appear as inline code, so `PORT` doesn't match inside another word. */
function missingFrom(page: string, names: readonly string[]): string[] {
  return names.filter((name) => !page.includes(`\`${name}\``));
}

describe('docs drift: API', () => {
  it('documents every API environment variable on Configuration', () => {
    expect(missingFrom(wikiPage('Configuration'), ENV_VARIABLES)).toEqual([]);
  });

  it('documents every span and metric on Observability', () => {
    const names = [
      ...Object.values(SPANS),
      ...Object.values(SUMMARIES),
      ...Object.values(COUNTERS),
    ];
    expect(missingFrom(wikiPage('Observability'), names)).toEqual([]);
  });
});
