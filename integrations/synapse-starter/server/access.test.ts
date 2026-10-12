import { afterEach, describe, expect, it } from 'vitest';
import { canAccessView, ROLES, rolesFor, VIEW_ACCESS, visibleViewNames } from './access.js';

// ROLES / VIEW_ACCESS are module-level so a clone edits them as plain data. Tests mutate and
// restore them rather than reaching for a DI seam the builder would then have to understand.
function withPolicy(
  roles: (typeof ROLES)[number][],
  views: Record<string, string[]>,
  fn: () => void,
): void {
  ROLES.push(...roles);
  Object.assign(VIEW_ACCESS, views);
  try {
    fn();
  } finally {
    ROLES.length = 0;
    for (const key of Object.keys(VIEW_ACCESS)) delete VIEW_ACCESS[key];
  }
}

afterEach(() => {
  ROLES.length = 0;
  for (const key of Object.keys(VIEW_ACCESS)) delete VIEW_ACCESS[key];
});

describe('rolesFor', () => {
  it('holds no roles for an absent email', () => {
    expect(rolesFor(null)).toEqual([]);
    expect(rolesFor(undefined)).toEqual([]);
    expect(rolesFor('')).toEqual([]);
  });

  it('matches an exact address regardless of case', () => {
    withPolicy([{ role: 'ops', emails: ['Lina@noonacademy.com'] }], {}, () => {
      expect(rolesFor('lina@NOONACADEMY.com')).toEqual(['ops']);
      expect(rolesFor('other@noonacademy.com')).toEqual([]);
    });
  });

  it('matches a whole domain', () => {
    withPolicy([{ role: 'staff', domains: ['noonacademy.com'] }], {}, () => {
      expect(rolesFor('anyone@noonacademy.com')).toEqual(['staff']);
    });
  });

  it('does NOT match a domain by suffix — a lookalike domain grants nothing', () => {
    withPolicy([{ role: 'staff', domains: ['noon.edu.sa'] }], {}, () => {
      expect(rolesFor('attacker@evilnoon.edu.sa')).toEqual([]);
      expect(rolesFor('attacker@noon.edu.sa.example.com')).toEqual([]);
      expect(rolesFor('real@noon.edu.sa')).toEqual(['staff']);
    });
  });

  it('collects every role a person holds', () => {
    withPolicy(
      [
        { role: 'ops', emails: ['lina@noonacademy.com'] },
        { role: 'staff', domains: ['noonacademy.com'] },
      ],
      {},
      () => {
        expect(rolesFor('lina@noonacademy.com').sort()).toEqual(['ops', 'staff']);
      },
    );
  });
});

describe('canAccessView', () => {
  it('allows an unlisted view to every signed-in viewer (the fresh-clone default)', () => {
    expect(canAccessView('courses-by-type', 'anyone@noonacademy.com', true).allowed).toBe(true);
  });

  it('refuses a restricted view to someone without the role', () => {
    withPolicy([{ role: 'ops', emails: ['lina@noonacademy.com'] }], { payroll: ['ops'] }, () => {
      expect(canAccessView('payroll', 'lina@noonacademy.com', true).allowed).toBe(true);
      expect(canAccessView('payroll', 'someone@noonacademy.com', true).allowed).toBe(false);
      expect(canAccessView('payroll', null, true).allowed).toBe(false);
    });
  });

  it('does not enforce in the workspace, where there is no end-user session at all', () => {
    withPolicy([{ role: 'ops', emails: ['lina@noonacademy.com'] }], { payroll: ['ops'] }, () => {
      expect(canAccessView('payroll', null, false).allowed).toBe(true);
    });
  });

  it('reports which roles were required, for the server log', () => {
    withPolicy([], { payroll: ['ops', 'finance'] }, () => {
      expect(canAccessView('payroll', 'x@noonacademy.com', true).requiredRoles).toEqual([
        'ops',
        'finance',
      ]);
    });
  });

  it('is not fooled by an inherited key', () => {
    // VIEW_ACCESS is null-prototype, so '__proto__' resolves to undefined rather than an object —
    // otherwise a view called __proto__ would read as "restricted" and behave unpredictably.
    expect(canAccessView('__proto__', null, true).allowed).toBe(true);
  });
});

describe('visibleViewNames', () => {
  it('filters the list the UI draws, matching what the server would allow', () => {
    withPolicy([{ role: 'ops', emails: ['lina@noonacademy.com'] }], { payroll: ['ops'] }, () => {
      const all = ['courses-by-type', 'payroll'];
      expect(visibleViewNames(all, 'lina@noonacademy.com', true)).toEqual(all);
      expect(visibleViewNames(all, 'other@noonacademy.com', true)).toEqual(['courses-by-type']);
    });
  });
});
