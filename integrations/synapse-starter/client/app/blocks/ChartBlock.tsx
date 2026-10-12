import { useEffect, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { relativeTime } from '../../format';
import { useView, type ViewData } from '../../useView';
import { AppCard, AppEmptyState, DataTable } from '../ui';

// A registered view (baked read) rendered as a chart — ViewBlock's sibling for when a shape is
// easier to read than a table. Same data-in primitive (useView), same three states, same rule
// that ALL styling comes from theme.css tokens.
//
// Why this exists rather than "let the agent write Recharts directly": charts are where an app
// stops looking like one app. Left free, each page picks its own palette, its own axis
// formatting, its own idea of what an empty result looks like. Binding the chart to the theme
// here makes consistency structural instead of a thing someone has to remember.
//
// Recipes, chart-type choice, and the accessibility rules: the synapse-chart skill.

export type ChartType = 'bar' | 'stacked-bar' | 'line' | 'area' | 'donut';

const SERIES_TOKENS = [
  '--color-chart-1',
  '--color-chart-2',
  '--color-chart-3',
  '--color-chart-4',
  '--color-chart-5',
  '--color-chart-6',
];

// Fallbacks used only until the CSS variables resolve (and in jsdom, where they don't). They
// match the shipped "calm" preset so a test render isn't visually meaningless.
//
// These are the ONE place in client/app that may hold raw color values, because Recharts writes
// colors into SVG attributes and cannot accept a class — so there has to be something to fall
// back to when getComputedStyle has nothing yet. Each line carries `theme-tokens-ignore` so
// scripts/check-theme-tokens.ts allows it and the exception stays visible in review. Do NOT copy
// this pattern into a page: pages use token utilities.
const FALLBACK_SERIES = ['#4f46e5', '#d97706', '#0d9488', '#be185d', '#0369a1', '#65a30d']; // theme-tokens-ignore

interface Palette {
  series: string[];
  ink: string;
  inkMuted: string;
  line: string;
  card: string;
}

const FALLBACK_PALETTE: Palette = {
  series: FALLBACK_SERIES,
  ink: '#0f172a', // theme-tokens-ignore
  inkMuted: '#64748b', // theme-tokens-ignore
  line: '#e2e8f0', // theme-tokens-ignore
  card: '#ffffff', // theme-tokens-ignore
};

// Recharts needs real color VALUES (it writes them into SVG fill/stroke), not Tailwind classes.
// Reading them back off the document keeps client/app/theme.css the single source of truth: change
// a token there and every chart follows, exactly like every other app component.
function readPalette(): Palette {
  if (typeof window === 'undefined' || typeof document === 'undefined') return FALLBACK_PALETTE;
  const styles = window.getComputedStyle(document.documentElement);
  const read = (token: string, fallback: string): string => {
    const value = styles.getPropertyValue(token).trim();
    return value === '' ? fallback : value;
  };
  return {
    series: SERIES_TOKENS.map((token, i) => read(token, FALLBACK_SERIES[i] ?? '#4f46e5')), // theme-tokens-ignore
    ink: read('--color-ink', FALLBACK_PALETTE.ink),
    inkMuted: read('--color-ink-muted', FALLBACK_PALETTE.inkMuted),
    line: read('--color-line', FALLBACK_PALETTE.line),
    card: read('--color-card', FALLBACK_PALETTE.card),
  };
}

function usePalette(): Palette {
  const [palette, setPalette] = useState<Palette>(FALLBACK_PALETTE);
  // After mount, when the stylesheet has actually applied.
  useEffect(() => setPalette(readPalette()), []);
  return palette;
}

function isRtl(): boolean {
  if (typeof document === 'undefined') return false;
  return document.documentElement.dir === 'rtl';
}

// Axis labels get compacted (12.4k), tooltips get the exact figure. A reader scanning an axis
// wants magnitude; a reader who hovered wants the number.
function compactNumber(value: number): string {
  return new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(
    value,
  );
}

function exactNumber(value: unknown): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return String(value ?? '—');
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  // Athena hands back BIGINT/DECIMAL as strings often enough that silently dropping them would
  // produce an empty chart over a perfectly good read.
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export interface ChartBlockProps {
  /** Name of a baked read, as registered in server/queries/index.ts. */
  name: string;
  type: ChartType;
  /** Column holding the category or time bucket (the x axis / the pie's slices). */
  x: string;
  /** Numeric column(s) to plot. Several columns = several series. */
  y: string | string[];
  /** Overrides the read's own title. Prefer leaving it — the read's title is already reviewed. */
  title?: string;
  height?: number;
  /**
   * Renders the underlying rows as a table beneath the chart. Default true: a chart alone is
   * unreadable to a screen-reader user and un-checkable by a builder who wants the actual figure.
   */
  showTable?: boolean;
}

export function ChartBlock(props: ChartBlockProps) {
  const state = useView(props.name);

  return (
    <AppCard>
      {state.status === 'loading' && <p className="text-body text-ink-muted">Loading…</p>}
      {state.status === 'error' && (
        <AppEmptyState>This chart isn't available right now.</AppEmptyState>
      )}
      {state.status === 'ready' && <ChartBlockBody view={state.data} {...props} />}
    </AppCard>
  );
}

function ChartBlockBody({
  view,
  type,
  x,
  y,
  title,
  height = 280,
  showTable = true,
}: ChartBlockProps & { view: ViewData }) {
  const palette = usePalette();
  const series = Array.isArray(y) ? y : [y];
  const rtl = isRtl();

  // Coerce once: every series column to a real number, rows missing the category dropped. A row
  // whose measure won't parse becomes 0 rather than breaking the axis scale.
  const data = view.rows
    .filter((row) => row[x] !== null && row[x] !== undefined)
    .map((row) => {
      const point: Record<string, unknown> = { [x]: String(row[x]) };
      for (const key of series) point[key] = toNumber(row[key]) ?? 0;
      return point;
    });

  // Distinguish the reasons there's nothing to draw — "we can't reach the data" and "there
  // genuinely wasn't any this week" call for different reactions from the builder.
  if (!view.configured) {
    return (
      <ChartFrame view={view} title={title}>
        <AppEmptyState>This chart isn't connected to Noon data yet.</AppEmptyState>
      </ChartFrame>
    );
  }
  if (view.error !== null) {
    return (
      <ChartFrame view={view} title={title}>
        <AppEmptyState>This chart couldn't load just now. Try again in a moment.</AppEmptyState>
      </ChartFrame>
    );
  }
  if (data.length === 0) {
    return (
      <ChartFrame view={view} title={title}>
        <AppEmptyState>No data for this period yet.</AppEmptyState>
      </ChartFrame>
    );
  }
  // A missing column is an authoring mistake (renamed column, typo), not an empty result. Say
  // which column, so the fix is obvious instead of a blank card to debug.
  const missing = [x, ...series].filter((col) => !view.columns.includes(col));
  if (missing.length > 0) {
    return (
      <ChartFrame view={view} title={title}>
        <AppEmptyState>
          This chart is set up to show {missing.join(', ')}, which this data doesn't have.
        </AppEmptyState>
      </ChartFrame>
    );
  }

  const axis = { stroke: palette.inkMuted, fontSize: 12 };
  const tooltip = {
    contentStyle: {
      background: palette.card,
      border: `1px solid ${palette.line}`,
      borderRadius: 8,
      color: palette.ink,
      fontSize: 12,
    },
    formatter: (value: unknown) => exactNumber(value),
  };
  const grid = <CartesianGrid stroke={palette.line} strokeDasharray="3 3" vertical={false} />;
  // RTL charts read right-to-left: the earliest category belongs on the right.
  const xAxis = (
    <XAxis
      dataKey={x}
      reversed={rtl}
      tick={axis}
      tickLine={false}
      axisLine={{ stroke: palette.line }}
    />
  );
  const yAxis = (
    <YAxis
      orientation={rtl ? 'right' : 'left'}
      tick={axis}
      tickLine={false}
      axisLine={false}
      tickFormatter={compactNumber}
      width={48}
    />
  );
  // Recharts' Legend exposes no className, so wrapperStyle is the only way to size it.
  const legend = series.length > 1 ? <Legend wrapperStyle={{ fontSize: 12 }} /> : null; // theme-tokens-ignore
  const color = (i: number) => palette.series[i % palette.series.length] ?? FALLBACK_SERIES[0];

  return (
    <ChartFrame view={view} title={title}>
      {/* aria-hidden: the SVG is decorative because the same rows are published as a real table
          below. A screen-reader user gets the data, not a shrug. */}
      <div aria-hidden="true">
        <ResponsiveContainer width="100%" height={height}>
          {type === 'line' ? (
            <LineChart data={data}>
              {grid}
              {xAxis}
              {yAxis}
              <Tooltip {...tooltip} />
              {legend}
              {series.map((key, i) => (
                <Line
                  key={key}
                  type="monotone"
                  dataKey={key}
                  stroke={color(i)}
                  strokeWidth={2}
                  dot={false}
                />
              ))}
            </LineChart>
          ) : type === 'area' ? (
            <AreaChart data={data}>
              {grid}
              {xAxis}
              {yAxis}
              <Tooltip {...tooltip} />
              {legend}
              {series.map((key, i) => (
                <Area
                  key={key}
                  type="monotone"
                  dataKey={key}
                  stroke={color(i)}
                  fill={color(i)}
                  fillOpacity={0.15}
                  strokeWidth={2}
                />
              ))}
            </AreaChart>
          ) : type === 'donut' ? (
            <PieChart>
              <Tooltip {...tooltip} />
              <Pie
                data={data}
                dataKey={series[0] ?? ''}
                nameKey={x}
                innerRadius="55%"
                outerRadius="80%"
                paddingAngle={2}
              >
                {data.map((row, i) => (
                  <Cell key={String(row[x])} fill={color(i)} />
                ))}
              </Pie>
              <Legend wrapperStyle={{ fontSize: 12 }} /> {/* theme-tokens-ignore */}
            </PieChart>
          ) : (
            <BarChart data={data}>
              {grid}
              {xAxis}
              {yAxis}
              <Tooltip {...tooltip} cursor={{ fill: palette.line, fillOpacity: 0.35 }} />
              {legend}
              {series.map((key, i) => (
                <Bar
                  key={key}
                  dataKey={key}
                  fill={color(i)}
                  radius={[4, 4, 0, 0]}
                  stackId={type === 'stacked-bar' ? 'stack' : undefined}
                />
              ))}
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>

      {showTable && (
        <details className="mt-3">
          <summary className="cursor-pointer text-caption text-ink-muted">Show the numbers</summary>
          <div className="mt-2">
            <DataTable columns={view.columns} rows={view.rows} />
          </div>
        </details>
      )}
    </ChartFrame>
  );
}

// Heading, description and freshness — identical to ViewBlock's, because a chart is a view and
// should carry the same provenance. An unlabelled chart implies live data; this one never does.
function ChartFrame({
  view,
  title,
  children,
}: {
  view: ViewData;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <h3 className="text-body font-semibold text-ink">{title ?? view.title}</h3>
      <p className="text-body text-ink-muted">{view.description}</p>
      {view.configured && view.dataAsOf !== null && (
        <p className="mt-1 text-caption text-ink-faint">Updated {relativeTime(view.dataAsOf)}</p>
      )}
      <div className="mt-4">{children}</div>
    </div>
  );
}
