// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventsTab } from './EventsTab';

const EVENTS = [
  {
    at: '2026-06-29T12:00:00.000Z',
    type: 'app_booted',
    status: 'accepted',
    eventId: 7,
    error: null,
    attempts: 1,
  },
  {
    at: '2026-06-29T12:00:00.000Z',
    type: 'task.created',
    status: 'failed_permanent',
    eventId: null,
    error: 'rejected',
    attempts: 2,
  },
];

const CATALOG = { total: 3, groups: [{ namespace: 'core', eventTypes: ['app_booted'] }] };

function payload(url: string): unknown {
  if (url.endsWith('/__synapse/events')) return EVENTS;
  if (url.endsWith('/__synapse/catalog')) return CATALOG;
  return {};
}

describe('<EventsTab />', () => {
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

  it('shows sent events in plain words', async () => {
    render(<EventsTab />);

    expect(await screen.findByText('Delivered')).toBeTruthy();
    expect(screen.getByText("Couldn't deliver")).toBeTruthy();
  });

  it('points to the agent for new event types instead of dead-ending', async () => {
    render(<EventsTab />);

    // The copy hands new event types to the Replit agent…
    expect(await screen.findByText(/ask the Replit agent to build the feature/i)).toBeTruthy();

    // …and the old "Noon-side step / self-service is coming" dead-end is gone.
    expect(screen.queryByText(/self-service is coming/i)).toBeNull();
    expect(screen.queryByText(/Noon-side step/i)).toBeNull();
  });
});
