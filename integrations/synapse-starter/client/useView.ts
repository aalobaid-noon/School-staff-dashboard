import { type LoadState, useJson } from './useJson';

// Mirrors server/reads.ts ReadResult (served by the public /api/views/:name).
export interface ViewData {
  name: string;
  title: string;
  description: string;
  columns: string[];
  rows: Record<string, unknown>[];
  truncated: boolean;
  dataAsOf: string | null;
  configured: boolean;
  error: string | null;
}

// The data-IN primitive. Loads a baked view's rows so you can render them ANY way you like — a
// table, a chart, a leaderboard, a game board. `ViewBlock` is the ready-made table built on top of
// this; reach for the hook directly whenever you want your own UI. Returns the same loading / error
// / ready shape as the rest of the app (see useJson).
export function useView(name: string): LoadState<ViewData> {
  return useJson<ViewData>(`/api/views/${name}`);
}
