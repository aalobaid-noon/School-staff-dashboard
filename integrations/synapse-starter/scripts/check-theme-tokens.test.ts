import { describe, expect, it } from 'vitest';
import { appFiles, findViolations } from './check-theme-tokens.js';

// A stand-in reader so the pattern tests don't need fixture files on disk.
function reader(contents: Record<string, string>) {
  return ((file: string) =>
    contents[file] ?? '') as unknown as typeof import('node:fs').readFileSync;
}

const check = (source: string) =>
  findViolations(['client/app/pages/x.tsx'], reader({ 'client/app/pages/x.tsx': source }));

describe('findViolations', () => {
  it("accepts the app's own semantic token utilities", () => {
    const source = `
      <div className="bg-surface text-ink rounded-card p-card space-y-stack">
        <p className="text-caption text-ink-faint">hello</p>
      </div>`;
    expect(check(source)).toEqual([]);
  });

  it('flags a hardcoded hex color', () => {
    expect(check('const c = "#ff0055";')[0]?.reason).toMatch(/hex color/);
  });

  it('flags rgb()/hsl() color functions', () => {
    expect(check('background: rgba(0,0,0,0.5);')[0]?.reason).toMatch(/color function/);
  });

  it('flags a Tailwind palette class, which is how a theme quietly stops applying', () => {
    expect(check('<div className="bg-slate-700 text-red-500" />')[0]?.reason).toMatch(
      /Tailwind palette class/,
    );
  });

  it('flags an arbitrary Tailwind value', () => {
    expect(check('<div className="bg-[#fff] rounded-[3px]" />')[0]?.reason).toMatch(
      /arbitrary Tailwind value/,
    );
  });

  it('flags an inline style — the shape a visual editor is most likely to write', () => {
    expect(check('<button style={{ backgroundColor: "red" }} />')[0]?.reason).toMatch(
      /inline style/,
    );
  });

  it('does not mistake a semantic utility for a palette class', () => {
    // `bg-surface` has no numeric step; `bg-surface-500` would. This is the line being drawn.
    expect(check('<div className="bg-surface border-line ring-primary" />')).toEqual([]);
  });

  it('honours an explicit theme-tokens-ignore opt-out', () => {
    expect(check('const fallback = "#0f172a"; // theme-tokens-ignore')).toEqual([]);
  });

  it('reports the file and line so the message is actionable', () => {
    const found = check('ok\nok\nconst c = "#abc";');
    expect(found[0]?.file).toBe('client/app/pages/x.tsx');
    expect(found[0]?.line).toBe(3);
  });

  it('never exempts a whole file except theme.css itself', () => {
    const found = findViolations(
      ['client/app/theme.css', 'client/app/pages/y.tsx'],
      reader({
        'client/app/theme.css': '--color-primary: #0f172a;',
        'client/app/pages/y.tsx': 'const c = "#0f172a";',
      }),
    );
    expect(found).toHaveLength(1);
    expect(found[0]?.file).toBe('client/app/pages/y.tsx');
  });
});

describe('the shipped app', () => {
  it('is token-clean — the template must not ship a violation of its own convention', () => {
    expect(findViolations(appFiles())).toEqual([]);
  });

  it('actually scans the app surface (guards against a broken walk silently passing)', () => {
    const files = appFiles();
    expect(files).toContain('client/app/pages/home.tsx');
    expect(files).toContain('client/app/blocks/ChartBlock.tsx');
  });
});
