import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { SERVER_ENV_VARIABLES } from './env';

/** A wiki page from docs/wiki, which is published as the GitHub Wiki. */
function wikiPage(name: string): string {
  return readFileSync(new URL(`../../../docs/wiki/${name}.md`, import.meta.url), 'utf8');
}

describe('docs drift: web', () => {
  it('documents every web environment variable on Configuration', () => {
    const page = wikiPage('Configuration');
    expect(SERVER_ENV_VARIABLES.filter((name) => !page.includes(`\`${name}\``))).toEqual([]);
  });
});
