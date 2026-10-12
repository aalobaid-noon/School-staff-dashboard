// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ViewsTab } from './ViewsTab';

const VIEWS = [
  { name: 'a', title: 'View A', description: 'first view' },
  { name: 'b', title: 'View B', description: 'second view' },
];

function readResult(name: string) {
  return {
    name,
    title: `Result for ${name}`,
    description: 'a view',
    sql: 'SELECT 1',
    registryVersion: 'v1',
    skillVersion: 's1',
    columns: ['col'],
    rows: [{ col: 1 }],
    truncated: false,
    dataAsOf: null,
    cached: false,
    configured: true,
    error: null,
  };
}

function payload(url: string): unknown {
  if (url.endsWith('/__synapse/reads')) return VIEWS;
  if (url.includes('/__synapse/reads/')) return readResult(url.split('/').pop() ?? '');
  return {};
}

describe('<ViewsTab />', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => ({
        ok: true,
        headers: { get: () => 'application/json' },
        json: async () => payload(url),
      })),
    );
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('lists every baked view and drills into the one you pick', async () => {
    render(<ViewsTab onNavigate={vi.fn()} />);

    // Both views appear in the picker (driven by the /reads LIST endpoint).
    expect(await screen.findByText('View A')).toBeTruthy();
    expect(screen.getByText('View B')).toBeTruthy();

    // The first view's detail renders by default.
    expect(await screen.findByText('Result for a')).toBeTruthy();

    // Picking another view drills into it.
    fireEvent.click(screen.getByText('View B'));
    expect(await screen.findByText('Result for b')).toBeTruthy();
  });
});
