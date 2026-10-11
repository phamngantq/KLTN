// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const tokens = readFileSync('src/client/styles/tokens.css', 'utf8');

// Semantic tokens components rely on (DESIGN_RULES.md §C1). Values are provisional (DEC-001).
const REQUIRED = [
  '--color-bg',
  '--color-surface',
  '--color-fg',
  '--color-muted',
  '--color-primary',
  '--color-on-primary',
  '--color-border',
  '--color-danger',
  '--color-success',
  '--color-focus',
  '--radius-md',
  '--space-4',
  '--control-min-height',
];

describe('design tokens', () => {
  it('defines every required semantic token', () => {
    const defined = new Set([...tokens.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
    for (const name of REQUIRED) expect(defined).toContain(name);
  });

  it('is clearly marked as provisional until the Figma audit', () => {
    expect(tokens).toMatch(/PROVISIONAL/);
  });
});
