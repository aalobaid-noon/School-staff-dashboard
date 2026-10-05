// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChartBlock } from './ChartBlock';

// jsdom has no layout, so Recharts' ResponsiveContainer renders at 0×0 and draws nothing. These
// tests therefore assert what actually matters and IS observable here: that the block explains
// itself correctly in each state, and that the rows stay available as text. The chart's visual
// correctness is a job for `npm run visual` (the synapse-visual-check skill), not jsdom.

function viewPayload(over: Record<string, unknown> = {}) {
  return {
    name: 'courses-by-type',
    title: 'Active courses by type',
    description: 'How many non-deleted courses exist of each type.',
    columns: ['course_type', 'course_count'],
    rows: [
      { course_type: 'O2O', course_count: 610 },
      { course_type: 'SCHOOL', course_count: 200 },
    ],
    truncated: false,
    dataAsOf: null,
    configured: true,
    error: null,
    ...over,
  };
}

function stubFetch(payload: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => payload,
    })),
  );
}

describe('<ChartBlock />', () => {
  beforeEach(() => {
    stubFetch(viewPayload());
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('carries the reads own title and description, so a chart states its provenance', async () => {
    render(<ChartBlock name="courses-by-type" type="bar" x="course_type" y="course_count" />);
    expect(await screen.findByText('Active courses by type')).toBeTruthy();
    expect(screen.getByText(/non-deleted courses/)).toBeTruthy();
  });

  it('keeps the underlying rows available as a table for readers a chart excludes', async () => {
    render(<ChartBlock name="courses-by-type" type="bar" x="course_type" y="course_count" />);
    expect(await screen.findByText('Show the numbers')).toBeTruthy();
    expect(screen.getByText('610')).toBeTruthy();
  });

  it('can suppress the table when a page already shows the figures elsewhere', async () => {
    render(
      <ChartBlock
        name="courses-by-type"
        type="bar"
        x="course_type"
        y="course_count"
        showTable={false}
      />,
    );
    await screen.findByText('Active courses by type');
    expect(screen.queryByText('Show the numbers')).toBeNull();
  });

  it('says a genuinely empty period is empty, not broken', async () => {
    stubFetch(viewPayload({ rows: [] }));
    render(<ChartBlock name="courses-by-type" type="bar" x="course_type" y="course_count" />);
    expect(await screen.findByText(/No data for this period yet/)).toBeTruthy();
  });

  it('distinguishes "not connected" from "empty"', async () => {
    stubFetch(viewPayload({ rows: [], configured: false }));
    render(<ChartBlock name="courses-by-type" type="bar" x="course_type" y="course_count" />);
    expect(await screen.findByText(/isn't connected to Noon data yet/)).toBeTruthy();
  });

  it('distinguishes a failed read from an empty one', async () => {
    stubFetch(viewPayload({ rows: [], error: 'SYNTAX_ERROR' }));
    render(<ChartBlock name="courses-by-type" type="bar" x="course_type" y="course_count" />);
    expect(await screen.findByText(/couldn't load just now/)).toBeTruthy();
  });

  it('names a mis-wired column instead of rendering a blank card', async () => {
    render(<ChartBlock name="courses-by-type" type="bar" x="course_type" y="enrolments" />);
    expect(await screen.findByText(/enrolments, which this data doesn't have/)).toBeTruthy();
  });
});
