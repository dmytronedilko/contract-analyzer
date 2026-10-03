/**
 * Citations the prompts ask the model to write, e.g. `[chunk 3, p. 12]`, `[chunk 3, pp. 12–14]`,
 * `[A: chunk 2, p. 7]`, or several in one bracket: `[chunk 1, p. 2; chunk 4, pp. 5-6]`. The model
 * sometimes qualifies a citation with a short note, e.g. `[B: chunk 5, p. 2 (partial)]`.
 */
const BRACKET = /\[([^[\]]+)\](?!\()/g;
const CITATION =
  /^(?:(A|B)\s*:\s*)?chunk\s+(\d+)\s*,\s*(pp?)\.\s*(\d+)(?:\s*[–—-]\s*(\d+))?(?:\s*\([^()]{1,40}\))?$/i;

export type ContractSide = 'A' | 'B';

export interface CitationTarget {
  side?: ContractSide;
  ref: number;
}

function toSide(value: string | undefined): ContractSide | undefined {
  const upper = value?.toUpperCase();
  return upper === 'A' || upper === 'B' ? upper : undefined;
}

/** `#cite-3` or `#cite-A-2`. */
export function citationHref(target: CitationTarget): string {
  return target.side ? `#cite-${target.side}-${target.ref}` : `#cite-${target.ref}`;
}

/** The target of a `#cite-...` href, or null for any other link. */
export function parseCitationHref(href: string | undefined): CitationTarget | null {
  const match = /^#cite-(?:([AB])-)?(\d+)$/.exec(href ?? '');
  if (!match) return null;
  const side = toSide(match[1]);
  return side ? { side, ref: Number(match[2]) } : { ref: Number(match[2]) };
}

/**
 * Rewrites citations in an answer into hash links that the markdown renderer turns into source
 * chips. A bracket is rewritten only when every part separated by `;` is a citation; anything else
 * (including existing markdown links) is left untouched. In a mixed bracket, a part without a side
 * inherits the previous part's side.
 */
export function linkCitations(markdown: string): string {
  return markdown.replaceAll(BRACKET, (whole: string, inner: string) => {
    const parts = inner.split(';').map((part) => part.trim());
    const links: string[] = [];
    let side: ContractSide | undefined;
    for (const part of parts) {
      const match = CITATION.exec(part);
      if (!match) return whole;
      side = toSide(match[1]) ?? side;
      const ref = Number(match[2]);
      const label = side && !match[1] ? `${side}: ${part}` : part;
      links.push(`[${label}](${citationHref(side ? { side, ref } : { ref })})`);
    }
    return links.join('; ');
  });
}
