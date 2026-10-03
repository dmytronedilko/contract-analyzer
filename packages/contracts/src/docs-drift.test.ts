import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { AUDIT_ACTIONS } from './audit.js';
import { NOT_FOUND_COMPARE, NOT_FOUND_SINGLE } from './constants.js';
import { ERROR_CODES } from './errors.js';
import { PERMISSIONS } from './permissions.js';

/** A wiki page from docs/wiki, which is published as the GitHub Wiki. */
function wikiPage(name: string): string {
  return readFileSync(new URL(`../../../docs/wiki/${name}.md`, import.meta.url), 'utf8');
}

/** Names must appear as inline code, so a name doesn't match inside another one. */
function missingFrom(page: string, names: readonly string[]): string[] {
  return names.filter((name) => !page.includes(`\`${name}\``));
}

describe('docs drift: contracts', () => {
  it('documents every error code on API-Reference', () => {
    expect(missingFrom(wikiPage('API-Reference'), Object.values(ERROR_CODES))).toEqual([]);
  });

  it('quotes both NOT_FOUND sentences verbatim on Prompt-Design', () => {
    const page = wikiPage('Prompt-Design');
    expect(page).toContain(NOT_FOUND_SINGLE);
    expect(page).toContain(NOT_FOUND_COMPARE);
  });

  it('documents every permission and audit action on Authentication-and-Authorization', () => {
    const page = wikiPage('Authentication-and-Authorization');
    expect(missingFrom(page, PERMISSIONS)).toEqual([]);
    expect(missingFrom(page, AUDIT_ACTIONS)).toEqual([]);
  });
});
