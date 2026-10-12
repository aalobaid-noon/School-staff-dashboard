import { type ComponentProps, type ReactNode, useState } from 'react';

// Shared visual-system primitives for the builder console. One calm surface: white + slate,
// a single indigo accent for "act here", small status pills instead of big tinted panels.
//
// ANTI-OVERFLOW RULE (read before adding scrollable content):
// CSS grid/flex items default to `min-width: auto`, so a wide child (a long <pre>, a wide
// table) refuses to shrink and blows the track past its container — that was the right-edge
// overflow bug. So: any grid/flex item that can hold long/scrollable content carries `min-w-0`;
// pair `1fr` tracks with `minmax(0,1fr)`; and every horizontally-scrollable <pre>/table wrapper
// is itself `min-w-0 overflow-x-auto`. CopyBox below bakes this in so callers can't regress.

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

export function SectionHeading({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="space-y-1">
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      {children && <p className="text-sm leading-relaxed text-slate-500">{children}</p>}
    </div>
  );
}

// Primary action. Always type="button" — the console has no native form submission.
export function Button({ className = '', ...props }: Omit<ComponentProps<'button'>, 'type'>) {
  return (
    <button
      type="button"
      className={`rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40 disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
      {...props}
    />
  );
}

type PillTone = 'good' | 'warn' | 'error' | 'neutral';
const PILL_TONES: Record<PillTone, string> = {
  good: 'bg-emerald-50 text-emerald-700',
  warn: 'bg-amber-50 text-amber-700',
  error: 'bg-rose-50 text-rose-700',
  neutral: 'bg-slate-100 text-slate-600',
};

export function Pill({
  tone = 'neutral',
  children,
  title,
}: {
  tone?: PillTone;
  children: ReactNode;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ${PILL_TONES[tone]}`}
    >
      {children}
    </span>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 px-4 py-10 text-center text-sm text-slate-500">
      {children}
    </div>
  );
}

// The standard "peek inside" / "show details" affordance — keeps jargon (SQL, columns,
// version strings) out of the calm default view but one click away.
export function Disclosure({ summary, children }: { summary: string; children: ReactNode }) {
  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-700 [&::-webkit-details-marker]:hidden">
        <span className="transition-transform group-open:rotate-90" aria-hidden>
          ›
        </span>
        {summary}
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}

// A copyable text block with one-tap copy. `wrap` keeps prose readable; otherwise long lines
// scroll horizontally INSIDE the box (never widening the page — see the anti-overflow rule).
export function CopyBox({ text, wrap = false }: { text: string; wrap?: boolean }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    void navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className="relative min-w-0 rounded-lg border border-slate-200 bg-slate-50">
      <button
        type="button"
        onClick={copy}
        className="absolute right-2 top-2 rounded bg-white px-2 py-0.5 text-xs text-slate-500 shadow-sm hover:text-slate-800"
      >
        {copied ? 'copied' : 'copy'}
      </button>
      <pre
        className={`min-w-0 overflow-x-auto px-3 py-2 pr-16 text-xs text-slate-700 ${wrap ? 'whitespace-pre-wrap break-words' : ''}`}
      >
        {text}
      </pre>
    </div>
  );
}
