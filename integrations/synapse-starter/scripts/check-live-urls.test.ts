import { describe, expect, it } from 'vitest';
import { checkLocal, extractRawUrls, knowledgeFiles, RAW_PREFIX } from './check-live-urls.js';

describe('extractRawUrls', () => {
  it('finds bare URLs and stops at whitespace', () => {
    const text = `> Fetch ${RAW_PREFIX}skill/SKILL.md\n> and follow that version.`;
    expect(extractRawUrls(text)).toEqual([`${RAW_PREFIX}skill/SKILL.md`]);
  });

  it('stops at markdown-link and quote closers', () => {
    const text = `see (${RAW_PREFIX}AGENTS.md) and "${RAW_PREFIX}replit.md" plus [x](${RAW_PREFIX}UPGRADE.md)`;
    expect(extractRawUrls(text)).toEqual([
      `${RAW_PREFIX}AGENTS.md`,
      `${RAW_PREFIX}replit.md`,
      `${RAW_PREFIX}UPGRADE.md`,
    ]);
  });

  it('returns empty for text without raw URLs', () => {
    expect(extractRawUrls('no urls here, not even https://example.com/AGENTS.md')).toEqual([]);
  });
});

describe('checkLocal', () => {
  const exists = (path: string) => path === 'skill/SKILL.md';

  it('passes a trusted URL whose path exists', () => {
    const map = new Map([['skill/SKILL.md', [`${RAW_PREFIX}skill/SKILL.md`]]]);
    expect(checkLocal(map, exists)).toEqual([]);
  });

  it('passes a bare prefix mention (trust-note prose, not a fetch target)', () => {
    const map = new Map([['AGENTS.md', [RAW_PREFIX]]]);
    expect(checkLocal(map, exists)).toEqual([]);
  });

  it('stops matching at < so placeholder prose is not a URL segment', () => {
    expect(extractRawUrls(`fetch \`${RAW_PREFIX}<its path>\` live`)).toEqual([RAW_PREFIX]);
  });

  it('fails a URL whose local path is missing (the renamed-skill failure mode)', () => {
    const map = new Map([['AGENTS.md', [`${RAW_PREFIX}.agents/skills/old-name/SKILL.md`]]]);
    const problems = checkLocal(map, exists);
    expect(problems).toHaveLength(1);
    expect(problems[0]?.problem).toContain('no local file');
  });

  it('fails a URL outside the trusted prefix', () => {
    const map = new Map([
      ['AGENTS.md', ['https://raw.githubusercontent.com/evil/repo/main/AGENTS.md']],
    ]);
    const problems = checkLocal(map, exists);
    expect(problems).toHaveLength(1);
    expect(problems[0]?.problem).toContain('unexpected prefix');
  });
});

describe('knowledgeFiles', () => {
  it('covers the bootstrap, the rulebook, and every skill', () => {
    const files = knowledgeFiles();
    expect(files).toContain('replit.md');
    expect(files).toContain('AGENTS.md');
    expect(files).toContain('skill/SKILL.md');
    // The template ships eleven skills under .agents/skills (plus skill/SKILL.md, asserted
    // above); a working tree may add untracked local ones on top, so this is a floor.
    expect(files.filter((f) => f.startsWith('.agents/skills/')).length).toBeGreaterThanOrEqual(11);
  });
});
